/**
 * @file dynamic-pages-access.test.js
 * @description Pages added by plugins through addDynamicPage honor access
 * levels: a page above the build level is not written, and so is not in
 * the sitemap. Builds a temp site with the CLI (config is read from
 * process.cwd() when the modules load, so builds run as child processes).
 * Also checks the public `cook-ssg/pages` export.
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const COOK = path.join(ROOT, 'bin', 'cook.js');
const PAGES_URL = pathToFileURL(path.join(ROOT, 'scripts', 'pages.js')).href;

const write = async (root, rel, content) => {
  await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await fs.writeFile(path.join(root, rel), content);
};
const build = (cwd, level) => {
  const res = spawnSync(process.execPath, [COOK, 'build'], {
    cwd,
    env: { ...process.env, NODE_ENV: 'production', COOK_ACCESS_LEVEL: level },
    encoding: 'utf-8',
  });
  assert.equal(res.status, 0, `build failed:\n${res.stdout}\n${res.stderr}`);
  return `${res.stdout}\n${res.stderr}`;
};
const exists = (root, rel) => fs.access(path.join(root, rel)).then(() => true, () => false);
const read = (root, rel) => fs.readFile(path.join(root, rel), 'utf-8');

const page = (title, frontMatter = '') => `${frontMatter ? `---\n${frontMatter}---\n` : ''}<!doctype html>
<html lang="en"><head><title>${title}</title></head><body><p>${title} body</p></body></html>`;

// A `before` plugin that adds the pages named in `pages`
const plugin = (pages) => `import { addDynamicPage } from ${JSON.stringify(PAGES_URL)};
export class AddPages {
  constructor({ data }) { this.data = data; }
  init() {
    for (const [path, src] of ${JSON.stringify(pages)}) addDynamicPage(path, src, this.data);
  }
}
`;

const makeSite = async (prefix, { pages, levelOf = '' }) => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await write(tmp, 'config/main.js', `export default {
  collections: { html: true },
  sitemap: { url: 'https://example.com' },
  formats: { feed: false, json: false, markdown: false, llmsTxt: false },
  plugins: { before: ['add-pages'] },
  access: { ${levelOf} },
};
`);
  await write(tmp, 'config/data.js', `export default { siteUrl: 'https://example.com', siteTitle: 'T' };\n`);
  await write(tmp, 'plugins/add-pages.js', plugin(pages));
  await write(tmp, 'src/index.html', page('Home'));
  return tmp;
};

describe('dynamic pages and access levels', () => {
  let secretSite, levelOfSite;

  before(async () => {
    secretSite = await makeSite('cook-dyn-access-', {
      pages: [
        ['/secret/', page('Secret', 'access: friends\n')],
        ['/open/', page('Open')],
      ],
    });
    levelOfSite = await makeSite('cook-dyn-levelof-', {
      pages: [['/collections/x/', page('X')]],
      levelOf: `levelOf: ({ relPath, frontMatter }) => relPath.startsWith('collections/') ? 'private' : (frontMatter?.access ?? 'public')`,
    });
  });

  after(async () => {
    await fs.rm(secretSite, { recursive: true, force: true });
    await fs.rm(levelOfSite, { recursive: true, force: true });
  });

  test('dynamic page above the build level is not written', async () => {
    const out = build(secretSite, 'public');
    assert.equal(await exists(secretSite, 'dist/secret/index.html'), false);
    assert.equal(await exists(secretSite, 'dist/open/index.html'), true);
    const sitemap = await read(secretSite, 'dist/sitemap.xml');
    assert.ok(!sitemap.includes('/secret'), `secret leaked into sitemap:\n${sitemap}`);
    assert.ok(sitemap.includes('/open'));
    assert.match(out, /\[access\] skipped dynamic page \/secret \(friends\)/);
  });

  test('dynamic page at the build level is written', async () => {
    build(secretSite, 'friends');
    assert.equal(await exists(secretSite, 'dist/secret/index.html'), true);
    assert.ok((await read(secretSite, 'dist/sitemap.xml')).includes('/secret'));
  });

  test("levelOf sees the dynamic page's relPath", async () => {
    build(levelOfSite, 'friends');
    assert.equal(await exists(levelOfSite, 'dist/collections/x/index.html'), false);
    build(levelOfSite, 'private');
    assert.equal(await exists(levelOfSite, 'dist/collections/x/index.html'), true);
  });
});

describe('cook-ssg/pages', () => {
  test('exports addDynamicPage', async () => {
    const pkg = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf-8'));
    assert.equal(pkg.exports['./pages'], './scripts/pages.js');
    const { addDynamicPage } = await import(path.join(ROOT, pkg.exports['./pages']));
    assert.equal(typeof addDynamicPage, 'function');
    const store = {};
    addDynamicPage('/a/', '<p>a</p>', store);
    assert.deepEqual(store.dynamicPages, [{ path: '/a/', src: '<p>a</p>' }]);
  });
});
