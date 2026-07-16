/**
 * @file optimize-images.js
 * @description Two-phase image optimization pipeline.
 *
 * Phase 1 (Generate): Scans dist/ for raster images, generates responsive
 * derivatives in AVIF/WebP at configured widths using sharp, with content-hash
 * disk caching for instant rebuilds of unchanged images.
 *
 * Phase 2 (Rewrite): Finds <img> tags with local src in HTML pages, rewrites
 * them to <picture> with <source> + fallback <img>, adding width/height,
 * loading="lazy", and srcset/sizes.
 */

// IMPORTS
// -----------------------------
import chalk from 'chalk';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import Logger from '../utils/logger/logger.js';
import Util from '../utils/util/util.js';

// Config
import { distPath, images as imagesConfig } from '../utils/config/config.js';


// ============================================================================
// Phase 1: Generate derivatives
// ============================================================================

class OptimizeImagesGenerate {
  constructor({ store, distPath: distPathOverride, images: imagesOverride }) {
    this.store = store;
    // Optional per-call overrides (used by tests and custom pipelines)
    this.distPath = distPathOverride || distPath;
    this.config = {
      enabled: true,
      widths: [320, 640, 960, 1280, 1920],
      formats: ['avif', 'webp'],
      quality: { avif: 60, webp: 75, jpeg: 80, png: 80 },
      sizes: '(min-width: 60rem) 960px, 100vw',
      loading: 'lazy',
      cache: '.cache/images',
      ...imagesConfig,
      ...(imagesOverride || {}),
    };

    // Initialize manifest on store
    this.store.imageManifest = {};
  }

  async init() {
    // Early exit: disabled
    if (!this.config.enabled) return;

    // Show terminal message
    Logger.persist.header('\nOptimize Images');

    // Find all raster images in dist/
    const imageFiles = await this.findImages(this.distPath);

    if (!imageFiles.length) {
      Logger.persist.success('No images found (skipped)');
      return;
    }

    // Ensure cache directory exists
    await Util.createDirectory(this.config.cache);

    // Load disk cache manifest
    const cacheManifestPath = path.join(this.config.cache, 'manifest.json');
    let diskCache = {};
    if (existsSync(cacheManifestPath)) {
      try {
        diskCache = JSON.parse(await fs.readFile(cacheManifestPath, 'utf-8'));
      } catch {
        diskCache = {};
      }
    }

    let generated = 0;
    let cached = 0;

    for (const imgPath of imageFiles) {
      const result = await this.processImage(imgPath, diskCache);
      if (result.fromCache) cached++;
      else generated++;
    }

    // Write updated disk cache
    await fs.writeFile(cacheManifestPath, JSON.stringify(diskCache, null, 2), 'utf-8');

    Logger.persist.success(`Images: ${generated} generated, ${cached} cached (${imageFiles.length} total)`);
  }

  /**
   * Recursively find raster images in a directory
   * @param {string} dir - Directory to search
   * @returns {string[]} Array of image file paths
   */
  async findImages(dir) {
    const rasterExts = ['.jpg', '.jpeg', '.png', '.webp'];
    const allPaths = Util.getPaths(dir, dir, []);
    if (!allPaths) return [];
    return allPaths.filter(p => {
      const ext = path.extname(p).toLowerCase();
      if (!rasterExts.includes(ext)) return false;
      // Skip our own generated derivatives (foo-320w.webp) — rescanning
      // them produces derivative-of-derivative cascades (foo-320w-320w.avif)
      if (/-\d+w\.(avif|webp|jpe?g|png)$/i.test(p)) return false;
      return true;
    });
  }

