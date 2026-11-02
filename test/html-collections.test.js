/**
 * @file html-collections.test.js
 * @description HTML pages with YAML front matter join collections (opt-in).
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import htmlCollections, {
  htmlCollectionName,
  htmlPageUrl,
  htmlPageData,
} from '../scripts/plugins/html-collections.js';

const page = (fm, body = '<p>x</p>') => `---\n${fm}\n---\n${body}`;

describe('htmlCollectionName', () => {
  test('first folder under the served root', () => {
    assert.equal(htmlCollectionName('posts/a.html'), 'posts');
    assert.equal(htmlCollectionName('posts/2026/a.html'), 'posts');
  });
  test('files at the served root belong to no collection', () => {
    assert.equal(htmlCollectionName('about.html'), null);
  });
  test('siteRoot: grouped under the served subfolder, outside is ignored', () => {
    assert.equal(htmlCollectionName('pages/posts/a.html', 'pages'), 'posts');
    assert.equal(htmlCollectionName('pages/about.html', 'pages'), null);
    assert.equal(htmlCollectionName('assets/x.html', 'pages'), null);
  });
});

describe('htmlPageUrl', () => {
  test('pages become directories', () => {
    assert.equal(htmlPageUrl('posts/a.html', {}), '/posts/a/');
    assert.equal(htmlPageUrl('posts/index.html', {}), '/posts/');
    assert.equal(htmlPageUrl('index.html', {}), '/');
  });
  test('directory conversion disabled or excluded keeps .html', () => {
    assert.equal(htmlPageUrl('posts/a.html', { convertDisabled: true }), '/posts/a.html');
    assert.equal(htmlPageUrl('posts/a.html', { convertExcluded: true }), '/posts/a.html');
  });
  test('siteRoot is stripped; outside it there is no URL', () => {
    assert.equal(htmlPageUrl('pages/posts/a.html', { siteRoot: 'pages' }), '/posts/a/');
    assert.equal(htmlPageUrl('assets/x.html', { siteRoot: 'pages' }), null);
  });
});

describe('htmlPageData', () => {
  test('date variants normalize to YYYY-MM-DD with a sortable Date', () => {
    for (const date of [new Date('2026-11-01'), '2026-11-01', '2026-11-01T09:00:00Z']) {
      const d = htmlPageData('posts/a.html', { date }, {});
      assert.equal(d.date, '2026-11-01', `for ${date}`);
      assert.ok(d._dateSort instanceof Date && !isNaN(d._dateSort));
    }
  });
  test('missing date is null', () => {
    const d = htmlPageData('posts/a.html', {}, {});
    assert.equal(d.date, null);
    assert.equal(d._dateSort, null);
  });
  test('title falls back to the file name; slug from file or folder', () => {
    const d = htmlPageData('posts/hello-world.html', {}, {});
    assert.equal(d.title, 'Hello World');
    assert.equal(d.slug, 'hello-world');
    assert.equal(htmlPageData('posts/my-post/index.html', {}, {}).slug, 'my-post');
  });
  test('front matter fields are kept; collection and url set', () => {
    const d = htmlPageData('posts/a.html', { title: 'A', tags: ['x'] }, {});
    assert.equal(d.title, 'A');
    assert.deepEqual(d.tags, ['x']);
    assert.equal(d.collection, 'posts');
    assert.equal(d.url, '/posts/a/');
  });
});

describe('htmlCollections plugin', () => {
  let src;
  const write = async (rel, content) => {
    await fs.mkdir(path.dirname(path.join(src, rel)), { recursive: true });
    await fs.writeFile(path.join(src, rel), content);
  };
  const quiet = async (fn) => {
    // Only console.* is silenced: stubbing process.stdout.write would also
    // swallow the test runner's own result stream
    const warn = console.warn, log = console.log;
    const warnings = [];
    console.warn = (...a) => warnings.push(a.join(' '));
    console.log = () => {};
    try { await fn(); } finally { console.warn = warn; console.log = log; }
    return warnings;
  };

  before(async () => {
    src = await fs.mkdtemp(path.join(os.tmpdir(), 'cook-htmlcol-src-'));
    await write('posts/old.html', page('title: Old\ndate: 2026-01-01'));
    await write('posts/new.html', page('title: New\ndate: 2026-06-01\ntags: [a]'));
    await write('posts/draft.html', page('title: Draft\ndate: 2026-07-01\ndraft: true'));
    await write('posts/plain.html', '<p>no front matter</p>');
    await write('posts/bad.html', page('title: [unclosed'));
    await write('layouts/post.html', page('title: Layout'));
    await write('index.html', page('title: Home'));
  });
  after(() => fs.rm(src, { recursive: true, force: true }));

  const opts = (extra = {}) => ({ srcPath: src, distPath: 'dist', siteRoot: '', enabled: true, buildOnlyPaths: ['layouts'], excludePaths: [], ...extra });

  test('collects front-matter pages, newest first, skipping drafts, bad YAML, build-only dirs', async () => {
    const store = {}, data = {};
    const warnings = await quiet(() => htmlCollections({ store, data, ...opts() }));
    assert.deepEqual(store.collections.posts.map(i => i.title), ['New', 'Old']);
    assert.equal(data.collections, store.collections);
    const item = store.collections.posts[0];
    assert.deepEqual(item.tags, ['a']);
    assert.equal(item.url, '/posts/new/');
    assert.ok(!('content' in item));
    assert.ok(!store.collections.layouts, 'buildOnlyPaths skipped');
    assert.ok(warnings.some(w => w.includes('bad.html')), 'malformed front matter warns with the file name');
  });

  test('disabled: collections untouched', async () => {
    const store = {}, data = {};
    await quiet(() => htmlCollections({ store, data, ...opts({ enabled: false }) }));
    assert.equal(store.collections, undefined);
    assert.equal(data.collections, undefined);
  });

  test('merges into existing (markdown) collections and re-sorts', async () => {
    const store = { collections: { posts: [{ title: 'Md', _dateSort: new Date('2026-03-01') }] } }, data = {};
    await quiet(() => htmlCollections({ store, data, ...opts() }));
    assert.deepEqual(store.collections.posts.map(i => i.title), ['New', 'Md', 'Old']);
  });

  test('excludePaths are matched against the dist path', async () => {
    const store = {}, data = {};
    await quiet(() => htmlCollections({ store, data, ...opts({ excludePaths: [/dist\/posts\/old/] }) }));
    assert.deepEqual(store.collections.posts.map(i => i.title), ['New']);
  });

  test('siteRoot: pages under the served root are grouped by their first folder there', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cook-htmlcol-sr-'));
    await fs.mkdir(path.join(root, 'pages/posts'), { recursive: true });
    await fs.mkdir(path.join(root, 'assets'), { recursive: true });
    await fs.writeFile(path.join(root, 'pages/posts/a.html'), page('title: A'));
    await fs.writeFile(path.join(root, 'assets/x.html'), page('title: X'));
    const store = {}, data = {};
    await quiet(() => htmlCollections({ store, data, ...opts({ srcPath: root, siteRoot: 'pages' }) }));
    assert.deepEqual(Object.keys(store.collections), ['posts']);
    assert.equal(store.collections.posts[0].url, '/posts/a/');
    await fs.rm(root, { recursive: true, force: true });
  });
});
