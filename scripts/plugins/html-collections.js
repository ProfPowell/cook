/**
 * @file html-collections.js
 * @description HTML pages with YAML front matter join collections, the way
 * markdown files do. Opt-in: `collections: { html: true }`.
 *
 * Runs before the file loop (right after markdown) so `data-repeat`,
 * the Atom feed and the JSON formats see every page:
 *
 *   src/posts/hello.html          ---
 *                                 title: Hello
 *                                 date: 2026-11-01
 *                                 ---
 *                                 <p>...</p>
 *
 *   → collections.posts = [{ title: 'Hello', url: '/posts/hello/', slug: 'hello', date: '2026-11-01', ... }]
 *
 * Rules (match markdown collections and the built output):
 * - collection = first folder under the served root (srcPath, or
 *   srcPath/<siteRoot>); files at the root or outside it join none
 * - only files that start with `---` front matter; `draft: true` is skipped
 * - buildOnlyPaths folders and excludePaths (tested on the dist path) skipped
 * - URL follows convertPageToDirectory (posts/a.html → /posts/a/)
 * - newest date first, undated last; merged with markdown collections
 */

// IMPORTS
// -----------------------------
import chalk from 'chalk';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import Logger from '../utils/logger/logger.js';
import Util from '../utils/util/util.js';
import { addToCollection, sortCollections, toCollectionItem } from '../utils/collections/collections.js';
import { normalizeSiteRoot } from '../utils/site-root/site-root.js';

// Config
import {
  buildOnlyPaths as buildOnlyPathsConfig,
  collections as collectionsConfig,
  convertPageToDirectory,
  distPath as distPathConfig,
  excludePaths as excludePathsConfig,
  siteRoot as siteRootConfig,
  srcPath as srcPathConfig,
} from '../utils/config/config.js';


// ============================================================================
// Pure helpers (exported for unit testing)
// ============================================================================

/**
 * Path of a file relative to the served root, or null when outside it.
 * @param {string} relPath - Relative to srcPath, e.g. 'pages/posts/a.html'
 * @param {string} [siteRoot]
 * @returns {string|null} e.g. 'posts/a.html'
 */
function servedRelPath(relPath, siteRoot) {
  const root = normalizeSiteRoot(siteRoot);
  if (!root) return relPath;
  return relPath.startsWith(`${root}/`) ? relPath.slice(root.length + 1) : null;
}

/**
 * Collection name for an HTML page: its first folder under the served root.
 * @param {string} relPath - Relative to srcPath, e.g. 'posts/a.html'
 * @param {string} [siteRoot]
 * @returns {string|null}
 */
export function htmlCollectionName(relPath, siteRoot) {
  const served = servedRelPath(relPath, siteRoot);
  if (!served) return null;
  const parts = served.split('/');
  return parts.length > 1 ? parts[0] : null;
}

/**
 * Visitor URL of an HTML page once built.
 * @param {string} relPath - Relative to srcPath
 * @param {Object} opts
 * @param {string} [opts.siteRoot]
 * @param {boolean} [opts.convertDisabled] - convertPageToDirectory.disabled
 * @param {boolean} [opts.convertExcluded] - Page matches convertPageToDirectory.excludePaths
 * @returns {string|null}
 */
export function htmlPageUrl(relPath, { siteRoot, convertDisabled, convertExcluded } = {}) {
  const served = servedRelPath(relPath, siteRoot);
  if (served === null) return null;
  let url = `/${served}`;
  if (/(^|\/)index\.html$/.test(served)) return url.replace(/index\.html$/, '');
  if (convertDisabled || convertExcluded) return url;
  return url.replace(/\.html$/, '/');
}

/**
 * Collection page data for an HTML page (same shape as markdown pages).
 * @param {string} relPath - Relative to srcPath
 * @param {Object} frontMatter - Parsed YAML
 * @param {Object} opts - Same as htmlPageUrl
 * @returns {Object}
 */
