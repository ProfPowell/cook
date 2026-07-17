/**
 * @file repeat.test.js
 * @description Tests the REAL repeat-collection plugin
 * (scripts/plugins/repeat-collection.js): expression parsing, nested value
 * access, template rendering, limit/offset, index variables, and
 * integration scenarios — all driven through the plugin's public entry.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseHTML } from 'linkedom';

import repeatCollection from '../scripts/plugins/repeat-collection.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAGE = (body) => `<!DOCTYPE html>
<html lang="en">
<head><title>t</title></head>
<body>${body}</body>
</html>`;

async function run(body, data = {}, store = {}) {
  const file = { ext: 'html', path: 'dist/index.html', name: 'index', src: PAGE(body) };
  await repeatCollection({ file, data, store, allowType: ['.html'] });
  return file;
}

function doc(file) {
  return parseHTML(file.src).document;
}

// ============================================================================
// Tests
// ============================================================================

describe('Repeat Collection', () => {

  describe('Expression Parsing', () => {

    it('should process a basic "collection as item" expression', async () => {
      const file = await run(
        '<ul><li data-repeat="items as item">${item.name}</li></ul>',
        { items: [{ name: 'One' }, { name: 'Two' }, { name: 'Three' }] }
      );

      const names = Array.from(doc(file).querySelectorAll('li')).map(el => el.textContent);
      assert.deepStrictEqual(names, ['One', 'Two', 'Three']);
      assert.ok(!file.src.includes('data-repeat'));
    });

    it('should process a nested collection path', async () => {
      const file = await run(
        '<article data-repeat="collections.blog as post"><h2>${post.title}</h2></article>',
        { collections: { blog: [{ title: 'Post' }] } }
      );

      assert.strictEqual(doc(file).querySelector('h2').textContent, 'Post');
    });

    it('should process an expression with index variable', async () => {
      const file = await run(
        '<li data-repeat="items as item, index">${index}: ${item}</li>',
        { items: ['First', 'Second', 'Third'] }
      );

      const texts = Array.from(doc(file).querySelectorAll('li')).map(el => el.textContent);
      assert.deepStrictEqual(texts, ['0: First', '1: Second', '2: Third']);
    });

    it('should apply the limit modifier', async () => {
      const posts = Array.from({ length: 10 }, (_, i) => ({ title: `P${i + 1}` }));
      const file = await run(
        '<article data-repeat="collections.blog | limit:5 as post">${post.title}</article>',
        { collections: { blog: posts } }
      );

      const titles = Array.from(doc(file).querySelectorAll('article')).map(el => el.textContent);
      assert.deepStrictEqual(titles, ['P1', 'P2', 'P3', 'P4', 'P5']);
    });

    it('should apply the offset modifier', async () => {
      const posts = Array.from({ length: 5 }, (_, i) => ({ title: `P${i + 1}` }));
      const file = await run(
        '<article data-repeat="collections.blog | offset:2 as post">${post.title}</article>',
        { collections: { blog: posts } }
      );

      const titles = Array.from(doc(file).querySelectorAll('article')).map(el => el.textContent);
      assert.deepStrictEqual(titles, ['P3', 'P4', 'P5']);
    });

    it('should apply both offset and limit', async () => {
      const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => ({ n }));
      const file = await run(
        '<span data-repeat="nums | offset:2 | limit:3 as item">${item.n}</span>',
        { nums }
      );

      const values = Array.from(doc(file).querySelectorAll('span')).map(el => el.textContent);
      assert.deepStrictEqual(values, ['3', '4', '5']);
    });

    it('should leave the element untouched for an invalid expression', async () => {
      const file = await run(
        '<li data-repeat="invalid expression">${item}</li>',
        { items: ['a'] }
      );

      assert.ok(file.src.includes('data-repeat="invalid expression"'));
    });

    it('should leave the element untouched when "as" keyword is missing', async () => {
      const file = await run(
        '<li data-repeat="collections.blog">x</li>',
        { collections: { blog: [{ title: 'T' }] } }
      );

      assert.ok(file.src.includes('data-repeat="collections.blog"'));
    });
  });

  describe('Collection Resolution', () => {

    it('should leave the element untouched for a missing collection', async () => {
      const file = await run('<li data-repeat="missing as item">${item}</li>', {});
      assert.ok(file.src.includes('data-repeat="missing as item"'));
    });

    it('should leave the element untouched when a deep path is missing', async () => {
      const file = await run(
        '<li data-repeat="collections.blog.posts as item">${item}</li>',
        { collections: {} }
      );
      assert.ok(file.src.includes('data-repeat'));
    });

    it('should handle null values in the collection path', async () => {
      const file = await run(
        '<li data-repeat="collections.blog as item">${item}</li>',
        { collections: null }
      );
      assert.ok(file.src.includes('data-repeat'));
    });

    it('should resolve collections from the store when absent from data', async () => {
      const file = await run(
        '<li data-repeat="featured as item">${item.name}</li>',
        {},
        { featured: [{ name: 'From Store' }] }
      );
      assert.strictEqual(doc(file).querySelector('li').textContent, 'From Store');
    });
  });

  describe('Template Rendering', () => {

    it('should replace a simple item property', async () => {
      const file = await run(
        '<h1 data-repeat="items as item">${item.title}</h1>',
        { items: [{ title: 'Hello World' }] }
      );
      assert.strictEqual(doc(file).querySelector('h1').textContent, 'Hello World');
    });

    it('should replace multiple variables including attributes', async () => {
      const file = await run(
        '<a data-repeat="links as link" href="${link.url}">${link.text}</a>',
        { links: [{ url: '/blog/post', text: 'My Post' }] }
      );

      const a = doc(file).querySelector('a');
      assert.strictEqual(a.getAttribute('href'), '/blog/post');
      assert.strictEqual(a.textContent, 'My Post');
    });

    it('should handle nested variable access', async () => {
      const file = await run(
        '<span data-repeat="posts as post">${post.author.name}</span>',
        { posts: [{ author: { name: 'Kim' } }] }
      );
      assert.strictEqual(doc(file).querySelector('span').textContent, 'Kim');
    });

    it('should leave unmatched variables intact', async () => {
      const file = await run(
        '<p data-repeat="items as item">${missing}</p>',
        { items: [{ title: 'Test' }] }
      );
      assert.ok(file.src.includes('${missing}'));
    });

    it('should join array values with a comma', async () => {
      const file = await run(
        '<span data-repeat="posts as post">${post.tags}</span>',
        { posts: [{ tags: ['js', 'html', 'css'] }] }
      );
      assert.strictEqual(doc(file).querySelector('span').textContent, 'js, html, css');
    });

    it('should render Date objects with toLocaleDateString', async () => {
      const file = await run(
        '<time data-repeat="posts as post">${post.date}</time>',
        { posts: [{ date: new Date('2024-03-15') }] }
      );
      const text = doc(file).querySelector('time').textContent;
      assert.ok(text.includes('2024') || text.includes('3/15'), `unexpected date render: ${text}`);
    });
  });

  describe('DOM Output', () => {

    it('should repeat the element for each item in the array', async () => {
      const file = await run(
        '<ul><li data-repeat="items as item">${item.name}</li></ul>',
        { items: [{ name: 'One' }, { name: 'Two' }, { name: 'Three' }] }
      );

      const d = doc(file);
      assert.strictEqual(d.querySelectorAll('li').length, 3);
      assert.strictEqual(d.querySelectorAll('ul').length, 1);
    });

    it('should remove the data-repeat attribute from output', async () => {
      const file = await run(
        '<div data-repeat="items as item">${item.name}</div>',
        { items: [{ name: 'X' }] }
      );
      assert.ok(!file.src.includes('data-repeat'));
    });

    it('should keep non-repeat attributes on repeated elements', async () => {
      const file = await run(
        '<li data-repeat="items as item" class="row">${item.name}</li>',
        { items: [{ name: 'A' }, { name: 'B' }] }
      );

      const rows = doc(file).querySelectorAll('li.row');
      assert.strictEqual(rows.length, 2);
    });
  });

  describe('Limit and Offset Edge Cases', () => {

    it('should handle limit larger than the collection', async () => {
      const file = await run(
        '<li data-repeat="nums | limit:10 as item">${item.n}</li>',
        { nums: [{ n: 1 }, { n: 2 }, { n: 3 }] }
      );
      assert.strictEqual(doc(file).querySelectorAll('li').length, 3);
    });

    it('should handle offset larger than the collection', async () => {
      const file = await run(
        '<ul><li data-repeat="nums | offset:10 as item">${item.n}</li></ul>',
        { nums: [{ n: 1 }, { n: 2 }, { n: 3 }] }
      );
      assert.strictEqual(doc(file).querySelectorAll('li').length, 0);
      assert.ok(!file.src.includes('data-repeat'));
    });
  });

  describe('Index Variable', () => {

    it('should provide zero-based index values', async () => {
      const file = await run(
        '<li data-repeat="letters as letter, i">${i}</li>',
        { letters: ['a', 'b', 'c'] }
      );

      const indexes = Array.from(doc(file).querySelectorAll('li')).map(el => el.textContent);
      assert.deepStrictEqual(indexes, ['0', '1', '2']);
    });

    it('should render index alongside the item', async () => {
      const file = await run(
        '<li data-repeat="items as item, index">${index}: ${item}</li>',
        { items: ['First', 'Second', 'Third'] }
      );

      const texts = Array.from(doc(file).querySelectorAll('li')).map(el => el.textContent);
      assert.deepStrictEqual(texts, ['0: First', '1: Second', '2: Third']);
    });
  });

  describe('Integration Scenarios', () => {

    it('should handle a blog post listing scenario', async () => {
      const file = await run(
        `<article data-repeat="collections.blog as post">
          <h2><a href="\${post.url}">\${post.title}</a></h2>
          <time>\${post.date}</time>
        </article>`,
        {
          collections: {
            blog: [
              { title: 'First Post', url: '/blog/first', date: '2024-01-01' },
              { title: 'Second Post', url: '/blog/second', date: '2024-01-15' },
              { title: 'Third Post', url: '/blog/third', date: '2024-02-01' },
            ],
          },
        }
      );

      const d = doc(file);
      const articles = d.querySelectorAll('article');
      assert.strictEqual(articles.length, 3);

      const firstLink = articles[0].querySelector('a');
      assert.strictEqual(firstLink.getAttribute('href'), '/blog/first');
      assert.strictEqual(firstLink.textContent, 'First Post');
      assert.strictEqual(articles[2].querySelector('time').textContent, '2024-02-01');
    });

    it('should handle a navigation menu scenario', async () => {
      const file = await run(
        '<nav><a data-repeat="navItems as item" href="${item.href}">${item.label}</a></nav>',
        {
          navItems: [
            { label: 'Home', href: '/' },
            { label: 'About', href: '/about' },
            { label: 'Blog', href: '/blog' },
            { label: 'Contact', href: '/contact' },
          ],
        }
      );

      const links = Array.from(doc(file).querySelectorAll('nav a'));
      assert.strictEqual(links.length, 4);
      assert.strictEqual(links[0].getAttribute('href'), '/');
      assert.strictEqual(links[0].textContent, 'Home');
      assert.strictEqual(links[3].getAttribute('href'), '/contact');
      assert.strictEqual(links[3].textContent, 'Contact');
    });

    it('should handle an empty collection gracefully', async () => {
      const file = await run(
        '<ul><li data-repeat="items as item">${item}</li></ul>',
        { items: [] }
      );

      const d = doc(file);
      assert.strictEqual(d.querySelectorAll('li').length, 0);
      assert.strictEqual(d.querySelectorAll('ul').length, 1);
      assert.ok(!file.src.includes('data-repeat'));
    });
  });
});
