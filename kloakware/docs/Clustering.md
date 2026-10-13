# Clustering and high availability

How kloakware runs as more than one node: what Infinispan holds, how nodes find each other, what
persistent user sessions changed in 26, what a partition costs and how it heals, and where the
single-region design stops. K7 runs a cluster of two on a laptop and in the tests, behind a proxy
that sends every request wherever it likes. The plan is [docs/Kloakware.md](../../docs/Kloakware.md);
the compose file is [deploy/compose/compose.yaml](../deploy/compose/compose.yaml); the test is
`smoke/src/test/java/com/decionis/kloakware/smoke/ClusterTest.java`.

## What Infinispan holds, and where

Keycloak keeps its state in two places: the database, which is the source of truth, and Infinispan,
an in-memory data grid embedded in every node. The caches fall in three kinds:

| Caches                                                                   | Kind                                         | On a node loss                                                                       |
| ------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `realms`, `users`, `authorization`, `keys`, `crl`                        | Local, per node                              | Nothing: each node reloads from the database on demand                               |
| `sessions`, `clientSessions`, `offlineSessions`, `offlineClientSessions` | Distributed, backed by the database since 26 | Nothing: the row outlives the node; the cache refills on use                         |
| `authenticationSessions`, `loginFailures`, `actionTokens`, `work`        | Distributed or replicated, memory only       | A login in flight on that node starts over; brute-force counters for its users reset |

A local cache is a per-node copy of what the database says, invalidated across the cluster through
the `work` cache when a node writes: change a realm on one node and every node drops its copy. A
distributed cache spreads entries over the cluster with a number of owners per entry, two by
default, so one node can go without losing anything in it, and a node that does not own an entry
fetches it from one that does. That fetch is why the proxy in front need not be sticky, and why
being sticky still helps: it is one network hop fewer.

Transport is JGroups: a channel per cluster, encrypted since 26 with certificates the nodes issue
and rotate themselves (`JGroups Encryption enabled (mTLS)` in the log), failure detection and view
management on top. A node's view of the cluster, who is in and who is out, is what every decision
about ownership and rebalancing hangs on.

## Finding each other: jdbc-ping

Nodes discover one another through `jdbc-ping`, the default stack since 26.1 and the only one not
deprecated in 26.8: each node writes its address into a `JGROUPSPING` table in the shared database
on start and reads the others' from it. No multicast, no cloud API, nothing to run beside the
database the nodes already share. The `kubernetes` stack, DNS_PING over a headless service, is
deprecated in 26.8, and the Operator sets jdbc-ping on EKS and AKS as it does anywhere; the plan's
mention of DNS_PING is superseded by that.

The compose file runs two nodes from the one image with `KC_CACHE_EMBEDDED_NODE_NAME` naming each,
behind an HAProxy that holds the name `kloakware`, so Steward, config-cli and the tests see one
address. The proxy balances round-robin, no stickiness, checks each node on its management port,
sends a request that cannot reach its node to the other (`option redispatch`), and looks a node's
name up again through Docker's resolver, since a node that comes back is a new container at a new
address. One address matters for more than convenience: a node names the issuer after the host a
request came in on, so two nodes reached on two addresses issue tokens the other refuses, and the
test stack learned that before it got its proxy.
The nodes bind their transport on the container network; the options that matter when the network
is not that simple are `cache-embedded-network-bind-address`, `-bind-port` and, when nodes sit behind
address translation, `-external-address` and `-external-port`.

**One node first.** On an empty database the first start migrates the schema. Two nodes starting
at once race to create Liquibase's changelog table and the loser exits; the compose file starts the
second node after the first is healthy, the test stack does the same, and the Operator rolls nodes
one at a time. That is also the rule for upgrades, which K9 takes up.

## Persistent user sessions

Since 26, user and client sessions are written to the database as well as held in Infinispan, the
`persistent-user-sessions` feature on by default. Three things change.

**Restarts.** A node, or the whole cluster, can go and come back and every signed-in user is still
signed in; the caches refill from the database as sessions are used. Before 26 a full restart
signed everyone out and a rolling restart depended on the caches surviving the roll.

**Sizing.** The session caches are bounded: `cache-embedded-sessions-max-count` and its siblings for
client, offline and offline-client sessions cap what a node holds in memory, and what is not held is
read from the database. Memory is sized for the active set, not for every session that exists; a
node with a small cap works, slower. Before 26 the heap had to hold every session, with the offline
ones the usual surprise.

**Stickiness.** Once a user is signed in, any node serves them: the session is in the database and
in the cache of whichever node fetched it. The proxy need not pin a user to a node, and the test
proves it by signing in on the second node, stopping it, and refreshing the token on the first.
During the login itself, the authentication session is in a distributed cache with two owners, so
any node can serve each step and one node can fail mid-login without the login being lost; the
`AUTH_SESSION_ID` cookie still carries a route suffix for a proxy that can use it, which saves the
fetch, and `spi-sticky-session-encoder-infinispan-should-attach-route=false` drops it.

## Failure detection, partitions and merges

The JGroups stack decides how fast a dead node is noticed and what a partition costs. The defaults
in the stack the image ships (JGroups 5.5):

