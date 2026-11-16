/**
 * @file socialspec-files.js
 * @description Writes the SocialSpec profile files under `<siteRoot>/.well-known/`
 * (following.opml, about.md, contact.vcf) from the `social` config, and returns
 * their `_headers` blocks. Each key is optional; a site with none writes nothing.
 */

import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'node:path';
import { getSocial, formats as formatsConfig } from '../utils/config/config.js';
import { renderOpml, renderAbout, renderVcard } from '../social/index.js';

const TAG = '[social] ';
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';
const warn = (msg) => console.log(chalk.yellow(`${TAG}${msg}`));
const isHttps = (u) => {
  try { return new URL(u).protocol === 'https:'; } catch { return false; }
};

const TYPES = {
  'following.opml': 'text/x-opml; charset=utf-8',
  'about.md': 'text/markdown; charset=utf-8',
  'contact.vcf': 'text/vcard; charset=utf-8',
};

/** `_headers` block for one written file. */
export function socialHeaderBlock(name) {
  return `/.well-known/${name}\n  Content-Type: ${TYPES[name]}\n  Access-Control-Allow-Origin: *\n`;
}

/**
 * @param {object} opts
 * @param {object} opts.data - build data (`siteUrl`, `siteTitle`)
 * @param {string} opts.rootDir - the site root directory inside dist
 * @param {string} [opts.cwd] - base for `about.file`
 * @returns {string|null} `_headers` blocks for the files written, or null
 */
export function writeSocialspecFiles({ data, rootDir, cwd = process.cwd() }) {
  const raw = getSocial();
  if (!isObj(raw)) return null;
  const hasFollowing = Array.isArray(raw.following) && raw.following.some((e) => e && e.public !== false);
  const hasAbout = isObj(raw.about);
  const hasContact = isObj(raw.contact);
  if (!hasFollowing && !hasAbout && !hasContact) return null;

  const siteUrl = nonEmpty(data?.siteUrl) ? data.siteUrl.replace(/\/+$/, '') : '';
  if (!siteUrl) warn('no siteUrl in the site data; SocialSpec URLs cannot be made absolute');
  if (!formatsConfig?.feed) warn('formats.feed is not set. SocialSpec profiles start from the site feed');

  const out = {};

  if (hasFollowing) {
    const kept = [];
    for (const e of raw.following) {
      if (!e || e.public === false || !nonEmpty(e.feedUrl)) { if (e && e.public !== false) kept.push(e); continue; }
      const label = e.title || e.feedUrl;
      if (!isHttps(e.feedUrl)) { warn(`following "${label}": feedUrl must be an absolute https URL, entry skipped`); continue; }
      if (nonEmpty(e.siteUrl) && !isHttps(e.siteUrl)) { warn(`following "${label}": siteUrl must be an absolute https URL, entry skipped`); continue; }
      kept.push(e);
    }
    const title = `${nonEmpty(data?.siteTitle) ? data.siteTitle : 'Site'} follows`;
    const text = renderOpml(kept, { title });
    if (text) out['following.opml'] = text;
  }

  if (hasAbout) {
    const about = raw.about;
    if (!nonEmpty(about.body) && nonEmpty(about.file) && !fs.existsSync(path.resolve(cwd, about.file))) {
      warn(`about.file "${about.file}" not found`);
    }
    const text = renderAbout(about, {
      siteUrl,
      readFile: (f) => fs.readFileSync(path.resolve(cwd, f), 'utf-8'),
    });
    if (text) out['about.md'] = text;
  }

  if (hasContact) {
    const { text, warning } = renderVcard(raw.contact, { siteUrl });
    if (warning) warn(warning.replace(/^social: /, ''));
    if (text) out['contact.vcf'] = text;
  }

  const names = Object.keys(out);
  if (!names.length) return null;
  const dir = path.join(rootDir, '.well-known');
  fs.mkdirSync(dir, { recursive: true });
  for (const n of names) fs.writeFileSync(path.join(dir, n), out[n]);
  return names.map(socialHeaderBlock).join('\n');
}
