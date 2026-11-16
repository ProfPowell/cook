/**
 * @file social-feed.js
 * @description Fills each empty `<social-feed>` at build with recent posts from
 * the site's Bluesky, Mastodon and GitHub accounts (config/social.json).
 *
 * Each account is fetched at most once per build (`cook dev` reuses a result
 * for 10 minutes): one page when that covers every block's `items`, and for a
 * block with `tags` further pages from the cached cursor until enough posts
 * match, at most 3 pages in all. A successful fetch with at least one item writes
 * data/social-feeds/<service>-<slug>.json; a failed one falls back to that
 * snapshot. `COOK_OFFLINE=1` uses snapshots only (one note per build; an
 * account with no snapshot still warns). Feeds never fail a build.
 *
 * `--social-feed-height` is written inline only from a valid `height`; without
 * one the component's CSS default (32rem) applies.
 */

import chalk from 'chalk';
import Util from '../utils/util/util.js';
import { getSocial } from '../utils/config/config.js';
import { normalizeAccounts } from '../social/accounts.js';
import { feedAccounts, parseFeedAttrs, renderSocialFeed } from '../social/feeds/block.js';
import { fetchAccountPage } from '../social/feeds/fetch.js';
import { matchesTags } from '../social/feeds/core.js';
import { readSnapshot, writeSnapshot } from '../social/feeds/snapshots.js';

const TAG = '[social-feed] ';
const SKIP_INSIDE = 'pre, code, template, textarea';
const ATTRS = ['accounts', 'tags', 'items', 'height'];
/** Pages fetched per account per build, at most. */
const MAX_PAGES = 3;
const HEADERS = { 'User-Agent': 'cook-ssg' };

/** account key → { at, target, items, cursor, done, pages, stopped, failed?, chain } */
const cache = new Map();
let maxAgeMs = 0;
let feedFetch = null;
let allAccounts = null;
let warned = new Set();

/** Tests and tools: use this fetch instead of the global one (null restores it). */
export function setFeedFetch(fn) {
  feedFetch = typeof fn === 'function' ? fn : null;
}

/** `cook dev`: keep successful results this long across rebuilds. */
export function setFeedCacheMaxAge(ms) {
  maxAgeMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
}

/**
 * Start a build: forget the accounts and warnings, and drop cached results
 * except successful ones younger than the max age (0 outside `cook dev`).
 */
export function resetSocialFeeds() {
  allAccounts = null;
  warned = new Set();
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.failed || !(maxAgeMs > 0 && now - entry.at < maxAgeMs)) cache.delete(key);
  }
}

function warn(message) {
  if (warned.has(message)) return;
  warned.add(message);
  console.log(chalk.yellow(message));
}

const offline = () => {
  const v = process.env.COOK_OFFLINE;
  return !!v && v !== '0' && v.toLowerCase() !== 'false';
};

/**
 * Make sure the account's cached result has at least `want` items passing
 * `tags`, fetching further pages from the cached cursor as needed (at most 3
 * pages per account per build). The first page failing falls back to the
 * snapshot; a later page failing keeps what was fetched. Never rejects.
 * @returns {Promise<{ items: object[], cursor: string|null, done: boolean }>}
 *   a copy taken now, so a block's state matches the pages fetched so far
 */
function accountResult(account, { want, tags }) {
  let entry = cache.get(account.key);
  if (!entry) {
    const target = { key: account.key, service: account.service, handle: account.handle };
    if (account.did) target.did = account.did;
    entry = { at: Date.now(), target, items: [], cursor: null, done: false, pages: 0, stopped: false, chain: Promise.resolve() };
    cache.set(account.key, entry);
  }
  entry.chain = entry.chain.then(() => extend(account, entry, { want, tags }));
  return entry.chain.then(() => ({ items: [...entry.items], cursor: entry.cursor, done: entry.done }));
}

