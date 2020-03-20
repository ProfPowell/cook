/**
 * @file custom-plugins.js
 * @description Runs custom plugins defined outside of the build repo
 */

// REQUIRE
// -----------------------------
const cwd = process.cwd();
// const chalk = require('chalk');
const Logger = require('../utils/logger/logger.js');
const Util = require('../utils/util/util.js');

// Config
const {pluginPath} = require('../utils/config/config.js');

// DEFINE
// -----------------------------
/**
 * @description Runs custom plugins defined outside of the build repo
 * @param {Object} obj - Deconstructed options object
 * @property {Object} obj.file - The current file's info (name, extension, path, src, etc.) if a per-file plugin or all the allowed files if a `before` or `after` file loop plugin
 * @property {Object} obj.store - The build process' own data store object we'll add the cached inline-file content to
 * @property {Object} obj.data - The user's custom data from the `data.js` config file, so they can access it in their custom plugins
 * @property {Boolean} obj.log - User opt-in to show the full logging in the terminal or not
 * @property {Object} obj.plugins - The set of custom-user plugins to run for this instance.
 * These are pulled from the `main.js` config file, and are run in 3 build positions: `before`, `after` and during the files loop (`default`).
 * Note: The user must create and export the plugin as an ES6 class
 */
class CustomPlugins {
  constructor({file, store, data = {}, log, plugins}) {
    this.file = file;
    this.store = store;
    this.data = data;
    this.log = log;
    this.plugins = plugins;
    
    // Store # of plugins
    this.total = plugins && plugins.length || 0;
  }

  // INIT
  // -----------------------------
  // Note: `process.env.DEV_CHANGED_PAGE` is defined in `browserSync.watch()` in dev.js
  async init() {
    // Early Exit: No Plugins
    if (!this.plugins) return;
    
    // Show terminal message: Start
    // Note: only shown for 'Before' and 'After' cases, not inside the file loop
    if (this.log && this.total) Logger.persist.header(`\nCustom User Plugins: ${this.log} (${this.total})`);

    // Execute each user plugin
    // NOTE: Using recursion instead of `util.promiseAll` since we want
    // each plugin to run schronously. Their internal plugin code can 
    // await async code, though.
    await this.recursePlugins(0); 

    // Add spacing in terminal
    if (process.env.NODE_ENV !== 'development' && this.log === 'After') console.log('\n');
  }

  
  // HELPER METHODS
  // -----------------------------

  async recursePlugins(index) {
    // Stop recursion if no more plugins
    if (!this.plugins[index]) return;

    // Show terminal message: Plugin Start
    if (this.log) Logger.info(this.plugins[index]);

    // Get destructured parts
    const {file, data} = this;
    
    // GET PLUGIN FILE'S SOURCE
    // If the first request, fetch it via `require()` and cache it. Use cache for all subsequent requests
    // ---
    // USE CACHED PLUGIN CODE, IF FOUND
    let plugin;
    const pathToPluginFile = `${cwd}/${pluginPath}/${this.plugins[index]}.js`;
    const cachedTarget = this.store.plugins[pathToPluginFile];
    if ([undefined, null].indexOf(cachedTarget) === -1) {
      plugin = cachedTarget;
    }
    // OTHERWISE, FETCH THE PLUGIN FILE'S SOURCE AND CACHE IT
    else {
      // Get plugin source
      plugin = require(`${cwd}/${pluginPath}/${this.plugins[index]}.js`);
      // Add it to lookup cache
      this.store.plugins[pathToPluginFile] = plugin;
    }
    
    // RUN PLUGIN
    // Run plugin's `init()` method (since it might be async - constructors can't be async)
    // Note: Using try..catch instead of `.init().catch()`, since the init method may not be set as async from the user.
    try {
      await new plugin[Object.keys(plugin)[0]]({file, data}).init();
    }
    catch (err) {
      Util.customError(err, `Plugin: ${this.plugins[index]}.js`)
    }

    // GO TO NEXT PLUGIN
    await this.recursePlugins(index+=1);
  };
    

  // EXPORT WRAPPER
  // -----------------------------
  // Export function wrapper instead of class for `build.js` simplicity
  static async export(opts) {
    return new CustomPlugins(opts).init();
  }
}


// EXPORT
// -----------------------------
module.exports = CustomPlugins.export;