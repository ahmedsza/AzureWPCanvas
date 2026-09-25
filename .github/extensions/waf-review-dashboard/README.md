# waf-review-dashboard

A canvas extension that turns a [`wordpress-waf-review`](../../skills/wordpress-waf-review/SKILL.md)
output directory into an interactive Azure Well-Architected scorecard.

The canvas reads the report; it never calls Azure and never re-scores anything.
Whatever the skill wrote is what the dashboard shows.

## Input

The skill normally creates four outputs. The fourth output, `well-architected-review.pptx`, is not a canvas input and is not parsed by the canvas. The canvas consumes only these three source report files:

| File | Used for |
|---|---|
| `executive-summary.md` | Headline posture, pillar scorecard, strengths, key findings, limitations, next steps |
| `detailed-well-architected-review.md` | Scope, resources, all 157 controls, collection gaps, remediation plan |
| `findings.csv` | Severity / effort / change-risk / cost scores behind the findings charts |

Two ways in:

1. **Run the skill first**, then open the canvas on the directory it wrote:
   `open_canvas({ canvasId: "waf-review-dashboard", instanceId: "waf-<rg>", input: { reportDir: "Review/reports/<evidence-folder-name>-reports" } })`
2. **Open an existing results directory** the same way, with an absolute path or
   one relative to the repo root. Omit `reportDir` entirely and the canvas
   discovers report directories in the workspace and loads the most recent; the
   header picker switches between them.

Missing files degrade gracefully — the affected panels show an empty state and a
banner explains what was not found.

## Views

| Tab | Content |
|---|---|
| Overview | Score and coverage rings, pillar radar, KPI cards, top risks, strengths, review context |
| Pillars | 100% stacked status composition per section, score-against-coverage columns, section detail |
| Findings | Severity-against-effort quadrant (bubble size = cost impact), severity histogram, priority donut, filterable findings table |
| Controls | Heatmap of all 157 controls coloured by status, plus a filterable control register |
| Plan & gaps | Prioritised remediation, next steps, resources in scope, collection gaps, scope limitations |

Score and coverage are always shown together, per the skill's scoring rubric — a
high score over thin coverage is a weak result and the UI never hides that.

Clicking a finding bubble, a heatmap square, or a table row opens a detail
drawer with the evidence pointer and recommendation.

## Agent actions

| Action | Purpose |
|---|---|
| `refresh` | Re-read the report files from disk and push to the open panel. Call after re-running the skill. |
| `load_report` | Point the panel at a different report directory. |
| `list_reports` | List report directories discovered in the workspace. |
| `get_scorecard` | Overall posture plus per-section score, coverage and RAG, without reading the markdown. |
| `get_findings` | `findings.csv` rows, filtered by severity, pillar, priority or status. |
| `get_controls` | Control-register rows, filtered by section, status or control ID. |
| `focus` | Drive the panel: switch tab, filter, or open a control's detail drawer. |

## Layout

| Path | Role |
|---|---|
| `extension.mjs` | Canvas declaration, actions, open/close lifecycle |
| `lib/markdown.mjs` | Pipe-table and RFC 4180 CSV readers |
| `lib/report.mjs` | Normalises a report directory into one model |
| `lib/discover.mjs` | Finds report directories in the workspace |
| `lib/server.mjs` | Per-instance loopback HTTP server, JSON state, SSE updates |
| `ui/` | Dashboard shell, theme-aware styles, dependency-free SVG charts |

No runtime dependencies. Charts are hand-rolled SVG and colours come from the
app's canvas theme tokens, so the dashboard follows the app's light/dark theme.

## State

The report directory is the durable identity. `instanceId` names the panel only;
opening the same directory under a different `instanceId` shows identical
content. Nothing is written to disk.
