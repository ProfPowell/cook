# Cook Build System

[Getting Started](#user-content-getting-started) | [View/Run the site code](#user-content-viewrun-the-site-code) | [Environment Flags](#environment-flags) | 
[Build Process](#user-content-build-process) | [Deploying to Stage](#user-content-deploying-to-stage) | [Deploying to Live](#user-content-deploying-to-live) | [NPM Run Scripts](#npm-run-scripts)

---

## Getting Started

This document assumes your project is using the starter repo pattern [TBD]
<br>
If you have manually set your `/config/main.js` config file locations and/or your own `npm run xxxx` script calls, use those instead of the example versions below.

~~For a full walkthrough on changing the default config locations, view the tutorial. [TODO]~~

Run this in the terminal from your project's root:

```
npm install
npm run dev
```

This builds the site locally and runs it at `localhost:3000`, using BrowserSync for live reloading.

---

## View/Run the site code

There are different modes of viewing the site while working locally.

<details>
  <summary>Running <strong>development</strong> mode locally (live reload)</summary><br>

  To view your codebase locally, run `npm run dev`.

  1. This first runs `/node_modules/pathfinder/scripts/build.js`, which copies the `/src` files to `/dist`, and then modifies them per each the active build plugins.
  2. After the `/dist` folder files are built, `/node_modules/pathfinder/scripts/dev.js` runs, which starts the BrowserSync live-reload server.

  _[Note]:_ By default, files are not minified and link/script elements marked `[data-inline]` are not inlined (retain external file call).  
  This way, when using dev tools to inspect in `localhost`, you see the correct line numbers, etc.

  _[Note]:_ Some functionality may be enabled or disabled only in this environment. In `package.json`, we specify a node environment variable to designate development-mode: `NODE_ENV=development npm run build && node scripts/dev.js`.
  In the various build-plugin files, you'll then see some code affected via:<br>
  `if (process.env.NODE_ENV === 'development')`<br> 
  or<br> 
  `if (process.env.NODE_ENV !== 'development')`.
</details>

---

<details>
  <summary>Running <strong>production</strong> mode locally (http-server)</summary><br>

  To view the static, ready-for-production version of the site locally, run `npm run dev:prod`.

  Instead of running BrowserSync live-reload, it instead runs `http-server` to be a simple, static server. This has the benefit of not injecting the 2 scripts BrowserSync adds, and emulates how the site should look and behave on the production server (pure-static site pages).
</details>

---

<details>
  <summary>Running <strong>firebase serve</strong> mode locally</summary><br>

  To test firebase functionality locally, namely testing redirects in `firebase.json`, run the command `npm run dev:fb`. 

  This runs `firebase serve` against the `/dist` folder.
</details>

---

<details>
  <summary><strong>Production</strong> build only (no browser action)</summary><br>

  If you just need to build the `/dist` directory, run `npm run build:prod`.

  _[Note]:_ The above NPM run script is equivalent to: `NODE_ENV=production npm run build`.
</details>

For both development modes, `dev` (BrowserSync - live reload) and `dev:prod` (http-server), the localhost port should be the same. Check the current port value,
but by default it should be 3000: `localhost:3000`

&nbsp;

---

## Environment Flags

Some site processes do not need to run every time locally, or they only need to run during deployment, etc. To accommodate this, some features are gated behind Node environment variables.
Some are already added in the various `package.json`-style `npm run xxxx` script calls. Others you may need to manually add to the command line before running your desired Node command.

### Deployment Environments

We currently specify 2 environments via environment variables, `development` and `production`. We use these to enable or disable parts of the build process, either from the core build code or custom, user plugins.

In the terminal, most `npm run xxxx` scripts already set which environment to use. You may also manually set them if necessary, for example: `NODE_ENV=development npm run build`

In a custom build plugin, you may use them in conditionals: `if (process.env.NODE_ENV === 'development') ...`

_[Note]:_ There is a third env. value, `NODE_ENV=stage`, that has its own run script, `npm run build:stage`, in case you want to add/remove features when deployed to a Firebase stage project. 
Out-of-the-box, no internal build processes use this, but you are welcome to use it in your own custom-user build plugins.

&nbsp;

---

## Build Process

* Builds `/dist`
* Copies `/src` to `/dist`
* Runs any custom-user `before` plugins (runs once)
* Loops through each allowed file, modifying file contents per environment rules and plugin actions:
  * Runs any custom-user `default` plugins (all plugins run per file)
  * Replaces any found es6 template strings with their matching data from the data config reference source
  * Adds missing `http://` protocol to external links to avoid them being treated as internal, relative links
  * Replace include placeholders (`[data-include]`) with their target source
  * Replace inline placeholders (`[data-inline]`) with their target external source
  * Set <a> tags whose `[href]` matches the current-page url as 'active' (`class="active"`)
  * Set <a> tags whose `[href]` includes part of the current-page url as 'active' (`class="active-parent"`)
  * Store link/script files marked for bundling (`[bundle]`), and replace their 'old' DOM elements with the new bundled-file call
  * Minify the page source (production environments only)
  * ~~Optimizes images~~ (Todo)
  * ~~Optimizes SVG~~ (Todo)
  * ~~Uses Babel to convert ES6 to ES5~~ (Todo)
* Creates `sitemap.xml` file in `/dist`
* Create the bundled `.css` and `.js` files specified in the file loop.
* Runs any custom-user `after` plugins (runs once)

Many build settings can be set in the project's `/config/main.js` instead of trying to find them in the various build-plugin files.
