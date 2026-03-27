/**
 * @file optimize-images.test.js
 * @description Tests for image optimization pipeline
 *
 * Tests the two-phase image pipeline:
 * - Skip logic: which <img> tags are left untouched
 * - Picture generation: correct <picture> markup with <source> + fallback
 * - Width filtering: no-upscale rule
 * - Naming convention: derivative path generation
 * - End-to-end: full markup transformation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Replicate core rewrite logic from optimize-images.js for unit testing
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG = {
  widths: [320, 640, 960, 1280, 1920],
  formats: ['avif', 'webp'],
  quality: { avif: 60, webp: 75, jpeg: 80, png: 80 },
  sizes: '(min-width: 60rem) 960px, 100vw',
  loading: 'lazy',
};

/**
 * Generate derivative paths for a given source image
 * @param {string} src - Image src path (e.g. /assets/images/hero.jpg)
 * @param {number} srcWidth - Source image width
 * @param {number} srcHeight - Source image height
 * @param {Object} [config] - Optional config overrides
 * @returns {{ derivatives: Array, width: number, height: number }}
 */
function generateManifestEntry(src, srcWidth, srcHeight, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const parsed = path.parse(src);
  const baseName = parsed.name;
  const baseDir = parsed.dir;
  const srcExt = parsed.ext.toLowerCase();
  const origFormat = (srcExt === '.jpg' || srcExt === '.jpeg') ? 'jpeg' : srcExt.slice(1);

  // No-upscale: only widths <= source width
  const fittingWidths = cfg.widths.filter(w => w <= srcWidth);
  const widths = fittingWidths.length > 0 ? fittingWidths : [srcWidth];

  const allFormats = [...new Set([...cfg.formats, origFormat])];
  const derivatives = [];

  for (const format of allFormats) {
    for (const width of widths) {
      const outExt = format === 'jpeg' ? 'jpg' : format;
      const outName = `${baseName}-${width}w.${outExt}`;
      const outPath = `${baseDir}/${outName}`;
      const height = Math.round((width / srcWidth) * srcHeight);

      derivatives.push({ path: outPath, format, width, height });
    }
  }

  return { width: srcWidth, height: srcHeight, derivatives };
}

/**
 * Determine if an <img> should be skipped
 * @param {Element} img - The img element
 * @returns {string|false} Skip reason or false if should process
 */
function shouldSkip(img) {
  if (img.hasAttribute('data-no-optimize')) return 'data-no-optimize';
  if (img.parentElement && img.parentElement.tagName === 'PICTURE') return 'inside-picture';

  const src = img.getAttribute('src');
  if (!src) return 'no-src';
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) return 'external';
  if (src.startsWith('data:')) return 'data-uri';
  if (src.toLowerCase().endsWith('.svg')) return 'svg';
  if (src.toLowerCase().endsWith('.gif')) return 'gif';

  return false;
}

/**
 * Rewrite an <img> to <picture> given a manifest entry
 * @param {Element} img - The img element
 * @param {Document} document - The DOM document
 * @param {Object} entry - Manifest entry with derivatives
 * @param {Object} [config] - Optional config overrides
 * @returns {boolean} Whether rewrite happened
 */
function rewriteImgToPicture(img, document, entry, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const src = img.getAttribute('src');

  const skipReason = shouldSkip(img);
  if (skipReason) return false;

  if (!entry) return false;

  const derivatives = entry.derivatives;
  const authorSizes = img.getAttribute('sizes') || cfg.sizes;

  // Group by format
  const byFormat = {};
  for (const d of derivatives) {
    if (!byFormat[d.format]) byFormat[d.format] = [];
    byFormat[d.format].push(d);
  }
  for (const format of Object.keys(byFormat)) {
    byFormat[format].sort((a, b) => a.width - b.width);
  }

  const srcExt = path.extname(src).toLowerCase();
  const origFormat = (srcExt === '.jpg' || srcExt === '.jpeg') ? 'jpeg' : srcExt.slice(1);

  // Create <picture>
  const picture = document.createElement('picture');

  // Add <source> for each modern format
  for (const format of cfg.formats) {
    if (!byFormat[format]) continue;
    const source = document.createElement('source');
    const mimeType = format === 'avif' ? 'image/avif' : `image/${format}`;
    source.setAttribute('type', mimeType);
    source.setAttribute('srcset', byFormat[format].map(d => `${d.path} ${d.width}w`).join(', '));
    source.setAttribute('sizes', authorSizes);
    picture.appendChild(source);
  }

  // Fallback <img>
  const origDerivatives = byFormat[origFormat] || [];
  let fallbackSrc = src;
  if (origDerivatives.length > 0) {
    const target = origDerivatives.find(d => d.width >= 960) || origDerivatives[origDerivatives.length - 1];
    fallbackSrc = target.path;
  }

  const newImg = document.createElement('img');
  for (const attr of Array.from(img.attributes)) {
    if (attr.name === 'src' || attr.name === 'sizes') continue;
    newImg.setAttribute(attr.name, attr.value);
  }
  newImg.setAttribute('src', fallbackSrc);

  if (origDerivatives.length > 0) {
    newImg.setAttribute('srcset', origDerivatives.map(d => `${d.path} ${d.width}w`).join(', '));
    newImg.setAttribute('sizes', authorSizes);
  }

  newImg.setAttribute('width', String(entry.width));
  newImg.setAttribute('height', String(entry.height));

  if (!img.hasAttribute('loading')) {
    newImg.setAttribute('loading', cfg.loading);
  }

  picture.appendChild(newImg);
  img.replaceWith(picture);

  return true;
}


