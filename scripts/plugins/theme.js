/**
 * @file theme.js
 * @description Site theme setting and the per-page theme plan (pure
 * functions), plus themeInject, the per-page build step that writes
 * data-theme / data-mode and the theme stylesheet links.
 */

import chalk from 'chalk';
import Util from '../utils/util/util.js';
import { theme as themeConfig } from '../utils/config/config.js';

const SAFE_ID = /^[a-z0-9-]+$/;
const isSafeId = (v) => typeof v === 'string' && SAFE_ID.test(v);
const has = (obj, key) => !!obj && Object.hasOwn(obj, key);
const isUrl = (v) => typeof v === 'string'
  && !/[\s"'`<>\\]/.test(v)
  && ((v.startsWith('/') && !v.startsWith('//')) || /^https?:\/\/[^/]/.test(v));
const TAG = '[theme] ';

/**
 * Validate a raw theme setting (config/theme.json or main.js `theme`).
 * @param {unknown} raw
 * @returns {{ setting: object|null, warnings: string[] }}
 */
export function normalizeThemeSetting(raw) {
  const warnings = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { setting: null, warnings };
  if (!isSafeId(raw.name)) {
    warnings.push(`${TAG}theme setting ignored: unsafe or missing name ${JSON.stringify(raw.name)}`);
    return { setting: null, warnings };
  }
  let adjust = null;
  if (raw.adjust != null) {
    if (isSafeId(raw.adjust)) adjust = raw.adjust;
    else warnings.push(`${TAG}theme adjust ignored: unsafe id ${JSON.stringify(raw.adjust)}`);
  }
  const mode = ['auto', 'light', 'dark'].includes(raw.mode) ? raw.mode : 'auto';
  const files = Object.create(null);
  for (const [id, url] of Object.entries(raw.files || {})) {
    if (isSafeId(id) && isUrl(url)) files[id] = url;
    else warnings.push(`${TAG}theme file ignored: ${JSON.stringify(id)}`);
  }
  const modes = Object.create(null);
  for (const [id, m] of Object.entries(raw.modes || {})) {
    if (isSafeId(id) && (m === 'light' || m === 'dark')) modes[id] = m;
    else warnings.push(`${TAG}theme mode ignored: ${JSON.stringify(id)}`);
  }
  return { setting: { name: raw.name, mode, adjust, files, modes }, warnings };
}

/**
 * Work out what a page gets: data-theme ids, forced scheme, stylesheet links.
 * Ids always start with the theme name, including "default".
 * @param {object|null} setting - Normalized setting
 * @param {object} [frontMatter]
 * @param {string} [pagePath] - For warnings
 */
export function pageThemePlan(setting, frontMatter = {}, pagePath = '') {
  if (!setting) return null;
  const warnings = [];
  const where = pagePath || 'page';
  const fm = frontMatter || {};

  const problems = [];
  let pageTheme = null;
  if (fm.theme != null) {
    if (isSafeId(fm.theme)) pageTheme = fm.theme;
    else problems.push(`theme ${JSON.stringify(fm.theme)} (use a-z, 0-9 and hyphens)`);
  }
  let scope = 'page';
  if (fm.themeScope != null) {
    if (fm.themeScope === 'page' || fm.themeScope === 'article') scope = fm.themeScope;
    else problems.push(`themeScope ${JSON.stringify(fm.themeScope)} (use page or article)`);
  }
  if (problems.length) warnings.push(`${TAG}${where}: front matter ignored: ${problems.join('; ')}`);

  const siteIds = [setting.name, ...(setting.adjust ? [setting.adjust] : [])];
  const siteForced = setting.mode === 'light' || setting.mode === 'dark' ? setting.mode : null;
  const forced = (id) => (has(setting.modes, id) ? setting.modes[id] : null) || siteForced;

  let html;
  let scoped = null;
  let linkIds;
  if (pageTheme && scope === 'article') {
    html = { ids: siteIds, mode: forced(setting.name) };
    scoped = { ids: [pageTheme], mode: forced(pageTheme) };
    linkIds = [...siteIds, pageTheme];
  } else if (pageTheme) {
    html = { ids: [pageTheme], mode: forced(pageTheme) };
    linkIds = [pageTheme];
  } else {
    html = { ids: siteIds, mode: forced(setting.name) };
    linkIds = siteIds;
  }

  const links = [];
  for (const id of [...new Set(linkIds)]) {
    if (has(setting.files, id) && typeof setting.files[id] === 'string') links.push({ id, href: setting.files[id] });
  }
  return { html, scoped, links, warnings };
}


// INJECT (PER PAGE)
// -----------------------------
const VB_CSS = /vanilla-breeze[^/]*\.css/;
let cachedSetting;
let settingReady = false;

function getSetting() {
  if (!settingReady) {
    settingReady = true;
    const { setting, warnings } = normalizeThemeSetting(themeConfig);
    for (const w of warnings) console.log(chalk.yellow(w));
    cachedSetting = setting;
  }
  return cachedSetting;
}

function setTheme(el, { ids, mode }) {
  if (ids.length) el.setAttribute('data-theme', ids.join(' '));
  if (mode) el.setAttribute('data-mode', mode);
}

/**
 * Per page: theme attributes on <html> (or the article) and stylesheet links.
 * Does nothing when there is no theme setting.
 */
export async function themeInject({ file, allowType }) {
  const setting = getSetting();
  if (!setting) return;
  if (!Util.isAllowedType({ file, allowType })) return;

  const dom = Util.fileDom(file);
  const document = dom.window.document;
  const html = document.documentElement;
  // Partials (no <html>) are not pages: leave them untouched
  if (!html || html.tagName !== 'HTML') return;

  const plan = pageThemePlan(setting, file.frontMatter, file.path);
  const warnings = [...plan.warnings];
  let head = document.querySelector('head');
  if (!head) {
    head = document.createElement('head');
    html.insertBefore(head, html.firstChild);
  }

  let htmlTheme = plan.html;
  let links = plan.links;
  if (plan.scoped) {
    const target = document.querySelector('article') || document.querySelector('main');
    if (target) {
      setTheme(target, plan.scoped);
    } else {
      warnings.push(`[theme] ${file.path}: no <article> or <main> for themeScope article; applied to the whole page`);
      htmlTheme = plan.scoped;
      links = plan.links.filter(l => plan.scoped.ids.includes(l.id));
    }
  }
  for (const w of warnings) console.log(chalk.yellow(w));

  setTheme(html, htmlTheme);
  html.setAttribute('data-theme-source', 'site');

  {
    const sheets = [...document.querySelectorAll('link[rel~="stylesheet"]')];
    const present = new Set();
    for (const l of document.querySelectorAll('link')) {
      if (l.hasAttribute('data-vb-theme')) present.add(`id:${l.getAttribute('data-vb-theme')}`);
    }
    for (const l of sheets) present.add(`href:${l.getAttribute('href')}`);
    let anchor = sheets.filter(l => VB_CSS.test(l.getAttribute('href') || '')).pop() || null;
    for (const { id, href } of links) {
      if (present.has(`id:${id}`) || present.has(`href:${href}`)) continue;
      const link = document.createElement('link');
      link.setAttribute('rel', 'stylesheet');
      link.setAttribute('href', href);
      link.setAttribute('data-vb-theme', id);
      if (anchor) anchor.after(link);
      else head.appendChild(link);
      anchor = link;
    }
  }
  Util.commitDom(file, dom);
}
