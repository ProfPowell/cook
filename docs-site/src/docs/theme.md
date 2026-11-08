---
title: Site Theme
description: One theme setting for every page, with per-page overrides
section: Advanced
---

# Site Theme

Cook can give every page one Vanilla Breeze theme from a single setting. It writes `data-theme` (and, when needed, `data-mode`) on `<html>` and adds the stylesheet links the theme needs. Individual pages can pick their own theme in front matter.

With no `theme` setting, nothing changes: no attribute, no link.

## The setting

Set `theme` in `config/main.js`, or put the same object in `config/theme.json` (this is the file Vanilla Press writes). If both exist, `main.js` wins.

<code-block language="json" label="config/theme.json">{
  "name": "swiss",
  "mode": "auto",
  "adjust": "vp-site",
  "files": {
    "swiss": "/assets/vb/themes/swiss.css",
    "8bit": "/assets/vb/themes/8bit.css",
    "vp-site": "/assets/themes/vp-site.css",
    "retro-mine": "/assets/themes/retro-mine.css"
  },
  "modes": { "retro-mine": "light" }
}</code-block>

- `name`: the theme id (letters a-z, digits and hyphens). Required.
- `mode`: `auto` (the visitor's choice), `light` or `dark`. Forces `data-mode` on the page when `light` or `dark`.
- `adjust`: an optional second id for site adjustments. The page gets `data-theme="swiss vp-site"`.
- `files`: theme id to stylesheet URL. Every theme that needs a file must be listed. URLs start with `/` or `http(s)://`.
- `modes`: theme id to `light` or `dark`, for a theme that only has one color scheme. It beats the site `mode`.

Ids always start with the theme name, including `default`. Unsafe ids or URLs are ignored with a `[theme]` warning in the build output.

## Per-page themes

HTML pages with front matter can override the site theme:

<code-block language="yaml" label="src/retro.html">---
theme: 8bit
themeScope: page
---</code-block>

- `theme`: a theme id. Ignored with a warning if it is not a safe id.
- `themeScope`: `page` (default) puts the theme on `<html>`, replacing the site theme and its adjustments. `article` keeps the site theme on `<html>` and puts the page theme on the first `<article>`, else `<main>`; if neither exists, the page theme applies to the whole page and Cook warns.

## Stylesheet links

Each theme with an entry in `files` becomes `<link rel="stylesheet" href="..." data-vb-theme="id">`. Cook inserts it right after the last stylesheet whose `href` matches `vanilla-breeze*.css`, so theme rules load after Vanilla Breeze. If the page has no Vanilla Breeze stylesheet, the links are appended to `<head>`. A theme whose `data-vb-theme` or stylesheet `href` is already on the page is skipped. A page without a `<head>` gets one created. Theme URLs are rewritten with `basePath` and fingerprints like other root-relative links. Files without an `<html>` element (partials) are left alone.

## Limitations

- With `themeScope: article` and `mode: auto`, Cook writes `data-mode` on the article only when a scheme is forced (by `modes` or the site `mode`). Otherwise the article shows its theme's default scheme.
- Fragment navigation (`generateFragments`) swaps only `<main>`, so a page theme (page or article scope) applies only on a full page load: its stylesheet is not loaded when only `<main>` is swapped.
- Per-page themes apply to HTML pages with front matter. Markdown pages always get the site theme.

## Works with Vanilla Breeze

Cook also writes `data-theme-source="site"` on `<html>`. A Vanilla Breeze release that understands it lets the site theme win over a visitor's stored brand choice; without it, the attribute is harmless. This needs the Vanilla Breeze release that includes page themes.
