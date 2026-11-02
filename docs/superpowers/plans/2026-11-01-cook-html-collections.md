# Cook HTML Collections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HTML pages with YAML front matter join Cook collections the way
markdown pages do, opt-in via `collections: { html: true }`, so a site
written as HTML pages (Vanilla Press output) gets index lists and an Atom
feed.

**Architecture:**
- A new pre-loop plugin, `html-collections`, scans `srcPath` for `.html`
  files that start with front matter.
- It builds collection items with the same shape as markdown items and
  merges them into `store.collections` / `data.collections` before the file
  loop. `data-repeat`, the feed and the JSON formats then see them.
- Sorting and item shaping move into a small shared util used by both
  markdown and HTML collections.

**Tech Stack:** Node ESM, `gray-matter` (already a dependency), `node:test`.

**Spec:** `~/src/vanilla-press/docs/superpowers/specs/2026-11-01-vp-drives-cook-blog-design.md`
(section "Cook: collections from HTML pages")

## Global Constraints

- **Opt-in:** the default config is `collections: { html: false }`. With it
  off, build output is byte-identical to today.
- **Grouping:** the collection is the **first folder under the served
  root**:
  - the served root is `srcPath`, or `srcPath/<siteRoot>` when `siteRoot`
    is set;
  - files directly in the served root belong to no collection;
  - files outside the served root are ignored.
- **Item shape** matches markdown items: all front matter fields plus
  `title`, `url`, `slug`, `date` (a `YYYY-MM-DD` string or `null`) and
  `_dateSort` (a `Date` or `null`), with no `content`.
