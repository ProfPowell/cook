/**
 * @file replace-external-link-protocol.js
 * @description For targeted `<a>` tags, add `http://` in front of the href value, 
 * if it starts with `www` and wasn't added with a protocol (`http://` or `https://`).
 * Without this, the build process interprets it as a local link 
 * and will append the current window location origin.
 */

// REQUIRE
// -----------------------------
const cwd = process.cwd();
const chalk = require('chalk');
const Logger = require('../utils/logger/logger.js');
const Util = require('../utils/util/util.js');

// USER 'MAIN.JS' CONFIG
const {
  distPath,
  replaceExternalLinkProtocol = {enabled:true},
} = require('../utils/config/config.js');


// DEFINE
// -----------------------------
/**
 * @description Replace non-protocol `www.` and `cdn.` link paths to avoid them being treated as relative links.
 * @param {Object} obj - Deconstructed options object
 * @property {Object} obj.file - The current file's info (name, extension, path, src, etc.)
 * @property {Array} [obj.allowType] - Allowed file types (Opt-in)
 * @property {Array} [obj.disallowType] - Disallowed file types (Opt-out)
 */
class ReplaceExternalLinkProtocol {
  constructor({file, allowType, disallowType, excludePaths = []}) {
    this.opts = {file, allowType, disallowType, excludePaths};
    this.file = file;
    this.allowType = allowType;
    this.disallowType = disallowType;
    this.excludePaths = excludePaths;

    // Store holder for total # of replaced items
    this.total = 0;

    // Init terminal logging
    if (process.env.LOGGER) Util.initLogging.call(this);
  }

  // INIT
  // -----------------------------
  // Note: `process.env.DEV_CHANGED_PAGE` is defined in `browserSync.watch()` in dev.js
  async init() {
    // Early Exit: User opted out of this plugin
    if (!replaceExternalLinkProtocol.enabled) return;
    // Early Exit: File type not allowed
    const allowed = Util.isAllowedType(this.opts);
    if (!allowed) return;
    
    // START LOGGING
    this.startLog();

    // Destructure options
    const { file } = this;

    // Make source traversable with JSDOM
    let dom = Util.jsdom.dom({src: file.src});

    // Find <a>, <link>, and <script> tags
    const $link = dom.window.document.querySelectorAll('link');
    const $links = dom.window.document.querySelectorAll('a');
    const $script = dom.window.document.querySelectorAll('script');

    // Add `http://` to qualifying a tags
    // Replace leading `//` to qualifying tags
    if ($link) $link.forEach(el => this.replaceMissingProtocol({file, el}));
    if ($links) $links.forEach(el => this.replaceMissingProtocol({file, el}));
    if ($script) $script.forEach(el => this.replaceMissingProtocol({file, el}));
    
    // Store updated file source
    this.file.src = Util.setSrc({dom});

    // END LOGGING
    this.endLog();
  }

  // HELPER METHODS
  // -----------------------------

  /**
   * @description Evaluate `<a>` tag `[href]` value, and set protocol if link is external and protocol not added by the user
   * @example Replace: `<a href="www.xxxx.com">`
   * @example Does Not Replace: `<a href="https://www.xxxx.com">`
   * @param {Object} opts - The arguments object
   * @property {Object} file - The current file's props (ext,name,path,name)
   * @property {Object} el - The current <a>, <link>, or <script> tag being evaluated
   * @private
   */
  replaceMissingProtocol({file, scope, el}) {
    // Get source type (`href` or `src`)
    let srcType = el.href || el.src;
    // Early Exit: Tag does not have `[href]` or `[src]` or attribute value is empty string
    // Example: Someone adds an old-school anchor jump point: `<a id="jump-point"></a>`
    if (!srcType || srcType === '') return;
    // Get href path
    const linkPath = Util.getFileName(srcType, distPath);
    // Only replace for `www` and `cdn` instances, unless user defined their own
    const domainTargets = replaceExternalLinkProtocol.match || Util.replaceExternalLinkProtocolDefaults;
    const isTargetMatch = domainTargets.indexOf(linkPath) > -1;
    const pathType = el.href ? 'href' : 'src';
    // Update path
    if (isTargetMatch) this.replaceExternal(file, el, pathType);
    // Increment total counter
    if (isTargetMatch) this.total += 1;
  }

  /**
   * @description Create new, fixed external path
   * @property {Object} file - The current file's props (ext,name,path,name)
   * @property {Object} el - The current <a>, <link>, or <script> tag being evaluated
   * @property {String} type - Either the element's `[href]` or `[src]` prop to write new value to
   * @private
   */
  replaceExternal(file, el, type) {
    // Split path on /
    let linkPathSplit = el[type].split('/');
    // Filter out ''
    linkPathSplit = linkPathSplit.filter(s => s);
    // Find if 'localhost' is in the path name
    // We'll only replace these, as they represent the links we want to convert
    if (linkPathSplit.indexOf('localhost') === -1) return;
    el[type] = `http://${linkPathSplit[linkPathSplit.length-1]}`;
    // Show terminal message
    // Logger.success(`/${file.path} - Added 'http://' to [href="${linkPathSplit[linkPathSplit.length-1]}"]: ${ chalk.green(el[type]) }`);
  }
  

  // LOGGING
  // -----------------------------
  // Display additional terminal logging when `process.env.LOGGER` enabled
  
  startLog() {
    // Early Exit: Logging not allowed
    if (!process.env.LOGGER) return; 
    // Start Spinner
    this.loading.start(chalk.magenta('Replacing Missing Link Protocol'));
    // Start timer
    this.timer.start();
  }

  endLog() {
    // Early Exit: Logging not allowed
    if (!process.env.LOGGER) return;
    // Stop Spinner and Timer
    if (this.total > 0) this.loading.stop(`Replaced ${chalk.magenta(this.total)} missing link protocols ${this.timer.end()}`);
    // If no matches found, stop logger but don't show line in terminal
    else this.loading.kill();
  }

  
  // EXPORT WRAPPER
  // -----------------------------
  // Export function wrapper instead of class for `build.js` simplicity
  static async export(opts) {
    return new ReplaceExternalLinkProtocol(opts).init();
  }
}


// EXPORT
// -----------------------------
module.exports = ReplaceExternalLinkProtocol.export;