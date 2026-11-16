/**
 * @file social-feed.js
 * @description Fills each empty `<social-feed>` at build with recent posts from
 * the site's Bluesky, Mastodon and GitHub accounts (config/social.json).
 *
 * Each account is fetched at most once per build (`cook dev` reuses a result
 * for 10 minutes). A successful fetch with at least one item writes
 * data/social-feeds/<service>-<slug>.json; a failed one falls back to that
 * snapshot. `COOK_OFFLINE=1` uses snapshots only. Feeds never fail a build.
 */

import chalk from 'chalk';
import Util from '../utils/util/util.js';
import { getSocial } from '../utils/config/config.js';
import { normalizeAccounts } from '../social/accounts.js';
import { feedAccounts, parseFeedAttrs, renderSocialFeed } from '../social/feeds/block.js';
import { collectItems } from '../social/feeds/fetch.js';
import { readSnapshot, writeSnapshot } from '../social/feeds/snapshots.js';

const TAG = '[social-feed] ';
const SKIP_INSIDE = 'pre, code, template, textarea';
const ATTRS = ['accounts', 'tags', 'items', 'height'];
/** Enough for the largest first batch (50) plus the buffer (24); paging stops at 3 pages anyway. */
const WANT = 74;
const HEADERS = { 'User-Agent': 'cook-ssg' };

/** account key → { at, failed?, promise } */
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

/** Fetch one account, or fall back to its snapshot. Never rejects. */
async function loadAccount(account, entry) {
  const rootDir = process.cwd();
  const { key, service, handle, did } = account;
  const fromSnapshot = (why) => {
    entry.failed = true;
    const items = readSnapshot(rootDir, account);
    warn(`${TAG}${key}: ${why}; ${items ? 'using the snapshot' : 'no snapshot, so nothing from this account'}`);
    return { items: items || [], cursor: null, done: false };
  };
  if (offline()) return fromSnapshot('COOK_OFFLINE is set');
  const doFetch = feedFetch || globalThis.fetch;
  try {
    const target = { key, service, handle };
    if (did) target.did = did;
    const res = await collectItems(target, {
      fetch: doFetch,
      want: WANT,
      mode: 'build',
      token: process.env.GITHUB_TOKEN || undefined,
      headers: HEADERS,
    });
    if (res.items.length) writeSnapshot(rootDir, account, res.items);
    return { items: res.items, cursor: res.cursor, done: res.done };
  } catch (err) {
    return fromSnapshot(err && err.message ? err.message : String(err));
  }
}

function accountResult(account) {
  let entry = cache.get(account.key);
  if (!entry) {
    entry = { at: Date.now() };
    entry.promise = loadAccount(account, entry);
    cache.set(account.key, entry);
  }
  return entry.promise;
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

    const results = await Promise.all(accounts.map((a) => accountResult(a)));
    const itemsByKey = {};
    const cursorsByKey = {};
    accounts.forEach((a, i) => {
      itemsByKey[a.key] = results[i].items;
      cursorsByKey[a.key] = { cursor: results[i].cursor, done: results[i].done };
    });

    el.innerHTML = renderSocialFeed(attrs, { accounts, itemsByKey, cursorsByKey });
    el.setAttribute('style', withHeight(el.getAttribute('style'), opts.height));
  }
  Util.commitDom(file, dom, true);
}
