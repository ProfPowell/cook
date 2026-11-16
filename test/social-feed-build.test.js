/**
 * @file social-feed-build.test.js
 * @description End to end: `<social-feed>` is filled at build from
 * config/social.json, fetched posts (a stubbed global fetch preloaded with
 * --import) and per-account snapshots.
 */

import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { promises as fs, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOK = path.resolve(__dirname, '..', 'bin', 'cook.js');
const FIXTURE = path.join(__dirname, 'fixtures-social-feed-site');
const STUB = pathToFileURL(path.join(FIXTURE, 'fetch-stub.mjs')).href;

const tmps = [];
after(async () => { for (const t of tmps) await fs.rm(t, { recursive: true, force: true }); });

/* ------------------------------------------------------------ API fixtures */

const hour = (i) => new Date(Date.UTC(2026, 10, 10, 23 - i)).toISOString();

/** A Bluesky getAuthorFeed body: n posts, newest first; one page unless `cursor` is given. */
function bsky(handle, n, { tagEvery = 0, offset = 0, start = 0, cursor } = {}) {
  return {
    ...(cursor ? { cursor } : {}),
    feed: Array.from({ length: n }, (_, j) => j + start).map((i) => ({
      post: {
        uri: `at://did:plc:${handle.split('.')[0]}/app.bsky.feed.post/r${i}`,
        author: { did: `did:plc:${handle.split('.')[0]}`, handle, displayName: handle.split('.')[0] },
        record: {
          createdAt: hour(i * 3 + offset),
          text: `${handle} post ${i}`,
          tags: tagEvery && i % tagEvery === 0 ? ['Cook'] : [],
        },
        replyCount: 1, repostCount: 2, likeCount: 3,
      },
    })),
  };
}

function mastoStatuses(n, { tagEvery = 0 } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    id: String(1000 - i),
    uri: `https://social.example/users/bob/statuses/${1000 - i}`,
    url: `https://social.example/@bob/${1000 - i}`,
    created_at: hour(i * 3 + 1),
    content: `<p>bob toot ${i}</p>`,
    tags: tagEvery && i % tagEvery === 0 ? [{ name: 'cook' }] : [],
    account: { acct: 'bob', username: 'bob', display_name: 'Bob', url: 'https://social.example/@bob' },
    replies_count: 0, reblogs_count: 0, favourites_count: 0,
  }));
}

const GH_REPOS = [{ name: 'tool', html_url: 'https://github.com/carol-dev/tool', description: 'A tool', language: 'JavaScript', fork: false, archived: false }];
const GH_RELEASES = [{
  id: 77, tag_name: 'v1.0.0', html_url: 'https://github.com/carol-dev/tool/releases/tag/v1.0.0',
  published_at: hour(2), draft: false, prerelease: false,
  author: { login: 'carol-dev', html_url: 'https://github.com/carol-dev' },
}];

/** Default routes: alice 10 posts, bob 5 toots, carol 1 release, dave 3 posts. */
function routes({ alice = bsky('alice.example.com', 10), bob = mastoStatuses(5), dave = bsky('dave.example.com', 3, { offset: 2 }), extra = [] } = {}) {
  return [
    ...extra,
    { match: 'actor=alice.example.com', body: alice },
    { match: 'actor=dave.example.com', body: dave },
    { match: 'accounts/lookup', body: { id: '42' } },
    { match: 'max_id=', body: [] },
    { match: '/statuses', body: bob },
    { match: '/users/carol-dev/repos', body: GH_REPOS },
    { match: '/repos/carol-dev/tool/releases', body: GH_RELEASES },
  ];
}

/* ----------------------------------------------------------------- harness */

const page = (body) => `<!doctype html><html lang="en"><head><title>T</title></head><body><main>${body}</main></body></html>\n`;

/**
 * Copy the fixture site to a temp dir, apply `files` (null deletes), build with
 * the fetch stub, and return the output plus the request log.
 */
async function build({ files = {}, stub = routes(), env = {} } = {}) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cook-feed-'));
  tmps.push(tmp);
  await fs.cp(path.join(FIXTURE, 'site'), tmp, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(tmp, rel);
    if (content === null) { await fs.rm(abs, { force: true }); continue; }
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, typeof content === 'string' ? content : JSON.stringify(content));
  }
  const routesFile = path.join(tmp, '.routes.json');
  const logFile = path.join(tmp, '.requests.log');
  await fs.writeFile(routesFile, JSON.stringify(stub));
  const base = { ...process.env };
  delete base.COOK_OFFLINE;
  delete base.GITHUB_TOKEN;
  const r = spawnSync(process.execPath, [COOK, 'build'], {
    cwd: tmp,
    env: {
      ...base, NODE_ENV: 'production', NODE_OPTIONS: `--import=${STUB}`,
      FEED_STUB_ROUTES: routesFile, FEED_STUB_LOG: logFile, ...env,
    },
    encoding: 'utf-8',
  });
  const out = r.stdout + r.stderr;
  assert.equal(r.status, 0, out);
  const requests = existsSync(logFile)
    ? (await fs.readFile(logFile, 'utf8')).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];
  return { tmp, out, requests, read: (rel = 'index.html') => fs.readFile(path.join(tmp, 'dist', rel), 'utf-8') };
}

