import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

const decisions = new Set(["met", "not-met", "not-applicable", "unknown"]);
const text = value => String(value ?? "").replace(/`|\*\*/g, "").trim();
const rows = markdown => markdown.split(/\r?\n/).filter(line => line.startsWith("|")).map(line => line.split(/(?<!\\)\|/).slice(1, -1).map(text));

async function readOptional(file) {
    try { return await readFile(file, "utf8"); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

export function parseQuestions(checklist, evidenceMap, report = "") {
    const manualText = evidenceMap.split("## Controls the collector cannot decide")[1];
    if (!manualText) throw new Error("The evidence map is missing its manual-validation guidance.");
    const manualIds = new Set(manualText.match(/\b[A-Z]+-\d{2}\b/g) ?? []);
    for (const match of manualText.matchAll(/\b([A-Z]+)-(\d{2})\s*(?:to|[–-])\s*(?:\1-)?(\d{2})\b/g)) {
        for (let n = Number(match[2]); n <= Number(match[3]); n++) manualIds.add(`${match[1]}-${String(n).padStart(2, "0")}`);
    }
    const mapped = new Set(evidenceMap.split("## Controls the collector cannot decide")[0].match(/\b[A-Z]+-\d{2}\b/g) ?? []);
    const statuses = new Map();
    for (const row of rows(report)) {
        if (!/^[A-Z]+-\d{2}$/.test(row[0])) continue;
        const status = row.find(cell => /^(Pass|Fail|N\/A|Not verified)$/.test(cell));
        if (status) statuses.set(row[0], status);
    }
    let section = "";
    const questions = [];
    for (const line of checklist.split(/\r?\n/)) {
        if (/^## \d+\./.test(line)) section = line.replace(/^## /, "");
        if (!line.startsWith("|")) continue;
        const row = rows(line)[0];
        if (!row || !/^[A-Z]+-\d{2}$/.test(row[0])) continue;
        const id = row[0];
        const manual = id.startsWith("MAN-") || manualIds.has(id);
        const unmapped = !mapped.has(id);
        const requiredEvidence = row[id.startsWith("MAN-") ? 2 : 3];
        const mixed = /\b(test|exercise|runbook|record|design|review|policy|report|owner|approval|scan|analysis|rota|procedure|strategy|SLO|RTO|RPO|baseline|inventory|governance|utilization)\b/i.test(requiredEvidence);
        const status = statuses.get(id) || "";
        const reason = status === "Not verified" ? "Not verified in the current report"
            : manual ? "Collector cannot establish this control"
            : unmapped ? "No direct collector mapping"
            : mixed ? "Configuration alone may need supporting operational evidence"
            : "Additional evidence for a collector-assisted control";
        questions.push({
            id, section, control: row[1], evidence: requiredEvidence,
            question: `How is this control met in your workload? ${row[1]}`,
            reason, status,
            suggested: status === "Not verified" || (!["Pass", "N/A"].includes(status) && (manual || unmapped || mixed)),
        });
    }
    if (!questions.length || new Set(questions.map(q => q.id)).size !== questions.length) {
        throw new Error("The checklist must contain unique control IDs before questions can be displayed.");
    }
    return questions;
}

export async function loadQuestions(root, reportDir) {
    const ref = path.join(root, ".github", "skills", "wordpress-waf-review", "references");
    const [checklist, mapping, report] = await Promise.all([
        readFile(path.join(ref, "AzureWordPressChecklist.md"), "utf8"),
        readFile(path.join(ref, "evidence-map.md"), "utf8"),
        reportDir ? readOptional(path.join(reportDir, "detailed-well-architected-review.md")) : "",
    ]);
    return parseQuestions(checklist, mapping, report || "");
}

export function manualPath(root, runId) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runId)) throw new Error("Invalid manual-validation run ID.");
    return path.join(root, "Review", "manual-validation", runId, "answers.json");
}

export async function loadManual(root, runId) {
    const raw = await readOptional(manualPath(root, runId));
    if (raw === null) return { schemaVersion: 1, runId, revision: 0, responses: {}, history: [] };
    const saved = JSON.parse(raw);
    if (saved.schemaVersion !== 1 || saved.runId !== runId || !Number.isInteger(saved.revision)
        || !saved.responses || typeof saved.responses !== "object" || !Array.isArray(saved.history)) {
        throw new Error("The saved manual-validation file is invalid. Restore it before editing answers.");
    }
    return saved;
}

async function atomicWrite(file, value) {
    await mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
        await writeFile(temp, JSON.stringify(value, null, 2), { encoding: "utf8", flag: "wx" });
        await rename(temp, file);
    } finally { await rm(temp, { force: true }); }
}

export function validateAnswer(answer, questions) {
    if (!answer || !questions.some(q => q.id === answer.controlId)) throw new Error("Select a valid checklist control.");
    if (!decisions.has(answer.decision)) throw new Error("Choose met, not met, not applicable, or unknown.");
    const result = { controlId: answer.controlId, decision: answer.decision };
    for (const [key, limit] of Object.entries({ response: 8000, evidence: 4000, respondent: 200, evidenceDate: 10 })) {
        if (typeof answer[key] !== "string" || answer[key].length > limit) throw new Error(`Invalid ${key}; maximum ${limit} characters.`);
        result[key] = answer[key].trim();
    }
    if (result.evidenceDate && (!/^\d{4}-\d{2}-\d{2}$/.test(result.evidenceDate)
        || !Number.isFinite(Date.parse(result.evidenceDate)) || new Date(result.evidenceDate).toISOString().slice(0, 10) !== result.evidenceDate)) {
        throw new Error("Evidence date must be a real date in YYYY-MM-DD format.");
    }
    if (result.decision !== "unknown" && (!result.response || !result.respondent)) {
        throw new Error("Provide your name and an explanation for a claimed outcome.");
    }
    return result;
}

export async function saveManualAnswer(root, runId, revision, answer, questions) {
    const validated = validateAnswer(answer, questions);
    const file = manualPath(root, runId);
    await mkdir(path.dirname(file), { recursive: true });
    let lock;
    try {
        try { lock = await open(`${file}.lock`, "wx"); }
        catch (error) { if (error.code === "EEXIST") throw new Error("Another answer is being saved. Refresh and retry."); throw error; }
        const current = await loadManual(root, runId);
        if (revision !== current.revision) throw new Error("These answers changed in another panel. Refresh before saving; your draft has not been submitted.");
        const savedAt = new Date().toISOString();
        const response = { ...validated, savedAt };
        const next = {
            ...current, revision: current.revision + 1, updatedAt: savedAt,
            responses: { ...current.responses, [answer.controlId]: response },
            history: [...current.history, { revision: current.revision + 1, ...response }],
        };
        await atomicWrite(file, next);
        return next;
    } finally {
        if (lock) { await lock.close(); await rm(`${file}.lock`, { force: true }); }
    }
}

export async function writeManualSnapshot(root, runId, saved, questions, skipped = false) {
    const file = path.join(path.dirname(manualPath(root, runId)), `assessment-r${saved.revision}-${randomUUID()}.json`);
    const snapshot = {
        schemaVersion: 1, runId, revision: saved.revision, createdAt: new Date().toISOString(), skipped,
        provenance: "User-supplied statements and evidence references, not script-verified results. Evaluate evidence before assigning a status.",
        responses: skipped ? [] : questions.filter(q => saved.responses[q.id]).map(q => ({
            ...saved.responses[q.id], control: q.control, requiredEvidence: q.evidence,
        })),
        unansweredControlIds: questions.filter(q => skipped || !saved.responses[q.id]).map(q => q.id),
    };
    await atomicWrite(file, snapshot);
    return { file, revision: saved.revision, skipped, answerCount: snapshot.responses.length };
}
