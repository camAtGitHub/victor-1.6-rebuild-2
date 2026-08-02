/**
 * WebViz color scheme controller.
 *
 * Preference (localStorage webviz.colorScheme): "system" | "dark" | "light"
 * Effective theme on <html data-theme class="wv-theme-*">: "dark" | "light"
 *
 * Light tokens are applied both via CSS (html[data-theme="light"]) and via
 * inline custom properties on <html> so theme still flips if CSS is stale/cached.
 *
 * FOUC: webViz*.html also sets data-theme + class inline in <head> before CSS.
 */
(function (global) {
  "use strict";

  var LS_KEY = "webviz.colorScheme";
  var VALID = { system: true, dark: true, light: true };
  var mediaQuery = null;
  var mediaBound = false;

  /**
   * Light palette — keep in sync with tokens.css html[data-theme="light"].
   * Applied with setProperty so computed styles update even if stylesheet is old.
   */
  var LIGHT_VARS = {
    "--wv-bg": "#f0f2f6",
    "--wv-bg-elev": "#ffffff",
    "--wv-bg-panel": "#e8ecf2",
    "--wv-bg-hover": "#dde3ec",
    "--wv-bg-active": "#d0d8e4",
    "--wv-bg-input": "#ffffff",
    "--wv-line": "#c5ccd8",
    "--wv-line-soft": "#d8dee8",
    "--wv-line-strong": "#9aa6b8",
    "--wv-text": "#1a1d24",
    "--wv-text-dim": "#5c667a",
    "--wv-text-faint": "#8b95a8",
    "--wv-text-inv": "#ffffff",
    "--wv-accent": "#5b9fd4",
    "--wv-accent-dim": "rgba(91, 159, 212, 0.18)",
    "--wv-accent-strong": "#3d87c4",
    "--wv-good": "#3ecf8e",
    "--wv-good-dim": "rgba(62, 207, 142, 0.16)",
    "--wv-warn": "#e6b450",
    "--wv-warn-dim": "rgba(230, 180, 80, 0.16)",
    "--wv-bad": "#f07178",
    "--wv-bad-dim": "rgba(240, 113, 120, 0.16)",
    "--wv-violet": "#c792ea",
    "--wv-violet-dim": "rgba(199, 146, 234, 0.16)",
    "--wv-content-bg": "#ffffff",
    "--wv-content-text": "#1a1d24",
    "--wv-content-line": "#c5cad3",
    "--wv-toast-error-bg": "#fdecee",
    "--wv-accent-border": "rgba(91, 159, 212, 0.45)",
    "--wv-good-border": "rgba(62, 207, 142, 0.5)",
    "--wv-warn-border": "rgba(230, 180, 80, 0.5)",
    "--wv-bad-border": "rgba(240, 113, 120, 0.55)",
    "--wv-shadow-sm": "0 1px 2px rgba(0, 0, 0, 0.08)",
    "--wv-shadow-md": "0 8px 24px rgba(0, 0, 0, 0.1)",
  };

  function readStored() {
    try {
      return localStorage.getItem(LS_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function writeStored(pref) {
    try {
      localStorage.setItem(LS_KEY, pref);
    } catch (e) {
      /* private mode */
    }
  }

  /**
   * @returns {"system"|"dark"|"light"}
   */
  function getPreference() {
    var p = readStored();
    if (VALID[p]) {
      return p;
    }
    return "system";
  }

  /**
   * @param {"system"|"dark"|"light"} pref
   * @returns {"dark"|"light"}
   */
  function resolve(pref) {
    if (pref === "light") {
      return "light";
    }
    if (pref === "dark") {
      return "dark";
    }
    if (global.matchMedia) {
      return global.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    return "dark";
  }

  function applyInlineVars(effective) {
    var root = document.documentElement;
    var key;
    if (effective === "light") {
      for (key in LIGHT_VARS) {
        if (Object.prototype.hasOwnProperty.call(LIGHT_VARS, key)) {
          root.style.setProperty(key, LIGHT_VARS[key]);
        }
      }
      root.style.colorScheme = "light";
    } else {
      for (key in LIGHT_VARS) {
        if (Object.prototype.hasOwnProperty.call(LIGHT_VARS, key)) {
          root.style.removeProperty(key);
        }
      }
      root.style.colorScheme = "dark";
    }
  }

  function applyDomMarkers(effective) {
    var root = document.documentElement;
    root.setAttribute("data-theme", effective);
    root.classList.remove("wv-theme-light", "wv-theme-dark");
    root.classList.add(effective === "light" ? "wv-theme-light" : "wv-theme-dark");
  }

  /**
   * Update footer toggle icon/label if present.
   * @param {"dark"|"light"} effective
   */
  function syncToggleUi(effective) {
    var btn = document.getElementById("btnThemeToggle");
    var icon = document.getElementById("themeToggleIcon");
    if (!btn) {
      return;
    }
    if (effective === "light") {
      // currently light → offer dark
      if (icon) {
        icon.textContent = "\u263E"; // crescent moon
      }
      btn.title = "Switch to dark theme";
      btn.setAttribute("aria-label", "Switch to dark theme");
      btn.setAttribute("aria-pressed", "true");
    } else {
      if (icon) {
        icon.textContent = "\u2600"; // sun
      }
      btn.title = "Switch to light theme";
      btn.setAttribute("aria-label", "Switch to light theme");
      btn.setAttribute("aria-pressed", "false");
    }
  }

  /**
   * Apply effective theme to documentElement.
   * @param {"system"|"dark"|"light"} [pref]
   * @returns {"dark"|"light"}
   */
  function apply(pref) {
    if (pref == null || !VALID[pref]) {
      pref = getPreference();
    }
    var effective = resolve(pref);
    applyDomMarkers(effective);
    applyInlineVars(effective);
    syncToggleUi(effective);
    return effective;
  }

  /**
   * @param {string} pref
   * @returns {boolean}
   */
  function setPreference(pref) {
    if (!VALID[pref]) {
      return false;
    }
    writeStored(pref);
    apply(pref);
    return true;
  }

  /** Toggle forced dark ↔ light (leaves system). */
  function toggle() {
    var effective = resolve(getPreference());
    return setPreference(effective === "dark" ? "light" : "dark");
  }

  function onMediaChange() {
    if (getPreference() === "system") {
      apply("system");
    }
  }

  function bindMediaListener() {
    if (mediaBound || !global.matchMedia) {
      return;
    }
    mediaQuery = global.matchMedia("(prefers-color-scheme: dark)");
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", onMediaChange);
    } else if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(onMediaChange);
    }
    mediaBound = true;
  }

  function wireToggleButton() {
    var btn = document.getElementById("btnThemeToggle");
    if (!btn || btn.getAttribute("data-wv-theme-wired") === "1") {
      return;
    }
    btn.setAttribute("data-wv-theme-wired", "1");
    btn.addEventListener("click", function () {
      toggle();
    });
    syncToggleUi(resolve(getPreference()));
  }

  function init() {
    apply();
    bindMediaListener();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", wireToggleButton);
    } else {
      wireToggleButton();
    }
  }

  var api = {
    LS_KEY: LS_KEY,
    getPreference: getPreference,
    setPreference: setPreference,
    resolve: resolve,
    apply: apply,
    toggle: toggle,
    init: init,
    wireToggleButton: wireToggleButton,
  };

  global.WebVizTheme = api;
  init();
})(typeof window !== "undefined" ? window : this);
