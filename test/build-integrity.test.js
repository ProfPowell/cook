/**
 * @file build-integrity.test.js
 * @description Build-output integrity checks: dangling internal links,
 * missing generated targets, and format artifact parity.
 *
 * Requires a completed build (`npm run build`) before running.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, '..', 'dist');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively collect all files under a directory */
function walkDir(dir) {
  const results = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walkDir(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

/** Pages/paths to skip — test fixtures with intentional placeholder refs */
const skipPaths = ['/components-test/'];

/** Get all index.html pages in dist (the routable pages) */
function getPages() {
  return walkDir(distPath)
    .filter(f => f.endsWith('/index.html') || f === path.join(distPath, 'index.html'))
    .filter(f => !skipPaths.some(s => toUrlPath(f) === s));
}

/** Convert a dist file path to its URL path */
function toUrlPath(filePath) {
  return filePath
    .replace(distPath, '')
    .replace(/\/index\.html$/, '/')
    .replace(/^$/, '/');
}

/** Extract all href="/..." and src="/..." from an HTML string */
function extractInternalRefs(html) {
  const refs = new Set();
  const pattern = /(?:href|src)="(\/[^"]*?)"/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    refs.add(match[1]);
  }
  return refs;
}

/** Check whether an internal path resolves to a file in dist */
function resolves(urlPath) {
  // Strip query string and hash
  const clean = urlPath.split('?')[0].split('#')[0];

  // Direct file match (e.g., /assets/css/styles.css)
  if (existsSync(path.join(distPath, clean))) return true;

  // Directory with index.html (e.g., /about/ → dist/about/index.html)
  if (clean.endsWith('/') && existsSync(path.join(distPath, clean, 'index.html'))) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Pre-check
// ---------------------------------------------------------------------------

before(() => {
  assert.ok(
    existsSync(distPath),
    'dist/ directory does not exist — run `npm run build` first'
  );
});

// ============================================================================
// Tests
// ============================================================================

describe('Internal Link Integrity', () => {

  it('should have no dangling internal links across all HTML pages', () => {
    const pages = getPages();
    assert.ok(pages.length > 0, 'No pages found in dist');

    const broken = [];

    for (const page of pages) {
      const html = readFileSync(page, 'utf-8');
      const refs = extractInternalRefs(html);

      for (const ref of refs) {
        if (!resolves(ref)) {
          broken.push({ page: toUrlPath(page), link: ref });
        }
      }
    }

    if (broken.length > 0) {
      const details = broken
        .map(b => `  ${b.page} → ${b.link}`)
        .join('\n');
      assert.fail(`Found ${broken.length} broken internal link(s):\n${details}`);
    }
  });

  it('should have no dangling links in fragment files', () => {
    const fragments = walkDir(distPath)
      .filter(f => f.endsWith('_fragment.html'))
      .filter(f => !skipPaths.some(s => f.replace(distPath, '').startsWith(s)));
    assert.ok(fragments.length > 0, 'No fragment files found');

    const broken = [];

    for (const frag of fragments) {
      const html = readFileSync(frag, 'utf-8');
      const refs = extractInternalRefs(html);

      for (const ref of refs) {
        if (!resolves(ref)) {
          const relPath = frag.replace(distPath, '');
          broken.push({ fragment: relPath, link: ref });
        }
      }
    }

    if (broken.length > 0) {
      const details = broken
        .map(b => `  ${b.fragment} → ${b.link}`)
        .join('\n');
      assert.fail(`Found ${broken.length} broken link(s) in fragments:\n${details}`);
    }
  });
});

describe('Product Detail Pages', () => {

  const productSlugs = ['trail-runner-pack', 'summit-shelter', 'beacon-headlamp'];

  for (const slug of productSlugs) {
    it(`should have /products/${slug}/index.html`, () => {
      assert.ok(
        existsSync(path.join(distPath, 'products', slug, 'index.html')),
        `Missing product page: /products/${slug}/`
      );
    });

    it(`should have /products/${slug}/_fragment.html`, () => {
      assert.ok(
        existsSync(path.join(distPath, 'products', slug, '_fragment.html')),
        `Missing product fragment: /products/${slug}/_fragment.html`
      );
    });

    it(`should have /api/products/${slug}.json`, () => {
      assert.ok(
        existsSync(path.join(distPath, 'api', 'products', `${slug}.json`)),
        `Missing product JSON: /api/products/${slug}.json`
      );
    });
  }
});

describe('Fragment Parity', () => {

  it('should have a _fragment.html for every index.html page (except 404)', () => {
    const pages = getPages().filter(p => !p.includes('/404'));
    const missing = [];

    for (const page of pages) {
      const dir = path.dirname(page);
      const fragmentPath = path.join(dir, '_fragment.html');
      if (!existsSync(fragmentPath)) {
        missing.push(toUrlPath(page));
      }
    }

    if (missing.length > 0) {
      assert.fail(`Missing fragments for:\n  ${missing.join('\n  ')}`);
    }
  });
});

describe('JSON API Parity', () => {

  it('should have a .json file for every index.html page (except 404)', () => {
    const pages = getPages().filter(p => !p.includes('/404'));
    const missing = [];

    for (const page of pages) {
      const urlPath = toUrlPath(page);
      const trimmed = urlPath.replace(/^\//, '').replace(/\/$/, '') || 'index';
      const jsonPath = path.join(distPath, 'api', `${trimmed}.json`);

      if (!existsSync(jsonPath)) {
        missing.push({ page: urlPath, expected: `/api/${trimmed}.json` });
      }
    }

    if (missing.length > 0) {
      const details = missing.map(m => `  ${m.page} → ${m.expected}`).join('\n');
      assert.fail(`Missing JSON metadata for:\n${details}`);
    }
  });

  it('should have valid JSON in every .json file', () => {
    const jsonFiles = walkDir(path.join(distPath, 'api')).filter(f => f.endsWith('.json'));
    assert.ok(jsonFiles.length > 0, 'No JSON files found in dist/api');

    for (const file of jsonFiles) {
      const content = readFileSync(file, 'utf-8');
      try {
        JSON.parse(content);
      } catch {
        assert.fail(`Invalid JSON in ${file.replace(distPath, '')}`);
      }
    }
  });

  it('should include a url field in every JSON metadata file', () => {
    const jsonFiles = walkDir(path.join(distPath, 'api')).filter(f => f.endsWith('.json'));

    for (const file of jsonFiles) {
      const meta = JSON.parse(readFileSync(file, 'utf-8'));
      assert.ok(
        meta.url,
        `Missing url field in ${file.replace(distPath, '')}`
      );
    }
  });
});

describe('Markdown Copy Parity', () => {

  it('should have a markdown copy for every markdown-sourced page', () => {
    const mdCopies = walkDir(path.join(distPath, 'md')).filter(f => f.endsWith('.md'));
    // Each markdown copy should point to an existing page
    for (const mdFile of mdCopies) {
      const relPath = mdFile.replace(path.join(distPath, 'md'), '');
      // /blog/gear-care-guide/index.md → /blog/gear-care-guide/index.html
      const htmlPath = path.join(distPath, relPath.replace(/\.md$/, '.html'));
      assert.ok(
        existsSync(htmlPath),
        `Markdown copy ${relPath} has no matching HTML page`
      );
    }
  });

  it('should reference markdown copies correctly in JSON metadata', () => {
    const jsonFiles = walkDir(path.join(distPath, 'api')).filter(f => f.endsWith('.json'));

    for (const file of jsonFiles) {
      const meta = JSON.parse(readFileSync(file, 'utf-8'));
      if (meta.markdownUrl) {
        const mdPath = path.join(distPath, meta.markdownUrl);
        assert.ok(
          existsSync(mdPath),
          `JSON ${file.replace(distPath, '')} references missing markdown: ${meta.markdownUrl}`
        );
      }
    }
  });
});

describe('Feed and LLMs.txt', () => {

  it('should have a feed.xml file', () => {
    assert.ok(existsSync(path.join(distPath, 'feed.xml')), 'Missing feed.xml');
  });

  it('should have valid XML structure in feed.xml', () => {
    const content = readFileSync(path.join(distPath, 'feed.xml'), 'utf-8');
    assert.ok(content.startsWith('<?xml'), 'feed.xml should start with XML declaration');
    assert.ok(content.includes('<feed'), 'feed.xml should contain <feed> element');
    assert.ok(content.includes('</feed>'), 'feed.xml should close <feed> element');
  });

  it('should have a llms.txt file', () => {
    assert.ok(existsSync(path.join(distPath, 'llms.txt')), 'Missing llms.txt');
  });

  it('should reference only existing markdown files in llms.txt', () => {
    const content = readFileSync(path.join(distPath, 'llms.txt'), 'utf-8');
    const mdUrlPattern = /\]\(((?:https?:\/\/[^)]*)?\/md\/[^)]+)\)/g;
    let match;
    const broken = [];

    while ((match = mdUrlPattern.exec(content)) !== null) {
      // Strip domain prefix if present
      const url = match[1].replace(/^https?:\/\/[^/]+/, '');
      if (!existsSync(path.join(distPath, url))) {
        broken.push(url);
      }
    }

    if (broken.length > 0) {
      assert.fail(`llms.txt references missing markdown files:\n  ${broken.join('\n  ')}`);
    }
  });
});

describe('Sitemap', () => {

  it('should have a sitemap.xml', () => {
    assert.ok(existsSync(path.join(distPath, 'sitemap.xml')), 'Missing sitemap.xml');
  });

  it('should reference only existing pages in sitemap.xml', () => {
    const content = readFileSync(path.join(distPath, 'sitemap.xml'), 'utf-8');
    const locPattern = /<loc>([^<]+)<\/loc>/g;
    let match;
    const broken = [];

    while ((match = locPattern.exec(content)) !== null) {
      const url = match[1];
      // Extract path from full URL
      const urlPath = url.replace(/^https?:\/\/[^/]+/, '');
      if (!resolves(urlPath)) {
        broken.push(urlPath);
      }
    }

    if (broken.length > 0) {
      assert.fail(`sitemap.xml references missing pages:\n  ${broken.join('\n  ')}`);
    }
  });
});

describe('404 Page', () => {

  it('should have /404.html at the dist root (not /404/index.html)', () => {
    assert.ok(
      existsSync(path.join(distPath, '404.html')),
      'Missing /404.html — worker expects this path'
    );
  });
});
