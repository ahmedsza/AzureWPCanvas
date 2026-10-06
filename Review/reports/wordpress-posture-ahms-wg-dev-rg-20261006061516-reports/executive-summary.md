# Azure Well-Architected Review — Executive Summary

**Workload:** WordPress on App Service · **Environment:** dev-tagged; business classification unconfirmed

**Subscription:** 5e8eb071-5103-4178-b2bc-417cf42def4d · **Resource group:** ahms-wg-dev-rg

**Evidence collected:** 2026-10-06T06:15:34.7964062Z · **Review date:** 2026-10-06

**Reviewer:** GitHub Copilot evidence assessment · **Checklist:** AzureWordPressChecklist.md (157 controls)

## Overall posture

| Measure | Result |
|---|---|
| Overall score | n/a — insufficient evidence across all six pillars; read with coverage below |
| Evidence coverage | 8% six-pillar mean; manual validation explicitly excluded |
| Controls assessed | 157 of 157 (assessment does not mean verified) |
| Pass / Fail / N/A / Not verified | 3 / 7 / 8 / 139 |
| Critical findings (severity 5) | 0 |
| High findings (severity 4) | 4 confirmed failures; 103 separate verification findings |
| Pooled audit (not headline) | 30% score / 7% coverage |
| Review scope | 37 inventoried resources; 14 without dedicated collector outputs; 10 failed sections |

The strongest configured safeguards are profile-bound origin restrictions, disabled anonymous/shared-key Blob access, and seven-day Blob/container soft delete. WAF is Detection-only, app health recovery is disabled, and provider-reported vault expiration/deletion-protection issues remain open. MySQL was stopped when evidence was captured; this limits both readiness and database verification, but no outage or breached SLO is inferred without live tests and business objectives.

**Coverage is below 50%: this is a partial picture, not a production-readiness approval.** No SLO/RTO/RPO, data classification or manual evidence was supplied. Cost and Performance have no decided controls; the overall score is n/a rather than an invented mean of the remaining pillars.

## Pillar scorecard

| Pillar | Controls | Pass | Fail | N/A | Not verified | Score % | Coverage % | Status |
|---|---|---|---|---|---|---|---|---|
| 1. Foundations & governance | 13 | 0 | 1 | 0 | 12 | 0 | 8 | Red |
| 2. Reliability | 17 | 1 | 1 | 0 | 15 | 50 | 12 | Red |
| 3. Security | 24 | 2 | 3 | 0 | 19 | 40 | 21 | Red |
| 4. Cost Optimization | 14 | 0 | 0 | 0 | 14 | n/a | 0 | Amber - insufficient evidence |
| 5. Operational Excellence | 17 | 0 | 1 | 0 | 16 | 0 | 6 | Red |
| 6. Performance Efficiency | 15 | 0 | 0 | 0 | 15 | n/a | 0 | Amber - insufficient evidence |
| 7. Resource-specific | 45 | 0 | 1 | 8 | 36 | 0 | 3 | Red |
| 8. Manual validation register | 12 | 0 | 0 | 0 | 12 | n/a | 0 | Amber - insufficient evidence |
| Total (pooled audit; not headline) | 157 | 3 | 7 | 8 | 139 | 30 | 7 | Red |

Score uses only Pass/Fail decisions; coverage retains unverified controls. Headline coverage is the mean of Sections 1–6; resource-specific and manual registers remain separate. Pooled totals are for reconciliation, not a replacement headline.

## What is working well

