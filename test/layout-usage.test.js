/**
 * @file layout-usage.test.js
 * @description Tests layoutUsage: which pages and layouts use which layouts.
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { layoutUsage } from '../scripts/layouts.js';

const tmps = [];
async function makeSite(files) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cook-usage-'));
  tmps.push(tmp);
  for (const [rel, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(tmp, rel)), { recursive: true });
    await fs.writeFile(path.join(tmp, rel), content);
  }
  return tmp;
}
after(() => Promise.all(tmps.map(t => fs.rm(t, { recursive: true, force: true }))));

test('layoutUsage maps pages and child layouts', async () => {
  const site = await makeSite({
    'src/a.html': '---\nlayout: post\n---\n<p>a</p>',
    'src/blog/b.md': '---\nlayout: post\n---\nhi',
    'src/c.html': '<html data-template="page"><body>c</body></html>',
    'src/d.html': '<html><body data-template=\'page\'>d</body></html>',
    'src/e.md': 'default layout',
    'src/layouts/base.html': '<html><body>${content}</body></html>',
    'src/layouts/post.html': '<html data-template="base"><body></body></html>',
    'src/layouts/page.html': '<html data-template="base"><body></body></html>',
    'src/layouts/inside.html': '---\nlayout: post\n---\n<p>ignored</p>',
    'src/includes/x.html': '<html data-template="page"></html>',
    'src/components/y.html': '<html data-template="page"></html>',
    'src/demos/one/index.html': '<html data-template="page"></html>',
    'src/demos/list.html': '<html data-template="page"></html>',
    'config/main.js': 'export default { markdown: { layout: "page" } };',
    'config/programs.json': JSON.stringify({ areas: [{ path: 'demos' }], programs: [] }),
  });
  assert.deepEqual(await layoutUsage(site), {
    pages: {
      post: ['src/a.html', 'src/blog/b.md'],
      page: ['src/c.html', 'src/d.html', 'src/demos/list.html', 'src/e.md'],
    },
    layouts: { base: ['page', 'post'] },
  });
});

test('layoutUsage never throws', async () => {
  assert.deepEqual(await layoutUsage('/nonexistent/site'), { pages: {}, layouts: {} });
  const site = await makeSite({ 'src/a.md': '---\n: [bad\n---\nx', 'config/main.js': 'throw new Error("x")' });
  assert.deepEqual(await layoutUsage(site), { pages: {}, layouts: {} });
});
