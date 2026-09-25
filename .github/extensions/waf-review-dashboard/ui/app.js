import { columns, donut, esc, legend, pairedBars, quadrant, radar, RAG_COLOR, ring, SEVERITY_COLOR, stackedBars, STATUS_COLOR } from "/charts.js";

const TABS = [
    { id: "overview", label: "Overview" },
    { id: "pillars", label: "Pillars" },
    { id: "findings", label: "Findings" },
    { id: "controls", label: "Controls" },
    { id: "plan", label: "Plan & gaps" },
];

const STATUSES = ["Pass", "Fail", "N/A", "Not verified"];
const PRIORITIES = ["Do now", "Plan", "Schedule", "Backlog"];

const state = {
    snapshot: null,
    tab: "overview",
    findings: { severity: new Set(), priority: new Set(), pillar: "", search: "" },
    controls: { status: new Set(), section: "", search: "" },
    lastFocusAt: 0,
};

const $ = (selector) => document.querySelector(selector);
const view = $("#view");

const statusClass = (status) => ({ Pass: "Pass", Fail: "Fail", "N/A": "na", "Not verified": "nv" })[status] ?? "nv";
const pill = (text, className) => `<span class="pill ${className}">${esc(text)}</span>`;
const statusPill = (status) => pill(status, statusClass(status));
const sevBadge = (severity) =>
    `<span class="sev" style="background:${SEVERITY_COLOR[severity] ?? "var(--na)"}">${severity || "-"}</span>`;

function card(title, body, { note = "", className = "" } = {}) {
    return `<section class="card ${className}">
        <header><h2>${esc(title)}</h2>${note ? `<p>${esc(note)}</p>` : ""}</header>
        ${body}
    </section>`;
}

function kpi(label, value, sub, color) {
    return `<section class="card kpi">
        <div class="label">${esc(label)}</div>
        <div class="value" ${color ? `style="color:${color}"` : ""}>${esc(value)}</div>
        ${sub ? `<div class="sub">${esc(sub)}</div>` : ""}
    </section>`;
}

function table(headers, rows, { clickable = "" } = {}) {
    if (rows.length === 0) return `<p class="muted">Nothing to show.</p>`;
    return `<div class="table-wrap"><table>
        <thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join("")}</tr></thead>
        <tbody>${rows
            .map(
                (row) =>
                    `<tr ${row.key ? `class="clickable" data-${clickable}="${esc(row.key)}"` : ""}>${row.cells
                        .map((cell) => `<td${cell.numeric ? ' class="num"' : ""}>${cell.html}</td>`)
                        .join("")}</tr>`,
            )
            .join("")}</tbody>
    </table></div>`;
}

const cell = (html, numeric = false) => ({ html, numeric });
const text = (value, numeric = false) => cell(esc(value ?? ""), numeric);

/* ------------------------------------------------------------------ views */

