/**
 * @file programs.test.js
 * @description Programs config: normalizePrograms, isInProgram, and the
 * programs / programAreas build data.
 */

import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { normalizePrograms, isInProgram, loadProgramAreas, RESERVED_AREAS } from '../scripts/plugins/programs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOK = path.resolve(__dirname, '..', 'bin', 'cook.js');

const card = (o = {}) => ({ area: 'demos', slug: 'plasma', title: 'Plasma', date: '2026-01-01', listed: true, ...o });
const norm = (raw, ctx = {}) => normalizePrograms(raw, { srcEntries: [], buildOnlyPaths: [], hasIndex: () => true, ...ctx });

describe('normalizePrograms', () => {
  test('keeps a valid area and card; sandbox inherits, card overrides', () => {
    const r = norm({ areas: [{ path: 'demos', title: 'Demos', sandbox: false }], programs: [card(), card({ slug: 'b', sandbox: true })] });
    assert.deepEqual(r.warnings, []);
    assert.equal(r.areas[0].path, 'demos');
    assert.equal(r.programs[0].url, '/demos/plasma/');
    assert.equal(r.programs[0].sandbox, false);
    assert.equal(r.programs[1].sandbox, true);
  });

  test('inherits sandbox true from the area', () => {
    const r = norm({ areas: [{ path: 'demos', title: 'D', sandbox: true }], programs: [card()] });
    assert.equal(r.programs[0].sandbox, true);
  });

  const bad = [
    ['Demos', {}],
    ['a/b', {}],
    ['media', {}],
    ['about', { srcEntries: ['about'] }],
    ['posts', { srcEntries: ['posts'] }],
    ['layouts', { buildOnlyPaths: ['layouts'] }],
    ['docs', { buildOnlyPaths: ['docs'] }],
  ];
  for (const [p, ctx] of bad) {
    test(`drops area ${p} with a warning naming it`, () => {
      const r = norm({ areas: [{ path: p, title: 'X' }] }, ctx);
      assert.equal(r.areas.length, 0);
      assert.equal(r.warnings.length, 1);
      assert.ok(r.warnings[0].includes(JSON.stringify(p)), r.warnings[0]);
    });
  }

  test('reserved areas list', () => {
    assert.deepEqual(RESERVED_AREAS, ['media', 'assets', 'layouts', 'includes']);
  });

  test('drops cards in an unknown area, with a bad slug, or duplicated', () => {
    const r = norm({
      areas: [{ path: 'demos', title: 'D' }],
      programs: [card({ area: 'nope' }), card({ slug: '../x' }), card(), card()],
    });
    assert.equal(r.programs.length, 1);
    assert.equal(r.warnings.length, 3);
    assert.ok(r.warnings.some(w => w.includes('nope/plasma')));
    assert.ok(r.warnings.some(w => w.includes('demos/../x')));
    assert.ok(r.warnings.some(w => w.includes('demos/plasma') && w.includes('duplicate')));
  });

  test('drops non-string tags', () => {
    const r = norm({ areas: [{ path: 'demos', title: 'D' }], programs: [card({ tags: ['a', 3, null, 'b'] })] });
    assert.deepEqual(r.programs[0].tags, ['a', 'b']);
  });

  test('keeps unlisted cards', () => {
    const r = norm({ areas: [{ path: 'demos', title: 'D' }], programs: [card({ listed: false })] });
    assert.equal(r.programs.length, 1);
  });
});

describe('isInProgram', () => {
  test('inside <area>/<sub>/ only', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cook-prog-unit-'));
    try {
      await fs.mkdir(path.join(tmp, 'config'));
      await fs.writeFile(path.join(tmp, 'config/programs.json'), JSON.stringify({ areas: [{ path: 'demos', title: 'D' }] }));
      const script = `import { loadProgramAreas, isInProgram } from ${JSON.stringify(path.resolve(__dirname, '../scripts/plugins/programs.js'))};
loadProgramAreas();
console.log(JSON.stringify(['demos/plasma/index.html','demos/plasma/js/a.js','demos/index.html','demosx/a/b.html','posts/a/index.html'].map(isInProgram)));`;
      const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: tmp, encoding: 'utf-8' });
      assert.equal(r.status, 0, r.stderr);
      assert.deepEqual(JSON.parse(r.stdout.trim().split('\n').pop()), [true, true, false, false, false]);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  test('false before any area is loaded', () => {
    assert.equal(typeof loadProgramAreas, 'function');
    assert.equal(isInProgram('demos/a/b.html'), false);
  });
});

const tmps = [];
after(async () => { for (const t of tmps) await fs.rm(t, { recursive: true, force: true }); });

