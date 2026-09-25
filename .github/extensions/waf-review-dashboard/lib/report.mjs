// Reads a wordpress-waf-review output directory into one normalised model.
//
// A "report directory" is whatever the skill wrote: executive-summary.md,
// detailed-well-architected-review.md and findings.csv. The canvas never talks
// to Azure and never re-scores anything — it reads what the skill produced.

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { clean, findTable, num, parseCsv, parseTables, rag, rowsAsObjects, status } from "./markdown.mjs";

export const REPORT_FILES = {
    summary: "executive-summary.md",
    detailed: "detailed-well-architected-review.md",
    findings: "findings.csv",
};

/** Checklist sections, in checklist order, with the totals from Section 9. */
const SECTIONS = [
    { n: 1, id: "foundations", label: "Workload foundations & governance", short: "Foundations", total: 13, pillar: true },
    { n: 2, id: "reliability", label: "Reliability", short: "Reliability", total: 17, pillar: true },
    { n: 3, id: "security", label: "Security", short: "Security", total: 24, pillar: true },
    { n: 4, id: "cost", label: "Cost Optimization", short: "Cost", total: 14, pillar: true },
    { n: 5, id: "operations", label: "Operational Excellence", short: "Operations", total: 17, pillar: true },
    { n: 6, id: "performance", label: "Performance Efficiency", short: "Performance", total: 15, pillar: true },
    { n: 7, id: "resources", label: "Resource-specific supplementary", short: "Resources", total: 45, pillar: false },
    { n: 8, id: "manual", label: "Manual validation register", short: "Manual", total: 12, pillar: false },
];

/** Control-ID prefix to checklist section. Everything unlisted is Section 7. */
const PREFIX_SECTION = { FND: 1, REL: 2, SEC: 3, CST: 4, OPS: 5, PRF: 6, MAN: 8 };

const STATUS_ORDER = ["Pass", "Fail", "N/A", "Not verified"];

function sectionForControl(id) {
    const prefix = /^([A-Z]+)-/.exec(String(id ?? "").toUpperCase());
    if (!prefix) return 7;
    return PREFIX_SECTION[prefix[1]] ?? 7;
}

async function readIfPresent(file) {
    try {
        return await readFile(file, "utf8");
    } catch {
        return null;
    }
}

function percent(numerator, denominator) {
    if (!denominator) return null;
    return Math.round((numerator / denominator) * 100);
}

function band(score, coverage, hasSeverityFive) {
    if (score === null) return "Amber";
    if (hasSeverityFive) return "Red";
    if (score < 70) return "Red";
    if (coverage !== null && coverage < 50) return "Amber";
    return score >= 90 ? "Green" : "Amber";
}

