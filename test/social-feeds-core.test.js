import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeBluesky, normalizeMastodon, normalizeGithubReleases, normalizeGithubEvents,
  matchesTags, mergeItems, renderEntry, renderFeedParts, escapeHtml, safeHttps,
} from '../scripts/social/feeds/core.js';

const fx = (name) => new URL(`./fixtures-social-feeds/${name}`, import.meta.url);
const json = (name) => JSON.parse(readFileSync(fx(name), 'utf8'));

const ALICE = { key: 'bluesky:alice.example.com', service: 'bluesky', handle: 'alice.example.com', did: 'did:plc:alice0000000000000000000' };
const BOB = { key: 'mastodon:@bob@social.example', service: 'mastodon', handle: '@bob@social.example' };
const CAROL = { key: 'github:carol-dev', service: 'github', handle: 'carol-dev' };
const REPO = { name: 'widget', html_url: 'https://github.com/carol-dev/widget', description: 'A <small> widget & friends', language: 'JavaScript' };
const SERVICES = { bluesky: { name: 'Bluesky' }, mastodon: { name: 'Mastodon' }, github: { name: 'GitHub' } };

const bsky = () => normalizeBluesky(json('bluesky-page.json'), ALICE);
const masto = () => normalizeMastodon(json('mastodon-statuses.json'), BOB);
const gh = () => normalizeGithubReleases(json('github-releases.json'), REPO, CAROL);

test('bluesky: drops replies, keeps a repost as the original author with reposted:true and the repost time as date', () => {
  const { items, cursor } = bsky();
  assert.equal(cursor, '2026-11-08T12:00:01.000Z');
  assert.ok(!items.some((i) => i.text === 'Agreed!'), 'reply dropped');
  assert.equal(items.length, 5);
  const repost = items.find((i) => i.reposted);
  assert.equal(repost.author.handle, '@dave.example.net');
  assert.equal(repost.author.name, 'Dave');
  assert.equal(repost.date, '2026-11-13T09:30:00.000Z');
  assert.equal(repost.source, 'bluesky:alice.example.com');
  assert.equal(repost.id, 'bluesky:at://did:plc:dave00000000000000000000/app.bsky.feed.post/3lrepost1bbb2');
  assert.deepEqual(repost.counts, { replies: 4, reposts: 9, likes: 31 });
  assert.equal(items.filter((i) => !i.reposted).every((i) => i.reposted === false), true);
});

test('bluesky: tags from facets and record.tags, lower-cased', () => {
  const tagged = bsky().items.find((i) => i.text.includes('#Reading'));
  assert.deepEqual(tagged.tags, ['reading', 'books']);
  assert.ok(bsky().items.filter((i) => i !== tagged).every((i) => Array.isArray(i.tags)));
});

test('bluesky: link card thumb becomes image; post url is https://bsky.app/profile/<author handle>/post/<rkey>', () => {
  const card = bsky().items.find((i) => i.text === 'New write-up on static sites');
  assert.deepEqual(card.image, { url: 'https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:alice0000000000000000000/bafkreicardthumb@jpeg', alt: 'Static sites, again' });
  assert.equal(card.url, 'https://bsky.app/profile/alice.example.com/post/3lcard1ddd2');
  const repost = bsky().items.find((i) => i.reposted);
  assert.equal(repost.url, 'https://bsky.app/profile/dave.example.net/post/3lrepost1bbb2');
  const hostile = bsky().items.find((i) => i.text.includes('<script>'));
  assert.equal(hostile.image, undefined, 'javascript: thumb dropped');
});

