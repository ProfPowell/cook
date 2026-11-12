---
title: Layout Format
description: Layouts that extend other layouts, conditional sections, and the cook check-layouts command
section: Advanced
---

# Layout Format

Layouts are full HTML documents in `src/layouts/` that wrap a page. This page covers the three things Cook adds on top of plain layouts: layouts that are built on other layouts, `data-if` and `data-unless` sections, and a layout format (format 1) with a checker, `cook check-layouts`.

All of it is opt-in. A site that uses none of it builds byte-for-byte as before.

## Layouts built on layouts

A layout whose `<html>` or `<body>` has `data-template="parent"` is a **child** layout. Cook applies the child to the page, then applies the result to the parent. The child's body becomes the parent's `content`, each `<template slot="x">` fills the parent's slot `x`, and the other `data-*` attributes on the body become variables the parent can use.

<code-block language="html" label="src/layouts/base.html">&lt;!doctype html&gt;
&lt;html lang="en"&gt;
&lt;head&gt;
  &lt;meta charset="utf-8"&gt;
  &lt;title&gt;&#36;{title} · &#36;{siteTitle}&lt;/title&gt;
  &#36;{slot:head}
&lt;/head&gt;
&lt;body data-page-layout="&#36;{pageLayout}"&gt;
  &lt;main&gt;&#36;{content}&lt;/main&gt;
  &lt;aside data-if="slot:aside"&gt;&#36;{slot:aside}&lt;/aside&gt;
&lt;/body&gt;
&lt;/html&gt;</code-block>

<code-block language="html" label="src/layouts/post.html">&lt;body data-template="base" data-page-layout="article"&gt;
  &lt;article&gt;
    &lt;h1&gt;&#36;{title}&lt;/h1&gt;
    &lt;p data-if="date"&gt;&lt;time datetime="&#36;{date}"&gt;&#36;{date}&lt;/time&gt;&lt;/p&gt;
    &#36;{content}
  &lt;/article&gt;
  &lt;template slot="aside"&gt;&#36;{slot:aside}&lt;/template&gt;
&lt;/body&gt;</code-block>

Here `data-page-layout="article"` on the child reaches the base as the `pageLayout` variable.

- A chain can be five layouts deep. Longer, or a cycle, is a build error that names the chain.
- A child fills only the parent's slots it names. To let a page fill a slot of the parent, the child forwards it, as `post.html` does for `aside`. A forwarded slot the page left empty counts as empty, so the parent's `data-if="slot:aside"` removes the element.
- It works for HTML pages and for Markdown pages.
- Page content is never read as layout structure. A page that contains `<main>`, `<template>` or a template string reaches the output exactly as written.

A page picks a layout as before: `layout:` in front matter, or `data-template` on `<html>` or `<body>`.

## Conditional sections

`data-if="key"` keeps an element only when the key is set. `data-unless="key"` keeps it only when the key is not set. Cook then removes the attribute.

<code-block language="html" label="Conditional sections">&lt;img data-if="image" src="&#36;{image}" alt="&#36;{imageAlt}"&gt;
&lt;p data-unless="image"&gt;No picture for this one.&lt;/p&gt;
&lt;aside data-if="slot:aside"&gt;&#36;{slot:aside}&lt;/aside&gt;</code-block>

A key is **not set** when it is missing, an empty string (or only spaces), an empty list or `false`. A key can be:

- a page field (`image`), or a site field from `config/data.js`;
- `slot:name`, for a slot the page filled;
- `item.field`, inside a `data-repeat`.

### Inside a repeat

Inside a `data-repeat`, a key must use the item's alias. A bare key refers to the page, never to the item.

<code-block language="html" label="Item keys">&lt;article data-repeat="collections.blog | limit:5 as post"&gt;
  &lt;img data-if="post.image" src="&#36;{post.image}" alt=""&gt;
  &lt;h2&gt;&#36;{post.title}&lt;/h2&gt;
&lt;/article&gt;</code-block>

