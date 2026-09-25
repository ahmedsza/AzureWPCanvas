// Finds wordpress-waf-review output directories in the workspace so the canvas
// can offer a picker when it is opened without an explicit reportDir.

import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { REPORT_FILES } from "./report.mjs";

const SKIP = new Set([
    "node_modules",
    ".git",
    ".vscode",
    ".idea",
    "dist",
    "build",
    "out",
    "bin",
    "obj",
    "vendor",
    "wp-content",
    "wp-includes",
    "wp-admin",
]);

const MARKERS = [REPORT_FILES.summary, REPORT_FILES.detailed, REPORT_FILES.findings];

/** True when `dir` holds at least one of the skill's three output files. */
export async function isReportDirectory(dir) {
    for (const marker of MARKERS) {
        try {
            if ((await stat(path.join(dir, marker))).isFile()) return true;
        } catch {
            /* keep looking */
        }
    }
    return false;
}

async function present(dir) {
    const found = [];
    for (const marker of MARKERS) {
        try {
            if ((await stat(path.join(dir, marker))).isFile()) found.push(marker);
        } catch {
            /* not present */
        }
    }
    return found;
}

/**
 * Walk each root looking for report directories.
 * @param {string|string[]} roots one or more directories to search
 * @returns {Promise<Array<{dir: string, name: string, files: string[], modified: string|null}>>}
 */
export async function discoverReports(roots, { maxDepth = 4, limit = 40 } = {}) {
    const starts = (Array.isArray(roots) ? roots : [roots]).filter(Boolean).map((root) => path.resolve(root));
    if (starts.length === 0) return [];

    const found = [];
    const seen = new Set();
    const queue = starts.map((dir) => ({ dir, depth: 0 }));

    while (queue.length > 0 && found.length < limit) {
        const { dir, depth } = queue.shift();
        if (seen.has(dir)) continue;
        seen.add(dir);

        let entries;
        try {
            entries = await readdir(dir, { withFileTypes: true });
        } catch {
            continue;
        }

        const files = await present(dir);
        if (files.length > 0) {
            let modified = null;
            try {
                modified = (await stat(path.join(dir, files[0]))).mtime.toISOString();
            } catch {
                /* leave null */
            }
            found.push({ dir, name: path.basename(dir), files, modified });
            continue; // report directories are leaves — do not descend further
        }

        if (depth >= maxDepth) continue;
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            if (SKIP.has(entry.name)) continue;
            if (entry.name.startsWith(".") && entry.name !== ".github") continue;
            queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
        }
    }

    return found.sort((a, b) => String(b.modified ?? "").localeCompare(String(a.modified ?? "")));
}