  /**
   * Process a single image: hash, check cache, generate derivatives
   * @param {string} imgPath - Absolute path to source image
   * @param {Object} diskCache - Disk cache manifest object (mutated)
   * @returns {{ fromCache: boolean }}
   */
  async processImage(imgPath, diskCache) {
    // Read file and compute content hash
    const buffer = await fs.readFile(imgPath);
    const hash = createHash('md5').update(buffer).digest('hex');

    // Get relative path from dist for manifest key
    const relPath = imgPath.replace(`${this.distPath}/`, '/');

    // Check disk cache: derivatives are copied back into dist from the
    // cache directory (dist is wiped every production build, so checking
    // dist alone made the cache permanently cold).
    if (diskCache[relPath] && diskCache[relPath].hash === hash) {
      const restored = await this.restoreDerivatives(diskCache[relPath], hash);
      if (restored) {
        this.store.imageManifest[relPath] = diskCache[relPath];
        return { fromCache: true };
      }
    }

    // Get image metadata.
    // Auto-rotation (EXIF orientation) swaps the visible dimensions for
    // orientations 5-8 (90°/270°) — use the VISUAL size everywhere.
    const metadata = await sharp(buffer).metadata();
    const orientationSwaps = (metadata.orientation || 1) >= 5;
    const srcWidth = orientationSwaps ? metadata.height : metadata.width;
    const srcHeight = orientationSwaps ? metadata.width : metadata.height;

    // Determine which widths to generate (no upscaling)
    const fittingWidths = this.config.widths.filter(w => w <= srcWidth);
    // If no configured width fits, use the source width for format conversion
    const widths = fittingWidths.length > 0 ? fittingWidths : [srcWidth];

    // Ensure the cache files directory exists before generating
    await fs.mkdir(path.join(this.config.cache, 'files'), { recursive: true });

    const parsed = path.parse(imgPath);
    const baseName = parsed.name;
    const baseDir = parsed.dir;
    const srcExt = parsed.ext.toLowerCase();

    // Determine the original format name for quality lookup
    const origFormat = (srcExt === '.jpg' || srcExt === '.jpeg') ? 'jpeg' : srcExt.slice(1);

    const derivatives = [];

    // Generate derivatives for each format + width
    const allFormats = [...this.config.formats, origFormat];
    // Deduplicate (e.g., if source is .webp and webp is in formats)
    const uniqueFormats = [...new Set(allFormats)];

    for (const format of uniqueFormats) {
      for (const width of widths) {
        const outExt = format === 'jpeg' ? 'jpg' : format;
        const outName = `${baseName}-${width}w.${outExt}`;
        const outPath = path.join(baseDir, outName);
        const quality = this.config.quality[format] || this.config.quality.jpeg || 80;

        // Calculate proportional height
        const height = Math.round((width / srcWidth) * srcHeight);

        // .rotate() with no args applies EXIF orientation and strips the
        // tag, so portrait phone photos aren't resized sideways
        let pipeline = sharp(buffer).rotate().resize(width, height, { fit: 'inside', withoutEnlargement: true });

        if (format === 'avif') pipeline = pipeline.avif({ quality });
        else if (format === 'webp') pipeline = pipeline.webp({ quality });
        else if (format === 'jpeg') pipeline = pipeline.jpeg({ quality });
        else if (format === 'png') pipeline = pipeline.png({ quality });

        await pipeline.toFile(outPath);

        // Keep a copy in the cache directory so the next build can
        // restore it without re-encoding (dist gets wiped every build)
        await fs.copyFile(outPath, this.cacheFilePath(hash, width, outExt));

        derivatives.push({
          path: outPath.replace(`${this.distPath}`, '').replace(/\\/g, '/'),
          format,
          width,
          height,
        });
      }
    }

    // Build manifest entry
    const entry = {
      hash,
      width: srcWidth,
      height: srcHeight,
      derivatives,
    };

    this.store.imageManifest[relPath] = entry;
    diskCache[relPath] = entry;

    return { fromCache: false };
  }

  /**
   * Path of a cached derivative file for a given source hash + width
   * @param {string} hash - Source image content hash
   * @param {number} width - Derivative width
   * @param {string} ext - Output extension (no dot)
   * @returns {string}
   */
  cacheFilePath(hash, width, ext) {
    return path.join(this.config.cache, 'files', `${hash}-${width}w.${ext}`);
  }

  /**
   * Copy cached derivative files into dist for a cache-hit source image.
   * @param {Object} entry - Disk cache manifest entry
   * @param {string} hash - Source image content hash
   * @returns {boolean} false if any derivative is missing from the cache
   */
  async restoreDerivatives(entry, hash) {
    for (const d of entry.derivatives) {
      const distFile = path.join(this.distPath, d.path);
      if (existsSync(distFile)) continue;
      const ext = path.extname(d.path).slice(1);
      const cacheFile = this.cacheFilePath(hash, d.width, ext);
      if (!existsSync(cacheFile)) return false;
      await fs.mkdir(path.dirname(distFile), { recursive: true });
      await fs.copyFile(cacheFile, distFile);
    }
    return true;
  }


  // EXPORT WRAPPER
  // -----------------------------
  static async exportGenerate(opts) {
    return new OptimizeImagesGenerate(opts).init();
  }
}


// ============================================================================
// Phase 2: Rewrite <img> to <picture>
// ============================================================================

class OptimizeImagesRewrite {
  constructor({ file, store, allowType, disallowType }) {
    this.opts = { file, allowType, disallowType };
    this.file = file;
    this.store = store;
    this.config = {
      enabled: true,
      sizes: '(min-width: 60rem) 960px, 100vw',
      loading: 'lazy',
      ...imagesConfig,
    };
  }

