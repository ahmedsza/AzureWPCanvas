---
name: wordpress-waf-review
description: 'Generate an Azure Well-Architected Framework review for a WordPress on Azure App Service workload from PowerShell collector evidence. USE FOR: "run a WAF review", "assess my WordPress Azure posture", "generate the well-architected report", "score this environment against the WordPress checklist", "build the WAF review deck / slides / presentation", analysing Invoke-CollectWordPressPosture.ps1 / collection-manifest.json output, producing an executive summary plus a detailed report. Produces executive-summary.md (scorecard and key-findings tables), detailed-well-architected-review.md (control-by-control assessment across Reliability, Security, Cost Optimization, Operational Excellence and Performance Efficiency), findings.csv, and well-architected-review.pptx (overview, pillar, controls, findings and plan/gap slides). DO NOT USE FOR: deploying or changing Azure resources, WordPress content/plugin/theme work, Bicep authoring, or reviewing non-WordPress workloads.'
argument-hint: 'Collector output directory (or a resource group name to collect first), plus the report output directory'
---

# WordPress on Azure — Well-Architected Review Report

Turns JSON evidence collected from a deployed environment into a scored Azure Well-Architected review against [references/AzureWordPressChecklist.md](references/AzureWordPressChecklist.md), the 157-control checklist bundled with this skill.

Evidence normally comes from [Invoke-CollectWordPressPosture.ps1](../../../Review/PSScripts/Invoke-CollectWordPressPosture.ps1) in this repo, but any folder holding a `collection-manifest.json` in the same shape works.

## Outputs

Always produce all four, in the run's output directory (`Review/reports/<evidence-folder-name>-reports/`):

| File | Audience | Content |
|---|---|---|
| `executive-summary.md` | Business and engineering leadership | Scorecard table, top strengths, top risks, prioritised remediation. Tables everywhere; no raw JSON. |
| `detailed-well-architected-review.md` | Workload owners and engineers | Control-by-control assessment for every applicable checklist ID, with evidence pointers and recommendations. |
| `findings.csv` | Backlog / tracking import | One row per `Fail` or material `Not verified`, scored 1–5 for severity, effort, risk and cost. |
| `well-architected-review.pptx` | Review readout and steering audiences | Overview, pillar, controls, findings and plan/gap slides rendered from the three files above. |

The deck is a presentation of the assessment, never a second assessment. Build it last, from the
written reports. Skip it only if the user says they do not want slides.

## Procedure

### 1. Resolve inputs

Establish these before doing anything else. Ask the user only for what you cannot determine:

- **Evidence directory** — a folder containing `collection-manifest.json`. If the user supplies a `.zip` produced by the collector, expand it first and use the expanded folder.
- **Checklist** — always `references/AzureWordPressChecklist.md`, bundled with this skill. Use another only if the user names one explicitly.
- **Output directory** — `Review/reports/<evidence-folder-name>-reports/`, relative to the repo root. `<evidence-folder-name>` is the leaf folder name of the evidence directory, so evidence in `Evidence/wordpress-posture-20260831-083519/` writes to `Review/reports/wordpress-posture-20260831-083519-reports/`. Create the folder if it does not exist. For a `.zip`, take the name from the expanded folder, not the archive. Re-running against the same evidence overwrites that folder in place — never create a `-2` variant. Use a different path only when the user names one explicitly.
- **Context** — environment (prod/non-prod), stated SLO/RTO/RPO, data classification, and known accepted risks. If unknown, say so in the report rather than assuming.

### 2. Collect evidence if none exists

Only when the user has not supplied an evidence directory. The collector is read-only but calls Azure, so confirm the resource group and subscription first.

```powershell
cd <repo>/Review
$result = ./PSScripts/Invoke-CollectWordPressPosture.ps1 -ResourceGroup <resource-group> -Subscription <subscription-id> -OutputDirectory <evidence-dir>
$result.outputDirectory
```

Requires PowerShell 7, Azure CLI, and `az login`. `Reader` covers most evidence; `Monitoring Reader` and `Security Reader` improve coverage. If the run fails on prerequisites, stop and report — do not fabricate evidence.

The collector defaults to a `wordpress-posture-<yyyyMMdd-HHmmss>` folder. Take the leaf name of the returned `outputDirectory` and apply the same `-reports` rule, so a fresh collection into `wordpress-posture-20260909-141020` reports into `Review/reports/wordpress-posture-20260909-141020-reports/`.

### 3. Establish scope from the manifest

Read `collection-manifest.json` first, then `resource-group-inventory.json`.

- `discovery.resourceTypes` and `outputs[]` define what is in scope and which file holds each resource's evidence.
- `unsupportedResources[]` are inventoried but uncollected — list them in the detailed report's scope-limitations section.
- `errors[]` are collector failures — every control that depended on them becomes `Not verified`, not `Fail`.

Then read each evidence file referenced by `outputs[].outputFile`. Use [evidence-map.md](./references/evidence-map.md) for file naming, section keys, and the JSON paths that decide each control.

### 4. Assess every applicable control

Work through the checklist section by section (1 Foundations, 2 Reliability, 3 Security, 4 Cost, 5 Operational Excellence, 6 Performance, 7 Resource-specific, 8 Manual register). Assign exactly one status per control.

| Status | Assign when |
|---|---|
| `Pass` | A specific JSON value proves the control is met. Cite file and property path. |
| `Fail` | A specific JSON value proves the control is not met. Cite file and property path. |
| `N/A` | The resource type or scenario is absent from the inventory. State why. |
| `Not verified` | Evidence is missing, the section returned `success: false`, or the control needs a manual test. |

