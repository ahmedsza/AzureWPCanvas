import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadQuestions, loadManual, manualPath, parseQuestions, saveManualAnswer, validateAnswer, writeManualSnapshot } from "../manual-validation.mjs";

const root = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const questions = await loadQuestions(root);
const answer = { controlId: "MAN-01", decision: "met", response: "Business targets approved", evidence: "BIA v2", respondent: "Owner", evidenceDate: "2026-09-28" };
async function fixture(t) {
    const root = await mkdtemp(path.join(tmpdir(), "waf-manual-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    return root;
}
test("all 157 checklist questions are available, including the 12 manual and non-MAN controls", () => {
    assert.equal(questions.length, 157);
    assert.equal(questions.filter(q => q.id.startsWith("MAN-")).length, 12);
    for (const id of ["FND-01", "FND-06", "CST-14", "OPS-16", "PRF-06", "SEC-20", "MAN-12"]) {
        assert.equal(questions.find(q => q.id === id).suggested, true, id);
    }
    assert.ok(questions.every(q => q.question && q.evidence && q.section));
});
test("Not verified report rows become questions even for collector-assisted controls", async () => {
    const checklist = await readFile(path.join(root, ".github", "skills", "wordpress-waf-review", "references", "AzureWordPressChecklist.md"), "utf8");
    const mapping = await readFile(path.join(root, ".github", "skills", "wordpress-waf-review", "references", "evidence-map.md"), "utf8");
    const parsed = parseQuestions(checklist, mapping, "| SEC-06 | TLS | Not verified | Missing property |\n| FND-01 | Ownership | Pass | dated evidence |");
    assert.equal(parsed.find(q => q.id === "SEC-06").reason, "Not verified in the current report");
    assert.equal(parsed.find(q => q.id === "SEC-06").suggested, true);
    assert.equal(parsed.find(q => q.id === "FND-01").suggested, false);
});
test("answers and edit history persist; concurrent stale writes cannot overwrite", async t => {
    const root = await fixture(t);
    const first = await saveManualAnswer(root, "run-a", 0, answer, questions);
    assert.equal(first.revision, 1);
    await assert.rejects(saveManualAnswer(root, "run-a", 0, { ...answer, response: "stale" }, questions), /changed in another panel/);
    const second = await saveManualAnswer(root, "run-a", 1, { ...answer, response: "Revised" }, questions);
    assert.equal(second.history.length, 2);
    assert.equal((await loadManual(root, "run-a")).responses["MAN-01"].response, "Revised");
    assert.deepEqual((await loadManual(root, "run-b")).responses, {});
});
test("snapshots are immutable and skipped snapshots contain no responses", async t => {
    const root = await fixture(t);
    const first = await saveManualAnswer(root, "run-a", 0, answer, questions);
    const snapshot = await writeManualSnapshot(root, "run-a", first, questions);
    await saveManualAnswer(root, "run-a", 1, { ...answer, response: "changed" }, questions);
    const published = JSON.parse(await readFile(snapshot.file, "utf8"));
    assert.equal(published.responses[0].response, answer.response);
    assert.equal(published.unansweredControlIds.length, 156);
    const skipped = await writeManualSnapshot(root, "run-a", first, questions, true);
    assert.equal(JSON.parse(await readFile(skipped.file, "utf8")).responses.length, 0);
});
test("invalid input and corrupted persistence produce explicit errors", async t => {
    const root = await fixture(t);
    assert.throws(() => manualPath(root, "..\\escape"), /Invalid/);
    assert.throws(() => validateAnswer({ ...answer, controlId: "NO-99" }, questions), /valid checklist/);
    assert.throws(() => validateAnswer({ ...answer, evidenceDate: "2026-02-30" }, questions), /real date/);
    assert.throws(() => validateAnswer({ ...answer, respondent: "" }, questions), /name and an explanation/);
    await saveManualAnswer(root, "run-a", 0, answer, questions);
    await writeFile(manualPath(root, "run-a"), "");
    await assert.rejects(loadManual(root, "run-a"), SyntaxError);
});
test("unknown and incomplete evidence can be saved without inventing verification", () => {
    const saved = validateAnswer({ ...answer, decision: "unknown", respondent: "", response: "", evidenceDate: "", evidence: "" }, questions);
    assert.equal(saved.decision, "unknown");
    assert.equal(Object.hasOwn(saved, "status"), false);
});
