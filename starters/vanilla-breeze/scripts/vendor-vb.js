/**
 * Copy Vanilla Breeze from node_modules into src/assets/vendor/vanilla-breeze
 * so Cook ships it with the site. Runs before every build and dev server
 * (npm prebuild/predev); the copied files are git-ignored.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
// The package exports its CSS from dist/cdn/; the rest of the bundle sits beside it.
const cdn = dirname(require.resolve('vanilla-breeze/css'));
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'src', 'assets', 'vendor', 'vanilla-breeze');

const FILES = ['vanilla-breeze.css', 'vanilla-breeze.js', 'themes', 'fonts'];

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
// fonts/ ships with Vanilla Breeze 0.6+; older versions have none
for (const name of FILES) if (existsSync(join(cdn, name))) cpSync(join(cdn, name), join(dest, name), { recursive: true });
console.log(`Vanilla Breeze copied to ${dest}`);
