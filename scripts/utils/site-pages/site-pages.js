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
import { distPath as defaultDistPath, siteRoot as defaultSiteRoot } from '../config/config.js';
import { siteRootDir, fileToUrlPath } from '../site-root/site-root.js';
import { isProgramFile } from '../../plugins/programs.js';

/**
 * Collect all built index pages with their source and parsed document.
 * @param {string} [distPathArg] - Dist directory (defaults to config)
 * @param {string} [siteRootArg] - Served subfolder of dist (defaults to config)
 * @returns {Promise<Array<{filePath: string, urlPath: string, src: string, dom: Object}>>}
 */
export async function collectSitePages(distPathArg = defaultDistPath, siteRootArg = defaultSiteRoot) {
  // Walk only the served root: pages outside it have no visitor URL
  const rootDir = siteRootDir(distPathArg, siteRootArg);
  const htmlFiles = Util.getPaths(rootDir, rootDir, []) || [];
  const indexFiles = htmlFiles.filter(
    f => (f.endsWith('/index.html') || f === `${rootDir}/index.html`) && !isProgramFile(f, rootDir)
  );

  const pages = [];
  for (const filePath of indexFiles) {
    const src = await fs.readFile(filePath, 'utf-8');
    const dom = Util.jsdom.dom({ src });
    // dist/blog/my-post/index.html → /blog/my-post/
    // (dist/pages/blog/my-post/index.html with siteRoot: 'pages')
    const urlPath = fileToUrlPath(filePath, distPathArg, siteRootArg);
    pages.push({ filePath, urlPath, src, dom });
  }
  return pages;
}
