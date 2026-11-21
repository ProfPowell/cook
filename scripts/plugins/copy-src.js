/**
 * @file copy-src.js
 * @description Copy contents of `/src` to `/dist`
 */

// IMPORT
// -----------------------------
const cwd = process.cwd();
import chalk from 'chalk';
import fs from 'fs-extra';
import Logger from '../utils/logger/logger.js';
import Util from '../utils/util/util.js';
import { isProgramFile } from './programs.js';
import { isSrcFileVisible } from '../utils/access/access.js';

// Config
import { access, buildOnlyPaths, distPath, srcPath } from '../utils/config/config.js';

// DEFINE
// -----------------------------
class CopySrc {
  constructor() {}

  // INIT
  // -----------------------------
  // Note: `process.env.DEV_CHANGED_PAGE` is defined in `browserSync.watch()` in dev.js
  async init() {
    // FILE CHANGE
    // If only a single page was updated, just copy it
    const isValidPageChange = Util.validatePageChange();
    if (isValidPageChange) {
      // Store start and end paths
      const changedPath = process.env.DEV_CHANGED_PAGE;
      const changedSrcPath = changedPath;
      const changedDistPath = changedPath.replace(srcPath, distPath);
      // A page above the build's access level is never copied
      if (!isSrcFileVisible(changedSrcPath, srcPath, access)) {
        Logger.persist.header(`\nSkipped Updated Page`);
        Logger.persist.success(`/${changedSrcPath} is above this build's access level (not copied)`);
        return;
      }
      // Show terminal message: Start
      Logger.persist.header(`\nCopied Updated Page`);
      // Copy changed page to `/dist` only
      await fs.copy(changedSrcPath, changedDistPath).catch(err => Util.customWarn(err, 'CopySrc.init(): Page Change'));
      // Show terminal message
      Logger.persist.success(`/${changedSrcPath} copied to /${changedDistPath}`);
    }
    // FULL BUILD
    // Otherwise, copy all contents of `/src` to `/dist`
    else {
      // Show terminal message: Start
      Logger.persist.header('\nCopy /src to /dist');
      // Copy contents of `/src` to `/dist` (exclude targets by extension - markdown)
      await fs.copy(srcPath, distPath, { filter: this.excludeByExtension }).catch(err => Util.customError(err, 'CopySrc.init(): Full Build'));
      // Show terminal message
      Logger.persist.success(`Content from /${srcPath} copied to /${distPath}`);
    }
  }

  // HELPER METHODS
  // -----------------------------

  // Filter out files/directories that shouldn't be copied to dist
  excludeByExtension(src,dest) {
    // Skip build-only directories (includes, components, layouts, etc.)
    if (buildOnlyPaths && buildOnlyPaths.length) {
      for (const buildOnlyDir of buildOnlyPaths) {
        // Match src/dirname or src/dirname/... paths
        const pattern = new RegExp(`(^|/)${srcPath}/${buildOnlyDir}(/|$)`);
        if (pattern.test(src)) return false;
      }
    }
    const isDirectory = fs.lstatSync(src).isDirectory();
    // Files above the build's access level are left out (program files too)
    if (!isDirectory && !isSrcFileVisible(src, srcPath, access)) return false;
    // Program folders ship untouched: every file, markdown included
    if (isProgramFile(src, srcPath)) return true;
    // Skip directories (allow them to be traversed, filtering happens on files/subdirs)
    if (isDirectory) return true;
    // ---
    // MARKDOWN
    // Don't copy markdown files
    const markdownPattern = /.*(?<!.md)$/;
    const isNotMarkdown = markdownPattern.test(src);
    // Copy the file if it passes the regex (not a .md file)
    return isNotMarkdown;
  }


  // EXPORT WRAPPER
  // -----------------------------
  // Export function wrapper instead of class for `build.js` simplicity
  static async export(opts) {
    return new CopySrc(opts).init();
  }
}


// EXPORT
// -----------------------------
export default CopySrc.export;
