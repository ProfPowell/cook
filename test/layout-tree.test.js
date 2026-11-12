/**
 * @file layout-tree.test.js
 * @description The layout tree: parseLayout turns a correct format-1 layout
 * into a plain JSON tree, serializeLayout writes the canonical HTML back.
 * Round trips are stable, exact where they must be (components, comments,
 * inline script and style), and building with the serialized files gives
 * the same pages, whitespace aside.
 */

import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { promises as fs, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLayout, serializeLayout, checkLayout, loadSiteNames } from '../scripts/layouts.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STARTER = path.join(ROOT, 'starters', 'vanilla-breeze');
const TAP = path.join(ROOT, 'test', 'fixtures-layouts', 'tap');
const COOK = path.join(ROOT, 'bin', 'cook.js');

// thomasapowell.com's site fields (config/data.js) and declared fields (config/main.js)
const TAP_OPTS = { fields: ['siteTitle', 'ogImageUrl'], lists: [] };

const htmlFiles = (dir) => readdirSync(dir).filter(f => f.endsWith('.html')).sort();
const read = (file) => readFileSync(file, 'utf8');

/** Assert the full round-trip contract for one source. */
function roundTrip(src, opts, label) {
  const first = parseLayout(src, opts);
  assert.equal(first.ok, true, `${label}: ${JSON.stringify(first.problems)}`);
  assert.ok(first.tree, label);
  const out = serializeLayout(first.tree);
  const check = checkLayout(out, opts);
  assert.equal(check.ok, true, `${label}: serialized form fails the check ${JSON.stringify(check.problems)}\n${out}`);
  const second = parseLayout(out, opts);
  assert.equal(second.ok, true, `${label}: ${JSON.stringify(second.problems)}`);
  assert.deepEqual(second.tree, first.tree, `${label}: tree changed\n${out}`);
  assert.equal(serializeLayout(second.tree), out, `${label}: serialize is not idempotent`);
  return { tree: first.tree, out };
}

describe('layout tree: round trips', async () => {
  const names = await loadSiteNames(STARTER);
  const starterOpts = { fields: names.fields, lists: names.lists };

  for (const file of htmlFiles(path.join(STARTER, 'src', 'layouts'))) {
    test(`starter layout ${file}`, () => {
      roundTrip(read(path.join(STARTER, 'src', 'layouts', file)), starterOpts, file);
    });
  }
  for (const file of htmlFiles(path.join(STARTER, 'src', 'includes'))) {
    test(`starter include ${file}`, () => {
      const { tree, out } = roundTrip(read(path.join(STARTER, 'src', 'includes', file)), { ...starterOpts, fragment: true }, file);
      assert.equal(tree.kind, 'fragment');
      assert.ok(out.startsWith('<!-- layout-fragment -->\n'), out);
      assert.ok(!tree.body.some(b => b.type === 'comment'), 'the marker is not a comment block');
    });
  }
  for (const file of htmlFiles(TAP)) {
    test(`thomasapowell.com layout ${file}`, () => {
      roundTrip(read(path.join(TAP, file)), TAP_OPTS, file);
    });
  }
});

