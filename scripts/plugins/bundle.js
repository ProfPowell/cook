/**
 * @file bundle.js
 * @description Find `<link>` or `<script>` with `[bundle]` or `[data-bundle]` attributes and bundle the code into one new .js file.
 * Remove the old tag(s) and insert the new bundle file where the last bundled file was, that way it preserves execution order
 * for dependencies below it.
 * The entry is cached, so subsequent pages with the same setup just use the already-cached bundle instead of building it again per page.
 */

// REQUIRE
// -----------------------------
const cwd = process.cwd();
const chalk = require('chalk');
const fs = require('fs-extra');
const minifyCss = require('clean-css');
const minifyEs = require('uglify-es');
const Logger = require('../utils/logger/logger.js');
const Util = require('../utils/util/util.js');

// Config
const {bundle,srcPath,distPath} = require('../utils/config/config.js');


// DEFINE
// -----------------------------
/**
 * @description Find and group `<link>` or `<script>` tags by adding their source to one bundle file 
 * and then removing the old, individual tags.
 * The new file is inserted into the page at the location of the last bundled tag to preserve execution order.
 * @param {Object} obj - Deconstructed options object
 * @property {Object} obj.file - The current file's info (name, extension, path, src, etc.)
 * @property {Object} obj.store - The build process' own data store object we'll add the cached include-file content to
 * @property {Array} [obj.allowType] - Allowed file types (Opt-in)
 * @property {Array} [obj.disallowType] - Disallowed file types (Opt-out)
 */
class Bundle {
  constructor({file, store, allowType, disallowType, excludePaths = []}) {
    this.opts = {file, allowType, disallowType, excludePaths};
    this.file = file;
    this.store = store;
    this.allowType = allowType;
    this.disallowType = disallowType;
    this.excludePaths = excludePaths;

    // Store # of found elements to bundle
    this.totalAdd = 0;
    // Store # of created bundle files
    this.totalBuild = 0;

    // Use user-defined paths or set defaults for where to create the bundled files
    this.bundleDistPath = bundle && bundle.distPath || `assets/bundle`;
    
    // Init terminal logging
    Util.initLogging.call(this);
  }

  // BUILD METHODS
  // -----------------------------
  // Note: `process.env.DEV_CHANGED_PAGE` is defined in `browserSync.watch()` in dev.js

  /**
   * @description Find each `<link>` or `<script>` with `[data-bundle]` or `[bundle]` attribute,
   * add their file path to a group array for bundling, add the new bundle `<link>` or `<script>` 
   * above the last-group instance element, and then finally remove all the 'old' `<link>` or `<script>` 
   * elements now that we've added the bundled version instead.
   * ---
   * NOTE: This does not create the bundled `.css` or `.js` file. For that see the `build()` method.
   * Instead, this just compiles all the paths to the source we'll add to the new bundle files,
   * as well as inserting the new DOM element and removing all the old DOM elements.
   */
  add() {
    // Early Exit: User disabled bundling
    if (bundle === false || bundle.enabled === false) return;
    // Early Exit: Running locally and `BUNDLE=true` not set
    if (process.env.NODE_ENV === 'development' && !process.env.BUNDLE) return;
    // Early Exit: File type not allowed
    const allowed = Util.isAllowedType(this.opts);
    if (!allowed) return;

    // Destructure options
    const { file } = this;

    // Make source traversable with JSDOM
    const dom = Util.jsdom.dom({src: file.src});
    const document = dom.window.document;
    
    // Find `<link>` or `<script>` tags with the `[data-bundle]` or `[bundle]` attributes
    const links = document.querySelectorAll('link[data-bundle], link[bundle]');
    const scripts = document.querySelectorAll('script[data-bundle], script[bundle]');
    this.totalAdd = links.length + scripts.length;
    
    // Early Exit: No targets found
    if (!this.totalAdd) return;

    // START LOGGING
    this.startLog('Finding Bundled Links and Scripts', true);

    // REPLACE INLINE CSS
    this.groupSrcAndInsertBundle(links, 'css');
    // REPLACE INLINE SCRIPT
    this.groupSrcAndInsertBundle(scripts, 'js');

    // Store updated file source
    file.src = Util.setSrc({dom});
    
    // END LOGGING
    this.endAddLog();
  }

