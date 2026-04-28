/**
 * @file fingerprint-assets.js
 * @description Content-hash fingerprinting for built CSS and JS assets.
 *
 * Runs as a post-pass over dist/ after all HTML and bundles are written.
 *
 * Phase 1: Hash and rename matching assets (foo.css -> foo.a1b2c3d4.css).
 *          Source map files (.map) are renamed alongside their source and the
 *          sourceMappingURL comment is updated to point to the new map name.
 * Phase 2: Walk dist/ HTML and rewrite <link href> and <script src> refs.
 * Phase 3: Emit dist/<manifestPath> mapping original -> hashed paths.
 *
 * Out of scope for v1: url() refs inside CSS, image fingerprinting.
 */

// IMPORTS
// -----------------------------
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import Logger from '../utils/logger/logger.js';
import Util from '../utils/util/util.js';

// Config
import { distPath, fingerprint as fingerprintConfig } from '../utils/config/config.js';


// ============================================================================
// Pure helpers (extracted for unit testing)
// ============================================================================

/**
 * Compute a content hash truncated to the given length.
 * @param {Buffer|string} content
 * @param {number} length - Number of hex chars to keep
 * @param {string} [algorithm='sha256']
 * @returns {string}
 */
export function computeHash(content, length, algorithm = 'sha256') {
  return createHash(algorithm).update(content).digest('hex').slice(0, length);
}

/**
 * Insert a hash into a filename before the extension.
 * Handles compound extensions like `.js.map` by inserting before the last
 * meaningful extension (e.g. `foo.js.map` -> `foo.{hash}.js.map`).
 * @param {string} filename - Base filename, e.g. "foo.css"
 * @param {string} hash
 * @returns {string} e.g. "foo.{hash}.css"
 */
export function fingerprintFilename(filename, hash) {
  // Map files: keep .js.map / .css.map paired with their source hash
  if (filename.endsWith('.js.map')) {
    const stem = filename.slice(0, -'.js.map'.length);
    return `${stem}.${hash}.js.map`;
  }
  if (filename.endsWith('.css.map')) {
    const stem = filename.slice(0, -'.css.map'.length);
    return `${stem}.${hash}.css.map`;
  }
  const ext = path.extname(filename);
  if (!ext) return `${filename}.${hash}`;
  const stem = filename.slice(0, -ext.length);
  return `${stem}.${hash}${ext}`;
}

/**
 * Should this href/src be left alone?
 * @param {string} url
 * @returns {boolean}
 */
export function isExternalRef(url) {
  if (!url) return true;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) return true;
  if (url.startsWith('data:')) return true;
  if (url.startsWith('mailto:') || url.startsWith('tel:')) return true;
  return false;
}

/**
 * Strip query string / fragment from a URL for manifest lookup.
 * Returns { path, suffix } so the suffix can be reattached after rewriting.
 * @param {string} url
 */
