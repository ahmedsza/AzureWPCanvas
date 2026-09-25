# Report templates

Fixed structures for the two Markdown reports and the CSV. Keep heading order, table columns, and the CSV header row exactly as written so reports are comparable across runs and environments.

The fourth output, `well-architected-review.pptx`, is specified in [presentation-template.md](./presentation-template.md).

Replace every `<...>` placeholder. Never ship a placeholder or a "TBD" row.

---

## 1. `executive-summary.md`

Leadership audience. Tables and prose only — no JSON, no `az` commands, no file paths into the evidence directory.

````markdown
# Azure Well-Architected Review — Executive Summary

**Workload:** <workload / site name> · **Environment:** <prod | non-prod>
**Subscription:** <subscription id> · **Resource group:** <rg>
**Evidence collected:** <generatedAtUtc from the manifest> · **Review date:** <date>
**Reviewer:** <name> · **Checklist:** AzureWordPressChecklist.md (157 controls)

## Overall posture

| Measure | Result |
|---|---|
| Overall score | <n>% <RAG> |
| Evidence coverage | <n>% of applicable controls decided from collected evidence |
| Controls assessed | <n> of 157 |
| Pass / Fail / N/A / Not verified | <p> / <f> / <na> / <nv> |
| Critical findings (severity 5) | <n> |
| High findings (severity 4) | <n> |

<Two or three sentences: what this workload does well, the single biggest risk, and whether the current configuration supports the stated SLO/RTO/RPO. Name the risk explicitly. If coverage is below 50%, say plainly that the score reflects a partial picture.>

## Pillar scorecard

Score is `Pass / (Total − N/A − Not verified)`. Coverage is how much of the applicable
checklist the evidence could decide. Read them together.

| Pillar | Controls | Pass | Fail | N/A | Not verified | Score % | Coverage % | Status |
|---|---|---|---|---|---|---|---|---|
| 1. Foundations & governance | 13 | | | | | | | |
| 2. Reliability | 17 | | | | | | | |
| 3. Security | 24 | | | | | | | |
| 4. Cost Optimization | 14 | | | | | | | |
| 5. Operational Excellence | 17 | | | | | | | |
| 6. Performance Efficiency | 15 | | | | | | | |
| 7. Resource-specific | 45 | | | | | | | |
| 8. Manual validation register | 12 | | | | | | | |
| **Total** | **157** | | | | | | | |

## What is working well

| # | Strength | Pillar | Why it matters |
|---|---|---|---|
| 1 | <observed configuration, stated concretely> | <pillar> | <business benefit> |

## Key findings and risks

| # | Finding | Control | Pillar | Severity | Business impact | Recommended action |
|---|---|---|---|---|---|---|
| 1 | <what was observed> | <ID> | <pillar> | <1–5> | <consequence in business terms> | <action> |

## Remediation priorities

| Priority | Action | Controls | Severity | Effort | Change risk | Cost impact |
|---|---|---|---|---|---|---|
| Do now | <action> | <IDs> | <1–5> | <1–5> | <1–5> | <1–5> |
| Plan | | | | | | |
| Schedule | | | | | | |

## Confidence and limitations

| Limitation | Effect on this review |
|---|---|
| <collector error, missing permission, or uncollected resource type> | <which controls could not be decided> |

<n> controls require manual validation and were not decided by automated evidence. See the detailed report for the full register.

## Next steps

| # | Step | Owner | Target |
|---|---|---|---|
| 1 | | | |
````

---

## 2. `detailed-well-architected-review.md`

Engineering audience. Every applicable checklist ID appears exactly once.

````markdown
# Azure Well-Architected Review — Detailed Report

## 1. Scope and method

| Field | Value |
|---|---|
| Workload | |
| Subscription / resource group | |
| Evidence directory | |
| Evidence generated (UTC) | |
| Collector schema version | 4.0 |
| Checklist | AzureWordPressChecklist.md |
| Reviewer / review date | |
| Stated SLO / RTO / RPO | <or "not supplied"> |
| Data classification | <or "not supplied"> |

Assessment is based on point-in-time Azure control-plane configuration captured by
`Invoke-CollectWordPressPosture.ps1`. It does not include live availability testing,
application vulnerability scanning, restore testing, WAF attack simulation, or an
Azure Policy compliance review.

### Resources in scope

| Resource | Type | Evidence file | Collection result |
|---|---|---|---|
| <name> | <Microsoft.Web/sites> | `appservice-<name>.json` | Complete / Partial (<n> sections failed) |

### Scope limitations

| Item | Reason | Controls affected |
|---|---|---|
| <unsupported resource or failed section> | <manifest error text or "no collector for this type"> | <IDs> |

## 2. Scoring summary

