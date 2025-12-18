/**
 * @file repeat.test.js
 * @description Tests for repeat/collection functionality
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { rimraf } from 'rimraf';

// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test fixtures directory
const fixturesDir = path.join(__dirname, 'fixtures');

describe('Repeat Collection', async () => {

  before(async () => {
    await fs.mkdir(fixturesDir, { recursive: true });
  });

  after(async () => {
    await rimraf(fixturesDir);
  });

  describe('Expression Parsing', () => {

    // Helper function to parse expressions (mirrors plugin logic)
    function parseExpression(expression) {
      const match = expression.match(/^(.+?)\s+as\s+(\w+)(?:\s*,\s*(\w+))?$/);
      if (!match) return null;

      let collectionPart = match[1].trim();
      const itemName = match[2];
      const indexName = match[3] || null;

      let limit = 0;
      let offset = 0;

      const parts = collectionPart.split('|').map(p => p.trim());
      const collection = parts[0];

      for (let i = 1; i < parts.length; i++) {
        const modifier = parts[i];
        const limitMatch = modifier.match(/^limit\s*:\s*(\d+)$/);
        if (limitMatch) {
          limit = parseInt(limitMatch[1], 10);
          continue;
        }
        const offsetMatch = modifier.match(/^offset\s*:\s*(\d+)$/);
        if (offsetMatch) {
          offset = parseInt(offsetMatch[1], 10);
          continue;
        }
      }

      return { collection, itemName, indexName, limit, offset };
    }

    it('should parse basic "collection as item" expression', () => {
      const result = parseExpression('items as item');
      assert.strictEqual(result.collection, 'items');
      assert.strictEqual(result.itemName, 'item');
      assert.strictEqual(result.indexName, null);
      assert.strictEqual(result.limit, 0);
      assert.strictEqual(result.offset, 0);
    });

    it('should parse nested collection path', () => {
      const result = parseExpression('collections.blog as post');
      assert.strictEqual(result.collection, 'collections.blog');
      assert.strictEqual(result.itemName, 'post');
    });

    it('should parse expression with index variable', () => {
      const result = parseExpression('items as item, index');
      assert.strictEqual(result.itemName, 'item');
      assert.strictEqual(result.indexName, 'index');
    });

    it('should parse expression with limit modifier', () => {
      const result = parseExpression('collections.blog | limit:5 as post');
      assert.strictEqual(result.collection, 'collections.blog');
      assert.strictEqual(result.limit, 5);
      assert.strictEqual(result.offset, 0);
    });

    it('should parse expression with offset modifier', () => {
      const result = parseExpression('collections.blog | offset:2 as post');
      assert.strictEqual(result.collection, 'collections.blog');
      assert.strictEqual(result.offset, 2);
      assert.strictEqual(result.limit, 0);
    });

    it('should parse expression with both limit and offset', () => {
      const result = parseExpression('collections.blog | offset:2 | limit:5 as post');
      assert.strictEqual(result.collection, 'collections.blog');
      assert.strictEqual(result.offset, 2);
      assert.strictEqual(result.limit, 5);
    });

    it('should return null for invalid expression', () => {
      const result = parseExpression('invalid expression');
      assert.strictEqual(result, null);
    });

    it('should return null for missing "as" keyword', () => {
      const result = parseExpression('collections.blog');
      assert.strictEqual(result, null);
    });

  });

  describe('Nested Value Access', () => {

    // Helper function (mirrors plugin logic)
    function getNestedValue(obj, pathStr) {
      if (!obj || !pathStr) return undefined;
      const parts = pathStr.split('.');
      let current = obj;
      for (const part of parts) {
        if (current === null || current === undefined) return undefined;
        current = current[part];
      }
      return current;
    }

    it('should get top-level property', () => {
      const obj = { items: [1, 2, 3] };
      assert.deepStrictEqual(getNestedValue(obj, 'items'), [1, 2, 3]);
    });

    it('should get nested property', () => {
      const obj = { collections: { blog: [{ title: 'Post' }] } };
      assert.deepStrictEqual(getNestedValue(obj, 'collections.blog'), [{ title: 'Post' }]);
    });

    it('should return undefined for missing property', () => {
      const obj = { items: [] };
      assert.strictEqual(getNestedValue(obj, 'missing'), undefined);
    });

    it('should return undefined for deeply missing property', () => {
      const obj = { collections: {} };
      assert.strictEqual(getNestedValue(obj, 'collections.blog.posts'), undefined);
    });

    it('should handle null values in path', () => {
      const obj = { collections: null };
      assert.strictEqual(getNestedValue(obj, 'collections.blog'), undefined);
    });

  });

  describe('Template Rendering', () => {

    // Helper function (mirrors plugin logic)
    function renderTemplate(template, context) {
      function getNestedValue(obj, pathStr) {
        if (!obj || !pathStr) return undefined;
        const parts = pathStr.split('.');
        let current = obj;
        for (const part of parts) {
          if (current === null || current === undefined) return undefined;
          current = current[part];
        }
        return current;
      }

      return template.replace(/\$\{([^}]+)\}/g, (match, key) => {
        const trimmedKey = key.trim();
        const value = getNestedValue(context, trimmedKey);
        if (value !== undefined && value !== null) {
          if (value instanceof Date) return value.toLocaleDateString();
          if (Array.isArray(value)) return value.join(', ');
          return String(value);
        }
        return match;
      });
    }

    it('should replace simple variable', () => {
      const template = '<h1>${title}</h1>';
      const context = { title: 'Hello World' };
      assert.strictEqual(renderTemplate(template, context), '<h1>Hello World</h1>');
    });

    it('should replace multiple variables', () => {
      const template = '<a href="${url}">${title}</a>';
      const context = { url: '/blog/post', title: 'My Post' };
      assert.strictEqual(renderTemplate(template, context), '<a href="/blog/post">My Post</a>');
    });

    it('should handle nested variable access', () => {
      const template = '<span>${post.title}</span>';
      const context = { post: { title: 'Nested Title' } };
      assert.strictEqual(renderTemplate(template, context), '<span>Nested Title</span>');
    });

    it('should leave unmatched variables intact', () => {
      const template = '<p>${missing}</p>';
      const context = { title: 'Test' };
      assert.strictEqual(renderTemplate(template, context), '<p>${missing}</p>');
    });

    it('should handle arrays by joining', () => {
      const template = '<span>${tags}</span>';
      const context = { tags: ['js', 'html', 'css'] };
      assert.strictEqual(renderTemplate(template, context), '<span>js, html, css</span>');
    });

    it('should handle Date objects', () => {
      const template = '<time>${date}</time>';
      const date = new Date('2024-03-15');
      const context = { date };
      const result = renderTemplate(template, context);
      assert.ok(result.includes('2024') || result.includes('3/15'));
    });

  });

  describe('DOM Manipulation', () => {

    it('should repeat element for each item in array', () => {
      const html = `
        <ul>
          <li data-repeat="items as item">\${item.name}</li>
        </ul>
      `;
      const dom = new JSDOM(html);
      const document = dom.window.document;
      const repeatEl = document.querySelector('[data-repeat]');

      const items = [{ name: 'One' }, { name: 'Two' }, { name: 'Three' }];
      const template = repeatEl.innerHTML;
      const fragment = document.createDocumentFragment();

      items.forEach(item => {
        const clone = repeatEl.cloneNode(false);
        clone.removeAttribute('data-repeat');
        clone.innerHTML = template.replace(/\$\{item\.name\}/g, item.name);
        fragment.appendChild(clone);
      });

      repeatEl.parentNode.replaceChild(fragment, repeatEl);

      const listItems = document.querySelectorAll('li');
      assert.strictEqual(listItems.length, 3);
      assert.strictEqual(listItems[0].textContent, 'One');
      assert.strictEqual(listItems[1].textContent, 'Two');
      assert.strictEqual(listItems[2].textContent, 'Three');
    });

    it('should remove data-repeat attribute from output', () => {
      const html = '<div data-repeat="items as item"></div>';
      const dom = new JSDOM(html);
      const document = dom.window.document;
      const repeatEl = document.querySelector('[data-repeat]');

      const clone = repeatEl.cloneNode(false);
      clone.removeAttribute('data-repeat');

      assert.strictEqual(clone.hasAttribute('data-repeat'), false);
    });

    it('should process attributes on repeated elements', () => {
      const html = '<a data-repeat="links as link" href="\${link.url}">\${link.text}</a>';
      const dom = new JSDOM(html);
      const document = dom.window.document;
      const repeatEl = document.querySelector('[data-repeat]');

      const link = { url: '/test', text: 'Test Link' };
      const clone = repeatEl.cloneNode(false);

      // Process href attribute
      clone.setAttribute('href', link.url);
      clone.textContent = link.text;

      assert.strictEqual(clone.getAttribute('href'), '/test');
      assert.strictEqual(clone.textContent, 'Test Link');
    });

  });

  describe('Limit and Offset', () => {

    it('should apply limit to collection', () => {
      const collection = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const limit = 5;
      const result = collection.slice(0, limit);
      assert.strictEqual(result.length, 5);
      assert.deepStrictEqual(result, [1, 2, 3, 4, 5]);
    });

    it('should apply offset to collection', () => {
      const collection = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const offset = 3;
      const result = collection.slice(offset);
      assert.strictEqual(result.length, 7);
      assert.deepStrictEqual(result, [4, 5, 6, 7, 8, 9, 10]);
    });

    it('should apply both offset and limit', () => {
      const collection = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const offset = 2;
      const limit = 3;
      let result = collection.slice(offset);
      result = result.slice(0, limit);
      assert.strictEqual(result.length, 3);
      assert.deepStrictEqual(result, [3, 4, 5]);
    });

    it('should handle limit larger than collection', () => {
      const collection = [1, 2, 3];
      const limit = 10;
      const result = collection.slice(0, limit);
      assert.strictEqual(result.length, 3);
    });

    it('should handle offset larger than collection', () => {
      const collection = [1, 2, 3];
      const offset = 10;
      const result = collection.slice(offset);
      assert.strictEqual(result.length, 0);
    });

  });

  describe('Index Variable', () => {

    it('should provide index variable when requested', () => {
      const items = ['a', 'b', 'c'];
      const results = items.map((item, index) => ({
        item,
        index,
      }));

      assert.strictEqual(results[0].index, 0);
      assert.strictEqual(results[1].index, 1);
      assert.strictEqual(results[2].index, 2);
    });

    it('should render index in template', () => {
      const template = '<li>\${index}: \${item}</li>';
      const items = ['First', 'Second', 'Third'];

      const results = items.map((item, index) => {
        return template
          .replace(/\$\{index\}/g, index)
          .replace(/\$\{item\}/g, item);
      });

      assert.strictEqual(results[0], '<li>0: First</li>');
      assert.strictEqual(results[1], '<li>1: Second</li>');
      assert.strictEqual(results[2], '<li>2: Third</li>');
    });

  });

  describe('Integration Scenarios', () => {

    it('should handle blog post listing scenario', () => {
      const posts = [
        { title: 'First Post', url: '/blog/first', date: '2024-01-01' },
        { title: 'Second Post', url: '/blog/second', date: '2024-01-15' },
        { title: 'Third Post', url: '/blog/third', date: '2024-02-01' },
      ];

      const html = `
        <article data-repeat="collections.blog as post">
          <h2><a href="\${post.url}">\${post.title}</a></h2>
          <time>\${post.date}</time>
        </article>
      `;

      const dom = new JSDOM(html);
      const document = dom.window.document;
      const repeatEl = document.querySelector('[data-repeat]');
      const template = repeatEl.innerHTML;
      const fragment = document.createDocumentFragment();

      posts.forEach(post => {
        const clone = repeatEl.cloneNode(false);
        clone.removeAttribute('data-repeat');
        let rendered = template
          .replace(/\$\{post\.url\}/g, post.url)
          .replace(/\$\{post\.title\}/g, post.title)
          .replace(/\$\{post\.date\}/g, post.date);
        clone.innerHTML = rendered;
        fragment.appendChild(clone);
      });

      repeatEl.parentNode.replaceChild(fragment, repeatEl);

      const articles = document.querySelectorAll('article');
      assert.strictEqual(articles.length, 3);

      const firstLink = articles[0].querySelector('a');
      assert.strictEqual(firstLink.getAttribute('href'), '/blog/first');
      assert.strictEqual(firstLink.textContent, 'First Post');
    });

    it('should handle navigation menu scenario', () => {
      const navItems = [
        { label: 'Home', href: '/' },
        { label: 'About', href: '/about' },
        { label: 'Blog', href: '/blog' },
        { label: 'Contact', href: '/contact' },
      ];

      const results = navItems.map(item =>
        `<a href="${item.href}">${item.label}</a>`
      );

      assert.strictEqual(results.length, 4);
      assert.strictEqual(results[0], '<a href="/">Home</a>');
      assert.strictEqual(results[3], '<a href="/contact">Contact</a>');
    });

    it('should handle empty collection gracefully', () => {
      const collection = [];
      const results = collection.map(item => `<li>${item}</li>`);
      assert.strictEqual(results.length, 0);
    });

  });

});
