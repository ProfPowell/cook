// REQUIRE
// ----------------------------------
const cwd = process.cwd();
const chalk = require('chalk');
const fs = require('fs-extra');
const cliCursor = require('cli-cursor');
const cliSpinners = require('cli-spinners');
const v8 = require('v8');
const Logger = require('../logger/logger.js');
const Spinner = require('../spinner/spinner.js');
const Timer = require('../timer/timer.js');
const {execSync} = require('child_process');
const {lstatSync,readdirSync} = require('fs-extra');

// JSDOM
const jsdomLib = require('jsdom');
const {JSDOM} = jsdomLib;

// BUILD CONFIG
const {activeLink,convertPageToDirectory,includeAttr,inlineAttr} = require('../config/config.js');


// JSDOM CONFIG
// ----------------------------------
// https://github.com/jsdom/jsdom
const jsdom = {
  baseUrl: 'https://localhost',
  dom: newJSDOM,
  frag: newFrag,
}

// STATIC CONFIG
// ----------------------------------
// Attribute values 
const attr = {
  active: convertToKebab(activeLink && activeLink.activeState, 'space') || 'active',
  activeParent: convertToKebab(activeLink && activeLink.parentState, 'space') || 'active-parent',
  include: includeAttr ? [includeAttr, `data-${includeAttr}`] : ['include', 'data-include'],
  inline: inlineAttr ? [inlineAttr, `data-${inlineAttr}`] : ['inline', 'data-inline'],
}

// The default path types to target in `replace-external-link-protocol.js`
// if not defined by the user in the config file
const replaceExternalLinkProtocolDefaults = ['cdn', 'www'];


// EXPORT
// ----------------------------------
module.exports = {
  addDirectory,
  addDynamicPage,
  attr,
  convertExternalLinks,
  convertToCamel,
  convertToCapSpaces,
  convertToKebab,
  createDirectory,
  customError,
  customKill,
  deepClone,
  encodeTag,
  escapeUrlString,
  fakePromise,
  getFileName,
  getFileParts,
  getFilePath,
  getPaths,
  getSelector,
  initLogging,
  hasExtension,
  isAllowedType,
  isExtension,
  jsdom,
  promiseAll,
  replaceExternalLinkProtocolDefaults,
  runFileLoop,
  setSrc,
  skipped,
  updatePage,
  validatePageChange,
};


// METHODS AND CONSTS
// ----------------------------------

/**
 * @description Create directories in a path string if they don't already exist.
 * Used before `fs.writeFile` to make sure destination exists.
 * @param {Object} file 
 * @property {String} file.ext - The file's extension
 * @property {String} file.name - The file's name
 * @property {String} file.nameIfIndex - The file's name excluding `/index.html`
 * @property {String} file.path - The file's full path
 * @property {String} file.src - The file's source
 * @private
 */
function addDirectory(file) {
  // Destructure object props
  const {isDynamic,path} = file;
  // Get the file path without the `.html`
  // NOTE: For dynamically-created pages, they didn't run through the 'convert to directory' plugin
  // So we need to do that here, by dropping the full `index.html`
  // Static-page Example: `path/to/file.html` becomes `path/to/file`
  // Dynamic-page Example: `path/to/file/index.html` becomes `path/to/file`
  const splitOn = isDynamic ? 'index.html' : '.';
  const pathSplit = path.split(splitOn)[0];
  const filePath = pathSplit.match(/\/index$/) ? pathSplit.substring(4, -1) : pathSplit;
  // Create the parent directories
  fs.mkdirpSync(filePath);
}

/**
 * @description For dynamically-generated pages (other Github repo, Wordpress, Drupal, etc.), 
 * instead of first creating the .html page with the converted source and then running the main file loop,
 * we store the new page's path and source in memory. Then, during the main file loop, we read entries
 * from our dynamic page-store instead of `fs.readFile` the page. This saves a duplication step, where
 * we only need to `fs.writeFile` once for dynamic pages (file loop) instead of twice 
 * (before the file loop when the content was fetched and converted, and the file loop)
 * @param {String} path - The path the dynamic .htnml page will be created at
 * @param {String} src - The page's DOM source we'll use to populate the page
 * @param {Object} store - Reference to the data store we'll add the page info entry to. Usually `this.data` from `/config/data.js`
 * @private
 */
function addDynamicPage(path,src,store) {
  // Early Exit: Invalid data provided
  if (!path) customKill(`addDynamicPage(): No page path provided`);
  if (!src) customKill(`addDynamicPage(): No page source provided`);
  if (!store) customKill(`addDynamicPage(): No data store provided`);
  // If desired page collection property doesn't exist on the target store object, add it
  if (!store.dynamicPages) store.dynamicPages = [];
  // Add entry to data store
  store.dynamicPages.push({ path, src });
}

