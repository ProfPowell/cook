/**
 * @file replace-external-link-protocol.js
 * @description For targeted `<a>` tags, add `http://` in front of the href value,
 * if it starts with `www` and wasn't added with a protocol (`http://` or `https://`).
 * Without this, the build process interprets it as a local link
 * and will append the current window location origin.
 */

// IMPORT
// -----------------------------
const cwd = process.cwd();
import chalk from 'chalk';
import Logger from '../utils/logger/logger.js';
import Util from '../utils/util/util.js';

// USER 'MAIN.JS' CONFIG
import {
  distPath,
  replaceExternalLinkProtocol as replaceExternalLinkProtocolConfig,
} from '../utils/config/config.js';

const replaceExternalLinkProtocol = replaceExternalLinkProtocolConfig || {enabled:true};


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
    // Get source type (`href` or `src`) — use getAttribute for parser compatibility
    const value = el.getAttribute('href') || el.getAttribute('src');
    // Early Exit: Tag does not have `[href]` or `[src]` or attribute value is empty string
    // Example: Someone adds an old-school anchor jump point: `<a id="jump-point"></a>`
    if (!value) return;
    // Early Exit: Already has a protocol/scheme (http:, https:, mailto:,
    // tel:, data:, …) or is protocol-relative (//cdn.example.com)
    if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')) return;
    // Only replace values starting with a target domain prefix followed
    // by a dot (`www.`, `cdn.` by default, or user-defined via config).
    // NOTE: linkedom returns raw attribute values (no URL resolution), so
    // the check works directly on what the author wrote.
    const domainTargets = replaceExternalLinkProtocol.match || Util.replaceExternalLinkProtocolDefaults;
    const prefixPattern = new RegExp(`^(?:${domainTargets.join('|')})\\.`, 'i');
    if (!prefixPattern.test(value)) return;
    // Update path
    const pathType = el.getAttribute('href') !== null ? 'href' : 'src';
    el.setAttribute(pathType, `http://${value}`);
    // Increment total counter
    this.total += 1;
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
export default ReplaceExternalLinkProtocol.export;