| Protocol          | Default                    | What it decides                                                                 |
| ----------------- | -------------------------- | ------------------------------------------------------------------------------- |
| `FD_SOCK2`        | a socket per neighbour     | A crashed process is noticed when its socket closes, at once                    |
| `FD_ALL3`         | timeout 40 s, interval 5 s | A silent node (frozen, partitioned) is suspected after 40 s without a heartbeat |
| `VERIFY_SUSPECT2` | 1.5 s                      | One more check before a suspect is dropped from the view                        |
| `pbcast.GMS`      | join timeout 2 s           | How long a joiner waits for the coordinator                                     |
| `MERGE3`          | 10 s to 30 s               | How soon two partitions that can see each other again merge their views         |

A partition, two groups of nodes that cannot reach each other, produces two views after `FD_ALL3`
gives up, and each side keeps serving: with the database shared and sessions in it, each side has
everything a signed-in user needs. What is lost is what only the memory caches held, an
authentication in flight whose owners are all on the other side, the login-failure counters, action
tokens issued by the other side. When the network heals, `MERGE3` merges the views within its
interval and the distributed caches rebalance; nothing is reconciled, since the database never
disagreed with itself. Lower `FD_ALL3`'s timeout to notice silence sooner at the price of false
suspicions on a busy network; raise it for a network that pauses; the stack can be replaced whole
through `cache-config-file` when the defaults are not it, and `cache-embedded-mtls-enabled`, on by
default here, keeps a node that is not one of ours from joining at all.

## Beyond one cluster: multi-site

One cluster spans one network with low latency: nodes in the availability zones of one region, not
across regions. For two sites, Keycloak's supported design is the `multi-site` feature with an
external Infinispan (`cache-remote-host` and its siblings) that replicates between the sites, and a
database that is one for both. The reference architecture this plan adopts, documented here and
built in K8:

- two kloakware clusters in two availability zones of one AWS region, each a Keycloak Operator
  deployment on EKS, each with its own external Infinispan;
- cross-site replication between the two Infinispan clusters, synchronous within the region's
  latency;
- Aurora PostgreSQL multi-AZ as the one database, with a writer in one zone and failover to the
  other;
- AWS Global Accelerator in front, sending each client to the healthy site and draining a site that
  is not.

Cross-region active-active is outside the tested envelope: replication lag across regions is real,
the database cannot be one with low latency in both, and Keycloak's own guidance stops at one
region. A second region is a standby restored from the database, not a peer.

## What the tests prove

`ClusterTest`, against the test stack's two nodes behind the same proxy as the laptop's: each node's
`vendor_cluster_size` metric says two; the realm applied through the proxy is served by each node on
its own address; two sessions signed in under round-robin, one issued by each node, are both
refreshed after the second node is stopped, the survivor reporting a cluster of one, and the second
node joins again as a new container at a new address, the cluster back to two. Every other test,
the browser sign-in, the second factor, the brokers, runs through the proxy as well, so every hop
of every flow may land on either node.

## Interview questions

### Q2. "Can you explain how Infinispan works inside a multi-instance Keycloak deployment? How do you prevent replication lag or split-brain scenarios across environments?"

Infinispan is the in-memory layer every node carries; the database is the truth, and the design is
to make a node loss cost nothing a user would notice.

**How it works.** Each node embeds Infinispan with three kinds of cache. Local caches hold a per-node
copy of realms, users and keys, invalidated across the cluster when a node writes. Distributed
caches hold sessions and logins in flight, each entry on two owner nodes, fetched from an owner by
whoever needs it. Since 26 the user and client sessions are also written to the database, so the
distributed caches are an accelerator over rows rather than the only copy. JGroups carries it all,
encrypted with certificates the nodes manage themselves; nodes find each other through a table in
the shared database, jdbc-ping, the one discovery mechanism that needs nothing beyond what they
already share.

**Replication lag.** Within a cluster there is none to prevent: writes to a distributed cache are
synchronous to the owners, and the cluster spans one low-latency network, the availability zones of
one region. Across regions lag is real, which is why the design does not run one cluster across
regions, nor two active regions on one database. Two sites in one region use the multi-site feature
with an external Infinispan replicating between them and one multi-AZ database; a second region is a
standby.

**Split-brain.** A partition produces two views, each serving its users from the shared database;
what is lost is what only memory held, logins in flight and failure counters, and that loss is
bounded by design, since sessions are in rows. The stack's failure detection decides how fast the
partition is seen and its merge protocol how fast it heals; the defaults, forty seconds to suspect a
silent node and up to thirty to merge, suit a cloud network and are tunable through the cache
configuration file when they do not. Transport encryption keeps a stray node from joining, and
starting one node before the rest on an empty database keeps two from racing to migrate the schema.
The repository runs a cluster of two on a laptop and in the tests, and the tests stop a node under a
session and watch the cluster shrink and grow.

### Q21. "Persistent user sessions arrived in 26. What changed about Infinispan sizing, restarts and sticky sessions?"

Sessions moved into the database, and three operational facts followed.

**Restarts** no longer sign anyone out: a node or the whole cluster can restart and every session is
read back from its row as it is used. **Sizing** is for the active set, not the population: the
session caches are capped by `cache-embedded-sessions-max-count` and its siblings, with the database
behind them, where before the heap had to hold every session, offline ones included. **Sticky
sessions** are no longer needed for signed-in users, since any node reads the row; during the login
itself the authentication session lives in a distributed cache with two owners, so any node can
serve any step, and the route the `AUTH_SESSION_ID` cookie carries is an optimisation a proxy may use
or ignore. The test signs in on one node, stops it, and refreshes on the other.