| # | Strength | Pillar | Why it matters |
|---|---|---|---|
| 1 | Origin allows the Front Door backend service tag only with this profile's ID; all other main-site traffic is denied. | Security | Provides a configured barrier to direct-origin access; negative testing is still needed. |
| 2 | Anonymous Blob access and shared-key access are disabled; app requests managed-identity integration. | Security | Reduces public data and account-key exposure paths; application behavior still needs validation. |
| 3 | Blob and container soft delete retain deleted data for seven days. | Reliability | Offers a configured accidental-deletion recovery window; it is not a tested full-workload restore. |
| 4 | MySQL, Redis, vault and Blob public access is disabled; approved private endpoints are visible (partial evidence, not a full-control Pass). | Security | Limits public dependency paths, subject to DNS and client connectivity validation. |
| 5 | App, edge, vault and database export diagnostics to a co-located workspace (partial evidence). | Operations | Provides a central collection destination, but does not prove source completeness or alert response. |

## Key findings and risks

| # | Finding | Control | Pillar | Severity | Business impact | Recommended action |
|---|---|---|---|---|---|---|
| 1 | App health checks, Always On and auto-heal are disabled [F-001; Fail] | REL-04 | Reliability | 4 | Cold starts and unhealthy workers can prolong user-visible disruption. | Enable and test health checks, Always On and auto-heal. |
| 2 | WAF is Detection-only rather than blocking [F-002; Fail] | SEC-07 | Security | 4 | Detection mode does not stop matching malicious requests at the edge. | Tune protection and stage a move to WAF Prevention. |
| 3 | Provider reports secrets without expiration dates [F-003; Fail] | SEC-14 | Security | 4 | Credentials without managed expiry can remain usable beyond their intended lifecycle. | Revalidate secret expiries privately, assign rotation owners and test rotation. |
| 4 | Provider reports missing vault deletion protection [F-004; Fail] | SEC-15 | Security | 4 | Insufficient deletion safeguards can extend recovery after accidental or malicious vault deletion. | Revalidate purge protection; obtain approval, configure and confirm provider closure. |
| 5 | Business availability and recovery objectives are not supplied [F-021; Not verified] | FND-03 | Foundations | 4 | Without agreed targets, redundancy and recovery spending cannot be justified or accepted. Verification risk, not a confirmed exposure. | Obtain business-approved SLO/SLI/RTO/RPO and risk decisions. |
| 6 | Achieved recovery time and data loss are untested [F-081; Not verified] | REL-10 | Reliability | 4 | An unproven restore may miss business tolerances during a real incident. Verification risk, not a confirmed exposure. | Run a controlled full-workload restore and record achieved RTO/RPO. |
| 7 | Application database least privilege is unverified [F-090; Not verified] | SEC-04 | Security | 4 | Excessive database grants could widen the impact of an application compromise; actual grants are unknown. Verification risk, not a confirmed exposure. | Verify runtime identity and least-privilege MySQL grants while the server is available. |
| 8 | Effective WAF rules and tier suitability are unverified [F-093; Not verified] | SEC-08 | Security | 4 | The site may lack intended attack coverage; an associated WAF alone is not proof of protection. Verification risk, not a confirmed exposure. | Export effective rules and exclusions; validate required protections and Standard/Premium choice. |
| 9 | Private DNS and client-path connectivity are untested [F-096; Not verified] | SEC-12 | Security | 4 | Private dependencies may fail from some client paths despite approved endpoints. Verification risk, not a confirmed exposure. | Test private DNS and fail-closed connectivity from all required client paths. |
| 10 | Redis database authentication enforcement is unverified [F-072; Not verified] | RDS-03 | Reliability | 4 | Network isolation does not establish authenticated cache access. Verification risk, not a confirmed exposure. | Export cache database authentication settings and test rejection of unauthenticated access. |
| 11 | MySQL primary-key and GIPK configuration cannot be verified [F-107; Not verified] | SQL-04 | Reliability | 4 | Unverified table keys/parameters leave replication and recovery behavior uncertain. Verification risk, not a confirmed exposure. | Recollect parameters and inspect primary keys/GIPK during an approved running window. |
| 12 | Alert ownership and delivery are unverified [F-056; Not verified] | OPS-09 | Operations | 4 | Critical incidents may not reach an accountable responder in time. Verification risk, not a confirmed exposure. | Review alert routes/owners and execute notification tests. |
| 13 | Peak-load and failure-mode performance are untested [F-067; Not verified] | PRF-06 | Performance | 4 | The capacity limit and behavior under sustained demand are unknown. Verification risk, not a confirmed exposure. | Run versioned peak, soak and failure-mode tests against agreed targets. |
| 14 | WordPress administrator privilege and MFA are unverified [F-101; Not verified] | SEC-20 | Security | 4 | Excessive or weakly protected admin access could compromise content and application control. Verification risk, not a confirmed exposure. | Review active WordPress users, roles, MFA and audit records. |
| 15 | Telemetry query and export least privilege are unverified [F-043; Not verified] | MON-01 | Operations | 4 | Telemetry access and export could exceed intended privileges; actual permissions need review. Verification risk, not a confirmed exposure. | Review effective workspace/component query-export grants and telemetry authentication. |

