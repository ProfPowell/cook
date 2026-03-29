---
title: Declarative Shadow DOM
description: Pre-render shadow DOM content to eliminate FOUC and enable SSR for web components
section: Advanced
---

# Declarative Shadow DOM

Cook pre-renders Declarative Shadow DOM (DSD) templates into your HTML at build time. This eliminates the flash of unstyled content (FOUC) that occurs when Shadow DOM components wait for JavaScript to load, and makes component content visible to search engines.

There are two approaches depending on where the component comes from.

## Approach 1: Manifest-based (external components)

For third-party or framework components like Vanilla Breeze, provide a DSD manifest that maps tag names to their shadow DOM HTML. Cook injects `&lt;template shadowrootmode="open"&gt;` as the first child of each matching element.

<code-block language="javascript" label="config/main.js">export default {
  dsd: {
    enabled: true,
    manifest: 'assets/vb/dsd-manifest.json',
  },
};</code-block>

The manifest maps each tag name to its shadow DOM content:

<code-block language="json" label="dist/assets/vb/dsd-manifest.json">{
  "vb-button": "&lt;style&gt;:host { display: inline-flex; }&lt;/style&gt;&lt;slot&gt;&lt;/slot&gt;",
  "hero-banner": "&lt;style&gt;:host { display: block; }&lt;/style&gt;&lt;div class='inner'&gt;&lt;slot&gt;&lt;/slot&gt;&lt;/div&gt;"
}</code-block>

For a page containing `&lt;vb-button&gt;Click me&lt;/vb-button&gt;`, Cook produces:

<code-block language="html" label="Output">&lt;vb-button&gt;
  &lt;template shadowrootmode="open"&gt;
    &lt;style&gt;:host { display: inline-flex; }&lt;/style&gt;
    &lt;slot&gt;&lt;/slot&gt;
  &lt;/template&gt;
  Click me
&lt;/vb-button&gt;</code-block>

### Dynamic attributes

Manifest templates can reference host element attributes with `&#36;{attr:name}`. Cook resolves these at build time:

```json
{
  "hero-banner": "<img src='${attr:src}' alt='${attr:alt}'><slot></slot>"
}
```

An element like `<hero-banner src="/hero.jpg" alt="Welcome">` gets the `src` and `alt` values injected into its shadow template.

### VB component requirement

Vanilla Breeze components must guard their shadow root attachment so the DSD template is adopted rather than replaced:

```javascript
if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
```

## Approach 2: Template-based (Cook-authored components)

For components you author directly in Cook, place a `&lt;template shadowrootmode="open"&gt;` inside the component's HTML file. Cook's component system will include it in the output, and the browser adopts it as a declarative shadow root -- no manifest needed.

<code-block language="html" label="src/components/my-card.html">&lt;template shadowrootmode="open"&gt;
  &lt;style&gt;
    :host { display: block; border: 1px solid #ccc; border-radius: 8px; }
    .body { padding: 1rem; }
  &lt;/style&gt;
  &lt;div class="body"&gt;
    &lt;slot&gt;&lt;/slot&gt;
  &lt;/div&gt;
&lt;/template&gt;</code-block>

If a companion `my-card.js` file exists alongside the HTML template, the [auto-components](/docs/auto-components/) plugin automatically injects a `&lt;script type="module"&gt;` tag for hydration.

## Configuration reference

| Option | Default | Description |
|---|---|---|
| `enabled` | `false` | Enable the DSD plugin |
| `manifest` | `null` | Path to DSD manifest JSON (relative to dist, or absolute) |