/** Parse the `**Key:** value | **Key:** value` header block of the summary. */
function parseHeaderBlock(markdown) {
    const head = markdown.split(/\r?\n##\s/)[0] ?? "";
    const meta = {};
    for (const match of head.matchAll(/\*\*([^*:]+):\*\*\s*([^|\r\n]+)/g)) {
        meta[match[1].trim().toLowerCase()] = clean(match[2]);
    }
    return meta;
}

/** The prose paragraph the skill writes under the overall-posture table. */
function parseNarrative(markdown) {
    const block = /##\s+Overall posture([\s\S]*?)(?=\r?\n##\s)/.exec(markdown);
    if (!block) return "";
    const afterTable = block[1].split(/\r?\n/).filter((line) => !line.trim().startsWith("|"));
    return afterTable.join(" ").replace(/\s+/g, " ").trim();
}

function parseSummary(markdown) {
    if (!markdown) return null;
    const tables = parseTables(markdown);
    const meta = parseHeaderBlock(markdown);

    const posture = {};
    const postureTable = findTable(tables, ["Measure", "Result"]);
    for (const [measure, result] of postureTable?.rows ?? []) {
        posture[clean(measure).toLowerCase()] = clean(result);
    }

    const counts = /(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)/.exec(posture["pass / fail / n/a / not verified"] ?? "");
    const assessed = /(\d+)\s*of\s*(\d+)/.exec(posture["controls assessed"] ?? "");

    return {
        meta,
        narrative: parseNarrative(markdown),
        stated: {
            score: num(posture["overall score"]),
            rag: rag(posture["overall score"]),
            coverage: num(posture["evidence coverage"]),
            assessed: assessed ? Number(assessed[1]) : null,
            totalControls: assessed ? Number(assessed[2]) : null,
            pass: counts ? Number(counts[1]) : null,
            fail: counts ? Number(counts[2]) : null,
            na: counts ? Number(counts[3]) : null,
            notVerified: counts ? Number(counts[4]) : null,
            critical: num(posture["critical findings (severity 5)"]),
            high: num(posture["high findings (severity 4)"]),
        },
        scorecard: findTable(tables, ["Pillar", "Controls", "Pass", "Fail"]),
        strengths: rowsAsObjects(findTable(tables, ["#", "Strength", "Pillar", "Why it matters"]), [
            "rank",
            "strength",
            "pillar",
            "why",
        ]),
        keyFindings: rowsAsObjects(findTable(tables, ["#", "Finding", "Control", "Pillar", "Severity"]), [
            "rank",
            "finding",
            "control",
            "pillar",
            "severity",
            "impact",
            "action",
        ]),
        remediation: rowsAsObjects(findTable(tables, ["Priority", "Action", "Controls", "Severity"]), [
            "priority",
            "action",
            "controls",
            "severity",
            "effort",
            "risk",
            "cost",
        ]),
        limitations: rowsAsObjects(findTable(tables, ["Limitation", "Effect on this review"]), ["limitation", "effect"]),
        nextSteps: rowsAsObjects(findTable(tables, ["#", "Step", "Owner", "Target"]), ["rank", "step", "owner", "target"]),
    };
}

function parseDetailed(markdown) {
    if (!markdown) return null;
    const tables = parseTables(markdown);

    const scope = {};
    for (const [field, value] of findTable(tables, ["Field", "Value"])?.rows ?? []) {
        scope[clean(field).toLowerCase()] = clean(value);
    }

    const controls = [];
    for (const table of tables) {
        const isControlTable =
            /^id$/i.test(table.headers[0] ?? "") && /status/i.test(table.headers.join(" ")) && table.headers.length >= 5;
        if (!isControlTable) continue;

        const manual = /manual validation/i.test(table.headers[1] ?? "");
        for (const cells of table.rows) {
            const id = clean(cells[0]);
            if (!/^[A-Z]{2,4}-\d+/i.test(id)) continue;
            controls.push({
                id: id.toUpperCase(),
                section: sectionForControl(id),
                group: table.h3 || table.h2 || "",
                control: clean(cells[1]),
                status: status(manual ? cells[3] : cells[2]),
                evidence: manual ? clean(cells[2]) : clean(cells[3]),
                observation: manual ? "" : clean(cells[4]),
                recommendation: manual ? clean(cells[4]) : clean(cells[5]),
                owner: manual ? clean(cells[4]) : "",
                manual,
            });
        }
    }

    return {
        scope,
        controls,
        scoringSummary: findTable(tables, ["Section", "Total", "Pass", "Fail"]),
        resources: rowsAsObjects(findTable(tables, ["Resource", "Type", "Evidence file", "Collection result"]), [
            "resource",
            "type",
            "evidenceFile",
            "result",
        ]),
        scopeLimitations: rowsAsObjects(findTable(tables, ["Item", "Reason", "Controls affected"]), [
            "item",
            "reason",
            "controls",
        ]),
        collectionGaps: rowsAsObjects(findTable(tables, ["Evidence file", "Section", "Error"]), [
            "evidenceFile",
            "section",
            "error",
            "controls",
        ]),
        plan: rowsAsObjects(findTable(tables, ["Priority", "Finding", "Controls", "Severity"]), [
            "priority",
            "finding",
            "controls",
            "severity",
            "effort",
            "risk",
            "cost",
            "owner",
            "target",
        ]),
    };
}

function parseFindings(csv) {
    if (!csv) return [];
    const rows = parseCsv(csv);
    if (rows.length < 2) return [];
    const header = rows[0].map((cell) => cell.trim().toLowerCase());
    const index = (name) => header.indexOf(name);

    return rows.slice(1).map((cells) => {
        const at = (name) => (index(name) === -1 ? "" : (cells[index(name)] ?? "").trim());
        return {
            findingId: at("findingid"),
            controlId: at("controlid").toUpperCase(),
            pillar: at("pillar"),
            resource: at("resource"),
            title: at("title"),
            summary: at("summary"),
            status: at("status"),
            severity: num(at("severity")) ?? 0,
            effort: num(at("effort")) ?? 0,
            risk: num(at("risk")) ?? 0,
            cost: num(at("cost")) ?? 0,
            priority: at("priority"),
            evidence: at("evidence"),
            recommendation: at("recommendation"),
            section: sectionForControl(at("controlid")),
        };
    });
}

/** Merge stated table numbers with numbers derived from the parsed controls. */
function buildSections(detailed, summary, findings) {
    const statedRows = new Map();
    const table = detailed?.scoringSummary ?? summary?.scorecard;
    for (const cells of table?.rows ?? []) {
        const n = num(cells[0]);
        if (!n || n < 1 || n > 8) continue;
        statedRows.set(n, {
            total: num(cells[1]),
            pass: num(cells[2]),
            fail: num(cells[3]),
            na: num(cells[4]),
            notVerified: num(cells[5]),
            score: num(cells[6]),
            coverage: num(cells[7]),
            status: rag(cells[8]),
            note: clean(cells[8]),
        });
    }

    const derived = new Map();
    for (const control of detailed?.controls ?? []) {
        const bucket = derived.get(control.section) ?? { total: 0, Pass: 0, Fail: 0, "N/A": 0, "Not verified": 0 };
        bucket.total++;
        bucket[control.status]++;
        derived.set(control.section, bucket);
    }

    const warnings = [];
    const sections = SECTIONS.map((meta) => {
        const stated = statedRows.get(meta.n);
        const seen = derived.get(meta.n);
        const counts = stated ?? {
            total: seen?.total ?? meta.total,
            pass: seen?.Pass ?? 0,
            fail: seen?.Fail ?? 0,
            na: seen?.["N/A"] ?? 0,
            notVerified: seen?.["Not verified"] ?? 0,
            score: null,
            coverage: null,
            status: null,
        };

        const total = counts.total ?? meta.total;
        const pass = counts.pass ?? 0;
        const fail = counts.fail ?? 0;
        const na = counts.na ?? 0;
        const notVerified = counts.notVerified ?? 0;
        const decided = Math.max(total - na - notVerified, 0);
        const applicable = Math.max(total - na, 0);
        const score = counts.score ?? percent(pass, decided);
        const coverage = counts.coverage ?? percent(decided, applicable);
        const severityFive = findings.some((f) => f.section === meta.n && f.severity >= 5);

        if (seen && stated && seen.total !== stated.total) {
            warnings.push(
                `Section ${meta.n} (${meta.short}): scoring summary states ${stated.total} controls, ${seen.total} rows parsed from the detailed report.`,
            );
        }

        return {
            ...meta,
            total,
            pass,
            fail,
            na,
            notVerified,
            decided,
            score,
            coverage,
            status: counts.status ?? band(score, coverage, severityFive),
            note: counts.note ?? "",
            severityFive,
        };
    });

    return { sections, warnings };
}

function mean(values) {
    const usable = values.filter((value) => typeof value === "number" && Number.isFinite(value));
    if (usable.length === 0) return null;
    return Math.round(usable.reduce((total, value) => total + value, 0) / usable.length);
}

/**
 * Load and normalise one report directory.
 * @param {string} dir absolute path to the skill's output directory
 */
export async function loadReport(dir) {
    const resolved = path.resolve(dir);
    const [summaryText, detailedText, findingsText] = await Promise.all([
        readIfPresent(path.join(resolved, REPORT_FILES.summary)),
        readIfPresent(path.join(resolved, REPORT_FILES.detailed)),
        readIfPresent(path.join(resolved, REPORT_FILES.findings)),
    ]);

    if (!summaryText && !detailedText && !findingsText) {
        const error = new Error(
            `No well-architected report found in "${resolved}". Expected ${REPORT_FILES.summary}, ${REPORT_FILES.detailed} or ${REPORT_FILES.findings}.`,
        );
        error.code = "report_not_found";
        throw error;
    }

    const summary = parseSummary(summaryText);
    const detailed = parseDetailed(detailedText);
    const findings = parseFindings(findingsText);
    const { sections, warnings } = buildSections(detailed, summary, findings);

    const pillars = sections.filter((section) => section.pillar);
    const totals = sections.reduce(
        (accumulator, section) => ({
            total: accumulator.total + section.total,
            pass: accumulator.pass + section.pass,
            fail: accumulator.fail + section.fail,
            na: accumulator.na + section.na,
            notVerified: accumulator.notVerified + section.notVerified,
        }),
        { total: 0, pass: 0, fail: 0, na: 0, notVerified: 0 },
    );

    const overallScore = summary?.stated.score ?? mean(pillars.map((section) => section.score));
    const overallCoverage = summary?.stated.coverage ?? mean(pillars.map((section) => section.coverage));
    const critical = summary?.stated.critical ?? findings.filter((finding) => finding.severity >= 5).length;
    const high = summary?.stated.high ?? findings.filter((finding) => finding.severity === 4).length;

    if (!summaryText) warnings.push(`${REPORT_FILES.summary} not found in this directory.`);
    if (!detailedText) warnings.push(`${REPORT_FILES.detailed} not found — the control explorer will be empty.`);
    if (!findingsText) warnings.push(`${REPORT_FILES.findings} not found — findings charts will be empty.`);

    const mtimes = await Promise.all(
        Object.values(REPORT_FILES).map(async (file) => {
            try {
                return (await stat(path.join(resolved, file))).mtime.toISOString();
            } catch {
                return null;
            }
        }),
    );

    const meta = summary?.meta ?? {};
    const scope = detailed?.scope ?? {};

    return {
        reportDir: resolved,
        reportName: path.basename(resolved),
        loadedAt: new Date().toISOString(),
        filesModified: mtimes.filter(Boolean).sort().pop() ?? null,
        meta: {
            workload: meta.workload ?? scope.workload ?? path.basename(resolved),
            environment: meta.environment ?? scope["workload environment"] ?? "not stated",
            subscription: meta.subscription ?? "",
            resourceGroup: meta["resource group"] ?? "",
            evidenceCollected: meta["evidence collected"] ?? scope["evidence generated (utc)"] ?? "",
            evidenceDirectory: scope["evidence directory"] ?? "",
            reviewDate: meta["review date"] ?? "",
            reviewer: meta.reviewer ?? scope["reviewer / review date"] ?? "",
            checklist: meta.checklist ?? scope.checklist ?? "",
            slo: scope["stated slo / rto / rpo"] ?? "not supplied",
            dataClassification: scope["data classification"] ?? "not supplied",
            acceptedRisks: scope["known accepted risks"] ?? "not supplied",
        },
        posture: {
            score: overallScore,
            coverage: overallCoverage,
            rag: summary?.stated.rag ?? band(overallScore, overallCoverage, critical > 0),
            assessed: summary?.stated.assessed ?? totals.total,
            totalControls: summary?.stated.totalControls ?? totals.total,
            pass: totals.pass,
            fail: totals.fail,
            na: totals.na,
            notVerified: totals.notVerified,
            critical,
            high,
            narrative: summary?.narrative ?? "",
        },
        statusOrder: STATUS_ORDER,
        sections,
        controls: detailed?.controls ?? [],
        findings,
        strengths: summary?.strengths ?? [],
        keyFindings: summary?.keyFindings ?? [],
        remediation: summary?.remediation ?? [],
        limitations: summary?.limitations ?? [],
        nextSteps: summary?.nextSteps ?? [],
        plan: detailed?.plan ?? [],
        resources: detailed?.resources ?? [],
        scopeLimitations: detailed?.scopeLimitations ?? [],
        collectionGaps: detailed?.collectionGaps ?? [],
        warnings,
    };
}