test('mastodon: HTML content to plain text with newlines and decoded entities; reblog becomes reposted; http avatar dropped', () => {
  const { items, cursor } = masto();
  assert.equal(cursor, '113500000000000003');
  assert.equal(items.length, 2, 'reply dropped');
  const [first, boost] = items;
  assert.equal(first.text, "Fish & chips at the #Reading group.\nSecond <b>paragraph</b> 'quoted' — ok\nthird line https://example.org/notes");
  assert.deepEqual(first.tags, ['reading']);
  assert.deepEqual(first.image, { url: 'https://files.social.example/media_attachments/files/small/chips.jpg', alt: 'A plate of fish and chips' });
  assert.deepEqual(first.author, { name: 'Bob B.', handle: '@bob@social.example', avatar: 'https://files.social.example/accounts/avatars/bob.png', url: 'https://social.example/@bob' });
  assert.deepEqual(first.counts, { replies: 3, reposts: 1, likes: 7 });
  assert.equal(boost.reposted, true);
  assert.equal(boost.date, '2026-11-13T11:00:00.000Z');
  assert.equal(boost.text, 'Boost-worthy news "today"');
  assert.equal(boost.url, 'https://other.example/@erin/113490000000000010');
  assert.deepEqual(boost.tags, ['news']);
  assert.equal(boost.author.handle, '@erin@other.example');
  assert.equal(boost.author.name, 'erin', 'empty display_name falls back to username');
  assert.ok(!('avatar' in boost.author), 'http: avatar dropped');
});

test('github: releases skip draft and prerelease; text is "Released <repo> <tag>"', () => {
  const items = gh();
  assert.equal(items.length, 1);
  const [r] = items;
  assert.equal(r.id, 'github:200000002');
  assert.equal(r.text, 'Released widget v1.2.0');
  assert.equal(r.date, '2026-11-07T14:30:00.000Z');
  assert.equal(r.url, 'https://github.com/carol-dev/widget/releases/tag/v1.2.0');
  assert.deepEqual(r.tags, []);
  assert.deepEqual(r.release, { repo: 'widget', tag: 'v1.2.0', repoUrl: 'https://github.com/carol-dev/widget', description: 'A <small> widget & friends', language: 'JavaScript' });
  assert.ok(!('counts' in r));
});

test('github: an event and a release for the same release share one id', () => {
  const releases = json('github-releases.json');
  const ev = (release, action = 'published', type = 'ReleaseEvent') => ({
    id: '45000000001', type, public: true, created_at: release.published_at || release.created_at,
    actor: { id: 9000001, login: 'carol-dev', display_login: 'carol-dev', url: 'https://api.github.com/users/carol-dev', avatar_url: 'https://avatars.githubusercontent.com/u/9000001?' },
    repo: { id: 7000001, name: 'carol-dev/widget', url: 'https://api.github.com/repos/carol-dev/widget' },
    payload: { action, release },
  });
  const events = [
    ev(releases[2]),
    ev(releases[0]), // prerelease
    ev(releases[1]), // draft
    ev(releases[2], 'updated'),
    { id: '45000000009', type: 'PushEvent', actor: {}, repo: { name: 'carol-dev/widget' }, payload: {}, created_at: '2026-11-15T00:00:00Z' },
  ];
  const fromEvents = normalizeGithubEvents(events, CAROL);
  assert.equal(fromEvents.length, 1);
  assert.equal(fromEvents[0].id, gh()[0].id);
  assert.equal(fromEvents[0].text, 'Released widget v1.2.0');
  assert.equal(fromEvents[0].release.repoUrl, 'https://github.com/carol-dev/widget');
  assert.equal(mergeItems([fromEvents, gh()], {}).length, 1);
});

