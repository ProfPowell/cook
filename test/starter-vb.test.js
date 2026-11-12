/**
 * @file starter-vb.test.js
 * @description The Vanilla Breeze starter set (starters/vanilla-breeze) follows
 * layout format 1 and builds, from a scratch copy, to the expected pages.
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listLayouts } from '../scripts/layouts.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STARTER = path.join(ROOT, 'starters', 'vanilla-breeze');
const COOK = path.join(ROOT, 'bin', 'cook.js');
const NAMES = ['base', 'page', 'post', 'docs', 'landing'];
const INCLUDES = ['header', 'footer', 'site-nav'];

const tmps = [];
after(() => Promise.all(tmps.map(t => fs.rm(t, { recursive: true, force: true }))));

/** Copy the starter to a scratch dir with node_modules and cook-ssg linked in. */
async function scratch(extra = {}) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cook-starter-'));
  tmps.push(tmp);
  await fs.cp(STARTER, tmp, { recursive: true });
  await fs.mkdir(path.join(tmp, 'node_modules'));
  for (const e of await fs.readdir(path.join(ROOT, 'node_modules'))) {
    await fs.symlink(path.join(ROOT, 'node_modules', e), path.join(tmp, 'node_modules', e));
  }
  await fs.rm(path.join(tmp, 'node_modules', 'cook-ssg'), { force: true });
  await fs.symlink(ROOT, path.join(tmp, 'node_modules', 'cook-ssg'));
  for (const [rel, content] of Object.entries(extra)) {
    await fs.mkdir(path.dirname(path.join(tmp, rel)), { recursive: true });
    await fs.writeFile(path.join(tmp, rel), content);
  }
  return tmp;
}
function build(tmp) {
  const r = spawnSync(process.execPath, [COOK, 'build'], {
    cwd: tmp, env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf-8',
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
}
const read = (tmp, rel) => fs.readFile(path.join(tmp, 'dist', rel), 'utf-8');

describe('starter: format 1 check', () => {
  test('every layout and include is ok and editable; base is abstract', async () => {
    const { layouts, includes, problems } = await listLayouts(STARTER);
    assert.deepEqual(problems, []);
    assert.deepEqual(layouts.map(l => l.name).sort(), [...NAMES].sort());
    assert.deepEqual(includes.map(i => i.name).sort(), [...INCLUDES].sort());
    for (const l of [...layouts, ...includes]) assert.equal(l.ok, true, `${l.name}: ${JSON.stringify(l.problems)}`);
    for (const l of layouts) assert.equal(l.editable, true, l.name);
    assert.equal(layouts.find(l => l.name === 'base').abstract, true);
    for (const n of NAMES.slice(1)) assert.notEqual(layouts.find(l => l.name === n).abstract, true);
  });

  test('cook check-layouts exits 0', () => {
    const r = spawnSync(process.execPath, [COOK, 'check-layouts'], { cwd: STARTER, encoding: 'utf-8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });

  test('package.json follows the thomasapowell.com approach', async () => {
    const pkg = JSON.parse(await fs.readFile(path.join(STARTER, 'package.json'), 'utf-8'));
    assert.equal(pkg.dependencies['cook-ssg'], '^2.8.0');
    assert.equal(pkg.dependencies['vanilla-breeze'], '^0.6.0');
    assert.equal(pkg.scripts.vendor, 'node scripts/vendor-vb.js');
    assert.equal(pkg.scripts.prebuild, 'npm run vendor');
    assert.equal(pkg.scripts.predev, 'npm run vendor');
  });

  test('npm does not ship starters/', async () => {
    const pkg = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf-8'));
    assert.ok(!pkg.files.some(f => f.startsWith('starters')));
  });
});

describe('starter: build', () => {
  let tmp;
  before(async () => { tmp = await scratch(); build(tmp); });

  test('post: title, article layout, no figure, no aside', async () => {
    const html = await read(tmp, 'posts/hello/index.html');
    assert.match(html, /<h1>Hello, world<\/h1>/);
    assert.match(html, /<body[^>]*data-page-layout="article"/);
    assert.doesNotMatch(html, /<figure/);
    assert.doesNotMatch(html, /<aside/);
    assert.doesNotMatch(html, /og:image/);
    assert.match(html, /property="og:title" content="Hello, world"/);
    assert.doesNotMatch(html, /data-layout-info|data-if|data-template|\$\{/);
    assert.match(html, /vanilla-breeze\.css/);
  });

  test('post: header, footer and site nav from includes', async () => {
    const html = await read(tmp, 'posts/hello/index.html');
    assert.match(html, /<header[\s\S]*<a href="\/about\/">About<\/a>[\s\S]*<\/header>/);
    assert.match(html, /<footer/);
  });

  test('site nav: one ul, one li per navItems entry', async () => {
    const html = await read(tmp, 'posts/hello/index.html');
    const nav = html.match(/<nav aria-label="Site">[\s\S]*?<\/nav>/)[0];
    assert.equal((nav.match(/<ul/g) || []).length, 1);
    assert.equal((nav.match(/<li/g) || []).length, 3);
  });

  test('docs: sidebar-left with its nav', async () => {
    const html = await read(tmp, 'docs/start/index.html');
    assert.match(html, /data-page-layout="sidebar-left"/);
    assert.match(html, /<nav[^>]*aria-label="Section menu"/);
    assert.doesNotMatch(html, /<aside/);
  });

  test('landing: hero and cta', async () => {
    const html = await read(tmp, 'landing/index.html');
    assert.match(html, /data-page-layout="landing"/);
    assert.match(html, /Hero headline/);
    assert.match(html, /Call to action/);
  });

  test('page: stack', async () => {
    const html = await read(tmp, 'about/index.html');
    assert.match(html, /data-page-layout="stack"/);
  });

  test('home lists posts', async () => {
    const html = await read(tmp, 'index.html');
    assert.match(html, /href="\/posts\/hello\/"/);
  });
});

describe('starter: build with everything Vanilla Press writes', () => {
  test('image, tags, author, aside', async () => {
    const tmp = await scratch({
      'src/posts/full.html': `---
title: "Full Post"
description: "All fields"
date: "2026-11-03"
published: "2026-11-03T16:39:56.515Z"
updated: "2026-11-11T16:22:02.804Z"
author: "Pat Writer"
tags: ["one", "two"]
image: "/media/pic.jpg"
imageAlt: "A picture"
theme: "8bit"
themeScope: "page"
layout: "post"
slug: "full"
vp_id: "doc_1"
---
<p>Body.</p>
<template slot="aside"><p>Side note</p></template>
`,
    });
    build(tmp);
    const html = await read(tmp, 'posts/full/index.html');
    assert.match(html, /<figure[^>]*>\s*<img src="\/media\/pic\.jpg" alt="A picture">/);
    assert.match(html, /<meta property="og:image" content="\/media\/pic\.jpg">/);
    assert.match(html, /<aside[^>]*>[\s\S]*Side note/);
    assert.match(html, /Pat Writer/);
    assert.match(html, /<time datetime="2026-11-03">/);
    assert.doesNotMatch(html, /data-if|\$\{/);
  });

  test('hello post with image added', async () => {
    const src = await fs.readFile(path.join(STARTER, 'src/posts/hello.html'), 'utf-8');
    const tmp = await scratch({
      'src/posts/hello.html': src.replace(/^---\n/, '---\nimage: "/media/x.jpg"\n'),
    });
    build(tmp);
    const html = await read(tmp, 'posts/hello/index.html');
    assert.match(html, /<figure/);
    assert.match(html, /og:image/);
  });
});
