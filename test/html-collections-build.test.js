/**
 * @file html-collections-build.test.js
 * @description End to end: a temp Cook project whose posts are HTML pages
 * with front matter (plus one markdown post) gets a home page list and an
 * Atom feed from `collections.posts`. Runs the CLI as a child process
 * because config is read from process.cwd() when the modules load.
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOK = path.resolve(__dirname, '..', 'bin', 'cook.js');

let tmp;
const write = async (rel, content) => {
  await fs.mkdir(path.dirname(path.join(tmp, rel)), { recursive: true });
  await fs.writeFile(path.join(tmp, rel), content);
};
const build = (env = {}) => execFileSync(process.execPath, [COOK, 'build'], {
  cwd: tmp,
  env: { ...process.env, NODE_ENV: 'production', ...env },
  stdio: 'pipe',
});
const read = (rel) => fs.readFile(path.join(tmp, rel), 'utf-8');

before(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cook-htmlcol-build-'));
  await write('config/main.js', `export default {
  buildOnlyPaths: ['layouts'],
  collections: { html: true },
  formats: { feed: { collection: 'posts' }, json: false, markdown: false, llmsTxt: false },
};
`);
  await write('config/data.js', `export default { siteUrl: 'https://example.com', siteTitle: 'T' };\n`);
  await write('src/index.html', `<!doctype html>
<html lang="en"><head><title>Home</title></head>
<body><ul><li data-repeat="collections.posts as post"><a href="\${post.url}">\${post.title}</a></li></ul></body></html>
`);
  await write('src/layouts/post.html', `<!doctype html>
<html lang="en"><head><title>\${title}</title></head>
<body><article class="post-layout"><h1>\${title}</h1>\${content}</article></body></html>
`);
  await write('src/posts/first-html.html', `---
title: First HTML
date: 2026-01-10
layout: post
---
<p>first html body</p>
`);
  await write('src/posts/second-html.html', `---
title: Second HTML
date: 2026-03-10
layout: post
---
<p>second html body</p>
`);
  await write('src/posts/md-post.md', `---
title: Markdown Post
date: 2026-02-10
layout: post
---
markdown body
`);
});

after(() => fs.rm(tmp, { recursive: true, force: true }));

describe('HTML collections in a full build', () => {
  test('home page lists HTML and markdown posts together, newest first', async () => {
    build();
    const home = await read('dist/index.html');
    const titles = [...home.matchAll(/<a href="[^"]*">([^<]+)<\/a>/g)].map(m => m[1]);
    assert.deepEqual(titles, ['Second HTML', 'Markdown Post', 'First HTML']);
    assert.match(home, /href="\/posts\/second-html\/"/);
  });

  test('Atom feed has an entry per post with absolute links', async () => {
    const feed = await read('dist/feed.xml');
    assert.equal((feed.match(/<entry>/g) || []).length, 3);
    for (const slug of ['first-html', 'second-html', 'md-post']) {
      assert.ok(feed.includes(`https://example.com/posts/${slug}/`), `feed links ${slug}`);
    }
  });

  test('HTML posts are built with their layout', async () => {
    const post = await read('dist/posts/second-html/index.html');
    assert.match(post, /<article class="post-layout"><h1>Second HTML<\/h1>/);
    assert.match(post, /second html body/);
  });

  test('dev single-page rebuild of the list page still sees every post', async () => {
    build({ NODE_ENV: 'development', DEV_CHANGED_PAGE: 'src/index.html' });
    const home = await read('dist/index.html');
    const titles = [...home.matchAll(/<a href="[^"]*">([^<]+)<\/a>/g)].map(m => m[1]);
    assert.deepEqual(titles, ['Second HTML', 'Markdown Post', 'First HTML']);
  });
});
