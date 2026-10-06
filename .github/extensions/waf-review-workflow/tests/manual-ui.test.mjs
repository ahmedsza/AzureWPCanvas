import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const script = await readFile(new URL("../manual-ui.js", import.meta.url), "utf8");
const makeState = () => ({
    run: { runId: "run-test" }, outputs: {}, manual: {
        revision: 0, file: "answers.json", responses: {},
        questions: [{ id: "MAN-01", section: "Manual", question: "Document recovery?", control: "Recovery", evidence: "Dated test", suggested: true }],
    },
});
function fixture() {
    const nodes = new Map();
    for (const id of ["manualFilter", "manualQuestion", "manualQuestionForm", "manualDecision", "manualResponse", "manualEvidence", "manualRespondent", "manualEvidenceDate", "manualSaveStatus", "manualDiscard", "skipManual"]) {
        nodes.set(id, { value: "", dataset: { control: "MAN-01" }, handlers: {}, addEventListener(event, handler) { this.handlers[event] = handler; } });
    }
    const context = {
        state: makeState(), selected: "manual-validation",
        window: { addEventListener() {} }, document: { getElementById: id => nodes.get(id) },
        esc: value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
        canRun: () => true, render() {}, setUiStatus(message) { context.message = message; },
        post: async () => context.state,
    };
    runInNewContext(script + "\nthis.api = { renderManualControls, bindManualControls, manualDirty };", context);
    context.api.renderManualControls({ id: "manual-validation" });
    context.api.bindManualControls();
    return { context, nodes, api: context.api };
}
test("manual UI saves all response fields with optimistic revision and run identity", async () => {
    const { context, nodes } = fixture();
    const fields = { manualDecision: "met", manualResponse: "Restored successfully", manualEvidence: "Report v2", manualRespondent: "Owner", manualEvidenceDate: "2026-09-28" };
    for (const [key, value] of Object.entries(fields)) nodes.get(key).value = value;
    let request;
    context.post = async (url, body) => { request = { url, body }; return { ...makeState(), manual: { ...makeState().manual, revision: 1 } }; };
    await nodes.get("manualQuestionForm").handlers.submit({ preventDefault() {} });
    assert.equal(request.url, "/api/manual-answer");
    assert.equal(request.body.runId, "run-test");
    assert.equal(request.body.revision, 0);
    assert.equal(request.body.answer.controlId, "MAN-01");
    assert.equal(request.body.answer.evidenceDate, fields.manualEvidenceDate);
    assert.equal(request.body.answer.response, fields.manualResponse);
    assert.match(context.message, /^Saved MAN-01/);
});
test("drafts survive server rerenders, remain run-local, and escape HTML", () => {
    const { context, nodes, api } = fixture();
    nodes.get("manualDecision").value = "unknown";
    nodes.get("manualResponse").value = '<script>alert("test")</script>';
    nodes.get("manualQuestionForm").handlers.input();
    context.state = makeState();
    const html = api.renderManualControls({});
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script>/);
    assert.equal(api.manualDirty(), true);
    context.state = { ...makeState(), run: { runId: "run-other" } };
    assert.equal(api.manualDirty(), false);
    assert.doesNotMatch(api.renderManualControls({}), /alert/);
});
test("failed saves preserve drafts and report the conflict", async () => {
    const { context, nodes, api } = fixture();
    nodes.get("manualDecision").value = "unknown";
    nodes.get("manualResponse").value = "Keep this draft";
    context.post = async () => { throw new Error("Answers changed; refresh first"); };
    await nodes.get("manualQuestionForm").handlers.submit({ preventDefault() {} });
    assert.equal(api.manualDirty(), true);
    assert.match(api.renderManualControls({}), /Keep this draft/);
    assert.match(context.message, /refresh first/);
});
