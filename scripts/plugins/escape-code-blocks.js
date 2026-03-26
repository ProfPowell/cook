/**
 * @file escape-code-blocks.js
 * @description HTML-escape the content of <code-block> elements at build time.
 *
 * In documentation pages, code examples need to be displayed as text, not
 * rendered as HTML. This plugin finds <code-block> elements with a
 * `data-escape` attribute and HTML-encodes their innerHTML so the raw
 * markup is visible to the reader.
 *
 * IMPORTANT: Uses regex instead of JSDOM because JSDOM would parse the raw
 * HTML/JS content inside <code-block> as real DOM nodes, corrupting it.
 * This plugin must operate at the string level before DOM parsing.
 *
 * Usage in a page:
 *   <code-block language="html" data-escape>
 *     <button type="button">Click me</button>
 *   </code-block>
 *
 * After processing, the inner HTML is escaped and data-escape is removed:
 *   <code-block language="html">
 *     &lt;button type="button"&gt;Click me&lt;/button&gt;
 *   </code-block>
 */

// IMPORTS
// -----------------------------
import Util from '../utils/util/util.js';


// DEFINE
// -----------------------------
class EscapeCodeBlocks {
  constructor({ file, allowType, disallowType }) {
    this.opts = { file, allowType, disallowType };
    this.file = file;
  }

  // INIT
  // -----------------------------
  async init() {
    // Early Exit: File type not allowed
    const allowed = Util.isAllowedType(this.opts);
    if (!allowed) return;

    // Early Exit: No code-block elements with data-escape
    if (!this.file.src.includes('data-escape')) return;

    // Use regex to find <code-block ... data-escape ...>content</code-block>
    // and escape the inner content at the string level (before JSDOM parsing).
    // Match the full opening tag containing data-escape, then capture content up to </code-block>.
    const pattern = /(<code-block\b[^>]*\bdata-escape\b[^>]*>)([\s\S]*?)(<\/code-block>)/gi;

    this.file.src = this.file.src.replace(pattern, (match, openTag, content, closeTag) => {
      // Remove data-escape from the opening tag
      const cleanedTag = openTag.replace(/\s*\bdata-escape\b/, '');
      // Trim leading/trailing whitespace from the content but preserve internal formatting
      const trimmed = content.replace(/^\n+/, '').replace(/\n+$/, '');
      const escaped = this.escapeHtml(trimmed);
      return `${cleanedTag}${escaped}${closeTag}`;
    });
  }

  /**
   * Escape HTML special characters for display as text.
   * @param {string} str - Raw HTML string
   * @returns {string} Escaped string
   */
  escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // EXPORT WRAPPER
  // -----------------------------
  static async export(opts) {
    return new EscapeCodeBlocks(opts).init();
  }
}


// EXPORT
// -----------------------------
export default EscapeCodeBlocks.export;
