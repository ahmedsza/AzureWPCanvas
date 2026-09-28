#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { INPUTS, parseReports } from './parse.mjs';
import { compileSlides, buildPresentation, TEMPLATE_VERSION } from './template.mjs';
import { normalizePackage, validatePackage } from './package.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const exec = promisify(execFile);
export const hash = data => createHash('sha256').update(data).digest('hex');
const readJson = async file => { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; } };
const fileHash = async file => { try { return hash(await fs.readFile(file)); } catch { return null; } };
const setup = 'npm ci --prefix Review\\Presentation';
const implementationFiles = ['generate.mjs', 'parse.mjs', 'template.mjs', 'package.mjs', 'render.ps1', 'package.json', 'package-lock.json'];

export function parseArgs(args) {
  const options = { mode: 'executive', renderChanged: false, force: false };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (seen.has(arg)) throw new Error(`Duplicate option ${arg}`);
    seen.add(arg);
    if (arg === '--report-dir' || arg === '--mode') {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      options[arg === '--report-dir' ? 'reportDir' : 'mode'] = value;
    } else if (arg === '--render-changed') options.renderChanged = true;
    else if (arg === '--force') options.force = true;
    else throw new Error(`Unknown option ${arg}`);
  }
  if (!options.reportDir) throw new Error('Required: --report-dir <directory containing the three existing reports>');
  if (!['executive', 'detailed'].includes(options.mode)) throw new Error('--mode must be executive or detailed');
  return options;
}

async function dependencies() {
  try {
    const [{ default: PptxGenJS }, { default: JSZip }] = await Promise.all([import('pptxgenjs'), import('jszip')]);
    const versions = {};
    for (const name of ['pptxgenjs', 'jszip']) {
      const pkg = await readJson(path.join(here, 'node_modules', name, 'package.json'));
      if (!pkg?.version) throw new Error('Dependency version missing');
      versions[name] = pkg.version;
    }
    return { PptxGenJS, JSZip, versions };
  } catch {
    throw new Error(`Presentation dependencies are missing or incomplete. Run once from the repository root: ${setup}`);
  }
}

async function runPowerPoint(args) {
  if (process.platform !== 'win32') throw new Error('--render-changed requires desktop PowerPoint on Windows. Omit this flag for cross-platform generation.');
  try {
    const result = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(here, 'render.ps1'), ...args], { timeout: 180000, windowsHide: true, maxBuffer: 1024 * 1024 });
    return JSON.parse(result.stdout.replace(/^\uFEFF/, '').trim());
  } catch (error) {
    const diagnostic = String(error.stderr ?? '').match(/PowerPoint (?:start|open|export) failed \(HRESULT -?\d+\)/)?.[0];
    throw new Error(`${diagnostic ? diagnostic + '. ' : ''}--render-changed requires working desktop Microsoft PowerPoint on Windows. Install/open PowerPoint once and close blocking Office dialogs, or omit --render-changed. No deck was published.`);
  }
}

async function renderChanged(deck, specs, cacheDir, staging, versions, progress) {
  const toolchain = await runPowerPoint(['-Probe']);
  const renderImplementation = hash(await fs.readFile(path.join(here, 'template.mjs'))) + hash(await fs.readFile(path.join(here, 'render.ps1')));
  const renderKey = hash(JSON.stringify({ toolchain, versions, renderImplementation, template: TEMPLATE_VERSION }));
  const old = await readJson(path.join(cacheDir, 'render.json')) ?? { entries: {} };
  const imagesDir = path.join(cacheDir, 'images');
  await fs.mkdir(imagesDir, { recursive: true });
  const items = [], entries = {};
  for (let i = 0; i < specs.length; i++) {
    const signature = hash(JSON.stringify({ spec: specs[i], index: i + 1, renderKey }));
    const output = path.join(imagesDir, `${signature}.png`);
    const previous = old.entries[signature];
    if (previous?.hash && await fileHash(output) === previous.hash) {
      entries[signature] = { index: i + 1, output, hash: previous.hash };
    } else {
      items.push({ index: i + 1, signature, output: path.join(staging, `${signature}.png`), destination: output });
    }
  }
  progress(`Rendering ${items.length} changed slide(s); ${specs.length - items.length} image(s) reused.`);
  if (items.length) {
    const plan = path.join(staging, 'render-plan.json');
    await fs.writeFile(plan, JSON.stringify(items));
    await runPowerPoint(['-Deck', deck, '-Plan', plan]);
    for (const item of items) {
      const image = await fs.readFile(item.output);
      if (!image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || image.length < 100)
        throw new Error('Render validation: invalid PNG; deck not published');
      await fs.rename(item.output, item.destination);
      entries[item.signature] = { index: item.index, output: item.destination, hash: hash(image) };
    }
  }
  const merged = { renderKey, toolchain, entries: { ...old.entries, ...entries }, currentSlides: Object.values(entries).sort((a, b) => a.index - b.index) };
  await atomicJson(path.join(cacheDir, 'render.json'), merged);
  return { renderedSlides: items.length, reusedSlideImages: specs.length - items.length, renderManifest: path.join(cacheDir, 'render.json') };
}

