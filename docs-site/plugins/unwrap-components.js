/**
 * Unwrap custom elements from <p> tags.
 *
 * Markdown parsers treat hyphenated custom elements (code-block, browser-window)
 * as inline, wrapping them in <p>. This plugin removes those wrappers.
 */
export class UnwrapComponents {
  constructor({ file }) {
    this.file = file;
  }

  async init() {
    if (!this.file.src) return;

    // Unwrap <p><code-block ...>...</code-block></p>  and  <p><browser-window ...>...</browser-window></p>
    this.file.src = this.file.src.replace(
      /<p>\s*(<(?:code-block|browser-window|callout)\b[\s\S]*?<\/(?:code-block|browser-window|callout)>)\s*<\/p>/gi,
      '$1'
    );
  }
}
