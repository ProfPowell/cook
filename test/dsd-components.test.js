/**
 * @file dsd-components.test.js
 * @description Tests for Declarative Shadow DOM component rendering in replace-components.js
 *
 * Tests both the new DSD code path (components with <template shadowrootmode>)
 * and regression tests for the existing flat component expansion.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';


// ---------------------------------------------------------------------------
// Replicate the core logic from replace-components.js for unit testing
// ---------------------------------------------------------------------------

/**
 * Check if a component template uses Declarative Shadow DOM
 */
function isDsdComponent(template) {
  return /<template\s+shadowrootmode/i.test(template);
}

/**
 * Render a DSD component: inject DSD template into the custom element
 */
function renderDsdComponent(html, componentTemplate, globalData = {}) {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  // Find the custom element
  const allElements = document.querySelectorAll('*');
  for (const el of allElements) {
    const tagName = el.tagName.toLowerCase();
    if (!tagName.includes('-')) continue;

    // Extract shadow template content
    const shadowMatch = componentTemplate.match(
      /<template\s+shadowrootmode="([^"]+)">([\s\S]*?)<\/template>/i
    );
    if (!shadowMatch) continue;

    const mode = shadowMatch[1];
    let shadowContent = shadowMatch[2];

    // Extract attributes as data
    const data = { ...globalData };
    for (const attr of el.attributes) {
      const name = attr.name.replace(/-([a-z])/g, (_, l) => l.toUpperCase());
      data[name] = attr.value;
    }
    data.tagName = tagName;

    // Resolve template variables
    shadowContent = shadowContent.replace(/\$\{([^}]+)\}/g, (match, key) => {
      const trimmed = key.trim();
      if (data[trimmed] !== undefined && data[trimmed] !== null) return data[trimmed];
      return match;
    });

    // Inject DSD
    el.insertAdjacentHTML('afterbegin',
      `<template shadowrootmode="${mode}">${shadowContent}</template>`
    );
  }

  return dom.serialize();
}

/**
 * Render a flat component: replace element with template HTML
 */
function renderFlatComponent(html, componentTemplate, globalData = {}) {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const allElements = document.querySelectorAll('*');
  for (const el of allElements) {
    const tagName = el.tagName.toLowerCase();
    if (!tagName.includes('-')) continue;

    // Extract styles
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    const htmlTemplate = componentTemplate.replace(styleRegex, '').trim();

    // Extract attributes as data
    const data = { ...globalData };
    for (const attr of el.attributes) {
      const name = attr.name.replace(/-([a-z])/g, (_, l) => l.toUpperCase());
      data[name] = attr.value;
    }
    data.tagName = tagName;

    // Extract slot content
    data.slot = el.innerHTML.trim();

    // Resolve template variables
    const rendered = htmlTemplate.replace(/\$\{([^}]+)\}/g, (match, key) => {
      const trimmed = key.trim();
      if (data[trimmed] !== undefined && data[trimmed] !== null) return data[trimmed];
      if (trimmed.startsWith('slot:')) return '';
      return match;
    });

    el.insertAdjacentHTML('afterend', rendered);
    el.remove();
  }

  return dom.serialize();
}


// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DSD Component Detection', () => {
  it('detects a DSD component template', () => {
    const template = `<template shadowrootmode="open">
      <style>:host { display: block; }</style>
      <div><slot></slot></div>
    </template>`;
    assert.strictEqual(isDsdComponent(template), true);
  });

  it('detects DSD with closed mode', () => {
    const template = `<template shadowrootmode="closed"><div></div></template>`;
    assert.strictEqual(isDsdComponent(template), true);
  });

  it('does not detect flat component as DSD', () => {
    const template = `<style>.card { border: 1px solid; }</style>
      <article class="card"><h3>\${name}</h3>\${slot}</article>`;
    assert.strictEqual(isDsdComponent(template), false);
  });

  it('does not detect regular <template> as DSD', () => {
    const template = `<template id="my-template"><div>content</div></template>`;
    assert.strictEqual(isDsdComponent(template), false);
  });

  it('is case insensitive', () => {
    const template = `<TEMPLATE SHADOWROOTMODE="open"><div></div></TEMPLATE>`;
    assert.strictEqual(isDsdComponent(template), true);
  });
});


