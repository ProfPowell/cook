# Cook + Vanilla Breeze Ecosystem: Platform-Native Web Development

A design for composing Cook, Vanilla Breeze, html-star, and Vanilla Press into a coherent web platform — using what the browser already gives us.

## The Pieces

| Project | Role | Web Platform Primitive |
|---------|------|----------------------|
| **Cook** | Build orchestration (SSG) | ES6 template literals, HTML `<template>`, file-based routing |
| **Vanilla Breeze** | Component system + styling | Custom elements, CSS `@layer`, design tokens |
| **html-star** | Client-side interactivity | `data-*` attribute cascade, View Transitions API, fetch + swap |
| **Vanilla Press** | Content authoring + storage | Block AST, content negotiation, SQLite/D1 |

**Guiding principle:** If the browser can do it natively, use that. If a web standard is emerging, adopt it early. Never invent an abstraction when a platform primitive exists.

---

## Content Lifecycle

```
                        BUILD TIME              EDGE TIME               CLIENT TIME
                        ─────────              ─────────               ───────────
Author writes       ──→ Cook assembles     ──→ Worker serves       ──→ html-star navigates
  (VP editor or          pages from              with content            via fragments,
   markdown files)       includes +              negotiation             View Transitions
                         components +
                         data + layouts
                                            ──→ Worker renders     ──→ VB components
Content stored      ──→ Cook generates          dynamic pages           enhance with JS
  (SQLite/D1 or         multi-format            from D1 (SSR)           (auto-detected
   .md on disk)          output                                          per page)
                         (HTML, fragments,
                          MD, JSON, RSS)
```

---

## Rendering Tiers

The system operates at three tiers. Each tier generates the same output format (HTML with VB components). The difference is *when* rendering happens.

### Tier 1: Build Time (Cook SSG)

The default. Most pages are pre-rendered at build time.

- Cook reads content from markdown files or vanilla-press SQLite
- Assembles pages: includes → components → repeat → template strings
- Generates multi-format output per page
- Output is pure static files — deploy anywhere

**When to use:** Content that changes infrequently (blog posts, product pages, about pages, docs).

### Tier 2: Edge Time (Cloudflare Worker + D1)

Dynamic pages rendered on demand at the CDN edge.

- Worker receives request, reads content from D1
- Renders HTML using vanilla-press renderers (same block AST → HTML pipeline)
- Returns full page or fragment based on request headers
- Can cache rendered output with TTL or stale-while-revalidate

**When to use:** Search results, filtered collections, paginated lists, user-specific content, preview mode for unpublished drafts.

**Implementation:**
```js
// worker/index.js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isFragment = request.headers.get('X-Requested-With') === 'htmlstar';
    const accept = request.headers.get('Accept') || 'text/html';

    // Try static file first (Tier 1 output)
    const staticResponse = await env.ASSETS.fetch(request);
    if (staticResponse.ok) return staticResponse;

    // Fall back to dynamic rendering (Tier 2)
    const doc = await getDocument(env.DB, url.pathname);
    if (!doc) return new Response('Not Found', { status: 404 });

    const scope = isFragment ? 'content' : 'page';
    const format = negotiateFormat(accept);

    const html = render(doc, { scope, format });
    return new Response(html, {
      headers: {
        'Content-Type': contentTypeFor(format),
        'Vary': 'Accept, X-Requested-With',
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      }
    });
  }
};
```

### Tier 3: Dev Time (Local Server)

Cook's dev server enhanced with on-demand rendering for development.

- BrowserSync serves static dist files (current behavior)
- Middleware intercepts fragment requests for html-star
- Optional: on-demand rendering from local SQLite for vanilla-press content (skipping full rebuild)
- Live reload on file changes (current behavior)

**Implementation in** `scripts/dev.js`:
```js
// Fragment routing middleware
server.middleware.use((req, res, next) => {
  if (req.headers['x-requested-with'] === 'htmlstar') {
    const fragmentPath = req.url.replace(/\/?$/, '/_fragment.html');
    req.url = fragmentPath;
  }
  next();
});
```

