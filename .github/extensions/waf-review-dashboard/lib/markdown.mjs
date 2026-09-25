// Minimal, dependency-free markdown-table and CSV readers.
//
// The wordpress-waf-review skill emits fixed table structures (see
// .github/skills/wordpress-waf-review/references/report-templates.md), so the
// dashboard reads them by header signature rather than by position in the file.

/** Split one `| a | b |` row into trimmed cells, honouring `\|` escapes. */
export function splitRow(line) {
    const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    return trimmed.split(/(?<!\\)\|/).map((cell) => cell.replace(/\\\|/g, "|").trim());
}

const DELIMITER = /^\s*\|(\s*:?-{2,}:?\s*\|)+\s*$/;
const ROW = /^\s*\|.*\|\s*$/;

/**
 * Extract every pipe table in a markdown document, tagged with the nearest
 * preceding `##` and `###` headings so callers can disambiguate tables that
 * share a header signature.
 */
export function parseTables(markdown) {
    const lines = markdown.split(/\r?\n/);
    const tables = [];
    let h2 = "";
    let h3 = "";

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const heading = /^(#{2,3})\s+(.*)$/.exec(line);
        if (heading) {
            if (heading[1].length === 2) {
                h2 = heading[2].trim();
                h3 = "";
            } else {
                h3 = heading[2].trim();
            }
            continue;
        }

        if (!ROW.test(line) || !DELIMITER.test(lines[i + 1] ?? "")) continue;

        const headers = splitRow(line);
        const rows = [];
        let cursor = i + 2;
        while (cursor < lines.length && ROW.test(lines[cursor])) {
            rows.push(splitRow(lines[cursor]));
            cursor++;
        }
        tables.push({ h2, h3, headers, rows });
        i = cursor - 1;
    }

    return tables;
}

/** Case- and punctuation-insensitive comparison key for a header cell. */
function key(text) {
    return String(text ?? "")
        .replace(/\*\*/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
}

/**
 * Find the first table whose leading headers match `signature`. Optionally
 * constrain to tables under a heading containing `heading`.
 */
export function findTable(tables, signature, heading) {
    const wanted = signature.map(key);
    return (
        tables.find((table) => {
            if (heading && !`${table.h2} ${table.h3}`.toLowerCase().includes(heading.toLowerCase())) {
                return false;
            }
            return wanted.every((want, index) => key(table.headers[index]) === want);
        }) ?? null
    );
}

/** Map a table's rows to objects using the supplied property names. */
export function rowsAsObjects(table, names) {
    if (!table) return [];
    return table.rows
        .filter((cells) => cells.some((cell) => cell !== ""))
        .map((cells) => {
            const record = {};
            names.forEach((name, index) => {
                record[name] = clean(cells[index] ?? "");
            });
            return record;
        });
}

/** Strip markdown emphasis and inline code markers from a cell value. */
export function clean(value) {
    return String(value ?? "")
        .replace(/\*\*/g, "")
        .replace(/`/g, "")
        .trim();
}

/** First number in a string, or null. Handles `8%`, `4-5`, `n/a`. */
export function num(value) {
    const match = /-?\d+(?:\.\d+)?/.exec(String(value ?? ""));
    return match ? Number(match[0]) : null;
}

/** Normalise a RAG cell (`Red`, `🟡 Amber`, `Amber - insufficient evidence`). */
export function rag(value) {
    const text = String(value ?? "").toLowerCase();
    if (text.includes("green")) return "Green";
    if (text.includes("amber") || text.includes("yellow")) return "Amber";
    if (text.includes("red")) return "Red";
    return null;
}

/** Normalise a control status cell to one of the four canonical values. */
export function status(value) {
    const text = clean(value).toLowerCase();
    if (text === "pass") return "Pass";
    if (text === "fail") return "Fail";
    if (text === "n/a" || text === "na") return "N/A";
    if (text.startsWith("not verified")) return "Not verified";
    if (text.includes("fail")) return "Fail";
    if (text.includes("pass")) return "Pass";
    return "Not verified";
}

/** RFC 4180 CSV reader: quotes, escaped quotes, embedded commas and newlines. */
export function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    const source = String(text ?? "").replace(/^\uFEFF/, "");

    for (let i = 0; i < source.length; i++) {
        const char = source[i];
        if (quoted) {
            if (char === '"') {
                if (source[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    quoted = false;
                }
            } else {
                field += char;
            }
            continue;
        }
        if (char === '"') {
            quoted = true;
        } else if (char === ",") {
            row.push(field);
            field = "";
        } else if (char === "\n") {
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
        } else if (char !== "\r") {
            field += char;
        }
    }
    if (field !== "" || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}
