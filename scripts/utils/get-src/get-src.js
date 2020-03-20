/**
 * @file get-src.js
 * @description Get allowed source files for modification
 */

// REQUIRE
// -----------------------------
const cwd = process.cwd();
// const chalk = require('chalk');
const fs = require('fs').promises;
const Logger = require('../logger/logger.js');
const Util = require('../util/util.js');

// CONFIG
const {includePaths,excludePaths,distPath,srcPath} = require('../config/config.js');

// DATA STORE
const data = require(`${cwd}/config/data.js`);



// EXPORT
// -----------------------------
module.exports = {
  getDynamicFiles,
  getSrcConfig,
  getSrcFiles,
  getSrcImages
};


// PUBLIC METHODS
// -----------------------------

/**
 * @description If the user added dynamic page information to the correct property
 * in the data store, combine those pages with the static, manual .html pages.
 * @param {Array} files - The array of user-created static .html file paths
 * @returns {Array}
 * @private
 */
function getDynamicFiles(files) {
  // Early Exit: User did not add dynamic pages to the data store or it was malformed
  if (!data || !data.dynamicPages || !data.dynamicPages.length) return files;
  // Otherwise, combine the the user's static .html pages with their dynamic pages
  // whose path and source is stored, but does not exist as an .html file yet
  return [...files, ...data.dynamicPages].flat();
}


/**
 * @description - Store information for use in build plugins based on the current file
 * @param {Object} Opts - Argument object
 * @property {String} fileName - The filename of the targeted file 
 * @property {String} [excludeSrc] - Complie file meta without opening the file if you don't need the source
 * @returns {Object}
 * @private
 */
async function getSrcConfig({fileName, excludeSrc = false }) {
  // Early Exit: No file name given
  if (!fileName) return;
  // Init obj
  let file = {};

  // Store if it is a dynamic page
  const isDynamic = typeof fileName !== 'string';
  let dynamicSrc;

  // IF A DYNAMIC PAGE
  // If a dynamically-generated page, `fileName` is an object instead of a string path.
  // Therefore, we need to get and format the dynamic object's path into the format we need,
  // namely: dist_path/file_path
  if (isDynamic) {
    // Store source string since we're overriding the object
    dynamicSrc = fileName.src;
    // Check if path is already formatted to include the `dist` path
    const regex = new RegExp(`^${distPath}`);
    const path = fileName.path.match(regex) ? fileName.path : `${distPath}${fileName.path}`;
    fileName = `${path}/index.html`;
  }

  
  // Store filename parts
  let {ext,name,nameIfIndex} = Util.getFileParts(fileName);
  file.ext = ext;
  file.name = name;
  file.nameIfIndex = nameIfIndex;
  file.path = fileName;
  if (isDynamic) file.isDynamic = true;

  // Early Exit: Return the file meta details but skip the source
  if (excludeSrc) return file;
  
  // STORE FILE SOURCE
  // If a dynamic page, just use the source in memory
  if (isDynamic) file.src = dynamicSrc;
  // Otherwise, it's a static .html page
  // Get and read the file to store its page source
  else file.src = await fs.readFile(fileName, 'utf-8');
  
  // REMOVE COMMENTS
  // Sanitize comments that have non-closing html elements in them. JSDOM will try to close it in the DOM
  // but since there is no starting tag (it's in the comment) it will break the dom
  file.src = removeCommentTags(file.src);

  // Return file info
  return file;
}

/**
 * @description - Return all allowed files for the build process
 * @param {Object} cb - The callback function once the files have been grouped
 * @private
 */
