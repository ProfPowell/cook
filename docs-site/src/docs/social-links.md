---
title: Social Links
description: List your social profiles once in config and let Cook fill <social-links> elements at build
section: Advanced
---

# Social Links

Cook reads your social accounts from `config/social.json` (the file Vanilla Press writes) and fills each empty `<social-links>` element with a list of profile links. Put the element in a layout footer and every page gets the links.

A site without `config/social.json` has no social data, and an empty `<social-links>` stays empty.

## Config

<code-block language="json" label="config/social.json">{
  "accounts": [
    { "service": "bluesky", "handle": "name.bsky.social" },
    { "service": "github", "handle": "octocat" },
    { "service": "mastodon", "handle": "@user@example.social", "hidden": true },
    { "service": "link", "label": "Newsletter", "url": "https://example.com/news" }
  ]
}</code-block>

`accounts` is an ordered array. Array order is display order. Other top-level keys are kept as they are. A `social` object in `config/main.js` wins over the JSON file.

| Service | Accepted input | Profile URL |
|---|---|---|
| `bluesky` | `name.bsky.social` or any domain handle | `https://bsky.app/profile/<handle>` |
| `mastodon` | `@user@instance` | `https://<instance>/@<user>` |
| `github` | a GitHub username | `https://github.com/<handle>` |
| `linkedin` | the `in/` slug | `https://www.linkedin.com/in/<slug>` |
| `youtube` | `@handle` | `https://www.youtube.com/@handle` |
| `link` | a `label` and an `https:` `url` | the URL |

Pasting a full profile URL works for every service. An account with `"hidden": true` stays in the config but is left out of the list.

A bad entry (unknown service, `http:` URL, malformed handle) is skipped with a `[social]` warning and the rest still build. Bad JSON gives a `[social]` warning and no social data.

## The element

<code-block language="html" label="Layout footer"><footer>
  <social-links></social-links>
</footer></code-block>

Cook writes one `<ul>` inside the element:

<code-block language="html" label="Built output"><social-links><ul><li><a href="https://github.com/octocat"><span class="social-icon" data-service="github" aria-hidden="true"></span><span>GitHub</span></a></li></ul></social-links></code-block>

- `services` limits the list to a comma list of service ids, such as `services="github,bluesky"`.
- Mastodon links carry `rel="me"`.
- Cook fills only an element with no child elements, so a hand-written list is never overwritten. Elements inside `pre`, `code`, `template` and `textarea` are skipped.
- Cook adds no attributes to the element. `variant` and `color` are for your CSS.

## Template data

When a social config exists, templates get:

- `social.accounts`: the visible accounts, in order;
- `social.allAccounts`: every valid account, hidden ones included;
- any other top-level keys from the config.

<code-block language="html" label="Template string">${social.accounts.length} of ${social.allAccounts.length} profiles shown</code-block>

## Module

`cook-ssg/social` exports `normalizeAccounts(raw)` and `renderSocialLinks(accounts, { services })` for tools that need the same rules.
