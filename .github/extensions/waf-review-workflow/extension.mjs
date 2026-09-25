// Extension: waf-review-workflow
//
// Visual guided workflow for WordPress Well-Architected reviews. The canvas
// owns orchestration state and can run local PowerShell/az helper scripts for
// prerequisite checks, subscription/resource-group discovery, pre-assessment,
// evidence collection, packaging, and unzip preparation. The assessment phase
// queues the wordpress-waf-review skill prompt into Copilot for execution.

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas, CanvasError, joinSession } from "@github/copilot-sdk/extension";

const instances = new Map();
let roots = [process.cwd()];

const REPORT_FILES = ["executive-summary.md", "detailed-well-architected-review.md", "findings.csv"];
const SKIP_DIRS = new Set([".git", ".idea", ".vscode", "bin", "build", "dist", "node_modules", "obj", "out", "vendor"]);
const RUNS_FILE = "waf-review-workflow-runs.json";

const PHASES = [
    {
        id: "dependencies",
        title: "Validate dependencies",
        icon: "01",
        short: "Local tools",
        automatic: true,
        detail: "Checks PowerShell 7, Azure CLI, az login, collector script, and Node.js for deck generation.",
    },
    {
        id: "connect",
        title: "Connect scope",
        icon: "02",
        short: "Subscription + RG",
        automatic: false,
        detail: "Loads Azure subscriptions, then resource groups for the selected subscription. This phase completes when both are selected.",
    },
    {
        id: "preassess",
        title: "Pre-assess",
        icon: "03",
        short: "Inventory",
        automatic: true,
        detail: "Lists all resources in the selected resource group and summarizes resource types before data collection.",
    },
    {
        id: "collect",
        title: "Collect data",
        icon: "04",
        short: "Evidence",
        automatic: true,
        detail: "Runs Invoke-CollectWordPressPosture.ps1 against the selected scope and streams progress into the workflow.",
    },
    {
        id: "package",
        title: "Package data",
        icon: "05",
        short: "ZIP",
        automatic: true,
        detail: "Confirms the collector ZIP produced beside the evidence directory and exposes it for the preparation phase.",
    },
    {
        id: "prepare-assessment",
        title: "Pre-Assess Phase",
        icon: "06",
        short: "Unzip",
        automatic: true,
        detail: "Extracts the collector ZIP and identifies the folder containing collection-manifest.json.",
    },
    {
        id: "assessment",
        title: "Assessment Phase",
        icon: "07",
        short: "Skill",
        automatic: false,
        detail: "Runs the wordpress-waf-review skill against the extracted evidence folder to generate Markdown, CSV, and PPTX outputs.",
    },
    {
        id: "display",
        title: "Display",
        icon: "08",
        short: "Canvas",
        automatic: false,
        detail: "Opens the waf-review-dashboard canvas against the generated report directory.",
    },
];

function resolvePath(inputPath) {
    if (!inputPath || typeof inputPath !== "string") return null;
    if (path.isAbsolute(inputPath)) return path.resolve(inputPath);
    return path.resolve(roots[0], inputPath);
}

function relativePath(target) {
    if (!target) return "";
    const resolved = path.resolve(target);
    for (const root of roots) {
        const rel = path.relative(root, resolved);
        if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) return rel;
        if (!rel) return ".";
    }
    return resolved;
}

async function isFile(file) {
    try {
        return (await stat(file)).isFile();
    } catch {
        return false;
    }
}

async function isDirectory(dir) {
    try {
        return (await stat(dir)).isDirectory();
    } catch {
        return false;
    }
}

async function walkDirectories(starts, { maxDepth = 6, limit = 600 } = {}) {
    const queue = starts.filter(Boolean).map((dir) => ({ dir: path.resolve(dir), depth: 0 }));
    const seen = new Set();
    const dirs = [];
    while (queue.length > 0 && dirs.length < limit) {
        const { dir, depth } = queue.shift();
        if (seen.has(dir)) continue;
        seen.add(dir);
        dirs.push(dir);
        if (depth >= maxDepth) continue;

        let entries;
        try {
            entries = await readdir(dir, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            if (SKIP_DIRS.has(entry.name)) continue;
            if (entry.name.startsWith(".") && entry.name !== ".github") continue;
            queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
        }
    }
    return dirs;
}

async function discoverEvidence() {
    const dirs = await walkDirectories(roots);
    const found = [];
    for (const dir of dirs) {
        const manifest = path.join(dir, "collection-manifest.json");
        if (!(await isFile(manifest))) continue;
        let modified = null;
        try {
            modified = (await stat(manifest)).mtime.toISOString();
        } catch {
            /* leave null */
        }
        found.push({ dir, label: relativePath(dir), manifest: relativePath(manifest), modified });
    }
    return found.sort((a, b) => String(b.modified ?? "").localeCompare(String(a.modified ?? "")));
}

async function discoverReports() {
    const dirs = await walkDirectories(roots);
    const found = [];
    for (const dir of dirs) {
        const files = [];
        for (const name of REPORT_FILES) {
            if (await isFile(path.join(dir, name))) files.push(name);
        }
        if (files.length === 0) continue;
        let modified = null;
        try {
            modified = (await stat(path.join(dir, files[0]))).mtime.toISOString();
        } catch {
            /* leave null */
        }
        found.push({ dir, label: relativePath(dir), files, modified, complete: files.length === REPORT_FILES.length });
    }
    return found.sort((a, b) => String(b.modified ?? "").localeCompare(String(a.modified ?? "")));
}

async function discoverCollectorZips() {
    const dirs = await walkDirectories(roots, { maxDepth: 5, limit: 500 });
    const found = [];
    for (const dir of dirs) {
        let entries;
        try {
            entries = await readdir(dir, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".zip")) continue;
            const file = path.join(dir, entry.name);
            let modified = null;
            try {
                modified = (await stat(file)).mtime.toISOString();
            } catch {
                /* leave null */
            }
            found.push({ file, label: relativePath(file), modified });
        }
    }
    return found.sort((a, b) => String(b.modified ?? "").localeCompare(String(a.modified ?? "")));
}

function normalizeInput(input = {}, { partial = false } = {}) {
    const clean = (value) => {
        if (typeof value !== "string") return "";
        const trimmed = value.trim();
        if (/^<[^>]+>$/.test(trimmed)) return "";
        return trimmed;
    };
    const normalized = {};
    const set = (key, value) => {
        if (!partial || Object.hasOwn(input, key)) normalized[key] = value;
    };
    set("evidenceDir", resolvePath(input.evidenceDir));
    set("reportDir", resolvePath(input.reportDir));
    set("resourceGroup", clean(input.resourceGroup));
    set("subscription", clean(input.subscription));
    set("mode", input.mode === "automatic" ? "automatic" : "manual");
    set("environment", clean(input.environment));
    set("rto", clean(input.rto));
    set("rpo", clean(input.rpo));
    return normalized;
}

