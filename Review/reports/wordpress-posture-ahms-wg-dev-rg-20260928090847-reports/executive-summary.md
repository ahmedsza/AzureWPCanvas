# Azure Well-Architected Review — Executive Summary

**Workload:** WordPress on Azure App Service · **Environment:** non-prod (dev)
**Subscription:** 5e8eb071-5103-4178-b2bc-417cf42def4d · **Resource group:** ahms-wg-dev-rg
**Evidence collected:** 2026-09-28 09:09:05 UTC · **Review date:** 2026-09-28
**Reviewer:** Automated review — wordpress-waf-review skill · **Checklist:** AzureWordPressChecklist.md (152 controls)

## Overall posture

| Measure | Result |
|---|---|
| Overall score | 32% — Red |
| Evidence coverage | 44% of applicable controls decided from collected evidence |
| Controls assessed | 152 of 152 |
| Pass / Fail / N/A / Not verified | 24 / 43 / 8 / 77 |
| Critical findings (severity 5) | 4 |
| High findings (severity 4) | 10 |

This workload gets the hard parts of Azure platform security right: every data service is private-endpoint only with public access disabled, the application authenticates with a managed identity rather than stored credentials, TLS 1.2 is enforced end to end, and Key Vault uses RBAC with soft delete. The single biggest risk is that the Front Door web application firewall is running in Detection mode with no managed rule sets attached, so the public entry point to the site logs attacks and blocks none of them — and behind it the WordPress administrator password sits in plain text in an App Service connection string as part of a shared bootstrap account. No service-level objective, recovery time objective, or recovery point objective was supplied, so this review cannot confirm the configuration meets any availability commitment; what it can say is that a single non-zone-redundant worker and a high-availability-disabled Burstable database would not meet a typical production target. Evidence coverage is 44%, so this score reflects a partial picture — the gaps are concentrated in governance, operations, and everything requiring business context.

## Pillar scorecard

Score is `Pass / (Total − N/A − Not verified)`. Coverage is how much of the applicable
checklist the evidence could decide. Read them together.

| Pillar | Controls | Pass | Fail | N/A | Not verified | Score % | Coverage % | Status |
|---|---|---|---|---|---|---|---|---|
| 1. Foundations & governance | 13 | 1 | 3 | 0 | 9 | 25% | 31% | Red |
| 2. Reliability | 17 | 0 | 9 | 0 | 8 | 0% | 53% | Red |
| 3. Security | 24 | 7 | 11 | 0 | 6 | 39% | 75% | Red |
| 4. Cost Optimization | 14 | 3 | 3 | 0 | 8 | 50% | 43% | Red |
| 5. Operational Excellence | 17 | 1 | 3 | 0 | 13 | 25% | 24% | Red |
| 6. Performance Efficiency | 15 | 3 | 3 | 0 | 9 | 50% | 40% | Red |
| 7. Resource-specific | 40 | 9 | 11 | 8 | 12 | 45% | 63% | Red |
| 8. Manual validation register | 12 | 0 | 0 | 0 | 12 | — | 0% | Not assessed |
| **Total** | **152** | **24** | **43** | **8** | **77** | **36%** | **47%** | **Red** |

Overall posture is the unweighted mean of pillars 1–6. Sections 7 and 8 are reported separately.

## What is working well

