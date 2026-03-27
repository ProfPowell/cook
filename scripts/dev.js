// IMPORTS
// -----------------------------
import browserSyncLib from 'browser-sync';
import chalk from 'chalk';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildScript = path.resolve(__dirname, 'build.js');

const browserSync = browserSyncLib.create('Dev Server');

// CONFIG
import { distPath, srcPath, startPath, fragments, watch, watchDefaults, watchReplace } from './utils/config/config.js';

// FILES TO WATCH
// The default file paths to watch
let watchFiles = watchDefaults;
// Did user add custom paths to `watch` in `/config/main.js`?
const userAddedWatch = watch && watch.length;
// If user set `watchReplace` option to TRUE, replace the defaults
if (watchReplace && userAddedWatch) watchFiles = watch;
// Otherwise, add their paths in addition to the defaults
else if (userAddedWatch) watchFiles = [...watchFiles, ...watch];


// CONTENT NEGOTIATION MIDDLEWARE
// -----------------------------
// Mirrors the Cloudflare Worker routing logic for local development.
// Serves fragments, markdown, and JSON based on request headers.
function contentNegotiationMiddleware(req, res, next) {
  const accept = req.headers['accept'] || '';
  const requestedWith = req.headers['x-requested-with'] || '';
  const url = req.url;

  // Fragment request (html-star navigation)
  if (requestedWith.toLowerCase() === 'htmlstar') {
    const fragmentFilename = (fragments && fragments.filename) || '_fragment.html';
    const basePath = url.replace(/\/$/, '') || '';
    const fragmentPath = `${basePath}/${fragmentFilename}`;
    const fullPath = path.resolve(`${distPath}${fragmentPath}`);
    if (existsSync(fullPath)) {
      req.url = fragmentPath;
      return next();
    }
  }

  // Markdown request
  if (accept.includes('text/markdown')) {
    const basePath = url.replace(/\/$/, '') || '';
    const mdPath = `/md${basePath}/index.md`;
    const fullPath = path.resolve(`${distPath}${mdPath}`);
    if (existsSync(fullPath)) {
      req.url = mdPath;
      return next();
    }
  }

  // JSON request (explicit, not browser default)
  if (accept.includes('application/json') && !accept.includes('text/html')) {
    const basePath = url.replace(/\/$/, '') || '';
    const jsonPath = `/api${basePath || '/index'}.json`;
    const fullPath = path.resolve(`${distPath}${jsonPath}`);
    if (existsSync(fullPath)) {
      req.url = jsonPath;
      return next();
    }
  }

  next();
}


// INIT BROWSER-SYNC SERVER
// -----------------------------
browserSync.init({
  // Hide BrowserSync popup messages in UI
  notify: false,
  // Open the site in the browser automatically
  open: false,
  // The `localhost` port number to use (Defaults to `:3000`)
  port: parseInt(process.env.COOK_DEV_PORT, 10) || 3000,
  // Where to serve `localhost` from (dev files)
  server: {
    baseDir: distPath,
    index: startPath,
    // Content negotiation middleware for fragment/markdown/JSON routing
    middleware: [contentNegotiationMiddleware],
  },
  // Automatically reload on `.css`, `.html`, and `.js` file changes
  //watch: true,
});
browserSync.emitter.on('init', () => {
  console.log(`\n${ chalk.blue('[Browsersync]') } ${ chalk.blue.bold('`npm run dev`') }\n`);
});

// WATCH DEV FILES FOR LIVERELOAD
// --------------------------------
// Watch changes to `/src` files and run the build process to copy
// to `/dist` equivalent. This way we can run livereload on `/dist` to
// view replaced includes, and to avoid mutating `/src` files directly.
watchFiles.forEach(path => {
  // Watch `/src` files for changes
  browserSync.watch(`${srcPath}${path}`).on('change', file => {
    // Store the changed file as an environment variable.
    // Then when we run the build process below,
    // we'll use this now-defined variable to dictate
    // whether the whole build process is run, or just against
    // this changed file.
    process.env.DEV_CHANGED_PAGE = file;
    // Run the build process
    execSync(`NODE_ENV=development node "${buildScript}"`, {stdio: 'inherit'});
    // Reload changed page
    const fileDist = file.replace(`${srcPath}/`, `${distPath}/`);
    browserSync.reload(fileDist);
  });
});
