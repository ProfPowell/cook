/**
 * @file process-markdown.js
 * @description Convert markdown files to HTML with front matter support
 */

// IMPORTS
// -----------------------------
import chalk from 'chalk';
import { promises as fs } from 'node:fs';
import { existsSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import matter from 'gray-matter';
import Logger from '../utils/logger/logger.js';
import Util from '../utils/util/util.js';

// Config
import { distPath, srcPath, markdown as markdownConfig } from '../utils/config/config.js';


// DEFINE
// -----------------------------
/**
 * @description Process markdown files from /src and convert to HTML in /dist
 * @param {Object} opts - Options object
 * @property {Object} opts.store - Build process data store
 * @property {Object} opts.data - User data from config/data.js
 */
class ProcessMarkdown {
  constructor({ store, data }) {
    this.store = store;
    this.data = data;
    this.config = {
      // Default layout template (null = no wrapper)
      layout: null,
      // Directory for layout templates
      layoutPath: 'layouts',
      // Directory for markdown content (relative to src)
      contentPath: '',
      // Generate collections from directories
      collections: true,
      // marked options
      markedOptions: {
        gfm: true,
        breaks: false,
      },
      // User overrides
      ...markdownConfig,
    };

    // Initialize collections store
    if (!this.store.collections) {
      this.store.collections = {};
    }

    // Cache for layout templates
    if (!this.store.cachedLayouts) {
      this.store.cachedLayouts = {};
    }

    // Track processed files
    this.processedFiles = [];
  }

  // INIT
  // -----------------------------
  async init() {
    // Configure marked
    marked.setOptions(this.config.markedOptions);

    // Find all markdown files in /src
    const markdownFiles = this.findMarkdownFiles(srcPath);

    // Early exit if no markdown files
    if (!markdownFiles.length) {
      return;
    }

    // Show terminal message
    Logger.persist.header('\nProcess Markdown');

    // Process each markdown file
    for (const filePath of markdownFiles) {
      await this.processFile(filePath);
    }

    // Build collections from processed files
    this.buildCollections();

    // Expose collections to data store for use in templates
    this.data.collections = this.store.collections;

    // Show terminal message
    Logger.persist.success(`Converted ${this.processedFiles.length} markdown files`);
  }

  /**
   * Find all markdown files recursively
   * @param {string} dir - Directory to search
   * @returns {string[]} Array of file paths
   */
  findMarkdownFiles(dir) {
    const files = [];

    if (!existsSync(dir)) {
      return files;
    }

    const entries = Util.getPaths(dir, dir, []);

    for (const entry of entries) {
      if (entry.endsWith('.md')) {
        files.push(entry);
      }
    }

    return files;
  }

  /**
   * Process a single markdown file
   * @param {string} filePath - Path to markdown file
   */
  async processFile(filePath) {
    try {
      // Read markdown file
      const content = await fs.readFile(filePath, 'utf-8');

      // Parse front matter
      const { data: frontMatter, content: markdownContent } = matter(content);

      // Convert markdown to HTML
      const htmlContent = marked(markdownContent);

      // Build page data
      const pageData = this.buildPageData(filePath, frontMatter, htmlContent);

      // Get layout if specified
      const layout = frontMatter.layout || this.config.layout;

      // Build final HTML
      let finalHtml;
      if (layout) {
        finalHtml = await this.applyLayout(layout, pageData);
      } else {
        // No layout - wrap in basic HTML structure
        finalHtml = this.buildBasicHtml(pageData);
      }

      // Calculate output path
      const outputPath = this.getOutputPath(filePath);

      // Ensure directory exists
      await Util.createDirectory(path.dirname(outputPath));

      // Write HTML file
      await fs.writeFile(outputPath, finalHtml, 'utf-8');

      // Track for collections
      this.processedFiles.push({
        ...pageData,
        outputPath,
      });

    } catch (err) {
      Util.customError(err, `ProcessMarkdown: ${filePath}`);
    }
  }

  /**
   * Build page data object from front matter and content
   * @param {string} filePath - Original file path
   * @param {Object} frontMatter - Parsed front matter
   * @param {string} htmlContent - Converted HTML content
   * @returns {Object} Page data object
   */
  buildPageData(filePath, frontMatter, htmlContent) {
    // Get relative path from src
    const relativePath = filePath.replace(`${srcPath}/`, '');

    // Get URL path (without .md extension)
    const urlPath = '/' + relativePath.replace(/\.md$/, '/').replace(/\/index\/$/, '/');

    // Get collection name from directory
    const pathParts = relativePath.split('/');
    const collection = pathParts.length > 1 ? pathParts[0] : null;

    // Get file name without extension
    const fileName = path.basename(filePath, '.md');

    return {
      // Front matter fields (user-defined)
      ...frontMatter,
      // Generated fields
      content: htmlContent,
      url: urlPath,
      slug: fileName,
      collection,
      sourcePath: filePath,
      // Default title from filename if not in front matter
      title: frontMatter.title || Util.convertToCapSpaces(fileName, 'kebab'),
      // Parse date if string
      date: frontMatter.date ? new Date(frontMatter.date) : null,
    };
  }

  /**
   * Apply a layout template to page content
   * @param {string} layoutName - Layout template name
   * @param {Object} pageData - Page data object
   * @returns {string} Final HTML
   */
  async applyLayout(layoutName, pageData) {
    // Get layout template
    const layoutContent = await this.getLayout(layoutName);

    if (!layoutContent) {
      // Fallback to basic HTML if layout not found
      console.log(chalk.yellow(`  Layout "${layoutName}" not found, using basic HTML`));
      return this.buildBasicHtml(pageData);
    }

    // Replace template variables in layout
    let html = layoutContent;

    // Replace ${content} with the markdown-converted HTML
    html = html.replace(/\$\{content\}/g, pageData.content);

    // Replace other ${variable} placeholders with page data
    html = html.replace(/\$\{([^}]+)\}/g, (match, key) => {
      const trimmedKey = key.trim();

      // Check page data first
      if (pageData[trimmedKey] !== undefined) {
        return pageData[trimmedKey];
      }

      // Then check global data
      if (this.data[trimmedKey] !== undefined) {
        return this.data[trimmedKey];
      }

      // Leave unmatched placeholders as-is (for later processing)
      return match;
    });

    return html;
  }

  /**
   * Get layout template content (with caching)
   * @param {string} layoutName - Layout name
   * @returns {string|null} Layout content or null
   */
  async getLayout(layoutName) {
    // Check cache
    if (this.store.cachedLayouts[layoutName] !== undefined) {
      return this.store.cachedLayouts[layoutName];
    }

    // Build possible paths
    const layoutFileName = layoutName.endsWith('.html') ? layoutName : `${layoutName}.html`;
    const possiblePaths = [
      path.resolve(`${srcPath}/${this.config.layoutPath}/${layoutFileName}`),
      path.resolve(`${srcPath}/${this.config.layoutPath}/${layoutName}/index.html`),
      path.resolve(`${distPath}/${this.config.layoutPath}/${layoutFileName}`),
      path.resolve(`${distPath}/${this.config.layoutPath}/${layoutName}/index.html`),
    ];

    // Try each path
    for (const layoutPath of possiblePaths) {
      if (existsSync(layoutPath)) {
        try {
          const content = await fs.readFile(layoutPath, 'utf-8');
          this.store.cachedLayouts[layoutName] = content;
          return content;
        } catch (err) {
          // Continue to next path
        }
      }
    }

    // Not found
    this.store.cachedLayouts[layoutName] = null;
    return null;
  }

  /**
   * Build basic HTML wrapper when no layout is specified
   * @param {Object} pageData - Page data
   * @returns {string} HTML string
   */
  buildBasicHtml(pageData) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageData.title}</title>
