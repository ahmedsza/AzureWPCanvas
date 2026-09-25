# Azure Well-Architected Review — Executive Summary

> **Sanitized sample:** Environment identifiers and potentially sensitive metadata in this example have been replaced with fictional values. Do not treat names, addresses, dates, or ownership metadata as a real deployment.

**Workload:** WordPress on Azure App Service (`sample-wp-prod`) · **Environment:** prod
**Subscription:** 00000000-0000-0000-0000-000000000000 · **Resource group:** sample-wordpress-prod-rg
**Evidence collected:** 2026-01-15T10:00:00Z · **Review date:** 2026-01-15
**Reviewer:** GitHub Copilot · **Checklist:** AzureWordPressChecklist.md (157 controls)

## Overall posture

| Measure | Result |
|---|---|
| Overall score | 92% 🟡 Amber |
| Evidence coverage | 48% of applicable controls decided from collected evidence |
| Controls assessed | 72 of 157 |
| Pass / Fail / N/A / Not verified | 65 / 7 / 7 / 78 |
| Critical findings (severity 5) | 0 |
| High findings (severity 4) | 3 |

This is a well-engineered production platform. The origin is genuinely locked behind Front Door
Premium using both a service tag and the Front Door identifier header, every data service is private
with no public path, MySQL runs zone-redundant with Microsoft Entra authentication only, and media
storage carries versioning, soft delete and point-in-time restore. The single biggest risk is not a
misconfiguration — it is that none of this resilience has ever been tested: there is no restore
drill, no origin-bypass test and no load test, and no SLO, RTO or RPO exists to judge the
configuration against. Coverage is 48%, so the 92% score reflects a partial picture and must be read
as a strong platform-configuration baseline rather than a production sign-off. The overall band is
held at Amber for exactly that reason.

## Pillar scorecard

Score is `Pass / (Total − N/A − Not verified)`. Coverage is how much of the applicable
checklist the evidence could decide. Read them together.

| Pillar | Controls | Pass | Fail | N/A | Not verified | Score % | Coverage % | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 1. Foundations & governance | 13 | 4 | 0 | 0 | 9 | 100% | 31% | 🟡 Amber |
| 2. Reliability | 17 | 8 | 1 | 0 | 8 | 89% | 53% | 🟡 Amber |
| 3. Security | 24 | 15 | 3 | 0 | 6 | 83% | 75% | 🟡 Amber |
| 4. Cost Optimization | 14 | 7 | 0 | 0 | 7 | 100% | 50% | 🟢 Green |
| 5. Operational Excellence | 17 | 4 | 1 | 0 | 12 | 80% | 29% | 🟡 Amber |
| 6. Performance Efficiency | 15 | 7 | 0 | 0 | 8 | 100% | 47% | 🟡 Amber |
| 7. Resource-specific | 45 | 20 | 2 | 7 | 16 | 91% | 58% | 🟢 Green |
| 8. Manual validation register | 12 | 0 | 0 | 0 | 12 | n/a | 0% | Not verified |
| **Total** | **157** | **65** | **7** | **7** | **78** | **92%** | **48%** | 🟡 **Amber** |

Sections 1, 4 and 6 score 100% because everything the evidence could decide passed — but Section 1
decided only 4 of 13 controls and Section 6 only 7 of 15. Sections 1 and 6 are held at Amber because
coverage below 50% cannot support a Green claim. The overall figure is the unweighted mean of
Sections 1–6; Sections 7 and 8 are reported separately.

## What is working well

| # | Strength | Pillar | Why it matters |
|---|---|---|---|
| 1 | The origin accepts traffic only from the Front Door backend service tag **and** only when it carries this profile's Front Door identifier, with a deny-all default and Kudu inheriting the same restriction. | Security | The service tag alone would admit any tenant's Front Door. Adding the identifier header closes the bypass that most WordPress-behind-WAF deployments leave open. |
| 2 | MySQL accepts Microsoft Entra authentication only — password authentication is disabled server-wide — with TLS required, audit logging on, and the application connecting by managed identity. | Security | There is no database password to steal, leak or rotate, which removes an entire class of WordPress compromise. |
| 3 | Every data service is private: MySQL, Key Vault, Redis, media storage and Azure Monitor all have public access disabled with approved private endpoints and matching private DNS zones. | Security | The Key Vault collection step in this very review was refused for being outside the private path — the control is enforced, not merely configured. |
| 4 | Zone-redundant across the board: three PremiumV3 workers, MySQL HA with a healthy standby in a second zone, zone-redundant Redis and GZRS media storage with versioning and 29-day point-in-time restore. | Reliability | A single availability-zone failure should not take the site down or lose media. |
| 5 | Edge caching is correctly scoped — only `/wp-content/*` and `/wp-includes/*` are cached and compressed, while the catch-all route serving logged-in and administrative responses is deliberately uncached. | Performance | This is the mistake most WordPress CDN configurations make; getting it right prevents personalised or authenticated responses being served from the edge. |

## Key findings and risks

