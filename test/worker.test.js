/**
 * @file worker.test.js
 * @description Integration tests for Cloudflare Worker routing and content negotiation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// ---------------------------------------------------------------------------
// Import the worker module. Its default export has a `fetch(request, env)`.
// We also want to test the internal helpers, so we inline them here since
// they aren't exported.  The integration tests exercise them through the
// worker's fetch handler.
// ---------------------------------------------------------------------------

// Re-implement the three internal helpers so we can unit-test them directly.
// These are intentionally kept as exact copies of worker/index.js.

function negotiateFormat(accept, requestedWith) {
  if (requestedWith.toLowerCase() === 'htmlstar') return 'fragment';
  if (accept.includes('text/markdown')) return 'markdown';
  if (accept.includes('application/json') && !accept.includes('text/html')) return 'json';
  return 'page';
}

function rewritePath(pathname, format) {
  const hasExtension = pathname.split('/').pop().includes('.');
  const normalizedPath = hasExtension
    ? pathname
    : pathname.endsWith('/')
      ? pathname
      : pathname + '/';
  const basePath = normalizedPath.replace(/\/$/, '') || '';

  switch (format) {
    case 'fragment':
      return `${basePath}/_fragment.html`;
    case 'markdown':
      return `/md${basePath}/index.md`;
    case 'json':
      return `/api${basePath || '/index'}.json`;
    default:
      return pathname;
  }
}

function addVaryHeader(response, format) {
  const headers = new Headers(response.headers);
  headers.set('Vary', 'Accept, X-Requested-With');
  switch (format) {
    case 'markdown':
      headers.set('Content-Type', 'text/markdown; charset=utf-8');
      break;
    case 'json':
      headers.set('Content-Type', 'application/json; charset=utf-8');
      break;
    case 'fragment':
      headers.set('Content-Type', 'text/html; charset=utf-8');
      break;
  }
  if (!headers.has('Cache-Control')) {
    headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  }
  return new Response(response.body, { status: response.status, headers });
}

// ---------------------------------------------------------------------------
// Helpers for building mock env.ASSETS and requests
// ---------------------------------------------------------------------------

/**
 * Build a mock env.ASSETS that serves from a virtual file map.
 * Keys are pathname strings, values are response body strings.
 */
function mockAssets(fileMap) {
  return {
    ASSETS: {
      async fetch(req) {
        const url = new URL(typeof req === 'string' ? req : req.url);
        const body = fileMap[url.pathname];
        if (body !== undefined) {
          return new Response(body, { status: 200 });
        }
        return new Response('Not Found', { status: 404 });
      },
    },
  };
}

/** Build a Request with optional headers. */
function makeRequest(pathname, headers = {}) {
  const h = new Headers(headers);
  return new Request(`https://example.com${pathname}`, { headers: h });
}

// Import the actual worker fetch handler
const worker = (await import('../worker/index.js')).default;

// ============================================================================
// Tests
// ============================================================================

describe('Content Negotiation', () => {

  describe('negotiateFormat', () => {
    it('should return fragment for X-Requested-With: htmlstar', () => {
      assert.strictEqual(negotiateFormat('', 'htmlstar'), 'fragment');
    });

    it('should be case-insensitive for X-Requested-With', () => {
      assert.strictEqual(negotiateFormat('', 'HtmlStar'), 'fragment');
      assert.strictEqual(negotiateFormat('', 'HTMLSTAR'), 'fragment');
    });

    it('should return markdown for Accept: text/markdown', () => {
      assert.strictEqual(negotiateFormat('text/markdown', ''), 'markdown');
    });

    it('should return json for explicit application/json without text/html', () => {
      assert.strictEqual(negotiateFormat('application/json', ''), 'json');
    });

    it('should return page when Accept includes both application/json and text/html', () => {
      assert.strictEqual(
        negotiateFormat('text/html, application/json', ''),
        'page'
      );
    });

    it('should return page for default browser Accept header', () => {
      assert.strictEqual(
        negotiateFormat('text/html,application/xhtml+xml,*/*;q=0.8', ''),
        'page'
      );
    });

    it('should return page when no relevant headers are set', () => {
      assert.strictEqual(negotiateFormat('', ''), 'page');
    });

    it('should prioritise fragment over markdown when both headers present', () => {
      assert.strictEqual(negotiateFormat('text/markdown', 'htmlstar'), 'fragment');
    });
  });

  describe('rewritePath', () => {

    it('should rewrite fragment path for a nested page', () => {
      assert.strictEqual(rewritePath('/blog/my-post/', 'fragment'), '/blog/my-post/_fragment.html');
    });

    it('should add trailing slash before rewriting fragment for path without one', () => {
      assert.strictEqual(rewritePath('/blog/my-post', 'fragment'), '/blog/my-post/_fragment.html');
    });

    it('should rewrite markdown path for a nested page', () => {
      assert.strictEqual(rewritePath('/blog/my-post/', 'markdown'), '/md/blog/my-post/index.md');
    });

    it('should rewrite json path for a nested page', () => {
      assert.strictEqual(rewritePath('/blog/my-post/', 'json'), '/api/blog/my-post.json');
    });

    it('should rewrite json path for root to /api/index.json', () => {
      assert.strictEqual(rewritePath('/', 'json'), '/api/index.json');
    });

    it('should rewrite markdown path for root to /md/index.md', () => {
      assert.strictEqual(rewritePath('/', 'markdown'), '/md/index.md');
    });

    it('should rewrite fragment path for root', () => {
      assert.strictEqual(rewritePath('/', 'fragment'), '/_fragment.html');
    });

    it('should not rewrite for page format', () => {
      assert.strictEqual(rewritePath('/about/', 'page'), '/about/');
    });

    it('should not add trailing slash for paths with file extensions', () => {
      assert.strictEqual(rewritePath('/styles.css', 'page'), '/styles.css');
    });
  });
});

describe('Vary and Content-Type Headers', () => {

  it('should set Vary header on all responses', () => {
    const res = addVaryHeader(new Response('ok', { status: 200 }), 'page');
    assert.strictEqual(res.headers.get('Vary'), 'Accept, X-Requested-With');
  });

  it('should set Content-Type to text/markdown for markdown format', () => {
    const res = addVaryHeader(new Response('ok', { status: 200 }), 'markdown');
    assert.strictEqual(res.headers.get('Content-Type'), 'text/markdown; charset=utf-8');
  });

  it('should set Content-Type to application/json for json format', () => {
    const res = addVaryHeader(new Response('ok', { status: 200 }), 'json');
    assert.strictEqual(res.headers.get('Content-Type'), 'application/json; charset=utf-8');
  });

  it('should set Content-Type to text/html for fragment format', () => {
    const res = addVaryHeader(new Response('ok', { status: 200 }), 'fragment');
    assert.strictEqual(res.headers.get('Content-Type'), 'text/html; charset=utf-8');
  });

  it('should not override existing Cache-Control', () => {
    const original = new Response('ok', {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
    const res = addVaryHeader(original, 'page');
    assert.strictEqual(res.headers.get('Cache-Control'), 'no-store');
  });

  it('should add default Cache-Control when none exists', () => {
    const res = addVaryHeader(new Response('ok', { status: 200 }), 'page');
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

    it('should not double-slash rewrite for paths with trailing slash', () => {
      assert.strictEqual(rewritePath('/blog/', 'markdown'), '/md/blog/index.md');
      assert.strictEqual(rewritePath('/blog/', 'json'), '/api/blog.json');
    });
  });
});
