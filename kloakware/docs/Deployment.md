# Deployment

Kloakware on a cloud, as code: a platform module per cloud with one output contract, a kloakware
module that does not know which cloud it is on, an environment directory per stage, and a pipeline
that plans on every pull request and applies on merge and on tags. AWS first, Azure as a switch of
one variable. The plan is [docs/Kloakware.md](../../docs/Kloakware.md); the code is under
[deploy/terraform](../deploy/terraform/); the workflow is
[kloakware-terraform.yml](../../.github/workflows/kloakware-terraform.yml); the image the resource
points at is published by [kloakware-image.yml](../../.github/workflows/kloakware-image.yml).

## The shape

```
deploy/terraform/
  modules/platform-aws/     VPC, EKS, Aurora PostgreSQL, Secrets Manager, Route 53, ACM, the load balancer controller and external-dns
  modules/platform-azure/   VNet, AKS with application routing, PostgreSQL Flexible Server, Key Vault, Azure DNS
  modules/addons-aws/       the load balancer controller and external-dns, installed on the cluster with its own providers
  modules/addons-azure/     cert-manager and the Let's Encrypt issuer, likewise
  modules/kloakware/        the Keycloak Operator at the server's version, the Keycloak resource, the realm Job, HPA, PDB, ServiceMonitor
  environments/<env>/       dev, qa, staging, prod: cloud, tier, zone, hostname, image; one state each
  bootstrap/aws, azure/     applied once by hand: GitHub's OIDC trust, the roles CI assumes, the state bucket
  .tflint.hcl, .trivyignore the policy the check job enforces
```

**The contract.** Both platform modules output the same five things: how to reach the cluster, the
database and as whom, the temporary administrator, the DNS zone with its name servers, and how an
Ingress becomes reachable (the class, the annotations, and a TLS secret name when the certificate is
issued into the cluster rather than terminated in front of it). The kloakware module takes that
object and nothing else about the cloud. Switching an environment from AWS to Azure is `cloud =
"azure"` in its `terraform.tfvars`; the state stays where it is.

**Three layers, one state.** The platform makes the cluster; the add-ons install the controllers
on it with the cluster's own Kubernetes and Helm providers; kloakware goes on last. The split is
not taste: a module cannot configure a provider from a cluster it creates, since the provider's
configuration would depend on the module's own outputs, and Terraform refuses the cycle. The root
configures the providers from the platform's outputs and hands them to the add-ons and to kloakware.

**The kloakware module** installs the Operator from its own manifests at 26.8.0, vendored with
their checksums under `modules/kloakware/operator/`, through server-side apply because the CRDs
are larger than a client-side annotation may hold. The `Keycloak` resource points at the image the
image workflow published, with the database and the bootstrap administrator from Secrets, the
hostname strict, HTTP on the pod with the proxy's forwarded headers trusted since TLS ends at the
load balancer or the ingress, the management port at 9000, the Operator's own network policy on,
and `startOptimized` since the image was built with `kc.sh build`. The realm is applied by a Job
running keycloak-config-cli, the same image as the compose file, with `corp.json` and
`steward.json` from a ConfigMap and the `$(env:...)` values from a Secret; the Job and the ConfigMap
are named after the realm files' hash, so a changed realm is a new Job and an unchanged one is not
rerun, and the apply waits for the Job and fails when the realm does not converge. Production adds
a HorizontalPodAutoscaler on the Keycloak resource's scale subresource, a PodDisruptionBudget, zone
spread, and the Operator's `Auto` update strategy; the basic tier runs one instance and the BankID
simulator beside it.

## The tiers

| Tier         | AWS                                                                                                                                                                                                                                  | Azure                                                                                                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `basic`      | one zone, one NAT gateway, one t3.large node, Aurora Serverless v2 at 0.5 to 2 ACU, one-day backups, no deletion protection, one kloakware instance                                                                                  | one zone, AKS Free, one D2s_v5 node, PostgreSQL B1ms, seven-day backups, no purge protection, one kloakware instance                                                                                    |
| `production` | three zones, a NAT gateway per zone, three to six m6i.large nodes autoscaled, Aurora db.r6g.large with two instances across zones, fourteen-day backups, deletion protection, Performance Insights, three to six kloakware instances | three zones, AKS Standard with its SLA, three to six D4s_v5 nodes autoscaled, PostgreSQL D2ds_v5 zone-redundant, fourteen-day geo-redundant backups, purge protection, three to six kloakware instances |

