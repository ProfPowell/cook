/**
 * @file theme.js
 * @description Site theme setting and the per-page theme plan (pure functions).
 */

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
