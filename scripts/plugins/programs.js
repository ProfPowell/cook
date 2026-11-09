/**
 * @file programs.js
 * @description Programs: folders of hand-written HTML/JS (`src/<area>/<slug>/`)
 * that Cook leaves untouched. Reads config/programs.json, validates areas and
 * cards, exposes `programs` / `programAreas` data, and answers "is this path
 * inside a program folder" (isInProgram) for the other build passes.
 */

import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import { getPrograms, srcPath, buildOnlyPaths } from '../utils/config/config.js';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const isSlug = (v) => typeof v === 'string' && SLUG.test(v);
const TAG = '[programs] ';
export const RESERVED_AREAS = ['media', 'assets', 'layouts', 'includes'];

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Validate raw config/programs.json.
 * @param {unknown} raw
 * @param {{ srcEntries: string[], buildOnlyPaths: string[], hasIndex: (area: string, slug: string) => boolean }} ctx
 */
export function normalizePrograms(raw, { srcEntries = [], buildOnlyPaths: buildOnly = [], hasIndex = () => true } = {}) {
  const warnings = [];
  const areas = [];
  const programs = [];
  // A slug-shaped area that collides with a page folder (R10): no programs data, but its
  // subfolders stay program folders (untouched) and its sandboxed cards keep their rule.
  const protectedAreas = [];
  const protectedPrograms = [];
  if (!isObj(raw)) return { areas, programs, warnings, protectedAreas, protectedPrograms };

  const taken = new Set(srcEntries);
  const buildOnlySet = new Set(buildOnly.map(p => String(p).replace(/^\/+|\/+$/g, '')));
  const byPath = Object.create(null);
  const protectedByPath = Object.create(null);

  for (const a of Array.isArray(raw.areas) ? raw.areas : []) {
    const p = isObj(a) ? a.path : undefined;
    let why = null;
    if (!isSlug(p)) why = 'use one lowercase segment (a-z, 0-9, hyphens)';
    else if (RESERVED_AREAS.includes(p)) why = 'that name is reserved';
    else if (buildOnlySet.has(p)) why = 'it is a buildOnlyPaths entry';
    else if (byPath[p] || protectedByPath[p]) why = 'duplicate area';
    else if (taken.has(p)) {
      const area = { path: p, sandbox: a.sandbox === true };
      protectedByPath[p] = area;
      protectedAreas.push(area);
      warnings.push(`${TAG}area ${JSON.stringify(p)} ignored: the site already has a page or folder with that name `
        + '(no programs data for it; its subfolders still ship untouched as program folders)');
      continue;
    }
    if (why) {
      warnings.push(`${TAG}area ${JSON.stringify(p)} ignored: ${why}`);
      continue;
    }
    const area = { path: p, title: typeof a.title === 'string' && a.title ? a.title : p, sandbox: a.sandbox === true };
    byPath[p] = area;
    areas.push(area);
  }

  const seen = new Set();
  for (const c of Array.isArray(raw.programs) ? raw.programs : []) {
    const label = isObj(c) ? `${c.area}/${c.slug}` : JSON.stringify(c);
    if (isObj(c) && protectedByPath[c.area]) {
      if (isSlug(c.slug) && !seen.has(label)) {
        seen.add(label);
        protectedPrograms.push({
          area: c.area, slug: c.slug, sandbox: typeof c.sandbox === 'boolean' ? c.sandbox : protectedByPath[c.area].sandbox,
        });
      }
      continue;
    }
    if (!isObj(c) || !byPath[c.area]) {
      warnings.push(`${TAG}program ${label} ignored: unknown area`);
      continue;
    }
    if (!isSlug(c.slug)) {
      warnings.push(`${TAG}program ${label} ignored: bad slug (use a-z, 0-9, hyphens)`);
      continue;
    }
    if (seen.has(label)) {
      warnings.push(`${TAG}program ${label} ignored: duplicate`);
      continue;
    }
    seen.add(label);
    const tags = Array.isArray(c.tags) ? c.tags.filter(t => typeof t === 'string') : [];
    programs.push({
      ...c,
      title: typeof c.title === 'string' && c.title ? c.title : c.slug,
      tags,
      url: `/${c.area}/${c.slug}/`,
      sandbox: typeof c.sandbox === 'boolean' ? c.sandbox : byPath[c.area].sandbox,
      hasIndex: !!hasIndex(c.area, c.slug),
    });
  }
  return { areas, programs, warnings, protectedAreas, protectedPrograms };
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : Infinity);

