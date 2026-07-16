/**
 * @file replace-components.js
 * @description Replace custom elements and semantic HTML components with templates
 *
 * Supports two patterns:
 * 1. Custom elements: <site-header title="Welcome"></site-header>
 * 2. Semantic HTML with data-component: <header data-component="header" data-title="Welcome"></header>
 *
 * Component templates can use:
 * - ${attributeName} for data from element attributes
 * - ${slot} for inner HTML content
 *
 * Component templates may contain <style> blocks. These are:
 * - Extracted before rendering (not duplicated per instance)
 * - Deduplicated per component name
 * - Template variables resolved with global data
 * - Consolidated into a single <style> in <head>
 * Authors can use native @scope and @layer for CSS scoping.
 *
 * DSD (Declarative Shadow DOM) components:
 * If a component template contains <template shadowrootmode="open">,
 * the component is rendered as a web component with Declarative Shadow DOM:
 * - The custom element is preserved (not replaced with flat HTML)
 * - Styles stay inside the shadow root (not extracted to <head>)
 * - Native <slot> elements handle content projection
 * - Optional companion .js files provide client-side hydration
 */

// IMPORTS
// -----------------------------
import chalk from 'chalk';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import Util from '../utils/util/util.js';

// Config
import { distPath, srcPath, components as componentsConfig } from '../utils/config/config.js';

// DEFINE
// -----------------------------
class ReplaceComponents {
  constructor({ file, store, data, allowType, disallowType }) {
    this.opts = { file, allowType, disallowType };
    this.file = file;
    this.store = store;
    this.data = data || {};
    this.allowType = allowType;
    this.disallowType = disallowType;

    // Component stats
    this.total = 0;
    this.replaced = [];

    // Component configuration with defaults
    this.config = {
      path: 'components',
      prefix: null,
      mapping: {},
      ...componentsConfig
    };

    // Collected component styles (keyed by componentName for deduplication)
    this.collectedStyles = {};

    // Cache for component templates
    if (!this.store.cachedComponents) this.store.cachedComponents = {};

    // Init terminal logging
    if (process.env.LOGGER) Util.initLogging.call(this);
  }

  // INIT
  // -----------------------------
  async init() {
    // Early Exit: File type not allowed
    const allowed = Util.isAllowedType(this.opts);
    if (!allowed) return;

    // Store string source as traversable DOM
    const dom = Util.jsdom.dom({ src: this.file.src });
    const document = dom.window.document;

    // Find all components to replace
    let components = this.findComponents(document);

    // Early Exit: No components found
    if (components.length === 0) return;

    // START LOGGING
    this.startLog();

    // Expand until stable: rendered templates and slot content may
    // themselves contain components (nesting), which only appear in the
    // DOM after a pass completes. `handled` stops us retrying elements
    // that stay in the DOM by design (DSD hosts, unknown components),
    // and the pass cap bounds pathological self-referencing templates.
    const MAX_PASSES = 10;
    const handled = new Set();
    let pass = 0;
    while (components.length && pass < MAX_PASSES) {
      let progressed = false;
      for (const component of components) {
        if (handled.has(component.element)) continue;
        const before = this.replaced.length;
        await this.replaceComponent(component);
        handled.add(component.element);
        if (this.replaced.length > before) progressed = true;
      }
      if (!progressed) break;
      pass += 1;
      components = this.findComponents(document).filter(c => !handled.has(c.element));
    }
    this.total = this.replaced.length;

    // Inject collected component styles into <head>
    this.injectCollectedStyles(document);

    // Store updated file source
    this.file.src = Util.setSrc({ dom });

    // END LOGGING
    this.endLog();
  }

  /**
   * Find all component elements in the document
   * @param {Document} document - The JSDOM document
   * @returns {Array} Array of component info objects
   */
  findComponents(document) {
    const components = [];
    // Each element is processed at most once — a hyphenated tag that ALSO
    // carries data-component must not be expanded twice.
    const seen = new Set();

    // 1. Find custom elements (hyphenated tag names)
    // Custom elements must contain a hyphen per spec
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      const tagName = el.tagName.toLowerCase();

      // Custom element (contains hyphen)
      if (tagName.includes('-')) {
        seen.add(el);
        components.push({
          element: el,
          type: 'custom-element',
          name: tagName,
          componentName: this.resolveComponentName(tagName, 'custom-element')
        });
      }
    }

    // 2. Find elements with data-component attribute
    const dataComponents = document.querySelectorAll('[data-component]');
    for (const el of dataComponents) {
      if (seen.has(el)) continue;
      const componentAttr = el.getAttribute('data-component');
      if (componentAttr) {
        components.push({
          element: el,
          type: 'data-component',
          name: componentAttr,
          componentName: this.resolveComponentName(componentAttr, 'data-component')
        });
      }
    }

