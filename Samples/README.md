# Sample evidence and report

This folder demonstrates the input and output of the `wordpress-waf-review` skill.

## Contents

| Path | Purpose |
|---|---|
| `wordpress-posture-20260909-105411-20260909T090305751Z-5f227fba.zip` | Example evidence package created by running `Review/PSScripts/Invoke-CollectWordPressPosture.ps1`. It contains redacted JSON configuration evidence from a deployed WordPress environment. |
| `OutputReport/` | Sanitized example report produced from collector evidence. Real environment identifiers and sensitive metadata have been replaced with fictional values while preserving the report structure and findings format. |

`OutputReport/` contains the four skill deliverables:

- `executive-summary.md`
- `detailed-well-architected-review.md`
- `findings.csv`
- `well-architected-review.pptx`

## Use the sample

The skill needs an extracted evidence directory containing `collection-manifest.json`; do not point it at the ZIP file itself. From the repository root, extract the sample package:

```powershell
Expand-Archive `
  -LiteralPath ".\Samples\wordpress-posture-20260909-105411-20260909T090305751Z-5f227fba.zip" `
  -DestinationPath ".\Samples\Extracted" `
  -Force
```

The archive has one top-level folder, so the evidence directory after extraction is:

```text
Samples/Extracted/wordpress-posture-20260909-105411/
```

Confirm that it contains the manifest:

```powershell
Test-Path ".\Samples\Extracted\wordpress-posture-20260909-105411\collection-manifest.json"
```

The command should return `True`. Then ask GitHub Copilot Chat to run the skill against that extracted directory:

```text
Run the wordpress-waf-review skill using evidence in Samples/Extracted/wordpress-posture-20260909-105411.
Write all reports and the PowerPoint deck to the default output directory.
```

By default, the skill writes the generated files to:

```text
Review/reports/wordpress-posture-20260909-105411-reports/
```

The generated report should be similar in structure and content to `Samples/OutputReport/`. Exact wording, scores, or layout may vary as the skill and templates evolve, but the same four deliverables should be present.

## Notes

- The collector creates the ZIP after gathering the evidence; the review skill consumes the extracted folder.
- The sample lets you exercise report generation without connecting to Azure or running the collector again.
- The dashboard canvas consumes the two Markdown files and `findings.csv`; the PowerPoint deck is a separate presentation output.
- Although collector secrets are redacted, review sample evidence and generated reports before sharing them outside your organization because resource names and configuration details may remain.