function renderOverview(report) {
    const pillars = report.sections.filter((section) => section.pillar);
    const posture = report.posture;

    const kpis = [
        kpi(
            "Overall score",
            posture.score === null ? "n/a" : `${posture.score}%`,
            `${posture.rag ?? "—"} · mean of the six pillars`,
            RAG_COLOR[posture.rag] ?? "var(--ink)",
        ),
        kpi(
            "Evidence coverage",
            posture.coverage === null ? "n/a" : `${posture.coverage}%`,
            posture.coverage !== null && posture.coverage < 50 ? "Below 50% — partial picture" : "of applicable controls",
            "var(--accent)",
        ),
        kpi("Passing controls", posture.pass, `of ${posture.totalControls} assessed`, "var(--pass)"),
        kpi("Failing controls", posture.fail, `${posture.notVerified} not verified · ${posture.na} n/a`, "var(--fail)"),
        kpi("Critical findings", posture.critical, "severity 5", "var(--fail)"),
        kpi("High findings", posture.high, "severity 4", SEVERITY_COLOR[4]),
    ].join("");

    const radarCard = card(
        "Pillar scorecard",
        `<div class="chart">${radar(
            pillars.map((section) => ({
                label: section.short,
                score: section.score,
                coverage: section.coverage,
                status: section.status,
            })),
        )}</div>
        ${legend([
            { label: "Score (pass of decided)", color: "var(--accent)" },
            { label: "Coverage (decided of applicable)", color: "var(--accent-muted)" },
        ])}`,
        { note: "Score and coverage, read together" },
    );

    const ringsCard = card(
        "Headline",
        `<div class="grid grid-2" style="gap:8px">
            <div class="chart">${ring(posture.score, {
                sub: "score",
                color: RAG_COLOR[posture.rag] ?? "var(--accent)",
                caption: "Overall score",
            })}</div>
            <div class="chart">${ring(posture.coverage, { sub: "coverage", color: "var(--accent)", caption: "Evidence coverage" })}</div>
        </div>
        <p class="narrative muted" style="margin-top:10px">${esc(posture.narrative)}</p>`,
    );

    const strengths = report.strengths.length
        ? card(
              "What is working well",
              table(
                  ["Strength", "Pillar", "Why it matters"],
                  report.strengths.map((item) => ({ cells: [text(item.strength), text(item.pillar), text(item.why)] })),
              ),
          )
        : "";

    const topFindings = [...report.findings].sort((a, b) => b.severity - a.severity || a.effort - b.effort).slice(0, 8);
    const findingsCard = card(
        "Top risks",
        table(
            ["Sev", "Control", "Finding", "Priority"],
            topFindings.map((finding) => ({
                key: finding.findingId,
                cells: [
                    cell(sevBadge(finding.severity), true),
                    text(finding.controlId, true),
                    text(finding.title),
                    text(finding.priority, true),
                ],
            })),
            { clickable: "finding" },
        ),
        { note: "Click a row for detail" },
    );

    const meta = report.meta;
    const context = card(
        "Review context",
        `<dl class="drawer-dl" style="display:grid;grid-template-columns:150px 1fr;gap:6px 12px;font-size:12px;margin:0">
            ${[
                ["Workload", meta.workload],
                ["Environment", meta.environment],
                ["Resource group", meta.resourceGroup],
                ["Subscription", meta.subscription],
                ["Evidence collected", meta.evidenceCollected],
                ["Review date", meta.reviewDate],
                ["Stated SLO / RTO / RPO", meta.slo],
                ["Data classification", meta.dataClassification],
                ["Checklist", meta.checklist],
            ]
                .filter(([, value]) => value)
                .map(([key, value]) => `<dt class="muted">${esc(key)}</dt><dd style="margin:0">${esc(value)}</dd>`)
                .join("")}
        </dl>`,
    );

    return `<div class="grid grid-kpi">${kpis}</div>
        <div class="grid grid-2">${radarCard}${ringsCard}</div>
        <div class="grid grid-2">${findingsCard}${strengths || context}</div>
        ${strengths ? `<div class="grid grid-2">${context}${renderLimitationsCard(report)}</div>` : renderLimitationsCard(report)}`;
}

function renderLimitationsCard(report) {
    if (report.limitations.length === 0) return "";
    return card(
        "Confidence and limitations",
        `<ul class="plain">${report.limitations
            .map((item) => `<li><strong>${esc(item.limitation)}</strong><br /><span class="muted">${esc(item.effect)}</span></li>`)
            .join("")}</ul>`,
    );
}

