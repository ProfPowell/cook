/**
 * @file file-parts.test.js
 * @description Tests real dotted-filename handling across getFileParts,
 * updatePage (addDirectory), and create-dir-from-file.
 *
 * Guards against first-dot parsing: lib.min.js got ext 'min' (skipping
 * or crashing minification), node.js-guide.html was silently skipped,
 * dist/v1.2/page.html aborted the whole build, and addDirectory's
 * substring(4, -1) created junk directories from the first 4 path chars.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Util, { getFileParts, updatePage } from '../scripts/utils/util/util.js';
import createDirFromFile from '../scripts/plugins/create-dir-from-file.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Relative fixture path (updatePage and the plugin work with relative paths)
const fixtureRel = 'test/fixtures-dirs';
const fixtureAbs = path.join(__dirname, 'fixtures-dirs');

before(async () => {
  await fs.rm(fixtureAbs, { recursive: true, force: true });
  await fs.mkdir(fixtureAbs, { recursive: true });
});

after(async () => {
  await fs.rm(fixtureAbs, { recursive: true, force: true });
});

describe('getFileParts: dotted filenames', () => {

  test('lib.min.js parses ext js', () => {
    const parts = getFileParts('dist/assets/js/lib.min.js');
    assert.equal(parts.ext, 'js');
    assert.equal(parts.name, 'lib.min');
  });

  test('report.2024.html parses ext html', () => {
    const parts = getFileParts('dist/blog/report.2024.html');
    assert.equal(parts.ext, 'html');
  });

  test('index.html keeps name index and nameIfIndex parent', () => {
    const parts = getFileParts('dist/blog/index.html');
    assert.equal(parts.name, 'index');
    assert.equal(parts.nameIfIndex, 'blog');
  });
});

describe('updatePage: directory creation', () => {

  test('creates nested parent directories for index pages', async () => {
    const file = {
      ext: 'html',
      path: `${fixtureRel}/pub/blog/index.html`,
      src: '<!DOCTYPE html><html><body>x</body></html>',
    };
    await updatePage(file);
    assert.ok(existsSync(path.join(fixtureAbs, 'pub/blog/index.html')));
  });

  test('does not create a junk directory named after the page', async () => {
    const file = {
      ext: 'html',
      path: `${fixtureRel}/about.html`,
      src: '<!DOCTYPE html><html><body>x</body></html>',
    };
    await updatePage(file);
    assert.ok(existsSync(path.join(fixtureAbs, 'about.html')));
    // The old first-dot split mkdirp'd a sibling directory `about/`
    assert.ok(!existsSync(path.join(fixtureAbs, 'about')), 'no junk `about/` directory');
  });
});

describe('create-dir-from-file: dotted paths', () => {

  test('node.js-guide.html converts to node.js-guide/index.html', async () => {
    const pageRel = `${fixtureRel}/node.js-guide.html`;
    await fs.writeFile(path.join(fixtureAbs, 'node.js-guide.html'), '<html><body>guide</body></html>');

    const files = [pageRel];
    await createDirFromFile({ files, allowType: ['.html'] });

    assert.ok(
      existsSync(path.join(fixtureAbs, 'node.js-guide/index.html')),
      'dotted-name page should convert to a directory'
    );
    assert.equal(files[0], `${fixtureRel}/node.js-guide/index.html`);
  });

  test('page inside a dotted directory (v1.2) converts without touching the parent', async () => {
    await fs.mkdir(path.join(fixtureAbs, 'v1.2'), { recursive: true });
    await fs.writeFile(path.join(fixtureAbs, 'v1.2/page.html'), '<html><body>v</body></html>');

    const files = [`${fixtureRel}/v1.2/page.html`];
    await createDirFromFile({ files, allowType: ['.html'] });

    assert.ok(existsSync(path.join(fixtureAbs, 'v1.2/page/index.html')));
    assert.ok(!existsSync(path.join(fixtureAbs, 'v1.html')), 'no stray v1.html');
  });
});
