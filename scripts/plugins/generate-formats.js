/**
 * @file generate-formats.js
 * @description Generate multi-format output for each page.
 *
 * Produces:
 * - Markdown copies in dist/md/{path}/index.md (for markdown-sourced pages)
 * - JSON metadata in dist/api/{path}.json (for all pages)
 * - Atom feed at dist/feed.xml (from a configurable collection)
 * - llms.txt at dist/llms.txt (index of all content with markdown URLs)
 */

// IMPORTS
// -----------------------------
import chalk from 'chalk';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import Util from '../utils/util/util.js';
import Logger from '../utils/logger/logger.js';

// Config
import { distPath, srcPath, formats as formatsConfig } from '../utils/config/config.js';


// DEFINE
// -----------------------------
class GenerateFormats {
  constructor({ store, data }) {
    this.store = store;
    this.data = data || {};
    this.config = {
      markdown: true,
      json: true,
      feed: null,
      llmsTxt: true,
      ...formatsConfig,
    };

    this.stats = { markdown: 0, json: 0, feed: false, llmsTxt: false };

    // Init terminal logging
    Util.initLogging.call(this);
  }

  // INIT
  // -----------------------------
  async init() {
    // Early Exit: No formats configured
    if (!this.config.markdown && !this.config.json && !this.config.feed && !this.config.llmsTxt) return;

    // ADD TERMINAL SECTION HEADING
    Logger.persist.header(`\nGenerate Formats`);

    // START LOGGING
    this.startLog();

    try {
      // Get all index.html files in dist (the actual pages)
      const htmlFiles = Util.getPaths(distPath, distPath, []);
      const indexFiles = htmlFiles
        .filter(f => f.endsWith('/index.html') || f === `${distPath}/index.html`)
        .filter(f => !f.includes('/404/'));

      // Process each page
      for (const filePath of indexFiles) {
        await this.processPage(filePath);
      }

      // Generate feed
      if (this.config.feed) {
        await this.generateFeed();
      }

      // Generate llms.txt
      if (this.config.llmsTxt) {
        await this.generateLlmsTxt(indexFiles);
      }
    } catch (err) {
      Util.customError(err, 'generate-formats.js');
    }

    // END LOGGING
    this.endLog();
  }

  /**
   * Process a single page: generate markdown copy and JSON metadata
   * @param {string} filePath - Path to the index.html file in dist
   */
  async processPage(filePath) {
    // Get the URL path from the dist file path
    // e.g., dist/blog/my-post/index.html → /blog/my-post/
    const relativePath = filePath.replace(distPath, '');
    const urlPath = relativePath.replace(/\/index\.html$/, '/').replace(/^$/, '/');

    // Try to find corresponding markdown source
    const mdSourcePath = this.findMarkdownSource(urlPath);

    // Generate markdown copy
    if (this.config.markdown && mdSourcePath) {
      await this.generateMarkdownCopy(mdSourcePath, urlPath);
    }

    // Generate JSON metadata
    if (this.config.json) {
      await this.generateJsonMeta(filePath, urlPath, mdSourcePath);
    }
  }

