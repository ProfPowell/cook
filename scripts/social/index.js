/**
 * @file index.js
 * @description Public entry for `cook-ssg/social`: the service catalog, account
 * parsing, the profile-links renderer and the `<social-feed>` helpers. No
 * dependencies; everything is pure except `readSnapshot` and `snapshotPath`,
 * which use Node's fs and path.
 */

export { SERVICES } from './catalog.js';
export { parseHandle, profileUrl, normalizeAccounts } from './accounts.js';
export { renderSocialLinks } from './render.js';
export { renderOpml, renderAbout, renderVcard } from './socialspec.js';
export { renderEntry, renderFeedParts, mergeItems, matchesTags } from './feeds/core.js';
export { readSnapshot, snapshotPath } from './feeds/snapshots.js';
export { renderSocialFeed, feedAccounts, parseFeedAttrs } from './feeds/block.js';