test('mergeItems: dedupes by id, newest first, tags drop GitHub items, limit applies after filters', () => {
  const all = [bsky().items, masto().items, gh()];
  const merged = mergeItems(all, {});
  assert.equal(merged.length, 8);
  const dates = merged.map((i) => i.date);
  assert.deepEqual(dates, [...dates].sort().reverse());
  // duplicate lists collapse
  assert.equal(mergeItems([...all, ...all], {}).length, 8);
  // tags: case-insensitive, '#' tolerated, GitHub never matches
  const tagged = mergeItems(all, { tags: ['#READING'] });
  assert.deepEqual(tagged.map((i) => i.service), ['mastodon', 'bluesky']);
  assert.equal(mergeItems(all, { tags: ['reading'], limit: 1 }).length, 1);
  assert.equal(mergeItems(all, { tags: ['reading'], limit: 1 })[0].service, 'mastodon');
  assert.equal(mergeItems(all, { limit: 3 }).length, 3);
  // ties broken by id
  const a = { ...gh()[0], id: 'github:b' };
  const b = { ...gh()[0], id: 'github:a' };
  assert.deepEqual(mergeItems([[a, b]], {}).map((i) => i.id), ['github:a', 'github:b']);
  // a repost of a post already listed keeps one entry, the newest
  const orig = { ...bsky().items.find((i) => i.reposted), reposted: false, date: '2026-11-11T10:00:00.000Z', source: 'bluesky:dave.example.net' };
  const once = mergeItems([bsky().items, [orig]], {}).filter((i) => i.id === orig.id);
  assert.equal(once.length, 1);
  assert.equal(once[0].reposted, true);
});

test('matchesTags: no tags matches everything; tags need an item tag', () => {
  const [r] = gh();
  assert.equal(matchesTags(r, []), true);
  assert.equal(matchesTags(r, undefined), true);
  assert.equal(matchesTags(r, ['reading']), false);
  assert.equal(matchesTags({ tags: ['reading'] }, ['Reading']), true);
});

test('renderEntry: escapes <script> and & and quotes; never writes a javascript: or http: URL', () => {
  const hostile = bsky().items.find((i) => i.text.includes('<script>'));
  const html = renderEntry(hostile, { serviceName: 'Bluesky' });
  assert.ok(!html.includes('<script'));
  assert.ok(html.includes('&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; Tom &amp; Jerry say &quot;hi&quot;'));
  assert.ok(html.includes('<b>Alice &quot;A&quot; &lt;Example&gt;</b>'));
  assert.ok(!/javascript:/i.test(html));

  const evil = {
    ...gh()[0],
    url: 'https://github.com/x" onmouseover="alert(1)',
    author: { name: 'x', handle: 'x', avatar: 'javascript:alert(1)', url: 'http://evil.example/' },
    image: { url: 'http://evil.example/i.png', alt: '"><script>' },
    release: { repo: 'r', tag: 't', repoUrl: 'javascript:alert(3)', description: null, language: null },
  };
  const out = renderEntry(evil, { serviceName: 'GitHub' });
  assert.ok(!/javascript:|http:\/\//i.test(out), out);
  assert.ok(!out.includes('" onmouseover'), out);
  assert.ok(!out.includes('social-feed-avatar'));
  assert.ok(!out.includes('social-feed-image'));

  assert.equal(renderEntry({ ...gh()[0], url: 'javascript:alert(1)' }, {}), '');
  assert.equal(renderEntry({ ...gh()[0], url: 'http://github.com/x' }, {}), '');
});

test('renderEntry: counts use service labels; hide-counts removes the list', () => {
  const b = renderEntry(bsky().items.find((i) => i.reposted), { serviceName: 'Bluesky' });
  assert.ok(b.includes('<ul class="social-feed-counts"><li><span aria-hidden="true">↩</span> 4<span class="visually-hidden"> replies</span></li><li><span aria-hidden="true">⟲</span> 9<span class="visually-hidden"> reposts</span></li><li><span aria-hidden="true">♡</span> 31<span class="visually-hidden"> likes</span></li></ul>'), b);
  assert.ok(b.includes('<p class="social-feed-reposted">Reposted</p>'));
  const m = renderEntry(masto().items[0], { serviceName: 'Mastodon' });
  assert.ok(m.includes('<span class="visually-hidden"> replies</span>'));
  assert.ok(m.includes('7<span class="visually-hidden"> favourites</span>'));
  assert.ok(m.includes('1<span class="visually-hidden"> boosts</span>'));
  assert.ok(!m.includes('social-feed-reposted'));
  const hidden = renderEntry(masto().items[0], { serviceName: 'Mastodon', hideCounts: true });
  assert.ok(!hidden.includes('social-feed-counts'));
  assert.ok(!renderEntry(gh()[0], { serviceName: 'GitHub' }).includes('social-feed-counts'));
});

test('renderFeedParts: entries, empty and more', () => {
  const items = mergeItems([bsky().items, gh()], { limit: 2 });
  const accounts = [
    { ...ALICE, profileUrl: 'https://bsky.app/profile/alice.example.com' },
    { ...CAROL, profileUrl: 'https://github.com/carol-dev' },
    { ...BOB, profileUrl: 'javascript:alert(1)' },
  ];
  const parts = renderFeedParts({ items, accounts, services: SERVICES });
  assert.equal(parts.empty, '');
  assert.equal((parts.entries.match(/<article /g) || []).length, 2);
  assert.ok(parts.entries.includes('<span class="social-feed-source">Bluesky</span>'));
  assert.equal(parts.more, '<p class="social-feed-more">More on <a href="https://bsky.app/profile/alice.example.com">Bluesky</a> · <a href="https://github.com/carol-dev">GitHub</a></p>');
  const none = renderFeedParts({ items: [], accounts: [], services: SERVICES });
  assert.deepEqual(none, { entries: '', empty: '<p class="social-feed-empty">Nothing yet</p>', more: '' });
  const hidden = renderFeedParts({ items: masto().items, accounts: [], hideCounts: true, services: SERVICES });
  assert.ok(!hidden.entries.includes('social-feed-counts'));
});

test('escapeHtml and safeHttps', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  assert.equal(escapeHtml(null), '');
  assert.equal(safeHttps('https://example.org/a b'), 'https://example.org/a%20b');
  assert.equal(safeHttps('http://example.org/'), null);
  assert.equal(safeHttps('javascript:alert(1)'), null);
  assert.equal(safeHttps(' JavaScript:alert(1)'), null);
  assert.equal(safeHttps('/relative'), null);
  assert.equal(safeHttps(undefined), null);
});

