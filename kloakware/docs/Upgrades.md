# Zero-downtime upgrades and the promotion pipeline

How kloakware moves from one Keycloak to the next without anyone noticing, what a schema
migration does to that, what to do when an extension breaks on the new version, and how a change
travels from a pull request to production. K9 turns the runbook into a rehearsal that runs on every
pull request that moves the pin, and weekly in between. The plan is
[docs/Kloakware.md](../../docs/Kloakware.md); the rehearsal is
[upgrade/Rehearse.sh](../upgrade/Rehearse.sh) with its load in
[upgrade/Login.js](../upgrade/Login.js); the workflow is
[kloakware-upgrade.yml](../../.github/workflows/kloakware-upgrade.yml).

## Two kinds of update

Keycloak's version has three parts, and the middle one decides the runbook.

| Update                      | Example         | Schema    | How the nodes move                                                       | Users notice                                             |
| --------------------------- | --------------- | --------- | ------------------------------------------------------------------------ | -------------------------------------------------------- |
| **Patch**, same major.minor | 26.8.0 → 26.8.1 | Unchanged | Rolled one node at a time; old and new nodes share the cluster meanwhile | Nothing                                                  |
| **Minor** or major          | 26.7.5 → 26.8.0 | Migrated  | Recreated: every node stops, the first new node migrates, the rest join  | A restart's worth, unless the database is the bottleneck |

Since 26.6, Keycloak states that patch updates are rolling: the new node joins the old ones' cluster,
the caches speak the same format, the schema is the same. A minor is not: the schema changes, the
cache format may, and the new node must not share a cluster with the old, so every node stops first.
The Operator's `Auto` update strategy, which the production tier of the Terraform module sets, runs a
job before touching the StatefulSet that compares the two images and decides rolling or recreate the
same way; the rehearsal decides by comparing the versions, which is the same test.

## The patch: rolling, under load, with the proxy draining first

The rehearsal starts the two-node compose stack on the old image, applies the realm, and starts
five virtual users signing in and reading their profile for two minutes, with the threshold that
decides the run: not one failed request. Then it moves one node at a time:

1. the node is drained in HAProxy through its admin socket, in three steps: `state drain`, so no new connection reaches it; a wait for its current sessions to reach zero, read from `show stat`; then `state maint` with its sessions shut, which by then are none;
2. the node is recreated on the new image and waited for on its management port and in the
   cluster's view, which must count two again;
3. the node is put back (`state ready`) and the script waits until the proxy itself reports it `UP`, read from the same `show stat`: a recreated node is a new container at a new address, which the proxy learns through DNS and then checks, and the other node must not leave before that. Then the other node goes through the same.

The drain is the part people skip, and the rehearsal measured each way of getting it wrong. A node that stops while the proxy still sends to it costs the requests in flight and those sent until the health check notices; the first run marked the node for maintenance and lost thirty logins to kept-alive connections that never left it, since a client holding its connection is served by a drained node until that connection closes. The second run shut the node's sessions at once and lost one refresh that was on the wire. The third drained, waited for the node's sessions to reach zero, then took it out, and lost none. The fourth lost a burst of logins to a 503 from a backend with no server, and the proxy's log said why: the node that stayed had answered its readiness check with 503 for a few seconds while the other left and rejoined the cluster. Keycloak's readiness carries a cluster health check since 26, which reports not ready while the embedded cluster rebalances after a membership change; that is right for a rollout that waits on it and wrong as a routing check with two nodes, where it removes the last node at the exact moment the other restarts. The proxy now routes on liveness, a live process with a database, and leaves readiness to what it is for; the roll waits for the proxy's own `UP` before it touches the next node, and loses none. On
Kubernetes the Operator does this through readiness: a pod being terminated leaves the Service's
endpoints before it receives its signal, and the proxy in front closes its connections to it. On a
laptop the rehearsal does it by hand, which is also why the proxy carries an admin socket now.

When the roll is done, `migration_model` names the new version, and a sign-in works. The k6 summary
in the run's log says how many requests were made and that none failed.

## The minor: a snapshot, a stop, a migration under a lock

