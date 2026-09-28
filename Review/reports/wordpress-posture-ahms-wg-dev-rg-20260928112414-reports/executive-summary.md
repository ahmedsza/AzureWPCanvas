# Azure Well-Architected Review — Executive Summary

**Workload:** WordPress on Azure App Service · **Environment:** Unknown / not independently confirmed
**Subscription:** 5e8eb071-5103-4178-b2bc-417cf42def4d · **Resource group:** ahms-wg-dev-rg
**Evidence collected:** 2026-09-28T11:25:07.9348266Z · **Review date:** 2026-09-28
**Reviewer:** GitHub Copilot, evidence-led assessment · **Checklist:** AzureWordPressChecklist.md (157 enumerated controls)

## Overall posture

| Measure | Result |
|---|---|
| Overall score | n/a — three of six pillars have no decided controls; overall numeric band unavailable |
| Evidence coverage | 9% unweighted mean coverage across six headline pillars; partial picture |
| Controls assessed | 157 of 157 actual checklist rows |
| Pass / Fail / N/A / Not verified | 5 / 8 / 9 / 135 |
| Critical findings (severity 5) | 0 confirmed Fail; 0 Not verified |
| High findings (severity 4) | 4 confirmed Fail; 72 Not verified (potential impact, not observed failures) |

The configuration restricts the origin to the intended Front Door profile, disables public access to four key dependencies, and protects storage against anonymous/shared-key access and short-term deletion. The largest **confirmed** security gap is WAF Detection with no configured managed or custom rules; worker-health settings and vault purge protection also need attention. No SLO/RTO/RPO, data classification or authoritative environment classification was supplied, so operational suitability is not established: **n/a headline score at 9% coverage is a partial picture**, not a compliance claim.

## Pillar scorecard

Score is `Pass / (Total − N/A − Not verified)`. Coverage is how much of the applicable
checklist the evidence could decide. Read them together.

| Pillar | Controls | Pass | Fail | N/A | Not verified | Score % | Coverage % | Status |
|---|---|---|---|---|---|---|---|---|
| 1. Foundations & governance | 13 | 0 | 1 | 0 | 12 | 0% | 8% | 🔴 Red |
| 2. Reliability | 17 | 1 | 2 | 0 | 14 | 33% | 18% | 🔴 Red |
| 3. Security | 24 | 3 | 4 | 0 | 17 | 43% | 29% | 🔴 Red |
| 4. Cost Optimization | 14 | 0 | 0 | 0 | 14 | n/a | 0% | 🟡 Amber |
| 5. Operational Excellence | 17 | 0 | 0 | 0 | 17 | n/a | 0% | 🟡 Amber |
| 6. Performance Efficiency | 15 | 0 | 0 | 0 | 15 | n/a | 0% | 🟡 Amber |
| 7. Resource-specific | 45 | 1 | 1 | 9 | 34 | 50% | 6% | 🔴 Red |
| 8. Manual validation register | 12 | 0 | 0 | 0 | 12 | n/a | 0% | 🟡 Amber |
| **Total** | **157** | 5 | 8 | 9 | 135 | 38% | 9% | 🔴 Red |

The total row is pooled audit detail (38% score / 9% coverage), not the six-pillar headline. The headline is the unweighted mean of Sections 1–6; with three undefined pillar scores, it remains n/a at 9% mean coverage rather than inventing zero scores or dropping unknown pillars. Section 7 and the manual register are reported separately.

The loaded checklist contains **157 unique control rows**, including **45** in Section 7: APP 2 + SQL 4 + KV 2 + RDS 3 + FD 3 + NET 7 + NAT 6 + MON 7 + ACS 5 + DEF 6. This differs from the earlier review's reported 152/40 count: the actual bundled file includes KV-01–KV-02 and FD-01–FD-03. These five IDs were read from that file, not invented. Removing them would omit real controls. Section totals are 13 / 17 / 24 / 14 / 17 / 15 / 45 / 12.

## What is working well