| # | Finding | Control | Pillar | Severity | Business impact | Recommended action |
|---|---|---|---|---|---|---|
| 1 | No Defender for Cloud security contact is configured, so security alerts have no notification destination. | SEC-21 | Security | 4 | Defender plans are paid for and correctly matched to the services, but a high-severity alert on this production workload would sit unread in the portal. | Configure a security contact with a monitored distribution list and confirm delivery with a test alert. |
| 2 | Recovery has never been tested; achieved RTO and RPO are unknown. | REL-10 | Reliability | 4 | Backups, HA and point-in-time restore are all configured, but the business cannot state how long a recovery would take or how much data it would lose. | Run a full restore drill across database, media, secrets and configuration, and publish the measured figures. |
| 3 | No negative test proves the origin refuses traffic that bypasses Front Door, or that WAF blocks are investigable. | SEC-23 | Security | 4 | The strongest security control in the design is unverified, so a regression in it would go unnoticed. | Run a direct-origin request, a WAF block test and a secret-rotation test, and retain the results. |
| 4 | `/wp-admin` has no WAF or network restriction; only login and XML-RPC are rate-limited. | SEC-10 | Security | 3 | The WordPress administration surface is defended only by a password prompt, and administrator compromise leads directly to site control. | Restrict `/wp-admin/*` to approved sources or an authenticated path, exempting required `admin-ajax.php` routes. |
| 5 | WordPress dashboard file editing is not disabled. | SEC-18 | Security | 3 | With `DISALLOW_FILE_EDIT` unset, any administrator compromise escalates to remote code execution on the site. | Set `DISALLOW_FILE_EDIT`, set `WP_DEBUG` explicitly to false, and block XML-RPC unless required. |
| 6 | Recovery windows are inconsistent: media point-in-time restore reaches 29 days against a 35-day database window. | REL-09 | Reliability | 3 | A recovery older than 29 days would restore the database without matching media, producing a broken site. | Align blob restore and soft-delete retention with the database window, or reduce the window to the approved RPO. |
| 7 | No deployment slot exists, so there is no swap-with-preview, warm-up stage or tested rollback path. | OPS-04 | Operations | 3 | Every release lands directly on the live site, and recovery from a bad deployment means redeploying forward rather than swapping back. | Create a staging slot with warm-up and adopt swap with preview. |
| 8 | Azure Monitor Private Link Scope is deployed, but the workspace and Application Insights still accept public ingestion and query. | MON-02 | Operations | 3 | The private-telemetry investment is not enforced, so monitoring data remains reachable over the public internet. | Disable public ingestion and query once every path is confirmed to resolve through the AMPLS. |
| 9 | No alerting on Communication Services send volume or failures. | ACS-05 | Operations | 2 | A compromised sending identity or contact-form abuse would drive cost and reputational damage undetected. | Add a send-volume and failure alert to the existing action group. |

## Remediation priorities

| Priority | Action | Controls | Severity | Effort | Change risk | Cost impact |
|---|---|---|---|---|---|---|
| Do now | Configure a Defender for Cloud security contact and confirm alert delivery. | SEC-21 | 4 | 1 | 1 | 1 |
| Plan | Run a full restore drill and publish measured RTO and RPO. | REL-10, MAN-02 | 4 | 3 | 3 | 1 |
| Plan | Run origin-bypass, WAF-block and secret-rotation tests. | SEC-23, MAN-07 | 4 | 3 | 2 | 1 |
| Schedule | Harden the WordPress administration surface and application settings. | SEC-10, SEC-18 | 3 | 2 | 2 | 1 |
| Schedule | Align media and database recovery windows into one recovery set. | REL-09 | 3 | 1 | 1 | 2 |
| Schedule | Introduce a staging slot with warm-up and swap-with-preview rollback. | OPS-04, OPS-14, REL-07 | 3 | 3 | 2 | 1 |
| Schedule | Enforce private-only Azure Monitor ingestion and query. | MON-02 | 3 | 2 | 2 | 1 |
| Schedule | Define and approve SLO, RTO and RPO, then re-test resilience settings against them. | FND-03 | 3 | 2 | 1 | 1 |
| Backlog | Add email send-volume alerting and a workload budget with anomaly alerts. | ACS-05, CST-02 | 2 | 1 | 1 | 1 |

## Confidence and limitations

| Limitation | Effect on this review |
|---|---|
| No SLO, RTO, RPO or data classification was supplied. | Redundancy, retention and regional-recovery choices could be described but not judged as sufficient or excessive. This affects FND-03, FND-05, REL-08, REL-14 and CST-04. |
| Key Vault key, secret and certificate metadata was refused because the vault is correctly private. | Secret expiry, rotation ownership and expiry alerting could not be verified (SEC-14). The refusal is itself positive evidence that private-only access is enforced. |
| Azure Policy assignments, budgets, Advisor and Defender exemptions are outside this collector's scope. | Nine governance and cost-governance controls could not be decided, including FND-09, FND-10, CST-01, CST-02 and DEF-03 to DEF-06. |
| Autoscale profiles, alert thresholds, action-group receivers and availability-test locations are inventoried by name only. | Scale behaviour and alert routing are evidenced as present but not as correct (REL-06, PRF-05, OPS-09, MON-04). |
| WordPress application internals are not Azure control-plane data. | Plugin inventory, WordPress roles, HTTP response headers and PHP tuning could not be assessed (SEC-19, SEC-20, PRF-10, PRF-11). |
| No live restore, load or security test was performed. | The largest residual risks in this review are unverified rather than failed controls. |

78 controls require manual validation or were not decided by the collected evidence, including all
twelve items in the mandatory manual-validation register. See the detailed report for the full
control-by-control assessment.

## Next steps

| # | Step | Owner | Target |
|---|---|---|---|
| 1 | Configure the Defender for Cloud security contact and verify alert delivery. | Security owner | 2026-01-22 |
| 2 | Define and approve SLO, RTO and RPO with the business owner. | Workload owner | 2026-02-01 |
| 3 | Run the restore drill and the origin-bypass and WAF test set, and record the results. | Platform and security owners | 2026-03-01 |
| 4 | Harden the WordPress administration surface and introduce a staging slot. | Application and engineering owners | 2026-04-01 |
| 5 | Re-run the posture collector and reassess, targeting coverage above 70%. | Workload owner | 2026-05-01 |
