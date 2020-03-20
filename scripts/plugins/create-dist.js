/**
 * @file create-dist.js
 * @description Remove `/dist` and recreate it
 */

// REQUIRE
// -----------------------------
const cwd = process.cwd();
const chalk = require('chalk');
const fs = require('fs-extra');
const rimraf = require('rimraf');
const Logger = require('../utils/logger/logger.js');
const Util = require('../utils/util/util.js');

// Config
const {distPath} = require('../utils/config/config.js');

// DEFINE
// -----------------------------
class CreateDist {
  constructor() {}

  // INIT
  // -----------------------------
  // Note: `process.env.DEV_CHANGED_PAGE` is defined in `browserSync.watch()` in dev.js
  async init() {
    // Early Exit: Do not create `/dist` if only a single page was updated
    if (process.env.DEV_CHANGED_PAGE) return;

    // Show terminal message: Start
    Logger.persist.header(`\nCreate /${distPath}`);

    // Remove `/dist` (fails silently if not there as that is the intended result)
    rimraf.sync(distPath);
    // Make fresh '/dist' folder
    await fs.mkdir(distPath).catch(Util.customError);

    // Show terminal message: Done
    Logger.persist.success (`/${distPath} created`);
  }
  
  // EXPORT WRAPPER
  // -----------------------------
  // Export function wrapper instead of class for `build.js` simplicity
  static async export(opts) {
    return new CreateDist(opts).init();
  }
}


// EXPORT
// -----------------------------
// module.exports = CreateDist.export;
module.exports = CreateDist.export;