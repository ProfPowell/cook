/**
 * @file performance.js
 * @description Create X dummy pages to test build speed
 */

// REQUIRE
// -----------------------------
const cwd = process.cwd();
const fs = require('fs-extra');
const Logger = require('../logger/logger.js');


// DEFINE
// -----------------------------
/**
 * @description Generate fake pages for performance testing
 * @param {Number} num Number of pages to generate
 * @private
 */
function generatePages(num) {

  for (let i=0;i<num;i++) {
    const html = "<!DOCTYPE html><html><head><title>${'Generated Page " + i + "' + siteTitleSeperator + siteTitle}</title><meta data-include='/includes/global-head'></head><body><h1> Generated Page ${1}</h1><img src='/assets/img/rick-morty-ship.jpg' alt='Rick and Morty Poster'><p>Are these pills supposed to wake me up or something? It's a device Morty, that when you put it in your ear, you can enter people's dreams Morty. Its just like that movie that you keep crowing about. Aids! I am not putting my father in a home! He just came back into my life, and you want to, grab him and, stuff him under a mattress like last month's Victoria's Secret?!</p><div include='/includes/global-scripts'></div></body></html>";
    fs.writeFileSync(`${cwd}/dist/generated-file-${i}.html`, html, { encoding: 'utf8', flag: 'wx' }, err => {
      Logger.error(`Error generating file: ${err}`);
    });
  };
  Logger.warning(`STRESS TEST: Generated ${num} pages.`);
}


// EXPORT
// -----------------------------
module.exports = {generatePages};