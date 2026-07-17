/**
 * @file replace-template-strings.js
 * @description Compiles ES6 template strings in HTML/CSS files
 */

// IMPORT
// -----------------------------
import utils from '../utils/util/util.js';
import { renderTemplate } from '../utils/interpolate/interpolate.js';


// DEFINE
// -----------------------------
/**
 * @description Converts file into a function and returns the rendered value as the file source
 * @param {Object} obj - Deconstructed options object
 * @property {Object} obj.file - The current file's info (name, extension, path, src, etc.)
 * @property {Object} obj.data - The user's custom data from the `data.js` config file, so they can access it in their custom plugins
 * @property {Array} [obj.allowType] - Allowed file types (Opt-in)
 * @property {Array} [obj.disallowType] - Disallowed file types (Opt-out)
 */
class ReplaceTemplateStrings {
  constructor({file, data, allowType, disallowType}) {
    this.opts = {file, data, allowType, disallowType};
    this.file = file;
    this.data = data;
    this.allowType = allowType;
    this.disallowType = disallowType;
  }

  // INIT
  // -----------------------------
  // Note: `process.env.DEV_CHANGED_PAGE` is defined in `browserSync.watch()` in dev.js
  async init() {
    // Early Exit: File type not allowed
    const allowed = utils.isAllowedType(this.opts);
    if (!allowed) return;

    // REPLACE STRING VARIABLES WITH MATCHING DATA
    // Find all template string variables, and replace them with their matching data value from `/config/data.js`

    // Protect the CONTENT of <script> and <style> blocks from template resolution.
    // JavaScript template literals like `${name}` and CSS custom properties
    // should not be replaced with data values. But we still need to resolve
    // vars in attributes (e.g., <script src="${site.js}">).
    const protectedContent = [];
    let src = this.file.src.replace(/(<(?:script|style)\b[^>]*>)([\s\S]*?)(<\/(?:script|style)>)/gi, (match, openTag, content, closeTag) => {
      if (!content.trim()) return match; // Empty — nothing to protect
      const index = protectedContent.length;
      protectedContent.push(content);
      return `${openTag}<!--COOK_PROTECTED_${index}-->${closeTag}`;
    });

    src = renderTemplate(src, this.data);

    // Restore protected content
    this.file.src = src.replace(/<!--COOK_PROTECTED_(\d+)-->/g, (_, i) => protectedContent[i]);
  }

  // HELPER METHODS
  // -----------------------------

  // EXPORT WRAPPER
  // -----------------------------
  // Export function wrapper instead of class for `build.js` simplicity
  static async export(opts) {
    return new ReplaceTemplateStrings(opts).init();
  }
}

// EXPORT
// -----------------------------
export default ReplaceTemplateStrings.export;
