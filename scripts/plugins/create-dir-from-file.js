/**
 * @file create-dir-from-file.js
 * @description Change all `xxxx.html` pages into `xxxx/index.html` versions so you
 * don't need to show extensions in the url
 */

// IMPORT
// -----------------------------
import chalk from 'chalk';
import fs from 'fs-extra';
import utils from '../utils/util/util.js';
import Logger from '../utils/logger/logger.js';
import Spinner from '../utils/spinner/spinner.js';
import Timer from '../utils/timer/timer.js';
import { convertPageToDirectory, distPath } from '../utils/config/config.js';
import { getSrcConfig } from '../utils/get-src/get-src.js';

const cwd = process.cwd();


// DEFINE
// -----------------------------
/**
 * @description Change all `xxxx.html` pages into `xxxx/index.html` versions so you
 * don't need to show extensions in the url
 * @param {Object} obj - Deconstructed options object
 * @property {Object} obj.files - The current project files to affect
 * @property {Array} [obj.allowType] - Allowed file types (Opt-in)
 * @property {Array} [obj.disallowType] - Disallowed file types (Opt-out)
 * @property {Array} [obj.excludePaths] - Disallowed certain files (Opt-out)
 */
class CreateDirFromFile {
  constructor({files, allowType, disallowType, excludePaths = []}) {
    this.opts = {files, allowType, disallowType, excludePaths};
    this.files = files;
    this.allowType = allowType;
    this.disallowType = disallowType;
    this.excludePaths = excludePaths;
  }

  // INIT
  // -----------------------------
  // Note: `process.env.DEV_CHANGED_PAGE` is defined in `browserSync.watch()` in dev.js
  async init() {
    // Early Exit: User opted out of this plugin
    if (convertPageToDirectory.disabled) return;

    // Destructure options
    const { files } = this;

    // Show terminal message: Start
    Logger.persist.header(`\nCreate Directories from Files`);

    // Start timer
    const timer = new Timer();
    timer.start();

    // Start percentage loading
    const loading = new Spinner();
    loading.start(`Create Directory from File`);
    loading.count = 0;

    // CONVERT EACH ALLOWED .HTML PAGE TO DIRECTORY
    await utils.promiseAll(
      files,
      f => (this.createDirectory)(f, loading, this.opts),
      progress => {
        // Remove manual, static .html pages in `/docs` so they don't appear in the total # display
        if (loading.label) {
          loading.count += 1;
          loading.updateAsPercentage(files[loading.count-1], loading.count, loading.total, true);
        }
        else loading.total -= 1;
      }
    );

    // End: Loading terminal message
    loading.stop(`Directories Created (${loading.count}) ${timer.end()}`);
  }


  // HELPER METHODS
  // -----------------------------

  /**
   * @description TODO
   * @param {*} fileName
   * @param {*} filesArr
   * @param {*} allowType
   * @param {*} disallowType
   * @param {*} excludePaths
   * @param {*} loading
   */
  async createDirectory(fileName, loading, { files, allowType, disallowType, excludePaths }) {
    // Get file's meta info (ext,name,path)
    const file = await getSrcConfig({fileName, excludeSrc: true });

    // Early Exit: File type not allowed
    const allowed = utils.isAllowedType({file, allowType, disallowType});
    if (!allowed) return;

    // Early Exit: Do not create directory if current file is an index.html page
    if (file.name === 'index') return;

    // Early Exit: Path includes excluded pattern
    // For example, we don't want to convert the site index file (homepage)
    // ---
    // Did user add excluded paths and there are defaults passed into this method?
    const combinedExcludePaths = [...excludePaths, ...convertPageToDirectory.excludePaths];
    const matchedExcludePath = combinedExcludePaths && combinedExcludePaths.filter(str => file.path.includes(str));
    const matchedExcludePathLen = matchedExcludePath.length;
    if (matchedExcludePathLen) return;

    // Get file path without extension
    const filePath = file.path.split('.')[0];

    // CREATE NEW DIRECTORY IN /DIST
    await fs.mkdirp(filePath);

    // MOVE PAGE TO NEW DIRECTORY
    // Move xxxx.html file to new directory xxxx/index.html
    await fs.rename(`${filePath}.html`, `${filePath}/index.html`)

    // UPDATE FILE PATH TO NEW DIST LOCATION
    // In order to update the pages' new location, instead of the old,
    // we need to update the /dist path to reflect the new, directory location
    const index = files.indexOf(fileName);
    files[index] = files[index].replace('.html', '/index.html').replace('index/index.html','index.html')

    // Loading message: Update
    loading.label = `/${filePath}.html - Converted to [directory]: ${ chalk.green(`${filePath}/index.html`) }`;
  }

  // EXPORT WRAPPER
  // -----------------------------
  // Export function wrapper instead of class for `build.js` simplicity
  static async export(opts) {
    return new CreateDirFromFile(opts).init();
  }
}

// EXPORT
// -----------------------------
export default CreateDirFromFile.export;
