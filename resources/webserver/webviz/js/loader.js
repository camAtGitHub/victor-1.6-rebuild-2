/**
 * Load legacy webVizModules/*.js IIFEs safely.
 *
 * Stock modules expect globals:
 *   moduleMethods, moduleSendDataFunc
 * and register:
 *   (function(myMethods, sendData){ ... })(moduleMethods, moduleSendDataFunc);
 *
 * We load scripts sequentially, snapshot methods after each onload, and never
 * share one mutable methods object across modules.
 */
(function (global) {
  "use strict";

  /**
   * Scope module CSS under #tab-{moduleName} (and #panel-{moduleName}) so
   * selectors written relative to document body still only hit this host.
   * Mirrors stock createStyles in webViz.html.
   */
  function createScopedStyles(moduleName, rules) {
    if (!rules || !String(rules).trim()) {
      return;
    }
    var styleId = "sty-" + moduleName;
    var existing = document.getElementById(styleId);
    if (existing) {
      existing.parentNode.removeChild(existing);
    }

    var origStyleId = styleId + "-orig";
    var styleOrig = document.createElement("style");
    styleOrig.type = "text/css";
    styleOrig.id = origStyleId;
    styleOrig.textContent = rules;
    document.head.appendChild(styleOrig);

    var newSheetText = "";
    var sheets = document.styleSheets;
    for (var i = 0; i < sheets.length; i++) {
      if (!sheets[i].ownerNode || sheets[i].ownerNode.id !== origStyleId) {
        continue;
      }
      var ruleSet = sheets[i].cssRules || sheets[i].rules || [];
      for (var r = 0; r < ruleSet.length; r++) {
        var rule = ruleSet[r];
        var oldSelector = rule.selectorText;
        if (typeof oldSelector === "undefined") {
          newSheetText += rule.cssText + "\n";
          continue;
        }
        var parts = oldSelector.split(",");
        var rewritten = parts
          .map(function (sel) {
            sel = sel.trim();
            // Scope to both legacy-compatible id and new panel id
            return (
              "#tab-" +
              moduleName +
              " " +
              sel +
              ", #panel-" +
              moduleName +
              " " +
              sel
            );
          })
          .join(", ");
        try {
          newSheetText += rewritten + " { " + rule.style.cssText + " }\n";
        } catch (e) {
          newSheetText += rule.cssText + "\n";
        }
      }
      break;
    }

    if (styleOrig.parentNode) {
      styleOrig.parentNode.removeChild(styleOrig);
    }

    var style = document.createElement("style");
    style.type = "text/css";
    style.id = styleId;
    style.textContent = newSheetText;
    document.head.appendChild(style);
  }

  /**
   * @param {Object} modulesMap  displayName → scriptUrl
   * @param {function(string, any): void} sendDataFn  (moduleKey, data)
   * @returns {Promise<{byKey: Object, displayNames: Object, errors: Array}>}
   */
  function loadAllModules(modulesMap, sendDataFn) {
    var names = Object.keys(modulesMap).sort(function (a, b) {
      return a.toLowerCase().localeCompare(b.toLowerCase());
    });

    var byKey = Object.create(null); // lowercased key → methods
    var displayNames = Object.create(null); // lowercased → original
    var errors = [];

    function loadOne(index) {
      if (index >= names.length) {
        return Promise.resolve({ byKey: byKey, displayNames: displayNames, errors: errors });
      }

      var displayName = names[index];
      var url = modulesMap[displayName];
      var key = displayName.toLowerCase();
      displayNames[key] = displayName;

      return new Promise(function (resolve) {
        var methods = {};
        var sendFunc = function (data) {
          sendDataFn(key, data);
        };

        // Globals the IIFE closes over at evaluation time
        global.moduleMethods = methods;
        global.moduleSendDataFunc = sendFunc;

        var script = document.createElement("script");
        script.src = url;
        script.async = false;

        var settled = false;
        function finish(ok, errMsg) {
          if (settled) {
            return;
          }
          settled = true;
          // Clear globals so a stray delayed script can't poison the next load
          if (global.moduleMethods === methods) {
            global.moduleMethods = {};
          }
          if (global.moduleSendDataFunc === sendFunc) {
            global.moduleSendDataFunc = function () {};
          }

          if (!ok) {
            errors.push({ name: displayName, error: errMsg || "load failed" });
            resolve(loadOne(index + 1));
            return;
          }

          var m = methods;
          if (
            typeof m.init !== "function" ||
            typeof m.onData !== "function" ||
            typeof m.update !== "function" ||
            typeof m.getStyles !== "function"
          ) {
            errors.push({
              name: displayName,
              error: "missing required methods (init/onData/update/getStyles)",
            });
            resolve(loadOne(index + 1));
            return;
          }

          byKey[key] = m;
          resolve(loadOne(index + 1));
        }

        script.onload = function () {
          finish(true);
        };
        script.onerror = function () {
          finish(false, "script error loading " + url);
        };
        document.body.appendChild(script);
      });
    }

    return loadOne(0);
  }

  global.WebVizLoader = {
    loadAllModules: loadAllModules,
    createScopedStyles: createScopedStyles,
  };
})(window);