function createRunId() {
    return `run-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
}

function emptyRun(input = {}) {
    const runId = input.runId || createRunId();
    const now = new Date().toISOString();
    return {
        runId,
        createdAt: input.createdAt || now,
        updatedAt: now,
        input: normalizeInput(input),
        outputs: {},
        logs: [],
        subscriptions: [],
        resourceGroups: [],
    };
}

function runSummary(run) {
    return {
        runId: run.runId,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
        subscription: run.input?.subscription || "",
        resourceGroup: run.input?.resourceGroup || "",
        evidenceDir: run.input?.evidenceDir ? relativePath(run.input.evidenceDir) : "",
        reportDir: run.input?.reportDir ? relativePath(run.input.reportDir) : "",
        logCount: run.logs?.length ?? 0,
    };
}

function runsStorePath() {
    return path.resolve(roots.at(-1) || roots[0], RUNS_FILE);
}

async function loadRunStore() {
    try {
        return JSON.parse(await readFile(runsStorePath(), "utf8"));
    } catch {
        return { currentRunId: "", runs: [] };
    }
}

async function saveRunStore(store) {
    const file = runsStorePath();
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(store, null, 2), "utf8");
}

function scriptPath(name) {
    return path.resolve(roots[0], "Review", "PSScripts", name);
}

function outputRoot(...parts) {
    return path.resolve(roots[0], ...parts);
}

function uniqueStamp() {
    return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function childProcessEnv() {
    const allowed = new Set([
        "APPDATA",
        "COMSPEC",
        "HOME",
        "HOMEDRIVE",
        "HOMEPATH",
        "LOCALAPPDATA",
        "NUMBER_OF_PROCESSORS",
        "OS",
        "PATH",
        "PATHEXT",
        "PROGRAMDATA",
        "PROGRAMFILES",
        "PROGRAMFILES(X86)",
        "PSMODULEPATH",
        "SYSTEMDRIVE",
        "SYSTEMROOT",
        "TEMP",
        "TMP",
        "USERDOMAIN",
        "USERNAME",
        "USERPROFILE",
        "WINDIR",
    ]);
    const env = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (allowed.has(key.toUpperCase())) {
            env[key] = value;
        }
    }
    env.AZURE_CORE_COLLECT_TELEMETRY = "false";
    return env;
}

function runPowerShell(script, args = [], onLine = () => {}) {
    const scriptFullPath = scriptPath(script);
    const argv = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptFullPath, ...args];
    return new Promise((resolve, reject) => {
        let stdout = "";
        let stderr = "";
        const child = spawn("pwsh", argv, { cwd: roots[0], env: childProcessEnv(), windowsHide: true });
        child.stdout.on("data", (chunk) => {
            const text = chunk.toString();
            stdout += text;
            for (const line of text.split(/\r?\n/).filter(Boolean)) onLine(line);
        });
        child.stderr.on("data", (chunk) => {
            const text = chunk.toString();
            stderr += text;
            for (const line of text.split(/\r?\n/).filter(Boolean)) onLine(line);
        });
        child.on("error", reject);
        child.on("close", (code) => {
            if (code !== 0) {
                reject(new Error(stderr || stdout || `${script} failed with exit code ${code}`));
                return;
            }
            const jsonStart = stdout.search(/[\[{]/);
            const payload = jsonStart >= 0 ? stdout.slice(jsonStart).trim() : stdout.trim();
            try {
                resolve(payload ? JSON.parse(payload) : {});
            } catch {
                resolve({ raw: stdout.trim(), stderr: stderr.trim() });
            }
        });
    });
}

function runPwshCommand(command, onLine = () => {}) {
    return new Promise((resolve, reject) => {
        let stdout = "";
        let stderr = "";
        const child = spawn("pwsh", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], { cwd: roots[0], env: childProcessEnv(), windowsHide: true });
        child.stdout.on("data", (chunk) => {
            const text = chunk.toString();
            stdout += text;
            for (const line of text.split(/\r?\n/).filter(Boolean)) onLine(line);
        });
        child.stderr.on("data", (chunk) => {
            const text = chunk.toString();
            stderr += text;
            for (const line of text.split(/\r?\n/).filter(Boolean)) onLine(line);
        });
        child.on("error", reject);
        child.on("close", (code) => {
            if (code !== 0) reject(new Error(stderr || stdout || `PowerShell command failed with exit code ${code}`));
            else resolve({ stdout, stderr });
        });
    });
}

function phaseOutputKey(id) {
    return id.replace(/-/g, "_");
}

function phaseCommands(input, discovered, outputs) {
    const sub = input.subscription || "<subscription-id>";
    const rg = input.resourceGroup || "<resource-group-name>";
    const evidence = input.evidenceDir ? relativePath(input.evidenceDir) : outputs.collect?.outputDirectory ? relativePath(outputs.collect.outputDirectory) : `Evidence\\wordpress-posture-${rg}`;
    const matchedZip = matchingRunZip(input, discovered, outputs);
    const zip = matchedZip ? relativePath(matchedZip) : `Evidence\\wordpress-posture-${rg}.zip`;
    const extracted = outputs.prepare_assessment?.evidenceDir
        ? relativePath(outputs.prepare_assessment.evidenceDir)
        : input.evidenceDir
          ? relativePath(input.evidenceDir)
          : "Evidence\\Extracted\\<collector-folder>";
    const report = input.reportDir ? relativePath(input.reportDir) : discovered.reports[0]?.label ?? "Review\\reports\\<evidence-folder-name>-reports";
    const context = [
        input.environment ? `This is a ${input.environment} environment.` : null,
        input.rto ? `RTO is ${input.rto}.` : null,
        input.rpo ? `RPO is ${input.rpo}.` : null,
    ]
        .filter(Boolean)
        .join(" ");

    return {
        dependencies: ".\\Review\\PSScripts\\Test-WafReviewPrerequisites.ps1",
        connect: ".\\Review\\PSScripts\\Get-WafReviewAzureScope.ps1",
        preassess: `.\\Review\\PSScripts\\Get-WafReviewResourceInventory.ps1 -Subscription "${sub}" -ResourceGroup "${rg}" -OutputDirectory ".\\Review\\pre-assessment"`,
        collect: `.\\Review\\PSScripts\\Invoke-CollectWordPressPosture.ps1 -Subscription "${sub}" -ResourceGroup "${rg}" -OutputDirectory ".\\${evidence}"`,
        package: `Collector package: ${zip}`,
        prepareAssessment: `Expand-Archive -LiteralPath ".\\${zip}" -DestinationPath ".\\Evidence\\Extracted" -Force`,
        reviewPrompt: `/wordpress-waf-review Run the WordPress Well-Architected Framework review using evidence in ${extracted}.\nWrite all reports and the PowerPoint deck to the default output directory.${context ? `\n${context}` : ""}`,
        dashboard: `open_canvas({ canvasId: "waf-review-dashboard", instanceId: "waf-review", input: { reportDir: "${report}" } })`,
    };
}

function matchingRunZip(input, discovered, outputs) {
    if (outputs.package?.zipFile) return outputs.package.zipFile;
    if (outputs.collect?.zipFile) return outputs.collect.zipFile;
    const evidenceDir = outputs.collect?.outputDirectory || input.evidenceDir;
    if (!evidenceDir) return "";
    const evidenceName = path.basename(evidenceDir);
    return discovered.zips.find((zip) => path.basename(zip.file || zip.label || "").startsWith(`${evidenceName}-`))?.file || "";
}

function statusFromOutput(phase, input, discovered, outputs, runningPhase) {
    if (runningPhase === phase.id) return "running";
    if (phase.id === "package" && matchingRunZip(input, discovered, outputs)) return "done";
    if (phase.id === "assessment" && outputs.assessment?.waitingForSkill) return "ready";
    if (outputs[phaseOutputKey(phase.id)]?.ok === false) return "failed";
    if (outputs[phaseOutputKey(phase.id)]?.ok === true) return "done";
    if (phase.id === "connect" && input.subscription && input.resourceGroup) return "done";
    if (phase.id === "assessment" && discovered.reports.length > 0) return "done";
    if (phase.id === "display" && discovered.reports.length > 0) return "ready";
    return "pending";
}

function derivePhaseState(input, discovered, outputs, runningPhase) {
    const raw = PHASES.map((phase) => ({ ...phase, status: statusFromOutput(phase, input, discovered, outputs, runningPhase) }));
    const connected = Boolean(input.subscription && input.resourceGroup);
    if (connected && !outputs.connect) {
        const connect = raw.find((phase) => phase.id === "connect");
        if (connect) connect.status = "done";
    }
    const preassess = raw.find((phase) => phase.id === "preassess");
    if (connected && preassess?.status === "pending") preassess.status = "current";
    let blocked = false;
    return raw.map((phase) => {
        if (phase.status === "failed") blocked = true;
        if (blocked && phase.status === "pending") return { ...phase, status: "blocked" };
        if (phase.status === "pending") {
            const firstPending = raw.find((candidate) => candidate.status === "pending");
            if (firstPending?.id === phase.id) return { ...phase, status: "current" };
        }
        return phase;
    });
}

async function buildDiscovery(input, outputs) {
    const discovered = {
        collector: { path: "Review\\PSScripts\\Invoke-CollectWordPressPosture.ps1", present: await isFile(scriptPath("Invoke-CollectWordPressPosture.ps1")) },
        prerequisitesScript: { path: "Review\\PSScripts\\Test-WafReviewPrerequisites.ps1", present: await isFile(scriptPath("Test-WafReviewPrerequisites.ps1")) },
        scopeScript: { path: "Review\\PSScripts\\Get-WafReviewAzureScope.ps1", present: await isFile(scriptPath("Get-WafReviewAzureScope.ps1")) },
        inventoryScript: { path: "Review\\PSScripts\\Get-WafReviewResourceInventory.ps1", present: await isFile(scriptPath("Get-WafReviewResourceInventory.ps1")) },
        evidence: await discoverEvidence(),
        zips: await discoverCollectorZips(),
        reports: await discoverReports(),
    };

    if (input.evidenceDir && (await isDirectory(input.evidenceDir))) {
        discovered.evidence.unshift({ dir: input.evidenceDir, label: relativePath(input.evidenceDir), manifest: relativePath(path.join(input.evidenceDir, "collection-manifest.json")), modified: null });
    }
    if (outputs.collect?.outputDirectory && (await isDirectory(outputs.collect.outputDirectory))) {
        discovered.evidence.unshift({ dir: outputs.collect.outputDirectory, label: relativePath(outputs.collect.outputDirectory), manifest: relativePath(path.join(outputs.collect.outputDirectory, "collection-manifest.json")), modified: null });
    }
    if (outputs.collect?.zipFile && (await isFile(outputs.collect.zipFile))) {
        discovered.zips.unshift({ file: outputs.collect.zipFile, label: relativePath(outputs.collect.zipFile), modified: null });
    }
    if (input.reportDir && (await isDirectory(input.reportDir))) {
        const files = [];
        for (const file of REPORT_FILES) if (await isFile(path.join(input.reportDir, file))) files.push(file);
        discovered.reports.unshift({ dir: input.reportDir, label: relativePath(input.reportDir), files, complete: files.length === REPORT_FILES.length, modified: null });
    }
    return discovered;
}

async function findExtractedEvidence(dir) {
    const dirs = await walkDirectories([dir], { maxDepth: 4, limit: 80 });
    for (const candidate of dirs) {
        if (await isFile(path.join(candidate, "collection-manifest.json"))) return candidate;
    }
    return null;
}

async function countJsonFiles(dir) {
    if (!dir || !(await isDirectory(dir))) return 0;
    let count = 0;
    const dirs = await walkDirectories([dir], { maxDepth: 5, limit: 300 });
    for (const candidate of dirs) {
        let entries;
        try {
            entries = await readdir(candidate, { withFileTypes: true });
        } catch {
            continue;
        }
        count += entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json")).length;
    }
    return count;
}

function sendJson(res, statusCode, body) {
    const payload = JSON.stringify(body);
    res.writeHead(statusCode, {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(payload),
    });
    res.end(payload);
}

function readBody(req) {
    return new Promise((resolve) => {
        let raw = "";
        req.on("data", (chunk) => {
            raw += chunk;
            if (raw.length > 1_000_000) req.destroy();
        });
        req.on("end", () => {
            try {
                resolve(raw ? JSON.parse(raw) : {});
            } catch {
                resolve({});
            }
        });
    });
}

class WorkflowInstance {
    constructor({ instanceId, input }) {
        this.instanceId = instanceId;
        this.runs = [];
        this.currentRun = emptyRun(input);
        this.input = this.currentRun.input;
        this.outputs = this.currentRun.outputs;
        this.logs = this.currentRun.logs;
        this.runningPhase = null;
        this.state = null;
        this.server = null;
        this.url = null;
        this.clients = new Set();
        this.subscriptions = this.currentRun.subscriptions;
        this.resourceGroups = this.currentRun.resourceGroups;
        this.loadedRuns = false;
    }

    async loadRuns() {
        if (this.loadedRuns) return;
        this.loadedRuns = true;
        const store = await loadRunStore();
        this.runs = Array.isArray(store.runs) ? store.runs : [];
        if (this.runs.length === 0) this.runs = [this.currentRun];
        const selectedRun = this.runs.find((run) => run.runId === store.currentRunId) ?? this.runs[0];
        this.useRun(selectedRun);
        await this.persistRuns();
    }

    useRun(run) {
        this.currentRun = {
            ...emptyRun({ runId: run.runId, createdAt: run.createdAt }),
            ...run,
            input: normalizeInput(run.input ?? {}),
            outputs: run.outputs ?? {},
            logs: Array.isArray(run.logs) ? run.logs : [],
            subscriptions: Array.isArray(run.subscriptions) ? run.subscriptions : [],
            resourceGroups: Array.isArray(run.resourceGroups) ? run.resourceGroups : [],
        };
        this.input = this.currentRun.input;
        this.outputs = this.currentRun.outputs;
        this.logs = this.currentRun.logs;
        this.subscriptions = this.currentRun.subscriptions;
        this.resourceGroups = this.currentRun.resourceGroups;
    }

    captureRun() {
        this.currentRun.updatedAt = new Date().toISOString();
        this.currentRun.input = this.input;
        this.currentRun.outputs = this.outputs;
        this.currentRun.logs = this.logs;
        this.currentRun.subscriptions = this.subscriptions;
        this.currentRun.resourceGroups = this.resourceGroups;
        const existing = this.runs.findIndex((run) => run.runId === this.currentRun.runId);
        if (existing >= 0) this.runs[existing] = this.currentRun;
        else this.runs.unshift(this.currentRun);
        this.runs = this.runs.sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""))).slice(0, 30);
    }

    async persistRuns() {
        this.captureRun();
        await saveRunStore({ currentRunId: this.currentRun.runId, runs: this.runs });
    }

    async resetRun() {
        await this.loadRuns();
        await this.persistRuns();
        const carryForward = {
            mode: this.input.mode,
            environment: this.input.environment,
            rto: this.input.rto,
            rpo: this.input.rpo,
        };
        const nextRun = emptyRun(carryForward);
        this.runs.unshift(nextRun);
        this.useRun(nextRun);
        this.state = null;
        this.addLog("workflow", `Started new run ${nextRun.runId}.`);
        await this.persistRuns();
        return this.refresh();
    }

    async switchRun(runId) {
        await this.loadRuns();
        const run = this.runs.find((candidate) => candidate.runId === runId);
        if (!run) throw new CanvasError("run_unknown", `No workflow run found for "${runId}".`);
        await this.persistRuns();
        this.useRun(run);
        this.state = null;
        await this.persistRuns();
        return this.refresh();
    }

    addLog(phase, message) {
        this.logs.push({ at: new Date().toISOString(), phase, message: String(message).slice(0, 1000) });
        this.logs = this.logs.slice(-120);
        this.currentRun.logs = this.logs;
        this.broadcast();
    }

    async refresh(input = null) {
        await this.loadRuns();
        if (input) this.input = { ...this.input, ...normalizeInput(input, { partial: true }) };
        await this.enrichPreparedEvidence();
        await this.ensureCurrentSubscription();
        const discovered = await buildDiscovery(this.input, this.outputs);
        const commands = phaseCommands(this.input, discovered, this.outputs);
        const phases = derivePhaseState(this.input, discovered, this.outputs, this.runningPhase);
        const current = phases.find((phase) => phase.status === "running") ?? phases.find((phase) => phase.status === "current") ?? phases.find((phase) => phase.status === "ready") ?? phases.at(-1);
        this.state = {
            roots,
            mode: this.input.mode,
            context: {
                ...this.input,
                evidenceDir: this.input.evidenceDir ? relativePath(this.input.evidenceDir) : "",
                reportDir: this.input.reportDir ? relativePath(this.input.reportDir) : "",
            },
            discovered,
            phases,
            currentPhase: current?.id ?? "dependencies",
            commands,
            outputs: this.outputs,
            logs: this.logs,
            subscriptions: this.subscriptions,
            resourceGroups: this.resourceGroups,
            run: runSummary(this.currentRun),
            runs: this.runs.map(runSummary),
            updatedAt: new Date().toISOString(),
        };
        await this.persistRuns();
        this.broadcast();
        return this.state;
    }

    async enrichPreparedEvidence() {
        const prepared = this.outputs.prepare_assessment;
        if (!prepared?.evidenceDir) return;
        if (!this.input.evidenceDir) this.input.evidenceDir = path.resolve(prepared.evidenceDir);
        if (!prepared.manifest) prepared.manifest = path.join(prepared.evidenceDir, "collection-manifest.json");
        if (!prepared.jsonFileCount) prepared.jsonFileCount = await countJsonFiles(prepared.evidenceDir);
    }

    async ensureCurrentSubscription() {
        if (this.input.subscription) return;
        if (this.subscriptions.length > 0) {
            const subscription = this.subscriptions.find((item) => item.isDefault) ?? this.subscriptions[0];
            if (subscription?.id) this.input.subscription = subscription.id;
            return;
        }
        try {
            const result = await runPowerShell("Get-WafReviewAzureScope.ps1", ["-Current"], (line) => this.addLog("connect", line));
            const subscription = result.subscription;
            if (subscription?.id) {
                this.input.subscription = subscription.id;
                this.subscriptions = [subscription];
                this.addLog("connect", `Detected current az subscription "${subscription.name}" [${subscription.id}].`);
            }
        } catch (cause) {
            this.addLog("connect", `Could not detect current az subscription: ${cause.message}`);
        }
    }

    snapshot() {
        return this.state;
    }

    async listSubscriptions() {
        const result = await runPowerShell("Get-WafReviewAzureScope.ps1", [], (line) => this.addLog("connect", line));
        this.subscriptions = result.subscriptions ?? [];
        await this.refresh();
        return this.subscriptions;
    }

    async listResourceGroups(subscription) {
        const selected = subscription || this.input.subscription;
        if (!selected) throw new CanvasError("subscription_required", "Select a subscription first.");
        const result = await runPowerShell("Get-WafReviewAzureScope.ps1", ["-Subscription", selected], (line) => this.addLog("connect", line));
        this.input.subscription = selected;
        this.resourceGroups = result.resourceGroups ?? [];
        await this.refresh();
        return this.resourceGroups;
    }

    async setScope(input = {}) {
        if (input.subscription) this.input.subscription = input.subscription;
        if (input.resourceGroup) this.input.resourceGroup = input.resourceGroup;
        if (input.mode === "automatic" || input.mode === "manual") this.input.mode = input.mode;
        this.outputs.connect = { ok: Boolean(this.input.subscription && this.input.resourceGroup), subscription: this.input.subscription, resourceGroup: this.input.resourceGroup };
        this.addLog("connect", `Selected subscription "${this.input.subscription || "(none)"}" and resource group "${this.input.resourceGroup || "(none)"}".`);
        return this.refresh();
    }

    async runPhase(phaseId) {
        if (this.runningPhase) throw new CanvasError("phase_running", `Phase "${this.runningPhase}" is already running.`);
        const phase = PHASES.find((item) => item.id === phaseId);
        if (!phase) throw new CanvasError("phase_unknown", `Unknown phase "${phaseId}".`);

        this.runningPhase = phaseId;
        this.addLog(phaseId, `Starting ${phase.title}.`);
        await this.refresh();

        try {
            const result = await this.executePhase(phaseId);
            const waiting = result?.waitingForSkill === true;
            this.outputs[phaseOutputKey(phaseId)] = { ok: !waiting, ...result };
            this.addLog(phaseId, waiting ? `Skill request was sent to Copilot. Refresh this step after the reports are generated.` : `Completed ${phase.title}.`);
        } catch (cause) {
            this.outputs[phaseOutputKey(phaseId)] = { ok: false, error: cause.message };
            this.addLog(phaseId, `Failed: ${cause.message}`);
            throw cause;
        } finally {
            this.runningPhase = null;
            await this.refresh();
        }

        return this.snapshot();
    }

    async executePhase(phaseId) {
        if (phaseId === "dependencies") {
            return { result: await runPowerShell("Test-WafReviewPrerequisites.ps1", [], (line) => this.addLog(phaseId, line)) };
        }
        if (phaseId === "connect") {
            if (!this.input.subscription || !this.input.resourceGroup) {
                throw new Error("Select a subscription and resource group before completing this phase.");
            }
            return { subscription: this.input.subscription, resourceGroup: this.input.resourceGroup };
        }
        if (phaseId === "preassess") {
            this.requireScope();
            const out = outputRoot("Review", "pre-assessment");
            await mkdir(out, { recursive: true });
            return await runPowerShell(
                "Get-WafReviewResourceInventory.ps1",
                ["-Subscription", this.input.subscription, "-ResourceGroup", this.input.resourceGroup, "-OutputDirectory", out],
                (line) => this.addLog(phaseId, line),
            );
        }
        if (phaseId === "collect") {
            this.requireScope();
            const safeRg = this.input.resourceGroup.replace(/[^A-Za-z0-9_.-]/g, "-");
            const out = outputRoot("Evidence", `wordpress-posture-${safeRg}-${uniqueStamp()}`);
            await mkdir(path.dirname(out), { recursive: true });
            const result = await runPowerShell(
                "Invoke-CollectWordPressPosture.ps1",
                ["-Subscription", this.input.subscription, "-ResourceGroup", this.input.resourceGroup, "-OutputDirectory", out],
                (line) => this.addLog(phaseId, line),
            );
            this.input.evidenceDir = result.outputDirectory ? path.resolve(result.outputDirectory) : out;
            return { ...result, outputDirectory: this.input.evidenceDir, zipFile: result.zipFile ? path.resolve(result.zipFile) : null };
        }
        if (phaseId === "package") {
            const discovered = await buildDiscovery(this.input, this.outputs);
            const zipFile = matchingRunZip(this.input, discovered, this.outputs);
            if (!zipFile || !(await isFile(zipFile))) throw new Error("Collector ZIP was not found. Run Collect Data first.");
            return { zipFile, label: relativePath(zipFile) };
        }
        if (phaseId === "prepare-assessment") {
            const zipFile = this.outputs.collect?.zipFile || (await discoverCollectorZips())[0]?.file;
            if (!zipFile) throw new Error("No collector ZIP is available to extract.");
            const target = outputRoot("Evidence", "Extracted", path.basename(zipFile, ".zip"));
            await rm(target, { recursive: true, force: true });
            await mkdir(target, { recursive: true });
            await runPwshCommand(`Expand-Archive -LiteralPath ${JSON.stringify(zipFile)} -DestinationPath ${JSON.stringify(target)} -Force`, (line) => this.addLog(phaseId, line));
            const evidenceDir = await findExtractedEvidence(target);
            if (!evidenceDir) throw new Error("The extracted archive did not contain collection-manifest.json.");
            const jsonFileCount = await countJsonFiles(evidenceDir);
            if (jsonFileCount === 0) throw new Error(`The extracted evidence folder contains no JSON files: ${evidenceDir}`);
            this.input.evidenceDir = evidenceDir;
            return { zipFile, extractDirectory: target, evidenceDir, manifest: path.join(evidenceDir, "collection-manifest.json"), jsonFileCount };
        }
        if (phaseId === "assessment") {
            const reports = await discoverReports();
            if (reports.length > 0) return { reportDir: reports[0].dir, prompt: this.state?.commands?.reviewPrompt };
            const prompt = this.state?.commands?.reviewPrompt || phaseCommands(this.input, await buildDiscovery(this.input, this.outputs), this.outputs).reviewPrompt;
            const evidenceDir = this.input.evidenceDir || this.outputs.prepare_assessment?.evidenceDir;
            if (!evidenceDir) throw new Error("Run Step 6 first so the collector ZIP is extracted before assessment.");
            const messageId = await session.send({ prompt });
            return { waitingForSkill: true, skillSubmitted: true, submittedAt: new Date().toISOString(), messageId, prompt, evidenceDir };
        }
        if (phaseId === "display") {
            const reports = await discoverReports();
            if (reports.length === 0) throw new Error("No report directory was found. Run the assessment skill first.");
            this.input.reportDir = reports[0].dir;
            return { reportDir: reports[0].dir, dashboardCommand: phaseCommands(this.input, await buildDiscovery(this.input, this.outputs), this.outputs).dashboard };
        }
        return {};
    }

    requireScope() {
        if (!this.input.subscription || !this.input.resourceGroup) throw new Error("Select a subscription and resource group first.");
    }

    async runNext() {
        if (!this.state) await this.refresh();
        const next = this.state.phases.find((phase) => ["current", "ready"].includes(phase.status));
        if (!next) return this.snapshot();
        return this.runPhase(next.id);
    }

    async runAutomatic() {
        this.input.mode = "automatic";
        await this.refresh();
        for (;;) {
            const next = this.state.phases.find((phase) => ["current", "ready"].includes(phase.status));
            if (!next) return this.snapshot();
            if (next.id === "connect") return this.snapshot();
            await this.runPhase(next.id);
            if (next.id === "assessment") return this.snapshot();
        }
    }

    async start() {
        if (this.server) return this;
        const server = createServer((req, res) => {
            this.handle(req, res).catch((cause) => {
                if (!res.headersSent) sendJson(res, 500, { error: String(cause?.message ?? cause) });
                else res.end();
            });
        });
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
        const address = server.address();
        this.server = server;
        this.url = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/`;
        return this;
    }

    async stop() {
        for (const client of this.clients) {
            try {
                client.end();
            } catch {
                /* already gone */
            }
        }
        this.clients.clear();
        if (this.server) {
            const server = this.server;
            this.server = null;
            await new Promise((resolve) => server.close(() => resolve()));
        }
    }

    broadcast() {
        const frame = `data: ${JSON.stringify({ type: "state", at: Date.now() })}\n\n`;
        for (const client of this.clients) {
            try {
                client.write(frame);
            } catch {
                this.clients.delete(client);
            }
        }
    }

    async handle(req, res) {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (url.pathname === "/" || url.pathname === "/index.html") {
            const body = renderHtml();
            res.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "text/html; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
            res.end(body);
            return;
        }
        if (url.pathname === "/favicon.ico") {
            res.writeHead(204).end();
            return;
        }
        if (url.pathname === "/api/state") {
            if (!this.state) await this.refresh();
            sendJson(res, 200, this.snapshot());
            return;
        }
        if (url.pathname === "/api/refresh" && req.method === "POST") {
            sendJson(res, 200, await this.refresh(await readBody(req)));
            return;
        }
        if (url.pathname === "/api/reset-run" && req.method === "POST") {
            sendJson(res, 200, await this.resetRun());
            return;
        }
        if (url.pathname === "/api/switch-run" && req.method === "POST") {
            const body = await readBody(req);
            sendJson(res, 200, await this.switchRun(body.runId));
            return;
        }
        if (url.pathname === "/api/subscriptions") {
            sendJson(res, 200, { subscriptions: await this.listSubscriptions() });
            return;
        }
        if (url.pathname === "/api/resource-groups") {
            sendJson(res, 200, { resourceGroups: await this.listResourceGroups(url.searchParams.get("subscription")) });
            return;
        }
        if (url.pathname === "/api/scope" && req.method === "POST") {
            sendJson(res, 200, await this.setScope(await readBody(req)));
            return;
        }
        if (url.pathname === "/api/run-phase" && req.method === "POST") {
            const body = await readBody(req);
            sendJson(res, 200, await this.runPhase(body.phaseId));
            return;
        }
        if (url.pathname === "/api/run-next" && req.method === "POST") {
            sendJson(res, 200, await this.runNext());
            return;
        }
        if (url.pathname === "/api/run-automatic" && req.method === "POST") {
            sendJson(res, 200, await this.runAutomatic());
            return;
        }
        if (url.pathname === "/events") {
            res.writeHead(200, { "Cache-Control": "no-cache", Connection: "keep-alive", "Content-Type": "text/event-stream" });
            res.write(": connected\n\n");
            this.clients.add(res);
            const keepAlive = setInterval(() => {
                try {
                    res.write(": ping\n\n");
                } catch {
                    /* dropped */
                }
            }, 25_000);
            req.on("close", () => {
                clearInterval(keepAlive);
                this.clients.delete(res);
            });
            return;
        }
        sendJson(res, 404, { error: "Not found" });
    }
}