| # | Strength | Pillar | Why it matters |
|---|---|---|---|
| 1 | Every data service — MySQL, Redis, Key Vault, and storage — has public network access disabled and is reached only through a private endpoint in a dedicated subnet, with four matching private DNS zones linked to the virtual network. | Security | Removes the entire class of internet-originated attacks against the data tier, and means a leaked connection string cannot be used from outside the network. |
| 2 | The application authenticates to Key Vault, storage, and Communication Services with a user-assigned managed identity; no access keys or key-bearing connection strings are stored in application configuration. | Security | There is no long-lived credential to leak or rotate for these services, and access can be revoked centrally in one place. |
| 3 | Key Vault uses Azure RBAC rather than access policies, with soft delete enabled and a 90-day retention period, and its data plane correctly refused collection from outside the private network. | Security | Secret access follows the same least-privilege model as the rest of Azure, and the refusal is live proof that the private-only restriction actually holds. |
| 4 | TLS 1.2 is the enforced minimum on the web app, MySQL, Redis, storage, and Key Vault, with HTTPS-only enabled on the site and FTPS disabled. | Security | Traffic cannot be downgraded to a weak or cleartext protocol at any hop in the workload. |
| 5 | Diagnostic settings route logs and metrics to a single shared Log Analytics workspace from the App Service, MySQL, Redis, Key Vault, and Communication Services, with workspace-based Application Insights co-located in the same region. | Operations | The forensic record needed to investigate an incident exists and is queryable in one place, with no cross-region ingestion charges. |
| 6 | The cache is already Azure Managed Redis rather than the retiring Azure Cache for Redis, and the virtual network uses a clean, non-overlapping 10.0.0.0/23 plan with spare capacity. | Reliability | No forced service migration is pending, and the network can absorb additional private endpoints without renumbering. |
| 7 | Defender for Cloud foundational and advanced CSPM are enabled with security contacts configured, and Communication Services data residency is correctly pinned to the Africa data location. | Security | Posture recommendations and attack-path analysis are running, and communications data stays within the intended geography. |

## Key findings and risks

| # | Finding | Control | Pillar | Severity | Business impact | Recommended action |
|---|---|---|---|---|---|---|
| 1 | Front Door is deployed with a WAF policy correctly associated to the endpoint for `/*`, but the policy runs in Detection mode, so it logs matches and blocks nothing. | SEC-07 | Security | 5 | The public entry point to the site records attacks but blocks none of them, so a routine automated scan can reach WordPress unimpeded. | Upgrade the profile to Front Door Premium, tune the managed rule set in Detection, then switch the policy to Prevention. |
| 2 | The WAF policy contains no managed rule sets and no custom rules at all, so even in Prevention mode it would inspect nothing. | SEC-08 | Security | 5 | With no managed rule sets attached, the WAF cannot recognise SQL injection, cross-site scripting, or known WordPress exploits at all. | Attach the current Microsoft Default rule set and Bot Manager rule set, add rate limiting for login and XML-RPC paths, and evaluate DDoS Network Protection. |
| 3 | A WordPress administrator password is stored in clear text as an App Service connection string rather than in Key Vault, readable by anyone with Contributor rights on the site or access to a configuration export. | SEC-14 | Security | 5 | A working administrator password is readable by anyone with configuration access to the web app, and it has no expiry or rotation behind it. | Remove the administrator credential from App Service configuration, rotate it immediately, move it to Key Vault behind a reference, and set expiry with near-expiry alerts on every secret. |
| 4 | The workload carries a single shared bootstrap administrator account whose username, contact address, and static password are held in platform configuration. | SEC-20 | Security | 5 | A shared administrator account means privileged actions cannot be attributed to a person, and offboarding does not remove access. | Replace the shared account with named administrators, enforce strong authentication, remove the bootstrap credential from configuration, and audit administrator access. |
| 5 | The only alerting asset is the auto-created Failure Anomalies smart detector. | OPS-09 | Operations | 4 | There are no alerts and no action group, so an outage or security event is discovered by a customer rather than by the team. | Create an action group with an accountable owner and define alerts for SLO symptoms, dependency health, secret and certificate expiry, and quota. |
| 6 | The selected tiers cannot meet a production performance or availability target as configured. | PRF-03 | Performance | 4 | Current compute and database tiers cannot sustain production load, and the 32-bit worker process caps addressable memory at 2 GB. | Re-select tiers against agreed targets: multi-worker zone-redundant Premium v3, General Purpose MySQL, a Redis size with HA, and Front Door Premium. |
| 7 | The plan runs a single worker with zone redundancy disabled, so any instance or zone fault takes the site offline. | REL-03 | Reliability | 4 | A single worker on a non-zone-redundant plan means any instance or datacentre fault takes the site offline with no automatic recovery. | Scale the Premium v3 plan to at least two workers and enable zone redundancy in South Africa North, sized against an agreed SLO. |
| 8 | Always On is off, so the container unloads when idle and the first request after idling pays a full cold start (the start-time limit is raised to 1800 seconds). | REL-04 | Reliability | 4 | Without Always On, a health check, or auto-heal, the site cold-starts after idle and an unhealthy instance keeps serving traffic. | Enable Always On, publish a lightweight dependency-aware health-check endpoint, and configure auto-heal rules for slow requests, memory, and HTTP error thresholds. |
| 9 | No autoscale profile exists and the plan's maximum worker count is one, so the workload cannot scale out under load or scale in to save cost. | REL-06 | Reliability | 4 | No autoscale rule exists, so a traffic spike degrades or fails rather than adding capacity. | Define and load-test an autoscale rule with a minimum of two instances, explicit triggers, cooldowns, and headroom. |
| 10 | High availability is disabled, backup retention is the 7-day default, and geo-redundant backup is off. | REL-08 | Reliability | 4 | The database has no high availability, seven-day backup retention, and no geo-redundant backup, so a regional or server failure means extended downtime and possible data loss. | Move to a General Purpose tier, enable zone-redundant HA, and set backup retention and geo-redundancy from an agreed RPO. |
| 11 | Remote debugging is off and FTP is restricted to FTPS only, but the SCM/Kudu endpoint accepts traffic from any address. | SEC-05 | Security | 4 | The deployment endpoint accepts connections from any address on the internet, giving an attacker a direct route to publish code. | Set the SCM default action to Deny, allow only the deployment agent ranges, and disable basic publishing credentials and SCM basic authentication. |
| 12 | No WAF custom rules protect `wp-login.php`, `wp-admin`, `xmlrpc.php`, or `admin-ajax.php`, and phpMyAdmin is enabled on the site container, adding a second administrative surface behind the same unprotected path set. | SEC-10 | Security | 4 | A database administration console is exposed on the site with no additional protection on its path. | Add WAF rate-limit and geo/IP match rules for the WordPress administration paths, and disable phpMyAdmin or restrict it to a maintenance window. |
| 13 | The vault is well configured in most respects - RBAC authorization, soft delete, deny-by-default network ACLs, private endpoint, and audit diagnostics to Log Analytics - but purge protection is not enabled, so a soft-deleted vault or secret can be permanently purged within the 7-day window. | SEC-15 | Security | 4 | A deleted vault or secret can be purged before the retention period expires, making an accidental or malicious deletion unrecoverable. | Enable purge protection and raise soft-delete retention to at least 90 days. Purge protection cannot be disabled once set, so confirm the recovery procedure first. |
| 14 | phpMyAdmin is enabled, exposing a database administration console on the public site. | SEC-18 | Security | 4 | The WordPress login and admin paths receive no rate limiting or geographic restriction, leaving credential-stuffing unchecked. | Disable phpMyAdmin, set `DISALLOW_FILE_EDIT` and `DISALLOW_FILE_MODS`, and confirm XML-RPC and application passwords are blocked or restricted. |