Writing `data-if="image"` here would test the page's own `image`, not each post's.

### Where they are evaluated

Cook evaluates conditionals at layout time (page fields, slots and site data), for each item of a `data-repeat`, and in a last pass over the finished page. That last pass looks at the whole page, content included. An example of `data-if` or `data-unless` written as real markup in your page content is evaluated like any other. To show one, put it in escaped code, as the examples on this page do (`<code-block>` with `&lt;`).

On **Markdown pages**, the page's fields are decided at layout time. By the time includes are processed the front matter is gone, so a conditional inside an include cannot test a page field there and sees it as empty. Test page fields in the layout itself.

## The layout format (format 1)

Format 1 is plain Cook HTML with a small, fixed vocabulary, plus a checker that says whether a file follows it. Hand-written layouts can follow it, and tools such as the Vanilla Press layout editor only open files that do.

A layout is **plain** until it carries an info block. Plain layouts build exactly as before and are never failures.

### The info block

<code-block language="html" label="Layout info">&lt;script type="application/json" data-layout-info&gt;
{ "format": 1, "label": "Blog post", "description": "A dated article.",
  "abstract": false, "slots": { "aside": { "label": "Sidebar" } } }
&lt;/script&gt;</code-block>

- In a base layout it goes in `<head>`. In a child it is the first thing in `<body>`.
- Cook removes it from the output.
- `abstract: true` means the layout exists only to be extended; editors do not offer it to pages.
- `slots` lists every slot the layout uses, and nothing else.
- `head` is a reserved slot. A base may put it last in `<head>`, and a child fills it with `<template slot="head">` holding only `meta`, `link`, `script` and `style`.

### The blocks

Inside `main`, `header`, `nav`, `aside`, `footer`, a child's body, slot templates and fragments, every element must be one of these.

| Block | Markup |
|---|---|
| Content | the `content` placeholder, exactly once, inside `main` (base) or the child body |
| Slot | a `slot:name` placeholder, alone inside its parent element |
| Text | `h1` to `h6`, `p`, `small`, `figcaption`, `blockquote`, holding text, fields and `a`, `strong`, `em`, `span`, `time`, `br`, `img`, `abbr`, `code` |
| Image | `img`, `picture` with `source`, or a `figure` around them, with an optional `figcaption` |
| Container | a Vanilla Breeze `layout-*` element, or `div`, `section`, `article`, `header`, `footer`, `nav`, `aside` carrying `data-layout` (sectioning elements need no attribute) |
| List | any block with `data-repeat="source \| limit:N as item"`, such as a container, a `ul` or an `li` in a menu (see below); Cook clones the element it sits on, and its fields are `item.x` |
| Menu | `ul`, `ol` or `menu` of `li` items |
| Include | an empty `<div data-include="/includes/x.html"></div>` |
| Component | any custom element (hyphenated tag), kept as written; it may carry `data-repeat`, and its attributes can use the item's fields |
| Comment | an HTML comment |

Any block may carry `id`, `class`, `role`, `lang`, `aria-*`, `data-*`, `data-if` and `data-unless`.

A base layout's `<body>` has `data-page-layout` set to one of `stack`, `sidebar-left`, `sidebar-right`, `holy-grail`, `app-shell`, `dashboard`, `article`, `landing` (or empty), or to the `pageLayout` variable so a child can choose. Its children are `header`, `nav` (at most two), exactly one `main`, `aside`, `footer` and includes. `<head>` holds only `meta`, `link`, `title`, `script`, `style` and `base`.

<code-block language="html" label="A repeated li">&lt;nav&gt;&lt;ul&gt;
  &lt;li data-repeat="navItems | limit:12 as item"&gt;&lt;a href="&#36;{item.href}"&gt;&#36;{item.label}&lt;/a&gt;&lt;/li&gt;
&lt;/ul&gt;&lt;/nav&gt;</code-block>

List sources are `collections.<name>`, `programs`, `programAreas.<area>` and top-level arrays in `config/data.js`.

