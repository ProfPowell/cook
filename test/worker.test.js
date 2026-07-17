/**
 * @file worker.test.js
 * @description Tests the REAL Cloudflare Worker (worker/index.js) for
 * routing and content negotiation. Everything is driven through the
 * worker's default-export fetch handler with a stubbed env.ASSETS —
 * no internal helpers are re-implemented.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import worker from '../worker/index.js';

// ---------------------------------------------------------------------------
// Helpers for building mock env.ASSETS and requests
// ---------------------------------------------------------------------------

/**
 * Build a mock env.ASSETS that serves from a virtual file map.
 * Keys are pathname strings; values are body strings or
 * { body, headers } objects. Optionally records fetched pathnames.
 */
function mockAssets(fileMap, { record } = {}) {
  return {
    ASSETS: {
      async fetch(req) {
        const url = new URL(typeof req === 'string' ? req : req.url);
        if (record) record.push(url.pathname);
        const entry = fileMap[url.pathname];
        if (entry !== undefined) {
          const body = typeof entry === 'string' ? entry : entry.body;
          const headers = typeof entry === 'string' ? {} : (entry.headers || {});
          return new Response(body, { status: 200, headers });
        }
        return new Response('Not Found', { status: 404 });
      },
    },
  };
}

/** Build a Request with optional headers. */
function makeRequest(pathname, headers = {}) {
  return new Request(`https://example.com${pathname}`, { headers: new Headers(headers) });
}

// ============================================================================
// Tests
// ============================================================================