## Remediation priorities

| Priority | Action | Controls | Severity | Effort | Change risk | Cost impact |
|---|---|---|---|---|---|---|
| Do now | Remove the administrator credential from App Service configuration, rotate it immediately, move it to Key Vault behind a reference, and set expiry with near-expiry alerts on every secret. | SEC-14 | 5 | 2 | 3 | 1 |
| Do now | Replace the shared account with named administrators, enforce strong authentication, remove the bootstrap credential from configuration, and audit administrator access. | SEC-20 | 5 | 2 | 3 | 1 |
| Do now | Enable Always On, publish a lightweight dependency-aware health-check endpoint, and configure auto-heal rules for slow requests, memory, and HTTP error thresholds. | REL-04 | 4 | 2 | 4 | 4 |
| Do now | Set the SCM default action to Deny, allow only the deployment agent ranges, and disable basic publishing credentials and SCM basic authentication. | SEC-05 | 4 | 2 | 2 | 1 |
| Do now | Add WAF rate-limit and geo/IP match rules for the WordPress administration paths, and disable phpMyAdmin or restrict it to a maintenance window. | SEC-10 | 4 | 2 | 2 | 1 |
| Do now | Enable purge protection and raise soft-delete retention to at least 90 days. Purge protection cannot be disabled once set, so confirm the recovery procedure first. | SEC-15 | 4 | 2 | 2 | 1 |
| Do now | Disable phpMyAdmin, set `DISALLOW_FILE_EDIT` and `DISALLOW_FILE_MODS`, and confirm XML-RPC and application passwords are blocked or restricted. | SEC-18 | 4 | 2 | 2 | 1 |
| Plan | Upgrade the profile to Front Door Premium, tune the managed rule set in Detection, then switch the policy to Prevention. | SEC-07 | 5 | 3 | 3 | 1 |
| Plan | Attach the current Microsoft Default rule set and Bot Manager rule set, add rate limiting for login and XML-RPC paths, and evaluate DDoS Network Protection. | SEC-08 | 5 | 3 | 3 | 1 |
| Plan | Create an action group with an accountable owner and define alerts for SLO symptoms, dependency health, secret and certificate expiry, and quota. | OPS-09 | 4 | 3 | 3 | 1 |
| Plan | Re-select tiers against agreed targets: multi-worker zone-redundant Premium v3, General Purpose MySQL, a Redis size with HA, and Front Door Premium. | PRF-03 | 4 | 3 | 4 | 4 |
| Plan | Scale the Premium v3 plan to at least two workers and enable zone redundancy in South Africa North, sized against an agreed SLO. | REL-03 | 4 | 3 | 3 | 4 |
| Plan | Define and load-test an autoscale rule with a minimum of two instances, explicit triggers, cooldowns, and headroom. | REL-06 | 4 | 3 | 2 | 2 |
| Plan | Move to a General Purpose tier, enable zone-redundant HA, and set backup retention and geo-redundancy from an agreed RPO. | REL-08 | 4 | 3 | 4 | 5 |
| Schedule | Enable caching and compression for static paths with explicit cache keys and query handling, keeping authenticated responses uncached. | CST-08 | 3 | 2 | 2 | 1 |
| Schedule | Create a Defender governance rule assigning owners and due dates for open recommendations, and review the secure-score trend on a set cadence. | DEF-06 | 3 | 2 | 2 | 1 |
| Schedule | Triage the open Advisor and Defender recommendations, assign owners and due dates, and record formally accepted exceptions. | FND-10 | 3 | 2 | 2 | 1 |
| Schedule | Apply CanNotDelete locks to MySQL, Blob Storage, Key Vault, and Redis, and document a break-glass removal procedure. | FND-11 | 3 | 2 | 2 | 1 |
| Schedule | Create an Azure Monitor Private Link Scope for the workspace and component, or record an explicit risk decision to keep public access with RBAC as the only control. | MON-02 | 3 | 3 | 3 | 3 |
| Schedule | Create standard availability tests from at least three relevant locations against the Front Door endpoint, and alert on failure. | MON-04 | 3 | 2 | 2 | 1 |
| Schedule | Enable NSG flow logs to the storage account with restricted access, and record a risk decision on DDoS Network Protection given the Front Door edge. | NET-04 | 3 | 2 | 2 | 3 |
| Schedule | Add a staging slot with slot-specific settings, warm-up, health validation, and a tested swap-back rollback. | OPS-04 | 3 | 2 | 2 | 1 |
| Schedule | Enable diagnostics on the storage account and WAF policy, add NSG flow logs, and confirm every resource routes to the workspace with purposeful retention. | OPS-07 | 3 | 3 | 3 | 1 |
| Schedule | Raise the worker ceiling, configure autoscale, and validate database connections, cache capacity, and SNAT headroom under a load test. | PRF-05 | 3 | 3 | 3 | 3 |
| Schedule | Enable Front Door caching with compression for static paths and turn on HTTP/2 on the App Service site. | PRF-08 | 3 | 2 | 2 | 2 |
| Schedule | Add a deployment slot with warm-up and health validation, and swap with preview so traffic only moves to a proven-ready instance. | REL-07 | 3 | 3 | 3 | 1 |
| Schedule | Move WordPress media to ZRS or GZRS, or record a formal risk acceptance against an agreed RPO for regional failure. | REL-11 | 3 | 2 | 2 | 1 |
| Schedule | Enable blob versioning and point-in-time restore with a retention window that matches the agreed RPO for media. | REL-12 | 3 | 2 | 2 | 2 |
| Schedule | Point the probe at the App Service health-check endpoint, shorten the interval, and document the intended failover behaviour. | REL-13 | 3 | 2 | 2 | 3 |
| Schedule | Create availability tests and SLO-symptom alerts for the critical flows, route them to an owned action group, and retain the results. | REL-17 | 3 | 3 | 3 | 1 |
| Schedule | Enable `vnetRouteAllEnabled`, then apply the intended egress NSG rules and, where required, a firewall or proxy next hop. | SEC-11 | 3 | 2 | 4 | 1 |
| Schedule | Author explicit allow rules for the required app-to-private-endpoint flows and deny the remainder, then review effective rules. | SEC-13 | 3 | 3 | 3 | 1 |
| Schedule | Enable storage diagnostics and the App Service audit category, confirm WAF logging, add NSG flow logs, and restrict access to the workspace. | SEC-22 | 3 | 3 | 3 | 1 |
| Schedule | Move off Burstable for any production use, then confirm `sql_generate_invisible_primary_key` is on and that every InnoDB table has an explicit primary key. | SQL-04 | 3 | 3 | 3 | 1 |

