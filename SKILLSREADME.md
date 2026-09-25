# WordPress Well-Architected Review Skill

This repository includes the `wordpress-waf-review` skill for GitHub Copilot. It converts the redacted JSON evidence produced by `Invoke-CollectWordPressPosture.ps1` into a scored Azure Well-Architected Framework review and PowerPoint presentation for WordPress on Azure App Service.

The skill definition is in [.github/skills/wordpress-waf-review/SKILL.md](.github/skills/wordpress-waf-review/SKILL.md).

## Quickstart

The fastest way to try the skill is with the sanitized collector ZIP included in this repository. This assumes the user has already extracted the data from the powershell ZIP to a directory



### 1. Run the skill in Copilot Chat

Open this repository in VS Code, start GitHub Copilot Chat, and enter:

```text
Run the wordpress-waf-review skill using evidence in <DIRECTORY WHERE THE EXTRACTED EVIDENCE IS LOCATED>
Write all reports and the PowerPoint deck to the default output directory.
```

The skill reads the evidence, assesses all 157 checklist controls, and writes the result to an output directory



The output directory contains `executive-summary.md`, `detailed-well-architected-review.md`, `findings.csv`, and `well-architected-review.pptx`. 

### 2. Open the interactive dashboard (only applies to GitHub Copilot App)

After report generation, ask Copilot Chat:

```text
Open the WAF review dashboard for the output directory containing the generated reports.
```

The `waf-review-dashboard` canvas visualizes the scorecard, pillars, findings, controls, remediation plan, and collection gaps in the GitHub Copilot app.

### Sample
Check out the sample directory in [Samples/OutputReport](Samples/OutputReport/) to see the expected output structure and content.

## When to use it

Use the skill to:

- Review a WordPress on Azure App Service workload.
- Score collected evidence against the repository's WordPress checklist.
- Generate an executive summary, a complete control-by-control assessment, an importable findings backlog, and a PowerPoint review deck.

Do not use it to deploy or modify Azure resources, manage WordPress content, author Bicep, or review non-WordPress workloads.

## Prerequisites

To review existing evidence, provide a directory containing `collection-manifest.json`. Evidence can be collected with:

```powershell
cd Review
./PSScripts/Invoke-CollectWordPressPosture.ps1 `
  -ResourceGroup <resource-group-name> `
  -Subscription <subscription-id> `
  -OutputDirectory <evidence-directory>
```

Collecting fresh evidence requires:

- PowerShell 7 or later.
- Azure CLI authenticated with `az login`.
- At least Azure `Reader`; `Monitoring Reader` and `Security Reader` improve coverage.
- The Azure resource group and subscription ID confirmed before collection.

PowerPoint generation requires Node.js and `pptxgenjs`. The skill follows the bundled PowerPoint tooling and QA workflow; if the deck tooling cannot be installed, it reports that limitation and still delivers the three written report files rather than a partial deck.

The collector is read-only and redacts secret values.

## How to invoke the skill

Open this repository in VS Code and ask GitHub Copilot Chat to run a WordPress WAF review. The skill is selected from the intent of the request; naming it explicitly is useful but not required.

### Review existing evidence

```text
Run the wordpress-waf-review skill using evidence in Evidence/<collection-folder>.
Write the reports and PowerPoint deck to the default output directory.
This is a production environment with an RTO of 4 hours and an RPO of 1 hour.
```

### Collect evidence and then review

```text
Assess the WordPress Azure posture for resource group <resource-group> in subscription <subscription-id>.
Collect evidence first, then write the WAF reports and PowerPoint deck.
```

### Review a collector ZIP file

```text
Generate the WordPress Well-Architected review from Evidence/<collector-output>.zip.
Expand it and write the reports and PowerPoint deck.
```

Include any known workload context in the prompt, especially:

- Production or non-production environment.
- Service-level objectives.
- Recovery time objective (RTO) and recovery point objective (RPO).
- Data classification.
- Accepted risks or compensating controls.

Unknown context does not block the review; the reports record it as unknown rather than making assumptions.

## Inputs and defaults

| Input | Requirement or default |
|---|---|
| Evidence | Directory containing `collection-manifest.json`, or a collector ZIP file. If omitted, provide a resource group and subscription for collection. |
| Checklist | Defaults to the skill's bundled [AzureWordPressChecklist.md](.github/skills/wordpress-waf-review/references/AzureWordPressChecklist.md). |
| Output directory | Defaults to `Review/reports/<evidence-folder-name>-reports/`; reruns overwrite that folder rather than creating a numbered variant. |
| Workload context | Optional, but improves assessment quality and prioritization. |

## Outputs

The skill creates these four files in the selected output directory unless the user declines slides or PowerPoint tooling is unavailable. `well-architected-review.pptx` is the fourth output:

| File | Purpose |
|---|---|
| `executive-summary.md` | Leadership scorecard, evidence coverage, strengths, top risks, and prioritized remediation. |
| `detailed-well-architected-review.md` | Assessment of all 157 checklist controls with status, evidence pointers, and recommendations. |
| `findings.csv` | One row for every failure or material evidence gap, scored for severity, effort, risk, and cost. |
| `well-architected-review.pptx` | Executive readout with overview, pillar, controls, findings, remediation, manual-validation, and collection-gap slides. |

The deck is generated last from the verified Markdown and CSV reports; it presents the assessment and never re-scores the evidence. The final Copilot response reports all output paths, overall score and evidence coverage, critical and high finding counts, and the three most important collection gaps.

## Assessment behavior

Each applicable checklist control receives one status: `Pass`, `Fail`, `N/A`, or `Not verified`. A pass or failure requires a concrete JSON evidence pointer. Missing or failed collection sections are marked `Not verified`, and controls requiring manual validation remain `Not verified` unless dated manual evidence is supplied.

Scores are always presented with evidence coverage. The reports never reproduce secrets, keys, connection strings, or redacted secret values.

## Related documentation

- [Review/README.md](Review/README.md) explains evidence collection and collector output.
- [.github/skills/wordpress-waf-review/references/AzureWordPressChecklist.md](.github/skills/wordpress-waf-review/references/AzureWordPressChecklist.md) is the bundled assessment checklist.
- [.github/skills/wordpress-waf-review/references/presentation-template.md](.github/skills/wordpress-waf-review/references/presentation-template.md) defines the deck structure and QA requirements.
- [Review/genreport.md](Review/genreport.md) contains the original report-generation prompt reference.