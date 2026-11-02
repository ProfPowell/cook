/**
 * @file collections.js
 * @description Shared helpers for building collections (markdown and HTML
 * pages grouped by folder, exposed as `collections.<name>` in templates).
 */

/** Page keys used only during the build, never exposed to templates. */
const BUILD_ONLY_KEYS = ['content', 'sourcePath', 'outputPath', 'collection'];

/**
 * Shape a page into a collection item: title/url/slug/date/description
 * first, then every other front matter field, minus build-only keys
 * (`content` is dropped to save memory).
 * @param {Object} page
 * @returns {Object}
 */
export function toCollectionItem(page) {
  return {
    title: page.title,
    url: page.url,
    slug: page.slug,
    date: page.date,
    description: page.description,
    ...Object.fromEntries(Object.entries(page).filter(([key]) => !BUILD_ONLY_KEYS.includes(key))),
  };
}

/**
 * Append an item to a named collection, creating it if needed.
 * @param {Object<string, Object[]>} collections
 * @param {string} name
 * @param {Object} item
 */
export function addToCollection(collections, name, item) {
  if (!collections[name]) collections[name] = [];
  collections[name].push(item);
}

/**
 * Sort every collection in place: newest `_dateSort` first, undated items
 * last, original order kept for ties (Array#sort is stable).
 * @param {Object<string, Object[]>} collections
 */
export function sortCollections(collections) {
  for (const items of Object.values(collections)) {
    if (!Array.isArray(items)) continue;
    items.sort((a, b) => {
      if (!a._dateSort && !b._dateSort) return 0;
      if (!a._dateSort) return 1;
      if (!b._dateSort) return -1;
      return b._dateSort - a._dateSort;
    });
  }
}
