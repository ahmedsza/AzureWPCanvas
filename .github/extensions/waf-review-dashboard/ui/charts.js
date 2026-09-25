// Dependency-free SVG chart builders. Each returns an SVG string; callers drop
// it into a container with innerHTML. Native <title> elements provide tooltips.

export const STATUS_COLOR = {
    Pass: "var(--pass)",
    Fail: "var(--fail)",
    "N/A": "var(--na)",
    "Not verified": "var(--nv)",
};

export const RAG_COLOR = {
    Green: "var(--rag-green)",
    Amber: "var(--rag-amber)",
    Red: "var(--rag-red)",
};

export const SEVERITY_COLOR = {
    5: "var(--fail)",
    4: "#d1662b",
    3: "var(--nv)",
    2: "var(--accent)",
    1: "var(--na)",
};

export function esc(value) {
    return String(value ?? "").replace(
        /[&<>"']/g,
        (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
    );
}

const round = (value) => Math.round(value * 100) / 100;

/**
 * Radar of section score and coverage. Score is the shaded polygon; coverage is
 * the dashed outline — the rubric insists the two are always read together.
 */
export function radar(items, { size = 340 } = {}) {
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 62;
    const count = items.length;
    if (count === 0) return "";

    const angle = (index) => -Math.PI / 2 + (index * 2 * Math.PI) / count;
    const at = (index, value) => [
        round(cx + Math.cos(angle(index)) * radius * (Math.max(0, Math.min(100, value ?? 0)) / 100)),
        round(cy + Math.sin(angle(index)) * radius * (Math.max(0, Math.min(100, value ?? 0)) / 100)),
    ];
    const polygon = (pick) => items.map((item, index) => at(index, pick(item)).join(",")).join(" ");

    const rings = [25, 50, 75, 100]
        .map((level) => {
            const points = items.map((_, index) => at(index, level).join(",")).join(" ");
            return `<polygon points="${points}" fill="none" stroke="var(--line)" stroke-width="1" ${
                level === 100 ? "" : 'stroke-dasharray="2 3"'
            } />`;
        })
        .join("");

    const spokes = items
        .map((_, index) => {
            const [x, y] = at(index, 100);
            return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--line)" stroke-width="1" />`;
        })
        .join("");

    const labels = items
        .map((item, index) => {
            const [x, y] = at(index, 118);
            const anchor = Math.abs(x - cx) < 12 ? "middle" : x > cx ? "start" : "end";
            return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="11" fill="var(--ink-muted)">
                <tspan x="${x}" dy="0">${esc(item.label)}</tspan>
                <tspan x="${x}" dy="13" font-weight="600" fill="${RAG_COLOR[item.status] ?? "var(--ink)"}">${
                    item.score === null ? "n/a" : `${item.score}%`
                }</tspan>
            </text>`;
        })
        .join("");

    const dots = items
        .map((item, index) => {
            const [x, y] = at(index, item.score ?? 0);
            return `<circle cx="${x}" cy="${y}" r="3.5" fill="${RAG_COLOR[item.status] ?? "var(--accent)"}"><title>${esc(
                item.label,
            )}: score ${item.score ?? "n/a"}%, coverage ${item.coverage ?? "n/a"}%</title></circle>`;
        })
        .join("");

    return `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Score and coverage radar">
        ${rings}${spokes}
        <polygon points="${polygon((item) => item.coverage)}" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="5 4" />
        <polygon points="${polygon((item) => item.score)}" fill="var(--accent-muted)" stroke="var(--accent)" stroke-width="2" />
        ${dots}${labels}
    </svg>`;
}

/** Donut ring used for the headline score and coverage figures. */
export function ring(value, { size = 132, caption = "", sub = "", color = "var(--accent)" } = {}) {
    const stroke = 12;
    const radius = size / 2 - stroke / 2 - 1;
    const circumference = 2 * Math.PI * radius;
    const pct = value === null || value === undefined ? 0 : Math.max(0, Math.min(100, value));
    const filled = round((circumference * pct) / 100);

    return `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(caption)} ${pct}%">
        <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="var(--line)" stroke-width="${stroke}" />
        <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="${color}" stroke-width="${stroke}"
            stroke-linecap="round" stroke-dasharray="${filled} ${round(circumference - filled)}"
            transform="rotate(-90 ${size / 2} ${size / 2})" />
        <text x="${size / 2}" y="${size / 2 - 2}" text-anchor="middle" font-size="26" font-weight="600" fill="var(--ink)">${
            value === null || value === undefined ? "n/a" : `${pct}%`
        }</text>
        <text x="${size / 2}" y="${size / 2 + 16}" text-anchor="middle" font-size="11" fill="var(--ink-muted)">${esc(sub)}</text>
    </svg>`;
}

/** 100%-wide stacked composition bars, one row per checklist section. */
export function stackedBars(rows, { labelWidth = 128, rowHeight = 26, width = 560 } = {}) {
    const barWidth = width - labelWidth - 46;
    const height = rows.length * rowHeight + 6;

    const bars = rows
        .map((row, index) => {
            const y = index * rowHeight + 3;
            const total = row.segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
            let x = labelWidth;
            const parts = row.segments
                .map((segment) => {
                    const w = round((segment.value / total) * barWidth);
                    const rect = segment.value
                        ? `<rect x="${round(x)}" y="${y}" width="${w}" height="${rowHeight - 10}" fill="${segment.color}" rx="2">
                            <title>${esc(row.label)} — ${esc(segment.label)}: ${segment.value} of ${total}</title>
                        </rect>`
                        : "";
                    x += w;
                    return rect;
                })
                .join("");
            return `<g>
                <text x="0" y="${y + rowHeight / 2 - 1}" font-size="11" fill="var(--ink-muted)">${esc(row.label)}</text>
                ${parts}
                <text x="${width - 2}" y="${y + rowHeight / 2 - 1}" text-anchor="end" font-size="11" fill="var(--ink-muted)">${total}</text>
            </g>`;
        })
        .join("");

    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Control status composition by section">${bars}</svg>`;
}

/** Paired score / coverage columns per section. */
export function pairedBars(rows, { width = 560, height = 210 } = {}) {
    const padLeft = 30;
    const padBottom = 34;
    const plotHeight = height - padBottom - 10;
    const slot = (width - padLeft) / Math.max(rows.length, 1);
    const barWidth = Math.min(16, slot / 2.6);
    const scale = (value) => round(plotHeight * (Math.max(0, Math.min(100, value ?? 0)) / 100));

    const gridlines = [0, 25, 50, 75, 100]
        .map((level) => {
            const y = round(10 + plotHeight - scale(level));
            return `<line x1="${padLeft}" y1="${y}" x2="${width}" y2="${y}" stroke="var(--line)" stroke-width="1" stroke-dasharray="2 3" />
                <text x="${padLeft - 6}" y="${y + 3}" text-anchor="end" font-size="9" fill="var(--ink-muted)">${level}</text>`;
        })
        .join("");

    const bars = rows
        .map((row, index) => {
            const base = padLeft + index * slot + slot / 2;
            const scoreHeight = scale(row.score);
            const coverageHeight = scale(row.coverage);
            return `<g>
                <rect x="${round(base - barWidth - 2)}" y="${round(10 + plotHeight - scoreHeight)}" width="${round(barWidth)}"
                    height="${scoreHeight}" rx="2" fill="${RAG_COLOR[row.status] ?? "var(--accent)"}">
                    <title>${esc(row.label)} score: ${row.score ?? "n/a"}%</title></rect>
                <rect x="${round(base + 2)}" y="${round(10 + plotHeight - coverageHeight)}" width="${round(barWidth)}"
                    height="${coverageHeight}" rx="2" fill="var(--accent)" opacity="0.45">
                    <title>${esc(row.label)} coverage: ${row.coverage ?? "n/a"}%</title></rect>
                <text x="${round(base)}" y="${height - 16}" text-anchor="middle" font-size="10" fill="var(--ink-muted)">${esc(
                    row.short,
                )}</text>
            </g>`;
        })
        .join("");

    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Score against coverage by section">${gridlines}${bars}</svg>`;
}

/** Vertical count columns, used for severity distribution. */
export function columns(items, { width = 300, height = 180 } = {}) {
    const padBottom = 30;
    const plotHeight = height - padBottom - 14;
    const max = Math.max(...items.map((item) => item.value), 1);
    const slot = width / Math.max(items.length, 1);
    const barWidth = Math.min(38, slot * 0.56);

    const bars = items
        .map((item, index) => {
            const centre = index * slot + slot / 2;
            const barHeight = round((item.value / max) * plotHeight);
            return `<g>
                <rect x="${round(centre - barWidth / 2)}" y="${round(14 + plotHeight - barHeight)}" width="${round(barWidth)}"
                    height="${barHeight}" rx="3" fill="${item.color}">
                    <title>${esc(item.label)}: ${item.value}</title></rect>
                <text x="${round(centre)}" y="${round(8 + plotHeight - barHeight)}" text-anchor="middle" font-size="11"
                    font-weight="600" fill="var(--ink)">${item.value}</text>
                <text x="${round(centre)}" y="${height - 8}" text-anchor="middle" font-size="10" fill="var(--ink-muted)">${esc(
                    item.label,
                )}</text>
            </g>`;
        })
        .join("");

    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Distribution">${bars}</svg>`;
}

/** Donut with a centre total, used for remediation priority mix. */
export function donut(items, { size = 168 } = {}) {
    const total = items.reduce((sum, item) => sum + item.value, 0);
    const radius = size / 2 - 14;
    const stroke = 22;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;

    const arcs = items
        .filter((item) => item.value > 0)
        .map((item) => {
            const length = round((item.value / (total || 1)) * circumference);
            const arc = `<circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="${item.color}"
                stroke-width="${stroke}" stroke-dasharray="${length} ${round(circumference - length)}"
                stroke-dashoffset="${round(-offset)}" transform="rotate(-90 ${size / 2} ${size / 2})">
                <title>${esc(item.label)}: ${item.value}</title></circle>`;
            offset += length;
            return arc;
        })
        .join("");

    return `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Priority mix">
        <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="var(--line)" stroke-width="${stroke}" />
        ${arcs}
        <text x="${size / 2}" y="${size / 2 - 1}" text-anchor="middle" font-size="24" font-weight="600" fill="var(--ink)">${total}</text>
        <text x="${size / 2}" y="${size / 2 + 15}" text-anchor="middle" font-size="10" fill="var(--ink-muted)">findings</text>
    </svg>`;
}

/**
 * Severity (y) against remediation effort (x); bubble area carries cost impact.
 * The top-left quadrant is the "do now" corner from the scoring rubric.
 */
export function quadrant(findings, { width = 520, height = 340 } = {}) {
    const pad = { left: 46, right: 16, top: 18, bottom: 42 };
    const plotWidth = width - pad.left - pad.right;
    const plotHeight = height - pad.top - pad.bottom;
    const x = (effort) => round(pad.left + ((Math.max(1, Math.min(5, effort)) - 1) / 4) * plotWidth);
    const y = (severity) => round(pad.top + plotHeight - ((Math.max(1, Math.min(5, severity)) - 1) / 4) * plotHeight);

    const grid = [1, 2, 3, 4, 5]
        .map(
            (level) => `
        <line x1="${x(level)}" y1="${pad.top}" x2="${x(level)}" y2="${pad.top + plotHeight}" stroke="var(--line)" stroke-dasharray="2 3" />
        <line x1="${pad.left}" y1="${y(level)}" x2="${pad.left + plotWidth}" y2="${y(level)}" stroke="var(--line)" stroke-dasharray="2 3" />
        <text x="${x(level)}" y="${pad.top + plotHeight + 14}" text-anchor="middle" font-size="10" fill="var(--ink-muted)">${level}</text>
        <text x="${pad.left - 8}" y="${y(level) + 3}" text-anchor="end" font-size="10" fill="var(--ink-muted)">${level}</text>`,
        )
        .join("");

    // Cluster identical (effort, severity) pairs so overlapping dots stay readable.
    const buckets = new Map();
    for (const finding of findings) {
        const key = `${finding.effort}:${finding.severity}`;
        const bucket = buckets.get(key) ?? [];
        bucket.push(finding);
        buckets.set(key, bucket);
    }

    const dots = [...buckets.values()]
        .flatMap((bucket) =>
            bucket.map((finding, index) => {
                const spread = bucket.length > 1 ? 9 : 0;
                const theta = (index / bucket.length) * 2 * Math.PI;
                const cx = round(x(finding.effort) + Math.cos(theta) * spread);
                const cy = round(y(finding.severity) + Math.sin(theta) * spread);
                const r = 5 + (Math.max(1, Math.min(5, finding.cost)) - 1) * 1.6;
                return `<circle class="dot" data-finding="${esc(finding.findingId)}" cx="${cx}" cy="${cy}" r="${round(r)}"
                    fill="${SEVERITY_COLOR[finding.severity] ?? "var(--na)"}" fill-opacity="0.75" stroke="var(--surface)" stroke-width="1"
                    style="cursor:pointer">
                    <title>${esc(finding.controlId)} — ${esc(finding.title)}
severity ${finding.severity} · effort ${finding.effort} · change risk ${finding.risk} · cost ${finding.cost}</title></circle>`;
            }),
        )
        .join("");

    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Severity against effort">
        <rect x="${pad.left}" y="${pad.top}" width="${round(plotWidth / 2)}" height="${round(plotHeight / 2)}" fill="var(--fail)" opacity="0.05" />
        ${grid}
        <text x="${round(pad.left + 6)}" y="${pad.top + 13}" font-size="10" fill="var(--ink-muted)">high impact · low effort</text>
        ${dots}
        <text x="${round(pad.left + plotWidth / 2)}" y="${height - 8}" text-anchor="middle" font-size="11" fill="var(--ink-muted)">Remediation effort →</text>
        <text transform="rotate(-90 12 ${round(pad.top + plotHeight / 2)})" x="12" y="${round(pad.top + plotHeight / 2)}"
            text-anchor="middle" font-size="11" fill="var(--ink-muted)">Severity →</text>
    </svg>`;
}

/** Legend markup shared by several cards. */
export function legend(items) {
    return `<div class="legend">${items
        .map((item) => `<span><i class="swatch" style="background:${item.color}"></i>${esc(item.label)}</span>`)
        .join("")}</div>`;
}
