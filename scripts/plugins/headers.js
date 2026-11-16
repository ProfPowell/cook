/**
 * @file headers.js
 * @description One read-modify-write of the site's `_headers` (Cloudflare Pages,
 * Netlify), shared by sandboxed programs and SocialSpec files. The site's own
 * lines stay first and untouched; generated blocks follow in the order given.
 */

import fs from 'fs-extra';
import path from 'node:path';

/**
 * Append generated header blocks to the existing `_headers` text.
 * @param {string|null} existing
 * @param {Array<string|null>} blocks - block texts; null/empty are skipped
 * @returns {string|null} null when there is nothing to add
 */
export function appendHeaderBlocks(existing, blocks) {
  const add = blocks.filter(Boolean);
  if (!add.length) return null;
  const text = add.join('\n');
  return existing ? `${existing}\n${text}` : text;
}

/** Read `<rootDir>/_headers`, append the blocks, write once. No-op when none. */
export function writeHeaderBlocks(rootDir, blocks) {
  const headersFile = path.join(rootDir, '_headers');
  const existing = fs.existsSync(headersFile) ? fs.readFileSync(headersFile, 'utf-8') : null;
  const out = appendHeaderBlocks(existing, blocks);
  if (out !== null) fs.writeFileSync(headersFile, out);
}
