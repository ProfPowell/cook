/**
 * @file social-links-build.test.js
 * @description End to end: `<social-links>` is filled at build from config/social.json.
 */

import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOK = path.resolve(__dirname, '..', 'bin', 'cook.js');

const tmps = [];
after(async () => { for (const t of tmps) await fs.rm(t, { recursive: true, force: true }); });

async function site(files) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cook-social-'));
  tmps.push(tmp);
  for (const [rel, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(tmp, rel)), { recursive: true });
    await fs.writeFile(path.join(tmp, rel), content);
  }
  const r = spawnSync(process.execPath, [COOK, 'build'], {
    cwd: tmp, env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf-8',
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return { tmp, out: r.stdout + r.stderr };
}
const read = (tmp, rel) => fs.readFile(path.join(tmp, 'dist', rel), 'utf-8');
const page = (body) => `<!doctype html><html><head><title>T</title></head><body>${body}</body></html>\n`;
const social = (accounts) => JSON.stringify({ accounts });

describe('<social-links> fill', () => {
  test('a layout footer and a post both get the list, in config order', async () => {
    const { tmp } = await site({
      'config/social.json': social([
        { service: 'github', handle: 'ProfPowell' },
        { service: 'bluesky', handle: 'tpowell.bsky.social' },
      ]),
      'src/layouts/default.html': page('<main data-slot="content"></main><footer><social-links></social-links></footer>'),
      'src/index.html': page('<social-links></social-links>'),
      'src/blog/post.md': '---\ntitle: Post\nlayout: default\n---\nHello\n',
    });
    for (const rel of ['index.html', 'blog/post/index.html']) {
      const html = await read(tmp, rel);
      const gh = html.indexOf('https://github.com/ProfPowell');
      const bs = html.indexOf('https://bsky.app/profile/tpowell.bsky.social');
      assert.ok(gh > -1 && bs > gh, `${rel}: ${html}`);
      assert.match(html, /<social-links><ul><li><a href="https:\/\/github\.com\/ProfPowell"/);
    }
  });

  test('a hidden account is absent from the list but counted in allAccounts', async () => {
    const { tmp } = await site({
      'config/social.json': social([
        { service: 'github', handle: 'ProfPowell' },
        { service: 'bluesky', handle: 'tpowell.bsky.social', hidden: true },
      ]),
      'src/index.html': page('<social-links></social-links><p id="n">${social.allAccounts.length}/${social.accounts.length}</p>'),
    });
    const html = await read(tmp, 'index.html');
    assert.ok(!html.includes('bsky.app'));
    assert.ok(html.includes('github.com/ProfPowell'));
    assert.match(html, /<p id="n">2\/1<\/p>/);
  });

  test('a hand-filled element is left alone', async () => {
    const { tmp } = await site({
      'config/social.json': social([{ service: 'github', handle: 'ProfPowell' }]),
      'src/index.html': page('<social-links><ul><li>x</li></ul></social-links>'),
    });
    const html = await read(tmp, 'index.html');
    assert.ok(html.includes('<social-links><ul><li>x</li></ul></social-links>'));
    assert.ok(!html.includes('github.com'));
  });

  test('an element inside pre is left alone', async () => {
    const { tmp } = await site({
      'config/social.json': social([{ service: 'github', handle: 'ProfPowell' }]),
      'src/index.html': page('<pre><social-links></social-links></pre>'),
    });
    const html = await read(tmp, 'index.html');
    assert.ok(html.includes('<pre><social-links></social-links></pre>'));
  });

  test('no config: the element builds empty and the build succeeds', async () => {
    const { tmp } = await site({ 'src/index.html': page('<social-links></social-links>') });
    assert.ok((await read(tmp, 'index.html')).includes('<social-links></social-links>'));
  });

  test('a bad entry and bad JSON warn with [social]; valid entries still render', async () => {
    const a = await site({
      'config/social.json': social([
        { service: 'myspace', handle: 'x' },
        { service: 'github', handle: 'ProfPowell' },
      ]),
      'src/index.html': page('<social-links></social-links>'),
    });
    assert.match(a.out, /\[social\].*myspace/);
    assert.ok((await read(a.tmp, 'index.html')).includes('github.com/ProfPowell'));

    const b = await site({
      'config/social.json': '{ nope',
      'src/index.html': page('<social-links></social-links>'),
    });
    assert.match(b.out, /\[social\]/);
    assert.ok((await read(b.tmp, 'index.html')).includes('<social-links></social-links>'));
  });

  test('config/main.js social wins over config/social.json', async () => {
    const { tmp } = await site({
      'config/main.js': "export default { social: { accounts: [{ service: 'github', handle: 'fromMain' }] } };\n",
      'config/social.json': social([{ service: 'github', handle: 'fromJson' }]),
      'src/index.html': page('<social-links></social-links>'),
    });
    const html = await read(tmp, 'index.html');
    assert.ok(html.includes('fromMain') && !html.includes('fromJson'));
  });
});
