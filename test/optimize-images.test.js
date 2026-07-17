/**
 * @file optimize-images.test.js
 * @description Tests the REAL image optimization pipeline
 * (scripts/plugins/optimize-images.js):
 * - Rewrite phase (optimizeImagesRewrite) with a seeded manifest:
 *   skip logic, <picture> generation, end-to-end markup
 * - Generate phase (optimizeImagesGenerate) with real sharp fixtures:
 *   width filtering (no-upscale) and derivative naming
 */

import { describe, it, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import sharp from 'sharp';

import { optimizeImagesGenerate, optimizeImagesRewrite } from '../scripts/plugins/optimize-images.js';

// ---------------------------------------------------------------------------
// Rewrite-phase helpers (manifest is seeded fixture data — the shape the
// generate phase stores on store.imageManifest)
// ---------------------------------------------------------------------------

const WIDTHS = [320, 640, 960, 1280, 1920];

/** Build a manifest entry fixture for a source image. */
function fixtureEntry(src, srcWidth, srcHeight) {
  const parsed = path.parse(src);
  const ext = parsed.ext.toLowerCase();
  const origFormat = (ext === '.jpg' || ext === '.jpeg') ? 'jpeg' : ext.slice(1);
  const fitting = WIDTHS.filter(w => w <= srcWidth);
  const widths = fitting.length ? fitting : [srcWidth];
  const formats = [...new Set(['avif', 'webp', origFormat])];

  const derivatives = [];
  for (const format of formats) {
    for (const width of widths) {
      const outExt = format === 'jpeg' ? 'jpg' : format;
      derivatives.push({
        path: `${parsed.dir}/${parsed.name}-${width}w.${outExt}`,
        format,
        width,
        height: Math.round((width / srcWidth) * srcHeight),
      });
    }
  }
  return { width: srcWidth, height: srcHeight, derivatives };
}

const PAGE = (body) => `<!DOCTYPE html>
<html lang="en">
<head><title>t</title></head>
<body>${body}</body>
</html>`;

async function rewrite(body, manifest) {
  const file = { ext: 'html', path: 'dist/index.html', name: 'index', src: PAGE(body) };
  await optimizeImagesRewrite({ file, store: { imageManifest: manifest }, allowType: ['.html'] });
  return file;
}

function doc(file) {
  return parseHTML(file.src).document;
}

const HERO_ENTRY = () => ({ '/assets/images/hero.jpg': fixtureEntry('/assets/images/hero.jpg', 1920, 1080) });

// ============================================================================
// Tests
// ============================================================================

describe('Image Optimization', () => {

  // --------------------------------------------------------------------------
  // Skip Logic (rewrite phase)
  // --------------------------------------------------------------------------

  describe('Skip Logic', () => {

    it('should skip images with data-no-optimize attribute', async () => {
      const manifest = { '/assets/logo.jpg': fixtureEntry('/assets/logo.jpg', 1920, 1080) };
      const file = await rewrite('<img src="/assets/logo.jpg" data-no-optimize>', manifest);
      assert.ok(!doc(file).querySelector('picture'), 'should not be wrapped in picture');
      assert.ok(!!doc(file).querySelector('img[data-no-optimize]'));
    });

    it('should skip external URLs (http)', async () => {
      const file = await rewrite('<img src="http://example.com/photo.jpg">', HERO_ENTRY());
      assert.ok(!doc(file).querySelector('picture'));
      assert.strictEqual(doc(file).querySelector('img').getAttribute('src'), 'http://example.com/photo.jpg');
    });

    it('should skip external URLs (https)', async () => {
      const file = await rewrite('<img src="https://cdn.example.com/photo.jpg">', HERO_ENTRY());
      assert.ok(!doc(file).querySelector('picture'));
    });

    it('should skip protocol-relative URLs', async () => {
      const file = await rewrite('<img src="//cdn.example.com/photo.jpg">', HERO_ENTRY());
      assert.ok(!doc(file).querySelector('picture'));
    });

    it('should skip data URIs', async () => {
      const file = await rewrite('<img src="data:image/png;base64,iVBOR...">', HERO_ENTRY());
      assert.ok(!doc(file).querySelector('picture'));
    });

    it('should skip SVG files', async () => {
      const manifest = { '/assets/icons/logo.svg': fixtureEntry('/assets/icons/logo.svg', 640, 640) };
      const file = await rewrite('<img src="/assets/icons/logo.svg">', manifest);
      assert.ok(!doc(file).querySelector('picture'));
    });

    it('should skip GIF files', async () => {
      const manifest = { '/assets/animations/loading.gif': fixtureEntry('/assets/animations/loading.gif', 640, 640) };
      const file = await rewrite('<img src="/assets/animations/loading.gif">', manifest);
      assert.ok(!doc(file).querySelector('picture'));
    });

    it('should skip images already inside <picture>', async () => {
      const file = await rewrite('<picture><img src="/assets/images/hero.jpg"></picture>', HERO_ENTRY());
      const d = doc(file);
      assert.strictEqual(d.querySelectorAll('picture').length, 1, 'no nested picture created');
      assert.strictEqual(d.querySelector('img').getAttribute('src'), '/assets/images/hero.jpg');
      assert.ok(!d.querySelector('source'), 'no sources injected');
    });

    it('should not skip normal local images', async () => {
      const file = await rewrite('<img src="/assets/images/hero.jpg" alt="Hero">', HERO_ENTRY());
      assert.ok(!!doc(file).querySelector('picture'), 'should be wrapped in picture');
    });

    it('should not skip images without leading slash', async () => {
      const manifest = { '/assets/images/hero.png': fixtureEntry('/assets/images/hero.png', 640, 480) };
      const file = await rewrite('<img src="assets/images/hero.png" alt="Hero">', manifest);
      assert.ok(!!doc(file).querySelector('picture'), 'src normalized to manifest key');
    });

    it('should leave images without a manifest entry untouched', async () => {
      const file = await rewrite('<img src="/assets/images/unknown.jpg" alt="U">', HERO_ENTRY());
      assert.ok(!doc(file).querySelector('picture'));
    });
  });

  // --------------------------------------------------------------------------
  // Picture Generation (rewrite phase)
  // --------------------------------------------------------------------------

  describe('Picture Generation', () => {

    it('should create <source> elements for avif and webp', async () => {
      const file = await rewrite('<img src="/assets/images/hero.jpg" alt="Hero">', HERO_ENTRY());
      const d = doc(file);
      assert.ok(!!d.querySelector('picture source[type="image/avif"]'));
      assert.ok(!!d.querySelector('picture source[type="image/webp"]'));
    });

    it('should generate correct srcset format', async () => {
      const file = await rewrite('<img src="/assets/images/hero.jpg" alt="Hero">', HERO_ENTRY());
      const srcset = doc(file).querySelector('source[type="image/avif"]').getAttribute('srcset');
      for (const w of WIDTHS) {
        assert.ok(srcset.includes(`/assets/images/hero-${w}w.avif ${w}w`), `missing ${w}w in: ${srcset}`);
      }
    });

    it('should preserve original attributes (alt, class, id, style, data-*)', async () => {
      const file = await rewrite(
        '<img src="/assets/images/hero.jpg" alt="Mountain vista" class="hero-img" id="main-hero" style="max-width:100%" data-section="top">',
        HERO_ENTRY()
      );
      const img = doc(file).querySelector('picture img');
      assert.ok(!!img);
      assert.strictEqual(img.getAttribute('alt'), 'Mountain vista');
      assert.strictEqual(img.getAttribute('class'), 'hero-img');
      assert.strictEqual(img.getAttribute('id'), 'main-hero');
      assert.strictEqual(img.getAttribute('style'), 'max-width:100%');
      assert.strictEqual(img.getAttribute('data-section'), 'top');
    });

    it('should inject width and height from manifest', async () => {
      const file = await rewrite('<img src="/assets/images/hero.jpg" alt="Hero">', HERO_ENTRY());
      const img = doc(file).querySelector('picture img');
      assert.strictEqual(img.getAttribute('width'), '1920');
      assert.strictEqual(img.getAttribute('height'), '1080');
    });

    it('should use an original-format derivative near 960px as fallback src', async () => {
      const file = await rewrite('<img src="/assets/images/hero.jpg" alt="Hero">', HERO_ENTRY());
      const img = doc(file).querySelector('picture img');
      assert.strictEqual(img.getAttribute('src'), '/assets/images/hero-960w.jpg');
      assert.ok(img.getAttribute('srcset').includes('/assets/images/hero-320w.jpg 320w'));
    });

    it('should inject loading="lazy" by default', async () => {
      const file = await rewrite('<img src="/assets/images/hero.jpg" alt="Hero">', HERO_ENTRY());
      assert.strictEqual(doc(file).querySelector('picture img').getAttribute('loading'), 'lazy');
    });

    it('should preserve loading="eager" when author set it', async () => {
      const file = await rewrite('<img src="/assets/images/hero.jpg" alt="Hero" loading="eager">', HERO_ENTRY());
      const img = doc(file).querySelector('picture img');
      assert.strictEqual(img.getAttribute('loading'), 'eager');
      assert.ok(!file.src.includes('loading="lazy"'));
    });

    it('should use author sizes attribute when provided', async () => {
      const file = await rewrite('<img src="/assets/images/hero.jpg" alt="Hero" sizes="50vw">', HERO_ENTRY());
      const sizeMatches = file.src.match(/sizes="50vw"/g) || [];
      assert.ok(sizeMatches.length >= 2, 'sizes should appear on sources and img');
    });

    it('should use default sizes when author does not provide one', async () => {
      const file = await rewrite('<img src="/assets/images/hero.jpg" alt="Hero">', HERO_ENTRY());
      assert.ok(file.src.includes('sizes="(min-width: 60rem) 960px, 100vw"'));
    });
  });

  // --------------------------------------------------------------------------
  // End-to-End Markup (rewrite phase)
  // --------------------------------------------------------------------------

  describe('End-to-End Markup', () => {

    it('should transform a single img to picture', async () => {
      const file = await rewrite('<img src="/assets/images/hero.jpg" alt="Mountain vista">', HERO_ENTRY());
      const d = doc(file);

      const picture = d.querySelector('picture');
      assert.ok(!!picture, 'picture element should exist');
      assert.strictEqual(picture.querySelectorAll('source').length, 2, 'should have avif and webp sources');

      const fallbackImg = picture.querySelector('img');
      assert.ok(!!fallbackImg, 'fallback img should exist');
      assert.strictEqual(fallbackImg.getAttribute('alt'), 'Mountain vista');
      assert.ok(fallbackImg.getAttribute('width'));
      assert.ok(fallbackImg.getAttribute('height'));
      assert.strictEqual(fallbackImg.getAttribute('loading'), 'lazy');
    });

    it('should transform multiple imgs independently', async () => {
      const manifest = {
        '/assets/images/hero.jpg': fixtureEntry('/assets/images/hero.jpg', 1920, 1080),
        '/assets/images/thumb.png': fixtureEntry('/assets/images/thumb.png', 400, 300),
      };
      const file = await rewrite(
        `<img src="/assets/images/hero.jpg" alt="Hero">
        <img src="/assets/images/thumb.png" alt="Thumb">`,
        manifest
      );
      assert.strictEqual(doc(file).querySelectorAll('picture').length, 2);
    });

    it('should handle mixed skip and transform scenarios', async () => {
      const manifest = {
        '/assets/images/hero.jpg': fixtureEntry('/assets/images/hero.jpg', 1920, 1080),
        '/assets/images/photo.webp': fixtureEntry('/assets/images/photo.webp', 1280, 960),
        '/assets/images/product.png': fixtureEntry('/assets/images/product.png', 640, 640),
      };
      const file = await rewrite(
        `<img src="/assets/images/hero.jpg" alt="Hero">
        <img src="https://cdn.example.com/external.jpg" alt="External">
        <img src="/assets/icons/logo.svg" alt="Logo">
        <img src="/assets/images/product.png" alt="Product" data-no-optimize>
        <img src="/assets/images/photo.webp" alt="Photo">`,
        manifest
      );

      const d = doc(file);
      assert.strictEqual(d.querySelectorAll('picture').length, 2,
        'only hero.jpg and photo.webp should be wrapped in picture');
      assert.ok(!!d.querySelector('img[src="https://cdn.example.com/external.jpg"]'), 'external img untouched');
      assert.ok(!!d.querySelector('img[src="/assets/icons/logo.svg"]'), 'SVG img untouched');
      assert.ok(!!d.querySelector('img[data-no-optimize]'), 'data-no-optimize img untouched');
    });
  });

  // --------------------------------------------------------------------------
  // Generate phase: width filtering + naming (real sharp fixtures)
  // --------------------------------------------------------------------------

  describe('Generate phase (width filtering and naming)', () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const fixtureAbs = path.join(__dirname, 'fixtures-images-manifest');
    // Plugin paths are cwd-relative
    const fixtureRel = 'test/fixtures-images-manifest';
    const DIST = `${fixtureRel}/dist`;
    const CACHE = `${fixtureRel}/cache`;

    async function makeImage(relName, width, height, format = 'jpeg') {
      const abs = path.join(fixtureAbs, 'dist', relName);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      let img = sharp({
        create: { width, height, channels: 3, background: { r: 180, g: 90, b: 40 } },
      });
      img = format === 'png' ? img.png() : img.jpeg();
      await img.toFile(abs);
    }

    beforeEach(async () => {
      await fs.rm(fixtureAbs, { recursive: true, force: true });
    });

    after(async () => {
      await fs.rm(fixtureAbs, { recursive: true, force: true });
    });

    it('should not generate widths larger than the source image', async () => {
      await makeImage('small.jpg', 800, 600);
      const store = {};
      await optimizeImagesGenerate({
        store, distPath: DIST,
        images: { cache: CACHE, widths: [320, 640, 960, 1280, 1920], formats: ['webp'] },
      });

      const entry = store.imageManifest['/small.jpg'];
      assert.ok(entry, 'manifest entry missing');
      const widths = entry.derivatives.map(d => d.width);
      assert.ok(widths.every(w => w <= 800), `no derivative should exceed source width: ${widths}`);
      assert.ok(widths.includes(320));
      assert.ok(widths.includes(640));
      assert.ok(!widths.includes(960));
    });

    it('should do format-only conversion for very small images', async () => {
      await makeImage('icon.png', 200, 200, 'png');
      const store = {};
      await optimizeImagesGenerate({
        store, distPath: DIST,
        images: { cache: CACHE, widths: [320, 640, 960, 1280, 1920], formats: ['avif', 'webp'] },
      });

      const entry = store.imageManifest['/icon.png'];
      assert.ok(entry, 'manifest entry missing');
      const widths = [...new Set(entry.derivatives.map(d => d.width))];
      assert.deepStrictEqual(widths, [200], 'all derivatives at source width');
      const formats = [...new Set(entry.derivatives.map(d => d.format))];
      assert.ok(formats.includes('avif'));
      assert.ok(formats.includes('webp'));
      assert.ok(formats.includes('png'));
    });

    it('should generate derivative paths with {name}-{width}w.{format}', async () => {
      await makeImage('assets/images/hero.jpg', 640, 480);
      const store = {};
      await optimizeImagesGenerate({
        store, distPath: DIST,
        images: { cache: CACHE, widths: [320, 640], formats: ['avif'] },
      });

      const entry = store.imageManifest['/assets/images/hero.jpg'];
      assert.ok(entry, 'manifest entry missing');
      const avifPaths = entry.derivatives.filter(d => d.format === 'avif').map(d => d.path);
      assert.ok(avifPaths.includes('/assets/images/hero-320w.avif'), `got: ${avifPaths}`);
      assert.ok(avifPaths.includes('/assets/images/hero-640w.avif'), `got: ${avifPaths}`);
      // Original-format derivatives use the .jpg extension
      const jpegPaths = entry.derivatives.filter(d => d.format === 'jpeg').map(d => d.path);
      assert.ok(jpegPaths.includes('/assets/images/hero-320w.jpg'), `got: ${jpegPaths}`);
    });
  });
});
