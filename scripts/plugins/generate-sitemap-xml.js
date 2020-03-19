// Generate `sitemap.xml` file

// REQUIRE
// -----------------------------
// const cwd = process.cwd();
const chalk = require('chalk');
const fs = require('fs-extra');
const Logger = require('../utils/logger/logger.js');
const Util = require('../utils/util/util.js');

// CONFIG
const {distPath,sitemap,srcPath} = require('../utils/config/config.js');


// DEFINE
// -----------------------------
/**
 * @description Generate `sitemap.xml` for search engines from the finished site tree. 
 * Is one of the last build processes since we want to get all new, dynamically-generated pages and their final path locations.
 */
class GenerateSitemap {
  constructor() {
    // Store total # of file entries generated
    this.total = 0;

    // Init terminal logging
    Util.initLogging.call(this);
  }

  // INIT
  // -----------------------------
  // Note: `process.env.DEV_CHANGED_PAGE` is defined in `browserSync.watch()` in dev.js
  async init() {
    // Early Exit: No user-defined site domain in `/config/main.js`
    if (!sitemap || !sitemap.url || !sitemap.url.length) return;
    
    // ADD TERMINAL SECTION HEADING
    Logger.persist.header(`\nCreate /sitemap.xml`);

    // START LOGGING
    this.startLog();

    try {
      // Get directory and .html file paths from `/dist`
      let files = await fs.readdir(distPath);
      this.total = files.length;
      // Format file paths for XML
      files = this.formatFilesForXML(files);
      // Filter out unwanted entry paths
      files = this.excludeFiles(files);
      // Build XML source
      let xmlSrc = this.buildXML(files);
      // Create `sitemap.xml` and write source to it
      await fs.writeFile(`${distPath}/sitemap.xml`, xmlSrc);
    }
    catch (e) {
      Util.customError(e, 'Generate sitemap.xml');
      Logger.error(`Requires /${distPath} directory - please run the build process first`);
    }
    
    // END LOGGING
    this.endLog();
  }

  // PROCESS METHODS
  // -----------------------------

  /**
   * @description Build the .xml file source from the site files' paths
   * @param {Array} files - The array of site file paths
   * @returns {String}
   */
  buildXML(files) {
    let date = this.formattedDate();
    let xml = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
    // If `sitemap.url` has a trailing /, remove it to avoid potential double slashes (ex: https://domain.com//path/to/file)
    const domain = sitemap.url[sitemap.url.length - 1] === '/' ? sitemap.url.slice(0, -1) : sitemap.url;
    files.forEach(f => {
      // Set homepage to higher priority
      const priority = f === '' ? '1.0' : '0.9';
      // Add entry
      xml += `
        <url>
          <loc>${domain}${f}</loc>
          <lastmod>${date}</lastmod>
          <changefreq>monthly</changefreq>
          <priority>${priority}</priority>
        </url>
      `.trim();
    });
    xml += '</urlset>';
    // Return src
    return xml;
  }

  /**
   * @description Exclude a file path from the sitemap if it matches a
   * default or user-provided regex exclusion.
   * @param {Array} files - Array of file paths to be used for creating the sitemap
   * @returns {Array}
   * @private
   */
  excludeFiles(files) {
    // Default path regexes: Any `/assets`, `/includes`, and root-level `404.html` files
    const defaultExcludePaths = [/^\/assets/, /^\/includes/, /^\/404.html/];
    // User defined regexes from `/config/main.js`
    const userExcludePaths = sitemap && sitemap.excludePaths || [];
    // Combine the default and user regexes
    const excludePaths = [...defaultExcludePaths, ...userExcludePaths];
    // Filter out unwanted paths
    return files.filter(f => {
      // Allow by default
      let state = true;
      // For each exclude path regex
      excludePaths.forEach(path => {
        // If the file entry path matches, change state to FALSE, so it gets filtered out
        if (f.match(path)) state = false;
      });
      // Return current state to filter in or out the entry
      return state;
    });
  }

  /**
   * @description Remove `/dist` path and drop any `index.html` parts from the file path
   * @param {Array} files - The array of site file paths
   * @returns {Array}
   */
  formatFilesForXML(files) {
    // Allowed page extensions
    const allowedExt = ['html'];
    const excludedPaths = [];
    // Get files in `/dist`
    files = Util.getPaths(distPath, distPath, excludedPaths);
    // Get only the allowed files by extension (.css, .html)
    files = files.filter(fileName => Util.isExtension(fileName, allowedExt));
    // Format for xml: Remove `/dist`
    files = files.map(fileName => fileName.split(distPath)[1]);
    // Format for xml: Remove `filename`
    files = files.map(fileName => this.formatDirPath(fileName));
    // Alphabetize files
    files.sort();
    // Return formatted files
    return files;
  }

  // HELPER METHODS
  // -----------------------------

  /**
   * @description Format current date in `yyyy-mm-dd` format
   * @returns {String}
   * @private
   */
  formattedDate() {
    const dateRaw = new Date();
    const formatter = new Intl.DateTimeFormat('en-us', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const dateStringRaw = formatter.formatToParts(dateRaw);
    const dateStringParts = [,,];
    dateStringRaw.forEach(({type, value}) => {
      switch (type) {
        case 'year': dateStringParts[0] = value; break;
        case 'month': dateStringParts[1] = value; break;
        case 'day': dateStringParts[2] = value; break;
      }
    });
    return `${dateStringParts[0]}-${dateStringParts[1]}-${dateStringParts[2]}`;
  }

  /**
   * @description Remove `index.html` from file path
   * @param {String} filePath - The current file path string
   * @returns {String}
   * @private
   */
  formatDirPath(filePath) {
    let filePathSplit = filePath.split('/');
    const last = filePathSplit.pop();
    if (last !== 'index.html') filePathSplit[filePathSplit.length] = last;
    return filePathSplit.join('/');
  }
  

  // LOGGING
  // -----------------------------
  
  startLog() {
    // Start Spinner
    this.loading.start(`Building ${chalk.magenta('sitemap.xml')}`);
    // Start timer
    this.timer.start();
  }

  endLog() {
    // Stop Spinner and Timer
    if (this.total > 0) this.loading.stop(`Generated ${chalk.magenta(this.total)} site entries ${this.timer.end()}`);
    // If no matches found, stop logger but don't show line in terminal
    else this.loading.kill();
  }
  
  
  // EXPORT WRAPPER
  // -----------------------------
  // Export function wrapper instead of class for `build.js` simplicity
  static async export(opts) {
    return new GenerateSitemap(opts).init();
  }
}


// EXPORT
// -----------------------------
module.exports = GenerateSitemap.export;