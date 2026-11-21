/**
 * @file access.js
 * @description Access levels. Every source file has a level (default
 * `public`); a build at level L leaves out every file above L: it is not
 * copied to dist and not collected, so anything derived from collections
 * or dist (feed, sitemap, data-repeat lists, plugins) follows.
 *
 *   access: {
 *     levels: ['public', 'friends', 'private'],   // rank order
 *     level: process.env.COOK_ACCESS_LEVEL || 'public',
 *     levelOf: ({ relPath, frontMatter }) => frontMatter?.access ?? 'public',
 *   }
 *
 * A file level that is not in `levels` is treated as the last level (fail
 * closed) with a warning naming the file. A build level that is not in
 * `levels` builds at the first level, for the same reason.
 *
 * Pure helpers: no config import, so tests and plugins pass the config in.
 */

// IMPORTS
// -----------------------------
import { readFileSync } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import matter from 'gray-matter';


// DEFAULTS
// -----------------------------
export const DEFAULT_LEVELS = ['public', 'friends', 'private'];

/** Default `levelOf`: the `access` front matter key, else `public`. */
export const defaultLevelOf = ({ frontMatter }) => frontMatter?.access ?? 'public';

// Files already warned about (once per file per build process)
const warned = new Set();

/** Forget which files were warned about (tests). */
export function resetAccessWarnings() {
  warned.clear();
}

/** Default warning output: yellow on stderr, like other build warnings. */
export const warnAccess = (message) => console.warn(chalk.yellow(`\n[access] ${message}`));


// ============================================================================
// Pure helpers
// ============================================================================

/**
 * Rank of a level: its position in `levels`; anything else is the last rank.
 * @param {string} level
 * @param {string[]} levels - Rank order, lowest first
 * @returns {number}
 */
export function rankOf(level, levels) {
  const rank = levels.indexOf(level);
  return rank === -1 ? levels.length - 1 : rank;
}

/**
 * Whether a file at `fileLevel` belongs in a build at `buildLevel`.
 * An unknown build level counts as the first (most restricted) level.
 * @param {string} fileLevel
 * @param {string} buildLevel
 * @param {string[]} levels
 * @returns {boolean}
 */
export function isVisible(fileLevel, buildLevel, levels) {
  const buildRank = Math.max(levels.indexOf(buildLevel), 0);
  return rankOf(fileLevel, levels) <= buildRank;
}

/**
 * Level of one file: `levelOf` from config, unknown values normalised to
 * the last level with one warning per file.
 * @param {Object} file
 * @param {string} file.relPath - Relative to srcPath, `/` separators
 * @param {Object|null} file.frontMatter - Parsed front matter, or null
 * @param {Object} accessConfig - `{ levels, level, levelOf }`
 * @param {Function} [warn] - Receives the warning message
 * @returns {string}
 */
export function resolveLevel({ relPath, frontMatter }, accessConfig, warn = warnAccess) {
  const levels = levelsOf(accessConfig);
  const levelOf = (accessConfig && accessConfig.levelOf) || defaultLevelOf;
  const level = levelOf({ relPath, frontMatter });
  if (levels.includes(level)) return level;
  const last = levels[levels.length - 1];
  if (!warned.has(relPath)) {
    warned.add(relPath);
    warn(`${relPath}: unknown access level ${JSON.stringify(level)}, treated as "${last}"`);
  }
  return last;
}


// ============================================================================
// Config and source files
// ============================================================================

/**
 * @param {Object} [accessConfig]
 * @returns {string[]}
 */
export function levelsOf(accessConfig) {
  const levels = accessConfig && accessConfig.levels;
  return Array.isArray(levels) && levels.length ? levels : DEFAULT_LEVELS;
}

/**
 * The build level, warning once when it is not a known level.
 * @param {Object} [accessConfig]
 * @param {Function} [warn]
 * @returns {string} A level from `levels`
 */
export function buildLevel(accessConfig, warn = warnAccess) {
  const levels = levelsOf(accessConfig);
  const level = accessConfig && accessConfig.level;
  if (levels.includes(level)) return level;
  if (!warned.has('\0build')) {
    warned.add('\0build');
    warn(`unknown build level ${JSON.stringify(level)}, building at "${levels[0]}"`);
  }
  return levels[0];
}

/**
 * Front matter of a source file for `levelOf`: the parsed object for
 * .html/.md files (`{}` when they have none), null for other files.
 * Front matter that does not parse gives `undefined`, which the caller
 * treats as the last level.
 * @param {string} file - Path to the file
 * @returns {Object|null|undefined}
 */
function readFrontMatter(file) {
  if (!/\.(html|md)$/.test(file)) return null;
  let src;
  try {
    src = readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
  if (!src.startsWith('---')) return {};
  try {
    return matter(src).data || {};
  } catch {
    return undefined;
  }
}

/**
 * Level of a source file on disk.
 * @param {string} file - Path to the file (under srcPath)
 * @param {string} srcPath
 * @param {Object} accessConfig
 * @param {Function} [warn]
 * @returns {string}
 */
export function srcFileLevel(file, srcPath, accessConfig, warn = warnAccess) {
  const relPath = path.relative(srcPath, file).split(path.sep).join('/');
  const frontMatter = readFrontMatter(file);
  if (frontMatter === undefined) {
    const levels = levelsOf(accessConfig);
    const last = levels[levels.length - 1];
    if (!warned.has(relPath)) {
      warned.add(relPath);
      warn(`${relPath}: front matter does not parse, treated as "${last}"`);
    }
    return last;
  }
  return resolveLevel({ relPath, frontMatter }, accessConfig, warn);
}

/**
 * Whether a source file on disk belongs in this build.
 * @param {string} file - Path to the file (under srcPath)
 * @param {string} srcPath
 * @param {Object} accessConfig
 * @returns {boolean}
 */
export function isSrcFileVisible(file, srcPath, accessConfig) {
  const levels = levelsOf(accessConfig);
  return isVisible(srcFileLevel(file, srcPath, accessConfig), buildLevel(accessConfig), levels);
}