| Section | Total | Pass | Fail | N/A | Not verified | Score % | Coverage % | Status |
|---|---|---|---|---|---|---|---|---|
| 1. Workload foundations and governance | 13 | | | | | | | |
| 2. Reliability | 17 | | | | | | | |
| 3. Security | 24 | | | | | | | |
| 4. Cost Optimization | 14 | | | | | | | |
| 5. Operational Excellence | 17 | | | | | | | |
| 6. Performance Efficiency | 15 | | | | | | | |
| 7. Resource-specific supplementary | 45 | | | | | | | |
| 8. Mandatory manual-validation register | 12 | | | | | | | |
| **Total** | **157** | | | | | | | |

## 3. Workload foundations and governance

<One paragraph: overall state of this section.>

| ID | Control | Status | Evidence | Observation | Recommendation |
|---|---|---|---|---|---|
| FND-01 | <short control text> | Pass \| Fail \| N/A \| Not verified | `<file> → sections.<x>.data.<path> = <value>` | <what the evidence shows> | <action, or "None — control met"> |

## 4. Reliability
<Same table structure, REL-01 … REL-17.>

## 5. Security
<Same table structure, SEC-01 … SEC-24.>

## 6. Cost Optimization
<Same table structure, CST-01 … CST-14.>

## 7. Operational Excellence
<Same table structure, OPS-01 … OPS-17.>

## 8. Performance Efficiency
<Same table structure, PRF-01 … PRF-15.>

## 9. Resource-specific findings

### 9.1 App Service plan, web app, and slots
<APP-01, APP-02 — same table structure.>

### 9.2 Azure Database for MySQL Flexible Server
<SQL-01 … SQL-04.>

### 9.3 Key Vault
<KV-01, KV-02.>

### 9.4 Redis
<RDS-01 … RDS-03.>

### 9.5 Azure Front Door and WAF
<FD-01 … FD-03.>

### 9.6 Network
<NET-01 … NET-07.>

### 9.7 NAT Gateway
<NAT-01 … NAT-06.>

### 9.8 Application Insights and Log Analytics
<MON-01 … MON-07.>

### 9.9 Azure Communication Services
<ACS-01 … ACS-05.>

### 9.10 Defender for Cloud and Azure Policy
<DEF-01 … DEF-06.>

## 10. Manual validation register

Not decidable from collected evidence. Each item needs a dated manual test.

| ID | Manual validation | Required evidence | Status | Owner | Target date |
|---|---|---|---|---|---|
| MAN-01 | | | Not verified | | |

## 11. Prioritised remediation plan

| Priority | Finding | Controls | Severity | Effort | Change risk | Cost | Owner | Target |
|---|---|---|---|---|---|---|---|---|
| Do now | | | | | | | | |

## 12. Collection gaps

| Evidence file | Section | Error | Controls set to Not verified |
|---|---|---|---|
| | | <verbatim `sections.<x>.error`> | |

## 13. Microsoft guidance referenced

<Links from the checklist's "Microsoft guidance used" section that back the recommendations above.>
````

---

## 3. `findings.csv`

Header row exactly as below. UTF-8, comma-delimited, quote every field containing a comma or quote.

```csv
FindingId,ControlId,Pillar,Resource,Title,Summary,Status,Severity,Effort,Risk,Cost,Priority,Evidence,Recommendation
```

| Column | Content |
|---|---|
| `FindingId` | `F-001` upward, ordered by severity descending. |
| `ControlId` | Checklist ID, verbatim (`SEC-09`). |
| `Pillar` | `Foundations`, `Reliability`, `Security`, `Cost`, `Operations`, `Performance`. |
| `Resource` | Azure resource name, or `workload` for cross-cutting findings. |
| `Title` | Under 80 characters, states the gap not the fix. |
| `Summary` | One or two sentences: observation, then consequence. |
| `Status` | `Fail` or `Not verified`. |
| `Severity` `Effort` `Risk` `Cost` | Integers 1–5 per the scoring rubric. |
| `Priority` | `Do now`, `Plan`, `Schedule`, `Backlog`. |
| `Evidence` | `<file> → sections.<x>.data.<path>`, or `manual validation required`. |
| `Recommendation` | Imperative, specific, and verifiable. |

Example row:

```csv
F-001,SEC-09,Security,wp-prod-app,Origin reachable directly bypassing Front Door WAF,"App Service access restrictions allow all IPs, so requests can reach the origin without traversing the WAF, defeating edge protection.",Fail,5,2,1,1,Do now,appservice-wp-prod-app.json → sections.accessRestrictions.data.ipSecurityRestrictions,"Restrict inbound traffic to the AzureFrontDoor.Backend service tag and validate the X-Azure-FDID header, or move to Front Door Premium Private Link, then re-test direct origin access."
```
