# Presentation template

Fixed structure for `well-architected-review.pptx`. Slide order, titles, and data sources are
fixed so decks stay comparable across runs and environments.

## Source-of-truth rule

The deck presents the assessment. It never re-assesses.

| Deck content | Read it from |
|---|---|
| Control statuses, section totals, evidence pointers | `detailed-well-architected-review.md` |
| Severity, effort, risk, cost, priority, recommendations | `findings.csv` |
| Narrative, strengths, business impact, next steps | `executive-summary.md` |

Build the deck only after all three files are written and verified. Never derive a number,
status, or finding directly from the evidence JSON at this stage — a control that is
`Not verified` in the detailed report must never appear as `Fail` on a slide.

## Deck properties

| Property | Value |
|---|---|
| File name | `well-architected-review.pptx`, in the same output directory as the reports |
| Layout | `LAYOUT_WIDE` (13.3" × 7.5") — narrower layouts crowd the control tables |
| Title | `Azure Well-Architected Review — <workload> (<environment>)` |
| Subject | `AzureWordPressChecklist.md · 157 controls` |
| Author | The reviewer name resolved in step 1 of the skill |

## Design system

Apply consistently to every slide.

| Element | Value |
|---|---|
| Primary | `1E2761` navy — title slide, section dividers, table header fills |
| Secondary | `CADCFC` ice blue — banding, callout panels |
| Surface | `FFFFFF` white body slides, `F5F7FA` for card fills |
| Header font | Trebuchet MS |
| Body font | Calibri |
| Slide title | 32–36pt bold, navy on light slides, white on navy slides |
| Section header | 20pt bold |
| Body / table text | 12–14pt (11pt is the floor for dense control tables) |
| Caption / footer | 10pt, `64748B` |
| Margins | 0.5" minimum on all edges, 0.35" between content blocks |

Status and RAG colours are fixed — the same status must never change colour between slides:

| Meaning | Hex |
|---|---|
| Pass / Green | `2E7D32` |
| Fail / Red | `C62828` |
| Amber | `E8A33D` |
| Not verified | `607D8B` |
| N/A | `BDBDBD` |

Visual motif: a 0.18" navy bar down the left edge of every content slide, plus a footer strip
carrying `<workload> · <environment> · <review date>` and the slide number. Do not put an accent
rule under slide titles.

## Slide plan

Fixed order. Slide numbers shift only where a section paginates.

| # | Slide | Group |
|---|---|---|
| 1 | Title and review context | Overview |
| 2 | Overall posture | Overview |
| 3 | Pillar scorecard | Pillars |
| 4 | Control disposition across all 157 controls | Controls |
| 5–10 | One slide per pillar (Foundations, Reliability, Security, Cost, Operations, Performance) | Pillars |
| 11 | Resource-specific controls (Section 7) | Controls |
| 12 | Findings overview | Findings |
| 13+ | Critical and high findings detail | Findings |
| n | Remediation priorities | Plans |
| n+1 | Manual validation register (Section 8) | Gaps |
| n+2 | Collection gaps and confidence | Gaps |
| n+3 | Next steps | Plans |
| Appendix | Full control status list — only when the user asks for it | Controls |

## Slide specifications

### 1. Title and review context

Navy background, white text. Deck title, then a two-column context block: workload, environment,
subscription, resource group, evidence collected (UTC), review date, reviewer, checklist version.
Bottom right: overall score and coverage as `<n>% score · <n>% coverage`, in the RAG colour.

### 2. Overall posture

Four stat callouts across the top (44pt figures, 11pt labels beneath):

`Overall score <n>%` · `Evidence coverage <n>%` · `Critical findings (sev 5) <n>` · `High findings (sev 4) <n>`

Below them, a status strip showing Pass / Fail / N/A / Not verified counts in status colours, then
the executive summary's two-to-three sentence posture statement. If coverage is below 50%, add a
bold line stating the score reflects a partial picture.

Speaker notes: the stated SLO/RTO/RPO and whether the configuration supports it.

### 3. Pillar scorecard

Grouped column chart, two series over the six pillars:

```javascript
slide.addChart(pres.charts.BAR, [
  { name: "Score %",    labels: pillars, values: scores },
  { name: "Coverage %", labels: pillars, values: coverage }
], {
  x: 0.7, y: 1.3, w: 11.9, h: 4.2, barDir: "col",
  chartColors: ["1E2761", "CADCFC"],
  valAxisMaxVal: 100, valGridLine: { color: "E2E8F0", size: 0.5 },
  catGridLine: { style: "none" },
  catAxisLabelColor: "64748B", valAxisLabelColor: "64748B",
  showValue: true, dataLabelPosition: "outEnd", dataLabelColor: "1E293B",
  legendPos: "b", showLegend: true
});
```

Beneath the chart, a caption naming the highest and lowest pillar. Never plot score without
coverage on the same chart.

Sections 7 and 8 are excluded from this chart — they are reported on slides 11 and the manual
register slide, and are not part of the six-pillar mean.

### 4. Control disposition

Horizontal stacked bar, one bar per checklist section (all eight), series Pass / Fail / N/A /
Not verified in the fixed status colours (`barDir: "bar"`, `barGrouping: "stacked"`).

Right-hand panel: totals for the full 157, and one line stating how many controls the collector
could not decide and why that matters.

### 5–10. Pillar slides

One slide per pillar, identical layout:

- Title: `<n>. <Pillar name>`
- Badge, top right: `<score>% score · <coverage>% coverage`, filled in the RAG colour, with the
  band name (`Green` / `Amber` / `Red`). If any severity-5 finding is open in the pillar, or
  coverage is below 50%, the badge shows the overridden band, not the raw percentage band.
- Left column, "Evidence shows": two to four `Pass` observations, stated as configuration facts
  with values (instance counts, TLS version, retention days, SKU).
