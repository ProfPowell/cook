import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAccounts, renderSocialLinks } from '../scripts/social/index.js';

const acc = (list) => normalizeAccounts({ accounts: list }).all;

test('renders the exact item markup', () => {
  const html = renderSocialLinks(acc([{ service: 'github', handle: 'ProfPowell' }]));
  assert.equal(html, '<ul><li><a href="https://github.com/ProfPowell"><span class="social-icon" data-service="github" aria-hidden="true"></span><span>GitHub</span></a></li></ul>');
});

test('rel="me" only on mastodon', () => {
  const html = renderSocialLinks(acc([{ service: 'mastodon', handle: '@a@m.social' }, { service: 'github', handle: 'a' }]));
  assert.equal(html.match(/rel="me"/g).length, 1);
  assert.match(html, /<a href="https:\/\/m\.social\/@a" rel="me">/);
});

test('keeps input order', () => {
  const html = renderSocialLinks(acc([{ service: 'github', handle: 'a' }, { service: 'bluesky', handle: 'a.bsky.social' }]));
  assert.ok(html.indexOf('GitHub') < html.indexOf('Bluesky'));
});

test('services filters, trims, ignores unknown, keeps account order', () => {
  const list = acc([{ service: 'github', handle: 'a' }, { service: 'mastodon', handle: '@a@m.social' }, { service: 'bluesky', handle: 'a.bsky.social' }]);
  const html = renderSocialLinks(list, { services: 'bluesky, nope , github' });
  assert.ok(!html.includes('Mastodon'));
  assert.ok(html.indexOf('GitHub') < html.indexOf('Bluesky'));
});

test('empty result gives empty string', () => {
  assert.equal(renderSocialLinks([]), '');
  assert.equal(renderSocialLinks(acc([{ service: 'github', handle: 'a' }]), { services: 'bluesky' }), '');
  assert.equal(renderSocialLinks(undefined), '');
});

test('link label and url are escaped', () => {
  const html = renderSocialLinks([{ service: 'link', handle: '', url: 'https://example.com/?a="b"&c=<d>', name: 'A & <B>', icon: 'link' }]);
  assert.ok(html.includes('<span>A &amp; &lt;B&gt;</span>'));
  assert.ok(html.includes('href="https://example.com/?a=&quot;b&quot;&amp;c=&lt;d&gt;"'));
  assert.ok(!html.includes('<B>'));
});

test('variant does not change the markup', () => {
  const list = acc([{ service: 'github', handle: 'a' }]);
  assert.equal(renderSocialLinks(list, { variant: 'icon' }), renderSocialLinks(list));
});
