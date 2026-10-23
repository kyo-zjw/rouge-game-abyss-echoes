#!/usr/bin/env node
/**
 * Volcengine Ark Seedream image generator for Abyss Echoes.
 *
 * Commands:
 *   node tools/seedream.mjs doctor
 *   node tools/seedream.mjs list
 *   node tools/seedream.mjs generate --spec enemy_slime [--force]
 *   node tools/seedream.mjs generate --prompt "..." --out assets/x/y.png --preset sprite --target 64
 *   node tools/seedream.mjs batch [--only a,b] [--preset enemy] [--force] [--dry-run]
 *   node tools/seedream.mjs reprocess [--only a,b] [--preset player] [--debug]
 *
 * `reprocess` re-runs the chroma-key/crop pipeline on the cached raw PNGs in
 * tools/.cache without spending API credits. Use it after changing
 * seedream-post.py or the key thresholds.
 *
 * Key resolution (first match):
 *   1. --api-key
 *   2. ARK_API_KEY / VOLCENGINE_API_KEY env
 *   3. abyss-echoes/.env.local, then abyss-echoes/.env
 *   4. ~/.dsh/seedream.json  { "apiKey": "..." }
 *   5. DSH credential store ~/.dsh/.credentials.yaml -> refs.VOLCENGINE_API_KEY
 *
 * Model resolution (first match):
 *   --model > ARK_IMAGE_MODEL > ~/.dsh/seedream.json > tools/seedream.config.json > built-in
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TOOLS_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(TOOLS_DIR, '..');
const CONFIG_PATH = path.join(TOOLS_DIR, 'seedream.config.json');
const PROMPTS_PATH = path.join(TOOLS_DIR, 'seedream.prompts.json');
const MANIFEST_PATH = path.join(TOOLS_DIR, 'seedream.manifest.json');
const CACHE_DIR = path.join(TOOLS_DIR, '.cache');
const POST_SCRIPT = path.join(TOOLS_DIR, 'seedream-post.py');

const DEFAULTS = {
  baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
  model: 'doubao-seedream-5-0-flash-260915',
  size: '2K',
  outputFormat: 'png',
  watermark: false,
  concurrency: 2,
  retries: 2,
  requestTimeoutMs: 180000,
  python: ''
};

const PRESET_TARGET = { player: 256, enemy: 64, boss: 192, icon: 128 };

/* ------------------------------------------------------------------ utils */

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw new Error(`Cannot read JSON ${file}: ${err.message}`);
  }
}

