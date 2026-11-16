---
title: SocialSpec
description: Publish a follow list, an about text and a contact card under /.well-known/ from config/social.json
section: Advanced
---

# SocialSpec

Cook can publish a SocialSpec profile for your site: three small static files under `/.well-known/`, written at build from `config/social.json`. Each part is optional and independent. A site with none of `about`, `contact` or `following` builds exactly as before, with no `_headers` change.

## Config

`about`, `contact` and `following` sit beside `accounts` in the same file. Cook keeps every key it does not use.

<code-block language="json" label="config/social.json">{
  "accounts": [
    { "service": "github", "handle": "octocat" }
  ],
  "about": {
    "summary": "A short line about the site.",
    "body": "Longer text in **Markdown**. Root-relative links such as [posts](/blog/) are made absolute."
  },
  "contact": {
    "name": "Your Name",
    "email": ["you@example.com", "press@example.com"],
    "url": "https://example.com/",
    "org": "Example",
    "title": "Writer"
  },
  "following": [
    { "title": "Some Blog", "feedUrl": "https://blog.example.org/feed.xml", "siteUrl": "https://blog.example.org/" },
    { "title": "Kept private", "feedUrl": "https://example.net/feed.xml", "public": false }
  ]
}</code-block>

- `about`: `summary` and `body`. Use `file` instead of `body` to read the text from a Markdown file; `body` wins when both are set. `file` is a path from the project root, inside the site and outside `src/` (for example `content/about.md`), because anything in `src/` is copied to the built site as-is.
- `contact`: `name` is required. `email`, `url`, `org` and `title` are optional and only written when you set them. `email` is one address or an array of addresses: each becomes an `EMAIL` line in order, and the first is marked preferred. Nothing is filled in from other config. The address in `contact.vcf` is public, so use one you are happy to see scraped.
- `following`: one entry per feed. `feedUrl` must be an absolute URL: an `http:` feed is kept with a warning, and an entry whose `feedUrl` is missing or not absolute (for example `/feed.xml`) is dropped from `following.opml`. `siteUrl` is optional; when it is not an absolute URL, the entry is kept but written without `htmlUrl`. `"public": false` keeps an entry in the config but out of the file.

Add `siteUrl` to your site data and set `formats.feed`; every URL in the files is absolute, and a SocialSpec profile starts from the site feed.

### About links and images

In `about.md`, Cook makes root-relative Markdown inline links and images absolute: only the form `](/path)` is rewritten. Raw HTML such as `src="/img/me.png"` or `href="/blog/"`, and reference-style link definitions, are left as written and stay relative, which a reader of `about.md` cannot resolve. Write absolute URLs in those places.

### With `basePath`

When the site sets a `basePath`, the files are written under that base path in the built site. SocialSpec clients look for `/.well-known/` at the domain root, so they will not find them there. Serve the files from the domain root of the host instead.

## The files

| File | Content-Type | Written when |
|---|---|---|
| `/.well-known/following.opml` | `text/x-opml; charset=utf-8` | at least one public `following` entry |
| `/.well-known/about.md` | `text/markdown; charset=utf-8` | `about` has a summary or text |
| `/.well-known/contact.vcf` | `text/vcard; charset=utf-8` | `contact` has a name |

`following.opml` is OPML 2.0 with one `type="rss"` outline per feed. `about.md` holds the `summary` as front matter, then the Markdown body. `contact.vcf` is vCard 4.0.

For each file written, Cook adds a block to `_headers` in the site root with the exact Content-Type and `Access-Control-Allow-Origin: *`, so browser clients can read the files. Your own `_headers` lines and the blocks Cook writes for [programs](/docs/programs/) are kept.

<code-block language="text" label="_headers">/.well-known/about.md
  Content-Type: text/markdown; charset=utf-8
  Access-Control-Allow-Origin: *</code-block>

### Other hosts

`_headers` is read by Cloudflare Pages and Netlify. On any other host, set the same three headers yourself for the three paths: the Content-Type from the table, and `Access-Control-Allow-Origin: *`. The files are still written either way.

The optional [Cloudflare Worker](/docs/deployment/) returns `/.well-known/*` untouched, skips content negotiation for it, and adds `Access-Control-Allow-Origin: *` to the three SocialSpec paths. A missing `/.well-known/*` file returns the host's plain 404: the Worker does not serve your custom 404 page for it.

## Warnings

These are `[social]` warnings; the build continues.

- no `siteUrl`, so URLs cannot be made absolute;
- `formats.feed` is not set;
- a `feedUrl` that is `http:` rather than `https:` (the entry is kept);
- a `following` entry with no `feedUrl`, or one that is not an absolute URL (the entry is skipped);
- a `contact` with no name (no `contact.vcf` is written);
- an `about.file` that does not exist.

## Template data

The `social` template data gains `about`, `contact` and `following` as written in the config, plus `social.aboutHtml`: the about body (or `about.file`) rendered from Markdown to HTML, for an about page. `aboutHtml` is not sanitized: raw HTML in the Markdown passes through unchanged. That is fine for text you write yourself, but never put content from other people in `about`.

<code-block language="html" label="An about page">&lt;section&gt;
  &lt;p&gt;&#36;{social.about.summary}&lt;/p&gt;
  &#36;{social.aboutHtml}
&lt;/section&gt;

&lt;ul&gt;
  &lt;li data-repeat="social.following as site"&gt;
    &lt;a href="&#36;{site.siteUrl}"&gt;&#36;{site.title}&lt;/a&gt;
  &lt;/li&gt;
&lt;/ul&gt;</code-block>

Entries with `"public": false` are still in `social.following`; filter them in your template if the page should hide them too.

## Vanilla Press

The Social screen in Vanilla Press has About, Contact and Following panels that write this config, beside the Accounts panel. They need Cook 2.11.0 or later.
