export default {
  distPath: 'dist',
  srcPath: 'src',

  // Layouts and includes are templates only, never published as pages.
  buildOnlyPaths: ['layouts', 'includes'],

  // HTML pages in src/posts/ (what Vanilla Press writes) form collections.posts.
  collections: { html: true },
};
