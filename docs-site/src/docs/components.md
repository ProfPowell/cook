---
title: Components
description: Reusable HTML components with slots, attributes, and scoped styles
section: Core Concepts
---

# Components

Cook components are reusable HTML templates stored in `src/components/`. They expand at build time — zero JavaScript runtime cost.

## Creating a component

Create an HTML file in `src/components/`:

<code-block language="html" label="src/components/product-card.html">&lt;article class="product-card"&gt;
  &lt;h3&gt;${name}&lt;/h3&gt;
  &lt;p&gt;${description}&lt;/p&gt;
  ${slot}
&lt;/article&gt;</code-block>

## Using a component

Use the filename as a custom element tag. Attributes become template variables:

<code-block language="html" label="src/products.html">&lt;product-card
  name="Trail Runner Pack"
  description="32L ultralight backpack"&gt;
  &lt;a href="/products/trail-runner-pack/"&gt;View Details&lt;/a&gt;
&lt;/product-card&gt;</code-block>

<browser-window url="Output">
&lt;article class="product-card"&gt;
  &lt;h3&gt;Trail Runner Pack&lt;/h3&gt;
  &lt;p&gt;32L ultralight backpack&lt;/p&gt;
  &lt;a href="/products/trail-runner-pack/"&gt;View Details&lt;/a&gt;
&lt;/article&gt;
</browser-window>

## Slots

**Default slot** — `${slot}` receives all child content:

<code-block language="html" label="Component">&lt;div class="box"&gt;${slot}&lt;/div&gt;</code-block>

**Named slots** — `${slot:name}` receives children with `slot="name"`:

<code-block language="html" label="src/components/page-section.html">&lt;section&gt;
  &lt;header&gt;${slot:header}&lt;/header&gt;
  &lt;main&gt;${slot}&lt;/main&gt;
&lt;/section&gt;</code-block>

<code-block language="html" label="Usage">&lt;page-section&gt;
  &lt;h2 slot="header"&gt;Features&lt;/h2&gt;
  &lt;p&gt;Default slot content here.&lt;/p&gt;
&lt;/page-section&gt;</code-block>

## Component styles

Components can include `<style>` blocks. Styles are extracted, deduplicated, and injected into `<head>`:

<code-block language="html" label="src/components/alert.html">&lt;style&gt;
  @scope (.alert) {
    :scope { padding: 1rem; border-radius: 0.25rem; }
    .alert-error { background: #fee; border: 1px solid #c00; }
  }
&lt;/style&gt;
&lt;div class="alert alert-${type}"&gt;
  ${slot}
&lt;/div&gt;</code-block>

Use native `@scope` and `@layer` for CSS isolation — no framework-specific scoping needed.

## Semantic HTML pattern

For semantic markup, use `data-component` on any element:

<code-block language="html" label="Semantic HTML">&lt;header data-component="site-header"
  data-title="Welcome"&gt;
&lt;/header&gt;</code-block>

This looks up `src/components/site-header.html` and passes `data-*` attributes as template variables.

## DSD Components

Components can use **Declarative Shadow DOM** for true encapsulation. Include `<template shadowrootmode="open">` in the component file:

<code-block language="html" label="src/components/my-card.html">&lt;template shadowrootmode="open"&gt;
  &lt;style&gt;
    :host { display: block; }
    .card { border: 1px solid var(--border, #ccc); padding: 1rem; }
  &lt;/style&gt;
  &lt;div class="card"&gt;
    &lt;h3&gt;${title}&lt;/h3&gt;
    &lt;slot&gt;&lt;/slot&gt;
  &lt;/div&gt;
&lt;/template&gt;</code-block>

DSD components preserve the custom element in the output and use native `<slot>` for content projection. See [Declarative Shadow DOM](/docs/dsd/) for details.

## File resolution

Cook looks for component templates in two locations:

1. `src/components/card.html` (direct file)
2. `src/components/card/index.html` (directory with index)

## Configuration

<code-block language="javascript" label="config/main.js">export default {
  components: {
    path: 'components',       // Directory in src/
    prefix: 'site-',          // Strip prefix: &lt;site-card&gt; → card.html
    mapping: {                // Explicit mappings
      'my-widget': 'special-widget.html',
    },
  },
};</code-block>
