/**
 * @file replace-inline.js
 * @description Replace external `<link>` and `<script>` calls inline
 */

// REQUIRE
// -----------------------------
// const cwd = process.cwd();
const chalk = require('chalk');
const fs = require('fs-extra');
// const Logger = require('../utils/logger/logger.js');
const Util = require('../utils/util/util.js');

// Config
const {distPath} = require('../utils/config/config.js');

// DEFINE
// -----------------------------
/**
 * @description Replace external `<link>` and `<script>` calls inline
 * @param {Object} obj - Deconstructed options object
 * @property {Object} obj.file - The current file's info (name, extension, path, src, etc.)
 * @property {Object} obj.store - The build process' own data store object we'll add the cached inline-file content to
 * @property {Array} [obj.allowType] - Allowed file types (Opt-in)
 * @property {Array} [obj.disallowType] - Disallowed file types (Opt-out)
 */
class ReplaceInline {
  constructor({file, store, allowType, disallowType, excludePaths = []}) {
    this.opts = {file, allowType, disallowType, excludePaths};
    this.file = file;
    this.store = store;
    this.allowType = allowType;
    this.disallowType = disallowType;
    this.excludePaths = excludePaths;

    // Store holder for total # of replaced inline elements
    this.total = 0;

    // Add object to internal store for holding the cached include content
    if (!this.store.cachedInline) this.store.cachedInline = {};

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
    // Early Exit: Do not replace files locally
    if (process.env.NODE_ENV === 'development') return;

    // Destructure options
    const { file } = this;

    // Make source traversable with JSDOM
    let dom = Util.jsdom.dom({src: file.src});

    // Store all <link inline> and <scripts inline>
    const inlineLinkSelector = Util.getSelector(Util.attr.inline, 'link');
    const inlineScriptSelector = Util.getSelector(Util.attr.inline, 'script');
    const links = dom.window.document.querySelectorAll(inlineLinkSelector);
    const scripts = dom.window.document.querySelectorAll(inlineScriptSelector);
    this.total = links.length + scripts.length;

    // START LOGGING
    this.startLog();

    // REPLACE INLINE CSS
    await this.replaceLinks({links, file});
    // REPLACE INLINE SCRIPT
    await this.replaceScripts({scripts, file});

    // Store updated file source
    file.src = Util.setSrc({dom});

    // END LOGGING
    this.endLog();
  }


  // PROCESS METHODS
  // -----------------------------

  /**
   * @description TODO
   * @param {Object} opts - Options object
   * @property {Object} links - Query-selected group of `<link>` tags
   * @property {Object} file - The current file being modified
   * @private
   */
  async replaceLinks({links}) {
    await Promise.all([...links].map(el => this.replaceTag(el,'href')));
  }

  /**
   * @description TODO
   * @param {Object} opts - Options object
   * @property {Object} scripts - Query-selected group of `<script>` tags
   * @property {Object} file - The current file being modified
   * @private
   */
  async replaceScripts({scripts}) {
    await Promise.all([...scripts].map(el => this.replaceTag(el,'src')));
  }

  /**
   * @description Replace target tag with inline source equivalent
   * @param {Object} el - The target `<link>` or `<script>` tag to replace
   * @param {String} type - Either `href` or `src`, depending on the tag type
   * @param {Object} scope - Reference to `this` context
   */
  async replaceTag(el,type) {
    // Init vars
    let content;

    // Format path-to-source
    // If running locally, it adds `https://localhost` to the path
    // So our early exit would fail without formatting
    const formatPath = this.formatPath(el[type]);
    // Early Exit: Not a relative path to CSS file, likely external
    if (formatPath.charAt(0) !== '/') return;

    // CHECK IF CACHED VERSION
    // If this path was already looked up previously, use the stored-in-memory source instead of fetching and reading the file again.
    // NOTE: Include file could be empty, resulting in an empty string (''). Since this is treated as falsey by default,
    // we explicitly check for undefined or null (we need Null Coalescing Operator in Node now, cmon!)
    const cachedTarget = this.store.cachedInline[formatPath];
    if ([undefined, null].indexOf(cachedTarget) === -1) content = cachedTarget;

    // OTHERWISE, GET THE INCLUDE FILE'S CONTENT (`fs.readFile`)
    else content = await this.fetchInlineSrc(formatPath);

    // ADD CONTENT TO DOM
    // Add new `<style>` tag and then delete `<link>`
    const tagType = type === 'href' ? 'style' : 'script';
    el.insertAdjacentHTML('beforebegin', `<${tagType}>${content}</${tagType}>`);
    el.remove();
    // Show terminal message
    // Logger.success(`/${this.file.path} - Replaced link[${Util.attr.inline}]: ${ chalk.green(formatPath) }`);
  }

  /**
   * @description Lookup the inline file, by path, and get its source content.
   * @param
   * @returns {String}
   * @private
   */
  async fetchInlineSrc(path) {
    const replacePath = `${distPath}${path}`;
    try {
      // Get source from file
      const fetchedSrc = await fs.readFile(replacePath, 'utf-8');
      // Add entry to cached object store
      this.store.cachedInline[path] = fetchedSrc;
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
   * @description Remove localhost path when testing locally
   * NOTE: If running `dev:prod` locally, the href will include `https://localhost`
   * so the path would be something like: `/dist/https://localhost/assets/css/...`.
   * So, we strip that out for local testing
   * @param {String} path - The string path to format
   * @returns {String}
   * @private
   */
  formatPath(path) {
    const pathSplit = path.split('https://localhost');
    return pathSplit[pathSplit.length - 1];
  }
  

  // LOGGING
  // -----------------------------
  // Display additional terminal logging when `process.env.LOGGER` enabled
  
  startLog() {
    // Early Exit: Logging not allowed
    if (!process.env.LOGGER) return; 
    // Start Spinner
    this.loading.start(chalk.magenta('Replacing Inlines'));
    // Start timer
    this.timer.start();
  }

  endLog() {
    // Early Exit: Logging not allowed
    if (!process.env.LOGGER) return;
    // Stop Spinner and Timer
    if (this.total > 0) this.loading.stop(`Replaced ${chalk.magenta(this.total)} inlines ${this.timer.end()}`);
    // If no matches found, stop logger but don't show line in terminal
    else this.loading.kill();
  }
    

  // EXPORT WRAPPER
  // -----------------------------
  // Export function wrapper instead of class for `build.js` simplicity
  static async export(opts) {
    return new ReplaceInline(opts).init();
  }
}

// EXPORT
// -----------------------------
module.exports = ReplaceInline.export;