    return components;
  }

  /**
   * Resolve component name to template file path
   * @param {string} name - The component identifier
   * @param {string} type - 'custom-element' or 'data-component'
   * @returns {string} Component template filename
   */
  resolveComponentName(name, type) {
    // Check explicit mapping first
    if (this.config.mapping && this.config.mapping[name]) {
      return this.config.mapping[name];
    }

    // For custom elements, strip prefix if configured
    let componentName = name;
    if (type === 'custom-element' && this.config.prefix) {
      if (name.startsWith(this.config.prefix)) {
        componentName = name.slice(this.config.prefix.length);
      }
    }

    // Default: use name as filename (add .html if needed)
    return componentName.endsWith('.html') ? componentName : `${componentName}.html`;
  }

  /**
   * Check if a component template uses Declarative Shadow DOM.
   * The presence of <template shadowrootmode> signals DSD intent.
   * @param {string} template - Component template string
   * @returns {boolean}
   */
  isDsdComponent(template) {
    return /<template[^>]*\sshadowrootmode/i.test(template);
  }

  /**
   * Replace a component element with its template.
   * Routes to DSD or flat rendering based on template content.
   * @param {Object} componentInfo - Component information object
   */
  async replaceComponent(componentInfo) {
    const { element, type, name, componentName } = componentInfo;

    try {
      // Get component template
      const template = await this.getComponentTemplate(componentName);
      if (!template) {
        if (process.env.LOGGER) {
          console.log(chalk.yellow(`  [warn] Component template not found: ${componentName}`));
        }
        return;
      }

      // Branch: DSD components preserve the custom element with shadow DOM;
      // flat components expand into plain HTML (existing behavior)
      if (this.isDsdComponent(template)) {
        this.renderDsdComponent(element, template, name, componentName);
      } else {
        this.renderFlatComponent(element, template, type, name, componentName);
      }
    } catch (err) {
      Util.customWarn(err, `replace-components.js: Error replacing ${name} in ${this.file.path}`);
    }
  }

  /**
   * Render a DSD component: inject Declarative Shadow DOM into the custom element.
   * - The custom element is preserved in the DOM
   * - Styles stay inside the shadow root (not extracted to <head>)
   * - Native <slot> elements handle content projection
   * @param {Element} element - The custom element
   * @param {string} template - Component template containing <template shadowrootmode>
   * @param {string} name - Element tag name
   * @param {string} componentName - Component template filename
   */
  renderDsdComponent(element, template, name, componentName) {
    // Idempotency: if the element already carries a declarative shadow
    // template (already-processed output, e.g. a dev rebuild), skip it.
    const hasShadowTemplate = Array.from(element.children).some(child =>
      child.tagName && child.tagName.toLowerCase() === 'template'
      && child.hasAttribute('shadowrootmode')
    );
    if (hasShadowTemplate) return;

    // Extract the <template shadowrootmode="..."> content via a DOM parse.
    // (The old regex required shadowrootmode to be the first attribute and
    // truncated shadow content at the first nested </template>.)
    const templateDom = Util.jsdom.dom({ src: template });
    const shadowTemplate = templateDom.window.document.querySelector('template[shadowrootmode]');
    if (!shadowTemplate) return;

    const mode = shadowTemplate.getAttribute('shadowrootmode') || 'open';
    let shadowContent = shadowTemplate.innerHTML;

    // Extract data from element attributes
    const componentData = this.extractComponentData(element, 'custom-element');

    // Merge with global data (component data takes precedence)
    const mergedData = { ...this.data, ...componentData };

    // Resolve template variables in shadow content
    // Note: <slot> elements are NOT template variables — they stay as-is
    shadowContent = this.renderTemplate(shadowContent, mergedData);

    // Inject the DSD template as first child of the custom element
    // Do NOT extract styles — they belong inside the shadow root for encapsulation
    // Do NOT touch children — native <slot> handles content projection
    element.insertAdjacentHTML('afterbegin',
      `<template shadowrootmode="${mode}">${shadowContent}</template>`
    );

    // Record on store for auto-components awareness
    if (!this.store._cookDsdComponents) this.store._cookDsdComponents = {};
    this.store._cookDsdComponents[name] = componentName;

    this.replaced.push(name);
  }

  /**
   * Render a flat component: replace the element with expanded template HTML.
   * This is the original behavior — styles extracted to <head>, element removed.
   * @param {Element} element - The component element
   * @param {string} template - Component template HTML
   * @param {string} type - 'custom-element' or 'data-component'
   * @param {string} name - Element tag/component name
   * @param {string} componentName - Component template filename
   */
  renderFlatComponent(element, template, type, name, componentName) {
    // Extract <style> blocks from template (deduplicate per component)
    const { html: htmlTemplate, css } = this.extractStyles(template);
    if (css && !this.collectedStyles[componentName]) {
      // Resolve template variables in CSS with global data only
      this.collectedStyles[componentName] = this.renderTemplate(css, this.data);
    }

    // Extract data from element attributes
    const componentData = this.extractComponentData(element, type);

    // Extract named and default slot content from children
    this.extractSlots(element, componentData);

    // Merge with global data (component data takes precedence)
    const mergedData = { ...this.data, ...componentData };

    // Replace template variables with data (style-free HTML only)
    const renderedContent = this.renderTemplate(htmlTemplate, mergedData);

    // Remember the element's current next sibling so we can tell whether
    // the rendered content actually starts with an element — if it starts
    // with text, nextElementSibling would point at a pre-existing sibling
    // that must NOT receive the component's attributes.
    const priorNextEl = element.nextElementSibling;

    // Insert rendered content and remove original element
    element.insertAdjacentHTML('afterend', renderedContent);

    // Transfer non-data attributes to the first valid replaced element
    this.transferAttributes(element, type, priorNextEl);

    // Remove the original component element
    element.remove();

    this.replaced.push(name);
  }

  /**
   * Get component template content (with caching)
   * @param {string} componentName - Component template filename
   * @returns {string|null} Template content or null if not found
   */
  async getComponentTemplate(componentName) {
    // Check cache first
    if (this.store.cachedComponents[componentName] !== undefined) {
      return this.store.cachedComponents[componentName];
    }

    // Build path to component template
    // Read from srcPath since build-only dirs (components/) may not be in dist
    const basePath = `${srcPath}/${this.config.path}`;
    const directPath = path.resolve(`${basePath}/${componentName}`);
    const dirPath = path.resolve(`${basePath}/${componentName.replace('.html', '/index.html')}`);

    let componentPath = null;
    if (existsSync(directPath)) {
      componentPath = directPath;
    } else if (existsSync(dirPath)) {
      componentPath = dirPath;
    }

    // Check if component exists
    if (!componentPath) {
      this.store.cachedComponents[componentName] = null;
      return null;
    }

    try {
      const content = await fs.readFile(componentPath, 'utf-8');
      this.store.cachedComponents[componentName] = content;
      return content;
    } catch (err) {
      this.store.cachedComponents[componentName] = null;
      return null;
    }
  }

  /**
   * Extract data from element attributes
   * @param {Element} element - The component element
   * @param {string} type - Component type
   * @returns {Object} Data object from attributes
   */
  extractComponentData(element, type) {
    const data = {};

    for (const attr of element.attributes) {
      const name = attr.name;
      // Attribute values arrive DOM-decoded (&quot; → ", &lt; → <) but are
      // re-injected into template HTML via insertAdjacentHTML. Re-escape
      // them so quotes can't truncate attributes and encoded markup can't
      // become live elements. (Slot content is real HTML and is NOT
      // escaped — see extractSlots.)
      const value = this.escapeHtml(attr.value);

      // Skip data-component attribute itself
      if (name === 'data-component') continue;

      // Handle data-* attributes (strip 'data-' prefix)
      if (name.startsWith('data-')) {
        const key = this.camelCase(name.slice(5));
        data[key] = value;
      }
      // For custom elements, all attributes are data
      else if (type === 'custom-element') {
        const key = this.camelCase(name);
        data[key] = value;
      }
    }

    // Also add the original tag name as a variable
    data.tagName = element.tagName.toLowerCase();

    return data;
  }

  /**
   * Escape HTML-special characters for safe re-injection into template HTML.
   * @param {string} str - Raw (DOM-decoded) attribute value
   * @returns {string}
   */
  escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Extract named and default slot content from element children.
   * Children with a slot="name" attribute provide named slot content.
   * Remaining children (and text nodes) form the default ${slot}.
   * Results are stored on the componentData object as:
   *   - componentData.slot       (default slot — all non-named content)
   *   - componentData['slot:name'] (named slots)
   * @param {Element} element - The component element
   * @param {Object} componentData - Data object to populate
   */
  extractSlots(element, componentData) {
    const namedSlots = {};
    const defaultParts = [];

    for (const child of Array.from(element.childNodes)) {
      // Element nodes may carry a slot attribute
      if (child.nodeType === 1 /* ELEMENT_NODE */) {
        const slotName = child.getAttribute && child.getAttribute('slot');
        if (slotName) {
          // Remove the slot attribute from the content before injecting
          child.removeAttribute('slot');
          // If the same slot name appears more than once, concatenate
          namedSlots[slotName] = (namedSlots[slotName] || '') + child.outerHTML;
        } else {
          defaultParts.push(child.outerHTML);
        }
      }
      // Text nodes (and others) go to the default slot
      else if (child.textContent.trim()) {
        defaultParts.push(child.textContent);
      }
    }

    // Default slot — everything that wasn't assigned to a named slot
    componentData.slot = defaultParts.join('').trim();

    // Named slots — keyed as "slot:name"
    for (const [name, html] of Object.entries(namedSlots)) {
      componentData[`slot:${name}`] = html;
    }
  }

  /**
   * Extract <style> blocks from a component template string.
   * Returns the HTML without styles and the collected CSS text.
   * @param {string} template - Raw template string
   * @returns {{ html: string, css: string }}
   */
  extractStyles(template) {
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    const cssBlocks = [];
    let match;

    while ((match = styleRegex.exec(template)) !== null) {
      const block = match[1].trim();
      if (block) cssBlocks.push(block);
    }

    const html = template.replace(styleRegex, '').trim();
    const css = cssBlocks.join('\n');

    return { html, css };
  }

  /**
   * Inject all collected component styles into <head> as a single <style>.
   * @param {Document} document - The JSDOM document
   */
  injectCollectedStyles(document) {
    const entries = Object.entries(this.collectedStyles);
    if (entries.length === 0) return;

    const cssText = entries
      .map(([name, css]) => `/* ${name} */\n${css}`)
      .join('\n\n');

    const head = document.head || document.querySelector('head');
    if (!head) return;

    const styleEl = document.createElement('style');
    styleEl.textContent = cssText;
    head.appendChild(styleEl);
  }

  /**
   * Render template by replacing variables with data
   * @param {string} template - Template string
   * @param {Object} data - Data object
   * @returns {string} Rendered template
   */
  renderTemplate(template, data) {
    // Replace ${slot:name} named slots (and ${slot} default)
    // Also replace ${varName} with data values
    // Supports nested: ${user.name}
    return template.replace(/\$\{([^}]+)\}/g, (match, key) => {
      const trimmedKey = key.trim();

      // Check data directly (handles "slot", "slot:name", and regular vars)
      if (data[trimmedKey] !== undefined && data[trimmedKey] !== null) {
        return data[trimmedKey];
      }

      // Handle nested properties (e.g., user.name) — but not slot:name (already checked)
      if (trimmedKey.includes('.')) {
        const value = this.getNestedValue(data, trimmedKey);
        if (value !== undefined && value !== null) {
          return value;
        }
      }

      // Named slot not provided — remove the placeholder (empty string)
      if (trimmedKey.startsWith('slot:')) {
        return '';
      }

      // Keep the original ${var} if not found (allows for later processing)
      return match;
    });
  }

  /**
   * Get nested value from object using dot notation
   * @param {Object} obj - Source object
   * @param {string} path - Dot-notation path
   * @returns {*} Value or undefined
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Transfer non-component attributes to the first valid replaced element
   * @param {Element} originalElement - The original component element
   * @param {string} type - Component type
   */
  transferAttributes(originalElement, type, priorNextEl) {
    const nextEl = originalElement.nextElementSibling;
    if (!nextEl) return;
    // Rendered content did not start with an element (text-only template):
    // nextElementSibling is a pre-existing sibling — don't touch it.
    if (nextEl === priorNextEl) return;

    // Attributes to skip
    const skipAttrs = ['data-component'];
    if (type === 'custom-element') {
      // For custom elements, we've already used all attributes as data
      // Only transfer class and id
      for (const attr of ['class', 'id']) {
        const value = originalElement.getAttribute(attr);
        if (value) {
          const existing = nextEl.getAttribute(attr) || '';
          nextEl.setAttribute(attr, existing ? `${existing} ${value}` : value);
        }
      }
    } else {
      // For data-component, transfer non-data-* attributes
      for (const attr of originalElement.attributes) {
        if (!attr.name.startsWith('data-') && !skipAttrs.includes(attr.name)) {
          // Merge classes, replace others
          if (attr.name === 'class') {
            const existing = nextEl.getAttribute('class') || '';
            nextEl.setAttribute('class', existing ? `${existing} ${attr.value}` : attr.value);
          } else {
            nextEl.setAttribute(attr.name, attr.value);
          }
        }
      }
    }
  }

  /**
   * Convert kebab-case to camelCase
   * @param {string} str - Kebab-case string
   * @returns {string} camelCase string
   */
  camelCase(str) {
    return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  // LOGGING
  // -----------------------------
  startLog() {
    if (!process.env.LOGGER) return;
    this.loading.start(chalk.magenta('Replacing Components'));
    this.timer.start();
  }

  endLog() {
    if (!process.env.LOGGER) return;
    if (this.total > 0) {
      this.loading.stop(`Replaced ${chalk.magenta(this.replaced.length)} components ${this.timer.end()}`);
    } else {
      this.loading.kill();
    }
  }

  // EXPORT WRAPPER
  // -----------------------------
  static async export(opts) {
    return new ReplaceComponents(opts).init();
  }
}

// EXPORT
// -----------------------------
export default ReplaceComponents.export;
