/**
 * PASTE INTO FIREFOX DEVTOOLS CONSOLE on WebViz page.
 * Diagnoses theme toggle / light palette. Safe to re-run.
 *
 * After paste, results print as a single object + step logs.
 * Optional: WebVizThemeDiag.forceLight() / .forceDark() / .clickToggle()
 */
(function () {
  "use strict";

  function log(msg, data) {
    if (data !== undefined) {
      console.log("[WV-ThemeDiag] " + msg, data);
    } else {
      console.log("[WV-ThemeDiag] " + msg);
    }
  }

  function cs(el, prop) {
    try {
      return getComputedStyle(el).getPropertyValue(prop).trim();
    } catch (e) {
      return "(err " + e + ")";
    }
  }

  var root = document.documentElement;
  var body = document.body;
  var btn = document.getElementById("btnThemeToggle");
  var icon = document.getElementById("themeToggleIcon");
  var report = {
    ua: navigator.userAgent,
    href: location.href,
    hasWebVizTheme: typeof window.WebVizTheme !== "undefined",
    webVizThemeKeys: window.WebVizTheme ? Object.keys(window.WebVizTheme) : [],
    preference: null,
    resolved: null,
    htmlDataTheme: root.getAttribute("data-theme"),
    htmlClass: root.className,
    bodyDataTheme: body ? body.getAttribute("data-theme") : null,
    btnFound: !!btn,
    btnWiredAttr: btn ? btn.getAttribute("data-wv-theme-wired") : null,
    iconText: icon ? icon.textContent : null,
    lsRaw: null,
    lsError: null,
    matchMediaDark: null,
    matchMediaLight: null,
    matchMediaApi: null,
    computed: {},
    inlineRootBg: null,
    inlineBodyBg: null,
    applyLightResult: null,
    applyDarkResult: null,
    afterLightComputedBg: null,
    afterDarkComputedBg: null,
    errors: [],
  };

  try {
    report.lsRaw = localStorage.getItem("webviz.colorScheme");
  } catch (e) {
    report.lsError = String(e);
  }

  if (window.WebVizTheme) {
    try {
      report.preference = WebVizTheme.getPreference();
      report.resolved = WebVizTheme.resolve(report.preference);
    } catch (e) {
      report.errors.push("getPreference/resolve: " + e);
    }
  }

  try {
    if (window.matchMedia) {
      report.matchMediaDark = matchMedia("(prefers-color-scheme: dark)").matches;
      report.matchMediaLight = matchMedia("(prefers-color-scheme: light)").matches;
      var mq = matchMedia("(prefers-color-scheme: dark)");
      report.matchMediaApi = {
        hasAddListener: typeof mq.addListener === "function",
        hasAddEventListener: typeof mq.addEventListener === "function",
        media: mq.media,
      };
    }
  } catch (e) {
    report.errors.push("matchMedia: " + e);
  }

  report.computed = {
    html_wv_bg: cs(root, "--wv-bg"),
    body_wv_bg: body ? cs(body, "--wv-bg") : null,
    body_backgroundColor: body ? cs(body, "background-color") : null,
    body_color: body ? cs(body, "color") : null,
    top_bg: (function () {
      var t = document.querySelector(".top");
      return t ? cs(t, "background-color") : null;
    })(),
    colorScheme: cs(root, "color-scheme"),
  };

  try {
    report.inlineRootBg = root.style.getPropertyValue("--wv-bg");
    report.inlineBodyBg = body ? body.style.getPropertyValue("--wv-bg") : null;
  } catch (e) {
    report.errors.push("inline read: " + e);
  }

  // --- Active tests (mutate theme; restore preference after) ---
  var savedPref = report.preference || report.lsRaw || "system";

  function tryForce(label, pref) {
    var r = { pref: pref, ok: false, err: null, wvBg: null, bodyBg: null, dataTheme: null };
    try {
      if (window.WebVizTheme && WebVizTheme.setPreference) {
        r.ok = WebVizTheme.setPreference(pref);
      } else {
        // Manual fallback
        root.setAttribute("data-theme", pref === "light" ? "light" : "dark");
        root.classList.remove("wv-theme-light");
        root.classList.remove("wv-theme-dark");
        root.classList.add(pref === "light" ? "wv-theme-light" : "wv-theme-dark");
        if (pref === "light") {
          root.style.setProperty("--wv-bg", "#f0f2f6");
          root.style.setProperty("--wv-text", "#1a1d24");
          root.style.setProperty("color-scheme", "light");
          if (body) {
            body.style.setProperty("--wv-bg", "#f0f2f6");
            body.style.setProperty("--wv-text", "#1a1d24");
            body.style.backgroundColor = "#f0f2f6";
            body.style.color = "#1a1d24";
          }
        } else {
          root.style.removeProperty("--wv-bg");
          root.style.removeProperty("--wv-text");
          root.style.setProperty("color-scheme", "dark");
          if (body) {
            body.style.removeProperty("--wv-bg");
            body.style.removeProperty("--wv-text");
            body.style.backgroundColor = "";
            body.style.color = "";
          }
        }
        r.ok = true;
      }
      r.wvBg = cs(root, "--wv-bg");
      r.bodyBg = body ? cs(body, "background-color") : null;
      r.dataTheme = root.getAttribute("data-theme");
      log(label + " applied", r);
    } catch (e) {
      r.err = String(e);
      report.errors.push(label + ": " + e);
      log(label + " FAILED", e);
    }
    return r;
  }

  report.applyLightResult = tryForce("force light", "light");
  report.afterLightComputedBg = report.applyLightResult.bodyBg;

  report.applyDarkResult = tryForce("force dark", "dark");
  report.afterDarkComputedBg = report.applyDarkResult.bodyBg;

  // Restore
  try {
    if (window.WebVizTheme && WebVizTheme.setPreference) {
      WebVizTheme.setPreference(savedPref === "light" || savedPref === "dark" || savedPref === "system" ? savedPref : "system");
    }
  } catch (e) {
    report.errors.push("restore: " + e);
  }

  // Button geometry (is it clickable?)
  if (btn) {
    var rect = btn.getBoundingClientRect();
    var mid = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    report.btnRect = {
      w: rect.width,
      h: rect.height,
      top: rect.top,
      left: rect.left,
      visible: rect.width > 0 && rect.height > 0,
    };
    report.elementFromPointAtBtn =
      mid && (mid.id || mid.className || mid.tagName);
    report.btnCoveredByOther = !!(mid && mid !== btn && !btn.contains(mid));
  }

  // Stylesheet presence
  report.stylesheets = [].map.call(document.styleSheets, function (ss) {
    var href = ss.href || "(inline)";
    var rules = null;
    try {
      rules = ss.cssRules ? ss.cssRules.length : null;
    } catch (e) {
      rules = "blocked:" + e.message;
    }
    return { href: href, rules: rules };
  });

  var lightRuleHits = 0;
  try {
    [].forEach.call(document.styleSheets, function (ss) {
      try {
        if (!ss.cssRules) return;
        [].forEach.call(ss.cssRules, function (rule) {
          if (rule.selectorText && /data-theme.*light|wv-theme-light/.test(rule.selectorText)) {
            lightRuleHits++;
          }
        });
      } catch (e) {
        /* cross-origin */
      }
    });
  } catch (e) {
    report.errors.push("cssRules scan: " + e);
  }
  report.lightThemeCssRuleCount = lightRuleHits;

  console.log("%c[WV-ThemeDiag] REPORT", "font-weight:bold;font-size:14px", report);

  // Verdict hints
  var hints = [];
  if (!report.hasWebVizTheme) {
    hints.push("WebVizTheme missing — theme.js not loaded (check Network for theme.js?v=…).");
  }
  if (!report.btnFound) {
    hints.push("No #btnThemeToggle — old HTML without footer toggle.");
  }
  if (report.btnCoveredByOther) {
    hints.push("Button is covered by another element — click never hits the button.");
  }
  if (report.btnRect && !report.btnRect.visible) {
    hints.push("Button has zero size — not clickable.");
  }
  if (report.lightThemeCssRuleCount === 0) {
    hints.push("No light-theme CSS rules found in accessible stylesheets — tokens.css may be stale/old.");
  }
  if (report.applyLightResult && report.applyLightResult.wvBg && report.applyLightResult.wvBg.indexOf("f0f2f6") === -1 && report.applyLightResult.wvBg.indexOf("240") === -1) {
    hints.push("After setPreference('light'), --wv-bg did not become light. Inline setProperty may be blocked or overridden.");
  }
  if (report.preference && report.preference !== "system") {
    hints.push(
      "Preference is '" +
        report.preference +
        "' (not system). Browser/OS theme picker will NOT change the UI until you set system or clear localStorage webviz.colorScheme."
    );
  }
  if (hints.length) {
    console.warn("[WV-ThemeDiag] HINTS:\n- " + hints.join("\n- "));
  } else {
    log("No automatic red flags. Try WebVizThemeDiag.clickToggle() and watch UI.");
  }

  window.WebVizThemeDiag = {
    report: report,
    forceLight: function () {
      return tryForce("force light", "light");
    },
    forceDark: function () {
      return tryForce("force dark", "dark");
    },
    setSystem: function () {
      if (window.WebVizTheme) return WebVizTheme.setPreference("system");
    },
    clickToggle: function () {
      if (window.WebVizTheme && WebVizTheme.toggle) {
        var r = WebVizTheme.toggle();
        log("toggle() =>", r, "pref=", WebVizTheme.getPreference(), "data-theme=", root.getAttribute("data-theme"), "--wv-bg=", cs(root, "--wv-bg"));
        return r;
      }
      log("no WebVizTheme.toggle");
      return false;
    },
    clearStorage: function () {
      try {
        localStorage.removeItem("webviz.colorScheme");
        log("cleared webviz.colorScheme");
      } catch (e) {
        log("clear failed", e);
      }
    },
    rewire: function () {
      if (window.WebVizTheme && WebVizTheme.wireToggleButton) {
        var b = document.getElementById("btnThemeToggle");
        if (b) b.removeAttribute("data-wv-theme-wired");
        WebVizTheme.wireToggleButton();
        log("rewired");
      }
    },
  };

  log("Helpers: WebVizThemeDiag.forceLight() | forceDark() | clickToggle() | setSystem() | clearStorage() | rewire()");
  return report;
})();