---

## Rendering Scopes

Every piece of content can be rendered at five scopes. The scope is a parameter, not a separate template. This eliminates the "htmx duplicate template" problem.

```
┌─ page ──────────────────────────────────┐
│  <!doctype html>                        │
│  <head>...</head>                       │
│  <body>                                 │
│    <header class="site">...</header>    │
│    <main>                               │
│    ┌─ content ─────────────────────┐    │
│    │  <article>                    │    │
│    │    <h1>Title</h1>             │    │
│    │    <p>Content...</p>          │    │
│    │    <layout-card>...</layout-card>  │
│    │  </article>                   │    │
│    └───────────────────────────────┘    │
│    </main>                              │
│    <footer class="site">...</footer>    │
│  </body>                                │
└─────────────────────────────────────────┘
```

| Scope | Returns | Generated As | Use Case |
|-------|---------|-------------|----------|
| `page` | Full HTML document | `index.html` | Initial browser load, SSG output |
| `content` | `<main>` body only | `_fragment.html` | html-star page swap |
| `collection` | List of article cards | `_collection.html` | html-star list swap, filtered results |
| `markdown` | Original/regenerated markdown | `md/*/index.md` | LLM agents, content export |
| `json` | Page metadata | `api/*.json` | Programmatic access, search index |

**Content negotiation at the edge:**
```
GET /blog/my-post/
  Accept: text/html                         → index.html (page scope)
  Accept: text/html + X-Requested-With      → _fragment.html (content scope)
  Accept: text/markdown                     → md/blog/my-post/index.md
  Accept: application/json                  → api/blog/my-post.json
```

---

## Islands Architecture: Custom Elements ARE Islands

The web platform already has islands. A custom element is a self-contained interactive region embedded in static HTML. No framework, no hydration ceremony, no virtual DOM diffing.

```html
<!-- This IS an island. The static HTML around it is the "sea." -->
<layout-center>
  <p>Static content, no JS needed.</p>

  <tab-set>                              <!-- ← Island: interactive component -->
    <details name="tabs">
      <summary>Description</summary>
      <p>Tab content rendered at build time...</p>
    </details>
    <details name="tabs">
      <summary>Specs</summary>
      <p>More content...</p>
    </details>
  </tab-set>                             <!-- ← Works without JS (native <details>) -->
                                         <!--   JS enhances with transitions -->
  <p>More static content.</p>
</layout-center>
```

### Progressive Enhancement Tiers

VB components operate at three tiers of enhancement:

1. **CSS-only** (layout-center, layout-grid, layout-card) — No JS needed. Custom element names are just CSS selectors. Cook outputs them as-is.
2. **PE-enhanced** (tab-set, accordion-wc) — Work without JS using native HTML (`<details>`). JS adds transitions, keyboard nav, ARIA management.
3. **JS-required** (combo-box, data-table, command-palette) — Need JS for core functionality. Degrade to simpler native fallbacks.

### Auto-Detection: Cook Generates Minimal Script Tags

Cook scans each built page for custom element tag names, cross-references against VB's component registry, and generates only the necessary `<script>` tags.

**New plugin:** `scripts/plugins/auto-components.js`

```
1. Parse built HTML for all custom element tags (contains a hyphen)
2. Look up each tag in VB's component manifest (JSON mapping tag → JS file)
3. Separate into:
   - CSS-only elements (no JS needed) → skip
   - Web components (need JS) → add to import list
4. Generate import map or individual <script type="module"> tags
5. Inject into <head> before </head>
```

**Output for a page using layout-grid (CSS-only), tab-set (JS), and tool-tip (JS):**

```html
<head>
  <!-- ... existing head content ... -->
  <link rel="stylesheet" href="/assets/vendor/vanilla-breeze/vanilla-breeze.css">
  <script type="importmap">
  {
    "imports": {
      "vb/tab-set": "/assets/vendor/vanilla-breeze/components/tab-set.js",
      "vb/tool-tip": "/assets/vendor/vanilla-breeze/components/tool-tip.js"
    }
  }
  </script>
  <script type="module">
    import "vb/tab-set";
    import "vb/tool-tip";
  </script>
</head>
```

