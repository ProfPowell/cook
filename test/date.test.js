/**
 * @file date.test.js
 * @description Regression tests for timezone-safe date handling using the
 * REAL ProcessMarkdown plugin (scripts/plugins/process-markdown.js):
 * buildPageData date extraction, buildCollections sorting, feed/JSON
 * serialisation of the real page-data shape, and rendered HTML <time>
 * output via applyLayout.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { ProcessMarkdown } from '../scripts/plugins/process-markdown.js';
import { srcPath } from '../scripts/utils/config/config.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProc(layouts = {}) {
  return new ProcessMarkdown({ store: { cachedLayouts: layouts }, data: {} });
}

/** Build page data through the real plugin. */
function buildPage(frontMatter, fileName = 'post', collection = 'blog') {
  const proc = makeProc();
  const filePath = `${srcPath}/${collection}/${fileName}.md`;
  return proc.buildPageData(filePath, frontMatter, '<p>content</p>');
}

// ============================================================================
// Tests
// ============================================================================

describe('Date Timezone Safety', () => {

  describe('buildPageData date extraction', () => {

    it('should keep YYYY-MM-DD string when gray-matter parses date to a Date object', () => {
      // gray-matter converts `date: 2026-02-15` to a Date at UTC midnight
      const { date, _dateSort } = buildPage({ date: new Date('2026-02-15') });

      assert.strictEqual(date, '2026-02-15');
      assert.ok(_dateSort instanceof Date);
    });

    it('should preserve string dates that are already strings', () => {
      const { date } = buildPage({ date: '2026-02-15' });
      assert.strictEqual(date, '2026-02-15');
    });

    it('should return null for missing dates', () => {
      const { date, _dateSort } = buildPage({ title: 'No Date' });
      assert.strictEqual(date, null);
      assert.strictEqual(_dateSort, null);
    });

    it('should handle ISO datetime strings from front matter', () => {
      const { date } = buildPage({ date: '2026-02-15T10:30:00Z' });
      assert.strictEqual(date, '2026-02-15T10:30:00Z');
    });

    it('should never produce a locale-dependent date string like "2/14/2026"', () => {
      // The original bug: new Date("2026-02-15") in PST → toLocaleDateString → "2/14/2026"
      const { date } = buildPage({ date: new Date('2026-02-15') });

      // Must be canonical YYYY-MM-DD, not locale format
      assert.match(date, /^\d{4}-\d{2}-\d{2}$/, `Expected YYYY-MM-DD, got "${date}"`);
      assert.strictEqual(date, '2026-02-15');
    });

    it('should produce the same day regardless of local timezone', () => {
      // Dates near midnight UTC are the ones most susceptible to timezone shift
      const edgeCases = ['2026-01-01', '2026-06-30', '2026-12-31'];

      for (const dateStr of edgeCases) {
        const { date } = buildPage({ date: new Date(dateStr) });
        assert.strictEqual(date, dateStr, `Date shifted for ${dateStr}`);
      }
    });
  });

  describe('Collection sorting (buildCollections)', () => {

    /** Run real buildCollections over real buildPageData outputs. */
    function sortViaCollections(pages) {
      const proc = makeProc();
      proc.processedFiles = pages.map(({ title, date }, i) =>
        proc.buildPageData(`${srcPath}/blog/p${i}.md`, { title, date }, '<p>c</p>')
      );
      proc.buildCollections();
      return proc.store.collections.blog;
    }

    it('should sort newest first using _dateSort', () => {
      const sorted = sortViaCollections([
        { title: 'Old', date: new Date('2026-01-01') },
        { title: 'New', date: new Date('2026-03-01') },
        { title: 'Mid', date: new Date('2026-02-01') },
      ]);

      assert.strictEqual(sorted[0].title, 'New');
      assert.strictEqual(sorted[1].title, 'Mid');
      assert.strictEqual(sorted[2].title, 'Old');
    });

    it('should push items without dates to the end', () => {
      const sorted = sortViaCollections([
        { title: 'No date' },
        { title: 'Has date', date: new Date('2026-02-15') },
      ]);

      assert.strictEqual(sorted[0].title, 'Has date');
      assert.strictEqual(sorted[1].title, 'No date');
    });

    it('should handle all items without dates', () => {
      const sorted = sortViaCollections([
        { title: 'A' },
        { title: 'B' },
      ]);
      // Both null — order is stable, no crash
      assert.strictEqual(sorted.length, 2);
    });

    it('should sort correctly when date strings differ from _dateSort objects', () => {
      const sorted = sortViaCollections([
        { title: 'Feb', date: new Date('2026-02-15') },
        { title: 'Jan', date: new Date('2026-01-20') },
        { title: 'Mar', date: new Date('2026-03-05') },
      ]);

      assert.strictEqual(sorted[0].title, 'Mar');
      assert.strictEqual(sorted[1].title, 'Feb');
      assert.strictEqual(sorted[2].title, 'Jan');
    });
  });

  describe('Feed date serialisation', () => {
    // generate-formats.js computes:
    //   item._dateSort ? item._dateSort.toISOString()
    //     : (item.date ? new Date(item.date).toISOString() : now)
    // These tests verify the REAL page-data shape feeds that expression.

    it('should produce valid ISO 8601 from _dateSort', () => {
      const item = buildPage({ title: 'Post', date: new Date('2026-02-15') });
      const result = item._dateSort.toISOString();

      assert.strictEqual(result, '2026-02-15T00:00:00.000Z');
      // Verify it round-trips
      assert.ok(!isNaN(new Date(result).getTime()));
    });

    it('should keep the date string parseable when used as a fallback', () => {
      const item = buildPage({ title: 'Post', date: '2026-02-15' });
      // Fallback path: new Date(item.date).toISOString()
      assert.strictEqual(new Date(item.date).toISOString(), '2026-02-15T00:00:00.000Z');
    });

    it('should produce valid XML-safe datetime for Atom feed', () => {
      const item = buildPage({ title: 'Post', date: new Date('2026-02-15') });
      const result = item._dateSort.toISOString();

      // Atom requires RFC 3339 / ISO 8601
      assert.match(result, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('JSON metadata date output', () => {

    it('should include the display date string in JSON meta', () => {
      const item = buildPage({ title: 'Post', date: new Date('2026-02-15') });

      // generate-formats.js copies item.date into meta.date
      const meta = { title: item.title, date: item.date };
      const parsed = JSON.parse(JSON.stringify(meta));

      assert.strictEqual(parsed.date, '2026-02-15');
    });

    it('should serialise _dateSort as ISO string when included in JSON', () => {
      const item = buildPage({ date: new Date('2026-02-15') });

      // JSON.stringify converts Date objects to ISO strings
      const parsed = JSON.parse(JSON.stringify({ _dateSort: item._dateSort }));

      assert.strictEqual(parsed._dateSort, '2026-02-15T00:00:00.000Z');
    });
  });

  describe('HTML template rendering with date (applyLayout)', () => {

    const TIME_LAYOUT = '<time datetime="${date}">${date}</time>';

    it('should produce a valid datetime attribute from the date string', async () => {
      const proc = makeProc({ post: TIME_LAYOUT });
      const pageData = proc.buildPageData(`${srcPath}/blog/p.md`, { date: new Date('2026-02-15') }, '<p>c</p>');

      const html = await proc.applyLayout('post', pageData);

      assert.ok(html.includes('datetime="2026-02-15"'));
      assert.ok(html.includes('>2026-02-15<'));
    });

    it('should not produce Date.toString() in datetime attribute', async () => {
      const proc = makeProc({ post: TIME_LAYOUT });
      const pageData = proc.buildPageData(`${srcPath}/blog/p.md`, { date: new Date('2026-02-15') }, '<p>c</p>');

      const html = await proc.applyLayout('post', pageData);

      // Must not contain locale strings like "Sat Feb 14" or "GMT"
      assert.ok(!html.includes('GMT'), 'datetime should not contain GMT');
      assert.ok(!html.includes('Pacific'), 'datetime should not contain timezone name');
      assert.ok(!html.includes('Feb 14'), 'datetime should not shift to previous day');
    });

    it('should handle date in a full layout template replacement', async () => {
      const proc = makeProc({ post: TIME_LAYOUT });
      const pageData = proc.buildPageData(
        `${srcPath}/blog/p.md`,
        { title: 'Test Post', author: 'Test', date: new Date('2026-02-15') },
        '<p>c</p>'
      );

      const html = await proc.applyLayout('post', pageData);

      assert.strictEqual(html, '<time datetime="2026-02-15">2026-02-15</time>');
    });
  });

  describe('gray-matter integration', () => {

    it('should extract YYYY-MM-DD from gray-matter parsed Date', async () => {
      const matter = (await import('gray-matter')).default;

      const md = `---
title: Test
date: 2026-02-15
---
Content`;

      const { data } = matter(md);

      // gray-matter parses bare dates to Date objects
      assert.ok(data.date instanceof Date, 'gray-matter should parse date to Date object');

      // The real buildPageData should recover the original string
      const { date } = buildPage(data);
      assert.strictEqual(date, '2026-02-15');
    });

    it('should handle quoted date strings from gray-matter', async () => {
      const matter = (await import('gray-matter')).default;

      const md = `---
title: Test
date: "2026-02-15"
---
Content`;

      const { data } = matter(md);

      // Quoted dates may remain strings or become Date — handle both
      const { date } = buildPage(data);
      assert.ok(
        date === '2026-02-15' || date.startsWith('2026-02-15'),
        `Expected date starting with 2026-02-15, got "${date}"`
      );
    });

    it('should handle dates at year boundaries without shifting', async () => {
      const matter = (await import('gray-matter')).default;

      for (const dateStr of ['2026-01-01', '2025-12-31']) {
        const md = `---\ndate: ${dateStr}\n---\nContent`;
        const { data } = matter(md);
        const { date } = buildPage(data);

        assert.strictEqual(date, dateStr, `Year boundary date ${dateStr} shifted to "${date}"`);
      }
    });
  });
});
