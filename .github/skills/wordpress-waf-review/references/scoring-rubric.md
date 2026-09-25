# Scoring rubric

Deterministic rules so two runs against the same evidence produce the same numbers.

## Section score

Two numbers, always published together. Reporting either one alone is misleading.

```
Decided   = Total − N/A − Not verified
Score %    = Pass / Decided × 100          // of what evidence could decide, how much passed
Coverage % = Decided / (Total − N/A) × 100 // how much of the applicable checklist the evidence decided
```

`Not verified` is excluded from the score denominator so the score measures the configuration, not the collector's reach. Coverage carries the honesty: a 95% score at 40% coverage is a weak result and must be presented as such.

Round both to a whole number. If `Decided` is 0, record the score as `n/a` and coverage as `0%`.

Never state a score without its coverage figure alongside it — in the summary, the detailed report, on a slide, or in conversation with the user.

## RAG banding

| Band | Score % | Meaning |
|---|---|---|
| 🟢 Green | ≥ 90 | Meets the checklist; residual items are documented and accepted. |
| 🟡 Amber | 70–89 | Material gaps; remediation planned and owned. |
| 🔴 Red | < 70 | Gaps that put the stated SLO, data, or compliance position at risk. |

Two mandatory overrides:

- Any open severity-5 finding in the pillar forces 🔴 Red regardless of percentage.
- Coverage below 50% caps the band at 🟡 Amber — too little was proven to claim Green.

## Overall posture

Overall score and overall coverage are the unweighted means of the six pillar values (Sections 1–6). Report Section 7 separately as resource-level depth and Section 8 separately as manual-validation coverage — folding them into the headline number distorts it.

## Finding scores

Every finding carries four independent 1–5 scores. 5 is always "high"; 1 is always "low".

**Severity** — how bad the exposure is if unaddressed:

| Score | Meaning |
|---|---|
| 5 | Direct exposure of data or admin control, or a single point of failure against a stated SLO. Example: origin reachable around the WAF, public MySQL access, no HA where RTO requires it. |
| 4 | Significant weakening of a control or recovery path. Example: backup retention below RPO, missing purge protection, shared-key storage access enabled. |
| 3 | Defence-in-depth gap with a compensating control present. Example: no diagnostic settings on a secondary resource. |
| 2 | Hygiene or cost/efficiency issue with no security or availability impact. |
| 1 | Cosmetic or advisory. |

**Effort** — remediation cost in engineering time and change risk. 1 = a portal or IaC toggle; 3 = a change requiring test and release; 5 = re-architecture, migration, or data movement.

**Risk** — risk *of the remediation itself* (change risk, potential for outage or regression). 1 = no user impact; 5 = requires downtime, data migration, or a cutover.

**Cost** — recurring Azure spend implied by remediating. 1 = no change or a saving; 3 = a modest tier or feature uplift; 5 = a significant SKU or redundancy uplift.

State the four scores plainly. Do not multiply them into a composite index — the four dimensions are for prioritisation conversations, and a single blended number hides the tradeoff.

## Prioritisation

Rank remediation as:

1. **Do now** — severity 4–5 with effort ≤ 2.
2. **Plan** — severity 4–5 with effort ≥ 3.
3. **Schedule** — severity 3.
4. **Backlog** — severity 1–2.

## Which findings reach the CSV

- Every `Fail`.
- Every `Not verified` where the underlying control is severity 4–5 if it turned out to be failing (for example untested restore, unverified origin bypass). Set `Status` to `Not verified` and make the recommendation the verification action, not a fix.
- Not every `Not verified` process control — summarise those as a single coverage row per pillar so the CSV stays actionable.

## Which findings reach the executive summary

- All severity-5 and severity-4 findings.
- The three to five strongest `Pass` results, chosen for business relevance, not count.
- The collection gaps that most limited confidence.

Cap the executive summary's key-findings table at 15 rows. If more qualify, keep the highest severity and point to the detailed report for the remainder.