function writeJsonAtomic(file, value) {
  const tmp = `${file}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const body = token.slice(2);
      const eq = body.indexOf('=');
      if (eq !== -1) {
        out[body.slice(0, eq)] = body.slice(eq + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        out[body] = argv[++i];
      } else {
        out[body] = true;
      }
    } else {
      out._.push(token);
    }
  }
  return out;
}

function parseDotEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function readDshCredential(name) {
  const file = path.join(os.homedir(), '.dsh', '.credentials.yaml');
  try {
    const text = fs.readFileSync(file, 'utf8');
    const re = new RegExp(`^\\s*${name}\\s*:\\s*(\\S+)\\s*$`, 'm');
    const match = text.match(re);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function maskKey(key) {
  if (!key) return '(none)';
  return `(set, ${key.length} chars)`;
}

function toBool(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  const text = String(value).toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolvePath(p) {
  return path.isAbsolute(p) ? p : path.resolve(PROJECT_DIR, p);
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/* ---------------------------------------------------------------- config */

function loadSettings(args) {
  const fileConfig = { ...DEFAULTS, ...readJson(CONFIG_PATH, {}) };
  const userConfig = readJson(path.join(os.homedir(), '.dsh', 'seedream.json'), {});
  const dotenv = {
    ...parseDotEnv(path.join(PROJECT_DIR, '.env')),
    ...parseDotEnv(path.join(PROJECT_DIR, '.env.local'))
  };

  const env = process.env;
  let apiKey = args['api-key'] || env.ARK_API_KEY || env.VOLCENGINE_API_KEY || dotenv.ARK_API_KEY || dotenv.VOLCENGINE_API_KEY || userConfig.apiKey || '';
  let keySource = args['api-key'] ? '--api-key'
    : env.ARK_API_KEY ? 'env ARK_API_KEY'
    : env.VOLCENGINE_API_KEY ? 'env VOLCENGINE_API_KEY'
    : dotenv.ARK_API_KEY ? 'project .env ARK_API_KEY'
    : dotenv.VOLCENGINE_API_KEY ? 'project .env VOLCENGINE_API_KEY'
    : userConfig.apiKey ? '~/.dsh/seedream.json'
    : '';

  if (!apiKey) {
    const fromDsh = readDshCredential('VOLCENGINE_API_KEY');
    if (fromDsh) {
      apiKey = fromDsh;
      keySource = 'DSH credentials (VOLCENGINE_API_KEY)';
    }
  }

  const model = args.model || env.ARK_IMAGE_MODEL || userConfig.model || fileConfig.model;
  const baseURL = (args['base-url'] || userConfig.baseURL || fileConfig.baseURL).replace(/\/+$/, '');
  const size = args.size || userConfig.size || fileConfig.size;
  const outputFormat = args['output-format'] || userConfig.outputFormat || fileConfig.outputFormat;
  const watermark = toBool(args.watermark, userConfig.watermark ?? fileConfig.watermark);
  const concurrency = Number(args.concurrency || userConfig.concurrency || fileConfig.concurrency || 2);
  const retries = Number(args.retries ?? userConfig.retries ?? fileConfig.retries ?? 2);
  const requestTimeoutMs = Number(args.timeout || userConfig.requestTimeoutMs || fileConfig.requestTimeoutMs || 180000);
  const python = args.python || userConfig.python || fileConfig.python || '';

  return {
    apiKey, keySource, model, baseURL, size, outputFormat, watermark,
    concurrency, retries, requestTimeoutMs, python, fileConfig, userConfig
  };
}

function findPython(settings) {
  const bundled = path.join(
    os.homedir(), '.dsh', 'dsh-runtimes', 'dsh-primary-runtime',
    'dependencies', 'python', 'python.exe'
  );
  const candidates = [
    settings.python,
    process.env.SEEDREAM_PYTHON,
    process.env.DSH_PYTHON,
    bundled,
    'python',
    'python3'
  ].filter(Boolean);

  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['-c', 'import PIL, numpy'], {
      stdio: 'ignore',
      windowsHide: true,
      timeout: 15000
    });
    if (!probe.error && probe.status === 0) return candidate;
  }
  throw new Error(
    'No Python with Pillow + numpy found. Set SEEDREAM_PYTHON or "python" in seedream.config.json. ' +
    'The bundled DSH runtime is usually at ' + bundled
  );
}

/* ------------------------------------------------------------------ ark */

async function callArk(settings, payload) {
  const endpoint = `${settings.baseURL}/images/generations`;
  let lastError;
  for (let attempt = 0; attempt <= settings.retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), settings.requestTimeoutMs);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: ctrl.signal
      });
      const text = await res.text();
      if (res.ok) return JSON.parse(text);
      lastError = new Error(`Ark HTTP ${res.status}: ${text.slice(0, 900)}`);
      if ((res.status === 429 || res.status >= 500) && attempt < settings.retries) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      throw lastError;
    } catch (err) {
      lastError = err;
      if (attempt < settings.retries && (err.name === 'AbortError' || err.name === 'TypeError')) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function resolveStyle(spec) {
  const prompts = loadPrompts();
  if (!spec.style) return prompts.style;
  const named = prompts.styles && prompts.styles[spec.style];
  return named || spec.style;
}

function buildPayload(spec, settings, args) {
  const prompt = [resolveStyle(spec), spec.prompt].filter(Boolean).join('\n\n');
  const payload = {
    model: args.model || settings.model,
    prompt,
    size: spec.size || settings.size,
    output_format: spec.outputFormat || settings.outputFormat,
    response_format: 'url',
    watermark: settings.watermark
  };
  if (spec.seed !== undefined) payload.seed = Number(spec.seed);
  if (args.seed !== undefined) payload.seed = Number(args.seed);
  if (spec.image) payload.image = spec.image;
  if (spec.background) payload.background = spec.background;
  return payload;
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return buf.length;
}

async function saveImage(data, dest) {
  const item = data.data?.[0];
  if (!item) throw new Error('Ark response has no data[0]');
  if (item.b64_json) {
    const buf = Buffer.from(item.b64_json, 'base64');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    return buf.length;
  }
  if (item.url) return download(item.url, dest);
  throw new Error('Ark response has neither url nor b64_json');
}

/* -------------------------------------------------------------- prompts */

let promptsCache = null;
function loadPrompts() {
  if (!promptsCache) promptsCache = readJson(PROMPTS_PATH, { style: '', assets: [] });
  return promptsCache;
}

function findSpec(id) {
  const spec = loadPrompts().assets.find((item) => item.id === id);
  if (!spec) throw new Error(`Unknown asset id "${id}". Run: node tools/seedream.mjs list`);
  return spec;
}

function specMode(spec) {
  if (spec.preset === 'background') return 'background';
  if (spec.preset === 'icon') return 'icon';
  return 'sprite';
}

/* ------------------------------------------------------------ generation */

async function generateOne(spec, settings, args, options = {}) {
  const outPath = resolvePath(spec.out);
  const target = Number(spec.target || PRESET_TARGET[spec.preset] || 128);
  const keyColor = args['key-color'] || spec.keyColor || '#00FF00';
  const mode = specMode(spec);

  if (!args.force && !args['dry-run'] && fs.existsSync(outPath)) {
    return { spec, skipped: true, outPath };
  }

  const payload = buildPayload(spec, settings, args);
  if (args['dry-run']) {
    return { spec, dryRun: true, payload, outPath };
  }

  const started = Date.now();
  const json = await callArk(settings, payload);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const rawPath = path.join(CACHE_DIR, `${spec.id}.raw.png`);
  const bytes = await saveImage(json, rawPath);
  const usage = json.usage || {};

  const python = options.python || findPython(settings);
  const postArgs = [POST_SCRIPT, '--input', rawPath, '--out', outPath, '--mode', mode];
  if (mode === 'background') {
    postArgs.push('--width', String(spec.width || 2400), '--height', String(spec.height || 1600));
  } else {
    postArgs.push('--target', String(target), '--key-color', keyColor);
    if (args['no-key']) postArgs.push('--mode', 'raw');
    if (args.pad !== undefined) postArgs.push('--pad', String(args.pad));
  }
  if (args.debug) postArgs.push('--debug');

  const run = spawnSync(python, postArgs, { stdio: 'inherit', windowsHide: true, timeout: 180000 });
  if (run.error) throw run.error;
  if (run.status !== 0) {
    throw new Error(`post-process failed with exit code ${run.status}; see stderr above`);
  }

  const outSize = fs.statSync(outPath).size;
  await recordManifest(spec, settings, payload, {
    target,
    keyColor: mode === 'background' ? null : keyColor,
    usage,
    rawBytes: bytes,
    outSize,
    elapsedMs: Date.now() - started
  });

  return { spec, outPath, outSize, rawBytes: bytes, usage, elapsedMs: Date.now() - started };
}

/* Re-run only the post-process on a cached raw image; no Ark request. */
function reprocessOne(spec, args, python) {
  const rawPath = path.join(CACHE_DIR, `${spec.id}.raw.png`);
  if (!fs.existsSync(rawPath)) throw new Error(`missing raw cache: ${rawPath}`);
  const outPath = resolvePath(spec.out);
  const target = Number(spec.target || PRESET_TARGET[spec.preset] || 128);
  const keyColor = spec.keyColor || '#00FF00';
  const mode = specMode(spec);
  const postArgs = [POST_SCRIPT, '--input', rawPath, '--out', outPath, '--mode', mode];
  if (mode === 'background') {
    postArgs.push('--width', String(spec.width || 2400), '--height', String(spec.height || 1600));
  } else {
    postArgs.push('--target', String(target), '--key-color', keyColor,
      '--tol', String(Number(args.tol) || 110));
  }
  if (args.debug) postArgs.push('--debug');

  const run = spawnSync(python, postArgs, { stdio: 'inherit', windowsHide: true, timeout: 180000 });
  if (run.error) throw run.error;
  if (run.status !== 0) {
    throw new Error(`post-process failed with exit code ${run.status}; see stderr above`);
  }
  return { spec, outPath, outSize: fs.statSync(outPath).size };
}

let manifestChain = Promise.resolve();
function recordManifest(spec, settings, payload, info) {
  manifestChain = manifestChain.then(() => {
    const manifest = readJson(MANIFEST_PATH, { version: 1, assets: {} });
    manifest.version = 1;
    manifest.model = settings.model;
    manifest.assets = manifest.assets || {};
    manifest.assets[spec.id] = {
      out: spec.out,
      preset: spec.preset,
      target: info.target,
      keyColor: info.keyColor,
      model: settings.model,
      size: payload.size,
      seed: payload.seed ?? null,
      prompt: payload.prompt,
      usage: info.usage,
      rawBytes: info.rawBytes,
      outBytes: info.outSize,
      generatedAt: new Date().toISOString(),
      elapsedMs: info.elapsedMs
    };
    writeJsonAtomic(MANIFEST_PATH, manifest);
  });
  return manifestChain;
}

async function runPool(items, limit, worker) {
  const queue = items.slice();
  const results = [];
  let fatal = null;
  async function runner() {
    while (queue.length && !fatal) {
      const item = queue.shift();
      try {
        results.push(await worker(item));
      } catch (err) {
        fatal = err;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, runner));
  if (fatal) throw fatal;
  return results;
}

/* --------------------------------------------------------------- commands */

function cmdDoctor(args) {
  const settings = loadSettings(args);
  const prompts = loadPrompts();
  const python = (() => {
    try { return findPython(settings); } catch (err) { return `(missing: ${err.message})`; }
  })();
  const missing = prompts.assets.filter((item) => !fs.existsSync(resolvePath(item.out)));

  console.log('Seedream / Ark image generation doctor');
  console.log('  project      :', PROJECT_DIR);
  console.log('  endpoint     :', settings.baseURL + '/images/generations');
  console.log('  model        :', settings.model);
  console.log('  api key      :', settings.apiKey ? maskKey(settings.apiKey) : '(NOT FOUND)');
  console.log('  key source   :', settings.keySource || '(none)');
  console.log('  default size :', settings.size, '/', settings.outputFormat);
  console.log('  python       :', python);
  console.log('  prompts      :', prompts.assets.length, `(${missing.length} missing, ${prompts.assets.length - missing.length} present)`);
  console.log('  outputs      :', path.relative(process.cwd(), resolvePath('assets')));
  if (!settings.apiKey) {
    console.log('\nSet a key in one of these places:');
    console.log('  - ~/.dsh/seedream.json  { "apiKey": "ark-..." }');
    console.log('  - env ARK_API_KEY');
    console.log('  - abyss-echoes/.env.local  ARK_API_KEY=ark-...');
    return 1;
  }
  return 0;
}

function cmdList(args) {
  const prompts = loadPrompts();
  for (const item of prompts.assets) {
    const out = resolvePath(item.out);
    const exists = fs.existsSync(out);
    const size = exists ? humanSize(fs.statSync(out).size) : '-';
    console.log(
      `${item.id.padEnd(22)} ${String(item.preset).padEnd(10)} ${String(item.target || `${item.width}x${item.height}`).padEnd(10)} ${exists ? 'OK ' : '-- '} ${size.padEnd(9)} ${item.out}`
    );
  }
  return 0;
}

function cmdValidate(args) {
  const prompts = loadPrompts();
  const problems = [];
  const ids = prompts.assets.map((item) => item.id);
  const dupes = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (dupes.length) problems.push(`duplicate ids: ${[...new Set(dupes)].join(', ')}`);

  for (const item of prompts.assets) {
    if (!item.prompt || !item.prompt.trim()) problems.push(`${item.id}: empty prompt`);
    if (!['player', 'enemy', 'boss', 'icon', 'background'].includes(item.preset)) {
      problems.push(`${item.id}: bad preset ${item.preset}`);
    }
    if (item.preset === 'background') {
      if (!item.width || !item.height) problems.push(`${item.id}: background needs width/height`);
    } else {
      if (!item.target) problems.push(`${item.id}: preset ${item.preset} needs target`);
      if (!item.keyColor) problems.push(`${item.id}: needs keyColor`);
    }
    if (!item.out || !item.out.startsWith('assets/')) problems.push(`${item.id}: out must start with assets/`);
  }

  const contentPath = path.join(PROJECT_DIR, 'js', 'content.js');
  let declared = null;
  if (fs.existsSync(contentPath)) {
    const text = fs.readFileSync(contentPath, 'utf8');
    declared = new Set([...text.matchAll(/'((?:player|background|enemy|boss|skill|talent)\/[^']+)'/g)].map((m) => m[1]));
  }
  if (declared) {
    const planned = new Set(prompts.assets.map((item) => item.out.replace(/^assets\//, '')));
    for (const rel of planned) {
      if (!declared.has(rel)) problems.push(`planned but not in CONTENT.assets: ${rel}`);
    }
    for (const rel of declared) {
      if (!planned.has(rel)) problems.push(`CONTENT.assets has no prompt: ${rel}`);
    }
  } else {
    problems.push('js/content.js not found; skipped asset-path cross-check');
  }

  console.log(`validate: ${prompts.assets.length} prompt(s), ${declared ? declared.size : '?'} content asset path(s)`);
  if (problems.length) {
    for (const problem of problems) console.error('  -', problem);
    return 1;
  }
  console.log('  all checks passed');
  return 0;
}

async function cmdGenerate(args) {
  const settings = loadSettings(args);
  if (!settings.apiKey) throw new Error('No Ark API key found. Run `node tools/seedream.mjs doctor` for the accepted places.');

  let spec;
  if (args.spec) {
    spec = findSpec(args.spec);
  } else {
    if (!args.prompt || !args.out) throw new Error('Use --spec <id>, or --prompt "..." --out <path>.');
    spec = {
      id: args.id || path.basename(args.out, path.extname(args.out)),
      out: args.out,
      preset: args.preset || 'sprite',
      target: Number(args.target || PRESET_TARGET[args.preset] || 128),
      size: args.size,
      keyColor: args['key-color'] || '#00FF00',
      prompt: args.prompt
    };
  }

  const python = findPython(settings);
  const result = await generateOne(spec, settings, args, { python });
  if (result.skipped) {
    console.log(`skip ${spec.id}: ${spec.out} already exists (use --force to overwrite)`);
  } else if (result.dryRun) {
    console.log(JSON.stringify(result.payload, null, 2));
  } else {
    console.log(`ok ${spec.id} -> ${spec.out}`);
    console.log(`   ${result.outSize ? humanSize(result.outSize) : ''}  raw ${humanSize(result.rawBytes)}  ${result.elapsedMs} ms`);
  }
  return 0;
}

function cmdReprocess(args) {
  const settings = loadSettings(args);
  const python = findPython(settings);
  let items = loadPrompts().assets;
  if (!args['include-backgrounds']) {
    items = items.filter((item) => item.preset !== 'background');
  }
  if (args.only) {
    const wanted = new Set(String(args.only).split(',').map((s) => s.trim()).filter(Boolean));
    items = items.filter((item) => wanted.has(item.id));
    if (!items.length) throw new Error(`--only matched nothing: ${args.only}`);
  }
  if (args.preset) items = items.filter((item) => item.preset === args.preset);
  if (!items.length) throw new Error('no assets matched reprocess filters');

  console.log(`reprocess: ${items.length} cached asset(s), tol=${Number(args.tol) || 110}`);
  let ok = 0;
  const errors = [];
  for (const spec of items) {
    if (args['dry-run']) {
      console.log('  dry-run', spec.id, '->', spec.out);
      continue;
    }
    try {
      const result = reprocessOne(spec, args, python);
      ok++;
      console.log(`  ok ${spec.id} -> ${spec.out}  ${humanSize(result.outSize)}`);
    } catch (err) {
      errors.push(spec.id);
      console.error(`  FAIL ${spec.id}: ${err.message}`);
    }
  }
  console.log(`reprocess done: ${ok} written, ${errors.length} failed`);
  if (errors.length) {
    console.error('failed ids: ' + errors.join(', '));
    return 1;
  }
  return 0;
}

async function cmdBatch(args) {
  const settings = loadSettings(args);
  if (!settings.apiKey && !args['dry-run']) {
    throw new Error('No Ark API key found. Run `node tools/seedream.mjs doctor` for the accepted places.');
  }
  const prompts = loadPrompts();
  let items = prompts.assets;
  if (args.only) {
    const wanted = new Set(String(args.only).split(',').map((s) => s.trim()).filter(Boolean));
    items = items.filter((item) => wanted.has(item.id));
    if (!items.length) throw new Error(`--only matched nothing: ${args.only}`);
  }
  if (args.preset) items = items.filter((item) => item.preset === args.preset);
  if (args.limit) items = items.slice(0, Number(args.limit));

  const pending = items.filter((item) => args.force || !fs.existsSync(resolvePath(item.out)));
  const skipped = items.length - pending.length;
  console.log(`batch: ${items.length} selected, ${pending.length} to generate, ${skipped} already present`);
  if (args['dry-run']) {
    for (const item of pending) {
      console.log('  dry-run', item.id, '->', item.out, buildPayload(item, settings, args).size);
    }
    return 0;
  }

  const python = findPython(settings);
  let done = 0;
  const errors = [];
  const results = await runPool(pending, settings.concurrency, async (spec) => {
    try {
      const result = await generateOne(spec, settings, args, { python });
      done++;
      console.log(`[${done}/${pending.length}] ${spec.id} -> ${spec.out}  ${result.outSize ? humanSize(result.outSize) : ''}  ${result.elapsedMs} ms`);
      return result;
    } catch (err) {
      done++;
      errors.push({ id: spec.id, message: err.message });
      console.error(`[${done}/${pending.length}] FAIL ${spec.id}: ${err.message}`);
      return null;
    }
  });
  const okCount = results.filter(Boolean).length;
  console.log(`batch done: ${okCount} generated, ${skipped} skipped, ${errors.length} failed`);
  const manifest = readJson(MANIFEST_PATH, { assets: {} });
  const total = Object.keys(manifest.assets || {}).length;
  console.log(`manifest: ${total} recorded asset(s) at ${path.relative(process.cwd(), MANIFEST_PATH)}`);
  if (errors.length) {
    console.error('failed ids: ' + errors.map((err) => err.id).join(', '));
    return 1;
  }
  return 0;
}

/* ------------------------------------------------------------------- main */

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'doctor';
  const args = parseArgs(argv[0] && !argv[0].startsWith('--') ? argv.slice(1) : argv);

  switch (command) {
    case 'doctor': return cmdDoctor(args);
    case 'list': return cmdList(args);
    case 'validate': return cmdValidate(args);
    case 'generate': return cmdGenerate(args);
    case 'batch': return cmdBatch(args);
    case 'reprocess': return cmdReprocess(args);
    default:
      console.error(`Unknown command "${command}". Use doctor | list | validate | generate | batch | reprocess.`);
      return 2;
  }
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error('error:', err.message);
  process.exit(1);
});
