# Azure Well-Architected Review — Executive Summary

**Workload:** WordPress on Azure App Service · **Environment:** dev / non-production  
**Subscription:** 5e8eb071-5103-4178-b2bc-417cf42def4d · **Resource group:** ahms-wg-dev-rg  
**Evidence collected:** 2026-09-25T13:29:01.4243823Z · **Review date:** 2026-09-25  
**Reviewer:** Copilot App · **Checklist:** AzureWordPressChecklist.md (157 controls)

## Overall posture

| Measure | Result |
| --- | --- |
| Overall score | 64% Red |
| Evidence coverage | 31% of applicable six-pillar controls decided from collected evidence |
| Controls assessed | 157 of 157 |
| Pass / Fail / N/A / Not verified | 33 / 13 / 6 / 105 |
| Critical findings (severity 5) | 0 |
| High findings (severity 4) | 14 |

The workload has strong edge-origin controls: Front Door/WAF is present, WAF prevention is enabled, and App Service origin access is restricted to Azure Front Door. The biggest risk is resilience and recoverability evidence: the App Service plan runs one worker, Always On and health checks are disabled, MySQL HA is disabled, and restore/failover evidence was not supplied. Because overall evidence coverage is 31%, the score reflects a partial picture and must be read with the coverage figure.

## Pillar scorecard

Score is `Pass / (Total − N/A − Not verified)`. Coverage is how much of the applicable checklist the evidence could decide. Read them together.

| Section | Total | Pass | Fail | N/A | Not verified | Score % | Coverage % | Status |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1. Workload foundations and governance | 13 | 1 | 3 | 0 | 9 | 25 | 31 | Red |
| 2. Reliability | 17 | 0 | 4 | 0 | 13 | 0 | 24 | Red |
| 3. Security | 24 | 12 | 3 | 0 | 9 | 80 | 62 | Amber |
| 4. Cost Optimization | 14 | 4 | 1 | 0 | 9 | 80 | 36 | Amber |
| 5. Operational Excellence | 17 | 2 | 0 | 0 | 15 | 100 | 12 | Amber |
| 6. Performance Efficiency | 15 | 3 | 0 | 0 | 12 | 100 | 20 | Amber |
| 7. Resource-specific supplementary | 45 | 11 | 2 | 6 | 26 | 85 | 33 | Amber |
| 8. Mandatory manual-validation register | 12 | 0 | 0 | 0 | 12 | n/a | 0 | n/a |
| **Total** | 157 | 33 | 13 | 6 | 105 |  |  |  |

## What is working well

| # | Strength | Pillar | Why it matters |
| --- | --- | --- | --- |
| 1 | App Service ingress is restricted to AzureFrontDoor.Backend with an X-Azure-FDID header and a deny-all fallback. | Security | Reduces exposure or improves operational confidence for the WordPress workload. |
| 2 | Azure Front Door Standard and a WAF policy are present; the WAF policy is in Prevention mode. | Security | Reduces exposure or improves operational confidence for the WordPress workload. |
| 3 | The web app uses a user-assigned managed identity and app settings include Key Vault reference patterns for sensitive settings. | Security | Reduces exposure or improves operational confidence for the WordPress workload. |
| 4 | HTTPS is required, minimum TLS is 1.2, remote debugging is disabled, and FTPS-only is configured. | Security | Reduces exposure or improves operational confidence for the WordPress workload. |
| 5 | Application Insights is workspace-based and linked to the workload Log Analytics workspace. | Operations | Reduces exposure or improves operational confidence for the WordPress workload. |

## Key findings and risks

