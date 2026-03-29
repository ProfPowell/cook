---
title: Markdown
description: Write content in Markdown with YAML frontmatter, layouts, and automatic collections
section: Core Concepts
---

# Markdown

Cook converts `.md` files in `src/` to HTML pages in `dist/`. Each file can include YAML frontmatter for metadata and an optional layout template for wrapping the content.

## Frontmatter

Add YAML between `---` fences at the top of any `.md` file. These fields become template variables available in the layout.

<code-block language="markdown" label="src/blog/hello-world.md">---
title: Hello World
description: My first blog post
date: 2026-03-15
layout: post
author: Jane
tags: [intro, cook]
---

# Hello World

This is my first post built with Cook.</code-block>

The `title` field is used as the page title. If omitted, Cook derives it from the filename. The `date` field is kept as a timezone-safe `YYYY-MM-DD` string for templates but is also parsed internally for sorting.

## Layout templates

The `layout` frontmatter field maps to an HTML file in `src/layouts/`. Use `&#36;{content}` where the converted markdown should appear, and `&#36;{fieldName}` for any frontmatter or global data variable.

<code-block language="html" label="src/layouts/post.html">&lt;!doctype html&gt;
&lt;html lang="en"&gt;
&lt;head&gt;
  &lt;meta charset="utf-8"&gt;
  &lt;title&gt;&#36;{title} - &#36;{siteTitle}&lt;/title&gt;
  &lt;meta name="description" content="&#36;{description}"&gt;
&lt;/head&gt;
&lt;body&gt;
  &lt;main&gt;
    &lt;article&gt;
      &lt;time&gt;&#36;{date}&lt;/time&gt;
      &#36;{content}
    &lt;/article&gt;
  &lt;/main&gt;
&lt;/body&gt;
&lt;/html&gt;</code-block>

Cook searches for the layout file in `src/layouts/` first, then `dist/layouts/`. You can change the layout directory with the `markdown.layoutPath` config option. If no layout is specified (and no default is configured), Cook wraps content in a basic HTML document.

## Collections

Markdown files are automatically grouped into **collections** by their parent directory. Every `.md` file inside `src/blog/` becomes part of the `blog` collection, files in `src/docs/` become the `docs` collection, and so on.

Collections are sorted by date (newest first) and exposed as `collections.{name}` in template data. Use them with `data-repeat` to render lists:

<code-block language="html" label="src/blog.html">&lt;ul&gt;
  &lt;li data-repeat="collections.blog as post"&gt;
    &lt;a href="&#36;{post.url}"&gt;&#36;{post.title}&lt;/a&gt;
    &lt;time&gt;&#36;{post.date}&lt;/time&gt;
  &lt;/li&gt;
&lt;/ul&gt;</code-block>

Each collection item includes `title`, `url`, `slug`, `date`, `description`, and any other frontmatter fields you define. The `content` field is excluded from collection items to save memory.

## Configuration

Set defaults in `config/main.js` under the `markdown` key:

<code-block language="javascript" label="config/main.js">export default {
  markdown: {
    layout: 'default',       // default layout for all .md files
    layoutPath: 'layouts',   // directory for layout templates
    collections: true,       // auto-group by directory
    markedOptions: {
      gfm: true,             // GitHub Flavored Markdown
      breaks: false,         // convert \n to &lt;br&gt;
    },
  },
};</code-block>

## Clean URLs

Cook converts `src/blog/hello-world.md` to `dist/blog/hello-world/index.html`, giving you the clean URL `/blog/hello-world/`. Files named `index.md` produce `index.html` in the same directory.
