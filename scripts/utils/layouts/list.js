/**
 * @file list.js
 * @description Lists a site's layouts and includes with their check
 * results, parent chains and slots, and loads the site's field and list
 * names (from config/data.js and config/main.js) for the checker.
 */

import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { checkLayout } from './check.js';

const FRAGMENT_MARKER = /^\s*<!--\s*layout-fragment\s*-->/;

/** Import a site config file; returns { value } or { error } or { missing }. */
async function importConfig(file) {
  if (!existsSync(file)) return { missing: true };
  try {
    const mod = await import(pathToFileURL(file).href);
    let value = mod.default ?? mod;
    if (typeof value === 'function') value = await value();
    return { value };
  } catch (err) {
    return { error: err?.message ?? String(err) };
  }
}

/**
 * Read the field and list names a site makes available to layouts.
 * Never throws; a config file that fails to load is reported in `problems`.
 * @param {string} siteDir - The site's root directory
 * @returns {Promise<{ fields: string[], lists: string[], problems: string[] }>}
 */
export async function loadSiteNames(siteDir) {
  const fields = new Set();
  const lists = new Set(['programs', 'programAreas']);
  const problems = [];

  const data = await importConfig(path.join(siteDir, 'config', 'data.js'));
  if (data.error) problems.push(`config/data.js could not be loaded (${data.error})`);
  else if (data.value && typeof data.value === 'object') {
    for (const [key, value] of Object.entries(data.value)) {
      fields.add(key);
      if (Array.isArray(value)) lists.add(key);
    }
  }

  const main = await importConfig(path.join(siteDir, 'config', 'main.js'));
  if (main.error) problems.push(`config/main.js could not be loaded (${main.error})`);
  else if (main.value && typeof main.value === 'object') {
    const declared = main.value.layouts?.fields;
    if (Array.isArray(declared)) declared.filter(f => typeof f === 'string').forEach(f => fields.add(f));
  }

  return { fields: [...fields], lists: [...lists], problems };
}

async function readDirSafe(dir) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** Layout files: layouts/<name>.html and layouts/<dir>/index.html. */
async function findLayoutFiles(dir) {
  const found = [];
  for (const entry of await readDirSafe(dir)) {
    if (entry.isFile() && entry.name.endsWith('.html')) {
      found.push({ name: entry.name.slice(0, -5), file: entry.name });
    } else if (entry.isDirectory() && existsSync(path.join(dir, entry.name, 'index.html'))) {
      found.push({ name: entry.name, file: `${entry.name}/index.html` });
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/** Include files: every .html under includes/, as paths relative to it. */
async function findIncludeFiles(dir, base = dir) {
  const found = [];
  for (const entry of await readDirSafe(dir)) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await findIncludeFiles(full, base));
    else if (entry.isFile() && entry.name.endsWith('.html')) {
      const file = path.relative(base, full).split(path.sep).join('/');
      found.push({ name: file.slice(0, -5), file, full });
    }
  }
  return found.sort((a, b) => a.file.localeCompare(b.file));
}

/** Walk parents from `entry`; returns the chain and any chain problem. */
function resolveChain(entry, byName) {
  const chain = [entry.name];
  let current = entry;
  while (current.parent) {
    const next = byName.get(current.parent);
    if (!next) {
      return { chain, problem: `parent layout "${current.parent}" not found` };
    }
    if (chain.includes(next.name)) {
      return { chain, problem: `layouts form a cycle: ${[...chain, next.name].join(' → ')}` };
    }
    chain.push(next.name);
    current = next;
  }
  return { chain, problem: null };
}

/**
 * List a site's layouts and includes with their check results.
 * @param {string} siteDir - The site's root directory (contains src/)
 * @param {Object} [opts]
 * @property {string[]} [opts.fields] - Known field names (default: loaded from the site config)
 * @property {string[]} [opts.lists] - Known list roots (default: loaded from the site config)
 * @returns {Promise<{ layouts: Object[], includes: Array<{ name: string, file: string, ok: boolean, problems: Array }> }>}
 */
export async function listLayouts(siteDir, { fields, lists } = {}) {
  let configProblems = [];
  if (!fields || !lists) {
    const names = await loadSiteNames(siteDir);
    fields = fields ?? names.fields;
    lists = lists ?? names.lists;
    configProblems = names.problems;
  }

  const layoutDir = path.join(siteDir, 'src', 'layouts');
  const entries = [];
  for (const { name, file } of await findLayoutFiles(layoutDir)) {
    let source = '';
    try { source = await fs.readFile(path.join(layoutDir, file), 'utf8'); } catch { /* unreadable: treated as empty */ }
    const result = checkLayout(source, { fields, lists });
    const info = result.info && typeof result.info === 'object' ? result.info : {};
    const declared = info.slots && typeof info.slots === 'object' && !Array.isArray(info.slots) ? info.slots : {};
    entries.push({
      name,
      file,
      kind: result.kind,
      ok: result.ok,
      editable: false,
      label: typeof info.label === 'string' && info.label ? info.label : name,
      description: typeof info.description === 'string' ? info.description : '',
      abstract: info.abstract === true,
      parent: result.parent ?? null,
      chain: [name],
      slots: result.slots.map(slot => ({
        name: slot,
        label: typeof declared[slot]?.label === 'string' ? declared[slot].label : slot,
      })),
      problems: [...result.problems],
    });
  }

  const byName = new Map(entries.map(e => [e.name, e]));
  for (const entry of entries) {
    const { chain, problem } = resolveChain(entry, byName);
    entry.chain = chain;
    if (problem) entry.problems.push({ line: 1, message: problem });
    entry.editable = !problem && chain.every(n => byName.get(n).ok);
  }

  if (entries.length && configProblems.length) {
    for (const message of configProblems) entries[0].problems.push({ line: 1, message });
  }

  const includes = [];
  const includeDir = path.join(siteDir, 'src', 'includes');
  for (const { name, file, full } of await findIncludeFiles(includeDir)) {
    let source = '';
    try { source = await fs.readFile(full, 'utf8'); } catch { /* unreadable */ }
    if (FRAGMENT_MARKER.test(source)) {
      const result = checkLayout(source, { fields, lists, fragment: true });
      includes.push({ name, file, ok: result.ok, problems: result.problems });
    } else {
      includes.push({ name, file, ok: false, problems: [] });
    }
  }

  return { layouts: entries, includes };
}
