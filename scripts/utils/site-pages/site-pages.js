/**
 * @file site-pages.js
 * @description One shared snapshot of the built site's pages for the
 * post-loop plugins. Walks dist ONCE and parses each page ONCE;
 * generate-fragments and generate-formats consume the same parsed
 * documents instead of each re-walking dist and re-parsing every page
 * (previously 2-3 walks and 2-3 parses per page after the file loop).
 *
 * Consumers must treat the doms as READ-ONLY — they are shared.
 */

import { promises as fs } from 'node:fs';
import Util from '../util/util.js';
import { distPath as defaultDistPath } from '../config/config.js';

/**
 * Collect all built index pages with their source and parsed document.
 * @param {string} [distPathArg] - Dist directory (defaults to config)
 * @returns {Promise<Array<{filePath: string, urlPath: string, src: string, dom: Object}>>}
 */
export async function collectSitePages(distPathArg = defaultDistPath) {
  const htmlFiles = Util.getPaths(distPathArg, distPathArg, []) || [];
  const indexFiles = htmlFiles.filter(
    f => f.endsWith('/index.html') || f === `${distPathArg}/index.html`
  );

  const pages = [];
  for (const filePath of indexFiles) {
    const src = await fs.readFile(filePath, 'utf-8');
    const dom = Util.jsdom.dom({ src });
    // dist/blog/my-post/index.html → /blog/my-post/
    const relativePath = filePath.replace(distPathArg, '');
    const urlPath = relativePath.replace(/\/index\.html$/, '/').replace(/^$/, '/');
    pages.push({ filePath, urlPath, src, dom });
  }
  return pages;
}
