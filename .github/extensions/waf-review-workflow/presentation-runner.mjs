import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";

export function presentationArgs(root, reportDir, mode = "executive", renderChanged = false) {
    if (!["executive", "detailed"].includes(mode)) throw new Error("Choose executive or detailed PowerPoint mode.");
    if (!reportDir) throw new Error("Generate the three review reports before creating PowerPoint.");
    const args = [path.join(root, "Review", "Presentation", "generate.mjs"), "--report-dir", path.resolve(root, reportDir), "--mode", mode];
    if (renderChanged) args.push("--render-changed");
    return args;
}

export function runPresentation(args, { cwd, env, onLine = () => {}, onChild = () => {}, spawnProcess = spawn } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawnProcess("node", args, { cwd, env, windowsHide: true, shell: false });
        onChild(child);
        let result;
        const errors = [];
        const readers = [];
        for (const [stream, source] of [[child.stdout, "stdout"], [child.stderr, "stderr"]]) {
            const lines = createInterface({ input: stream, crlfDelay: Infinity });
            readers.push(lines);
            lines.on("line", (line) => {
                if (!line.trim()) return;
                onLine(line, source);
                if (source === "stderr") {
                    errors.push(line);
                    if (errors.length > 12) errors.shift();
                } else {
                    try { result = JSON.parse(line); } catch { /* human-readable progress */ }
                }
            });
        }
        child.on("error", (error) => {
            for (const reader of readers) reader.close();
            reject(new Error(`Could not start the PowerPoint generator: ${error.message}. Install Node.js and run npm ci --prefix Review\\Presentation once.`));
        });
        child.on("close", (code) => {
            for (const reader of readers) reader.close();
            if (code !== 0) reject(new Error(errors.join("\n") || `PowerPoint generation failed (exit ${code}). Run npm ci --prefix Review\\Presentation if dependencies are missing.`));
            else if (result?.ok !== true || !result.outputFile) reject(new Error("The PowerPoint generator did not report a successful output file."));
            else resolve(result);
        });
    });
}