function sortPrograms(list) {
  return list.slice().sort((a, b) => {
    const da = String(a.date || ''), db = String(b.date || '');
    if (da !== db) return da < db ? 1 : -1;
    const o = num(a.order) - num(b.order);
    if (o) return o < 0 ? -1 : 1;
    return String(a.title).localeCompare(String(b.title));
  });
}

// Names in src/ that an area path may not reuse. A page `demos.html|md` is the
// area's list page (with or without the `demos/` folder yet), so it does not
// count; a folder holding pages of its own (a blog) does, as does any other file.
function readSrcEntries(dir) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  const holdsPages = (name) => {
    try {
      return fs.readdirSync(path.join(dir, name), { withFileTypes: true })
        .some(e => e.isFile() && /\.(html|md)$/.test(e.name) && e.name !== 'index.html');
    } catch { return false; }
  };
  const out = new Set();
  for (const e of ents) {
    if (e.isDirectory()) { if (holdsPages(e.name)) out.add(e.name); }
    else if (!/\.(html|md)$/.test(e.name)) out.add(e.name);
  }
  return [...out];
}

function load() {
  const hasIndex = (area, slug) => fs.existsSync(path.join(srcPath, area, slug, 'index.html'));
  return normalizePrograms(getPrograms(), { srcEntries: readSrcEntries(srcPath), buildOnlyPaths, hasIndex });
}

let areaPaths = [];

/** Every area whose subfolders are program folders: the valid ones and the colliding ones (R10). */
const protectedPaths = ({ areas, protectedAreas }) => [...areas, ...protectedAreas].map(a => a.path);

/** Compute the area list for this build (programsData calls it). */
export function loadProgramAreas() {
  areaPaths = protectedPaths(load());
  return areaPaths;
}

/** Valid area paths from the current config. */
export function programAreaPaths() {
  return load().areas.map(a => a.path);
}

/**
 * Is relPath (relative to src or dist, `/` separators) inside <area>/<sub>/?
 * @param {string} relPath
 */
export function isInProgram(relPath) {
  if (!areaPaths.length || typeof relPath !== 'string') return false;
  const parts = relPath.replace(/\\/g, '/').replace(/^\.?\/+/, '').split('/');
  return parts.length >= 3 && areaPaths.includes(parts[0]);
}

/**
 * Is filePath (as the build passes see it, e.g. `dist/demos/x/y.html`) inside a
 * program folder? baseDir is the directory the path is relative to (dist, src).
 * @param {string} filePath
 * @param {string} baseDir
 */
export function isProgramFile(filePath, baseDir) {
  if (!areaPaths.length || typeof filePath !== 'string') return false;
  return isInProgram(path.relative(baseDir, filePath).split(path.sep).join('/'));
}

/** Set `programs` and `programAreas` on the data store. */
export async function programsData({ data }) {
  const loaded = load();
  const { areas, programs, warnings } = loaded;
  areaPaths = protectedPaths(loaded);
  for (const w of warnings) console.log(chalk.yellow(w));
  const shown = sortPrograms(programs.filter(p => p.listed === true && p.hasIndex))
    .map(({ hasIndex, ...card }) => card);
  data.programs = shown;
  const byArea = Object.create(null);
  for (const a of areas) byArea[a.path] = shown.filter(p => p.area === a.path);
  data.programAreas = byArea;
}

const SANDBOX_RULE = 'Content-Security-Policy: sandbox allow-scripts allow-forms allow-popups allow-pointer-lock allow-modals';

/**
 * Cloudflare Pages / Netlify `_headers` text: the site's own rules, then a
 * sandbox block for each sandboxed program (listed or not), in program order.
 * @param {Array<{area: string, slug: string, sandbox?: boolean}>} programs
 * @param {string|null} existing - The site's own `_headers` text, if any
 * @returns {string|null} null when no program is sandboxed
 */
export function programHeaders(programs, existing) {
  const sandboxed = (programs || []).filter(p => p.sandbox === true);
  if (!sandboxed.length) return null;
  const blocks = sandboxed.map(p => `/${p.area}/${p.slug}/*\n  ${SANDBOX_RULE}\n`).join('\n');
  return existing ? `${existing}\n${blocks}` : blocks;
}

/**
 * Programs (listed and unlisted) from the current config, for `_headers`: the valid ones,
 * then those in a colliding area (R10), whose sandbox rule must still be written.
 */
export function allPrograms() {
  const { programs, protectedPrograms } = load();
  return [...programs, ...protectedPrograms];
}