| # | Strength | Pillar | Why it matters |
|---|---|---|---|
| 1 | SEC-09 — Front Door backend service tag plus matching profile identifier and default Deny | Security | Provides the intended control-plane origin-bypass restriction; negative tests remain outstanding. |
| 2 | SEC-12 — MySQL, Blob, Key Vault and Redis disable public access and have approved private endpoints | Security | Reduces public data-service exposure; runtime DNS/path tests are still required. |
| 3 | SEC-17 — anonymous Blob and shared-key access disabled; Blob identity path configured | Security | Limits public exposure and account-key use without claiming all application grants are verified. |
| 4 | REL-12 — seven-day Blob and container soft delete enabled | Reliability | Adds deletion recovery protection; full restore performance remains untested. |
| 5 | FD-01 — nonclassic Front Door Standard | Security | Avoids a classic Front Door lifecycle dependency; Premium may still be needed for managed rules. |

## Key findings and risks

| # | Finding | Control | Pillar | Severity | Business impact | Recommended action |
|---|---|---|---|---|---|---|
| 1 | Fail — WAF remains in Detection mode | SEC-07 | Security | 4 | Threats are logged rather than blocked at the edge. | Tune then enable Prevention and test every intended route. |
| 2 | Fail — no managed WAF rules or custom rate rules configured | SEC-08 | Security | 4 | The current policy has no configured managed attack/rate-limiting rule set. | Evaluate Premium managed/bot rules and implement tested targeted rate limits. |
| 3 | Fail — vault purge protection not enabled | SEC-15 | Security | 4 | Deletion can become unrecoverable despite seven-day soft delete. | Enable purge protection after approved retention/change review. |
| 4 | Fail — Always On and auto-heal disabled; no Health Check path | REL-04 | Reliability | 4 | Cold starts and unhealthy-worker behavior lack these configured safeguards. | Implement and test worker-health controls. |
| 5 | Not verified — business targets and environment unknown | FND-03 | Foundations | 4 | Resilience and capacity cannot be judged against business needs. | Obtain environment classification, SLO/SLI and RTO/RPO approval. |
| 6 | Not verified — inherited roles and tenant access controls absent | FND-07 | Foundations | 4 | Standing privileged access, MFA/PIM and emergency-access effectiveness are unverified. | Review effective RBAC, tenant controls and a dated emergency-access test. |
| 7 | Not verified — stopped database; HA/geo-backup disabled | REL-08 | Reliability | 4 | Operational intent and recovery adequacy are unknown, not a proved live outage. | Confirm stop schedule and compare seven-day backup settings to approved targets. |
| 8 | Not verified — no full restore exercise supplied | REL-10 | Reliability | 4 | Configured protection has no measured recovery result. | Exercise full-workload restore and measure achieved RTO/RPO. |
| 9 | Not verified — configured managed identity lacks full access validation | SEC-03 | Security | 4 | Identity flags do not prove actual least-privilege dependency access or safe secret references. | Verify effective data roles, reference resolution and the actual authentication paths. |
| 10 | Not verified — vault metadata blocked; expiration advisory exists | SEC-14 | Security | 4 | Secret inventory, expiry scope and safe rotation are not verified. | Collect metadata privately and validate lifecycle/rotation without exposing values. |
| 11 | Not verified — active WordPress admin roles/MFA not collected | SEC-20 | Security | 4 | Bootstrap names do not establish shared or weak active administrator accounts. | Review real users, roles, authentication and administrator audit evidence. |
| 12 | Not verified — app enables MySQL identity, grants uncollected | SEC-04 | Security | 4 | Actual database authentication and least privilege are unverified. | Export server Entra configuration and grants; test the dedicated identity. |
| 13 | Not verified — Redis database authentication not collected | RDS-03 | Security | 4 | Parent cache/network settings do not prove authentication enforcement. | Collect database access policy and test unauthorized access rejection. |
| 14 | Not verified — security effectiveness tests not supplied | SEC-23 | Security | 4 | Configuration strengths have not been validated end to end. | Test WAF, direct-origin denial, admin/auth and security response. |
| 15 | Not verified — runtime and component lifecycle inventory incomplete | OPS-13 | Operations | 4 | Actual PHP, WordPress and plugin support/patch status cannot be established. | Inventory runtime images and components with support dates, patch evidence and owners. |

