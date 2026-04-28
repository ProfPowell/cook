# Cook SSG — Project Overview

> **Purpose of this document:** Provide an LLM with sufficient context to understand, discuss, and generate code for Cook SSG projects. For the latest details, consult the repository and NPM package linked below.

**Package:** `cook-ssg` (v2.1.0)
**Repository:** https://github.com/ProfPowell/cook
**NPM:** https://www.npmjs.com/package/cook-ssg
**License:** MIT
**Node.js:** >=18.0.0
**Author:** Thomas A. Powell

---

## What Cook Is

Cook is a static site generator that takes a **web-platform-first** approach. Instead of inventing proprietary template syntax or requiring a JavaScript framework, Cook uses ES6 template literals (`${}`), HTML `<template>`, custom elements, and standard `data-*` attributes to build static sites at build time. The output is pure HTML/CSS with zero JavaScript by default — JS is opt-in via web components.

Cook is part of a broader ecosystem of platform-native web tools:

| Project | Role |
|---------|------|
| **Cook** | Static site generator / build orchestrator |
| **Vanilla Breeze (VB)** | Web component library + CSS design system |
| **html-star** | Client-side SPA-style navigation (fetch + swap) |
| **Vanilla Press** | Content authoring CMS + storage layer |

---

## Quick Start

```bash
npm install cook-ssg
```

**Minimal page** (`src/index.html`):
```html
<!doctype html>
<html>
<head>
  <title>${siteTitle}</title>
</head>
<body>
  <h1>Welcome to ${siteTitle}</h1>
</body>
</html>
```

**Global data** (`config/data.js`):
```javascript
export default {
  siteTitle: 'My Site',
  year: new Date().getFullYear().toString()
};
```

**Run:**
```bash
npx cook dev          # Dev server at localhost:3000 with live reload
npx cook build        # Production build
```

---

## Project Structure

```
your-project/
├── config/
│   ├── main.js              # Build configuration (optional)
│   └── data.js              # Global template data
├── src/
│   ├── index.html           # Pages (HTML)
│   ├── about.html
│   ├── blog/
│   │   ├── post-1.md        # Markdown content pages
│   │   └── post-2.md
│   ├── components/          # Reusable HTML component templates
│   │   ├── header.html
│   │   └── card.html
│   ├── layouts/             # Layout templates for markdown pages
│   │   └── post.html
│   ├── includes/            # HTML partials
│   │   └── nav.html
│   └── assets/              # Static assets (CSS, JS, images)
│       ├── css/
│       ├── js/
│       └── img/
├── dist/                    # Generated output (gitignored)
├── plugins/                 # Custom build plugins (optional)
└── package.json
```

**Note:** `components/`, `layouts/`, and `includes/` directories are build-only — they are consumed during the build but not directly served as pages.

---

## Template Syntax

Cook uses **ES6 template literal syntax** for all dynamic content.

### Variables

```html
<title>${siteTitle}</title>
<p>Copyright ${year}</p>
```

Variables are resolved from `config/data.js` plus any page-level front matter.

### Dot Notation

```html
<p>${site.description}</p>
<a href="${social.twitter.url}">${social.twitter.label}</a>
```

### Protected Contexts

Template literals inside `<script>` and `<style>` blocks are **not** resolved by Cook. This prevents conflicts with actual JavaScript template literals and CSS custom properties.

### Unmatched Variables

Any `${variable}` that doesn't resolve to a value is left as-is in the output, allowing client-side code to handle it.

---

## Markdown & Front Matter

Markdown files (`.md`) in `src/` are converted to HTML pages.

**Source** (`src/blog/my-post.md`):
```markdown
---
title: My Blog Post
date: 2026-03-15
description: A great article
layout: blog
tags:
  - javascript
  - tutorial
---

# Welcome

This is my blog post with **bold** text.
```

**Output:** `dist/blog/my-post/index.html` (clean URLs)

### Layouts

A layout wraps markdown content. Specified via `layout` front matter field.

**Layout file** (`src/layouts/blog.html`):
```html
<!doctype html>
<html>
<head>
  <title>${title}</title>
  <meta name="description" content="${description}">
</head>
<body>
  <article>${content}</article>
  <time>${date}</time>
</body>
</html>
```

- `${content}` — the rendered markdown HTML
- `${title}`, `${date}`, etc. — front matter fields

### Collections

Markdown files are auto-grouped into collections by directory:
- `src/blog/*.md` → `collections.blog`
- `src/docs/*.md` → `collections.docs`

Collections are sorted by `date` (newest first) and available in templates.

---

## Data Repeat

The `data-repeat` attribute generates repeated HTML from arrays or collections.

