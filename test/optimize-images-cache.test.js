/**
 * @file optimize-images-cache.test.js
 * @description Tests the REAL optimize-images generate phase for:
 * 1. Derivative cascade — rescans picked up generated -320w.webp outputs
 *    as new source images, producing foo-320w-320w.avif chains.
 * 2. Dead cache — derivatives lived only in dist/, which is wiped every
 *    build, so the .cache/images "instant rebuild" cache never hit.
 * 3. EXIF orientation — portrait phone JPEGs were resized sideways with
 *    swapped width/height attributes.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import { optimizeImagesGenerate } from '../scripts/plugins/optimize-images.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureAbs = path.join(__dirname, 'fixtures-images');
// Plugin paths are cwd-relative
const fixtureRel = 'test/fixtures-images';
const DIST = `${fixtureRel}/dist`;
const CACHE = `${fixtureRel}/cache`;

const IMAGES_CONFIG = { cache: CACHE, widths: [320], formats: ['webp'] };

async function makeSourceImage(name = 'photo.jpg', opts = {}) {
  await fs.mkdir(path.join(fixtureAbs, 'dist'), { recursive: true });
  let img = sharp({
    create: { width: 1000, height: 500, channels: 3, background: { r: 200, g: 100, b: 50 } },
  }).jpeg();
  if (opts.orientation) img = img.withMetadata({ orientation: opts.orientation });
  await img.toFile(path.join(fixtureAbs, 'dist', name));
}

async function listDist() {
  return fs.readdir(path.join(fixtureAbs, 'dist'));
}

beforeEach(async () => {
  await fs.rm(fixtureAbs, { recursive: true, force: true });
});

after(async () => {
  await fs.rm(fixtureAbs, { recursive: true, force: true });
});

describe('optimize-images: generate phase', () => {

  test('second run does not derive derivatives (no -320w-320w files)', async () => {
    await makeSourceImage();

    await optimizeImagesGenerate({ store: {}, distPath: DIST, images: IMAGES_CONFIG });
    await optimizeImagesGenerate({ store: {}, distPath: DIST, images: IMAGES_CONFIG });

    const files = await listDist();
    const cascades = files.filter(f => /-\d+w-\d+w\./.test(f));
    assert.deepEqual(cascades, [], `derivative cascade detected: ${files.join(', ')}`);
  });

  test('cache holds derivative files and restores them after a dist wipe', async () => {
    await makeSourceImage();
    await optimizeImagesGenerate({ store: {}, distPath: DIST, images: IMAGES_CONFIG });

    // The cache must contain actual derivative images, not just manifest.json
    const cacheFiles = [];
    for (const entry of await fs.readdir(path.join(fixtureAbs, 'cache'), { recursive: true })) {
      if (/\.(webp|avif|jpe?g|png)$/i.test(entry)) cacheFiles.push(entry);
    }
    assert.ok(cacheFiles.length > 0, 'cache dir contains no derivative files — cache is dead weight');

    // Simulate a fresh production build: dist wiped, source copied back
    await fs.rm(path.join(fixtureAbs, 'dist'), { recursive: true, force: true });
    await makeSourceImage();

    const store = {};
    await optimizeImagesGenerate({ store, distPath: DIST, images: IMAGES_CONFIG });

    const files = await listDist();
    assert.ok(files.some(f => f.includes('-320w.webp')), `derivatives not restored: ${files.join(', ')}`);
  });

  test('EXIF-rotated image is auto-rotated with visual dimensions', async () => {
    // 1000x500 pixels with orientation 6 (90° CW) => displays as 500x1000
    await makeSourceImage('portrait.jpg', { orientation: 6 });

    const store = {};
    await optimizeImagesGenerate({ store, distPath: DIST, images: IMAGES_CONFIG });

    const entry = store.imageManifest['/portrait.jpg'];
    assert.ok(entry, 'manifest entry missing');
    assert.equal(entry.width, 500, 'manifest width should be the VISUAL width');
    assert.equal(entry.height, 1000, 'manifest height should be the VISUAL height');

    // The generated derivative must itself be portrait
    const derivPath = path.join(fixtureAbs, 'dist', 'portrait-320w.webp');
    assert.ok(existsSync(derivPath), 'derivative missing');
    const meta = await sharp(derivPath).metadata();
    assert.ok(meta.height > meta.width, `derivative is sideways: ${meta.width}x${meta.height}`);
  });
});