describe('layout tree: shape', () => {
  test('a base layout', () => {
    const { tree } = parseLayout(read(path.join(TAP, 'base.html')), TAP_OPTS);
    assert.equal(tree.kind, 'base');
    assert.equal(tree.parent, null);
    assert.equal(tree.pageLayout, '${pageLayout}');
    assert.deepEqual(tree.htmlAttrs, [['lang', 'en']]);
    assert.equal(tree.info.format, 1);
    assert.equal(tree.info.label, 'Site base');
    assert.equal(tree.info.abstract, true);
    assert.deepEqual(tree.info.slots.nav, { label: 'Section menu' });
    assert.deepEqual(tree.head[0], { tag: 'meta', attrs: [['charset', 'utf-8']] });
    assert.deepEqual(tree.head.find(h => h.tag === 'title'), { tag: 'title', attrs: [], text: '${title} · ${siteTitle}' });
    assert.deepEqual(tree.head.find(h => h.tag === 'meta' && h.if), {
      tag: 'meta', attrs: [['name', 'description'], ['content', '${description}']], if: 'description',
    });
    assert.deepEqual(tree.head.at(-1), { slot: 'head' });
    assert.deepEqual(tree.body.map(b => b.tag), ['header', 'nav', 'main', 'aside', 'footer']);
    const nav = tree.body[1];
    assert.deepEqual(nav, { type: 'container', tag: 'nav', attrs: [['aria-label', 'Section']], if: 'slot:nav', body: [{ type: 'slot', name: 'nav', attrs: [] }] });
    assert.deepEqual(tree.body[2].body, [{ type: 'content', attrs: [] }]);
    const menu = tree.body[0].body[0].body[0];
    assert.equal(menu.type, 'menu');
    assert.deepEqual(menu.items[0], { attrs: [], inline: [{ tag: 'a', attrs: [['href', '/']], inline: [{ text: 'Thomas A. Powell' }] }] });
    assert.deepEqual(tree.slots, []);
    assert.deepEqual(tree.vars, []);
  });

  test('a child layout', () => {
    const { tree } = parseLayout(read(path.join(STARTER, 'src', 'layouts', 'post.html')), { fields: ['siteTitle'] });
    assert.equal(tree.kind, 'child');
    assert.equal(tree.parent, 'base');
    assert.equal(tree.pageLayout, 'article');
    assert.deepEqual(tree.head, []);
    assert.deepEqual(tree.slots.map(s => s.name), ['aside', 'head']);
    assert.deepEqual(tree.slots[0], { name: 'aside', attrs: [], body: [{ type: 'slot', name: 'aside', attrs: [] }] });
    assert.deepEqual(tree.slots[1].body.at(-1), { tag: 'meta', attrs: [['property', 'og:image'], ['content', '${image}']], if: 'image' });
    const article = tree.body[0];
    assert.equal(article.type, 'container');
    assert.deepEqual(article.body[1], {
      type: 'text', tag: 'p', attrs: [], if: 'date',
      inline: [{ tag: 'time', attrs: [['datetime', '${date}']], inline: [{ field: 'date' }] }],
    });
    assert.deepEqual(article.body[2].inline, [{ text: 'By ' }, { tag: 'span', attrs: [], inline: [{ field: 'author' }] }]);
    assert.deepEqual(article.body[4], {
      type: 'container', tag: 'figure', attrs: [], if: 'image',
      body: [{ type: 'image', tag: 'img', attrs: [['src', '${image}'], ['alt', '${imageAlt}']] }],
    });
    assert.deepEqual(article.body[5], { type: 'content', attrs: [] });
  });

  test('child body data-* become vars', () => {
    const src = `<body data-template="base" data-page-layout="stack" data-hero-title="Hi \${title}">
  <script type="application/json" data-layout-info>{ "format": 1, "label": "X" }</script>
  \${content}
</body>`;
    const { tree, out } = roundTrip(src, {}, 'vars');
    assert.deepEqual(tree.vars, [['heroTitle', 'Hi ${title}']]);
    assert.match(out, /^<body data-template="base" data-page-layout="stack" data-hero-title="Hi \$\{title\}">/);
  });

  test('a repeated li: fields and repeat', () => {
    const src = '<!-- layout-fragment -->\n<nav><ul><li data-repeat="collections.blog | limit:3 as post"><a href="${post.url}">${post.title}</a></li></ul></nav>\n';
    const { ok, tree, problems } = parseLayout(src, { fragment: true });
    assert.equal(ok, true, JSON.stringify(problems));
    const item = tree.body[0].body[0].items[0];
    assert.deepEqual(item.repeat, { source: 'collections.blog', pipes: ['limit:3'], alias: 'post' });
    assert.deepEqual(item.inline[0].inline, [{ field: 'post.title' }]);
    roundTrip(src, { fragment: true }, 'repeat');
  });

  test('repeat with an index and two pipes', () => {
    const src = '<nav><ul><li data-repeat="collections.blog | offset:1 | limit:3 as post, i">${i}</li></ul></nav>';
    const { tree } = roundTrip(src, { fragment: true }, 'index');
    assert.deepEqual(tree.body[0].body[0].items[0].repeat, { source: 'collections.blog', pipes: ['offset:1', 'limit:3'], alias: 'post', index: 'i' });
  });

  test('attribute order: data-template, data-page-layout, rest, data-repeat, data-if, data-unless', () => {
    const src = '<section data-unless="date" data-if="title" data-repeat="collections.x as p" id="a" class="b"><p>${p.title}</p></section>';
    const { out } = roundTrip(src, { fragment: true }, 'order');
    assert.match(out, /^<section id="a" class="b" data-repeat="collections\.x as p" data-if="title" data-unless="date">/m);
  });

  test('text is decoded in the tree and escaped on the way out', () => {
    const src = '<footer><p>a &amp; b &lt;c&gt; &copy;&nbsp;d</p></footer>';
    const { tree, out } = roundTrip(src, { fragment: true }, 'entities');
    assert.deepEqual(tree.body[0].body[0].inline, [{ text: 'a & b <c> © d' }]);
    assert.ok(out.includes('<p>a &amp; b &lt;c&gt; ©&nbsp;d</p>'), out);
  });

  test('whitespace in text collapses; text blocks sit on one line', () => {
    const src = '<footer>\n  <p>\n    Hello\n    <a href="/">there</a>\n  </p>\n</footer>';
    const { tree, out } = roundTrip(src, { fragment: true }, 'ws');
    assert.deepEqual(tree.body[0].body[0].inline, [{ text: 'Hello ' }, { tag: 'a', attrs: [['href', '/']], inline: [{ text: 'there' }] }]);
    assert.equal(out, '<!-- layout-fragment -->\n<footer>\n  <p>Hello <a href="/">there</a></p>\n</footer>\n');
  });

  test('an li holding blocks, a picture, an include and a layout element', () => {
    const src = `<footer>
  <ul><li><p>One</p><p>Two</p></li></ul>
  <picture><source srcset="/a.avif" type="image/avif"><img src="/a.jpg" alt=""></picture>
  <div data-include="/includes/x.html" data-if="title"></div>
  <layout-grid data-repeat="collections.blog as post"><h2>\${post.title}</h2></layout-grid>
</footer>`;
    const { tree } = roundTrip(src, { fragment: true }, 'blocks');
    const [menu, picture, include, grid] = tree.body[0].body;
    assert.equal(menu.items[0].body.length, 2);
    assert.equal(menu.items[0].inline, undefined);
    assert.deepEqual(picture, { type: 'image', tag: 'picture', attrs: [], html: '<source srcset="/a.avif" type="image/avif"><img src="/a.jpg" alt="">' });
    assert.deepEqual(include, { type: 'include', path: '/includes/x.html', attrs: [], if: 'title' });
    assert.equal(grid.type, 'container');
    assert.equal(grid.repeat.alias, 'post');
  });
});