export function htmlPageData(relPath, frontMatter, opts = {}) {
  const base = path.basename(relPath, '.html');
  const slug = base === 'index' ? path.basename(path.dirname(relPath)) : base;
  const rawDate = frontMatter.date;
  const parsed = rawDate ? new Date(rawDate) : null;
  const valid = parsed && !isNaN(parsed);
  return {
    ...frontMatter,
    title: frontMatter.title || Util.convertToCapSpaces(slug, 'kebab'),
    url: htmlPageUrl(relPath, opts),
    slug,
    collection: htmlCollectionName(relPath, opts.siteRoot),
    date: templateDate(rawDate),
    // Parsed Date is only for sorting
    _dateSort: valid ? parsed : null,
  };
}

/**
 * Date string for templates, on the calendar day the author wrote.
 * - YAML dates (gray-matter gives a UTC-midnight Date) → YYYY-MM-DD
 * - Strings starting YYYY-MM-DD keep that day; converting through UTC
 *   would move "2026-11-01T23:30:00-05:00" to 2026-11-02
 * - Any other string is kept as written, like markdown pages
 * @param {Date|string|undefined} rawDate
 * @returns {string|null}
 */
function templateDate(rawDate) {
  if (!rawDate) return null;
  if (rawDate instanceof Date) return isNaN(rawDate) ? null : rawDate.toISOString().split('T')[0];
  const str = String(rawDate);
  const ymd = str.match(/^\d{4}-\d{2}-\d{2}/);
  return ymd ? ymd[0] : str;
}


// ============================================================================
// Plugin
// ============================================================================

/**
 * @param {Object} opts
 * @param {Object} opts.store - Build store; collections are merged into store.collections
 * @param {Object} opts.data - User data; data.collections is set
 * @param {string} [opts.srcPath] - Overrides config (tests, custom pipelines)
 * @param {string} [opts.distPath]
 * @param {string} [opts.siteRoot]
 * @param {boolean} [opts.enabled] - Defaults to config `collections.html`
 * @param {string[]} [opts.buildOnlyPaths]
 * @param {Array<RegExp|string>} [opts.excludePaths]
 */
export default async function htmlCollections({
  store,
  data,
  srcPath = srcPathConfig,
  distPath = distPathConfig,
  siteRoot = siteRootConfig,
  enabled = collectionsConfig && collectionsConfig.html,
  buildOnlyPaths = buildOnlyPathsConfig || [],
  excludePaths = excludePathsConfig || [],
}) {
  if (!enabled || !existsSync(srcPath)) return;

  const excludes = excludePaths.map(p => (p instanceof RegExp ? p : new RegExp(p)));
  const convertExcludes = (convertPageToDirectory && convertPageToDirectory.excludePaths) || [];
  const convertDisabled = !!(convertPageToDirectory && convertPageToDirectory.disabled);

  const files = (Util.getPaths(srcPath, srcPath, []) || []).filter(f => f.endsWith('.html'));
  if (!store.collections) store.collections = {};

  let collected = 0;
  for (const file of files) {
    const relPath = path.relative(srcPath, file).split(path.sep).join('/');
    if (buildOnlyPaths.some(dir => relPath === dir || relPath.startsWith(`${dir}/`))) continue;

    const distFile = `${distPath}/${relPath}`;
    if (excludes.some(r => r.test(distFile))) continue;

    const collection = htmlCollectionName(relPath, siteRoot);
    if (!collection) continue;

    const src = await fs.readFile(file, 'utf-8');
    if (!src.startsWith('---')) continue;

    let frontMatter;
    try {
      ({ data: frontMatter } = matter(src));
    } catch (err) {
      console.warn(chalk.yellow(`\n[html-collections] ${relPath}: invalid front matter (skipped from collections)`));
      console.warn(`  ${err && err.message ? err.message : err}`);
      continue;
    }
    if (!frontMatter || !Object.keys(frontMatter).length || frontMatter.draft === true) continue;

    const convertExcluded = convertExcludes.some(str => distFile.includes(str));
    const page = htmlPageData(relPath, frontMatter, { siteRoot, convertDisabled, convertExcluded });
    addToCollection(store.collections, collection, toCollectionItem(page));
    collected += 1;
  }

  sortCollections(store.collections);
  data.collections = store.collections;

  if (collected) {
    Logger.persist.header('\nHTML Collections');
    Logger.persist.success(`Collected ${collected} HTML page(s)`);
  }
}
