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
    const components = this.findComponents(document);
    this.total = components.length;

    // Early Exit: No components found
    if (this.total === 0) return;

    // START LOGGING
    this.startLog();

    // Process each component
    for (const component of components) {
      await this.replaceComponent(component);
    }

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

    // 1. Find custom elements (hyphenated tag names)
    // Custom elements must contain a hyphen per spec
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      const tagName = el.tagName.toLowerCase();

      // Custom element (contains hyphen)
      if (tagName.includes('-')) {
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
   * Replace a component element with its template
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

      // Extract data from element attributes
      const componentData = this.extractComponentData(element, type);

      // Get slot content (inner HTML)
      componentData.slot = element.innerHTML.trim();

      // Merge with global data (component data takes precedence)
      const mergedData = { ...this.data, ...componentData };

      // Replace template variables with data
      const renderedContent = this.renderTemplate(template, mergedData);

      // Insert rendered content and remove original element
      element.insertAdjacentHTML('afterend', renderedContent);

      // Transfer non-data attributes to the first valid replaced element
      this.transferAttributes(element, type);

      // Remove the original component element
      element.remove();

      this.replaced.push(name);
    } catch (err) {
      Util.customError(err, `replace-components.js: Error replacing ${name}`);
    }
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
    // Check both direct file path and directory/index.html path
    // (createDirFromFile converts foo.html to foo/index.html)
    const basePath = `${distPath}/${this.config.path}`;
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
      const value = attr.value;

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
   * Render template by replacing variables with data
   * @param {string} template - Template string
   * @param {Object} data - Data object
   * @returns {string} Rendered template
   */
  renderTemplate(template, data) {
    // Replace ${varName} with data values
    // Supports nested: ${user.name}
    return template.replace(/\$\{([^}]+)\}/g, (match, key) => {
      const trimmedKey = key.trim();

      // Handle nested properties (e.g., user.name)
      const value = this.getNestedValue(data, trimmedKey);

      // Return value if found, empty string if explicitly null/undefined, or keep original if not in data
      if (value !== undefined && value !== null) {
        return value;
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
  transferAttributes(originalElement, type) {
    const nextEl = originalElement.nextElementSibling;
    if (!nextEl) return;

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