## Confidence and limitations

| Limitation | Effect on this review |
|---|---|
| The MySQL Flexible Server is in a Stopped state, so the databases, server parameters, and backup configuration queries all failed. | Four controls could not be decided: secure transport enforcement, generated invisible primary keys, slow query logging, and database-level role separation. Backup adequacy could not be verified at all. |
| Key Vault keys, secrets, and certificates returned Forbidden because the collector ran from outside the private network. | Secret expiry, rotation cadence, and certificate lifetime could not be read from the data plane. Defender for Cloud supplies a partial answer: it reports that secrets have no expiration date set. |
| No subscription-scope role assignments, Azure Policy assignments, or Entra ID configuration were collected, and the resource-group role assignment query returned no results. | Identity and governance are largely unassessed: privileged access, Conditional Access, Privileged Identity Management, break-glass accounts, and policy compliance are all Not verified. |
| No business context was supplied — service-level objectives, recovery time and point objectives, data classification, and accepted risks are all absent. | Every reliability and performance finding is an engineering judgement against good practice rather than a measured gap against an agreed commitment. All twelve manual-validation items remain undecided. |
| Diagnostic settings could not be read for the Front Door WAF policy because the resource type does not support them, and no diagnostic settings exist on the storage account, the network security groups, or the Log Analytics workspace itself. | WAF logging adequacy, network flow visibility, and telemetry-platform self-monitoring could not be confirmed. |
| No Cost Management data, budgets, forecasts, or commitment utilisation was collected. | Eight cost controls could not be decided, including rate optimisation, commitment coverage, and spend anomaly detection. |