/**
 * @description Find all href="www.xxxx.com" links and add http:// protocol. 
 * By using the <base> tag, www links w/o a protocol are treated as internal (relative) links and will 404
 * @param {*} source 
 * @returns {String}
 * @private
 */ 
function convertExternalLinks(source) {
  return source.replace(/href="www/gi, 'href="http://www');
}

/**
 * @description Convert 'single-spaced words' or 'kebab' strings to 'camel case'.
 * @param {String} str - The string to convert.
 * @param {String} type - The format the original string is in: single-spaced words, kebab.
 */
function convertToCamel(str, type) {
  if (!str) return;

  switch (type) {
    case 'kebab': return kebab();
    case 'space': return spacedWords();
    default: return str;
  }
  
  function kebab() {
    const splitOnDash = str.split('-');
    // Return formatted string
    return format(splitOnDash);
  }

  function spacedWords() {
    const splitOnSpace = str.split(' ');
    // Lowercase words to normalize
    const lowercase = splitOnSpace.map(t => t.toLowerCase());
    // Return formatted string
    return format(lowercase);
  }

  // ---

  function format(arr) {
    // Capitalize each word, but the first
    const capitalize = arr.map((t,i) => i === 0 ? t : `${t.charAt(0).toUpperCase()}${t.substring(1)}`);
    // Join words
    return capitalize.join('');
  }
}

/**
 * @description Convert 'camel case' or 'kebab' strings to space-separated, capitlized words.
 * @param {String} str - The string to convert.
 * @param {String} type - The format the original string is in: camel case, kebab.
 */
function convertToCapSpaces(str, type) {
  if (!str) return;

  switch (type) {
    case 'camel': return camel();
    case 'kebab': return kebab();
    default: return str;
  }

  function camel() {
    // Split string into array on each found capitalized word
    const splitOnCaps = str.match(/([A-Z]?[^A-Z]*)/g).slice(0,-1);
    // Capitalize the first word
    splitOnCaps[0] = `${splitOnCaps[0].charAt(0).toUpperCase()}${splitOnCaps[0].substring(1)}`;
    // Join the words with spaces
    return splitOnCaps.join(' ');
  }
  
  function kebab() {
    const splitOnDash = str.split('-');
    // Capitalize each word
    const capitalize = splitOnDash.map(t => `${t.charAt(0).toUpperCase()}${t.substring(1)}`)
    // Return words joined with a space
    return capitalize.join(' ');
  }
}

/**
 * @description Convert 'single-spaced words' or 'camel case' strings to 'kebab'.
 * @param {String} str - The string to convert.
 * @param {String} type - The format the original string is in: single-spaced words, camel case.
 */
function convertToKebab(str, type) {
  if (!str) return;

  switch (type) {
    case 'camel': return camel();
    case 'space': return spacedWords();
    default: return str;
  }
  
  function camel() {
    // Split string into array on each found capitalized word
    const splitOnCaps = str.match(/([A-Z]?[^A-Z]*)/g).slice(0,-1);
    // Return formatted string
    return format(splitOnCaps);
  }

  function spacedWords() {
    const splitOnSpace = str.split(' ');
    // Return formatted string
    return format(splitOnSpace);
  }

  // ---

  function format(arr) {
    // lowercase each word
    const lowercase = arr.map(t => t.toLowerCase());
    // Join words with a dash
    return lowercase.join('-');
  }
}

/**
 * @description Create directory hierarchy, if it doesn't already exist
 * @param {String} path - The path to directory to create
 * @private
 */
async function createDirectory(path) {
  try {
    await fs.mkdirp(path);
  }
  catch (err) {
    customKill(err, `Error creating directory(s) in: ${path}`);
  }
}

/**
 * @description Custom terminal error stack-trace message
 * @param {Object} e - The error event
 * @param {String} [label] - The console section label
 * @private
 */ 
function customError(e, label = 'Error') {
  // Display custom message
  console.log(chalk.bold.red(`\n${label}`));
  // Display the error
  console.log(e);
  // Kill the node process to prevent completion
  // Note: This is so it doesn't accidently get to the deploy phase and deploy w/ broken code
  customKill('Build Stopped');
}

/**
 * @description Custom terminal `kill -9 node` when you need to stop
 * all terminal activity on exception/error.
 * For example, a page needs to show fetched content. You don't want a deploy to occur 
 * if the source returned a rate limit, or didn't return anything and you don't want to 
 * show `N/A` or equivalent on screen.
 * @param {String} msg - The console message before terminating
 * @private
 */ 
function customKill(msg) {
  // Display terminal message and kill process
  console.log(`\n${chalk.red(msg)}`);
  // execSync(`echo '' && echo ${chalk.red(formatMsg)}`, {stdio: 'inherit'});
  execSync(`killall -9 node`, {stdio: 'inherit'});
}

/**
 * @description Deep clone an object using the experimental, but native Serialization API in Node.js (https://nodejs.org/api/all.html#v8_serialization_api)
 * @param {String} obj - The object to clone
 * @returns {Object}
 * @private
 */ 
function deepClone(obj) {
  return v8.deserialize(v8.serialize(obj));
}

/**
 * @description Sanitize DOM tag for display. Replace `<` with `&lt;`
 * @param {String} str - The string to sanitize
 * @returs {String}
 * @private
 */
function encodeTag(str) {
  return str.replace(/</g, '&lt;');
}

/**
 * @description Simple escape method that escapes literal characters
 * @param {String} url - The string to escape
 * @example `/` becomes `\/`
 * @example `.` becomes `\.`
 * @returns {String}
 * @private
 */
function escapeUrlString(url) {
  return url.replace(/\//g,'\\/').replace(/\./g,'\\.');
}

/**
 * @description Create a test promise delay
 * @param {Number} ms - The delay, in milliseconds
 * @param {Boolean} throwError - Fake a rejected promise
 * @returns {Object}
 * @private
 */ 
function fakePromise(ms, throwError) {
  if (!throwError) return new Promise(resolve => setTimeout(resolve, ms));
  else return Promise.reject('Could not resolve this')
}

/**
 * @description Return filename from path
 * @param {String} path - The file path (/path/to/file.ext)
 * @param {String} distPath - The path to the /dist directory
 * @returns {String}
 * @private
 */ 
function getFileName(path, distPath) {
  let splitOnSlash = path.split('/');
  splitOnSlash = splitOnSlash.filter(s => s !== '');
  let lastPart = splitOnSlash[splitOnSlash.length-1];
  let fileName = lastPart.split('.')[0];
  if (fileName === 'index') fileName = splitOnSlash[splitOnSlash.length-2];
  if (fileName === distPath) fileName = '/';
  return fileName;
}

/**
 * @description Return object with filename `name` and `extension`
 * @param {path} - The file path (/path/to/file.ext)
 * @returns {Object}
 * @private
 */ 
function getFileParts(path) {
  if (!path) return;
  const fileSplit = path.split('/');
  const fileName = fileSplit[fileSplit.length - 1];
  // If last split item is `index.html`, store its parent directory (if option to convert pages to directories is enabled)
  // If not, there will be a lot of pages with `file.name` as
  const fileNameIfIndex = !convertPageToDirectory.disabled && fileName === 'index.html' ? fileSplit[fileSplit.length - 2] : undefined;
  const fileNameSplit = fileName.split('.');
  return { name: fileNameSplit[0], nameIfIndex: fileNameIfIndex, ext: fileNameSplit[1] };
}

/**
 * @description Return path to file without the file name and extension
 * @param {path} - The file path (/path/to/file.ext)
 * @returns {String}
 * @private
 */ 
function getFilePath(path) {
  const pathSplit = path.split('/');
  const filename = pathSplit.splice(pathSplit.length - 1, 1);
  return pathSplit.join('/');
}

/**
 * @description Recursively grab all paths in a folder structure
 * @param {String} originalPath - The previous path
 * @param {String} path - The new path to explore
 * @param {RegExp} ignorePattern - A regex pattern to ignore certain files and folders
 * @param {Array} paths - The on going list of paths found
 * @returns {Array} - An array of paths
 * @private
 */
function getPaths(originalPath, path, ignorePattern, paths = []) {
  try {
    // Obtain a list of files and folders
    const files = readdirSync(path);
    files.forEach(file => {
      const currentFilePath = `${path}/${file}`;
      // Get the file descriptor
      const fd = lstatSync(currentFilePath);
      // If path is ignored, either by default or user-entered (`excludePaths` in /config/main.js),
      // We won't do anything to it once it is copied to /dist
      // This is handy for `/dist/assets/scripts/vendor`, for example, since that is code likely already minified
      // and outside of the user's control
      let allowed = true, pattern, match;
      if (ignorePattern) {
        ignorePattern.forEach(p => {
          pattern = new RegExp(p, 'g');
          match = currentFilePath.match(pattern);
          if (match && match.length) allowed = false;
        })
      }
      // Include file to use in build process
      if (allowed) {
        if (fd.isDirectory()) {
          paths = [...paths, ...getPaths(originalPath, currentFilePath, ignorePattern)];
        } else {
          paths.push(currentFilePath);
        }
      }
    });
    return paths;
  } 
  catch (err) { customError(err, `getPaths`); }
}

/**
 * @description Return the correct selector for query select. Can either be a string, 
 * or an array of strings for multi-selector.
 * @param {String|Array} attrs - The multiple selectors to query select off of
 * @param {String} [el] - Optional element to add in front of attribute selector (Ex: `link[attr]` instead of `[attr]`)
 * @returns {String}
 * @private
 */
function getSelector(attrs, el = '') {
  let selector = '';
  if (typeof attrs === 'string') selector = `${el}[${attrs}]`;
  else attrs.forEach((a,i) => selector += i === 0 ? `${el}[${a}]` : `,${el}[${a}]`);
  return selector;
}

/**
 * @description Initializes a new Spinner and Timer instance on the executing scope (this)
 * Note: Initialization must call the executing scope via `.call(this)`
 * @example Util.initLogging.call(this)
 * @private
 */
function initLogging() {
  this.loading = new Spinner();
  this.timer = new Timer();
}

/**
 * @description Check if path string has extension. Protects against directory names with `.` characters
 * @property {String} str - Path string to test
 * @returns {Boolean}
 * @private
 */
function hasExtension(str) {
  const is2LengthExt = str[str.length - 3] === '.';
  const is3LengthExt = str[str.length - 4] === '.';
  const is4LengthExt = str[str.length - 5] === '.';
  return is2LengthExt || is3LengthExt || is4LengthExt;
}

/**
 * @description Pass in an 'opt-in' or 'opt-out' array to match current file against by extension type
 * @param {Object} opts - The argument object
 * @property {String} fileExt - The extension of the file
 * @property {Object} [allowType] - The array of extensions to allow
 * @property {String} [disallowType] - The array of extensions to disallow
 * @returns {Boolean}
 * @private
 */
function isAllowedType({file,allowType,disallowType}) {
  // Early Exit: No file name given
  if (!file) return;
  // Destructure properties
  let {ext} = file;
  // Early Exit: No valid extension
  if (!ext) return false;
  ext = ext.charAt(0) === '.' ? ext : `.${ext}`;
  // If file extension NOT in allowed array, return false
  if (allowType && allowType.indexOf(ext) === -1) return false;
  // If file extension IS in disallowed array, return false
  if (disallowType && disallowType.indexOf(ext) > -1) return false;
  return true;
}

/**
 * @description Return pattern match to `.html`
 * @param {String} fileName - The target string
 * @param {Array|String} target - The target extension(s) (html, js, etc.)
 * @private
 */
function isExtension(fileName, target) {
  const isString = typeof target === 'string';
  const ext = fileName.split('.').pop();
  if (isString) return ext === target;
  else return target.indexOf(ext) > -1;
}

/**
 * @description Get a new JSDOM document/object from the passed in string source
 * @docs https://github.com/jsdom/jsdom
 * @param {Object} opts - The arguments object
 * @property {String} fileSource - The source to make a traversable document from
 * @property {Object} [options] - Optional JSDOM options config object
 * @returns {Object}
 */
function newJSDOM({src,options}) {
  const opts = options || { url: jsdom.baseUrl };
  return new JSDOM(src, opts);
}

/**
 * @description Get a new JSDOM fragment from the passed in string source
 * @docs https://github.com/jsdom/jsdom
 * @param {Object} opts - The arguments object
 * @property {String} fileSource - The source to make a traversable document from
 * @returns {Object}
 */
function newFrag(src) {
  return JSDOM.fragment(src);
}

/**
 * @description Custom `Promise.all` that sends information to a callback fn when each promise is returned
 * @param {Array} arr - The items to promisify and run method against
 * @param {Function} method - The method to run against each promise item
 * @param {Function} [cb] - Optional callback that passes returned infomation from the method for each promise that returns
 * @param {Boolean} [pageLabel] - Optionally pass in the file or method name as a label for display in terminal if the promise rejects
 * @returns {Object}
 */
function promiseAll(arr, method, cb, pageLabel) {
  const promises = arr.map(method);
  if (cb) {
    const length = promises.length;
    for (const promise of promises) {
      promise
        .then(data => cb({length, data}))
        .catch(err => customKill(`killed: ${err}${ ` in ${pageLabel}` || '' }`));
    }
  }
  return Promise.all(promises);
}

/**
 * @description Run method against target file asynchronously
 * @param {Array} files - The array of file paths to modify
 * @param {Function} method - The method to run against each file
 */
async function runFileLoop(files, method) {
  // Early Exit: No allowed files given
  if (!files || !files.length) return;

  // Is explicit logging enabled via environment flag?
  const log = process.env.LOGGER;

  // Show terminal message: Start
  Logger.persist.header(`\nModify Files`);
  // Start spinner message
  const loading = new Spinner();
  if (!log) loading.start(`Fetching allowed files`);
  loading.total = files.length;

  // Start timer
  const timer = new Timer();
  timer.start();

  await recurseFiles(0);
  async function recurseFiles(index) {
    const file = files[index];
    const fileName = file.path || file;
    // For explicit logging, show file name in terminal
    if (log) console.log(chalk.blue(fileName))
    await method(file);
    index += 1;
    // For non-logging (default), update current page in-line in the terminal
    if (!log) loading.updateAsPercentage(fileName, index, loading.total, true);
    if (index < loading.total) await recurseFiles(index);
  }
  
  // End timer
  if (log) console.log(chalk.gray('\n-----'));
  loading.stop(`Files Modified (${loading.total}) ${timer.end()}`);
}

/**
 * @description Get the correct DOM nodes as a string
 * @param {*} param0 
 */
function setSrc({dom, path}) {
  // Dom Fragment
  if (!dom.window) {
    const XMLSerializer = new JSDOM('').window.XMLSerializer;
    const domString = new XMLSerializer().serializeToString(dom)
    const formattedDomString = domString
      .replace(/ xmlns="http:\/\/www.w3.org\/1999\/xhtml"/gmi, '')
      // `ns1:href` added to `<use>` svgs, however the # increases per instance in the page
      // So we need to find each one and replace it - the `ns(\d)*?` finds `ns1`, `ns2`, etc.
      .replace(/ns(\d)*?:(?:href)/gmi, 'href');
    return formattedDomString;
  }
  // Full HTML document
  // NOTE: This can either be a full .html page's source already with doctype and `<html>`,
  // Or a non-document include fragment, with just standalone, fragment-like DOM markup.
  else {
    // Get the JSDOM document object
    const document = dom.window.document;
    // Is the src a full HTML doc?
    const isFullDoc = !!document.doctype;
    
    // If already a full DOM .html page w/ doctype, <html>, etc. Just return the whole source
    if (isFullDoc) return dom.serialize();
    // Otherwise, it is a fragment .html include file. However, depending on the # and position of markup elements within,
    // it may return all content in just the `<head>` tag, the `<body>`, or a mixture.
    // So we don't want to return the default `<html><head>...</head><body>...</body></html>`, 
    // since it won't have the site's meta info, like `lang="en"`, char type, etc.
    // ---
    // Instead, we'll cherry-pick the content from those two elments and return them as one code block,
    // since include files don't write to two places in the .html. They are just replaced in place.
    else return `${document.head.innerHTML}${document.body.innerHTML}`;
  }
}

/**
 * @description Return dynamic value or 'skipped' if test failed
 * @param {Array} test - Array to test
 * @param {String} [label] - Optional label instead of 'skipped' default
 * @returns {String}
 */
function skipped(test, label = 'skipped') {
  return test.length ? `(${test.length})` : chalk.grey('(skipped)');
}

/**
 * @description Return whether dev live reload change event was an individual page change,
 * AND if the file wasn't an include
 * @param {Object} file 
 * @property {String} file.ext - The file's extension
 * @property {String} file.name - The file's name
 * @property {String} file.nameIfIndex - The file's name excluding `/index.html`
 * @property {String} file.path - The file's full path
 * @property {String} file.src - The file's source
 * @private
 */
async function updatePage(file) {
  // Destructure object props
  const {path,src} = file;
  // CREATE NEW DIRECTORY IN /DIST (If it doesn't exist)
  addDirectory(file);
  // UPDATE FILE
  await fs.writeFile(path, src);
}

/**
 * @description Return whether dev live reload change event was an individual page change,
 * AND if the file wasn't an include
 */
function validatePageChange() {
  // Page was changed when using localhost BrowserSync live reloading (`npm run dev`)
  const changedDevPage = process.env.DEV_CHANGED_PAGE;
  // Was the changed page an include file?
  const isInclude = changedDevPage && !!changedDevPage.match(/\/(include)|(template)/);
  // Return true (valid) if it was a page change AND it wasn't an include file
  return changedDevPage && !isInclude;
}