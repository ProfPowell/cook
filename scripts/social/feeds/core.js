/**
 * @file core.js
 * @description The pure core of `<social-feed>`: turn Bluesky, Mastodon and
 * GitHub API responses into one item shape, filter and merge them, and render
 * the entry markup. It imports nothing and uses no Node built-ins, so Vanilla
 * Breeze copies it verbatim into the browser.
 *
 * Item shape (shared with Vanilla Breeze):
 *   { id, service, source, url, date, text, tags, reposted,
 *     author: { name, handle, avatar?, url? },
 *     image?: { url, alt },
 *     counts?: { replies, reposts, likes },
 *     release?: { repo, tag, repoUrl?, description, language } }
 * Every URL is https:; a field whose URL is not is left out, and an item whose
 * own `url` is not is dropped.
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (v === null || v === undefined ? '' : String(v));

/** Escape text for HTML text and double- or single-quoted attribute values. */
export const escapeHtml = (s) => str(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * @param {unknown} url
 * @returns {string|null} the normalized URL when it parses as https:, else null
 */
export function safeHttps(url) {
  if (typeof url !== 'string' || !url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

/** @returns {string|null} ISO 8601, or null for a missing or bad date */
function isoDate(v) {
  if (typeof v !== 'string' || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const cleanTag = (t) => str(t).trim().replace(/^#+/, '').toLowerCase();

function tagList(list) {
  const out = [];
  for (const t of list) {
    const c = cleanTag(t);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function makeAuthor({ name, handle, avatar, url }) {
  const author = { name: str(name || handle), handle: str(handle) };
  const a = safeHttps(avatar);
  if (a) author.avatar = a;
  const u = safeHttps(url);
  if (u) author.url = u;
  return author;
}

function makeImage(url, alt) {
  const u = safeHttps(url);
  return u ? { url: u, alt: str(alt) } : undefined;
}

/** Assemble an item in the contract's key order, leaving out absent optional parts. */
function makeItem({ id, service, source, url, date, text, tags, reposted, author, image, counts, release }) {
  const safeUrl = safeHttps(url);
  if (!safeUrl || !date) return null;
  const item = { id, service, source, url: safeUrl, date, text: str(text), tags, reposted: !!reposted, author };
  if (image) item.image = image;
  if (counts) item.counts = counts;
  if (release) item.release = release;
  return item;
}

/* ---------------------------------------------------------------- Bluesky */

function bskyImage(embed) {
  if (!isObj(embed)) return undefined;
  const type = str(embed.$type);
  if (type.startsWith('app.bsky.embed.external#view') && isObj(embed.external)) {
    return makeImage(embed.external.thumb, embed.external.title);
  }
  if (type.startsWith('app.bsky.embed.images#view') && Array.isArray(embed.images) && isObj(embed.images[0])) {
    return makeImage(embed.images[0].thumb || embed.images[0].fullsize, embed.images[0].alt);
  }
  if (type.startsWith('app.bsky.embed.recordWithMedia#view')) return bskyImage(embed.media);
  return undefined;
}

/**
 * @param {unknown} body an app.bsky.feed.getAuthorFeed response
 * @param {{ key: string, service: string, handle: string, did?: string }} account
 * @returns {{ items: object[], cursor: string|null }}
 */
export function normalizeBluesky(body, account) {
  const feed = isObj(body) && Array.isArray(body.feed) ? body.feed : [];
  const items = [];
  for (const entry of feed) {
    if (!isObj(entry) || !isObj(entry.post)) continue;
    const { post } = entry;
    const record = isObj(post.record) ? post.record : {};
    const reposted = isObj(entry.reason) && entry.reason.$type === 'app.bsky.feed.defs#reasonRepost';
    if (!reposted && (record.reply || entry.reply)) continue;
    const author = isObj(post.author) ? post.author : {};
    const handle = str(author.handle || author.did);
    const rkey = str(post.uri).split('/').pop();
    if (!handle || !rkey) continue;
    const facetTags = (Array.isArray(record.facets) ? record.facets : [])
      .flatMap((f) => (isObj(f) && Array.isArray(f.features) ? f.features : []))
      .filter((f) => isObj(f) && f.$type === 'app.bsky.richtext.facet#tag')
      .map((f) => f.tag);
    const item = makeItem({
      id: `bluesky:${post.uri}`,
      service: 'bluesky',
      source: account.key,
      url: `https://bsky.app/profile/${encodeURIComponent(handle)}/post/${encodeURIComponent(rkey)}`,
      date: isoDate(reposted ? entry.reason.indexedAt : record.createdAt || post.indexedAt),
      text: record.text,
      tags: tagList([...facetTags, ...(Array.isArray(record.tags) ? record.tags : [])]),
      reposted,
      author: makeAuthor({
        name: author.displayName,
        handle: `@${handle}`,
        avatar: author.avatar,
        url: `https://bsky.app/profile/${encodeURIComponent(handle)}`,
      }),
      image: bskyImage(post.embed),
      counts: { replies: num(post.replyCount), reposts: num(post.repostCount), likes: num(post.likeCount) },
    });
    if (item) items.push(item);
  }
  const cursor = isObj(body) && typeof body.cursor === 'string' && body.cursor ? body.cursor : null;
  return { items, cursor };
}

/* --------------------------------------------------------------- Mastodon */

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(s) {
  return s.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? whole : named;
  });
}

/** Mastodon status HTML to plain text: `<br>` and paragraph breaks become newlines. */
function htmlToText(html) {
  const text = str(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p(?:\s[^>]*)?>/gi, '\n')
    .replace(/<[^<>]*>/g, '');
  return decodeEntities(text).trim();
}

function hostOf(url) {
  try { return new URL(url).host; } catch { return ''; }
}

function mastodonHandle(acc) {
  const acct = str(acc.acct || acc.username);
  if (!acct) return '';
  if (acct.includes('@')) return `@${acct}`;
  const host = hostOf(acc.url);
  return host ? `@${acct}@${host}` : `@${acct}`;
}

function mastodonImage(status) {
  const media = (Array.isArray(status.media_attachments) ? status.media_attachments : [])
    .find((m) => isObj(m) && (m.type === 'image' || m.type === 'gifv'));
  if (media) return makeImage(media.preview_url || media.url, media.description);
  if (isObj(status.card)) return makeImage(status.card.image, status.card.title);
  return undefined;
}

/**
 * @param {unknown} statuses a /api/v1/accounts/:id/statuses response
 * @param {{ key: string, service: string, handle: string }} account
 * @returns {{ items: object[], cursor: string|null }} cursor is the last status id
 */
export function normalizeMastodon(statuses, account) {
  const list = Array.isArray(statuses) ? statuses : [];
  const items = [];
  for (const outer of list) {
    if (!isObj(outer)) continue;
    const reposted = isObj(outer.reblog);
    const status = reposted ? outer.reblog : outer;
    if (!reposted && outer.in_reply_to_id) continue;
    const acc = isObj(status.account) ? status.account : {};
    const item = makeItem({
      id: `mastodon:${status.uri || status.id}`,
      service: 'mastodon',
      source: account.key,
      url: status.url || status.uri,
      date: isoDate(outer.created_at),
      text: htmlToText(status.content),
      tags: tagList((Array.isArray(status.tags) ? status.tags : []).map((t) => (isObj(t) ? t.name : t))),
      reposted,
      author: makeAuthor({ name: acc.display_name || acc.username, handle: mastodonHandle(acc), avatar: acc.avatar, url: acc.url }),
      image: mastodonImage(status),
      counts: { replies: num(status.replies_count), reposts: num(status.reblogs_count), likes: num(status.favourites_count) },
    });
    if (item) items.push(item);
  }
  const last = list[list.length - 1];
  const cursor = isObj(last) && last.id !== undefined && last.id !== null ? String(last.id) : null;
  return { items, cursor };
}

/* ----------------------------------------------------------------- GitHub */

function releaseItem(release, repo, account) {
  if (!isObj(release) || release.draft || release.prerelease) return null;
  if (release.id === undefined || release.id === null) return null;
  const tag = str(release.tag_name);
  const repoName = str(repo && repo.name);
  const by = isObj(release.author) ? release.author : {};
  const login = str(by.login || account.handle);
  const details = { repo: repoName, tag };
  const repoUrl = safeHttps(repo && repo.html_url);
  if (repoUrl) details.repoUrl = repoUrl;
  details.description = repo && repo.description != null ? str(repo.description) : null;
  details.language = repo && repo.language != null ? str(repo.language) : null;
  return makeItem({
    id: `github:${release.id}`,
    service: 'github',
    source: account.key,
    url: release.html_url,
    date: isoDate(release.published_at),
    text: `Released ${repoName} ${tag}`,
    tags: [],
    reposted: false,
    author: makeAuthor({
      name: login,
      handle: login,
      avatar: by.avatar_url,
      url: by.html_url || (login ? `https://github.com/${encodeURIComponent(login)}` : null),
    }),
    release: details,
  });
}

/**
 * @param {unknown} releases a /repos/:owner/:repo/releases response
 * @param {{ name: string, html_url: string, description?: string|null, language?: string|null }} repo
 * @param {{ key: string, service: string, handle: string }} account
 * @returns {object[]} published, non-draft, non-prerelease releases
 */
export function normalizeGithubReleases(releases, repo, account) {
  return (Array.isArray(releases) ? releases : [])
    .map((r) => releaseItem(r, repo, account))
    .filter(Boolean);
}

/**
 * @param {unknown} events a /users/:user/events/public response
 * @param {{ key: string, service: string, handle: string }} account
 * @returns {object[]} items for published stable releases, ids matching normalizeGithubReleases
 */
export function normalizeGithubEvents(events, account) {
  const items = [];
  for (const ev of Array.isArray(events) ? events : []) {
    if (!isObj(ev) || ev.type !== 'ReleaseEvent' || !isObj(ev.payload)) continue;
    if (ev.payload.action !== 'published' || !isObj(ev.payload.release)) continue;
    const fullName = str(isObj(ev.repo) ? ev.repo.name : '');
    if (!fullName) continue;
    const actor = isObj(ev.actor) ? ev.actor : {};
    const release = isObj(ev.payload.release.author) || !actor.login
      ? ev.payload.release
      : { ...ev.payload.release, author: { login: actor.login, avatar_url: actor.avatar_url } };
    const repo = {
      name: fullName.split('/').pop(),
      html_url: `https://github.com/${fullName.split('/').map(encodeURIComponent).join('/')}`,
      description: null,
      language: null,
    };
    const item = releaseItem(release, repo, account);
    if (item) items.push(item);
  }
  return items;
}

/* ---------------------------------------------------------- filter, merge */

/**
 * @param {{ tags?: string[] }} item
 * @param {string[]|undefined} tags wanted hashtags, '#' optional, any case
 * @returns {boolean} true when no tags are wanted or the item carries one of them
 */
export function matchesTags(item, tags) {
  const wanted = tagList(Array.isArray(tags) ? tags : []);
  if (!wanted.length) return true;
  const have = isObj(item) && Array.isArray(item.tags) ? item.tags.map(cleanTag) : [];
  return wanted.some((t) => have.includes(t));
}

/**
 * Filter by tags, sort newest first (ties by id), dedupe by id keeping the
 * newest, then take `limit`.
 * @param {object[][]} lists
 * @param {{ tags?: string[], limit?: number }} [options]
 * @returns {object[]}
 */
export function mergeItems(lists, { tags, limit } = {}) {
  const all = (Array.isArray(lists) ? lists : [])
    .flatMap((l) => (Array.isArray(l) ? l : []))
    .filter((i) => isObj(i) && safeHttps(i.url) && matchesTags(i, tags));
  all.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const seen = new Set();
  const out = [];
  for (const item of all) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return Number.isInteger(limit) && limit > 0 ? out.slice(0, limit) : out;
}

/* ----------------------------------------------------------------- render */

const DATE_FORMAT = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' });

function mediumDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : DATE_FORMAT.format(d);
}

const COUNT_LABELS = {
  mastodon: ['replies', 'boosts', 'favourites'],
  default: ['replies', 'reposts', 'likes'],
};

function renderCounts(item) {
  const labels = COUNT_LABELS[item.service] || COUNT_LABELS.default;
  const c = item.counts;
  const values = [c.replies, c.reposts, c.likes];
  const glyphs = ['↩', '⟲', '♡'];
  const lis = glyphs.map((g, i) =>
    `<li><span aria-hidden="true">${g}</span> ${num(values[i])}<span class="visually-hidden"> ${labels[i]}</span></li>`);
  return `<ul class="social-feed-counts">${lis.join('')}</ul>`;
}

/**
 * @param {object} item
 * @param {{ hideCounts?: boolean, serviceName?: string }} [options]
 * @returns {string} one `<article data-activity>`, or '' when the item has no https url
 */
export function renderEntry(item, { hideCounts = false, serviceName } = {}) {
  if (!isObj(item)) return '';
  const url = safeHttps(item.url);
  if (!url) return '';
  const e = escapeHtml;
  const author = isObj(item.author) ? item.author : {};
  const parts = [`<article data-activity data-id="${e(item.id)}" data-service="${e(item.service)}">`];
  const avatar = safeHttps(author.avatar);
  if (avatar) parts.push(`<img class="social-feed-avatar" src="${e(avatar)}" alt="" width="40" height="40" loading="lazy">`);
  parts.push(`<header class="social-feed-head"><b>${e(author.name || author.handle)}</b> <span class="social-feed-handle">${e(author.handle)}</span> <a class="social-feed-permalink" href="${e(url)}"><time datetime="${e(item.date)}">${e(mediumDate(item.date))}</time></a> <span class="social-feed-source">${e(serviceName || item.service)}</span></header>`);
  if (item.reposted) parts.push('<p class="social-feed-reposted">Reposted</p>');
  // `<br>`, not a raw newline: a whitespace-collapsing minifier keeps it.
  parts.push(`<p class="social-feed-text">${e(item.text).replace(/\r?\n/g, '<br>')}</p>`);
  const image = isObj(item.image) ? safeHttps(item.image.url) : null;
  if (image) parts.push(`<a class="social-feed-image" href="${e(url)}"><img src="${e(image)}" alt="${e(item.image.alt)}" loading="lazy"></a>`);
  if (isObj(item.release)) {
    const r = item.release;
    const repoUrl = safeHttps(r.repoUrl);
    const href = repoUrl ? ` href="${e(repoUrl)}"` : '';
    parts.push(`<div class="social-feed-release"><a${href}>${e(r.repo)}</a> <span>${e(r.description)}</span> <span>${e(r.language)}</span></div>`);
  }
  if (!hideCounts && isObj(item.counts)) parts.push(renderCounts(item));
  parts.push('</article>');
  return parts.join('\n');
}

/**
 * The three HTML fragments Cook writes into `<social-feed>`.
 * @param {{ items: object[], accounts: Array<{ service: string, profileUrl?: string }>,
 *   hideCounts?: boolean, services: Record<string, { name: string }> }} options
 * @returns {{ entries: string, empty: string, more: string }}
 */
export function renderFeedParts({ items, accounts, hideCounts = false, services } = {}) {
  const nameOf = (id) => (isObj(services) && isObj(services[id]) && services[id].name) || str(id);
  const list = Array.isArray(items) ? items : [];
  const entries = list
    .map((item) => renderEntry(item, { hideCounts, serviceName: isObj(item) ? nameOf(item.service) : '' }))
    .filter(Boolean)
    .join('\n');
  const empty = entries ? '' : '<p class="social-feed-empty">Nothing yet</p>';
  const links = (Array.isArray(accounts) ? accounts : [])
    .filter(isObj)
    .map((a) => {
      const href = safeHttps(a.profileUrl);
      return href ? `<a href="${escapeHtml(href)}">${escapeHtml(nameOf(a.service))}</a>` : '';
    })
    .filter(Boolean);
  const more = links.length ? `<p class="social-feed-more">More on ${links.join(' · ')}</p>` : '';
  return { entries, empty, more };
}
