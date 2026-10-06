# WordPress Well-Architected Review Skill

This repository includes the `wordpress-waf-review` skill for GitHub Copilot. It converts redacted collector evidence into a scored Azure Well-Architected Framework review for WordPress on Azure App Service. PowerPoint is a separate, optional output.

The skill definition is in [.github/skills/wordpress-waf-review/SKILL.md](.github/skills/wordpress-waf-review/SKILL.md).

## Quickstart

Run the skill against an existing collector output directory that contains `collection-manifest.json`. If you do not already have evidence, collect it first with `Review/PSScripts/Invoke-CollectWordPressPosture.ps1`.

### 1. Run the skill in Copilot Chat

Open this repository in VS Code, start GitHub Copilot Chat, and enter:

```text
Run the wordpress-waf-review skill using evidence in <DIRECTORY WHERE THE EXTRACTED EVIDENCE IS LOCATED>
Write the three reports to the default output directory.
```

The skill reads the evidence, assesses all 157 checklist controls, and writes the result to `Review/reports/<evidence-folder-name>-reports/` unless you request another output directory.

The output directory contains `executive-summary.md`, `detailed-well-architected-review.md`, and `findings.csv`. The dashboard is ready immediately; request PowerPoint separately if needed.

### 2. Open the interactive dashboard (only applies to GitHub Copilot App)

To see the full process visually before or during the review, open the workflow canvas:

```text
Open the WAF review workflow canvas for this resource group and subscription.
```

After report generation, ask Copilot Chat:

```text
Open the WAF review dashboard for the output directory containing the generated reports.
```

The workflow canvas has eight required steps through report generation and dashboard display, plus an optional ninth PowerPoint step. Named runs can start with fresh collection or an uploaded ZIP; previous runs can be reopened. Automatic execution never starts PowerPoint. The dashboard visualizes score, coverage, pillars, findings, controls, remediation, and collection gaps.

## When to use it

Use the skill to:

- Review a WordPress on Azure App Service workload.
- Score collected evidence against the repository's WordPress checklist.
- Generate an executive summary, a full control-by-control assessment, and an importable findings backlog; optionally create a PowerPoint readout.

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

Optional PowerPoint generation requires Node.js and local dependencies installed once with `npm ci --prefix .\Review\Presentation`. The reusable generator builds executive decks (10–15 slides) by default, or detailed decks on request, and caches unchanged builds. Plain generation needs neither PowerPoint nor Python; optional changed-slide rendering requires Windows PowerPoint. Missing deck tooling never blocks the three reports or dashboard.

The collector is read-only and redacts secret values.

## How to invoke the skill

Open this repository in VS Code and ask GitHub Copilot Chat to run a WordPress WAF review. The skill is selected from the intent of the request; naming it explicitly is useful but not required.

### Review existing evidence

```text
Run the wordpress-waf-review skill using evidence in Evidence/<collection-folder>.
Write the three reports to the default output directory.
This is a production environment with an RTO of 4 hours and an RPO of 1 hour.
```

### Collect evidence and then review

```text
Assess the WordPress Azure posture for resource group <resource-group> in subscription <subscription-id>.
Collect evidence first, then write the three WAF reports.
```

### Review a collector ZIP file

```text
Generate the WordPress Well-Architected review from Evidence/<collector-output>.zip.
Expand it and write the three reports.
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
| Manual validation | Optional run-specific snapshot supplied by the workflow. Dated supporting evidence is evaluated alongside collected JSON; claimed outcomes alone do not change a control's status. |
| PowerPoint | Opt-in only; executive mode by default, detailed mode on request. |

## Outputs

The skill creates three reports by default. The fourth file is optional:

| File | Purpose |
|---|---|
| `executive-summary.md` | Leadership scorecard, evidence coverage, strengths, top risks, and prioritized remediation. |
| `detailed-well-architected-review.md` | Assessment of all 157 checklist controls with status, evidence pointers, and recommendations. |
| `findings.csv` | One row for every failure or material evidence gap, scored for severity, effort, risk, and cost. |
| `well-architected-review.pptx` (optional) | Executive or detailed readout built from existing reports, without rerunning the assessment. |

The optional deck uses verified Markdown and CSV reports; it never re-scores evidence. Select Step 9 or explicitly ask for a deck after the review. See [Presentation/README.md](Review/Presentation/README.md) for CLI usage, caching, validation, and changed-slide rendering. The final review response reports generated paths, score with coverage, critical/high finding counts, and key collection gaps.

## Assessment behavior

Each applicable checklist control receives one status: `Pass`, `Fail`, `N/A`, or `Not verified`. A pass or failure requires a concrete JSON evidence pointer. Missing or failed collection sections are marked `Not verified`, and controls requiring manual validation remain `Not verified` unless dated manual evidence is supplied.

Scores are always presented with evidence coverage. The reports never reproduce secrets, keys, connection strings, or redacted secret values.

## Related documentation

- [Review/README.md](Review/README.md) explains evidence collection and collector output.
- [.github/skills/wordpress-waf-review/references/AzureWordPressChecklist.md](.github/skills/wordpress-waf-review/references/AzureWordPressChecklist.md) is the bundled assessment checklist.
- [.github/skills/wordpress-waf-review/references/presentation-template.md](.github/skills/wordpress-waf-review/references/presentation-template.md) defines the deck structure and QA requirements.
- [.github/extensions/waf-review-workflow/README.md](.github/extensions/waf-review-workflow/README.md) explains the guided workflow canvas.
- [.github/extensions/waf-review-dashboard/README.md](.github/extensions/waf-review-dashboard/README.md) explains the interactive dashboard canvas.