```html
<!-- Basic iteration -->
<li data-repeat="features as feature">
  <strong>${feature.title}</strong> — ${feature.description}
</li>

<!-- Collection iteration -->
<article data-repeat="collections.blog as post">
  <h2><a href="${post.url}">${post.title}</a></h2>
  <time>${post.date}</time>
</article>

<!-- With index -->
<li data-repeat="items as item, index">
  ${index}: ${item.name}
</li>

<!-- Limit and offset -->
<article data-repeat="collections.blog | offset:2 | limit:5 as post">
  <h2>${post.title}</h2>
</article>
```

---

## Includes (Partials)

Three equivalent syntaxes for inlining external HTML:

```html
<include-file src="/includes/nav.html"></include-file>
<div data-include="/includes/nav.html"></div>
<div include="/includes/nav.html"></div>
```

Includes are resolved recursively (up to 5 levels deep) and cached per build.

---

## Components

Cook replaces component references with their template HTML at build time.

### Custom Element Syntax

```html
<site-header title="Welcome" subtitle="Home Page"></site-header>
```

Resolved from `src/components/site-header.html` (or `header.html` if `prefix: 'site-'` is configured).

### Semantic HTML Syntax

```html
<header data-component="site-header" data-title="Welcome"></header>
```

### Component Template

**`src/components/site-header.html`:**
```html
<div class="site-header">
  <h1>${title}</h1>
  <p>${subtitle}</p>
  ${slot}
</div>
```

- `${attributeName}` — resolved from the element's attributes
- `${slot}` — the element's inner HTML content
- `${slot:name}` — named slots (matches `<div slot="name">` children)

### Component Styles

`<style>` blocks inside component templates are extracted, deduplicated across instances, and consolidated into a single `<style>` in `<head>`. Cook uses native CSS `@scope` and `@layer` for isolation — no framework-specific scoping.

---

## Declarative Shadow DOM (DSD)

Cook pre-renders shadow DOM at build time, eliminating Flash of Unstyled Content (FOUC) for web components.

### Manifest-Based (for external component libraries like Vanilla Breeze)

Provide a JSON manifest mapping tag names to shadow DOM HTML:

```json
{
  "vb-button": "<style>:host { display: inline-flex; }</style><slot></slot>",
  "vb-card": "<style>:host { display: block; }</style><div class=\"card\"><slot></slot></div>"
}
```

Cook injects `<template shadowrootmode="open">` as the first child of each matching element.

The manifest supports `${attr:name}` syntax for dynamic attribute injection into the DSD template.

### Template-Based (for Cook-authored components)

Place the template directly in the component file:

```html
<template shadowrootmode="open">
  <style>:host { display: block; }</style>
  <slot></slot>
</template>
```

Optional companion `.js` file is auto-detected and injected for client-side hydration.

---

## Auto-Components

When enabled, Cook scans each page for custom element tags and optimizes JavaScript loading:

- **CSS-only components** (no JS needed) — the VB bundle script can be removed entirely → **zero JavaScript pages**
- **JS-requiring components** — generates per-page import maps loading only the needed component scripts
- Configurable `cssOnly` list and component manifest

---

## Image Optimization

Cook automatically processes images through a two-phase pipeline:

1. **Generate:** Creates AVIF and WebP derivatives at multiple widths (default: 320, 640, 960, 1280, 1920). Uses content-hash disk cache (`.cache/images/`) for fast rebuilds.

2. **Rewrite:** Converts `<img>` tags to responsive `<picture>` elements with `srcset`, `sizes`, `width`, `height`, and `loading="lazy"`.

Skip per-image with `data-no-optimize`. SVGs, GIFs, data URIs, and external URLs are skipped automatically.

---

## Bundling & Inlining

### Bundling

```html
<link rel="stylesheet" href="/assets/css/reset.css" data-bundle="main">
<link rel="stylesheet" href="/assets/css/styles.css" data-bundle="main">
<!-- Output: /assets/bundle/main.css -->
```

### Inlining (Production Only)

```html
<link rel="stylesheet" href="/assets/css/critical.css" data-inline>
<script src="/assets/js/app.js" data-inline></script>
```

File contents replace the external reference in production builds.

---

## Link Management & Navigation

Cook provides several build-time features for managing links, URLs, and page navigation.

### Clean URLs

During the build, Cook converts standalone HTML files into directory-based paths so URLs don't require file extensions:

- `src/about.html` → `dist/about/index.html` → URL: `/about/`
- `src/blog/my-post.md` → `dist/blog/my-post/index.html` → URL: `/blog/my-post/`

Files already named `index.html` are left as-is. This behavior can be disabled via the `convertPageToDirectory` config option.