Environments start at `basic` and move to `production` by changing one line, which is what K-D7
decided: the pipeline proves itself on the cheap tier first.

### What a month costs

List prices, on demand, October 2026, before data transfer and storage growth; the sources are at
the end of this section and the Pricing Calculators are the authority before a budget is set. The
point is the order of magnitude and the difference between the tiers, not the cents.

| Component                        | AWS basic           | AWS production          | Azure basic      | Azure production                          |
| -------------------------------- | ------------------- | ----------------------- | ---------------- | ----------------------------------------- |
| Kubernetes control plane         | 73                  | 73                      | 0                | 73                                        |
| Nodes                            | ~62 (1 × t3.large)  | ~215 (3 × m6i.large)    | ~70 (1 × D2s_v5) | ~420 (3 × D4s_v5)                         |
| Database compute                 | ~45 (0.5 ACU floor) | ~380 (2 × db.r6g.large) | ~13 (B1ms)       | ~260 (D2ds_v5, zone-redundant doubles it) |
| NAT, load balancer, DNS, secrets | ~55                 | ~140                    | ~25              | ~60                                       |
| **About**                        | **~235**            | **~810**                | **~110**         | **~815**                                  |

The AWS numbers use the EKS standard-support rate of 0.10 USD per cluster-hour, a Stockholm
on-demand rate of about 54 USD a month for db.t4g.medium Aurora PostgreSQL as the reference for
the Serverless v2 floor, and US East rates for the ACU and the nodes where Stockholm's were not
published. The Azure numbers use the AKS Standard rate of 0.10 USD per cluster-hour and US East
rates for B1ms and D2ds_v5. Reserved pricing cuts the production compute by a third to a half; it is
a decision for after the first quarter of measured use. Sources: the
[EKS pricing page](https://aws.amazon.com/eks/pricing/), a
[db.t4g.medium tracker](https://www.bytebase.com/dbcost/aurora/instance/db.t4g.medium/), a
[Serverless v2 pricing guide](https://cloudcostkit.com/guides/aws-aurora-serverless-v2-pricing/),
the [AKS pricing page](https://azure.microsoft.com/pricing/details/container-service/), and the
[Flexible Server trackers](https://www.bytebase.com/dbcost/azure-flexible-server-pricing/).

## The pipeline

**Every pull request** that touches the Terraform or the realm files: `terraform fmt -check`,
`terraform validate` on every root and module with `-backend=false`, tflint with the Terraform,
AWS and Azure rulesets, trivy's misconfiguration scan at high and critical with the accepted
findings listed and justified in `.trivyignore`, and a `terraform plan` of dev under the read-only
plan role, when the bootstrap has been applied. Until then the plan job says so and passes.

**Merge to master**: dev applied, under the `kloakware-dev` environment's role. **A `kloakware-v*`
tag**: QA, staging and production applied in turn, each job in its GitHub environment, so each waits
for that environment's reviewers, and a failure stops the chain. The image each applies is the one
the image workflow published for the same tag, unless the environment pins another through
`KLOAKWARE_IMAGE`.

**Credentials.** None are stored. Each job asks GitHub for an OIDC token and presents it to AWS or
Azure; the bootstrap stacks register GitHub as a trusted issuer and bind one role or federated
credential per GitHub environment to the token's subject, `repo:decionis/steward:environment:
kloakware-<env>`, and one read-only role to `repo:decionis/steward:pull_request`. A token minted for
the `kloakware-dev` job cannot assume the production role, whatever the workflow says.

**State.** One per environment, in the bucket the AWS bootstrap creates, versioned and encrypted,
locked with Terraform's own lock file (no DynamoDB table since 1.10). The bucket, the region and
the key come in with `-backend-config` from the workflow, so the same root serves every
environment.

### Setting it up once

1. Apply `bootstrap/aws` with the owner's own credentials: `terraform init && terraform apply -var
state_bucket=<unique name>`. Set its outputs as repository variables
   `KLOAKWARE_TERRAFORM_STATE_BUCKET`, `KLOAKWARE_TERRAFORM_STATE_REGION` and
   `KLOAKWARE_TERRAFORM_PLAN_ROLE_ARN`, and each environment's role as `KLOAKWARE_TERRAFORM_ROLE_ARN`
   in the four `kloakware-*` GitHub environments the promote workflow already uses.
2. In each environment, set the secrets `KLOAKWARE_REALM_SECRETS` (a JSON map of the realm's
   `$(env:...)` secrets: `KLOAKWARE_STEWARD_CLIENT_SECRET`, `KLOAKWARE_STEWARD_API_SECRET`,
   `KLOAKWARE_BROKER_CLIENT_SECRET`, `KLOAKWARE_LDAP_BIND_PASSWORD`, `STEWARD_DB_PASSWORD`) and
   `KLOAKWARE_AUDIT_WEBHOOK_SECRET`.
3. Delegate each environment's zone from its parent: the first apply outputs the name servers, and
   the certificate validation and the hostname wait for the delegation.
4. For Azure, apply `bootstrap/azure` and set `KLOAKWARE_AZURE_CLIENT_ID`, `_TENANT_ID` and
   `_SUBSCRIPTION_ID`; the workflow's Azure login step is the twin of the AWS one, added when the
   first environment moves.

## What was verified, and what was not

Every root and module passes `terraform validate` under Terraform 1.16.5 with the providers at the
pinned versions, tflint with the three rulesets, and trivy at high and critical; the workflows
parse. No cloud account was touched: the bootstrap stacks have not been applied, so the plan and
apply jobs report "not configured" and pass until they are. The first real `plan` is the next
thing to read after the bootstrap; what it shows is the sizing tables above made concrete.

## Interview questions

### Q22. "Operator, Helm chart or plain manifests, and how do you keep an AWS and an Azure deployment of the same service equivalent?"

The Operator, and equivalence by contract: one module that runs on both clouds and two platform
modules that owe it the same outputs.

**Operator, chart or manifests.** The Keycloak Operator knows things a chart cannot: it orders a
rolling update so one node migrates the schema first, exposes the scale subresource an autoscaler
targets, writes the network policy for its own pods, and turns `instances`, `db`, `hostname`,
`ingress` and `additionalOptions` into a StatefulSet, Services and an Ingress that match the
server's version, since the Operator is released with it. A Helm chart reproduces the manifests and
none of the operational knowledge; plain manifests reproduce them by hand. The Operator's own
manifests are plain enough: vendored at 26.8.0 with checksums and applied by Terraform, so the
Operator and the image move together.

**Equivalence.** The kloakware module takes an object: the database, the administrator, how an
Ingress is reached, what to wait for. The AWS platform fills it from Aurora, Secrets Manager, ACM
and the load balancer controller; the Azure platform from Flexible Server, Key Vault, cert-manager
and the application routing add-on. What differs is inside the platform modules and the two
annotation sets they output; what the Operator deploys is the same resource from the same file. The
one `cloud` variable selects the platform, the state stays in one place, and the check job validates
both platforms on every pull request whether or not an environment runs on Azure, so the switch
cannot rot unnoticed.

### Q23. "Multi-region: active-active or active-passive, and what does the database force on that choice?"

Active-passive, because the database is one and Keycloak's own guidance stops at one region.

Keycloak's state is the database first and Infinispan second. Within a region, two availability
zones and a multi-AZ database give the active-active that matters: a zone can go and sessions,
realms and users are in the rows the other zone reads, with the multi-site feature replicating the
caches between the two clusters. Across regions the database decides: Aurora Global Database and
Azure's cross-region replicas replicate asynchronously, with one writer region, so a second active
region would either write to a remote primary at cross-region latency on every session change,
which persistent user sessions make frequent, or write to its own replica, which it cannot. The
honest shape is a primary region at the production tier and a second region that holds a replica of
the database, promotes it when the primary is gone, and starts kloakware from the same Terraform
with the promoted endpoint: active-passive, with the time to promote and start as the recovery
time, and the replication lag as the recovery point. Cross-region active-active is outside the
tested envelope, and the Clustering guide says why.
