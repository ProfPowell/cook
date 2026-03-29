---
title: Includes
description: Reuse HTML partials across pages with data-include and include-file
section: Core Concepts
---

# Includes

Includes let you share HTML fragments across pages. Store reusable markup in partial files and pull them in at build time -- headers, footers, `<head>` metadata, and anything else you repeat.

## Creating an include

Create an HTML file anywhere in `src/`. A common convention is `src/includes/`:

<code-block language="html" label="src/includes/head.html">&lt;meta charset="utf-8"&gt;
&lt;meta name="viewport" content="width=device-width, initial-scale=1"&gt;
&lt;link rel="stylesheet" href="/assets/css/main.css"&gt;</code-block>

## Using includes

### data-include attribute

Add `data-include` to any element. The element is replaced with the file content:

<code-block language="html" label="src/index.html">&lt;!doctype html&gt;
&lt;html lang="en"&gt;
&lt;head&gt;
  &lt;meta data-include="/includes/head.html"&gt;
  &lt;title&gt;Home&lt;/title&gt;
&lt;/head&gt;
&lt;body&gt;
  &lt;header data-include="/includes/header.html"&gt;&lt;/header&gt;
  &lt;main&gt;Content here&lt;/main&gt;
  &lt;footer data-include="/includes/footer.html"&gt;&lt;/footer&gt;
&lt;/body&gt;
&lt;/html&gt;</code-block>

### include-file element

Use the `<include-file>` custom element for a more explicit syntax:

<code-block language="html" label="src/index.html">&lt;include-file src="/includes/header.html"&gt;&lt;/include-file&gt;</code-block>

Both syntaxes produce the same result. The element is fully replaced with the contents of the referenced file.

### Self-closing meta includes

For `<head>` content, `<meta data-include>` is especially useful since it is valid HTML in `<head>`:

<code-block language="html" label="src/index.html">&lt;head&gt;
  &lt;meta data-include="/includes/head.html"&gt;
  &lt;title&gt;&#36;{siteTitle}&lt;/title&gt;
&lt;/head&gt;</code-block>

## File paths

Include paths are relative to `src/`. You can omit the `.html` extension -- Cook adds it automatically if missing:

<code-block language="html" label="Both are equivalent">&lt;meta data-include="/includes/head.html"&gt;
&lt;meta data-include="/includes/head"&gt;</code-block>

## Nested includes

Included files can themselves contain includes. Cook resolves them iteratively up to **5 levels deep**, which prevents infinite recursion while supporting practical nesting:

<code-block language="html" label="src/includes/header.html">&lt;header&gt;
  &lt;nav data-include="/includes/nav.html"&gt;&lt;/nav&gt;
  &lt;div data-include="/includes/search-bar.html"&gt;&lt;/div&gt;
&lt;/header&gt;</code-block>

## Caching

Cook caches include file content in memory during the build. If the same include is used across 50 pages, the file is read from disk once and served from the cache for subsequent uses. This makes includes fast even when shared across a large site.

## Template strings in includes

Include files can contain `${variableName}` template strings. Since includes are resolved **before** the final template string pass, your variables will be replaced after the include content is inlined into the page:

<code-block language="html" label="src/includes/footer.html">&lt;footer&gt;
  &lt;p&gt;&amp;copy; &#36;{year} &#36;{siteTitle}&lt;/p&gt;
  &lt;a href="&#36;{site.url}"&gt;&#36;{site.title}&lt;/a&gt;
&lt;/footer&gt;</code-block>

## Build-only directories

Include directories like `src/includes/` are typically listed in `buildOnlyPaths` so they are used during the build but not copied to the output:

<code-block language="javascript" label="config/main.js">export default {
  buildOnlyPaths: ['includes', 'layouts'],
};</code-block>

## Pipeline order

Includes are resolved early in the build pipeline -- after layout templates are applied but before data-repeat, components, and template strings. This means:

- Layout templates can contain includes
- Includes can contain components and template strings
- Includes can contain other includes (up to 5 levels)
- Includes **cannot** use data-repeat (repeat runs after includes)