async function getSrcFiles() {
  // Note: `process.env.DEV_CHANGED_PAGE` is defined in `browserSync.watch()` in dev.js

  // Define files var
  let files;

  // FILE CHANGE
  // If only a single page was updated, just run build process on it
  // Note: If the page was an include, we need to rebuild all pages. 
  // Other pages may have had the include, but has since been replaced w/ static content
  const isValidPageChange = Util.validatePageChange();
  if (isValidPageChange) {
    const getDistVersionOfChangedPage = process.env.DEV_CHANGED_PAGE.replace(srcPath, distPath);
    files = [getDistVersionOfChangedPage];
  }
  // FULL BUILD
  // Otherwise, find all allowed files, loop through them, and run the build plugins on them
  else {
    // Allowed page types
    const userAllowedPaths = validatePaths(includePaths);
    // Disallowed page types
    // /dist/assets/scripts/vendor - Skip 3rd-party vendor files
    const defaultExcludedPaths = [new RegExp(`${distPath}\/assets\/scripts\/vendor`)];
    const userExcludedPaths = validatePaths(excludePaths);
    const excludedPaths = [...defaultExcludedPaths, ...userExcludedPaths];
    // Allowed page extensions
    const allowedExt = ['css','html','js'];
    // Get files in `/dist`
    files = Util.getPaths(distPath, distPath, excludedPaths);
    // Get only the allowed files by extension (.css, .html)
    files = files.filter(fileName => manualAllow(fileName, userAllowedPaths) || Util.isExtension(fileName, allowedExt));
    // Move known include files to the front of the array, so they are ideally built first 
    // before being replaced in other page files.
    files = files.sort((a,b) => {
      if (a.includes('/includes')) return -1;
      return 1;
    });
  }
  // Run tasks on matched files
  return files;
}

/**
 * @description - Return all allowed images for the build process
 * @param {Object} cb - The callback function once the images have been grouped
 * @private
 */
async function getSrcImages(cb) {
  // Show terminal message: Start
  Logger.header('\nImage Tasks');
  
  // Disallowed page types
  // /dist/assets/scripts/vendor - Skip 3rd-party vendor images
  const defaultExcludedPaths = [new RegExp(`${distPath}\/assets\/scripts\/vendor`)];
  const userExcludedPaths = validatePaths(excludePaths);
  const excludedPaths = [...defaultExcludedPaths, ...userExcludedPaths];
  // Allowed page extensions
  const allowedExt = ['jpg', 'jpeg', 'png', 'svg'];
  // Get images in `/dist`
  let images = Util.getPaths(distPath, distPath, excludedPaths);
  // Get only the allowed images by extension (.css, .html)
  images = images.filter(fileName => Util.isExtension(fileName, allowedExt));
  // Run tasks on matched images
  if (cb) cb(images);
}


// HELPER METHODS
// -----------------------------

/**
 * @description Remove < and > from comments since non-closed tags
 * will have the matching end tag added
 */
function removeCommentTags(src) {
  const commentsRegex = /\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm;
  const matches = src.match(commentsRegex); 
  if (!matches) return src;
  let replaces;
  matches.forEach(m => {
    replaces = m.replace('<', '').replace('>', '');
    src = src.replace(m, replaces);
  });
  return src;
}

// HELPER METHODS
// -----------------------------

/**
 * @description Validate user entry and return in array if valid
 * @param {*} paths - User entry to validate. If a valid, single regex, add to array and return
 * @returns {Array}
 * @private
 */
function manualAllow(fileName, allowedPaths) {
  const allowedPathLen = allowedPaths && allowedPaths.length;
  if (!allowedPathLen) return false;
  for (let i=0; i<allowedPathLen; i++) {
    if (allowedPaths[i].test(fileName)) return true;
  }
  return false;
}

/**
 * @description Validate user entry and return in array if valid
 * @param {*} paths - User entry to validate. If a valid, single regex, add to array and return
 * @returns {Array}
 * @private
 */
function validatePaths(paths) {
  let pathArr = [];
  // If user already added as array, just use that
  if (paths && paths.length) return paths;
  // If user gave a single regex, add it to an array
  if (paths && typeof paths === 'object' && !Array.isArray(paths) && !paths.length) pathArr.push(paths);
  // Return an array with either valid user regex(es) or an empty array
  return pathArr;
}