// ============================================================================
// Tests
// ============================================================================

describe('Image Optimization', () => {

  // --------------------------------------------------------------------------
  // Skip Logic
  // --------------------------------------------------------------------------

  describe('Skip Logic', () => {

    it('should skip images with data-no-optimize attribute', () => {
      const dom = new JSDOM('<img src="/assets/logo.jpg" data-no-optimize>');
      const img = dom.window.document.querySelector('img');
      assert.strictEqual(shouldSkip(img), 'data-no-optimize');
    });

    it('should skip external URLs (http)', () => {
      const dom = new JSDOM('<img src="http://example.com/photo.jpg">');
      const img = dom.window.document.querySelector('img');
      assert.strictEqual(shouldSkip(img), 'external');
    });

    it('should skip external URLs (https)', () => {
      const dom = new JSDOM('<img src="https://cdn.example.com/photo.jpg">');
      const img = dom.window.document.querySelector('img');
      assert.strictEqual(shouldSkip(img), 'external');
    });

    it('should skip protocol-relative URLs', () => {
      const dom = new JSDOM('<img src="//cdn.example.com/photo.jpg">');
      const img = dom.window.document.querySelector('img');
      assert.strictEqual(shouldSkip(img), 'external');
    });

    it('should skip data URIs', () => {
      const dom = new JSDOM('<img src="data:image/png;base64,iVBOR...">');
      const img = dom.window.document.querySelector('img');
      assert.strictEqual(shouldSkip(img), 'data-uri');
    });

    it('should skip SVG files', () => {
      const dom = new JSDOM('<img src="/assets/icons/logo.svg">');
      const img = dom.window.document.querySelector('img');
      assert.strictEqual(shouldSkip(img), 'svg');
    });

    it('should skip GIF files', () => {
      const dom = new JSDOM('<img src="/assets/animations/loading.gif">');
      const img = dom.window.document.querySelector('img');
      assert.strictEqual(shouldSkip(img), 'gif');
    });

    it('should skip images already inside <picture>', () => {
      const dom = new JSDOM('<picture><img src="/assets/hero.jpg"></picture>');
      const img = dom.window.document.querySelector('img');
      assert.strictEqual(shouldSkip(img), 'inside-picture');
    });

    it('should not skip normal local images', () => {
      const dom = new JSDOM('<img src="/assets/images/hero.jpg" alt="Hero">');
      const img = dom.window.document.querySelector('img');
      assert.strictEqual(shouldSkip(img), false);
    });

    it('should not skip images without leading slash', () => {
      const dom = new JSDOM('<img src="assets/images/hero.png" alt="Hero">');
      const img = dom.window.document.querySelector('img');
      assert.strictEqual(shouldSkip(img), false);
    });
  });

  // --------------------------------------------------------------------------
  // Picture Generation
  // --------------------------------------------------------------------------

  describe('Picture Generation', () => {

    function buildPictureFromHtml(html, manifestEntry, config) {
      const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
      const document = dom.window.document;
      const img = document.querySelector('img');
      rewriteImgToPicture(img, document, manifestEntry, config);
      return document.body.innerHTML;
    }

    const standardEntry = generateManifestEntry('/assets/images/hero.jpg', 1920, 1080);

    it('should create <source> elements for avif and webp', () => {
      const result = buildPictureFromHtml(
        '<img src="/assets/images/hero.jpg" alt="Hero">',
        standardEntry
      );
      assert.ok(result.includes('<source type="image/avif"'));
      assert.ok(result.includes('<source type="image/webp"'));
    });

    it('should generate correct srcset format', () => {
      const result = buildPictureFromHtml(
        '<img src="/assets/images/hero.jpg" alt="Hero">',
        standardEntry
      );
      assert.ok(result.includes('hero-320w.avif 320w'));
      assert.ok(result.includes('hero-640w.avif 640w'));
      assert.ok(result.includes('hero-960w.avif 960w'));
      assert.ok(result.includes('hero-1280w.avif 1280w'));
      assert.ok(result.includes('hero-1920w.avif 1920w'));
    });

    it('should preserve original attributes (alt, class, id, style, data-*)', () => {
      const result = buildPictureFromHtml(
        '<img src="/assets/images/hero.jpg" alt="Mountain vista" class="hero-img" id="main-hero" style="max-width:100%" data-section="top">',
        standardEntry
      );
      assert.ok(result.includes('alt="Mountain vista"'));
      assert.ok(result.includes('class="hero-img"'));
      assert.ok(result.includes('id="main-hero"'));
      assert.ok(result.includes('style="max-width:100%"'));
      assert.ok(result.includes('data-section="top"'));
    });

    it('should inject width and height from manifest', () => {
      const result = buildPictureFromHtml(
        '<img src="/assets/images/hero.jpg" alt="Hero">',
        standardEntry
      );
      assert.ok(result.includes('width="1920"'));
      assert.ok(result.includes('height="1080"'));
    });

    it('should inject loading="lazy" by default', () => {
      const result = buildPictureFromHtml(
        '<img src="/assets/images/hero.jpg" alt="Hero">',
        standardEntry
      );
      assert.ok(result.includes('loading="lazy"'));
    });

    it('should preserve loading="eager" when author set it', () => {
      const result = buildPictureFromHtml(
        '<img src="/assets/images/hero.jpg" alt="Hero" loading="eager">',
        standardEntry
      );
      assert.ok(result.includes('loading="eager"'));
      assert.ok(!result.includes('loading="lazy"'));
    });

    it('should use author sizes attribute when provided', () => {
      const result = buildPictureFromHtml(
        '<img src="/assets/images/hero.jpg" alt="Hero" sizes="50vw">',
        standardEntry
      );
      assert.ok(result.includes('sizes="50vw"'));
      // All source elements and the img should have the author's sizes
      const sizeMatches = result.match(/sizes="50vw"/g);
      assert.ok(sizeMatches.length >= 2, 'sizes should appear on sources and img');
    });

    it('should use default sizes when author does not provide one', () => {
      const result = buildPictureFromHtml(
        '<img src="/assets/images/hero.jpg" alt="Hero">',
        standardEntry
      );
      assert.ok(result.includes('sizes="(min-width: 60rem) 960px, 100vw"'));
    });
  });

  // --------------------------------------------------------------------------
  // Width Filtering (No-Upscale)
  // --------------------------------------------------------------------------

  describe('Width Filtering', () => {

    it('should not generate widths larger than the source image', () => {
      const entry = generateManifestEntry('/assets/images/small.jpg', 800, 600);
      const widths = entry.derivatives.map(d => d.width);
      assert.ok(widths.every(w => w <= 800), 'No derivative should exceed source width');
    });

    it('should do format-only conversion for very small images', () => {
      const entry = generateManifestEntry('/assets/images/icon.png', 200, 200);
      // All derivatives should be at 200px (the source width)
      const widths = [...new Set(entry.derivatives.map(d => d.width))];
      assert.strictEqual(widths.length, 1);
      assert.strictEqual(widths[0], 200);
      // But should have avif, webp, and png formats
      const formats = [...new Set(entry.derivatives.map(d => d.format))];
      assert.ok(formats.includes('avif'));
      assert.ok(formats.includes('webp'));
      assert.ok(formats.includes('png'));
    });

    it('should include all fitting widths', () => {
      const entry = generateManifestEntry('/assets/images/photo.jpg', 1000, 750);
      const widths = [...new Set(entry.derivatives.map(d => d.width))];
      // Should include 320, 640, 960 (all <= 1000) but not 1280 or 1920
      assert.ok(widths.includes(320));
      assert.ok(widths.includes(640));
      assert.ok(widths.includes(960));
      assert.ok(!widths.includes(1280));
      assert.ok(!widths.includes(1920));
    });
  });

  // --------------------------------------------------------------------------
  // Naming Convention
  // --------------------------------------------------------------------------

  describe('Naming Convention', () => {

    it('should generate derivative paths with {name}-{width}w.{format}', () => {
      const entry = generateManifestEntry('/assets/images/hero.jpg', 1920, 1080);
      const avifPaths = entry.derivatives.filter(d => d.format === 'avif').map(d => d.path);
      assert.ok(avifPaths.includes('/assets/images/hero-320w.avif'));
      assert.ok(avifPaths.includes('/assets/images/hero-1920w.avif'));
    });

    it('should handle various path formats correctly', () => {
      const entry1 = generateManifestEntry('/images/photo.png', 640, 480);
      assert.ok(entry1.derivatives.some(d => d.path === '/images/photo-320w.avif'));

      const entry2 = generateManifestEntry('/assets/blog/post-image.jpg', 960, 720);
      assert.ok(entry2.derivatives.some(d => d.path === '/assets/blog/post-image-320w.webp'));
    });
  });

  // --------------------------------------------------------------------------
  // End-to-End Markup
  // --------------------------------------------------------------------------

  describe('End-to-End Markup', () => {

    it('should transform a single img to picture', () => {
      const dom = new JSDOM('<!doctype html><html><body><img src="/assets/images/hero.jpg" alt="Mountain vista"></body></html>');
      const document = dom.window.document;
      const img = document.querySelector('img');
      const entry = generateManifestEntry('/assets/images/hero.jpg', 1920, 1080);

      rewriteImgToPicture(img, document, entry);

      const picture = document.querySelector('picture');
      assert.ok(picture, 'picture element should exist');

      const sources = picture.querySelectorAll('source');
      assert.strictEqual(sources.length, 2, 'should have avif and webp sources');

      const fallbackImg = picture.querySelector('img');
      assert.ok(fallbackImg, 'fallback img should exist');
      assert.strictEqual(fallbackImg.getAttribute('alt'), 'Mountain vista');
      assert.ok(fallbackImg.getAttribute('width'));
      assert.ok(fallbackImg.getAttribute('height'));
      assert.strictEqual(fallbackImg.getAttribute('loading'), 'lazy');
    });

    it('should transform multiple imgs independently', () => {
      const html = `<!doctype html><html><body>
        <img src="/assets/images/hero.jpg" alt="Hero">
        <img src="/assets/images/thumb.png" alt="Thumb">
      </body></html>`;
      const dom = new JSDOM(html);
      const document = dom.window.document;

      const manifest = {
        '/assets/images/hero.jpg': generateManifestEntry('/assets/images/hero.jpg', 1920, 1080),
        '/assets/images/thumb.png': generateManifestEntry('/assets/images/thumb.png', 400, 300),
      };

      const imgs = document.querySelectorAll('img');
      for (const img of imgs) {
        const src = img.getAttribute('src');
        rewriteImgToPicture(img, document, manifest[src]);
      }

      const pictures = document.querySelectorAll('picture');
      assert.strictEqual(pictures.length, 2, 'should have 2 picture elements');
    });

    it('should handle mixed skip and transform scenarios', () => {
      const html = `<!doctype html><html><body>
        <img src="/assets/images/hero.jpg" alt="Hero">
        <img src="https://cdn.example.com/external.jpg" alt="External">
        <img src="/assets/icons/logo.svg" alt="Logo">
        <img src="/assets/images/product.png" alt="Product" data-no-optimize>
        <img src="/assets/images/photo.webp" alt="Photo">
      </body></html>`;
      const dom = new JSDOM(html);
      const document = dom.window.document;

      const manifest = {
        '/assets/images/hero.jpg': generateManifestEntry('/assets/images/hero.jpg', 1920, 1080),
        '/assets/images/photo.webp': generateManifestEntry('/assets/images/photo.webp', 1280, 960),
      };

      const imgs = Array.from(document.querySelectorAll('img'));
      for (const img of imgs) {
        const src = img.getAttribute('src');
        const normalizedSrc = src.startsWith('/') ? src : `/${src}`;
        rewriteImgToPicture(img, document, manifest[normalizedSrc]);
      }

      const pictures = document.querySelectorAll('picture');
      assert.strictEqual(pictures.length, 2, 'only hero.jpg and photo.webp should be wrapped in picture');

      // External img should still be a plain img
      const externalImg = document.querySelector('img[src="https://cdn.example.com/external.jpg"]');
      assert.ok(externalImg, 'external img should remain untouched');

      // SVG should still be a plain img
      const svgImg = document.querySelector('img[src="/assets/icons/logo.svg"]');
      assert.ok(svgImg, 'SVG img should remain untouched');

      // data-no-optimize should still be a plain img
      const noOptImg = document.querySelector('img[data-no-optimize]');
      assert.ok(noOptImg, 'data-no-optimize img should remain untouched');
    });
  });
});
