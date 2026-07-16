/**
 * @file worker/index.js
 * @description Cloudflare Worker for content negotiation.
 *
 * Routes requests to the correct static file based on headers:
 *   - X-Requested-With: htmlstar  → serves _fragment.html (content scope)
 *   - Accept: text/markdown       → serves from /md/ path
 *   - Accept: application/json    → serves from /api/ path
 *   - Default                     → serves index.html (page scope)
 *
 * Falls back to Pages static assets for all requests.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const accept = request.headers.get('Accept') || '';
    const requestedWith = request.headers.get('X-Requested-With') || '';

    // Determine the format to serve based on request headers
    const format = negotiateFormat(accept, requestedWith);

    // Rewrite the URL path based on negotiated format
    const rewrittenPath = rewritePath(pathname, format);

    // If the path was rewritten, try serving the rewritten version first
    if (rewrittenPath !== pathname) {
      const rewrittenUrl = new URL(rewrittenPath, url.origin);
      const rewrittenResponse = await env.ASSETS.fetch(
        new Request(rewrittenUrl, request)
      );

      if (rewrittenResponse.ok) {
        return addVaryHeader(rewrittenResponse, format, true);
      }
    }

    // Serve the original static file from Pages
    const staticResponse = await env.ASSETS.fetch(request);

    // Pass through redirects (e.g. 301/308 slash normalization from the
    // static asset layer) — .ok is 2xx-only and previously turned these
    // into 404 pages.
    if (isRedirect(staticResponse.status)) {
      return staticResponse;
    }

    if (staticResponse.ok) {
      // NOTE: this is the ORIGINAL file (negotiated variant didn't exist),
      // so its own Content-Type must be preserved — not the negotiated one.
      return addVaryHeader(staticResponse, format, false);
    }

    // 404
    // Try serving a custom 404 page
    const notFoundUrl = new URL('/404.html', url.origin);
    const notFoundResponse = await env.ASSETS.fetch(
      new Request(notFoundUrl, request)
    );

    if (notFoundResponse.ok) {
      return new Response(notFoundResponse.body, {
        status: 404,
        headers: notFoundResponse.headers,
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};


/**
 * Determine the response format from request headers
 * @param {string} accept - Accept header value
 * @param {string} requestedWith - X-Requested-With header value
 * @returns {string} Format: 'fragment' | 'markdown' | 'json' | 'page'
 */
function negotiateFormat(accept, requestedWith) {
  // html-star fragment request
  if (requestedWith.toLowerCase() === 'htmlstar') {
    return 'fragment';
  }

  // Markdown request
  if (accept.includes('text/markdown')) {
    return 'markdown';
  }

  // JSON request (but not browser default Accept which includes */*)
  // Only match explicit application/json, not wildcard
  if (
    accept.includes('application/json') &&
    !accept.includes('text/html')
  ) {
    return 'json';
  }

  // Default: full page
  return 'page';
}


/**
 * Rewrite URL path based on negotiated format
 * @param {string} pathname - Original URL pathname
 * @param {string} format - Negotiated format
 * @returns {string} Rewritten pathname
 */
function rewritePath(pathname, format) {
  // Normalize: ensure trailing slash for directory-style URLs
  // Skip for paths with file extensions
  const hasExtension = pathname.split('/').pop().includes('.');
  const normalizedPath = hasExtension
    ? pathname
    : pathname.endsWith('/')
      ? pathname
      : pathname + '/';

  // Strip trailing slash for path construction
  const basePath = normalizedPath.replace(/\/$/, '') || '';

  switch (format) {
    case 'fragment':
      // /blog/my-post/ → /blog/my-post/_fragment.html
      return `${basePath}/_fragment.html`;

    case 'markdown':
      // /blog/my-post/ → /md/blog/my-post/index.md
      return `/md${basePath}/index.md`;

    case 'json':
      // /blog/my-post/ → /api/blog/my-post.json
      // / → /api/index.json
      return `/api${basePath || '/index'}.json`;

    default:
      // No rewrite needed for full page
      return pathname;
  }
}


/**
 * Whether a status code is an HTTP redirect
 * @param {number} status
 * @returns {boolean}
 */
function isRedirect(status) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/**
 * Add Vary header to response for correct caching
 * @param {Response} response - Original response
 * @param {string} format - Negotiated format
 * @param {boolean} negotiatedServed - Whether the response body IS the
 *   negotiated variant. When false (fallback to the original file), the
 *   response keeps its own Content-Type.
 * @returns {Response} Response with Vary header
 */
function addVaryHeader(response, format, negotiatedServed) {
  const headers = new Headers(response.headers);
  headers.set('Vary', 'Accept, X-Requested-With');

  // Set appropriate content type for non-HTML formats — only when the
  // negotiated file was actually found and served
  if (negotiatedServed) {
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
  }

  // Cache publicly with stale-while-revalidate
  if (!headers.has('Cache-Control')) {
    headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  }

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}
