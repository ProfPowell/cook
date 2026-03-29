/**
 * @file prerender-code-blocks.js
 * @description Pre-render <code-block> elements with Declarative Shadow DOM
 * at build time using @profpowell/code-block/ssr.
 *
 * Runs AFTER the base64 restore step in build.js so code-block content
 * is already decoded. Replaces each <code-block> with a DSD-powered
 * version containing pre-highlighted code — zero client-side highlighting needed.
 *
 * Skips blocks with `src` attribute (runtime-loaded) and blocks already
 * marked with `data-ssr`.
 */

// IMPORTS
// -----------------------------
import { prerenderCodeBlocksInHtml } from '@profpowell/code-block/ssr'
import Util from '../utils/util/util.js'


// DEFINE
// -----------------------------
class PrerenderCodeBlocks {
  constructor({ file, allowType, disallowType }) {
    this.opts = { file, allowType, disallowType }
    this.file = file
  }

  async init() {
    const allowed = Util.isAllowedType(this.opts)
    if (!allowed) return

    // Early exit if no code-block elements present
    if (!this.file.src.includes('<code-block')) return

    this.file.src = prerenderCodeBlocksInHtml(this.file.src)
  }

  static async export(opts) {
    return new PrerenderCodeBlocks(opts).init()
  }
}

export default PrerenderCodeBlocks.export
