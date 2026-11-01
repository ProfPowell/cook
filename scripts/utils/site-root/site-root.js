/**
 * @file site-root.js
 * @description One mapping from built files to public URL paths.
 *
 * By default `distPath` is the web root: dist/blog/post/index.html is
 * served at /blog/post/. Some sites keep pages in a subfolder and deploy
 * only that folder (e.g. src/pages → dist/pages, with dist/pages as the
 * host's output directory). `siteRoot: 'pages'` tells Cook that
 * dist/pages/ is served at "/", so active links, the sitemap and the
 * post-build page snapshot compute the URLs visitors actually see.
 */

/**
 * Normalize a siteRoot config value: '' | 'pages' | '/pages/' → '' | 'pages'
 * @param {string} [siteRoot]
 * @returns {string}
 */
export function normalizeSiteRoot(siteRoot) {
  return String(siteRoot || '').replace(/^\/+|\/+$/g, '');
}

/**
 * Directory inside dist that is served at "/".
 * @param {string} distPath
 * @param {string} [siteRoot]
 * @returns {string} e.g. 'dist' or 'dist/pages'
 */
export function siteRootDir(distPath, siteRoot) {
  const root = normalizeSiteRoot(siteRoot);
  return root ? `${distPath}/${root}` : distPath;
}

/**
 * Public URL path of a built file, or null when the file sits outside the
 * served root (it is never reachable by a visitor).
 *   dist/index.html            → /
 *   dist/blog/post/index.html  → /blog/post/
 *   dist/about.html            → /about.html
 *   dist/pages/docs/index.html → /docs/          (siteRoot: 'pages')
 *   dist/assets/x.html         → null            (siteRoot: 'pages')
 * @param {string} filePath - Path as Cook sees it (starts with distPath)
 * @param {string} distPath
 * @param {string} [siteRoot]
 * @returns {string|null}
 */
export function fileToUrlPath(filePath, distPath, siteRoot) {
  const rootDir = siteRootDir(distPath, siteRoot);
  let rel;
  if (filePath === rootDir) rel = '';
  else if (filePath.startsWith(`${rootDir}/`)) rel = filePath.slice(rootDir.length);
  // No siteRoot: tolerate paths given without the dist prefix (custom
  // pipelines and tests pass 'about/index.html' or '/about/index.html').
  else if (!normalizeSiteRoot(siteRoot)) rel = filePath;
  else return null;
  rel = rel.replace(/\/index\.html$/, '/');
  if (!rel.startsWith('/')) rel = `/${rel}`;
  return rel;
}
