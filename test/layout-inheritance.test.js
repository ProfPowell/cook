/**
 * @file layout-inheritance.test.js
 * @description Unit tests for layout inheritance (scripts/utils/layouts/render.js):
 * child layouts built on a parent, info-block stripping, and nesting-aware
 * slot extraction. Also pins Review Focus 1 through the real apply-template
 * plugin: page content holding <main>, nested <template> or ${...} is never
 * treated as layout structure.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { renderLayout, extractSlots, stripInfo } from '../scripts/utils/layouts/render.js';
import applyTemplate from '../scripts/plugins/apply-template.js';

const INFO_BASE = '<script type="application/json" data-layout-info>{"format":1,"label":"Base","slots":{"aside":{"label":"Sidebar"},"head":{}}}</script>';
const INFO_POST = '<script type="application/json" data-layout-info>{"format":1,"label":"Post","slots":{"aside":{"label":"Sidebar"}}}</script>';

const BASE = `<!doctype html>
<html lang="en">
<head>
  ${INFO_BASE}
  <title>\${title}</title>
\${slot:head}
</head>
<body data-page-layout="\${pageLayout}">
<main>\${content}</main>
<aside>\${slot:aside}</aside>
<footer>\${slot:footer}</footer>
</body>
</html>`;

const POST = `<body data-template="base" data-page-layout="article">
  ${INFO_POST}
  <article>
    <h1>\${title}</h1>
    \${content}
  </article>
  <template slot="aside">\${slot:aside}</template>
</body>`;

const NOTE = `<body data-template="post" data-note-kind="short">
  <div class="note">\${content}</div>
  <template slot="aside">\${slot:aside}<p>note</p></template>
</body>`;

function loader(layouts) {
  return async (name) => (layouts[name] === undefined ? null : layouts[name]);
}

const LAYOUTS = { base: BASE, post: POST, note: NOTE };

describe('renderLayout', () => {
  it('returns null when the layout is not found', async () => {
    assert.equal(await renderLayout('nope', { content: 'x' }, { loadLayout: loader(LAYOUTS) }), null);
  });

  it('an empty layout file, or a missing parent, counts as not found', async () => {
    assert.equal(await renderLayout('empty', { content: 'x' }, { loadLayout: loader({ empty: '' }) }), null);
    const orphan = '<body data-template="gone">${content}</body>';
    assert.equal(await renderLayout('orphan', { content: 'x' }, { loadLayout: loader({ orphan }) }), null);
  });

  it('a plain layout renders exactly as renderTemplate did', async () => {
    const plain = '<html><body><main>${content}</main><aside>${slot:aside}</aside>${other}</body></html>';
    const out = await renderLayout('plain', { content: '<p>x</p>' }, { loadLayout: loader({ plain }) });
    assert.equal(out, '<html><body><main><p>x</p></main><aside></aside>${other}</body></html>');
  });

  it('a plain layout keeps unfilled slots when asked (markdown legacy)', async () => {
    const plain = '<main>${content}</main><aside>${slot:aside}</aside>';
    const out = await renderLayout('plain', { content: 'x' }, { loadLayout: loader({ plain }), removeUnmatchedSlots: false });
    assert.equal(out, '<main>x</main><aside>${slot:aside}</aside>');
  });

  it('a base layout loses its info block', async () => {
    const out = await renderLayout('base', { title: 'T', content: 'c', pageLayout: 'stack' }, { loadLayout: loader(LAYOUTS) });
    assert.equal(out, `<!doctype html>
<html lang="en">
<head>
  <title>T</title>

</head>
<body data-page-layout="stack">
<main>c</main>
<aside></aside>
<footer></footer>
</body>
</html>`);
  });

  it('a child gives the parent document with the child body in ${content}', async () => {
    const out = await renderLayout('post', { title: 'Hi', content: '<p>x</p>' }, { loadLayout: loader(LAYOUTS) });
    assert.equal(out, `<!doctype html>
<html lang="en">
<head>
  <title>Hi</title>

</head>
<body data-page-layout="article">
<main><article>
    <h1>Hi</h1>
    <p>x</p>
  </article></main>
<aside></aside>
<footer></footer>
</body>
</html>`);
  });

  it("a child's data-page-layout reaches ${pageLayout}", async () => {
    const out = await renderLayout('post', { title: 'Hi', content: '', pageLayout: 'landing' }, { loadLayout: loader(LAYOUTS) });
    assert.match(out, /<body data-page-layout="article">/);
  });

  it('a child\'s data-template and data-* attributes may be single-quoted or unquoted', async () => {
    const single = POST.replace('<body data-template="base" data-page-layout="article">', "<body data-template='base' data-page-layout='article'>");
    const outSingle = await renderLayout('post', { title: 'Hi', content: 'c', pageLayout: 'landing' }, { loadLayout: loader({ ...LAYOUTS, post: single }) });
    assert.match(outSingle, /<!doctype html>/);
    assert.match(outSingle, /<body data-page-layout="article">/);

    const bare = POST.replace('<body data-template="base" data-page-layout="article">', '<body data-template=base data-page-layout=article>');
    const outBare = await renderLayout('post', { title: 'Hi', content: 'c', pageLayout: 'landing' }, { loadLayout: loader({ ...LAYOUTS, post: bare }) });
    assert.match(outBare, /<!doctype html>/);
    assert.match(outBare, /<body data-page-layout="article">/);
    assert.equal(outBare, outSingle);
  });

  it('an explicit <template slot="aside">${slot:aside}</template> forwards the page slot', async () => {
    const out = await renderLayout('post', { title: 'Hi', content: '', 'slot:aside': '<p>side</p>' }, { loadLayout: loader(LAYOUTS) });
    assert.match(out, /<aside><p>side<\/p><\/aside>/);
  });

  it('a page slot the child does not forward never reaches the base', async () => {
    const out = await renderLayout('post', { title: 'Hi', content: '', 'slot:footer': '<p>FOOT</p>' }, { loadLayout: loader(LAYOUTS) });
    assert.ok(!out.includes('FOOT'), out);
    assert.match(out, /<footer><\/footer>/);
  });

  it('the info block appears in no output', async () => {
    for (const name of ['base', 'post', 'note']) {
      const out = await renderLayout(name, { title: 'Hi', content: 'c' }, { loadLayout: loader(LAYOUTS) });
      assert.ok(!out.includes('data-layout-info'), `${name}: ${out}`);
    }
  });

  it('a two-level chain works', async () => {
    const out = await renderLayout('note', { title: 'Hi', content: '<p>x</p>', 'slot:aside': 'S' }, { loadLayout: loader(LAYOUTS) });
    assert.match(out, /<main><article>\n {4}<h1>Hi<\/h1>\n {4}<div class="note"><p>x<\/p><\/div>\n {2}<\/article><\/main>/);
    assert.match(out, /<aside>S<p>note<\/p><\/aside>/);
    assert.match(out, /<body data-page-layout="article">/);
  });

  it('data-* attributes on a middle layout become variables of its parent', async () => {
    const mid = '<body data-template="base" data-page-layout="${kind}" data-note-kind="x">${content}</body>';
    const leaf = '<body data-template="mid" data-kind="sidebar-left">${content}</body>';
    const out = await renderLayout('leaf', { title: 'T', content: 'c' }, { loadLayout: loader({ base: BASE, mid, leaf }) });
    assert.match(out, /<body data-page-layout="sidebar-left">/);
  });

  it('an empty piece is omitted, so the parent slot is removed', async () => {
    const out = await renderLayout('post', { title: 'Hi', content: '', 'slot:aside': '   ' }, { loadLayout: loader(LAYOUTS) });
    assert.match(out, /<aside><\/aside>/);
  });

  it('a child fills the reserved head slot', async () => {
    const child = '<body data-template="base"><template slot="head"><meta property="og:title" content="${title}"></template>${content}</body>';
    const out = await renderLayout('child', { title: 'T', content: 'c' }, { loadLayout: loader({ base: BASE, child }) });
    assert.match(out, /<title>T<\/title>\n<meta property="og:title" content="T">\n<\/head>/);
  });

  it('the cycle error message is exact', async () => {
    const layouts = { post: '<body data-template="base">${content}</body>', base: '<body data-template="post">${content}</body>' };
    await assert.rejects(
      renderLayout('post', { content: 'x' }, { loadLayout: loader(layouts) }),
      (err) => err instanceof Error && err.message === 'Layout cycle: post → base → post',
    );
  });

  it('a chain deeper than 5 throws', async () => {
    const layouts = { l6: 'base6' };
    for (let i = 1; i <= 5; i++) layouts[`l${i}`] = `<body data-template="l${i + 1}">\${content}</body>`;
    layouts.l6 = '<html><body>${content}</body></html>';
    await assert.rejects(renderLayout('l1', { content: 'x' }, { loadLayout: loader(layouts) }), /too deep/);
    // Exactly five layouts is fine
    const out = await renderLayout('l2', { content: 'x' }, { loadLayout: loader(layouts) });
    assert.equal(out, '<html><body>x</body></html>');
  });

  it('runs conditionals on every piece and the base before interpolation', async () => {
    const seen = [];
    const conditionals = (html, pageData, data) => {
      seen.push({ html, data });
      return html.replace('${title}', '[cond]');
    };
    const out = await renderLayout('post', { title: 'Hi', content: 'c' }, { loadLayout: loader(LAYOUTS), data: { site: 1 }, conditionals });
    assert.match(out, /<h1>\[cond\]<\/h1>/);
    assert.match(out, /<title>\[cond\]<\/title>/);
    assert.ok(seen.every(s => s.data.site === 1));
    assert.ok(seen.every(s => !s.html.includes('data-layout-info')));
  });
});

describe('Review Focus 1: page content is never layout structure', () => {
  const PAGE = '<main><p>x</p></main><template slot="aside"><template><b>i</b></template></template> ${notAVar}';

  it('through renderLayout', async () => {
    const { content, slots } = extractSlots(PAGE);
    const pageData = { title: 'T', content };
    for (const [k, v] of Object.entries(slots)) pageData[`slot:${k}`] = v;
    const out = await renderLayout('post', pageData, { loadLayout: loader(LAYOUTS) });
    assert.match(out, /<aside><template><b>i<\/b><\/template><\/aside>/);
    assert.match(out, /<main><article>\n {4}<h1>T<\/h1>\n {4}<main><p>x<\/p><\/main> \$\{notAVar\}\n {2}<\/article><\/main>/);
  });

  it('through the apply-template plugin (front matter page)', async () => {
    const file = { ext: 'html', path: 'dist/p.html', name: 'p', src: PAGE, frontMatter: { layout: 'post', title: 'T' } };
    await applyTemplate({ file, store: { cachedLayouts: { ...LAYOUTS } }, allowType: ['.html'] });
    assert.match(file.src, /<aside><template><b>i<\/b><\/template><\/aside>/);
    assert.ok(file.src.includes('<main><article>\n    <h1>T</h1>\n    <main><p>x</p></main> ${notAVar}\n  </article></main>'), file.src);
    assert.ok(!file.src.includes('data-layout-info'));
  });

  it('page content with ${...} and <template slot> text in a slot stays verbatim', async () => {
    const out = await renderLayout('post', { title: 'T', content: '${title} <template slot="aside">no</template>', 'slot:aside': '${content}' }, { loadLayout: loader(LAYOUTS) });
    assert.ok(out.includes('<h1>T</h1>\n    ${title} <template slot="aside">no</template>'), out);
    assert.match(out, /<aside>\$\{content\}<\/aside>/);
  });
});

describe('fix round 1', () => {
  it('stripInfo stops at the info script\'s own </script>', () => {
    const head = '<head>\n  <script type="application/json" data-layout-info>{}</script><meta charset="utf-8">\n  <title>${title}</title>\n  <script src="/a.js"></script>\n</head>';
    assert.equal(stripInfo(head), '<head>\n  <meta charset="utf-8">\n  <title>${title}</title>\n  <script src="/a.js"></script>\n</head>');
  });

  it('a base whose info block shares its line keeps the rest of the head', async () => {
    const base = '<html><head>\n  <script data-layout-info>{}</script><meta charset="utf-8">\n  <title>${title}</title>\n  <script src="/a.js"></script>\n</head><body>${content}</body></html>';
    const out = await renderLayout('base', { title: 'T', content: 'c' }, { loadLayout: loader({ base }) });
    assert.equal(out, '<html><head>\n  <meta charset="utf-8">\n  <title>T</title>\n  <script src="/a.js"></script>\n</head><body>c</body></html>');
  });

  for (const open of ['<template slot="aside" data-if="slot:aside">', '<template class="x" slot="aside">', '<template slot=aside>', "<template slot='aside'>"]) {
    it(`a child slot template written ${open} fills the parent slot`, async () => {
      const child = `<body data-template="base">\${content}${open}<b>A</b></template></body>`;
      const out = await renderLayout('child', { title: 'T', content: 'c' }, { loadLayout: loader({ base: BASE, child }) });
      assert.match(out, /<main>c<\/main>/);
      assert.match(out, /<aside><b>A<\/b><\/aside>/);
    });
  }

  it('a data-slot attribute does not make a slot template', async () => {
    const child = '<body data-template="base"><template data-slot="aside">T</template></body>';
    const out = await renderLayout('child', { title: 'T', content: 'c' }, { loadLayout: loader({ base: BASE, child }) });
    assert.match(out, /<main><template data-slot="aside">T<\/template><\/main>/);
  });

  it("a slot template's data-if reaches the conditionals hook, which can drop it", async () => {
    const child = '<body data-template="base">${content}<template slot="aside" data-if="no"><b>A</b></template><template slot="footer" data-if="yes"><b>F</b></template></body>';
    const seen = [];
    const conditionals = (html) => {
      seen.push(html);
      return html
        .replace(/<template\b[^>]*data-if="no"[^>]*>[\s\S]*?<\/template>/g, '')
        .replace(/ data-if="yes"/g, '');
    };
    const out = await renderLayout('child', { title: 'T', content: 'c' }, { loadLayout: loader({ base: BASE, child }), conditionals });
    assert.ok(seen.includes('<template slot="aside" data-if="no"><b>A</b></template>'), seen.join('\n'));
    assert.match(out, /<aside><\/aside>/);
    assert.match(out, /<footer><b>F<\/b><\/footer>/);
  });

  it('the page side still recognises only the exact <template slot="x"> form', () => {
    assert.deepEqual(extractSlots('<template slot=aside>A</template>'), { content: '<template slot=aside>A</template>', slots: {} });
  });
});

describe('extractSlots', () => {
  it('matches the old regex output when nothing is nested', () => {
    const html = '  <p>a</p><template slot="x"> <b>X</b> </template><p>b</p><template slot="y">Y</template>  ';
    assert.deepEqual(extractSlots(html), { content: '<p>a</p><p>b</p>', slots: { x: '<b>X</b>', y: 'Y' } });
  });

  it('keeps nested templates inside a slot', () => {
    const html = '<p>a</p><template slot="aside"><template><b>i</b></template><template id="t">j</template></template><p>b</p>';
    assert.deepEqual(extractSlots(html), {
      content: '<p>a</p><p>b</p>',
      slots: { aside: '<template><b>i</b></template><template id="t">j</template>' },
    });
  });

  it('a slot template nested in another slot is not top level', () => {
    const html = '<template slot="a"><template slot="b">B</template></template>rest';
    assert.deepEqual(extractSlots(html), { content: 'rest', slots: { a: '<template slot="b">B</template>' } });
  });

  it('leaves plain templates in the content', () => {
    const html = '<template id="t"><p>t</p></template><template slot="s">S</template>';
    assert.deepEqual(extractSlots(html), { content: '<template id="t"><p>t</p></template>', slots: { s: 'S' } });
  });

  it('a later slot with the same name wins', () => {
    assert.deepEqual(extractSlots('<template slot="s">1</template><template slot="s">2</template>'), { content: '', slots: { s: '2' } });
  });
});