### Active Link Detection

Cook automatically scans every `<a href>` on each page and marks links whose target matches the current page's URL. This is done at build time — no client-side JavaScript required.

**Exact match** — the link points directly to this page:
```html
<!-- On the /about/ page, this link gets marked active -->
<a href="/about/" class="active">About</a>
```

**Parent match** — the link points to an ancestor in the URL hierarchy:
```html
<!-- On /docs/components/buttons/, the /docs/ link gets marked as parent -->
<a href="/docs/" class="active-parent">Docs</a>
```

**Configuration** (`config/main.js`):
```javascript
export default {
  activeLink: {
    // Class names (default values shown)
    active: 'active',
    activeParent: 'active-parent',
    // Use data attributes instead of classes: type: 'attribute'
    // produces data-active and data-active-parent instead
    type: 'class'   // or 'attribute'
  }
};
```

When `type` is set to `'attribute'` (or `'attr'`), Cook uses `data-active` and `data-active-parent` attributes instead of classes — useful for CSS attribute selectors like `a[data-active]`.

### External Link Protocol Fix

Cook detects `<a>`, `<link>`, and `<script>` tags whose `href` or `src` starts with `www.` or `cdn.` but is missing the `http://` protocol. Without this fix, the browser would treat them as relative paths. Cook prepends `http://` automatically at build time.

```html
<!-- Before build -->
<a href="www.example.com">Visit</a>

<!-- After build -->
<a href="http://www.example.com">Visit</a>
```

Links that already have `http://` or `https://` are left unchanged. The matched domain prefixes are configurable:

```javascript
export default {
  replaceExternalLinkProtocol: {
    enabled: true,
    match: ['www', 'cdn']   // domain prefixes to detect (defaults)
  }
};
```

### Fragment Navigation (SPA-Style)

Cook generates content-only HTML fragments alongside each page to enable client-side navigation without full page reloads (used by the companion **html-star** library).

For every `index.html`, Cook extracts the inner HTML of a target element (default: `<main>`) and writes it as a sibling `_fragment.html`:

```
dist/about/index.html          ← full page
dist/about/_fragment.html      ← just the <main> content
```

A client-side router (like html-star) can then fetch the fragment and swap it into the current page, achieving SPA-style transitions with the View Transitions API — while every page remains a fully functional static HTML page for direct access and SEO.

The dev server supports content negotiation: requests with the `X-Requested-With: htmlstar` header automatically return the fragment instead of the full page.

**Configuration:**
```javascript
export default {
  fragments: {
    enabled: true,
    selector: 'main',           // CSS selector for the content region
    filename: '_fragment.html'   // output filename
  }
};
```

### Sitemap Generation

Cook auto-generates a `sitemap.xml` by crawling all pages in `dist/` after the build completes. Requires the `sitemap.url` config value to set the domain.

```javascript
export default {
  sitemap: {
    url: 'https://www.yoursite.com',
    excludePaths: [/\/assets/, /\/includes/, /^\/404.html/]
  }
};
```

---

## Multi-Format Output

Cook can generate multiple output formats from each page:

| Format | Path | Description |
|--------|------|-------------|
| HTML | `dist/{path}/index.html` | Primary output |
| Fragment | `dist/{path}/_fragment.html` | Content-only `<main>` for SPA navigation |
| Markdown | `dist/md/{path}/index.md` | Original `.md` source |
| JSON | `dist/api/{path}.json` | Page metadata (url, title, description, etc.) |
| Atom Feed | `dist/feed.xml` | RSS/Atom feed from a collection |
| llms.txt | `dist/llms.txt` | Index of markdown content for AI/LLM agents |
| llms-full.txt | `dist/llms-full.txt` | Concatenated full markdown content |
| Sitemap | `dist/sitemap.xml` | Auto-generated sitemap |

---

## Dev Server

BrowserSync-based with:
- Live reload on file changes in `src/`
- Default port 3000 (configurable via `COOK_DEV_PORT` env var)
- Content negotiation middleware for fragments, markdown, and JSON responses

---

## Code Block Highlighting

Integration with `@profpowell/code-block` for build-time syntax highlighting:

```html
<code-block language="javascript" label="Example">
const greeting = 'Hello, World!';
console.log(greeting);
</code-block>
```

Pre-rendered with Declarative Shadow DOM at build time — zero client-side highlighting overhead.

---

## Custom Plugins

Plugins run at three phases: `before` (once, pre-loop), `default` (per file), and `after` (once, post-loop).

**Plugin file** (`plugins/my-plugin.js`):
```javascript
export class MyPlugin {
  constructor({ file, data, store }) {
    this.file = file;   // { name, extension, path, src }
    this.data = data;   // Global data from config/data.js
    this.store = store; // Shared build-process store
  }

  async init() {
    // Modify this.file.src to transform the page
  }
}
```

