/**
 * Console vars UI enhancer (Path A decorator).
 * Runs after C++ injects category HTML into consolevarsui.html (classic) or
 * consolevars-explorer.html. Explorer chrome (#cvRecipes, #cvSearch, #cvProcessBadge)
 * is optional — missing nodes are skipped; catalog load + row decoration always run.
 * Catalog: prefer consolevars/index.json shards; fall back to consolevars-catalog.json.
 */
(function () {
  "use strict";

  var catalog = null;
  var processHint = guessProcess();
  var DEAD_STATUSES = { dead: 1, orphan: 1, noop: 1 };
  // Root-relative so fetch works from /consolevars (no trailing slash) and
  // does not resolve to /consolevars/consolevars/...
  var CATALOG_INDEX = "/consolevars/index.json";
  var CATALOG_FALLBACK = "/consolevars-catalog.json";

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

  /** Resolve shard path to a root-absolute URL under /consolevars/. */
  function shardUrl(path) {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    if (path.indexOf("/") === 0) return path;
    if (path.indexOf("consolevars/") === 0) return "/" + path;
    return "/consolevars/" + String(path).replace(/^\//, "");
  }

  function fetchJson(url) {
    return fetch(url, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(url + " HTTP " + r.status);
      return r.json();
    });
  }

  /** Missing shard: warn and return null so merge can continue. */
  function fetchJsonOptional(url) {
    return fetchJson(url).catch(function (err) {
      console.warn("[consolevars] shard skipped:", url, err);
      return null;
    });
  }

  function mergeShardPayload(out, data) {
    if (!data || typeof data !== "object") return;
    if (data.vars && typeof data.vars === "object") {
      Object.assign(out.vars, data.vars);
    }
    if (data.categories && typeof data.categories === "object") {
      Object.assign(out.categories, data.categories);
    }
    if (Array.isArray(data.recipes)) {
      out.recipes = out.recipes.concat(data.recipes);
    }
  }

  /**
   * Load index → optional meta + vars/categories/recipes shards → merged catalog.
   * Paths in index are relative to consolevars/ unless they already start with it.
   */
  function fetchShardedCatalog(index) {
    var out = {
      version: index.version || 1,
      vars: {},
      categories: {},
      recipes: [],
    };
    var jobs = [];

    if (index.meta) {
      jobs.push(
        fetchJsonOptional(shardUrl(index.meta)).then(function (meta) {
          if (meta) out.meta = meta;
        })
      );
    }

    function queueList(list) {
      if (!Array.isArray(list)) return;
      list.forEach(function (p) {
        var url = shardUrl(p);
        if (!url) return;
        jobs.push(
          fetchJsonOptional(url).then(function (data) {
            mergeShardPayload(out, data);
          })
        );
      });
    }

    queueList(index.vars);
    queueList(index.categories);
    queueList(index.recipes);

    // Also support index.shards = [{type, path}, ...] if present later
    if (Array.isArray(index.shards)) {
      index.shards.forEach(function (s) {
        if (!s || !s.path) return;
        var url = shardUrl(s.path);
        jobs.push(
          fetchJsonOptional(url).then(function (data) {
            mergeShardPayload(out, data);
          })
        );
      });
    }

    return Promise.all(jobs).then(function () {
      return out;
    });
  }

  function fetchMonolithicCatalog() {
    return fetchJson(CATALOG_FALLBACK);
  }

  function fetchCatalog() {
    return fetchJson(CATALOG_INDEX)
      .then(function (index) {
        return fetchShardedCatalog(index);
      })
      .catch(function (err) {
        console.warn(
          "[consolevars] shard index failed, falling back to monolithic catalog:",
          err
        );
        return fetchMonolithicCatalog();
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
    var candidates = idCandidates(name);
    for (var i = 0; i < candidates.length; i++) {
      if (catalog.vars[candidates[i]]) return catalog.vars[candidates[i]];
    }
    return null;
  }

  /**
   * UI ids strip Hungarian k/g prefixes (see SkipHungarianNotation in
   * lib/util/.../consoleVariable.cpp). Catalog keys may still use either form.
   */
  function idCandidates(name) {
    var list = [name];
    if (/^[kg][A-Z]/.test(name)) {
      list.push(name.slice(1));
    } else if (/^[A-Z]/.test(name)) {
      list.push("k" + name);
      list.push("g" + name);
    }
    return list;
  }

  function findControlByVarName(name) {
    var candidates = idCandidates(name);
    for (var i = 0; i < candidates.length; i++) {
      var n = candidates[i];
      // Checkbox / select / slider div / amount input / function button
      var el = document.getElementById(n);
      if (el) return el;
      el = document.getElementById(n + "_amount");
      if (el) return el;
      el = document.getElementById(n + "_function");
      if (el) return el;
    }
    return null;
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

  function isDeadStatus(status) {
    return !!(status && DEAD_STATUSES[String(status).toLowerCase()]);
  }

  function labelForRow(row, name) {
    if (!row) return null;
    var candidates = idCandidates(name);
    var i, lab, c;
    for (i = 0; i < candidates.length; i++) {
      c = candidates[i];
      lab = row.querySelector('label[for="' + c + '"]');
      if (lab) return lab;
      // Console funcs use label for="Name_function"
      lab = row.querySelector('label[for="' + c + '_function"]');
      if (lab) return lab;
      lab = row.querySelector('label[for="' + c + '_amount"]');
      if (lab) return lab;
    }
    return row.querySelector("label");
  }

  function buildPopover(meta) {
    var pop = document.createElement("div");
    pop.className = "cv-popover";
    pop.setAttribute("hidden", "");
    pop.setAttribute("role", "tooltip");

    if (meta.blurb) {
      var p = document.createElement("p");
      p.className = "cv-blurb";
      p.textContent = meta.blurb;
      pop.appendChild(p);
    }
    if (meta.statusNote) {
      var sn = document.createElement("p");
      sn.className = "cv-status-note";
      sn.textContent = meta.statusNote;
      pop.appendChild(sn);
    }
    if (meta.evidence) {
      var ev = document.createElement("p");
      ev.className = "cv-evidence";
      ev.textContent = "Evidence: " + meta.evidence;
      pop.appendChild(ev);
    }
    if (meta.requires && meta.requires.length) {
      var req = document.createElement("p");
      req.className = "cv-requires";
      req.innerHTML =
        "<strong>Typically needs:</strong> " +
        meta.requires
          .map(function (r) {
            return (
              '<button type="button" class="cv-linkvar" data-var="' +
              escapeAttr(r) +
              '">' +
              escapeHtml(r) +
              "</button>"
            );
          })
          .join(", ");
      pop.appendChild(req);
    }
    if (meta.related && meta.related.length) {
      var rel = document.createElement("p");
      rel.className = "cv-related";
      rel.innerHTML =
        "<strong>Related:</strong> " +
        meta.related
          .map(function (r) {
            return (
              '<button type="button" class="cv-linkvar" data-var="' +
              escapeAttr(r) +
              '">' +
              escapeHtml(r) +
              "</button>"
            );
          })
          .join(", ");
      pop.appendChild(rel);
    }
    return pop;
  }

  function decorateRows() {
    if (!catalog || !catalog.vars) return;
    Object.keys(catalog.vars).forEach(function (name) {
      var meta = catalog.vars[name];
      var el = findControlByVarName(name);
      if (!el) return;
      var row = rowForControl(el);
      if (!row) return;
      // Avoid double decoration
      if (row.querySelector(".cv-marks")) return;

      row.classList.add("cv-row");
      row.dataset.var = name;
      if (meta.tags && meta.tags.indexOf("highlight") >= 0) {
        row.classList.add("cv-highlight");
      }

      var hasBlurb = !!(meta.blurb || meta.statusNote || meta.evidence ||
        (meta.requires && meta.requires.length) ||
        (meta.related && meta.related.length));
      var dead = isDeadStatus(meta.status);
      if (!hasBlurb && !dead) return;

      var marks = document.createElement("span");
      marks.className = "cv-marks";

      if (dead) {
        var glyph = document.createElement("span");
        glyph.className = "cv-dead";
        glyph.setAttribute("aria-label", "Status: " + meta.status);
        glyph.textContent = "⌀";
        glyph.title =
          meta.statusNote ||
          "Status: " + meta.status + " — control still enabled; may have no effect.";
        marks.appendChild(glyph);
        row.classList.add("cv-row-dead");
        // Do NOT disable the control — user may still want to set/observe it.
      }

      if (hasBlurb) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cv-help";
        btn.setAttribute("aria-label", "About " + name);
        btn.setAttribute("aria-expanded", "false");
        btn.textContent = "?";
        btn.title = meta.blurb || "Details";
        marks.appendChild(btn);

        var pop = buildPopover(meta);
        marks.appendChild(pop);
      }

      var lab = labelForRow(row, name);
      if (lab && lab.parentNode) {
        lab.parentNode.insertBefore(marks, lab.nextSibling);
      } else {
        row.insertBefore(marks, row.firstChild);
      }
    });

    // Fieldset legends → category blurbs (compact one-liner under legend)
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

  function closeAllPopovers(except) {
    $all(".cv-popover:not([hidden])").forEach(function (p) {
      if (except && p === except) return;
      p.setAttribute("hidden", "");
      var btn = p.parentElement && p.parentElement.querySelector(".cv-help");
      if (btn) btn.setAttribute("aria-expanded", "false");
    });
  }

  function toggleHelpPopover(btn) {
    var marks = btn.closest(".cv-marks");
    if (!marks) return;
    var pop = marks.querySelector(".cv-popover");
    if (!pop) return;
    var open = pop.hasAttribute("hidden");
    closeAllPopovers(open ? pop : null);
    if (open) {
      pop.removeAttribute("hidden");
      btn.setAttribute("aria-expanded", "true");
    } else {
      pop.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", "false");
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
        if (step.func) {
          li.innerHTML =
            "Call <code>" +
            escapeHtml(step.func) +
            "</code>" +
            (step.args != null && step.args !== ""
              ? " args=<strong>" + escapeHtml(String(step.args)) + "</strong>"
              : "") +
            (step.note ? '<span class="cv-step-note">' + escapeHtml(step.note) + "</span>" : "");
        } else {
          li.innerHTML =
            "<code>" +
            escapeHtml(step.var) +
            "</code> → <strong>" +
            escapeHtml(String(step.value)) +
            "</strong>" +
            (step.enumLabel
              ? ' <span class="cv-step-note">(' + escapeHtml(step.enumLabel) + ")</span>"
              : "") +
            (step.note ? '<span class="cv-step-note">' + escapeHtml(step.note) + "</span>" : "");
        }
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

  function postFunc(func, args) {
    // Same as stock UI: string body so commas in args are not encoded oddly
    var body =
      "func=" + encodeURIComponent(func) + "&args=" + encodeURIComponent(args == null ? "" : args);
    return fetch("consolefunccall", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body,
    }).then(function (r) {
      return r.text();
    });
  }

  function syncControlFromStep(step) {
    if (!step.var) return;
    var el = findControlByVarName(step.var);
    if (!el) return;
    if (el.type === "checkbox") {
      el.checked = !!step.value;
      return;
    }
    if (el.classList && el.classList.contains("amount")) {
      el.value = step.value;
      return;
    }
    if (el.classList && el.classList.contains("slider") && window.jQuery) {
      try {
        var scale = window.jQuery(el).data("scale") || 1;
        window.jQuery(el).slider("value", Number(step.value) * scale);
      } catch (e) {}
      return;
    }
    // Enum listbox: stock posts item.index; update select if present
    if (el.tagName === "SELECT" || (el.classList && el.classList.contains("listbox"))) {
      var idx = Number(step.value);
      if (window.jQuery && window.jQuery(el).data("ui-selectmenu")) {
        try {
          window.jQuery(el).val(window.jQuery(el).children().eq(idx).val());
          window.jQuery(el).selectmenu("refresh");
        } catch (e2) {
          el.selectedIndex = idx;
        }
      } else {
        el.selectedIndex = idx;
      }
    }
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
      var p;
      if (step.func) {
        if (status) status.textContent = "Calling " + step.func + " …";
        p = postFunc(step.func, step.args || "").then(function (text) {
          var out = $("#id_consolefunc_result");
          if (out && text) out.innerHTML = String(text).replace(/\n/g, "<br>");
        });
      } else if (step.var != null) {
        if (status) status.textContent = "Setting " + step.var + " …";
        syncControlFromStep(step);
        p = postVar(step.var, step.value);
      } else {
        p = Promise.resolve();
      }
      p.catch(function (e) {
        console.warn(e);
      }).then(function () {
        setTimeout(next, 100);
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
      var name = step.var || step.func;
      if (!name) return;
      var el = findControlByVarName(name) || document.getElementById(name + "_function");
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
    // Activate parent jQuery UI tab if needed (#tabs preferred; classic uses #main)
    var panel = row.closest('[id^="tabs-"]');
    if (panel && window.jQuery) {
      var $host = window.jQuery("#tabs");
      if (!$host.length) $host = window.jQuery("#main");
      if ($host.length && $host.data("ui-tabs")) {
        var idx = $host.children("div").index(panel);
        if (idx >= 0) $host.tabs("option", "active", idx);
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
      if (t.matches(".cv-help") || t.closest(".cv-help")) {
        var helpBtn = t.matches(".cv-help") ? t : t.closest(".cv-help");
        e.preventDefault();
        e.stopPropagation();
        toggleHelpPopover(helpBtn);
        return;
      }
      if (t.matches("[data-recipe]")) {
        applyRecipe(t.getAttribute("data-recipe"));
      } else if (t.matches("[data-focus-recipe]")) {
        highlightRecipe(t.getAttribute("data-focus-recipe"));
      } else if (t.matches(".cv-linkvar") || t.closest(".cv-linkvar")) {
        var b = t.matches(".cv-linkvar") ? t : t.closest(".cv-linkvar");
        focusVar(b.getAttribute("data-var"));
      } else if (!t.closest(".cv-popover") && !t.closest(".cv-marks")) {
        closeAllPopovers();
      }
    });
  }

  function initTabs() {
    if (!window.jQuery) return;
    var $ = window.jQuery;
    // Prefer #tabs (generated); fall back to #main. Skip if already a tabs widget
    // (classic consolevarsui.html already calls $("#main").tabs()).
    if ($("#tabs").length) {
      try {
        if (!$("#tabs").data("ui-tabs")) {
          $("#tabs").tabs();
        }
      } catch (e) {
        console.warn(e);
      }
    } else if ($("#main").length) {
      try {
        if (!$("#main").data("ui-tabs")) {
          $("#main").tabs();
        }
      } catch (e2) {}
    }
  }

  /** Classic page has no #cvStatus — inject a small load line so 404s are visible. */
  function setClassicCatalogStatus(text, isError) {
    var el = $("#cvStatus");
    if (el) {
      el.textContent = text;
      return;
    }
    var host = $("#console") || document.body;
    if (!host) return;
    var bar = $("#cvClassicStatus");
    if (!bar) {
      bar = document.createElement("p");
      bar.id = "cvClassicStatus";
      bar.className = "cv-classic-status";
      var h = host.querySelector("h3");
      if (h && h.nextSibling) {
        host.insertBefore(bar, h.nextSibling);
      } else {
        host.insertBefore(bar, host.firstChild);
      }
    }
    bar.textContent = text;
    bar.classList.toggle("cv-classic-status-err", !!isError);
  }

  function countDecorated() {
    return $all(".cv-marks").length;
  }

  function boot() {
    // Explorer-only chrome: no-ops when nodes are absent (classic /consolevars).
    setProcessBadge();
    initTabs();
    wireSearch();
    wireClicks();
    setClassicCatalogStatus("Loading catalog…", false);
    fetchCatalog().then(function (c) {
      catalog = c;
      if (!c) {
        setClassicCatalogStatus(
          "Catalog not loaded (check /consolevars/index.json). Raw controls still work.",
          true
        );
        var root = $("#cvRecipes");
        if (root) {
          root.innerHTML =
            '<p class="cv-muted">Catalog missing — recipes unavailable. UI still works for raw vars.</p>';
        }
        return;
      }
      renderRecipes(); // no-op without #cvRecipes
      decorateRows(); // always: help / dead marks on #tabs or #main
      var n = Object.keys(c.vars || {}).length;
      var r = (c.recipes || []).length;
      var d = countDecorated();
      setClassicCatalogStatus(
        "Catalog: " + n + " notes · " + d + " marked on this page · " + r + " recipes",
        false
      );
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
