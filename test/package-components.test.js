/**
 * @file package-components.test.js
 * @description End to end: a temp Cook project depending on an npm web
 * component package (with a custom-elements.json) gets the package's built
 * files copied into dist and a module script on pages that use its tags.
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOK = path.resolve(__dirname, '..', 'bin', 'cook.js');

let tmp;
const write = async (rel, content) => {
  await fs.mkdir(path.dirname(path.join(tmp, rel)), { recursive: true });
  await fs.writeFile(path.join(tmp, rel), content);
};
const build = () => execFileSync(process.execPath, [COOK, 'build'], {
  cwd: tmp,
  env: { ...process.env, NODE_ENV: 'production' },
  stdio: 'pipe',
});
const read = (rel) => fs.readFile(path.join(tmp, rel), 'utf-8');
const exists = (rel) => fs.access(path.join(tmp, rel)).then(() => true, () => false);
const page = (body) => `<!doctype html>\n<html lang="en"><head><title>T</title></head>\n<body>${body}</body></html>\n`;

before(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cook-pkgcomp-'));
  await write('config/main.js', `export default {};\n`);
  await write('package.json', JSON.stringify({
    name: 'site', version: '1.0.0',
    dependencies: { 'x-widgets': '1.0.0', 'no-manifest': '1.0.0', 'vanilla-breeze': '1.0.0' },
  }));
  await write('node_modules/x-widgets/package.json', JSON.stringify({
    name: 'x-widgets', version: '1.0.0', exports: { '.': { import: './dist/x.js' } },
  }));
  await write('node_modules/x-widgets/custom-elements.json', JSON.stringify({
    schemaVersion: '1.0.0',
    modules: [{ declarations: [{ tagName: 'x-one' }, { tagName: 'x-two' }] }],
  }));
  await write('node_modules/x-widgets/dist/x.js', `import './chunk-a.js';\n`);
  await write('node_modules/x-widgets/dist/chunk-a.js', `export const a = 1;\n`);
  await write('node_modules/no-manifest/package.json', JSON.stringify({ name: 'no-manifest', main: 'index.js' }));
  await write('node_modules/no-manifest/index.js', `export {};\n`);
  await write('node_modules/vanilla-breeze/package.json', JSON.stringify({ name: 'vanilla-breeze', main: 'vb.js' }));
  await write('node_modules/vanilla-breeze/vb.js', `export {};\n`);
  await write('node_modules/vanilla-breeze/custom-elements.json', JSON.stringify({
    modules: [{ declarations: [{ tagName: 'x-vb' }] }],
  }));
  await write('src/uses.html', page('<x-one></x-one><x-two></x-two><x-one></x-one>'));
  await write('src/plain.html', page('<p>plain</p>'));
  await write('src/vb.html', page('<x-vb></x-vb>'));
  build();
});

after(() => fs.rm(tmp, { recursive: true, force: true }));

describe('package-components', () => {
  test('copies the package dist, chunks included', async () => {
    assert.ok(await exists('dist/assets/components/x-widgets/x.js'));
    assert.ok(await exists('dist/assets/components/x-widgets/chunk-a.js'));
  });
  test('a page using two tags of one package gets one script', async () => {
    const html = await read('dist/uses/index.html');
    // The HTML minifier may reorder attributes, so accept either order
    const tags = html.match(/<script (?:type="module" src="\/assets\/components\/x-widgets\/x\.js"|src="\/assets\/components\/x-widgets\/x\.js" type="module")><\/script>/g);
    assert.equal(tags.length, 1);
  });
  test('a page with no package tags gets no component script', async () => {
    assert.doesNotMatch(await read('dist/plain/index.html'), /assets\/components/);
  });
  test('excluded and manifest-less dependencies are ignored', async () => {
    assert.ok(!(await exists('dist/assets/components/vanilla-breeze')));
    assert.ok(!(await exists('dist/assets/components/no-manifest')));
    assert.doesNotMatch(await read('dist/vb/index.html'), /assets\/components/);
  });
  test('enabled: false does nothing', async () => {
    await write('config/main.js', `export default { packageComponents: { enabled: false } };\n`);
    await fs.rm(path.join(tmp, 'dist'), { recursive: true, force: true });
    build();
    assert.ok(!(await exists('dist/assets/components')));
    assert.doesNotMatch(await read('dist/uses/index.html'), /assets\/components/);
  });
});

describe('package-components with siteRoot', () => {
  const scriptTag = (url) => new RegExp(
    `<script (?:type="module" src="${url.replace(/[.\/]/g, '\\$&')}"|src="${url.replace(/[.\/]/g, '\\$&')}" type="module")></script>`
  );
  let rootTmp;
  const rwrite = async (rel, content) => {
    await fs.mkdir(path.dirname(path.join(rootTmp, rel)), { recursive: true });
    await fs.writeFile(path.join(rootTmp, rel), content);
  };
  const rexists = (rel) => fs.access(path.join(rootTmp, rel)).then(() => true, () => false);

  before(async () => {
    rootTmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cook-pkgcomp-root-'));
    await rwrite('config/main.js', `export default { siteRoot: 'pages' };\n`);
    await rwrite('package.json', JSON.stringify({
      name: 'site', version: '1.0.0',
      dependencies: { 'x-widgets': '1.0.0', '@scope/widgets': '1.0.0' },
    }));
    await rwrite('node_modules/x-widgets/package.json', JSON.stringify({
      name: 'x-widgets', version: '1.0.0', exports: { '.': { import: './dist/x.js' } },
    }));
    await rwrite('node_modules/x-widgets/custom-elements.json', JSON.stringify({
      modules: [{ declarations: [{ tagName: 'x-one' }] }],
    }));
    await rwrite('node_modules/x-widgets/dist/x.js', `export {};\n`);
    await rwrite('node_modules/@scope/widgets/package.json', JSON.stringify({
      name: '@scope/widgets', version: '1.0.0', module: './lib/entry.js',
    }));
    await rwrite('node_modules/@scope/widgets/custom-elements.json', JSON.stringify({
      modules: [{ declarations: [{ tagName: 'scoped-one' }] }],
    }));
    await rwrite('node_modules/@scope/widgets/lib/entry.js', `export {};\n`);
    await rwrite('src/pages/uses.html', page('<x-one></x-one><scoped-one></scoped-one>'));
    execFileSync(process.execPath, [COOK, 'build'], {
      cwd: rootTmp, env: { ...process.env, NODE_ENV: 'production' }, stdio: 'pipe',
    });
  });

  after(() => fs.rm(rootTmp, { recursive: true, force: true }));

  test('package files are copied under the served root', async () => {
    assert.ok(await rexists('dist/pages/assets/components/x-widgets/x.js'));
    assert.ok(!(await rexists('dist/assets/components')));
  });
  test('the served page loads the package from /assets/components/...', async () => {
    const html = await fs.readFile(path.join(rootTmp, 'dist/pages/uses/index.html'), 'utf-8');
    assert.match(html, scriptTag('/assets/components/x-widgets/x.js'));
  });
  test('scoped packages keep their @scope directory', async () => {
    assert.ok(await rexists('dist/pages/assets/components/@scope/widgets/entry.js'));
    const html = await fs.readFile(path.join(rootTmp, 'dist/pages/uses/index.html'), 'utf-8');
    assert.match(html, scriptTag('/assets/components/@scope/widgets/entry.js'));
  });
});
