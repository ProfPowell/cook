/**
 * @file pages.js
 * @description Public entry point (`cook-ssg/pages`): add pages from a
 * plugin. `addDynamicPage(path, src, store)` queues a page whose source is
 * in memory; the build writes it to `<path>/index.html`. Dynamic pages
 * honor access levels like any other page.
 */

export { addDynamicPage } from './utils/util/util.js';