### Known fields

An unknown field is an error, so typos are caught. The known fields are:

- document fields: `title`, `description`, `date`, `published`, `updated`, `author`, `tags`, `image`, `imageAlt`, `theme`, `themeScope`, `layout`, `slug`, `vp_id`, `url`, `pageLayout`;
- site fields: the top-level keys of `config/data.js`;
- item fields, inside a list;
- extra document fields your site lists in `config/main.js`:

<code-block language="javascript" label="config/main.js">export default {
  layouts: { fields: ['ogImage'] },
};</code-block>

### Keeping layouts out of dist

Layouts, includes and components are used during the build, not served. List them in `buildOnlyPaths` so they stay out of `dist/`:

<code-block language="javascript" label="config/main.js">export default {
  buildOnlyPaths: ['components', 'includes', 'layouts'],
};</code-block>

### Includes as fragments

An include is checked as a format-1 fragment only when its first line is `<!-- layout-fragment -->`. Without that line it is a free-form include and is never checked, so existing includes keep working.

## cook check-layouts

<code-block language="bash" label="Check the current site">cook check-layouts</code-block>

The command checks every file in `src/layouts` and `src/includes` and prints `file:line: problem` for each problem. A layout is only "editable" when it and every parent above it follow format 1.

- It exits 1 when any layout with an info block, or any marked fragment, has a problem (for a layout with an info block, a missing parent or a cycle in its chain counts), or when `config/data.js` or `config/main.js` throws while loading.
- Plain layouts are listed as plain and never fail the check, even when their parent is missing or their chain has a cycle.
- It ends with a summary line: `N layouts, M includes: X editable, Y plain, Z with problems`.
- A site with no `config/data.js` is fine. A `config/data.js` that throws fails the check, because the field names come from it.

The same checker is available to your own tools as a module:

<code-block language="javascript" label="cook-ssg/layouts">import { checkLayout, listLayouts, FORMAT } from 'cook-ssg/layouts';
const { layouts, includes, problems } = await listLayouts(process.cwd());</code-block>

## For tool authors

`cook-ssg/layouts` also exports what a layout editor needs. Everything here reads and returns plain data and never changes the build.

### The layout tree

`parseLayout(source, { fields, lists })` turns a layout file that follows format 1 into a tree, and `serializeLayout(tree)` writes the tree back as a layout file. Parsing the result again gives the same tree. The tree's shape is described at the top of `scripts/utils/layouts/tree.js`.

- A layout that doesn't follow the format is not parsed; `parseLayout` reports the problems instead, the same ones `cook check-layouts` prints.
- A component's inner HTML, an inline script or style, and a comment between blocks survive a round trip. A correct layout holding something the tree has no place for is refused with a problem, never opened with that part lost.

<code-block language="javascript" label="Edit a layout">import { parseLayout, serializeLayout } from 'cook-ssg/layouts';
const parsed = parseLayout(source, { fields, lists });
// change the tree, then:
const next = serializeLayout(parsed.tree);</code-block>

### Where a layout is used

`layoutUsage(siteDir)` says which pages use which layouts, so a tool can show "Used by 3 pages" before an edit.

<code-block language="javascript" label="Layout usage">import { layoutUsage } from 'cook-ssg/layouts';
const { pages, layouts } = await layoutUsage(process.cwd());
// pages.post   -> ['src/about.html', 'src/blog/hello.md']
// layouts.base -> ['page', 'post']</code-block>

- `pages[name]` lists the paths, relative to the site, of pages in `src/` that use the layout `name`: through a front matter `layout:` (HTML or markdown), through the `markdown.layout` default in `config/main.js` for a markdown page with none, or through `data-template` on `<html>` or `<body>`.
- `layouts[name]` lists the layouts whose `data-template` names `name`, that is, the layouts built on it.
- Files in `src/layouts`, `src/includes`, `src/components` and program folders are not pages and are skipped.
- It never throws. A file it can't read, or a `config/main.js` that fails to load, is skipped.