test('normalized fixtures equal expected-items.json; rendered fixtures equal expected-entry.html', () => {
  const actual = { bluesky: bsky().items, mastodon: masto().items, github: gh() };
  assert.deepEqual(actual, json('expected-items.json'));
  const html = [...actual.bluesky, ...actual.mastodon, ...actual.github]
    .map((item) => renderEntry(item, { serviceName: SERVICES[item.service].name }))
    .join('\n') + '\n';
  assert.equal(html, readFileSync(fx('expected-entry.html'), 'utf8'));
});

test('renderEntry: each newline in the text becomes <br>, so a whitespace-collapsing minifier keeps the line breaks', () => {
  const item = { id: 'x:1', service: 'bluesky', url: 'https://bsky.app/p/1', date: '2026-11-01T00:00:00.000Z', text: 'one <a>\ntwo\n\nthree', author: { name: 'A', handle: '@a' } };
  const html = renderEntry(item, { hideCounts: true });
  assert.match(html, /<p class="social-feed-text">one &lt;a&gt;<br>two<br><br>three<\/p>/);
  assert.ok(!/social-feed-text">[^<]*\n/.test(html), 'no raw newline left in the text');
});

test('mastodon: tag stripping is linear on a long run of "<" with no ">"', () => {
  const content = 'x' + '<'.repeat(50000);
  const started = Date.now();
  const { items } = normalizeMastodon([{ id: '1', uri: 'https://m.example/s/1', url: 'https://m.example/@a/1', created_at: '2026-11-01T00:00:00Z', content, account: { acct: 'a', url: 'https://m.example/@a' } }], BOB);
  assert.ok(Date.now() - started < 500, `took ${Date.now() - started}ms`);
  assert.equal(items.length, 1);
});
