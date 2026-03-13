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

## Near-Term Enhancements

### 1. HTML Layout Inheritance

Extend layout support beyond markdown pages so regular HTML pages can opt into full-page wrappers through a page-level layout directive.

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