**Benefits:**
- Pages that only use layout components load zero JS from VB
- No manual script management for authors
- Tree-shaking at the page level, not the bundle level
- Import maps are a web standard — no bundler needed in dev

**Config:**
```js
// config/main.js
components: {
  autoDetect: true,
  manifest: 'assets/vendor/vanilla-breeze/manifest.json',
  // CSS-only elements that never need JS
  cssOnly: ['layout-center', 'layout-grid', 'layout-card', 'layout-cover',
            'layout-stack', 'layout-cluster', 'layout-sidebar'],
}
```

---

## Declarative Shadow DOM: Server-Rendering Web Components

VB has two kinds of components with very different SSR stories:

**Light DOM custom elements** (layout-center, layout-grid, brand-mark) — No Shadow DOM at all. They're styled by CSS selectors targeting the tag name. Cook outputs them as-is. Nothing to pre-render. Already SSR-complete.

**Shadow DOM web components** (icon-wc, audio-player, geo-map) — Currently create their shadow root at runtime via `attachShadow({ mode: 'open' })` and populate it with `innerHTML`. This means:
- Flash of unstyled content (FOUC) until JS loads and runs
- Content invisible to search engines (shadow DOM created by JS)
- No interactivity until JS executes

### The Platform Solution: `<template shadowrootmode="open">`

Declarative Shadow DOM (DSD) lets you server-render shadow DOM content in static HTML:

```html
<!-- Before (runtime Shadow DOM — requires JS) -->
<icon-wc name="check" set="lucide"></icon-wc>

<!-- After (Declarative Shadow DOM — works without JS) -->
<icon-wc name="check" set="lucide">
  <template shadowrootmode="open">
    <style>
      :host { display: inline-flex; width: 1em; height: 1em; }
      svg { width: 100%; height: 100%; }
    </style>
    <svg viewBox="0 0 24 24">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  </template>
</icon-wc>
```

The browser parses the `<template shadowrootmode="open">` and attaches a shadow root immediately — no JS needed. When JS loads, the component can adopt the existing shadow root instead of creating a new one.

### How VB Components Currently Work

From exploring the source:

| Component | Shadow DOM Content | Light DOM Fallback |
|-----------|-------------------|-------------------|
| `icon-wc` | `<style>` + dynamically fetched `<svg>` | Attributes only (invisible without JS) |
| `audio-player` | Full playback UI (buttons, sliders, timeline) | Native `<audio>` element via `<slot>` |
| `tab-set` | **None** — uses Light DOM `<details>/<summary>` | Already works without JS |
| `tool-tip` | **None** — uses Popover API in Light DOM | Already works without JS |
| `accordion-wc` | **None** — uses Light DOM `<details>/<summary>` | Already works without JS |

**Key insight:** Most of VB's interactive components (tab-set, accordion, tool-tip) already use Light DOM and progressive enhancement. They **don't need DSD** because they already work without JS. Only a few components (icon-wc, audio-player, geo-map) actually use Shadow DOM.

### Cook's Role: Build-Time DSD Pre-Rendering

A Cook plugin could pre-render DSD for Shadow DOM components at build time:

**New plugin:** `scripts/plugins/declarative-shadow-dom.js`

```
1. After all other processing, scan built HTML for Shadow DOM components
2. For each component found:
   a. Look up its shadow DOM template from a registry
   b. Resolve dynamic content (e.g., fetch SVG for icon-wc)
   c. Inject <template shadowrootmode="open"> with pre-rendered content
3. The component's JS then "adopts" the existing shadow root on load
```

**What VB components need to change:**

```js
// Current pattern in icon-wc:
constructor() {
  super();
  this.attachShadow({ mode: 'open' });
}

// DSD-aware pattern:
constructor() {
  super();
  // Adopt existing DSD shadow root, or create one
  if (!this.shadowRoot) {
    this.attachShadow({ mode: 'open' });
  }
  // Either way, this.shadowRoot now exists
}
```

