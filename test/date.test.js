/**
 * @file date.test.js
 * @description Regression tests for timezone-safe date handling through
 * markdown parsing, collection sorting, feed generation, JSON metadata,
 * and rendered HTML <time> output.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// ---------------------------------------------------------------------------
// Replicate the date logic from process-markdown.js buildPageData()
// so we can test it in isolation without wiring up the full build pipeline.
// ---------------------------------------------------------------------------

/**
 * Extract a display date and a sortable Date from front matter,
 * exactly as buildPageData does.
 */
function buildDateFields(frontMatterDate) {
  return {
    date: frontMatterDate
      ? (frontMatterDate instanceof Date
        ? frontMatterDate.toISOString().split('T')[0]
        : String(frontMatterDate))
      : null,
    _dateSort: frontMatterDate ? new Date(frontMatterDate) : null,
  };
}

/**
 * Sort a collection by _dateSort (newest first),
 * exactly as buildCollections does.
 */
function sortCollection(items) {
  return [...items].sort((a, b) => {
    if (!a._dateSort && !b._dateSort) return 0;
    if (!a._dateSort) return 1;
    if (!b._dateSort) return -1;
    return b._dateSort - a._dateSort;
  });
}

/**
 * Produce a feed <updated> value from a collection item,
 * exactly as generateFeed does.
 */
function feedDate(item) {
  const now = '2026-01-01T00:00:00.000Z';  // fallback for tests
  return item._dateSort
    ? item._dateSort.toISOString()
    : (item.date ? new Date(item.date).toISOString() : now);
}

// ============================================================================
// Tests
// ============================================================================

