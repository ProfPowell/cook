/**
 * @file apply-template.js
 * @description Apply layout templates to HTML pages via [data-template].
 *
 * When a page's <html> or <body> element has data-template="name",
 * the page's content is extracted and injected into the named layout
 * template from src/layouts/{name}.html.
 *
 * Page metadata (title, description, etc.) is extracted from the source
 * page and made available as ${var} placeholders in the template.
 *
 * Must run BEFORE replaceInclude so that includes inside templates
 * are resolved normally.
 */

// IMPORTS
// -----------------------------
import chalk from 'chalk';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import Util from '../utils/util/util.js';

// Config
import { srcPath, distPath } from '../utils/config/config.js';


// DEFINE
// -----------------------------
class ApplyTemplate {
  constructor({ file, store, allowType, disallowType }) {
    this.opts = { file, allowType, disallowType };
    this.file = file;
    this.store = store;
    this.allowType = allowType;
    this.disallowType = disallowType;

    // Reuse the layout cache from process-markdown
    if (!this.store.cachedLayouts) {
      this.store.cachedLayouts = {};
    }
  }

  // INIT
  // -----------------------------
  async init() {
    // Early Exit: File type not allowed
    const allowed = Util.isAllowedType(this.opts);
    if (!allowed) return;

    // Check for data-template attribute on <html> or <body>,
    // falling back to file.frontMatter.layout if present
    const templateName = this.findTemplateName()
      || (this.file.frontMatter && this.file.frontMatter.layout)
      || null;
    if (!templateName) return;

    // Load the template
    const templateContent = await this.getTemplate(templateName);
    if (!templateContent) return;

    // Extract page metadata and content from the source page
    const pageData = this.extractPageData();

    // Merge page content into the template
    this.file.src = this.applyTemplate(templateContent, pageData);
  }

  /**
   * Find the data-template attribute value from the page source.
   * Checks <html data-template="..."> and <body data-template="...">.
   * Uses regex to avoid a full DOM parse at this stage.
   * @returns {string|null} Template name or null
   */
  findTemplateName() {
    // Match data-template on <html> or <body>
    const match = this.file.src.match(/<(?:html|body)\s[^>]*data-template="([^"]+)"/i);
    return match ? match[1] : null;
  }

  /**
   * Load a template file from src/layouts/ (with caching).
   * @param {string} name - Template name (e.g., "default", "product")
   * @returns {string|null} Template content or null
   */
  async getTemplate(name) {
    // Check cache
    if (this.store.cachedLayouts[name] !== undefined) {
      return this.store.cachedLayouts[name];
    }

    // Build possible paths
    const fileName = name.endsWith('.html') ? name : `${name}.html`;
    const candidates = [
      path.resolve(`${srcPath}/layouts/${fileName}`),
      path.resolve(`${srcPath}/layouts/${name}/index.html`),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        try {
          const content = await fs.readFile(candidate, 'utf-8');
          this.store.cachedLayouts[name] = content;
          return content;
        } catch {
          // Continue to next candidate
        }
      }
    }

    // Not found
    this.store.cachedLayouts[name] = null;
    return null;
  }

  /**
   * Extract metadata and content from the source page.
   * Pulls title and description from <head>, and content from <body>.
   * Also collects any data-* attributes from the data-template element
   * as additional template variables.
   * @returns {Object} { title, description, content, ...customVars }
   */
  extractPageData() {
    const data = {};

    // Start with front matter data if available (from process-html-frontmatter plugin)
    if (this.file.frontMatter) {
      Object.assign(data, this.file.frontMatter);
    }

    // Extract <title> content (overrides front matter title if both present)
    const titleMatch = this.file.src.match(/<title>([^<]*)<\/title>/i);
    if (titleMatch) data.title = titleMatch[1];

    // Extract <meta name="description"> content
    const descMatch = this.file.src.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
    if (descMatch) data.description = descMatch[1];

    // Extract data-* attributes from the element with data-template
    // These become template variables (e.g., data-author="Kim" → ${author})
    const templateElMatch = this.file.src.match(/<(?:html|body)\s([^>]*data-template="[^"]*"[^>]*)>/i);
    if (templateElMatch) {
      const attrs = templateElMatch[1];
      const attrPattern = /data-(?!template)([a-z][a-z0-9-]*)="([^"]*)"/gi;
      let attrMatch;
      while ((attrMatch = attrPattern.exec(attrs)) !== null) {
        // Convert kebab-case to camelCase for template vars
        const key = attrMatch[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        data[key] = attrMatch[2];
      }
    }

    // For pages with front matter (no <body> wrapper), the entire file.src IS the content
    let rawContent;
    if (this.file.frontMatter && !this.file.src.match(/<body[\s>]/i)) {
      rawContent = this.file.src.trim();
    } else {
      // Extract <body> inner content (the page content to inject)
      // If <main> exists, use its innerHTML; otherwise use the full <body> innerHTML
      const mainMatch = this.file.src.match(/<main[^>]*>([\s\S]*)<\/main>/i);
      if (mainMatch) {
        rawContent = mainMatch[1].trim();
      } else {
        const bodyMatch = this.file.src.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        if (bodyMatch) {
          rawContent = bodyMatch[1].trim();
        }
      }
    }

    // Extract named slots from <template slot="name"> elements.
    // These provide content for ${slot:name} placeholders in layouts.
    // Remaining content (after slot extraction) becomes ${content}.
    if (rawContent) {
      const slotPattern = /<template\s+slot="([^"]+)">([\s\S]*?)<\/template>/gi;
      let slotMatch;
      while ((slotMatch = slotPattern.exec(rawContent)) !== null) {
        data[`slot:${slotMatch[1]}`] = slotMatch[2].trim();
      }
      // Remove <template slot="..."> elements from content
      data.content = rawContent.replace(slotPattern, '').trim();
    }

    return data;
  }

  /**
   * Inject page data into the template.
   * Replaces ${content} and other ${var} placeholders.
   * @param {string} template - Template HTML
   * @param {Object} pageData - Extracted page data
   * @returns {string} Merged HTML
   */
  applyTemplate(template, pageData) {
    let html = template;

    // Replace ${content} first
    html = html.replace(/\$\{content\}/g, pageData.content || '');

    // Replace other ${var} placeholders with page data
    // Leave unmatched ones for later processing (e.g., ${siteTitle} resolved by replaceTemplateStrings)
    // Exception: unmatched ${slot:...} placeholders are removed (no content provided for that slot)
    html = html.replace(/\$\{([^}]+)\}/g, (match, key) => {
      const trimmedKey = key.trim();
      if (trimmedKey === 'content') return match; // Already replaced
      if (pageData[trimmedKey] !== undefined) return pageData[trimmedKey];
      // Remove unfilled slot placeholders rather than leaving them in output
      if (trimmedKey.startsWith('slot:')) return '';
      return match;
    });

    return html;
  }


  // EXPORT WRAPPER
  // -----------------------------
  static async export(opts) {
    return new ApplyTemplate(opts).init();
  }
}


// EXPORT
// -----------------------------
export default ApplyTemplate.export;
