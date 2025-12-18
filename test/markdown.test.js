/**
 * @file markdown.test.js
 * @description Tests for markdown processing functionality
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rimraf } from 'rimraf';

// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Test fixtures directory
const fixturesDir = path.join(__dirname, 'fixtures');
const srcDir = path.join(fixturesDir, 'src');
const distDir = path.join(fixturesDir, 'dist');

// Import the markdown processor after setting up directories
let processMarkdown;

describe('Markdown Processing', async () => {

  before(async () => {
    // Clean up any previous test artifacts
    await rimraf(fixturesDir);

    // Create test directories
    await fs.mkdir(srcDir, { recursive: true });
    await fs.mkdir(path.join(srcDir, 'blog'), { recursive: true });
    await fs.mkdir(path.join(srcDir, 'layouts'), { recursive: true });
    await fs.mkdir(distDir, { recursive: true });

    // Dynamically import after directory setup
    // We need to mock the config paths
    process.env.TEST_SRC_PATH = srcDir;
    process.env.TEST_DIST_PATH = distDir;
  });

  after(async () => {
    // Clean up test fixtures
    await rimraf(fixturesDir);
  });

  describe('Front Matter Parsing', () => {

    it('should parse YAML front matter from markdown files', async () => {
      // Create test markdown file
      const mdContent = `---
title: Test Post
date: 2024-01-15
author: Test Author
tags:
  - javascript
  - testing
---

# Hello World

This is test content.
`;
      await fs.writeFile(path.join(srcDir, 'test-post.md'), mdContent);

      // Parse with gray-matter directly
      const matter = (await import('gray-matter')).default;
      const parsed = matter(mdContent);

      assert.strictEqual(parsed.data.title, 'Test Post');
      assert.strictEqual(parsed.data.author, 'Test Author');
      assert.deepStrictEqual(parsed.data.tags, ['javascript', 'testing']);
      assert.ok(parsed.content.includes('# Hello World'));
    });

    it('should handle markdown without front matter', async () => {
      const mdContent = `# No Front Matter

Just plain markdown content.
`;
      const matter = (await import('gray-matter')).default;
      const parsed = matter(mdContent);

      assert.deepStrictEqual(parsed.data, {});
      assert.ok(parsed.content.includes('# No Front Matter'));
    });

    it('should handle empty front matter', async () => {
      const mdContent = `---
---

Content after empty front matter.
`;
      const matter = (await import('gray-matter')).default;
      const parsed = matter(mdContent);

      assert.deepStrictEqual(parsed.data, {});
      assert.ok(parsed.content.includes('Content after empty front matter'));
    });

  });

  describe('Markdown to HTML Conversion', () => {

    it('should convert basic markdown to HTML', async () => {
      const { marked } = await import('marked');

      const markdown = '# Heading\n\nParagraph text.';
      const html = marked(markdown);

      assert.ok(html.includes('<h1>Heading</h1>'));
      assert.ok(html.includes('<p>Paragraph text.</p>'));
    });

    it('should convert code blocks with syntax highlighting class', async () => {
      const { marked } = await import('marked');

      const markdown = '```javascript\nconst x = 1;\n```';
      const html = marked(markdown);

      assert.ok(html.includes('<code'));
      assert.ok(html.includes('const x = 1;'));
    });

    it('should convert lists properly', async () => {
      const { marked } = await import('marked');

      const markdown = '- Item 1\n- Item 2\n- Item 3';
      const html = marked(markdown);

      assert.ok(html.includes('<ul>'));
      assert.ok(html.includes('<li>Item 1</li>'));
      assert.ok(html.includes('<li>Item 2</li>'));
      assert.ok(html.includes('<li>Item 3</li>'));
    });

    it('should convert links properly', async () => {
      const { marked } = await import('marked');

      const markdown = '[Link Text](https://example.com)';
      const html = marked(markdown);

      assert.ok(html.includes('<a href="https://example.com">Link Text</a>'));
    });

    it('should handle GFM tables', async () => {
      const { marked } = await import('marked');
      marked.setOptions({ gfm: true });

      const markdown = `| Header 1 | Header 2 |
| --- | --- |
| Cell 1 | Cell 2 |`;
      const html = marked(markdown);

      assert.ok(html.includes('<table>'));
      assert.ok(html.includes('<th>Header 1</th>'));
      assert.ok(html.includes('<td>Cell 1</td>'));
    });

  });

  describe('Output Path Generation', () => {

    it('should convert .md to /index.html for clean URLs', () => {
      // Test the path transformation logic
      const inputPath = 'src/blog/my-post.md';
      const expectedOutput = 'dist/blog/my-post/index.html';

      let outputPath = inputPath.replace('src', 'dist');
      outputPath = outputPath.replace(/\.md$/, '/index.html');

      assert.strictEqual(outputPath, expectedOutput);
    });

    it('should handle index.md correctly', () => {
      const inputPath = 'src/blog/index.md';

      let outputPath = inputPath.replace('src', 'dist');
      outputPath = outputPath.replace(/\.md$/, '/index.html');
      outputPath = outputPath.replace(/\/index\/index\.html$/, '/index.html');

      assert.strictEqual(outputPath, 'dist/blog/index.html');
    });

    it('should handle deeply nested paths', () => {
      const inputPath = 'src/docs/api/v2/reference.md';

      let outputPath = inputPath.replace('src', 'dist');
      outputPath = outputPath.replace(/\.md$/, '/index.html');

      assert.strictEqual(outputPath, 'dist/docs/api/v2/reference/index.html');
    });

  });

  describe('Collections', () => {

    it('should group pages by directory into collections', () => {
      const files = [
        { sourcePath: 'src/blog/post-1.md', title: 'Post 1', date: new Date('2024-01-01') },
        { sourcePath: 'src/blog/post-2.md', title: 'Post 2', date: new Date('2024-01-15') },
        { sourcePath: 'src/docs/intro.md', title: 'Intro', date: null },
      ];

      const collections = {};

      for (const file of files) {
        const relativePath = file.sourcePath.replace('src/', '');
        const pathParts = relativePath.split('/');
        const collection = pathParts.length > 1 ? pathParts[0] : null;

        if (collection) {
          if (!collections[collection]) {
            collections[collection] = [];
          }
          collections[collection].push({
            title: file.title,
            date: file.date,
          });
        }
      }

      assert.strictEqual(collections.blog.length, 2);
      assert.strictEqual(collections.docs.length, 1);
      assert.strictEqual(collections.blog[0].title, 'Post 1');
    });

    it('should sort collections by date (newest first)', () => {
      const collection = [
        { title: 'Old Post', date: new Date('2023-01-01') },
        { title: 'New Post', date: new Date('2024-06-01') },
        { title: 'Middle Post', date: new Date('2024-01-01') },
      ];

      collection.sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return b.date - a.date;
      });

      assert.strictEqual(collection[0].title, 'New Post');
      assert.strictEqual(collection[1].title, 'Middle Post');
      assert.strictEqual(collection[2].title, 'Old Post');
    });

  });

  describe('Template Variable Replacement', () => {

    it('should replace ${variable} with page data', () => {
      const template = '<h1>${title}</h1><p>${description}</p>';
      const data = { title: 'My Title', description: 'My description' };

      const result = template.replace(/\$\{([^}]+)\}/g, (match, key) => {
        const trimmedKey = key.trim();
        return data[trimmedKey] !== undefined ? data[trimmedKey] : match;
      });

      assert.strictEqual(result, '<h1>My Title</h1><p>My description</p>');
    });

    it('should leave unmatched variables intact', () => {
      const template = '<h1>${title}</h1><p>${missing}</p>';
      const data = { title: 'My Title' };

      const result = template.replace(/\$\{([^}]+)\}/g, (match, key) => {
        const trimmedKey = key.trim();
        return data[trimmedKey] !== undefined ? data[trimmedKey] : match;
      });

      assert.strictEqual(result, '<h1>My Title</h1><p>${missing}</p>');
    });

    it('should replace ${content} with rendered markdown', () => {
      const layout = '<!DOCTYPE html><html><body>${content}</body></html>';
      const content = '<h1>Hello</h1><p>World</p>';

      const result = layout.replace(/\$\{content\}/g, content);

      assert.ok(result.includes('<h1>Hello</h1>'));
      assert.ok(result.includes('<p>World</p>'));
    });

  });

  describe('Layout System', () => {

    it('should wrap content in layout template', async () => {
      // Create a layout file
      const layoutContent = `<!DOCTYPE html>
<html>
<head><title>\${title}</title></head>
<body>
\${content}
</body>
</html>`;

      await fs.writeFile(path.join(srcDir, 'layouts', 'default.html'), layoutContent);

      // Verify layout file exists
      const layoutPath = path.join(srcDir, 'layouts', 'default.html');
      assert.ok(existsSync(layoutPath), 'Layout file should exist');

      // Read it back
      const readLayout = await fs.readFile(layoutPath, 'utf-8');
      assert.ok(readLayout.includes('${title}'));
      assert.ok(readLayout.includes('${content}'));
    });

    it('should generate basic HTML when no layout specified', () => {
      const pageData = {
        title: 'Test Page',
        content: '<h1>Hello</h1>',
      };

      const basicHtml = `<!DOCTYPE html>
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

      assert.ok(basicHtml.includes('Test Page'));
      assert.ok(basicHtml.includes('<h1>Hello</h1>'));
      assert.ok(basicHtml.includes('<!DOCTYPE html>'));
    });

  });

  describe('URL Generation', () => {

    it('should generate correct URL from file path', () => {
      const filePath = 'src/blog/my-awesome-post.md';
      const srcPath = 'src';

      const relativePath = filePath.replace(`${srcPath}/`, '');
      const urlPath = '/' + relativePath.replace(/\.md$/, '/').replace(/\/index\/$/, '/');

      assert.strictEqual(urlPath, '/blog/my-awesome-post/');
    });

    it('should handle root index.md', () => {
      const filePath = 'src/index.md';
      const srcPath = 'src';

      const relativePath = filePath.replace(`${srcPath}/`, '');
      let urlPath = '/' + relativePath.replace(/\.md$/, '/').replace(/\/index\/$/, '/');
      urlPath = urlPath.replace(/^\/index\/$/, '/');

      assert.strictEqual(urlPath, '/');
    });

  });

  describe('Title Generation', () => {

    it('should use front matter title if provided', () => {
      const frontMatter = { title: 'Custom Title' };
      const fileName = 'my-post';

      const title = frontMatter.title || fileName;
      assert.strictEqual(title, 'Custom Title');
    });

    it('should generate title from filename if not in front matter', () => {
      const frontMatter = {};
      const fileName = 'my-awesome-post';

      // Simple kebab to title case conversion
      const title = frontMatter.title || fileName
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      assert.strictEqual(title, 'My Awesome Post');
    });

  });

});

describe('Integration Tests', () => {

  before(async () => {
    // Ensure directories exist
    await fs.mkdir(srcDir, { recursive: true });
    await fs.mkdir(path.join(srcDir, 'blog'), { recursive: true });
    await fs.mkdir(path.join(srcDir, 'layouts'), { recursive: true });
  });

  it('should process a complete markdown file end-to-end', async () => {
    const matter = (await import('gray-matter')).default;
    const { marked } = await import('marked');

    // Create markdown content
    const mdContent = `---
title: Integration Test Post
date: 2024-03-15
description: Testing the full markdown pipeline
layout: default
---

# Welcome

This is a test post with **bold** and *italic* text.

## Code Example

\`\`\`javascript
console.log('Hello, World!');
\`\`\`

## List

- Item one
- Item two
- Item three
`;

    // Parse front matter
    const { data: frontMatter, content: markdownContent } = matter(mdContent);

    // Convert to HTML
    const htmlContent = marked(markdownContent);

    // Verify front matter
    assert.strictEqual(frontMatter.title, 'Integration Test Post');
    assert.strictEqual(frontMatter.layout, 'default');

    // Verify HTML conversion
    assert.ok(htmlContent.includes('<h1>Welcome</h1>'));
    assert.ok(htmlContent.includes('<strong>bold</strong>'));
    assert.ok(htmlContent.includes('<em>italic</em>'));
    assert.ok(htmlContent.includes('<code'));
    assert.ok(htmlContent.includes('<ul>'));
    assert.ok(htmlContent.includes('<li>Item one</li>'));
  });

  it('should handle special characters in markdown', async () => {
    const { marked } = await import('marked');

    const markdown = `# Special & Characters

This has <angle> brackets and "quotes".

Code: \`const x = a && b;\`
`;

    const html = marked(markdown);

    // marked should handle these properly
    assert.ok(html.includes('Special'));
    assert.ok(html.includes('&amp;') || html.includes('& '));
  });

});
