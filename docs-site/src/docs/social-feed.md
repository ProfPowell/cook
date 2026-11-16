---
title: Social Feed
description: Show recent Bluesky and Mastodon posts and GitHub releases in a social-feed element, filled at build
section: Advanced
---

# Social Feed

Cook fills each empty `<social-feed>` element at build with recent posts from the accounts in `config/social.json`: Bluesky and Mastodon posts, and GitHub releases. The built page is complete HTML with no script needed. Vanilla Breeze's `<social-feed>` component then checks for newer posts in the browser and loads more as the reader scrolls.

Accounts come from the same config as [Social Links](/docs/social-links/). Other services in the config (LinkedIn, YouTube, links) are ignored by feeds.

## The element

<code-block language="html" label="A page or layout">&lt;social-feed&gt;&lt;/social-feed&gt;

&lt;social-feed accounts="bluesky:name.bsky.social" tags="webdev,css" items="6" height="24rem" hide-counts&gt;&lt;/social-feed&gt;</code-block>

| Attribute | Meaning | Default |
|---|---|---|
| `accounts` | comma list of account keys, `<service>:<handle>` as stored, such as `bluesky:name.bsky.social`, `mastodon:@user@example.social` or `github:octocat` | every visible Bluesky, Mastodon and GitHub account |
| `tags` | comma list of hashtags without `#`, matched case-insensitively | none |
| `items` | how many entries to show first, a whole number from 1 to 50 | `12` |
| `height` | the scroll height, a length in `rem`, `em`, `px` or `vh` | `32rem` (from the component's CSS) |
| `hide-counts` | leave out reply, repost and like counts | counts show |

- An invalid `items` falls back to the default with a `[social-feed]` warning. An invalid `height` is ignored with a warning, so the default applies.
- A hidden account named in `accounts` is included. A key that is not in the config is skipped with a warning.
- With `tags`, only Bluesky and Mastodon posts that carry one of the tags show. GitHub releases have no tags, so a block with `tags` shows none.
- Replies are never shown. Reposts and boosts are.
- GitHub contributes published, stable releases from up to 10 of the account's most recently pushed public repositories that are not forks or archived.
- Cook fills only an element with no child elements, so a hand-written one is never overwritten. Elements inside `pre`, `code`, `template` and `textarea` are skipped.

## Built output

Cook keeps your attributes and writes the markup below. With a valid `height`, it also sets that length inline as `style="--social-feed-height: …"`; without one it writes no inline height, so the component's CSS default (`32rem`) applies and your own stylesheet can override it without `!important`.

<code-block language="html" label="Built output (shortened)">&lt;social-feed&gt;
  &lt;activity-feed aria-label="Recent posts" data-infinite&gt;
    &lt;article data-activity data-id="…" data-service="bluesky"&gt;…&lt;/article&gt;
  &lt;/activity-feed&gt;
  &lt;p class="social-feed-more"&gt;More on &lt;a href="https://bsky.app/profile/name.bsky.social"&gt;Bluesky&lt;/a&gt;&lt;/p&gt;
  &lt;script type="application/json" class="social-feed-state"&gt;…&lt;/script&gt;
&lt;/social-feed&gt;</code-block>

- Each entry has the author, a permalink with the date, the text (each line break written as `<br>`, so HTML minification keeps it), an image when the post has one, release details for GitHub, and counts unless `hide-counts` is set. All post text is escaped, and only `https:` links and images are kept.
- With nothing to show, `<p class="social-feed-empty">Nothing yet</p>` is written and `data-infinite` is left off.
- The state JSON holds the accounts, paging cursors, the newest date per account and every other fetched post that matches the block, newest first, for the browser to show before it fetches more. It never holds a token. Post dates are normalized to ISO 8601 UTC, and a post whose date does not parse (in a hand-edited snapshot, say) is left out.
- `newest` (account key to the newest post date Cook saw) is reserved: Cook writes it, and the Vanilla Breeze component does not read it yet.

Browser refresh and load-more need Vanilla Breeze's `<social-feed>` component on the page. Without it the built list still shows.

## Snapshots

After a successful fetch, Cook writes the account's posts (at most 100, unfiltered by tags) to one file per account:

<code-block language="text" label="Snapshot files">data/social-feeds/bluesky-name.bsky.social.json
data/social-feeds/mastodon-user-example.social.json
data/social-feeds/github-octocat.json</code-block>

When a service is down, slow (5 seconds) or answers with bad data, Cook uses that account's snapshot and logs one `[social-feed]` warning. With no snapshot the account contributes nothing and the other accounts still show. A feed problem never fails the build.

**Commit the `data/social-feeds/` folder.** A build server that can't reach a service, or an offline build, then still has posts to show. Vanilla Press stages it on Publish and Update.

## Network

- Each account is fetched at most once per build, however many blocks use it. `cook dev` reuses results for 10 minutes and rebuilds when `config/social.json` changes.
- Requests send a generic `User-Agent: cook-ssg`.
- `COOK_OFFLINE=1` skips the network and builds from snapshots, logging one `[social-feed]` note per build; an account with no snapshot still gets its own warning:

<code-block language="bash" label="Offline build">COOK_OFFLINE=1 npx cook build</code-block>

- `GITHUB_TOKEN`, when set in the environment, is sent to the GitHub API at build to raise the rate limit. It is used only by Cook's build, never written to the page and never used by the browser.

## Module

`cook-ssg/social` exports `feedAccounts(accounts, keys)`, `renderSocialFeed(attrs, { accounts, itemsByKey, cursorsByKey })`, `renderEntry`, `renderFeedParts`, `mergeItems`, `matchesTags`, `readSnapshot` and `snapshotPath` for tools, such as a preview, that need the same rules. `readSnapshot` and `snapshotPath` use Node's file system; the rest are pure.
