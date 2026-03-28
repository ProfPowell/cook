export default {
  distPath: 'dist',
  srcPath: 'src',
  startPath: 'index.html',

  buildOnlyPaths: ['components', 'includes', 'layouts'],

  sitemap: {
    url: 'https://cook-ssg.dev',
    excludePaths: [/\/assets/, /^\/404.html/],
  },

  autoComponents: {
    enabled: true,
    cssOnly: [
      'layout-center', 'layout-grid', 'layout-card', 'layout-cover',
      'layout-stack', 'layout-cluster', 'layout-sidebar',
      'brand-mark',
    ],
  },

  dsd: {
    enabled: true,
    manifest: 'assets/vendor/vanilla-breeze/dsd-manifest.json',
  },

  components: {
    path: 'components',
  },

  formats: {
    markdown: true,
    json: true,
    llmsTxt: true,
    llmsFullTxt: true,
  },

  markdown: {
    layout: 'docs',
    layoutPath: 'layouts',
    collections: true,
    markedOptions: { gfm: true },
  },

  images: {
    enabled: true,
    widths: [320, 640, 960, 1280],
    formats: ['avif', 'webp'],
    quality: { avif: 60, webp: 75, jpeg: 80, png: 80 },
    sizes: '(min-width: 60rem) 960px, 100vw',
  },

  excludePaths: [
    /dist\/assets\/vendor/,
  ],

  minifyHtmlConfigCustom: {
    collapseWhitespace: true,
    removeAttributeQuotes: true,
    removeComments: true,
    removeRedundantAttributes: false,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    useShortDoctype: true,
    ignoreCustomFragments: [
      /<code-block[\s\S]*?<\/code-block>/,
      /<browser-window[\s\S]*?<\/browser-window>/,
    ],
  },
};
