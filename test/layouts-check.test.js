/**
 * @file layouts-check.test.js
 * @description Tests the format-1 layout parser and checker
 * (scripts/utils/layouts/check.js): kinds, the block vocabulary, fields,
 * slots, lists, conditionals, head rules and line numbers.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkLayout } from '../scripts/utils/layouts/check.js';
import { parseLayoutSource } from '../scripts/utils/layouts/parse.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures-layouts');
const fixture = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

/**
 * A format-1 base layout. The body markup starts on line 9.
 */
function base({ body = '<main>${content}</main>', head = '', slots = {}, attrs = '', info } = {}) {
  const infoText = info ?? JSON.stringify({ format: 1, slots });
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    `<script type="application/json" data-layout-info>${infoText}</script>`,
    '<title>${title}</title>',
    head,
    '</head>',
    `<body${attrs}>`,
    body,
    '</body>',
    '</html>',
  ].join('\n');
}

/**
 * A format-1 child layout. The body markup starts on line 3.
 */
function child(body, slots = {}) {
  return [
    '<body data-template="base">',
    `<script type="application/json" data-layout-info>${JSON.stringify({ format: 1, slots })}</script>`,
    body,
    '</body>',
  ].join('\n');
}

const messages = (result) => result.problems.map(p => p.message);
const hasProblem = (result, text) => messages(result).some(m => m.includes(text));

