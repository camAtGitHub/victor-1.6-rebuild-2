/**
 * Console vars UI enhancer.
 * Runs after C++ injects category HTML into consolevarsui.html.
 * Loads consolevars-catalog.json (curated recipes + blurbs) and decorates matching rows.
 */
(function () {
  "use strict";

  var catalog = null;
  var processHint = guessProcess();

  function guessProcess() {
    var p = String(window.location.port || "");
    if (p === "8889") return "anim";
    if (p === "8888") return "engine";
    // Remote feed / static: default engine catalog filter preference
    return "engine";
  }

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function fetchCatalog() {
    return fetch("consolevars-catalog.json", { cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("catalog HTTP " + r.status);
        return r.json();
      })
      .catch(function (err) {
        console.warn("[consolevars] catalog not loaded:", err);
        return null;
      });
  }

  function setProcessBadge() {
    var el = $("#cvProcessBadge");
    if (!el) return;
    var port = window.location.port || "?";
    if (processHint === "anim") {
      el.textContent = "Anim process · :" + port;
      el.className = "cv-badge cv-badge-anim";
    } else if (String(port) === "8888") {
      el.textContent = "Engine process · :8888";
      el.className = "cv-badge cv-badge-engine";
    } else {
      el.textContent = "Console · :" + port + " (treat as engine catalog)";
      el.className = "cv-badge";
    }
  }

  function recipeMatchesProcess(recipe) {
    if (!recipe.process || recipe.process === "both") return true;
    return recipe.process === processHint;
  }

  function varMeta(name) {
    if (!catalog || !catalog.vars) return null;
    return catalog.vars[name] || null;
  }

  function findControlByVarName(name) {
    // Checkbox / select / slider div / amount input
    var el = document.getElementById(name);
    if (el) return el;
    el = document.getElementById(name + "_amount");
    if (el) return el;
    el = document.getElementById(name + "_function");
    return el || null;
  }

  function rowForControl(el) {
    if (!el) return null;
    // Walk up to the generated row wrapper (div holding label + control)
    var n = el;
    for (var i = 0; i < 5 && n; i++) {
      if (n.tagName === "DIV" && n.querySelector("label")) return n;
      n = n.parentElement;
    }
    return el.parentElement;
  }

  function decorateRows() {
    if (!catalog || !catalog.vars) return;
    Object.keys(catalog.vars).forEach(function (name) {
      var meta = catalog.vars[name];
      var el = findControlByVarName(name);
      if (!el) return;
      var row = rowForControl(el);
      if (!row) return;
      row.classList.add("cv-row");
      row.dataset.var = name;
      if (meta.tags && meta.tags.indexOf("highlight") >= 0) {
        row.classList.add("cv-highlight");
      }

      // Avoid double decoration
      if (row.querySelector(".cv-meta")) return;

      var box = document.createElement("div");
      box.className = "cv-meta";
      if (meta.blurb) {
        var p = document.createElement("p");
        p.className = "cv-blurb";
        p.textContent = meta.blurb;
        box.appendChild(p);
      }
      if (meta.requires && meta.requires.length) {
        var req = document.createElement("p");
        req.className = "cv-requires";
        req.innerHTML =
          "<strong>Typically needs:</strong> " +
          meta.requires
            .map(function (r) {
              return '<button type="button" class="cv-linkvar" data-var="' + escapeAttr(r) + '">' + escapeHtml(r) + "</button>";
            })
            .join(", ");
        box.appendChild(req);
      }
      if (meta.related && meta.related.length) {
        var rel = document.createElement("p");
        rel.className = "cv-related";
        rel.innerHTML =
          "<strong>Related:</strong> " +
          meta.related
            .map(function (r) {
              return '<button type="button" class="cv-linkvar" data-var="' + escapeAttr(r) + '">' + escapeHtml(r) + "</button>";
            })
            .join(", ");
        box.appendChild(rel);
      }
      row.appendChild(box);
    });

    // Fieldset legends → category blurbs
    if (catalog.categories) {
      $all("fieldset legend").forEach(function (leg) {
        var group = leg.textContent.trim();
        // Parent tab text
        var tab = leg.closest('[id^="tabs-"]');
        var tabName = tab ? tab.id.replace(/^tabs-/, "") : "";
        // Categories in catalog use dotted names; try several keys
        var keys = [
          tabName + "." + group,
          "Vision." + group,
          group,
        ];
        var blurb = null;
        for (var i = 0; i < keys.length; i++) {
          if (catalog.categories[keys[i]]) {
            blurb = catalog.categories[keys[i]].blurb;
            break;
          }
        }
        // Also try full path Vision.General.VisionModes style from group alone
        Object.keys(catalog.categories).forEach(function (k) {
          if (!blurb && k.endsWith("." + group)) blurb = catalog.categories[k].blurb;
          if (!blurb && k === group) blurb = catalog.categories[k].blurb;
        });
        if (blurb && !leg.parentElement.querySelector(".cv-cat-blurb")) {
          var d = document.createElement("p");
          d.className = "cv-cat-blurb";
          d.textContent = blurb;
          leg.parentElement.insertBefore(d, leg.nextSibling);
        }
      });
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  function renderRecipes() {
    var root = $("#cvRecipes");
    if (!root || !catalog || !catalog.recipes) return;
    root.innerHTML = "";
    var list = catalog.recipes.filter(recipeMatchesProcess);
    if (!list.length) {
      root.innerHTML = '<p class="cv-muted">No curated recipes for this process yet.</p>';
      return;
    }
    list.forEach(function (recipe) {
      var card = document.createElement("article");
      card.className = "cv-recipe";
      card.innerHTML =
        "<h3>" +
        escapeHtml(recipe.title) +
        "</h3>" +
        '<p class="cv-blurb">' +
        escapeHtml(recipe.blurb || "") +
        "</p>" +
        (recipe.where ? '<p class="cv-where">' + escapeHtml(recipe.where) + "</p>" : "") +
        '<ol class="cv-steps"></ol>' +
        (recipe.tips && recipe.tips.length
          ? '<ul class="cv-tips">' +
            recipe.tips.map(function (t) {
              return "<li>" + escapeHtml(t) + "</li>";
            }).join("") +
            "</ul>"
          : "") +
        '<div class="cv-recipe-actions">' +
        '<button type="button" class="cv-btn cv-btn-primary" data-recipe="' +
        escapeAttr(recipe.id) +
        '">Apply recipe</button>' +
        '<button type="button" class="cv-btn" data-focus-recipe="' +
        escapeAttr(recipe.id) +
        '">Highlight vars</button>' +
        "</div>";
      var ol = card.querySelector(".cv-steps");
      (recipe.steps || []).forEach(function (step) {
        var li = document.createElement("li");
        li.innerHTML =
          "<code>" +
          escapeHtml(step.var) +
          "</code> → <strong>" +
          escapeHtml(String(step.value)) +
          "</strong>" +
          (step.note ? '<span class="cv-step-note">' + escapeHtml(step.note) + "</span>" : "");
        ol.appendChild(li);
      });
      root.appendChild(card);
    });
  }

  function postVar(key, value) {
    return fetch("consolevarset", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "key=" + encodeURIComponent(key) + "&value=" + encodeURIComponent(value),
    }).then(function (r) {
      return r.text();
    });
  }

  function applyRecipe(id) {
    if (!catalog) return;
    var recipe = (catalog.recipes || []).find(function (r) {
      return r.id === id;
    });
    if (!recipe) return;
    var status = $("#cvStatus");
    var steps = recipe.steps || [];
    var i = 0;
    function next() {
      if (i >= steps.length) {
        if (status) status.textContent = "Recipe applied: " + recipe.title;
        highlightRecipe(id);
        return;
      }
      var step = steps[i++];
      if (status) status.textContent = "Setting " + step.var + " …";
      // Update UI control if present
      var el = findControlByVarName(step.var);
      if (el) {
        if (el.type === "checkbox") {
          el.checked = !!step.value;
        } else if (el.classList && el.classList.contains("amount")) {
          el.value = step.value;
        } else if (el.classList && el.classList.contains("slider") && window.jQuery) {
          try {
            window.jQuery(el).slider("value", Number(step.value));
          } catch (e) {}
        }
      }
      postVar(step.var, step.value)
        .catch(function (e) {
          console.warn(e);
        })
        .then(function () {
          setTimeout(next, 80);
        });
    }
    next();
  }

  function highlightRecipe(id) {
    clearHighlights();
    if (!catalog) return;
    var recipe = (catalog.recipes || []).find(function (r) {
      return r.id === id;
    });
    if (!recipe) return;
    (recipe.steps || []).forEach(function (step) {
      var el = findControlByVarName(step.var);
      var row = rowForControl(el);
      if (row) {
        row.classList.add("cv-flash");
        row.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    });
  }

  function clearHighlights() {
    $all(".cv-flash").forEach(function (n) {
      n.classList.remove("cv-flash");
    });
  }

  function focusVar(name) {
    clearHighlights();
    var el = findControlByVarName(name);
    var row = rowForControl(el);
    if (!row) {
      var status = $("#cvStatus");
      if (status) {
        status.textContent =
          "Var not on this page (wrong process or not registered): " + name;
      }
      return;
    }
    // Activate parent jQuery UI tab if needed
    var panel = row.closest('[id^="tabs-"]');
    if (panel && window.jQuery) {
      var $tabs = window.jQuery("#tabs");
      if ($tabs.length && $tabs.tabs) {
        var idx = window.jQuery("#tabs > div").index(panel);
        if (idx >= 0) $tabs.tabs("option", "active", idx);
      }
    }
    row.classList.add("cv-flash");
    setTimeout(function () {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 50);
  }

  function wireSearch() {
    var input = $("#cvSearch");
    if (!input) return;
    input.addEventListener("input", function () {
      var q = input.value.trim().toLowerCase();
      // Filter rows: any div with a label for= matching
      $all("#tabs label").forEach(function (lab) {
        var row = rowForControl(lab);
        if (!row) return;
        var text = (lab.textContent || "") + " " + (row.textContent || "");
        var show = !q || text.toLowerCase().indexOf(q) >= 0;
        row.style.display = show ? "" : "none";
        // hide following <br> clutter — optional
      });
      // Fieldsets: hide if no visible rows
      $all("#tabs fieldset").forEach(function (fs) {
        var any = $all(".cv-row, div", fs).some(function (d) {
          return d.style.display !== "none" && d.querySelector("label");
        });
        // simpler: if all labels hidden
        var labels = $all("label", fs);
        var visible = labels.some(function (l) {
          var r = rowForControl(l);
          return r && r.style.display !== "none";
        });
        fs.style.display = !q || visible ? "" : "none";
      });
    });
  }

  function wireClicks() {
    document.addEventListener("click", function (e) {
      var t = e.target;
      if (!t) return;
      if (t.matches("[data-recipe]")) {
        applyRecipe(t.getAttribute("data-recipe"));
      } else if (t.matches("[data-focus-recipe]")) {
        highlightRecipe(t.getAttribute("data-focus-recipe"));
      } else if (t.matches(".cv-linkvar") || t.closest(".cv-linkvar")) {
        var b = t.matches(".cv-linkvar") ? t : t.closest(".cv-linkvar");
        focusVar(b.getAttribute("data-var"));
      }
    });
  }

  function initTabs() {
    if (!window.jQuery) return;
    var $ = window.jQuery;
    // Prefer #tabs (generated); fall back to #main
    if ($("#tabs").length) {
      try {
        $("#tabs").tabs();
      } catch (e) {
        console.warn(e);
      }
    } else if ($("#main").length) {
      try {
        $("#main").tabs();
      } catch (e2) {}
    }
  }

  function boot() {
    setProcessBadge();
    initTabs();
    wireSearch();
    wireClicks();
    fetchCatalog().then(function (c) {
      catalog = c;
      if (!c) {
        var root = $("#cvRecipes");
        if (root) {
          root.innerHTML =
            '<p class="cv-muted">Catalog missing — recipes unavailable. UI still works for raw vars.</p>';
        }
        return;
      }
      renderRecipes();
      decorateRows();
      var n = Object.keys(c.vars || {}).length;
      var r = (c.recipes || []).length;
      var status = $("#cvStatus");
      if (status) {
        status.textContent =
          "Catalog: " + n + " annotated vars, " + r + " recipes · filter with search";
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