- Right column, "Gaps": up to three `Fail` rows as `<CONTROL-ID> — <observation>`, each tagged
  with its severity.
- Footer line: `<n> controls not decided by collected evidence`.

Speaker notes: the pillar's counts, and the single recommendation with the highest severity.

### 11. Resource-specific controls

Table of the Section 7 resource groupings actually present in the inventory — App Service, MySQL
Flexible Server, Key Vault, Redis, Front Door and WAF, Network, NAT Gateway, Application Insights
and Log Analytics, Communication Services, Defender for Cloud.

| Resource area | Controls | Pass | Fail | Not verified | Key issue |
|---|---|---|---|---|---|

Omit rows where every control is `N/A` because the resource is absent; state those omissions in
one caption line instead.

### 12. Findings overview

Left: column chart of finding counts by severity 5 → 1, coloured red through grey.

Right: priority quadrant built from four rounded rectangles — `Do now`, `Plan`, `Schedule`,
`Backlog` — each listing its control IDs and a count. Use the priority already assigned in
`findings.csv`; do not recompute it. Cap each box at eight IDs plus `+n more`.

### 13+. Critical and high findings

Every severity-5 finding first, then severity-4, ordered as in `findings.csv`. Four findings per
slide as cards, each card carrying:

`<FindingId> · <ControlId>` — title, then one line of observation, one line of business impact,
one line of recommendation, and a scores strip `Sev <n> · Effort <n> · Risk <n> · Cost <n>`.

Findings with status `Not verified` keep that status on the card and their recommendation is the
verification action, never a fix presented as if the control had failed.

Continuation slides are titled `Critical and high findings (cont.)`.

### n. Remediation priorities

Table, ordered `Do now`, `Plan`, `Schedule`, `Backlog`:

| Priority | Action | Controls | Severity | Effort | Change risk | Cost | Owner | Target |
|---|---|---|---|---|---|---|---|---|

Maximum ten rows per slide. Leave owner and target blank rather than inventing them; state in the
speaker notes that they need to be assigned.

### n+1. Manual validation register

All twelve `MAN-01`–`MAN-12` items with their status. Lead with one line explaining the scoring
treatment: these are `Not verified` until dated manual evidence is supplied, so they reduce
coverage rather than score, and Section 8 is reported separately from the headline number.

| ID | Manual validation | Status | Required evidence | Owner |
|---|---|---|---|---|

### n+2. Collection gaps and confidence

Two tables: collector errors and unsupported resource types, each with the controls they forced to
`Not verified`; and the process or live-test controls outside Section 8 that evidence cannot
decide. Close with the overall coverage figure and what would raise it.

### n+3. Next steps

Numbered steps with owner and target, taken from the executive summary. Final line: the
recommended reassessment date.

### Appendix (on request only)

All 157 controls as paged tables — ID, control, status, pillar. Status cell filled in the status
colour. Use `autoPage: true` with `autoPageRepeatHeader: true` so tables break cleanly.

## Pagination and overflow

- Findings cards: 4 per slide. Priority table: 10 rows. Register and gap tables: 12 rows.
- Continuation slides repeat the title with ` (cont.)` and keep the same column layout.
- Never shrink body text below 11pt to fit content — paginate instead.
- Truncate long recommendation text on the slide to one line and keep the full text in the
  speaker notes.

## Data-integrity rules

- Every score on a slide is accompanied by its coverage figure. No exceptions.
- Deck totals must equal the detailed report totals exactly: 13 / 17 / 24 / 14 / 17 / 15 / 45 / 12 = 157.
- Overall score and coverage are the unweighted means of Sections 1–6 only.
- Every finding on a slide maps to a real `FindingId` in `findings.csv`; every control ID is a
  verbatim checklist ID.
- No raw JSON, no `az` commands, no evidence-directory file paths, no secret, key, connection
  string, or `SECRET_FOUND_REDACTED` value appears in any slide or speaker note.
- Resource names are permitted; credentials and endpoints carrying tokens are not.

## Build procedure

Follow the bundled `pptx` skill's create-from-scratch path (PptxGenJS) and its QA loop.

1. Confirm tooling: Node.js and `pptxgenjs` (`npm install -g pptxgenjs`). If it cannot be
   installed, report that plainly and deliver the three report files — never hand over a partial
   or fabricated deck.
2. Write the generator to a scratch folder outside the report directory (for example
   `$env:TEMP/waf-deck/build-deck.js`), reading the report values into constants at the top of the
   file so they are reviewable in one place. PowerShell has no heredoc — write the script to a file
   rather than piping multi-line content into an interpreter.
3. Run it with the output directory as an argument so the `.pptx` lands beside the reports.
4. Delete the scratch folder once QA passes.

PptxGenJS pitfalls that matter here: hex colours never carry `#`, never build an 8-character hex
for opacity, never reuse an options object between two `addShape` calls, and use `bullet: true`
rather than a unicode bullet character.

## QA checklist

Run all of it. Assume there are problems.

1. `python -m markitdown well-architected-review.pptx` — confirm every slide in the plan is
   present, in order, with no placeholder text.
2. Cross-check the scorecard, disposition, and finding counts against the detailed report and CSV.
3. Render to images and inspect with a subagent for overlap, overflow, low contrast, and
   inconsistent gaps:

   ```bash
   python scripts/office/soffice.py --headless --convert-to pdf well-architected-review.pptx
   pdftoppm -jpeg -r 150 well-architected-review.pdf slide
   ```

4. Grep the extracted text for `SECRET_FOUND_REDACTED`, `sections.`, `.json`, and `az ` — any hit
   is a defect.
5. Fix, then re-verify the affected slides. Do not declare success before one full fix-and-verify
   cycle.
