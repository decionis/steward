# Observability

What kloakware tells about itself, where it goes, which numbers are watched and why, and how the
first bottleneck is found on purpose before users find it. K10 wires the management port's metrics
and health, the user-event metrics with their tags, OpenTelemetry tracing to a collector and JSON
logs into the laptop stack with Prometheus, Grafana and the collector beside it, checks in a
dashboard and the alert rules, and runs a load that climbs until a number leaves the floor. The plan
is [docs/Kloakware.md](../../docs/Kloakware.md); the files are under
[observability/](../observability/); the test is
`smoke/src/test/java/com/decionis/kloakware/smoke/ObservabilityTest.java`.

## What the server tells, and where

| Signal             | Where                                     | Switched on                                                                             |
| ------------------ | ----------------------------------------- | --------------------------------------------------------------------------------------- |
| Metrics            | `:9000/metrics`, Prometheus format        | `metrics-enabled` at build (K1); HTTP and cache histograms at run time (K10)            |
| User-event metrics | the same, `keycloak_user_events_total`    | `event-metrics-user-enabled` at build, the tags `realm,clientId,idp` at run time        |
| Health             | `:9000/health/live`, `/ready`, `/started` | `health-enabled` at build (K1)                                                          |
| Traces             | OTLP to the collector                     | `tracing-enabled` and the sampler type at build; the endpoint and the ratio at run time |
| Logs               | standard output, one JSON object per line | `log-console-output=json` at run time                                                   |

The build-time ones are compiled into the image by the Dockerfile and cannot change at run time:
`start --optimized` refuses a value that differs from the persisted one, which the first run of
this step learned with exit code 2 and one log line. The sampler type is among them, so the image
is built with `parentbased_traceidratio` and the ratio is the run-time knob, `0.0` unless a
deployment names a collector and raises it; the compose stack runs it at `1.0`.

**The metrics worth knowing by name.** `http_server_requests_seconds` with its histogram buckets,
per route template and status, the token endpoint being `/realms/{realm}/protocol/{protocol}/token`,
from which a p95 is read; `agroal_active_count`, `agroal_awaiting_count`,
`agroal_blocking_time_average_milliseconds` for the database pool; `jvm_memory_used`,
`jvm_gc_pause_seconds` and `process_cpu_usage` for the JVM; `vendor_cluster_size` and the
`vendor_jgroups_*` family for the cluster; `keycloak_credentials_password_hashing_validations_total`
for how many argon2 verifications a second the node does, which is the cost of a login; and
`keycloak_user_events_total`, tagged with `event`, `realm`, `client_id`, `idp` and `error`. A failed
login is not an event of its own: it is `event="login"` with `error="invalid_user_credentials"`,
which the alert, the dashboard and the test select on. Each event sample carries an exemplar, the
trace id of the request that produced it, so a count on the dashboard leads to a trace in the
collector.

**Health** is three endpoints with three meanings: `started` once the server has booted, `live`
while the process is sound, `ready` while it can take traffic, which since 26 includes the embedded
cluster's health and therefore flips during a membership change; the Upgrades guide has the
consequence for a proxy, and the Terraform module leaves readiness to Kubernetes.

## The collector, and the cloud behind it

The nodes send every trace to an OpenTelemetry collector beside the stack, over OTLP. On a laptop
the collector's `debug` exporter prints what arrives; the configuration is
[observability/otel-collector.yaml](../observability/otel-collector.yaml). A deployment keeps the
receivers and swaps the exporter for the cloud's, from the same contrib distribution: `awsxray` for
traces and `awsemf` for metrics into CloudWatch on AWS, `azuremonitor` on Azure. Metrics reach
Prometheus by scraping; the Terraform module's `ServiceMonitor` (K8) is the same scrape through
the Prometheus Operator, and the collector's `prometheus` receiver is the way to forward them where
no Prometheus runs. Logs are JSON so the cloud's log agent, CloudWatch's or Azure Monitor's, parses
`level`, `loggerName` and `message` without a pattern; the audit listener's own lines keep their
`kloakware-audit` prefix in front of their JSON, since they are written past the logger on purpose.

## The dashboard

[observability/grafana/dashboards/kloakware.json](../observability/grafana/dashboards/kloakware.json),
provisioned into Grafana on the laptop stack at `:3001`: sign-ins a second, succeeded and failed by
error; the token endpoint's p50 and p95; the pool, in use and waiting, and the average wait for a
connection; the cluster size as each node sees it; heap, time in GC pauses, CPU; requests by status;
password hashes verified a second; JGroups suspicions and merges. Eleven panels, each a question
the alerts below ask continuously.

## The alerts, with their reasons

[observability/alerts.yml](../observability/alerts.yml), loaded by the laptop's Prometheus and
meant for the production one; each rule carries its reason as an annotation, so the page says why
it fired.

| Alert                   | Threshold                                | Why this number                                                                                                 |
| ----------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Node down               | `up == 0` for 1 min                      | A node that stops scraping has stopped; the others carry its share                                              |
| Cluster shrunk          | `min(vendor_cluster_size) < 2` for 2 min | Two is the minimum for a roll without downtime; a roll takes one node out for less than two minutes             |
| Connection pool waiting | average wait `> 100 ms` for 5 min        | The pool saturates before CPU does: every request holds a connection, and waiting for one is latency users feel |
| Token endpoint slow     | p95 `> 500 ms` for 5 min                 | Steward's sign-in and every refresh go through it; half a second is where a round trip becomes a pause          |
| Failed sign-ins         | `> 20%` of logins over 10 min            | A fifth is not mistyping; it is stuffing, a broken federation or a wrong client, and the tags say which         |
| GC pause                | `> 10%` of time paused for 5 min         | The heap is too small for the caches it holds, or the caches are uncapped                                       |
| Server errors           | `> 1%` of requests 5xx for 5 min         | 5xx is Keycloak's own failure, the database or a cluster call, never a user's mistake                           |

