import { assertNoSecrets } from './parse.mjs';

export async function normalizePackage(buffer, JSZip) {
  const zip = await JSZip.loadAsync(buffer, { checkCRC32: true });
  // PptxGenJS 4 emits notesMasterIdLst in the wrong schema order. This template
  // deliberately has no speaker notes: remove the unused notes subgraph entirely.
  // Do not reorder XML using an external packer or depend on a native SaveCopyAs.
  for (const name of Object.keys(zip.files)) {
    if (/^ppt\/notes(?:Slides|Masters)\//.test(name)) { zip.remove(name); continue; }
    if (!/\.(?:xml|rels)$/.test(name)) continue;
    let xml = await zip.file(name).async('string');
    if (name === 'ppt/presentation.xml') xml = xml.replace(/<p:notesMasterIdLst>[\s\S]*?<\/p:notesMasterIdLst>/g, '');
    if (name === '[Content_Types].xml') xml = xml.replace(/<Override\b[^>]*PartName="\/ppt\/notes(?:Slides|Masters)\/[^"]+"[^>]*\/>/g, '');
    if (name.endsWith('.rels')) xml = xml.replace(/<Relationship\b[^>]*Type="[^"]*\/notes(?:Slide|Master)"[^>]*\/>/g, '');
    zip.file(name, xml);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export async function validatePackage(buffer, JSZip, specs) {
  const zip = await JSZip.loadAsync(buffer, { checkCRC32: true });
  const count = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length;
  if (count !== specs.length) throw new Error('Package validation: unexpected slide count');
  for (const name of ['[Content_Types].xml', '_rels/.rels', 'ppt/presentation.xml'])
    if (!zip.file(name)) throw new Error(`Package validation: missing ${name}`);
  const presentation = await zip.file('ppt/presentation.xml').async('string');
  if ((presentation.match(/<p:sldId /g) || []).length !== count || presentation.includes('<p:notesMasterIdLst'))
    throw new Error('Package validation: invalid presentation slide/notes structure');
  const posix = (await import('node:path')).posix;
  for (const name of Object.keys(zip.files).filter(name => name.endsWith('.rels'))) {
    const xml = await zip.file(name).async('string');
    const sourceDir = name === '_rels/.rels' ? '' : posix.dirname(posix.dirname(name));
    for (const relation of xml.matchAll(/<Relationship\b([^>]+)\/>/g)) {
      if (/TargetMode="External"/.test(relation[1])) throw new Error('Package validation: unexpected external relationship');
      const target = /\bTarget="([^"]+)"/.exec(relation[1])?.[1];
      if (!target) throw new Error('Package validation: relationship without target');
      const resolved = target.startsWith('/') ? target.slice(1) : posix.normalize(posix.join(sourceDir, target));
      if (!zip.file(resolved)) throw new Error(`Package validation: broken relationship in ${name}`);
    }
  }
  for (let i = 0; i < specs.length; i++) {
    const xml = await zip.file(`ppt/slides/slide${i + 1}.xml`).async('string');
    const text = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(match => match[1]).join(' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    assertNoSecrets(text);
    if (/[A-Za-z]:\\|\/subscriptions\/|sections\.[\w.]+|\b(?:az|pwsh|powershell)\s+\w+|\b[\w.-]+\.json\b/i.test(text))
      throw new Error(`Package validation: raw path or command/evidence detail on slide ${i + 1}`);
    if (!text.includes(specs[i].title)) throw new Error(`Package validation: missing title on slide ${i + 1}`);
    if (/\b(?:lorem ipsum|placeholder text|xxxx)\b/i.test(text)) throw new Error('Package validation: placeholder content');
  }
  return { slideCount: count, packageValidated: true };
}