  async init() {
    // Early exit: disabled
    if (!this.config.enabled) return;

    // Early exit: no manifest
    if (!this.store.imageManifest || Object.keys(this.store.imageManifest).length === 0) return;

    // Early exit: file type not allowed
    const allowed = Util.isAllowedType(this.opts);
    if (!allowed) return;

    // Parse HTML
    const dom = Util.jsdom.dom({ src: this.file.src });
    const document = dom.window.document;

    // Find all <img> tags
    const imgs = document.querySelectorAll('img');
    if (!imgs.length) return;

    let rewrote = 0;

    for (const img of imgs) {
      const changed = this.rewriteImg(img, document);
      if (changed) rewrote++;
    }

    // Only update source if we made changes
    if (rewrote > 0) {
      this.file.src = Util.setSrc({ dom });
    }
  }

  /**
   * Rewrite a single <img> element to <picture> if applicable
   * @param {Element} img - The <img> element
   * @param {Document} document - The DOM document
   * @returns {boolean} Whether the img was rewritten
   */
  rewriteImg(img, document) {
    // --- Skip checks ---

    // Skip: data-no-optimize attribute
    if (img.hasAttribute('data-no-optimize')) return false;

    // Skip: already inside a <picture> element
    if (img.parentElement && img.parentElement.tagName === 'PICTURE') return false;

    const src = img.getAttribute('src');
    if (!src) return false;

    // Skip: external URLs
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) return false;

    // Skip: data URIs
    if (src.startsWith('data:')) return false;

    // Skip: SVG
    if (src.toLowerCase().endsWith('.svg')) return false;

    // Skip: GIF
    if (src.toLowerCase().endsWith('.gif')) return false;

    // --- Lookup in manifest ---

    // Normalize src to match manifest keys (ensure leading /)
    const normalizedSrc = src.startsWith('/') ? src : `/${src}`;
    const manifestEntry = this.store.imageManifest[normalizedSrc];

    if (!manifestEntry) {
      return false;
    }

    // --- Build <picture> ---

    const derivatives = manifestEntry.derivatives;
    const authorSizes = img.getAttribute('sizes') || this.config.sizes;

    // Group derivatives by format
    const byFormat = {};
    for (const d of derivatives) {
      if (!byFormat[d.format]) byFormat[d.format] = [];
      byFormat[d.format].push(d);
    }

    // Sort each format's derivatives by width
    for (const format of Object.keys(byFormat)) {
      byFormat[format].sort((a, b) => a.width - b.width);
    }

    // Determine original format
    const srcExt = path.extname(src).toLowerCase();
    const origFormat = (srcExt === '.jpg' || srcExt === '.jpeg') ? 'jpeg' : srcExt.slice(1);

    // Create <picture> element
    const picture = document.createElement('picture');

    // Add <source> elements for each modern format (avif, webp)
    for (const format of this.config.formats) {
      if (!byFormat[format]) continue;
      const source = document.createElement('source');
      const mimeType = format === 'avif' ? 'image/avif' : `image/${format}`;
      source.setAttribute('type', mimeType);
      source.setAttribute('srcset', byFormat[format].map(d => `${d.path} ${d.width}w`).join(', '));
      source.setAttribute('sizes', authorSizes);
      picture.appendChild(source);
    }

    // Build fallback <img>
    // Pick the derivative closest to 960px (or largest available) for the src
    const origDerivatives = byFormat[origFormat] || [];
    let fallbackSrc = src;
    if (origDerivatives.length > 0) {
      const target = origDerivatives.find(d => d.width >= 960) || origDerivatives[origDerivatives.length - 1];
      fallbackSrc = target.path;
    }

    // Clone all original attributes to the new img
    const newImg = document.createElement('img');
    for (const attr of Array.from(img.attributes)) {
      if (attr.name === 'src') continue;
      if (attr.name === 'sizes') continue;
      newImg.setAttribute(attr.name, attr.value);
    }
    newImg.setAttribute('src', fallbackSrc);

    // Add srcset for original format
    if (origDerivatives.length > 0) {
      newImg.setAttribute('srcset', origDerivatives.map(d => `${d.path} ${d.width}w`).join(', '));
      newImg.setAttribute('sizes', authorSizes);
    }

    // Add width/height from manifest
    newImg.setAttribute('width', String(manifestEntry.width));
    newImg.setAttribute('height', String(manifestEntry.height));

    // Add loading="lazy" unless author specified a loading attribute
    if (!img.hasAttribute('loading')) {
      newImg.setAttribute('loading', this.config.loading);
    }

    picture.appendChild(newImg);

    // Replace original <img> with <picture>
    img.replaceWith(picture);

    return true;
  }


  // EXPORT WRAPPER
  // -----------------------------
  static async exportRewrite(opts) {
    return new OptimizeImagesRewrite(opts).init();
  }
}


// EXPORTS
// -----------------------------
export const optimizeImagesGenerate = OptimizeImagesGenerate.exportGenerate;
export const optimizeImagesRewrite = OptimizeImagesRewrite.exportRewrite;