| # | Finding | Control | Pillar | Severity | Business impact | Recommended action |
| --- | --- | --- | --- | ---: | --- | --- |
| 1 | Communication Services has no managed identity in the collected show output; key/connection-string handling was not proven. | ACS-01 | Resource-specific | 4 | May reduce availability, security assurance, or recovery confidence if left unresolved. | Protect ACS keys in Key Vault and rotate or use managed identity where supported. |
| 2 | Defender pricing and recommendations were collected, but CSPM/MCSB assignment, attack path, and governance-rule evidence were not complete. | DEF-01 | Resource-specific | 4 | May reduce availability, security assurance, or recovery confidence if left unresolved. | Validate Defender CSPM/foundational CSPM, MCSB assignments, governance rules, and secure-score workflow. |
| 3 | Defender pricing data was collected but policy assignment/compliance evidence was not sufficient to prove MCSB enforcement. | FND-09 | Foundations | 4 | May reduce availability, security assurance, or recovery confidence if left unresolved. | Provide Azure Policy compliance and exemption evidence for MCSB and applicable regulatory standards. |
| 4 | Key Vault purge protection is not enabled. | KV-01 | Resource-specific | 4 | May reduce availability, security assurance, or recovery confidence if left unresolved. | Enable purge protection and verify diagnostic logging/RBAC. |
| 5 | The App Service plan is running one worker. ARR affinity is disabled, which is positive, but single-worker capacity is still a resiliency gap if this environment carries availability expectations. | REL-03 | Reliability | 4 | May reduce availability, security assurance, or recovery confidence if left unresolved. | For production-like use, configure at least two workers and zone redundancy where supported; document risk acceptance for dev. |
| 6 | Always On is disabled, no health check path is configured, and auto-heal is disabled. | REL-04 | Reliability | 4 | May reduce availability, security assurance, or recovery confidence if left unresolved. | Enable Always On, configure a lightweight dependency-aware health endpoint, and add auto-heal rules. |
| 7 | Storage account evidence was collected, but blob soft delete/versioning/PITR details were not present in the collector section. | REL-12 | Reliability | 4 | May reduce availability, security assurance, or recovery confidence if left unresolved. | Collect blob service data-protection settings and enable soft delete/versioning/PITR/immutability where required. |
| 8 | The Key Vault uses RBAC and soft delete, but purge protection is not enabled. | SEC-15 | Security | 4 | May reduce availability, security assurance, or recovery confidence if left unresolved. | Enable purge protection and confirm least-privilege RBAC and diagnostic retention. |
| 9 | Anonymous blob access is disabled, but shared key access remains enabled. | SEC-17 | Security | 4 | May reduce availability, security assurance, or recovery confidence if left unresolved. | Disable shared key access after validating managed identity/SAS alternatives for the application. |
| 10 | Defender pricing data was collected, but alert routing, owned triage, and coverage validation were not proven. | SEC-21 | Security | 4 | May reduce availability, security assurance, or recovery confidence if left unresolved. | Validate Defender plan coverage and route alerts into an owned response process. |
| 11 | App Service plan is not zone redundant and runs one worker. | APP-02 | Resource-specific | 4 | May reduce availability, security assurance, or recovery confidence if left unresolved. | Use zone redundancy and at least two workers for production SLOs or document risk acceptance for dev. |
| 12 | MySQL high availability is disabled. Backup retention is collected, but HA is not configured. | REL-08 | Reliability | 4 | May reduce availability, security assurance, or recovery confidence if left unresolved. | Enable zone-redundant or same-zone HA where required by RTO/RPO and validate backups. |
| 13 | Database and storage recovery settings were collected, but no end-to-end recovery set/runbook evidence was supplied. | REL-09 | Reliability | 4 | May reduce availability, security assurance, or recovery confidence if left unresolved. | Document the recovery set for database, media, configuration, secrets, DNS, certificates, edge, and network policy. |
| 14 | MySQL has a user-assigned identity, but authentication model, database grants, and credential rotation evidence were not collected. | SEC-04 | Security | 4 | May reduce availability, security assurance, or recovery confidence if left unresolved. | Validate Entra authentication or least-privilege MySQL user design and credential rotation evidence. |
| 15 | ACS data location is africa, but privacy/consent and logging-minimization evidence was not supplied. | ACS-03 | Resource-specific | 3 | May reduce availability, security assurance, or recovery confidence if left unresolved. | Provide consent/privacy assessment and logging schema review. |

## Remediation priorities

| Priority | Action | Controls | Severity | Effort | Change risk | Cost impact |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| Do now | Protect ACS keys in Key Vault and rotate or use managed identity where supported. | ACS-01, DEF-01, FND-09, KV-01, REL-03, REL-04, REL-12, SEC-15 | 4 | 2 | 2 | 3 |
| Plan | Use zone redundancy and at least two workers for production SLOs or document risk acceptance for dev. | APP-02, REL-08, REL-09, SEC-04 | 4 | 3 | 3 | 3 |
| Schedule | Provide consent/privacy assessment and logging schema review. | ACS-03, APP-01, DEF-02, FD-03, FND-10, FND-11, KV-02, MON-02 | 3 | 3 | 3 | 3 |
| Backlog | Right-size App Service against measured load and establish autoscale rules. | CST-03, FND-12 | 2 | 2 | 2 | 1 |

## Confidence and limitations

| Limitation | Effect on this review |
| --- | --- |
| Manual/process evidence not supplied | Many governance, operations, recovery, performance, and manual validation controls remain Not verified and reduce coverage. |
| Unsupported related resource types in manifest | Managed identities, private DNS virtual network links, NICs, Event Grid topics, and email domains were inventoried but not deeply collected. |
| Plan apps collector section failed | Plan consolidation/cost assessment could not be fully decided. |

12 controls require manual validation and were not decided by automated evidence. See the detailed report for the full register.

## Next steps

| # | Step | Owner | Target |
| --- | --- | --- | --- |
| 1 | Enable Key Vault purge protection and review Defender/Advisor recommendations. |  |  |
| 2 | Decide resilience target for this dev workload and configure Always On, health checks, autoscale, and MySQL HA where required. |  |  |
| 3 | Provide manual evidence for recovery tests, RBAC/PIM/MFA, CI/CD, WordPress governance, and cost controls. |  |  |