  /**
   * Find the markdown source file for a given URL path
   * @param {string} urlPath - URL path (e.g., /blog/my-post/)
   * @returns {string|null} Path to .md source or null
   */
  findMarkdownSource(urlPath) {
    // Convert URL path to possible markdown source paths
    // /blog/my-post/ → src/blog/my-post.md or src/blog/my-post/index.md
    const trimmedPath = urlPath.replace(/^\//, '').replace(/\/$/, '');

    const candidates = [
      path.resolve(`${srcPath}/${trimmedPath}.md`),
      path.resolve(`${srcPath}/${trimmedPath}/index.md`),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }

    return null;
  }

  /**
   * Copy markdown source to dist/md/{path}/index.md
   * @param {string} mdSourcePath - Path to the source .md file
   * @param {string} urlPath - URL path
   */
  async generateMarkdownCopy(mdSourcePath, urlPath) {
    try {
      const content = await fs.readFile(mdSourcePath, 'utf-8');
      const trimmedPath = urlPath.replace(/^\//, '').replace(/\/$/, '');
      const outputPath = trimmedPath
        ? path.resolve(`${distPath}/md/${trimmedPath}/index.md`)
        : path.resolve(`${distPath}/md/index.md`);

      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, content, 'utf-8');
      this.stats.markdown++;
    } catch (err) {
      Util.customError(err, `generate-formats.js: markdown for ${urlPath}`);
    }
  }

  /**
   * Generate JSON metadata for a page at dist/api/{path}.json
   * @param {string} filePath - Path to the HTML file
   * @param {string} urlPath - URL path
   * @param {string|null} mdSourcePath - Path to markdown source if exists
   */
  async generateJsonMeta(filePath, urlPath, mdSourcePath) {
    try {
      const src = await fs.readFile(filePath, 'utf-8');
      const dom = Util.jsdom.dom({ src });
      const document = dom.window.document;

      // Extract metadata from the HTML
      const title = document.querySelector('title')?.textContent || '';
      const description = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
      const h1 = document.querySelector('h1')?.textContent || '';

      const meta = {
        url: urlPath,
        title: h1 || title,
        description,
        hasMarkdown: !!mdSourcePath,
      };

      if (mdSourcePath) {
        const trimmedPath = urlPath.replace(/^\//, '').replace(/\/$/, '');
        meta.markdownUrl = trimmedPath ? `/md/${trimmedPath}/index.md` : `/md/index.md`;
      }

      meta.fragmentUrl = urlPath + '_fragment.html';

      // Add collection item data if available
      const collectionItem = this.findCollectionItem(urlPath);
      if (collectionItem) {
        if (collectionItem.date) meta.date = collectionItem.date;
        if (collectionItem.author) meta.author = collectionItem.author;
        if (collectionItem.tags) meta.tags = collectionItem.tags;
      }

      // Write JSON
      const trimmedPath = urlPath.replace(/^\//, '').replace(/\/$/, '') || 'index';
      const outputPath = path.resolve(`${distPath}/api/${trimmedPath}.json`);

      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, JSON.stringify(meta, null, 2), 'utf-8');
      this.stats.json++;
    } catch (err) {
      Util.customError(err, `generate-formats.js: json for ${urlPath}`);
    }
  }

  /**
   * Find a collection item matching a URL path
   * @param {string} urlPath - URL path
   * @returns {Object|null} Collection item or null
   */
  findCollectionItem(urlPath) {
    const collections = this.store.collections || this.data.collections;
    if (!collections) return null;

    for (const items of Object.values(collections)) {
      if (!Array.isArray(items)) continue;
      const match = items.find(item => item.url === urlPath);
      if (match) return match;
    }
    return null;
  }

  /**
   * Generate an Atom feed from a configured collection
   */
  async generateFeed() {
    const feedConfig = this.config.feed;
    if (!feedConfig || !feedConfig.collection) return;

    const collections = this.store.collections || this.data.collections;
    if (!collections) return;

    let items = collections[feedConfig.collection];
    if (!items || !Array.isArray(items)) return;

    // Apply limit
    if (feedConfig.limit) {
      items = items.slice(0, feedConfig.limit);
    }

    const siteUrl = this.data.siteUrl || feedConfig.siteUrl || 'https://example.com';
    const feedTitle = feedConfig.title || this.data.siteTitle || 'Feed';
    const now = new Date().toISOString();

    let xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${this.escapeXml(feedTitle)}</title>
  <link href="${siteUrl}" />
  <link rel="self" href="${siteUrl}/feed.xml" />
  <updated>${now}</updated>
  <id>${siteUrl}/</id>
`;

    for (const item of items) {
      const itemUrl = `${siteUrl}${item.url}`;
      const date = item._dateSort ? item._dateSort.toISOString() : (item.date ? new Date(item.date).toISOString() : now);

      xml += `  <entry>
    <title>${this.escapeXml(item.title || '')}</title>
    <link href="${itemUrl}" />
    <id>${itemUrl}</id>
    <updated>${date}</updated>
    <summary>${this.escapeXml(item.description || '')}</summary>
  </entry>
`;
    }

    xml += `</feed>
`;

    await fs.writeFile(path.resolve(`${distPath}/feed.xml`), xml, 'utf-8');
    this.stats.feed = true;
  }

  /**
   * Generate llms.txt listing all content with markdown URLs
   * @param {string[]} indexFiles - All index.html file paths
   */
  async generateLlmsTxt(indexFiles) {
    const siteTitle = this.data.siteTitle || 'Site';
    const siteDescription = this.data.siteDescription || '';
    const siteUrl = this.data.siteUrl || '';

    let content = `# ${siteTitle}\n\n`;
    if (siteDescription) content += `> ${siteDescription}\n\n`;

    // List pages that have markdown sources
    const mdPages = [];
    for (const filePath of indexFiles) {
      const relativePath = filePath.replace(distPath, '');
      const urlPath = relativePath.replace(/\/index\.html$/, '/').replace(/^$/, '/');
      const mdSource = this.findMarkdownSource(urlPath);
      if (mdSource) {
        const trimmedPath = urlPath.replace(/^\//, '').replace(/\/$/, '');
        // Find title from collection data or use path
        const collectionItem = this.findCollectionItem(urlPath);
        const title = collectionItem?.title || trimmedPath || 'index';
        const mdUrl = trimmedPath ? `/md/${trimmedPath}/index.md` : `/md/index.md`;
        mdPages.push({ title, url: urlPath, mdUrl });
      }
    }

    if (mdPages.length) {
      content += `## Content\n\n`;
      for (const page of mdPages) {
        const fullMdUrl = siteUrl ? `${siteUrl}${page.mdUrl}` : page.mdUrl;
        content += `- [${page.title}](${fullMdUrl})\n`;
      }
    }

    await fs.writeFile(path.resolve(`${distPath}/llms.txt`), content, 'utf-8');
    this.stats.llmsTxt = true;
  }

  /**
   * Escape special XML characters
   * @param {string} str - Input string
   * @returns {string} Escaped string
   */
  escapeXml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }


  // LOGGING
  // -----------------------------

  startLog() {
    this.loading.start(chalk.magenta('Generating formats'));
    this.timer.start();
  }

  endLog() {
    const parts = [];
    if (this.stats.markdown) parts.push(`${this.stats.markdown} markdown`);
    if (this.stats.json) parts.push(`${this.stats.json} json`);
    if (this.stats.feed) parts.push('feed.xml');
    if (this.stats.llmsTxt) parts.push('llms.txt');

    if (parts.length) {
      this.loading.stop(`Generated ${chalk.magenta(parts.join(', '))} ${this.timer.end()}`);
    } else {
      this.loading.kill();
    }
  }


  // EXPORT WRAPPER
  // -----------------------------
  static async export(opts) {
    return new GenerateFormats(opts).init();
  }
}


// EXPORT
// -----------------------------
export default GenerateFormats.export;
