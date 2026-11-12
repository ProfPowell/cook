/**
 * @file check-layouts-cli.test.js
 * @description `cook check-layouts` prints problems and a summary, and exits 1 only for real problems.
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const COOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'cook.js');
const tmps = [];
after(() => Promise.all(tmps.map(t => fs.rm(t, { recursive: true, force: true }))));

async function site(files) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cook-check-'));
  tmps.push(tmp);
  for (const [rel, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(tmp, rel)), { recursive: true });
    await fs.writeFile(path.join(tmp, rel), content);
  }
  return tmp;
}
const run = (cwd) => spawnSync(process.execPath, [COOK, 'check-layouts'], { cwd, encoding: 'utf-8' });

const BASE = `<!doctype html>
<html lang="en">
<head>
<script type="application/json" data-layout-info>{ "format": 1, "abstract": true }</script>
<title>\${title}</title>
</head>
<body>
<main>\${content}</main>
</body>
</html>
`;
const post = (field) => `<body data-template="base">
<script type="application/json" data-layout-info>
{ "format": 1, "label": "Post" }
</script>
<article>
<h1>\${title}</h1>
<p>\${${field}}</p>
\${content}
</article>
</body>
`;

test('a good site exits 0 with a summary', async () => {
  const dir = await site({ 'src/layouts/base.html': BASE, 'src/layouts/post.html': post('date') });
  const r = run(dir);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout.trim(), '2 layouts, 0 includes: 2 editable, 0 plain, 0 with problems');
});

test('a bad site exits 1 and names file and line', async () => {
  const dir = await site({ 'src/layouts/base.html': BASE, 'src/layouts/post.html': post('nope') });
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^src\/layouts\/post\.html:7: unknown field "nope"$/m);
  assert.match(r.stdout, /2 layouts, 0 includes: 1 editable, 0 plain, 1 with problems/);
});

test('plain layouts never fail the check', async () => {
  const dir = await site({ 'src/layouts/old.html': '<html><body>${content}</body></html>' });
  const r = run(dir);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout.trim(), '1 layouts, 0 includes: 0 editable, 1 plain, 0 with problems');
});

test('an unmarked include is plain; a marked bad include fails', async () => {
  const ok = await site({ 'src/includes/x.html': '<p>${whatever}</p>' });
  const r1 = run(ok);
  assert.equal(r1.status, 0);
  assert.match(r1.stdout, /0 layouts, 1 includes: 0 editable, 1 plain, 0 with problems/);
  const bad = await site({ 'src/includes/x.html': '<!-- layout-fragment -->\n<footer><p>${nope}</p></footer>\n' });
  const r2 = run(bad);
  assert.equal(r2.status, 1);
  assert.match(r2.stdout, /^src\/includes\/x\.html:2: /m);
});

test('a plain child pointing at a missing parent exits 0', async () => {
  const dir = await site({ 'src/layouts/p.html': '<html data-template="gone"><body>${content}</body></html>' });
  const r = run(dir);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('a throwing config/data.js exits 1, even with no layouts', async () => {
  const dir = await site({ 'config/data.js': "throw new Error('boom');\n" });
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^config\/data\.js:1: .*boom/m);
});

test('an orphan format-1 child exits 1', async () => {
  const dir = await site({ 'src/layouts/post.html': post('date').replace('"base"', '"nope"') });
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /parent layout "nope" not found/);
});