</head>
<body>
${pageData.content}
</body>
</html>`;
  }

  /**
   * Calculate output path for HTML file
   * @param {string} inputPath - Input markdown file path
   * @returns {string} Output HTML file path
   */
  getOutputPath(inputPath) {
    // Replace src with dist
    let outputPath = inputPath.replace(srcPath, distPath);

    // Replace .md with /index.html for clean URLs
    // e.g., /blog/my-post.md -> /blog/my-post/index.html
    outputPath = outputPath.replace(/\.md$/, '/index.html');

    // Handle index.md -> index.html (not index/index.html)
    outputPath = outputPath.replace(/\/index\/index\.html$/, '/index.html');

    return outputPath;
  }

  /**
   * Build collections from processed files
   */
  buildCollections() {
    if (!this.config.collections) return;

    for (const page of this.processedFiles) {
      if (page.collection) {
        // Initialize collection array if needed
        if (!this.store.collections[page.collection]) {
          this.store.collections[page.collection] = [];
        }

        // Add page to collection (without full content to save memory)
        this.store.collections[page.collection].push({
          title: page.title,
          url: page.url,
          slug: page.slug,
          date: page.date,
          description: page.description,
          // Include any other front matter fields except content
          ...Object.fromEntries(
            Object.entries(page).filter(([key]) =>
              !['content', 'sourcePath', 'outputPath', 'collection'].includes(key)
            )
          ),
        });
      }
    }

    // Sort collections by date (newest first)
    for (const collectionName of Object.keys(this.store.collections)) {
      this.store.collections[collectionName].sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return b.date - a.date;
      });
    }
  }

  // EXPORT WRAPPER
  // -----------------------------
  static async export(opts) {
    return new ProcessMarkdown(opts).init();
  }
}


// EXPORT
// -----------------------------
export default ProcessMarkdown.export;
