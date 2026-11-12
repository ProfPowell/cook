/**
 * @file usage.js
 * @description Finds which pages use which layouts, and which layouts are
 * built on which, so a tool can show "used by N pages" before an edit.
 */

import { existsSync, statSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import matter from 'gray-matter';

import { findTemplatedTag } from './render.js';

// Folders under src/ that are not pages
const SKIP_DIRS = new Set(['layouts', 'includes', 'components']);

/** Import config/main.js the way list.js does; null when absent or broken. */
async function loadMain(siteDir) {
  const file = path.join(siteDir, 'config', 'main.js');
  if (!existsSync(file)) return null;
  try {
    const mod = await import(`${pathToFileURL(file).href}?t=${statSync(file).mtimeMs}`);
    let value = mod.default ?? mod;
    if (typeof value === 'function') value = await value();
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

/** The area paths whose subfolders are program folders (valid or colliding). */
async function loadProgramAreas(siteDir, buildOnlyPaths) {
  const file = path.join(siteDir, 'config', 'programs.json');
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(await fs.readFile(file, 'utf8'));
    const { normalizePrograms } = await import('../../plugins/programs.js');
    const { areas, protectedAreas } = normalizePrograms(raw, { buildOnlyPaths });
    return [...areas, ...protectedAreas].map(a => a.path);
  } catch {
    return [];
  }
}

async function readDirSafe(dir) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** Page files (.html, .md) under src/, as src-relative paths. */
async function findPages(srcDir, programAreas) {
  const found = [];
  const walk = async (dir, rel) => {
    for (const entry of await readDirSafe(dir)) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!rel && SKIP_DIRS.has(entry.name)) continue;
        // <area>/<program>/... is a program folder
        if (rel && !rel.includes('/') && programAreas.includes(rel)) continue;
        await walk(path.join(dir, entry.name), childRel);
      } else if (entry.isFile() && /\.(html|md)$/.test(entry.name)) {
        found.push(childRel);
      }
    }
  };
  await walk(srcDir, '');
  return found.sort();
}

const bareName = (value) => (typeof value === 'string' && value.trim()
  ? value.trim().replace(/\.html$/, '')
  : null);

/** The layout name a page file uses, or null. */
function pageLayout(rel, source, defaultLayout) {
  const isMarkdown = rel.endsWith('.md');
  let body = source;
  let layout = null;
  if (isMarkdown || source.startsWith('---')) {
    const parsed = matter(source);
    body = parsed.content;
    layout = bareName(parsed.data?.layout);
  }
  if (isMarkdown) return layout ?? bareName(defaultLayout);
  const tag = findTemplatedTag(body);
  return bareName(tag?.name) ?? layout;
}

function add(map, name, value) {
  (map[name] ??= []).push(value);
}

/**
 * Which pages use which layouts, and which layouts are built on which.
 * Never throws; files that can't be read are skipped.
 * @param {string} siteDir - The site's root directory (contains src/)
 * @returns {Promise<{ pages: Record<string, string[]>, layouts: Record<string, string[]> }>}
 *   `pages[name]`: site-relative paths (`src/blog/a.md`) of pages using layout `name`;
 *   `layouts[name]`: names of layouts whose `data-template` is `name`
 */
export async function layoutUsage(siteDir) {
  const pages = {};
  const layouts = {};
  try {
    const main = await loadMain(siteDir);
    const defaultLayout = main?.markdown?.layout ?? null;
    const programAreas = await loadProgramAreas(siteDir, main?.buildOnlyPaths ?? []);
    const srcDir = path.join(siteDir, 'src');

    for (const rel of await findPages(srcDir, programAreas)) {
      try {
        const name = pageLayout(rel, await fs.readFile(path.join(srcDir, rel), 'utf8'), defaultLayout);
        if (name) add(pages, name, `src/${rel}`);
      } catch { /* unreadable or malformed: skipped */ }
    }

    const layoutDir = path.join(srcDir, 'layouts');
    for (const entry of await readDirSafe(layoutDir)) {
      let name = null;
      let file = null;
      if (entry.isFile() && entry.name.endsWith('.html')) {
        name = entry.name.slice(0, -5);
        file = entry.name;
      } else if (entry.isDirectory() && existsSync(path.join(layoutDir, entry.name, 'index.html'))) {
        name = entry.name;
        file = `${entry.name}/index.html`;
      }
      if (!name) continue;
      try {
        const parent = bareName(findTemplatedTag(await fs.readFile(path.join(layoutDir, file), 'utf8'))?.name);
        if (parent) add(layouts, parent, name);
      } catch { /* skipped */ }
    }
    for (const list of Object.values(layouts)) list.sort();
  } catch { /* never throws */ }
  return { pages, layouts };
}
