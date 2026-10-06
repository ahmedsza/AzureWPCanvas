# How to run a WordPress Well-Architected review

This guide takes you from a fresh clone to an evidence-based review of WordPress on Azure App Service, using the **GitHub Copilot app**, the included workflow canvas, the review skill, and the dashboard canvas.

The toolkit reads an existing Azure environment. It does **not** deploy WordPress, change Azure resources, fix findings, or certify compliance. It can also assess evidence collected by a customer on another machine.

The instructions below use **Windows and PowerShell 7**, with commands run from the repository root unless stated otherwise.

## Contents

- [1. Prerequisites and access](#1-prerequisites-and-access)
- [2. Clone the repository](#2-clone-the-repository)
- [3. Open the project in GitHub Copilot app](#3-open-the-project-in-github-copilot-app)
- [4. Choose how to start the review](#4-choose-how-to-start-the-review)
- [5. Follow the workflow](#5-follow-the-workflow)
- [6. Optional manual validation](#6-optional-manual-validation)
- [7. Run the assessment skill](#7-run-the-assessment-skill)
- [8. Explore and interpret the dashboard](#8-explore-and-interpret-the-dashboard)
- [9. Optional PowerPoint](#9-optional-powerpoint)
- [10. Collect evidence separately or without the canvas](#10-collect-evidence-separately-or-without-the-canvas)
- [11. Understand the artifacts](#11-understand-the-artifacts)
- [12. Resume, repeat, archive, and share](#12-resume-repeat-archive-and-share)
- [13. Troubleshooting](#13-troubleshooting)

## 1. Prerequisites and access

### Software

| Prerequisite | When needed | How to check or obtain it |
|---|---|---|
| Git | Cloning and updating this repository | Run `git --version`. Install from [Git for Windows](https://git-scm.com/downloads/win) or your organization's software catalog. |
| GitHub Copilot app with project extension and canvas support | The guided visual workflow and dashboard | Install through the app's official distribution or your organization's approved channel. Sign in with an account authorized to use Copilot. Availability and features may depend on your organization and app version. |
| PowerShell 7 or later | Fresh collection and the workflow's PowerShell helpers, including ZIP preparation | Run `pwsh --version`. See [Installing PowerShell on Windows](https://learn.microsoft.com/powershell/scripting/install/installing-powershell-on-windows). Windows PowerShell 5.1 (`powershell.exe`) is not the same as PowerShell 7 (`pwsh`). |
| Azure CLI | Fresh Azure discovery and collection | Run `az version`. See [Install Azure CLI on Windows](https://learn.microsoft.com/cli/azure/install-azure-cli-windows). |
| Node.js 20 or later and npm | Optional report-to-PowerPoint generator | Run `node --version` and `npm --version`. Use an organization-approved supported release from [Node.js](https://nodejs.org/). |
| Desktop Microsoft PowerPoint on Windows | Optional slide-image rendering, not ordinary deck generation | Only needed if you select **Render changed slides** or use `--render-changed`. |

You do not need a local WordPress installation, a database password, Python, or desktop PowerPoint to generate the three written review reports. The canvas extensions have no separate npm dependency installation step; they run through the Copilot app's extension runtime. The optional presentation generator has its own dependencies.

After installing command-line tools, restart the Copilot app so its local processes inherit the updated `PATH`.

**Use a local project/session for this guide.** The process running the helpers must have access to the Azure CLI login, local evidence, and any required private-network endpoints. A remote or cloud session does not automatically inherit credentials or files from your laptop.

### Azure access

For fresh collection, prepare:

- The target Azure tenant, subscription ID, and resource-group name.
- An identity with approved **Reader** access to the target scope for most configuration reads.
- **Monitoring Reader**, **Security Reader**, and permission to list Key Vault object metadata where approved and needed for additional coverage.
- Network access to relevant endpoints. Azure RBAC alone does not provide connectivity to private endpoints or bypass a Key Vault firewall.

Ask the Azure owner to grant only the permissions needed. Do not grant Owner or Contributor just to suppress collection errors. The collector lists Key Vault metadata; it does not retrieve secret values.

Authenticate in a PowerShell 7 terminal on the same machine that will run the workflow:

```powershell
az login
az account list --output table
az account set --subscription "<subscription-id>"
az account show --output table
```

If your organization uses multiple tenants, use `az login --tenant "<tenant-id>"` and complete the required browser/MFA sign-in. Confirm the subscription again before collecting. GitHub sign-in and Azure sign-in are separate.

When reviewing an already extracted evidence package, the assessment and dashboard do not need a new Azure login or access to the customer's subscription. The **fresh-run** dependency check does check Azure CLI login; use the existing-ZIP route rather than starting an unnecessary fresh collection.

### Information and data handling

Gather the environment classification (production or non-production), business owner, availability objectives, recovery time objective (RTO), recovery point objective (RPO), data classification, and accepted risks where known. Unknown values can remain unknown; do not guess them.

Confirm that your organization permits the selected evidence to be processed through GitHub Copilot under its configured data policies. Local collectors and loopback canvases do not make an AI-assisted review an entirely offline process.

Redaction is a safeguard, not permission to distribute a package unchecked. Evidence still describes resource names, topology, access controls, and security posture. Do not enter passwords, tokens, connection strings, or sensitive personal information in prompts or manual answers.

## 2. Clone the repository

Choose a local working directory you can write to:

```powershell
New-Item -ItemType Directory -Path C:\Work -Force | Out-Null
Set-Location C:\Work
git clone https://github.com/ahmedsza/AzureWPCanvas.git
Set-Location .\AzureWPCanvas
```

If GitHub requests authentication, use your approved GitHub sign-in method; do not put a token into the clone URL. Access to the repository and access to Copilot are separate requirements.

Check that the clone contains the actual toolkit:

```powershell
Test-Path .\Review\PSScripts\Invoke-CollectWordPressPosture.ps1
Test-Path .\.github\skills\wordpress-waf-review\SKILL.md
Test-Path .\.github\extensions\waf-review-workflow\extension.mjs
Test-Path .\.github\extensions\waf-review-dashboard\extension.mjs
```

All four results should be `True`. The `.github` folder may be hidden by your file browser; it must remain in the clone. There is no need to copy the skill or extensions into a global directory.

For a fresh collection, verify prerequisites:

```powershell
pwsh -NoProfile -File .\Review\PSScripts\Test-WafReviewPrerequisites.ps1
```

Inspect the JSON's `ok` and `checks` fields. A successful process exit alone does not mean all checks passed. This helper checks PowerShell, Azure CLI, Azure login, and the collector file; it does not prove every service-level API call will be authorized.

## 3. Open the project in GitHub Copilot app

1. Open **GitHub Copilot app** and sign in.
2. Use the app's project-add/open flow to add an **existing local folder or repository**. Select `C:\Work\AzureWPCanvas`, not its `Review` subfolder. Exact menu labels vary by app version.
3. Start a **local project session** for that repository. If offered a choice, use the existing checkout for this walkthrough so file paths match the commands above.
4. Review any workspace-trust or extension approvals. These project extensions can run local commands on your behalf; approve only after reviewing and trusting the repository.
5. In the project chat, ask Copilot to confirm that `wordpress-waf-review`, `waf-review-workflow`, and `waf-review-dashboard` are available.

Example prompt:

```text
Check that this project has the wordpress-waf-review skill and the
waf-review-workflow and waf-review-dashboard canvas extensions.
Then open the WAF review workflow canvas. Do not start collection yet.
```

The expected result is a side panel showing the workflow launcher or a previously selected run. If the extensions are not available, ask Copilot to list and inspect loaded extensions and reload the repository extensions. Reopen the local project/session if needed. If your app build does not support these canvases, the collector and skill can still be used separately, but the visual workflow requires a compatible app.

**A canvas tool call is not a shell command.** Normally a natural-language request is sufficient. For a precise agent instruction, ask Copilot to use:

```text
open_canvas({
  canvasId: "waf-review-workflow",
  instanceId: "waf-workflow",
  input: {}
})
```

Do not paste this into PowerShell. The app supplies the canvas tools to Copilot.

## 4. Choose how to start the review

From the workflow's start screen, choose one of the following.

### Option A: Collect fresh evidence

1. Choose **Create new run** and give it a meaningful name, such as `Production WordPress - October review`.
2. Select **Brand new run**.
3. Decide whether to select **Include optional manual validation**. Leave it off for a script-evidence-only assessment.
4. Create the run.
5. Use **Manual approvals** for your first run so you can inspect each result before continuing.

### Option B: Use a collector ZIP supplied by a customer

1. Create a named run.
2. Select **Collector ZIP will be provided**.
3. Choose whether to include optional manual validation, then create the run.
4. Use the ZIP selection/upload control to choose the archive produced by this repository's collector.
5. Continue at **Step 6**, which extracts and validates the package.

This route avoids rerunning collection. The workflow stages a local copy of the ZIP for the run; it is not an Azure upload. Review the package's source, collection date, and data-handling approval first.

### Option C: Reopen an existing run

Choose **Open existing run**, then select the saved run. Scope, phase state, logs, and artifact paths are associated with that run. Confirm you have selected the intended environment before using **Run again**.

A run name is not a filesystem backup. Keep its evidence and report files available; reopening a run cannot reconstruct files that were deleted or moved.

## 5. Follow the workflow

Select a stage card to inspect its action, prerequisites, paths, and **Step console**. **Activity log** provides the wider run history. Later required stages remain gated until preceding stages are complete.

| Stage shown in the canvas | What you do | What to check before continuing |
|---|---|---|
| **1. Validate dependencies** | Run the local prerequisite check. | PowerShell 7, Azure CLI, Azure login, and collector availability pass. |
| **2. Connect scope** | Select the subscription, then the resource group. | The displayed scope is the intended workload, not another tenant or environment. |
| **3. Pre-assess** | Run the resource inventory. | Supported resources and unexpected/missing components match your intended scope. This is inventory, not the final WAF assessment. |
| **4. Collect data** | Run the read-only evidence collector. | The console completes and an evidence directory and manifest are produced. Inspect warnings and failed calls. |
| **5. Package data** | Confirm the collector's ZIP artifact. | The archive belongs to this collection, not an older run. Collection already creates the ZIP; this stage confirms it. |
| **6. Pre-Assess Phase** | Extract the ZIP and locate the manifest. | The selected evidence directory contains `collection-manifest.json` and the referenced JSON files. Despite its label, this step prepares evidence; it does not score controls. |
| **6M. Manual validation, optional** | Save dated supporting answers or explicitly skip. | You are using answers for this run, and know whether they will be included. |
| **7. Assessment Phase** | Start the Copilot skill from the prepared prompt. | All three reports are written for the selected evidence directory. |
| **8. Display** | Open the report dashboard. | The dashboard points to this run's finished report directory. |
| **9. PowerPoint, optional** | Generate an executive or detailed readout. | The deck is built from the existing reports, not a second assessment. |

There are **eight required stages**. Manual validation (6M) and PowerPoint (9) are additional optional stages. A review can reach **8/8 complete without a presentation**.

**Automatic after scope** runs eligible helper stages in sequence after you select the scope. It stops at the enabled manual checkpoint and at the assessment skill boundary; it never automatically generates PowerPoint. You still need to review prompts, authorize actions where requested, and supply any missing context.

Collection success does not mean every evidence section succeeded. Read both the manifest's errors and the per-file `sections.<name>.success`/error fields. Unsupported resource types, missing permissions, stopped services, and blocked private endpoints can leave gaps even when an archive was created successfully.

## 6. Optional manual validation

Enable this at run creation, or use **Add manual questions** on an existing run. It is useful for operational and business evidence a configuration script cannot establish, such as tested recovery objectives, restore exercises, incident procedures, ownership, or accepted risks.

1. Open the manual-validation stage after extraction.
2. Review the suggested questions. They cover manual/process and mixed-evidence controls across the checklist, not just the manual register.
3. Use **All checklist controls** if you need to address an additional control. Before assessment, the shortlist is a set of candidate questions; it does not prove all other controls have enough evidence. After reports exist, `Not verified` controls are included.
4. For each answer, record the claimed outcome, explanation, respondent or approver, evidence date, and supporting references.
5. Select **Save answer**. Unsaved form edits are not assessment evidence.
6. Select **Continue with saved answers** to freeze the revision the skill will use, or **Skip manual validation** to exclude manual answers from that assessment.

Example supporting evidence: a dated restore-test record, its result, and the approving workload owner. A checkbox saying "backups tested" is not equivalent to a verified successful restore.

Saved responses and revision history persist per run. Skipping retains saved answers but excludes them from the assessment. The skill receives an immutable snapshot and evaluates it as **user-provided manual evidence**, not script-verified fact or automatic proof of compliance.

If you edit answers after a review, its reports and downstream completion state become stale. Regenerate **all three reports**, refresh the dashboard, and regenerate any presentation. Do not combine an old summary with a new findings file.

## 7. Run the assessment skill

In **Assessment Phase**, start the prepared skill request. The workflow queues the review request to Copilot and tracks activity and the three report files. The skill, not the canvas itself, performs the assessment.

If you need to start it from chat, use the exact prompt shown by the workflow. This preserves the evidence path, output directory, workload context, and any selected manual snapshot.

For a review that deliberately excludes manual validation:

```text
Run the wordpress-waf-review skill using evidence in
Evidence\Extracted\<archive-name>\<collection-folder>.
Write only executive-summary.md, detailed-well-architected-review.md,
and findings.csv to the default output directory.
Manual validation is not included; do not reuse answers from another run
or an earlier report. Do not generate PowerPoint.
```

Replace placeholders with the path shown by Step 6. Some ZIP layouts have a nested collection folder: use the directory actually containing `collection-manifest.json`, not merely its extraction parent.

If manual validation is enabled, **do not use the example above unchanged**. Use the workflow's prompt with the exact snapshot path and revision.

The default report directory is:

```text
Review\reports\<evidence-folder-name>-reports
```

The folder name comes from the extracted evidence directory, not necessarily the run name or ZIP filename. Rerunning against the same evidence normally overwrites the same report directory. Request a different output directory explicitly if you need to retain separate report versions.

Wait for all three reports. If the phase appears to wait, inspect Copilot chat for pending permission requests, questions, or an error; do not submit duplicate reviews while the first is still running.

## 8. Explore and interpret the dashboard

Use **Display**, or ask Copilot:

```text
Open the WAF review dashboard for
Review\reports\<evidence-folder-name>-reports.
```

For an explicit canvas instruction, JSON-style paths need escaped backslashes:

```text
open_canvas({
  canvasId: "waf-review-dashboard",
  instanceId: "waf-review",
  input: { reportDir: "Review\\reports\\<evidence-folder-name>-reports" }
})
```

Always check the report directory. If none is supplied, the dashboard can discover and select the most recent report, which may belong to another review.

| View | Use it to |
|---|---|
| **Overview** | Review headline posture, evidence coverage, strengths, top risks, and context. |
| **Pillars** | Compare score, coverage, and status composition across the report sections. |
| **Controls** | Explore the 157-control matrix, filter by status or ID, and open a control's evidence and recommendation. |
| **Findings** | Filter the backlog, compare severity and effort, and inspect priority and status. |
| **Plan & gaps** | Review remediation planning, resources in scope, collection failures, and scope limitations. |

Interpret results carefully:

- **Pass** and **Fail** require sufficient evidence; **Not verified** means the evidence is missing or insufficient, not that the control has failed.
- **N/A** requires an applicability reason, not just missing data.
- Always consider **coverage alongside score**. A high score over a small decided subset does not establish strong overall posture.
- A high-priority verification finding is not automatically a confirmed high-severity vulnerability.
- The checklist's eight sections include Foundations, resource-specific controls, and a manual register. They are not eight official Azure WAF pillars.
- If a dashboard number differs from the written report, inspect the source reports before quoting it. In particular, treat an unavailable (`n/a`) headline as unavailable; do not substitute a percentage calculated from only the sections that have scores.

The dashboard consumes the two Markdown files and CSV. It does not collect Azure data or require a PPTX. Refresh it after regenerating reports. Use the findings to agree owners and next actions; remediation is a separate, authorized activity.

## 9. Optional PowerPoint

Skip this entire section if you only need the review and dashboard.

Install the pinned presentation dependencies once, or again when the dependency lockfile changes:

```powershell
npm ci --prefix .\Review\Presentation
```

In Step 9, choose **Executive** or **Detailed**, then generate the presentation. Executive mode targets a concise 10-15-slide readout; detailed mode expands the findings.

Equivalent command:

```powershell
node .\Review\Presentation\generate.mjs `
  --report-dir ".\Review\reports\<evidence-folder-name>-reports" `
  --mode executive
```

Use `--mode detailed` for an expanded deck. The output is `well-architected-review.pptx` beside the three reports. Successful regeneration, including changing mode, replaces that deck; preserve a copy first if you need both versions.

The generator validates the existing reports and caches unchanged builds. It does not run the assessment again. A failed build preserves the previous deck and does not prevent using the reports/dashboard.

**Render changed slides** / `--render-changed` is optional and requires working desktop PowerPoint on Windows. Ordinary generation requires neither PowerPoint nor Python. If rendering fails, omit that option to generate the deck without slide-image exports.

## 10. Collect evidence separately or without the canvas

This is the customer-run collection route: a customer with Azure access runs the scripts, reviews the redacted package, and provides an approved ZIP to the reviewer. The reviewer can then use Option B without receiving the customer's Azure credentials.

From the repository root in PowerShell 7:

```powershell
$subscription = "<subscription-id>"
$resourceGroup = "<resource-group-name>"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$output = Join-Path (Get-Location).Path "Evidence\wordpress-posture-$stamp"

$result = & .\Review\PSScripts\Invoke-CollectWordPressPosture.ps1 `
  -ResourceGroup $resourceGroup `
  -Subscription $subscription `
  -OutputDirectory $output

$result.outputDirectory
$result.manifest
$result.zipFile
```

Keep the **whole collector package**, not just the manifest. The manifest indexes the per-resource JSON documents used by the skill.

If extracting manually, choose a new destination to avoid mixing collections:

```powershell
$zip = "C:\ApprovedEvidence\<collector-archive>.zip"
$destination = ".\Evidence\Extracted\customer-review-001"
Expand-Archive -LiteralPath $zip -DestinationPath $destination
Get-ChildItem -LiteralPath $destination -Filter collection-manifest.json -Recurse
```

Use the manifest's containing directory in the review prompt from Section 7. The collector and skill can be used without the workflow canvas; the app canvases add guided execution and interactive exploration.

## 11. Understand the artifacts

### Repository components: what executes the review

| Artifact | Location | Purpose |
|---|---|---|
| Collector entry point and helpers | `Review\PSScripts\` | PowerShell scripts that inventory resources and collect redacted, read-only Azure evidence. Normally run the entry point rather than each per-resource collector. |
| Review skill | `.github\skills\wordpress-waf-review\SKILL.md` | Instructions Copilot follows to assess evidence and generate consistent reports. |
| Checklist and assessment references | `.github\skills\wordpress-waf-review\references\` | The 157-control checklist, evidence map, scoring rules, report templates, and presentation guidance. These define assessment behavior, not a customer's configuration. |
| Workflow canvas extension | `.github\extensions\waf-review-workflow\` | Run selection, prerequisites, scope, executable stages, logs, optional manual questions, and assessment/report progress. |
| Dashboard canvas extension | `.github\extensions\waf-review-dashboard\` | Interactive views of the finished reports. |
| Presentation generator | `Review\Presentation\` | Local report parser, deck template, generator, dependency lockfile, and optional rendering helper. |

### Run artifacts: what is created locally

Exact paths appear in the workflow. The following are the normal locations; collection timestamps, archive names, and run IDs vary.

| Artifact | Typical path/name | What it contains and how to use it |
|---|---|---|
| Pre-assessment inventory | `Review\pre-assessment\pre-assessment-<resource-group>.json` | Discovery output used to review scope before full collection. This is not a final assessment and can be replaced by later inventory runs for that group. |
| Collected evidence directory | `Evidence\wordpress-posture-<resource-group>-<timestamp>\` for workflow collection | Source JSON configuration evidence. A manually invoked collector uses the directory you specify. |
| Collection manifest | `collection-manifest.json` in the evidence directory | Collection date and scope, discovered resource types, output-file index, unsupported resources, and top-level errors. Start here when investigating evidence. |
| Resource-group inventory | `resource-group-inventory.json` | Full resource inventory plus resource-group information, locks, and role assignments. |
| Per-resource evidence | JSON files referenced by `manifest.outputs` | Command, success state, exit/error information, and returned data for service-specific sections. Retain failed sections: they explain evidence gaps. |
| Collector ZIP | Unique `.zip` beside the collection directory | Portable copy of the evidence package. Its name includes a timestamp and uniqueness suffix. Step 5 confirms this archive. |
| Uploaded ZIP copy | `Evidence\Uploaded\<run-id>\` | Run-specific staged copy when you supply an existing archive. |
| Extracted evidence | `Evidence\Extracted\<archive-name>\...` | Unpacked package used for assessment. The manifest may sit in a nested directory. |
| Run registry | `waf-review-workflow-runs.json` in the configured workspace root; repository root in a normal single-root local checkout | Named runs, current selection, phase state, logs, outputs, and preferences. It references files rather than embedding the entire evidence package. |
| Saved manual answers | `Review\manual-validation\<run-id>\answers.json` | Responses, provenance, revision number, and edit history. Save via the UI; do not edit it while a run is active. |
| Manual assessment snapshot | `Review\manual-validation\<run-id>\assessment-r<revision>-<unique-id>.json` | Immutable input selected for a particular assessment, including whether manual validation was skipped. Keep it for audit traceability. |
| Executive summary | `Review\reports\<evidence-folder-name>-reports\executive-summary.md` | Leadership scorecard, coverage, strengths, top risks, and priorities. |
| Detailed assessment | Same report directory: `detailed-well-architected-review.md` | Full control register, evidence pointers, observations, recommendations, scope, and collection gaps. |
| Findings backlog | Same report directory: `findings.csv` | Failed or materially unverified controls with prioritization dimensions. Suitable for review and import into a tracking process; it does not create work items automatically. |
| Optional readout | Same report directory: `well-architected-review.pptx` | Presentation derived from the completed reports. Not an input to the dashboard. |
| Presentation cache | Same report directory: `.presentation-cache\` | Build manifests and, when rendering is requested, slide images/render metadata. Internal generator state, not a replacement for the reports or evidence. |

The dashboard panel and its loopback URL are **views**, not the durable review artifact. Local server ports can change when the app restarts. Reopen the canvas using the report directory rather than bookmarking a port from a screenshot.

## 12. Resume, repeat, archive, and share

**Resume:** Open the same local project and select the saved run. Confirm its input and output paths. Reopening a run does not automatically refresh Azure evidence.

**Repeat:** For a new point-in-time review, create a fresh run and collect new evidence. For revised manual answers, freeze a new snapshot and regenerate reports. An earlier `Pass` does not prove the current state.

**Archive:** Keep the original ZIP or complete evidence directory, the three reports, the relevant manual-answer history and assessment snapshot, and any requested deck. Preserve the run registry if you need to resume the workflow, and retain supporting documents referenced by manual answers under your organization's retention policy. Moving files can invalidate saved paths.

**Share:** Give leadership the approved summary/deck, and engineers the detailed report/findings. Transfer raw evidence and manual records only through approved channels. Review exports for confidential names, topology, and security details even when secrets were redacted.

**Do not assume all generated files are ignored by Git.** The current `.gitignore` excludes `Evidence\` and `Review\manual-validation\`, but does not generally exclude reports, pre-assessment files, or the run registry. Inspect `git status --short` before staging changes. Do not use `git add .` indiscriminately after a customer review.

The author has reported reducing a review from five days to two hours in personal use. This is not an independent benchmark or a guaranteed completion time. Collection coverage, approval delays, manual validation, environment size, and review depth all affect duration.

## 13. Troubleshooting

| Symptom | What to check |
|---|---|
| Skill or canvases are missing | Open the repository root as a local project, confirm `.github` exists, and check app support and extension approvals. Ask Copilot to inspect/reload extensions and report any extension log errors. Do not copy extensions into unrelated folders as a workaround. |
| `pwsh` or `az` is not found | Install the required tool, restart the terminal and Copilot app, and rerun the prerequisite helper. |
| Azure login fails or subscriptions are absent | Complete `az login` in the correct tenant on the execution machine. Check organization sign-in policies and approved role assignments. |
| Collection has access-denied or private-endpoint errors | Inspect the exact failing section. Ask the resource owner to confirm read permissions and network connectivity. Do not weaken security settings to make collection succeed. |
| ZIP extraction cannot find the manifest | Verify it is a complete collector ZIP, not a ZIP of only the reports. Inspect nested folders and select the manifest's containing directory. |
| Later stages are disabled | Resolve the earlier required stage. For enabled manual validation, explicitly continue with saved answers or skip it. |
| Assessment appears stuck | Inspect Copilot chat and phase logs for a pending approval, question, or failure. Confirm the expected report directory and all three filenames. Ask for workflow refresh after the skill completes. |
| Answers appear stale or a save conflicts | Refresh the questionnaire for the selected run. Another panel may have saved a newer revision. Save your intended answer against the latest state rather than overwriting the JSON manually. |
| Dashboard displays another environment or old results | Open it with an explicit `reportDir`, check its header selection, and refresh after all reports are regenerated. |
| Many controls are `Not verified` | Inspect per-section collection failures, unsupported resources, and manual-evidence needs. These are limitations to resolve, not evidence that the workload passed or failed. |
| Deck generation reports missing packages | Check Node.js is at least version 20, then run `npm ci --prefix .\Review\Presentation`. |
| Deck generation reports invalid tables or totals | Ensure the three files are a matching report set in the bundled template format. Ask Copilot to check the parser error and regenerate/correct the reports from evidence; do not invent totals to satisfy validation. |
| PowerPoint cannot render or a deck is locked | Close that deck in desktop PowerPoint before replacing it. For rendering failures, inspect Office dialogs or omit `--render-changed`; ordinary generation does not need Office. |
| A presentation generation lock is reported | Wait for the active generator to finish. Do not delete its lock while a build is running. |

For implementation details, see [the collector guide](Review/README.md), [skill usage](SKILLSREADME.md), [workflow canvas documentation](.github/extensions/waf-review-workflow/README.md), and [dashboard documentation](.github/extensions/waf-review-dashboard/README.md).
