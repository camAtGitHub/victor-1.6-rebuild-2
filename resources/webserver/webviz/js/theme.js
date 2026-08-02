/**
 * WebViz color scheme controller.
 *
 * Preference (localStorage webviz.colorScheme): "system" | "dark" | "light"
 * Effective theme on <html data-theme class="wv-theme-*">: "dark" | "light"
 *
 * Light tokens are applied via CSS selectors AND inline custom properties on
 * <html> (and body) so Firefox/Chrome both repaint even with stale CSS.
 *
 * FOUC: webViz*.html also sets data-theme + class inline in <head> before CSS.
 */
(function (global) {
  "use strict";

  var LS_KEY = "webviz.colorScheme";
  var VALID = { system: true, dark: true, light: true };
  var mediaQuery = null;
  var mediaBound = false;
  var docClickBound = false;

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
      try {
        return global.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
      } catch (e) {
        return "dark";
      }
    }
    return "dark";
  }

  /**
   * Set or clear vars on an element. Uses setProperty only (Firefox-safe;
   * avoid style.colorScheme IDL which is missing or flaky in some FF builds).
   */
  function writeVarsOn(el, effective) {
    if (!el || !el.style) {
      return;
    }
    var key;
    if (effective === "light") {
      for (key in LIGHT_VARS) {
        if (Object.prototype.hasOwnProperty.call(LIGHT_VARS, key)) {
          el.style.setProperty(key, LIGHT_VARS[key]);
        }
      }
      el.style.setProperty("color-scheme", "light");
    } else {
      for (key in LIGHT_VARS) {
        if (Object.prototype.hasOwnProperty.call(LIGHT_VARS, key)) {
          el.style.removeProperty(key);
        }
      }
      el.style.setProperty("color-scheme", "dark");
    }
  }

  function applyInlineVars(effective) {
    var root = document.documentElement;
    var body = document.body;
    writeVarsOn(root, effective);
    // Firefox: also stamp body so var() consumers under body always inherit
    // the same values even if html/root cascade is quirky.
    if (body) {
      writeVarsOn(body, effective);
    }
  }

  function applyDomMarkers(effective) {
    var root = document.documentElement;
    root.setAttribute("data-theme", effective);
    // One-arg remove for widest engine support
    root.classList.remove("wv-theme-light");
    root.classList.remove("wv-theme-dark");
    root.classList.add(effective === "light" ? "wv-theme-light" : "wv-theme-dark");
    if (document.body) {
      document.body.setAttribute("data-theme", effective);
      document.body.classList.remove("wv-theme-light");
      document.body.classList.remove("wv-theme-dark");
      document.body.classList.add(
        effective === "light" ? "wv-theme-light" : "wv-theme-dark"
      );
    }
  }

  /**
   * Nudge layout so Firefox recomputes var() backgrounds after custom props change.
   */
  function forceRepaint() {
    var root = document.documentElement;
    var body = document.body;
    try {
      // Touch a non-custom property that shell already uses via tokens
      if (body) {
        body.style.backgroundColor = "";
        // re-read to force style flush
        void (body.offsetHeight);
      }
      void (root.offsetHeight);
    } catch (e) {
      /* ignore */
    }
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
    var pref = getPreference();
    var followingSystem = pref === "system";
    var next = effective === "dark" ? "light" : "dark";
    // Title must make BrowserTools / OS "system" mode obvious — otherwise
    // people think the toggle is broken when the browser is locked to dark/light.
    var title;
    if (followingSystem) {
      title =
        "Theme: " +
        effective +
        " (following system / browser). Click to force " +
        next +
        ".";
    } else {
      title =
        "Theme: " +
        effective +
        " (forced). Click for " +
        next +
        ". Double-click to follow system.";
    }
    if (effective === "light") {
      if (icon) {
        icon.textContent = "\u263E"; // crescent moon → click for dark
      }
      btn.setAttribute("aria-pressed", "true");
    } else {
      if (icon) {
        icon.textContent = "\u2600"; // sun → click for light
      }
      btn.setAttribute("aria-pressed", "false");
    }
    btn.title = title;
    btn.setAttribute("aria-label", title);
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
    try {
      applyDomMarkers(effective);
      applyInlineVars(effective);
      forceRepaint();
      syncToggleUi(effective);
    } catch (e) {
      if (global.console && console.warn) {
        console.warn("[WebVizTheme] apply failed", e);
      }
    }
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
    try {
      mediaQuery = global.matchMedia("(prefers-color-scheme: dark)");
    } catch (e) {
      return;
    }
    // Prefer addListener first — more reliable on older Firefox; both if present.
    if (typeof mediaQuery.addListener === "function") {
      try {
        mediaQuery.addListener(onMediaChange);
      } catch (e1) {
        /* ignore */
      }
    }
    if (typeof mediaQuery.addEventListener === "function") {
      try {
        mediaQuery.addEventListener("change", onMediaChange);
      } catch (e2) {
        /* ignore */
      }
    }
    mediaBound = true;
  }

  function onDocClick(ev) {
    var t = ev.target;
    if (!t) {
      return;
    }
    // Walk up in case click lands on icon span inside the button
    var el = t.nodeType === 1 ? t : t.parentElement;
    while (el && el !== document.documentElement) {
      if (el.id === "btnThemeToggle") {
        ev.preventDefault();
        toggle();
        return;
      }
      el = el.parentElement;
    }
  }

  /**
   * Document-level delegation so the toggle works even if the button is
   * re-created or direct wiring raced DOMContentLoaded (Firefox edge cases).
   */
  function bindDocClick() {
    if (docClickBound) {
      return;
    }
    docClickBound = true;
    document.addEventListener("click", onDocClick, false);
  }

  function wireToggleButton() {
    bindDocClick();
    var btn = document.getElementById("btnThemeToggle");
    if (btn && btn.getAttribute("data-wv-theme-wired") !== "1") {
      btn.setAttribute("data-wv-theme-wired", "1");
      // Direct listener; stopPropagation so document delegation does not double-toggle
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        toggle();
      });
      // Escape hatch back to OS / BrowserTools appearance
      btn.addEventListener("dblclick", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        setPreference("system");
      });
    }
    syncToggleUi(resolve(getPreference()));
  }

  function init() {
    apply();
    bindMediaListener();
    bindDocClick();
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
