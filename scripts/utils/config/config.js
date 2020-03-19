// REQUIRE
// ----------------------------------
const cwd = process.cwd();
const fs = require('fs');
const merge = require('lodash.merge');


// GET USER'S CONFIG
// -----------------------------
// Store user's config, or set default if user omitted 
const userConfigPath = `${cwd}/config/main.js`;
const userConfigPathExists = fs.existsSync(userConfigPath);
const userConfig = userConfigPathExists ? require(userConfigPath) : {};


// DEFINE DEFAULT CONFIG
// -----------------------------
const defaultConfig = {

  // REQUIRED (CORE BUILD PROCESS REQUIREMENTS)
  // --------------------------------------------

  // Convert xxxx.html files to xxxx/index.html
  // NOTE: If `disabled` set to `true`, you must add the .html extension in <a href="xxxx.html"> paths
  // NOTE: `404.html` is excluded, since Firebase looks for the .html file, not a directory
  convertPageToDirectory: {
    disabled: false,
    excludePaths: ['dist/404.html']
  },
  // The name of the compiled, 'public' directory (`dist`, `public`, etc.)
  distPath: 'dist',
  // The path to the dev source files. This is used for running the local dev livereload server.
  srcPath: 'src',
  // The file to load in `srcPath` if not `index.html`
  startPath: 'index.html',
  // The URL domain to use for the `sitemap.xml` entries
  // Note: Enabling this auto-generates `sitemap.xml` in the `/dist` directory
  sitemap: {
    url: 'https://www.site.com',
    // Exclude files from sitemap by adding the desired path regex
    // Defaults are: Any `/assets` or `/includes` paths, and the root `404.html`
    // excludePaths: [/\/assets/, /\/includes/, /^\/404.html/],
  },

  
  // REQUIRED (SITE-SPECIFIC CONFIG)
  // ---------------------------------
  // Add config items here for your own custom build plugins

  // Build-Process Plugins: Add per-site plugins to use during build process.
  // Note: Execution order is left-to-right, so add dependency plugins first
  plugins: {
    before: [],
    default: [],
    after: [],
  },
  // Default repo directory to find referenced plugins
  pluginPath: 'plugins',

  // CSS and JS Bundling
  // NOTE: User can set `bundle: false` or `bundle: { enabled: false }` 
  // to disable bundling for production, even if bundle attributes are found.
  bundle: {
    // Path in 'dist' directory where the bundled files will be created
    distPath: 'assets/bundle',
  },


  // OPTIONAL
  // -----------------------------

  // Add regex patterns to include or exclude files from being modified once copied to the /dist directory
  // For example, /dist\/manifest.json/ will include the manifest.json file, so template strings can be
  // For example, /dist\/vendor/ will exclude files in /dist/vendor 
  // Can be single regexes: /dist\/path/ or new RegExp(/dist\path/)
  // Or regexes in an array: [/dist\/path1/, new RegExp(/dist\path2/)]
  // --
  // INCLUDE
  // -- Example: Include `/dist/manifest.json`, so template strings can be replaced.
  includePaths: [
    /dist\/manifest.webmanifest/,
  ],
  // -- Example: Exclude docs templates directory (/dist/assets/docs/)
  excludePaths: [
    /dist\/assets\/vendor/, 
  ],
  
  // Define the 'active' state for both links whose `[href]` value matches the current page,
  // as well as links who have part of the current page's url in them (parent-active state)
  // By default, a `[class]` is added, with default values. The below config is not necessary,
  // unless you want to change the type (attr|attribute|class), or the values
  // activeLink: {
  //   // Default: class
  //   type: 'class',
  //   // Default: active
  //   activeState: 'active',
  //   // Default: active-parent
  //   parentState: 'active-parent',
  // },
  
  // Change the default [attribute] for includes and inline link/scripts
  //includeAttr: 'include',
  //inlineAttr: 'inline',
  
  // Live reload dev browser when these files change
  // Note: These are the default paths. Paths added by the user in their `/config/main.js` file as the `watch: []` property are added *in addition* to these. 
  // However, they may set the `watchReplace` option listed below, which will only watch their specified options and not the defaults.
  watchDefaults: [
    '/assets/css/*.css',
    '/**/*.html',
    '/assets/plugin/**/*.css',
    '/assets/plugin/**/*.js',
  ],
  // User-added watched files (optional)
  // Note: Only added here for documentation. Would only be added to user's config file.
  //watch: [],
  // Set this option to only watch the paths listed in this config file and not the default paths.
  //watchReplace: true,

  // customData: 'getWordpressData',
  // babelOpts: {
  //   "plugins": ["@babel/plugin-transform-classes"],
  //   "presets": [
  //     ["@babel/preset-env", {
  //       "targets": {
  //         "browsers": [
  //           "> 1%",
  //           "last 2 versions",
  //           "not ie <= 11"
  //         ]
  //       }
  //     }]
  //   ]
  // }
};


// COMBINE CONFIGS
// -----------------------------
// NOTE: Using Lodash `merge` instead of `Object.assign` because,
// there will be child objects and arrays, which would override
// instead of combine with the default versions.
const config = merge({}, defaultConfig, userConfig);



// EXPORT
// -----------------------------
module.exports = config;
