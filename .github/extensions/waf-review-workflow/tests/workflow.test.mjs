import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, mkdir, writeFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Script } from "node:vm";
import { presentationArgs, runPresentation } from "../presentation-runner.mjs";

const file = await readFile(new URL("../extension.mjs", import.meta.url), "utf8");
const source = file.replace(/^import .*;\r?\n/gm, "").split("const workflowCanvas = createCanvas(")[0];
async function fixture(t, { powerShell } = {}) {
    const root = await mkdtemp(path.join(tmpdir(), "waf-workflow-test-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const sends = [];
    const api = new Function("path", "process", "mkdir", "readFile", "readdir", "rm", "stat", "writeFile", "CanvasError", "session", "presentationArgs", "runPresentation", "mockPowerShell",
        source + "\nif (mockPowerShell) runPowerShell = mockPowerShell;\nreturn { PHASES, SKILL_MILESTONES, WorkflowInstance, normalizeInput, derivePhaseState, phaseCommands, statusFor, renderHtml, matchingRunReports };"
    )(path, { cwd: () => root, env: {} }, mkdir, readFile, readdir, rm, stat, writeFile, class extends Error { constructor(code, message) { super(message); this.code = code; } },
        { send: async (request) => { sends.push(request); return "message"; } }, presentationArgs, runPresentation, powerShell);
    const instance = new api.WorkflowInstance({ instanceId: "test", input: {} });
    instance.loadedRuns = true;
    instance.ensureCurrentSubscription = async () => {};
    instance.persistRuns = async () => {};
    t.after(() => instance.stopSkillWatch());
    return { ...api, root, instance, sends };
}
const previous = () => Object.fromEntries(["dependencies", "connect", "preassess", "collect", "package", "prepare_assessment"].map(k => [k, { ok: true }]));
const discovery = complete => ({ reports: complete === null ? [] : [{ complete, dir: "reports" }], zips: [] });

test("three reports complete the assessment without any PowerPoint", async t => {
    const f = await fixture(t);
    const phases = f.derivePhaseState({}, discovery(true), previous(), null);
    assert.equal(phases.find(p => p.id === "assessment").status, "done");
    assert.equal(phases.find(p => p.id === "display").status, "ready");
    assert.equal(phases.find(p => p.id === "presentation").status, "pending");
    assert.equal(f.SKILL_MILESTONES.some(m => m.file?.endsWith(".pptx")), false);
    assert.equal(f.PHASES.filter(p => !p.optional).length, 8);
});
test("waiting and partial reports do not unlock the dashboard", async t => {
    const f = await fixture(t);
    for (const complete of [null, false]) {
        const phases = f.derivePhaseState({}, discovery(complete), { ...previous(), assessment: { ok: false, waitingForSkill: true } }, null);
        assert.equal(phases.find(p => p.id === "assessment").status, "running");
        assert.equal(phases.find(p => p.id === "display").status, "pending");
    }
});
test("recorded and discovered downstream completion cannot bypass prior steps", async t => {
    const f = await fixture(t);
    const phases = f.derivePhaseState({ subscription: "s", resourceGroup: "rg" }, discovery(true), { assessment: { ok: true }, display: { ok: true } }, null);
    assert.equal(phases[0].status, "current");
    assert.ok(phases.slice(1).every(p => p.status === "pending"));
});
test("all required steps complete leaves optional presentation ready at 100%", async t => {
    const f = await fixture(t);
    const phases = f.derivePhaseState({}, discovery(true), { ...previous(), assessment: { ok: true }, display: { ok: true } }, null);
    assert.equal(phases.at(-1).id, "presentation");
    assert.equal(phases.at(-1).status, "current");
    assert.match(f.statusFor({ phases, currentPhase: "presentation" }), /^8\/8 review steps complete/);
    f.instance.state = { phases };
    let called = false;
    f.instance.runPhase = async () => { called = true; };
    f.instance.refresh = async () => f.instance.state;
    await f.instance.runNext();
    await f.instance.runAutomatic();
    assert.equal(called, false);
});
test("old runs default to executive; mode changes invalidate displayed build state", async t => {
    const f = await fixture(t);
    assert.equal(f.normalizeInput({}).deckMode, "executive");
    assert.equal(f.normalizeInput({}).renderChanged, false);
    const phases = f.derivePhaseState({ deckMode: "detailed", renderChanged: false }, discovery(true), {
        ...previous(), assessment: { ok: true }, display: { ok: true }, presentation: { ok: true, mode: "executive", renderChanged: false },
    }, null);
    assert.equal(phases.at(-1).status, "current");
});
test("assessment prompt excludes PowerPoint and matching requires exact run name", async t => {
    const f = await fixture(t);
    const commands = f.phaseCommands({ evidenceDir: path.join(f.root, "sample") }, discovery(null), {});
    assert.match(commands.reviewPrompt, /Do not generate PowerPoint/);
    assert.match(commands.presentation, /--mode executive/);
    assert.deepEqual(f.matchingRunReports({ evidenceDir: "sample" }, { reports: [{ dir: "sample-other-reports" }, { dir: "sample-reports" }] }, {}).map(r => r.dir), ["sample-reports"]);
});
test("watcher independently detects out-of-order files and completes without a deck", async t => {
    const f = await fixture(t);
    const dir = path.join(f.root, "Review", "reports", "sample-reports");
    await mkdir(dir, { recursive: true });
    const out = { ok: false, waitingForSkill: true, expectedReportDir: dir };
    f.instance.outputs.assessment = out;
    await writeFile(path.join(dir, "executive-summary.md"), "summary");
    f.instance.refresh = async () => {};
    await f.instance.pollSkillMilestones();
    assert.ok(out.milestonesSeen.summary);
    assert.equal(out.waitingForSkill, true);
    await writeFile(path.join(dir, "detailed-well-architected-review.md"), "detail");
    await writeFile(path.join(dir, "findings.csv"), "");
    await f.instance.pollSkillMilestones();
    assert.equal(out.waitingForSkill, true);
    await writeFile(path.join(dir, "findings.csv"), "FindingId");
    await f.instance.pollSkillMilestones();
    assert.equal(out.ok, true);
    assert.equal(out.waitingForSkill, false);
});
test("server rejects locked presentation before spawning or changing inputs", async t => {
    const f = await fixture(t);
    await assert.rejects(f.instance.runPhase("presentation"), /Complete the previous/);
    assert.equal(f.instance.runningPhase, null);
    assert.equal(f.sends.length, 0);
});
test("presentation failure does not affect report or dashboard completion", async t => {
    const f = await fixture(t);
    f.instance.outputs = { ...previous(), assessment: { ok: true }, display: { ok: true } };
    f.instance.refresh = async () => {
        f.instance.state = { phases: f.derivePhaseState(f.instance.input, discovery(true), f.instance.outputs, f.instance.runningPhase) };
    };
    f.instance.executePhase = async () => { throw new Error("generator unavailable"); };
    await assert.rejects(f.instance.runPhase("presentation"), /generator unavailable/);
    assert.equal(f.instance.outputs.assessment.ok, true);
    assert.equal(f.instance.outputs.display.ok, true);
    assert.equal(f.instance.outputs.presentation.ok, false);
    assert.equal(f.instance.runningPhase, null);
    assert.match(f.statusFor(f.instance.state), /^8\/8 review steps complete/);
});
test("uploaded runs skip early steps but cannot bypass extraction", async t => {
    const f = await fixture(t);
    const outputs = Object.fromEntries(["dependencies", "connect", "preassess", "collect", "package"].map(k => [k, { ok: true, skipped: true }]));
    const phases = f.derivePhaseState({}, discovery(true), outputs, null);
    assert.ok(phases.slice(0, 5).every(p => p.status === "done"));
    assert.equal(phases[5].status, "current");
    assert.ok(phases.slice(6).every(p => p.status === "pending"));
});
test("snapshot exposes latest bounded logs and skill activity during execution", async t => {
    const f = await fixture(t);
    f.instance.state = { logs: [], skill: {} };
    f.instance.outputs.assessment = { waitingForSkill: true };
    for (let i = 0; i < 605; i++) f.instance.addLog("presentation", `line ${i}`);
    f.instance.noteSkillActivity("Writing findings");
    const state = f.instance.snapshot();
    assert.equal(state.logs.length, 600);
    assert.equal(state.logs.at(-1).message, "Writing findings");
    assert.equal(state.skill.activity, "Writing findings");
});
test("duplicate skill submission is rejected without enqueueing another request", async t => {
    const f = await fixture(t);
    f.instance.outputs = { ...previous(), assessment: { ok: false, waitingForSkill: true } };
    f.instance.refresh = async () => {
        f.instance.state = { phases: f.derivePhaseState({}, discovery(false), f.instance.outputs, null), discovered: discovery(false) };
    };
    await assert.rejects(f.instance.runPhase("assessment"), /already running/);
    assert.equal(f.sends.length, 0);
});
test("required prerequisite failure cannot be recorded as successful", async t => {
    const f = await fixture(t, { powerShell: async () => ({ ok: false, checks: [{ id: "az-login", ok: false }] }) });
    const result = await f.instance.executePhase("dependencies");
    assert.equal(result.ok, false);
    assert.equal(result.result.checks[0].id, "az-login");
    const phases = f.derivePhaseState({}, discovery(null), { dependencies: result }, null);
    assert.equal(phases[0].status, "failed");
    assert.ok(phases.slice(1).every(p => p.status === "blocked"));
});
test("legacy waiting runs recover their report path and resume the watcher", async t => {
    const f = await fixture(t);
    f.instance.outputs = { prepare_assessment: { evidenceDir: path.join(f.root, "legacy") }, assessment: { waitingForSkill: true } };
    let watching;
    f.instance.startSkillWatch = dir => { watching = dir; };
    f.instance.resumeSkillWatch();
    assert.equal(path.basename(watching), "legacy-reports");
    assert.equal(watching, f.instance.outputs.assessment.expectedReportDir);
});
test("client JavaScript parses and contains optional controls without workspace card", async t => {
    const f = await fixture(t);
    const html = f.renderHtml();
    new Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
    assert.match(html, /id="deckMode"/);
    assert.match(html, /Render changed slides/);
    assert.doesNotMatch(html, /Workspace state|renderWorkspace/);
    assert.match(html, /filter\(\(p\) => !p.optional\)/);
});
test("presentation args use explicit mode and paths without shell interpolation", () => {
    const args = presentationArgs("C:\\work", "reports folder", "detailed", true);
    assert.ok(args.includes("--render-changed"));
    assert.equal(args[args.indexOf("--mode") + 1], "detailed");
    assert.throws(() => presentationArgs("root", "report", "invalid"), /executive or detailed/);
});
test("runner buffers streamed chunks and returns the final JSON result", async t => {
    const f = await fixture(t);
    const command = path.join(f.root, "fake.mjs");
    await writeFile(command, `process.stdout.write("Build"); setTimeout(()=>{console.log("ing"); console.log(JSON.stringify({ok:true,outputFile:"out.pptx",mode:"executive",slideCount:14,cached:false}));}, 10);`);
    const lines = [];
    const result = await runPresentation([command], { cwd: f.root, onLine: line => lines.push(line) });
    assert.equal(lines[0], "Building");
    assert.equal(result.slideCount, 14);
});
test("runner rejects failed commands and missing success results", async t => {
    const f = await fixture(t);
    await assert.rejects(runPresentation(["-e", "console.error('missing dependency');process.exitCode=1"], { cwd: f.root }), /missing dependency/);
    await assert.rejects(runPresentation(["-e", "console.log('done')"], { cwd: f.root }), /did not report/);
});
