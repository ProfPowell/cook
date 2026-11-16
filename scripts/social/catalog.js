/**
 * @file catalog.js
 * @description The services Cook knows how to link to: ids, display names and
 * whether Vanilla Press can check a handle against the service. Pure data, no
 * dependencies.
 */

/** @type {Array<{ id: string, name: string, checkable: boolean }>} */
export const SERVICES = [
  { id: 'bluesky', name: 'Bluesky', checkable: true },
  { id: 'mastodon', name: 'Mastodon', checkable: true },
  { id: 'github', name: 'GitHub', checkable: true },
  { id: 'linkedin', name: 'LinkedIn', checkable: false },
  { id: 'youtube', name: 'YouTube', checkable: false },
  { id: 'link', name: 'Link', checkable: false },
];

/** @param {string} id */
export const serviceById = (id) => SERVICES.find((s) => s.id === id);
