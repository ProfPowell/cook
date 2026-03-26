/**
 * @file auto-components.js
 * @description Auto-detect custom elements in pages and manage JS loading.
 *
 * Scans each built HTML page for custom element tags (contain a hyphen),
 * cross-references against a configurable list of CSS-only elements,
 * and either:
 *   - Removes the VB script tag if only CSS-only elements are used
 *   - Keeps the VB bundle if JS-requiring elements are found
 *   - Generates an import map for per-component loading (when manifest exists)
 */

// IMPORTS
// -----------------------------
import chalk from 'chalk';
import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import Util from '../utils/util/util.js';

// Config
import { distPath, autoComponents as autoComponentsConfig } from '../utils/config/config.js';


// DEFINE
// -----------------------------
class AutoComponents {
  constructor({ file, store, allowType, disallowType }) {
    this.opts = { file, allowType, disallowType };
    this.file = file;
    this.store = store;

    this.config = {
      enabled: false,
      // Path to component manifest JSON (tag → JS file mapping)
      manifest: null,
      // CSS-only elements that never need JS
      cssOnly: [],
      // Regex pattern to find VB bundle script tags for removal
      bundlePattern: /vanilla-breeze[^"']*\.js/,
      // User overrides
      ...autoComponentsConfig,
    };

    // Lazily loaded manifest
    if (!this.store._autoComponentsManifest) {
      this.store._autoComponentsManifest = undefined; // not yet loaded
    }

    // Track stats
    if (!this.store._autoComponentsStats) {
      this.store._autoComponentsStats = { stripped: 0, kept: 0, importMapped: 0 };
    }
  }

  // INIT
  // -----------------------------
  async init() {
    // Early Exit: Disabled
    if (!this.config.enabled) return;

    // Early Exit: File type not allowed
    const allowed = Util.isAllowedType(this.opts);
    if (!allowed) return;

    // Load manifest once
    await this.loadManifest();

    // Parse HTML for custom elements
    const dom = Util.jsdom.dom({ src: this.file.src });
    const document = dom.window.document;

    // Find all custom element tags in the document
    const customElements = this.findCustomElements(document);

    // Separate into CSS-only and JS-requiring
    const jsComponents = customElements.filter(tag => !this.isCssOnly(tag));

    if (jsComponents.length === 0) {
      // No JS-requiring components — remove VB bundle script
      this.removeVbScript(document);
      this.store._autoComponentsStats.stripped++;
    } else if (this.store._autoComponentsManifest) {
      // We have a manifest — generate import map for only needed components
      this.injectImportMap(document, jsComponents);
      this.removeVbScript(document);
      this.store._autoComponentsStats.importMapped++;
    } else {
      // No manifest — keep the full bundle
      this.store._autoComponentsStats.kept++;
    }

    // Store updated file source
    this.file.src = Util.setSrc({ dom });
  }

  /**
   * Find all custom element tag names in the document
   * Custom elements must contain a hyphen per the HTML spec
   * @param {Document} document
   * @returns {string[]} Unique custom element tag names
   */
  findCustomElements(document) {
    const tags = new Set();
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      const tag = el.tagName.toLowerCase();
      if (tag.includes('-')) {
        tags.add(tag);
      }
    }
    return [...tags];
  }

  /**
   * Check if a custom element is CSS-only (no JS needed)
   * @param {string} tag - Element tag name
   * @returns {boolean}
   */
  isCssOnly(tag) {
    return this.config.cssOnly.includes(tag);
  }

  /**
   * Load the component manifest (JSON: tag → JS file path)
   * Cached after first load.
   */
  async loadManifest() {
    // Already loaded (or determined to not exist)
    if (this.store._autoComponentsManifest !== undefined) return;

    if (!this.config.manifest) {
      this.store._autoComponentsManifest = null;
      return;
    }

    const manifestPath = path.resolve(`${distPath}/${this.config.manifest}`);
    if (!existsSync(manifestPath)) {
      this.store._autoComponentsManifest = null;
      return;
    }

    try {
      const content = await fs.readFile(manifestPath, 'utf-8');
      this.store._autoComponentsManifest = JSON.parse(content);
    } catch {
      this.store._autoComponentsManifest = null;
    }
  }

  /**
   * Remove the VB bundle <script> tag from the document
   * @param {Document} document
   */
  removeVbScript(document) {
    const scripts = document.querySelectorAll('script[src]');
    for (const script of scripts) {
      const src = script.getAttribute('src') || '';
      if (this.config.bundlePattern.test(src)) {
        script.remove();
      }
    }
  }

  /**
   * Inject an import map and module scripts for specific components
   * @param {Document} document
   * @param {string[]} jsComponents - Tag names that need JS
   */
  injectImportMap(document, jsComponents) {
    const manifest = this.store._autoComponentsManifest;
    if (!manifest) return;

    const imports = {};
    const needed = [];

    for (const tag of jsComponents) {
      const jsPath = manifest[tag];
      if (jsPath) {
        const importName = `vb/${tag}`;
        imports[importName] = jsPath.startsWith('/') ? jsPath : `/${jsPath}`;
        needed.push(importName);
      }
    }

    if (needed.length === 0) return;

    const head = document.querySelector('head');
    if (!head) return;

    // Create import map
    const importMapScript = document.createElement('script');
    importMapScript.setAttribute('type', 'importmap');
    importMapScript.textContent = JSON.stringify({ imports }, null, 2);
    head.appendChild(importMapScript);

    // Create module script that imports all needed components
    const moduleScript = document.createElement('script');
    moduleScript.setAttribute('type', 'module');
    moduleScript.textContent = needed.map(name => `import "${name}";`).join('\n');
    head.appendChild(moduleScript);
  }


  // EXPORT WRAPPER
  // -----------------------------
  static async export(opts) {
    return new AutoComponents(opts).init();
  }
}


// EXPORT
// -----------------------------
export default AutoComponents.export;
