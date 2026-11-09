/**
 * @file programs-build.test.js
 * @description End to end: program folders (src/<area>/<slug>/) ship byte for
 * byte through every build pass, and sandboxed programs get _headers rules.
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { programHeaders } from '../scripts/plugins/programs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOK = path.resolve(__dirname, '..', 'bin', 'cook.js');

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const SANDBOX = 'Content-Security-Policy: sandbox allow-scripts allow-forms allow-popups allow-pointer-lock allow-modals';

const tmps = [];
async function write(tmp, files) {
  for (const [rel, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(tmp, rel)), { recursive: true });
    await fs.writeFile(path.join(tmp, rel), content);
  }
}
async function build(tmp) {
  const r = spawnSync(process.execPath, [COOK, 'build'], {
    cwd: tmp, env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf-8',
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
}
async function walk(dir, base = dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p, base));
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out.sort();
}

const PROGRAM = {
  'index.html': '---\ntitle: x\n---\n<!doctype html><html><head><link rel="stylesheet" href="/demos/plasma/css/s.css"><script src="/demos/plasma/js/a.js"></script></head><body>${x}<div data-include="nav.html"></div><img src="a.png"><a href="/root">r</a></body></html>\n',
  'page two.html': '<!doctype html><html><body><p>two ${y}</p></body></html>\n',
  'README.md': '# Readme\n\nNot a page.\n',
  'css/s.css': 'body { background: url(/demos/plasma/a.png); }\n',
  'js/a.js': 'export const two = `${1+1}`;\n',
  'a.png': PNG,
  'é.txt': 'accent\n',
};

after(async () => { for (const t of tmps) await fs.rm(t, { recursive: true, force: true }); });

describe('program folders ship untouched', () => {
  let tmp;
  before(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cook-programs-'));
    tmps.push(tmp);
    const files = {
      'config/main.js': "export default { basePath: '/base', fingerprint: { enabled: true }, sitemap: { url: 'https://example.com' } };\n",
      'config/programs.json': JSON.stringify({
        areas: [{ path: 'demos', title: 'Demos' }, { path: 'apps', title: 'Apps' }],
        programs: [
          { area: 'demos', slug: 'plasma', title: 'Plasma', sandbox: true },
          { area: 'apps', slug: 'tool', title: 'Tool', listed: true },
        ],
      }),
      'src/index.html': '<!doctype html><html><head><title>Home</title><link rel="stylesheet" href="/site.css"></head><body><main><a href="/demos/">d</a></main></body></html>\n',
      'src/site.css': 'body { color: red; }\n',
      'src/demos.html': '<!doctype html><html><head><title>Demos</title></head><body><main><h1>Demos</h1></main></body></html>\n',
      'src/apps.html': '<!doctype html><html><head><title>Apps</title></head><body><main><h1>Apps</h1></main></body></html>\n',
      'src/_headers': '/*\n  X-Frame-Options: DENY\n',
      'src/apps/tool/index.html': '<!doctype html><html><body><p>${tool}</p></body></html>\n',
    };
    for (const [rel, c] of Object.entries(PROGRAM)) files[`src/demos/plasma/${rel}`] = c;
    await write(tmp, files);
    await build(tmp);
  });

  test('every program file equals its source byte for byte, none added', async () => {
    const srcFiles = await walk(path.join(tmp, 'src/demos/plasma'));
    const distFiles = await walk(path.join(tmp, 'dist/demos/plasma'));
    assert.deepEqual(distFiles, srcFiles);
    for (const rel of srcFiles) {
      const a = await fs.readFile(path.join(tmp, 'src/demos/plasma', rel));
      const b = await fs.readFile(path.join(tmp, 'dist/demos/plasma', rel));
      assert.ok(a.equals(b), `${rel} changed`);
    }
    assert.deepEqual(await walk(path.join(tmp, 'dist/apps/tool')), ['index.html']);
    assert.ok((await fs.readFile(path.join(tmp, 'src/apps/tool/index.html'))).equals(
      await fs.readFile(path.join(tmp, 'dist/apps/tool/index.html'))));
  });

  test('a page with a space in its name is not turned into a directory', async () => {
    await assert.rejects(fs.stat(path.join(tmp, 'dist/demos/plasma/page two')));
  });

  test('the sitemap lists no program URL', async () => {
    const xml = await fs.readFile(path.join(tmp, 'dist/sitemap.xml'), 'utf-8');
    assert.ok(xml.includes('https://example.com/demos'), 'area list page listed');
    assert.ok(!xml.includes('/demos/plasma'));
    assert.ok(!xml.includes('/apps/tool'));
  });

  test('no _fragment.html under a program', async () => {
    const all = [...await walk(path.join(tmp, 'dist/demos/plasma')), ...await walk(path.join(tmp, 'dist/apps/tool'))];
    assert.deepEqual(all.filter(f => f.endsWith('_fragment.html')), []);
  });

  test('the area list page is a built page', async () => {
    const html = await fs.readFile(path.join(tmp, 'dist/demos/index.html'), 'utf-8');
    assert.match(html, /<h1>Demos<\/h1>/);
    assert.match(html, /<title>Demos<\/title>/);
  });

  test('_headers keeps the site rule and adds only sandboxed programs', async () => {
    const h = await fs.readFile(path.join(tmp, 'dist/_headers'), 'utf-8');
    assert.ok(h.startsWith('/*\n  X-Frame-Options: DENY\n'), h);
    assert.ok(h.includes(`/demos/plasma/*\n  ${SANDBOX}`), h);
    assert.ok(!h.includes('/apps/tool'), h);
  });

  test('a second build with no sandbox and no src/_headers writes no _headers', async () => {
    await fs.rm(path.join(tmp, 'src/_headers'));
    await fs.writeFile(path.join(tmp, 'config/programs.json'), JSON.stringify({
      areas: [{ path: 'demos', title: 'Demos' }, { path: 'apps', title: 'Apps' }],
      programs: [{ area: 'demos', slug: 'plasma', title: 'Plasma' }],
    }));
    await fs.rm(path.join(tmp, 'dist'), { recursive: true, force: true });
    await build(tmp);
    await assert.rejects(fs.stat(path.join(tmp, 'dist/_headers')));
  });
});

describe('programHeaders', () => {
  const progs = [
    { area: 'demos', slug: 'a', sandbox: true },
    { area: 'apps', slug: 'b', sandbox: false },
    { area: 'demos', slug: 'c', sandbox: true },
  ];
  test('null when nothing is sandboxed', () => {
    assert.equal(programHeaders([{ area: 'a', slug: 'b', sandbox: false }], 'x'), null);
    assert.equal(programHeaders([], null), null);
  });
  test('existing text first, then one block per sandboxed program in order', () => {
    const out = programHeaders(progs, '/*\n  X: y\n');
    assert.ok(out.startsWith('/*\n  X: y\n\n/demos/a/*'));
    assert.ok(out.indexOf('/demos/a/*') < out.indexOf('/demos/c/*'));
    assert.ok(!out.includes('/apps/b'));
    assert.equal(out.split(SANDBOX).length - 1, 2);
  });
  test('no existing text', () => {
    assert.ok(programHeaders(progs, null).startsWith('/demos/a/*\n'));
  });
});
