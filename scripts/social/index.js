/**
 * @file index.js
 * @description Public entry for `cook-ssg/social`: the service catalog, account
 * parsing and the profile-links renderer. Pure and dependency-free.
 */

export { SERVICES } from './catalog.js';
export { parseHandle, profileUrl, normalizeAccounts } from './accounts.js';
export { renderSocialLinks } from './render.js';
