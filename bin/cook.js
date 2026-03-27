#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const buildScript = path.resolve(__dirname, '..', 'scripts', 'build.js');
const devScript = path.resolve(__dirname, '..', 'scripts', 'dev.js');

const [,, command, ...args] = process.argv;

function showHelp() {
  console.log(`
cook-ssg v${pkg.version} — Static site generation the web platform way

Usage:
  cook build          Build the site (production)
  cook dev            Build + live-reload dev server
  cook dev --port N   Dev server on a custom port (default: 3000)
  cook --help         Show this help
  cook --version      Show version
`);
}

switch (command) {
  case 'build': {
    const env = { ...process.env, NODE_ENV: process.env.NODE_ENV || 'production' };
    execSync(`node "${buildScript}"`, { stdio: 'inherit', env });
    break;
  }

  case 'dev': {
    // Parse --port flag
    const portIdx = args.indexOf('--port');
    const port = portIdx !== -1 ? args[portIdx + 1] : undefined;
    const env = { ...process.env, NODE_ENV: 'development' };
    if (port) env.COOK_DEV_PORT = port;

    // Run build first, then start dev server
    execSync(`node "${buildScript}"`, { stdio: 'inherit', env });
    execSync(`node "${devScript}"`, { stdio: 'inherit', env });
    break;
  }

  case '--version':
  case '-v':
    console.log(pkg.version);
    break;

  case '--help':
  case '-h':
  case undefined:
    showHelp();
    break;

  default:
    console.error(`Unknown command: ${command}`);
    showHelp();
    process.exit(1);
}