The rehearsal takes a snapshot first (`pg_dump` in custom format), stops both nodes, starts the
first node on the new image and watches it migrate, then starts the second. Liquibase runs the
migration inside Keycloak on the first start of a newer version: it takes the lock in
`databasechangeloglock`, applies the change sets in order, records them in `databasechangelog`, and
writes the version to `migration_model`. The second node, finding the lock free and the version
current, migrates nothing. A node that starts while another holds the lock waits for it; that is why
the second node may be started as soon as the first is ready and not before, and why the compose
file starts them in that order.

**Two nodes are the minimum, three are the number.** The same readiness behaviour reaches
Kubernetes: during a rolling update of two replicas, the survivor's readiness probe fails while the
other pod leaves and rejoins, the Service drops its only endpoint, and the ingress has nowhere to
send. The production tier of the Terraform module runs three instances with a disruption budget of
two, so a roll always leaves two nodes ready and the endpoints never empty; the basic tier runs one
and accepts a restart's worth of downtime on a patch, which is the honest statement of what one
node is.

**The database is the bottleneck.** A minor's downtime is the migration's duration, which depends
on the size of the tables it changes, and a session-table change on a large deployment is where it
hurts. Keycloak publishes which minors carry long migrations in their release notes; the rehearsal
on staging, which runs the production tier against a copy of the production database, is what gives
the number before the night it matters.

### The manual strategy: the SQL to a DBA

A deployment whose database changes go through a review hands Keycloak's migration over rather
than letting the server run it:

```
--spi-connections-jpa-quarkus-migration-strategy=manual
--spi-connections-jpa-quarkus-migration-export=/export/migration.sql
```

The server writes the SQL it would have run and refuses to start; a DBA runs the file under the
change window, and the server starts with `update`, finds the schema current, and migrates nothing.
The rehearsal restores the snapshot into a scratch database and runs the new image against it with
these options, checks the file was written, and checks the scratch database's version did not move.

## When a custom SPI fails the new version

Keycloak's SPI surface moves between minors: an interface gains a method with a default, a class
moves package, a deprecated constructor goes. Four of kloakware's five extensions compile against
`keycloak-server-spi-private`, which is private by name and by promise. What keeps that safe:

- **the pin moves in a pull request, never in place**, Dependabot's for the Dockerfile's digest and
  the POM's `keycloak.version` on the same schedule (K-D8);
- **the rehearsal on that pull request runs the whole container suite against the new Keycloak**,
  `mvn verify -Dkloakware.keycloak.image=<the new quay reference>`, which builds the same Dockerfile
  on the new base and drives every extension through the browser, the brokers and the cluster; a
  provider the new version refuses to load, or loads and breaks, fails here;
- **the fix is in the extension, in the same pull request**, against the new API; the server does
  not wait for it. A feature the new version turns off, or a stack it deprecates, is a change in
  the realm or the build the same way: K7 found the `kubernetes` stack deprecated by reading the
  server's own `--help-all`, which is the second source to read with every release note.

## Rollback when the migration has run

Keycloak has no down-migrations. A minor that has migrated the schema is rolled back by restoring
the snapshot taken before it and starting the old image on the restored database; the rehearsal
does exactly that, drops and recreates the database from the dump, brings both nodes up on the old
image, and checks `migration_model` and a sign-in. What the rollback costs is what happened between
the snapshot and the restore: sessions created since are gone, since they are rows now, and those
users sign in again; realm changes made by hand since are gone too, which is one more reason there
are none. A patch rolls back by rolling the old image forward again, with no snapshot in play.

Keep the snapshot until the new version has run for as long as the organisation's longest-lived
session; after that a rollback would sign out more people than the upgrade did.

## The promotion pipeline, end to end

A change to kloakware reaches production in this order, and nothing reaches production another way:

1. **A pull request** runs the Java suite, the Steward end-to-end sign-in, the drift check, the
   Terraform check, and, when the pin or the extensions change, this rehearsal.
