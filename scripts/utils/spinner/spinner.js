/**
 * @file spinner.js
 * @description Custom terminal spinner message
 */

// REQUIRE
// ----------------------------------
const chalk = require('chalk');
const cliCursor = require('cli-cursor');
const cliSpinners = require('cli-spinners');
const readline = require('readline');
const Logger = require('../logger/logger.js');


// DEFINE
// ----------------------------------
class Spinner {
  constructor() {
    this.allowNewLine = false;
    this.color = 'green';
    this.delay = cliSpinners.dots.interval;
    this.interval = null;
    this.label = null;
    this.spinCurr = 0;
    this.spinMax = cliSpinners.dots.frames.length;
  }
  
  setDisplay() {
    this.clearLine();
    // Add new line if Logging is enabled
    const newLine = this.allowNewLine ? '\n' : '';
    process.stdout.write(`${chalk[this.color](cliSpinners.dots.frames[this.spinCurr])} ${this.label}${newLine}`);
  }

  start(label, color) {
    // Set spinner color, if provided
    if (color) this.color = color;
    // Hide terminal cursor
    cliCursor.hide();
    // Set display label
    this.label = label;
    // Start spinner interval
    this.setDisplay();
    this.interval = setInterval(() => {
      this.setDisplay();
      // Set index to change spinner icon position
      this.spinCurr = this.spinCurr === this.spinMax - 1 ? 0 : this.spinCurr += 1;
    }, this.delay);
  }
  
  stop(label, isError) {
    this.clearLine();
    if (isError) Logger.persist.error(label);
    else Logger.persist.success(label);
    clearInterval(this.interval);
    cliCursor.show();
  }

  // Like `stop()`, this finishes the sequence (clears interval),
  // but displays nothing on the line in the terminal.
  // Great for conditionals...show final display if plugin found matches or not
  kill() {
    this.clearLine();
    clearInterval(this.interval);
    cliCursor.show();
  }

  update(label, color) {
    // Set spinner color, if provided
    if (color) this.color = color;
    this.label = label;
  }

  updateAsPercentage(label, count, total, reverse) {
    // Configure percentage
    const percentage = count / total * 100;
    let currentColor = 'green';
    if (percentage < 25) currentColor = 'red';
    else if (percentage < 50) currentColor = 'yellow';
    else if (percentage < 75) currentColor = 'cyan';
    // Store label parts
    const percentageLabel = `[${count}/${total}] (${chalk[currentColor](percentage.toFixed(2) + '%')})`;
    const userLabel = chalk.magenta(label);
    let outputLabel = `${userLabel} ${percentageLabel}`;
    // Format label 
    // Note: by default it is user label then percentages but if `reverse` is TRUE, reverse the output order
    if (reverse) outputLabel = `${percentageLabel} ${userLabel}`;
    // Set flag if build process is in 'logging enabled' mode (LOGGER=true)
    this.allowNewLine = process.env.LOGGER;
    // Update spinner
    this.update(outputLabel, currentColor);
  }


  // HELPER METHODS
  // ----------------------------------

  clearLine() {
    if (process && process.stdout && process.stdout.clearLine) {
      process.stdout.clearLine();
      process.stdout.cursorTo(0);
    }
    // Run this for Gitlab deploy logging
    // Note: Not using this for local dev as the line doesn't clear correctly
    else readline.cursorTo(process.stdout, 0);
  }
}


// EXPORT
// -----------------------------
module.exports = Spinner;