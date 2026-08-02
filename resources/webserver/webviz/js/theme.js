/**
 * WebViz color scheme controller.
 *
 * Preference (localStorage webviz.colorScheme): "system" | "dark" | "light"
 * Effective theme on <html data-theme>: "dark" | "light" only
 *
 * FOUC: webViz*.html also sets data-theme inline in <head> before CSS.
 * This module re-applies, persists, and listens for OS scheme changes.
 */
(function (global) {
  "use strict";

  var LS_KEY = "webviz.colorScheme";
  var VALID = { system: true, dark: true, light: true };
  var mediaQuery = null;
  var mediaBound = false;

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
    // system (or anything unexpected)
    if (global.matchMedia) {
      return global.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    return "dark"; // historic WebViz default when media API missing
  }

  /**
   * Apply effective theme to documentElement.
   * @param {"system"|"dark"|"light"} [pref] optional; defaults to getPreference()
   */
  function apply(pref) {
    if (pref == null || !VALID[pref]) {
      pref = getPreference();
    }
    var effective = resolve(pref);
    document.documentElement.setAttribute("data-theme", effective);
    return effective;
  }

  /**
   * Validate, persist, and apply.
   * @param {string} pref
   * @returns {boolean} true if accepted
   */
  function setPreference(pref) {
    if (!VALID[pref]) {
      return false;
    }
    writeStored(pref);
    apply(pref);
    return true;
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
      // Safari < 14
      mediaQuery.addListener(onMediaChange);
    }
    mediaBound = true;
  }

  /**
   * Apply current preference and watch OS scheme when preference is system.
   */
  function init() {
    apply();
    bindMediaListener();
  }

  var api = {
    LS_KEY: LS_KEY,
    getPreference: getPreference,
    setPreference: setPreference,
    resolve: resolve,
    apply: apply,
    init: init,
  };

  global.WebVizTheme = api;

  // Self-init so FOUC correction + system listener work before app.js wiring
  init();
})(typeof window !== "undefined" ? window : this);
