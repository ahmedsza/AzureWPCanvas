// One loopback HTTP server per open canvas instance: serves the dashboard
// shell, a JSON snapshot of the parsed report, and an SSE channel so agent
// actions (refresh / focus / load_report) update the iframe live.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverReports } from "./discover.mjs";
import { loadReport } from "./report.mjs";

const UI_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "ui");

const CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
};

function sendJson(res, statusCode, body) {
    const payload = JSON.stringify(body);
    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Length": Buffer.byteLength(payload),
    });
    res.end(payload);
}

async function sendAsset(res, name) {
    const target = path.join(UI_DIR, name);
    if (!target.startsWith(UI_DIR)) {
        res.writeHead(403).end("Forbidden");
        return;
    }
    try {
        const body = await readFile(target);
        res.writeHead(200, {
            "Content-Type": CONTENT_TYPES[path.extname(target)] ?? "application/octet-stream",
            "Cache-Control": "no-store",
        });
        res.end(body);
    } catch {
        res.writeHead(404).end("Not found");
    }
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

/**
 * Canvas-instance state. `reportDir` is the durable identity here: the report
 * lives on disk and is re-read on demand, so the same directory opened under a
 * different instanceId shows exactly the same content.
 */
export class DashboardInstance {
    constructor({ instanceId, roots = [], reportDir }) {
        this.instanceId = instanceId;
        this.roots = roots;
        this.reportDir = reportDir ?? null;
        this.report = null;
        this.error = null;
        this.available = [];
        this.focus = null;
        this.clients = new Set();
        this.server = null;
        this.url = null;
    }

    async refresh() {
        this.available = await discoverReports(this.roots);
        if (!this.reportDir && this.available.length > 0) {
            this.reportDir = this.available[0].dir;
        }
        if (!this.reportDir) {
            this.report = null;
            this.error = {
                code: "report_not_found",
                message:
                    "No well-architected review output was found. Run the /wordpress-waf-review skill, then re-open this canvas with the report directory it wrote.",
            };
            return this;
        }
        try {
            this.report = await loadReport(this.reportDir);
            this.error = null;
        } catch (cause) {
            this.report = null;
            this.error = { code: cause.code ?? "report_load_failed", message: cause.message };
        }
        return this;
    }

    async setReportDir(dir) {
        this.reportDir = dir ? path.resolve(dir) : null;
        await this.refresh();
        this.broadcast();
        return this;
    }

    snapshot() {
        return {
            instanceId: this.instanceId,
            reportDir: this.reportDir,
            roots: this.roots,
            available: this.available,
            report: this.report,
            error: this.error,
            focus: this.focus,
        };
    }

    broadcast(event = { type: "state" }) {
        const frame = `data: ${JSON.stringify(event)}\n\n`;
        for (const client of this.clients) {
            try {
                client.write(frame);
            } catch {
                this.clients.delete(client);
            }
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

    async handle(req, res) {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");

        if (url.pathname === "/" || url.pathname === "/index.html") {
            await sendAsset(res, "index.html");
            return;
        }
        if (url.pathname === "/favicon.ico") {
            res.writeHead(204).end();
            return;
        }
        if (/^\/[A-Za-z0-9_.-]+\.(?:css|js|svg)$/.test(url.pathname)) {
            await sendAsset(res, url.pathname.slice(1));
            return;
        }
        if (url.pathname === "/api/state") {
            sendJson(res, 200, this.snapshot());
            return;
        }
        if (url.pathname === "/api/reload" && req.method === "POST") {
            await this.refresh();
            sendJson(res, 200, this.snapshot());
            this.broadcast();
            return;
        }
        if (url.pathname === "/api/select" && req.method === "POST") {
            const body = await readBody(req);
            await this.setReportDir(body.reportDir);
            sendJson(res, 200, this.snapshot());
            return;
        }
        if (url.pathname === "/events") {
            res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
            });
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

        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    }
}
