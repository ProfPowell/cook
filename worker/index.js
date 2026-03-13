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
        return addVaryHeader(rewrittenResponse, format);
      }
    }

    // Serve the original static file from Pages
    const staticResponse = await env.ASSETS.fetch(request);

    if (staticResponse.ok) {
      return addVaryHeader(staticResponse, format);
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
 * Add Vary header to response for correct caching
 * @param {Response} response - Original response
 * @param {string} format - Negotiated format
 * @returns {Response} Response with Vary header
 */
function addVaryHeader(response, format) {
  const headers = new Headers(response.headers);
  headers.set('Vary', 'Accept, X-Requested-With');

  // Set appropriate content type for non-HTML formats
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

  // Cache publicly with stale-while-revalidate
  if (!headers.has('Cache-Control')) {
    headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  }

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}
