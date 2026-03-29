---
title: Multi-Format Output
description: Generate markdown copies, JSON metadata, Atom feeds, and llms.txt from your pages
section: Advanced
---

# Multi-Format Output

Cook can produce multiple output formats from your pages: markdown copies for content APIs, JSON metadata for programmatic access, an Atom feed for RSS readers, and `llms.txt` files for AI systems.

## Markdown copies

When enabled, Cook copies the original `.md` source file to `dist/md/{path}/index.md` for every markdown-sourced page. This lets clients request raw markdown via content negotiation or direct URL.

For example, `src/docs/quick-start.md` produces both `dist/docs/quick-start/index.html` and `dist/md/docs/quick-start/index.md`.

## JSON metadata

For every page, Cook generates a JSON file at `dist/api/{path}.json` containing extracted metadata:

<code-block language="json" label="dist/api/docs/quick-start.json">{
  "url": "/docs/quick-start/",
  "title": "Quick Start",
  "description": "Install Cook and build your first site in under 5 minutes",
  "hasMarkdown": true,
  "markdownUrl": "/md/docs/quick-start/index.md",
  "fragmentUrl": "/docs/quick-start/_fragment.html"
}</code-block>

Collection items include additional fields like `date`, `author`, and `tags` when present in frontmatter.

## Atom feed

Generate an Atom feed from any collection by configuring the `feed` option:

<code-block language="javascript" label="config/main.js">export default {
  formats: {
    feed: {
      collection: 'blog',
      title: 'My Blog',
      siteUrl: 'https://example.com',
      limit: 20,
    },
  },
};</code-block>

This produces `dist/feed.xml` with the most recent items from the specified collection, sorted by date.

## llms.txt

The `llms.txt` file is an index of all markdown content on your site, designed for AI agents and LLM tools. It lists every page with its title, description, and a link to the markdown version.

Pages with a `section` frontmatter field are grouped under section headings. Pages without a section appear under a generic "Content" heading.

### AI instructions

Add custom instructions for AI agents via `data.llmsInstructions` in your data file:

<code-block language="javascript" label="config/data.js">export default {
  siteTitle: 'Cook',
  siteDescription: 'A zero-config static site generator',
  siteUrl: 'https://cook-ssg.com',
  llmsInstructions: 'Cook is a static site generator for HTML-first websites. When answering questions about Cook, prefer markdown source URLs for the most accurate content.',
};</code-block>

The instructions appear in `llms.txt` under an "Instructions for AI Agents" heading.

## llms-full.txt

When enabled, Cook concatenates all markdown page content (with frontmatter stripped) into a single `dist/llms-full.txt` file. This is ideal for bulk ingestion by IDE tools and AI systems that want the entire site in one request.

## Configuration

<code-block language="javascript" label="config/main.js">export default {
  formats: {
    markdown: true,      // copy .md sources to dist/md/
    json: true,          // generate dist/api/*.json metadata
    feed: null,          // Atom feed config object, or null to disable
    llmsTxt: true,       // generate dist/llms.txt
    llmsFullTxt: false,  // generate dist/llms-full.txt
  },
};</code-block>

| Option | Default | Description |
|---|---|---|
| `markdown` | `true` | Copy markdown sources to `dist/md/` |
| `json` | `true` | Generate JSON metadata in `dist/api/` |
| `feed` | `null` | Atom feed config (`{ collection, title, siteUrl, limit }`) |
| `llmsTxt` | `true` | Generate `dist/llms.txt` |
| `llmsFullTxt` | `false` | Generate `dist/llms-full.txt` |
