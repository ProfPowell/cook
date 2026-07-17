/**
 * @file source-file.js
 * @description The per-page file object passed through the plugin
 * pipeline, with a lazily-synchronized string/DOM pair.
 *
 * Contract:
 * - String plugins read/write `file.src` exactly as before.
 * - DOM plugins call `Util.fileDom(file)` for a shared cached document
 *   and `Util.commitDom(file, dom)` when they mutate it.
 * - Serialization happens only when `src` is read AFTER a DOM mutation,
 *   and parsing only when `dom` is read after a `src` write — so a run
 *   of consecutive DOM plugins costs ONE parse and ONE serialize
 *   instead of a round trip per plugin.
 */

import Util from '../util/util.js';

class SourceFile {
  constructor({ path, ext, name, nameIfIndex, isDynamic }) {
    this.path = path;
    this.ext = ext;
    this.name = name;
    this.nameIfIndex = nameIfIndex;
    if (isDynamic) this.isDynamic = true;

    this._src = '';
    this._dom = null;
    this._domDirty = false;
  }

  /** The page source string. Reading flushes pending DOM mutations. */
  get src() {
    if (this._dom && this._domDirty) {
      this._src = Util.setSrc({ dom: this._dom });
      this._domDirty = false;
    }
    return this._src;
  }

  /** Writing the string invalidates any cached document. */
  set src(value) {
    this._src = value;
    this._dom = null;
    this._domDirty = false;
  }

  /** The parsed document (lazy, cached until src is written). */
  get dom() {
    if (!this._dom) {
      // `this.src` (not _src) so a pending dirty state can never leak —
      // by construction _dom is null here, so no flush occurs
      this._dom = Util.jsdom.dom({ src: this.src });
      this._domDirty = false;
    }
    return this._dom;
  }

  /** Mark the cached document as mutated; src serializes on next read. */
  markDomDirty() {
    this._domDirty = true;
  }
}

export { SourceFile };
