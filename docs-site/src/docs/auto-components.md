---
title: Auto-Components
description: Automatic custom element detection, CSS-only optimization, and import map generation
section: Advanced
---

# Auto-Components

The auto-components plugin scans each built HTML page for custom element tags (any tag containing a hyphen), determines which need JavaScript, and optimizes loading accordingly. Pages that only use CSS-only elements get zero JavaScript. Pages that need JS get fine-grained import maps instead of a monolithic bundle.

## How it works

1. Cook scans the page for all custom element tags (e.g. `&lt;site-header&gt;`, `&lt;tab-set&gt;`)
2. Each tag is checked against the `cssOnly` list
3. If **no** tags require JS, the Vanilla Breeze bundle script is removed entirely
4. If JS-requiring tags exist **and** a manifest is provided, Cook generates an import map for only the needed components and removes the bundle
5. If JS-requiring tags exist but no manifest is available, the full bundle is kept

## CSS-only elements

Some custom elements are implemented with CSS alone and never need JavaScript. List them in the `cssOnly` config to strip the JS bundle from pages that only use those elements:

<code-block language="javascript" label="config/main.js">export default {
  autoComponents: {
    enabled: true,
    cssOnly: [
      'layout-stack',
      'layout-sidebar',
      'layout-grid',
      'icon-symbol',
    ],
  },
};</code-block>

A page using only `&lt;layout-stack&gt;` and `&lt;icon-symbol&gt;` will have the Vanilla Breeze script tag removed from the output, resulting in a zero-JS page.

## Import map generation

When a component manifest is provided, Cook generates a per-page import map so only the components actually used on that page are loaded:

<code-block language="javascript" label="config/main.js">export default {
  autoComponents: {
    enabled: true,
    manifest: 'assets/vb/manifest.json',
    cssOnly: ['layout-stack', 'layout-sidebar'],
  },
};</code-block>

The manifest is a JSON file mapping tag names to JS file paths:

<code-block language="json" label="dist/assets/vb/manifest.json">{
  "tab-set": "/assets/vb/tab-set.js",
  "accordion-wc": "/assets/vb/accordion-wc.js",
  "modal-dialog": "/assets/vb/modal-dialog.js"
}</code-block>

For a page that uses `&lt;tab-set&gt;` and `&lt;layout-stack&gt;`, Cook injects an import map and module script for `tab-set` only, and removes the bundle script tag.

## Cook DSD component scripts

When Cook-authored DSD components (see [Declarative Shadow DOM](/docs/dsd/)) have companion `.js` hydration files, the auto-components plugin detects them and injects individual `&lt;script type="module"&gt;` tags rather than relying on the VB bundle.

## Configuration reference

| Option | Default | Description |
|---|---|---|
| `enabled` | `false` | Enable the auto-components plugin |
| `cssOnly` | `[]` | Array of tag names that use CSS only |
| `manifest` | `null` | Path to component manifest JSON (relative to dist) |
| `bundlePattern` | `/vanilla-breeze[^"']*\.js/` | Regex to match VB bundle script tags for removal |