async function atomicJson(file, value) {
  const candidate = `${file}.${randomUUID()}.pending`;
  try { await fs.writeFile(candidate, JSON.stringify(value, null, 2)); await fs.rename(candidate, file); }
  finally { await fs.rm(candidate, { force: true }); }
}

export async function generate(options, progress = () => {}) {
  const started = performance.now(), reportDir = path.resolve(options.reportDir);
  const mode = options.mode ?? 'executive';
  if (!['executive', 'detailed'].includes(mode)) throw new Error('--mode must be executive or detailed');
  progress('Validating the three existing report inputs…');
  const inputs = {};
  for (const name of INPUTS) {
    try { inputs[name] = await fs.readFile(path.join(reportDir, name), 'utf8'); }
    catch { throw new Error(`Missing or unreadable report input: ${name}. Generate the reports first; no evidence collection is performed here.`); }
  }
  const data = parseReports(inputs), specs = compileSlides(data, mode);
  const { PptxGenJS, JSZip, versions } = await dependencies();
  const sourceHash = hash(Buffer.concat(await Promise.all(implementationFiles.map(file => fs.readFile(path.join(here, file))))));
  const key = hash(JSON.stringify({ inputs: INPUTS.map(name => hash(inputs[name])), mode, sourceHash, versions, node: process.versions.node }));
  const outputFile = path.join(reportDir, 'well-architected-review.pptx'), cacheDir = path.join(reportDir, '.presentation-cache');
  await fs.mkdir(cacheDir, { recursive: true });
  const lockFile = path.join(cacheDir, 'generation.lock');
  let lock;
  try { lock = await fs.open(lockFile, 'wx'); }
  catch { throw new Error('Another presentation generation holds .presentation-cache/generation.lock. Wait for it to finish; remove the lock only after confirming that no generator is running.'); }
  const staging = path.join(cacheDir, `pending-${randomUUID()}`), manifest = path.join(cacheDir, `${mode}.json`);
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, started: new Date().toISOString() }));
    await fs.mkdir(staging);
    const previous = await readJson(manifest);
    const outputHash = await fileHash(outputFile);
    const cached = !options.force && previous?.key === key && previous?.mode === mode && outputHash !== null && previous.outputHash === outputHash;
    let renderResult = { renderedSlides: 0, reusedSlideImages: 0 };
    if (cached) {
      await validatePackage(await fs.readFile(outputFile), JSZip, specs);
      progress(`Reusing validated ${mode} deck (${specs.length} slides).`);
      if (options.renderChanged) renderResult = await renderChanged(outputFile, specs, cacheDir, staging, versions, progress);
    } else {
      progress(`Building ${mode} deck (${specs.length} slides)…`);
      const pptx = buildPresentation(PptxGenJS, specs);
      const bytes = await normalizePackage(await pptx.write({ outputType: 'nodebuffer' }), JSZip);
      await validatePackage(bytes, JSZip, specs);
      const candidate = path.join(staging, 'well-architected-review.pptx');
      await fs.writeFile(candidate, bytes);
      if (options.renderChanged) renderResult = await renderChanged(candidate, specs, cacheDir, staging, versions, progress);
      // Publish on the same filesystem only after all requested validation/rendering succeeded.
      await fs.rename(candidate, outputFile);
      await atomicJson(manifest, { key, mode, outputHash: hash(bytes), slideCount: specs.length, sourceHash, versions });
      progress('Validated deck published atomically.');
    }
    return { ok: true, outputFile, mode, slideCount: specs.length, cached, durationMs: Math.round(performance.now() - started), ...renderResult };
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
    await lock.close();
    await fs.rm(lockFile, { force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await generate(parseArgs(process.argv.slice(2)), line => console.log(line));
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(`Presentation generation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
