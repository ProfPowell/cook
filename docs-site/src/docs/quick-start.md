---
title: Quick Start
description: Install Cook and build your first site in under 5 minutes
section: Getting Started
---

# Quick Start

Cook requires **Node.js 18+**. Install it as a dependency and start building.

## Install

<code-block language="bash" label="Terminal">npm install cook-ssg</code-block>

## Create your first page

<code-block language="html" label="src/index.html">&lt;!doctype html&gt;
&lt;html lang="en"&gt;
&lt;head&gt;
  &lt;meta charset="utf-8"&gt;
  &lt;title&gt;My Site&lt;/title&gt;
&lt;/head&gt;
&lt;body&gt;
  &lt;h1&gt;Hello from Cook!&lt;/h1&gt;
&lt;/body&gt;
&lt;/html&gt;</code-block>

## Build

<code-block language="bash" label="Terminal">npx cook build</code-block>

Your site is now in `dist/`. Every HTML file in `src/` becomes a page with a clean URL.

## Development server

<code-block language="bash" label="Terminal">npx cook dev</code-block>

This builds and starts a live-reload server. Edit a file, save, and the browser refreshes automatically.

## Add data

Create `config/data.js` to define template variables available on every page:

<code-block language="javascript" label="config/data.js">export default {
  siteTitle: 'My Site',
  year: new Date().getFullYear().toString(),
};</code-block>

Use them in any HTML file with template string syntax:

<code-block language="html" label="src/index.html">&lt;title&gt;&#36;{siteTitle}&lt;/title&gt;
&lt;footer&gt;&amp;copy; &#36;{year}&lt;/footer&gt;</code-block>

## Next steps

- [Project Structure](/docs/project-structure/) — how Cook projects are organized
- [Configuration](/docs/configuration/) — all config options
- [Components](/docs/components/) — reusable HTML components
- [Markdown](/docs/markdown/) — write content in Markdown with frontmatter
