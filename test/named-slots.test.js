/**
 * @file named-slots.test.js
 * @description Tests for named slot support in component templates
 *
 * Named slots allow component consumers to inject content into specific
 * regions of a template using the slot="name" attribute on child elements.
 * Template placeholders use ${slot:name} syntax. Unassigned children go
 * to the default ${slot}.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';

// ---------------------------------------------------------------------------
// Replicate the core slot logic from replace-components.js for unit testing
// ---------------------------------------------------------------------------

function extractSlots(html) {
  const dom = new JSDOM(`<div id="root">${html}</div>`);
  const element = dom.window.document.getElementById('root');

  const namedSlots = {};
  const defaultParts = [];

  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === 1 /* ELEMENT_NODE */) {
      const slotName = child.getAttribute && child.getAttribute('slot');
      if (slotName) {
        child.removeAttribute('slot');
        namedSlots[slotName] = (namedSlots[slotName] || '') + child.outerHTML;
      } else {
        defaultParts.push(child.outerHTML);
      }
    } else if (child.textContent.trim()) {
      defaultParts.push(child.textContent);
    }
  }

  const data = {};
  data.slot = defaultParts.join('').trim();
  for (const [name, content] of Object.entries(namedSlots)) {
    data[`slot:${name}`] = content;
  }
  return data;
}

