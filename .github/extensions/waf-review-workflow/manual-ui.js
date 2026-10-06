const manualDrafts = new Map();
const manualSelection = new Map();
const manualFilters = new Map();

function manualDraftKey(id) { return state.run.runId + ":" + id; }
function manualDirty() {
    const prefix = state.run.runId + ":";
    return [...manualDrafts].some(([key, value]) => key.startsWith(prefix) && value.dirty);
}
function manualQuestionLabel(q) {
    const answer = state.manual.responses[q.id];
    const status = answer ? answer.decision === "unknown" ? "Unknown" : "Answered" : "Pending";
    return `${q.id} [${status}] ${q.control.slice(0, 95)}`;
}
function renderManualControls(p) {
    const data = state.manual;
    if (!data) return "";
    const filter = manualFilters.get(state.run.runId) || "suggested";
    const questions = data.questions.filter(q => filter === "all" || (filter === "unanswered" ? !data.responses[q.id] : q.suggested));
    const chosen = manualSelection.get(state.run.runId);
    const question = questions.find(q => q.id === chosen) || questions[0];
    if (question) manualSelection.set(state.run.runId, question.id);
    const answers = Object.values(data.responses);
    const supported = answers.filter(a => a.decision !== "unknown" && a.evidence && a.evidenceDate && a.respondent).length;
    const disabled = !canRun(p) || state.outputs.assessment?.waitingForSkill ? "disabled" : "";
    const draft = question ? manualDrafts.get(manualDraftKey(question.id)) : null;
    const answer = draft || (question && data.responses[question.id]) || {};
    return `<section class="manual-section">
      <div class="mini-grid">
        <div class="item"><strong>${answers.length} answered / ${data.questions.length} controls</strong><span class="muted">${supported} responses include dated evidence references; this is not a Pass count.</span></div>
        <div class="item"><strong>Saved revision ${data.revision}</strong><span class="muted">${esc(data.file)}</span></div>
      </div>
      <p class="muted">Optional: answer as many as you can. The shortlist includes manual/process controls and unresolved report findings, not just MAN-01–12. Before assessment these are candidate questions; use All controls for any other gap. A saved answer does not prove a control passes.</p>
      <p class="muted">Do not enter passwords, keys, connection strings, personal data, or token-bearing URLs. Reference approved evidence instead.</p>
      ${state.outputs.assessment?.requiresRerun ? '<p class="warning">Reports need regeneration using the selected manual evidence. Existing files are retained but are not the current final assessment.</p>' : ""}
      <label>Question list<select id="manualFilter">
        <option value="suggested" ${filter === "suggested" ? "selected" : ""}>Manual validation and evidence gaps</option>
        <option value="unanswered" ${filter === "unanswered" ? "selected" : ""}>All unanswered controls</option>
        <option value="all" ${filter === "all" ? "selected" : ""}>All checklist controls</option>
      </select></label>
      <label>${questions.length} questions<select id="manualQuestion" size="7">
        ${questions.map(q => `<option value="${esc(q.id)}" ${question?.id === q.id ? "selected" : ""}>${esc(manualQuestionLabel(q))}</option>`).join("")}
      </select></label>
      ${question ? `<form id="manualQuestionForm" data-control="${esc(question.id)}">
        <h3>${esc(question.id)} · ${esc(question.section)}</h3>
        <p><strong>${esc(question.question)}</strong></p>
        <p class="muted">${esc(question.reason)}${question.status ? " · Current report: " + esc(question.status) : ""}</p>
        <div class="item"><strong>Evidence to provide</strong><span>${esc(question.evidence)}</span></div>
        <label>Your assessment (not an automatic report status)<select id="manualDecision" ${disabled}>
          ${[["unknown", "Unknown / not yet validated"], ["met", "Meets the control"], ["not-met", "Does not meet the control"], ["not-applicable", "Not applicable — provide rationale and approver"]].map(([value, label]) => `<option value="${value}" ${(answer.decision || "unknown") === value ? "selected" : ""}>${label}</option>`).join("")}
        </select></label>
        <label>Answer, observations and rationale<textarea id="manualResponse" rows="5" maxlength="8000" ${disabled}>${esc(answer.response || "")}</textarea></label>
        <label>Evidence references and measured results<textarea id="manualEvidence" rows="3" maxlength="4000" placeholder="Document reference, approved link, test results; do not paste secrets" ${disabled}>${esc(answer.evidence || "")}</textarea></label>
        <div class="mini-grid">
          <label>Respondent / approver<input id="manualRespondent" maxlength="200" value="${esc(answer.respondent || "")}" ${disabled} /></label>
          <label>Evidence / validation date<input id="manualEvidenceDate" type="date" value="${esc(answer.evidenceDate || "")}" ${disabled} /></label>
        </div>
        <p class="muted" id="manualSaveStatus">${draft?.dirty ? "Unsaved changes — save or discard before continuing." : answer.savedAt ? "Saved " + esc(new Date(answer.savedAt).toLocaleString()) : "No saved answer for this question."}</p>
        <div class="actions"><button type="submit" class="primary" ${disabled}>Save answer</button><button id="manualDiscard" type="button">Discard unsaved changes / reload answer</button></div>
      </form>` : '<p class="muted">No questions match this filter. Switch to All controls to review saved answers.</p>'}
      <p class="muted">Continue with saved answers to include them in the reports. Skipping retains the answers but excludes them from the next assessment. You can revisit this step later; edits require report regeneration.</p>
      <button type="button" id="skipManual" ${disabled}>Skip manual validation</button>
    </section>`;
}
function bindManualControls() {
    const filter = document.getElementById("manualFilter");
    if (!filter) return;
    filter.addEventListener("change", () => { manualFilters.set(state.run.runId, filter.value); render(); });
    document.getElementById("manualQuestion").addEventListener("change", event => {
        manualSelection.set(state.run.runId, event.target.value); render();
    });
    const form = document.getElementById("manualQuestionForm");
    if (form) {
        const id = form.dataset.control;
        const key = manualDraftKey(id);
        const capture = () => {
            const previous = manualDrafts.get(key);
            const draft = {
                controlId: id, decision: document.getElementById("manualDecision").value,
                response: document.getElementById("manualResponse").value,
                evidence: document.getElementById("manualEvidence").value,
                respondent: document.getElementById("manualRespondent").value,
                evidenceDate: document.getElementById("manualEvidenceDate").value,
                baseRevision: previous?.baseRevision ?? state.manual.revision, dirty: true,
            };
            manualDrafts.set(key, draft);
            document.getElementById("manualSaveStatus").textContent = "Unsaved changes — save or discard before continuing.";
            return draft;
        };
        form.addEventListener("input", capture);
        form.addEventListener("submit", async event => {
            event.preventDefault();
            const draft = capture();
            const runId = state.run.runId;
            try {
                const next = await post("/api/manual-answer", { runId, revision: draft.baseRevision, answer: draft });
                manualDrafts.delete(key);
                for (const [otherKey, other] of manualDrafts) {
                    if (otherKey.startsWith(runId + ":") && other.baseRevision === draft.baseRevision) other.baseRevision = next.manual.revision;
                }
                if (state.run.runId === runId) state = next;
                render();
                setUiStatus("Saved " + id + ". Continue with saved answers before generating the final reports.", "success");
            } catch (error) { setUiStatus(error.message, "error"); }
        });
        document.getElementById("manualDiscard").addEventListener("click", async () => {
            manualDrafts.delete(key);
            try { state = await post("/api/refresh"); render(); }
            catch (error) { setUiStatus(error.message, "error"); }
        });
    }
    document.getElementById("skipManual").addEventListener("click", async () => {
        if (manualDirty()) { setUiStatus("Save or discard your unsaved answers before skipping.", "error"); return; }
        try {
            state = await post("/api/run-phase", { phaseId: "manual-validation", skipManual: true });
            selected = state.currentPhase; render();
            setUiStatus("Manual validation skipped; saved responses will not be used in the next assessment.", "success");
        } catch (error) { setUiStatus(error.message, "error"); }
    });
}
window.addEventListener("beforeunload", event => {
    if ([...manualDrafts.values()].some(value => value.dirty)) { event.preventDefault(); event.returnValue = ""; }
});
