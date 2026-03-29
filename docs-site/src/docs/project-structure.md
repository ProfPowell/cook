---
title: Project Structure
description: How Cook projects are organized — src, config, dist, components, includes, layouts
section: Getting Started
---

# Project Structure

A Cook project has a simple, conventional layout:

<code-block language="text" label="Project Layout">my-site/
├── config/
│   ├── main.js          # Build configuration
│   └── data.js          # Global template data
├── src/
│   ├── index.html       # Homepage
│   ├── about.html       # Any page
│   ├── blog/
│   │   ├── first-post.md
│   │   └── second-post.md
│   ├── assets/
│   │   └── css/styles.css
│   ├── components/      # Reusable HTML templates
│   │   └── card.html
│   ├── includes/        # Shared partials
│   │   ├── header.html
│   │   └── footer.html
│   └── layouts/         # Page wrapper templates
│       └── post.html
├── dist/                # Build output (generated)
└── package.json</code-block>

## Key directories

### `src/`

Your source files. Every `.html` and `.md` file becomes a page:

- `src/about.html` → `/about/`
- `src/blog/my-post.md` → `/blog/my-post/`
- `src/index.html` → `/` (root)

### `config/`

- **`main.js`** — Build configuration (paths, plugins, features)
- **`data.js`** — Global data available in all templates as `&#36;{variableName}`

### `src/components/`

Reusable HTML component templates. A file named `card.html` is used as `<card>` or with a prefix like `<site-card>`. See [Components](/docs/components/).

### `src/includes/`

Shared HTML partials included with `data-include="/includes/header.html"`. See [Includes](/docs/includes/).

### `src/layouts/`

Page wrapper templates referenced by `data-template="post"` or markdown frontmatter `layout: post`. See [Template Strings](/docs/template-strings/).

### `dist/`

Generated output. This is what you deploy. Created fresh on each build.

### Build-only directories

`components/`, `includes/`, and `layouts/` are used during the build but are **not copied to `dist/`**. Configure this in `main.js`:

<code-block language="javascript" label="config/main.js">export default {
  buildOnlyPaths: ['components', 'includes', 'layouts'],
};</code-block>