The thresholds are a basic tier's starting points. The first one to move once production has a
baseline is the pool wait, down to what the baseline shows plus headroom, because it is the number
that moves first.

## Finding the first bottleneck on purpose

[observability/FindTheKnee.js](../observability/FindTheKnee.js) signs users in through the browser
flow, the authorization code with PKCE as Steward does it, arriving at a rate that climbs in stages,
modelled on the Keycloak benchmark project's authorization-code scenario;
[FindTheKnee.sh](../observability/FindTheKnee.sh) runs it against the laptop stack and reads
Prometheus at the end of each stage: the logins a second achieved, the token endpoint's p95, the
pool's average wait and how many requests are waiting, and CPU. The knee is the first stage where a
number leaves the floor; which number it is says what to add first.

The run on this machine, two nodes in Docker Desktop, stages of 45 seconds asking for 10, 25, 50,
100, 150 and 200 sign-ins a second:

| Asked for | Achieved | Token p95 | Pool wait | Waiting | CPU per node |
| --------- | -------- | --------- | --------- | ------- | ------------ |
| 10/s      | 7.3/s    | 7 ms      | 0 ms      | 0       | 2%           |
| 25/s      | 20.5/s   | 8 ms      | 0 ms      | 0       | 6%           |
| 50/s      | 42.2/s   | 10 ms     | 0 ms      | 0       | 14%          |
| 100/s     | 68.6/s   | 1028 ms   | 0 ms      | 0       | 20%          |
| 150/s     | 69.2/s   | 1638 ms   | 0 ms      | 0       | 20%          |
| 200/s     | 72.0/s   | 1655 ms   | 0 ms      | 0       | 21%          |

35469 requests, none failed. The knee is between 50 and 100 a second: the rate achieved stops
following the rate asked for at about 70, and the token endpoint's p95 goes from ten milliseconds
to a second in one stage. The number that said it first was not the one the alerts put first: the
pool never had a request waiting, and CPU per process stayed near a fifth. What saturated is the
password hashing: Keycloak bounds how many argon2 verifications run at once, since each takes 64
MiB for the duration, so beyond that bound logins queue for a hashing slot and every request behind
them in the worker pool waits too, which is what the token p95 measured. On this stack the lever is
nodes, not connections; on a stack whose database is further away or smaller, the pool's wait rises
first, which is why both are on the dashboard and the alert list, and why the experiment is run
rather than assumed.

## Interview questions

### Q10. "What metrics do you monitor in a production Keycloak instance to proactively catch performance bottlenecks before they impact users?"

Four numbers in order of how early they move, and the event metrics beside them for what users are
doing.

**The database pool's wait time** moves first: `agroal_blocking_time_average_milliseconds` and
`agroal_awaiting`. Every request holds a connection for its duration, so when the pool is exhausted
requests queue for one before they do any work, and the queue is latency users feel while CPU still
looks fine. **The token endpoint's p95**, from `http_server_requests_seconds` histograms, moves
second: Steward's sign-in and every refresh go through it, and it is the endpoint where the pool and
the password hash meet. **Password hashes a second**, `keycloak_credentials_password_hashing_validations_total`,
and **CPU** say when the argon2 work itself is the limit, which is the ceiling on logins a node can
take and the reason to add nodes rather than connections. Behind those, the JVM's time in GC pauses
and heap say whether the session caches fit, and `vendor_cluster_size` with the JGroups suspicion
counters say whether the cluster is whole. The user-event metrics, tagged by realm, client and
provider, say what the load is made of: logins, refreshes, failures by error, which turns a
latency into a cause, and each sample's exemplar leads to the trace of a request that produced it.
The alerts in the repository are these numbers with thresholds and the reason for each, and the
dashboard is the same numbers on one screen.

### Q25. "How do you size a deployment for a login rate, and which number tells you first that you got it wrong?"

Size from the cost of one login, measured, and watch the pool's wait time.

A login is one argon2 verification, a few database round trips and a handful of cache writes, and
the first two set the size. The argon2 cost is fixed by the realm's hashing policy and is CPU: the
repository's load runs sign-ins at a rate that climbs until a number leaves the floor, and the
stage where it does, with CPU and the hash counter beside it, gives logins a second a node can take.
Nodes come from the target rate divided by that, plus one for a roll. The database pool is the
other bound: every request holds a connection, so the pool times the inverse of a request's
duration is the request rate a node can serve, and the database's connection limit divided by the
pool is the number of nodes it can serve; the Operator's `poolMaxSize` and the database's size are
set together. Memory follows the session caches, which are capped by the `cache-embedded-*-max-count`
options and backed by the database since 26, so the heap is sized for the active set.

The number that says the sizing was wrong depends on which bound is hit first, and the dashboard
carries both. Where the database is the far side, the pool's average wait for a connection rises
while CPU is still fine and before the p95 does, because queuing for a connection is the first
thing that happens when a node has more requests than it can hold at once; the alert sits on it at
100 ms for five minutes. Where the hashing is the bound, as on the laptop stack measured above, the
pool never waits and the token endpoint's p95 is the first to move, by two orders of magnitude in
one stage, with the hash counter flattening beside it. Pool wait rising with CPU low means the pool
or the database is short; the p95 rising with the pool idle means the hashing bound, and the nodes
are short.
