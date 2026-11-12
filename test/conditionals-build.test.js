/**
 * @file conditionals-build.test.js
 * @description End to end: `data-if` / `data-unless` in a real `cook build`
 * of a temp site: page fields and slots at layout time (HTML and markdown
 * pages), list items in `data-repeat`, and site data in an include.
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
<body>
<div data-include="/includes/header.html"></div>
<main>\${content}</main>
<aside data-if="slot:aside">\${slot:aside}</aside>
</body>
</html>
`;

const POST = `<body data-template="base">
  <article>
    <h1>\${title}</h1>
    <figure data-if="image"><img src="\${image}" alt=""></figure>
    <p class="untagged" data-unless="tags">No tags</p>
    \${content}
  </article>
  <template slot="aside">\${slot:aside}</template>
</body>
`;

const HEADER = `<header>
  <p class="tagline" data-if="siteTagline">\${siteTagline}</p>
  <p class="motto" data-if="siteMotto">motto</p>
</header>
`;

const DATA = `export default {
  siteTagline: 'Cooked fresh',
  posts: [
    { title: 'One', image: '/one.png' },
    { title: 'Two' },
    { title: 'Three', image: '' },
  ],
};
`;

const LIST = `---
layout: base
title: List
---
<ul class="posts">
  <li data-repeat="posts as post"><span>\${post.title}</span><img data-if="post.image" src="\${post.image}" alt=""></li>
</ul>
<ol class="pictured">
  <li data-repeat="posts as post, n" data-if="post.image"><b data-unless="n">first</b>\${post.title}</li>
</ol>
`;

let tmp;
const read = (rel) => fs.readFile(path.join(tmp, 'dist', rel), 'utf-8');

before(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cook-conditionals-'));
  const files = {
    'config/main.js': 'export default {};\n',
    'config/data.js': DATA,
    'src/layouts/base.html': BASE,
    'src/layouts/post.html': POST,
    'src/includes/header.html': HEADER,
    'src/with-image.html': '---\nlayout: post\ntitle: With\nimage: /pic.png\ntags: [a]\n---\n<p>Body</p>\n<template slot="aside"><p>Side</p></template>\n',
    'src/without-image.html': '---\nlayout: post\ntitle: Without\n---\n<p>Body</p>\n',
    'src/list.html': LIST,
    'src/blog/md-with.md': '---\nlayout: post\ntitle: MdWith\nimage: /md.png\ntags: [x]\n---\nMarkdown body.\n',
    'src/blog/md-without.md': '---\nlayout: post\ntitle: MdWithout\n---\nMarkdown body.\n',
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

describe('data-if / data-unless in a build', () => {
  test('the post figure appears only on the page with an image (HTML pages)', async () => {
    const withImage = await read('with-image/index.html');
    const without = await read('without-image/index.html');
    assert.match(withImage, /<figure><img src="\/pic.png" alt=""><\/figure>/);
    assert.ok(!without.includes('<figure'), without);
    assert.ok(!withImage.includes('data-if') && !without.includes('data-if'));
    assert.ok(!withImage.includes('data-unless') && !without.includes('data-unless'));
  });

  test('the post figure appears only on the page with an image (markdown pages)', async () => {
    const withImage = await read('blog/md-with/index.html');
    const without = await read('blog/md-without/index.html');
    assert.match(withImage, /<figure><img src="\/md.png" alt=""><\/figure>/);
    assert.ok(!without.includes('<figure'), without);
    assert.ok(!without.includes('data-if'), without);
  });

  test('the aside goes when the page has no aside (forwarded empty slot)', async () => {
    assert.match(await read('with-image/index.html'), /<aside><p>Side<\/p><\/aside>/);
    assert.ok(!(await read('without-image/index.html')).includes('<aside'));
    assert.ok(!(await read('blog/md-without/index.html')).includes('<aside'));
  });

  test('the aside goes when the page has no aside (absent slot, base used directly)', async () => {
    const list = await read('list/index.html');
    assert.ok(!list.includes('<aside'), list);
  });

  test('data-unless="tags"', async () => {
    assert.ok(!(await read('with-image/index.html')).includes('No tags'));
    assert.match(await read('without-image/index.html'), /<p class="untagged">No tags<\/p>/);
    assert.ok(!(await read('blog/md-with/index.html')).includes('No tags'));
    assert.match(await read('blog/md-without/index.html'), /<p class="untagged">No tags<\/p>/);
  });

  test('in a list, the item image shows per item', async () => {
    const list = await read('list/index.html');
    assert.match(list, /<li><span>One<\/span><img src="\/one.png" alt=""><\/li>/);
    assert.match(list, /<li><span>Two<\/span><\/li>/);
    assert.match(list, /<li><span>Three<\/span><\/li>/);
    assert.ok(!list.includes('data-if'), list);
  });

  test("a repeated element's own data-if on the loop variable drops items", async () => {
    const list = await read('list/index.html');
    const ol = list.match(/<ol class="pictured">([\s\S]*?)<\/ol>/)[1];
    assert.match(ol, /<li>One<\/li>/);
    assert.ok(!ol.includes('Two') && !ol.includes('Three'), ol);
    // index 0 is set: data-unless="n" removes the <b>
    assert.ok(!ol.includes('first'), ol);
  });

  test('an include follows config/data.js', async () => {
    for (const page of ['with-image/index.html', 'list/index.html', 'blog/md-with/index.html']) {
      const html = await read(page);
      assert.match(html, /<p class="tagline">Cooked fresh<\/p>/, page);
      assert.ok(!html.includes('motto'), page);
    }
  });
});
