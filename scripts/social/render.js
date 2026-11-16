/**
 * @file render.js
 * @description Render normalized accounts as the `<ul>` of profile links that
 * goes inside `<social-links>`. Pure: no fs, no config.
 */

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * @param {Array<{ service: string, url: string, name: string, icon?: string }>} accounts
 * @param {{ services?: string, variant?: string }} [options] `variant` is for CSS and
 *   is copied onto the element by the fill step; it does not change the list.
 * @returns {string} the `<ul>…</ul>`, or '' when nothing matches
 */
export function renderSocialLinks(accounts, { services } = {}) {
  if (!Array.isArray(accounts)) return '';
  const wanted = typeof services === 'string' && services.trim()
    ? new Set(services.split(',').map((s) => s.trim()).filter(Boolean))
    : null;
  const items = accounts
    .filter((a) => a && a.url && (!wanted || wanted.has(a.service)))
    .map((a) => {
      const rel = a.service === 'mastodon' ? ' rel="me"' : '';
      return `<li><a href="${escapeHtml(a.url)}"${rel}><span class="social-icon" data-service="${escapeHtml(a.service)}" aria-hidden="true"></span><span>${escapeHtml(a.name)}</span></a></li>`;
    });
  return items.length ? `<ul>${items.join('')}</ul>` : '';
}
