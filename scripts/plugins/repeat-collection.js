/**
 * @file repeat-collection.js
 * @description Repeat elements for each item in a collection/array
 *
 * Usage:
 *   <article data-repeat="collections.blog as post">
 *     <h2>${post.title}</h2>
 *     <a href="${post.url}">Read more</a>
 *   </article>
 *
 * Supports:
 *   - Nested property access: "collections.blog as post"
 *   - Array data: "items as item"
 *   - Index variable: "items as item, index"
 *   - Limit: "collections.blog | limit:5 as post"
 *   - Offset: "collections.blog | offset:2 as post"
 *   - Combined: "collections.blog | offset:2 | limit:5 as post"
 */

// IMPORTS
// -----------------------------
import chalk from 'chalk';
import Util from '../utils/util/util.js';

// Config
import { repeat as repeatConfig } from '../utils/config/config.js';


// DEFINE
// -----------------------------
/**
 * @description Repeat elements for each item in a collection
 * @param {Object} opts - Options object
 * @property {Object} opts.file - Current file info
 * @property {Object} opts.data - User data from config/data.js
 * @property {Object} opts.store - Build process data store
 * @property {Array} [opts.allowType] - Allowed file types
 * @property {Array} [opts.disallowType] - Disallowed file types
 */
class RepeatCollection {
  constructor({ file, data, store, allowType, disallowType }) {
    this.opts = { file, allowType, disallowType };
    this.file = file;
    this.data = data;
    this.store = store;
    this.config = {
      // Attribute name for repeat directive
      attribute: 'data-repeat',
      // Remove the data-repeat attribute from output
      removeAttribute: true,
      // User overrides
      ...repeatConfig,
    };

    // Track total replacements for logging
    this.total = 0;

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

    // Find all elements with data-repeat attribute
    const repeatElements = document.querySelectorAll(`[${this.config.attribute}]`);
    this.total = repeatElements.length;

    // Early Exit: No repeat elements
    if (!repeatElements.length) return;

    // Process each repeat element
    for (const element of repeatElements) {
      this.processRepeatElement(element, document);
    }

    // Store updated file source
    this.file.src = Util.setSrc({ dom });
  }

  /**
   * Process a single repeat element
   * @param {Element} element - The element with data-repeat
   * @param {Document} document - The document object
   */
  processRepeatElement(element, document) {
    const expression = element.getAttribute(this.config.attribute);
    if (!expression) return;

    // Parse the repeat expression
    const parsed = this.parseExpression(expression);
    if (!parsed) {
      console.log(chalk.yellow(`  [repeat] Invalid expression: "${expression}"`));
      return;
    }

    // Get the collection data
    let collection = this.getNestedValue(this.data, parsed.collection);
    if (!collection || !Array.isArray(collection)) {
      // Try getting from store (for collections built during build)
      collection = this.getNestedValue(this.store, parsed.collection);
    }

    if (!collection || !Array.isArray(collection)) {
      console.log(chalk.yellow(`  [repeat] Collection not found or not an array: "${parsed.collection}"`));
      return;
    }

    // Apply offset if specified
    if (parsed.offset > 0) {
      collection = collection.slice(parsed.offset);
    }

    // Apply limit if specified
    if (parsed.limit > 0) {
      collection = collection.slice(0, parsed.limit);
    }

    // Get the template HTML (inner content of the repeat element)
    const template = element.innerHTML;
    const tagName = element.tagName.toLowerCase();

    // Create a document fragment to hold all repeated elements
    const fragment = document.createDocumentFragment();

    // Generate repeated elements
    collection.forEach((item, index) => {
      // Clone the original element
      const clone = element.cloneNode(false);

      // Remove the data-repeat attribute from clone
      if (this.config.removeAttribute) {
        clone.removeAttribute(this.config.attribute);
      }

      // Build the data context for this iteration
      const context = {
        [parsed.itemName]: item,
        ...item, // Also spread item properties for direct access
      };

      // Add index if requested
      if (parsed.indexName) {
        context[parsed.indexName] = index;
      }

      // Replace template variables in the content
      const renderedContent = this.renderTemplate(template, context);
      clone.innerHTML = renderedContent;

      // Also process attributes on the clone itself
      this.processElementAttributes(clone, context);

      fragment.appendChild(clone);
    });

    // Replace original element with the fragment
    element.parentNode.replaceChild(fragment, element);
  }

  /**
   * Parse the repeat expression
   * Supports: "collection as item" or "collection as item, index"
   * With modifiers: "collection | limit:5 | offset:2 as item"
   * @param {string} expression - The data-repeat expression
   * @returns {Object|null} Parsed expression or null if invalid
   */
  parseExpression(expression) {
    // Match: "collectionPath | modifiers as itemName, indexName"
    const match = expression.match(/^(.+?)\s+as\s+(\w+)(?:\s*,\s*(\w+))?$/);
    if (!match) return null;

    let collectionPart = match[1].trim();
    const itemName = match[2];
    const indexName = match[3] || null;

    // Parse modifiers (limit, offset)
    let limit = 0;
    let offset = 0;

    // Check for pipe modifiers
    const parts = collectionPart.split('|').map(p => p.trim());
    const collection = parts[0];

    for (let i = 1; i < parts.length; i++) {
      const modifier = parts[i];

      // Parse limit:N
      const limitMatch = modifier.match(/^limit\s*:\s*(\d+)$/);
      if (limitMatch) {
        limit = parseInt(limitMatch[1], 10);
        continue;
      }

      // Parse offset:N
      const offsetMatch = modifier.match(/^offset\s*:\s*(\d+)$/);
      if (offsetMatch) {
        offset = parseInt(offsetMatch[1], 10);
        continue;
      }
    }

    return {
      collection,
      itemName,
      indexName,
      limit,
      offset,
    };
  }

  /**
   * Get a nested property value from an object
   * @param {Object} obj - The object to search
   * @param {string} path - Dot-notation path (e.g., "collections.blog")
   * @returns {*} The value or undefined
   */
  getNestedValue(obj, path) {
    if (!obj || !path) return undefined;

    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  /**
   * Render template string with data context
   * Replaces ${varName} and ${item.property} with values
   * @param {string} template - Template string
   * @param {Object} context - Data context
   * @returns {string} Rendered string
   */
  renderTemplate(template, context) {
    return template.replace(/\$\{([^}]+)\}/g, (match, key) => {
      const trimmedKey = key.trim();
      const value = this.getNestedValue(context, trimmedKey);

      if (value !== undefined && value !== null) {
        // Handle Date objects
        if (value instanceof Date) {
          return value.toLocaleDateString();
        }
        // Handle arrays
        if (Array.isArray(value)) {
          return value.join(', ');
        }
        return String(value);
      }

      // Leave unmatched variables for later processing
      return match;
    });
  }

  /**
   * Process and replace template variables in element attributes
   * @param {Element} element - The element to process
   * @param {Object} context - Data context
   */
  processElementAttributes(element, context) {
    const attributes = element.attributes;
    for (let i = 0; i < attributes.length; i++) {
      const attr = attributes[i];
      if (attr.value.includes('${')) {
        attr.value = this.renderTemplate(attr.value, context);
      }
    }
  }

  // EXPORT WRAPPER
  // -----------------------------
  static async export(opts) {
    return new RepeatCollection(opts).init();
  }
}


// EXPORT
// -----------------------------
export default RepeatCollection.export;
