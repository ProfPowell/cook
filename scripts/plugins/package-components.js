/**
 * @file package-components.js
 * @description Load npm web-component packages per page.
 *
 * Dependencies in the project's package.json that ship a custom-elements.json
 * manifest get their built files (the entry's whole directory) copied to
 * `<dist>/<path>/<package name>/`. Each page that uses one of the package's
 * tags gets one `<script type="module">` appended to `<head>`.
 *
 *   packageComponentsCopy({ store })  once, pre-loop; fills store.packageComponentsMap
 *   packageComponentsInject(...)      per page, after autoComponents
 */

// IMPORTS
// -----------------------------
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'node:path';
import Util from '../utils/util/util.js';

// Config
import { distPath, siteRoot, packageComponents as packageComponentsConfig } from '../utils/config/config.js';

import { siteRootDir } from '../utils/site-root/site-root.js';


// HELPERS
// -----------------------------
const getConfig = () => ({
  enabled: true,
  exclude: ['vanilla-breeze', 'cook-ssg'],
  path: 'assets/components',
  ...packageComponentsConfig,
});

const readJson = async (file) => {
  try {
    return await fs.readJson(file);
  } catch {
    return null;
  }
};

/**
 * Resolve a package's entry file from its package.json
 * @param {Object} pkg - Parsed package.json
 * @returns {string|null} Entry path as written (e.g. './dist/x.js')
 */
function resolveEntry(pkg) {
  const root = pkg.exports && pkg.exports['.'];
  const candidates = [
    root && typeof root === 'object' ? root.import : null,
    root && typeof root === 'object' ? root.default : null,
    typeof root === 'string' ? root : null,
    pkg.module,
    pkg.main,
  ];
  return candidates.find(c => typeof c === 'string' && c) || null;
}

/**
 * Collect every tagName declared in a custom-elements manifest
 * @param {Object} manifest
 * @returns {string[]}
 */
function manifestTags(manifest) {
  const tags = new Set();
  for (const mod of manifest.modules || []) {
    for (const decl of mod.declarations || []) {
      if (decl.tagName) tags.add(decl.tagName);
    }
  }
  return [...tags];
}


// COPY (ONCE, PRE-LOOP)
// -----------------------------
export async function packageComponentsCopy({ store, siteRoot: siteRootOpt }) {
  const config = getConfig();
  store.packageComponentsMap = {};
  if (!config.enabled) return;

  const cwd = process.cwd();
  const rootPkg = await readJson(path.join(cwd, 'package.json'));
  if (!rootPkg || !rootPkg.dependencies) return;

  const names = Object.keys(rootPkg.dependencies).filter(n => !config.exclude.includes(n));
  const urlBase = config.path.replace(/^\/+|\/+$/g, '');

  for (const name of names) {
    const pkgDir = path.join(cwd, 'node_modules', name);
    const skip = (why) => console.log(chalk.gray(`[package-components] Skipping ${name}: ${why}`));

    const pkg = await readJson(path.join(pkgDir, 'package.json'));
    if (!pkg) { skip('not installed'); continue; }

    const manifestFile = typeof pkg.customElements === 'string' ? pkg.customElements : 'custom-elements.json';
    const manifest = await readJson(path.join(pkgDir, manifestFile));
    if (!manifest) { skip('no custom-elements manifest'); continue; }

    const entry = resolveEntry(pkg);
    if (!entry) { skip('no entry point'); continue; }

    const entryAbs = path.resolve(pkgDir, entry);
    if (!(await fs.pathExists(entryAbs))) { skip('entry file missing'); continue; }

    const entryDir = path.dirname(entryAbs);
    // Never copy the whole package root's parent or anything outside the package
    if (path.relative(pkgDir, entryDir).startsWith('..')) { skip('entry outside package'); continue; }

    const target = path.join(cwd, siteRootDir(distPath, siteRootOpt ?? siteRoot), urlBase, name);
    await fs.copy(entryDir, target);

    const rel = path.basename(entryAbs);
    const url = `/${urlBase}/${name}/${rel}`;
    for (const tag of manifestTags(manifest)) {
      store.packageComponentsMap[tag] = url;
    }
  }

  const count = Object.keys(store.packageComponentsMap).length;
  if (count) console.log(chalk.green(`[package-components] ${count} tag(s) mapped`));
}


// INJECT (PER PAGE)
// -----------------------------
class PackageComponents {
  constructor({ file, store, allowType, disallowType }) {
    this.opts = { file, allowType, disallowType };
    this.file = file;
    this.store = store;
  }

  async init() {
    const map = this.store.packageComponentsMap;
    if (!map || Object.keys(map).length === 0) return;
    if (!Util.isAllowedType(this.opts)) return;

    const dom = Util.fileDom(this.file);
    const document = dom.window.document;
    const head = document.querySelector('head');
    if (!head) return;

    const present = new Set(
      [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src'))
    );
    const added = new Set();

    for (const el of document.querySelectorAll('*')) {
      const url = map[el.tagName.toLowerCase()];
      if (!url || present.has(url) || added.has(url)) continue;
      const script = document.createElement('script');
      script.setAttribute('type', 'module');
      script.setAttribute('src', url);
      head.appendChild(script);
      added.add(url);
    }

    if (added.size) Util.commitDom(this.file, dom);
  }

  static async export(opts) {
    return new PackageComponents(opts).init();
  }
}

export const packageComponentsInject = PackageComponents.export;
export default packageComponentsInject;
