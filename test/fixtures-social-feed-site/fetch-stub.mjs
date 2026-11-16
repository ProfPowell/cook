/**
 * @file fetch-stub.mjs
 * @description Preloaded with `--import` by social-feed-build.test.js: replaces
 * global fetch with fixture routes so a spawned `cook build` never touches the
 * network. FEED_STUB_ROUTES names a JSON file of
 * `[{ match, status?, body?, raw?, throws? }]` (first `match` substring wins);
 * FEED_STUB_LOG names a file that gets one JSON line per request.
 */

import { readFileSync, appendFileSync } from 'node:fs';

const routesFile = process.env.FEED_STUB_ROUTES;
const logFile = process.env.FEED_STUB_LOG;

if (routesFile) {
  const routes = JSON.parse(readFileSync(routesFile, 'utf8'));
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    if (logFile) appendFileSync(logFile, `${JSON.stringify({ url: href, headers: init.headers || {} })}\n`);
    const route = routes.find((r) => href.includes(r.match));
    if (!route) return new Response('not found', { status: 404 });
    if (route.throws) throw new Error(route.throws);
    const text = route.raw !== undefined ? route.raw : JSON.stringify(route.body);
    return new Response(text, { status: route.status || 200, headers: { 'content-type': 'application/json' } });
  };
}
