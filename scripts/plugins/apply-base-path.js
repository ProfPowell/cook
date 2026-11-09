/**
 * @file apply-base-path.js
 * @description Prefix root-relative URLs in built HTML with `basePath`.
 *
 * For sites served from a sub-path, e.g. a GitHub Pages project site at
 * https://user.github.io/repo/. Authors keep writing root-relative URLs
 * (`/docs/`, `/assets/css/site.css`) as if the site were at "/"; this
 * post-pass rewrites them to `/repo/docs/`, `/repo/assets/css/site.css`.
 *
 * Runs once over the served root after every other built-in post-loop
 * plugin (fragments, formats, sitemap, bundles, fingerprinting), so all of
 * them keep working with plain root-relative paths. Skipped in
 * development so `cook dev` still serves the site at "/".
 *
 * Rewritten:
 *   - href, src, action, formaction, poster, data (object) on any element
 *   - every candidate in srcset
 *   - url(/...) in style attributes and <style> blocks
 *   - keys and values of <script type="importmap"> imports and scopes
 * Left alone:
 *   - relative, absolute (https:, mailto:, data:...) and protocol-relative (//) URLs
 *   - URLs already under basePath (the pass is idempotent)
 *   - text content (code samples showing href="/..." stay as written)
 *   - CSS/JS files, sitemap.xml, md/, api/ JSON and llms*.txt. Absolute
 *     URLs there come from `sitemap.url` / `data.siteUrl`, so include the
 *     base path in those values (https://user.github.io/repo).
 */

// IMPORTS
// -----------------------------
import { promises as fs } from 'node:fs';
import Logger from '../utils/logger/logger.js';
import Util from '../utils/util/util.js';
import { siteRootDir } from '../utils/site-root/site-root.js';

// Config
import { basePath as basePathConfig, distPath, siteRoot } from '../utils/config/config.js';
import { isProgramFile } from './programs.js';


// ============================================================================
// Pure helpers (exported for unit testing)
// ============================================================================

const URL_ATTRS = ['href', 'src', 'action', 'formaction', 'poster', 'data'];

/**
 * Normalize a basePath config value: '' | '/' | 'repo' | '/repo/' → '' | '/repo'
 * @param {string} [basePath]
 * @returns {string}
 */
