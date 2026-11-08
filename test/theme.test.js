import { test } from 'node:test';
import assert from 'node:assert';
import { normalizeThemeSetting, pageThemePlan } from '../scripts/plugins/theme.js';

const S = { name: 'swiss', mode: 'auto', adjust: 'vp-site', modes: { 'retro-mine': 'light' },
  files: { swiss: '/v/themes/swiss.css', '8bit': '/v/themes/8bit.css', 'vp-site': '/assets/themes/vp-site.css', 'retro-mine': '/assets/themes/retro-mine.css' } };

test('site theme: ids, no forced mode, links for name then adjust', () => {
  const p = pageThemePlan(S, {});
  assert.deepEqual(p.html, { ids: ['swiss', 'vp-site'], mode: null });
  assert.equal(p.scoped, null);
  assert.deepEqual(p.links.map(l => l.id), ['swiss', 'vp-site']);
});
test('null setting gives null plan', () => {
  assert.equal(pageThemePlan(null, {}), null);
});
test('page scope: the page theme replaces the site theme and drops the adjustments', () => {
  const p = pageThemePlan(S, { theme: '8bit' });
  assert.deepEqual(p.html.ids, ['8bit']);
  assert.deepEqual(p.links.map(l => l.id), ['8bit']);
});
test('page scope keeps a forced site scheme', () => {
  assert.equal(pageThemePlan({ ...S, mode: 'dark' }, { theme: '8bit' }).html.mode, 'dark');
});
test('article scope: site on html, page theme scoped, its one scheme forced', () => {
  const p = pageThemePlan(S, { theme: 'retro-mine', themeScope: 'article' });
  assert.deepEqual(p.html.ids, ['swiss', 'vp-site']);
  assert.deepEqual(p.scoped, { ids: ['retro-mine'], mode: 'light' });
  assert.deepEqual(p.links.map(l => l.id), ['swiss', 'vp-site', 'retro-mine']);
});
test('a built-in theme (absent from files) gets no link', () => {
  assert.deepEqual(pageThemePlan({ ...S, name: 'classic', adjust: null }, {}).links, []);
});
test('unsafe front matter is ignored with a warning naming the page', () => {
  const p = pageThemePlan(S, { theme: 'Retro!' }, 'src/posts/a.html');
  assert.deepEqual(p.html.ids, ['swiss', 'vp-site']);
  assert.match(p.warnings[0], /src\/posts\/a\.html.*Retro!/);
  assert.equal(pageThemePlan(S, { theme: '8bit', themeScope: 'sidebar' }).scoped, null); // bad scope -> page
});
test('default stays the first id (controller ruling)', () => {
  assert.deepEqual(pageThemePlan({ ...S, name: 'default', adjust: null }, {}).html.ids, ['default']);
  assert.deepEqual(pageThemePlan({ ...S, name: 'default' }, {}).html.ids, ['default', 'vp-site']);
});
test('normalizeThemeSetting rejects an unsafe name and filters files/modes', () => {
  assert.equal(normalizeThemeSetting({ name: 'Bad Name' }).setting, null);
  const { setting } = normalizeThemeSetting({ name: 'swiss', files: { ok: '/a.css', 'B!': '/b.css', js: 'javascript:x' }, modes: { a: 'dim' } });
  assert.deepEqual(setting.files, { ok: '/a.css' });
  assert.deepEqual(setting.modes, {});
  assert.equal(setting.mode, 'auto');
});

test('prototype-named ids do not resolve to Object members', () => {
  for (const id of ['constructor']) {
    const p = pageThemePlan(S, { theme: id });
    assert.deepEqual(p.links, []);
    assert.equal(p.html.mode, null);
    const hand = pageThemePlan({ name: 'swiss', mode: 'auto', adjust: null, files: {}, modes: {} }, { theme: id });
    assert.deepEqual(hand.links, []);
  }
  const { setting } = normalizeThemeSetting({ name: 'swiss', files: { constructor: '/c.css' } });
  assert.equal(pageThemePlan(setting, { theme: 'constructor' }).links[0].href, '/c.css');
});
test('non-string and hostile theme values are ignored', () => {
  for (const v of [5, {}, ['a'], true, 'x" onload="y']) {
    const p = pageThemePlan(S, { theme: v }, 'a.html');
    assert.deepEqual(p.html.ids, ['swiss', 'vp-site']);
    assert.equal(p.warnings.length, 1);
  }
});
test('bad theme and bad scope give one combined warning with the [theme] prefix', () => {
  const p = pageThemePlan(S, { theme: 'Retro!', themeScope: 'sidebar' }, 'src/a.html');
  assert.equal(p.warnings.length, 1);
  assert.match(p.warnings[0], /^\[theme\] src\/a\.html.*Retro!.*sidebar/);
});
test('article scope with the same theme as the site does not duplicate links', () => {
  const p = pageThemePlan(S, { theme: 'swiss', themeScope: 'article' });
  assert.deepEqual(p.scoped.ids, ['swiss']);
  assert.deepEqual(p.links.map(l => l.id), ['swiss', 'vp-site']);
});
test('unsafe adjust, bad urls and bad modes are dropped with [theme] warnings', () => {
  const { setting, warnings } = normalizeThemeSetting({ name: 'swiss', adjust: 'Bad!',
    files: { a: '//evil.com/x.css', b: '/x y.css', c: '/a"b.css', d: 'https://ok.com/a.css', e: '/<x>.css' }, modes: { m: 'dim' } });
  assert.equal(setting.adjust, null);
  assert.deepEqual(Object.keys(setting.files), ['d']);
  assert.equal(warnings.length, 6);
  assert.ok(warnings.every(w => w.startsWith('[theme] ')));
});
test('camelCase prototype names fail the safe-id check and are ignored', () => {
  for (const id of ['toString', 'valueOf', '__proto__']) {
    const p = pageThemePlan(S, { theme: id });
    assert.deepEqual(p.html.ids, ['swiss', 'vp-site']);
    assert.equal(p.warnings.length, 1);
  }
});

test('config.js getTheme(): theme.json, main.js wins, bad JSON gives undefined', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const cfg = new URL('../scripts/utils/config/config.js', import.meta.url).href;
  const run = (setup) => {
    const dir = mkdtempSync(join(tmpdir(), 'cook-theme-'));
    mkdirSync(join(dir, 'config'));
    setup(dir);
    const out = execFileSync(process.execPath, ['--input-type=module', '-e',
      `const m = await import(${JSON.stringify(cfg)}); console.log(JSON.stringify(m.getTheme() ?? null));`],
    { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return JSON.parse(out.trim().split('\n').pop());
  };
  assert.deepEqual(run(d => writeFileSync(join(d, 'config/theme.json'), '{"name":"swiss"}')), { name: 'swiss' });
  assert.equal(run(d => writeFileSync(join(d, 'config/theme.json'), '{bad')), null);
  assert.deepEqual(run(d => {
    writeFileSync(join(d, 'config/theme.json'), '{"name":"swiss"}');
    writeFileSync(join(d, 'config/main.js'), 'export default { theme: { name: "8bit" } };');
  }), { name: '8bit' });
});
