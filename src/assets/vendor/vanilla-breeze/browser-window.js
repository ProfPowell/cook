const w = /* @__PURE__ */ new Set();
let l = null, m = null;
function p() {
  const i = document.documentElement, e = document.body;
  if (!i || !e) return null;
  if (i.classList.contains("dark") || e.classList.contains("dark") || i.getAttribute("data-theme") === "dark" || e.getAttribute("data-theme") === "dark")
    return !0;
  if (i.getAttribute("data-theme") === "light" || e.getAttribute("data-theme") === "light")
    return !1;
  if (i.getAttribute("data-bs-theme") === "dark" || e.getAttribute("data-bs-theme") === "dark")
    return !0;
  if (i.getAttribute("data-bs-theme") === "light" || e.getAttribute("data-bs-theme") === "light")
    return !1;
  const t = getComputedStyle(i).colorScheme;
  return t === "dark" ? !0 : t === "light" ? !1 : null;
}
function y() {
  const i = p();
  if (i !== m) {
    m = i;
    for (const e of w)
      e._onPageModeChange(i);
  }
}
function k() {
  if (l) return;
  l = new MutationObserver(y);
  const i = {
    attributes: !0,
    attributeFilter: ["class", "data-theme", "data-bs-theme", "style"]
  };
  l.observe(document.documentElement, i), document.body && l.observe(document.body, i);
}
function S() {
  l && (l.disconnect(), l = null);
}
function z(i) {
  w.add(i), w.size === 1 && k();
  const e = p();
  m = e, i._onPageModeChange(e);
}
function C(i) {
  w.delete(i), w.size === 0 && (S(), m = null);
}
const g = {
  "iphone-16": {
    width: 393,
    height: 852,
    bezel: 12,
    notch: "dynamic-island",
    cornerRadius: 55,
    homeIndicator: !0,
    homeButton: !1,
    safeInsets: [59, 0, 34, 0]
  },
  "iphone-16-pro-max": {
    width: 440,
    height: 956,
    bezel: 12,
    notch: "dynamic-island",
    cornerRadius: 55,
    homeIndicator: !0,
    homeButton: !1,
    safeInsets: [59, 0, 34, 0]
  },
  "iphone-se": {
    width: 375,
    height: 667,
    bezel: 12,
    notch: "none",
    cornerRadius: 0,
    homeIndicator: !1,
    homeButton: !0,
    safeInsets: [20, 0, 0, 0]
  },
  "pixel-9": {
    width: 412,
    height: 923,
    bezel: 10,
    notch: "punch-hole",
    cornerRadius: 48,
    homeIndicator: !0,
    homeButton: !1,
    safeInsets: [48, 0, 24, 0]
  },
  "pixel-9-pro-xl": {
    width: 448,
    height: 998,
    bezel: 10,
    notch: "punch-hole",
    cornerRadius: 48,
    homeIndicator: !0,
    homeButton: !1,
    safeInsets: [48, 0, 24, 0]
  },
  "galaxy-s24": {
    width: 360,
    height: 780,
    bezel: 10,
    notch: "punch-hole",
    cornerRadius: 40,
    homeIndicator: !0,
    homeButton: !1,
    safeInsets: [48, 0, 24, 0]
  },
  "ipad-air": {
    width: 820,
    height: 1180,
    bezel: 16,
    notch: "none",
    cornerRadius: 18,
    homeIndicator: !0,
    homeButton: !1,
    safeInsets: [24, 0, 20, 0]
  },
  "ipad-pro-13": {
    width: 1032,
    height: 1376,
    bezel: 16,
    notch: "none",
    cornerRadius: 18,
    homeIndicator: !0,
    homeButton: !1,
    safeInsets: [24, 0, 20, 0]
  },
  "ipad-mini": {
    width: 744,
    height: 1133,
    bezel: 16,
    notch: "none",
    cornerRadius: 18,
    homeIndicator: !0,
    homeButton: !1,
    safeInsets: [24, 0, 20, 0]
  }
}, v = {
  midnight: "#1a1a1a",
  silver: "#c0c0c0",
  gold: "#d4a574",
  blue: "#3a4f6f",
  white: "#f0f0f0"
}, M = {
  "dynamic-island": 54,
  "punch-hole": 36,
  none: 24
}, _ = 28, x = 80;
class L extends HTMLElement {
  constructor() {
    super(), this.attachShadow({ mode: "open" }), this.isMinimized = !1, this.isMaximized = !1, this.overlay = null, this.showSource = !1, this.sourceCode = "", this.showShareMenu = !1, this.handleKeydown = this.handleKeydown.bind(this), this.handleOutsideClick = this.handleOutsideClick.bind(this), this._resizeObserver = null, this._currentScale = 1;
  }
  async connectedCallback() {
    this.render(), this.attachEventListeners(), this.src && await this.fetchSourceCode(), z(this), this._getDevicePreset() && this._setupDeviceScaling();
  }
  disconnectedCallback() {
    C(this), this.removeOverlay(), this._teardownDeviceScaling(), document.removeEventListener("keydown", this.handleKeydown), document.removeEventListener("click", this.handleOutsideClick);
  }
  static get observedAttributes() {
    return [
      "url",
      "title",
      "mode",
      "shadow",
      "src",
      "device",
      "device-color",
      "orientation",
      "show-safe-areas"
    ];
  }
  attributeChangedCallback(e) {
    this.shadowRoot && (this.render(), this.attachEventListeners()), (e === "device" || e === "orientation") && (this._teardownDeviceScaling(), this._getDevicePreset() && this._setupDeviceScaling()), e === "mode" && (this.hasAttribute("mode") ? this.removeAttribute("data-page-mode") : this._onPageModeChange(p()));
  }
  get url() {
    return this.getAttribute("url") || "";
  }
  get src() {
    return this.getAttribute("src") || "";
  }
  get browserTitle() {
    return this.getAttribute("title") || this.getHostname();
  }
  get mode() {
    return this.getAttribute("mode") || this.getAttribute("data-page-mode") || "light";
  }
  get device() {
    return this.getAttribute("device") || "";
  }
  get deviceColor() {
    return this.getAttribute("device-color") || "midnight";
  }
  _getDevicePreset() {
    const e = this.getAttribute("device");
    if (!e) return null;
    const t = g[e];
    return t || (console.warn(
      `<browser-window>: Unknown device preset "${e}", falling back to "iphone-16"`
    ), g["iphone-16"]);
  }
  _getEffectiveDimensions(e) {
    const t = this.getAttribute("orientation") === "landscape";
    return {
      width: t ? e.height : e.width,
      height: t ? e.width : e.height
    };
  }
  _getEffectiveSafeInsets(e) {
    const [t, o, r, s] = e.safeInsets;
    return this.getAttribute("orientation") === "landscape" ? [s, t, o, r] : [t, o, r, s];
  }
  _onPageModeChange(e) {
    if (this.hasAttribute("mode")) {
      this.removeAttribute("data-page-mode");
      return;
    }
    e === !0 ? this.setAttribute("data-page-mode", "dark") : e === !1 ? this.setAttribute("data-page-mode", "light") : this.removeAttribute("data-page-mode"), this._syncIframeColorScheme();
  }
  _syncIframeColorScheme() {
    const e = this.shadowRoot?.querySelector("iframe");
    if (!e) return;
    const t = this.mode === "dark";
    try {
      const o = e.contentDocument;
      o?.documentElement && (o.documentElement.style.colorScheme = t ? "dark" : "light");
    } catch {
    }
  }
  _injectSafeAreas(e) {
    const t = this._getDevicePreset();
    if (t)
      try {
        const o = e.contentDocument;
        if (!o) return;
        const r = o.querySelector("style[data-browser-window-safe-areas]");
        r && r.remove();
        const [s, c, n, d] = this._getEffectiveSafeInsets(t), a = o.createElement("style");
        a.setAttribute("data-browser-window-safe-areas", ""), a.textContent = `
        :root {
          --safe-top: ${s}px;
          --safe-right: ${c}px;
          --safe-bottom: ${n}px;
          --safe-left: ${d}px;
        }
      `, o.head.appendChild(a);
      } catch {
        console.info("<browser-window>: Cannot inject safe areas into cross-origin iframe");
      }
  }
  get hasShadow() {
    return this.hasAttribute("shadow");
  }
  getHostname() {
    try {
      return new URL(this.url).hostname;
    } catch {
      return this.url;
    }
  }
  attachEventListeners() {
    const e = this.shadowRoot.querySelector(".control-button.close"), t = this.shadowRoot.querySelector(".control-button.minimize"), o = this.shadowRoot.querySelector(".control-button.maximize"), r = this.shadowRoot.querySelector(".view-source-button"), s = this.shadowRoot.querySelector(".copy-source-button"), c = this.shadowRoot.querySelector(".share-button"), n = this.shadowRoot.querySelector(".browser-header");
    e?.addEventListener("click", () => this.handleClose()), t?.addEventListener("click", () => this.toggleMinimize()), o?.addEventListener("click", () => this.toggleMaximize()), r?.addEventListener("click", () => this.toggleViewSource()), s?.addEventListener("click", () => this.copySourceCode()), c?.addEventListener("click", (a) => {
      a.stopPropagation(), this.toggleShareMenu();
    }), n?.addEventListener("dblclick", (a) => {
      const h = a.target;
      (h.classList.contains("browser-header") || h.classList.contains("controls")) && this.toggleMaximize();
    });
    const d = this.shadowRoot.querySelector("iframe");
    d?.addEventListener("error", () => this.handleIframeError()), d?.addEventListener("load", () => {
      this._syncIframeColorScheme(), this._getDevicePreset() && this._injectSafeAreas(d);
    });
  }
  handleIframeError() {
    const e = this.shadowRoot.querySelector(".browser-content");
    e && (e.innerHTML = `
      <div class="error-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>Failed to load content</p>
        <button class="retry-button" onclick="this.getRootNode().host.retryLoad()">Retry</button>
      </div>
    `);
  }
  retryLoad() {
    const e = this.shadowRoot.querySelector(".browser-content");
    if (!e || !this.src) return;
    e.innerHTML = `<iframe src="${this.escapeHtml(this.src)}" loading="lazy"></iframe>`;
    const t = e.querySelector("iframe");
    t?.addEventListener("error", () => this.handleIframeError()), t?.addEventListener("load", () => this._syncIframeColorScheme());
  }
  async fetchSourceCode() {
    if (this.src)
      try {
        const e = await fetch(this.src);
        e.ok && (this.sourceCode = await e.text());
      } catch (e) {
        console.error("Failed to fetch source code:", e), this.sourceCode = "// Failed to load source code";
      }
  }
  toggleViewSource() {
    this.showSource = !this.showSource, this.updateContentView();
  }
  updateContentView() {
    const e = this.shadowRoot.querySelector(".browser-content"), t = this.shadowRoot.querySelector(".view-source-button");
    e && (this.showSource ? (e.innerHTML = `
        <div class="source-view">
          <div class="source-header">
            <span class="source-label">Source Code</span>
            <button class="copy-source-button" title="Copy source code">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="5" y="5" width="9" height="9" rx="1"/>
                <path d="M3 11V3a1 1 0 011-1h8"/>
              </svg>
              Copy
            </button>
          </div>
          <pre><code>${this.escapeHtml(this.sourceCode)}</code></pre>
        </div>
      `, t.classList.add("active"), e.querySelector(".copy-source-button")?.addEventListener("click", () => this.copySourceCode())) : (this.src ? (e.innerHTML = `<iframe src="${this.escapeHtml(this.src)}" loading="lazy"></iframe>`, e.querySelector("iframe")?.addEventListener("load", () => this._syncIframeColorScheme())) : e.innerHTML = "<slot></slot>", t.classList.remove("active")));
  }
  async copySourceCode() {
    if (this.sourceCode)
      try {
        await navigator.clipboard.writeText(this.sourceCode);
        const e = this.shadowRoot.querySelector(".copy-source-button");
        if (e) {
          const t = e.innerHTML;
          e.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3,8 6,11 13,4"/>
          </svg>
          Copied!
        `, e.classList.add("copied"), setTimeout(() => {
            e.innerHTML = t, e.classList.remove("copied");
          }, 2e3);
        }
      } catch (e) {
        console.error("Failed to copy source code:", e);
      }
  }
  toggleShareMenu() {
    this.showShareMenu = !this.showShareMenu;
    const e = this.shadowRoot.querySelector(".share-menu"), t = this.shadowRoot.querySelector(".share-button");
    this.showShareMenu ? (e.style.display = "block", t.classList.add("active"), setTimeout(() => {
      document.addEventListener("click", this.handleOutsideClick);
    }, 0)) : (e.style.display = "none", t.classList.remove("active"), document.removeEventListener("click", this.handleOutsideClick));
  }
  handleOutsideClick(e) {
    const t = this.shadowRoot.querySelector(".share-menu");
    t && !t.contains(e.target) && this.toggleShareMenu();
  }
  async shareViaWebAPI() {
    if (!navigator.share) {
      console.warn("Web Share API not supported");
      return;
    }
    const e = {
      title: this.browserTitle || "CSS Demo",
      text: `Check out this CSS demo: ${this.browserTitle}`,
      url: this.src || this.url
    };
    try {
      await navigator.share(e), this.toggleShareMenu();
    } catch (t) {
      t.name !== "AbortError" && console.error("Error sharing:", t);
    }
  }
  parseHTMLForCodePen() {
    if (!this.sourceCode) return null;
    const t = new DOMParser().parseFromString(this.sourceCode, "text/html"), o = Array.from(t.querySelectorAll("style")).map((n) => n.textContent).join(`

`), r = Array.from(t.querySelectorAll("script")).filter((n) => !n.src && n.type !== "module").map((n) => n.textContent).join(`

`), s = t.body.cloneNode(!0);
    return s.querySelectorAll("script, style").forEach((n) => n.remove()), {
      html: s.innerHTML.trim(),
      css: o.trim(),
      js: r.trim()
    };
  }
  openInCodePen() {
    const e = this.parseHTMLForCodePen();
    if (!e) return;
    const t = {
      title: this.browserTitle || "CSS Demo",
      description: `Demo from ${this.url}`,
      html: e.html,
      css: e.css,
      js: e.js,
      editors: "110"
      // Show HTML and CSS editors, hide JS if empty
    }, o = document.createElement("form");
    o.action = "https://codepen.io/pen/define", o.method = "POST", o.target = "_blank";
    const r = document.createElement("input");
    r.type = "hidden", r.name = "data", r.value = JSON.stringify(t), o.appendChild(r), document.body.appendChild(o), o.submit(), document.body.removeChild(o), this.toggleShareMenu();
  }
  handleClose() {
    this.isMaximized && this.toggleMaximize();
  }
  handleKeydown(e) {
    e.key === "Escape" && (this.showShareMenu ? this.toggleShareMenu() : this.isMaximized && this.toggleMaximize());
  }
  createOverlay() {
    if (this.overlay) return;
    this.overlay = document.createElement("div"), this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.5);
      z-index: 9998;
      cursor: pointer;
      animation: fadeIn 200ms ease;
    `;
    const e = document.createElement("style");
    e.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `, document.head.appendChild(e), this.overlay.addEventListener("click", () => this.toggleMaximize()), document.body.appendChild(this.overlay), document.addEventListener("keydown", this.handleKeydown);
  }
  removeOverlay() {
    this.overlay && (this.overlay.remove(), this.overlay = null), document.removeEventListener("keydown", this.handleKeydown);
  }
  toggleMinimize() {
    const e = this.shadowRoot.querySelector(".browser-content");
    e && (this.isMinimized = !this.isMinimized, this.isMinimized ? (this.isMaximized && this.toggleMaximize(), e.style.display = "none") : e.style.display = "");
  }
  toggleMaximize() {
    const e = this.shadowRoot.querySelector(".control-button.maximize");
    if (this.isMaximized) {
      this.classList.remove("browser-window-maximized"), this.removeAttribute("role"), this.removeAttribute("aria-modal");
      const t = this.shadowRoot.querySelector("iframe");
      t && (t.style.minHeight = ""), this.removeOverlay(), this.isMaximized = !1, e && (e.setAttribute("aria-label", "Maximize window"), e.setAttribute("aria-expanded", "false"));
    } else {
      this.isMinimized && this.toggleMinimize(), this.createOverlay(), this.classList.add("browser-window-maximized"), this.setAttribute("role", "dialog"), this.setAttribute("aria-modal", "true");
      const t = this.shadowRoot.querySelector("iframe");
      t && (t.style.minHeight = "calc(90vh - 50px)"), this.isMaximized = !0, e && (e.setAttribute("aria-label", "Restore window"), e.setAttribute("aria-expanded", "true"));
    }
  }
  // --- Render pipeline ---
  render() {
    const e = this._getDevicePreset(), t = e ? this._deviceCSS(e) : this._browserCSS(), o = e ? this._deviceChrome(e) : this._browserChrome();
    this.shadowRoot.innerHTML = `
      <style>${this._sharedCSS()}${t}</style>
      ${o}
      ${e ? "" : this._contentHTML()}
    `, e && this._updateDeviceScale();
  }
  _sharedCSS() {
    return `
        :host {
          /* CSS Custom Properties with light mode defaults */
          --browser-window-bg: #ffffff;
          --browser-window-header-bg: #f6f8fa;
          --browser-window-border-color: #d1d5da;
          --browser-window-border-radius: 8px;
          --browser-window-text-color: #24292e;
          --browser-window-text-muted: #586069;
          --browser-window-url-bg: #ffffff;
          --browser-window-shadow: ${this.hasShadow ? "0 4px 12px rgba(0, 0, 0, 0.15)" : "none"};
          --browser-window-close-color: #ff5f57;
          --browser-window-minimize-color: #febc2e;
          --browser-window-maximize-color: #28c840;
          --browser-window-accent-color: #2563eb;
          --browser-window-hover-bg: #f3f4f6;
          --browser-window-active-bg: #dbeafe;
          --browser-window-content-bg: #ffffff;
          --browser-window-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          --browser-window-mono-font: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;

          display: flex;
          flex-direction: column;
          margin: 1rem 0;
          border-radius: var(--browser-window-border-radius);
          overflow: hidden;
          border: 1px solid var(--browser-window-border-color);
          background: var(--browser-window-bg);
          box-shadow: var(--browser-window-shadow);
          transition: all 250ms ease-out;
          font-family: var(--browser-window-font-family);
          color: var(--browser-window-text-color);
          color-scheme: light;

          /* Resizable container */
          resize: both;
          min-width: 280px;
          min-height: 150px;

        }

        /* Auto dark mode based on system preference (when no mode attribute) */
        @media (prefers-color-scheme: dark) {
          :host(:not([mode])) {
            --browser-window-bg: #1c1c1e;
            --browser-window-header-bg: #2c2c2e;
            --browser-window-border-color: #3a3a3c;
            --browser-window-text-color: #e5e5e7;
            --browser-window-text-muted: #98989d;
            --browser-window-url-bg: #1c1c1e;
            --browser-window-hover-bg: #3a3a3c;
            --browser-window-content-bg: #000000;
            color-scheme: dark;
          }
        }

        /* Page-level dark mode detection (overrides media query via higher specificity) */
        :host([data-page-mode="dark"]:not([mode])) {
          --browser-window-bg: #1c1c1e;
          --browser-window-header-bg: #2c2c2e;
          --browser-window-border-color: #3a3a3c;
          --browser-window-text-color: #e5e5e7;
          --browser-window-text-muted: #98989d;
          --browser-window-url-bg: #1c1c1e;
          --browser-window-hover-bg: #3a3a3c;
          --browser-window-content-bg: #000000;
          color-scheme: dark;
        }

        :host([data-page-mode="light"]:not([mode])) {
          --browser-window-bg: #ffffff;
          --browser-window-header-bg: #f6f8fa;
          --browser-window-border-color: #d1d5da;
          --browser-window-text-color: #24292e;
          --browser-window-text-muted: #586069;
          --browser-window-url-bg: #ffffff;
          --browser-window-hover-bg: #f3f4f6;
          --browser-window-content-bg: #ffffff;
          color-scheme: light;
        }

        /* Explicit dark mode override */
        :host([mode="dark"]) {
          --browser-window-bg: #1c1c1e;
          --browser-window-header-bg: #2c2c2e;
          --browser-window-border-color: #3a3a3c;
          --browser-window-text-color: #e5e5e7;
          --browser-window-text-muted: #98989d;
          --browser-window-url-bg: #1c1c1e;
          --browser-window-hover-bg: #3a3a3c;
          --browser-window-content-bg: #000000;
          color-scheme: dark;
        }

        /* Explicit light mode override (for users on dark system who want light) */
        :host([mode="light"]) {
          --browser-window-bg: #ffffff;
          --browser-window-header-bg: #f6f8fa;
          --browser-window-border-color: #d1d5da;
          --browser-window-text-color: #24292e;
          --browser-window-text-muted: #586069;
          --browser-window-url-bg: #ffffff;
          --browser-window-hover-bg: #f3f4f6;
          --browser-window-content-bg: #ffffff;
          color-scheme: light;
        }

        :host(.browser-window-maximized) {
          position: fixed !important;
          top: 5vh !important;
          left: 5vw !important;
          width: 90vw !important;
          height: 90vh !important;
          z-index: 9999 !important;
          margin: 0 !important;
          resize: none !important;
        }

        @media (prefers-reduced-motion: reduce) {
          :host {
            transition: none;
          }
        }

        .browser-content {
          background: var(--browser-window-content-bg);
          min-height: 200px;
          padding: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        /* Slot fills available space */
        slot {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
        }

        /* Slotted content fills the slot */
        ::slotted(*) {
          flex: 1;
          width: 100%;
          min-height: 0;
        }

        iframe {
          display: block;
          width: 100%;
          border: none;
          flex: 1;
          min-height: 200px;
        }

        ::slotted(img),
        ::slotted(iframe) {
          display: block;
          border: none;
          margin: 0;
        }

        .source-view {
          padding: 0;
          background: var(--browser-window-header-bg);
          min-height: 200px;
          /* Constrain source view height to prevent container expansion */
          max-height: 50vh;
          flex: 1;
          overflow: auto;
          display: flex;
          flex-direction: column;
        }

        .source-header {
          position: sticky;
          top: 0;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1rem;
          background: var(--browser-window-header-bg);
          border-bottom: 1px solid var(--browser-window-border-color);
          backdrop-filter: blur(8px);
        }

        .source-label {
          font-weight: 600;
          font-size: 0.875rem;
          color: var(--browser-window-text-color);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .copy-source-button {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.375rem 0.75rem;
          background: var(--browser-window-bg);
          border: 1px solid var(--browser-window-border-color);
          border-radius: 6px;
          color: var(--browser-window-text-color);
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 150ms ease;
        }

        .copy-source-button:hover {
          background: var(--browser-window-hover-bg);
        }

        .copy-source-button:active {
          transform: scale(0.97);
        }

        .copy-source-button.copied {
          background: #10b981;
          border-color: #10b981;
          color: white;
        }

        .source-view pre {
          margin: 0;
          padding: 1rem;
          background: var(--browser-window-content-bg);
          border: 1px solid var(--browser-window-border-color);
          border-radius: 6px;
          overflow-x: auto;
          font-family: var(--browser-window-mono-font);
          font-size: 0.875rem;
          line-height: 1.6;
        }

        .source-view code {
          color: var(--browser-window-text-color);
          display: block;
          white-space: pre;
        }

        .error-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 3rem 1rem;
          text-align: center;
          color: var(--browser-window-text-muted);
          min-height: 200px;
        }

        .error-state svg {
          margin-bottom: 1rem;
          opacity: 0.5;
        }

        .error-state p {
          margin: 0 0 1rem 0;
          font-size: 0.875rem;
        }

        .retry-button {
          padding: 0.5rem 1rem;
          background: var(--browser-window-accent-color);
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 150ms ease;
        }

        .retry-button:hover {
          opacity: 0.9;
        }

        .retry-button:active {
          transform: scale(0.98);
        }
    `;
  }
  _browserCSS() {
    return `
        .browser-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          background: var(--browser-window-header-bg);
          border-bottom: 1px solid var(--browser-window-border-color);
          cursor: zoom-in;
          user-select: none;
        }

        :host(.browser-window-maximized) .browser-header {
          cursor: zoom-out;
        }

        .controls {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .control-button {
          /* Touch target size - transparent background */
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: none;
          background: transparent;
          cursor: pointer !important;
          transition: opacity 150ms ease;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: -8px;
        }

        /* Visual circle via pseudo-element */
        .control-button::after {
          content: '';
          width: 12px;
          height: 12px;
          border-radius: 50%;
          transition: opacity 150ms ease;
        }

        /* Larger touch targets on touch devices */
        @media (pointer: coarse) {
          .control-button {
            width: 44px;
            height: 44px;
            margin: -16px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .control-button {
            transition: none;
          }
          .control-button::after {
            transition: none;
          }
        }

        .control-button:hover::after {
          opacity: 0.8;
        }

        .control-button:active::after {
          opacity: 0.6;
          transform: scale(0.9);
        }

        .control-button:focus {
          outline: 2px solid var(--browser-window-accent-color);
          outline-offset: 2px;
        }

        .control-button:focus:not(:focus-visible) {
          outline: none;
        }

        .control-button.close::after {
          background: var(--browser-window-close-color);
        }

        .control-button.minimize::after {
          background: var(--browser-window-minimize-color);
        }

        .control-button.maximize::after {
          background: var(--browser-window-maximize-color);
        }

        .url-bar {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.375rem 0.75rem;
          background: var(--browser-window-url-bg);
          border: 1px solid var(--browser-window-border-color);
          border-radius: 6px;
          font-size: 0.875rem;
          color: var(--browser-window-text-muted);
          cursor: default !important;
        }

        .lock-icon {
          color: var(--browser-window-text-muted);
          font-size: 0.75rem;
        }

        .url-text {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--browser-window-text-muted);
        }

        .view-source-button,
        .download-button {
          background: none;
          border: none;
          cursor: pointer;
          padding: 0.25rem;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--browser-window-text-muted);
          transition: all 150ms ease;
          border-radius: 4px;
        }

        .view-source-button:hover,
        .download-button:hover {
          color: var(--browser-window-text-color);
          background: var(--browser-window-hover-bg);
        }

        .view-source-button:active,
        .download-button:active {
          transform: scale(0.95);
        }

        .view-source-button.active {
          color: var(--browser-window-accent-color);
          background: var(--browser-window-active-bg);
        }

        .download-icon {
          width: 16px;
          height: 16px;
        }

        .share-container {
          position: relative;
          display: inline-block;
        }

        .share-button {
          background: none;
          border: none;
          cursor: pointer;
          padding: 0.25rem;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--browser-window-text-muted);
          transition: all 150ms ease;
          border-radius: 4px;
        }

        .share-button:hover {
          color: var(--browser-window-text-color);
          background: var(--browser-window-hover-bg);
        }

        .share-button:active {
          transform: scale(0.95);
        }

        .share-button.active {
          color: var(--browser-window-accent-color);
          background: var(--browser-window-active-bg);
        }

        .share-menu {
          display: none;
          position: absolute;
          top: calc(100% + 4px);
          right: 0;
          background: var(--browser-window-header-bg);
          border: 1px solid var(--browser-window-border-color);
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          min-width: 180px;
          z-index: 1000;
          overflow: hidden;
        }

        .share-menu-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          width: 100%;
          padding: 0.625rem 1rem;
          background: none;
          border: none;
          color: var(--browser-window-text-color);
          font-size: 0.875rem;
          font-weight: 500;
          text-align: left;
          cursor: pointer;
          transition: background 150ms ease;
          border-bottom: 1px solid var(--browser-window-border-color);
        }

        .share-menu-item:last-child {
          border-bottom: none;
        }

        .share-menu-item:hover {
          background: var(--browser-window-hover-bg);
        }

        .share-menu-item:active {
          background: var(--browser-window-active-bg);
        }

        .share-menu-item svg {
          width: 16px;
          height: 16px;
          flex-shrink: 0;
        }

        /* Responsive: narrow screens */
        @media (max-width: 480px) {
          .browser-header {
            padding: 0.5rem 0.75rem;
            gap: 0.5rem;
          }

          .url-bar {
            padding: 0.25rem 0.5rem;
            font-size: 0.75rem;
          }

          .url-text {
            max-width: 120px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .view-source-button svg,
          .share-button svg {
            width: 14px;
            height: 14px;
          }
        }

        /* Very narrow: hide URL text */
        @media (max-width: 320px) {
          .url-text {
            display: none;
          }

          .lock-icon {
            display: none;
          }
        }

        /* Touch devices: larger button padding */
        @media (pointer: coarse) {
          .view-source-button,
          .share-button,
          .download-button {
            padding: 0.5rem;
            min-width: 44px;
            min-height: 44px;
          }

          .share-menu-item {
            padding: 0.875rem 1rem;
          }
        }
    `;
  }
  _browserChrome() {
    return `
      <div class="browser-header" role="toolbar" aria-label="Window controls">
        <div class="controls">
          <button class="control-button close" aria-label="Close window" tabindex="0"></button>
          <button class="control-button minimize" aria-label="Minimize window" tabindex="0"></button>
          <button class="control-button maximize" aria-label="${this.isMaximized ? "Restore window" : "Maximize window"}" aria-expanded="${this.isMaximized}" tabindex="0"></button>
        </div>
        <div class="url-bar">
          ${this.url.startsWith("https") ? '<span class="lock-icon">🔒</span>' : ""}
          <span class="url-text" title="${this.escapeHtml(this.url)}">${this.escapeHtml(this.browserTitle)}</span>
          ${this.src ? `
            <button class="view-source-button" title="View source code">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="4,6 2,8 4,10"/>
                <polyline points="12,6 14,8 12,10"/>
                <line x1="10" y1="4" x2="6" y2="12"/>
              </svg>
            </button>
            <div class="share-container">
              <button class="share-button" title="Share demo">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M8 12V3M8 3L5 6M8 3l3 3"/>
                  <path d="M3 9v4a1 1 0 001 1h8a1 1 0 001-1V9"/>
                </svg>
              </button>
              <div class="share-menu">
                ${navigator.share ? `
                  <button class="share-menu-item" onclick="this.getRootNode().host.shareViaWebAPI()">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="4" r="2"/>
                      <circle cx="4" cy="8" r="2"/>
                      <circle cx="12" cy="12" r="2"/>
                      <path d="M6 9l4 2M6 7l4-2"/>
                    </svg>
                    Share...
                  </button>
                ` : ""}
                <button class="share-menu-item" onclick="this.getRootNode().host.openInCodePen()">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 0L0 5v6l8 5 8-5V5L8 0zM7 10.5L2 7.5v-2l5 3v2zm1-3l-5-3L8 2l5 2.5-5 3zm1 3v-2l5-3v2l-5 3z"/>
                  </svg>
                  Open in CodePen
                </button>
              </div>
            </div>
            <a href="${this.escapeHtml(this.src)}" download class="download-button" title="Download demo HTML file">
              <svg class="download-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 1v10M8 11l-3-3M8 11l3-3"/>
                <path d="M2 12v2a1 1 0 001 1h10a1 1 0 001-1v-2"/>
              </svg>
            </a>
          ` : ""}
        </div>
      </div>
    `;
  }
  _contentHTML() {
    return `
      <div class="browser-content" part="content">
        ${this.src ? `<iframe src="${this.escapeHtml(this.src)}" loading="lazy"></iframe>` : "<slot></slot>"}
      </div>
    `;
  }
  // --- Device mode ---
  _deviceCSS(e) {
    const t = v[this.deviceColor] || v.midnight, o = this.getAttribute("orientation") === "landscape", r = this._getEffectiveDimensions(e), [s, c, n, d] = this._getEffectiveSafeInsets(e), a = M[e.notch] || 24, h = e.homeIndicator && !e.homeButton ? _ : 0, u = e.homeButton ? x : 0, b = e.notch !== "none";
    return `
        :host([device]) {
          --device-width: ${r.width}px;
          --device-height: ${r.height}px;
          --device-bezel: ${e.bezel}px;
          --device-corner-radius: ${e.cornerRadius}px;
          --browser-window-bezel-color: ${t};
          --status-bar-height: ${o && b ? 24 : a}px;
          --home-indicator-height: ${h}px;
          --home-button-area: ${u}px;
          --safe-top: ${s}px;
          --safe-right: ${c}px;
          --safe-bottom: ${n}px;
          --safe-left: ${d}px;

          border: none;
          border-radius: 0;
          resize: none;
          overflow: visible;
          background: transparent;
          box-shadow: none;
          min-width: 0;
          min-height: 0;
        }

        .device-wrapper {
          display: flex;
          justify-content: center;
          overflow: hidden;
          width: 100%;
        }

        .device-frame {
          display: flex;
          flex-direction: column;
          width: var(--device-width);
          height: var(--device-height);
          border: var(--device-bezel) solid var(--browser-window-bezel-color);
          border-radius: var(--device-corner-radius);
          overflow: hidden;
          position: relative;
          background: #000;
          flex-shrink: 0;
          transform-origin: top center;
        }

        .device-frame.home-button {
          padding-bottom: var(--home-button-area);
        }

        /* Landscape with notch: horizontal layout */
        .device-frame.landscape.dynamic-island,
        .device-frame.landscape.punch-hole {
          flex-direction: row;
        }

        .device-main {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 0;
          overflow: hidden;
        }

        /* Notch sidebar (landscape phones with notch) */
        .notch-sidebar {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          position: relative;
        }

        .notch-sidebar.dynamic-island {
          width: 59px;
        }

        .notch-sidebar.dynamic-island::before {
          content: '';
          width: 37px;
          height: 126px;
          background: var(--browser-window-bezel-color);
          border-radius: 19px;
        }

        .notch-sidebar.punch-hole {
          width: 48px;
        }

        .notch-sidebar.punch-hole::before {
          content: '';
          width: 12px;
          height: 12px;
          background: var(--browser-window-bezel-color);
          border-radius: 50%;
        }

        /* Status bar */
        .status-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 16px;
          height: var(--status-bar-height);
          position: relative;
          color: var(--browser-window-status-bar-color, rgba(255,255,255,0.9));
          font-size: 14px;
          font-weight: 600;
          flex-shrink: 0;
          z-index: 1;
          background: transparent;
        }

        .status-bar.dynamic-island {
          padding-top: 14px;
        }

        /* Dynamic Island pill (portrait only) */
        .status-bar.dynamic-island::before {
          content: '';
          position: absolute;
          top: 12px;
          left: 50%;
          transform: translateX(-50%);
          width: 126px;
          height: 37px;
          background: var(--browser-window-bezel-color);
          border-radius: 19px;
        }

        /* Punch-hole camera (portrait only) */
        .status-bar.punch-hole::before {
          content: '';
          position: absolute;
          top: 10px;
          left: 50%;
          transform: translateX(-50%);
          width: 12px;
          height: 12px;
          background: var(--browser-window-bezel-color);
          border-radius: 50%;
        }

        /* Home button (iPhone SE) */
        .device-frame.home-button::after {
          content: '';
          position: absolute;
          bottom: 16px;
          left: 50%;
          transform: translateX(-50%);
          width: 58px;
          height: 58px;
          border: 3px solid rgba(255, 255, 255, 0.15);
          border-radius: 50%;
          z-index: 1;
        }

        /* Home indicator pill */
        .home-indicator {
          display: flex;
          justify-content: center;
          align-items: center;
          height: var(--home-indicator-height);
          flex-shrink: 0;
        }

        .home-indicator-pill {
          width: 134px;
          height: 5px;
          background: var(--browser-window-home-indicator-color, rgba(255,255,255,0.3));
          border-radius: 3px;
        }

        /* Device mode content area */
        :host([device]) .browser-content {
          flex: 1;
          min-height: 0;
          overflow: hidden;
          background: var(--browser-window-content-bg);
        }

        :host([device]) .browser-content iframe {
          width: 100%;
          height: 100%;
          min-height: 0;
        }

        /* Status bar icons */
        .status-time {
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 0.5px;
          position: relative;
          z-index: 1;
        }

        .status-icons {
          display: flex;
          align-items: center;
          gap: 6px;
          position: relative;
          z-index: 1;
        }

        .signal-bars {
          display: inline-flex;
          align-items: flex-end;
          gap: 1px;
          height: 12px;
        }

        .signal-bars span {
          display: inline-block;
          width: 3px;
          background: currentColor;
          border-radius: 1px;
        }

        .signal-bars span:nth-child(1) { height: 4px; }
        .signal-bars span:nth-child(2) { height: 6px; }
        .signal-bars span:nth-child(3) { height: 8px; }
        .signal-bars span:nth-child(4) { height: 10px; }

        /* Wifi icon - dot with two arcs */
        .wifi-icon {
          display: inline-block;
          width: 3px;
          height: 3px;
          background: currentColor;
          border-radius: 50%;
          position: relative;
          margin: 0 5px;
          vertical-align: middle;
        }

        .wifi-icon::before {
          content: '';
          position: absolute;
          bottom: 3px;
          left: 50%;
          transform: translateX(-50%);
          width: 9px;
          height: 9px;
          border: 1.5px solid currentColor;
          border-color: currentColor transparent transparent;
          border-radius: 50%;
        }

        .wifi-icon::after {
          content: '';
          position: absolute;
          bottom: 6px;
          left: 50%;
          transform: translateX(-50%);
          width: 15px;
          height: 15px;
          border: 1.5px solid currentColor;
          border-color: currentColor transparent transparent;
          border-radius: 50%;
        }

        /* Battery icon */
        .battery-icon {
          display: inline-block;
          width: 22px;
          height: 10px;
          border: 1.5px solid currentColor;
          border-radius: 2px;
          position: relative;
          vertical-align: middle;
        }

        .battery-icon::before {
          /* Battery fill */
          content: '';
          position: absolute;
          top: 1.5px;
          left: 1.5px;
          right: 1.5px;
          bottom: 1.5px;
          background: currentColor;
          border-radius: 0.5px;
        }

        .battery-icon::after {
          /* Battery cap */
          content: '';
          position: absolute;
          right: -4px;
          top: 50%;
          transform: translateY(-50%);
          width: 2px;
          height: 5px;
          background: currentColor;
          border-radius: 0 1px 1px 0;
        }

        /* Light bezel: dark status bar text */
        .device-frame.light-bezel .status-bar {
          color: rgba(0, 0, 0, 0.8);
        }

        .device-frame.light-bezel .home-indicator-pill {
          background: rgba(0, 0, 0, 0.3);
        }

        .device-frame.light-bezel.home-button::after {
          border-color: rgba(0, 0, 0, 0.15);
        }

        /* Dark mode in device mode */
        :host([device][mode="dark"]) .browser-content,
        :host([device][data-page-mode="dark"]:not([mode])) .browser-content {
          background: #000000;
        }

        /* Safe area overlays */
        .safe-area-overlays {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: var(--home-button-area);
          pointer-events: none;
          z-index: 3;
        }

        .safe-area-overlay {
          position: absolute;
          background: var(--browser-window-safe-area-color, oklch(0.65 0.2 250 / 0.25));
        }

        .safe-area-top {
          top: 0;
          left: 0;
          right: 0;
          height: var(--safe-top);
        }

        .safe-area-right {
          top: 0;
          right: 0;
          bottom: 0;
          width: var(--safe-right);
        }

        .safe-area-bottom {
          bottom: 0;
          left: 0;
          right: 0;
          height: var(--safe-bottom);
        }

        .safe-area-left {
          top: 0;
          left: 0;
          bottom: 0;
          width: var(--safe-left);
        }
    `;
  }
  _deviceChrome(e) {
    const t = this.getAttribute("orientation") === "landscape", o = e.notch !== "none", r = o ? e.notch : "", s = e.homeButton ? "home-button" : "", n = ["silver", "gold", "white"].includes(this.deviceColor) ? "light-bezel" : "", a = ["device-frame", r, s, n, t ? "landscape" : ""].filter(Boolean).join(" "), u = `
      <div class="status-bar ${t && o ? "" : r}">
        <span class="status-time">9:41</span>
        <div class="status-icons">
          <span class="signal-bars" aria-hidden="true"><span></span><span></span><span></span><span></span></span>
          <span class="wifi-icon" aria-hidden="true"></span>
          <span class="battery-icon" aria-hidden="true"></span>
        </div>
      </div>
    `, b = e.homeIndicator && !e.homeButton ? '<div class="home-indicator"><div class="home-indicator-pill"></div></div>' : "", f = this.hasAttribute("show-safe-areas") ? `<div class="safe-area-overlays">
          <div class="safe-area-overlay safe-area-top"></div>
          <div class="safe-area-overlay safe-area-right"></div>
          <div class="safe-area-overlay safe-area-bottom"></div>
          <div class="safe-area-overlay safe-area-left"></div>
        </div>` : "";
    return t && o ? `
        <div class="device-wrapper">
          <div class="${a}">
            <div class="notch-sidebar ${r}"></div>
            <div class="device-main">
              ${u}
              ${this._contentHTML()}
              ${b}
            </div>
            ${f}
          </div>
        </div>
      ` : `
      <div class="device-wrapper">
        <div class="${a}">
          ${u}
          ${this._contentHTML()}
          ${b}
          ${f}
        </div>
      </div>
    `;
  }
  // --- Device scaling ---
  _setupDeviceScaling() {
    this._resizeObserver || (this._resizeObserver = new ResizeObserver(() => this._updateDeviceScale()), this._resizeObserver.observe(this));
  }
  _updateDeviceScale() {
    const e = this._getDevicePreset();
    if (!e) return;
    const t = this.shadowRoot.querySelector(".device-wrapper"), o = this.shadowRoot.querySelector(".device-frame");
    if (!t || !o) return;
    const r = this.clientWidth;
    if (r === 0) return;
    const s = this._getEffectiveDimensions(e), c = s.width + e.bezel * 2, n = Math.min(1, r / c);
    this._currentScale = n, o.style.transform = `scale(${n})`;
    const d = e.homeButton ? x : 0, a = s.height + e.bezel * 2 + d;
    t.style.height = `${a * n}px`;
  }
  _teardownDeviceScaling() {
    this._resizeObserver && (this._resizeObserver.disconnect(), this._resizeObserver = null), this._currentScale = 1;
  }
  escapeHtml(e) {
    const t = document.createElement("div");
    return t.textContent = e, t.innerHTML;
  }
}
customElements.define("browser-window", L);
export {
  L as BrowserWindow
};
