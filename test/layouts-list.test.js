/**
 * @file layouts-list.test.js
 * @description Tests listLayouts / loadSiteNames and the cook-ssg/layouts export.
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { listLayouts, loadSiteNames } from '../scripts/utils/layouts/list.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmps = [];

export async function makeSite(files) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cook-layouts-'));
  tmps.push(tmp);
  for (const [rel, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(tmp, rel)), { recursive: true });
    await fs.writeFile(path.join(tmp, rel), content);
  }
  return tmp;
}
after(() => Promise.all(tmps.map(t => fs.rm(t, { recursive: true, force: true }))));

const info = (obj) => `<script type="application/json" data-layout-info>${JSON.stringify({ format: 1, ...obj })}</script>`;
const baseLayout = (extra = '') => `<!doctype html>
<html lang="en">
<head>
${info({ label: 'Base', abstract: true })}
<title>\${title}</title>
</head>
<body>
<main>\${content}</main>
${extra}
</body>
</html>
`;
const childOf = (parent, body = '<h1>${siteTitle}</h1>${content}') => `<body data-template="${parent}">
${info({ label: 'Post', slots: { aside: { label: 'Sidebar' } } })}
<article>${body}</article>
<template slot="aside">\${slot:aside}</template>
</body>
`;

describe('listLayouts', () => {
  let site;
  before(async () => {
    site = await makeSite({
      'config/data.js': "export default { siteTitle: 'S', links: [] };\n",
      'src/layouts/base.html': baseLayout(),
      'src/layouts/post.html': childOf('base', '<h1>${siteTitle}</h1><ul data-repeat="links as l"><li><a href="${l.href}">${l.label}</a></li></ul>${content}'),
      'src/layouts/orphan.html': childOf('nope'),
      'src/layouts/a.html': childOf('b'),
      'src/layouts/b.html': childOf('a'),
      'src/layouts/old.html': '<html><body><h1>${title}</h1>${slot:side}${content}</body></html>',
      'src/layouts/folder/index.html': baseLayout(),
    });
  });

  test('resolves chains and accepts site data and lists', async () => {
    const { layouts } = await listLayouts(site);
    const by = Object.fromEntries(layouts.map(l => [l.name, l]));
    assert.deepEqual(layouts.map(l => l.name), ['a', 'b', 'base', 'folder', 'old', 'orphan', 'post']);
    assert.deepEqual(by.post.chain, ['post', 'base']);
    assert.deepEqual(by.post.problems, []);
    assert.equal(by.post.editable, true);
    assert.equal(by.post.label, 'Post');
    assert.deepEqual(by.post.slots, [{ name: 'aside', label: 'Sidebar' }]);
    assert.equal(by.base.abstract, true);
    assert.equal(by.folder.file, 'folder/index.html');
  });

  test('a missing parent is a problem and not editable', async () => {
    const { layouts } = await listLayouts(site);
    const orphan = layouts.find(l => l.name === 'orphan');
    assert.ok(orphan.problems.some(p => p.message === 'parent layout "nope" not found'));
    assert.equal(orphan.editable, false);
    assert.equal(orphan.ok, false);
  });

  test('a cycle names its chain', async () => {
    const { layouts } = await listLayouts(site);
    const a = layouts.find(l => l.name === 'a');
    assert.ok(a.problems.some(p => p.message.includes('a → b → a')), JSON.stringify(a.problems));
    assert.equal(a.editable, false);
    assert.equal(a.ok, false);
  });

  test('plain layouts keep their scanned slots and are not editable', async () => {
    const { layouts } = await listLayouts(site);
    const old = layouts.find(l => l.name === 'old');
    assert.equal(old.kind, 'plain');
    assert.equal(old.label, 'old');
    assert.deepEqual(old.slots, [{ name: 'side', label: 'side' }]);
    assert.equal(old.editable, false);
    assert.deepEqual(old.problems, []);
  });

  test('config/main.js layouts.fields adds known fields', async () => {
    const files = {
      'config/main.js': "export default { layouts: { fields: ['ogImage'] } };\n",
      'src/layouts/base.html': baseLayout('<footer><p>${ogImage}</p></footer>'),
    };
    const withField = await makeSite(files);
    assert.equal((await listLayouts(withField)).layouts[0].ok, true);
    const without = await makeSite({ 'src/layouts/base.html': files['src/layouts/base.html'] });
    const entry = (await listLayouts(without)).layouts[0];
    assert.equal(entry.ok, false);
    assert.ok(entry.problems.some(p => p.message.includes('unknown field "ogImage"')));
  });

  test('includes are checked only with the layout-fragment marker', async () => {
    const tmp = await makeSite({
      'src/includes/plain.html': '<p>hello ${anything}</p>\n',
      'src/includes/good.html': '<!-- layout-fragment -->\n<footer><p>${title}</p></footer>\n',
      'src/includes/bad.html': '\n<!-- layout-fragment -->\n<footer><p>${nope}</p></footer>\n',
    });
    const { includes } = await listLayouts(tmp);
    const by = Object.fromEntries(includes.map(i => [i.name, i]));
    assert.deepEqual(by.plain, { name: 'plain', file: 'plain.html', ok: false, problems: [] });
    assert.equal(by.good.ok, true);
    assert.equal(by.bad.ok, false);
    assert.match(by.bad.problems[0].message, /unknown field "nope"/);
  });
});

test('a plain layout with a missing parent has no problem', async () => {
  const tmp = await makeSite({ 'src/layouts/p.html': '<html data-template="gone"><body>${content}</body></html>' });
  const { layouts } = await listLayouts(tmp);
  assert.equal(layouts[0].kind, 'plain');
  assert.deepEqual(layouts[0].problems, []);
});

test('data.js edits are picked up between calls', async () => {
  const tmp = await makeSite({
    'config/data.js': "export default { one: 1 };\n",
    'src/layouts/base.html': baseLayout('<footer><p>${two}</p></footer>'),
  });
  assert.equal((await listLayouts(tmp)).layouts[0].ok, false);
  await new Promise(r => setTimeout(r, 20));
  await fs.writeFile(path.join(tmp, 'config/data.js'), "export default { one: 1, two: 2 };\n");
  assert.equal((await listLayouts(tmp)).layouts[0].ok, true);
});

describe('loadSiteNames', () => {
  test('reads data.js keys, array lists, function exports', async () => {
    const tmp = await makeSite({
      'config/data.js': "export default async () => ({ siteTitle: 'S', links: [], nav: [1] });\n",
    });
    const names = await loadSiteNames(tmp);
    assert.deepEqual(names.fields.sort(), ['links', 'nav', 'siteTitle']);
    assert.deepEqual(names.lists.sort(), ['links', 'nav', 'programAreas', 'programs']);
  });

  test('never throws; a throwing config becomes a problem on the first layout', async () => {
    const tmp = await makeSite({
      'config/data.js': "throw new Error('boom');\n",
      'src/layouts/old.html': '<html><body>${content}</body></html>',
    });
    const names = await loadSiteNames(tmp);
    assert.deepEqual(names.fields, []);
    const { layouts, problems } = await listLayouts(tmp);
    assert.equal(problems[0].file, 'config/data.js');
    assert.match(problems[0].message, /config\/data\.js.*boom/);
    assert.deepEqual(layouts[0].problems, []);
    const empty = await loadSiteNames(path.join(tmp, 'nowhere'));
    assert.deepEqual(empty.fields, []);
  });
});

describe('cook-ssg/layouts export', () => {
  test('resolves through the package export', async () => {
    const require = createRequire(path.join(ROOT, 'package.json'));
    const url = pathToFileURL(require.resolve('cook-ssg/layouts')).href;
    const mod = await import(url);
    assert.equal(mod.FORMAT, 1);
    for (const name of ['checkLayout', 'listLayouts', 'loadSiteNames']) assert.equal(typeof mod[name], 'function');
    assert.ok(mod.PAGE_LAYOUTS.includes('sidebar-left'));
    assert.ok(mod.DOCUMENT_FIELDS.includes('title'));
  });
});
