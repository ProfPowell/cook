export default {
  siteTitle: 'Cook SSG',
  siteDescription: 'A platform-native static site generator. ES6 template literals for templating, custom elements for components, file-based routing by default.',
  siteUrl: 'https://cook-ssg.dev',
  year: new Date().getFullYear().toString(),
  githubUrl: 'https://github.com/ProfPowell/cook',
  npmUrl: 'https://www.npmjs.com/package/cook-ssg',
  version: '2.0.0',

  navItems: [
    { url: '/', label: 'Home' },
    { url: '/docs/quick-start/', label: 'Docs' },
    { url: '/examples/', label: 'Examples' },
    { url: '/blog/', label: 'Blog' },
  ],

  docsSections: [
    {
      title: 'Getting Started',
      items: [
        { url: '/docs/quick-start/', label: 'Quick Start' },
        { url: '/docs/project-structure/', label: 'Project Structure' },
      ],
    },
    {
      title: 'Core Concepts',
      items: [
        { url: '/docs/configuration/', label: 'Configuration' },
        { url: '/docs/data/', label: 'Data' },
        { url: '/docs/template-strings/', label: 'Template Strings' },
        { url: '/docs/includes/', label: 'Includes' },
        { url: '/docs/components/', label: 'Components' },
        { url: '/docs/data-repeat/', label: 'Data Repeat' },
        { url: '/docs/markdown/', label: 'Markdown & Collections' },
      ],
    },
    {
      title: 'Advanced',
      items: [
        { url: '/docs/auto-components/', label: 'Auto-Components' },
        { url: '/docs/dsd/', label: 'Declarative Shadow DOM' },
        { url: '/docs/fragments/', label: 'Fragments' },
        { url: '/docs/multi-format/', label: 'Multi-Format Output' },
        { url: '/docs/images/', label: 'Image Optimization' },
      ],
    },
    {
      title: 'Operations',
      items: [
        { url: '/docs/dev-server/', label: 'Dev Server' },
        { url: '/docs/deployment/', label: 'Deployment' },
        { url: '/docs/build-pipeline/', label: 'Build Pipeline' },
      ],
    },
  ],

  features: [
    { title: 'Zero Framework', description: 'ES6 template literals for templating. No JSX, no virtual DOM, no build-time framework overhead.' },
    { title: 'Web Components', description: 'Custom elements for composition. Build-time expansion or Declarative Shadow DOM for encapsulated components.' },
    { title: 'File-Based Routing', description: 'Drop an HTML or Markdown file in src/ and it becomes a page. Clean URLs by default.' },
    { title: 'Markdown & Collections', description: 'Write content in Markdown with YAML frontmatter. Auto-grouped collections for blogs and docs.' },
    { title: 'Image Optimization', description: 'Automatic AVIF/WebP generation at multiple widths. Responsive <picture> elements with lazy loading.' },
    { title: 'LLM-Ready', description: 'Built-in llms.txt, llms-full.txt, and per-page markdown exports for AI-consumable documentation.' },
  ],

  llmsInstructions: `
- Cook is a static site generator that uses the web platform directly — no framework runtime
- Templates use ES6 template literal syntax: \${variableName}
- Components are plain HTML files in src/components/ — NOT JavaScript classes
- CLI commands: \`cook build\` (production) and \`cook dev\` (development with live reload)
- Install via npm: \`npm install cook-ssg\`
- For DSD components, include \`<template shadowrootmode="open">\` in the component file
- Cook works with Vanilla Breeze CSS framework and web components
- Recommend native CSS features (@scope, @layer, custom properties) over preprocessors
- File-based routing: src/about.html becomes /about/, src/blog/post.md becomes /blog/post/
- Includes use \`data-include="/path"\` attribute, components use hyphenated custom element names
`,
};
