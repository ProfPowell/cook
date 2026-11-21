/**
 * @file access.test.js
 * @description Access levels: a build at level L leaves out every source
 * file above L (not copied to dist, not collected), so the feed, sitemap
 * and data-repeat lists follow. Unit tests for the helpers, then a temp
 * Cook project built with the CLI at each level (config is read from
 * process.cwd() when the modules load, so builds run as child processes).
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import { rankOf, isVisible, resolveLevel, resetAccessWarnings } from '../scripts/utils/access/access.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOK = path.resolve(__dirname, '..', 'bin', 'cook.js');
const L = ['public', 'friends', 'private'];


// ============================================================================
// Helpers
// ============================================================================

describe('access helpers', () => {
  test('rankOf: known levels by position, anything else is the last rank', () => {
    assert.equal(rankOf('public', L), 0);
    assert.equal(rankOf('friends', L), 1);
    assert.equal(rankOf('private', L), 2);
    assert.equal(rankOf('Friends', L), 2);
    assert.equal(rankOf('', L), 2);
    assert.equal(rankOf(undefined, L), 2);
  });

  test('isVisible: at or below the build level', () => {
    assert.equal(isVisible('public', 'public', L), true);
    assert.equal(isVisible('friends', 'public', L), false);
    assert.equal(isVisible('friends', 'friends', L), true);
    assert.equal(isVisible('private', 'friends', L), false);
    assert.equal(isVisible('private', 'private', L), true);
    assert.equal(isVisible('typo', 'friends', L), false);
  });

  test('resolveLevel: calls levelOf, normalises unknown to the last level, warns once per file', () => {
    resetAccessWarnings();
    const warnings = [];
    const warn = (msg) => warnings.push(msg);
    const config = { levels: L, level: 'public', levelOf: ({ frontMatter }) => frontMatter?.access ?? 'public' };
    assert.equal(resolveLevel({ relPath: 'a.html', frontMatter: null }, config, warn), 'public');
    assert.equal(resolveLevel({ relPath: 'b.html', frontMatter: { access: 'friends' } }, config, warn), 'friends');
    assert.equal(resolveLevel({ relPath: 'c.html', frontMatter: { access: 'Friends' } }, config, warn), 'private');
    assert.equal(resolveLevel({ relPath: 'c.html', frontMatter: { access: 'Friends' } }, config, warn), 'private');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /c\.html/);
  });
});


// ============================================================================
// Full builds
// ============================================================================

const write = async (root, rel, content) => {
  await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await fs.writeFile(path.join(root, rel), content);
};
const build = (cwd, env = {}) => {
  const res = spawnSync(process.execPath, [COOK, 'build'], {
    cwd,
    env: { ...process.env, NODE_ENV: 'production', COOK_ACCESS_LEVEL: '', ...env },
    encoding: 'utf-8',
  });
  assert.equal(res.status, 0, `build failed:\n${res.stdout}\n${res.stderr}`);
  return `${res.stdout}\n${res.stderr}`;
};
const exists = (root, rel) => fs.access(path.join(root, rel)).then(() => true, () => false);
const read = (root, rel) => fs.readFile(path.join(root, rel), 'utf-8');

const post = (title, extra = '') => `---
title: ${title}
date: 2026-01-10
${extra}---
<!doctype html>
<html lang="en"><head><title>${title}</title></head><body><p>${title} body</p></body></html>
`;

describe('build at an access level', () => {
  let tmp;

  before(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cook-access-build-'));
    await write(tmp, 'config/main.js', `export default {
  buildOnlyPaths: ['layouts'],
  collections: { html: true },
  sitemap: { url: 'https://example.com' },
  formats: { feed: { collection: 'posts' }, json: false, markdown: false, llmsTxt: false },
  access: {
    levelOf: ({ relPath, frontMatter }) => relPath === 'media/fr.jpg' ? 'friends' : (frontMatter?.access ?? 'public'),
  },
};
`);
    await write(tmp, 'config/data.js', `export default { siteUrl: 'https://example.com', siteTitle: 'T' };\n`);
    await write(tmp, 'src/index.html', `<!doctype html>
<html lang="en"><head><title>Home</title></head>
<body><p id="level">\${access.level}</p><ul><li data-repeat="collections.posts as post" class="slug" data-access="\${post.access}">\${post.slug}</li></ul></body></html>
`);
    await write(tmp, 'src/posts/pub.html', post('Pub'));
    await write(tmp, 'src/layouts/post.html', `<!doctype html>
<html lang="en"><head><title>\${title}</title></head>
<body><article>\${content}</article><footer id="acc">\${access.level}|\${access.page}</footer></body></html>
`);
    await write(tmp, 'src/posts/fr.html', `---
title: Fr
date: 2026-01-10
access: friends
layout: post
---
<p>Fr body</p>
`);
    await write(tmp, 'src/posts/pv.html', post('Pv', 'access: private\n'));
    await write(tmp, 'src/posts/typo.html', post('Typo', 'access: Friends\n'));
    await write(tmp, 'src/posts/mdfr.md', `---
title: Md Fr
date: 2026-01-09
access: friends
layout: post
---
markdown friends body
`);
    await fs.mkdir(path.join(tmp, 'src/media'), { recursive: true });
    await sharp({ create: { width: 4, height: 4, channels: 3, background: '#888' } }).jpeg().toFile(path.join(tmp, 'src/media/fr.jpg'));
    await write(tmp, 'src/media/pub.txt', 'public file');
  });

  after(() => fs.rm(tmp, { recursive: true, force: true }));

  const slugs = async () => {
    const home = await read(tmp, 'dist/index.html');
    return [...home.matchAll(/class="slug" data-access="([^"]*)">([^<]+)</g)].map(m => ({ slug: m[2], access: m[1] }));
  };

  test('public: restricted files are not copied, collected, fed or mapped; typo warns', async () => {
    const out = build(tmp, { COOK_ACCESS_LEVEL: 'public' });
    for (const rel of ['dist/posts/fr', 'dist/posts/pv', 'dist/posts/typo', 'dist/posts/mdfr', 'dist/media/fr.jpg']) {
      assert.equal(await exists(tmp, rel), false, `${rel} should not exist`);
    }
    assert.equal(await exists(tmp, 'dist/posts/pub/index.html'), true);
    assert.equal(await exists(tmp, 'dist/media/pub.txt'), true);
    assert.deepEqual((await slugs()).map(s => s.slug), ['pub']);
    assert.deepEqual((await slugs()).map(s => s.access), ['public']);
    assert.match(await read(tmp, 'dist/index.html'), /<p id="level">public<\/p>/);
    const feed = await read(tmp, 'dist/feed.xml');
    const sitemap = await read(tmp, 'dist/sitemap.xml');
    for (const xml of [feed, sitemap]) {
      assert.ok(xml.includes('/posts/pub'), 'pub listed');
      for (const s of ['fr', 'pv', 'typo', 'mdfr']) assert.ok(!xml.includes(`/posts/${s}`), `${s} leaked:\n${xml}`);
    }
    assert.match(out, /posts\/typo\.html/);
  });

  test('friends: friends pages present with access set; private and typo absent', async () => {
    build(tmp, { COOK_ACCESS_LEVEL: 'friends' });
    assert.equal(await exists(tmp, 'dist/posts/fr/index.html'), true);
    assert.equal(await exists(tmp, 'dist/posts/mdfr/index.html'), true);
    assert.equal(await exists(tmp, 'dist/media/fr.jpg'), true);
    assert.equal(await exists(tmp, 'dist/posts/pv'), false);
    assert.equal(await exists(tmp, 'dist/posts/typo'), false);
    const items = await slugs();
    assert.deepEqual(items.map(s => s.slug).sort(), ['fr', 'mdfr', 'pub']);
    assert.equal(items.find(s => s.slug === 'fr').access, 'friends');
    assert.equal(items.find(s => s.slug === 'mdfr').access, 'friends');
    assert.match(await read(tmp, 'dist/index.html'), /<p id="level">friends<\/p>/);
  });

  test('friends: a restricted page keeps the build level in access.level, its own in access.page', async () => {
    const html = await read(tmp, 'dist/posts/fr/index.html');
    assert.match(html, /<footer id="acc">friends\|friends<\/footer>/);
    assert.match(html, /Fr body/);
    const md = await read(tmp, 'dist/posts/mdfr/index.html');
    assert.match(md, /<footer id="acc">friends\|friends<\/footer>/);
    assert.match(md, /markdown friends body/);
  });

  test('private: everything present; the typo page is private', async () => {
    build(tmp, { COOK_ACCESS_LEVEL: 'private' });
    for (const rel of ['dist/posts/pub/index.html', 'dist/posts/fr/index.html', 'dist/posts/pv/index.html', 'dist/posts/typo/index.html', 'dist/posts/mdfr/index.html', 'dist/media/fr.jpg']) {
      assert.equal(await exists(tmp, rel), true, `${rel} should exist`);
    }
    const items = await slugs();
    assert.deepEqual(items.map(s => s.slug).sort(), ['fr', 'mdfr', 'pub', 'pv', 'typo']);
    assert.equal(items.find(s => s.slug === 'typo').access, 'private');
    // The build level is private; the pages are friends
    assert.match(await read(tmp, 'dist/posts/fr/index.html'), /<footer id="acc">private\|friends<\/footer>/);
    assert.match(await read(tmp, 'dist/posts/mdfr/index.html'), /<footer id="acc">private\|friends<\/footer>/);
  });

  test('dev single-page change to a restricted page does not build it', async () => {
    build(tmp, { COOK_ACCESS_LEVEL: 'public' });
    build(tmp, { COOK_ACCESS_LEVEL: 'public', NODE_ENV: 'development', DEV_CHANGED_PAGE: 'src/posts/pv.html' });
    assert.equal(await exists(tmp, 'dist/posts/pv'), false);
    assert.equal(await exists(tmp, 'dist/posts/pv.html'), false);
  });
});


// ============================================================================
// No access config: same output as the default spelled out (Ruling A)
// ============================================================================

describe('no access config', () => {
  let tmp;

  const snapshot = async (root) => {
    const out = {};
    const walk = async (dir) => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(abs);
        else out[path.relative(path.join(root, 'dist'), abs)] = createHash('sha256').update(await fs.readFile(abs)).digest('hex');
      }
    };
    await walk(path.join(root, 'dist'));
    return out;
  };

  const mainConfig = (access) => `export default {
  collections: { html: true },
  sitemap: { url: 'https://example.com' },
  formats: { feed: false, json: false, markdown: false, llmsTxt: false },
${access}};
`;

  before(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cook-access-none-'));
    await write(tmp, 'config/data.js', `export default { siteUrl: 'https://example.com', siteTitle: 'T' };\n`);
    await write(tmp, 'src/index.html', `<!doctype html>
<html lang="en"><head><title>Home</title></head>
<body><ul><li data-repeat="collections.posts as post">\${post.slug}</li></ul></body></html>
`);
    await write(tmp, 'src/posts/one.html', post('One'));
    await write(tmp, 'src/posts/two.md', `---\ntitle: Two\n---\ntwo body\n`);
    await write(tmp, 'src/media/a.txt', 'a');
  });

  after(() => fs.rm(tmp, { recursive: true, force: true }));

  test('identical file list and contents', async () => {
    await write(tmp, 'config/main.js', mainConfig(''));
    build(tmp);
    const without = await snapshot(tmp);
    await write(tmp, 'config/main.js', mainConfig(`  access: {
    levels: ['public', 'friends', 'private'],
    level: 'public',
    levelOf: ({ frontMatter }) => frontMatter?.access ?? 'public',
  },
`));
    build(tmp);
    const withDefault = await snapshot(tmp);
    assert.ok(Object.keys(without).includes('posts/one/index.html'));
    assert.deepEqual(withDefault, without);
  });
});
