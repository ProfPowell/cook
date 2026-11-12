/**
 * @file regression-byte-identical.test.js
 * @description Regression gate: a site that uses none of the layout features
 * builds byte-identically with master's Cook and with this branch's Cook.
 *
 * Slow and needs a checkout of master, so it only runs with COOK_REGRESSION=1:
 *   COOK_REGRESSION=1 node --test test/regression-byte-identical.test.js
 *
 * Sites compared: Cook's own docs-site and a copy of thomasapowell.com
 * (COOK_REGRESSION_SITE overrides its path; skipped when it is absent).
 * Sources are copied into a temp dir (node_modules symlinked), so nothing in
 * the originals is written. Baseline ref: COOK_REGRESSION_BASE (default master).
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { promises as fs, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENABLED = process.env.COOK_REGRESSION === '1';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_REF = process.env.COOK_REGRESSION_BASE || 'master';
const OTHER_SITE = process.env.COOK_REGRESSION_SITE || path.join(os.homedir(), 'src', 'thomasapowell.com');

let scratch;
let baseDir;

before(async () => {
  if (!ENABLED) return;
  scratch = await fs.mkdtemp(path.join(process.env.COOK_REGRESSION_TMP || os.tmpdir(), 'cook-regression-'));
  baseDir = path.join(scratch, 'master-cook');
  execFileSync('git', ['worktree', 'add', '--detach', baseDir, BASE_REF], { cwd: ROOT, stdio: 'pipe' });
  await fs.symlink(path.join(ROOT, 'node_modules'), path.join(baseDir, 'node_modules'));
});

after(async () => {
  if (!ENABLED) return;
  if (baseDir) {
    try {
      await fs.rm(path.join(baseDir, 'node_modules'), { force: true });
      execFileSync('git', ['worktree', 'remove', '--force', baseDir], { cwd: ROOT, stdio: 'pipe' });
    } catch { /* best effort */ }
  }
  await fs.rm(scratch, { recursive: true, force: true });
});

function copySite(from, to) {
  execFileSync('rsync', [
    '-a', '--exclude', 'node_modules', '--exclude', 'dist', '--exclude', '.git',
    `${from}/`, `${to}/`,
  ]);
  if (existsSync(path.join(from, 'node_modules'))) {
    return fs.symlink(path.join(from, 'node_modules'), path.join(to, 'node_modules'));
  }
}

function build(cookRoot, siteDir) {
  const res = spawnSync(process.execPath, [path.join(cookRoot, 'bin', 'cook.js'), 'build'], {
    cwd: siteDir,
    encoding: 'utf-8',
    env: { ...process.env, NODE_ENV: 'production' },
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(res.status, 0, `build failed in ${siteDir}:\n${res.stdout}\n${res.stderr}`);
}

async function listFiles(dir, rel = '') {
  const out = [];
  for (const entry of await fs.readdir(path.join(dir, rel), { withFileTypes: true })) {
    const r = path.join(rel, entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(dir, r));
    else out.push(r);
  }
  return out.sort();
}

// generate-formats.js stamps the Atom feed's own <updated> with the build time
// (`now`), so two builds with the same Cook differ by that one value. Only the
// feed-level element (two-space indent, before the first entry) is masked;
// per-entry <updated> values come from content and still compare.
function maskBuildTime(buf) {
  return Buffer.from(buf.toString('utf-8').replace(/^  <updated>[^<]*<\/updated>$/m, '  <updated>BUILD_TIME</updated>'));
}

async function compareDist(a, b) {
  const [filesA, filesB] = [await listFiles(a), await listFiles(b)];
  const diffs = [];
  for (const f of filesA) if (!filesB.includes(f)) diffs.push(`only in master: ${f}`);
  for (const f of filesB) if (!filesA.includes(f)) diffs.push(`only in branch: ${f}`);
  for (const f of filesA.filter(x => filesB.includes(x))) {
    let [x, y] = [await fs.readFile(path.join(a, f)), await fs.readFile(path.join(b, f))];
    if (f === 'feed.xml') [x, y] = [x, y].map(maskBuildTime);
    if (!x.equals(y)) diffs.push(`differs: ${f}`);
  }
  return { count: filesA.length, diffs };
}

async function gate(name, sourceDir, subdir = '', extraFiles = []) {
  const masterCopy = path.join(scratch, `${name}-master`);
  const branchCopy = path.join(scratch, `${name}-branch`);
  for (const copy of [masterCopy, branchCopy]) {
    await fs.mkdir(path.join(copy, subdir), { recursive: true });
    await copySite(sourceDir, path.join(copy, subdir));
    // Files the site reads from outside its own folder (docs-site reads ../package.json)
    for (const f of extraFiles) await fs.copyFile(path.join(ROOT, f), path.join(copy, f));
  }
  build(baseDir, path.join(masterCopy, subdir));
  build(ROOT, path.join(branchCopy, subdir));
  const { count, diffs } = await compareDist(path.join(masterCopy, subdir, 'dist'), path.join(branchCopy, subdir, 'dist'));
  assert.ok(count > 0, `${name}: no files built`);
  assert.deepEqual(diffs, [], `${name}: dist differs from ${BASE_REF}:\n${diffs.join('\n')}`);
}

test('docs-site builds byte-identically with master and this branch', { skip: !ENABLED, timeout: 600000 }, async () => {
  await gate('docs-site', path.join(ROOT, 'docs-site'), 'docs-site', ['package.json']);
});

test('thomasapowell.com builds byte-identically with master and this branch', {
  skip: !ENABLED ? 'set COOK_REGRESSION=1' : !existsSync(OTHER_SITE) ? `${OTHER_SITE} not found` : false,
  timeout: 600000,
}, async () => {
  await gate('thomasapowell', OTHER_SITE);
});
