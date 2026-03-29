---
title: Data
description: Define global template data with config/data.js
section: Core Concepts
---

# Data

Cook loads `config/data.js` at build time and makes its exported values available as template strings on every page. Combine this with [front matter](/docs/markdown/) for page-level overrides.

## Basic data file

Export a plain object with string values. Each key becomes a `${variableName}` you can use in any HTML, JSON, or webmanifest file.

<code-block language="javascript" label="config/data.js">export default {
  siteTitle: 'Outdoor Gear Co.',
  siteDescription: 'Premium outdoor equipment since 2019',
  year: new Date().getFullYear().toString(),
  themeColor: '#1a5c2e',
};</code-block>

Use these values in templates with `${variableName}` syntax:

<code-block language="html" label="src/index.html">&lt;title&gt;&#36;{siteTitle}&lt;/title&gt;
&lt;meta name="description" content="&#36;{siteDescription}"&gt;
&lt;footer&gt;&amp;copy; &#36;{year} &#36;{siteTitle}&lt;/footer&gt;</code-block>

## Nested data

Use dot notation to organize related data. Access nested values with `${parent.child}` in your templates.

<code-block language="javascript" label="config/data.js">export default {
  site: {
    title: 'Outdoor Gear Co.',
    url: 'https://www.outdoorgear.co',
    description: 'Premium outdoor equipment',
  },
  social: {
    twitter: '@outdoorgearco',
    github: 'outdoor-gear-co',
  },
};</code-block>

<code-block language="html" label="src/index.html">&lt;title&gt;&#36;{site.title}&lt;/title&gt;
&lt;a href="https://twitter.com/&#36;{social.twitter}"&gt;Twitter&lt;/a&gt;</code-block>

## Async data loading

Export a function instead of an object to load data dynamically at build time. Cook will `await` the function if it returns a promise.

<code-block language="javascript" label="config/data.js">export default async function () {
  const response = await fetch('https://api.example.com/products');
  const products = await response.json();

  return {
    siteTitle: 'My Store',
    products,
    buildDate: new Date().toISOString(),
  };
}</code-block>

This is useful for pulling data from APIs, reading files, or running any Node.js code at build time.

## Dynamic imports

For data that requires heavy dependencies, use dynamic `import()` inside the function:

<code-block language="javascript" label="config/data.js">export default async function () {
  const fs = await import('node:fs/promises');
  const packageJson = JSON.parse(
    await fs.readFile('./package.json', 'utf-8')
  );

  return {
    version: packageJson.version,
    siteTitle: packageJson.name,
  };
}</code-block>

## How data flows

1. Cook loads `config/data.js` once at the start of the build
2. If the export is a function, Cook calls it and awaits the result
3. The resulting object is passed to every build plugin that needs data
4. For template string resolution, front matter values are merged on top of global data, so page-level values override global ones
5. Template strings (`${key}`) are replaced with their matching data values

## Arrays and collections

Data can include arrays, which are especially useful with [data-repeat](/docs/data-repeat/):

<code-block language="javascript" label="config/data.js">export default {
  siteTitle: 'My Blog',
  navLinks: [
    { label: 'Home', url: '/' },
    { label: 'Blog', url: '/blog/' },
    { label: 'About', url: '/about/' },
  ],
};</code-block>

See [Template Strings](/docs/template-strings/) for how these values get resolved and [Data Repeat](/docs/data-repeat/) for iterating over arrays.
