/**
 * @file interpolate.js
 * @description THE ${var} interpolator — the single implementation
 * behind every plugin that resolves template variables (components,
 * repeats, layouts, page-level template strings).
 *
 * Semantics (identical everywhere):
 * - `${key}` with a trimmed key; `${ key }` works
 * - `${{...}}` (client-side/Vue-style) is never touched
 * - flat lookup first, then dot-path (`${user.name}`)
 * - all insertions go through the replace callback, so `$&`-style
 *   patterns in VALUES are inserted literally, and inserted content is
 *   never rescanned by the same pass
 * - unmatched placeholders are left as-is for later pipeline stages
 *   (opt-in: unmatched `${slot:x}` placeholders are removed)
 * - null/undefined values leave the placeholder; Dates render as
 *   toLocaleDateString(); Arrays join with ', '
 */

// `(?!\{)` skips `${{...}}` so client-side template syntax survives
const VAR_PATTERN = /\$\{(?!\{)([^}]+)\}/g;

/**
 * Walk a dot-notation path safely.
 * @param {Object} obj
 * @param {string} path - e.g. "user.name"
 * @returns {*} value or undefined
 */
export function getNested(obj, path) {
  if (!obj || !path) return undefined;
  let current = obj;
  for (const part of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Default value formatting for insertion into HTML.
 * @param {*} value
 * @returns {string}
 */
export function formatValue(value) {
  if (value instanceof Date) return value.toLocaleDateString();
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

/**
 * Render `${var}` placeholders in a template string.
 * @param {string} template
 * @param {Object} data - Lookup source (flat keys, "slot:name" keys, nested objects)
 * @param {Object} [opts]
 * @property {boolean} [opts.removeUnmatchedSlots=false] - Remove `${slot:x}` with no data
 * @property {Function} [opts.fallback] - (key, match) => string for unmatched keys
 * @returns {string}
 */
export function renderTemplate(template, data, opts = {}) {
  const { removeUnmatchedSlots = false, fallback } = opts;

  return template.replace(VAR_PATTERN, (match, rawKey) => {
    const key = rawKey.trim();

    // Flat lookup first (also covers "slot:name" keys)
    let value = data[key];

    // Dot-path lookup (e.g. user.name)
    if ((value === undefined || value === null) && key.includes('.')) {
      value = getNested(data, key);
    }

    if (value !== undefined && value !== null) return formatValue(value);

    // Unfilled slots are structural — remove rather than ship raw
    if (removeUnmatchedSlots && key.startsWith('slot:')) return '';

    if (fallback) return fallback(key, match);

    // Leave unmatched placeholders for later pipeline stages
    return match;
  });
}
