/**
 * @file socialspec-build.test.js
 * @description End to end: SocialSpec files and `_headers` blocks written at build.
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
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cook-socialspec-'));
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
const exists = (tmp, rel) => fs.access(path.join(tmp, 'dist', rel)).then(() => true, () => false);
const page = (body) => `<!doctype html><html><head><title>T</title></head><body>${body}</body></html>\n`;

const mainJs = (extra = '') => `export default { formats: { feed: { title: 'F' } }, ${extra} };\n`;
const FULL = {
  about: { summary: 'Hi: there', body: 'Hello [me](/about/)' },
  contact: { name: 'Ada', email: 'ada@example.com' },
  following: [
    { title: 'A & B', feedUrl: 'https://a.example/feed.xml', siteUrl: 'https://a.example/' },
    { title: 'Hidden', feedUrl: 'https://h.example/feed.xml', public: false },
  ],
};
const base = {
  'src/index.html': page('<p>hi</p>'),
  'config/data.js': "export default { siteUrl: 'https://me.example', siteTitle: 'Me' };\n",
  'config/main.js': mainJs(),
};

describe('SocialSpec files', () => {
  test('writes the three files and exact _headers blocks', async () => {
    const { tmp, out } = await site({ ...base, 'config/social.json': JSON.stringify(FULL) });
    assert.doesNotMatch(out, /\[social\]/);
    const opml = await read(tmp, '.well-known/following.opml');
    assert.match(opml, /<title>Me follows<\/title>/);
    assert.match(opml, /xmlUrl="https:\/\/a\.example\/feed\.xml"/);
    assert.match(opml, /A &amp; B/);
    assert.doesNotMatch(opml, /Hidden/);
    const about = await read(tmp, '.well-known/about.md');
    assert.match(about, /\]\(https:\/\/me\.example\/about\/\)/);
    assert.match(await read(tmp, '.well-known/contact.vcf'), /FN:Ada\r\n/);
    const h = await read(tmp, '_headers');
    for (const [f, t] of [['following.opml', 'text/x-opml'], ['about.md', 'text/markdown'], ['contact.vcf', 'text/vcard']]) {
      assert.ok(h.includes(`/.well-known/${f}\n  Content-Type: ${t}; charset=utf-8\n  Access-Control-Allow-Origin: *\n`), f);
    }
  });

  test('siteRoot puts files and _headers under it', async () => {
    const { tmp } = await site({
      ...base,
      'config/main.js': mainJs("siteRoot: 'pages'"),
      'src/pages/index.html': page('<p>hi</p>'),
      'config/social.json': JSON.stringify(FULL),
    });
    const found = [];
    async function walk(d) {
      for (const e of await fs.readdir(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) await walk(p); else found.push(path.relative(path.join(tmp, 'dist'), p));
      }
    }
    await walk(path.join(tmp, 'dist'));
    assert.ok(found.includes('pages/.well-known/contact.vcf'), found.join(','));
    assert.ok(found.includes('pages/_headers'), found.join(','));
  });

  test('only files written get _headers blocks; the user own lines are kept', async () => {
    const { tmp } = await site({
      ...base,
      'src/_headers': '/*\n  X-Mine: 1\n',
      'config/social.json': JSON.stringify({ contact: { name: 'Ada' } }),
    });
    const h = await read(tmp, '_headers');
    assert.ok(h.startsWith('/*\n  X-Mine: 1\n'));
    assert.ok(h.includes('/.well-known/contact.vcf'));
    assert.ok(!h.includes('about.md') && !h.includes('following.opml'));
    assert.equal(await exists(tmp, '.well-known/about.md'), false);
  });

  test('programs and SocialSpec blocks coexist with the user lines', async () => {
    const { tmp } = await site({
      ...base,
      'src/_headers': '/*\n  X-Mine: 1\n',
      'config/programs.json': JSON.stringify({ areas: [{ path: 'apps', title: 'Apps' }], programs: [{ area: 'apps', slug: 'demo', title: 'Demo', sandbox: true }] }),
      'src/apps/demo/index.html': page('x'),
      'config/social.json': JSON.stringify({ contact: { name: 'Ada' } }),
    });
    const h = await read(tmp, '_headers');
    assert.ok(h.startsWith('/*\n  X-Mine: 1\n'));
    assert.match(h, /\/apps\/demo\/\*/);
    assert.match(h, /\/\.well-known\/contact\.vcf/);
    assert.ok(h.indexOf('/apps/demo/*') < h.indexOf('/.well-known/contact.vcf'));
  });

  test('${social.aboutHtml} renders on a page, from body and from about.file', async () => {
    const a = await site({
      ...base,
      'config/social.json': JSON.stringify({ about: { body: 'Hello **world**' } }),
      'src/about.html': page('<div>${social.aboutHtml}</div>'),
    });
    assert.match(await read(a.tmp, 'about/index.html'), /<strong>world<\/strong>/);
    const b = await site({
      ...base,
      'config/social.json': JSON.stringify({ about: { file: 'content/about.md' } }),
      'content/about.md': 'From *file*',
      'src/about.html': page('<div>${social.aboutHtml}</div>'),
    });
    assert.match(await read(b.tmp, 'about/index.html'), /<em>file<\/em>/);
    assert.match(await read(b.tmp, '.well-known/about.md'), /From \*file\*/);
  });

  test('about.body wins over about.file, in the file and in aboutHtml', async () => {
    const { tmp } = await site({
      ...base,
      'config/social.json': JSON.stringify({ about: { body: 'From **body**', file: 'content/about.md' } }),
      'content/about.md': 'From *file*',
      'src/about.html': page('<div>${social.aboutHtml}</div>'),
    });
    const md = await read(tmp, '.well-known/about.md');
    assert.match(md, /From \*\*body\*\*/);
    assert.doesNotMatch(md, /From \*file\*/);
    const html = await read(tmp, 'about/index.html');
    assert.match(html, /<strong>body<\/strong>/);
    assert.doesNotMatch(html, /<em>file<\/em>/);
  });

  test('http feed is kept with a warning', async () => {
    const { tmp, out } = await site({
      ...base,
      'config/social.json': JSON.stringify({ following: [{ title: 'Http', feedUrl: 'http://x.example/feed.xml', siteUrl: 'http://x.example/' }] }),
    });
    assert.match(out, /\[social\].*"Http".*http/);
    const opml = await read(tmp, '.well-known/following.opml');
    assert.match(opml, /xmlUrl="http:\/\/x\.example\/feed\.xml"/);
    assert.match(opml, /htmlUrl="http:\/\/x\.example\/"/);
  });

  test('relative feed is dropped with a warning', async () => {
    const { tmp, out } = await site({
      ...base,
      'config/social.json': JSON.stringify({ following: [
        { title: 'Rel', feedUrl: '/feed.xml' },
        { title: 'Good', feedUrl: 'https://z.example/f.xml' },
      ] }),
    });
    assert.match(out, /\[social\].*"Rel".*absolute/);
    const opml = await read(tmp, '.well-known/following.opml');
    assert.match(opml, /z\.example/);
    assert.doesNotMatch(opml, /Rel/);
  });

  test('public entry with no feedUrl is dropped with a warning', async () => {
    const { tmp, out } = await site({
      ...base,
      'config/social.json': JSON.stringify({ following: [
        { title: 'NoFeed' },
        { title: 'PrivNoFeed', public: false },
        { title: 'Good', feedUrl: 'https://z.example/f.xml' },
      ] }),
    });
    assert.match(out, /\[social\].*"NoFeed".*feedUrl/);
    assert.doesNotMatch(out, /PrivNoFeed/);
    const opml = await read(tmp, '.well-known/following.opml');
    assert.match(opml, /z\.example/);
    assert.doesNotMatch(opml, /NoFeed/);
  });

  test('relative siteUrl: entry kept without htmlUrl, with a warning', async () => {
    const { tmp, out } = await site({
      ...base,
      'config/social.json': JSON.stringify({ following: [{ title: 'BadSite', feedUrl: 'https://y.example/f.xml', siteUrl: 'y.example' }] }),
    });
    assert.match(out, /\[social\].*"BadSite".*siteUrl/);
    const opml = await read(tmp, '.well-known/following.opml');
    assert.match(opml, /xmlUrl="https:\/\/y\.example\/f\.xml"/);
    assert.doesNotMatch(opml, /htmlUrl/);
  });

  test('warnings: missing siteUrl, missing feed, nameless contact, missing about.file', async () => {
    const { tmp, out } = await site({
      'src/index.html': page('<p>hi</p>'),
      'config/main.js': 'export default {};\n',
      'config/social.json': JSON.stringify({
        following: [{ title: 'Good', feedUrl: 'https://z.example/f.xml' }],
        contact: { email: 'a@b.c' },
        about: { file: 'nope.md' },
      }),
    });
    assert.match(out, /\[social\].*siteUrl/);
    assert.match(out, /\[social\].*formats\.feed/);
    assert.match(out, /\[social\].*no name/);
    assert.match(out, /\[social\].*nope\.md/);
    assert.equal(await exists(tmp, '.well-known/contact.vcf'), false);
    assert.equal(await exists(tmp, '.well-known/about.md'), false);
  });

  test('no SocialSpec keys (accounts only): no files, no _headers change', async () => {
    const files = { ...base, 'src/_headers': '/*\n  X-Mine: 1\n' };
    const a = await site({ ...files, 'config/social.json': JSON.stringify({ accounts: [{ service: 'github', handle: 'x' }] }) });
    assert.equal(await exists(a.tmp, '.well-known'), false);
    assert.equal(await read(a.tmp, '_headers'), '/*\n  X-Mine: 1\n');
    const b = await site(base);
    assert.equal(await exists(b.tmp, '_headers'), false);
  });
});
