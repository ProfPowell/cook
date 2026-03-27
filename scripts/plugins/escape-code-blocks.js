/**
 * @file escape-code-blocks.js
 * @description HTML-escape the content of <code-block> elements at build time.
 *
 * Uses regex to find <code-block data-escape> and encodes the content as
 * base64 in a data attribute, preventing JSDOM from mangling it.
 * A post-JSDOM step in build.js decodes and restores the content.
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

  async init() {
    const allowed = Util.isAllowedType(this.opts);
    if (!allowed) return;
    if (!this.file.src.includes('data-escape')) return;

    const pattern = /(<code-block\b[^>]*\bdata-escape\b[^>]*>)([\s\S]*?)(<\/code-block>)/gi;

    this.file.src = this.file.src.replace(pattern, (match, openTag, content, closeTag) => {
      const cleanedTag = openTag.replace(/\s*\bdata-escape\b/, '');
      const trimmed = content.replace(/^\n+/, '').replace(/\n+$/, '');
      const escaped = this.escapeHtml(trimmed);
      const encoded = Buffer.from(escaped).toString('base64');
      const tagWithAttr = cleanedTag.replace(/>$/, ` data-cook-esc="${encoded}">`);
      return `${tagWithAttr}${closeTag}`;
    });
  }

  escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  static async export(opts) {
    return new EscapeCodeBlocks(opts).init();
  }
}

export default EscapeCodeBlocks.export;
