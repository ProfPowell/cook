# Cook SSG Roadmap

A vision for a web-platform-focused static site generator that embraces vanilla HTML, CSS, and JavaScript over framework abstractions.

## Philosophy

**Core Principles:**
- Output should be what you'd write by hand, just automated
- Leverage native browser capabilities (CSS cascade, semantic HTML, progressive enhancement)
- No client-side JavaScript required by default
- Build-time only - zero runtime overhead
- Enhance the platform, don't replace it

---

## Near-Term Enhancements

### 1. Markdown to HTML Pipeline

**Why:** Markdown is universal for content. Most SSGs support it, but often with heavy abstractions.

**Approach:**
- Simple markdown-it or marked integration
- Front matter for metadata (`title`, `date`, `template`)
- Auto-generate from `/src/content/*.md` to `/dist/`
- Use existing component system for layouts

```
/src/content/blog/my-post.md → /dist/blog/my-post/index.html
```

**Front matter maps to template strings:**
```markdown
---
title: My Post
template: blog-post
date: 2024-01-15
---

Content here with ${title} available in template.
```

---

### 2. Collections & Data-Driven Pages

**Why:** Generate index pages, tag pages, archives from content automatically.

**Approach:**
- Scan markdown files to build collections
- Expose `${collections.blog}` in templates
- Generate pages from data arrays

```html
<!-- /src/blog/index.html -->
<ul>
  ${collections.blog.map(post => `
    <li><a href="${post.url}">${post.title}</a></li>
  `).join('')}
</ul>
```

**Or with a repeater pattern:**
```html
<article data-repeat="collections.blog as post">
  <h2>${post.title}</h2>
  <time>${post.date}</time>
</article>
```

---

### 3. Layout Inheritance (Wrapper Templates)

**Why:** Components handle fragments; layouts handle full page structure.

**Current:** Components replace elements with fragments.

**Proposed:** Add `data-layout` for page wrapping:

```html
<!-- /src/about.html -->
<main data-layout="default">
  <h1>About Us</h1>
  <p>Content here.</p>
</main>
```

```html
<!-- /src/layouts/default.html -->
<!DOCTYPE html>
<html>
<head><title>${title}</title></head>
<body>
  <site-header></site-header>
  ${slot}
  <site-footer></site-footer>
</body>
</html>
```

---

### 4. Named Slots for Components

**Why:** Complex components need multiple content areas.

**Current:** Single `${slot}` for innerHTML.

**Proposed:**
```html
<app-card>
  <span slot="title">Card Title</span>
  <span slot="footer">Card Footer</span>
  Main content here.
</app-card>
```

```html
<!-- /src/components/app-card.html -->
<article class="card">
  <header>${slot:title}</header>
  <div class="content">${slot}</div>
  <footer>${slot:footer}</footer>
</article>
```

---

### 5. CSS Scoping (Build-Time)

**Why:** Component styles shouldn't leak. Native CSS scoping is coming but not universal.

**Approach:**
- Auto-prefix component CSS with unique scope
- Use `@scope` when supported, fallback to class prefixing
- Keep output as vanilla CSS

```html
<!-- /src/components/site-header.html -->
<style scoped>
  header { background: navy; }
  nav a { color: white; }
</style>
<header>
  <nav><a href="/">Home</a></nav>
</header>
```

**Output:**
```html
<style>
  .site-header-x7k header { background: navy; }
  .site-header-x7k nav a { color: white; }
</style>
<header class="site-header-x7k">
  <nav><a href="/">Home</a></nav>
</header>
```

---

## Medium-Term Features

### 6. Image Optimization Pipeline

**Why:** Images are the largest page weight. Automate what you'd do manually.

**Features:**
- WebP/AVIF generation with fallbacks
- Responsive srcset generation
- Lazy loading attributes
- Blur-up placeholders (CSS, not JS)
- Keep originals in `/src`, optimized in `/dist`

**Usage:**
```html
<img src="/images/hero.jpg" data-optimize="responsive" alt="Hero">
```

**Output:**
```html
<img
  src="/images/hero-800.webp"
  srcset="/images/hero-400.webp 400w, /images/hero-800.webp 800w, /images/hero-1200.webp 1200w"
  sizes="(max-width: 800px) 100vw, 800px"
  loading="lazy"
  alt="Hero">
```

---

### 7. Critical CSS Extraction

**Why:** First paint blocked by external CSS. Extract critical styles inline.

**Approach:**
- Analyze rendered HTML for used selectors
- Inline critical CSS in `<head>`
- Async load full stylesheet
- No JavaScript required (use `<link rel="preload">` + `onload`)

```html
<head>
  <style>/* Critical CSS inlined */</style>
  <link rel="preload" href="/assets/css/main.css" as="style" onload="this.rel='stylesheet'">
  <noscript><link rel="stylesheet" href="/assets/css/main.css"></noscript>
</head>
```

---

### 8. RSS/Atom Feed Generation

