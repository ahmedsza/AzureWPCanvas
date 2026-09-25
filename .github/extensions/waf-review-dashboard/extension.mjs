// Extension: waf-review-dashboard
//
// Visualises the output of the wordpress-waf-review skill. The canvas is
// pointed at a report directory — either the one the skill just wrote, or an
// existing directory of results — and renders the scorecard, findings and the
// full 157-control register as interactive charts.
//
// Wiring only. Parsing lives in lib/report.mjs, discovery in lib/discover.mjs,
// the per-instance HTTP server in lib/server.mjs, and the dashboard itself in
// ui/.

import path from "node:path";
import { existsSync } from "node:fs";
import { createCanvas, CanvasError, joinSession } from "@github/copilot-sdk/extension";
import { DashboardInstance } from "./lib/server.mjs";
import { discoverReports } from "./lib/discover.mjs";

/** instanceId -> DashboardInstance. Panel state only; the report lives on disk. */
const instances = new Map();

/**
 * Directories that relative report paths resolve against, and the roots the
 * report picker searches. process.cwd() is the CLI's working directory (the
 * repo); session.workspacePath is added when it points somewhere different.
 */
let roots = [process.cwd()];

function resolveReportDir(input) {
    const raw = input?.reportDir;
    if (!raw || typeof raw !== "string") return null;
    if (path.isAbsolute(raw)) return path.resolve(raw);
    for (const root of roots) {
        const candidate = path.resolve(root, raw);
        if (existsSync(candidate)) return candidate;
    }
    return path.resolve(roots[0], raw);
}

function requireInstance(instanceId) {
    const instance = instances.get(instanceId);
    if (!instance) throw new CanvasError("canvas_instance_unknown", `No open dashboard for instance "${instanceId}".`);
    return instance;
}

function requireReport(instance) {
    if (!instance.report) {
        throw new CanvasError(
            instance.error?.code ?? "report_not_loaded",
            instance.error?.message ?? "No report is loaded in this canvas.",
        );
    }
    return instance.report;
}

function titleFor(instance) {
    if (instance.report) return `WAF review — ${instance.report.reportName}`;
    return "Well-Architected review";
}

function statusFor(instance) {
    if (instance.error) return instance.error.message.slice(0, 120);
    const report = instance.report;
    if (!report) return "No report loaded";
    const score = report.posture.score ?? "n/a";
    const coverage = report.posture.coverage ?? "n/a";
    return `${score}% score · ${coverage}% coverage · ${report.posture.fail} fail · ${report.posture.critical} critical`;
}