77 controls require manual validation or further evidence collection and were not decided by automated evidence, including all 12 items in the mandatory manual-validation register. See the detailed report for the full register.

## Next steps

| # | Step | Owner | Target |
|---|---|---|---|
| 1 | Switch the Front Door WAF policy to Prevention mode and attach the Microsoft Default Rule Set and Bot Manager rule set, tuning in Detection first if a rollback window is needed. | Platform / security engineering | Within 1 week |
| 2 | Remove the WordPress administrator credentials from App Service connection strings, rotate the password, and move every administrator to a named account with multifactor authentication. | WordPress application owner | Within 1 week |
| 3 | Disable phpMyAdmin in the production configuration and restrict the SCM endpoint to known addresses or the Azure Front Door service tag. | Platform engineering | Within 2 weeks |
| 4 | Agree service-level objectives, recovery time and point objectives, and data classification with the business owner, then re-score Sections 2 and 6 against those targets. | Service owner | Within 4 weeks |
| 5 | Export Azure RBAC at subscription and resource-group scope and run a documented privileged-access review covering Privileged Identity Management, Conditional Access, and break-glass accounts. | Identity / security governance | Within 4 weeks |
| 6 | Apply a tagging standard across the resource group, create a budget with anomaly alerts, and build a symptom-based alert set routed to an owned action group. | Platform engineering / FinOps | Within 6 weeks |
| 7 | If this workload is intended to carry production traffic, plan the move to a zone-redundant Premium v3 plan with autoscale and a General Purpose MySQL tier with high availability and geo-redundant backup. | Service owner / architecture | Before production go-live |