// jsdom serializes boolean attributes as name="" (same DOM as the bare form)
const articles = (html) => [...html.matchAll(/<article data-activity(?:="")? data-id="([^"]+)" data-service="([^"]+)">/g)]
  .map((m) => ({ id: m[1], service: m[2] }));
const state = (html, n = 0) => {
  const all = [...html.matchAll(/<script type="application\/json" class="social-feed-state">([\s\S]*?)<\/script>/g)];
  return JSON.parse(all[n][1]);
};
const feedWarnings = (out) => out.split('\n').filter((l) => l.includes('[social-feed] '));

/* ------------------------------------------------------------------- tests */

describe('<social-feed> build fill', () => {
  test('fills an empty <social-feed> with entries, more line and state JSON', async () => {
    const { read } = await build();
    const html = await read();
    assert.match(html, /<social-feed style="--social-feed-height: 32rem">/);
    assert.match(html, /<activity-feed aria-label="Recent posts" data-infinite(="")?>/);
    const list = articles(html);
    assert.equal(list.length, 12);
    assert.deepEqual([...new Set(list.map((a) => a.service))].sort(), ['bluesky', 'github', 'mastodon']);
    assert.ok(!html.includes('dave.example.com'), 'a hidden account is not in the default selection');
    assert.ok(!html.includes('social-feed-empty'));
    assert.match(html, /<p class="social-feed-more">More on <a href="https:\/\/bsky\.app\/profile\/alice\.example\.com">Bluesky<\/a> · <a href="https:\/\/social\.example\/@bob">Mastodon<\/a> · <a href="https:\/\/github\.com\/carol-dev">GitHub<\/a><\/p>/);
    const s = state(html);
    assert.deepEqual(s.accounts.map((a) => a.key), ['bluesky:alice.example.com', 'mastodon:@bob@social.example', 'github:carol-dev']);
    assert.deepEqual(Object.keys(s).sort(), ['accounts', 'buffer', 'newest', 'tags']);
    assert.deepEqual(s.tags, []);
    assert.equal(s.buffer.length, 4);
    assert.equal(s.newest['bluesky:alice.example.com'], hour(0));
    for (const a of s.accounts) assert.equal(typeof a.done, 'boolean');
    // newest first
    const dates = [...html.matchAll(/<time datetime="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(dates, [...dates].sort().reverse());
  });

  test('leaves a <social-feed> that has children alone', async () => {
    const { read, requests } = await build({
      files: { 'src/index.html': page('<social-feed><p>hand</p></social-feed><pre><social-feed></social-feed></pre>') },
    });
    const html = await read();
    assert.ok(html.includes('<social-feed><p>hand</p></social-feed>'));
    assert.ok(html.includes('<pre><social-feed></social-feed></pre>'));
    assert.equal(requests.length, 0);
  });

  test('accounts attribute: hidden account included; unknown key skipped with one [social-feed] warning', async () => {
    const block = '<social-feed accounts="bluesky:dave.example.com, bluesky:nobody.example.com, linkedin:erin-example"></social-feed>';
    const { read, out } = await build({ files: { 'src/index.html': page(block + block) } });
    const html = await read();
    const list = articles(html);
    assert.equal(list.length, 6);
    assert.ok(list.every((a) => a.id.includes('did:plc:dave')));
    assert.deepEqual(state(html).accounts.map((a) => a.key), ['bluesky:dave.example.com']);
    const warnings = feedWarnings(out);
    assert.equal(warnings.filter((w) => w.includes('nobody.example.com')).length, 1, out);
    assert.ok(!warnings.some((w) => w.includes('linkedin')), out);
  });

  test('no config/social.json: "Nothing yet", no data-infinite, build exit 0', async () => {
    const { read, requests } = await build({ files: { 'config/social.json': null } });
    const html = await read();
    assert.match(html, /<activity-feed aria-label="Recent posts">\s*<\/activity-feed>/);
    assert.ok(!html.includes('data-infinite'));
    assert.match(html, /<p class="social-feed-empty">Nothing yet<\/p>/);
    assert.ok(!html.includes('social-feed-more'));
    assert.deepEqual(state(html).accounts, []);
    assert.equal(requests.length, 0);
  });

  test('service throws or returns bad JSON: snapshot used; with no snapshot the other accounts still show; build exit 0', async () => {
    const snapshot = {
      fetchedAt: '2026-11-01T00:00:00.000Z',
      items: [
        {
          id: 'bluesky:at://snap/1', service: 'bluesky', source: 'bluesky:alice.example.com',
          url: 'https://bsky.app/profile/alice.example.com/post/snap1', date: '2026-11-09T00:00:00.000Z',
          text: 'from the snapshot </script><script>alert(1)</script>', tags: [], reposted: false,
          author: { name: 'Alice', handle: '@alice.example.com', avatar: 'javascript:alert(1)' },
        },
        {
          id: 'bluesky:at://snap/2', service: 'bluesky', source: 'bluesky:alice.example.com',
          url: 'javascript:alert(2)', date: '2026-11-09T01:00:00.000Z', text: 'hostile', tags: [], reposted: false,
          author: { name: 'x', handle: 'x' },
        },
      ],
    };
    const stub = routes({ extra: [
      { match: 'actor=alice.example.com', raw: '{ not json' },
      { match: 'accounts/lookup', throws: 'connect ECONNREFUSED' },
    ] });
    const { read, out } = await build({
      stub, files: { 'data/social-feeds/bluesky-alice.example.com.json': snapshot },
    });
    const html = await read();
    const ids = articles(html).map((a) => a.id);
    assert.deepEqual(ids, ['github:77', 'bluesky:at://snap/1']);
    assert.ok(!html.includes('javascript:'));
    assert.ok(!html.includes('<script>alert'));
    assert.equal(state(html).buffer.length, 0);
    const warnings = feedWarnings(out);
    assert.equal(warnings.filter((w) => w.includes('bluesky:alice.example.com')).length, 1, out);
    assert.equal(warnings.filter((w) => w.includes('mastodon:@bob@social.example')).length, 1, out);
  });

  test('each account fetched once although three blocks use it', async () => {
    const { read, requests } = await build({
      files: {
        'src/index.html': page('<social-feed></social-feed><social-feed items="3"></social-feed>'),
        'src/other.html': page('<social-feed tags="cook"></social-feed>'),
      },
    });
    const count = (s) => requests.filter((r) => r.url.includes(s)).length;
    assert.equal(count('actor=alice.example.com'), 1);
    assert.equal(count('accounts/lookup'), 1);
    assert.equal(count('/users/carol-dev/repos'), 1);
    assert.equal(count('/repos/carol-dev/tool/releases'), 1);
    assert.equal(articles(await read()).length, 15);
    for (const r of requests) assert.equal(r.headers['User-Agent'], 'cook-ssg');
  });

  test('successful fetch writes data/social-feeds/<service>-<slug>.json', async () => {
    const { tmp } = await build();
    const dir = path.join(tmp, 'data', 'social-feeds');
    assert.deepEqual((await fs.readdir(dir)).sort(), ['bluesky-alice.example.com.json', 'github-carol-dev.json', 'mastodon-bob-social.example.json']);
    const snap = JSON.parse(await fs.readFile(path.join(dir, 'bluesky-alice.example.com.json'), 'utf8'));
    assert.ok(!Number.isNaN(Date.parse(snap.fetchedAt)));
    assert.equal(snap.items.length, 10);
    assert.equal(snap.items[0].source, 'bluesky:alice.example.com');
  });

  test('COOK_OFFLINE=1: no fetch calls; snapshot used', async () => {
    const first = await build();
    const snapshots = path.join(first.tmp, 'data', 'social-feeds');
    const files = {};
    for (const name of await fs.readdir(snapshots)) {
      files[`data/social-feeds/${name}`] = await fs.readFile(path.join(snapshots, name), 'utf8');
    }
    const { read, requests } = await build({ files, env: { COOK_OFFLINE: '1' } });
    assert.equal(requests.length, 0);
    const html = await read();
    assert.deepEqual(articles(html), articles(await first.read()));
  });

  test('invalid items/height fall back to 12 / 32rem with a warning', async () => {
    const { read, out } = await build({
      files: { 'src/index.html': page('<social-feed items="abc" height="10furlongs" style="color: red"></social-feed>') },
    });
    const html = await read();
    assert.equal(articles(html).length, 12);
    assert.match(html, /style="color: red; --social-feed-height: 32rem"/);
    const warnings = feedWarnings(out);
    assert.equal(warnings.filter((w) => w.includes('items')).length, 1, out);
    assert.equal(warnings.filter((w) => w.includes('height')).length, 1, out);
  });

  test('tags block: only matching posts, no GitHub', async () => {
    const stub = routes({ alice: bsky('alice.example.com', 10, { tagEvery: 3 }), bob: mastoStatuses(5, { tagEvery: 2 }) });
    const { read } = await build({ stub, files: { 'src/index.html': page('<social-feed tags="#COOK" height="20em" hide-counts></social-feed>') } });
    const html = await read();
    const list = articles(html);
    assert.equal(list.length, 7); // alice 0,3,6,9 + bob 0,2,4
    assert.ok(list.every((a) => a.service !== 'github'));
    assert.ok(!html.includes('github.com/carol-dev'));
    assert.ok(!html.includes('social-feed-counts'));
    assert.match(html, /--social-feed-height: 20em/);
    const s = state(html);
    assert.deepEqual(s.tags, ['cook']);
    assert.ok(s.accounts.every((a) => a.service !== 'github'));
  });

  test('buffer holds every unshown matching item; state JSON has no token', async () => {
    const { read, requests } = await build({
      stub: routes({ alice: bsky('alice.example.com', 40) }),
      files: { 'src/index.html': page('<social-feed items="5"></social-feed>') },
      env: { GITHUB_TOKEN: 'ghp_secret_token_value' },
    });
    const html = await read();
    assert.equal(articles(html).length, 5);
    const s = state(html);
    assert.equal(s.buffer.length, 41); // 40 + 5 + 1 fetched, 5 shown
    const shown = new Set(articles(html).map((a) => a.id));
    assert.ok(s.buffer.every((i) => !shown.has(i.id)));
    const bufDates = s.buffer.map((i) => i.date);
    assert.deepEqual(bufDates, [...bufDates].sort().reverse());
    assert.ok(!html.includes('ghp_secret_token_value'));
    const gh = requests.filter((r) => r.url.includes('api.github.com'));
    assert.ok(gh.length > 0 && gh.every((r) => r.headers.Authorization === 'Bearer ghp_secret_token_value'));
    assert.ok(requests.filter((r) => !r.url.includes('api.github.com')).every((r) => !r.headers.Authorization));
  });
  test('buffer + shown covers every fetched matching item; cursor is the one after the last fetched page', async () => {
    const alice = (n, cursor) => bsky('alice.example.com', 10, { tagEvery: 5, start: n * 10, offset: n * 30, cursor });
    const stub = routes({
      extra: [
        { match: 'cursor=p2', body: alice(2, 'p3') },
        { match: 'cursor=p1', body: alice(1, 'p2') },
        { match: 'actor=alice.example.com', body: alice(0, 'p1') },
      ],
      bob: mastoStatuses(5, { tagEvery: 2 }),
    });
    const { read, requests } = await build({
      stub, files: { 'src/index.html': page('<social-feed tags="cook" items="5"></social-feed><social-feed items="3"></social-feed>') },
    });
    const html = await read();
    assert.equal(requests.filter((r) => r.url.includes('actor=alice.example.com')).length, 3);

    // tagged block: 3 alice pages (2 tagged each) + bob's 3 tagged toots
    const tagged = state(html, 0);
    const taggedIds = [...articles(html).slice(0, 5).map((a) => a.id), ...tagged.buffer.map((i) => i.id)];
    assert.equal(taggedIds.length, 9);
    assert.equal(new Set(taggedIds).size, 9);
    assert.equal(tagged.accounts.find((a) => a.service === 'bluesky').cursor, 'p3');

    // a later untagged block sees every fetched item: 30 alice + 5 bob + 1 carol
    const plain = state(html, 1);
    assert.equal(3 + plain.buffer.length, 36);
    assert.equal(plain.accounts.find((a) => a.service === 'bluesky').cursor, 'p3');
  });

  test('no tags: one page per account when items <= page size', async () => {
    const stub = routes({
      extra: [{ match: 'cursor=', body: bsky('alice.example.com', 30, { start: 30 }) }],
      alice: bsky('alice.example.com', 30, { cursor: 'p1' }),
      bob: mastoStatuses(15),
    });
    const { read, requests } = await build({ stub });
    const count = (s) => requests.filter((r) => r.url.includes(s)).length;
    assert.equal(count('actor=alice.example.com'), 1);
    assert.equal(count('/statuses'), 1);
    assert.equal(count('/users/carol-dev/repos'), 1);
    const s = state(await read());
    assert.equal(s.accounts[0].cursor, 'p1');
    assert.equal(s.accounts[0].done, false);
    assert.equal(12 + s.buffer.length, 46);
  });
});