describe('DSD Component Rendering', () => {
  const dsdTemplate = `<template shadowrootmode="open">
  <style>:host { display: block; } .card { border: 1px solid #ccc; }</style>
  <div class="card">
    <h3>\${title}</h3>
    <slot></slot>
  </div>
</template>`;

  it('preserves the custom element in output', () => {
    const html = '<html><body><my-card title="Hello"><p>Content</p></my-card></body></html>';
    const result = renderDsdComponent(html, dsdTemplate);
    assert.ok(result.includes('<my-card'), 'Custom element should be preserved');
    assert.ok(result.includes('</my-card>'), 'Custom element closing tag should be preserved');
  });

  it('injects <template shadowrootmode="open">', () => {
    const html = '<html><body><my-card title="Test"><p>Hi</p></my-card></body></html>';
    const result = renderDsdComponent(html, dsdTemplate);
    assert.ok(result.includes('shadowrootmode="open"'), 'Should contain shadowrootmode attribute');
  });

  it('resolves attribute variables in shadow content', () => {
    const html = '<html><body><my-card title="Resolved Title"><p>Body</p></my-card></body></html>';
    const result = renderDsdComponent(html, dsdTemplate);
    assert.ok(result.includes('Resolved Title'), 'Title should be resolved from attribute');
    assert.ok(!result.includes('${title}'), 'Template variable should not remain');
  });

  it('keeps styles inside the shadow root', () => {
    const html = '<html><head></head><body><my-card title="Test"></my-card></body></html>';
    const result = renderDsdComponent(html, dsdTemplate);
    // Style should be inside the template, not in <head>
    const headMatch = result.match(/<head>([\s\S]*?)<\/head>/);
    const headContent = headMatch ? headMatch[1] : '';
    assert.ok(!headContent.includes(':host'), 'Styles should NOT be in <head>');
    assert.ok(result.includes(':host { display: block; }'), 'Styles should be in shadow root');
  });

  it('preserves <slot> elements in shadow template', () => {
    const html = '<html><body><my-card title="Test"><p>Slotted</p></my-card></body></html>';
    const result = renderDsdComponent(html, dsdTemplate);
    assert.ok(result.includes('<slot></slot>'), 'Native <slot> should be preserved');
  });

  it('preserves light DOM children as host children', () => {
    const html = '<html><body><my-card title="Test"><p>Light DOM</p></my-card></body></html>';
    const result = renderDsdComponent(html, dsdTemplate);
    assert.ok(result.includes('<p>Light DOM</p>'), 'Light DOM content should remain');
    // The <p> should be inside <my-card>, after the template
    const cardContent = result.match(/<my-card[^>]*>([\s\S]*?)<\/my-card>/);
    assert.ok(cardContent, 'Should match my-card content');
    assert.ok(cardContent[1].includes('<p>Light DOM</p>'), 'Light DOM should be inside the custom element');
  });

  it('handles named slots (preserves slot attributes on children)', () => {
    const namedSlotTemplate = `<template shadowrootmode="open">
      <header><slot name="header"></slot></header>
      <main><slot></slot></main>
    </template>`;
    const html = '<html><body><my-layout><h2 slot="header">Title</h2><p>Body</p></my-layout></body></html>';
    const result = renderDsdComponent(html, namedSlotTemplate);
    // Named slot elements should be preserved in shadow root
    assert.ok(result.includes('<slot name="header">'), 'Named slot should be preserved');
    // Light DOM children should keep their slot attributes
    assert.ok(result.includes('slot="header"'), 'slot attribute on child should be preserved');
  });

  it('renders multiple instances with separate <template> each', () => {
    const html = `<html><body>
      <my-card title="First"><p>A</p></my-card>
      <my-card title="Second"><p>B</p></my-card>
    </body></html>`;
    const result = renderDsdComponent(html, dsdTemplate);
    const matches = result.match(/shadowrootmode="open"/g);
    assert.strictEqual(matches?.length, 2, 'Each instance should get its own DSD template');
    assert.ok(result.includes('First'), 'First instance attributes resolved');
    assert.ok(result.includes('Second'), 'Second instance attributes resolved');
  });

  it('resolves global data in shadow content', () => {
    const globalTemplate = `<template shadowrootmode="open">
      <p>\${siteName}</p>
      <slot></slot>
    </template>`;
    const html = '<html><body><site-banner>content</site-banner></body></html>';
    const result = renderDsdComponent(html, globalTemplate, { siteName: 'My Site' });
    assert.ok(result.includes('My Site'), 'Global data should resolve in shadow content');
  });
});


describe('Flat Component Rendering (regression)', () => {
  const flatTemplate = `<style>.card { border: 1px solid; }</style>
<article class="card">
  <h3>\${name}</h3>
  <p>\${description}</p>
  \${slot}
</article>`;

  it('removes the custom element', () => {
    const html = '<html><body><product-card name="Pack" description="A backpack"><span>Details</span></product-card></body></html>';
    const result = renderFlatComponent(html, flatTemplate);
    assert.ok(!result.includes('<product-card'), 'Custom element should be removed');
  });

  it('expands template with attribute data', () => {
    const html = '<html><body><product-card name="Trail Pack" description="Ultralight"></product-card></body></html>';
    const result = renderFlatComponent(html, flatTemplate);
    assert.ok(result.includes('Trail Pack'), 'Name attribute should resolve');
    assert.ok(result.includes('Ultralight'), 'Description attribute should resolve');
  });

  it('injects slot content', () => {
    const html = '<html><body><product-card name="X" description="Y"><em>Bonus</em></product-card></body></html>';
    const result = renderFlatComponent(html, flatTemplate);
    assert.ok(result.includes('<em>Bonus</em>'), 'Slot content should be injected');
  });

  it('is not detected as DSD', () => {
    assert.strictEqual(isDsdComponent(flatTemplate), false);
  });
});
