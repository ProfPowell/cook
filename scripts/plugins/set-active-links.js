/**
 * @file set-active-links.js
 * @description Add `[data-active]` state to `<a>` tags whose `[href]` value matches the current page
 */

// IMPORT
// -----------------------------
import chalk from 'chalk';
import Util from '../utils/util/util.js';

// Config
import { distPath, activeLink } from '../utils/config/config.js';


// DEFINE
// -----------------------------
/**
 * @description Add `[data-active]` state to `<a>` tags whose `[href]` value matches the current page
 * @param {Object} obj - Deconstructed options object
 * @property {Object} obj.file - The current file's info (name, extension, path, src, etc.)
 * @property {Array} [obj.allowType] - Allowed file types (Opt-in)
 * @property {Array} [obj.disallowType] - Disallowed file types (Opt-out)
 */
class SetActiveLinks {
  constructor({file, allowType, disallowType, excludePaths = []}) {
    this.opts = {file, allowType, disallowType, excludePaths};
    this.file = file;
    this.allowType = allowType;
    this.disallowType = disallowType;
    this.excludePaths = excludePaths;

    // Store holder for total # of replaced items
    this.total = { active:0, activeParent:0 };

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

    // START LOGGING
    this.startLog();

    // Destructure options
    const { file } = this;

    // Make source traversable with JSDOM
    let dom = Util.jsdom.dom({src: file.src});

    // Find <a> tags and add active state
    // if their [href] matches the current page url
    // Note: Using `a[href]` instead of just `a` as selector, since a user may omit the `[href]` attribute
    const $links = dom.window.document.querySelectorAll('a[href]');
    $links.forEach((link,i) => this.setActive({file, link}));

    // Store updated file source
    file.src = Util.setSrc({dom});

    // END LOGGING
    this.endLog();
  }

  // HELPER METHODS
  // -----------------------------

  /**
   * @description Set <a> tags to 'active' state if their [href] value file name matches the current file's name, or a parent-state iF an ancestor of the current page.
   * @param {Object} opts - The arguments object
   * @property {Object} file - The current file's props (ext,name,path,name)
   * @property {Object} link - The current <a> tag being evaluated
   * @private
   */
  setActive({file, link}) {
    // Compare full normalized URL paths — the old last-segment comparison
    // marked /company/about/ active on /legal/about/ and even matched
    // external links whose URL ended in the same segment.
    const pageUrl = this.normalizePagePath(file.path);
    const linkUrl = this.normalizeHref(link.getAttribute('href'));
    if (linkUrl === null) return;
    if (linkUrl === pageUrl) this.setActiveLink(link);
    // Parent-active: the link is a proper ancestor path of the page.
    // Root ('/') is an ancestor of everything — never parent-active.
    else if (linkUrl !== '/' && pageUrl.startsWith(linkUrl)) this.setParentActiveLink(link);
  }

  /**
   * @description Normalize the built page's file path to its URL path
   * @example dist/legal/about/index.html → /legal/about/
   * @example dist/404.html → /404/
   * @param {String} pagePath
   * @returns {String}
   * @private
   */
  normalizePagePath(pagePath) {
    let p = pagePath.startsWith(`${distPath}/`)
      ? pagePath.slice(distPath.length)
      : (pagePath.startsWith('/') ? pagePath : `/${pagePath}`);
    return this.normalizeUrlPath(p);
  }

  /**
   * @description Normalize an internal href to a comparable URL path.
   * Returns null for links that can never be "the current page":
   * external URLs, protocol-relative, anchors, non-root-relative paths.
   * @param {String} href
   * @returns {String|null}
   * @private
   */
  normalizeHref(href) {
    if (!href) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//') || href.startsWith('#')) return null;
    const p = href.split(/[?#]/)[0];
    if (!p.startsWith('/')) return null;
    return this.normalizeUrlPath(p);
  }

  /**
   * @description Shared URL-path normalization: index.html and .html
   * suffixes collapse to directory style with a trailing slash
   * @param {String} p
   * @returns {String}
   * @private
   */
  normalizeUrlPath(p) {
    if (p.endsWith('/index.html')) p = p.slice(0, -'index.html'.length);
    else if (p.endsWith('.html')) p = `${p.slice(0, -'.html'.length)}/`;
    else if (!p.endsWith('/') && !p.split('/').pop().includes('.')) p = `${p}/`;
    return p;
  }

  /**
   * @description Add active state to link as attribute or class based on user preference.
   * @param {Object} link - The DOM element to modify
   * @private
   */
  setActiveLink(link) {
    // Use user-defined states or a default
    const isAttribute = activeLink && (activeLink.type === 'attr' || activeLink.type === 'attribute');
    // If user specified using an attribute, set the state via attribute
    if (isAttribute) link.setAttribute(`data-${Util.attr.active}`,'');
    // Or set as a class value
    else link.classList.add(Util.attr.active);
    // Increment counter for display in terminal logging
    this.total.active += 1;
  }

  /**
   * @description Add parent-active state to link as attribute or class based on user preference.
   * @param {Object} link - The DOM element to modify
   * @private
   */
  setParentActiveLink(link) {
    // Use user-defined states or a default
    const isAttribute = activeLink && (activeLink.type === 'attr' || activeLink.type === 'attribute');
    // If user specified using an attribute, set the state via attribute
    if (isAttribute) link.setAttribute(`data-${Util.attr.activeParent}`,'');
    // Or set as a class value
    else link.classList.add(Util.attr.activeParent);
    // Increment counter for display in terminal logging
    this.total.activeParent += 1;
  }

  // LOGGING
  // -----------------------------
  // Display additional terminal logging when `process.env.LOGGER` enabled

  startLog() {
    // Early Exit: Logging not allowed
    if (!process.env.LOGGER) return;
    // Start Spinner
    this.loading.start(chalk.magenta('Adding Link Active States'));
    // Start timer
    this.timer.start();
  }

  endLog() {
    // Early Exit: Logging not allowed
    if (!process.env.LOGGER) return;
    // Stop Spinner and Timer
    const {active,activeParent} = this.total;
    if (active > 0 || activeParent > 0) {
      this.loading.stop(`Set active links: ${chalk.magenta(active)} active and ${chalk.magenta(activeParent)} parent ${this.timer.end()}`);
    }
    // If no matches found, stop logger but don't show line in terminal
    else this.loading.kill();
  }


  // EXPORT WRAPPER
  // -----------------------------
  // Export function wrapper instead of class for `build.js` simplicity
  static async export(opts) {
    return new SetActiveLinks(opts).init();
  }
}


// EXPORT
// -----------------------------
export default SetActiveLinks.export;
