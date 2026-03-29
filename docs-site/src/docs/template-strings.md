---
title: Template Strings
description: Use ${variableName} syntax to inject data into pages at build time
section: Core Concepts
---

# Template Strings

Cook replaces `${variableName}` expressions in your HTML with values from your data at build time. No client-side JavaScript needed.

## Basic usage

Define data in `config/data.js` and reference it with `${key}`:

<code-block language="javascript" label="config/data.js">export default {
  siteTitle: 'Trail Maps',
  tagline: 'Navigate every peak',
};</code-block>

<code-block language="html" label="src/index.html">&lt;h1&gt;&#36;{siteTitle}&lt;/h1&gt;
&lt;p&gt;&#36;{tagline}&lt;/p&gt;</code-block>

The output replaces each variable with its value:

<browser-window url="Build Output">&lt;h1&gt;Trail Maps&lt;/h1&gt;
&lt;p&gt;Navigate every peak&lt;/p&gt;</browser-window>

## Nested property access

Use dot notation to access nested objects from your data:

<code-block language="javascript" label="config/data.js">export default {
  site: {
    title: 'Trail Maps',
    url: 'https://trailmaps.co',
  },
  author: {
    name: 'Alex Chen',
    email: 'alex@trailmaps.co',
  },
};</code-block>

<code-block language="html" label="src/about.html">&lt;title&gt;&#36;{site.title}&lt;/title&gt;
&lt;p&gt;Created by &#36;{author.name}&lt;/p&gt;</code-block>

## Data sources

Template strings resolve from multiple sources, merged in this order (later sources win):

1. **Global data** -- values from `config/data.js`
2. **Front matter** -- YAML metadata at the top of Markdown or HTML files

<code-block language="markdown" label="src/docs/setup.md">---
title: Setup Guide
author: Alex Chen
---

# &#36;{title}
Written by &#36;{author}</code-block>

Front matter values override global data for that page. If `config/data.js` defines `title: 'Trail Maps'` but a page's front matter sets `title: 'Setup Guide'`, the page uses `Setup Guide`.

## Component attributes

Inside [component](/docs/components/) templates, `${variableName}` resolves from the attributes passed to the component. This is a separate resolution step -- components replace their own variables when they expand:

<code-block language="html" label="src/components/alert.html">&lt;div class="alert alert-&#36;{type}"&gt;
  &lt;strong&gt;&#36;{heading}&lt;/strong&gt;
  &#36;{slot}
&lt;/div&gt;</code-block>

<code-block language="html" label="Usage">&lt;alert type="warning" heading="Caution"&gt;
  Trail closed due to weather.
&lt;/alert&gt;</code-block>

## Resolution order

Cook resolves template strings in a specific pipeline order during the build:

1. **Layout templates** are applied, wrapping content in a shared shell
2. **Includes** are resolved, pulling in partial HTML files
3. **Data-repeat** expands elements for each item in an array
4. **Components** expand custom elements, resolving their own `${attribute}` variables
5. **Final template strings** are resolved across the fully assembled page using global data merged with front matter

This means an include file can contain `${siteTitle}` and it will be resolved in step 5, after the include content has been inlined. Similarly, a repeated element can contain `${siteTitle}` and it will resolve in the final pass.

## Unresolved variables

If a `${variableName}` has no matching data value, Cook leaves it in the output unchanged. This is intentional -- it prevents silent data loss and makes missing variables easy to spot. It also allows Vue-style `${{doublebraces}}` to pass through untouched.

## Protected contexts

Cook does **not** replace template strings inside `<script>` or `<style>` element content. JavaScript template literals and CSS custom properties are left untouched. However, template strings in **attributes** on those elements (like `<script src="${site.js}">`) are still resolved.

## Supported file types

Template strings are resolved in `.html`, `.json`, and `.webmanifest` files. Other file types pass through the build unchanged.