describe('programs build data', () => {
  test('programAreas / programs list newest first; unlisted and index-less cards hidden', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cook-prog-'));
    tmps.push(tmp);
    const cards = [
      card({ slug: 'old', title: 'Old', date: '2026-01-01' }),
      card({ slug: 'new', title: 'New', date: '2026-03-01' }),
      card({ slug: 'ord2', title: 'A Two', date: '2026-02-01', order: 2 }),
      card({ slug: 'ord1', title: 'Z One', date: '2026-02-01', order: 1 }),
      card({ slug: 'hidden', title: 'Hidden', listed: false }),
      card({ slug: 'empty', title: 'Empty', date: '2026-05-01' }),
    ];
    const files = {
      'config/main.js': 'export default {};\n',
      'config/programs.json': JSON.stringify({ areas: [{ path: 'demos', title: 'Demos', sandbox: false }], programs: cards }),
      'src/demos.html': '<!doctype html><html><head><title>D</title></head><body><ul>\n<li data-repeat="programAreas.demos as p"><a href="${p.url}">${p.title}</a></li>\n</ul><p id="all">${programs.length}</p></body></html>\n',
      'src/demos/old/index.html': '<p>old</p>',
      'src/demos/new/index.html': '<p>new</p>',
      'src/demos/ord1/index.html': '<p>1</p>',
      'src/demos/ord2/index.html': '<p>2</p>',
      'src/demos/hidden/index.html': '<p>hidden</p>',
      'src/demos/empty/readme.txt': 'no index',
    };
    for (const [rel, content] of Object.entries(files)) {
      await fs.mkdir(path.dirname(path.join(tmp, rel)), { recursive: true });
      await fs.writeFile(path.join(tmp, rel), content);
    }
    const r = spawnSync(process.execPath, [COOK, 'build'], { cwd: tmp, env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf-8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const html = await fs.readFile(path.join(tmp, 'dist/demos/index.html'), 'utf-8');
    const { document } = parseHTML(html);
    const lis = [...document.querySelectorAll('li')];
    assert.equal(lis.length, 4, html);
    assert.deepEqual(lis.map(l => l.textContent.trim()), ['New', 'Z One', 'A Two', 'Old']);
    assert.equal(lis[0].querySelector('a').getAttribute('href'), '/demos/new/');
    assert.equal(document.querySelector('#all').textContent, '4');
  });
});

describe('programs area collisions (build level)', () => {
  const list = '<!doctype html><html><head><title>D</title></head><body><ul>\n<li data-repeat="programAreas.AREA as p"><a href="${p.url}">${p.title}</a></li>\n</ul></body></html>\n';
  async function build(files, area) {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cook-prog-'));
    tmps.push(tmp);
    const all = {
      'config/main.js': 'export default {};\n',
      'config/programs.json': JSON.stringify({ areas: [{ path: area, title: 'A' }], programs: [card({ area, slug: 'one', title: 'One' })] }),
      [`src/${area}.html`]: list.replace('AREA', area),
      ...files,
    };
    for (const [rel, content] of Object.entries(all)) {
      await fs.mkdir(path.dirname(path.join(tmp, rel)), { recursive: true });
      await fs.writeFile(path.join(tmp, rel), content);
    }
    const r = spawnSync(process.execPath, [COOK, 'build'], { cwd: tmp, env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf-8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const html = await fs.readFile(path.join(tmp, `dist/${area}/index.html`), 'utf-8');
    return { out: r.stdout + r.stderr, items: parseHTML(html).document.querySelectorAll('li a[href^="/"]').length };
  }
  const prog = { 'src/blog/one/index.html': '<p>x</p>' };

  for (const [name, extra] of [['.html', 'x.html'], ['.md', 'x.md']]) {
    test(`folder with its own ${name} page collides`, async () => {
      const r = await build({ ...prog, [`src/blog/${extra}`]: 'page' }, 'blog');
      assert.match(r.out, /\[programs\] area "blog" ignored/);
      assert.equal(r.items, 0);
    });
  }

  test('folder with only index.html and programs is accepted', async () => {
    const r = await build({ ...prog, 'src/blog/index.html': '<p>area page</p>' }, 'blog');
    assert.doesNotMatch(r.out, /\[programs\]/);
    assert.equal(r.items, 1);
  });

  for (const ext of ['html', 'md']) {
    test(`list page .${ext} alone (no folder yet) is accepted with an empty list`, async () => {
      const r = await build(ext === 'html' ? {} : { 'src/blog.md': '# list' }, 'blog');
      assert.doesNotMatch(r.out, /\[programs\]/);
      assert.equal(r.items, 0);
    });
  }
});