describe('Content Negotiation (via worker.fetch)', () => {

  describe('format negotiation', () => {

    it('should serve the fragment for X-Requested-With: htmlstar', async () => {
      const env = mockAssets({ '/blog/post/_fragment.html': '<article>F</article>' });
      const res = await worker.fetch(
        makeRequest('/blog/post/', { 'X-Requested-With': 'htmlstar' }), env
      );
      assert.strictEqual(res.status, 200);
      assert.strictEqual(await res.text(), '<article>F</article>');
    });

    it('should be case-insensitive for X-Requested-With', async () => {
      for (const value of ['HtmlStar', 'HTMLSTAR']) {
        const env = mockAssets({ '/blog/post/_fragment.html': '<article>F</article>' });
        const res = await worker.fetch(
          makeRequest('/blog/post/', { 'X-Requested-With': value }), env
        );
        assert.strictEqual(res.status, 200, `failed for ${value}`);
        assert.strictEqual(await res.text(), '<article>F</article>', `failed for ${value}`);
      }
    });

    it('should serve markdown for Accept: text/markdown', async () => {
      const env = mockAssets({ '/md/blog/post/index.md': '# Hello' });
      const res = await worker.fetch(
        makeRequest('/blog/post/', { Accept: 'text/markdown' }), env
      );
      assert.strictEqual(res.status, 200);
      assert.strictEqual(await res.text(), '# Hello');
    });

    it('should serve json for explicit application/json without text/html', async () => {
      const env = mockAssets({ '/api/blog/post.json': '{"title":"Post"}' });
      const res = await worker.fetch(
        makeRequest('/blog/post/', { Accept: 'application/json' }), env
      );
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(JSON.parse(await res.text()), { title: 'Post' });
    });

    it('should serve the page when Accept includes both application/json and text/html', async () => {
      const record = [];
      const env = mockAssets({ '/blog/post/': '<h1>Page</h1>' }, { record });
      const res = await worker.fetch(
        makeRequest('/blog/post/', { Accept: 'text/html, application/json' }), env
      );
      assert.strictEqual(res.status, 200);
      assert.strictEqual(await res.text(), '<h1>Page</h1>');
      // No rewritten (/api/...) path was ever attempted
      assert.deepStrictEqual(record, ['/blog/post/']);
    });

    it('should serve the page for a default browser Accept header', async () => {
      const record = [];
      const env = mockAssets({ '/blog/post/': '<h1>Page</h1>' }, { record });
      const res = await worker.fetch(
        makeRequest('/blog/post/', { Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' }), env
      );
      assert.strictEqual(res.status, 200);
      assert.strictEqual(await res.text(), '<h1>Page</h1>');
      assert.deepStrictEqual(record, ['/blog/post/']);
    });

    it('should serve the page when no relevant headers are set', async () => {
      const record = [];
      const env = mockAssets({ '/blog/post/': '<h1>Page</h1>' }, { record });
      const res = await worker.fetch(makeRequest('/blog/post/'), env);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(record, ['/blog/post/']);
    });

    it('should prioritise fragment over markdown when both headers present', async () => {
      const env = mockAssets({
        '/blog/post/_fragment.html': '<article>F</article>',
        '/md/blog/post/index.md': '# MD',
      });
      const res = await worker.fetch(
        makeRequest('/blog/post/', { Accept: 'text/markdown', 'X-Requested-With': 'htmlstar' }),
        env
      );
      assert.strictEqual(await res.text(), '<article>F</article>');
    });
  });

  describe('path rewriting', () => {

    async function firstFetchedPath(pathname, headers) {
      const record = [];
      const env = mockAssets({}, { record });
      await worker.fetch(makeRequest(pathname, headers), env);
      return record[0];
    }

    it('should rewrite fragment path for a nested page', async () => {
      assert.strictEqual(
        await firstFetchedPath('/blog/my-post/', { 'X-Requested-With': 'htmlstar' }),
        '/blog/my-post/_fragment.html'
      );
    });

    it('should add trailing slash before rewriting fragment for path without one', async () => {
      assert.strictEqual(
        await firstFetchedPath('/blog/my-post', { 'X-Requested-With': 'htmlstar' }),
        '/blog/my-post/_fragment.html'
      );
    });

    it('should rewrite markdown path for a nested page', async () => {
      assert.strictEqual(
        await firstFetchedPath('/blog/my-post/', { Accept: 'text/markdown' }),
        '/md/blog/my-post/index.md'
      );
    });

    it('should rewrite json path for a nested page', async () => {
      assert.strictEqual(
        await firstFetchedPath('/blog/my-post/', { Accept: 'application/json' }),
        '/api/blog/my-post.json'
      );
    });

    it('should rewrite json path for root to /api/index.json', async () => {
      assert.strictEqual(
        await firstFetchedPath('/', { Accept: 'application/json' }),
        '/api/index.json'
      );
    });

    it('should rewrite markdown path for root to /md/index.md', async () => {
      assert.strictEqual(
        await firstFetchedPath('/', { Accept: 'text/markdown' }),
        '/md/index.md'
      );
    });

    it('should rewrite fragment path for root', async () => {
      assert.strictEqual(
        await firstFetchedPath('/', { 'X-Requested-With': 'htmlstar' }),
        '/_fragment.html'
      );
    });

    it('should not rewrite for page format', async () => {
      const record = [];
      const env = mockAssets({ '/about/': '<p>About</p>' }, { record });
      await worker.fetch(makeRequest('/about/'), env);
      assert.deepStrictEqual(record, ['/about/']);
    });

    it('should not rewrite paths with file extensions for page format', async () => {
      const record = [];
      const env = mockAssets({ '/styles.css': 'body{}' }, { record });
      const res = await worker.fetch(makeRequest('/styles.css'), env);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(record, ['/styles.css']);
    });

    it('should not double-slash rewrite for paths with trailing slash', async () => {
      assert.strictEqual(
        await firstFetchedPath('/blog/', { Accept: 'text/markdown' }),
        '/md/blog/index.md'
      );
      assert.strictEqual(
        await firstFetchedPath('/blog/', { Accept: 'application/json' }),
        '/api/blog.json'
      );
    });
  });
});

describe('Vary and Content-Type Headers (via worker.fetch)', () => {

  it('should set Vary header on all responses', async () => {
    const env = mockAssets({ '/about/': '<p>About</p>' });
    const res = await worker.fetch(makeRequest('/about/'), env);
    assert.strictEqual(res.headers.get('Vary'), 'Accept, X-Requested-With');
  });

  it('should set Content-Type to text/markdown when the markdown variant is served', async () => {
    const env = mockAssets({ '/md/docs/index.md': '# Docs' });
    const res = await worker.fetch(makeRequest('/docs/', { Accept: 'text/markdown' }), env);
    assert.strictEqual(res.headers.get('Content-Type'), 'text/markdown; charset=utf-8');
  });

  it('should set Content-Type to application/json when the json variant is served', async () => {
    const env = mockAssets({ '/api/docs.json': '{}' });
    const res = await worker.fetch(makeRequest('/docs/', { Accept: 'application/json' }), env);
    assert.strictEqual(res.headers.get('Content-Type'), 'application/json; charset=utf-8');
  });

  it('should set Content-Type to text/html when the fragment variant is served', async () => {
    const env = mockAssets({ '/docs/_fragment.html': '<main>D</main>' });
    const res = await worker.fetch(
      makeRequest('/docs/', { 'X-Requested-With': 'htmlstar' }), env
    );
    assert.strictEqual(res.headers.get('Content-Type'), 'text/html; charset=utf-8');
  });

  it('should NOT stamp the negotiated Content-Type on a fallback response', async () => {
    // REAL behavior: when the negotiated variant does not exist and the
    // original file is served instead, its own Content-Type is preserved.
    const env = mockAssets({
      '/docs/': { body: '<html>page</html>', headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    });
    const res = await worker.fetch(makeRequest('/docs/', { Accept: 'text/markdown' }), env);
    assert.strictEqual(res.status, 200);
    const ct = res.headers.get('Content-Type') || '';
    assert.ok(!ct.includes('text/markdown'), `HTML fallback mislabeled as ${ct}`);
    assert.ok(ct.includes('text/html'), `expected text/html, got ${ct}`);
  });

  it('should not override existing Cache-Control', async () => {
    const env = mockAssets({
      '/about/': { body: 'ok', headers: { 'Cache-Control': 'no-store' } },
    });
    const res = await worker.fetch(makeRequest('/about/'), env);
    assert.strictEqual(res.headers.get('Cache-Control'), 'no-store');
  });

  it('should add default Cache-Control when none exists', async () => {
    const env = mockAssets({ '/about/': 'ok' });
    const res = await worker.fetch(makeRequest('/about/'), env);
    assert.strictEqual(
      res.headers.get('Cache-Control'),
      'public, max-age=60, stale-while-revalidate=300'
    );
  });
});

describe('Worker fetch Integration', () => {

  it('should serve the static page for a normal browser request', async () => {
    const env = mockAssets({ '/about/': '<h1>About</h1>' });
    const res = await worker.fetch(makeRequest('/about/'), env);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(await res.text(), '<h1>About</h1>');
    assert.strictEqual(res.headers.get('Vary'), 'Accept, X-Requested-With');
  });

  it('should serve a fragment when X-Requested-With: htmlstar', async () => {
    const env = mockAssets({ '/blog/post/_fragment.html': '<article>Fragment</article>' });
    const res = await worker.fetch(
      makeRequest('/blog/post/', { 'X-Requested-With': 'htmlstar' }),
      env
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(await res.text(), '<article>Fragment</article>');
    assert.strictEqual(res.headers.get('Content-Type'), 'text/html; charset=utf-8');
  });

  it('should serve markdown when Accept: text/markdown', async () => {
    const env = mockAssets({ '/md/blog/post/index.md': '# Hello' });
    const res = await worker.fetch(
      makeRequest('/blog/post/', { Accept: 'text/markdown' }),
      env
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(await res.text(), '# Hello');
    assert.strictEqual(res.headers.get('Content-Type'), 'text/markdown; charset=utf-8');
  });

  it('should serve JSON when Accept: application/json', async () => {
    const body = JSON.stringify({ title: 'Post' });
    const env = mockAssets({ '/api/blog/post.json': body });
    const res = await worker.fetch(
      makeRequest('/blog/post/', { Accept: 'application/json' }),
      env
    );
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(JSON.parse(await res.text()), { title: 'Post' });
    assert.strictEqual(res.headers.get('Content-Type'), 'application/json; charset=utf-8');
  });

  it('should serve root markdown at /md/index.md', async () => {
    const env = mockAssets({ '/md/index.md': '# Home' });
    const res = await worker.fetch(
      makeRequest('/', { Accept: 'text/markdown' }),
      env
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(await res.text(), '# Home');
  });

  it('should serve root JSON at /api/index.json', async () => {
    const env = mockAssets({ '/api/index.json': '{"home":true}' });
    const res = await worker.fetch(
      makeRequest('/', { Accept: 'application/json' }),
      env
    );
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(JSON.parse(await res.text()), { home: true });
  });

  it('should serve root fragment at /_fragment.html', async () => {
    const env = mockAssets({ '/_fragment.html': '<main>Root</main>' });
    const res = await worker.fetch(
      makeRequest('/', { 'X-Requested-With': 'htmlstar' }),
      env
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(await res.text(), '<main>Root</main>');
  });

  it('should fall back to static file when rewritten path does not exist', async () => {
    const env = mockAssets({ '/blog/post/': '<h1>Post</h1>' });
    const res = await worker.fetch(
      makeRequest('/blog/post/', { Accept: 'text/markdown' }),
      env
    );
    // markdown rewrite to /md/blog/post/index.md is 404, falls back to original
    assert.strictEqual(res.status, 200);
    assert.strictEqual(await res.text(), '<h1>Post</h1>');
  });

  describe('Custom 404 handling', () => {

    it('should serve /404.html with status 404 for unknown paths', async () => {
      const env = mockAssets({ '/404.html': '<h1>Not Found</h1>' });
      const res = await worker.fetch(makeRequest('/does-not-exist/'), env);
      assert.strictEqual(res.status, 404);
      assert.strictEqual(await res.text(), '<h1>Not Found</h1>');
    });

    it('should return plain text 404 when /404.html does not exist', async () => {
      const env = mockAssets({});
      const res = await worker.fetch(makeRequest('/nope/'), env);
      assert.strictEqual(res.status, 404);
      assert.strictEqual(await res.text(), 'Not Found');
    });

    it('should NOT look for /404/index.html (old bug)', async () => {
      // Ensure we use /404.html, not /404/index.html
      const env = mockAssets({ '/404/index.html': 'old path' });
      const res = await worker.fetch(makeRequest('/nope/'), env);
      // Should NOT find the old path — should return plain 404
      assert.strictEqual(res.status, 404);
      assert.strictEqual(await res.text(), 'Not Found');
    });
  });

  describe('Path normalisation', () => {

    it('should handle paths without trailing slash', async () => {
      const env = mockAssets({ '/about/_fragment.html': '<p>About</p>' });
      const res = await worker.fetch(
        makeRequest('/about', { 'X-Requested-With': 'htmlstar' }),
        env
      );
      assert.strictEqual(res.status, 200);
      assert.strictEqual(await res.text(), '<p>About</p>');
    });
  });
});