function renderPillars(report) {
    const rows = report.sections;

    const composition = card(
        "Control status by section",
        `<div class="chart">${stackedBars(
            rows.map((section) => ({
                label: `${section.n}. ${section.short}`,
                segments: STATUSES.map((status) => ({
                    label: status,
                    value: { Pass: section.pass, Fail: section.fail, "N/A": section.na, "Not verified": section.notVerified }[status],
                    color: STATUS_COLOR[status],
                })),
            })),
        )}</div>
        ${legend(STATUSES.map((status) => ({ label: status, color: STATUS_COLOR[status] })))}`,
        { note: "Share of each section's controls" },
    );

    const scores = card(
        "Score against coverage",
        `<div class="chart">${pairedBars(
            rows.map((section) => ({
                label: `${section.n}. ${section.short}`,
                short: section.short,
                score: section.score,
                coverage: section.coverage,
                status: section.status,
            })),
        )}</div>
        ${legend([
            { label: "Score", color: "var(--rag-amber)" },
            { label: "Coverage", color: "var(--accent)" },
        ])}`,
        { note: "A high score over thin coverage is a weak result" },
    );

    const detail = card(
        "Section detail",
        table(
            ["Section", "Total", "Pass", "Fail", "N/A", "Not verified", "Score", "Coverage", "Status"],
            rows.map((section) => ({
                key: String(section.n),
                cells: [
                    text(`${section.n}. ${section.label}`),
                    text(section.total, true),
                    text(section.pass, true),
                    text(section.fail, true),
                    text(section.na, true),
                    text(section.notVerified, true),
                    cell(section.score === null ? "n/a" : `${section.score}%`, true),
                    cell(section.coverage === null ? "n/a" : `${section.coverage}%`, true),
                    cell(pill(section.status ?? "—", section.status ?? "na"), true),
                ],
            })),
            { clickable: "section" },
        ),
        { note: "Click a row to filter the control register" },
    );

    return `<div class="grid grid-2">${composition}${scores}</div>${detail}`;
}

function filteredFindings(report) {
    const filters = state.findings;
    const needle = filters.search.trim().toLowerCase();
    return report.findings
        .filter((finding) => (filters.severity.size ? filters.severity.has(finding.severity) : true))
        .filter((finding) => (filters.priority.size ? filters.priority.has(finding.priority) : true))
        .filter((finding) => (filters.pillar ? finding.pillar === filters.pillar : true))
        .filter((finding) =>
            needle
                ? `${finding.controlId} ${finding.title} ${finding.summary} ${finding.resource} ${finding.recommendation}`
                      .toLowerCase()
                      .includes(needle)
                : true,
        )
        .sort((a, b) => b.severity - a.severity || a.effort - b.effort || a.controlId.localeCompare(b.controlId));
}

