---
title: Programs
description: Ship hand-written HTML and JavaScript folders untouched, with card data for list pages
section: Advanced
---

# Programs

A program is a folder of hand-written HTML, CSS and JavaScript (a demo, a tool, a small app) that Cook ships exactly as you wrote it. Cook copies `src/<area>/<slug>/` to `dist/<area>/<slug>/` and changes nothing inside it. Cook also reads an optional `config/programs.json` (the file Vanilla Press writes) and turns it into data your list pages can repeat over.

A site without `config/programs.json` has no programs, and nothing changes.

## Areas

An area is one top-level folder that holds programs, such as `demos` or `apps`. Each program is a subfolder of its area:

<code-block language="text" label="Project layout">src/
  demos.html            the area's list page (a normal page)
  demos/
    plasma/
      index.html        required: the program's entry point
      js/main.js
  apps/
    tool/index.html</code-block>

The list page `src/demos.html` (or `demos.md`) builds to `dist/demos/index.html` like any other page. It never collides with a program, because each program is a subfolder.

An area path is one lowercase segment (a-z, 0-9, hyphens). Cook ignores an area, with a `[programs]` warning, when:

- the name is reserved: `media`, `assets`, `layouts` or `includes`;
- it is a `buildOnlyPaths` entry;
- the site already uses the name for something else, such as a file or a folder that holds pages of its own (a blog).

## config/programs.json

<code-block language="json" label="config/programs.json">{
  "areas": [
    { "path": "demos", "title": "Demos", "sandbox": false }
  ],
  "programs": [
    {
      "area": "demos",
      "slug": "plasma",
      "title": "Plasma",
      "description": "Old-school plasma effect.",
      "date": "2026-11-09",
      "tags": ["Demo", "CSS"],
      "image": "/media/plasma.png",
      "listed": true
    }
  ]
}</code-block>

Card fields:

- `area` and `slug`: where the program lives. Both are required and must be lowercase slugs.
- `title`: shown on the card. Defaults to the slug.
- `description`, `date`, `tags`, `image`: for your list page to show.
- `listed`: `true` puts the card in the data below. A card that is not listed still ships and still gets its sandbox rule. It is just not on the list.
- `order`: a number that breaks ties between programs with the same date.
- `previewClass`: a CSS class name, for a site that draws its own previews.
- `sandbox`: `true` or `false`, overriding the area's `sandbox` default (see below).

Cook adds `url` (`/<area>/<slug>/`) to each card. A card whose folder has no `index.html` is left out of the data. Cook re-reads the file on every build, and `cook dev` rebuilds when it changes.

## programs and programAreas

Cook puts two values in the data store:

- `programs`: every listed program from every area, newest `date` first, then by `order`, then by title.
- `programAreas`: the same cards keyed by area path, so `programAreas.demos` holds the demos.

<code-block language="html" label="src/demos.html">&lt;main&gt;
  &lt;h1&gt;Demos&lt;/h1&gt;
  &lt;ul&gt;
    &lt;li data-repeat="programAreas.demos as program"&gt;
      &lt;a href="&#36;{program.url}"&gt;&#36;{program.title}&lt;/a&gt;
      &lt;p&gt;&#36;{program.description}&lt;/p&gt;
    &lt;/li&gt;
  &lt;/ul&gt;
&lt;/main&gt;</code-block>

See [Data repeat](/docs/data-repeat/) for the full syntax.

## Program folders are untouched

Inside a program folder, Cook does none of this:

- front matter, templates, includes or template strings;
- minifying, bundling or fingerprinting;
- image rewriting or responsive derivatives;
- clean-URL directories (`page two.html` stays `page two.html`);
- the `basePath` rewrite;
- the site theme;
- fragments, or adding it to the sitemap, feed or `llms.txt`;
- converting Markdown (a `README.md` is copied as is).

This is built in, not an `excludePaths` setting. Every build pass that copies or walks files checks "is this path inside a program folder". The check covers files from `src/<area>/<slug>/` down, in the areas Cook accepted.

In `cook dev`, saving a file inside a program copies that one file and rebuilds no page.

### basePath needs relative URLs

Because Cook does not rewrite anything inside a program, a site with `basePath: '/repo'` must use relative URLs in its programs (`js/main.js`, not `/demos/plasma/js/main.js`). A root-relative URL would point outside `/repo`.

## Sandbox and _headers

Programs are arbitrary JavaScript. Without a sandbox, a program runs at your site's origin and can read the site's `localStorage` and non-HttpOnly cookies, and script the site's own pages.

For each program whose effective `sandbox` is `true` (its own setting, else its area's), Cook writes a rule to `dist/_headers`:

<code-block language="text" label="dist/_headers">/demos/plasma/*
  Content-Security-Policy: sandbox allow-scripts allow-forms allow-popups allow-pointer-lock allow-modals</code-block>

The browser then runs that program in a unique origin: it cannot read the site's storage or cookies, and the site's pages cannot be scripted from it. The price is that the program's own `localStorage`, IndexedDB and cookies do not work.

- Listed and unlisted programs both get a rule.
- If the site has its own `src/_headers`, Cook keeps it and adds the program rules after it.
- Cook writes no `_headers` when no program is sandboxed.
- Cloudflare Pages and Netlify read `_headers`. A host that does not read it ignores the rules, and the program runs unsandboxed there.
- A `<meta>` tag cannot do this job: browsers do not accept `sandbox` in a meta `Content-Security-Policy`.
