/**
 * @file declarative-shadow-dom.js
 * @description Pre-render Declarative Shadow DOM for web components.
 *
 * Scans built HTML for Shadow DOM component tags, looks up pre-rendered
 * shadow DOM content from a manifest, and injects
 * <template shadowrootmode="open"> with the content.
 *
 * This eliminates FOUC for Shadow DOM components and makes their content
 * visible to search engines without waiting for JS.
 *
 * Prerequisites:
 *   - VB components need: if (!this.shadowRoot) this.attachShadow({ mode: 'open' })
 *   - A DSD manifest mapping tag names to shadow DOM HTML
 *
 * Components that use Light DOM (layout-*, tab-set, accordion-wc, tool-tip)
 * don't need DSD — they already work without JS.
 */

// IMPORTS
// -----------------------------
import chalk from 'chalk';
import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import Util from '../utils/util/util.js';

// Config
import { distPath, dsd as dsdConfig } from '../utils/config/config.js';


// DEFINE
// -----------------------------
class DeclarativeShadowDom {
  constructor({ file, store, allowType, disallowType }) {
    this.opts = { file, allowType, disallowType };
    this.file = file;
    this.store = store;

    this.config = {
      enabled: false,
      // Path to DSD manifest JSON (tag → shadow DOM HTML)
      manifest: null,
      // User overrides
      ...dsdConfig,
    };

    // Track stats
    if (!this.store._dsdStats) {
      this.store._dsdStats = { total: 0 };
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

    // Early Exit: No manifest available
    if (!this.store._dsdManifest) return;

    // Parse HTML
    const dom = Util.jsdom.dom({ src: this.file.src });
    const document = dom.window.document;

    // Find all custom elements that have DSD templates
    const manifest = this.store._dsdManifest;
    let injected = 0;

    for (const [tagName, shadowHtml] of Object.entries(manifest)) {
      const elements = document.querySelectorAll(tagName);
      for (const el of elements) {
        // Skip if element already has a declarative shadow root
        if (el.querySelector('template[shadowrootmode]')) continue;

        // Resolve any dynamic content in the shadow template
        const resolvedHtml = this.resolveTemplate(shadowHtml, el);

        // Inject the DSD template as the first child
        el.insertAdjacentHTML('afterbegin',
          `<template shadowrootmode="open">${resolvedHtml}</template>`
        );
        injected++;
      }
    }

    if (injected > 0) {
      this.file.src = Util.setSrc({ dom });
      this.store._dsdStats.total += injected;
    }
  }

  /**
   * Load the DSD manifest (JSON: tag → shadow DOM HTML)
   * Cached after first load.
   */
  async loadManifest() {
    // Already loaded (or determined to not exist)
    if (this.store._dsdManifest !== undefined) return;

    if (!this.config.manifest) {
      this.store._dsdManifest = null;
      return;
    }

    const manifestPath = path.resolve(`${distPath}/${this.config.manifest}`);
    if (!existsSync(manifestPath)) {
      // Also check relative to cwd
      const cwdPath = path.resolve(this.config.manifest);
      if (!existsSync(cwdPath)) {
        this.store._dsdManifest = null;
        return;
      }
      try {
        const content = await fs.readFile(cwdPath, 'utf-8');
        this.store._dsdManifest = JSON.parse(content);
      } catch {
        this.store._dsdManifest = null;
      }
      return;
    }

    try {
      const content = await fs.readFile(manifestPath, 'utf-8');
      this.store._dsdManifest = JSON.parse(content);
    } catch {
      this.store._dsdManifest = null;
    }
  }

  /**
   * Resolve dynamic content in a shadow template based on element attributes.
   * Replaces ${attr:name} with the element's attribute value.
   * @param {string} template - Shadow DOM HTML template
   * @param {Element} el - The host element
   * @returns {string} Resolved HTML
   */
  resolveTemplate(template, el) {
    return template.replace(/\$\{attr:([^}]+)\}/g, (match, attrName) => {
      const value = el.getAttribute(attrName.trim());
      return value !== null ? value : '';
    });
  }


  // EXPORT WRAPPER
  // -----------------------------
  static async export(opts) {
    return new DeclarativeShadowDom(opts).init();
  }
}


// EXPORT
// -----------------------------
export default DeclarativeShadowDom.export;