describe('checkLayout', () => {

  test('correct base', () => {
    const result = checkLayout(fixture('base.html'), { fields: ['siteTitle'] });
    assert.deepEqual(result.problems, []);
    assert.equal(result.ok, true);
    assert.equal(result.kind, 'base');
    assert.equal(result.parent, null);
    assert.deepEqual(result.slots, ['aside']);
    assert.equal(result.info.label, 'Base');
    assert.ok(result.fields.includes('title'));
    assert.ok(result.fields.includes('siteTitle'));
    assert.ok(!result.fields.includes('content'));
  });

  test('correct child', () => {
    const result = checkLayout(fixture('child.html'));
    assert.deepEqual(result.problems, []);
    assert.equal(result.ok, true);
    assert.equal(result.kind, 'child');
    assert.equal(result.parent, 'base');
    assert.deepEqual(result.slots, ['aside']);
  });

  test('plain layout: no info block, slots and fields still scanned', () => {
    const result = checkLayout(fixture('plain-post.html'));
    assert.equal(result.kind, 'plain');
    assert.equal(result.ok, false);
    assert.deepEqual(result.problems, []);
    assert.equal(result.info, null);
    assert.deepEqual(result.slots, []);
    assert.deepEqual(result.fields, ['title', 'description', 'ogImage', 'date', 'featuredImage']);
  });

  test('plain layout scan finds slots', () => {
    const result = checkLayout('<!doctype html><html><body><main>${content}</main><aside>${slot:aside}</aside></body></html>');
    assert.equal(result.kind, 'plain');
    assert.deepEqual(result.slots, ['aside']);
  });

  test('menu is a block', () => {
    const result = checkLayout(base({ body: '<nav><ul><li><a href="/">Home</a></li></ul></nav>\n<main>${content}</main>' }));
    assert.deepEqual(result.problems, []);
    assert.equal(result.ok, true);
  });

  test('bare div', () => {
    const result = checkLayout(base({ body: '<main>${content}\n<div><p>x</p></div>\n</main>' }));
    assert.equal(result.ok, false);
    assert.equal(result.problems.length, 1);
    assert.equal(result.problems[0].line, 10);
    assert.match(result.problems[0].message, /<div>/);
  });

  test('a div with data-layout and layout elements are containers', () => {
    const result = checkLayout(base({
      body: '<main>${content}<div data-layout="stack"><p>a</p></div><layout-grid><section><h2>b</h2></section></layout-grid></main>',
    }));
    assert.deepEqual(result.problems, []);
  });

  test('header and footer are containers without data-layout', () => {
    const result = checkLayout(base({
      body: '<main>${content}<article><header><h1>${title}</h1></header><footer><p>${author}</p></footer></article></main>',
    }));
    assert.deepEqual(result.problems, []);
    assert.equal(result.ok, true);
  });

  test('components are opaque', () => {
    const result = checkLayout(base({ body: '<main>${content}<my-card><div><table></table></div></my-card></main>' }));
    assert.deepEqual(result.problems, []);
  });

  test('a component can carry data-repeat; its alias is valid on it, not outside', () => {
    const card = '<post-card data-repeat="collections.blog as post" title="${post.title}"></post-card>';
    const ok = checkLayout(base({ body: `<main>\${content}${card}</main>` }));
    assert.deepEqual(ok.problems, []);

    const outside = checkLayout(base({ body: `<main>\${content}${card}<p>\${post.title}</p></main>` }));
    assert.equal(outside.ok, false);
    assert.deepEqual(messages(outside), ['unknown field "post.title"']);
  });

  test('an element that still can\'t repeat gets the any-block message', () => {
    const inline = checkLayout(base({ body: '<main>${content}<p>x <a data-repeat="collections.blog as post" href="#">y</a></p></main>' }));
    assert.ok(hasProblem(inline, '<a> can\'t repeat here (data-repeat goes on a block'));
    assert.ok(!hasProblem(inline, 'container or a ul/ol/menu'));
  });

  test('unknown field', () => {
    const html = base({ body: '<main>${content}<p>${titel}</p></main>' });
    const result = checkLayout(html);
    assert.equal(result.ok, false);
    assert.equal(result.problems.length, 1);
    assert.equal(result.problems[0].line, 9);
    assert.match(result.problems[0].message, /"titel"/);
    assert.equal(checkLayout(html, { fields: ['titel'] }).ok, true);
  });

  test('fields in attribute values are checked', () => {
    const ok = checkLayout(base({ body: '<main>${content}<p><a href="${url}">${title}</a></p></main>' }));
    assert.deepEqual(ok.problems, []);
    const bad = checkLayout(base({ body: '<main>${content}<p><a href="${urll}">x</a></p></main>' }));
    assert.ok(hasProblem(bad, '"urll"'));
  });

  test('expression', () => {
    const sum = checkLayout(base({ body: '<main>${content}<p>${a + b}</p></main>' }));
    assert.equal(sum.ok, false);
    assert.ok(hasProblem(sum, 'a + b'));
    const vue = checkLayout(base({ body: '<main>${content}<p>${{x}}</p></main>' }));
    assert.equal(vue.ok, false);
    assert.equal(vue.problems.length, 1);
  });

  test('slot not declared', () => {
    const used = checkLayout(base({ body: '<main>${content}</main>\n<aside>${slot:x}</aside>' }));
    assert.equal(used.ok, false);
    assert.equal(used.problems[0].line, 10);
    assert.ok(hasProblem(used, '"x"'));

    const declared = checkLayout(base({ slots: { y: { label: 'Y' } } }));
    assert.equal(declared.ok, false);
    assert.ok(hasProblem(declared, '"y"'));
  });

  test('a slot must be alone inside its element', () => {
    const result = checkLayout(base({
      slots: { aside: {} },
      body: '<main>${content}</main><aside>${slot:aside}<p>x</p></aside>',
    }));
    assert.equal(result.ok, false);
    assert.ok(hasProblem(result, 'slot:aside'));
  });

  test('content twice / content missing (base)', () => {
    const twice = checkLayout(base({ body: '<main>${content}<article>${content}</article></main>' }));
    assert.equal(twice.ok, false);
    assert.ok(hasProblem(twice, 'content'));

    const missing = checkLayout(base({ body: '<main><p>x</p></main>' }));
    assert.equal(missing.ok, false);
    assert.ok(hasProblem(missing, 'content'));

    const outside = checkLayout(base({ body: '<main></main><aside>${content}</aside>' }));
    assert.equal(outside.ok, false);
    assert.ok(hasProblem(outside, '<main>'));
  });

  test('a base needs exactly one main', () => {
    const none = checkLayout(base({ body: '<aside><p>${content}</p></aside>' }));
    assert.ok(hasProblem(none, '<main>'));
    const two = checkLayout(base({ body: '<main>${content}</main><main></main>' }));
    assert.ok(hasProblem(two, '<main>'));
  });

  test('content twice / content missing (child)', () => {
    const twice = checkLayout(child('<article>${content}</article>\n<section>${content}</section>'));
    assert.equal(twice.ok, false);
    assert.ok(hasProblem(twice, 'content'));

    const missing = checkLayout(child('<article><p>x</p></article>'));
    assert.equal(missing.ok, false);
    assert.ok(hasProblem(missing, 'content'));
  });

  test('a fragment has no content requirement', () => {
    const result = checkLayout('<nav><ul><li><a href="/">Home</a></li></ul></nav>', { fragment: true });
    assert.equal(result.kind, 'fragment');
    assert.deepEqual(result.problems, []);
    assert.equal(result.ok, true);
  });

  test('source with no document markup is a fragment', () => {
    const result = checkLayout('<footer>\n<p>&copy; ${title}</p>\n</footer>');
    assert.equal(result.kind, 'fragment');
    assert.equal(result.ok, true);
  });

  test('a fragment flags non-blocks', () => {
    const result = checkLayout('<p>a</p>\n<table></table>', { fragment: true });
    assert.equal(result.ok, false);
    assert.equal(result.problems[0].line, 2);
    assert.match(result.problems[0].message, /<table>/);
  });

  test('data-repeat on li and on text blocks', () => {
    const li = '<nav><ul><li data-repeat="collections.blog | limit:3 as post"><a href="${post.url}">${post.title}</a></li></ul></nav>';
    const ok = checkLayout(base({ body: `<main>\${content}${li}</main>` }));
    assert.deepEqual(ok.problems, []);

    const sibling = checkLayout(base({ body: `<main>\${content}<ul><li data-repeat="collections.blog | limit:3 as post">x</li><li>\${post.title}</li></ul></main>` }));
    assert.equal(sibling.ok, false);
    assert.ok(hasProblem(sibling, '"post.title"'));

    const p = checkLayout(base({ body: '<main>${content}<p data-repeat="links as l">${l.label}</p></main>' }), { lists: ['links'] });
    assert.deepEqual(p.problems, []);
  });

  test('list', () => {
    const list = '<ul data-repeat="collections.blog | limit:3 as post"><li>${post.title}</li></ul>';
    const ok = checkLayout(base({ body: `<main>\${content}${list}</main>` }));
    assert.deepEqual(ok.problems, []);
    assert.ok(!ok.fields.includes('post.title'));

    const outside = checkLayout(base({ body: `<main>\${content}${list}<p>\${post.title}</p></main>` }));
    assert.equal(outside.ok, false);
    assert.ok(hasProblem(outside, '"post.title"'));

    const nope = base({ body: '<main>${content}<ul data-repeat="nope.x as item"><li>${item.name}</li></ul></main>' });
    const nopeResult = checkLayout(nope);
    assert.equal(nopeResult.ok, false);
    assert.ok(hasProblem(nopeResult, 'nope.x'));
    assert.deepEqual(checkLayout(nope, { lists: ['nope'] }).problems, []);
  });

  test('list sources, index, nested lists and bad pipes', () => {
    const ok = checkLayout(base({
      body: '<main>${content}'
        + '<section data-repeat="programs as prog, i"><h2>${prog.title} ${i}</h2>'
        + '<ul data-repeat="prog.tags as tag"><li>${tag}</li></ul></section>'
        + '<ol data-repeat="programAreas.docs | offset:1 as p"><li>${p.url}</li></ol>'
        + '</main>',
    }));
    assert.deepEqual(ok.problems, []);

    const badPipe = checkLayout(base({ body: '<main>${content}<ul data-repeat="collections.blog | sort as post"><li>x</li></ul></main>' }));
    assert.ok(hasProblem(badPipe, 'sort'));

    const badSyntax = checkLayout(base({ body: '<main>${content}<ul data-repeat="collections.blog"><li>x</li></ul></main>' }));
    assert.equal(badSyntax.ok, false);
  });

  test('data-if', () => {
    const ok = checkLayout(base({
      slots: { aside: {} },
      body: '<main>${content}<p data-if="image">x</p>'
        + '<ul data-repeat="collections.blog as post"><li data-if="post.image">y</li></ul></main>'
        + '<aside data-if="slot:aside">${slot:aside}</aside>',
    }));
    assert.deepEqual(ok.problems, []);

    const twoKeys = checkLayout(base({ body: '<main>${content}<p data-if="a b">x</p></main>' }));
    assert.equal(twoKeys.ok, false);
    assert.ok(hasProblem(twoKeys, 'a b'));

    const unknown = checkLayout(base({ body: '<main>${content}<p data-unless="imag">x</p></main>' }));
    assert.ok(hasProblem(unknown, '"imag"'));
  });

  test('inline handler', () => {
    const p = checkLayout(base({ body: '<main>${content}<p onclick="go()">x</p></main>' }));
    assert.equal(p.ok, false);
    assert.ok(hasProblem(p, 'onclick'));
    const component = checkLayout(base({ body: '<main>${content}<my-card onmouseover="go()"></my-card></main>' }));
    assert.ok(hasProblem(component, 'onmouseover'));
  });

  test('head', () => {
    const div = checkLayout(base({ head: '<div></div>' }));
    assert.equal(div.ok, false);
    assert.equal(div.problems[0].line, 6);
    assert.match(div.problems[0].message, /<div>/);

    const slotHead = checkLayout(base({ slots: { head: {} }, head: '<meta name="x" content="${description}">\n${slot:head}' }));
    assert.deepEqual(slotHead.problems, []);
    assert.deepEqual(slotHead.slots, []);

    const notLast = checkLayout(base({ slots: { head: {} }, head: '${slot:head}\n<meta name="x" content="y">' }));
    assert.equal(notLast.ok, false);
  });

  test('a child fills the head slot with head items only', () => {
    const ok = checkLayout(child('<article>${content}</article>\n<template slot="head"><meta property="og:title" content="${title}"></template>'));
    assert.deepEqual(ok.problems, []);
    const bad = checkLayout(child('<article>${content}</article>\n<template slot="head"><p>x</p></template>'));
    assert.equal(bad.ok, false);
    assert.equal(bad.problems[0].line, 4);
  });

  test('bad page layout', () => {
    const weird = checkLayout(base({ attrs: ' data-page-layout="weird"' }));
    assert.equal(weird.ok, false);
    assert.equal(weird.problems[0].line, 8);
    assert.ok(hasProblem(weird, 'weird'));
    assert.deepEqual(checkLayout(base({ attrs: ' data-page-layout="${pageLayout}"' })).problems, []);
    assert.deepEqual(checkLayout(base({ attrs: ' data-page-layout="holy-grail"' })).problems, []);
  });

  test('bad info JSON', () => {
    const result = checkLayout(base({ info: '{ "format": 1, ' }));
    assert.equal(result.ok, false);
    assert.equal(result.kind, 'base');
    assert.equal(result.problems.length, 1);
    assert.equal(result.problems[0].line, 4);
  });

  test('format 2', () => {
    const result = checkLayout(base({ info: '{ "format": 2 }' }));
    assert.equal(result.ok, false);
    assert.equal(result.problems[0].line, 4);
    assert.match(result.problems[0].message, /format/);
  });

  test('line numbers survive comments and multi-line attributes', () => {
    const html = base({
      body: [
        '<!-- a <div> in a comment',
        '     spanning lines -->',
        '<main',
        '  id="main"',
        '  class="x">',
        '${content}',
        '<p>ok</p>',
        '<div',
        '  class="bad">',
        '</div>',
        '</main>',
      ].join('\n'),
    });
    const result = checkLayout(html);
    assert.equal(result.problems.length, 1);
    assert.equal(result.problems[0].line, 16);
  });
});

