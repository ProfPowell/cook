/**
 * @file socialspec.js
 * @description Pure renderers for the three SocialSpec profile files:
 * `following.opml` (FollowSpec), `about.md` (AboutSpec) and `contact.vcf`
 * (ContactSpec). No fs and no config reads; `about.file` is read through an
 * injected `readFile`.
 */

const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';

const escapeXml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * OPML 2.0 subscription list. Public entries only, in the order given.
 * @param {Array<{ title?: string, feedUrl?: string, siteUrl?: string, public?: boolean }>} following
 * @param {{ title?: string }} [options]
 * @returns {string|null} null when there is no public entry with a feedUrl
 */
export function renderOpml(following, { title } = {}) {
  if (!Array.isArray(following)) return null;
  const outlines = following
    .filter((e) => e && e.public !== false && nonEmpty(e.feedUrl))
    .map((e) => {
      const text = escapeXml(nonEmpty(e.title) ? e.title : e.feedUrl);
      const html = nonEmpty(e.siteUrl) ? ` htmlUrl="${escapeXml(e.siteUrl)}"` : '';
      return `    <outline type="rss" text="${text}" title="${text}" xmlUrl="${escapeXml(e.feedUrl)}"${html}/>`;
    });
  if (!outlines.length) return null;
  const head = escapeXml(nonEmpty(title) ? title : 'Following');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head>',
    `    <title>${head}</title>`,
    '  </head>',
    '  <body>',
    ...outlines,
    '  </body>',
    '</opml>',
    '',
  ].join('\n');
}

/**
 * about.md: optional `summary` front matter, then the Markdown body with
 * root-relative link and image targets made absolute.
 * @param {{ summary?: string, body?: string, file?: string }} about `body` wins over `file`
 * @param {{ siteUrl?: string, readFile?: (path: string) => string }} [options]
 * @returns {string|null} null when there is no summary and no body
 */
export function renderAbout(about, { siteUrl, readFile } = {}) {
  if (!about || typeof about !== 'object') return null;
  let body = '';
  if (nonEmpty(about.body)) {
    body = about.body;
  } else if (nonEmpty(about.file) && typeof readFile === 'function') {
    try {
      body = String(readFile(about.file));
    } catch {
      body = '';
    }
  }
  body = body.replace(/\r\n?/g, '\n').trim();
  if (siteUrl && body) {
    const base = String(siteUrl).replace(/\/+$/, '');
    // `](/path` but not protocol-relative `](//host`
    body = body.replace(/\]\(\/(?!\/)/g, `](${base}/`);
  }
  const summary = nonEmpty(about.summary) ? about.summary.trim() : '';
  if (!summary && !body) return null;
  // A JSON string is a valid YAML double-quoted scalar: safe for `:`, quotes, `#`, newlines.
  const front = summary ? `---\nsummary: ${JSON.stringify(summary)}\n---\n\n` : '';
  return `${front}${body}\n`;
}

const escapeVcardText = (s) =>
  String(s)
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');

/** Fold one content line at 75 octets (RFC 6350), never splitting a character. */
function fold(line) {
  if (Buffer.byteLength(line) <= 75) return line;
  const parts = [];
  let cur = '';
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (curBytes + n > limit) {
      parts.push(cur);
      cur = '';
      curBytes = 0;
      limit = 74; // continuation lines carry a leading space
    }
    cur += ch;
    curBytes += n;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

/**
 * vCard 4.0 for contact.vcf.
 * @param {{ name?: string, email?: string|string[], url?: string, org?: string, title?: string }} contact
 * @param {{ siteUrl?: string }} [options] `URL` defaults to siteUrl
 * @returns {{ text: string|null, warning?: string }}
 */
export function renderVcard(contact, { siteUrl } = {}) {
  const c = contact && typeof contact === 'object' ? contact : {};
  if (!nonEmpty(c.name)) {
    return { text: null, warning: 'social: contact has no name, so contact.vcf was not written (FN is required)' };
  }
  const lines = ['BEGIN:VCARD', 'VERSION:4.0', `FN:${escapeVcardText(c.name.trim())}`];
  if (nonEmpty(c.org)) lines.push(`ORG:${escapeVcardText(c.org.trim())}`);
  if (nonEmpty(c.title)) lines.push(`TITLE:${escapeVcardText(c.title.trim())}`);
  const emails = (Array.isArray(c.email) ? c.email : [c.email]).filter(nonEmpty);
  emails.forEach((e, i) => lines.push(`${i === 0 ? 'EMAIL;PREF=1' : 'EMAIL'}:${escapeVcardText(e.trim())}`));
  const url = nonEmpty(c.url) ? c.url : siteUrl;
  // URI value type: not text-escaped (RFC 6350); only strip whitespace so it cannot break a line.
  if (nonEmpty(url)) lines.push(`URL:${String(url).replace(/\s+/g, '')}`);
  lines.push('END:VCARD');
  return { text: lines.map(fold).join('\r\n') + '\r\n' };
}