This table is capped at 15 rows. All 76 severity-4 and 0 severity-5 finding records are included in the CSV and detailed remediation plan; most are verification actions, not proved faults. Counts refer to checklist finding records, including overlaps between pillar, supplementary and manual controls, not distinct incidents.

## Remediation priorities

| Priority | Action | Controls | Severity | Effort | Change risk | Cost impact |
|---|---|---|---|---|---|---|
| Do now | Approve and enable vault purge protection | SEC-15 | 4 | 1 | 2 | 1 |
| Do now | Tune and switch WAF to Prevention with regression testing | SEC-07 | 4 | 2 | 3 | 1 |
| Do now | Confirm environment, business targets, classification and stopped-database intent before resilience choices | FND-03, FND-05, REL-08 | 4 | 2 | 1 | 1 |
| Plan | Enable Always On and implement tested Health Check/auto-heal | REL-04 | 4 | 3 | 2 | 1 |
| Plan | Implement supported managed/bot and targeted WAF rate rules | SEC-08 | 4 | 3 | 3 | 3 |
| Plan | Run full restore and critical security effectiveness exercises | REL-10, MAN-02, MAN-07 | 4 | 3 | 2 | 1 |
| Schedule | Replace root-page probe, restrict NSG flows and test maintenance reconnect | REL-13, SEC-13, SQL-02 | 3 | 3 | 3 | 1 |
| Backlog | Enforce missing ownership/cost/lifecycle tags | FND-12 | 2 | 2 | 1 | 1 |

Scores are independent severity, implementation/verification effort, change risk and recurring Azure cost. Proposed target windows and owner roles need acceptance; nothing was changed in Azure.

## Confidence and limitations

| Limitation | Effect on this review |
|---|---|
| Stopped MySQL: database, parameter and backup calls failed; firewall enumeration incompatible with private access | Grants/schema/GIPK, secure transport, query tuning and recovery enumeration remain unverified. The successful show payload still provides configuration and state. |
| Private Key Vault runner connectivity blocked three metadata calls | Secret/key/certificate inventory, expiration scope and rotation could not be verified. Preserve private access and collect from an approved network. |
| No dated application/business/manual evidence | Environment, SLO/RTO/RPO, classification, effective WordPress users/MFA, runtime support, performance, cost governance and tested recovery remain unknown. |
| Additional collector gaps | Plan app enumeration failed; storage lifecycle policy call failed; direct WAF-policy diagnostics unsupported. Do not interpret these errors as missing resources or missing Front Door profile logs. |
| Defender shape and scope | Embedded assessment JSON was parsed and exact-scoped: 26 workload records out of 7,734 subscription records. Unrelated findings were excluded; subscription plan spend/coverage cannot be judged from resource-group inventory. |
| Inventory limits | 37 resources; 25 output JSONs; 14 unsupported entries; 10 failed sections despite zero manifest-level errors. Parent configuration only partially covers unsupported children. |
| Checklist count discrepancy | Actual unique rows total 157, rather than the earlier review’s reported 152; the five Key Vault/Front Door IDs are present in the loaded authoritative checklist. |

All 12 manual-register controls require dated manual validation and were not decided by automated evidence. In total 135 controls remain Not verified, including collection limitations and process/application questions. 63 lower-impact unknowns are summarized into six real-ID pillar coverage rows in the CSV; full individual rows remain in the detailed report.

## Next steps

| # | Step | Owner | Target |
|---|---|---|---|
| 1 | Approve environment classification, critical flows, SLO/RTO/RPO, data classification and accepted risks | Workload and business owners (proposed) | Within 7 days; agreement required |
| 2 | Triage the four confirmed high findings and assign change owners | Security and platform owners (proposed) | Within 7 days; agreement required |
| 3 | Repair collection using supported commands and an approved private-network runner; recollect database metadata in an authorized operating window | Platform and database owners (proposed) | Within 14 days; agreement required |
| 4 | Exercise restore, WAF/origin/admin protection, private DNS and load behavior; provide budgets and utilization evidence | Operations, application, security and FinOps owners (proposed) | Plan within 30 days; agreement required |
| 5 | Reassess the same control IDs from fresh evidence and record approved exceptions | Workload owner and independent reviewer (proposed) | After remediation and manual evidence completion |
