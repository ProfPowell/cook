/**
 * @file conditional-sections.js
 * @description The late `data-if` / `data-unless` pass, right before
 * `replaceTemplateStrings`. Layouts decide page fields and slots, and
 * `data-repeat` decides `alias.x` keys per item; what is left here (from
 * includes, or keys a layout couldn't know) is decided from
 * `{ ...data, ...file.frontMatter }`. Every key is known here: a missing
 * one is not set.
 *
 * A page with neither marker is left exactly as it is.
 */

// IMPORTS
// -----------------------------
import Util from '../utils/util/util.js';
import { lateConditionals } from '../utils/layouts/conditionals.js';


// DEFINE
// -----------------------------
/**
 * @param {Object} opts
 * @property {Object} opts.file - Current file info
 * @property {Object} opts.data - User data from config/data.js
 * @property {Array} [opts.allowType] - Allowed file types
 * @property {Array} [opts.disallowType] - Disallowed file types
 */
export default function conditionalSections({ file, data, allowType, disallowType }) {
  // Early Exit: File type not allowed
  if (!Util.isAllowedType({ file, allowType, disallowType })) return;

  const values = file.frontMatter ? { ...data, ...file.frontMatter } : (data || {});
  file.src = lateConditionals(file.src, values);
}
