---
title: Fragments
description: Generate content-only HTML fragments for SPA-style navigation
section: Advanced
---

# Fragments

Cook generates a content-only HTML fragment alongside every page. These fragments contain only the inner HTML of a target element (default: `&lt;main&gt;`), enabling client-side navigation libraries like html-star to swap page content without a full reload.

## How it works

For every `index.html` in `dist/`, Cook extracts the `innerHTML` of the configured selector and writes it as a sibling file. Given this page:

<code-block language="html" label="dist/about/index.html">&lt;!doctype html&gt;
&lt;html lang="en"&gt;
&lt;head&gt;&lt;title&gt;About&lt;/title&gt;&lt;/head&gt;
&lt;body&gt;
  &lt;header&gt;&lt;nav&gt;...&lt;/nav&gt;&lt;/header&gt;
  &lt;main&gt;
    &lt;h1&gt;About Us&lt;/h1&gt;
    &lt;p&gt;We build things.&lt;/p&gt;
  &lt;/main&gt;
  &lt;footer&gt;...&lt;/footer&gt;
&lt;/body&gt;
&lt;/html&gt;</code-block>

Cook produces this fragment:

<code-block language="html" label="dist/about/_fragment.html">
    &lt;h1&gt;About Us&lt;/h1&gt;
    &lt;p&gt;We build things.&lt;/p&gt;
</code-block>

## Using fragments with html-star

Client-side routers request fragments by sending a custom header. html-star sends `X-Requested-With: htmlstar` when navigating between pages. On the server (or in Cook's dev server), this header triggers the fragment response instead of the full page.

A typical flow:

1. User clicks a link
2. html-star intercepts the click and fetches the URL with the `X-Requested-With: htmlstar` header
3. The server returns `_fragment.html` instead of `index.html`
4. html-star swaps the `&lt;main&gt;` content and updates the URL

This gives users instant page transitions while keeping full-page HTML available for direct navigation and search engines.

## Configuration

Fragments are enabled by default. Configure them in `config/main.js`:

<code-block language="javascript" label="config/main.js">export default {
  fragments: {
    enabled: true,            // set false to disable
    selector: 'main',         // CSS selector for the content element
    filename: '_fragment.html' // output filename
  },
};</code-block>

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | Enable fragment generation |
| `selector` | `'main'` | CSS selector whose innerHTML becomes the fragment |
| `filename` | `'_fragment.html'` | Name of the generated fragment file |

## Custom selectors

If your layout uses a different content wrapper, change the selector:

<code-block language="javascript" label="config/main.js">export default {
  fragments: {
    selector: '#content',
    filename: '_partial.html',
  },
};</code-block>

Pages that do not contain an element matching the selector are silently skipped.
