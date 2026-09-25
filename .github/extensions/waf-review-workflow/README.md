# WAF review workflow canvas

Guided GitHub Copilot app canvas for the end-to-end WordPress Well-Architected review flow.

It now models the workflow as eight explicit states:

1. Validate dependencies.
2. Connect scope: choose subscription, then resource group.
3. Pre-assess: inventory the resource group.
4. Collect data: run `Invoke-CollectWordPressPosture.ps1`.
5. Package data: confirm the collector ZIP.
6. Pre-Assess Phase: extract the ZIP and find `collection-manifest.json`.
7. Assessment Phase: run the `wordpress-waf-review` skill.
8. Display: open the dashboard canvas.

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

## Agent actions

| Action | Purpose |
|---|---|
| `refresh` | Re-scan the workspace and optionally update context values. |
| `get_workflow_state` | Return current phase state, logs, discovered files, and generated commands. |
| `list_subscriptions` | Populate the subscription dropdown. |
| `list_resource_groups` | Populate the resource-group dropdown for a selected subscription. |
| `set_scope` | Save selected subscription, resource group, and mode. |
| `run_phase` | Run one phase by ID. |
| `run_next` | Run the current actionable phase. |
| `run_automatic` | Run automatic phases until scope selection or the assessment boundary. |
| `get_skill_prompt` | Return only the prompt for running `wordpress-waf-review`. |
