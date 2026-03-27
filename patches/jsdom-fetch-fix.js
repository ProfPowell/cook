// jsdom fetch fix patch
// See original issue: https://github.com/jsdom/jsdom/pull/2510
// Note: This patch may no longer be needed in jsdom 27.x+ as the fix was merged upstream.
// The patch will silently skip if the target file structure has changed.

import fs from 'fs-extra';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve jsdom relative to Cook's own node_modules (works whether Cook is
// the project root or installed as a dependency inside another project)
const filePath = path.resolve(__dirname, '..', 'node_modules', 'jsdom', 'lib', 'jsdom', 'browser', 'resources', 'per-document-resource-loader.js');

try {
  // Check if file exists first
  if (!fs.existsSync(filePath)) {
    // File doesn't exist - jsdom structure may have changed, skip patch
    console.log('[jsdom-patch] Target file not found, skipping patch (may not be needed in this jsdom version)');
    process.exit(0);
  }

  let src = fs.readFileSync(filePath, 'utf-8');

  // Check if patch is already applied
  if (src.includes('if (this._resourceLoader === null) return null;')) {
    console.log('[jsdom-patch] Patch already applied, skipping');
    process.exit(0);
  }

  // Find target and add fix immediately inside the `fetch()` callback
  const fetchRegex = /fetch\(url,\s*{\s*element,\s*onLoad,\s*onError\s*}\)\s*{/gm;

  if (!fetchRegex.test(src)) {
    console.log('[jsdom-patch] Target pattern not found, skipping patch (may not be needed in this jsdom version)');
    process.exit(0);
  }

  // Reset regex lastIndex after test
  fetchRegex.lastIndex = 0;

  src = src.replace(fetchRegex, `fetch(url, { element, onLoad, onError }) { if (this._resourceLoader === null) return null;`);

  // Write new src back to file
  fs.writeFileSync(filePath, src, 'utf-8');
  console.log('[jsdom-patch] Patch applied successfully');
}
catch (err) {
  console.warn('[jsdom-patch] Warning: Could not apply jsdom patch:', err.message);
  // Don't fail the install, just warn
}