This is a one-line change per component. The component checks if a shadow root already exists (from DSD) before creating one.

### Phasing

DSD support is **not a prerequisite** for any other phase. It's an optimization that can be added later:

1. **Phase A (VB side):** Add `if (!this.shadowRoot)` guard to Shadow DOM components
2. **Phase B (shared):** Create a DSD template registry (JSON mapping tag → shadow DOM HTML)
3. **Phase C (Cook side):** Build plugin injects DSD templates into output HTML

This aligns with the platform trajectory — DSD is supported in Chrome 111+, Safari 16.4+, Firefox 123+. It's ready for production use.

---

## Vanilla Press Editor: Authoring Workflow

The VP editor is a working ProseMirror-based web application that creates and edits content stored as a typed block AST. Here's how it connects to the ecosystem.

### Current Editor Architecture

```
Browser                              Server
──────                               ──────
ProseMirror editor                   Node.js HTTP server
  ↕ ast.js (PM ↔ block AST)           ↕ api.js (CRUD endpoints)
  ↕ api-client.js (fetch)             ↕ content.js (SQLite store)
  ↕ NodeViews (render VB components)   ↕ publish.js (static build)
  ↕ 500ms auto-save
```

**What the editor does today:**
- Full prose editing (paragraphs, headings, lists, blockquotes, tables)
- 7 component block types with custom NodeViews (callout, code-block, collapsible, card, tabs, steps, figure)
- Block palette via `/` slash command (grouped by category)
- Document browser with search, collection filtering, draft/published status
- Auto-save every 500ms via `PUT /api/documents/:id`
- Publish button: sets `status: "published"`, triggers `POST /api/publish` which runs the static build
- Media upload via `POST /api/media`
- WYSIWYG: NodeViews render actual VB custom elements styled by VB CSS

### The Schema Is the Single Source of Truth

`content-schema.js` defines every block type once. Everything else derives from it:

```
content-schema.js
    ├── editor/schema.js     (ProseMirror schema — what the editor can produce)
    ├── renderers/html.js    (HTML output — what the site shows)
    ├── renderers/markdown.js (Markdown output — what agents read)
    └── store/content.js     (validation — what the database accepts)
```

**Block types map directly to VB custom elements:**

| Block Type | HTML Output | VB Component |
|-----------|-------------|-------------|
| `callout` | `<ui-callout data-variant="warning">` | `ui-callout` |
| `collapsible` | `<details><summary>...</summary>` | Native HTML (PE) |
| `card` | `<content-card href="...">` | `content-card` |
| `tabs` | `<ui-tabs>` | `ui-tabs` |
| `code_block` | `<code-block data-language="js">` | `code-block` |

### How the Editor Connects to Cook

Two integration paths, depending on the authoring model:

**Path A: VP editor → SQLite → Cook builds (recommended for content-heavy sites)**

```
Author uses VP editor → content saved to SQLite
                              ↓
Cook's config/data.js reads from SQLite at build time
                              ↓
Cook assembles pages with includes + components + VP content
                              ↓
Static output deployed
```

