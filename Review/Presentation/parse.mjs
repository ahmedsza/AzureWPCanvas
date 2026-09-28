// Adapted from the archived evidence-led report parser. Only these three reports are read.
export const INPUTS = ['executive-summary.md', 'detailed-well-architected-review.md', 'findings.csv'];
export const PILLARS = ['Foundations & governance', 'Reliability', 'Security', 'Cost Optimization', 'Operational Excellence', 'Performance Efficiency'];
const ranges = { FND: 13, REL: 17, SEC: 24, CST: 14, OPS: 17, PRF: 15, APP: 2, SQL: 4, KV: 2, RDS: 3, FD: 3, NET: 7, NAT: 6, MON: 7, ACS: 5, DEF: 6, MAN: 12 };
const prefixes = Object.keys(ranges).slice(0, 6);
const statuses = ['Pass', 'Fail', 'N/A', 'Not verified'];
const clean = text => String(text ?? '').replace(/\*\*/g, '').replace(/`/g, '').trim();
function requireThat(condition, message) { if (!condition) throw new Error(`Report validation: ${message}`); }

export function assertNoSecrets(text) {
  // Reject credential-shaped assignments, not harmless prose discussing credential hygiene.
  const patterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
    /\b(?:AccountKey|SharedAccessKey|client_secret|clientSecret|access_token|accessToken|refresh_token|password|pwd|api[_-]?key)\s*["'`]*\s*[:=]\s*["'`]*[^\s"'`;|,<>]{4,}/i,
    /\bBearer\s+[A-Za-z0-9._~+/-]{16,}/i,
    /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/,
    /[?&]sig=[A-Za-z0-9%+/=]{12,}/i,
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  ];
  requireThat(!patterns.some(pattern => pattern.test(text)), 'credential/secret marker detected; sanitize the report inputs before generation (no values are logged)');
}

export function splitMarkdownRow(line) {
  const cells = []; let cell = '';
  for (let i = 0; i < line.trim().length; i++) {
    const ch = line.trim()[i];
    if (ch === '\\' && ['|', '\\'].includes(line.trim()[i + 1])) cell += line.trim()[++i];
    else if (ch === '|') { cells.push(clean(cell)); cell = ''; }
    else cell += ch;
  }
  cells.push(clean(cell));
  if (cells[0] === '') cells.shift();
  if (cells.at(-1) === '') cells.pop();
  return cells;
}

export function table(source, heading, optional = false) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const start = lines.findIndex(line => clean(line).toLowerCase() === heading.toLowerCase());
  requireThat(optional || start >= 0, `missing heading ${heading}`);
  if (start < 0) return [];
  const result = []; let seen = false;
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6} /.test(line)) break;
    if (!line.trim().startsWith('|')) { if (seen) break; continue; }
    const row = splitMarkdownRow(line);
    if (!seen) { seen = true; continue; }
    if (row.every(value => /^:?-+:?$/.test(value))) continue;
    result.push(row);
  }
  requireThat(optional || result.length > 0, `empty table ${heading}`);
  return result;
}

export function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false, closed = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closed = true; }
      } else cell += ch;
    } else if (ch === '"') {
      requireThat(cell === '' && !closed, 'invalid CSV quoting');
      quoted = true;
    } else if (ch === ',') { row.push(cell); cell = ''; closed = false; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); if (row.some(value => value !== '')) rows.push(row);
      row = []; cell = ''; closed = false;
    } else { requireThat(!closed, 'characters after a CSV closing quote'); cell += ch; }
  }
  requireThat(!quoted, 'unterminated CSV quoted field');
  if (cell || row.length || closed) { row.push(cell); rows.push(row); }
  const headers = rows.shift() ?? [];
  requireThat(new Set(headers).size === headers.length, 'duplicate CSV headers');
  return rows.map(values => {
    requireThat(values.length === headers.length, 'CSV row has a different number of columns than its header');
    return Object.fromEntries(headers.map((key, i) => [key, values[i]]));
  });
}

