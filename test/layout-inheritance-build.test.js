/**
 * @file layout-inheritance-build.test.js
 * @description End to end: an HTML page and a markdown page, both with
 * `layout: post`, render through the child layout `post` and then its parent
 * `base` in a real `cook build` of a temp site.
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOK = path.resolve(__dirname, '..', 'bin', 'cook.js');

const BASE = `<!doctype html>
<html lang="en">
<head>
  <script type="application/json" data-layout-info>{"format":1,"label":"Base","slots":{"aside":{"label":"Sidebar"}}}</script>
  <meta charset="utf-8">
  <title>\${title}</title>
</head>
<body data-page-layout="\${pageLayout}">
<main>\${content}</main>
<aside>\${slot:aside}</aside>
</body>
</html>
`;

const POST = `<body data-template="base" data-page-layout="article">
  <script type="application/json" data-layout-info>{"format":1,"label":"Post","slots":{"aside":{"label":"Sidebar"}}}</script>
  <article>
    <h1>\${title}</h1>
    \${content}
  </article>
  <template slot="aside">\${slot:aside}</template>
</body>
`;

let tmp;
before(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cook-layouts-'));
  const files = {
    'config/main.js': 'export default {};\n',
    'src/layouts/base.html': BASE,
    'src/layouts/post.html': POST,
    'src/hello.html': '---\nlayout: post\ntitle: Hello\n---\n<p>Hi there</p>\n<template slot="aside"><template><b>i</b></template></template>\n',
    'src/blog/first.md': '---\nlayout: post\ntitle: First\n---\nMarkdown body.\n',
  };
  for (const [rel, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(tmp, rel)), { recursive: true });
    await fs.writeFile(path.join(tmp, rel), content);
  }
  const r = spawnSync(process.execPath, [COOK, 'build'], {
    cwd: tmp, env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf-8',
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
after(async () => { if (tmp) await fs.rm(tmp, { recursive: true, force: true }); });

describe('layout inheritance in a build', () => {
  test('an HTML page renders through post then base', async () => {
    const html = await fs.readFile(path.join(tmp, 'dist/hello/index.html'), 'utf-8');
    assert.ok(!html.includes('data-layout-info'), html);
    assert.ok(!html.includes('data-template'), html);
    assert.match(html, /<title>Hello<\/title>/);
    assert.match(html, /<body data-page-layout="article">/);
    assert.match(html, /<main><article>\s*<h1>Hello<\/h1>\s*<p>Hi there<\/p>\s*<\/article><\/main>/);
    assert.match(html, /<aside><template><b>i<\/b><\/template><\/aside>/);
  });

  test('a markdown page renders through post then base', async () => {
    const html = await fs.readFile(path.join(tmp, 'dist/blog/first/index.html'), 'utf-8');
    assert.ok(!html.includes('data-layout-info'), html);
    assert.ok(!html.includes('data-template'), html);
    assert.match(html, /<title>First<\/title>/);
    assert.match(html, /<body data-page-layout="article">/);
    assert.match(html, /<main><article>\s*<h1>First<\/h1>\s*<p>Markdown body.<\/p>\s*<\/article><\/main>/);
    assert.match(html, /<aside><\/aside>/);
  });
});
