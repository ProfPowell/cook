/**
 * @file minify-src.js
 * @description Minify HTML, CSS, and JS sources in `/dist`
 */

// IMPORT
// -----------------------------
import chalk from 'chalk';
import fs from 'fs-extra';
import CleanCSS from 'clean-css';
import { minify as minifyHtml } from 'html-minifier-terser';
import * as terser from 'terser';
import Util from '../utils/util/util.js';

// Config
import { srcPath, distPath, minifyHtmlConfigCustom } from '../utils/config/config.js';

// Inline <script> types that contain executable JavaScript.
// Anything else (application/ld+json, importmap, speculationrules,
// text/x-template, etc.) must be left untouched — terser rejects them.
const JS_SCRIPT_TYPES = new Set(['', 'text/javascript', 'application/javascript', 'module']);

// Content-keyed cache for minified inline JS/CSS. Sites repeat identical
// inline snippets across pages (shared includes/components: analytics,
// theme toggles, component styles) — minify each distinct snippet once
// per build process instead of once per page. Bounded to avoid growth
// in long-lived dev sessions.
const MINIFY_CACHE_MAX = 500;
const jsCache = new Map();
const cssCache = new Map();
function cacheGet(cache, key) {
  return cache.get(key);
}
function cacheSet(cache, key, value) {
  if (cache.size >= MINIFY_CACHE_MAX) cache.clear();
  cache.set(key, value);
}


// DEFINE
// -----------------------------
/**
 * @description Minify the current file's source based on its type
 * @param {Object} obj - Deconstructed options object
 * @property {Object} obj.file - The current file's info (name, extension, path, src, etc.)
 * @property {Array} [obj.allowType] - Allowed file types (Opt-in)
 * @property {Array} [obj.disallowType] - Disallowed file types (Opt-out)
 */
class MinifySrc {
  constructor({file, allowType, disallowType, excludePaths = []}) {
    this.opts = {file, allowType, disallowType, excludePaths};
    this.file = file;
    this.allowType = allowType;
    this.disallowType = disallowType;
    this.excludePaths = excludePaths;

    // Minfiy CSS
    this.minifyCssConfig = {
      inline: ['none'],
    };

    // Minfiy HTML
    // Default config with user overrides merged on top
    const defaultHtmlConfig = {
      collapseWhitespace: true,
      removeAttributeQuotes: true,
      removeComments: true,
      removeRedundantAttributes: false,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
      useShortDoctype: true,
      // Skip <code-block> elements — their escaped HTML/JS/CSS content
      // confuses the parser. Also skip any user-provided patterns.
      ignoreCustomFragments: [
        /<code-block[\s\S]*?<\/code-block>/gi,
        /<pre[\s\S]*?<\/pre>/gi,
        ...(minifyHtmlConfigCustom?.ignoreCustomFragments || []),
      ],
    };
    this.minifyHtmlConfig = minifyHtmlConfigCustom
      ? { ...defaultHtmlConfig, ...minifyHtmlConfigCustom, ignoreCustomFragments: defaultHtmlConfig.ignoreCustomFragments }
      : defaultHtmlConfig;

    // Minfiy JS
    this.minifyJsConfig = {};

    // Init terminal logging
    if (process.env.LOGGER) Util.initLogging.call(this);
  }

  // INIT
  // -----------------------------
  // Note: `process.env.DEV_CHANGED_PAGE` is defined in `browserSync.watch()` in dev.js
  async init() {
    // Early Exit: File type not allowed
    const allowed = Util.isAllowedType(this.opts);
    if (!allowed) return;
    // Early Exit: Don't minify in development
    if (process.env.NODE_ENV === 'development') return;
    // Early Exit: User opted out (example, unminify in stage)
    if (process.env.MINIFY === 'false') return;

    // START LOGGING
    this.startLog();

    // Destructure options
    const { file } = this;

    // Minify source differently based on the file type
    let newSrc;
    switch (file.ext) {
      case 'css': newSrc = this.minCss(file.src); break;
      case 'html': newSrc = await this.minHtml(file.src, file.path); break;
      case 'js': newSrc = await this.minJs(file.src, { label: file.path }); break;
    }

    // Store new source.
    // Unrecognized types fall through with `newSrc` undefined and must
    // keep their original source — never write `undefined` to disk.
    if (typeof newSrc === 'string') file.src = newSrc;

    // END LOGGING
    this.endLog();
  }


  // PRIMARY MINIFY METHODS
  // -----------------------------
  // All methods are string-in/string-out and NEVER mutate `file.src` —
  // a failed minification must leave the page source untouched, not
  // replace it with an intermediate fragment.

