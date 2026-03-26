/**
 * @file escape-code-blocks.js
 * @description HTML-escape the content of <code-block> elements at build time.
 *
 * In documentation pages, code examples need to be displayed as text, not
 * rendered as HTML. This plugin finds <code-block> elements with a
 * `data-escape` attribute and HTML-encodes their innerHTML so the raw
 * markup is visible to the reader.
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

    // Parse with JSDOM
    const dom = Util.jsdom.dom({ src: this.file.src });
    const doc = dom.window.document;
    const codeBlocks = doc.querySelectorAll('code-block[data-escape]');

    if (!codeBlocks.length) return;

    for (const block of codeBlocks) {
      // Get the raw innerHTML and escape it
      const raw = block.innerHTML;
      // Trim leading/trailing whitespace from the content but preserve internal formatting
      const trimmed = raw.replace(/^\n+/, '').replace(/\n+$/, '');
      block.innerHTML = this.escapeHtml(trimmed);
      // Remove the data-escape attribute from the output
      block.removeAttribute('data-escape');
    }

    // Store updated source
    this.file.src = Util.setSrc({ dom });
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
