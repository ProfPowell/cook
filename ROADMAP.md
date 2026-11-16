# Cook SSG Roadmap

Remaining roadmap for a web-platform-focused static site generator that prefers vanilla HTML, CSS, and JavaScript over framework abstractions.

Detailed implementation plans now live in Beads issues. This file is the high-level backlog only.

## Philosophy

Core principles:
- Output should be what you'd write by hand, just automated
- Leverage native browser capabilities instead of replacing them
- No client-side JavaScript required by default
- Build-time only, with zero runtime overhead unless explicitly enabled
- Enhance the platform, don't replace it

## Already Shipped

These roadmap items are already implemented and were removed from the remaining backlog:
- Markdown to HTML pipeline
- Collections and data-driven pages
- Feed generation from collections
- Build-time async data loading from `config/data.js`

## Release Notes

### 2.12.0 (unreleased)

- `<social-feed>`: each empty element is filled at build with recent Bluesky and Mastodon posts and GitHub releases from `config/social.json` (`accounts`, `tags`, `items`, `height`, `hide-counts`). Each account is fetched once per build (`cook dev` reuses results for 10 minutes); a successful fetch writes `data/social-feeds/<service>-<slug>.json`, which a failed or `COOK_OFFLINE=1` build uses instead. `GITHUB_TOKEN` is used for GitHub at build. Feeds never fail a build. `cook-ssg/social` also exports the feed helpers. Pages without `<social-feed>` build byte-identically. See the Social Feed docs.

### 2.11.1 (unreleased)

- SocialSpec: `contact.email` may be an array of addresses. `contact.vcf` gets one `EMAIL` line each, the first with `PREF=1`. A single string builds byte-identically.

### 2.11.0 (unreleased)

- SocialSpec: `about`, `contact` and `following` in `config/social.json` write `/.well-known/following.opml`, `about.md` and `contact.vcf`, with matching `_headers` blocks (exact Content-Type plus `Access-Control-Allow-Origin: *`). `social.aboutHtml` is added to template data. The Worker returns `/.well-known/*` untouched and adds CORS on the three paths. Sites without these keys build byte-identically. See the SocialSpec docs.

### 2.10.0 (unreleased)

- Social accounts: `config/social.json` (or `social` in `main.js`) feeds `social.accounts` / `social.allAccounts` template data and fills each empty `<social-links>` element with a list of profile links at build. The `cook-ssg/social` module parses and renders accounts. See the Social Links docs.

### 2.8.0 (unreleased)

- Layout inheritance: a layout whose `<html>` or `<body>` has `data-template` is built on a parent (depth 5, cycles are build errors), for HTML and Markdown pages. Slots are forwarded explicitly.
- `data-if` / `data-unless` conditional sections, at layout time, per `data-repeat` item and in a last pass over the page.
- Layout format 1: an info block (`<script type="application/json" data-layout-info>`, stripped from output), the `cook-ssg/layouts` module and `cook check-layouts`. See the Layout Format docs.
- Sites that use none of this build byte-identically.

### 2.6.0 (unreleased)

- `theme` plugin: one site theme from `config/main.js` (`theme`) or `config/theme.json`, written as `data-theme` / `data-mode` (and `data-theme-source="site"`) on `<html>` plus the theme stylesheet links. HTML pages can override it with `theme` and `themeScope` front matter. No setting, no change in output. See the Site Theme docs.

### 2.5.0 (2026-11-03)

- `packageComponents` plugin: npm dependencies that ship a `custom-elements.json` get their built files copied to `dist/assets/components/<name>/` and a module script added only to pages that use their tags. On by default; see the Package Components docs.
- Fingerprinting and package components honor `siteRoot`: web paths, the asset manifest and copied package files are relative to the served folder (e.g. `dist/pages`), so `/assets/...` references resolve and get rewritten.

## Near-Term Enhancements

### 1. HTML Layout Inheritance (shipped in 2.8.0)

Layouts can be built on other layouts with `data-template` on `<html>` or `<body>`, for HTML and Markdown pages. 2.8.0 also adds `data-if` / `data-unless` sections, the format-1 layout checker (`cook-ssg/layouts`, `cook check-layouts`) and info-block stripping. See the Layout Format docs.

### 2. Named Slots for Components

Add named slot support so component templates can target multiple content regions instead of relying only on a single default slot.

### 3. CSS Scoping at Build Time

Provide an author-friendly way to scope component styles during the build so styles do not leak across component boundaries.

## Medium-Term Features

### 4. Image Optimization Pipeline

Add opt-in image processing for responsive derivatives, modern formats, and rewritten `srcset` output while keeping source images in `src/`.

### 5. Critical CSS Extraction

Inline critical CSS for first paint and convert the remaining stylesheet load to a non-blocking pattern with a safe `noscript` fallback.

### 6. Asset Fingerprinting

Support content-hash-based asset filenames, automatic HTML reference rewriting, and a generated manifest for downstream lookups.

## Long-Term Vision

### 7. View Transitions API Integration

Add opt-in hooks for native view transitions while preserving normal navigation as the default fallback.

### 8. Speculation Rules for Prefetching

Generate configurable native speculation rules for safe prefetch targets without adding a client-side library.

### 9. Islands Architecture

Offer an optional, minimal hydration model that keeps static HTML as the baseline and bundles only the island modules used on a page.

### 10. Web Component Output Mode

Add an optional output mode that emits runtime custom-element modules from component templates without changing the default static mode.

### 11. Progressive Enhancement Utilities

Provide build helpers for no-JS-safe progressive enhancement patterns and optional async enhancement module injection.

## Implementation Priority

| Phase | Features | Rationale |
|-------|----------|-----------|
| 1 | Layout inheritance, named slots, CSS scoping | Finish core authoring model |
| 2 | Image optimization, critical CSS, fingerprinting | Performance and production polish |
| 3 | View transitions, speculation rules | Platform-native navigation wins |
| 4 | Islands, web component output, PE utilities | Optional advanced enhancement paths |

## Anti-Features

Things intentionally excluded to stay focused:

- React, Vue, or Svelte integration
- GraphQL layers
- Hot module replacement
- Server-side rendering
- Database integrations
- User authentication
- Complex routing beyond file-based conventions
- State management abstractions

## Guiding Questions

When considering new features, ask:

1. Can the browser do this natively?
2. Does this require client-side JavaScript?
3. Would a developer write this by hand?
4. Does this add build complexity?
5. Is this framework-specific thinking?

## Contributing

Ideas welcome. Open an issue to discuss before implementing. Keep PRs focused on a single capability.