  async minHtml(src, label) {
    // MINIFY HTML — wrapped in try/catch so parse errors on pages with
    // complex inline code examples don't crash the entire build
    try {
      let out = await minifyHtml(src, this.minifyHtmlConfig);
      // MINIFY INLINE CSS + SCRIPTS (single parse for both)
      out = await this.minifyInlineAssets(out, label);
      return out;
    } catch (err) {
      // Skip minification for this file — likely has unescaped code examples
      // that confuse the HTML parser. The unminified output is still valid.
      if (process.env.LOGGER) console.warn(`  ⚠ Skipped minification for ${label}: ${err.message.substring(0, 80)}`);
      return src;
    }
  }

  async minJs(src, { module = false, label } = {}) {
    const cacheKey = (module ? 'm:' : 's:') + src;
    const cached = cacheGet(jsCache, cacheKey);
    if (cached !== undefined) return cached;
    try {
      const config = module ? { ...this.minifyJsConfig, module: true } : this.minifyJsConfig;
      const result = await terser.minify(src, config);
      const out = typeof result.code === 'string' ? result.code : src;
      cacheSet(jsCache, cacheKey, out);
      return out;
    } catch (err) {
      // Invalid or non-standard JS: ship it unminified rather than
      // corrupting the file or killing the build.
      if (process.env.LOGGER) console.warn(`  ⚠ Skipped JS minification${label ? ` for ${label}` : ''}: ${err.message.substring(0, 80)}`);
      return src;
    }
  }

  minCss(src) {
    const cached = cacheGet(cssCache, src);
    if (cached !== undefined) return cached;
    // Minify source
    let out = new CleanCSS(this.minifyCssConfig).minify(src).styles;
    // Replace '@import' calls with their inlined source
    out = this.replaceCssImports(out);
    cacheSet(cssCache, src, out);
    // Return modified source
    return out;
  }


  // HELPER METHODS
  // -----------------------------

  /**
   * @description Inline `@import url(...)` sources into the CSS
   * @param {String} src - The CSS source
   * @returns {String}
   * @private
   */
  // TODO: The regex could likely be done a little nicer if we could use lookbehinds.
  // Instead for now, the pattern matches: url(/css/variables.css
  // so we just lop off the first four characters
  replaceCssImports(src) {
    let path, replaceSrc;
    // Check for @import and replace them with their source
    const pattern = /@import\s*url\(([/.\_\-)a-z]*);/gim;
    const matches = src.match(pattern);
    if (matches) {
      matches.forEach(m => {
        path = m.match(/url\(.*(?=\))/gim)[0].slice(4);
        // If path has /src at the start, strip it off
        path = path.replace(/^\/src/, '');
        // Get source to replace
        replaceSrc = fs.readFileSync(`${srcPath}${path}`, 'utf-8');
        // Minimize it
        replaceSrc = new CleanCSS(this.minifyCssConfig).minify(replaceSrc).styles;
        // Replace @import with source
        src = src.replace(m, () => replaceSrc);
      });
    }
    return src;
  }

  /**
   * @description Minify inline `<style>` and `<script>` contents in a
   * single parse. Skips external scripts and non-JS script types
   * (JSON-LD, import maps, etc.)
   * @param {String} src - The page source
   * @param {String} [label] - File path for warning messages
   * @returns {String}
   * @private
   */
  async minifyInlineAssets(src, label) {
    const dom = Util.jsdom.dom({src});
    const document = dom.window.document;

    document.querySelectorAll('style').forEach(el => {
      const content = el.textContent;
      if (!content || !content.trim()) return;
      el.textContent = this.minCss(content);
    });

    for (const el of document.querySelectorAll('script')) {
      // Only minify executable JavaScript
      const type = (el.getAttribute('type') || '').trim().toLowerCase();
      if (!JS_SCRIPT_TYPES.has(type)) continue;
      // External scripts have no inline content to minify
      if (el.hasAttribute('src')) continue;
      const content = el.textContent;
      if (!content || !content.trim()) continue;
      el.textContent = await this.minJs(content, { module: type === 'module', label });
    }

    return Util.setSrc({dom});
  }


  // LOGGING
  // -----------------------------
  // Display additional terminal logging when `process.env.LOGGER` enabled

  startLog(total) {
    // Early Exit: Logging not allowed
    if (!process.env.LOGGER) return;
    // Start Spinner
    this.loading.start(chalk.magenta('Minifying source'));
    // Start timer
    this.timer.start();
  }

  endLog() {
    // Early Exit: Logging not allowed
    if (!process.env.LOGGER) return;
    // Stop Spinner and Timer
    this.loading.stop(`Minified source ${this.timer.end()}`);
  }


  // EXPORT WRAPPER
  // -----------------------------
  // Export function wrapper instead of class for `build.js` simplicity
  static async export(opts) {
    return new MinifySrc(opts).init();
  }
}


// EXPORT
// -----------------------------
export default MinifySrc.export;
