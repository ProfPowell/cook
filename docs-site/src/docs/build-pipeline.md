---
title: Build Pipeline
description: How Cook processes your site from source to production output
section: Operations
---

# Build Pipeline

When you run `npx cook build`, Cook executes a deterministic sequence of plugins that transform your `src/` directory into a production-ready `dist/` directory. Understanding the order helps when writing custom plugins or debugging output.

## Pre-file plugins

These run once before any individual file is processed:

1. **Create dist** -- creates the `dist/` directory if it does not exist
2. **Copy src** -- copies everything from `src/` into `dist/`
3. **Process markdown** -- converts `.md` files to HTML, parses YAML frontmatter, and builds collections
4. **Optimize images (generate)** -- produces AVIF/WebP derivatives at multiple widths (320, 640, 960, 1280, 1920)
5. **Custom plugins: before** -- runs any plugins registered in `plugins.before`
6. **Create directories from files** -- converts `about.html` to `about/index.html` for clean URLs

## Per-file loop

Every allowed HTML file in `dist/` is processed through these steps in order:

1. **Frontmatter** -- extracts and removes YAML frontmatter from HTML files
2. **Escape code blocks** -- base64-encodes `&lt;code-block&gt;` content so JSDOM-based plugins cannot alter it
3. **Custom plugins: default** -- runs any plugins registered in `plugins.default`
4. **Apply template** -- wraps the file in its layout template (`data-template` attribute or frontmatter `layout`)
5. **Includes** -- resolves `data-include` elements by inlining external HTML partials
6. **Repeat** -- expands `data-repeat` elements for each item in a collection
7. **Components** -- replaces custom elements and `data-component` elements with their templates
8. **Template strings** -- resolves `&#36;{variable}` expressions using global data merged with frontmatter
9. **Image rewrite** -- rewrites `&lt;img&gt;` tags to `&lt;picture&gt;` elements with responsive `srcset`
10. **Auto-components** -- detects custom elements and manages Vanilla Breeze JS loading
11. **Declarative Shadow DOM** -- pre-renders shadow DOM content for web components
12. **External links** -- adds missing `http://` protocol to external link hrefs
13. **Inline** -- replaces `data-inline` links and scripts with their file contents
14. **Active links** -- marks `&lt;a&gt;` elements whose `href` matches the current page
15. **Bundle** -- collects CSS and JS marked for bundling
16. **Minify** -- minifies the HTML source
17. **Restore escaped content** -- decodes base64 code-block content back to its original form

The modified source is then written back to the file.

## Post-file plugins

After all files are processed:

1. **Fragments** -- generates `_fragment.html` files containing only the `&lt;main&gt;` content for SPA navigation
2. **Formats** -- generates markdown, JSON, Atom feed, and llms.txt variants
3. **Sitemap** -- creates `sitemap.xml` from all pages in `dist/`
4. **Bundle build** -- writes the collected CSS/JS bundles to `dist/`
5. **Custom plugins: after** -- runs any plugins registered in `plugins.after`

## Custom plugins

Custom plugins are ES6 classes with an `init()` method. Cook imports the class, instantiates it with `{file, data}`, and calls `init()`. The `init` method can be async.

<code-block language="javascript" label="plugins/add-build-date.js">export class AddBuildDate {
  constructor({file, data}) {
    this.file = file;
    this.data = data;
  }

  async init() {
    // Add a build timestamp to every page
    const timestamp = new Date().toISOString();
    this.file.src = this.file.src.replace(
      '&lt;/body&gt;',
      `&lt;!-- Built: ${timestamp} --&gt;&lt;/body&gt;`
    );
  }
}</code-block>

### Registering plugins

Register plugins in `config/main.js` under the `plugins` key. Each array takes plugin filenames (without `.js`) relative to your `pluginPath` directory (default: `plugins/`).

<code-block language="javascript" label="config/main.js">export default {
  plugins: {
    before: [],
    default: ['add-build-date'],
    after: ['generate-search-index'],
  },
  pluginPath: 'plugins',
};</code-block>

- **`before`** -- runs once before the file loop (receives no individual `file` object)
- **`default`** -- runs once per file during the file loop (receives the current `file` object)
- **`after`** -- runs once after the file loop and all post-processing

Plugins within each array execute in order from left to right. If one plugin depends on another, list the dependency first.
