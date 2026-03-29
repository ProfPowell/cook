---
title: Dev Server
description: Local development server with live reload, file watching, and content negotiation
section: Operations
---

# Dev Server

Cook includes a development server powered by BrowserSync. It builds your site, serves it locally, and automatically reloads the browser when you edit source files.

## Start the server

<code-block language="bash" label="Terminal">npx cook dev</code-block>

This runs a full build, then starts a local server at `http://localhost:3000` serving from `dist/`. The browser does not open automatically -- navigate to the URL yourself.

## Live reload

Cook watches your `src/` files for changes. When a file is saved:

1. Cook runs a targeted rebuild for the changed file
2. BrowserSync reloads the page in the browser

The default watch patterns cover the most common file types:

<code-block language="javascript" label="Default watch patterns">[
  '/assets/css/*.css',
  '/**/*.html',
  '/assets/plugin/**/*.css',
  '/assets/plugin/**/*.js',
]</code-block>

Add custom patterns in `config/main.js`:

<code-block language="javascript" label="config/main.js">export default {
  watch: [
    '/**/*.md',
    '/assets/js/*.js',
  ],
  // Set watchReplace: true to use ONLY your paths (not the defaults)
  // watchReplace: true,
};</code-block>

By default, your paths are added in addition to the built-in patterns. Set `watchReplace: true` to replace them entirely.

## Content negotiation

The dev server includes middleware that mirrors production routing (e.g. a Cloudflare Worker). It serves different responses based on request headers, so client-side tools work identically in development and production.

| Header | Behavior |
|---|---|
| `X-Requested-With: htmlstar` | Returns `_fragment.html` instead of the full page |
| `Accept: text/markdown` | Returns the markdown source from `dist/md/` |
| `Accept: application/json` | Returns JSON metadata from `dist/api/` |

This means html-star SPA navigation, markdown API requests, and JSON metadata fetches all work locally without any extra configuration.

## Port configuration

The default port is `3000`. Override it with the `COOK_DEV_PORT` environment variable:

<code-block language="bash" label="Terminal">COOK_DEV_PORT=8080 npx cook dev</code-block>

## Dev vs production builds

When running `cook dev`, the build executes with `NODE_ENV=development`. Use this to conditionally include development-only features like debug logging or analytics bypasses. The `cook build` command runs a standard production build without watching or serving.

| Feature | `cook dev` | `cook build` |
|---|---|---|
| Full build | Yes | Yes |
| Live reload | Yes | No |
| File watching | Yes | No |
| Content negotiation | Yes | Server-dependent |
| `NODE_ENV` | `development` | (unset) |
