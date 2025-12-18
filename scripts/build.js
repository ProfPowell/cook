// IMPORTS
// -----------------------------
import chalk from 'chalk';
import fs from 'fs-extra';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// UTILS
import Util, { runFileLoop, updatePage } from './utils/util/util.js';

// PLUGINS
// -----------------------------
import { bundleAdd, bundleBuild } from './plugins/bundle.js';
import copySrc from './plugins/copy-src.js';
import createDist from './plugins/create-dist.js';
import createDirFromFile from './plugins/create-dir-from-file.js';
import customPlugins from './plugins/custom-plugins.js';
import generateSitemap from './plugins/generate-sitemap-xml.js';
import minifySrc from './plugins/minify-src.js';
import processMarkdown from './plugins/process-markdown.js';
import repeatCollection from './plugins/repeat-collection.js';
import replaceComponents from './plugins/replace-components.js';
import replaceInclude from './plugins/replace-include.js';
import replaceInline from './plugins/replace-inline.js';
import replaceMissingExternalLinkProtocol from './plugins/replace-external-link-protocol.js';
import replaceTemplateStrings from './plugins/replace-template-strings.js';
import setActiveLinks from './plugins/set-active-links.js';

// GET SOURCE
import { getDynamicFiles, getSrcConfig, getSrcFiles } from './utils/get-src/get-src.js';

// CONFIG
// Combined user overrides on top of internal defaults
import config, { plugins } from './utils/config/config.js';

const cwd = process.cwd();

// INTERNAL BUILD DATA-STORE
const store = {
  // BUNDLE
  // Init bundle plugin by creating temporary array for the build process.
  // This will serve as a running cache so we don't bundle already-bundled files
  // in subsequent pages in the file loop.
  bundle: { css: {}, js: {}, },
  // Cache custom plugins after first lookup (import)
  plugins: {},
};

// USER'S DATA-STORE
// Get user's data config object. We pass it into plugins (when necessary)
// so that additional data can be added to it from plugins instead of needing
// to manually define everything from the start in `/config/data.js`
// Note: We init as empty object if user didn't create a `data.js` config file
const userDataPath = `${cwd}/config/data.js`;
const userDataPathExists = existsSync(userDataPath);
let data = {};
if (userDataPathExists) {
  const dataModule = await import(pathToFileURL(userDataPath));
  data = dataModule.default || dataModule;
}


// BUILD
// -----------------------------

class Build {

  constructor() {}

  async init() {

    // Show init message
    console.log(`${ chalk.blue('\n[Build]') } ${ chalk.blue.bold('`npm run build`') }`);

    // PLUGIN: Create `/dist` if not already made
    await createDist();

    // PLUGIN: Copy `/src` to `/dist`
    await copySrc();

    // PLUGIN: Process markdown files (.md -> .html)
    await processMarkdown({store, data});

    // CUSTOM PLUGINS: Run custom user plugins before file loop
    await customPlugins({store, data, plugins: plugins.before, log: 'Before' });

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

      // PLUGIN: Repeat elements for each item in a collection
      await repeatCollection({file, data, store, allowType: ['.html']});

      // PLUGIN: Add missing `http://` to user-added external link `[href]` values (`[href="www.xxxx.com"]`)
      await replaceMissingExternalLinkProtocol({file, allowType: ['.html']});

      // PLUGIN: Replace `[data-include]` in files
      await replaceInclude({file, store, allowType: ['.html']});

      // PLUGIN: Replace custom elements and data-component elements with templates
      await replaceComponents({file, store, data, allowType: ['.html']});

      // PLUGIN: Replace `[data-inline]` with external `<link>` and `<script>` tags
      await replaceInline({file, store, allowType: ['.html']});

      // PLUGIN: Find `<a>` tags whose [href] value matches the current page (link active state)
      setActiveLinks({file, allowType: ['.html']});

      // PLUGIN: Compile grouped CSS or JS for bundling
      bundleAdd({file, store, allowType: ['.html']});

      // PLUGIN: Minify Source
      await minifySrc({file, disallowType: ['.json', '.webmanifest']});

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

}

// Run build
(async () => await new Build().init())();
