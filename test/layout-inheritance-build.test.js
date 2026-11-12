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

describe('a broken layout chain on a markdown page fails the build', () => {
  let dir, result;
  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cook-layouts-deep-'));
    const files = {
      'config/main.js': 'export default {};\n',
      'src/layouts/l6.html': '<html><body>${content}</body></html>\n',
      'src/blog/deep.md': '---\nlayout: l1\ntitle: Deep\n---\nBody.\n',
      'src/blog/fine.md': '---\nlayout: l2\ntitle: Fine\n---\nBody.\n',
    };
    for (let i = 1; i <= 5; i++) files[`src/layouts/l${i}.html`] = `<body data-template="l${i + 1}">\${content}</body>\n`;
    for (const [rel, content] of Object.entries(files)) {
      await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
      await fs.writeFile(path.join(dir, rel), content);
    }
    result = spawnSync(process.execPath, [COOK, 'build'], {
      cwd: dir, env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf-8',
    });
  });
  after(async () => { if (dir) await fs.rm(dir, { recursive: true, force: true }); });

  test('cook build exits non-zero and names the chain', () => {
    const output = result.stdout + result.stderr;
    assert.notEqual(result.status, 0, output);
    assert.ok(output.includes('Layout chain too deep (more than 5): l1 → l2 → l3 → l4 → l5 → l6'), output);
    assert.ok(output.includes('deep.md'), output);
  });

  test('the other markdown page still builds', async () => {
    const html = await fs.readFile(path.join(dir, 'dist/blog/fine/index.html'), 'utf-8');
    assert.match(html, /<p>Body.<\/p>/);
  });
});

describe('a missing parent layout warns and names the chain', () => {
  let dir, output;
  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cook-layouts-orphan-'));
    const files = {
      'config/main.js': 'export default {};\n',
      'src/layouts/post.html': '<body data-template="base"><article>${content}</article></body>\n',
      'src/page.html': '---\nlayout: post\ntitle: Page\n---\n<p>HTML page</p>\n',
      'src/blog/entry.md': '---\nlayout: post\ntitle: Entry\n---\nMarkdown page.\n',
    };
    for (const [rel, content] of Object.entries(files)) {
      await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
      await fs.writeFile(path.join(dir, rel), content);
    }
    const r = spawnSync(process.execPath, [COOK, 'build'], {
      cwd: dir, env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf-8',
    });
    output = r.stdout + r.stderr;
    assert.equal(r.status, 0, output);
  });
  after(async () => { if (dir) await fs.rm(dir, { recursive: true, force: true }); });

  test('the build output names the child and the missing parent', () => {
    const count = output.split('Layout "post" extends "base", which wasn\'t found').length - 1;
    // once for the HTML page, once for the markdown page
    assert.ok(count >= 2, output);
  });

  test("the markdown page's message no longer says the child itself is missing", () => {
    assert.ok(!output.includes('Layout "post" not found'), output);
  });

  test('fallbacks are unchanged: the markdown page gets basic HTML', async () => {
    const html = await fs.readFile(path.join(dir, 'dist/blog/entry/index.html'), 'utf-8');
    assert.match(html, /Markdown page\./);
  });
});

describe('a marked include ships without its layout-fragment marker', () => {
  let dir;
  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cook-layouts-fragment-'));
    const files = {
      'config/main.js': 'export default {};\n',
      'src/includes/site-nav.html': '<!-- layout-fragment -->\n<nav><a href="/">Home</a></nav>\n',
      'src/index.html': '<!doctype html>\n<html><head><title>T</title></head><body>\n<div data-include="/includes/site-nav.html"></div>\n<p>x</p>\n</body></html>\n',
    };
    for (const [rel, content] of Object.entries(files)) {
      await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
      await fs.writeFile(path.join(dir, rel), content);
    }
    // Development: comments survive (production minifies them away)
    const r = spawnSync(process.execPath, [COOK, 'build'], {
      cwd: dir, env: { ...process.env, NODE_ENV: 'development' }, encoding: 'utf-8',
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });
  after(async () => { if (dir) await fs.rm(dir, { recursive: true, force: true }); });

  test('the built page has the include and no layout-fragment text', async () => {
    const html = await fs.readFile(path.join(dir, 'dist/index.html'), 'utf-8');
    assert.match(html, /<nav><a [^>]*href="\/"[^>]*>Home<\/a><\/nav>/);
    assert.ok(!html.includes('layout-fragment'), html);
  });
});
