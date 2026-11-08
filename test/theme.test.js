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