  /**
   * @description From the bundled groups compiled in `add()`, 
   * create the bundled `.css` and `.js` files in the desired `/dist` location..
   */
  async build() {
    // Early Exit: User disabled bundling
    if (bundle === false || bundle.enabled === false) return;
    // Get file references
    const cssGroups = this.store.bundle.css;
    const jsGroups = this.store.bundle.js;
    // Store # of files that will be created
    this.totalBuild = Object.keys(cssGroups).length + Object.keys(jsGroups).length;
    
    // ADD TERMINAL SECTION HEADING
    if (this.totalBuild > 0) Logger.persist.header(`\nCreate Bundle Files`);

    // START LOGGING
    this.startLog('Creating Bundled Files');

    // Create bundle directory if it doesn't already exist
    await Util.createDirectory(`${distPath}/${this.bundleDistPath}`);

    // Build bundle files
    await this.buildBundles(cssGroups, 'css');
    await this.buildBundles(jsGroups, 'js');
    
    // END LOGGING
    this.endBuildLog();
  }


  // PRIMARY PROCESS METHODS
  // -----------------------------

  /**
   * @description Find all `<link>` or `<script>` tags that are bundled together. 
   * Store the group name and the file paths, then remove the 'old' DOM element references.
   * Finally, insert a new element that will reference the bundle. 
   * ---
   * NOTE: linked bundle file created further in the build process.
   * @param {Array} targets - Array of `<link>` or `<script>` tags to group and then remove.
   * @param {String} type - This method needs to know if we're working on a `<link>` or `<script>` tag (combined method)
   * @private
   */
  async groupSrcAndInsertBundle(targets, type) {
    const elType = type === 'js' ? 'script' : 'link';
    const pathAttr = type === 'js' ? 'src' : 'href';
    const bundleType = this.store.bundle[type];
    const counters = {};

    // Loop through each found target and add the source path 
    // to an appropriate group array.
    targets.forEach(target => {
      // Before storing, add a flag for whether we should minify the source or not
      // For example, if bundling vendor code, it is likely already minified, so we don't want to do it again.
      const minify = !target.hasAttribute('no-minify') && !target.hasAttribute('data-no-minify');
      // Get the element's group by finding the `[bundle]` attribute value
      const {raw,formatted} = this.getGroup(target);
      // If the group hasn't been added to the collection, add it
      if (!bundleType[formatted]) bundleType[formatted] = [];
      const bundleGroup = bundleType[formatted];
      // If the path hasn't been added to the group yet, add it
      const path = target[pathAttr];
      // Map just the paths so we can use indexOf on a flattened string-array, instead of the normal object-array
      const pathsMap = bundleGroup.map(g => g.path);
      // Add the file entry if it doesn't already exist (this way if the same file added on multiple pages, we only add once)
      if (pathsMap.indexOf(path) === -1) bundleGroup.push({ path, minify });
      // Add index of this element in its group as attribute. Will be used in next step
      if (!counters[formatted]) counters[formatted] = 0;
      target.setAttribute('group-index', counters[formatted]);
      // Update counter for next step
      counters[formatted] += 1;
    });

    // Loop through each target again.
    // If it is the last bundle-group item on the page,
    // we'll insert that bundle call into the DOM above it.
    // ---
    // For all targets we'll remove them from the source
    // now that we're inserting the bundled version instead.
    targets.forEach(target => {
      const {raw,formatted} = this.getGroup(target);
      const numInstancesFoundInGroup = [...targets].filter(t => t.getAttribute('data-bundle') === raw || t.getAttribute('bundle') === raw);
      const groupLen = numInstancesFoundInGroup.length;
      const groupIndex = parseInt(target.getAttribute('group-index'));
      const isLast = groupIndex === groupLen - 1;
      // If the element is the last one of the group on the page,
      // Add the bundled version into the DOM above it
      // NOTE: We're making the path 'relative' (instead of adding `${distPath}/`) since this will be the tag's attribute source reference
      const filePath = `/${this.bundleDistPath}/bundle-${formatted}.${type}`;
      const elOptions = type === 'js' ? ` src="${filePath}"` : ` rel="stylesheet" href="${filePath}"`;
      if (isLast) target.insertAdjacentHTML('beforebegin', `<${elType}${elOptions}></${elType}>`)
      // Then remove the old indiv. instance since the bundle is now loaded
      // NOTE: We remove all 'old' instances since they are now bundled
      target.remove();
    });
  }

