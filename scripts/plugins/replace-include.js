/**
 * @file replace-includes.js
 * @description Replace include markers with corresponding code
 */

// IMPORT
// -----------------------------
import chalk from 'chalk';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import Util from '../utils/util/util.js';

// Config
import { convertPageToDirectory, distPath, srcPath } from '../utils/config/config.js';


// DEFINE
// -----------------------------
/**
 * @description Replace include markers with corresponding code
 * @param {Object} obj - Deconstructed options object
 * @property {Object} obj.file - The current file's info (name, extension, path, src, etc.)
 * @property {Object} obj.store - The build process' own data store object we'll add the cached include-file content to
 * @property {Array} [obj.allowType] - Allowed file types (Opt-in)
 * @property {Array} [obj.disallowType] - Disallowed file types (Opt-out)
 */
class ReplaceInclude {
  constructor({file, store, allowType, disallowType, excludePaths = [], _depth = 0}) {
    this.opts = {file, allowType, disallowType, excludePaths};
    this.file = file;
    this.store = store;
    this.allowType = allowType;
    this.disallowType = disallowType;
    this.excludePaths = excludePaths;
    this._depth = _depth;

    // Maximum nesting depth to prevent infinite recursion
    this.MAX_DEPTH = 5;

    // Store holder for total # of includes
    this.total = 0;

    // Add object to internal store for holding the cached include content
    if (!this.store.cachedIncludes) this.store.cachedIncludes = {};

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

    // Early Exit: No includes in source
    if (!this.file.src.includes('data-include') &&
        !this.file.src.includes('<include-file')) return;

    // START LOGGING
    this.startLog();

    // Resolve includes at the string level using regex.
    // This avoids DOM parsing quirks (e.g., parsers moving elements
    // out of <head>) and is faster than DOM-based resolution.
    let changed = true;
    while (changed && this._depth < this.MAX_DEPTH) {
      changed = false;

      // Match <include-file src="/path"></include-file>
      this.file.src = await this.replacePattern(
        this.file.src,
        /<include-file\s+src="([^"]+)"[^>]*><\/include-file>/gi,
        (match, srcPath) => srcPath,
        () => { changed = true; }
      );

