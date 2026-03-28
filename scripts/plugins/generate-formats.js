/**
 * @file generate-formats.js
 * @description Generate multi-format output for each page.
 *
 * Produces:
 * - Markdown copies in dist/md/{path}/index.md (for markdown-sourced pages)
 * - JSON metadata in dist/api/{path}.json (for all pages)
 * - Atom feed at dist/feed.xml (from a configurable collection)
 * - llms.txt at dist/llms.txt (index of all content with markdown URLs)
 * - llms-full.txt at dist/llms-full.txt (complete documentation in one file)
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
      llmsFullTxt: false,
      ...formatsConfig,
    };

    this.stats = { markdown: 0, json: 0, feed: false, llmsTxt: false, llmsFullTxt: false };

    // Init terminal logging
    Util.initLogging.call(this);
  }

  // INIT
  // -----------------------------
  async init() {
    // Early Exit: No formats configured
    if (!this.config.markdown && !this.config.json && !this.config.feed && !this.config.llmsTxt && !this.config.llmsFullTxt) return;

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

      // Generate llms-full.txt (complete documentation in one file)
      if (this.config.llmsFullTxt) {
        await this.generateLlmsFullTxt(indexFiles);
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
   * Collect page metadata from all index files for llms.txt generation.
   * Reads HTML to extract title and description.
   * @param {string[]} indexFiles - All index.html file paths
   * @returns {Array<{title: string, description: string, url: string, mdUrl: string|null, section: string|null}>}
   */
  async collectPageMeta(indexFiles) {
    const pages = [];
    for (const filePath of indexFiles) {
      const relativePath = filePath.replace(distPath, '');
      const urlPath = relativePath.replace(/\/index\.html$/, '/').replace(/^$/, '/');
      const mdSource = this.findMarkdownSource(urlPath);
      const trimmedPath = urlPath.replace(/^\//, '').replace(/\/$/, '');

      // Read HTML to extract title and description
      let title = trimmedPath || 'index';
      let description = '';
      let section = null;
      try {
        const src = await fs.readFile(filePath, 'utf-8');
        const dom = Util.jsdom.dom({ src });
        const doc = dom.window.document;
        const h1 = doc.querySelector('h1')?.textContent;
        const titleTag = doc.querySelector('title')?.textContent;
        const metaDesc = doc.querySelector('meta[name="description"]')?.getAttribute('content');
        title = h1 || titleTag || title;
        description = metaDesc || '';
      } catch { /* use defaults */ }

      // Check collection item for additional metadata
      const collectionItem = this.findCollectionItem(urlPath);
      if (collectionItem) {
        title = collectionItem.title || title;
        description = collectionItem.description || description;
        section = collectionItem.section || null;
      }

      const mdUrl = mdSource
        ? (trimmedPath ? `/md/${trimmedPath}/index.md` : `/md/index.md`)
        : null;

      pages.push({ title, description, url: urlPath, mdUrl, section });
    }
    return pages;
  }

  /**
   * Generate llms.txt listing all content with markdown URLs.
   * Enhanced with descriptions, section grouping, and AI instructions.
   * @param {string[]} indexFiles - All index.html file paths
   */
  async generateLlmsTxt(indexFiles) {
    const siteTitle = this.data.siteTitle || 'Site';
    const siteDescription = this.data.siteDescription || '';
    const siteUrl = this.data.siteUrl || '';
    const llmsInstructions = this.data.llmsInstructions || '';

    let content = `# ${siteTitle}\n\n`;
    if (siteDescription) content += `> ${siteDescription}\n\n`;

    // AI instructions section (Stripe-style guidance for LLM agents)
    if (llmsInstructions) {
      content += `## Instructions for AI Agents\n\n${llmsInstructions.trim()}\n\n`;
    }

    // Collect page metadata
    const pages = await this.collectPageMeta(indexFiles);
    const mdPages = pages.filter(p => p.mdUrl);

    if (mdPages.length) {
      // Group by section if sections exist, otherwise flat list
      const hasSections = mdPages.some(p => p.section);

      if (hasSections) {
        const sections = {};
        const unsectioned = [];
        for (const page of mdPages) {
          if (page.section) {
            if (!sections[page.section]) sections[page.section] = [];
            sections[page.section].push(page);
          } else {
            unsectioned.push(page);
          }
        }

        // Output sectioned pages
        for (const [sectionName, sectionPages] of Object.entries(sections)) {
          content += `## ${sectionName}\n\n`;
          for (const page of sectionPages) {
            const fullMdUrl = siteUrl ? `${siteUrl}${page.mdUrl}` : page.mdUrl;
            const desc = page.description ? `: ${page.description}` : '';
            content += `- [${page.title}](${fullMdUrl})${desc}\n`;
          }
          content += '\n';
        }

        // Output unsectioned pages
        if (unsectioned.length) {
          content += `## Content\n\n`;
          for (const page of unsectioned) {
            const fullMdUrl = siteUrl ? `${siteUrl}${page.mdUrl}` : page.mdUrl;
            const desc = page.description ? `: ${page.description}` : '';
            content += `- [${page.title}](${fullMdUrl})${desc}\n`;
          }
        }
      } else {
        // Flat list with descriptions
        content += `## Content\n\n`;
        for (const page of mdPages) {
          const fullMdUrl = siteUrl ? `${siteUrl}${page.mdUrl}` : page.mdUrl;
          const desc = page.description ? `: ${page.description}` : '';
          content += `- [${page.title}](${fullMdUrl})${desc}\n`;
        }
      }
    }

    await fs.writeFile(path.resolve(`${distPath}/llms.txt`), content, 'utf-8');
    this.stats.llmsTxt = true;
  }

  /**
   * Generate llms-full.txt: concatenate all markdown page content into one file.
   * Ideal for bulk ingestion by IDE tools and AI systems.
   * @param {string[]} indexFiles - All index.html file paths
   */
  async generateLlmsFullTxt(indexFiles) {
    const siteTitle = this.data.siteTitle || 'Site';
    const siteDescription = this.data.siteDescription || '';
    const llmsInstructions = this.data.llmsInstructions || '';

    let content = `# ${siteTitle} — Complete Documentation\n\n`;
    if (siteDescription) content += `> ${siteDescription}\n\n`;

    // AI instructions
    if (llmsInstructions) {
      content += `## Instructions for AI Agents\n\n${llmsInstructions.trim()}\n\n---\n\n`;
    }

    // Collect pages and read their markdown content
    for (const filePath of indexFiles) {
      const relativePath = filePath.replace(distPath, '');
      const urlPath = relativePath.replace(/\/index\.html$/, '/').replace(/^$/, '/');
      const mdSource = this.findMarkdownSource(urlPath);
      if (!mdSource) continue;

      try {
        let mdContent = await fs.readFile(mdSource, 'utf-8');

        // Strip YAML frontmatter for the concatenated output
        mdContent = mdContent.replace(/^---[\s\S]*?---\n*/, '');

        // Find title
        const collectionItem = this.findCollectionItem(urlPath);
        const trimmedPath = urlPath.replace(/^\//, '').replace(/\/$/, '');
        const title = collectionItem?.title || trimmedPath || 'index';

        content += `## ${title}\n\n`;
        content += mdContent.trim();
        content += '\n\n---\n\n';
      } catch { /* skip unreadable files */ }
    }

    await fs.writeFile(path.resolve(`${distPath}/llms-full.txt`), content, 'utf-8');
    this.stats.llmsFullTxt = true;
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
    if (this.stats.llmsFullTxt) parts.push('llms-full.txt');

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