async function extend(account, entry, { want, tags }) {
  const rootDir = process.cwd();
  const { key } = account;
  if (entry.failed) return;
  if (entry.pages === 0 && offline()) return useSnapshot(account, entry, 'COOK_OFFLINE is set', { quiet: true });
  const passing = () => entry.items.filter((i) => matchesTags(i, tags)).length;
  while (!entry.done && !entry.stopped && entry.pages < MAX_PAGES && (entry.pages === 0 || passing() < want)) {
    try {
      const res = await fetchAccountPage(entry.target, {
        fetch: feedFetch || globalThis.fetch,
        cursor: entry.cursor,
        mode: 'build',
        token: process.env.GITHUB_TOKEN || undefined,
        headers: HEADERS,
      });
      entry.pages += 1;
      entry.items.push(...res.items);
      entry.cursor = res.cursor;
      entry.done = res.done;
      if (entry.items.length) writeSnapshot(rootDir, account, entry.items);
    } catch (err) {
      const why = err && err.message ? err.message : String(err);
      if (entry.pages === 0) return useSnapshot(account, entry, why);
      entry.stopped = true;
      warn(`${TAG}${key}: ${why}; showing the posts fetched before it`);
    }
  }
}

/**
 * A failed or offline account: its snapshot items, no cursor, not done.
 * `quiet` (offline): a found snapshot gives one note per build, not a line per account.
 */
function useSnapshot(account, entry, why, { quiet = false } = {}) {
  entry.failed = true;
  const items = readSnapshot(process.cwd(), account);
  if (items && quiet) warn(`${TAG}${why}; using snapshots`);
  else warn(`${TAG}${account.key}: ${why}; ${items ? 'using the snapshot' : 'no snapshot, so nothing from this account'}`);
  entry.items = items || [];
  entry.cursor = null;
  entry.done = false;
}

/** The element's style with `--social-feed-height` set (replacing an earlier one). */
function withHeight(style, height) {
  const rest = (style || '')
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d && !/^--social-feed-height\s*:/.test(d));
  return [...rest, `--social-feed-height: ${height}`].join('; ');
}

/**
 * Fill each `<social-feed>` that has no element child and is not inside
 * pre, code, template or textarea. A page with no live `<social-feed>` keeps
 * its bytes.
 */
export async function fillSocialFeeds({ file, allowType }) {
  if (!Util.isAllowedType({ file, allowType })) return;
  if (typeof file.src !== 'string' || !file.src.includes('<social-feed')) return;
  const dom = Util.fileDom(file);
  const live = [...dom.window.document.querySelectorAll('social-feed')]
    .filter((el) => !el.closest(SKIP_INSIDE) && el.children.length === 0);
  if (!live.length) return;

  if (allAccounts === null) {
    const raw = getSocial();
    allAccounts = raw === undefined ? [] : normalizeAccounts(raw).all;
  }

  for (const el of live) {
    const attrs = Object.fromEntries(ATTRS.map((name) => [name, el.getAttribute(name)]));
    attrs['hide-counts'] = el.hasAttribute('hide-counts') ? '' : null;
    const opts = parseFeedAttrs(attrs);
    const selected = feedAccounts(allAccounts, attrs.accounts);
    for (const w of [...opts.warnings, ...selected.warnings]) warn(w);
    const accounts = selected.accounts.filter((a) => !opts.tags.length || a.service !== 'github');

    const results = await Promise.all(accounts.map((a) => accountResult(a, { want: opts.items, tags: opts.tags })));
    const itemsByKey = {};
    const cursorsByKey = {};
    accounts.forEach((a, i) => {
      itemsByKey[a.key] = results[i].items;
      cursorsByKey[a.key] = { cursor: results[i].cursor, done: results[i].done };
    });

    el.innerHTML = renderSocialFeed(attrs, { accounts, itemsByKey, cursorsByKey });
    if (opts.height) el.setAttribute('style', withHeight(el.getAttribute('style'), opts.height));
  }
  Util.commitDom(file, dom, true);
}
