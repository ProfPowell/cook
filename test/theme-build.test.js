/**
 * @file theme-build.test.js
 * @description End to end: the theme plugin writes data-theme / data-mode and
 * theme stylesheet links from main.js or config/theme.json.
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOK = path.resolve(__dirname, '..', 'bin', 'cook.js');

const S = { name: 'swiss', mode: 'auto', adjust: 'vp-site', modes: { 'retro-mine': 'light' },
  files: { swiss: '/v/themes/swiss.css', '8bit': '/v/themes/8bit.css', 'vp-site': '/assets/themes/vp-site.css', 'retro-mine': '/assets/themes/retro-mine.css' } };

const LINKS = '<link rel="stylesheet" href="/v/vanilla-breeze.css"><link rel="stylesheet" href="/site.css">';
const page = (fm, body = '<main><p>x</p></main>', links = LINKS) =>
  `${fm ? `---\n${fm}\n---\n` : ''}<!doctype html>\n<html lang="en"><head><title>T</title>${links}</head>\n<body>${body}</body></html>\n`;

const tmps = [];
async function project(files) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cook-theme-'));
  tmps.push(tmp);
  for (const [rel, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(tmp, rel)), { recursive: true });
    await fs.writeFile(path.join(tmp, rel), content);
  }
  const r = spawnSync(process.execPath, [COOK, 'build'], {
    cwd: tmp, env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf-8',
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const doc = async (rel) => parseHTML(await fs.readFile(path.join(tmp, rel), 'utf-8')).document;
  return { tmp, doc, output: r.stdout + r.stderr };
}
const hrefs = (d) => [...d.querySelectorAll('link[rel=stylesheet]')].map(l => l.getAttribute('href'));

after(async () => { for (const t of tmps) await fs.rm(t, { recursive: true, force: true }); });

describe('config/theme.json', () => {
  let A;
  before(async () => {
    A = await project({
      'config/main.js': 'export default {};\n',
      'config/theme.json': JSON.stringify(S),
      'src/plain.html': page(''),
      'src/own.html': page('theme: 8bit'),
      'src/art.html': page('theme: retro-mine\nthemeScope: article', '<header>H</header><main><article><p>x</p></article></main>'),
      'src/bad.html': page('theme: "Retro!"'),
      'src/nolink.html': page('', '<main><p>x</p></main>', ''),
    });
  });

  test('plain page: site ids, source, links right after the VB stylesheet', async () => {
    const d = await A.doc('dist/plain/index.html');
    assert.equal(d.documentElement.getAttribute('data-theme'), 'swiss vp-site');
    assert.equal(d.documentElement.getAttribute('data-theme-source'), 'site');
    assert.equal(d.documentElement.hasAttribute('data-mode'), false);
    assert.deepEqual(hrefs(d), ['/v/vanilla-breeze.css', '/v/themes/swiss.css', '/assets/themes/vp-site.css', '/site.css']);
    assert.equal(d.querySelector('link[href="/v/themes/swiss.css"]').getAttribute('data-vb-theme'), 'swiss');
  });

  test('own theme, page scope: 8bit only', async () => {
    const d = await A.doc('dist/own/index.html');
    assert.equal(d.documentElement.getAttribute('data-theme'), '8bit');
    assert.deepEqual(hrefs(d), ['/v/vanilla-breeze.css', '/v/themes/8bit.css', '/site.css']);
  });

  test('article scope: article carries retro-mine and data-mode light', async () => {
    const d = await A.doc('dist/art/index.html');
    assert.equal(d.documentElement.getAttribute('data-theme'), 'swiss vp-site');
    assert.equal(d.querySelector('article').getAttribute('data-theme'), 'retro-mine');
    assert.equal(d.querySelector('article').getAttribute('data-mode'), 'light');
    assert.equal(d.querySelector('header').hasAttribute('data-theme'), false);
    assert.deepEqual(hrefs(d), ['/v/vanilla-breeze.css', '/v/themes/swiss.css', '/assets/themes/vp-site.css', '/assets/themes/retro-mine.css', '/site.css']);
  });

  test('bad front matter: site theme and a [theme] warning naming the page', async () => {
    assert.equal((await A.doc('dist/bad/index.html')).documentElement.getAttribute('data-theme'), 'swiss vp-site');
    assert.match(A.output, /\[theme\].*dist\/bad\/index\.html.*Retro!/);
  });

  test('no VB stylesheet: links appended to head', async () => {
    const d = await A.doc('dist/nolink/index.html');
    assert.deepEqual(hrefs(d), ['/v/themes/swiss.css', '/assets/themes/vp-site.css']);
    assert.equal(d.querySelector('head').lastElementChild.getAttribute('href'), '/assets/themes/vp-site.css');
  });
});

describe('main.js wins', () => {
  test('main.js theme over theme.json: no files, no links', async () => {
    const B = await project({
      'config/main.js': `export default { theme: { name: 'classic', mode: 'dark' } };\n`,
      'config/theme.json': JSON.stringify(S),
      'src/plain.html': page(''),
    });
    const d = await B.doc('dist/plain/index.html');
    assert.equal(d.documentElement.getAttribute('data-theme'), 'classic');
    assert.equal(d.documentElement.getAttribute('data-mode'), 'dark');
    assert.equal(d.querySelectorAll('link[data-vb-theme]').length, 0);
  });
});

describe('no setting', () => {
  test('no setting: output unchanged', async () => {
    const C = await project({
      'config/main.js': 'export default {};\n',
      'src/plain.html': page('theme: 8bit'),
    });
    const html = await fs.readFile(path.join(C.tmp, 'dist/plain/index.html'), 'utf-8');
    assert.doesNotMatch(html, /data-theme/);
    assert.doesNotMatch(html, /data-vb-theme/);
  });
});
