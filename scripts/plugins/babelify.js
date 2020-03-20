/**
 * @file babelify.js
 * @description Babelify JS files and replace HTML script tags with type=module/nomodule
 */

// REQUIRE
// -----------------------------
const cwd = process.cwd();
const Logger = require('../utils/logger/logger.js');
const utils = require('../utils/util/util.js');
const babel = require('@babel/core');
const fs = require('fs');

// Config
const {babelOpts} = require('../utils/config/config.js');

// Plugin options
const opts = babelOpts || {
  "plugins": ["@babel/plugin-transform-classes"],
  "presets": [
    ["@babel/preset-env", {
      "targets": {
        "browsers": [
          "> 1%",
          "last 2 versions",
          "not ie <= 10"
        ]
      }
    }]
  ]
};


// DEFINE
// -----------------------------

/**
 * @description Edit script tag markup if they do not have `data-inline` or `data-compile="disabled"`
 * @param {Object} file File object
 */
function addES5Markup(file) {
  // Make source traversable with JSDOM
  let dom = utils.jsdom.dom({src: file.src});
  // Get all script tags
  const scripts = dom.window.document.querySelectorAll(`script`);

  let source;
  scripts.forEach(script => {
    // If we have a src and the tag is not inlined or set to skip build (babel)
    if (canCompileScript(script)) {
      let source = script.getAttribute('src');
      // Remove `.js` extension
      source = source.substr(0,source.length-3);
      // Add `type=module` attribute for modern browsers
      script.setAttribute('type', 'module');
      // Add new `<script>` tag with `nomodule` for older browsers.
      script.insertAdjacentHTML('afterend', `<script src="${source}.es5.js" nomodule></script>`);
      // Store updated file source
      file.src = utils.setSrc({dom});

      Logger.success(`/${file.path} - Added ES5 support`);
    }
  });
}

/**
 * @description Compile JS files to ES5 and modifiy HTML script tag markup
 * @param {Object} obj - Deconstructed options object
 * @property {Object} obj.file - The current file's info (name, extension, path, src, etc.)
 * @property {Array} [obj.allowType] - Allowed file types (Opt-in)
 * @property {Array} [obj.disallowType] - Disallowed file types (Opt-out)
 */
function babelify({file, allowType, disallowType}) {
  // Early Exit: File type not allowed
  const allowed = utils.isAllowedType({file,allowType,disallowType});
  if (!allowed) return;
  // Early Exit: Don't minify in development
  if (process.env.NODE_ENV === 'development') return;
  // Run on .js files
  if (file.ext === 'js') createEs5File(file);
  // Run on .html files
  else addES5Markup(file);
}


/**
 * @description Creates ES5 version of a JS file
 * @param {Object} file File object
 */
async function createEs5File(file) {
  // Create ES5 filename (filename.es5.js)
  const es5Path = `${file.path.slice(0, file.path.length-file.ext.length)}es5.${file.ext}`;

  await fs.copyFile(file.path, es5Path, async err => {
    if (err) throw err;
    if (!file.path.includes('.min.')) {
      fs.writeFile(es5Path, await babel.transformFileSync(file.path, opts).code, err => {
        if (err) throw err;
        Logger.success(`/${file.path} - Copied to ${es5Path} and 'babelified'`);
      }); 
    }
  });
}

// HELPER METHODS
// -----------------------------

/**
 * @description TODO
 * @param {Object} script - The `<script>` element
 * @internal
 */
function canCompileScript(script) {
  let source = script.getAttribute('src');
  return (source 
  && !source.includes('//')
  && !source.includes('.min.')
  && !source.includes('www')
  && !source.includes('vendor/')
  && script.getAttribute('inline') !== ''
  && script.getAttribute('data-inline') !== ''
  && script.getAttribute('data-build') !== 'disabled') 
  ? true : false;
}


// EXPORT
// -----------------------------
module.exports = babelify;