**Register in config** (`config/main.js`):
```javascript
export default {
  plugins: {
    before: [],
    default: ['my-plugin'],
    after: []
  },
  pluginPath: 'plugins'
};
```

---

## Configuration Reference

All settings are optional with sensible defaults. Set in `config/main.js`:

```javascript
export default {
  srcPath: 'src',
  distPath: 'dist',

  markdown: {
    layout: null,
    layoutPath: 'layouts',
    collections: true,
    markedOptions: { gfm: true, breaks: false }
  },

  components: {
    path: 'components',
    prefix: null,             // e.g. 'site-' to strip from tag names
    mapping: {},              // explicit tag → file mappings
    jsPath: 'assets/components'
  },

  dsd: {
    enabled: false,
    manifest: null            // path to DSD manifest JSON
  },

  autoComponents: {
    enabled: false,
    manifest: null,
    cssOnly: []               // tags that need no JavaScript
  },

  images: {
    enabled: true,
    widths: [320, 640, 960, 1280, 1920],
    formats: ['avif', 'webp'],
    quality: { avif: 60, webp: 75, jpeg: 80, png: 80 },
    sizes: '(min-width: 60rem) 960px, 100vw',
    loading: 'lazy',
    cache: '.cache/images'
  },

  bundle: { distPath: 'assets/bundle' },

  fragments: {
    enabled: true,
    selector: 'main',
    filename: '_fragment.html'
  },

  formats: {
    markdown: true,
    json: true,
    feed: null,               // { collection, title, siteUrl, limit }
    llmsTxt: true,
    llmsFullTxt: false
  },

  repeat: {
    attribute: 'data-repeat',
    removeAttribute: true
  },

  sitemap: {
    url: 'https://www.yoursite.com',
    excludePaths: [/\/assets/, /\/includes/, /^\/404.html/]
  },

  activeLink: { active: 'active', activeParent: 'active-parent' },

  plugins: { before: [], default: [], after: [] },
  pluginPath: 'plugins',

  watch: [],
  watchReplace: false
};
```

---

## Build Pipeline (Execution Order)

The build runs as a deterministic 17-step pipeline:

**Pre-file plugins (run once):**
1. Create dist directory
2. Copy src → dist
3. Process markdown (`.md` → `.html` with front matter, layouts, collections)
4. Optimize images — generate AVIF/WebP derivatives
5. Run custom `before` plugins
6. Create directories from files (`about.html` → `about/index.html`)

**Per-file loop (every HTML file in dist):**
7. Parse front matter
8. Escape code blocks (base64-encode to protect from DOM parsing)
9. Run custom `default` plugins
10. Apply layout template
11. Replace includes (`data-include`)
12. Expand data-repeat elements
13. Replace components (custom elements + `data-component`)
14. Resolve template strings (`${}`)
15. Rewrite images → responsive `<picture>`
16. Auto-components (optimize JS loading)
17. Declarative Shadow DOM injection
18. Fix external links (add missing protocol)
19. Inline assets (production only)
20. Mark active links
21. Collect bundles
22. Minify HTML/CSS/JS (production only)
23. Restore code blocks

**Post-file plugins (run once):**
24. Generate fragments
25. Generate formats (markdown, JSON, feed, llms.txt)
26. Generate sitemap
27. Build bundles
28. Run custom `after` plugins

---

## CLI Commands

```bash
npx cook build              # Production build
npx cook dev                # Dev build + live reload server
npx cook dev --port 4000    # Custom port
cook --version              # Show version
cook --help                 # Show help
```

**Environment variables:**
- `NODE_ENV=production` — enables minification, inlining, bundling
- `NODE_ENV=development` — disables production optimizations for debugging
- `COOK_DEV_PORT` — custom dev server port (default: 3000)

---

## Key Dependencies

- `marked` — Markdown parsing (GFM)
- `gray-matter` — YAML front matter
- `jsdom` — DOM manipulation for includes, components, DSD
- `sharp` — Image processing (AVIF/WebP generation)
- `browser-sync` — Dev server with live reload
- `html-minifier-terser` / `clean-css` / `terser` — Production minification
- `@profpowell/code-block` — Syntax-highlighted code blocks with DSD

---

## For More Information

- **Repository:** https://github.com/ProfPowell/cook — full source, issues, and contribution guidelines
- **NPM:** https://www.npmjs.com/package/cook-ssg — installation and version history
- **Docs site:** Built with Cook itself (dogfooding) — covers all features in depth with examples. Located in `docs-site/` within the repository.
