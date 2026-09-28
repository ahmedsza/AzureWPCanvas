import { PILLARS, displayText } from './parse.mjs';

export const TEMPLATE_VERSION = 'navy-ice-1';
const C = { navy: '1E2761', ice: 'CADCFC', white: 'FFFFFF', surface: 'F5F7FA', ink: '1E293B', muted: '64748B', Pass: '23734A', Fail: 'AE2638', 'Not verified': '52677C', 'N/A': '747B85' };
const prefix = ['FND', 'REL', 'SEC', 'CST', 'OPS', 'PRF'];
const label = n => n === null ? 'n/a' : `${n}%`;
const clip = (text, max = 180) => {
  const value = displayText(text);
  return value.length <= max ? value : `${value.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
};
const chunk = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

// Slide specs are also the semantic cache boundary. No raw evidence or notes enter the deck.
export function compileSlides(data, mode = 'executive') {
  const d = data, high = d.findings.filter(f => f.Severity >= 4);
  const confirmed = high.filter(f => f.Status === 'Fail');
  const verification = high.filter(f => f.Status === 'Not verified');
  const metrics = { score: label(d.overall.score), coverage: label(d.overall.coverage), total: d.total.total, pass: d.total.pass, fail: d.total.fail, na: d.total.na, nv: d.total.nv };
  const findingRow = f => [f.ControlId, `${f.Status} · ${f.Severity}`, clip(f.Title, 92), clip(f.Recommendation, 180)];
  const slides = [
    { kind: 'cover', title: 'WordPress on Azure', subtitle: 'Well-Architected review', metrics, date: displayText(d.meta['Review date'] || 'Date not supplied'), mode },
    { kind: 'posture', title: 'Decisions, not assumptions', metrics, confirmed: confirmed.length, verification: verification.length },
    { kind: 'scorecard', title: 'Six pillars. Two measures.', rows: d.scores.slice(0, 6).map((s, i) => [PILLARS[i], label(s.score), label(s.coverage), `${s.pass} / ${s.fail} / ${s.nv}`]) },
    { kind: 'strengths', title: 'Preserve what is working', items: d.strengths.slice(0, 4).map(r => clip(r[1], 235)), count: d.total.pass },
  ];
  d.scores.slice(0, 6).forEach((s, i) => {
    const controls = d.controls.filter(c => c.id.startsWith(`${prefix[i]}-`));
    const passes = controls.filter(c => c.status === 'Pass');
    const fails = controls.filter(c => c.status === 'Fail');
    const gaps = d.findings.filter(f => f.ControlId.startsWith(`${prefix[i]}-`) && f.Status === 'Not verified').sort((a, b) => b.Severity - a.Severity);
    slides.push({
      kind: 'pillar', title: PILLARS[i], score: label(s.score), coverage: label(s.coverage),
      counts: `${s.pass} Pass / ${s.fail} Fail / ${s.na} N/A / ${s.nv} Not verified`,
      left: passes.slice(0, 2).map(c => `${c.id} — ${clip(c.observation, 235)}`),
      right: fails.slice(0, 2).map(c => `${c.id} — ${clip(c.observation, 235)}`),
      passRemaining: Math.max(0, passes.length - 2), failRemaining: Math.max(0, fails.length - 2),
      verify: gaps.slice(0, 2).map(f => `${f.ControlId}: ${clip(f.Title, 92)}`).join(' · ') || `${s.nv} controls require further evidence.`,
    });
  });
  slides.push(
    { kind: 'findings', title: 'Prioritize confirmed high findings', rows: confirmed.slice(0, 4).map(findingRow), confirmed: confirmed.length, verification: verification.length },
    { kind: 'supplementary', title: 'Beyond the headline', rows: d.scores.slice(6).map(s => [s.section.replace(/^\d+\.\s*/, ''), s.total, label(s.score), label(s.coverage)]), nv: d.total.nv },
    { kind: 'actions', title: 'Turn findings into owned work', rows: d.priorities.slice(0, 4).map(r => [r[0], clip(r[1], 185), clip(r[2], 65)]) },
    { kind: 'confidence', title: 'Confidence has boundaries', coverage: label(d.overall.coverage), limits: d.limits.slice(0, 3).map(r => [clip(r[0], 105), clip(r[1], 200)]), nv: d.total.nv },
    { kind: 'closing', title: 'Agree the next decision', items: d.next.slice(0, 4).map(r => [clip(r[1], 175), clip(`${r[2]} · ${r[3]}`, 160)]), mode },
  );
  if (mode === 'detailed') {
    for (const [i, rows] of chunk(high, 4).entries())
      slides.push({ kind: 'appendix', title: `High-impact finding register · ${i + 1}`, rows: rows.map(findingRow), page: i + 1 });
  }
  return slides;
}

export function buildPresentation(PptxGenJS, specs) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'WordPress Well-Architected Review';
  pptx.title = 'WordPress on Azure — Well-Architected review';
  pptx.subject = 'Presentation of existing report decisions; no reassessment';
  pptx.company = '';
  pptx.lang = 'en-US';
  pptx.theme = { headFontFace: 'Trebuchet MS', bodyFontFace: 'Calibri', lang: 'en-US' };
  const text = (s, value, x, y, w, h, options = {}) => s.addText(displayText(value), { x, y, w, h, fontFace: 'Calibri', fontSize: 16, color: C.ink, margin: 0, valign: 'top', breakLine: false, ...options });
  const box = (s, x, y, w, h, color) => s.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color }, line: { color, width: 0 } });
  function stat(s, value, caption, x, y, w = 2.85) {
    box(s, x, y, w, 1.35, C.surface);
    text(s, String(value), x + .18, y + .12, w - .36, .74, { fontSize: 42, bold: true, color: C.navy });
    text(s, caption, x + .18, y + .96, w - .36, .25, { fontSize: 13, color: C.muted });
  }
  function rows(s, headers, content, widths, { y = 1.65, rowH = 1.0, fontSize = 15 } = {}) {
    const all = [headers, ...content];
    all.forEach((row, ri) => {
      const height = ri === 0 ? .52 : rowH, top = ri === 0 ? y : y + .52 + (ri - 1) * rowH;
      box(s, .65, top, 12.03, height - .03, ri === 0 ? C.navy : ri % 2 ? C.surface : 'ECF1F8');
      let x = .65;
      row.forEach((value, ci) => {
        text(s, String(value), x + .12, top + .11, widths[ci] - .24, height - .19, { fontSize: ri === 0 ? 13 : fontSize, bold: ri === 0, color: ri === 0 ? C.white : C.ink });
        x += widths[ci];
      });
    });
  }
  specs.forEach((spec, index) => {
    const s = pptx.addSlide(), dark = ['cover', 'closing'].includes(spec.kind);
    s.background = { color: dark ? C.navy : C.white };
    text(s, spec.title, .65, .5, 12.03, .8, { fontFace: 'Trebuchet MS', fontSize: 36, bold: true, color: dark ? C.white : C.navy });
    text(s, `WORDPRESS ON AZURE  /  EXISTING REPORT DECISIONS`, .65, 7.0, 11.2, .24, { fontSize: 10, color: dark ? C.ice : C.muted });
    text(s, String(index + 1).padStart(2, '0'), 12.1, 7.0, .55, .24, { fontSize: 10, align: 'right', color: dark ? C.ice : C.muted });
    if (spec.kind === 'cover') {
      box(s, 9.6, 1.8, 3.03, 4.65, '293573');
      text(s, spec.subtitle, .7, 1.85, 8.5, 1.3, { fontSize: 38, color: C.ice });
      text(s, `${spec.metrics.score} score`, .7, 3.65, 8.3, .85, { fontSize: 48, bold: true, color: C.white });
      text(s, `${spec.metrics.coverage} evidence coverage`, .7, 4.65, 8.3, .6, { fontSize: 25, color: C.ice });
      text(s, `${spec.mode === 'executive' ? 'Executive briefing' : 'Detailed findings edition'} · ${spec.date}`, .7, 6.15, 8.3, .35, { fontSize: 15, color: C.ice });
      text(s, String(spec.metrics.total), 9.95, 2.5, 2.3, 1.0, { fontSize: 60, bold: true, color: C.white });
      text(s, 'checklist controls', 9.95, 3.65, 2.3, 1, { fontSize: 23, color: C.ice });
      text(s, 'Point-in-time review; not a compliance certification.', 9.95, 5.1, 2.3, 1.1, { fontSize: 16, color: C.white });
    } else if (spec.kind === 'posture') {
      [ [spec.metrics.score, 'Headline score'], [spec.metrics.coverage, 'Evidence coverage'], [spec.confirmed, 'Confirmed high / critical'], [spec.verification, 'High-impact unknowns'] ].forEach(([v, c], i) => stat(s, v, c, .65 + i * 3.06, 1.65));
      ['pass', 'fail', 'na', 'nv'].forEach((key, i) => {
        const names = ['Pass', 'Fail', 'N/A', 'Not verified'], x = .65 + i * 3.06;
        box(s, x, 3.5, 2.85, .62, C[names[i]]);
        text(s, `${spec.metrics[key]} ${names[i]}`, x + .18, 3.65, 2.49, .32, { bold: true, color: C.white });
      });
      text(s, spec.metrics.score === 'n/a' ? 'Headline score unavailable: at least one pillar has no decided controls.' : 'The headline is the unweighted mean of all six pillar scores.', .65, 4.65, 11.8, .8, { fontSize: 25, bold: true, color: C.navy });
      text(s, 'Unknowns are verification work, not confirmed failures. Read score and coverage together. Pooled totals are audit detail, not the headline.', .65, 5.75, 11.8, .8, { fontSize: 19, color: C.muted });
    } else if (spec.kind === 'scorecard') {
      rows(s, ['Pillar', 'Score', 'Coverage', 'Pass / Fail / Unknown'], spec.rows, [5.7, 1.45, 1.45, 3.43], { rowH: .69, fontSize: 17 });
      text(s, 'n/a is not zero. Supplementary and manual controls remain separate.', .65, 6.55, 12, .3, { fontSize: 14, color: C.muted });
    } else if (spec.kind === 'strengths') {
      const items = spec.items.length ? spec.items : ['No strengths table supplied. Refer to the control-level decisions in the detailed report.'];
      items.forEach((item, i) => {
        const x = .65 + (i % 2) * 6.16, y = 1.65 + Math.floor(i / 2) * 2.35;
        box(s, x, y, 5.87, 2.0, C.surface);
        text(s, String(i + 1).padStart(2, '0'), x + .2, y + .15, .7, .5, { fontSize: 26, bold: true, color: C.Pass });
        text(s, item, x + 1.0, y + .2, 4.57, 1.6, { fontSize: 17 });
      });
      text(s, `${spec.count} controls passed. Configuration evidence does not replace runtime testing.`, .65, 6.55, 12, .3, { fontSize: 14, color: C.muted });
    } else if (spec.kind === 'pillar') {
      box(s, .65, 1.55, 12.03, .65, C.navy);
      text(s, `${spec.score} score   /   ${spec.coverage} coverage`, .85, 1.7, 11.63, .35, { fontSize: 21, color: C.white, bold: true });
      [['Evidence shows', spec.left, C.Pass, 'No controls proven to pass.', spec.passRemaining], ['Confirmed gaps', spec.right, C.Fail, 'No confirmed failures; unknown controls still need evidence.', spec.failRemaining]].forEach(([heading, items, color, fallback, remaining], i) => {
        const x = .65 + i * 6.16;
        text(s, heading, x, 2.6, 5.87, .4, { fontSize: 24, color, bold: true });
        box(s, x, 3.2, 5.87, 2.38, C.surface);
        (items.length ? items : [fallback]).forEach((item, j) => text(s, item, x + .18, 3.36 + j * 1.03, 5.51, .91, { fontSize: 15 }));
        if (remaining) text(s, `+${remaining} more in the detailed report`, x + .18, 5.64, 5.51, .26, { fontSize: 12, color: C.muted });
      });
      text(s, `Verify next — ${spec.verify}`, .65, 6.02, 12, .45, { fontSize: 14, color: C.muted });
      text(s, spec.counts, .65, 6.62, 12, .25, { fontSize: 12, color: C.muted });
    } else if (['findings', 'appendix'].includes(spec.kind)) {
      if (spec.rows.length) rows(s, ['Control', 'Status / severity', 'Finding', 'Recommended action'], spec.rows, [1.05, 2.05, 3.1, 5.83], { rowH: 1.08, fontSize: 14 });
      else {
        stat(s, '0', 'Confirmed high / critical', .65, 1.75, 4);
        text(s, 'No confirmed high-impact failures are recorded. This does not prove that unverified controls are effective.', 5.15, 1.85, 7.2, 2, { fontSize: 24 });
      }
      text(s, spec.kind === 'appendix' ? 'All high-impact CSV records are included, with Fail and Not verified kept distinct.' : `${spec.confirmed} confirmed high / critical; ${spec.verification} high-impact unknowns. Showing up to four confirmed items; full records remain in findings.csv.`, .65, 6.65, 12, .27, { fontSize: 12, color: C.muted });
    } else if (spec.kind === 'supplementary') {
      rows(s, ['Audit area', 'Controls', 'Score', 'Coverage'], spec.rows, [7.03, 1.6, 1.6, 1.8], { rowH: 1.15, fontSize: 21 });
      stat(s, spec.nv, 'Not verified across the complete checklist', .65, 5.0, 5.6);
      text(s, 'Manual validation requires dated evidence. Neither supplementary area is included in the six-pillar mean.', 6.65, 5.1, 6, 1.2, { fontSize: 21 });
    } else if (spec.kind === 'actions') {
      rows(s, ['Priority', 'Action from the executive report', 'Controls'], spec.rows, [1.45, 8.13, 2.45], { rowH: 1.03, fontSize: 17 });
      text(s, 'Owner roles, dates and change approvals must be agreed; no Azure resources were changed.', .65, 6.55, 12, .3, { fontSize: 14, color: C.muted });
    } else if (spec.kind === 'confidence') {
      stat(s, spec.coverage, 'Evidence coverage', .65, 1.65, 3.1);
      text(s, `${spec.nv} controls remain Not verified. Missing evidence is not proof of a fault or a pass.`, 4.15, 1.85, 8.2, 1.0, { fontSize: 24, bold: true, color: C.navy });
      rows(s, ['Limitation', 'Effect on confidence'], spec.limits, [4.03, 8], { y: 3.5, rowH: .8, fontSize: 15 });
    } else if (spec.kind === 'closing') {
      (spec.items.length ? spec.items : [['Agree owners and dated evidence for the next review.', 'Owner and target require agreement.']]).forEach(([action, owner], i) => {
        const y = 1.65 + i * 1.16;
        box(s, .65, y, .56, .56, C.ice);
        text(s, String(i + 1), .79, y + .1, .3, .35, { fontSize: 22, bold: true, color: C.navy });
        text(s, action, 1.55, y, 11.03, .66, { fontSize: 20, color: C.white });
        text(s, owner, 1.55, y + .74, 11.03, .28, { fontSize: 12, color: C.ice });
      });
      text(s, 'Reassess only when the source reports are deliberately refreshed.', .65, 6.6, 12, .3, { fontSize: 14, color: C.ice });
    }
  });
  return pptx;
}
