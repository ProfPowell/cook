---
title: Deployment
description: Deploy a Cook site to any static host, Cloudflare, GitHub Pages, or Netlify
section: Operations
---

# Deployment

Cook builds your site into the `dist/` directory. That directory contains plain HTML, CSS, JS, and images -- everything a web server needs. No runtime, no server-side process.

## Static hosting (any server)

Any HTTP server that can serve static files will work. Point it at `dist/` and you are done.

<code-block language="bash" label="Terminal">npx cook build
# Upload or rsync the dist/ directory to your server</code-block>

## GitHub Pages

Set up GitHub Pages by adding a build-and-deploy workflow. Configure the build command and output directory in your repository settings or in a workflow file.

<code-block language="yaml" label=".github/workflows/deploy.yml">name: Deploy
on:
  push:
    branches: [main]
jobs:
  build-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
      - run: npm ci
      - run: npx cook build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - uses: actions/deploy-pages@v4</code-block>

Set **Settings > Pages > Source** to "GitHub Actions" so the workflow artifact is deployed directly.

## Cloudflare Pages

Connect your repository in the Cloudflare dashboard and configure the build:

- **Build command:** `npx cook build`
- **Build output directory:** `dist`

Cloudflare Pages will build on every push and deploy the `dist/` directory to its global CDN.

## Cloudflare Workers (content negotiation)

For advanced deployments, Cook ships an optional Cloudflare Worker that serves different formats from the same URL based on request headers. This enables SPA-style fragment loading, markdown endpoints, and JSON APIs from your static build output.

The worker performs content negotiation using these rules:

| Header | Value | Serves |
|---|---|---|
| `X-Requested-With` | `htmlstar` | `_fragment.html` (content only) |
| `Accept` | `text/markdown` | `/md/` path (markdown source) |
| `Accept` | `application/json` | `/api/` path (JSON data) |
| Default | -- | `index.html` (full page) |

Deploy the worker with Wrangler. The `wrangler.toml` points at your `dist/` directory for static assets:

<code-block language="toml" label="worker/wrangler.toml">name = "cook-site"
main = "index.js"
compatibility_date = "2024-12-01"

[assets]
directory = "../dist"</code-block>

<code-block language="bash" label="Terminal">cd worker
npx wrangler deploy</code-block>

The worker adds `Vary: Accept, X-Requested-With` headers so CDN caches store each format separately.

## Netlify

Add a `netlify.toml` to your project root:

<code-block language="toml" label="netlify.toml">[build]
  command = "npx cook build"
  publish = "dist"</code-block>

Push to your connected repository and Netlify handles the rest.

## What gets deployed

The `dist/` directory is self-contained. Cook converts `about.html` to `about/index.html` for clean URLs, generates responsive image derivatives, and optionally produces fragments, markdown, JSON, and sitemap files -- all as static assets. No server-side code is required unless you opt into the Cloudflare Worker for content negotiation.
