/**
 * @file social-links.js
 * @description Social accounts: reads config/social.json (or main.js `social`),
 * exposes `social.accounts` / `social.allAccounts` data, and fills each empty
 * `<social-links>` element with a `<ul>` of profile links at build time.
 */

import chalk from 'chalk';
import Util from '../utils/util/util.js';
import { getSocial } from '../utils/config/config.js';
import { normalizeAccounts, renderSocialLinks } from '../social/index.js';

const TAG = '[social] ';
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const SKIP_INSIDE = 'pre, code, template, textarea';

let visibleAccounts = [];

/** Set `social` on the data store when a social config exists. */
export async function socialData({ data }) {
  visibleAccounts = [];
  const raw = getSocial();
  if (raw === undefined) return;
  const { all, visible, warnings } = normalizeAccounts(raw);
  for (const w of warnings) console.log(chalk.yellow(`${TAG}${w}`));
  visibleAccounts = visible;
  data.social = { ...(isObj(raw) ? raw : {}), accounts: visible, allAccounts: all };
}

/**
 * Fill each `<social-links>` that has no element child. Leaves the page's bytes
 * alone when it has no live `<social-links>`.
 */
export function fillSocialLinks({ file, allowType }) {
  if (!Util.isAllowedType({ file, allowType })) return;
  if (typeof file.src !== 'string' || !file.src.includes('<social-links')) return;
  const dom = Util.fileDom(file);
  const live = [...dom.window.document.querySelectorAll('social-links')]
    .filter((el) => !el.closest(SKIP_INSIDE) && el.children.length === 0);
  let changed = false;
  for (const el of live) {
    const html = renderSocialLinks(visibleAccounts, { services: el.getAttribute('services') ?? undefined });
    if (!html) continue;
    el.innerHTML = html;
    changed = true;
  }
  Util.commitDom(file, dom, changed);
}
