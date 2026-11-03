---
title: Package Components
description: Load npm web-component packages on the pages that use them
section: Advanced
---

# Package Components

If your site depends on npm packages that ship web components, Cook can copy their built files into `dist` and add a module script only to the pages that use their tags. A package qualifies when it is listed under `dependencies` in your project's `package.json` and ships a `custom-elements.json` manifest.

## How it works

1. Cook reads the keys of `dependencies` in your project's `package.json`, minus the `exclude` list.
2. Each package is resolved at `node_modules/<name>`. Its manifest is the file named by `customElements` in its `package.json`, otherwise `custom-elements.json`.
3. The entry is `exports["."].import`, then `exports["."].default`, `exports["."]` when a string, then `module`, then `main`.
4. The entry's whole directory (for example `dist/`, so chunk files come along) is copied to `dist/assets/components/<name>/`.
5. Every `tagName` in the manifest maps to `/assets/components/<name>/<entry file>`.
6. On each page, one `&lt;script type="module"&gt;` is added to `&lt;head&gt;` per package whose tags appear. A package gets one script per page, however many of its tags are used, and nothing is added when the script is already on the page.

A dependency with no manifest, no `node_modules` folder or no entry is skipped with a log line. It never fails the build. `cook dev` gets the same behavior.

## Configuration

```js
export default {
  packageComponents: {
    enabled: true,
    exclude: ['vanilla-breeze', 'cook-ssg'],
    path: 'assets/components',
  },
};
```

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `true` | Turn the plugin off with `false` |
| `exclude` | `['vanilla-breeze', 'cook-ssg']` | Dependencies to ignore |
| `path` | `'assets/components'` | Folder in `dist` (and URL prefix) for copied packages |

## Difference from auto-components

[Auto-Components](/docs/auto-components/) handles Vanilla Breeze's own bundle: it strips it or replaces it with an import map. Package components handles third-party packages and leaves the VB bundle alone, which is why `vanilla-breeze` is excluded by default. The two can run together.
