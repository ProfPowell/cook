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

// Config
import { distPath, srcPath } from '../utils/config/config.js';

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
      // Show terminal message: Start
      Logger.persist.header(`\nCopied Updated Page`);
      // Copy changed page to `/dist` only
      await fs.copy(changedSrcPath, changedDistPath).catch(err => Util.customError(err, 'CopySrc.init(): Page Change'));
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

  // Don't copy files with a certain file-extension (markdown)
  excludeByExtension(src,dest) {
    // Skip directories
    if (fs.lstatSync(src).isDirectory()) return true;
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
