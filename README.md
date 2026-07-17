# Cook Build System

A static site build system with templating, bundling, and optimization features.

**Version:** 2.1.3 (canonical version lives in `package.json`)
**License:** MIT
**Node.js:** >=18.0.0

[Getting Started](#getting-started) | [View/Run the site code](#viewrun-the-site-code) | [Environment Flags](#environment-flags) | [Build Process](#build-process) | [NPM Run Scripts](#npm-run-scripts)

---

## Getting Started

Run this in the terminal from your project's root:

```bash
npm install
npm run dev
```

This builds the site locally and runs it at `localhost:3000`, using BrowserSync for live reloading. Rebuilds run in-process (no cold Node start per save), and a build error on one page is reported without stopping the dev server or the rest of the build.

When installed as a package, the `cook` CLI is also available:

```bash
cook build          # Production build
cook dev            # Build + live-reload dev server
cook dev --port N   # Dev server on a custom port (default: 3000)
```

### Project Structure

Your project should have the following structure:

```
your-project/
├── config/
│   ├── main.js      # Build configuration overrides
│   └── data.js      # Data for template string replacement
├── src/             # Source files
│   ├── index.html
│   └── ...
└── package.json
```

---

## View/Run the site code

There are different modes of viewing the site while working locally.

<details>
  <summary>Running <strong>development</strong> mode locally (live reload)</summary><br>

  To view your codebase locally, run `npm run dev`.

  1. This first runs `scripts/build.js`, which copies the `/src` files to `/dist`, and then modifies them per each active build plugin.
  2. After the `/dist` folder files are built, `scripts/dev.js` runs, which starts the BrowserSync live-reload server.

  _[Note]:_ By default, files are not minified and link/script elements marked `[data-inline]` are not inlined (retain external file call).
  This way, when using dev tools to inspect in `localhost`, you see the correct line numbers, etc.

  _[Note]:_ Some functionality may be enabled or disabled only in this environment. In `package.json`, we specify a node environment variable to designate development-mode: `NODE_ENV=development npm run build && node scripts/dev.js`.
  In the various build-plugin files, you'll then see some code affected via:<br>
  `if (process.env.NODE_ENV === 'development')`<br>
  or<br>
  `if (process.env.NODE_ENV !== 'development')`.
</details>

---

<details>
  <summary>Running <strong>production</strong> mode locally (http-server)</summary><br>

  To view the static, ready-for-production version of the site locally, run `npm run dev:prod`.

  Instead of running BrowserSync live-reload, it instead runs `http-server` to be a simple, static server. This has the benefit of not injecting the 2 scripts BrowserSync adds, and emulates how the site should look and behave on the production server (pure-static site pages).
</details>

---

<details>
  <summary><strong>Production</strong> build only (no browser action)</summary><br>

  If you just need to build the `/dist` directory with production optimizations (minification, inlining), run:

  ```bash
  NODE_ENV=production npm run build
  ```
</details>

For both development modes, `dev` (BrowserSync - live reload) and `dev:prod` (http-server), the localhost port should be the same. Check the current port value in `package.json` under `config.devPort`, but by default it should be 3000: `localhost:3000`

---

## Environment Flags

Some site processes do not need to run every time locally, or they only need to run during deployment, etc. To accommodate this, some features are gated behind Node environment variables.

### Deployment Environments

We specify 2 environments via environment variables: `development` and `production`. We use these to enable or disable parts of the build process, either from the core build code or custom, user plugins.

In the terminal, most `npm run xxxx` scripts already set which environment to use. You may also manually set them if necessary:

```bash
NODE_ENV=development npm run build
NODE_ENV=production npm run build
```

In a custom build plugin, you may use them in conditionals:

```javascript
if (process.env.NODE_ENV === 'development') {
  // development-only code
}
```

### Other Flags

| Flag | Effect |
|------|--------|
| `LOGGER=true` | Verbose per-plugin logging (spinners, timings, per-file detail). Errors and warnings always print, with or without this flag. |
| `MINIFY=false` | Skip HTML/CSS/JS minification in a production build (e.g. for a readable staging build). |
| `BUNDLE=true` | Force CSS/JS bundling in development mode (normally production-only). |

---

## Build Process

The build process performs the following steps, in this order:

1. **Creates `/dist`** - Removes existing dist folder and recreates it
2. **Copies `/src` to `/dist`** - All source files are copied (excludes `.md` files and `buildOnlyPaths`)
3. **Processes Markdown** - Converts `.md` files to `.html` with front matter support; groups pages into `collections.*` by directory
4. **Generates image derivatives** - Responsive AVIF/WebP variants at configured widths, with a cross-build disk cache (`images` config)
5. **Runs custom-user `before` plugins** - Runs once before file processing
6. **Converts pages to directories** - `about.html` becomes `about/index.html` for extensionless URLs
7. **Loops through each allowed file**, in this order per page:
   * Parses YAML front matter from HTML pages
   * Escapes `<code-block data-escape>` content (restored at the end of the loop)
   * Runs any custom-user `default` plugins
   * Applies layout templates (`[data-template]` attribute or front matter `layout`)
   * Replaces include placeholders (`[data-include]`, `[include]`, `<include-file>`)
   * Repeats elements for each item in collections (`[data-repeat]`, nesting supported)
   * Replaces custom elements and `[data-component]` elements with templates (nesting supported; flat or Declarative Shadow DOM)
   * Replaces ES6 template strings (`${}`) with front matter + global data
   * Rewrites `<img>` to responsive `<picture>` elements
   * Detects custom elements and manages component JS loading (`autoComponents` config)
   * Pre-renders Declarative Shadow DOM from a manifest (`dsd` config)
   * Adds missing `http://` protocol to `www.`/`cdn.` links
   * Replaces inline placeholders (`[data-inline]`) with external source (production only)
   * Sets `<a>` tags whose `[href]` resolves to the current page as active (`class="active"`), ancestors as `class="active-parent"`
   * Stores link/script files marked for bundling (`[data-bundle]`)
   * Minifies HTML, CSS, and JS source (production only)
8. **Generates fragments** - A sibling `_fragment.html` per page for SPA-style navigation (`fragments` config)
9. **Generates formats** - Markdown copies under `/md/`, JSON under `/api/`, Atom feed, and `llms.txt` (`formats` config)
10. **Creates `sitemap.xml`** - Auto-generated in `/dist` (fragments excluded)
11. **Creates bundled files** - `.css` and `.js` bundles are written
12. **Fingerprints assets** - Opt-in content-hash filenames with HTML and JS-import rewriting (`fingerprint` config)
13. **Runs custom-user `after` plugins** - Runs once after file processing

A page that fails during the loop is reported (with its path) and skipped; the rest of the site still builds, a failure summary prints at the end, and the process exits non-zero so CI catches it.

Many build settings can be customized in your project's `/config/main.js` — see `scripts/utils/config/config.js` for every default. Note that array values in your config **replace** the defaults entirely.

---

## NPM Run Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Development mode with BrowserSync live reload |
| `npm run dev:prod` | Production build + http-server for local preview |
| `npm run build` | Build only (uses NODE_ENV if set, defaults to development) |
| `npm test` | Run test suite |
| `npm run update:check` | Check for dependency updates |
| `npm run update:fix` | Update dependencies to latest versions |

---

## Configuration

### `/config/main.js`

Override default build settings:

```javascript
export default {
  // Output directory (default: 'dist')
  distPath: 'dist',

  // Source directory (default: 'src')
  srcPath: 'src',

  // Sitemap configuration
  sitemap: {
    url: 'https://www.yoursite.com',
  },

  // Custom plugins
  plugins: {
    before: [],   // Run before file loop
    default: [],  // Run for each file
    after: [],    // Run after file loop
  },

  // Files to watch for live reload
  watch: [
    '/assets/css/*.css',
    '/**/*.html',
  ],
};
```

### `/config/data.js`

Provide data for template string replacement:

```javascript
export default {
  siteTitle: 'My Website',
  siteDescription: 'A great website',
  // Use in HTML: ${siteTitle}
};
```

---

## Features

### Template Strings

Use ES6 template syntax in HTML files:

```html
<title>${siteTitle}</title>
<meta name="description" content="${siteDescription}">
```

### Includes

Include partial HTML files:

```html
<div data-include="/includes/header.html"></div>
```

### Inline Assets

Inline external CSS/JS in production:

```html
<link rel="stylesheet" href="/assets/css/styles.css" data-inline>
<script src="/assets/js/app.js" data-inline></script>
```

### Bundling

Bundle multiple files into one:

```html
<link rel="stylesheet" href="/assets/css/reset.css" data-bundle="main">
<link rel="stylesheet" href="/assets/css/styles.css" data-bundle="main">
<!-- Outputs: /assets/bundle/main.css -->
```

### Active Links

Automatically adds `class="active"` to links matching the current page URL.

### Markdown

Convert `.md` files to HTML with front matter support. Markdown files in `/src` are processed and output as HTML to `/dist`.

**Basic Usage** (`/src/blog/my-post.md`):
```markdown
---
title: My Blog Post
date: 2024-03-15
description: A great article about something
layout: blog
tags:
  - javascript
  - tutorial
---

# Welcome

This is my blog post content with **bold** and *italic* text.

## Code Example

\`\`\`javascript
console.log('Hello, World!');
\`\`\`
```

**Front Matter Variables:**
- `title` - Page title (auto-generated from filename if omitted)
- `date` - Publication date (used for sorting collections)
- `description` - Page description
- `layout` - Layout template to wrap content (optional)
- Any custom fields you need

**Output:** `/src/blog/my-post.md` → `/dist/blog/my-post/index.html`

**Layout Templates** (`/src/layouts/blog.html`):
```html
<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <meta name="description" content="${description}">
</head>
<body>
  <article>
    ${content}
  </article>
  <time>${date}</time>
</body>
</html>
```

**Collections:**
Markdown files are automatically grouped into collections by directory:
- `/src/blog/*.md` → `collections.blog`
- `/src/docs/*.md` → `collections.docs`

Access collections in templates:
```html
<ul>
${collections.blog.map(post => `
  <li><a href="${post.url}">${post.title}</a></li>
`).join('')}
</ul>
```

**Configuration** (`/config/main.js`):
```javascript
export default {
  markdown: {
    // Default layout template (null = basic HTML wrapper)
    layout: null,
    // Directory for layout templates
    layoutPath: 'layouts',
    // Enable collections
    collections: true,
    // marked parser options
    markedOptions: {
      gfm: true,      // GitHub Flavored Markdown
      breaks: false,  // Convert \n to <br>
    },
  },
};
```

### Repeat / Collections

Generate repeated elements from arrays or collections. Perfect for blog listings, navigation menus, and any list-based content.

**Basic Usage:**
```html
<ul>
  <li data-repeat="items as item">
    <a href="${item.url}">${item.title}</a>
  </li>
</ul>
```

**With Markdown Collections:**
```html
<!-- List all blog posts -->
<article data-repeat="collections.blog as post">
  <h2><a href="${post.url}">${post.title}</a></h2>
  <p>${post.description}</p>
  <time>${post.date}</time>
</article>
```

**With Index Variable:**
```html
<ol>
  <li data-repeat="items as item, index">
    ${index}: ${item.name}
  </li>
</ol>
```

**Limit and Offset:**
```html
<!-- Show only first 5 posts -->
<article data-repeat="collections.blog | limit:5 as post">
  <h2>${post.title}</h2>
</article>

<!-- Skip first 2, show next 5 -->
<article data-repeat="collections.blog | offset:2 | limit:5 as post">
  <h2>${post.title}</h2>
</article>
```

**Data Sources:**
- `collections.blog` - From markdown files in `/src/blog/`
- `collections.docs` - From markdown files in `/src/docs/`
- `items` - From `/config/data.js`
- Any array in your data configuration

**Configuration** (`/config/main.js`):
```javascript
export default {
  repeat: {
    // Attribute name (default: 'data-repeat')
    attribute: 'data-repeat',
    // Remove attribute from output (default: true)
    removeAttribute: true,
  },
};
```

### Components

Replace custom elements or semantic HTML elements with reusable templates. Supports two patterns:

**1. Custom Elements** (hyphenated tag names):
```html
<site-header title="Welcome" subtitle="Home Page"></site-header>
<app-footer year="2024"></app-footer>
```

**2. Semantic HTML with `data-component`**:
```html
<header data-component="header" data-title="Welcome"></header>
<nav data-component="nav" data-active="home"></nav>
<footer data-component="footer" data-year="2024"></footer>
```

**Component Templates** (`/src/components/header.html`):
```html
<header class="site-header">
  <h1>${title}</h1>
  <p>${subtitle}</p>
  ${slot}
</header>
```

Template variables:
- `${attributeName}` - Data from element attributes (converted to camelCase)
- `${slot}` - Inner HTML content from the original element
- `${tagName}` - Original element's tag name

**Configuration** (`/config/main.js`):
```javascript
export default {
  components: {
    // Path to components directory (default: 'components')
    path: 'components',
    // Optional prefix for custom elements (e.g., 'site-' matches <site-header>)
    prefix: 'site-',
    // Explicit mapping of element names to template files
    mapping: {
      'app-nav': 'navigation.html',
    },
  },
};
```

---

Note: Project was started and used internally at PINT, Inc in 2020 and it was recently revived in 2025 and moved to use in 2026

## License

MIT © 2020 Thomas A. Powell