export function splitUrlSuffix(url) {
  const qIdx = url.search(/[?#]/);
  if (qIdx === -1) return { path: url, suffix: '' };
  return { path: url.slice(0, qIdx), suffix: url.slice(qIdx) };
}

/**
 * Rewrite <link href> and <script src> in an HTML string using the manifest.
 * Manifest keys are absolute-from-dist paths (e.g. "/assets/css/site.css").
 * @param {string} html
 * @param {Object} manifest - { "/assets/css/site.css": "/assets/css/site.{hash}.css", ... }
 * @returns {{ html: string, rewrites: number }}
 */
export function rewriteHrefs(html, manifest) {
  if (!manifest || Object.keys(manifest).length === 0) return { html, rewrites: 0 };

  const dom = new JSDOM(html);
  const document = dom.window.document;
  let rewrites = 0;

  const rewriteAttr = (el, attr) => {
    const original = el.getAttribute(attr);
    if (!original || isExternalRef(original)) return;
    const { path: cleanPath, suffix } = splitUrlSuffix(original);
    const lookupKey = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
    const replacement = manifest[lookupKey];
    if (!replacement) return;
    // Preserve leading-slash style of the original
    const newValue = cleanPath.startsWith('/') ? replacement : replacement.replace(/^\//, '');
    el.setAttribute(attr, `${newValue}${suffix}`);
    rewrites += 1;
  };

  document.querySelectorAll('link[href]').forEach(el => rewriteAttr(el, 'href'));
  document.querySelectorAll('script[src]').forEach(el => rewriteAttr(el, 'src'));

  if (rewrites === 0) return { html, rewrites: 0 };
  return { html: dom.serialize(), rewrites };
}


// ============================================================================
// Plugin
// ============================================================================

class FingerprintAssets {
  constructor() {
    this.config = {
      enabled: false,
      hashLength: 8,
      algorithm: 'sha256',
      types: ['.css', '.js'],
      excludePaths: [],
      manifestPath: 'asset-manifest.json',
      ...fingerprintConfig,
    };
  }

  async init() {
    if (!this.config.enabled) return;
    if (process.env.DEV_CHANGED_PAGE) return;

    Logger.persist.header('\nFingerprint Assets');

    // Phase 1: Find candidates and hash + rename
    const candidates = await this.findCandidates();
    if (!candidates.length) {
      Logger.persist.success('No matching assets (skipped)');
      return;
    }

    const manifest = await this.fingerprintFiles(candidates);

    // Phase 2: Rewrite HTML references
    const htmlFiles = (Util.getPaths(distPath, distPath, []) || [])
      .filter(p => p.endsWith('.html'));
    let totalRewrites = 0;
    for (const htmlPath of htmlFiles) {
      const original = await fs.readFile(htmlPath, 'utf-8');
      const { html, rewrites } = rewriteHrefs(original, manifest);
      if (rewrites > 0) {
        await fs.writeFile(htmlPath, html, 'utf-8');
        totalRewrites += rewrites;
      }
    }

    // Phase 3: Write manifest
    const manifestFsPath = path.join(distPath, this.config.manifestPath);
    await fs.writeFile(manifestFsPath, JSON.stringify(manifest, null, 2), 'utf-8');

    Logger.persist.success(
      `Fingerprinted ${candidates.length} asset(s), rewrote ${totalRewrites} HTML ref(s)`
    );
  }

  /**
   * Find all dist files matching configured types, excluding configured paths.
   * Returns absolute paths.
   */
  async findCandidates() {
    const all = Util.getPaths(distPath, distPath, []) || [];
    const excludes = this.config.excludePaths.map(p => (p instanceof RegExp ? p : new RegExp(p)));
    return all.filter(p => {
      // Skip source maps in the candidate list — handled alongside their source.
      if (p.endsWith('.map')) return false;
      const ext = path.extname(p);
      if (!this.config.types.includes(ext)) return false;
      if (excludes.some(r => r.test(p))) return false;
      return true;
    });
  }

  /**
   * Hash, rename, and (if present) rename the paired .map and patch sourceMappingURL.
   * @param {string[]} candidates - Absolute paths
   * @returns {Promise<Object>} manifest of relative-from-dist mappings
   */
  async fingerprintFiles(candidates) {
    const manifest = {};

    for (const absPath of candidates) {
      const buffer = await fs.readFile(absPath);
      const hash = computeHash(buffer, this.config.hashLength, this.config.algorithm);

      const dir = path.dirname(absPath);
      const baseName = path.basename(absPath);
      const newName = fingerprintFilename(baseName, hash);
      const newAbs = path.join(dir, newName);

      // Handle paired .map file (if present)
      const mapAbs = `${absPath}.map`;
      let updatedContent = null;
      let mapNewName = null;
      try {
        await fs.access(mapAbs);
        // Rename map file with the same hash
        mapNewName = fingerprintFilename(`${baseName}.map`, hash);
        const mapNewAbs = path.join(dir, mapNewName);
        await fs.rename(mapAbs, mapNewAbs);
        // Patch sourceMappingURL comment to point at the new map name
        const text = buffer.toString('utf-8');
        updatedContent = text.replace(
          /(sourceMappingURL=)([^\s*'"]+)/,
          (_, prefix) => `${prefix}${mapNewName}`
        );
      } catch {
        // No map file
      }

      if (updatedContent !== null) {
        await fs.writeFile(newAbs, updatedContent, 'utf-8');
        await fs.unlink(absPath);
      } else {
        await fs.rename(absPath, newAbs);
      }

      // Build manifest keys as web paths starting with `/`
      const relOriginal = '/' + path.relative(distPath, absPath).split(path.sep).join('/');
      const relNew = '/' + path.relative(distPath, newAbs).split(path.sep).join('/');
      manifest[relOriginal] = relNew;

      if (mapNewName) {
        const relMapOriginal = '/' + path.relative(distPath, mapAbs).split(path.sep).join('/');
        const relMapNew = '/' + path.relative(distPath, path.join(dir, mapNewName)).split(path.sep).join('/');
        manifest[relMapOriginal] = relMapNew;
      }
    }

    return manifest;
  }


  // EXPORT WRAPPER
  // -----------------------------
  static async export(opts) {
    return new FingerprintAssets(opts).init();
  }
}


// EXPORT
// -----------------------------
export default FingerprintAssets.export;
