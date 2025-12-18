/**
 * @file timer.js
 * @description Custom terminal timer for tracking operation duration
 */

// IMPORTS
// ----------------------------------
import chalk from 'chalk';

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
export default Timer;
