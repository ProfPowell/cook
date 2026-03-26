/**
 * @file generate-fragments.js
 * @description Generate content-only HTML fragments for each page.
 *
 * For every index.html in dist, extracts the innerHTML of a configurable
 * selector (default: "main") and writes it as a sibling _fragment.html.
 * These fragments enable html-star style SPA navigation (fetch + swap).
 */

// IMPORTS
// -----------------------------
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'node:path';
import Util from '../utils/util/util.js';
import Logger from '../utils/logger/logger.js';

// Config
import { distPath, fragments as fragmentsConfig } from '../utils/config/config.js';


// DEFINE
// -----------------------------
class GenerateFragments {
  constructor() {
    this.total = 0;

    // Merge defaults with user config
    this.config = {
      enabled: true,
      selector: 'main',
      filename: '_fragment.html',
      ...fragmentsConfig,
    };

    // Init terminal logging
    Util.initLogging.call(this);
  }

  // INIT
  // -----------------------------
  async init() {
    // Early Exit: Disabled
    if (!this.config.enabled) return;

    // ADD TERMINAL SECTION HEADING
    Logger.persist.header(`\nGenerate Fragments`);

    // START LOGGING
    this.startLog();

    try {
      // Get all index.html files in dist
      const htmlFiles = Util.getPaths(distPath, distPath, []);
      const indexFiles = htmlFiles.filter(f => f.endsWith('/index.html') || f === `${distPath}/index.html`);

      for (const filePath of indexFiles) {
        await this.generateFragment(filePath);
      }
    } catch (err) {
      Util.customError(err, 'generate-fragments.js');
    }

    // END LOGGING
    this.endLog();
  }

  /**
   * Generate a fragment file for a single HTML page
   * @param {string} filePath - Path to the index.html file
   */
  async generateFragment(filePath) {
    try {
      const src = await fs.readFile(filePath, 'utf-8');

      // Parse with JSDOM
      const dom = Util.jsdom.dom({ src });
      const document = dom.window.document;

      // Find the target element
      const target = document.querySelector(this.config.selector);
      if (!target) return;

      // Get the inner HTML of the target element
      const fragmentContent = target.innerHTML;

      // Write fragment file alongside index.html
      const dir = path.dirname(filePath);
      const fragmentPath = path.join(dir, this.config.filename);
      await fs.writeFile(fragmentPath, fragmentContent, 'utf-8');

      this.total++;
    } catch (err) {
      Util.customError(err, `generate-fragments.js: ${filePath}`);
    }
  }


  // LOGGING
  // -----------------------------

  startLog() {
    this.loading.start(chalk.magenta('Generating fragments'));
    this.timer.start();
  }

  endLog() {
    if (this.total > 0) {
      this.loading.stop(`Generated ${chalk.magenta(this.total)} fragments ${this.timer.end()}`);
    } else {
      this.loading.kill();
    }
  }


  // EXPORT WRAPPER
  // -----------------------------
  static async export(opts) {
    return new GenerateFragments(opts).init();
  }
}


// EXPORT
// -----------------------------
export default GenerateFragments.export;