function renderTemplate(template, data) {
  return template.replace(/\$\{([^}]+)\}/g, (match, key) => {
    const trimmedKey = key.trim();

    if (data[trimmedKey] !== undefined && data[trimmedKey] !== null) {
      return data[trimmedKey];
    }

    if (trimmedKey.includes('.')) {
      const value = trimmedKey.split('.').reduce((cur, k) =>
        cur && cur[k] !== undefined ? cur[k] : undefined, data);
      if (value !== undefined && value !== null) return value;
    }

    if (trimmedKey.startsWith('slot:')) return '';

    return match;
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('Named Slots', () => {

  // --------------------------------------------------------------------------
  // extractSlots
  // --------------------------------------------------------------------------

  describe('extractSlots', () => {

    it('should extract default slot from plain children', () => {
      const data = extractSlots('<p>Hello</p><p>World</p>');
      assert.strictEqual(data.slot, '<p>Hello</p><p>World</p>');
      assert.strictEqual(Object.keys(data).length, 1);
    });

    it('should extract a single named slot', () => {
      const data = extractSlots('<div slot="header"><h1>Title</h1></div>');
      assert.strictEqual(data['slot:header'], '<div><h1>Title</h1></div>');
      assert.strictEqual(data.slot, '');
    });

    it('should extract multiple named slots', () => {
      const data = extractSlots(
        '<div slot="header"><h1>Title</h1></div>' +
        '<div slot="footer"><p>Footer</p></div>'
      );
      assert.strictEqual(data['slot:header'], '<div><h1>Title</h1></div>');
      assert.strictEqual(data['slot:footer'], '<div><p>Footer</p></div>');
      assert.strictEqual(data.slot, '');
    });

    it('should separate named and default slot content', () => {
      const data = extractSlots(
        '<div slot="actions"><button>Save</button></div>' +
        '<p>Main content here</p>'
      );
      assert.strictEqual(data['slot:actions'], '<div><button>Save</button></div>');
      assert.strictEqual(data.slot, '<p>Main content here</p>');
    });

    it('should remove the slot attribute from named slot content', () => {
      const data = extractSlots('<span slot="icon">★</span>');
      assert.ok(!data['slot:icon'].includes('slot='));
      assert.strictEqual(data['slot:icon'], '<span>★</span>');
    });

    it('should concatenate multiple elements with the same slot name', () => {
      const data = extractSlots(
        '<li slot="items">One</li>' +
        '<li slot="items">Two</li>' +
        '<li slot="items">Three</li>'
      );
      assert.strictEqual(data['slot:items'], '<li>One</li><li>Two</li><li>Three</li>');
    });

    it('should handle text nodes as default slot content', () => {
      const data = extractSlots('Just some text');
      assert.strictEqual(data.slot, 'Just some text');
    });

    it('should ignore whitespace-only text nodes', () => {
      const data = extractSlots('   \n   ');
      assert.strictEqual(data.slot, '');
    });

    it('should handle mixed text and element children', () => {
      const data = extractSlots(
        'Before ' +
        '<strong>bold</strong>' +
        ' after'
      );
      // Text "Before " is non-empty, <strong> is default, " after" is non-empty
      assert.ok(data.slot.includes('Before'));
      assert.ok(data.slot.includes('<strong>bold</strong>'));
      assert.ok(data.slot.includes('after'));
    });

    it('should handle empty element (no children)', () => {
      const data = extractSlots('');
      assert.strictEqual(data.slot, '');
    });

    it('should handle named slots with complex nested content', () => {
      const data = extractSlots(
        '<section slot="sidebar"><nav><ul><li>A</li><li>B</li></ul></nav></section>' +
        '<article>Main body</article>'
      );
      assert.ok(data['slot:sidebar'].includes('<nav>'));
      assert.ok(data['slot:sidebar'].includes('<li>A</li>'));
      assert.strictEqual(data.slot, '<article>Main body</article>');
    });
  });

  // --------------------------------------------------------------------------
  // renderTemplate with named slots
  // --------------------------------------------------------------------------

  describe('renderTemplate with named slots', () => {

    it('should replace ${slot} with default slot content', () => {
      const result = renderTemplate(
        '<div class="card">${slot}</div>',
        { slot: '<p>Hello</p>' }
      );
      assert.strictEqual(result, '<div class="card"><p>Hello</p></div>');
    });

    it('should replace ${slot:name} with named slot content', () => {
      const result = renderTemplate(
        '<header>${slot:header}</header><main>${slot}</main>',
        { 'slot:header': '<h1>Title</h1>', slot: '<p>Body</p>' }
      );
      assert.strictEqual(result, '<header><h1>Title</h1></header><main><p>Body</p></main>');
    });

    it('should collapse missing named slots to empty string', () => {
      const result = renderTemplate(
        '<header>${slot:header}</header><aside>${slot:sidebar}</aside><main>${slot}</main>',
        { slot: '<p>Body</p>' }
      );
      assert.strictEqual(result, '<header></header><aside></aside><main><p>Body</p></main>');
    });

    it('should keep non-slot variables that are not found', () => {
      const result = renderTemplate(
        '<h1>${title}</h1><main>${slot}</main>',
        { slot: 'Content' }
      );
      assert.strictEqual(result, '<h1>${title}</h1><main>Content</main>');
    });

    it('should replace both named slots and regular variables', () => {
      const result = renderTemplate(
        '<h1>${title}</h1><nav>${slot:nav}</nav><main>${slot}</main>',
        { title: 'My Page', 'slot:nav': '<a href="/">Home</a>', slot: '<p>Body</p>' }
      );
      assert.strictEqual(result, '<h1>My Page</h1><nav><a href="/">Home</a></nav><main><p>Body</p></main>');
    });

    it('should handle template with only named slots (no default)', () => {
      const result = renderTemplate(
        '<div class="layout"><header>${slot:header}</header><footer>${slot:footer}</footer></div>',
        { 'slot:header': '<h1>Hi</h1>', 'slot:footer': '<p>Bye</p>' }
      );
      assert.ok(result.includes('<header><h1>Hi</h1></header>'));
      assert.ok(result.includes('<footer><p>Bye</p></footer>'));
    });

    it('should handle multiple occurrences of the same named slot', () => {
      const result = renderTemplate(
        '<div>${slot:title}</div><span>${slot:title}</span>',
        { 'slot:title': 'Hello' }
      );
      assert.strictEqual(result, '<div>Hello</div><span>Hello</span>');
    });
  });

  // --------------------------------------------------------------------------
  // End-to-end: extractSlots → renderTemplate
  // --------------------------------------------------------------------------

  describe('End-to-end slot processing', () => {

    it('should process a card component with named header and footer slots', () => {
      const componentHTML =
        '<h2 slot="header">Product Name</h2>' +
        '<p>Product description goes here.</p>' +
        '<div slot="footer"><button>Buy</button></div>';

      const template =
        '<article class="card">' +
        '<header>${slot:header}</header>' +
        '<div class="body">${slot}</div>' +
        '<footer>${slot:footer}</footer>' +
        '</article>';

      const slotData = extractSlots(componentHTML);
      const result = renderTemplate(template, slotData);

      assert.ok(result.includes('<header><h2>Product Name</h2></header>'));
      assert.ok(result.includes('<div class="body"><p>Product description goes here.</p></div>'));
      assert.ok(result.includes('<footer><div><button>Buy</button></div></footer>'));
    });

    it('should handle a component with no named slots (backwards compatible)', () => {
      const componentHTML = '<p>Simple content</p>';
      const template = '<div class="wrapper">${slot}</div>';

      const slotData = extractSlots(componentHTML);
      const result = renderTemplate(template, slotData);

      assert.strictEqual(result, '<div class="wrapper"><p>Simple content</p></div>');
    });

    it('should collapse unused named slots in the template', () => {
      const componentHTML = '<p>Just default content</p>';
      const template =
        '<div>${slot:optional}</div>' +
        '<main>${slot}</main>';

      const slotData = extractSlots(componentHTML);
      const result = renderTemplate(template, slotData);

      assert.strictEqual(result, '<div></div><main><p>Just default content</p></main>');
    });

    it('should merge slot data with attribute data for rendering', () => {
      const componentHTML =
        '<span slot="badge">New</span>' +
        '<p>Item details</p>';

      const template = '<div class="item"><span class="badge">${slot:badge}</span><h3>${title}</h3>${slot}</div>';

      const slotData = extractSlots(componentHTML);
      const mergedData = { title: 'Trail Pack', ...slotData };
      const result = renderTemplate(template, mergedData);

      assert.ok(result.includes('<span class="badge"><span>New</span></span>'));
      assert.ok(result.includes('<h3>Trail Pack</h3>'));
      assert.ok(result.includes('<p>Item details</p>'));
    });

    it('should work with data-repeat generated content providing named slots', () => {
      // Simulates what happens when repeat generates elements with slot attributes
      // that then get processed by replace-components
      const repeatedHTML =
        '<img slot="image" src="/img/pack.jpg" alt="Pack">' +
        '<span slot="price">$189</span>' +
        '<p>A great pack for trails.</p>';

      const template =
        '<article class="product-card">' +
        '<figure>${slot:image}</figure>' +
        '<div class="info">${slot}<span class="price">${slot:price}</span></div>' +
        '</article>';

      const slotData = extractSlots(repeatedHTML);
      const result = renderTemplate(template, slotData);

      assert.ok(result.includes('<figure><img src="/img/pack.jpg" alt="Pack"></figure>'));
      assert.ok(result.includes('<span class="price"><span>$189</span></span>'));
      assert.ok(result.includes('<p>A great pack for trails.</p>'));
    });
  });
});
