// See github issue fix: https://github.com/jsdom/jsdom/pull/2510

// REQUIRE
// -----------------------------
const cwd = process.cwd();
const fs = require('fs-extra');

// Path to target file
const filePath = `${cwd}/../jsdom/lib/jsdom/browser/resources/per-document-resource-loader.js`;

// Get file src
try {
  let src = fs.readFileSync(filePath, 'utf-8');

  // Find target and add fix immediately inside the `fetch()` callback: `if (this._resourceLoader === null)`
  const fetchRegex = /fetch\(url,\s*{\s*element,\s*onLoad,\s*onError\s*}\)\s*{/gm;
  src = src.replace(fetchRegex, `fetch(url, { element, onLoad, onError }) { if (this._resourceLoader === null) return null;`)

  // Write new src back to file
  fs.writeFileSync(filePath, src, 'utf-8');
}
catch (err) {}