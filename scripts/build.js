// REQUIRE
// -----------------------------
const cwd = process.cwd();
const chalk = require('chalk');
const fs = require('fs-extra');
// const Logger = require('./utils/logger/logger.js');
// const Spinner = require('./utils/spinner/spinner.js');
// const {generatePages} = require('./utils/performance/performance');

// UTILS
const utils = require('./utils/util/util.js');
const {runFileLoop,updatePage} = utils;


// PLUGINS
// -----------------------------
// const babelify = require('./plugins/babelify');
const {bundleAdd, bundleBuild} = require('./plugins/bundle');
const copySrc = require('./plugins/copy-src');
const createDist = require('./plugins/create-dist');
const createDirFromFile = require('./plugins/create-dir-from-file');
const customPlugins = require('./plugins/custom-plugins');
const generateSitemap = require('./plugins/generate-sitemap-xml');
// const {compressAndNextGen, optimizeSVG, replaceImgTags} = require('./plugins/images.js');
const minifySrc = require('./plugins/minify-src');
const replaceInclude = require('./plugins/replace-include.js');
const replaceInline = require('./plugins/replace-inline.js');
const replaceMissingExternalLinkProtocol = require('./plugins/replace-external-link-protocol.js');
const replaceTemplateStrings = require('./plugins/replace-template-strings.js');
const setActiveLinks = require('./plugins/set-active-links.js');

// GET SOURCE
const {getDynamicFiles, getSrcConfig, getSrcFiles, getSrcImages} = require('./utils/get-src/get-src.js');

// CONFIG
// Combined user overrides on top of internal defaults
const config = require('./utils/config/config.js');
const {plugins} = config;

// INTERNAL BUILD DATA-STORE
const store = {
  // BUNDLE
  // Init bundle plugin by creating temporary array for the build process.
  // This will serve as a running cache so we don't bundle already-bundled files
  // in subsequent pages in the file loop.
  bundle: { css: {}, js: {}, },
  // Cache custom plugins after first lookup (require)
  plugins: {},
};

// USER'S DATA-STORE
// Get user's data config object. We pass it into plugins (when necessary) 
// so that additional data can be added to it from plugins instead of needing 
// to manually define everything from the start in `/config/data.js`
// Note: We init as empty object if user didn't create a `data.js` config file
const userDataPath = `${cwd}/config/data.js`;
const userDataPathExists = fs.existsSync(userDataPath);
const data = userDataPathExists ? require(userDataPath) : {};


// BUILD
// -----------------------------
// async function build() {

class Build {

  constructor() {}

  async init() {

    // Show init message
    console.log(`${ chalk.blue('\n[Build]') } ${ chalk.blue.bold('`npm run build`') }`);

    // PLUGIN: Create `/dist` if not already made
    await createDist();

    // PLUGIN: Copy `/src` to `/dist`
    await copySrc();

    // CUSTOM PLUGINS: Run custom user plugins before file loop
    await customPlugins({store, data, plugins: plugins.before, log: 'Before' });

    // THE IMAGES LOOP
    // getSrcImages(images => {
    //   images.forEach(image => {
    //     // PLUGIN: Optimize .svg files with SVGO
    //     if (optimizeSVGs) optimizeSVG(image, 'image');
    //     // PLUGIN: Optimize raster images (jpg, jpeg, png) and convert to webp
    //     if (optimizeImages) compressAndNextGen(image);
    //   });
    // });

    // GET THE ALLOWED FILES 
    let files = await getSrcFiles();
    
    // ADD ANY DYNAMICALLY-GENERATED PAGES
    // If pages were added in `this.data.dynamicPages` array, add them.
    // NOTE: Runs after `createDirFromFile()` since .html pages not created yet.
    files = getDynamicFiles(files);

    // PLUGIN: Convert allowed /dist .html file to directory
    await createDirFromFile({files, allowType: ['.html'] });

    // THE FILES LOOP
    await runFileLoop(files, fileLoop);
    async function fileLoop(fileName) {
      // Read and store the target file source.
      // We'll pass the string around between the plugins
      // then write back the updated/modified source to the file at the end
      let file = await getSrcConfig({fileName});

      // CUSTOM PLUGINS: Run custom user plugins during file loop
      await customPlugins({file, store, data, plugins: plugins.default});
      
      // PLUGIN: Render all ES6 template strings 
      replaceTemplateStrings({file, data, allowType: ['.html', '.json', '.webmanifest']});

      // PLUGIN: Add missing `http://` to user-added external link `[href]` values (`[href="www.xxxx.com"]`)
      await replaceMissingExternalLinkProtocol({file, allowType: ['.html']});
      
      // PLUGIN: Replace `[data-include]` in files
      await replaceInclude({file, store, allowType: ['.html']});

      // PLUGIN: Replace `[data-inline]` with external `<link>` and `<script>` tags
      await replaceInline({file, store, allowType: ['.html']});

      // PLUGIN: Replace <img> tags with <picture> elements
      // if (optimizeImages) replaceImgTags({file, allowType: ['.html']});

      // PLUGIN: Optimize inline <svg>'s with SVGO
      // if (optimizeSVGs) optimizeSVG(file, 'inline');

      // PLUGIN: Babelify standalone JS files
      // babelify({file, allowType: ['.js','.html']});
      
      // PLUGIN: Find `<a>` tags whose [href] value matches the current page (link active state)
      setActiveLinks({file, allowType: ['.html']});

      // PLUGIN: Compile grouped CSS or JS for bundling
      bundleAdd({file, store, allowType: ['.html']});

      // PLUGIN: Minify Source
      minifySrc({file, disallowType: ['.json', '.webmanifest']});
      
      // Write new, modified source back to the file
      await updatePage(file);

      return fileName;
    }

    // PLUGIN: Create `sitemap.xml` in the created `/dist` folder
    await generateSitemap();

    // PLUGIN: Build and create bundled file
    await bundleBuild({store});

    // CUSTOM PLUGINS: Run custom user plugins after file loop
    await customPlugins({store, data, plugins: plugins.after, log: 'After' });
  }

};

// Run build
(async () => await new Build().init())();
