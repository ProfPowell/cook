---
title: Configuration
description: Customize Cook's build process with config/main.js
section: Core Concepts
---

# Configuration

Cook works with zero configuration. When you need to customize behavior, create `config/main.js` in your project root. Your settings are deep-merged with Cook's defaults, so you only need to specify what you want to change.

## Basic config file

<code-block language="javascript" label="config/main.js">export default {
  distPath: 'dist',
  srcPath: 'src',
  sitemap: {
    url: 'https://www.example.com',
  },
};</code-block>

## Key options

### Paths

`srcPath` and `distPath` control where Cook reads source files and writes output. The defaults are `src` and `dist`. `startPath` sets the entry file for the dev server (default `index.html`).

`siteRoot` names the subfolder of `distPath` that is served at `/` (default `''`, meaning `distPath` itself). Set it when your pages live in a subfolder you deploy on its own, for example `src/pages` built to `dist/pages` with `dist/pages` as your host's output directory:

<code-block language="javascript" label="config/main.js">export default {
  siteRoot: 'pages',
};</code-block>

Active links, the sitemap, and generated formats then use the URLs visitors see (`/docs/intro/`, not `/pages/docs/intro/`), and pages outside that folder are skipped. Asset fingerprinting (manifest keys and `asset-manifest.json`) and package components (copied to `<siteRoot>/assets/components/`) use the same served folder.

`basePath` is the URL path your site is served under (default `''`, the domain root). Set it when the site lives below the root of its domain, such as a GitHub Pages project site at `https://user.github.io/repo/`:

<code-block language="javascript" label="config/main.js">export default {
  basePath: '/repo',
  sitemap: { url: 'https://user.github.io/repo' },
};</code-block>

Keep writing root-relative links as if the site were at `/` (`/docs/`, `/assets/css/site.css`). As the last built-in step of a production build, Cook prefixes them in every HTML page and fragment: `href`, `src`, `srcset`, `action`, `poster`, inline `url()` and import maps. Relative and absolute URLs, URLs already under the base path, and code shown as text are left alone. `cook dev` skips this step so the dev server still works at `/`.

Absolute URLs come from values you configure, so put the base path in those yourself: `sitemap.url` and `siteUrl` in `config/data.js`. CSS and JS files are not rewritten; use relative paths for `url()` references in stylesheets.

### Components

Configure the component directory, an optional tag prefix, and explicit element-to-file mappings. See [Components](/docs/components/) for full details.

<code-block language="javascript" label="config/main.js">export default {
  components: {
    path: 'components',
    prefix: 'site-',
    mapping: { 'my-widget': 'special-widget.html' },
  },
};</code-block>

### Markdown

Control layouts, collections, and parser options for `.md` files. Set a default `layout` to wrap all Markdown content in a shared template.

<code-block language="javascript" label="config/main.js">export default {
  markdown: {
    layout: 'page',
    layoutPath: 'layouts',
    collections: true,
  },
};</code-block>

### Collections

Markdown pages are grouped into `collections.<folder>` automatically. Set `collections.html` to group HTML pages that start with YAML frontmatter the same way (default `false`). See [Markdown: HTML pages in collections](/docs/markdown/).

<code-block language="javascript" label="config/main.js">export default {
  collections: { html: true },
};</code-block>

### Images

Cook generates responsive AVIF/WebP derivatives and rewrites `<img>` to `<picture>`. Customize widths, formats, quality, and caching.

<code-block language="javascript" label="config/main.js">export default {
  images: {
    enabled: true,
    widths: [320, 640, 960, 1280, 1920],
    formats: ['avif', 'webp'],
    quality: { avif: 60, webp: 75 },
    sizes: '(min-width: 60rem) 960px, 100vw',
    loading: 'lazy',
    cache: '.cache/images',
  },
};</code-block>

### Sitemap

Set `sitemap.url` to generate a `sitemap.xml` in the site root (`distPath`, or `distPath/siteRoot`). With no `sitemap.url`, no sitemap is written. Paths matching `/assets/`, `/includes/`, and `/404.html` are excluded by default.

### Bundle

CSS and JS bundling is enabled by default. Set `bundle: false` to disable it, or customize the output path with `bundle: { distPath: 'assets/bundle' }`.

### Formats

Generate alternative output formats alongside HTML. Control each format individually:

<code-block language="javascript" label="config/main.js">export default {
  formats: {
    markdown: true,
    json: true,
    feed: null,
    llmsTxt: true,
    llmsFullTxt: false,
  },
};</code-block>

### Exclude, include, and build-only paths

Use regex patterns to control which `dist/` files get processed by build plugins. `buildOnlyPaths` lists `src/` directories used during the build but not copied to output.

<code-block language="javascript" label="config/main.js">export default {
  excludePaths: [/dist\/assets\/vendor/],
  includePaths: [/dist\/manifest.webmanifest/],
  buildOnlyPaths: ['includes', 'layouts'],
};</code-block>

### DSD and Auto-Components

Enable Declarative Shadow DOM pre-rendering and automatic component JS loading for Vanilla Breeze projects. Both require a manifest file.

<code-block language="javascript" label="config/main.js">export default {
  autoComponents: { enabled: true, manifest: './vb-manifest.json' },
  dsd: { enabled: true, manifest: './dsd-manifest.json' },
};</code-block>

## How merging works

Cook uses a deep merge (via Lodash `merge`) to combine your config with the defaults. This means nested objects like `components` or `markdown` are merged property by property -- you only need to specify the properties you want to override, not the entire object.