describe('Date Timezone Safety', () => {

  describe('buildPageData date extraction', () => {

    it('should keep YYYY-MM-DD string when gray-matter parses date to a Date object', () => {
      // gray-matter converts `date: 2026-02-15` to a Date at UTC midnight
      const grayMatterDate = new Date('2026-02-15');
      const { date, _dateSort } = buildDateFields(grayMatterDate);

      assert.strictEqual(date, '2026-02-15');
      assert.ok(_dateSort instanceof Date);
    });

    it('should preserve string dates that are already strings', () => {
      const { date } = buildDateFields('2026-02-15');
      assert.strictEqual(date, '2026-02-15');
    });

    it('should return null for missing dates', () => {
      const { date, _dateSort } = buildDateFields(undefined);
      assert.strictEqual(date, null);
      assert.strictEqual(_dateSort, null);
    });

    it('should handle ISO datetime strings from front matter', () => {
      const { date } = buildDateFields('2026-02-15T10:30:00Z');
      assert.strictEqual(date, '2026-02-15T10:30:00Z');
    });

    it('should never produce a locale-dependent date string like "2/14/2026"', () => {
      // The original bug: new Date("2026-02-15") in PST → toLocaleDateString → "2/14/2026"
      const grayMatterDate = new Date('2026-02-15');
      const { date } = buildDateFields(grayMatterDate);

      // Must be canonical YYYY-MM-DD, not locale format
      assert.match(date, /^\d{4}-\d{2}-\d{2}$/, `Expected YYYY-MM-DD, got "${date}"`);
      assert.strictEqual(date, '2026-02-15');
    });

    it('should produce the same day regardless of local timezone', () => {
      // Dates near midnight UTC are the ones most susceptible to timezone shift
      const edgeCases = ['2026-01-01', '2026-06-30', '2026-12-31'];

      for (const dateStr of edgeCases) {
        const grayMatterDate = new Date(dateStr);
        const { date } = buildDateFields(grayMatterDate);
        assert.strictEqual(date, dateStr, `Date shifted for ${dateStr}`);
      }
    });
  });

  describe('Collection sorting with _dateSort', () => {

    it('should sort newest first using _dateSort', () => {
      const items = [
        { title: 'Old', ...buildDateFields(new Date('2026-01-01')) },
        { title: 'New', ...buildDateFields(new Date('2026-03-01')) },
        { title: 'Mid', ...buildDateFields(new Date('2026-02-01')) },
      ];

      const sorted = sortCollection(items);

      assert.strictEqual(sorted[0].title, 'New');
      assert.strictEqual(sorted[1].title, 'Mid');
      assert.strictEqual(sorted[2].title, 'Old');
    });

    it('should push items without dates to the end', () => {
      const items = [
        { title: 'No date', ...buildDateFields(undefined) },
        { title: 'Has date', ...buildDateFields(new Date('2026-02-15')) },
      ];

      const sorted = sortCollection(items);

      assert.strictEqual(sorted[0].title, 'Has date');
      assert.strictEqual(sorted[1].title, 'No date');
    });

    it('should handle all items without dates', () => {
      const items = [
        { title: 'A', ...buildDateFields(undefined) },
        { title: 'B', ...buildDateFields(undefined) },
      ];

      const sorted = sortCollection(items);
      // Both null — order is stable, no crash
      assert.strictEqual(sorted.length, 2);
    });

    it('should sort correctly when date strings differ from _dateSort objects', () => {
      // Verify sorting uses _dateSort (Date) not date (string)
      const items = [
        { title: 'Feb', ...buildDateFields(new Date('2026-02-15')) },
        { title: 'Jan', ...buildDateFields(new Date('2026-01-20')) },
        { title: 'Mar', ...buildDateFields(new Date('2026-03-05')) },
      ];

      const sorted = sortCollection(items);

      assert.strictEqual(sorted[0].title, 'Mar');
      assert.strictEqual(sorted[1].title, 'Feb');
      assert.strictEqual(sorted[2].title, 'Jan');
    });
  });

  describe('Feed date serialisation', () => {

    it('should produce valid ISO 8601 from _dateSort', () => {
      const item = { title: 'Post', ...buildDateFields(new Date('2026-02-15')) };
      const result = feedDate(item);

      assert.strictEqual(result, '2026-02-15T00:00:00.000Z');
      // Verify it round-trips
      assert.ok(!isNaN(new Date(result).getTime()));
    });

    it('should fall back to parsing date string when _dateSort is absent', () => {
      const item = { title: 'Post', date: '2026-02-15', _dateSort: null };
      const result = feedDate(item);

      assert.strictEqual(result, '2026-02-15T00:00:00.000Z');
    });

    it('should produce valid XML-safe datetime for Atom feed', () => {
      const item = { title: 'Post', ...buildDateFields(new Date('2026-02-15')) };
      const result = feedDate(item);

      // Atom requires RFC 3339 / ISO 8601
      assert.match(result, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('JSON metadata date output', () => {

    it('should include the display date string in JSON meta', () => {
      const item = { title: 'Post', ...buildDateFields(new Date('2026-02-15')) };

      // generate-formats.js copies item.date into meta.date
      const meta = { title: item.title, date: item.date };
      const json = JSON.stringify(meta);
      const parsed = JSON.parse(json);

      assert.strictEqual(parsed.date, '2026-02-15');
    });

    it('should serialise _dateSort as ISO string when included in JSON', () => {
      const item = { ...buildDateFields(new Date('2026-02-15')) };

      // JSON.stringify converts Date objects to ISO strings
      const json = JSON.stringify({ _dateSort: item._dateSort });
      const parsed = JSON.parse(json);

      assert.strictEqual(parsed._dateSort, '2026-02-15T00:00:00.000Z');
    });
  });

  describe('HTML template rendering with date', () => {

    it('should produce a valid datetime attribute from the date string', () => {
      const { date } = buildDateFields(new Date('2026-02-15'));

      // Layout template: <time datetime="${date}">${date}</time>
      const html = `<time datetime="${date}">${date}</time>`;

      assert.ok(html.includes('datetime="2026-02-15"'));
      assert.ok(html.includes('>2026-02-15<'));
    });

    it('should not produce Date.toString() in datetime attribute', () => {
      const { date } = buildDateFields(new Date('2026-02-15'));

      const html = `<time datetime="${date}">${date}</time>`;

      // Must not contain locale strings like "Sat Feb 14" or "GMT"
      assert.ok(!html.includes('GMT'), 'datetime should not contain GMT');
      assert.ok(!html.includes('Pacific'), 'datetime should not contain timezone name');
      assert.ok(!html.includes('Feb 14'), 'datetime should not shift to previous day');
    });

    it('should handle date in a full layout template replacement', () => {
      const pageData = {
        title: 'Test Post',
        author: 'Test',
        ...buildDateFields(new Date('2026-02-15')),
      };

      const template = '<time datetime="${date}">${date}</time>';
      const result = template.replace(/\$\{([^}]+)\}/g, (match, key) => {
        return pageData[key.trim()] !== undefined ? pageData[key.trim()] : match;
      });

      assert.strictEqual(result, '<time datetime="2026-02-15">2026-02-15</time>');
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

      // Our extraction should recover the original string
      const { date } = buildDateFields(data.date);
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
      const { date } = buildDateFields(data.date);
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
        const { date } = buildDateFields(data.date);

        assert.strictEqual(date, dateStr, `Year boundary date ${dateStr} shifted to "${date}"`);
      }
    });
  });
});
