/**
 * @file fetch.js
 * @description Fetch one page of an account's posts from Bluesky, Mastodon or
 * GitHub through an injected `fetch`, and page until enough items pass a tag
 * filter. It imports only `./core.js` and uses no Node built-ins, so Vanilla
 * Breeze copies it verbatim into the browser.
 */

import {
  normalizeBluesky, normalizeMastodon, normalizeGithubReleases, normalizeGithubEvents, matchesTags,
} from './core.js';

const MAX_PAGES = 3;
const MAX_REPOS = 10;

/**
 * GET and parse JSON under one time budget that covers headers and body.
 * Rejects with an Error naming the URL on timeout, non-OK status or bad JSON.
 */
async function getJson(url, { fetch: doFetch, timeoutMs = 5000, headers }) {
  const ctrl = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(new Error(`Timed out after ${timeoutMs} ms: ${url}`));
    }, timeoutMs);
  });
  const work = (async () => {
    let res;
    try {
      res = await doFetch(url, { headers, signal: ctrl.signal });
    } catch (err) {
      throw new Error(`Request failed for ${url}: ${err && err.message ? err.message : err}`);
    }
    if (!res || !res.ok) throw new Error(`HTTP ${res ? res.status : 'error'} for ${url}`);
    try {
      return await res.json();
    } catch {
      throw new Error(`Bad JSON from ${url}`);
    }
  })();
  work.catch(() => {});
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const expectShape = (ok, url) => {
  if (!ok) throw new Error(`Unexpected response shape from ${url}`);
};

function splitMastodon(handle) {
  const [user, instance] = String(handle).replace(/^@/, '').split('@');
  return { user, instance };
}

async function blueskyPage(account, opts) {
  const actor = account.did || account.handle;
  let url = `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(actor)}&filter=posts_no_replies&limit=30`;
  if (opts.cursor) url += `&cursor=${encodeURIComponent(opts.cursor)}`;
  const body = await getJson(url, opts);
  expectShape(body && typeof body === 'object' && Array.isArray(body.feed), url);
  const { items, cursor } = normalizeBluesky(body, account);
  return { items, cursor, done: !cursor };
}

async function mastodonPage(account, opts) {
  const { user, instance } = splitMastodon(account.handle);
  if (!user || !instance) throw new Error(`Bad Mastodon handle: ${account.handle}`);
  if (!account.mastodonId) {
    const lookupUrl = `https://${instance}/api/v1/accounts/lookup?acct=${encodeURIComponent(user)}`;
    const found = await getJson(lookupUrl, opts);
    expectShape(found && found.id !== undefined && found.id !== null && found.id !== '', lookupUrl);
    account.mastodonId = String(found.id);
  }
  let url = `https://${instance}/api/v1/accounts/${encodeURIComponent(account.mastodonId)}/statuses?exclude_replies=true&limit=40`;
  if (opts.cursor) url += `&max_id=${encodeURIComponent(opts.cursor)}`;
  const list = await getJson(url, opts);
  expectShape(Array.isArray(list), url);
  const { items, cursor } = normalizeMastodon(list, account);
  return { items, cursor, done: !cursor };
}

async function githubPage(account, opts) {
  const user = encodeURIComponent(account.handle);
  const headers = { ...(opts.headers || {}) };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const o = { ...opts, headers };
  if (opts.mode === 'browser') {
    const url = `https://api.github.com/users/${user}/events/public?per_page=30`;
    const events = await getJson(url, o);
    expectShape(Array.isArray(events), url);
    return { items: normalizeGithubEvents(events, account), cursor: null, done: true };
  }
  const reposUrl = `https://api.github.com/users/${user}/repos?sort=pushed&per_page=10`;
  const repos = await getJson(reposUrl, o);
  expectShape(Array.isArray(repos), reposUrl);
  const chosen = repos
    .filter((r) => r && typeof r === 'object' && !r.fork && !r.archived && r.name)
    .slice(0, MAX_REPOS);
  const lists = await Promise.all(chosen.map(async (repo) => {
    const url = `https://api.github.com/repos/${user}/${encodeURIComponent(repo.name)}/releases?per_page=5`;
    const releases = await getJson(url, o);
    expectShape(Array.isArray(releases), url);
    return normalizeGithubReleases(releases, repo, account);
  }));
  return { items: lists.flat(), cursor: null, done: true };
}

/**
 * @param {{ key: string, service: string, handle: string, did?: string, mastodonId?: string }} account
 *   a Mastodon account gets `mastodonId` set after the first lookup
 * @param {{ fetch: Function, cursor?: string|null, timeoutMs?: number, token?: string,
 *   mode?: 'build'|'browser', headers?: Record<string,string> }} options
 * @returns {Promise<{ items: object[], cursor: string|null, done: boolean }>}
 */
export async function fetchAccountPage(account, { fetch: doFetch, cursor, timeoutMs = 5000, token, mode = 'build', headers } = {}) {
  if (typeof doFetch !== 'function') throw new Error('fetchAccountPage needs a fetch function');
  const opts = { fetch: doFetch, cursor, timeoutMs, token, mode, headers };
  switch (account.service) {
    case 'bluesky': return blueskyPage(account, opts);
    case 'mastodon': return mastodonPage(account, opts);
    case 'github': return githubPage(account, opts);
    default: throw new Error(`No feed for service: ${account.service}`);
  }
}

/**
 * Page until `want` items pass the tag filter, at most 3 pages.
 * Returns every item fetched (unfiltered); the caller filters and merges.
 * @returns {Promise<{ items: object[], cursor: string|null, done: boolean }>}
 */
export async function collectItems(account, { fetch: doFetch, tags, want = 12, token, mode = 'build', cursor = null, timeoutMs, headers } = {}) {
  const items = [];
  let passing = 0;
  let next = cursor;
  let done = false;
  for (let page = 0; page < MAX_PAGES && !done; page++) {
    const res = await fetchAccountPage(account, { fetch: doFetch, cursor: next, token, mode, timeoutMs, headers });
    items.push(...res.items);
    passing += res.items.filter((i) => matchesTags(i, tags)).length;
    next = res.cursor;
    done = res.done;
    if (passing >= want) break;
  }
  return { items, cursor: next, done };
}
