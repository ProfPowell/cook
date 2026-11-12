/**
 * @file conditionals.test.js
 * @description `isSet` and `applyConditionals`: `data-if` / `data-unless`
 * as a tag-matching string transform, plus the layout-time and late-pass
 * lookups.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { isSet, applyConditionals, layoutConditionals, lateConditionals } from '../scripts/utils/layouts/conditionals.js';
import { renderLayout } from '../scripts/utils/layouts/render.js';

// A lookup over a plain object where every key is known
const all = (obj) => (key) => ({ known: true, value: key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj) });
// A lookup that knows only the listed keys
const only = (obj) => (key) => (key.split('.')[0] in obj
  ? { known: true, value: key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj) }
  : { known: false });

describe('isSet', () => {
  const cases = [
    [undefined, false], [null, false], ['', false], [false, false], [[], false],
    ['   ', false], ['\n\t ', false],
    ['x', true], [' x ', true], [0, true], [1, true], [true, true], [['a'], true], [{}, true],
  ];
  for (const [value, expected] of cases) {
    test(`${JSON.stringify(value)} → ${expected}`, () => {
      assert.equal(isSet(value), expected);
    });
  }
});

describe('applyConditionals', () => {
  test('no marker: the same string comes back', () => {
    const html = '<div class="a">  <p>${x}</p>\n<!-- c --></div>';
    assert.equal(applyConditionals(html, () => { throw new Error('no lookup expected'); }), html);
  });

  test('data-if set: attribute stripped with its preceding whitespace', () => {
    assert.equal(
      applyConditionals('<a><figure class="f"  data-if="image">x</figure></a>', all({ image: 'i.png' })),
      '<a><figure class="f">x</figure></a>',
    );
  });

  test('data-if not set: the element goes, bytes around it stay', () => {
    assert.equal(
      applyConditionals('a\n  <figure data-if="image"><img src="x"></figure>\nb', all({ image: '' })),
      'a\n  \nb',
    );
  });

  test('data-unless', () => {
    assert.equal(applyConditionals('<p data-unless="tags">none</p>', all({ tags: [] })), '<p>none</p>');
    assert.equal(applyConditionals('<p data-unless="tags">none</p>', all({ tags: ['a'] })), '');
  });

  test('quoting styles and bare-value attributes', () => {
    const look = all({ a: 1 });
    assert.equal(applyConditionals("<p data-if='a'>x</p>", look), '<p>x</p>');
    assert.equal(applyConditionals('<p data-if=a>x</p>', look), '<p>x</p>');
    assert.equal(applyConditionals('<p DATA-IF="a" id="i">x</p>', look), '<p id="i">x</p>');
    assert.equal(applyConditionals('<p data-if = "a">x</p>', look), '<p>x</p>');
  });

  test('an unknown key is left untouched', () => {
    const html = '<div data-if="later"><p data-unless="later.x">x</p></div>';
    assert.equal(applyConditionals(html, only({})), html);
  });

  test('known keys inside an unknown element are still decided', () => {
    assert.equal(
      applyConditionals('<div data-if="later"><p data-if="a">x</p><p data-if="b">y</p></div>', only({ a: 'y', b: '' })),
      '<div data-if="later"><p>x</p></div>',
    );
  });

  test('nested conditionals', () => {
    const html = '<section data-if="a"><h2 data-unless="b">t</h2><div data-if="c"><p data-if="a">x</p></div></section><i>z</i>';
    assert.equal(applyConditionals(html, all({ a: 1, b: 1, c: 1 })), '<section><div><p>x</p></div></section><i>z</i>');
    assert.equal(applyConditionals(html, all({ a: 1, b: 0 === 1, c: null })), '<section><h2>t</h2></section><i>z</i>');
    assert.equal(applyConditionals(html, all({ a: '' })), '<i>z</i>');
  });

  test('nested same-name elements', () => {
    assert.equal(
      applyConditionals('<div data-if="a"><div><div>x</div></div></div><div>keep</div>', all({})),
      '<div>keep</div>',
    );
  });

  test('void elements and self-closing tags', () => {
    assert.equal(applyConditionals('<p><img data-if="a" src="x">text</p>', all({})), '<p>text</p>');
    assert.equal(applyConditionals('<p><img src="x" data-if="a">text</p>', all({ a: 'y' })), '<p><img src="x">text</p>');
    assert.equal(applyConditionals('<svg><path data-if="a" d="M0"/><g></g></svg>', all({})), '<svg><g></g></svg>');
    assert.equal(applyConditionals('<br data-unless="a"/>', all({})), '<br/>');
  });

  test('attribute values containing >', () => {
    assert.equal(
      applyConditionals('<p title="a > b" data-if="a">x</p><b>y</b>', all({})),
      '<b>y</b>',
    );
    assert.equal(
      applyConditionals('<div data-if="a"><p title="</div>">x</p></div><b>y</b>', all({})),
      '<b>y</b>',
    );
  });

  test('comments and raw text are not markup', () => {
    // A commented-out conditional is not touched
    const commented = '<!-- <p data-if="a">x</p> --><b>y</b>';
    assert.equal(applyConditionals(commented, all({})), commented);
    // Script/style text is not markup, even inside a removed element
    const script = '<script>const s = "<p data-if=\'a\'>";</script>';
    assert.equal(applyConditionals(script, all({})), script);
    assert.equal(
      applyConditionals('<div data-if="a"><script>"</div>"</script><!-- </div> --></div><b>y</b>', all({})),
      '<b>y</b>',
    );
    // A script element itself can be conditional
    assert.equal(applyConditionals('<script data-if="a">x("</p>")</script><b>y</b>', all({})), '<b>y</b>');
  });

  test('an element never closed ends where its parent closes', () => {
    assert.equal(applyConditionals('<ul><li data-if="a">one</ul><b>y</b>', all({})), '<ul></ul><b>y</b>');
    assert.equal(applyConditionals('<div><p data-if="a">one</div>', all({})), '<div></div>');
    assert.equal(applyConditionals('<p data-if="a">to the end', all({})), '');
  });

  test('optional end tags: an element ends where HTML ends it', () => {
    const none = all({});
    // p ends at a start tag that closes a p
    assert.equal(applyConditionals('<p data-if="a">one<p>two</p><div>rest</div>', none), '<p>two</p><div>rest</div>');
    assert.equal(applyConditionals('<p data-if="a">one<div>rest</div>', none), '<div>rest</div>');
    assert.equal(applyConditionals('<p data-if="a">one <b>bold</b> <h2>h</h2>', none), '<h2>h</h2>');
    // li ends at the next li, or at the parent's end
    assert.equal(applyConditionals('<ul><li data-if="a">one<li>two</ul>', none), '<ul><li>two</ul>');
    assert.equal(applyConditionals('<ul><li>one<li data-if="a">two</ul><p>after</p>', none), '<ul><li>one</ul><p>after</p>');
    // a nested list inside the removed li goes with it
    assert.equal(applyConditionals('<ul><li data-if="a">one<ul><li>x<li>y</ul><li>two</ul>', none), '<ul><li>two</ul>');
    // dt/dd, option, tr, td
    assert.equal(applyConditionals('<dl><dt data-if="a">t<dd>d</dl>', none), '<dl><dd>d</dl>');
    assert.equal(applyConditionals('<dl><dt>t<dd data-if="a">d<dt>u</dl>', none), '<dl><dt>t<dt>u</dl>');
    assert.equal(applyConditionals('<select><option data-if="a">x<option>y</select>', none), '<select><option>y</select>');
    assert.equal(applyConditionals('<table><tr data-if="a"><td>1<td>2<tr><td>3</table>', none), '<table><tr><td>3</table>');
    assert.equal(applyConditionals('<table><tr><td data-if="a">1<td>2</table>', none), '<table><tr><td>2</table>');
    assert.equal(applyConditionals('<table><tr><td data-if="a">1<tr><td>2</table>', none), '<table><tr><tr><td>2</table>');
  });

  test('never removes past the end of the enclosing element', () => {
    const none = all({});
    assert.equal(applyConditionals('<section><span data-if="a">x</section><p>after</p>', none), '<section></section><p>after</p>');
    assert.equal(applyConditionals('<div><p data-if="a">one</div><div>two</div>', none), '<div></div><div>two</div>');
  });

  test('works on full documents', () => {
    const doc = '<!doctype html>\n<html lang="en">\n<head><title>T</title></head>\n<body>\n<aside data-if="slot:aside">${slot:aside}</aside>\n</body>\n</html>\n';
    assert.equal(
      applyConditionals(doc, all({})),
      '<!doctype html>\n<html lang="en">\n<head><title>T</title></head>\n<body>\n\n</body>\n</html>\n',
    );
  });

  test('keys under a data-repeat alias are unknown (left for the repeat)', () => {
    const html = '<ul data-repeat="posts as post"><li><img data-if="post.image" src="${post.image}"><b data-if="i">i</b></li></ul>';
    assert.equal(
      applyConditionals(html, all({ post: { image: 'x' }, i: '' })),
      '<ul data-repeat="posts as post"><li><img data-if="post.image" src="${post.image}"></li></ul>',
    );
    // The alias also covers the repeat element itself, and the index name
    const own = '<li data-repeat="items as item, n" data-if="item.on" data-unless="n">x</li>';
    assert.equal(applyConditionals(own, all({})), own);
    // Outside the repeat the same name is an ordinary key
    assert.equal(applyConditionals('<ul data-repeat="xs as post"></ul><p data-if="post">x</p>', all({})), '<ul data-repeat="xs as post"></ul>');
  });

  test('an empty key is left alone', () => {
    const html = '<p data-if="">x</p><p data-unless>y</p>';
    assert.equal(applyConditionals(html, all({})), html);
  });
});

describe('layoutConditionals (layout-time lookup)', () => {
  test('page fields, site data and slots are known; others survive', () => {
    const html = '<figure data-if="image">f</figure><p data-if="tagline">t</p><aside data-if="slot:aside">a</aside><nav data-if="later">n</nav>';
    assert.equal(
      layoutConditionals(html, { image: '', 'slot:aside': '  \n' }, { tagline: 'Hi' }),
      '<p>t</p><nav data-if="later">n</nav>',
    );
    assert.equal(
      layoutConditionals(html, { image: 'i.png', 'slot:aside': '<b>x</b>' }, {}),
      '<figure>f</figure><p data-if="tagline">t</p><aside>a</aside><nav data-if="later">n</nav>',
    );
  });

  test('an absent slot is known and not set', () => {
    assert.equal(layoutConditionals('<aside data-if="slot:aside">a</aside>', {}, {}), '');
  });

  test('page data wins over site data', () => {
    assert.equal(layoutConditionals('<p data-if="x">x</p>', { x: '' }, { x: 'y' }), '');
  });
});

describe('lateConditionals (late-pass lookup)', () => {
  test('every key is known; missing means not set', () => {
    assert.equal(
      lateConditionals('<p data-if="siteTagline">t</p><p data-if="nope">n</p><p data-unless="nope">u</p>', { siteTagline: 'Yes' }),
      '<p>t</p><p>u</p>',
    );
  });
});

describe('renderLayout with layout conditionals', () => {
  const layouts = {
    base: '<body><main>${content}</main><aside data-if="slot:aside">${slot:aside}</aside></body>',
    post: '<body data-template="base"><figure data-if="image"><img src="${image}"></figure>${content}<template slot="aside">${slot:aside}</template></body>',
    gated: '<body data-template="base">${content}<template slot="aside" data-if="showAside">side</template></body>',
  };
  const opts = { loadLayout: async (n) => layouts[n] ?? null, data: {}, conditionals: layoutConditionals };

  test('a forwarded empty slot removes the parent aside', async () => {
    const out = await renderLayout('post', { content: 'c', image: 'i.png' }, opts);
    assert.equal(out, '<body><main><figure><img src="i.png"></figure>c</main></body>');
  });

  test('a forwarded filled slot keeps it', async () => {
    const out = await renderLayout('post', { content: 'c', 'slot:aside': 'S', image: null }, opts);
    assert.equal(out, '<body><main>c</main><aside>S</aside></body>');
  });

  test('an unknown key in the layout body survives for the late pass', async () => {
    const out = await renderLayout('post', { content: 'c' }, opts);
    assert.equal(out, '<body><main><figure data-if="image"><img src="${image}"></figure>c</main></body>');
  });

  test('a dropped slot template leaves that slot empty', async () => {
    assert.equal(await renderLayout('gated', { content: 'c' }, opts), '<body><main>c</main></body>');
    assert.equal(await renderLayout('gated', { content: 'c', showAside: false }, opts), '<body><main>c</main></body>');
    assert.equal(await renderLayout('gated', { content: 'c', showAside: true }, opts), '<body><main>c</main><aside>side</aside></body>');
  });

  test("a slot template's own key cannot wait for the late pass: missing is not set", async () => {
    // The template element is unwrapped here, so its own data-if has no later pass
    assert.equal(layoutConditionals('<template slot="a" data-if="x"><p data-if="y">p</p></template>', {}, {}), '');
    // Only that template goes: what follows it stays
    assert.equal(layoutConditionals('<template slot="a" data-if="x">a</template>\n<p>more</p>', {}, {}), '\n<p>more</p>');
    assert.equal(
      layoutConditionals('<template slot="a" data-if="x"><template>n</template></template><p data-if="z">m</p>', {}, {}),
      '<p data-if="z">m</p>',
    );
    assert.equal(
      layoutConditionals('<template slot="a" data-if="x">a</template>\n<p>more</p>', { x: 1 }, {}),
      '<template slot="a">a</template>\n<p>more</p>',
    );
    assert.equal(
      layoutConditionals('<template slot="a" data-unless="x"><p data-if="y">p</p></template>', {}, {}),
      '<template slot="a"><p data-if="y">p</p></template>',
    );
  });

  test('page content containing data-if is never evaluated at layout time', async () => {
    const out = await renderLayout('base', { content: '<p data-if="nope">x</p>' }, opts);
    assert.equal(out, '<body><main><p data-if="nope">x</p></main></body>');
  });
});
