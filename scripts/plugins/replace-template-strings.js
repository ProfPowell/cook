/**
 * @file replace-template-strings.js
 * @description Compiles ES6 template strings in HTML/CSS files
 */

// IMPORT
// -----------------------------
import utils from '../utils/util/util.js';


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

    // NOTE: Why do we use `obj[`${src[offset+2]}${g}`]` instead of `obj[g]`?
    // ---
    // Normally, if you use a regex to find all `${...}` in the src (`/\${(.*)}/g`), the 'g' property in the `.replace()` method will be that match.
    // However, this will find these cases as well: `${{...}}`, which is the literal $ and then a Vue-style variable.
    // So instead of leaving `${{...}}` in the DOM (so that Vue can replace on the client during page render),
    // it would try and replace with a looked up value, not find one, and write an empty string instead,
    // So you would get `}` written to the screen instead of `${{...}}` since it would match `${{...}`
    // Therefore, we needed to add a negation to the regex, namely `[^{]`, which excludes matches with 2x { after a $.
    // So now `${...}` matches, but `${{...}}` doesn't. Great!
    // Unfortunately, the native string's `.replace()` method separates capture groups from the pattern match :(
    // (You can read about it here: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace#Specifying_a_function_as_a_parameter)
    // So inside the replace's 2nd-parameter function, `g` would be the matched variable template, but missing the first character after the first `{`.
    // For example, if the matched variable was `${matchedVar}` (which is the `match` argument), then `g` will be `atchedVar` instead of `matchedVar`.
    // So when you do a look up to the data object, no matched value will be returned.
    // Therefore, we need to add that missing character back.
    // Fortunately, the `.replace()` method provides the index offset where the match occurred, and the full source string.
    // So we find the missing character by adjusting the offset by 2 (`offset+2`)
    // and then applying it back to `g` to get the correct variable lookup (why 2? Because we need to go past the starting `${`)
    // ---
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

    src = this.replaceTemplateVars(src, this.data);

    // Restore protected content
    this.file.src = src.replace(/<!--COOK_PROTECTED_(\d+)-->/g, (_, i) => protectedContent[i]);
  }

  // HELPER METHODS
  // -----------------------------

  /**
   * @description Replace ${var} and ${nested.var} template strings with data values
   * @param {string} str - Source string
   * @param {Object} obj - Data object to resolve variables from
   */
  replaceTemplateVars(str, obj) {
    return str.replace(/\${[^{](.*?)}/g, (match, g, offset, src) => {
      // Reconstruct the full key (see long comment above for why offset+2)
      const key = `${src[offset + 2]}${g}`;

      // 1. Flat lookup (most common, fast path)
      if (obj[key] != null) return String(obj[key]);

      // 2. Dot notation lookup (e.g., "site.css" → obj.site.css)
      if (key.includes('.')) {
        const parts = key.split('.');
        let value = obj;
        for (const part of parts) {
          if (value == null || typeof value !== 'object') { value = undefined; break; }
          value = value[part];
        }
        if (value != null) return String(value);
      }

      // 3. No match — leave the template string as-is
      return match;
    });
  }


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
