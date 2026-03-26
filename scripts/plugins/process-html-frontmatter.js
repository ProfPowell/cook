/**
 * @file process-html-frontmatter.js
 * @description Parse YAML front matter from HTML files.
 *
 * HTML files can include YAML front matter delimited by --- at the top:
 *
 *   ---
 *   layout: element
 *   title: button
 *   category: native
 *   ---
 *   <section>...</section>
 *
 * The front matter is stripped from file.src and stored on file.frontMatter.
 * A `layout` key in front matter is equivalent to data-template="name" —
 * applyTemplate checks file.frontMatter.layout as a fallback.
 */

// IMPORTS
// -----------------------------
import matter from 'gray-matter';
import Util from '../utils/util/util.js';


// DEFINE
// -----------------------------
class ProcessHtmlFrontmatter {
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

    // Early Exit: No front matter delimiter at start of file
    if (!this.file.src.startsWith('---')) return;

    // Parse front matter
    const { data: frontMatter, content } = matter(this.file.src);

    // Early Exit: No front matter found
    if (!frontMatter || Object.keys(frontMatter).length === 0) return;

    // Store parsed front matter on the file object
    this.file.frontMatter = frontMatter;

    // Strip front matter from source, leaving just the HTML content
    this.file.src = content.trim();
  }

  // EXPORT WRAPPER
  // -----------------------------
  static async export(opts) {
    return new ProcessHtmlFrontmatter(opts).init();
  }
}


// EXPORT
// -----------------------------
export default ProcessHtmlFrontmatter.export;