**Evidence rules — these prevent an unusable report:**

- Never record `Pass` or `Fail` without a concrete evidence pointer such as `appservice-<name>.json → sections.config.data.minTlsVersion = "1.2"`.
- `sections.<name>.success: false` means the call failed. Record `Not verified` and capture `sections.<name>.error` in the collection-gaps appendix.
- `SECRET_FOUND_REDACTED` is the collector's redaction marker. It proves a property exists, never that a secret is weak, exposed, or absent.
- An empty array is evidence of absence (for example `sections.accessRestrictions.data.ipSecurityRestrictions` with only `Allow All`); a missing section is not.
- Section 8 (`MAN-01`–`MAN-12`) is `Not verified` by default. Only mark otherwise when the user supplies dated manual evidence.
- Never infer configuration from resource names, tags, or SKU names alone.
- Do not invent control IDs. Use the checklist's IDs verbatim.

### 5. Score

Apply [scoring-rubric.md](./references/scoring-rubric.md) to derive per-section scores, coverage, pillar RAG status, and the 1–5 severity, effort, risk and cost values for each finding.

Score is `Pass / (Total − N/A − Not verified)` and coverage is `Decided / (Total − N/A)`. Never quote a score without its coverage — a high score over thin evidence is the most damaging output this skill can produce.

### 6. Write the reports

Follow the skeletons in [report-templates.md](./references/report-templates.md) exactly — heading order, table columns, and CSV header row are fixed so reports stay comparable across runs and environments.

The detailed report lists every one of the 157 controls, including passes. That full audit trail is the point of the document; do not collapse passing rows into summaries.

Write in this order so the summary is derived from the assessment, not the other way round:

1. `detailed-well-architected-review.md` — the full control-by-control assessment.
2. `findings.csv` — rows extracted from the detailed report's `Fail` and material `Not verified` rows.
3. `executive-summary.md` — rolled up from the detailed report and the CSV.

### 7. Build the presentation deck

Only after the three files above are written. Follow [presentation-template.md](./references/presentation-template.md)
for the fixed slide order and the bundled `pptx` skill for the PptxGenJS build and QA loop.

Read statuses from the detailed report, scores and priorities from `findings.csv`, and the
narrative from the executive summary. Never re-derive a status from the evidence JSON here — a
control that is `Not verified` in the report must not appear as `Fail` on a slide.

If Node.js or `pptxgenjs` cannot be installed, say so and deliver the three report files. Do not
hand over a partial deck.

### 8. Verify before handing over

Check all of the following and fix anything that fails:

- Every checklist ID appears exactly once in the detailed report, whatever its status.
- Section totals match the checklist's Section 9 totals (13 / 17 / 24 / 14 / 17 / 15 / 45 / 12 = 157).
- Every `Pass` and `Fail` has an evidence pointer; no pointer references a file absent from the evidence directory.
- Every `Fail` has a matching `findings.csv` row, and every CSV row maps to a real control ID.
- Scores and coverage in `executive-summary.md` equal those in the detailed report.
- The executive summary names both strengths and risks, and contains no raw JSON, no unresolved placeholders, and no `az` command output.
- Every slide in the deck's fixed plan is present and in order, and its scores, counts, and finding IDs match the reports exactly.
- No score appears anywhere — report, summary, or slide — without its coverage figure.
- The deck renders without layout defects, and its extracted text contains no evidence file paths or `az` output.
- No secret, key, connection string, or `SECRET_FOUND_REDACTED` value is reproduced in any output file.

Then report to the user: the four file paths, the overall score **and coverage**, the counts of critical and high findings, and the top three collection gaps that limited the review.

### 9. Offer the visual dashboard

The [waf-review-dashboard canvas](../../extensions/waf-review-dashboard/README.md) renders the two
Markdown reports and the CSV as an interactive scorecard — pillar radar, status composition,
severity-against-effort quadrant, and a heatmap of all 157 controls. Offer it once the reports are
written:

```
open_canvas({
  canvasId: "waf-review-dashboard",
  instanceId: "waf-<resource-group>",
  input: { reportDir: "Review/reports/<evidence-folder-name>-reports" }
})
```

It also opens against any directory that already holds a previous run's output, so the user can
review or compare earlier assessments without re-collecting evidence.

## Writing style

- Be a principal Azure architect reviewing someone else's workload: direct, specific, and evidence-led.
- State the observed configuration, then the risk, then the recommendation. Never a recommendation without an observation.
- Quantify where the evidence allows (instance counts, retention days, TLS versions, SKU names, rule counts).
- Prefer "not verified by this collection" over "appears to be" — hedging with confident phrasing is the failure mode to avoid.
- Link Microsoft guidance from the checklist's "Microsoft guidance used" section when recommending a change.

## Reference files

| File | Load when |
|---|---|
| [evidence-map.md](./references/evidence-map.md) | Mapping collector JSON to checklist controls, or locating a specific property. |
| [scoring-rubric.md](./references/scoring-rubric.md) | Assigning status, section scores, RAG bands, or 1–5 finding scores. |
| [report-templates.md](./references/report-templates.md) | Writing the two Markdown reports or the CSV. |
| [presentation-template.md](./references/presentation-template.md) | Building `well-architected-review.pptx` — slide order, design system, chart specs, QA. |