const dashboard = createCanvas({
    id: "waf-review-dashboard",
    displayName: "Well-Architected review dashboard",
    description:
        "Visual scorecard for a wordpress-waf-review report directory: pillar radar, status breakdown, severity and effort charts, and the full control register.",
    inputSchema: {
        type: "object",
        properties: {
            reportDir: {
                type: "string",
                description:
                    "Directory holding executive-summary.md, detailed-well-architected-review.md and findings.csv. Absolute, or relative to the workspace root. Omit to auto-discover the most recent report in the workspace.",
            },
            view: {
                type: "string",
                enum: ["overview", "pillars", "findings", "controls", "plan"],
                description: "Tab to show first. Defaults to overview.",
            },
        },
        additionalProperties: false,
    },
    actions: [
        {
            name: "refresh",
            description:
                "Re-read the report files from disk and push the new data to the open panel. Call this after re-running the wordpress-waf-review skill.",
            handler: async (ctx) => {
                const instance = requireInstance(ctx.instanceId);
                await instance.refresh();
                instance.broadcast();
                if (instance.error) throw new CanvasError(instance.error.code, instance.error.message);
                const report = instance.report;
                return {
                    reportDir: report.reportDir,
                    score: report.posture.score,
                    coverage: report.posture.coverage,
                    pass: report.posture.pass,
                    fail: report.posture.fail,
                    notVerified: report.posture.notVerified,
                    findings: report.findings.length,
                    warnings: report.warnings,
                };
            },
        },
        {
            name: "load_report",
            description: "Point the open panel at a different wordpress-waf-review output directory.",
            inputSchema: {
                type: "object",
                properties: {
                    reportDir: {
                        type: "string",
                        description: "Absolute path, or a path relative to the workspace root.",
                    },
                },
                required: ["reportDir"],
                additionalProperties: false,
            },
            handler: async (ctx) => {
                const instance = requireInstance(ctx.instanceId);
                await instance.setReportDir(resolveReportDir(ctx.input));
                if (instance.error) throw new CanvasError(instance.error.code, instance.error.message);
                return {
                    reportDir: instance.report.reportDir,
                    workload: instance.report.meta.workload,
                    score: instance.report.posture.score,
                    coverage: instance.report.posture.coverage,
                };
            },
        },
        {
            name: "list_reports",
            description: "List wordpress-waf-review output directories discovered in the workspace.",
            handler: async () => {
                const reports = await discoverReports(roots);
                return { roots, count: reports.length, reports };
            },
        },
        {
            name: "get_scorecard",
            description:
                "Return the loaded report's overall posture and per-section scores, coverage and RAG status, without reading the markdown.",
            handler: async (ctx) => {
                const report = requireReport(requireInstance(ctx.instanceId));
                return {
                    reportDir: report.reportDir,
                    workload: report.meta.workload,
                    environment: report.meta.environment,
                    posture: report.posture,
                    sections: report.sections.map((section) => ({
                        section: section.n,
                        name: section.short,
                        label: section.label,
                        total: section.total,
                        pass: section.pass,
                        fail: section.fail,
                        na: section.na,
                        notVerified: section.notVerified,
                        score: section.score,
                        coverage: section.coverage,
                        status: section.status,
                    })),
                    warnings: report.warnings,
                };
            },
        },
        {
            name: "get_findings",
            description: "Return findings.csv rows from the loaded report, optionally filtered.",
            inputSchema: {
                type: "object",
                properties: {
                    minSeverity: { type: "integer", minimum: 1, maximum: 5 },
                    pillar: { type: "string", description: "Pillar name as written in findings.csv, e.g. Security." },
                    priority: { type: "string", enum: ["Do now", "Plan", "Schedule", "Backlog"] },
                    status: { type: "string", enum: ["Fail", "Not verified"] },
                    limit: { type: "integer", minimum: 1, maximum: 200 },
                },
                additionalProperties: false,
            },
            handler: async (ctx) => {
                const report = requireReport(requireInstance(ctx.instanceId));
                const input = ctx.input ?? {};
                const matches = report.findings
                    .filter((finding) => (input.minSeverity ? finding.severity >= input.minSeverity : true))
                    .filter((finding) => (input.pillar ? finding.pillar.toLowerCase() === input.pillar.toLowerCase() : true))
                    .filter((finding) => (input.priority ? finding.priority === input.priority : true))
                    .filter((finding) => (input.status ? finding.status === input.status : true))
                    .sort((a, b) => b.severity - a.severity || a.effort - b.effort);
                return { total: matches.length, findings: matches.slice(0, input.limit ?? 50) };
            },
        },
        {
            name: "get_controls",
            description:
                "Return control-register rows from the detailed report, optionally filtered by section, status or ID.",
            inputSchema: {
                type: "object",
                properties: {
                    section: { type: "integer", minimum: 1, maximum: 8, description: "Checklist section number 1-8." },
                    status: { type: "string", enum: ["Pass", "Fail", "N/A", "Not verified"] },
                    id: { type: "string", description: "Control ID such as SEC-07, or a prefix such as SEC." },
                    limit: { type: "integer", minimum: 1, maximum: 200 },
                },
                additionalProperties: false,
            },
            handler: async (ctx) => {
                const report = requireReport(requireInstance(ctx.instanceId));
                const input = ctx.input ?? {};
                const wanted = input.id ? input.id.toUpperCase() : null;
                const matches = report.controls
                    .filter((control) => (input.section ? control.section === input.section : true))
                    .filter((control) => (input.status ? control.status === input.status : true))
                    .filter((control) => (wanted ? control.id === wanted || control.id.startsWith(`${wanted}-`) : true));
                return { total: matches.length, controls: matches.slice(0, input.limit ?? 50) };
            },
        },
        {
            name: "focus",
            description:
                "Drive the open panel: switch tab, filter to a checklist section or control status, jump to a control, or search findings.",
            inputSchema: {
                type: "object",
                properties: {
                    view: { type: "string", enum: ["overview", "pillars", "findings", "controls", "plan"] },
                    section: { type: "integer", minimum: 1, maximum: 8 },
                    status: { type: "string", enum: ["Pass", "Fail", "N/A", "Not verified"] },
                    minSeverity: { type: "integer", minimum: 1, maximum: 5 },
                    controlId: { type: "string" },
                    search: { type: "string" },
                },
                additionalProperties: false,
            },
            handler: async (ctx) => {
                const instance = requireInstance(ctx.instanceId);
                instance.focus = { ...(ctx.input ?? {}), at: Date.now() };
                instance.broadcast({ type: "focus", focus: instance.focus });
                return { applied: instance.focus };
            },
        },
    ],

    // Idempotent: the same instanceId can arrive again after a reload, a host
    // re-open, or a provider reconnect. The report directory is the durable
    // identity, so re-opening simply re-reads it from disk.
    open: async (ctx) => {
        let instance = instances.get(ctx.instanceId);
        if (!instance) {
            instance = new DashboardInstance({
                instanceId: ctx.instanceId,
                roots,
                reportDir: resolveReportDir(ctx.input),
            });
            instances.set(ctx.instanceId, instance);
            await instance.start();
        } else if (resolveReportDir(ctx.input)) {
            instance.reportDir = resolveReportDir(ctx.input);
        }

        await instance.refresh();
        if (ctx.input?.view) {
            instance.focus = { view: ctx.input.view, at: Date.now() };
        }
        instance.broadcast();

        if (instance.error) {
            session.log(`Well-Architected dashboard: ${instance.error.message}`, { level: "warning" });
        }

        return { title: titleFor(instance), status: statusFor(instance), url: instance.url };
    },

    onClose: async (ctx) => {
        const instance = instances.get(ctx.instanceId);
        if (!instance) return;
        instances.delete(ctx.instanceId);
        await instance.stop();
    },
});

const session = await joinSession({ canvases: [dashboard] });

if (session.workspacePath && !roots.includes(path.resolve(session.workspacePath))) {
    roots = [...roots, path.resolve(session.workspacePath)];
}