2. **Merge to master** publishes the image as `ghcr.io/decionis/kloakware:master` and `sha-<commit>`
   (`Kloakware image`), applies the realm to dev (`Kloakware promote` on tags only; dev follows
   master through Terraform), and applies the dev platform (`Kloakware terraform`).
3. **A `kloakware-v<version>` tag** publishes the image under that version, and runs two chains in
   turn, each environment behind its own reviewers: the Terraform chain applies QA, staging and
   production with that image, and the promote chain applies the realm files committed at the tag to
   the same environments. The realm is the one tested in the pull request; the image is the one the
   tag built; nothing is read back from a running environment.

The rehearsal exercises the promotion script against the laptop stack twice from the same files,
dev then "qa", converging both times, which is what the chain does per environment. Until the
bootstrap from K8 is applied, the real chains report "not configured" and pass; the first tag after
it runs them for real.

## What the rehearsal verified here

Both paths ran on this machine against the compose stack, several times, and the runs that failed
taught the drain's three halves above. The final patch run, 26.8.0 to 26.8.1, released the day this
was written: 2646 logins and refreshes under the roll, none failed, p95 at 50 ms, each node drained
to zero sessions before it left and back once the proxy said UP, the schema naming 26.8.1 after, and
the rollback to 26.8.0 from the snapshot with a sign-in after it. The final minor run, 26.7.5 to
26.8.0: the schema migrated by the first new node, the manual strategy writing 163 lines of SQL
against a restored copy and stopping with that copy still at 26.7.5, the rollback to 26.7.5 with a
sign-in. The container suite ran against 26.8.1 through `-Dkloakware.keycloak.image`, which is the
pull request Dependabot will open.

## Interview questions

### Q3. "How do you handle database migration scripts when upgrading a clustered Keycloak environment in production without causing downtime?"

By knowing which updates migrate, letting Liquibase run the ones that do under its lock from one
node, and rehearsing the duration on a copy of production first.

Keycloak migrates its own schema with Liquibase on the first start of a newer version: the first
node takes the lock in `databasechangeloglock`, applies the change sets, records them, and writes
the version; any other node waits for the lock and then finds nothing to do. So the cluster never
migrates twice, and the question is only when the first new node starts. A patch migrates nothing
and is rolled one node at a time, each drained from the load balancer before it stops, with the old
and new nodes in one cluster meanwhile; the rehearsal runs that under a login load and fails on one
failed request. A minor migrates and cannot share a cluster with the old version, so every node
stops, the first new one migrates, the rest join: downtime is the migration's duration, which the
staging rehearsal on a copy of production measures before the window is booked. Where the database
is governed, the manual strategy writes the SQL to a file for a DBA to run in the window, and the
server starts after it on a schema it finds current. A snapshot precedes every minor; the next
question is what it is for.

### Q24. "What is the rollback story for a minor upgrade whose schema migration has already run?"

Restore the snapshot and start the old image; Keycloak has no down-migrations.

The schema a minor leaves behind is one the old version does not know, so the old image cannot
start on it. The rollback is the snapshot taken before the migration, restored over the database,
and the old image started on it; the rehearsal does it and checks the version and a sign-in. The
cost is what happened in between: sessions created since the snapshot are rows that are gone, so
those users sign in again, and any change made to the realm by hand is gone too, which the pipeline
makes a non-event because there are none. The snapshot is kept until the new version has outlived
the longest session, after which rolling back would sign out more people than the upgrade did. A
patch is the easy case: no migration, so the old image rolls forward again without a snapshot.

### Q9, revisited. "How do you ensure environment consistency between Dev, Staging and Production in Keycloak? Describe your CI/CD pipeline for Keycloak realm configurations."

The Configuration guide answered this with the realm as a file and config-cli converging every
environment to it, drift detected on every pull request. With K8 and K9 the pipeline runs: the realm
files committed at a tag are applied to QA, staging and production in turn by the promote chain, the
platforms and the image by the Terraform chain, each environment behind its reviewers, and nothing
is read back from a running environment. Consistency is not a property to check afterwards; it is
that every environment is produced from the same commit by the same script, and the rehearsal runs
that script twice against one stack to show the second apply changes nothing.
