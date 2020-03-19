/**
 * @file spinner.js
 * @description Custom terminal spinner message
 */

// REQUIRE
// ----------------------------------
const chalk = require('chalk');
const cliCursor = require('cli-cursor');
const cliSpinners = require('cli-spinners');
const Logger = require('../logger/logger.js');


// DEFINE
// ----------------------------------
class Timer {
  constructor() {
    this.timeEnd = null;
    this.timeSplit = null;
    this.timeStart = null;
  }

  start() {
    this.timeStart = new Date().getTime();
  }

  split() {
    const prevTime = !this.timeSplit ? this.timeStart : this.timeSplit;
    this.timeSplit = new Date().getTime();
    const diff = (this.timeSplit - prevTime) / 1000;
    return chalk.grey(`| ${diff}s`);
  }

  end() {
    this.timeEnd = new Date().getTime();
    const diff = (this.timeEnd - this.timeStart) / 1000;
    return chalk.grey(`| ${diff}s`);
  }
}


// EXPORT
// -----------------------------
module.exports = Timer;