describe('layout tree: exact source fidelity (Review Focus 5)', () => {
  const COMPONENT_INNER = '<template shadowrootmode="open"><p>x</p></template>';
  const SRC = `<!doctype html>
<html lang="en">
<head>
  <script type="application/json" data-layout-info>{ "format": 1, "label": "F" }</script>
  <style>a>b{}</style>
  <script type="module">if (a < b && c > d) console.log("</p>");</script>
</head>
<body>
  <main>
    <!-- keep  me <b>exactly</b> -->
    <my-card class="c">${COMPONENT_INNER}</my-card>
    <x-raw>  <b title='q'>&copy; a&amp;b</b>
      <i>two</i></x-raw>
    \${content}
  </main>
</body>
</html>
`;

  test('component inner HTML, comments and inline style and script survive byte-for-byte', () => {
    const { tree, out } = roundTrip(SRC, {}, 'fidelity');
    const main = tree.body[0];
    assert.deepEqual(main.body[0], { type: 'comment', attrs: [], text: ' keep  me <b>exactly</b> ' });
    assert.deepEqual(main.body[1], { type: 'component', tag: 'my-card', attrs: [['class', 'c']], html: COMPONENT_INNER });
    assert.equal(main.body[2].html, `  <b title='q'>&copy; a&amp;b</b>\n      <i>two</i>`);
    assert.deepEqual(tree.head.find(h => h.tag === 'style'), { tag: 'style', attrs: [], text: 'a>b{}' });
    assert.equal(tree.head.find(h => h.tag === 'script').text, 'if (a < b && c > d) console.log("</p>");');
    for (const piece of [
      `<my-card class="c">${COMPONENT_INNER}</my-card>`,
      '<!-- keep  me <b>exactly</b> -->',
      '<style>a>b{}</style>',
      '<script type="module">if (a < b && c > d) console.log("</p>");</script>',
      `<x-raw>  <b title='q'>&copy; a&amp;b</b>\n      <i>two</i></x-raw>`,
    ]) {
      assert.ok(out.includes(piece), `missing ${piece}\n${out}`);
    }
  });
});

