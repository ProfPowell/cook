# Codex Review

## Findings

### High

1. Markdown dates are shifted backwards for western timezones and emitted in the wrong format.
   - `scripts/plugins/process-markdown.js:203` converts front-matter dates with `new Date(frontMatter.date)`, so a date-only value like `2026-02-15` becomes a UTC midnight `Date`.
   - `scripts/plugins/repeat-collection.js:256-258` then renders that value with `toLocaleDateString()`, and `src/layouts/post.html:30` drops the same `Date` object straight into `<time datetime="${date}">${date}</time>`.
   - In the current build this already shows the Gear Care post as `2/14/2026` on listing pages and `Sat Feb 14 2026 16:00:00 GMT-0800...` on the article page, even though the source front matter says `2026-02-15`.
   - Recommendation: preserve date-only front matter as a canonical string, or normalize it to a timezone-safe representation before sorting/rendering; generate a separate ISO value for `datetime`.

2. The Cloudflare Worker never serves the custom 404 page.
   - `worker/index.js:48-57` fetches `/404/index.html`.
   - The build explicitly keeps the 404 page as a flat file, so the generated output is `dist/404.html`, not `dist/404/index.html`.
   - Result: a missing route falls through to the plain `Not Found` response instead of the branded 404 page.
   - Recommendation: fetch `/404.html`, or share the same path-normalization rules between the builder and Worker.

### Medium

3. Dynamic pages from `config/data.js` break when the module exports a function or async function.
   - `scripts/build.js` resolves function exports before using the data object, but `scripts/utils/get-src/get-src.js:20-25` imports `config/data.js` without invoking the export.
   - `scripts/utils/get-src/get-src.js:49-54` therefore only sees `dynamicPages` when the module exports a plain object.
   - That makes dynamic page generation inconsistent with the rest of the build pipeline and with the documented async-data pattern.
   - Recommendation: centralize config/data loading so every consumer gets the same resolved data object.

4. Root markdown content negotiation is inconsistent between generation and routing.
   - `scripts/plugins/generate-formats.js:140-141` writes markdown copies to `dist/md/${trimmedPath}/index.md`, which makes the site root land at `dist/md/index/index.md`.
   - `worker/index.js:120-122` and `scripts/dev.js:51-57` both look for the root markdown response at `/md/index.md`.
   - Result: markdown negotiation works for nested pages but will fail for `/` if the homepage is markdown-backed.
   - Recommendation: special-case the root path in one place and reuse that helper in both the generator and routers.

### Missing Feature

5. The site exposes product detail URLs that do not exist.
   - `config/data.js:16-43` defines `/products/trail-runner-pack/`, `/products/summit-shelter/`, and `/products/beacon-headlamp/`.
   - Those URLs are linked from `src/index.html:50-63`, `src/products.html:33-45`, and `src/includes/footer.html:7-10`.
   - The build output only contains `/products/`; there are no corresponding product detail pages under `src/products/` or `dist/products/`.
   - Result: first-party navigation leads users into 404s for core catalog items.
   - Recommendation: add generated/static product detail pages, or stop linking to detail URLs until those pages exist.

## Test Gaps

- There is no coverage for Worker routing, custom 404 handling, or content-negotiated root markdown paths.
- There is no assertion protecting against timezone drift in markdown dates or against invalid `<time datetime>` output.
- There is no link-check or site-integrity test to catch dangling internal URLs like the product detail links.

## Validation Performed

- `npm test`
- `NODE_ENV=production npm run build`
