/**
 * @file minify-src.js
 * @description Remove `/dist` and recreate it
 */

// REQUIRE
// -----------------------------
// const cwd = process.cwd();
const chalk = require('chalk');
const fs = require('fs-extra');
const minifyCss = require('clean-css');
const minifyHtml = require('html-minifier').minify;
const minifyEs = require('uglify-es');
// const Logger = require('../utils/logger/logger.js');
const Util = require('../utils/util/util.js');

// Config
const {srcPath,distPath,minifyHtmlConfigCustom} = require('../utils/config/config.js');


// DEFINE
// -----------------------------
/**
 * @description Remove `/dist` and recreate it
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
    this.minifyHtmlConfig = minifyHtmlConfigCustom || {
      collapseWhitespace: true,
      removeAttributeQuotes: true,
      removeComments: true,
      removeRedundantAttributes: false,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
      useShortDoctype: true,
    }

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
      case 'css': newSrc = this.minCss({file}); break;
      case 'html': newSrc = this.minHtml({file}); break;
      case 'js': newSrc = this.minJs({file}); break;
    }

    // Store new source
    file.src = newSrc;

    // END LOGGING
    this.endLog();
  }


  // PRIMARY MINIFY METHODS
  // -----------------------------
  minHtml({file}) {
    // MINIFY HTML
    file.src = minifyHtml(file.src, this.minifyHtmlConfig);
    // MINIFY INLINE CSS
    file.src = this.minifyInline(file, 'style', this.minCss.bind(this));
    // MINIFY INLINE SCRIPTS
    file.src = this.minifyInline(file, 'script', this.minJs.bind(this));
    // Return new src
    return file.src;
  }

  minJs({file}) {
    return minifyEs.minify(file.src, this.minifyJsConfig).code;
  }

  minCss({file}) {
    // Minify source
    file.src = new minifyCss(this.minifyCssConfig).minify(file.src).styles;
    // Replace '@import' calls with their inlined source
    file.src = this.replaceCssImports({file});
    // Return modified file source
    return file.src;
  }


  // HELPER METHODS
  // -----------------------------

  /**
   * @description
   * @param {Object} opts - The argument object
   * @property {Object} file - The file source properties (ext,name,path,src)
   * @private
   */
  // TODO: The regex could likely be done a little nicer if we could use lookbehinds.
  // Instead for now, the pattern matches: url(/css/variables.css
  // so we just lop off the first four characters
  replaceCssImports({file}) {
    let path, replaceSrc;
    // Check for @import and replace them with their source
    const pattern = /@import\s*url\(([/.\_\-)a-z]*);/gim;
    const matches = file.src.match(pattern);
    if (matches) {
      matches.forEach((m,i) => {
        path = m.match(/url\(.*(?=\))/gim)[0].slice(4);
        // If path has /src at the start, strip it off
        path = path.replace(/^\/src/, '');
        // Get source to replace
        replaceSrc = fs.readFileSync(`${srcPath}${path}`, 'utf-8');
        // Minimize it
        replaceSrc = new minifyCss(this.minifyCssConfig).minify(replaceSrc).styles;
        // Replace @import with source
        // console.log('\nsrc', fileSource.src)
        file.src = file.src.replace(m, replaceSrc);
      });
    }
    return file.src;
  }

  /**
   * @description Minify inline `<style>` tags
   * @param {Object} file - The current file items (ext,name,path,src)
   * @param {String} selector - The html element string selector for querying
   * @param {Object} type - The minification method to use
   * @private
   */
  minifyInline(file, selector, type) {
    const dom = Util.jsdom.dom({src: file.src});
    const group = dom.window.document.querySelectorAll(selector);
    let minifiedSrc;
    group.forEach((el,i) => {
      file.src = el.textContent;
      // Minify content
      minifiedSrc = type({file});
      // Update tag with new minified source
      el.textContent = minifiedSrc;
    });
    // Store updated file source
    file.src = Util.setSrc({dom});
    // Return updated file source
    return file.src;
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
module.exports = MinifySrc.export;