**Why:** Essential for blogs and content sites. Similar pattern to sitemap.xml.

**Auto-generate from collections:**
```javascript
// config/main.js
export default {
  feed: {
    title: 'My Blog',
    description: 'Latest posts',
    collection: 'blog',
    limit: 20
  }
}
```

**Output:** `/dist/feed.xml` with proper Atom/RSS structure.

---

### 9. Asset Fingerprinting (Cache Busting)

**Why:** Long cache headers need content-based URLs.

**Transform:**
```html
<link rel="stylesheet" href="/assets/css/main.css">
```

**To:**
```html
<link rel="stylesheet" href="/assets/css/main.a3b9c2d1.css">
```

**Features:**
- Content-hash based filenames
- Auto-update references in HTML
- Source maps maintained
- Manifest file for server-side lookups

---

### 10. Static Data Fetching (Build-Time)

**Why:** Pull external data at build time, not runtime.

**Usage in config/data.js:**
```javascript
export default async function() {
  const products = await fetch('https://api.example.com/products').then(r => r.json());
  return {
    products,
    buildTime: new Date().toISOString()
  };
}
```

**Available in templates:**
```html
<ul>
  ${data.products.map(p => `<li>${p.name}</li>`).join('')}
</ul>
```

---

## Long-Term Vision

### 11. View Transitions API Integration

**Why:** Native page transitions are here. No JS framework needed.

**Auto-inject transition meta:**
```html
<meta name="view-transition" content="same-origin">
```

**Add transition names to components:**
```html
<header style="view-transition-name: site-header">
```

**Degrades gracefully - older browsers just navigate normally.**

---

### 12. Speculation Rules for Prefetching

**Why:** Native browser prefetching, no JS library needed.

**Auto-generate speculation rules:**
```html
<script type="speculationrules">
{
  "prefetch": [
    { "where": { "href_matches": "/*" }, "eagerness": "moderate" }
  ]
}
</script>
```

**Configurable patterns for which links to prefetch.**

---

### 13. Islands Architecture (Optional JS)

**Why:** Some interactivity is needed. Keep it minimal and opt-in.

**Pattern:**
```html
<div data-island="counter" data-props='{"start": 0}'>
  <span>0</span>
  <button>+</button>
</div>
```

**Paired with minimal vanilla JS:**
```javascript
// /src/islands/counter.js
export function init(el, props) {
  let count = props.start;
  const span = el.querySelector('span');
  el.querySelector('button').onclick = () => {
    span.textContent = ++count;
  };
}
```

**Build auto-bundles only used islands.**

---

### 14. Web Component Output Mode

**Why:** Generate actual custom elements for runtime use.

**Transform components to standards-based web components:**
```javascript
// Output: /dist/components/site-header.js
class SiteHeader extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `<header>...</header>`;
  }
}
customElements.define('site-header', SiteHeader);
```

**Optional - for sites wanting runtime component registration.**

---

### 15. Progressive Enhancement Utilities

**Why:** Build-time helpers for PE patterns.

**Auto `<noscript>` fallbacks:**
```html
<details data-pe="accordion">
  <summary>FAQ</summary>
  <p>Answer...</p>
</details>
```

**Generates:**
```html
<details data-pe="accordion">
  <summary>FAQ</summary>
  <p>Answer...</p>
</details>
<script type="module">
  // Optional enhancement loaded async
  import('/js/pe/accordion.js');
</script>
```

**Works without JS, enhanced with JS.**

---

## Anti-Features (Won't Implement)

Things intentionally excluded to stay focused:

- **React/Vue/Svelte integration** - Use those tools directly if needed
- **GraphQL layer** - Static fetch is simpler
- **Hot module replacement** - Full reload is fast enough for static
- **Server-side rendering** - This is an SSG, not SSR
- **Database integrations** - Fetch at build time or use APIs
- **User authentication** - Add externally if needed
- **Complex routing** - File-based routing only
- **State management** - DOM is the state

---

## Implementation Priority

| Phase | Features | Rationale |
|-------|----------|-----------|
| **1** | Markdown, Collections, Layouts | Content fundamentals |
| **2** | Named Slots, CSS Scoping | Component maturity |
| **3** | Image Optimization, Critical CSS | Performance wins |
| **4** | RSS, Fingerprinting, Static Fetch | Production polish |
| **5** | View Transitions, Speculation, Islands | Platform-forward |

---

## Guiding Questions

When considering new features, ask:

1. **Can the browser do this natively?** Use that instead.
2. **Does this require client-side JavaScript?** Avoid if possible.
3. **Would a developer write this by hand?** Generate that exact output.
4. **Does this add build complexity?** Keep it simple.
5. **Is this framework-specific thinking?** Stick to platform primitives.

---

## Contributing

Ideas welcome. Open an issue to discuss before implementing. Keep PRs focused on single features.

The goal: **Generate the HTML/CSS/JS you wish you had time to write by hand.**
