/**
 * @file social-feed-block.test.js
 * @description The pure `<social-feed>` block: account selection, attribute
 * parsing and the inner HTML Cook writes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAccounts } from '../scripts/social/accounts.js';
import { feedAccounts, parseFeedAttrs, renderSocialFeed } from '../scripts/social/feeds/block.js';
import * as social from '../scripts/social/index.js';

const { all } = normalizeAccounts({
  accounts: [
    { service: 'bluesky', handle: 'alice.example.com', did: 'did:plc:alice' },
    { service: 'mastodon', handle: '@bob@social.example' },
    { service: 'github', handle: 'carol-dev', hidden: true },
    { service: 'linkedin', handle: 'erin-example' },
  ],
});

test('feedAccounts: empty attr is every visible feed-service account', () => {
  const { accounts, warnings } = feedAccounts(all, '');
  assert.deepEqual(warnings, []);
  assert.deepEqual(accounts, [
    { key: 'bluesky:alice.example.com', service: 'bluesky', handle: 'alice.example.com', did: 'did:plc:alice', profileUrl: 'https://bsky.app/profile/alice.example.com' },
    { key: 'mastodon:@bob@social.example', service: 'mastodon', handle: '@bob@social.example', profileUrl: 'https://social.example/@bob' },
  ]);
  assert.deepEqual(feedAccounts({ all }, undefined).accounts.length, 2);
  assert.deepEqual(feedAccounts(undefined, undefined), { accounts: [], warnings: [] });
});

test('feedAccounts: named keys include hidden ones, skip unknown with a warning, ignore non-feed services', () => {
  const { accounts, warnings } = feedAccounts(all, ' github:carol-dev , bluesky:nobody.example.com,linkedin:erin-example,github:carol-dev');
  assert.deepEqual(accounts.map((a) => a.key), ['github:carol-dev']);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^\[social-feed\] .*bluesky:nobody\.example\.com/);
});

test('parseFeedAttrs: defaults, valid values and fallbacks with warnings', () => {
  assert.deepEqual(parseFeedAttrs({}), { accounts: '', tags: [], items: 12, height: null, hideCounts: false, warnings: [] });
  const ok = parseFeedAttrs({ tags: '#Cook, html ,', items: '50', height: '12.5vh', 'hide-counts': '' });
  assert.deepEqual([ok.tags, ok.items, ok.height, ok.hideCounts, ok.warnings], [['cook', 'html'], 50, '12.5vh', true, []]);
  const bad = parseFeedAttrs({ items: '51', height: '10px; color: red' });
  assert.equal(bad.items, 12);
  assert.equal(bad.height, null, 'an invalid height is dropped, so the element CSS default applies');
  assert.equal(bad.warnings.length, 2);
  assert.ok(bad.warnings.every((w) => w.startsWith('[social-feed] ')));
  assert.equal(parseFeedAttrs({ items: '0' }).items, 12);
});

const item = (n, extra = {}) => ({
  id: `bluesky:at://x/${n}`, service: 'bluesky', source: 'bluesky:alice.example.com',
  url: `https://bsky.app/profile/alice.example.com/post/${n}`, date: new Date(Date.UTC(2026, 0, 1, n)).toISOString(),
  text: `post ${n}`, tags: [], reposted: false, author: { name: 'Alice', handle: '@alice.example.com' }, ...extra,
});

test('renderSocialFeed: entries, buffer, newest, cursors; state JSON cannot close its script', () => {
  const { accounts } = feedAccounts(all, 'bluesky:alice.example.com');
  const items = Array.from({ length: 4 }, (_, n) => item(n, n === 0 ? { text: '</script><script>alert(1)</script>' } : {}));
  const html = renderSocialFeed({ items: '2' }, {
    accounts,
    itemsByKey: { 'bluesky:alice.example.com': [...items, 'junk', { id: 'x', url: 'javascript:1', date: 'nope' }] },
    cursorsByKey: { 'bluesky:alice.example.com': { cursor: 'c1', done: false } },
  });
  assert.match(html, /^<activity-feed aria-label="Recent posts" data-infinite>/);
  assert.equal((html.match(/<article /g) || []).length, 2);
  assert.ok(!html.includes('<script>alert'));
  const json = html.match(/<script type="application\/json" class="social-feed-state">([\s\S]*?)<\/script>/)[1];
  const s = JSON.parse(json);
  assert.deepEqual(s.accounts, [{ key: 'bluesky:alice.example.com', service: 'bluesky', handle: 'alice.example.com', did: 'did:plc:alice', cursor: 'c1', done: false }]);
  assert.deepEqual(s.buffer.map((i) => i.id), ['bluesky:at://x/1', 'bluesky:at://x/0']);
  assert.equal(s.buffer[1].text, '</script><script>alert(1)</script>');
  assert.deepEqual(s.newest, { 'bluesky:alice.example.com': item(3).date });
});

test('renderSocialFeed: nothing to show writes "Nothing yet" and no data-infinite', () => {
  const html = renderSocialFeed({}, { accounts: [] });
  assert.match(html, /^<activity-feed aria-label="Recent posts">\n<\/activity-feed>\n<p class="social-feed-empty">Nothing yet<\/p>\n<script/);
});

test('cook-ssg/social exports the feed helpers', () => {
  for (const name of ['renderEntry', 'renderFeedParts', 'mergeItems', 'matchesTags', 'readSnapshot', 'snapshotPath', 'renderSocialFeed', 'feedAccounts']) {
    assert.equal(typeof social[name], 'function', name);
  }
});

test('renderSocialFeed: hand-edited snapshot dates are normalized to ISO before the merge; unparseable ones dropped', () => {
  const { accounts } = feedAccounts(all, 'bluesky:alice.example.com');
  const items = [
    item(1, { id: 'bluesky:at://x/offset', date: '2026-01-01T05:00:00+02:00' }), // 03:00Z
    item(2, { id: 'bluesky:at://x/zulu', date: '2026-01-01T04:00:00Z' }),
    item(3, { id: 'bluesky:at://x/bad', date: 'not a date' }),
  ];
  const html = renderSocialFeed({ items: '1' }, { accounts, itemsByKey: { [accounts[0].key]: items } });
  const json = JSON.parse(html.match(/<script type="application\/json" class="social-feed-state">([\s\S]*?)<\/script>/)[1]);
  assert.match(html, /data-id="bluesky:at:\/\/x\/zulu"/, 'the later instant is shown first');
  assert.deepEqual(json.buffer.map((i) => [i.id, i.date]), [['bluesky:at://x/offset', '2026-01-01T03:00:00.000Z']]);
  assert.equal(json.newest[accounts[0].key], '2026-01-01T04:00:00.000Z');
  assert.ok(!html.includes('x/bad'));
});