export function normalizeBasePath(basePath) {
  const trimmed = String(basePath || '').trim().replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}` : '';
}

/**
 * Prefix a single URL when it is root-relative and not already under basePath.
 * @param {string} url
 * @param {string} base - Normalized base ('/repo')
 * @returns {string}
 */
export function prefixUrl(url, base) {
  if (!base || typeof url !== 'string') return url;
  // Root-relative only: "/x", not "//cdn", not "x", not "https://"
  if (!url.startsWith('/') || url.startsWith('//')) return url;
  // Already prefixed: "/repo", "/repo/", "/repo/x", "/repo?q", "/repo#h"
  if (url.startsWith(base) && (url.length === base.length || /^[/?#]/.test(url[base.length]))) return url;
  return `${base}${url}`;
}

/**
 * Prefix every candidate URL in a srcset value.
 * @param {string} srcset - e.g. "/a-320.webp 320w, /a-640.webp 640w"
 * @param {string} base
 * @returns {string}
 */
export function prefixSrcset(srcset, base) {
  return srcset
    .split(',')
    .map(candidate => candidate.replace(/^(\s*)(\S+)/, (m, ws, url) => `${ws}${prefixUrl(url, base)}`))
    .join(',');
}

/**
 * Prefix root-relative url(...) references in CSS text.
 * @param {string} css
 * @param {string} base
 * @returns {string}
 */
export function prefixCssUrls(css, base) {
  return css.replace(/url\(\s*(['"]?)(\/[^'")\s]*)\1\s*\)/g,
    (m, quote, url) => `url(${quote}${prefixUrl(url, base)}${quote})`);
}

/**
 * Prefix an import map's specifier keys and address values.
 * @param {string} json - Import map JSON text
 * @param {string} base
 * @returns {string} Rewritten JSON, or the input unchanged if it does not parse
 */
export function prefixImportMap(json, base) {
  let map;
  try { map = JSON.parse(json); } catch { return json; }
  const remap = (obj) => Object.fromEntries(
    Object.entries(obj || {}).map(([k, v]) => [prefixUrl(k, base), prefixUrl(v, base)])
  );
  if (map.imports) map.imports = remap(map.imports);
  if (map.scopes) {
    map.scopes = Object.fromEntries(
      Object.entries(map.scopes).map(([scope, entries]) => [prefixUrl(scope, base), remap(entries)])
    );
  }
  return JSON.stringify(map);
}

/**
 * Rewrite root-relative URLs in an HTML document or fragment.
 * @param {string} html
 * @param {string} basePath - Raw or normalized base path
 * @returns {{ html: string, rewrites: number }} Input returned untouched when nothing changed
 */
export function rewriteBasePath(html, basePath) {
  const base = normalizeBasePath(basePath);
  if (!base) return { html, rewrites: 0 };

  const dom = Util.jsdom.dom({ src: html });
  const document = dom.window.document;
  let rewrites = 0;

  const set = (el, attr, next) => {
    if (next !== el.getAttribute(attr)) {
      el.setAttribute(attr, next);
      rewrites += 1;
    }
  };

  for (const attr of URL_ATTRS) {
    document.querySelectorAll(`[${attr}]`).forEach(el => set(el, attr, prefixUrl(el.getAttribute(attr), base)));
  }
  document.querySelectorAll('[srcset]').forEach(el => set(el, 'srcset', prefixSrcset(el.getAttribute('srcset'), base)));
  document.querySelectorAll('[style]').forEach(el => set(el, 'style', prefixCssUrls(el.getAttribute('style'), base)));

  document.querySelectorAll('style').forEach(el => {
    const next = prefixCssUrls(el.textContent, base);
    if (next !== el.textContent) { el.textContent = next; rewrites += 1; }
  });
  document.querySelectorAll('script[type="importmap"]').forEach(el => {
    const next = prefixImportMap(el.textContent, base);
    if (next !== el.textContent) { el.textContent = next; rewrites += 1; }
  });

  if (rewrites === 0) return { html, rewrites: 0 };
  return { html: Util.setSrc({ dom }), rewrites };
}


// ============================================================================
// Plugin
// ============================================================================

class ApplyBasePath {
  constructor(opts = {}) {
    // Optional per-call overrides (used by tests and custom pipelines)
    this.basePath = normalizeBasePath(opts.basePath ?? basePathConfig);
    this.distPath = opts.distPath || distPath;
    this.siteRoot = opts.siteRoot ?? siteRoot;
  }

  async init() {
    if (!this.basePath) return;
    // `cook dev` serves dist at "/": prefixed links would 404 locally
    if (process.env.NODE_ENV === 'development') return;

    Logger.persist.header(`\nApply basePath ${this.basePath}`);

    const rootDir = siteRootDir(this.distPath, this.siteRoot);
    const htmlFiles = (Util.getPaths(rootDir, rootDir, []) || []).filter(p => p.endsWith('.html') && !isProgramFile(p, rootDir));

    let files = 0;
    let total = 0;
    for (const htmlPath of htmlFiles) {
      const original = await fs.readFile(htmlPath, 'utf-8');
      const { html, rewrites } = rewriteBasePath(original, this.basePath);
      if (rewrites > 0) {
        await fs.writeFile(htmlPath, html, 'utf-8');
        files += 1;
        total += rewrites;
      }
    }

    Logger.persist.success(`Prefixed ${total} URL(s) in ${files} HTML file(s)`);
  }
}


// EXPORT WRAPPER
// -----------------------------
export default async (opts) => {
  const plugin = new ApplyBasePath(opts);
  await plugin.init();
};
