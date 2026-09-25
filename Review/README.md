# WordPress on App Service Review Toolkit (v4)

This folder collects redacted configuration evidence for a WordPress workload hosted on Azure Linux App Service, then uses that evidence to drive a manual or Copilot-assisted Azure Well-Architected review, with emphasis on Security and Reliability.

The collector accepts one resource group, inventories every resource in it, and then captures service-specific evidence for the WordPress topology deployed by the Azure WordPress Bicep sample: App Service Plan, App Service and slots, MySQL Flexible Server, Key Vault, Redis, NAT Gateway, Azure Front Door/WAF, Storage, Azure Communication Services, Application Insights, Log Analytics, and supporting network resources.

## Contents

```
PSScripts/
  Invoke-CollectWordPressPosture.ps1   # Entry point: run this to collect evidence
  Common-AzureCollector.ps1            # Shared helpers (az CLI wrapper, redaction, document/manifest helpers)
  Get-*.ps1                            # One collector per resource type, invoked automatically by the entry point
reviewdocs/
  AzureWordPressChecklist.md           # Canonical WAF review checklist for this workload (start here)
genreport.md                           # Original report-generation prompt, superseded by the wordpress-waf-review skill
```

[reviewdocs/AzureWordPressChecklist.md](reviewdocs/AzureWordPressChecklist.md) is the single, definitive checklist for this workload. It consolidates and supersedes three earlier checklists (`wordpresschecklist.md`, `checklist.md`, and `WAF-WordPress-AppService-Checklist.md`) that are no longer kept in this folder; the checklist's own cross-references to those files are historical.

## Prerequisites

- PowerShell 7 is recommended.
- Azure CLI must be installed and authenticated with `az login`.
- `Reader` is sufficient for much configuration evidence. Use `Monitoring Reader`, `Security Reader`, and permissions to read Key Vault object metadata when the environment permits it.

## Run

From the `Review` folder:

```powershell
./PSScripts/Invoke-CollectWordPressPosture.ps1 -ResourceGroup <resource-group-name> -OutputDirectory <output-directory>
```

Use a specific subscription or output directory when required:

```powershell
./PSScripts/Invoke-CollectWordPressPosture.ps1 `
  -ResourceGroup <resource-group-name> `
  -Subscription <subscription-id> `
  -OutputDirectory C:\Reports\wordpress-posture
```

## Output

Each resource has its own JSON document. A section records the Azure CLI command, success state, exit code, error, and returned payload. `collection-manifest.json` indexes output files and identifies resources that were inventoried but have no dedicated collector. `resource-group-inventory.json` contains the complete RG inventory, its locks, and resource-group role assignments.

After collection and manifest creation complete, the collector compresses the output directory into a uniquely named ZIP archive beside that directory. The archive name uses the output directory name, a UTC timestamp, and a GUID fragment, for example `wordpress-posture-20260826-120000-20260826T121008636Z-6e1f1f1a.zip`.

The returned object includes `outputDirectory`, `manifest`, `zipFile`, and `discoveredResources`. Capture it to retrieve the archive path:

```powershell
$result = ./PSScripts/Invoke-CollectWordPressPosture.ps1 -ResourceGroup <resource-group-name>
$result.zipFile
```

Sensitive property names and values, including passwords, connection strings, account keys, SAS values, and instrumentation keys, are replaced with `SECRET_FOUND_REDACTED`. The collection intentionally lists Key Vault secret metadata but never reads secret values.

## Assessment Evidence

Security evidence includes public/private network exposure, App Service access restrictions and authentication, managed identities, RBAC, Key Vault access and networking, TLS settings, storage public access and shared-key configuration, Front Door custom domains and WAF policies, MySQL firewall/private access, diagnostic settings, and Defender for Cloud plans and recommendations.

Reliability evidence includes App Service Plan SKU and application placement, slots, App Service configuration and VNet integration, MySQL high availability/backup configuration, Redis configuration, Storage retention/lifecycle configuration, NAT Gateway subnet association, Front Door routing/origins, and Application Insights/Log Analytics availability telemetry.

The evidence model follows the Microsoft cloud security benchmark's feature-driven Azure baselines: network security, logging and threat detection, identity and access management, data protection, secure configuration, and data recovery. Refer to the [Azure security baselines overview](https://learn.microsoft.com/en-us/security/benchmark/azure/security-baselines-overview) during assessment interpretation.

## Limits

The collector preserves failed optional calls as evidence because Azure CLI extensions, resource-provider API versions, and the caller's RBAC permissions vary. Azure CLI output is point-in-time configuration evidence; it does not replace live availability testing, application vulnerability scanning, backup restore testing, WAF attack simulation, or an Azure Policy compliance review.

There is no automated test suite for the collectors in this folder; validate a run by inspecting `collection-manifest.json` for unexpected entries under `errors` or `unsupportedResources`.

## Generate a report from the evidence

Once a collection run completes, use the `wordpress-waf-review` skill in VS Code Chat to turn the collector JSON and [reviewdocs/AzureWordPressChecklist.md](reviewdocs/AzureWordPressChecklist.md) into a scored Well-Architected review:

```
/wordpress-waf-review <path-to-collector-output-directory>
```

Give it a resource group instead of a directory and it runs the collector first. By default it writes four files to `Review/reports/<evidence-folder-name>-reports/`; `well-architected-review.pptx` is the fourth output:

| File | Purpose |
|---|---|
| `executive-summary.md` | Pillar scorecard, key findings (good and bad), prioritised remediation |
| `detailed-well-architected-review.md` | All 157 checklist controls with status, evidence pointer, and recommendation |
| `findings.csv` | One row per finding, scored 1-5 for severity, effort, change risk, and cost |
| `well-architected-review.pptx` | Review presentation with overview, pillar, controls, findings, remediation, and gap slides |

The PowerPoint deck is generated last from the verified Markdown and CSV files. If the user declines slides or Node.js/`pptxgenjs` is unavailable, the skill reports that limitation and delivers the three written reports without a partial deck.

A control is marked `Pass` or `Fail` only where collected evidence proves the outcome; anything the collector cannot decide is reported as `Not verified` and reflected in a separate coverage figure. Skill definition: [.github/skills/wordpress-waf-review/SKILL.md](../.github/skills/wordpress-waf-review/SKILL.md).