describe('parseLayoutSource', () => {
  test('kinds and parent', () => {
    assert.equal(parseLayoutSource(fixture('base.html')).kind, 'base');
    const c = parseLayoutSource(fixture('child.html'));
    assert.equal(c.kind, 'child');
    assert.equal(c.parent, 'base');
    assert.equal(parseLayoutSource('<nav></nav>').kind, 'fragment');
    assert.equal(parseLayoutSource(fixture('base.html'), { fragment: true }).kind, 'fragment');
  });

  test('info and infoError', () => {
    const ok = parseLayoutSource(fixture('base.html'));
    assert.equal(ok.info.format, 1);
    assert.equal(ok.infoError, null);
    const bad = parseLayoutSource(base({ info: '{nope' }));
    assert.equal(bad.info, null);
    assert.equal(typeof bad.infoError, 'string');
    const none = parseLayoutSource(fixture('plain-post.html'));
    assert.equal(none.info, null);
    assert.equal(none.infoError, null);
  });

  test('lineOf skips raw script text and gives implied elements their parent line', () => {
    const src = '<!doctype html>\n<html>\n<head>\n<script>const s = "<p>";</script>\n</head>\n<body>\n<p>x</p>\n</body>\n</html>';
    const { document, lineOf } = parseLayoutSource(src);
    assert.equal(lineOf(document.querySelector('p')), 7);
    const frag = parseLayoutSource('\n\n<nav>\n<ul><li>a</li></ul></nav>', { fragment: true });
    assert.equal(frag.lineOf(frag.document.querySelector('li')), 4);
    assert.equal(frag.lineOf(frag.document.body), 1);
  });
});