- **Sort:** newest `date` first; undated items last.
- Pages with front matter `draft: true` are skipped.
- Files under `buildOnlyPaths` folders (relative to `srcPath`) are skipped.
- Files matching `excludePaths` (tested against the file's dist path) are
  skipped.
- **URLs** follow the built output and match what `fileToUrlPath` produces
  for the built file:
  - `posts/a.html` → `/posts/a/`
  - `posts/index.html` → `/posts/`
  - when `convertPageToDirectory.disabled` is set, or the dist path matches
    `convertPageToDirectory.excludePaths`, the URL stays `/posts/a.html`
  - `siteRoot` is stripped from the URL
- Node `>=20.9.0`. No new dependencies.

## Review Focus

- **A front matter `date` written as a quoted string or full ISO timestamp**
  (`"2026-11-01"`, `2026-11-01T09:00:00Z`). Expected: `date` is
  `"2026-11-01"` and it sorts correctly. Test in Task 2.
- **HTML that starts with `---` but whose YAML is malformed.** Expected: a
  warning naming the file, the page skipped from collections, and the build
  continuing. Test in Task 2.
- **The same folder holding both `.md` and `.html` posts.** Expected: one
  merged collection sorted across both. Test in Task 3.
- **A site with `siteRoot: 'pages'`.** Expected: `src/pages/posts/a.html`
  joins `posts` with URL `/posts/a/`, and `src/assets/x.html` is ignored.
  Test in Task 2.
- **Dev single-page rebuilds** (`DEV_CHANGED_PAGE` set). Expected:
  collections are still complete, because the plugin always scans `src`.
  Test in Task 3.

---

### Task 1: Shared collection helpers

**Files:**
- Create: `scripts/utils/collections/collections.js`
- Modify: `scripts/plugins/process-markdown.js` (`buildCollections`, lines 321-358)
- Test: `test/collections.test.js`

**Interfaces:**
- Produces:
  - `toCollectionItem(page: Object): Object`: returns `page` without the
    keys `content`, `sourcePath`, `outputPath` and `collection`. Key order is
    the same as markdown's today: `title, url, slug, date, description`, then
    the rest.
  - `addToCollection(collections: Object, name: string, item: Object): void`:
    creates the array if needed and pushes the item.
  - `sortCollections(collections: Object): void`: sorts every array in
    place, newest `_dateSort` first, undated last, and stable for ties.

- [ ] **Step 1: Write the failing tests** in `test/collections.test.js`:
  - `toCollectionItem strips build-only keys`: the result of
    `toCollectionItem({title:'A', url:'/a/', content:'<p>', sourcePath:'s', outputPath:'o', collection:'c', tags:['x']})`
    has `title === 'A'`, `url === '/a/'` and `tags` deep-equal `['x']`, and
    none of the keys `content`, `sourcePath`, `outputPath` or `collection`.
  - `sortCollections orders newest first, undated last, stable`: the input
    items are `[{id:1,_dateSort:null},{id:2,_dateSort:new Date('2026-01-01')},{id:3,_dateSort:new Date('2026-06-01')},{id:4,_dateSort:null}]`,
    and the ids come back as `[3,2,1,4]`.
  - `addToCollection creates and appends`.
- [ ] **Step 2: Run** `node --test test/collections.test.js`.
  Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the three functions. Then change
  `ProcessMarkdown.buildCollections` to use `addToCollection(this.store.collections, page.collection, toCollectionItem(page))`
  and `sortCollections(this.store.collections)`.
- [ ] **Step 4: Run** `node --test test/collections.test.js test/markdown.test.js`
  and then `npm test`. Expected: all pass, and markdown collection output is
  unchanged.
- [ ] **Step 5: Commit** `refactor: shared collection helpers for markdown (and soon HTML) collections`

---

### Task 2: `html-collections` plugin

**Files:**
- Create: `scripts/plugins/html-collections.js`
- Modify: `scripts/utils/config/config.js`. Add the default
  `collections: { html: false }` next to `markdown`, with a comment, and add
  `collections` to the named exports.
- Test: `test/html-collections.test.js`

**Interfaces:**
- Consumes: `addToCollection`, `toCollectionItem`, `sortCollections` (Task 1);
  `normalizeSiteRoot` from `scripts/utils/site-root/site-root.js`.
- Produces:
  - `htmlCollectionName(relPath: string, siteRoot?: string): string|null`.
    `relPath` is relative to `srcPath`, e.g. `'posts/a.html'`. Returns the
    first folder under the served root, or `null` when the file is at the
    served root or outside it.
  - `htmlPageUrl(relPath: string, opts: { siteRoot?: string, convertDisabled?: boolean, convertExcluded?: boolean }): string|null`.
    Returns the visitor URL, or `null` when outside the served root.
  - `htmlPageData(relPath: string, frontMatter: Object, opts): Object`.
    Returns `{ ...frontMatter, title, url, slug, collection, date, _dateSort }`:
    - `title` defaults to `Util.convertToCapSpaces(slug, 'kebab')`
    - `slug` is the file name without `.html`, or the folder name for
      `index.html`
    - `date` and `_dateSort` are normalized exactly like
      `ProcessMarkdown.buildPageData`
  - default export: `async htmlCollections({ store, data, srcPath?, distPath?, siteRoot?, enabled?, buildOnlyPaths?, excludePaths? })`.
    It mutates `store.collections` and sets `data.collections = store.collections`.
    Options default to config values; tests pass them explicitly.

- [ ] **Step 1: Write the failing pure-function tests**:
  - `htmlCollectionName`:
    - `('posts/a.html')` → `'posts'`
    - `('about.html')` → `null`
    - `('posts/2026/a.html')` → `'posts'`
    - `('pages/posts/a.html', 'pages')` → `'posts'`
    - `('assets/x.html', 'pages')` → `null`
  - `htmlPageUrl`:
    - `('posts/a.html', {})` → `'/posts/a/'`
    - `('posts/index.html', {})` → `'/posts/'`
    - `('posts/a.html', {convertDisabled:true})` → `'/posts/a.html'`
    - `('posts/a.html', {convertExcluded:true})` → `'/posts/a.html'`
    - `('pages/posts/a.html', {siteRoot:'pages'})` → `'/posts/a/'`
  - `htmlPageData` dates: `date: new Date('2026-11-01')` (what gray-matter
    yields), `'2026-11-01'` and `'2026-11-01T09:00:00Z'` all give
    `date: '2026-11-01'` and a `_dateSort` instance of `Date`. A missing
    date gives `date: null`, `_dateSort: null`.
  - `htmlPageData` title fallback: `('posts/hello-world.html', {})` gives
    `title: 'Hello World'`, `slug: 'hello-world'`.
- [ ] **Step 2: Write the failing plugin test**. In `before`, build a temp
  `src` under `os.tmpdir()` containing:
  - `posts/old.html`: front matter `title: Old`, `date: 2026-01-01`
  - `posts/new.html`: `date: 2026-06-01`, `tags: [a]`
  - `posts/draft.html`: `draft: true`
  - `posts/plain.html`: no front matter
  - `posts/bad.html`: `---\ntitle: [unclosed\n---\n<p>x</p>`
  - `layouts/post.html`: has front matter (`buildOnlyPaths: ['layouts']`)
  - `index.html`: has front matter, at the root

  Then the tests:
  - `htmlCollections({ store:{}, data:{}, srcPath, enabled:true, buildOnlyPaths:['layouts'], excludePaths:[] })`:
    - `store.collections.posts.map(i => i.title)` deep-equals `['New', 'Old']`
    - `data.collections === store.collections`
    - the `new` item has `tags: ['a']`, `url: '/posts/new/'`, and no
      `content` key
    - `bad.html` is skipped with a warning (stub `console.warn` or use the
      `Util.customWarn` path) and doesn't throw
  - With `enabled:false`, `store.collections` is unchanged (`undefined`, or
    whatever it was before).
  - Existing collections are preserved: pre-seed
    `store.collections = { posts: [{title:'Md', _dateSort: new Date('2026-03-01')}] }`.
    The result is `['New', 'Md', 'Old']`.
  - With `siteRoot: 'pages'`, `src/pages/posts/a.html` joins `posts` with
    URL `/posts/a/`, and `src/assets/x.html` with front matter is ignored.
- [ ] **Step 3: Run** `node --test test/html-collections.test.js`.
  Expected: FAIL, module not found.
- [ ] **Step 4: Implement** the plugin.
  - Walk with `Util.getPaths(srcPath, srcPath, [])`, keep `.html`, and read
    only files whose content starts with `---`.
  - Parse with `gray-matter` inside `try`/`catch`. On error, call
    `Util.customWarn(err, \`HtmlCollections: ${file} (skipped from collections)\`)`
    and continue.
  - For `excludePaths` and `convertPageToDirectory.excludePaths`, test
    against the dist path: `file.replace(srcPath, distPath)`.
  - Print a `Logger.persist.header('\nHTML Collections')` /
    `success(\`Collected N pages\`)` pair only when at least one page was
    collected.
- [ ] **Step 5: Run** `node --test test/html-collections.test.js` and then
  `npm test`. Expected: all pass.
- [ ] **Step 6: Commit** `feat: html-collections plugin (HTML pages with front matter join collections)`

---

### Task 3: Wire into the build, feed and docs

**Files:**
- Modify: `scripts/build.js`. Import `htmlCollections` and call
  `await htmlCollections({ store, data })` right after
  `await processMarkdown({store, data})`.
- Modify: `docs-site/src/docs/markdown.md` (Collections section),
  `docs-site/src/docs/configuration.md`, and `README.md` (config example and
  build steps list).
- Test: `test/html-collections-build.test.js`

**Interfaces:**
- Consumes: the default export of `scripts/plugins/html-collections.js` (Task 2).

- [ ] **Step 1: Write the failing end-to-end test.**
  - Config is read from `process.cwd()` when the module loads, so run the
    CLI as a child process:
    `execFileSync(process.execPath, [path.resolve('bin/cook.js'), 'build'], { cwd: tmp, env: { ...process.env, NODE_ENV: 'production' }, stdio: 'pipe' })`.
  - `tmp` is a fresh `fs.mkdtemp(os.tmpdir() + '/cook-htmlcol-')`, removed
    in `after`.
  - The project has:
  - `config/main.js`:
    `{ collections: { html: true }, formats: { feed: { collection: 'posts' }, json: false, markdown: false, llmsTxt: false } }`
  - `config/data.js`: `{ siteUrl: 'https://example.com', siteTitle: 'T' }`
  - `src/index.html` with
    `<ul><li data-repeat="collections.posts as post"><a href="${post.url}">${post.title}</a></li></ul>`
  - two HTML posts with front matter and a `layout`, plus one markdown post
    `src/posts/md-post.md`, all with different dates
  - `src/layouts/post.html`

  Assertions:
  - `dist/index.html` lists all three titles in newest-first order
  - `dist/feed.xml` contains three `<entry>` elements whose `<link>`s point
    to `https://example.com/posts/<slug>/`
  - each HTML post's built page uses the layout
- [ ] **Step 2: Add a dev-rebuild assertion.**
  - After the full build, run the CLI again with
    `env.DEV_CHANGED_PAGE = 'src/index.html'` and `NODE_ENV: 'development'`.
    This is a single-page rebuild of the page that lists the collection.
  - Assert the rebuilt `dist/index.html` still lists all three titles.
- [ ] **Step 3: Run** `node --test test/html-collections-build.test.js`.
  Expected: FAIL; the HTML posts are missing until the build.js wiring
  exists.
- [ ] **Step 4: Wire `build.js`** as described above.
- [ ] **Step 5: Run** `npm test`. Expected: all pass.
- [ ] **Step 6: Write the docs.**
  - `markdown.md` Collections: a short "HTML pages" subsection explaining
    the `collections: { html: true }` opt-in, that the page must start with
    front matter, `draft: true`, grouping by the first folder under the
    served root, and one example.
  - `configuration.md`: a `collections` entry.
  - `README.md`: add `collections: { html: false }` to the config example,
    and in the build process list, say "Process markdown and collect HTML
    collections".
- [ ] **Step 7: Build the docs site** (`cd docs-site && npm run build`).
  Expected: it builds, and its pages are unchanged because the feature is
  off there.
- [ ] **Step 8: Commit** `feat: HTML collections in the build, with docs`

---

### Task 4: Release

- [ ] **Step 1:** `npm test` (all pass), then `npm version 2.4.0 -m "chore: release %s"`
  (with the co-author trailer), then push `master` and the tag.
- [ ] **Step 2:** `npm publish --dry-run` and confirm
  `scripts/plugins/html-collections.js` and `scripts/utils/collections/collections.js`
  are in the tarball.
- [ ] **Step 3:** Hand `npm publish --otp=<code>` to Thomas. After he
  publishes, confirm `npm view cook-ssg version` is `2.4.0`, then create the
  GitHub release `v2.4.0` with notes covering HTML collections, the opt-in
  and an example.
