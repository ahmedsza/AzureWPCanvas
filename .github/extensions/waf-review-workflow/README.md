# WAF review workflow canvas

Guided GitHub Copilot app canvas for the end-to-end WordPress Well-Architected review flow.

Eight required steps plus an optional presentation:

1. Validate dependencies.
2. Connect scope: choose subscription, then resource group.
3. Pre-assess: inventory the resource group.
4. Collect data: run `Invoke-CollectWordPressPosture.ps1`.
5. Package data: confirm the collector ZIP.
6. Pre-Assess Phase: extract the ZIP and find `collection-manifest.json`.
7. Assessment Phase: run `wordpress-waf-review` for the two Markdown reports and CSV only.
8. Display: open the dashboard canvas.
9. **Optional PowerPoint:** build an executive (10–15 slides) or detailed deck from the finished reports.

Progress reaches 8/8 without a deck. Later steps stay disabled until predecessors finish.
Step 7 streams skill activity and independently tracks the three report files; a PPTX is never
required to unlock Step 8. The optional deck step is user-initiated, not part of automatic/next-step
execution. It streams the local generator's output into its own console.

On the introductory screen, create a named fresh run, upload an existing collector ZIP (starting
at Step 6), or reopen a previous run. Logs, scope, and presentation preferences follow the run.

The canvas scans the workspace for:

- `collection-manifest.json` evidence folders.
- Collector `.zip` files.
- Review output folders containing `executive-summary.md`, `detailed-well-architected-review.md`, and `findings.csv`.

The canvas can run local helper scripts for dependency validation, subscription/resource-group discovery, pre-assessment inventory, data collection, package confirmation, and ZIP extraction. The assessment itself remains a Copilot skill step; the canvas prepares and displays the exact skill prompt.

Two modes are available:

- **Manual approvals** — user runs one phase at a time.
- **Automatic after scope** — after subscription and resource group are selected, executable phases run in sequence until the assessment skill boundary.

## Open input

```json
{
  "resourceGroup": "rg-wordpress-prod",
  "subscription": "00000000-0000-0000-0000-000000000000",
  "mode": "manual",
  "evidenceDir": "Evidence/wordpress-posture-20260925-091500",
  "reportDir": "Review/reports/wordpress-posture-20260925-091500-reports",
  "environment": "production",
  "rto": "4 hours",
  "rpo": "1 hour"
}
```

All properties are optional. Relative paths resolve from the workspace root.
Presentation preferences are `deckMode: "executive" | "detailed"` (default `"executive"`) and
`renderChanged: boolean` (default `false`).

## Optional PowerPoint

Install pinned dependencies once from the repository root:
`npm ci --prefix .\Review\Presentation`. Select Step 9 and choose the mode, then **Generate
PowerPoint**. The existing reports are never reassessed. A successful build publishes
`well-architected-review.pptx` beside them and shows slide count, elapsed time, and cache status.
Changing mode replaces that deck after validation.

Unchanged reports/template/dependencies reuse a verified cached build. Optional **Render changed
slides** needs PowerPoint on Windows and exports only changed slides for inspection. Plain
generation needs neither PowerPoint nor Python. Build failures leave the reports/dashboard
available and preserve the prior deck. See [generator documentation](../../../Review/Presentation/README.md).

## Agent actions

| Action | Purpose |
|---|---|
| `refresh` | Re-scan the workspace and optionally update context values. |
| `get_workflow_state` | Return current phase state, logs, discovered files, and generated commands. |
| `list_subscriptions` | Populate the subscription dropdown. |
| `list_resource_groups` | Populate the resource-group dropdown for a selected subscription. |
| `set_scope` | Save selected subscription, resource group, and mode. |
| `run_phase` | Run one phase by ID; `presentation` accepts `deckMode` and `renderChanged`. |
| `run_next` | Run the current actionable required phase (never PowerPoint). |
| `run_automatic` | Run automatic phases until scope selection or the assessment boundary. |
| `get_skill_prompt` | Return only the prompt for running `wordpress-waf-review`. |

## Regression tests

From the repository root:
`node --test .github\extensions\waf-review-workflow\tests\workflow.test.mjs`.
Tests use temporary fixtures, never Azure or the user's saved runs.