describe('layout tree: refusals', () => {
  test('a plain layout gives no tree and no problems', () => {
    const r = parseLayout('<!doctype html><html><head><title>x</title></head><body><main>${content}</main></body></html>');
    assert.deepEqual(r, { ok: false, tree: null, problems: [] });
  });

  test("a layout with problems gives no tree and passes the checker's problems through", () => {
    const src = `<body data-template="base">
  <script type="application/json" data-layout-info>{ "format": 1, "label": "X" }</script>
  <p>\${nope}</p>
  \${content}
</body>`;
    const r = parseLayout(src);
    assert.equal(r.ok, false);
    assert.equal(r.tree, null);
    assert.deepEqual(r.problems, checkLayout(src).problems);
    assert.ok(r.problems.some(p => p.message === 'unknown field "nope"'));
  });

  test('fields and lists reach the checker', () => {
    const src = '<footer><ul><li data-repeat="links as l">${l.x} ${siteTitle}</li></ul></footer>';
    assert.equal(parseLayout(src, { fragment: true }).ok, false);
    assert.equal(parseLayout(src, { fragment: true, fields: ['siteTitle'], lists: ['links'] }).ok, true);
  });

  // Correct layouts the tree has no place for are refused rather than
  // opened lossily (Review Focus 5).
  const base = (head, body) => `<!doctype html><html><head>
<script type="application/json" data-layout-info>{ "format": 1, "label": "X" }</script>
${head}</head><body>${body}</body></html>`;
  for (const [label, src, needle] of [
    ['a comment in <head>', base('<!-- c -->', '<main>${content}</main>'), 'comment'],
    ['a comment inside a text block', base('', '<main><p>a<!-- c --></p>${content}</main>'), 'comment'],
    ['a comment between menu items', base('', '<main><ul><li>a</li><!-- c --></ul>${content}</main>'), 'comment'],
    ['a component inside a text block', base('', '<main><p>a <x-icon></x-icon></p>${content}</main>'), 'component'],
    ['an li mixing text and blocks', base('', '<main><ul><li><a href="/">a</a><ul><li>b</li></ul></li></ul>${content}</main>'), 'mixes'],
    ['attributes on a base <body> besides data-page-layout', base('', '<main>${content}</main>').replace('<body>', '<body class="x">'), 'class'],
  ]) {
    test(`refuses ${label}`, () => {
      assert.equal(checkLayout(src).ok, true, JSON.stringify(checkLayout(src).problems));
      const r = parseLayout(src);
      assert.equal(r.ok, false);
      assert.equal(r.tree, null);
      assert.equal(r.problems.length, 1, JSON.stringify(r.problems));
      assert.ok(r.problems[0].message.includes(needle), r.problems[0].message);
      assert.equal(typeof r.problems[0].line, 'number');
    });
  }
});

describe('layout tree: build equality (Review Focus 1)', () => {
  const tmps = [];
  after(() => Promise.all(tmps.map(t => fs.rm(t, { recursive: true, force: true }))));

  async function scratch() {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cook-tree-'));
    tmps.push(tmp);
    await fs.cp(STARTER, tmp, { recursive: true });
    await fs.mkdir(path.join(tmp, 'node_modules'));
    for (const e of await fs.readdir(path.join(ROOT, 'node_modules'))) {
      await fs.symlink(path.join(ROOT, 'node_modules', e), path.join(tmp, 'node_modules', e));
    }
    await fs.rm(path.join(tmp, 'node_modules', 'cook-ssg'), { force: true });
    await fs.symlink(ROOT, path.join(tmp, 'node_modules', 'cook-ssg'));
    return tmp;
  }
  function build(tmp) {
    const r = spawnSync(process.execPath, [COOK, 'build'], {
      cwd: tmp, env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf-8',
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  }
  async function distPages(tmp) {
    const pages = {};
    const walk = async (dir) => {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else if (e.name.endsWith('.html')) pages[path.relative(path.join(tmp, 'dist'), full)] = await fs.readFile(full, 'utf8');
      }
    };
    await walk(path.join(tmp, 'dist'));
    return pages;
  }
  // Whitespace aside: runs collapse to one space, and space next to a tag goes
  const squash = (html) => html.replace(/\s+/g, ' ').replace(/>\s+/g, '>').replace(/\s+</g, '<').trim();

  test('the starter builds the same pages from its serialized layouts and includes', async () => {
    const tmp = await scratch();
    build(tmp);
    const before = await distPages(tmp);
    assert.ok(Object.keys(before).length > 0);

    const names = await loadSiteNames(tmp);
    let changed = 0;
    for (const [dir, fragment] of [['layouts', false], ['includes', true]]) {
      for (const file of htmlFiles(path.join(tmp, 'src', dir))) {
        const full = path.join(tmp, 'src', dir, file);
        const src = await fs.readFile(full, 'utf8');
        const { ok, tree, problems } = parseLayout(src, { fields: names.fields, lists: names.lists, fragment });
        assert.equal(ok, true, `${file}: ${JSON.stringify(problems)}`);
        const out = serializeLayout(tree);
        if (out !== src) changed++;
        await fs.writeFile(full, out);
      }
    }
    assert.ok(changed > 0, 'some files were rewritten');
    await fs.rm(path.join(tmp, 'dist'), { recursive: true, force: true });
    build(tmp);
    const afterPages = await distPages(tmp);

    assert.deepEqual(Object.keys(afterPages).sort(), Object.keys(before).sort());
    for (const [rel, html] of Object.entries(before)) {
      assert.equal(squash(afterPages[rel]), squash(html), rel);
    }
  });
});