The editor's "Publish" button currently triggers VP's own `publish.js`. For Cook integration, it would instead trigger `npm run build` (Cook's build), or simply mark content as published — Cook reads it on next build.

**Path B: Markdown files → Cook builds (recommended for developer-authored sites)**

```
Author writes .md files in src/blog/
                              ↓
Cook's process-markdown.js converts to HTML + builds collections
                              ↓
Cook assembles pages as today
```

Both paths produce the same output structure. The editor is optional.

### Draft Preview Without Publishing

The VP editor currently requires publishing to preview. With Cook integration, a better workflow:

1. Author edits in VP editor → content auto-saves as draft (`status: "draft"`)
2. Cook's dev server detects draft changes → rebuilds just that page
3. Author sees live preview at `localhost:3000/blog/my-draft/`
4. Author clicks "Publish" → `status: "published"`, production build triggered

**Implementation:** Cook's `dev.js` watches the SQLite database file for changes (via `fs.watch` on the `.db` file) and triggers selective rebuild. The `data.js` async function reads both published and draft content in dev mode, published-only in production:

```js
// config/data.js
export default async function() {
  const db = new Database('./content.db');
  const isDev = process.env.NODE_ENV !== 'production';
  const statusFilter = isDev ? "('draft', 'published')" : "('published')";

  const posts = db.prepare(`
    SELECT * FROM documents
    WHERE json_extract(meta, '$.status') IN ${statusFilter}
  `).all();

  return { collections: { posts } };
}
```

### Editor Deployment Options

The VP editor is a standalone web app that can run:

1. **Locally:** `npm run editor` starts the Node server + SQLite on localhost
2. **On Cloudflare:** Editor served from Pages, API from Worker, storage in D1
3. **Headless:** No editor UI — content managed via API or markdown files

The editor doesn't need to be co-deployed with the site. It can run on a different domain/port, writing to the same database that Cook reads at build time.

---

## Database Integration: SQLite Everywhere

SQLite is the platform database. It's in every runtime that matters:

| Runtime | SQLite Access |
|---------|--------------|
| Cloudflare Workers | D1 (SQLite at the edge) |
| Node.js | better-sqlite3 |
| Bun | Built-in `bun:sqlite` |
| Browser | OPFS + SQLite WASM (origin-private) |
| Turso | Distributed libSQL (SQLite fork) |

### How Databases Connect to Cook

Cook itself does NOT embed database logic. Instead, `config/data.js` is the integration point — it's just a JavaScript module that can import anything.

**Pattern 1: Build-time data from SQLite (vanilla-press bridge)**
```js
// config/data.js
import Database from 'better-sqlite3';

export default async function() {
  const db = new Database('./content.db');
  const posts = db.prepare(`
    SELECT id, json_extract(meta, '$.title') as title,
           json_extract(meta, '$.slug') as slug,
           json_extract(meta, '$.published') as date,
           json_extract(meta, '$.description') as description,
           content_html
    FROM documents
    WHERE json_extract(meta, '$.status') = 'published'
    ORDER BY json_extract(meta, '$.published') DESC
  `).all();

  return {
    collections: { posts },
    siteTitle: 'My Site',
  };
}
```

**Pattern 2: Build-time data from REST API**
```js
// config/data.js
export default async function() {
  const products = await fetch('https://api.example.com/products').then(r => r.json());
  return { products };
}
```

**Pattern 3: Edge-time data from D1 (in Worker)**
```js
// worker/index.js — dynamic page rendering
const doc = await env.DB.prepare(
  'SELECT * FROM documents WHERE slug = ?'
).bind(slug).first();

const html = renderPage(doc); // vanilla-press renderer
return new Response(html);
```

**Key insight:** Cook's `data.js` async function pattern (from ROADMAP item #10) is the universal adapter. It doesn't matter if data comes from SQLite, a REST API, a GraphQL endpoint, or a CSV file. Cook just needs the data object. The database integration lives in user-land, not in Cook's core.

**Prerequisite:** Cook's `build.js` needs to support async function exports from `data.js`. Currently it does `data = dataModule.default || dataModule` — it needs to check if the export is a function and await it.

---

## Implementation Phases

### Phase 0: Fix Plugin Ordering in Cook

**Why:** `replaceTemplateStrings` runs BEFORE `replaceInclude` and `replaceComponents`. This means `${var}` inside includes/component templates never resolves — the biggest friction point for authoring.

**Change in** `scripts/build.js` (lines 109-122):
```
Current order:  templateStrings → repeat → includes → components
New order:      includes → components → repeat → templateStrings
```

**Why this order works:**
- Includes insert raw HTML from disk — they don't need any prior processing
- Components expand templates with attribute values (their own `${var}` replacement)
- Repeat generates DOM from data — needs component expansion done first
- Template strings run last, resolving `${var}` across the fully assembled page

**Files:** `scripts/build.js`

**Verify:** Build the alpenglow test site. `${siteTitle}` in `includes/header.html` should resolve to "Alpenglow Gear".

---

### Phase 1: Fragment Generation

**Why:** html-star needs content-only fragments for SPA navigation. Cook currently outputs only full pages.

**New plugin:** `scripts/plugins/generate-fragments.js`
- Runs in the `after` phase
- For each HTML page in dist, parse with JSDOM, extract `<main>` innerHTML
- Write `_fragment.html` alongside `index.html`

**Config:**
```js
fragments: { selector: 'main', enabled: true }
```

**Files:** New `scripts/plugins/generate-fragments.js`, modify `scripts/build.js`, modify `scripts/utils/config/config.js`

**Verify:** Every `dist/*/index.html` has a sibling `_fragment.html` with only `<main>` content.

---

### Phase 2: Exclude Build-Only Directories from Dist

**Why:** `includes/`, `components/`, `layouts/` are build-time resources. They get copied to dist and served as stale pages.

**Approach:** Modify `copy-src.js` to skip configured directories. Update `replace-include.js` and `replace-components.js` to read from `src/` instead of `dist/`.

**Config:**
```js
buildOnlyPaths: ['components', 'includes', 'layouts']
```

**Files:** `scripts/plugins/copy-src.js`, `scripts/plugins/replace-include.js`, `scripts/plugins/replace-components.js`, `scripts/utils/config/config.js`

**Verify:** `dist/` no longer contains `includes/`, `components/`, or `layouts/` directories.

---

### Phase 3: Multi-Format Output

**Why:** Same content, multiple formats. Enables content negotiation and LLM/API access.

**New plugin:** `scripts/plugins/generate-formats.js`
- For markdown-sourced pages: copy `.md` source to `dist/md/{path}/index.md`
- For all pages: write metadata JSON to `dist/api/{path}.json`
- Generate `dist/feed.xml` (Atom) from configurable collection
- Generate `dist/llms.txt` listing all content with markdown URLs

**Config:**
```js
formats: {
  markdown: true,
  json: true,
  feed: { title: 'Alpenglow Gear Blog', collection: 'blog', limit: 20 },
  llmsTxt: true,
}
```

**Files:** New `scripts/plugins/generate-formats.js`, modify `scripts/build.js`

**Verify:** `dist/md/`, `dist/api/`, `dist/feed.xml`, and `dist/llms.txt` exist with correct content.

---

### Phase 4: Auto-Detect Component Islands

**Why:** Pages should load only the JS they need. Layout components (CSS-only) shouldn't pull in any JS.

**New plugin:** `scripts/plugins/auto-components.js`
- Scan built HTML for custom element tags
- Cross-reference against VB component manifest
- Generate import map + module scripts for JS-requiring components
- Inject into `<head>`

**Config:**
```js
components: {
  autoDetect: true,
  manifest: 'assets/vendor/vanilla-breeze/manifest.json',
  cssOnly: ['layout-center', 'layout-grid', 'layout-card', ...],
}
```

**Prerequisite:** VB's CDN build already generates per-component JS files and a manifest. Verify the manifest format includes tag name → file path mapping.

**Files:** New `scripts/plugins/auto-components.js`, modify `scripts/build.js`

**Verify:** A page using only `layout-grid` has no VB JS. A page using `tab-set` has only `tab-set.js` loaded.

---

### Phase 5: Async Data Sources

**Why:** Enables the vanilla-press bridge and any external data source.

**Change in** `scripts/build.js` (lines 54-60):
```js
// Before
const dataModule = await import(pathToFileURL(userDataPath));
data = dataModule.default || dataModule;

// After
const dataModule = await import(pathToFileURL(userDataPath));
const exported = dataModule.default || dataModule;
data = typeof exported === 'function' ? await exported() : exported;
```

**Files:** `scripts/build.js`

**Verify:** A `data.js` that exports an async function works. Data from SQLite appears in templates.

---

### Phase 6: Cloudflare Worker for Content Negotiation

**Why:** Same URL serves different formats based on Accept headers. Enables html-star fragment routing at the edge.

**New directory:** `worker/`
- `worker/index.js` — Routes requests to static files based on headers
- `worker/wrangler.toml` — Cloudflare config

**Routing logic:**
```
Request → try static file from Pages
        → if html-star header: rewrite to _fragment.html
        → if Accept: text/markdown: rewrite to md/ path
        → if Accept: application/json: rewrite to api/ path
        → if not found and D1 configured: render dynamically (Tier 2 SSR)
        → 404
```

**Files:** New `worker/index.js`, new `worker/wrangler.toml`

**Verify:** `curl -H "Accept: text/markdown" localhost:8788/blog/my-post/` returns markdown.

---

### Phase 7: Dev Server Enhancements

**Why:** Fragment routing and content negotiation should work during local development.

**Changes in** `scripts/dev.js`:
- Add BrowserSync middleware for fragment routing
- Add middleware for markdown/JSON format serving
- Optional: on-demand rendering from local SQLite (if configured)
- Optional: watch SQLite `.db` file for VP editor changes, trigger selective rebuild

**Files:** `scripts/dev.js`

**Verify:** html-star navigation works with `npm run dev`.

---

### Phase 8: Declarative Shadow DOM Pre-Rendering

**Why:** Eliminate FOUC for Shadow DOM components. Make shadow DOM content visible to search engines. Reduce time-to-interactive.

**Prerequisites:** VB components need a one-line guard: `if (!this.shadowRoot) this.attachShadow({ mode: 'open' })` (Phase A on VB side).

**New plugin:** `scripts/plugins/declarative-shadow-dom.js`
- Runs late in the file loop (after all other HTML processing)
- Scans for Shadow DOM component tags
- Looks up pre-rendered shadow DOM HTML from a registry/manifest
- Injects `<template shadowrootmode="open">` with content

**Config:**
```js
dsd: {
  enabled: false, // opt-in
  manifest: 'assets/vendor/vanilla-breeze/dsd-manifest.json',
}
```

**Files:** New `scripts/plugins/declarative-shadow-dom.js`, VB needs a DSD manifest (tag → shadow DOM HTML), modify `scripts/build.js`

**Verify:** `icon-wc` in output HTML contains `<template shadowrootmode="open">` with pre-rendered SVG. Page renders icons before JS loads.

---

## What Stays Out of Cook

Per Cook's ROADMAP "Anti-Features" and the platform-first philosophy:

- **No runtime JS framework** — VB components + html-star handle interactivity
- **No database driver in Cook core** — the data bridge is a `data.js` pattern, not a Cook dependency
- **No editor** — vanilla-press provides the editor
- **No virtual DOM, no hydration** — custom elements progressively enhance natively
- **No state management** — DOM is the state
- **No GraphQL** — fetch at build time or use REST
- **No proprietary template syntax** — ES6 template strings are the syntax

---

## How the Pieces Stay Independent

Each project can be used alone:

- **Cook alone:** Static site from HTML + markdown. No VB, no html-star, no VP.
- **VB alone:** Drop CSS + JS into any HTML page. No build tool needed.
- **html-star alone:** Add `<script>` to any multi-page site. No SSG needed.
- **VP alone:** Full CMS with its own publisher. No Cook needed.

They compose via conventions, not coupling:
- Cook outputs clean HTML with custom elements → VB styles them
- Cook generates `_fragment.html` → html-star navigates with them
- Cook reads from `data.js` → VP provides data through it
- Worker routes by Accept headers → all formats served from one URL

---

## End-to-End Verification

After all phases:

1. Author writes a blog post in markdown with front matter
2. `npm run build` generates: `index.html`, `_fragment.html`, `md/index.md`, `api/post.json`
3. Homepage lists the post via `data-repeat="collections.blog as post"`
4. Clicking a blog link (with html-star): fragment fetched, `<main>` swapped, View Transition plays
5. Only JS-requiring VB components are loaded (auto-detected)
6. `curl -H "Accept: text/markdown"` returns markdown version
7. `curl -H "Accept: application/json"` returns JSON metadata
8. VB layout components (CSS-only) work with zero JS
9. VB interactive components (tab-set, etc.) progressively enhance
10. The output HTML is what you'd write by hand — just automated