This table highlights 15 of 116 backlog entries. The CSV contains every failure and all 103 high-impact verification findings; the detailed report contains every control and six grouped lower-impact coverage rows. Additional confirmed gaps concern tagging, web log sources and MySQL maintenance scheduling. Do not treat verification findings as proven failures.

## Remediation priorities

| Priority | Action | Controls | Severity | Effort | Change risk | Cost impact |
|---|---|---|---|---|---|---|
| Do now | Confirm vault deletion-protection state, obtain owner approval and verify closure after configuration. | SEC-15 | 4 | 2 | 2 | 1 |
| Plan | Revalidate secret expiries privately, remediate expiry/ownership gaps and test rotation. | SEC-14 | 4 | 3 | 3 | 1 |
| Plan | Configure/test app health recovery and move tuned WAF protection into Prevention. | REL-04, SEC-07 | 4 | 3 | 2–3 | 1–2; managed-rule uplift separately costed |
| Do now | Agree business SLO/RTO/RPO; export effective WAF rules and runtime identity grants. | FND-03, SEC-08, SEC-04 | 4 | 2 | 1 | 1 for verification |
| Plan | Exercise full-workload restore and negative security controls. | REL-10, SEC-23 | 4 | 3 | 2 | 1 for verification |
| Schedule | Enable and demonstrate log-source ingestion and deliberate database maintenance timing. | OPS-07, SQL-02 | 3 | 2 | 2 | 1–2 |
| Backlog | Complete ownership, cost-center and lifecycle tagging. | FND-12 | 2 | 2 | 1 | 1 |

## Confidence and limitations

| Limitation | Effect on this review |
|---|---|
| Stopped database during collection | Database/parameter queries failed and backup enumeration was unavailable. Entra-only provider evidence is positive but grants, TLS enforcement, schema and recovery tests remain unverified. |
| Private vault denied collector data-plane access | Secret/key/certificate metadata could not be read. Open provider findings retain their older evaluation dates; failed access does not prove runtime access or secret safety. |
| Missing operational evidence and incomplete collector coverage | No manual validation or live tests; origin details, cache database settings, sidecar runtime, effective access, cost metrics and several child resources are incomplete. Ten failed calls were found despite an empty manifest error list. |

139 controls remain Not verified. All 12 manual-register items are unverified. User answers from previous runs were explicitly excluded. The evidence is assessed independently; this report does not claim a remediation delta from an earlier review.

## Next steps

| # | Step | Owner | Target |
|---|---|---|---|
| 1 | Confirm environment classification, operating schedule and availability/recovery objectives. | Workload owner — not assigned | Agree before readiness approval |
| 2 | Recollect database evidence during an authorized running window and vault metadata from an approved private path. | Platform/DB owner — not assigned | After access and schedule approval |
| 3 | Stage WAF/health/logging/maintenance corrections and revalidate open vault safeguards. | Platform/security owner — not assigned | Prioritize through change control |
| 4 | Supply dated identity, restore, security and performance tests; refresh the three reports. | Workload/security owners — not assigned | After remediation and evidence collection |