  /**
   * @description Get all referenced files' source and create the new bundled file.
   * @param {Object} targets - The CSS or JS object that contains each found bundle group.
   * @param {String} type - This method needs to know if we're working on a `<link>` or `<script>` tag (combined method)
   * @private
   */
  async buildBundles(targets, type) {
    const groupKeys = Object.keys(targets);
    // Early Exit: No bundle groups found of the given type
    if (!groupKeys) return;
    // Fetch source from targeted group file and combine into one source string.
    // We're effectively bundling the source code here, and then we'll write it 
    // to a new file next.
    // ---
    // Loop through each group
    await Promise.all(groupKeys.map(key => this.buildBundle({key, paths: targets[key], type})));
  } 
    // Build individual bundle file
    async buildBundle({key, paths, type}) {
      // Init bundled string
      let bundledSrc = '';
      // For each file path, fetch it's source
      // NOTE: This is a synchronous process b/c the code order needs to be maintained
      for (let path of paths) {
        bundledSrc += await this.getSrc(path, type);
      }
      // Create file in designated 'dist' directory, either defined by the user in `/config/main.js`,
      // or via the default location (something like `/dist/assets/bundle`)
      // See: `this.bundleDistPath` defined in the constructor
      await fs.writeFile(`${distPath}/${this.bundleDistPath}/bundle-${key}.${type}`, bundledSrc, 'utf-8');
    }
  
  
  // HELPER METHODS
  // -----------------------------

  /**
   * @description Get and format the group name from the `[bundle]` attribute value.
   * @example `data-bundle="My Bundle"` becomes `my-bundle`, for use in the bundled file's name: `data-my-bundle.js`
   * @param {Object} target - The `<link>` or `<script>` element
   * @returns {Object}
   */
  getGroup(target) {
    const raw = target.getAttribute('data-bundle') || target.getAttribute('bundle');
    const formatted = raw.replace(/ /g, '-').toLowerCase();
    return {raw,formatted};
  }

  async getSrc(entry, type) {
    const { path, minify } = entry;
    // Early Exit: No path for some reason
    if (!path) return '';
    // Get the file's source content
    try {
      // Remove `https://localhost/` when building locally
      const pathSplit = path.split('localhost');
      const pathFormatted = pathSplit[pathSplit.length - 1];
      // Get path starting from the 'src' directory. Example: `/src/assets/plugin/myplugin.js`
      let src = await fs.readFile(`${srcPath}/${pathFormatted}`, 'utf-8');
      // If the source is allowed to by minified, minify it
      if (minify) src = type === 'js' ? this.minJs(src) : this.minCss(src);
      // Return the found source
      return src;
    }
    catch (err) {
      Util.customKill(err, `Error fetching the source from: ${path}`);
    }
  }

  minJs(src) {
    const config = {};
    return minifyEs.minify(src, config).code;
  }

  minCss(src) {
    const config = { inline: ['none'] };
    // Minify source
    return new minifyCss(config).minify(src).styles;
  }
  

  // LOGGING
  // -----------------------------
  // Display additional terminal logging when `process.env.LOGGER` enabled
  
  startLog(label, isAdd) {
    // Early Exit: Logging not allowed for in-page bundle collecting (`add()`)
    // but is for the `build()` process
    if (!process.env.LOGGER && isAdd) return; 
    // Start Spinner
    this.loading.start(chalk.magenta(label));
    // Start timer
    this.timer.start();
  }

  endAddLog() {
    // Early Exit: Logging not allowed
    if (!process.env.LOGGER) return;
    // Stop Spinner and Timer
    if (this.totalAdd > 0) this.loading.stop(`Found ${chalk.magenta(this.totalAdd)} bundle targets ${this.timer.end()}`);
    // If no matches found, stop logger but don't show line in terminal
    else this.loading.kill();
  }

  endBuildLog() {
    // Stop Spinner and Timer
    const plural = this.totalBuild === 1 ? '' : 's';
    if (this.totalBuild > 0) this.loading.stop(`Created ${chalk.magenta(this.totalBuild)} bundle file${plural} ${this.timer.end()}`);
    // If no matches found, stop logger but don't show line in terminal
    else this.loading.kill();
  }
    

  // EXPORT WRAPPER
  // -----------------------------
  // Export function wrapper instead of class for `build.js` simplicity
  static add(opts) {
    return new Bundle(opts).add();
  }

  static build(opts) {
    return new Bundle(opts).build();
  }
}

// EXPORT
// -----------------------------
module.exports = {
  bundleAdd: Bundle.add,
  bundleBuild: Bundle.build,
};