      // Match <... data-include="/path"...> (any element with data-include attribute)
      this.file.src = await this.replacePattern(
        this.file.src,
        /<(\w+)\s[^>]*data-include="([^"]+)"[^>]*><\/\1>/gi,
        (match, tag, srcPath) => srcPath,
        () => { changed = true; }
      );

      // Match <... include="/path"...> (any element with include attribute)
      this.file.src = await this.replacePattern(
        this.file.src,
        /<(\w+)\s[^>]*\binclude="([^"]+)"[^>]*><\/\1>/gi,
        (match, tag, srcPath) => srcPath,
        () => { changed = true; }
      );

      // Also handle self-closing: <meta data-include="/path">
      this.file.src = await this.replacePattern(
        this.file.src,
        /<meta\s[^>]*data-include="([^"]+)"[^>]*>/gi,
        (match, srcPath) => srcPath,
        () => { changed = true; }
      );

      this._depth++;
    }

    // END LOGGING
    this.endLog();
  }


  // STRING-LEVEL INCLUDE RESOLUTION
  // -----------------------------
  /**
   * @description Replace all matches of a pattern with fetched file content
   * @param {string} src - The source HTML string
   * @param {RegExp} pattern - Regex to match include markers
   * @param {Function} pathExtractor - Function that extracts the file path from regex groups
   * @param {Function} onReplace - Callback when a replacement is made
   * @returns {string} Updated source
   */
  async replacePattern(src, pattern, pathExtractor, onReplace) {
    const matches = [...src.matchAll(pattern)];
    if (!matches.length) return src;

    // Process matches in reverse order to preserve string positions
    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i];
      const filePath = pathExtractor(...match);
      const content = await this.getIncludeContent(filePath);
      src = src.substring(0, match.index) + content + src.substring(match.index + match[0].length);
      this.total++;
      onReplace();
    }
    return src;
  }

  /**
   * @description Get include file content (with caching)
   * @param {string} filePath - The include path (e.g., "/includes/head.html")
   * @returns {string} File content
   */
  async getIncludeContent(filePath) {
    const fullPath = path.resolve(`${srcPath}/${filePath}`);

    // Check cache
    const cached = this.store.cachedIncludes[fullPath];
    if (cached !== undefined && cached !== null) return cached;

    // Fetch and cache
    return await this.fetchIncludeSrc(fullPath);
  }


  // REPLACE INDIV. INCLUDE (legacy DOM-based — kept for backward compat)
  // -----------------------------
  /**
   * @description Replace include with corresponding source code
   * @param {Object} el - The current include to replace
   * Caches includes' content that was already fetched, to speed up performance.
   * @private
   */
  async replaceInclude(el) {
    // If attribute found and it has a path
    const hasInclude = this.hasAttribute(el, Util.attr.include);
    if (hasInclude && hasInclude.path && hasInclude.path.length) {
      try {
        // Init vars
        let content;

        // Get full system path to the include file
        // Read from srcPath since build-only dirs (includes/) may not be in dist
        const includePath = path.resolve(`${srcPath}/${hasInclude.path}`);

        // CHECK IF CACHED VERSION
        // If this path was already looked up previously, use the stored-in-memory source instead of fetching and reading the file again.
        // NOTE: Include file could be empty, resulting in an empty string (''). Since this is treated as falsey by default,
        // we explicitly check for undefined or null (we need Null Coalescing Operator in Node now, cmon!)
        const cachedTarget = this.store.cachedIncludes[includePath];
        if ([undefined, null].indexOf(cachedTarget) === -1) content = cachedTarget;

        // OTHERWISE, GET THE INCLUDE FILE'S CONTENT (`fs.readFile`)
        else content = await this.fetchIncludeSrc(includePath);

        // ADD CONTENT TO DOM
        // Replace the include element with the fetched content using outerHTML.
        // This keeps content in the correct DOM context (e.g., <head> stays in <head>).
        el.outerHTML = content;
      }
      catch (err) {
        Util.customError(err, `replace-includes.js`);
      }
    }
  }


  // PROCESS METHODS
  // -----------------------------

  /**
   * @description Lookup the include file, by path, and get its source content.
   * @param
   * @returns {String}
   * @private
   */
  async fetchIncludeSrc(path) {
    // Store raw path
    let formattedIncludePath = path;
    // Format the path before doing a file lookup, in case the user added a malformed path
    const hasExtension = !!path.match(/.html/g);
    // Include files are read from src/ where they are in their original form
    // (not directory-converted), so just add .html if missing
    if (!hasExtension) formattedIncludePath = `${path}.html`;
    // Get and return content of target include file
    try {
      // Get source from file
      const fetchedSrc = await fs.readFile(formattedIncludePath, 'utf-8');
      // Add entry to cached object store
      this.store.cachedIncludes[path] = fetchedSrc;
      // Return source
      return fetchedSrc;
    }
    catch (err) {
      Util.customKill(`fetchInlineSrc(): ${err}`);
    }
  }


  // HELPER METHODS
  // -----------------------------

  /**
   * @description If the include element had other attributes added, apply them to the first replaced, valid element found.
   * @example The replaced source has a `<style>` tag followed by 2 sibling `<div>` tags. We add the attributes to the first `<div>`
   * @param {Object} el - The `[data-include]` or `[include]` element that is replaced
   * @private
   */
  addAttributesToReplacedDOM(el) {
    const targetEl = this.getValidNextElement(el);
    // Early Exit: No valid element found
    if (!targetEl) return;
    // Loop through each attribute on the include element
    for (let i=0; i<el.attributes.length; i++) {
      const name = el.attributes[i].name;
      const value = el.attributes[i].value;
      const includeFileOwnAttrs = ['src', 'mode', 'lazy', 'allow-scripts'];
      const isIncludeFile = el.tagName === 'INCLUDE-FILE';
      const isValidAttr = isIncludeFile
        ? includeFileOwnAttrs.indexOf(name) === -1
        : Util.attr.include.indexOf(name) === -1;
      if (isValidAttr) targetEl.setAttribute(name, value);
    }
  }

  /**
   * @description Get the next valid element sibling (excludes style/script/etc. elements)
   * @param {Object} el - The `[data-include]` or `[include]` element that is replaced
   * @private
   */
  getValidNextElement(el) {
    const invalidTypes = ['DESCRIPTION','LINK','META','SCRIPT','STYLE','TEMPLATE','TITLE'];
    let nextEl = el.nextElementSibling, targetEl;
    while (nextEl) {
      // If a valid element type, store it
      const isValid = invalidTypes.indexOf(nextEl.nodeName) === -1;
      if (isValid) targetEl = nextEl;
      // Stop the loop if valid element found, or go to the next one
      nextEl = targetEl ? false : nextEl.nextElementSibling;
    }
    return targetEl;
  }

  /**
   * @description Match target attribute(s) against target DOM element
   * @param {Object} el - The element to check attributes
   * @param {*} attrs - The attributes to compare against
   * @returns {Boolean}
   * @private
   */
  hasAttribute(el, attrs) {
    // Handle <include-file src="..."> elements
    if (el.tagName === 'INCLUDE-FILE') {
      const srcVal = el.getAttribute('src');
      return srcVal ? { type: 'src', path: srcVal } : false;
    }
    // Handle [include] / [data-include] elements
    let tmpArr = [];
    if (typeof attrs === 'string') tmpArr.push({ type: Util.attr.include, path: el.getAttribute(Util.attr.include) });
    else attrs.forEach(a => tmpArr.push({ type: a, path: el.getAttribute(a) }));
    // Filter out falsey
    tmpArr = tmpArr.filter(a => a.path);
    // Return boolean
    return tmpArr[0] || false;
  }


  // LOGGING
  // -----------------------------
  // Display additional terminal logging when `process.env.LOGGER` enabled

  startLog() {
    // Early Exit: Logging not allowed
    if (!process.env.LOGGER) return;
    // Start Spinner
    this.loading.start(chalk.magenta('Replacing Includes'));
    // Start timer
    this.timer.start();
  }

  endLog() {
    // Early Exit: Logging not allowed
    if (!process.env.LOGGER) return;
    // Stop Spinner and Timer
    if (this.total > 0) this.loading.stop(`Replaced ${chalk.magenta(this.total)} includes ${this.timer.end()}`);
    // If no matches found, stop logger but don't show line in terminal
    else this.loading.kill();
  }


  // EXPORT WRAPPER
  // -----------------------------
  // Export function wrapper instead of class for `build.js` simplicity
  static async export(opts) {
    return new ReplaceInclude(opts).init();
  }
}


// EXPORT
// -----------------------------
export default ReplaceInclude.export;