function renderHtml() {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>WordPress WAF workflow</title>
  <style>
    :root {
      --surface: var(--background-color-default, #fff);
      --surface-subtle: var(--background-color-muted, #f6f8fa);
      --line: var(--border-color-default, #d1d9e0);
      --ink: var(--text-color-default, #1f2328);
      --muted: var(--text-color-muted, #59636e);
      --accent: var(--true-color-blue, #0969da);
      --accent-muted: var(--true-color-blue-muted, rgba(9, 105, 218, .13));
      --green: var(--true-color-green, #1a7f37);
      --green-muted: var(--true-color-green-muted, rgba(26, 127, 55, .16));
      --yellow: var(--true-color-yellow, #bf8700);
      --red: var(--true-color-red, #cf222e);
      --radius: 14px;
    }
    * { box-sizing: border-box; }
    body { margin: 0; color: var(--ink); background: var(--surface); font: var(--text-body-medium, 14px)/var(--leading-body-medium, 20px) var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif); }
    header { position: sticky; top: 0; z-index: 5; padding: 18px 20px 12px; border-bottom: 1px solid var(--line); display: grid; gap: 12px; background: var(--surface); box-shadow: 0 8px 24px rgba(0,0,0,.04); }
    h1, h2, h3 { margin: 0; font-weight: var(--font-weight-semibold, 600); }
    h1 { font-size: var(--text-title-large, 24px); line-height: 30px; }
    h2 { font-size: var(--text-title-medium, 18px); }
    h3 { font-size: var(--text-title-small, 15px); }
    p { margin: 0; }
    button, select { border: 1px solid var(--line); border-radius: 10px; color: var(--ink); background: var(--surface); padding: 7px 10px; font: inherit; }
    button { cursor: pointer; }
    button.primary { border-color: var(--accent); background: var(--accent-muted); color: var(--accent); }
    button.danger { border-color: var(--red); color: var(--red); }
    button:disabled, select:disabled { opacity: .55; cursor: not-allowed; }
    pre, code { font-family: var(--font-mono, "SFMono-Regular", Consolas, monospace); font-size: var(--text-code-inline, 12px); }
    pre { margin: 0; padding: 12px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface-subtle); white-space: pre-wrap; overflow: auto; max-height: 230px; }
    .muted { color: var(--muted); }
    .wrap { padding: 18px 20px 36px; }
    .hero { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 14px; align-items: start; }
    .actions, .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .run-controls { display: grid; grid-template-columns: minmax(220px, 360px) auto; gap: 8px; align-items: end; }
    .run-controls label { display: grid; gap: 5px; }
    .run-controls select { width: 100%; }
    .card { border: 1px solid var(--line); border-radius: var(--radius); padding: 14px; background: var(--surface); display: grid; gap: 10px; }
    .layout { display: grid; grid-template-columns: minmax(300px, 380px) minmax(420px, 1fr); gap: 18px; align-items: start; }
    .workflow-pane, .details-pane { display: grid; gap: 14px; }
    .workflow-pane { position: sticky; top: 132px; max-height: calc(100vh - 156px); overflow: auto; padding-right: 4px; }
    .details-pane { min-width: 0; }
    .grid { display: grid; grid-template-columns: 1fr; gap: 14px; align-items: start; }
    .focus-grid { display: grid; grid-template-columns: 1fr; gap: 14px; align-items: start; }
    .topology { display: grid; gap: 12px; }
    .sequence { display: grid; grid-template-columns: 1fr; gap: 12px; padding: 4px 0; }
    .phase { width: 100%; border: 1px solid var(--line); border-radius: 18px; padding: 13px; background: linear-gradient(135deg, var(--surface-subtle), transparent 48%), var(--surface); display: grid; grid-template-columns: auto minmax(0,1fr); gap: 10px 12px; text-align: left; cursor: pointer; position: relative; }
    .phase:not(:last-child)::after { content: ""; position: absolute; top: calc(100% + 1px); left: 31px; height: 12px; border-left: 2px solid var(--line); }
    .phase-main { display: grid; gap: 6px; min-width: 0; }
    .phase-main p { display: none; }
    .phase[data-status="running"], .phase[data-status="current"], .phase[data-status="ready"] { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent), 0 8px 22px rgba(9,105,218,.12); }
    .phase[data-status="done"] {
      border-color: var(--green);
      background:
        radial-gradient(circle at top left, color-mix(in srgb, var(--green-muted) 92%, transparent), transparent 52%),
        linear-gradient(135deg, color-mix(in srgb, var(--green-muted) 88%, var(--surface)), color-mix(in srgb, var(--green-muted) 48%, var(--surface)) 60%, var(--surface));
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--green) 58%, transparent), 0 10px 24px rgba(26,127,55,.14);
    }
    .phase[data-status="failed"] { border-color: var(--red); }
    .phase[data-status="blocked"] { opacity: .55; }
    .phase[aria-pressed="true"] { outline: 3px solid var(--accent-muted); }
    .phase-action { grid-column: 1 / -1; margin-top: 2px; justify-self: start; font-size: 12px; padding: 4px 8px; border-color: var(--accent); color: var(--accent); background: var(--accent-muted); }
    .phase-action.done { border-color: var(--green); color: var(--green); background: color-mix(in srgb, var(--green-muted) 80%, var(--surface)); }
    .phase-inline { grid-column: 1 / -1; display: grid; gap: 5px; margin-top: 2px; }
    .phase[data-status="running"] .phase-inline { padding-top: 4px; }
    .mini-check { display: grid; grid-template-columns: auto minmax(0,1fr); gap: 6px; align-items: center; font-size: 12px; }
    .mini-mark { width: 17px; height: 17px; border-radius: 50%; display: grid; place-items: center; border: 1px solid var(--line); font-weight: 700; font-size: 11px; }
    .mini-check.ok .mini-mark { color: var(--green); border-color: var(--green); }
    .mini-check.fail .mini-mark { color: var(--red); border-color: var(--red); }
    .node { width: 42px; height: 42px; border-radius: 15px; display: grid; place-items: center; border: 1px solid var(--line); background: var(--surface); font-weight: 800; color: var(--muted); font-size: 18px; box-shadow: 0 8px 18px rgba(0,0,0,.05); }
    .node .glyph { font-size: 22px; line-height: 1; }
    .phase[data-status="done"] .node { color: var(--green); border-color: var(--green); background: color-mix(in srgb, var(--green-muted) 75%, var(--surface)); }
    .phase[data-status="running"] .node, .phase[data-status="current"] .node, .phase[data-status="ready"] .node { color: var(--accent); border-color: var(--accent); background: var(--accent-muted); }
    .badge { width: fit-content; border: 1px solid var(--line); border-radius: 999px; padding: 2px 8px; font-size: 12px; color: var(--muted); }
    .badge.done { color: var(--green); border-color: var(--green); }
    .badge.running, .badge.current, .badge.ready { color: var(--accent); border-color: var(--accent); background: var(--accent-muted); }
    .badge.failed { color: var(--red); border-color: var(--red); }
    .scope { display: grid; grid-template-columns: 1fr; gap: 10px; }
    .scope label { display: grid; gap: 5px; }
    .scope select { width: 100%; }
    .progress { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 14px; align-items: center; padding: 14px; border: 1px solid var(--line); border-radius: 18px; background: radial-gradient(circle at top left, var(--accent-muted), transparent 38%), var(--surface); }
    .ring { --deg: 0deg; width: 74px; height: 74px; border-radius: 50%; background: conic-gradient(var(--accent) var(--deg), var(--surface-subtle) 0); display: grid; place-items: center; position: relative; }
    .ring::after { content: ""; position: absolute; inset: 8px; border-radius: 50%; background: var(--surface); border: 1px solid var(--line); }
    .ring strong { position: relative; z-index: 1; font-size: 18px; }
    .bar { height: 10px; border: 1px solid var(--line); background: var(--surface-subtle); border-radius: 999px; overflow: hidden; }
    .bar span { display: block; height: 100%; width: var(--pct, 0%); background: linear-gradient(90deg, var(--accent), var(--green)); }
    .metrics { display: grid; grid-template-columns: repeat(3, minmax(80px, 1fr)); gap: 8px; }
    .metric { border: 1px solid var(--line); border-radius: 10px; padding: 8px; }
    .metric strong { display: block; font-size: 20px; }
    .detail-head { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px; align-items: center; }
    .detail-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .list { display: grid; gap: 8px; }
    .item { border: 1px solid var(--line); border-radius: 10px; padding: 9px 10px; display: grid; gap: 2px; }
    .check-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 8px; }
    .check { border: 1px solid var(--line); border-radius: 10px; padding: 10px; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px; align-items: start; }
    .mark { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; border: 1px solid var(--line); font-weight: 700; }
    .check.ok .mark { color: var(--green); border-color: var(--green); }
    .check.fail .mark { color: var(--red); border-color: var(--red); }
    .resource-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .resource-table th, .resource-table td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
    .resource-table th { color: var(--muted); font-weight: 600; }
    .pill-row { display: flex; flex-wrap: wrap; gap: 6px; }
    .pill { border: 1px solid var(--line); border-radius: 999px; padding: 3px 8px; font-size: 12px; color: var(--muted); }
    .spinner { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--line); border-top-color: var(--accent); animation: spin 900ms linear infinite; }
    .run-bar { height: 7px; border-radius: 999px; background: var(--surface-subtle); overflow: hidden; border: 1px solid var(--line); }
    .run-bar span { display: block; height: 100%; width: 42%; border-radius: inherit; background: linear-gradient(90deg, transparent, var(--accent), transparent); animation: slide 1.1s ease-in-out infinite; }
    .mini-resources { display: grid; gap: 4px; max-height: 220px; overflow: auto; border-top: 1px solid var(--line); padding-top: 6px; }
    .mini-resource { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; font-size: 12px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes slide { 0% { transform: translateX(-120%); } 100% { transform: translateX(240%); } }
    .logs { max-height: 260px; overflow: auto; }
    .inline-log { max-height: 220px; }
    .log-line { display: grid; grid-template-columns: 86px minmax(0, 1fr); gap: 8px; padding: 6px 0; border-bottom: 1px solid color-mix(in srgb, var(--line) 55%, transparent); }
    .section-title { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    @media (max-width: 980px) { .hero, .layout, .grid, .focus-grid, .progress { grid-template-columns: 1fr; } .workflow-pane { position: static; max-height: none; overflow: visible; } .phase:not(:last-child)::after { display: none; } }
  </style>
</head>
<body>
  <header>
    <div class="hero">
      <div>
        <h1>WordPress WAF review workflow</h1>
        <p class="muted">Eight-state sequence: validate tools, connect Azure scope, pre-assess, collect, package, unzip, assess, display.</p>
      </div>
      <div class="actions">
        <div class="run-controls">
          <label><span class="muted">Run</span><select id="runSelect"></select></label>
          <button id="resetRun" class="danger">Reset / new run</button>
        </div>
        <button id="manual">Manual approvals</button>
        <button id="automatic" class="primary">Automatic after scope</button>
        <button id="runSelectedTop" class="primary">Run selected step</button>
        <button id="refresh">Refresh</button>
      </div>
    </div>
    <p id="uiStatus" class="muted"></p>
    <p id="updated" class="muted"></p>
  </header>
  <main class="wrap">
    <section class="layout">
      <aside class="workflow-pane">
        <section class="progress" id="progress"></section>
        <section class="sequence" id="sequence"></section>
      </aside>
      <section class="details-pane">
        <article class="card" id="detail"></article>
        <article class="card">
          <div class="section-title"><h2>Selected step logs</h2><span class="badge" id="selectedLogBadge"></span></div>
          <div class="logs inline-log" id="stepLogs"></div>
        </article>
        <article class="card">
          <h2>Command / prompt</h2>
          <pre id="command"></pre>
          <div class="actions"><button id="copyCommand">Copy current instruction</button><button id="runCurrent" class="primary">Run current phase</button><button id="runAuto">Run automatic phases</button></div>
        </article>
        <article class="card">
          <h2>Workspace state</h2>
          <div class="list" id="workspace"></div>
        </article>
        <article class="card">
          <h2>Full activity log</h2>
          <div class="logs" id="logs"></div>
        </article>
      </section>
    </section>
  </main>
  <script>
    let state = null;
    let selected = null;
    const labels = { done: "Done", running: "Running", current: "Ready to run", ready: "Ready to run", pending: "Waiting", blocked: "Blocked", failed: "Failed" };
    const commandKey = { dependencies: "dependencies", connect: "connect", preassess: "preassess", collect: "collect", package: "package", "prepare-assessment": "prepareAssessment", assessment: "reviewPrompt", display: "dashboard" };
    const phaseGlyphs = { dependencies: "✓", connect: "☁️", preassess: "🔎", collect: "📥", package: "📦", "prepare-assessment": "🗂️", assessment: "🧠", display: "📊" };
    const esc = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    async function post(url, body = {}) {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Request failed");
      return json;
    }
    function setUiStatus(message, tone = "muted") {
      const el = document.getElementById("uiStatus");
      el.textContent = message || "";
      el.style.color = tone === "error" ? "var(--red)" : tone === "success" ? "var(--green)" : "var(--muted)";
    }
    async function getJson(url) {
      const response = await fetch(url, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Request failed");
      return json;
    }
    async function loadState() {
      const response = await fetch("/api/state", { cache: "no-store" });
      state = await response.json();
      selected = selected || state.currentPhase;
      render();
    }
    function doneCount() { return state.phases.filter((p) => p.status === "done").length; }
    function currentPhase() { return state.phases.find((p) => p.id === selected) || state.phases.find((p) => p.id === state.currentPhase) || state.phases[0]; }
    function renderProgress() {
      const done = doneCount();
      const total = state.phases.length;
      const pct = Math.round((done / total) * 100);
      const phase = state.phases.find((p) => p.id === state.currentPhase) || state.phases[0];
      const el = document.getElementById("progress");
      el.style.setProperty("--pct", pct + "%");
      el.style.setProperty("--deg", Math.round(pct * 3.6) + "deg");
      el.innerHTML = \`
        <div class="ring"><strong>\${pct}%</strong></div>
        <div><h2>\${done}/\${total} complete</h2><p class="muted">Current: \${esc(phase.title)}</p><div class="bar"><span></span></div></div>\`;
    }
    function renderSequence() {
      document.getElementById("sequence").innerHTML = state.phases.map((p) => \`
        <div class="phase" role="button" tabindex="0" data-id="\${p.id}" data-status="\${p.status}" aria-pressed="\${selected === p.id}">
          <div class="node"><span class="glyph">\${phaseGlyphs[p.id] || esc(p.icon)}</span></div>
          <div class="phase-main">
            <span class="badge \${p.status}">Step \${esc(p.icon)} · \${esc(labels[p.status] || p.status)}</span>
            <h3>\${esc(p.title)}</h3>
            <strong class="muted">\${esc(p.short)}</strong>
            <p class="muted">\${esc(p.detail)}</p>
          </div>
          \${renderInlinePhaseResult(p)}
          \${renderPhaseRunButton(p)}
        </div>\`).join("");
      document.querySelectorAll(".phase").forEach((button) => button.addEventListener("click", async () => {
        selected = button.dataset.id;
        render();
        const p = currentPhase();
        setUiStatus("Showing details and logs for " + p.title + ".", "muted");
      }));
      document.querySelectorAll(".phase").forEach((button) => button.addEventListener("keydown", async (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        selected = button.dataset.id;
        render();
        const p = currentPhase();
        setUiStatus("Showing details and logs for " + p.title + ".", "muted");
      }));
      document.querySelectorAll(".phase-action").forEach((button) => button.addEventListener("click", async (event) => {
        event.stopPropagation();
        selected = button.dataset.id;
        await runSelectedPhase();
      }));
    }
    function renderPhaseRunButton(p) {
      if (p.status === "running") return '<button type="button" class="phase-action" disabled>Running...</button>';
      if (["current", "ready", "done", "failed"].includes(p.status)) {
        const label = p.status === "done" ? "Run again" : "Run this step";
        const cls = p.status === "done" ? "phase-action done" : "phase-action";
        return \`<button type="button" class="\${cls}" data-id="\${p.id}">\${label}</button>\`;
      }
      return '<button type="button" class="phase-action" disabled>Waiting for previous step</button>';
    }
    function renderInlinePhaseResult(p) {
      const out = state.outputs[p.id.replaceAll("-", "_")] || {};
      if (p.id === "dependencies") {
        const checks = out.result?.checks || [];
        if (!checks.length) return '<div class="phase-inline"><span class="muted">No dependency results yet.</span></div>';
        return \`<div class="phase-inline">\${checks.map((c) => \`<div class="mini-check \${c.ok ? "ok" : "fail"}"><span class="mini-mark">\${c.ok ? "✓" : "×"}</span><span>\${esc(c.name)}</span></div>\`).join("")}</div>\`;
      }
      if (p.id === "connect") {
        const sub = state.subscriptions.find((s) => s.id === state.context.subscription);
        const rg = state.resourceGroups.find((g) => g.name === state.context.resourceGroup);
        const subLabel = sub ? sub.name : state.context.subscription || "No subscription selected";
        const rgLabel = rg ? \`\${rg.name}\${rg.location ? " (" + rg.location + ")" : ""}\` : state.context.resourceGroup || "No resource group selected";
        return \`<div class="phase-inline">
          <div class="mini-check \${state.context.subscription ? "ok" : "fail"}"><span class="mini-mark">\${state.context.subscription ? "✓" : "×"}</span><span>\${esc(subLabel)}</span></div>
          <div class="mini-check \${state.context.resourceGroup ? "ok" : "fail"}"><span class="mini-mark">\${state.context.resourceGroup ? "✓" : "×"}</span><span>\${esc(rgLabel)}</span></div>
        </div>\`;
      }
      if (p.id === "preassess") {
        const inv = out.inventory?.inventory || out.inventory || out.result?.inventory || out;
        const count = inv?.resourceCount ?? inv?.resources?.length ?? 0;
        if (!count) return \`<div class="phase-inline">\${renderRunningInline(p)}<div class="mini-check fail"><span class="mini-mark">×</span><span>No inventory yet</span></div></div>\`;
        const groups = inv.resourceTypes || [];
        const resources = inv.resources || [];
        return \`<div class="phase-inline">
          \${renderRunningInline(p)}
          <div class="mini-check ok"><span class="mini-mark">✓</span><span>\${count} resources found</span></div>
          <div class="pill-row">\${groups.slice(0, 10).map((g) => \`<span class="pill">\${esc(shortType(g.type))} · \${esc(g.count)}</span>\`).join("")}</div>
          <div class="mini-resources">\${resources.slice(0, 80).map((r) => \`<div class="mini-resource"><span title="\${esc(r.type)}">\${esc(r.name)}</span><span class="muted">\${esc(shortType(r.type))}</span></div>\`).join("")}</div>
        </div>\`;
      }
      if (p.id === "collect") {
        const zipLabel = out.zipFile || packageZipLabel();
        return \`<div class="phase-inline">
          \${renderRunningInline(p)}
          <div class="mini-check \${state.context.evidenceDir ? "ok" : "fail"}"><span class="mini-mark">\${state.context.evidenceDir ? "✓" : "×"}</span><span>Evidence folder</span></div>
          <div class="mini-check \${zipLabel ? "ok" : "fail"}"><span class="mini-mark">\${zipLabel ? "✓" : "×"}</span><span>Collector ZIP\${zipLabel ? ": " + esc(zipLabel) : ""}</span></div>
        </div>\`;
      }
      if (p.id === "package") {
        const zipLabel = out.zipFile || packageZipLabel();
        return \`<div class="phase-inline"><div class="mini-check \${zipLabel ? "ok" : "fail"}"><span class="mini-mark">\${zipLabel ? "✓" : "×"}</span><span>Package\${zipLabel ? ": " + esc(zipLabel) : ""}</span></div></div>\`;
      }
      if (p.id === "prepare-assessment") return \`<div class="phase-inline"><div class="mini-check \${out.evidenceDir ? "ok" : "fail"}"><span class="mini-mark">\${out.evidenceDir ? "✓" : "×"}</span><span>Manifest ready</span></div></div>\`;
      if (p.id === "assessment") {
        const waiting = out.waitingForSkill && !state.discovered.reports.length;
        return \`<div class="phase-inline"><div class="mini-check \${state.discovered.reports.length ? "ok" : waiting ? "" : "fail"}"><span class="mini-mark">\${state.discovered.reports.length ? "✓" : waiting ? "…" : "×"}</span><span>\${state.discovered.reports.length ? "Reports generated" : waiting ? "Skill request sent" : "Reports not generated yet"}</span></div></div>\`;
      }
      if (p.id === "display") return \`<div class="phase-inline"><div class="mini-check \${state.discovered.reports.length ? "ok" : "fail"}"><span class="mini-mark">\${state.discovered.reports.length ? "✓" : "×"}</span><span>Dashboard source</span></div></div>\`;
      return "";
    }
    function renderRunningInline(p) {
      if (p.status !== "running") return "";
      return '<div class="mini-check"><span class="spinner"></span><span>Running...</span></div><div class="run-bar"><span></span></div>';
    }
    function shortType(type) {
      const parts = String(type || "").split("/");
      return parts.slice(-2).join("/");
    }
    function renderDetail() {
      const p = currentPhase();
      const out = state.outputs[p.id.replaceAll("-", "_")] || {};
      document.getElementById("detail").innerHTML = \`
        <div class="detail-head"><div class="node"><span class="glyph">\${phaseGlyphs[p.id] || esc(p.icon)}</span></div><div><span class="badge \${p.status}">Step \${esc(p.icon)} · \${esc(labels[p.status] || p.status)}</span><h2>\${esc(p.title)}</h2><p>\${esc(p.detail)}</p></div></div>
        <div class="detail-actions">
          <button id="runSelectedInDetail" class="primary" \${["running", "blocked", "pending"].includes(p.status) ? "disabled" : ""}>Run this step</button>
          <button id="copySelectedInDetail">Copy instruction</button>
        </div>
        <div class="item"><strong>Execution mode</strong><span class="muted">\${esc(state.mode === "automatic" ? "Automatic after scope" : "Manual approval between phases")}</span></div>
        \${p.id !== "connect" ? \`<div class="item"><strong>Selected scope</strong><span class="muted">\${esc(state.context.subscription || "No subscription")} / \${esc(state.context.resourceGroup || "No resource group")}</span></div>\` : ""}
        \${p.id === "connect" ? renderScopeControls() : ""}
        \${out.error && !(p.id === "package" && packageZipLabel()) ? \`<div class="item"><strong>Last error</strong><span class="muted">\${esc(out.error)}</span></div>\` : ""}
        \${out.prompt ? \`<div class="item"><strong>Skill request</strong><span class="muted">\${esc(out.skillSubmitted ? "Sent to Copilot. Refresh this step after the reports are generated." : "Ready to send to Copilot from this step.")}</span></div>\` : ""}
        \${renderPhaseVisual(p, out)}
      \`;
      document.getElementById("command").textContent = state.commands[commandKey[p.id]] || "";
      document.getElementById("runSelectedInDetail").addEventListener("click", () => runSelectedPhase());
      document.getElementById("copySelectedInDetail").addEventListener("click", () => navigator.clipboard.writeText(document.getElementById("command").textContent));
    }
    function renderScopeControls() {
      return \`<section class="scope">
        <label><span class="muted">Subscription</span><select id="subscription"></select></label>
        <label><span class="muted">Resource group</span><select id="resourceGroup"></select></label>
        <div class="actions">
          <button id="loadSubscriptions">Load subscriptions</button>
          <button id="loadResourceGroups">Load resource groups</button>
          <button id="saveScope" class="primary">Use selected scope</button>
        </div>
      </section>\`;
    }
    function renderPhaseVisual(p, out) {
      if (p.id === "dependencies") return renderDependencyVisual(out);
      if (p.id === "connect") return renderScopeVisual();
      if (p.id === "preassess") return renderPreassessVisual(out);
      if (p.id === "collect") return renderCollectVisual();
      if (p.id === "package") return renderPackageVisual(out);
      if (p.id === "prepare-assessment") return renderPrepareAssessmentVisual(out);
      if (p.id === "assessment") return renderAssessmentVisual(out);
      if (p.id === "display") return renderDisplayVisual(out);
      return "";
    }
    function renderDependencyVisual(out) {
      const checks = out.result?.checks || [];
      if (!checks.length) return '<div class="item"><strong>Dependency checks</strong><span class="muted">Run this step to see pass/fail checks for local tools.</span></div>';
      return \`<div><h3>Dependency checks</h3><div class="check-grid">\${checks.map((c) => \`
        <div class="check \${c.ok ? "ok" : "fail"}"><div class="mark">\${c.ok ? "✓" : "×"}</div><div><strong>\${esc(c.name)}</strong><p class="muted">\${esc(c.detail)}</p></div></div>
      \`).join("")}</div></div>\`;
    }
    function renderScopeVisual() {
      const sub = state.subscriptions.find((s) => s.id === state.context.subscription);
      const rg = state.resourceGroups.find((g) => g.name === state.context.resourceGroup);
      return \`<div><h3>Azure scope</h3><div class="check-grid">
        <div class="check \${state.context.subscription ? "ok" : "fail"}"><div class="mark">\${state.context.subscription ? "✓" : "×"}</div><div><strong>Subscription</strong><p class="muted">\${esc(sub ? sub.name + " — " + sub.id : state.context.subscription || "Not selected")}</p></div></div>
        <div class="check \${state.context.resourceGroup ? "ok" : "fail"}"><div class="mark">\${state.context.resourceGroup ? "✓" : "×"}</div><div><strong>Resource group</strong><p class="muted">\${esc(rg ? rg.name + " — " + rg.location : state.context.resourceGroup || "Not selected")}</p></div></div>
      </div></div>\`;
    }
    function renderPreassessVisual(out) {
      const inventory = out.inventory || out.inventory?.inventory || out.result?.inventory;
      const inv = out.inventory?.inventory || out.inventory || out.result?.inventory || out;
      const resourceTypes = inv?.resourceTypes || [];
      const resources = inv?.resources || [];
      if (!resources.length && !resourceTypes.length) return '<div class="item"><strong>Resource inventory</strong><span class="muted">Run Pre-assess to list all resources in the selected resource group.</span></div>';
      return \`<div><h3>Resource inventory</h3>
        <div class="pill-row">\${resourceTypes.slice(0, 18).map((t) => \`<span class="pill">\${esc(t.type)} · \${esc(t.count)}</span>\`).join("")}</div>
        <div style="overflow:auto; max-height:280px; margin-top:10px"><table class="resource-table"><thead><tr><th>Name</th><th>Type</th><th>Location</th></tr></thead><tbody>
          \${resources.map((r) => \`<tr><td>\${esc(r.name)}</td><td>\${esc(r.type)}</td><td>\${esc(r.location || "")}</td></tr>\`).join("")}
        </tbody></table></div>
      </div>\`;
    }
    function renderCollectVisual() {
      const zipLabel = state.outputs.collect?.zipFile || packageZipLabel();
      return \`<div><h3>Collection output</h3><div class="check-grid">
        <div class="check \${state.context.evidenceDir ? "ok" : "fail"}"><div class="mark">\${state.context.evidenceDir ? "✓" : "×"}</div><div><strong>Evidence folder</strong><p class="muted">\${esc(state.context.evidenceDir || "Not created yet")}</p></div></div>
        <div class="check \${zipLabel ? "ok" : "fail"}"><div class="mark">\${zipLabel ? "✓" : "×"}</div><div><strong>Collector ZIP</strong><p class="muted">\${esc(zipLabel || "Not packaged yet")}</p></div></div>
      </div></div>\`;
    }
    function renderPackageVisual(out) {
      const zipLabel = out.zipFile || packageZipLabel();
      return \`<div class="check \${zipLabel ? "ok" : "fail"}"><div class="mark">\${zipLabel ? "✓" : "×"}</div><div><strong>Package file</strong><p class="muted">\${esc(zipLabel || "Run this step after collection to confirm the ZIP.")}</p></div></div>\`;
    }
    function packageZipLabel() {
      if (state.outputs.package?.zipFile) return state.outputs.package.zipFile;
      if (state.outputs.collect?.zipFile) return state.outputs.collect.zipFile;
      const evidenceDir = state.outputs.collect?.outputDirectory || state.context.evidenceDir || "";
      if (!evidenceDir) return "";
      const evidenceName = evidenceDir.split(/[\\\\/]/).filter(Boolean).at(-1);
      return state.discovered.zips.find((zip) => (zip.label || "").split(/[\\\\/]/).pop().startsWith(evidenceName + "-"))?.label || "";
    }
    function renderPrepareAssessmentVisual(out) {
      const step7Input = out.evidenceDir || state.context.evidenceDir || "";
      return \`<div><h3>Assessment preparation</h3><div class="check-grid">
        <div class="check \${out.extractDirectory ? "ok" : "fail"}"><div class="mark">\${out.extractDirectory ? "✓" : "×"}</div><div><strong>Extracted folder</strong><p class="muted">\${esc(out.extractDirectory || "Not extracted yet")}</p></div></div>
        <div class="check \${step7Input ? "ok" : "fail"}"><div class="mark">\${step7Input ? "✓" : "×"}</div><div><strong>Step 7 evidence folder</strong><p class="muted">\${esc(step7Input || "collection-manifest.json not found yet")}</p></div></div>
        <div class="check \${out.jsonFileCount > 0 ? "ok" : "fail"}"><div class="mark">\${out.jsonFileCount > 0 ? "✓" : "×"}</div><div><strong>JSON evidence files</strong><p class="muted">\${esc(out.jsonFileCount > 0 ? out.jsonFileCount + " JSON files found" : "No JSON files verified yet")}</p></div></div>
        <div class="check \${out.manifest ? "ok" : "fail"}"><div class="mark">\${out.manifest ? "✓" : "×"}</div><div><strong>Manifest</strong><p class="muted">\${esc(out.manifest || "collection-manifest.json not verified yet")}</p></div></div>
      </div></div>\`;
    }
    function renderAssessmentVisual(out) {
      const prompt = out.prompt || state.commands.reviewPrompt;
      const step7Input = state.context.evidenceDir || state.outputs.prepare_assessment?.evidenceDir || "";
      return \`<div class="list">
        <div class="check \${state.discovered.reports.length ? "ok" : "fail"}"><div class="mark">\${state.discovered.reports.length ? "✓" : "×"}</div><div><strong>Reports</strong><p class="muted">\${esc(out.reportDir ? "Reports found at " + out.reportDir : "Not generated yet")}</p></div></div>
        <div class="item"><strong>Skill input from Step 6</strong><span class="muted">\${esc(step7Input || "Run Step 6 first to extract the collector ZIP.")}</span></div>
        <div class="item"><strong>Evidence JSON check</strong><span class="muted">\${esc(state.outputs.prepare_assessment?.jsonFileCount ? state.outputs.prepare_assessment.jsonFileCount + " JSON files verified in Step 6" : "Step 6 has not verified JSON files yet.")}</span></div>
        \${out.skillSubmitted ? \`<div class="item"><strong>Submitted</strong><span class="muted">\${esc(out.submittedAt ? new Date(out.submittedAt).toLocaleString() : "Skill request sent to Copilot.")}</span></div>\` : ""}
        <div class="item"><strong>Next action</strong><span class="muted">\${esc(state.discovered.reports.length ? "Assessment outputs are ready." : out.skillSubmitted ? "Wait for Copilot to finish the skill run, then refresh this step." : "Click Run this step to send the skill request to Copilot.")}</span></div>
        \${prompt ? \`<pre>\${esc(prompt)}</pre>\` : ""}
      </div>\`;
    }
    function renderDisplayVisual(out) {
      return \`<div class="check \${state.discovered.reports.length ? "ok" : "fail"}"><div class="mark">\${state.discovered.reports.length ? "✓" : "×"}</div><div><strong>Dashboard report source</strong><p class="muted">\${esc(state.context.reportDir || state.discovered.reports[0]?.label || "No generated report directory found")}</p></div></div>\`;
    }
    function renderWorkspace() {
      const rows = [
        ["Collector", state.discovered.collector.present ? state.discovered.collector.path : "Missing"],
        ["Pre-assessment", state.outputs.preassess?.outputFile || "Not run"],
        ["Evidence", state.context.evidenceDir || state.discovered.evidence.map((x) => x.label).join("\\n") || "None found"],
        ["Package", state.outputs.collect?.zipFile || state.discovered.zips.map((x) => x.label).join("\\n") || "None found"],
        ["Reports", state.context.reportDir || state.discovered.reports.map((x) => x.label).join("\\n") || "None found"],
      ];
      document.getElementById("workspace").innerHTML = rows.map(([k, v]) => \`<div class="item"><strong>\${esc(k)}</strong><span class="muted" style="white-space:pre-wrap">\${esc(v)}</span></div>\`).join("");
    }
    function renderLogs() {
      const lines = (state.logs || []).slice().reverse();
      const p = currentPhase();
      const selectedLines = (state.logs || []).filter((line) => line.phase === p.id).slice().reverse();
      const html = lines.map((line) => \`<div class="log-line"><span class="muted">\${esc(line.phase)}</span><span>\${esc(line.message)}</span></div>\`).join("") || '<p class="muted">No activity yet.</p>';
      document.getElementById("logs").innerHTML = html;
      document.getElementById("selectedLogBadge").textContent = p.title;
      document.getElementById("stepLogs").innerHTML = selectedLines.map((line) => \`<div class="log-line"><span class="muted">\${new Date(line.at).toLocaleTimeString()}</span><span>\${esc(line.message)}</span></div>\`).join("") || '<p class="muted">No logs for this step yet. Run this step to see progress here.</p>';
    }
    function renderSelects() {
      const sub = document.getElementById("subscription");
      const rg = document.getElementById("resourceGroup");
      if (!sub || !rg) return;
      const subscriptions = state.subscriptions || [];
      const groups = state.resourceGroups || [];
      const currentSubOption = state.context.subscription && !subscriptions.some((s) => s.id === state.context.subscription)
        ? \`<option value="\${esc(state.context.subscription)}" selected>\${esc(state.context.subscription)}</option>\`
        : "";
      sub.innerHTML = '<option value="">Click Load subscriptions...</option>' + currentSubOption + subscriptions.map((s) => \`<option value="\${esc(s.id)}" \${s.id === state.context.subscription ? "selected" : ""}>\${esc(s.name)} — \${esc(s.id)}</option>\`).join("");
      if (!state.context.subscription && !document.getElementById("subscription").value) {
        rg.innerHTML = '<option value="">Select a subscription first...</option>';
        return;
      }
      if (groups.length === 0) {
        rg.innerHTML = '<option value="">No resource groups found for this subscription</option>';
        return;
      }
      rg.innerHTML = '<option value="">Select resource group...</option>' + groups.map((g) => \`<option value="\${esc(g.name)}" \${g.name === state.context.resourceGroup ? "selected" : ""}>\${esc(g.name)} — \${esc(g.location || "")}</option>\`).join("");
    }
    function runLabel(run) {
      const created = run.createdAt ? new Date(run.createdAt).toLocaleString() : run.runId;
      const scope = run.resourceGroup || run.subscription || "No scope selected";
      return \`\${run.runId} — \${scope} — \${created}\`;
    }
    function renderRuns() {
      const runSelect = document.getElementById("runSelect");
      const runs = state.runs || [];
      runSelect.innerHTML = runs.map((run) => \`<option value="\${esc(run.runId)}" \${run.runId === state.run?.runId ? "selected" : ""}>\${esc(runLabel(run))}</option>\`).join("");
    }
    function render() {
      document.getElementById("updated").textContent = \`Run \${state.run?.runId || "unknown"} · Last checked \${new Date(state.updatedAt).toLocaleString()}\`;
      renderRuns(); renderProgress(); renderSequence(); renderDetail(); renderSelects(); renderWorkspace(); renderLogs(); bindScopeControls();
      const p = currentPhase();
      const topButton = document.getElementById("runSelectedTop");
      topButton.textContent = "Run " + p.title;
      topButton.disabled = !["current", "ready"].includes(p.status);
      const loadResourceGroups = document.getElementById("loadResourceGroups");
      const subscription = document.getElementById("subscription");
      if (loadResourceGroups && subscription) loadResourceGroups.disabled = !subscription.value;
    }
    async function runSelectedPhase() {
      const p = currentPhase();
      setUiStatus("Running " + p.title + "...");
      try {
        state = await post("/api/run-phase", { phaseId: p.id });
        selected = state.currentPhase;
        render();
        setUiStatus(p.title + " completed.", "success");
      } catch (error) {
        setUiStatus(error.message, "error");
        await loadState();
      }
    }
    document.getElementById("refresh").addEventListener("click", async () => { setUiStatus("Refreshing workflow state..."); await loadState(); setUiStatus("Workflow state refreshed.", "success"); });
    document.getElementById("resetRun").addEventListener("click", async () => {
      setUiStatus("Starting a new workflow run...");
      state = await post("/api/reset-run");
      selected = state.currentPhase;
      render();
      setUiStatus("New run started: " + state.run.runId, "success");
    });
    document.getElementById("runSelect").addEventListener("change", async (event) => {
      const runId = event.target.value;
      if (!runId || runId === state.run?.runId) return;
      setUiStatus("Loading workflow run " + runId + "...");
      state = await post("/api/switch-run", { runId });
      selected = state.currentPhase;
      render();
      setUiStatus("Loaded run " + runId + ".", "success");
    });
    document.getElementById("runSelectedTop").addEventListener("click", runSelectedPhase);
    document.getElementById("manual").addEventListener("click", async () => { state = await post("/api/refresh", { mode: "manual" }); render(); setUiStatus("Manual approval mode enabled.", "success"); });
    document.getElementById("automatic").addEventListener("click", async () => { state = await post("/api/refresh", { mode: "automatic" }); render(); setUiStatus("Automatic mode enabled after scope selection.", "success"); });
    function bindScopeControls() {
      const loadSubscriptions = document.getElementById("loadSubscriptions");
      const subscription = document.getElementById("subscription");
      const loadResourceGroups = document.getElementById("loadResourceGroups");
      const resourceGroup = document.getElementById("resourceGroup");
      const saveScope = document.getElementById("saveScope");
      if (!loadSubscriptions || loadSubscriptions.dataset.bound) return;
      loadSubscriptions.dataset.bound = "true";
      subscription.dataset.bound = "true";
      loadResourceGroups.dataset.bound = "true";
      saveScope.dataset.bound = "true";
      loadSubscriptions.addEventListener("click", async () => {
      const button = document.getElementById("loadSubscriptions");
      button.disabled = true;
      button.textContent = "Loading...";
      setUiStatus("Loading Azure subscriptions with az account list. This can take a few seconds...");
      try {
        const result = await getJson("/api/subscriptions");
        await loadState();
        setUiStatus(\`Loaded \${result.subscriptions?.length ?? 0} subscriptions. Choose one from the dropdown.\`, "success");
      } catch (error) {
        setUiStatus(error.message, "error");
      } finally {
        button.disabled = false;
        button.textContent = "Load subscriptions";
      }
    });
      subscription.addEventListener("change", () => {
      const hasSubscription = Boolean(document.getElementById("subscription").value);
      document.getElementById("loadResourceGroups").disabled = !hasSubscription;
      document.getElementById("resourceGroup").innerHTML = hasSubscription ? '<option value="">Click Load resource groups...</option>' : '<option value="">Select a subscription first...</option>';
      setUiStatus(hasSubscription ? "Subscription selected. Click Load resource groups to populate the next dropdown." : "Select a subscription first.");
    });
      loadResourceGroups.addEventListener("click", async () => {
      const subscription = document.getElementById("subscription").value;
      if (!subscription) {
        setUiStatus("Select a subscription before loading resource groups.", "error");
        return;
      }
      const button = document.getElementById("loadResourceGroups");
      const select = document.getElementById("resourceGroup");
      button.disabled = true;
      button.textContent = "Loading...";
      select.disabled = true;
      setUiStatus("Loading resource groups for the selected subscription...");
      try {
        const result = await getJson("/api/resource-groups?subscription=" + encodeURIComponent(subscription));
        await loadState();
        const count = result.resourceGroups?.length ?? 0;
        setUiStatus(count === 0 ? "No resource groups were found in the selected subscription." : \`Loaded \${count} resource groups. Choose one, then click Use selected scope.\`, count === 0 ? "error" : "success");
      } catch (error) {
        setUiStatus(error.message, "error");
      } finally {
        select.disabled = false;
        button.disabled = !document.getElementById("subscription").value;
        button.textContent = "Load resource groups";
      }
    });
      saveScope.addEventListener("click", async () => {
      state = await post("/api/scope", { subscription: document.getElementById("subscription").value, resourceGroup: document.getElementById("resourceGroup").value });
      render();
    });
    }
    document.getElementById("runCurrent").addEventListener("click", runSelectedPhase);
    document.getElementById("runAuto").addEventListener("click", async () => { state = await post("/api/run-automatic"); render(); });
    document.getElementById("copyCommand").addEventListener("click", async () => navigator.clipboard.writeText(document.getElementById("command").textContent));
    const events = new EventSource("/events");
    events.onmessage = () => loadState();
    loadState();
  </script>
</body>
</html>`;
}

function requireInstance(instanceId) {
    const instance = instances.get(instanceId);
    if (!instance) throw new CanvasError("canvas_instance_unknown", `No open workflow canvas for instance "${instanceId}".`);
    return instance;
}

function titleFor(state) {
    const phase = state?.phases?.find((item) => item.id === state.currentPhase);
    return phase ? `WAF workflow — ${phase.title}` : "WordPress WAF workflow";
}

function statusFor(state) {
    if (!state) return "Loading workflow";
    const done = state.phases.filter((phase) => phase.status === "done").length;
    const phase = state.phases.find((item) => item.id === state.currentPhase);
    return `${done}/${state.phases.length} states complete · ${phase?.title ?? "Workflow"}`;
}

const workflowCanvas = createCanvas({
    id: "waf-review-workflow",
    displayName: "WAF review workflow",
    description:
        "Eight-state workflow sequence for validating dependencies, selecting Azure scope, collecting WordPress evidence, running the review skill, and opening the dashboard.",
    inputSchema: {
        type: "object",
        properties: {
            evidenceDir: { type: "string" },
            reportDir: { type: "string" },
            resourceGroup: { type: "string" },
            subscription: { type: "string" },
            mode: { type: "string", enum: ["manual", "automatic"] },
            environment: { type: "string" },
            rto: { type: "string" },
            rpo: { type: "string" },
        },
        additionalProperties: false,
    },
    actions: [
        {
            name: "refresh",
            description: "Refresh workflow state and optionally update scope, paths, context, or mode.",
            inputSchema: { type: "object", additionalProperties: true },
            handler: async (ctx) => requireInstance(ctx.instanceId).refresh(ctx.input),
        },
        {
            name: "reset_run",
            description: "Start a new workflow run while keeping prior runs available for review.",
            handler: async (ctx) => requireInstance(ctx.instanceId).resetRun(),
        },
        {
            name: "switch_run",
            description: "Switch the workflow canvas to a previously saved run by runId.",
            inputSchema: { type: "object", properties: { runId: { type: "string" } }, required: ["runId"], additionalProperties: false },
            handler: async (ctx) => requireInstance(ctx.instanceId).switchRun(ctx.input.runId),
        },
        {
            name: "get_workflow_state",
            description: "Return the current eight-state workflow model, logs, discovered artifacts, commands, subscriptions, and resource groups.",
            handler: async (ctx) => {
                const instance = requireInstance(ctx.instanceId);
                if (!instance.state) await instance.refresh();
                return instance.snapshot();
            },
        },
        {
            name: "list_subscriptions",
            description: "Run az account list through the helper script and return subscriptions for the dropdown.",
            handler: async (ctx) => ({ subscriptions: await requireInstance(ctx.instanceId).listSubscriptions() }),
        },
        {
            name: "list_resource_groups",
            description: "Run az group list for a subscription and return resource groups for the dropdown.",
            inputSchema: { type: "object", properties: { subscription: { type: "string" } }, additionalProperties: false },
            handler: async (ctx) => ({ resourceGroups: await requireInstance(ctx.instanceId).listResourceGroups(ctx.input?.subscription) }),
        },
        {
            name: "set_scope",
            description: "Set selected subscription, resource group, and mode.",
            inputSchema: {
                type: "object",
                properties: { subscription: { type: "string" }, resourceGroup: { type: "string" }, mode: { type: "string", enum: ["manual", "automatic"] } },
                additionalProperties: false,
            },
            handler: async (ctx) => requireInstance(ctx.instanceId).setScope(ctx.input ?? {}),
        },
        {
            name: "run_phase",
            description: "Run a single workflow phase by id.",
            inputSchema: { type: "object", properties: { phaseId: { type: "string", enum: PHASES.map((phase) => phase.id) } }, required: ["phaseId"], additionalProperties: false },
            handler: async (ctx) => requireInstance(ctx.instanceId).runPhase(ctx.input.phaseId),
        },
        {
            name: "run_next",
            description: "Run the current actionable phase.",
            handler: async (ctx) => requireInstance(ctx.instanceId).runNext(),
        },
        {
            name: "run_automatic",
            description: "Run automatic phases until user scope selection or the assessment skill boundary is reached.",
            handler: async (ctx) => requireInstance(ctx.instanceId).runAutomatic(),
        },
        {
            name: "get_skill_prompt",
            description: "Return the Copilot prompt for the Assessment Phase.",
            handler: async (ctx) => {
                const instance = requireInstance(ctx.instanceId);
                if (!instance.state) await instance.refresh();
                return { prompt: instance.state.commands.reviewPrompt };
            },
        },
    ],
    open: async (ctx) => {
        let instance = instances.get(ctx.instanceId);
        if (!instance) {
            instance = new WorkflowInstance({ instanceId: ctx.instanceId, input: ctx.input });
            instances.set(ctx.instanceId, instance);
            await instance.start();
        }
        await instance.refresh(ctx.input);
        return { title: titleFor(instance.state), status: statusFor(instance.state), url: instance.url };
    },
    onClose: async (ctx) => {
        const instance = instances.get(ctx.instanceId);
        if (!instance) return;
        instances.delete(ctx.instanceId);
        await instance.stop();
    },
});

const session = await joinSession({ canvases: [workflowCanvas] });

if (session.workspacePath && !roots.includes(path.resolve(session.workspacePath))) {
    roots = [...roots, path.resolve(session.workspacePath)];
}
