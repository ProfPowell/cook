// REQUIRE
// -----------------------------
const cwd = process.cwd();
const browserSync = require('browser-sync').create('Dev Server');
const chalk = require('chalk');
const packageJSON = require('../package.json');
// const Logger = require('./utils/logger/logger.js');
const { execSync } = require('child_process');

// CONFIG
const {distPath,srcPath,startPath,watch,watchDefaults,watchReplace} = require('./utils/config/config.js');

// FILES TO WATCH
// The default file paths to watch
let watchFiles = watchDefaults;
// Did user add custom paths to `watch` in `/config/main.js`?
const userAddedWatch = watch && watch.length;
// If user set `watchReplace` option to TRUE, replace the defaults
if (watchReplace && userAddedWatch) watchFiles = watch;
// Otherwise, add their paths in addition to the defaults
else if (userAddedWatch) watchFiles = [...watchFiles, ...watch];

// INIT BROWSER-SYNC SERVER
// -----------------------------
browserSync.init({
  // Hide BrowserSync popup messages in UI
  notify: false,
  // Open the site in the browser automatically
  open: false,
  // The `localhost` port number to use (Defaults to `:3000`)
  port: packageJSON.config.devPort || 3000,
  // Where to serve `localhost` from (dev files)
  server: {
    baseDir: distPath,
    index: startPath,
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
    execSync('NODE_ENV=development npm run build', {stdio: 'inherit'});
    // Reload changed page
    const fileDist = file.replace(`${srcPath}/`, `${distPath}/`);
    browserSync.reload(fileDist);
  });
});