function number(text) {
  text = clean(text);
  if (/^(?:n\/a|—|–|not assessed)$/i.test(text)) return null;
  requireThat(/^\d+(?:\.\d+)?%?$/.test(text), `invalid numeric score/count "${text}"`);
  return Number(text.replace('%', ''));
}
function scoreRows(rows) {
  return rows.map(row => {
    requireThat(row.length === 9, 'scorecard must have nine columns');
    return Object.fromEntries(['section', 'total', 'pass', 'fail', 'na', 'nv', 'score', 'coverage', 'rag']
      .map((key, i) => [key, i > 0 && i < 8 ? number(row[i]) : row[i]]));
  });
}
const counts = controls => Object.fromEntries(['pass', 'fail', 'na', 'nv'].map((key, i) => [key, controls.filter(control => control.status === statuses[i]).length]));
function checkScore(row, controls) {
  requireThat(row.total === controls.length, `${row.section}: control total mismatch`);
  const actual = counts(controls);
  for (const key of Object.keys(actual)) requireThat(row[key] === actual[key], `${row.section}: ${key} count mismatch`);
  const decided = actual.pass + actual.fail;
  const expected = decided ? Math.round(actual.pass / decided * 100) : null;
  requireThat(row.score === expected, `${row.section}: score must match Pass / decided controls (n/a if none decided)`);
  const applicable = controls.length - actual.na;
  const coverage = applicable ? Math.round(decided / applicable * 100) : null;
  requireThat(row.coverage === coverage, `${row.section}: coverage does not match decided / applicable controls`);
}
function headline(text) {
  if (/^(?:n\/a|—|–)(?:\s|$)/i.test(text)) return null;
  const match = /^(\d+(?:\.\d+)?)%/.exec(text);
  requireThat(match, 'headline must begin with a percentage or n/a');
  return Number(match[1]);
}

