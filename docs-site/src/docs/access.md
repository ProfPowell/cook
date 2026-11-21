---
title: Access Levels
description: Build the same site at a level such as public, friends or private, leaving out every file above it
section: Operations
---

# Access Levels

Every source file has an access level. A build runs at one level and leaves out every file above it. Files above the level are not copied to `dist` and not collected. Anything derived from collections or `dist` follows on its own: the Atom feed, `sitemap.xml`, `data-repeat` lists, the JSON and markdown formats, and your own plugins.

Build the site once per level and deploy each `dist` where that audience can reach it:

<code-block language="bash" label="Three builds">COOK_ACCESS_LEVEL=public npx cook build
COOK_ACCESS_LEVEL=friends npx cook build
COOK_ACCESS_LEVEL=private npx cook build</code-block>

A site that marks nothing builds exactly as before.

## Marking a page

Set `access` in a page's front matter. HTML pages and markdown files both work:

<code-block language="html" label="src/posts/trip.html">---
title: Our trip
access: friends
---
&lt;p&gt;Photos from the weekend.&lt;/p&gt;</code-block>

A page without `access` is `public`.

## Configuration

The defaults, in `config/main.js`:

<code-block language="js" label="config/main.js">export default {
  access: {
    levels: ['public', 'friends', 'private'],
    level: process.env.COOK_ACCESS_LEVEL || 'public',
    levelOf: ({ relPath, frontMatter }) => frontMatter?.access ?? 'public',
  },
};</code-block>

- `levels`: the level names in rank order, lowest first.
- `level`: the level this build runs at. It comes from the `COOK_ACCESS_LEVEL` environment variable and is `public` when that is not set.
- `levelOf`: returns the level of one source file. `relPath` is the file's path relative to `src` with `/` separators, such as `media/trip.jpg`. `frontMatter` is the parsed front matter of an `.html` or `.md` file (`{}` when it has none) and `null` for any other file.

Use `levelOf` to mark files that have no front matter, such as images:

<code-block language="js" label="config/main.js">export default {
  access: {
    levelOf: ({ relPath, frontMatter }) =>
      relPath.startsWith('media/family/') ? 'friends' : (frontMatter?.access ?? 'public'),
  },
};</code-block>

## The rank rule

A file is in a build when its level's rank is at or below the build's rank. With the default levels:

| Build level | Includes |
|---|---|
| `public` | `public` files |
| `friends` | `public` and `friends` files |
| `private` | every file |

## Unknown levels fail closed

A file whose level is not in `levels` is treated as the last level (`private` by default), and the build prints a warning that names the file. Level names are case-sensitive, so `access: Friends` makes a page private. A page whose front matter does not parse is also treated as the last level.

A build level that is not in `levels` builds at the first level (`public`), with a warning.

## In templates

`access` in site data holds the build's level and the level names, for example `${access.level}`. In a page whose front matter sets `access`, `${access}` is that page's own level instead.

Each collection item has `access` set to its resolved level, so a list can mark restricted posts:

<code-block language="html" label="A list page">&lt;li data-repeat="collections.posts as post" data-access="${post.access}"&gt;${post.title}&lt;/li&gt;</code-block>

## Notes

- `cook dev` builds at the level in `COOK_ACCESS_LEVEL` too. Saving a page above that level does not copy or build it.
- Pages added by plugins through `dynamicPages` are not checked. A plugin that adds pages decides which to add, using `data.access.level`.
- Access levels decide what a build contains. They do not protect a deployed site: serve each build where only its audience can reach it.
