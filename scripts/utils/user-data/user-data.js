/**
 * @file user-data.js
 * @description Single shared loader for the user's `config/data.js`.
 *
 * The data config may export a plain object or a (possibly async)
 * function. Every part of the build MUST share one instance: plugins
 * add to it (addDynamicPage, collections) and other stages read from
 * it. Loading it in more than one module and invoking the function
 * export per-importer produced divergent instances — dynamic pages
 * written to one were invisible to the other — and doubled any remote
 * fetch cost.
 */

import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Memoized per base directory (process.cwd() in normal builds)
const cache = new Map();

/**
 * Load (once) and return the user's data object for a project directory.
 * @param {string} [baseDir=process.cwd()] - Project root containing config/data.js
 * @returns {Promise<Object>}
 */
export async function loadUserData(baseDir = process.cwd()) {
  if (cache.has(baseDir)) return cache.get(baseDir);

  // Store the in-flight promise so concurrent callers share one evaluation
  const promise = (async () => {
    const userDataPath = `${baseDir}/config/data.js`;
    if (!existsSync(userDataPath)) return {};
    const dataModule = await import(pathToFileURL(userDataPath));
    const exported = dataModule.default || dataModule;
    return typeof exported === 'function' ? await exported() : exported;
  })();

  cache.set(baseDir, promise);
  const data = await promise;
  // Replace the promise with the resolved value for cheap sync-ish reuse
  cache.set(baseDir, data);
  return data;
}

// The shared singleton for the current project
export default await loadUserData();
