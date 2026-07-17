/**
 * @file named-slots.test.js
 * @description Tests named slot support in the REAL replace-components
 * plugin (scripts/plugins/replace-components.js).
 *
 * Named slots allow component consumers to inject content into specific
 * regions of a template using the slot="name" attribute on child elements.
 * Template placeholders use ${slot:name} syntax. Unassigned children go
 * to the default ${slot}.
 *
 * Component templates are seeded into store.cachedComponents so no disk
 * I/O happens.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseHTML } from 'linkedom';

import replaceComponents from '../scripts/plugins/replace-components.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAGE = (body) => `<!DOCTYPE html>
<html lang="en">
<head><title>t</title></head>
<body>${body}</body>
</html>`;

async function run(body, cachedComponents, data = {}) {
  const file = { ext: 'html', path: 'dist/index.html', name: 'index', src: PAGE(body) };
  await replaceComponents({ file, store: { cachedComponents }, data, allowType: ['.html'] });
  return file;
}

function doc(file) {
  return parseHTML(file.src).document;
}

// ============================================================================
// Tests
// ============================================================================

describe('Named Slots', () => {

  // --------------------------------------------------------------------------
  // Slot extraction (host children → slot data)
  // --------------------------------------------------------------------------

  describe('slot extraction', () => {

    it('should extract default slot from plain children', async () => {
      const file = await run(
        '<my-box><p>Hello</p><p>World</p></my-box>',
        { 'my-box.html': '<div class="box">${slot}</div>' }
      );
      const box = doc(file).querySelector('.box');
      assert.ok(!!box);
      assert.strictEqual(box.innerHTML, '<p>Hello</p><p>World</p>');
    });

    it('should extract a single named slot', async () => {
      const file = await run(
        '<my-box><div slot="header"><h1>Title</h1></div></my-box>',
        { 'my-box.html': '<header class="hd">${slot:header}</header><main class="mn">${slot}</main>' }
      );
      const d = doc(file);
      assert.strictEqual(d.querySelector('.hd').innerHTML, '<div><h1>Title</h1></div>');
      assert.strictEqual(d.querySelector('.mn').innerHTML, '');
    });

    it('should extract multiple named slots', async () => {
      const file = await run(
        '<my-box><div slot="header"><h1>Title</h1></div><div slot="footer"><p>Footer</p></div></my-box>',
        { 'my-box.html': '<header class="hd">${slot:header}</header><footer class="ft">${slot:footer}</footer><main class="mn">${slot}</main>' }
      );
      const d = doc(file);
      assert.strictEqual(d.querySelector('.hd').innerHTML, '<div><h1>Title</h1></div>');
      assert.strictEqual(d.querySelector('.ft').innerHTML, '<div><p>Footer</p></div>');
      assert.strictEqual(d.querySelector('.mn').innerHTML, '');
    });

    it('should separate named and default slot content', async () => {
      const file = await run(
        '<my-box><div slot="actions"><button>Save</button></div><p>Main content here</p></my-box>',
        { 'my-box.html': '<div class="acts">${slot:actions}</div><main class="mn">${slot}</main>' }
      );
      const d = doc(file);
      assert.strictEqual(d.querySelector('.acts').innerHTML, '<div><button>Save</button></div>');
      assert.strictEqual(d.querySelector('.mn').innerHTML, '<p>Main content here</p>');
    });

    it('should remove the slot attribute from named slot content', async () => {
      const file = await run(
        '<my-icon><span slot="icon">★</span></my-icon>',
        { 'my-icon.html': '<i class="wrap">${slot:icon}</i>' }
      );
      const wrap = doc(file).querySelector('.wrap');
      assert.strictEqual(wrap.innerHTML, '<span>★</span>');
      assert.ok(!wrap.innerHTML.includes('slot='));
    });

    it('should concatenate multiple elements with the same slot name', async () => {
      const file = await run(
        '<my-list><li slot="items">One</li><li slot="items">Two</li><li slot="items">Three</li></my-list>',
        { 'my-list.html': '<ul class="lst">${slot:items}</ul>' }
      );
      const lst = doc(file).querySelector('.lst');
      assert.strictEqual(lst.innerHTML, '<li>One</li><li>Two</li><li>Three</li>');
    });

    it('should handle text nodes as default slot content', async () => {
      const file = await run(
        '<my-box>Just some text</my-box>',
        { 'my-box.html': '<div class="box">${slot}</div>' }
      );
      const box = doc(file).querySelector('.box');
      assert.strictEqual(box.textContent, 'Just some text');
    });

    it('should ignore whitespace-only text nodes', async () => {
      const file = await run(
        '<my-box>   \n   </my-box>',
        { 'my-box.html': '<div class="box">${slot}</div>' }
      );
      const box = doc(file).querySelector('.box');
      assert.strictEqual(box.innerHTML, '');
    });

    it('should handle mixed text and element children', async () => {
      const file = await run(
        '<my-box>Before <strong>bold</strong> after</my-box>',
        { 'my-box.html': '<div class="box">${slot}</div>' }
      );
      const box = doc(file).querySelector('.box');
      assert.ok(box.innerHTML.includes('Before'));
      assert.ok(box.innerHTML.includes('<strong>bold</strong>'));
      assert.ok(box.innerHTML.includes('after'));
    });

    it('should handle empty element (no children)', async () => {
      const file = await run(
        '<my-box></my-box>',
        { 'my-box.html': '<div class="box">${slot}</div>' }
      );
      const box = doc(file).querySelector('.box');
      assert.strictEqual(box.innerHTML, '');
    });

    it('should handle named slots with complex nested content', async () => {
      const file = await run(
        '<my-page><section slot="sidebar"><nav><ul><li>A</li><li>B</li></ul></nav></section><article>Main body</article></my-page>',
        { 'my-page.html': '<aside class="sb">${slot:sidebar}</aside><main class="mn">${slot}</main>' }
      );
      const d = doc(file);
      const sb = d.querySelector('.sb');
      assert.ok(sb.innerHTML.includes('<nav>'));
      assert.ok(sb.innerHTML.includes('<li>A</li>'));
      assert.strictEqual(d.querySelector('.mn').innerHTML, '<article>Main body</article>');
    });
  });

  // --------------------------------------------------------------------------
  // Template rendering with named slots
  // --------------------------------------------------------------------------

  describe('template rendering with named slots', () => {

    it('should replace ${slot} with default slot content', async () => {
      const file = await run(
        '<my-card><p>Hello</p></my-card>',
        { 'my-card.html': '<div class="card">${slot}</div>' }
      );
      assert.strictEqual(doc(file).querySelector('.card').innerHTML, '<p>Hello</p>');
    });

    it('should replace ${slot:name} with named slot content', async () => {
      const file = await run(
        '<my-layout><h1 slot="header">Title</h1><p>Body</p></my-layout>',
        { 'my-layout.html': '<header class="hd">${slot:header}</header><main class="mn">${slot}</main>' }
      );
      const d = doc(file);
      assert.strictEqual(d.querySelector('.hd').innerHTML, '<h1>Title</h1>');
      assert.strictEqual(d.querySelector('.mn').innerHTML, '<p>Body</p>');
    });

    it('should collapse missing named slots to empty string', async () => {
      const file = await run(
        '<my-layout><p>Body</p></my-layout>',
        { 'my-layout.html': '<header class="hd">${slot:header}</header><aside class="sb">${slot:sidebar}</aside><main class="mn">${slot}</main>' }
      );
      const d = doc(file);
      assert.strictEqual(d.querySelector('.hd').innerHTML, '');
      assert.strictEqual(d.querySelector('.sb').innerHTML, '');
      assert.strictEqual(d.querySelector('.mn').innerHTML, '<p>Body</p>');
      assert.ok(!file.src.includes('${slot:'));
    });

    it('should keep non-slot variables that are not found', async () => {
      const file = await run(
        '<my-thing>Content</my-thing>',
        { 'my-thing.html': '<h1 class="t">${title}</h1><main class="mn">${slot}</main>' }
      );
      // ${title} has no attribute value — stays literal for later processing
      assert.ok(file.src.includes('${title}'));
      assert.strictEqual(doc(file).querySelector('.mn').innerHTML, 'Content');
    });

    it('should replace both named slots and regular variables', async () => {
      const file = await run(
        '<my-page title="My Page"><a slot="nav" href="/">Home</a><p>Body</p></my-page>',
        { 'my-page.html': '<h1 class="t">${title}</h1><nav class="nv">${slot:nav}</nav><main class="mn">${slot}</main>' }
      );
      const d = doc(file);
      assert.strictEqual(d.querySelector('.t').textContent, 'My Page');
      assert.strictEqual(d.querySelector('.nv').innerHTML, '<a href="/">Home</a>');
      assert.strictEqual(d.querySelector('.mn').innerHTML, '<p>Body</p>');
    });

    it('should handle template with only named slots (no default)', async () => {
      const file = await run(
        '<my-frame><h1 slot="header">Hi</h1><p slot="footer">Bye</p></my-frame>',
        { 'my-frame.html': '<div class="layout"><header class="hd">${slot:header}</header><footer class="ft">${slot:footer}</footer></div>' }
      );
      const d = doc(file);
      assert.strictEqual(d.querySelector('.hd').innerHTML, '<h1>Hi</h1>');
      assert.strictEqual(d.querySelector('.ft').innerHTML, '<p>Bye</p>');
    });

    it('should handle multiple occurrences of the same named slot', async () => {
      const file = await run(
        '<my-echo><b slot="title">Hello</b></my-echo>',
        { 'my-echo.html': '<div class="d1">${slot:title}</div><span class="d2">${slot:title}</span>' }
      );
      const d = doc(file);
      assert.strictEqual(d.querySelector('.d1').innerHTML, '<b>Hello</b>');
      assert.strictEqual(d.querySelector('.d2').innerHTML, '<b>Hello</b>');
    });
  });

  // --------------------------------------------------------------------------
  // End-to-end slot processing
  // --------------------------------------------------------------------------

  describe('End-to-end slot processing', () => {

    it('should process a card component with named header and footer slots', async () => {
      const file = await run(
        '<product-card>' +
          '<h2 slot="header">Product Name</h2>' +
          '<p>Product description goes here.</p>' +
          '<div slot="footer"><button>Buy</button></div>' +
        '</product-card>',
        {
          'product-card.html':
            '<article class="card">' +
            '<header>${slot:header}</header>' +
            '<div class="body">${slot}</div>' +
            '<footer>${slot:footer}</footer>' +
            '</article>',
        }
      );

      const d = doc(file);
      assert.strictEqual(d.querySelector('.card header').innerHTML, '<h2>Product Name</h2>');
      assert.strictEqual(d.querySelector('.card .body').innerHTML, '<p>Product description goes here.</p>');
      assert.strictEqual(d.querySelector('.card footer').innerHTML, '<div><button>Buy</button></div>');
    });

    it('should handle a component with no named slots (backwards compatible)', async () => {
      const file = await run(
        '<my-wrap><p>Simple content</p></my-wrap>',
        { 'my-wrap.html': '<div class="wrapper">${slot}</div>' }
      );
      assert.strictEqual(doc(file).querySelector('.wrapper').innerHTML, '<p>Simple content</p>');
    });

    it('should collapse unused named slots in the template', async () => {
      const file = await run(
        '<my-opt><p>Just default content</p></my-opt>',
        { 'my-opt.html': '<div class="opt">${slot:optional}</div><main class="mn">${slot}</main>' }
      );
      const d = doc(file);
      assert.strictEqual(d.querySelector('.opt').innerHTML, '');
      assert.strictEqual(d.querySelector('.mn').innerHTML, '<p>Just default content</p>');
    });

    it('should merge slot data with attribute data for rendering', async () => {
      const file = await run(
        '<my-item title="Trail Pack"><span slot="badge">New</span><p>Item details</p></my-item>',
        { 'my-item.html': '<div class="item"><span class="badge">${slot:badge}</span><h3>${title}</h3>${slot}</div>' }
      );
      const d = doc(file);
      assert.strictEqual(d.querySelector('.badge').innerHTML, '<span>New</span>');
      assert.strictEqual(d.querySelector('h3').textContent, 'Trail Pack');
      assert.ok(d.querySelector('.item').innerHTML.includes('<p>Item details</p>'));
    });

    it('should work with repeat-generated content providing named slots', async () => {
      // Simulates what happens when data-repeat generates elements with
      // slot attributes that then get processed by replace-components
      const file = await run(
        '<gear-card>' +
          '<img slot="image" src="/img/pack.jpg" alt="Pack">' +
          '<span slot="price">$189</span>' +
          '<p>A great pack for trails.</p>' +
        '</gear-card>',
        {
          'gear-card.html':
            '<article class="product-card">' +
            '<figure>${slot:image}</figure>' +
            '<div class="info">${slot}<span class="price">${slot:price}</span></div>' +
            '</article>',
        }
      );

      const d = doc(file);
      const img = d.querySelector('.product-card figure img');
      assert.ok(!!img);
      assert.strictEqual(img.getAttribute('src'), '/img/pack.jpg');
      assert.strictEqual(img.getAttribute('alt'), 'Pack');
      assert.strictEqual(d.querySelector('.price').innerHTML, '<span>$189</span>');
      assert.ok(d.querySelector('.info').innerHTML.includes('<p>A great pack for trails.</p>'));
    });
  });
});