export function parseReports(inputs) {
  for (const name of INPUTS) requireThat(typeof inputs[name] === 'string' && inputs[name].trim(), `missing input ${name}`);
  for (const text of Object.values(inputs)) assertNoSecrets(text);
  const exe = inputs[INPUTS[0]].replace(/^\uFEFF/, ''), det = inputs[INPUTS[1]].replace(/^\uFEFF/, '');
  const scores = scoreRows(table(det, '## 2. Scoring summary'));
  const total = scores.pop();
  requireThat(scores.length === 8 && /^Total$/i.test(total.section), 'expected eight sections and a total row');
  const controls = [];
  for (const line of det.split(/\r?\n/)) {
    if (!/^\s*\|\s*[A-Z]{2,5}-\d+\s*\|/.test(line)) continue;
    const r = splitMarkdownRow(line), [prefix, suffix] = r[0].split('-');
    requireThat(ranges[prefix] && /^\d{2}$/.test(suffix) && Number(suffix) > 0 && Number(suffix) <= ranges[prefix], `unknown control ID ${r[0]}`);
    const manual = prefix === 'MAN';
    const control = { id: r[0], control: r[1], status: r[manual ? 3 : 2], observation: r[manual ? 2 : 4], recommendation: r[manual ? 2 : 5] };
    requireThat(r.length >= 6 && statuses.includes(control.status), `invalid control row ${control.id}`);
    controls.push(control);
  }
  requireThat(new Set(controls.map(c => c.id)).size === controls.length, 'duplicate control IDs');
  requireThat(controls.length > 0, 'no checklist controls');
  scores.forEach((score, i) => {
    requireThat(score.section.startsWith(`${i + 1}.`), 'scorecard sections out of order');
    const group = controls.filter(c => i < 6 ? c.id.startsWith(`${prefixes[i]}-`) : i === 7 ? c.id.startsWith('MAN-') : ![...prefixes, 'MAN'].includes(c.id.split('-')[0]));
    checkScore(score, group);
  });
  checkScore(total, controls);
  const executiveScores = scoreRows(table(exe, '## Pillar scorecard'));
  requireThat(executiveScores.length === 9, 'executive scorecard row count');
  executiveScores.forEach((row, i) => {
    for (const key of ['total', 'pass', 'fail', 'na', 'nv', 'score', 'coverage'])
      requireThat(row[key] === [...scores, total][i][key], `executive/detailed ${key} mismatch at row ${i + 1}`);
  });
  const overallTable = Object.fromEntries(table(exe, '## Overall posture'));
  const overall = { score: headline(overallTable['Overall score'] ?? ''), coverage: headline(overallTable['Evidence coverage'] ?? '') };
  for (const key of ['score', 'coverage']) {
    const values = scores.slice(0, 6).map(s => s[key]);
    const expected = values.includes(null) ? null : Math.round(values.reduce((a, b) => a + b, 0) / 6);
    requireThat(overall[key] === expected, `overall ${key} must be the six-pillar mean; undefined pillars cannot be dropped or converted to zero`);
  }
  const summaryCounts = overallTable['Pass / Fail / N/A / Not verified']?.split('/').map(value => Number(value.trim()));
  requireThat(summaryCounts?.length === 4 && summaryCounts.every((n, i) => n === total[['pass', 'fail', 'na', 'nv'][i]]), 'overall disposition counts mismatch');
  requireThat(Number(overallTable['Controls assessed']?.match(/^\d+/)?.[0]) === total.total, 'overall controls assessed mismatch');
  const findings = parseCsv(inputs[INPUTS[2]]).map(f => {
    for (const key of ['FindingId', 'ControlId', 'Title', 'Summary', 'Status', 'Recommendation', 'Priority'])
      requireThat(typeof f[key] === 'string' && f[key].trim(), `missing CSV ${key}`);
    for (const key of ['Severity', 'Effort', 'Risk', 'Cost']) {
      requireThat(/^[1-5]$/.test(f[key]), `CSV ${key} must be an integer 1–5`);
      f[key] = Number(f[key]);
    }
    const control = controls.find(c => c.id === f.ControlId);
    requireThat(control, `unknown finding control ${f.ControlId}`);
    requireThat(['Fail', 'Not verified'].includes(f.Status) && control.status === f.Status, `finding/control status mismatch ${f.ControlId}`);
    return f;
  });
  requireThat(new Set(findings.map(f => f.FindingId)).size === findings.length, 'duplicate finding IDs');
  for (const c of controls.filter(c => c.status === 'Fail')) requireThat(findings.some(f => f.ControlId === c.id && f.Status === 'Fail'), `missing CSV finding for Fail ${c.id}`);
  const meta = {};
  for (const match of exe.matchAll(/\*\*([^*]+):\*\*\s*([^·\n]+)/g)) meta[match[1]] = match[2].trim();
  return {
    meta, scores, total, overall, controls, findings,
    strengths: table(exe, '## What is working well', true),
    keyFindings: table(exe, '## Key findings and risks', true),
    priorities: table(exe, '## Remediation priorities', true),
    next: table(exe, '## Next steps', true),
    limits: table(exe, '## Confidence and limitations', true),
  };
}

export function displayText(value) {
  return clean(value)
    .replace(/(?:[A-Za-z]:\\|\\\\)[^\s|]+/g, '[local path omitted]')
    .replace(/\/(?:subscriptions|home|Users|tmp|var|mnt)\/[^\s|]+/gi, '[path omitted]')
    .replace(/\b(?:az|pwsh|powershell)\s+[^\n;|]+/gi, '[command omitted]')
    .replace(/\b[\w.-]+\.json\b/gi, 'collector evidence')
    .replace(/\bsections\.[A-Za-z0-9_.[\]-]+/g, 'collected setting')
    .replace(/https?:\/\/[^\s|]+/gi, '[reference omitted]')
    .replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}
