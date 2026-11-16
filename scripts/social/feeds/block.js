/**
 * @file block.js
 * @description One `<social-feed>` block: which accounts it reads, its
 * attributes, and the inner HTML Cook writes (entries, "Nothing yet", the
 * "More on" line and the state JSON). Pure: no fs, no network, so Vanilla
 * Press's preview reuses it with snapshot items.
 */

import { SERVICES, serviceById } from '../catalog.js';
import { profileUrl } from '../accounts.js';
import { mergeItems, renderFeedParts, safeHttps } from './core.js';

const TAG = '[social-feed] ';
const FEED_SERVICES = ['bluesky', 'mastodon', 'github'];
const DEFAULT_ITEMS = 12;
const DEFAULT_HEIGHT = '32rem';
const HEIGHT = /^\d+(\.\d+)?(rem|em|px|vh)$/;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const SERVICE_NAMES = Object.fromEntries(SERVICES.map((s) => [s.id, { name: s.name }]));
const keyOf = (a) => `${a.service}:${a.handle}`;

/**
 * The accounts one block reads.
 * Empty `keysAttr`: every visible account of a feed service (bluesky, mastodon,
 * github). Named keys (`<service>:<handle>`, comma separated) include hidden
 * accounts; a key not in the config is skipped with a warning; a key of a
 * non-feed service is ignored silently.
 * @param {object[]|{ all: object[] }} normalized `all` from normalizeAccounts (or its whole result)
 * @param {string|null|undefined} keysAttr the `accounts` attribute
 * @returns {{ accounts: Array<{ key: string, service: string, handle: string, did?: string, profileUrl: string|null }>, warnings: string[] }}
 */
export function feedAccounts(normalized, keysAttr) {
  const list = Array.isArray(normalized) ? normalized : isObj(normalized) && Array.isArray(normalized.all) ? normalized.all : [];
  const feedList = list.filter((a) => isObj(a) && FEED_SERVICES.includes(a.service) && typeof a.handle === 'string' && a.handle);
  const toFeed = (a) => {
    const out = { key: keyOf(a), service: a.service, handle: a.handle };
    if (typeof a.did === 'string' && a.did) out.did = a.did;
    out.profileUrl = safeHttps(a.url) || profileUrl(a);
    return out;
  };
  const raw = typeof keysAttr === 'string' ? keysAttr.trim() : '';
  if (!raw) return { accounts: feedList.filter((a) => !a.hidden).map(toFeed), warnings: [] };

  const accounts = [];
  const warnings = [];
  const seen = new Set();
  for (const key of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    const service = key.includes(':') ? key.slice(0, key.indexOf(':')) : '';
    if (serviceById(service) && !FEED_SERVICES.includes(service)) continue;
    const found = feedList.find((a) => keyOf(a).toLowerCase() === key.toLowerCase());
    if (!found) {
      warnings.push(`${TAG}accounts: "${key}" is not in config/social.json; skipped`);
      continue;
    }
    if (seen.has(keyOf(found))) continue;
    seen.add(keyOf(found));
    accounts.push(toFeed(found));
  }
  return { accounts, warnings };
}

/**
 * Read a block's attributes. Invalid `items` or `height` fall back to the
 * default with a warning.
 * @param {{ accounts?: string|null, tags?: string|null, items?: string|null,
 *   height?: string|null, 'hide-counts'?: string|boolean|null }} attrs
 *   attribute values as authored; a missing attribute is null or undefined
 * @returns {{ accounts: string, tags: string[], items: number, height: string, hideCounts: boolean, warnings: string[] }}
 */
