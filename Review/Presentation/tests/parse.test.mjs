import test from 'node:test';
import assert from 'node:assert/strict';
import { INPUTS, parseReports } from '../parse.mjs';

function fixture(totalLabel = 'Total', dispositions = [['Pass'], ['Pass'], ['Pass'], ['Pass'], ['Pass'], ['Pass']]) {
  const prefixes = ['FND', 'REL', 'SEC', 'CST', 'OPS', 'PRF', 'APP', 'MAN'];
  const groups = [...dispositions, ['Not verified'], ['Not verified']];
  const tally = statuses => {
    const counts = ['Pass', 'Fail', 'N/A', 'Not verified'].map(status => statuses.filter(value => value === status).length);
    const [pass, fail, na] = counts;
    const decided = pass + fail;
    return [statuses.length, ...counts, decided ? Math.round(pass / decided * 100) : 'n/a',
      statuses.length > na ? Math.round(decided / (statuses.length - na) * 100) : 'n/a', 'Amber'];
  };
  const scorecard = [
    '| Section | Total | Pass | Fail | N/A | Not verified | Score % | Coverage % | Status |',
    '|---|---|---|---|---|---|---|---|---|',
    ...groups.map((group, i) => `| ${i + 1}. Section | ${tally(group).join(' | ')} |`),
    `| ${totalLabel} | ${tally(groups.flat()).join(' | ')} |`,
  ].join('\n');
  const mean = key => {
    const values = dispositions.map(group => {
      const [total, pass, fail, na] = tally(group);
      const denominator = key === 'score' ? pass + fail : total - na;
      return denominator ? (key === 'score' ? pass : pass + fail) / denominator * 100 : null;
    });
    return values.includes(null) ? 'n/a' : `${Math.round(values.reduce((a, b) => a + b, 0) / 6)}%`;
  };
  const total = tally(groups.flat());
  const rows = groups.flatMap((group, i) => group.map((status, j) => {
    const id = `${prefixes[i]}-${String(j + 1).padStart(2, '0')}`;
    return i === 7 ? `| ${id} | Control | Required evidence | ${status} | Owner | Date |` :
      `| ${id} | Control | ${status} | Evidence | Observation | Recommendation |`;
  }));
  return {
    [INPUTS[0]]: `## Overall posture
| Measure | Result |
|---|---|
| Overall score | ${mean('score')} |
| Evidence coverage | ${mean('coverage')} |
| Pass / Fail / N/A / Not verified | ${total.slice(1, 5).join(' / ')} |
| Controls assessed | ${total[0]} of ${total[0]} |

## Pillar scorecard
${scorecard}`,
    [INPUTS[1]]: `## 2. Scoring summary\n${scorecard}\n\n## 3. Controls\n${rows.join('\n')}`,
    [INPUTS[2]]: 'FindingId,ControlId,Pillar,Resource,Title,Summary,Status,Severity,Effort,Risk,Cost,Priority,Evidence,Recommendation\n',
  };
}

test('accepts canonical and annotated total rows without changing the assessment', () => {
  for (const label of ['Total', '**Total**', 'Total (pooled audit; not headline)']) {
    const result = parseReports(fixture(label));
    assert.equal(result.scores.length, 8);
    assert.equal(result.total.total, 8);
    assert.deepEqual(result.overall, { score: 100, coverage: 100 });
  }
});

test('retains n/a when a pillar has no decided controls', () => {
  const inputs = fixture('Total (pooled audit; not headline)', [['Pass'], ['Pass'], ['Pass'], ['Not verified'], ['Pass'], ['Not verified']]);
  assert.deepEqual(parseReports(inputs).overall, { score: null, coverage: 67 });
});

test('computes the headline from unrounded ratios, not rounded scorecard cells', () => {
  const group = n => ['Pass', ...Array(n - 1).fill('Not verified')];
  const result = parseReports(fixture('Total', [group(6), group(6), group(6), group(6), group(6), group(7)]));
  assert.equal(result.overall.coverage, 16);
});

test('rejects an invalid total label and missing sections', () => {
  assert.throws(() => parseReports(fixture('Total nonsense')), /expected eight sections and a total row/);
  const inputs = fixture();
  inputs[INPUTS[1]] = inputs[INPUTS[1]].replace(/^\| 8\. Section.*\n/m, '');
  assert.throws(() => parseReports(inputs), /expected eight sections and a total row/);
});

test('still rejects incorrect total counts and mismatched summary scores', () => {
  const inputs = fixture('Total (pooled audit; not headline)');
  inputs[INPUTS[1]] = inputs[INPUTS[1]].replace('| Total (pooled audit; not headline) | 8 |', '| Total (pooled audit; not headline) | 9 |');
  assert.throws(() => parseReports(inputs), /control total mismatch/);
  const mismatched = fixture();
  mismatched[INPUTS[0]] = mismatched[INPUTS[0]].replace('| Overall score | 100% |', '| Overall score | 99% |');
  assert.throws(() => parseReports(mismatched), /overall score must be the six-pillar mean/);
});
