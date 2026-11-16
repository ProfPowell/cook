import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchAccountPage, collectItems } from '../scripts/social/feeds/fetch.js';
import { snapshotPath, readSnapshot, writeSnapshot } from '../scripts/social/feeds/snapshots.js';

const json = (name) => JSON.parse(readFileSync(new URL(`./fixtures-social-feeds/${name}`, import.meta.url), 'utf8'));
const ok = (body) => ({ ok: true, status: 200, json: async () => body });

const ALICE = { key: 'bluesky:alice.example.com', service: 'bluesky', handle: 'alice.example.com', did: 'did:plc:alice0000000000000000000' };
const BOB = { key: 'mastodon:@bob@social.example', service: 'mastodon', handle: '@bob@social.example' };
const CAROL = { key: 'github:carol-dev', service: 'github', handle: 'carol-dev' };

/** A fetch that records calls and serves by a (url, init) router. */
function recorder(route) {
  const calls = [];
  const fn = async (url, init = {}) => { calls.push({ url, init }); return route(url, init); };
  fn.calls = calls;
  return fn;
}

test('bluesky page uses did when present, else handle; passes cursor', async () => {
  const f = recorder(() => ok(json('bluesky-page.json')));
  const res = await fetchAccountPage(ALICE, { fetch: f, cursor: 'abc' });
  assert.equal(f.calls[0].url, 'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=did%3Aplc%3Aalice0000000000000000000&filter=posts_no_replies&limit=30&cursor=abc');
  assert.equal(res.items.length, 5);
  assert.equal(res.cursor, '2026-11-08T12:00:01.000Z');
  assert.equal(res.done, false);
  const g = recorder(() => ok({ feed: [] }));
  const empty = await fetchAccountPage({ ...ALICE, did: undefined }, { fetch: g });
  assert.match(g.calls[0].url, /actor=alice\.example\.com&filter=posts_no_replies&limit=30$/);
  assert.deepEqual(empty, { items: [], cursor: null, done: true });
});

test('mastodon looks up the account id once, then pages with max_id', async () => {
  const f = recorder((url) => (url.includes('/lookup') ? ok(json('mastodon-lookup.json')) : ok(json('mastodon-statuses.json'))));
  const account = { ...BOB };
  const first = await fetchAccountPage(account, { fetch: f });
  assert.equal(account.mastodonId, '109000000000000001');
  assert.equal(f.calls[0].url, 'https://social.example/api/v1/accounts/lookup?acct=bob');
  assert.equal(f.calls[1].url, 'https://social.example/api/v1/accounts/109000000000000001/statuses?exclude_replies=true&limit=40');
  await fetchAccountPage(account, { fetch: f, cursor: first.cursor });
  assert.equal(f.calls.filter((c) => c.url.includes('/lookup')).length, 1);
  assert.equal(f.calls[2].url, `https://social.example/api/v1/accounts/109000000000000001/statuses?exclude_replies=true&limit=40&max_id=${first.cursor}`);
});

const githubRoute = (url) => {
  if (url.includes('/repos?')) return ok(json('github-repos.json'));
  if (url.includes('/releases?')) return ok(json('github-releases.json'));
  if (url.includes('/events/public')) return ok(json('github-events.json'));
  return { ok: false, status: 404, json: async () => ({}) };
};

test('github build mode skips forks and archived repos, caps 10 repos, sends the token only when given', async () => {
  const f = recorder(githubRoute);
  const res = await fetchAccountPage(CAROL, { fetch: f });
  assert.equal(f.calls[0].url, 'https://api.github.com/users/carol-dev/repos?sort=pushed&per_page=10');
  const releaseCalls = f.calls.filter((c) => c.url.includes('/releases?'));
  assert.equal(releaseCalls.length, 10);
  assert.ok(releaseCalls.every((c) => c.url.endsWith('/releases?per_page=5')));
  assert.ok(!releaseCalls.some((c) => /\/repos\/carol-dev\/(forked|old)\//.test(c.url)));
  assert.ok(f.calls.every((c) => !(c.init.headers && c.init.headers.Authorization)));
  assert.equal(res.done, true);
  assert.equal(res.cursor, null);
  assert.ok(res.items.length > 0);
  const g = recorder(githubRoute);
  await fetchAccountPage(CAROL, { fetch: g, token: 'tok123' });
  assert.ok(g.calls.every((c) => c.init.headers.Authorization === 'Bearer tok123'));
});

test('github browser mode reads public events and reports done', async () => {
  const f = recorder(githubRoute);
  const res = await fetchAccountPage(CAROL, { fetch: f, mode: 'browser', token: 'ignored-no' });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, 'https://api.github.com/users/carol-dev/events/public?per_page=30');
  assert.equal(res.done, true);
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].id, 'github:200000009');
});

test('collectItems stops after 3 pages for a rare tag', async () => {
  const f = recorder(() => ok(json('bluesky-page.json')));
  const res = await collectItems(ALICE, { fetch: f, tags: ['no-such-tag'], want: 5 });
  assert.equal(f.calls.length, 3);
  assert.equal(res.items.length, 15);
  assert.equal(res.done, false);
  const g = recorder(() => ok(json('bluesky-page.json')));
  await collectItems(ALICE, { fetch: g, want: 3 });
  assert.equal(g.calls.length, 1, 'enough on the first page');
});

test('timeout after 5000 ms rejects (a never-resolving fetch, timeoutMs: 20)', async () => {
  const never = () => new Promise(() => {});
  await assert.rejects(fetchAccountPage(ALICE, { fetch: never, timeoutMs: 20 }), /getAuthorFeed/);
});

test('a non-OK status or unexpected JSON shape throws an Error naming the URL', async () => {
  await assert.rejects(fetchAccountPage(ALICE, { fetch: async () => ({ ok: false, status: 503, json: async () => ({}) }) }), /503.*getAuthorFeed/);
  await assert.rejects(fetchAccountPage(ALICE, { fetch: async () => ok({ nope: 1 }) }), /getAuthorFeed/);
});

test('snapshot round trip; slug for "@Bob@Social.Example" is "bob-social.example"', () => {
  const root = mkdtempSync(join(tmpdir(), 'feeds-'));
  const acct = { key: 'mastodon:@Bob@Social.Example', service: 'mastodon', handle: '@Bob@Social.Example' };
  assert.equal(snapshotPath(root, acct), join(root, 'data', 'social-feeds', 'mastodon-bob-social.example.json'));
  assert.equal(readSnapshot(root, acct), null);
  const items = Array.from({ length: 120 }, (_, i) => ({ id: `mastodon:${i}` }));
  writeSnapshot(root, acct, items);
  const back = readSnapshot(root, acct);
  assert.equal(back.length, 100);
  assert.deepEqual(back[0], { id: 'mastodon:0' });
  const raw = JSON.parse(readFileSync(snapshotPath(root, acct), 'utf8'));
  assert.ok(!Number.isNaN(Date.parse(raw.fetchedAt)));
});

test('writeSnapshot never throws on an unwritable dir', () => {
  const root = mkdtempSync(join(tmpdir(), 'feeds-'));
  const blocker = join(root, 'data');
  writeFileSync(blocker, 'a file where a directory should be');
  const warns = [];
  const orig = console.warn;
  console.warn = (m) => warns.push(m);
  try {
    assert.doesNotThrow(() => writeSnapshot(root, CAROL, [{ id: 'github:1' }]));
  } finally {
    console.warn = orig;
  }
  assert.equal(warns.length, 1);
  assert.match(warns[0], /^\[social-feed\] /);
  assert.ok(!existsSync(join(root, 'data', 'social-feeds')));
});