export function parseFeedAttrs(attrs = {}) {
  const a = isObj(attrs) ? attrs : {};
  const warnings = [];
  const has = (v) => v !== undefined && v !== null && v !== false;

  let items = DEFAULT_ITEMS;
  if (has(a.items)) {
    const s = String(a.items).trim();
    const n = /^\d+$/.test(s) ? Number(s) : NaN;
    if (n >= 1 && n <= 50) items = n;
    else warnings.push(`${TAG}items="${a.items}" is not a whole number from 1 to 50; using ${DEFAULT_ITEMS}`);
  }

  let height = DEFAULT_HEIGHT;
  if (has(a.height)) {
    const s = String(a.height).trim();
    if (HEIGHT.test(s)) height = s;
    else warnings.push(`${TAG}height="${a.height}" is not a rem, em, px or vh length; using ${DEFAULT_HEIGHT}`);
  }

  const tags = [];
  for (const t of (has(a.tags) ? String(a.tags) : '').split(',')) {
    const c = t.trim().replace(/^#+/, '').toLowerCase();
    if (c && !tags.includes(c)) tags.push(c);
  }

  return {
    accounts: has(a.accounts) ? String(a.accounts) : '',
    tags,
    items,
    height,
    hideCounts: has(a['hide-counts']),
    warnings,
  };
}

/** Keep only items with the fields the merge and renderer rely on; snapshots are hand-editable. */
function cleanItems(list, key) {
  return (Array.isArray(list) ? list : [])
    .filter((i) => isObj(i) && typeof i.id === 'string' && i.id && typeof i.date === 'string'
      && !Number.isNaN(Date.parse(i.date)) && safeHttps(i.url))
    .map((i) => ({ ...i, source: key }));
}

/** JSON safe inside a `<script>`: no `<`, `>` or `&` survive as raw characters. */
const scriptJson = (value) => JSON.stringify(value)
  .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
  .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/**
 * The inner HTML of one `<social-feed>`.
 * @param {object} attrs attribute values as authored (see parseFeedAttrs)
 * @param {{ accounts?: Array<{ key: string, service: string, handle: string, did?: string, profileUrl?: string|null }>,
 *   itemsByKey?: Record<string, object[]>,
 *   cursorsByKey?: Record<string, { cursor?: string|null, done?: boolean } | string | null> }} data
 *   accounts from feedAccounts; items per account key (fetched or snapshot);
 *   paging state per account key (a missing entry means no cursor, not done)
 * @returns {string}
 */
export function renderSocialFeed(attrs, { accounts = [], itemsByKey = {}, cursorsByKey = {} } = {}) {
  const opts = parseFeedAttrs(attrs);
  const chosen = (Array.isArray(accounts) ? accounts : [])
    .filter((a) => isObj(a) && typeof a.key === 'string')
    .filter((a) => !opts.tags.length || a.service !== 'github');
  const byKey = isObj(itemsByKey) ? itemsByKey : {};
  const cursors = isObj(cursorsByKey) ? cursorsByKey : {};

  const merged = mergeItems(chosen.map((a) => cleanItems(byKey[a.key], a.key)), { tags: opts.tags });
  const shown = merged.slice(0, opts.items);
  const buffer = merged.slice(opts.items);
  const newest = {};
  for (const item of merged) if (!(item.source in newest)) newest[item.source] = item.date;

  const state = {
    accounts: chosen.map((a) => {
      const c = cursors[a.key];
      const cursor = typeof c === 'string' ? c : isObj(c) && typeof c.cursor === 'string' ? c.cursor : null;
      const out = { key: a.key, service: a.service, handle: a.handle };
      if (a.did) out.did = a.did;
      if (cursor) out.cursor = cursor;
      out.done = isObj(c) && c.done === true;
      return out;
    }),
    tags: opts.tags,
    newest,
    buffer,
  };

  const { entries, empty, more } = renderFeedParts({
    items: shown, accounts: chosen, hideCounts: opts.hideCounts, services: SERVICE_NAMES,
  });
  const parts = [
    `<activity-feed aria-label="Recent posts"${entries ? ' data-infinite' : ''}>`,
    ...(entries ? [entries] : []),
    '</activity-feed>',
  ];
  if (empty) parts.push(empty);
  if (more) parts.push(more);
  parts.push(`<script type="application/json" class="social-feed-state">${scriptJson(state)}</script>`);
  return parts.join('\n');
}