function renderFindings(report) {
    if (report.findings.length === 0) {
        return `<div class="empty">No findings.csv rows were found in this report directory.</div>`;
    }

    const matches = filteredFindings(report);
    const pillars = [...new Set(report.findings.map((finding) => finding.pillar))].filter(Boolean).sort();

    const severityChart = card(
        "Severity distribution",
        `<div class="chart">${columns(
            [5, 4, 3, 2, 1].map((severity) => ({
                label: `Sev ${severity}`,
                value: report.findings.filter((finding) => finding.severity === severity).length,
                color: SEVERITY_COLOR[severity],
            })),
        )}</div>`,
        { note: `${report.findings.length} findings` },
    );

    const priorityChart = card(
        "Remediation priority",
        `<div class="chart">${donut(
            PRIORITIES.map((priority, index) => ({
                label: priority,
                value: report.findings.filter((finding) => finding.priority === priority).length,
                color: [SEVERITY_COLOR[5], SEVERITY_COLOR[4], SEVERITY_COLOR[3], "var(--na)"][index],
            })),
        )}</div>
        ${legend(
            PRIORITIES.map((priority, index) => ({
                label: priority,
                color: [SEVERITY_COLOR[5], SEVERITY_COLOR[4], SEVERITY_COLOR[3], "var(--na)"][index],
            })),
        )}`,
    );

    const quadrantCard = card(
        "Severity against effort",
        `<div class="chart" id="quadrant">${quadrant(matches)}</div>
        <p class="muted" style="margin:8px 0 0;font-size:12px">Bubble size is cost impact. Top-left is the do-now corner.</p>`,
        { note: `${matches.length} shown` },
    );

    const filters = `<div class="filters">
        ${[5, 4, 3, 2, 1]
            .map(
                (severity) =>
                    `<button class="chip" data-filter="severity" data-value="${severity}" aria-pressed="${state.findings.severity.has(
                        severity,
                    )}">Sev ${severity}</button>`,
            )
            .join("")}
        ${PRIORITIES.map(
            (priority) =>
                `<button class="chip" data-filter="priority" data-value="${esc(priority)}" aria-pressed="${state.findings.priority.has(
                    priority,
                )}">${esc(priority)}</button>`,
        ).join("")}
        <select data-filter="pillar">
            <option value="">All pillars</option>
            ${pillars
                .map(
                    (pillarName) =>
                        `<option value="${esc(pillarName)}" ${state.findings.pillar === pillarName ? "selected" : ""}>${esc(
                            pillarName,
                        )}</option>`,
                )
                .join("")}
        </select>
        <input type="search" data-filter="search" placeholder="Search findings" value="${esc(state.findings.search)}" />
    </div>`;

    const rows = table(
        ["Sev", "Effort", "Risk", "Cost", "Control", "Resource", "Finding", "Priority", "Status"],
        matches.map((finding) => ({
            key: finding.findingId,
            cells: [
                cell(sevBadge(finding.severity), true),
                text(finding.effort, true),
                text(finding.risk, true),
                text(finding.cost, true),
                text(finding.controlId, true),
                text(finding.resource),
                text(finding.title),
                text(finding.priority, true),
                cell(statusPill(finding.status), true),
            ],
        })),
        { clickable: "finding" },
    );

    return `<div class="grid grid-2">${quadrantCard}<div class="grid">${severityChart}${priorityChart}</div></div>
        ${card("Findings", filters + rows, { note: `${matches.length} of ${report.findings.length}` })}`;
}

function filteredControls(report) {
    const filters = state.controls;
    const needle = filters.search.trim().toLowerCase();
    return report.controls
        .filter((control) => (filters.status.size ? filters.status.has(control.status) : true))
        .filter((control) => (filters.section ? control.section === Number(filters.section) : true))
        .filter((control) =>
            needle
                ? `${control.id} ${control.control} ${control.observation} ${control.evidence} ${control.recommendation}`
                      .toLowerCase()
                      .includes(needle)
                : true,
        );
}

function renderControls(report) {
    if (report.controls.length === 0) {
        return `<div class="empty">detailed-well-architected-review.md was not found, so the control register is empty.</div>`;
    }

    const matches = filteredControls(report);
    const bySection = new Map();
    for (const control of report.controls) {
        const bucket = bySection.get(control.section) ?? [];
        bucket.push(control);
        bySection.set(control.section, bucket);
    }

    const heat = report.sections
        .map((section) => {
            const controls = bySection.get(section.n) ?? [];
            if (controls.length === 0) return "";
            return `<div class="heat-row">
                <div class="heat-label"><strong>${section.n}. ${esc(section.short)}</strong>
                    <span class="muted">${controls.length} controls · ${section.score === null ? "n/a" : `${section.score}%`}</span>
                </div>
                <div class="heat">${controls
                    .map(
                        (control) =>
                            `<button data-control="${esc(control.id)}" style="background:${STATUS_COLOR[control.status]}"
                                title="${esc(control.id)} — ${esc(control.status)}: ${esc(control.control.slice(0, 110))}"
                                aria-label="${esc(control.id)} ${esc(control.status)}"></button>`,
                    )
                    .join("")}</div>
            </div>`;
        })
        .join("");

    const heatCard = card(
        "All 157 controls at a glance",
        `${heat}${legend(STATUSES.map((status) => ({ label: status, color: STATUS_COLOR[status] })))}`,
        { note: "Click any square for the control detail" },
    );

    const filters = `<div class="filters">
        ${STATUSES.map(
            (status) =>
                `<button class="chip" data-filter="cstatus" data-value="${esc(status)}" aria-pressed="${state.controls.status.has(
                    status,
                )}">${esc(status)}</button>`,
        ).join("")}
        <select data-filter="section">
            <option value="">All sections</option>
            ${report.sections
                .map(
                    (section) =>
                        `<option value="${section.n}" ${
                            String(state.controls.section) === String(section.n) ? "selected" : ""
                        }>${section.n}. ${esc(section.label)}</option>`,
                )
                .join("")}
        </select>
        <input type="search" data-filter="csearch" placeholder="Search controls" value="${esc(state.controls.search)}" />
    </div>`;

    const rows = table(
        ["ID", "Status", "Control", "Observation"],
        matches.map((control) => ({
            key: control.id,
            cells: [
                text(control.id, true),
                cell(statusPill(control.status), true),
                text(control.control),
                text((control.observation || control.evidence).slice(0, 220)),
            ],
        })),
        { clickable: "control" },
    );

    return `${heatCard}${card("Control register", filters + rows, { note: `${matches.length} of ${report.controls.length}` })}`;
}

function renderPlan(report) {
    const plan = report.plan.length ? report.plan : report.remediation;
    const cards = [];

    if (plan.length) {
        cards.push(
            card(
                "Prioritised remediation",
                table(
                    ["Priority", "Action", "Controls", "Sev", "Effort", "Risk", "Cost"],
                    plan.map((row) => ({
                        cells: [
                            text(row.priority, true),
                            text(row.finding ?? row.action),
                            text(row.controls),
                            text(row.severity, true),
                            text(row.effort, true),
                            text(row.risk, true),
                            text(row.cost, true),
                        ],
                    })),
                ),
            ),
        );
    }

    if (report.nextSteps.length) {
        cards.push(
            card(
                "Next steps",
                table(
                    ["#", "Step", "Owner", "Target"],
                    report.nextSteps.map((step) => ({
                        cells: [text(step.rank, true), text(step.step), text(step.owner), text(step.target, true)],
                    })),
                ),
            ),
        );
    }

    if (report.resources.length) {
        cards.push(
            card(
                "Resources in scope",
                table(
                    ["Resource", "Type", "Evidence file", "Collection result"],
                    report.resources.map((resource) => ({
                        cells: [
                            text(resource.resource),
                            text(resource.type),
                            cell(`<span class="mono">${esc(resource.evidenceFile)}</span>`),
                            text(resource.result),
                        ],
                    })),
                ),
            ),
        );
    }

    if (report.collectionGaps.length) {
        cards.push(
            card(
                "Collection gaps",
                table(
                    ["Evidence file", "Section", "Error", "Controls affected"],
                    report.collectionGaps.map((gap) => ({
                        cells: [
                            cell(`<span class="mono">${esc(gap.evidenceFile)}</span>`),
                            text(gap.section),
                            text(gap.error),
                            text(gap.controls),
                        ],
                    })),
                ),
            ),
        );
    }

    if (report.scopeLimitations.length) {
        cards.push(
            card(
                "Scope limitations",
                table(
                    ["Item", "Reason", "Controls affected"],
                    report.scopeLimitations.map((limit) => ({
                        cells: [text(limit.item), text(limit.reason), text(limit.controls)],
                    })),
                ),
            ),
        );
    }

    return cards.length ? cards.join("") : `<div class="empty">No plan tables were found in this report.</div>`;
}

/* --------------------------------------------------------------- drawer */

function openDrawer(title, subtitle, pairs) {
    $("#drawer-body").innerHTML = `<h2>${esc(title)}</h2>
        <p class="muted" style="margin:4px 0 0">${subtitle}</p>
        <dl>${pairs
            .filter(([, value]) => value)
            .map(([key, value]) => `<dt>${esc(key)}</dt><dd>${value}</dd>`)
            .join("")}</dl>`;
    $("#drawer").hidden = false;
    $("#scrim").hidden = false;
}

function closeDrawer() {
    $("#drawer").hidden = true;
    $("#scrim").hidden = true;
}

function showFinding(id) {
    const finding = state.snapshot?.report?.findings.find((item) => item.findingId === id);
    if (!finding) return;
    openDrawer(finding.title, `${sevBadge(finding.severity)} ${esc(finding.controlId)} · ${esc(finding.pillar)}`, [
        ["Status", statusPill(finding.status)],
        ["Resource", esc(finding.resource)],
        ["Summary", esc(finding.summary)],
        ["Severity", `${finding.severity} of 5`],
        ["Effort", `${finding.effort} of 5`],
        ["Change risk", `${finding.risk} of 5`],
        ["Cost impact", `${finding.cost} of 5`],
        ["Priority", esc(finding.priority)],
        ["Evidence", `<span class="mono">${esc(finding.evidence)}</span>`],
        ["Recommendation", esc(finding.recommendation)],
    ]);
}

function showControl(id) {
    const report = state.snapshot?.report;
    const control = report?.controls.find((item) => item.id === id);
    if (!control) return;
    const related = report.findings.filter((finding) => finding.controlId === id);
    openDrawer(control.id, `${statusPill(control.status)} ${esc(control.group)}`, [
        ["Control", esc(control.control)],
        ["Evidence", `<span class="mono">${esc(control.evidence)}</span>`],
        ["Observation", esc(control.observation)],
        ["Recommendation", esc(control.recommendation)],
        [
            "Findings",
            related.length
                ? related.map((finding) => `${sevBadge(finding.severity)} ${esc(finding.findingId)} — ${esc(finding.title)}`).join("<br />")
                : "",
        ],
    ]);
}

/* ------------------------------------------------------------- rendering */

function renderChrome() {
    $("#tabs").innerHTML = TABS.map(
        (tab) =>
            `<button class="tab" role="tab" data-tab="${tab.id}" aria-selected="${state.tab === tab.id}">${esc(tab.label)}</button>`,
    ).join("");

    const snapshot = state.snapshot;
    const picker = $("#report-picker");
    const options = snapshot?.available ?? [];
    picker.innerHTML = options.length
        ? options
              .map(
                  (item) =>
                      `<option value="${esc(item.dir)}" ${item.dir === snapshot.reportDir ? "selected" : ""}>${esc(item.name)}</option>`,
              )
              .join("")
        : `<option value="">No reports found</option>`;
    picker.hidden = options.length < 2;
}

function render() {
    const snapshot = state.snapshot;
    renderChrome();

    if (!snapshot) {
        view.innerHTML = `<div class="empty">Loading…</div>`;
        return;
    }

    const report = snapshot.report;
    if (!report) {
        $("#workload").textContent = "Well-Architected review";
        $("#subtitle").textContent = snapshot.reportDir ?? "";
        view.innerHTML = `<div class="empty">
            <p>${esc(snapshot.error?.message ?? "No report loaded.")}</p>
            <p class="muted">Run the <code>/wordpress-waf-review</code> skill, then re-open this canvas with its output directory.</p>
        </div>`;
        return;
    }

    $("#workload").textContent = report.meta.workload || report.reportName;
    $("#subtitle").textContent = [
        report.meta.environment ? `${report.meta.environment}` : "",
        report.meta.resourceGroup,
        report.meta.evidenceCollected ? `evidence ${report.meta.evidenceCollected.slice(0, 10)}` : "",
        report.reportDir,
    ]
        .filter(Boolean)
        .join(" · ");

    const banner = $("#banner");
    if (report.warnings.length) {
        banner.hidden = false;
        banner.innerHTML = report.warnings.map((warning) => esc(warning)).join("<br />");
    } else {
        banner.hidden = true;
    }

    const renderers = {
        overview: renderOverview,
        pillars: renderPillars,
        findings: renderFindings,
        controls: renderControls,
        plan: renderPlan,
    };
    view.innerHTML = renderers[state.tab](report);
}

/* --------------------------------------------------------------- wiring */

async function load() {
    const response = await fetch("/api/state", { cache: "no-store" });
    state.snapshot = await response.json();
    applyFocus(state.snapshot.focus);
    render();
}

function applyFocus(focus) {
    if (!focus || focus.at === state.lastFocusAt) return;
    state.lastFocusAt = focus.at ?? 0;
    if (focus.view) state.tab = focus.view;
    if (focus.minSeverity) {
        state.findings.severity = new Set([5, 4, 3, 2, 1].filter((severity) => severity >= focus.minSeverity));
        state.tab = focus.view ?? "findings";
    }
    if (focus.section) {
        state.controls.section = String(focus.section);
        state.tab = focus.view ?? "controls";
    }
    if (focus.status) {
        state.controls.status = new Set([focus.status]);
        state.tab = focus.view ?? "controls";
    }
    if (focus.search) {
        state.findings.search = focus.search;
        state.controls.search = focus.search;
    }
    if (focus.controlId) {
        state.tab = focus.view ?? "controls";
        queueMicrotask(() => showControl(focus.controlId.toUpperCase()));
    }
}

function toggle(set, value) {
    if (set.has(value)) set.delete(value);
    else set.add(value);
}

document.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-tab]");
    if (tab) {
        state.tab = tab.dataset.tab;
        render();
        return;
    }

    const chip = event.target.closest(".chip");
    if (chip) {
        const { filter, value } = chip.dataset;
        if (filter === "severity") toggle(state.findings.severity, Number(value));
        if (filter === "priority") toggle(state.findings.priority, value);
        if (filter === "cstatus") toggle(state.controls.status, value);
        render();
        return;
    }

    const dot = event.target.closest("[data-finding]");
    if (dot) {
        showFinding(dot.dataset.finding);
        return;
    }

    const control = event.target.closest("[data-control]");
    if (control) {
        showControl(control.dataset.control);
        return;
    }

    const section = event.target.closest("[data-section]");
    if (section) {
        state.controls.section = section.dataset.section;
        state.tab = "controls";
        render();
        return;
    }

    if (event.target.closest("#drawer-close") || event.target.closest("#scrim")) closeDrawer();
});

document.addEventListener("change", async (event) => {
    const filter = event.target.dataset?.filter;
    if (filter === "pillar") {
        state.findings.pillar = event.target.value;
        render();
        return;
    }
    if (filter === "section") {
        state.controls.section = event.target.value;
        render();
        return;
    }
    if (event.target.id === "report-picker" && event.target.value) {
        await fetch("/api/select", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reportDir: event.target.value }),
        });
        await load();
    }
});

let searchTimer;
document.addEventListener("input", (event) => {
    const filter = event.target.dataset?.filter;
    if (filter !== "search" && filter !== "csearch") return;
    const value = event.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        if (filter === "search") state.findings.search = value;
        else state.controls.search = value;
        render();
        const input = document.querySelector(`[data-filter="${filter}"]`);
        if (input) {
            input.focus();
            input.setSelectionRange(value.length, value.length);
        }
    }, 220);
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDrawer();
});

$("#refresh").addEventListener("click", async () => {
    await fetch("/api/reload", { method: "POST" });
    await load();
});

const events = new EventSource("/events");
events.addEventListener("message", (event) => {
    try {
        const payload = JSON.parse(event.data);
        if (payload.type === "focus") applyFocus(payload.focus);
    } catch {
        /* keep-alive frames */
    }
    load();
});

await load();
