/**
 * WebViz shell DOM helpers — nav, surfaces, toasts, status.
 * Does not own module lifecycle; app.js wires that.
 */
(function (global) {
  "use strict";

  function $(id) {
    return document.getElementById(id);
  }

  function toast(title, body, kind) {
    var root = $("toasts");
    if (!root) {
      return;
    }
    var el = document.createElement("div");
    el.className = "toast" + (kind ? " is-" + kind : "");
    el.setAttribute("role", "status");

    var t = document.createElement("div");
    t.className = "t-title";
    t.textContent = title;
    el.appendChild(t);

    var close = document.createElement("button");
    close.type = "button";
    close.className = "t-close";
    close.setAttribute("aria-label", "Dismiss");
    close.textContent = "×";
    close.addEventListener("click", function () {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
    el.appendChild(close);

    if (body) {
      var b = document.createElement("div");
      b.className = "t-body";
      b.textContent = body;
      el.appendChild(b);
    }

    root.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }, kind === "error" ? 12000 : 5000);
  }

  function setConn(state, label) {
    var el = $("conn");
    var text = $("connLabel");
    if (!el || !text) {
      return;
    }
    el.classList.remove("is-live", "is-connecting", "is-err", "is-dead", "is-demo");
    var map = {
      live: "is-live",
      connecting: "is-connecting",
      error: "is-err",
      dead: "is-dead",
      demo: "is-demo",
    };
    el.classList.add(map[state] || "is-dead");
    text.textContent = label || state;
  }

  function setStatus(left, right) {
    var l = $("statusLeft");
    var r = $("statusRight");
    if (l && left != null) {
      l.textContent = left;
    }
    if (r && right != null) {
      r.textContent = right;
    }
  }

  function setPill(id, htmlOrText, isHtml) {
    var el = $(id);
    if (!el) {
      return;
    }
    if (isHtml) {
      el.innerHTML = htmlOrText;
    } else {
      el.textContent = htmlOrText;
    }
  }

  /**
   * Build sidebar nav from profile + loaded modules.
   * @param {Object} opts
   * @param {Object} opts.profile  from WebVizConfig.profileForPort
   * @param {Object} opts.displayNames  key → display
   * @param {Object} opts.byKey  loaded methods by key
   * @param {function(string)} opts.onSelect  key or "overview"
   */
  function buildNav(opts) {
    var scroll = $("navScroll");
    if (!scroll) {
      return;
    }
    scroll.innerHTML = "";

    // Overview always first
    scroll.appendChild(
      makeNavItem({
        key: "overview",
        label: "Overview",
        glyph: "🏠",
        group: null,
      })
    );

    var profile = opts.profile;
    var byKey = opts.byKey || {};
    var displayNames = opts.displayNames || {};
    var placed = Object.create(null);

    (profile.groups || []).forEach(function (group) {
      var wrap = document.createElement("div");
      wrap.className = "nav-group";
      wrap.dataset.group = group.id;

      var lab = document.createElement("div");
      lab.className = "nav-group-label";
      lab.textContent = group.label;
      wrap.appendChild(lab);

      var any = false;
      (group.keys || []).forEach(function (dn) {
        var key = dn.toLowerCase();
        if (placed[key]) {
          return;
        }
        // Include if registered for this profile (loaded or not)
        if (!(dn in profile.modules) && !byKey[key]) {
          return;
        }
        placed[key] = true;
        any = true;
        wrap.appendChild(
          makeNavItem({
            key: key,
            label: displayNames[key] || dn,
            glyph: (displayNames[key] || dn).charAt(0),
            loaded: !!byKey[key],
          })
        );
      });
      if (any) {
        scroll.appendChild(wrap);
      }
    });

    // Remainder not in groups (and any loaded keys missing from registry groups)
    var restDisplay = Object.keys(profile.modules || {}).filter(function (dn) {
      return !placed[dn.toLowerCase()];
    });
    Object.keys(byKey).forEach(function (key) {
      if (!placed[key]) {
        restDisplay.push(displayNames[key] || key);
      }
    });
    if (restDisplay.length) {
      var wrap2 = document.createElement("div");
      wrap2.className = "nav-group";
      var lab2 = document.createElement("div");
      lab2.className = "nav-group-label";
      lab2.textContent = "More";
      wrap2.appendChild(lab2);
      restDisplay.forEach(function (dn) {
        var key = String(dn).toLowerCase();
        if (placed[key]) {
          return;
        }
        placed[key] = true;
        wrap2.appendChild(
          makeNavItem({
            key: key,
            label: displayNames[key] || dn,
            glyph: (displayNames[key] || dn).charAt(0),
            loaded: !!byKey[key],
          })
        );
      });
      scroll.appendChild(wrap2);
    }

    scroll.querySelectorAll(".nav-item").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.getAttribute("data-mod");
        if (opts.onSelect) {
          opts.onSelect(key);
        }
      });
    });
  }

  function makeNavItem(info) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nav-item";
    if (info.loaded === false) {
      btn.classList.add("is-error");
    }
    btn.dataset.mod = info.key;
    btn.setAttribute("title", info.label);

    var dot = document.createElement("span");
    dot.className = "status-dot";
    btn.appendChild(dot);

    var glyph = document.createElement("span");
    glyph.className = "glyph";
    glyph.textContent = info.glyph || "·";
    btn.appendChild(glyph);

    var label = document.createElement("span");
    label.className = "label";
    label.textContent = info.label;
    btn.appendChild(label);

    var badge = document.createElement("span");
    badge.className = "badge";
    badge.dataset.role = "msgcount";
    badge.textContent = "";
    badge.hidden = true;
    btn.appendChild(badge);

    return btn;
  }

  function setActiveNav(key) {
    document.querySelectorAll(".nav-item").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-mod") === key);
    });
  }

  /**
   * Nav “live” indicator only — do NOT show a climbing message tally here
   * (that looked like a subscription count and grew 2 → 4 → 8 on each resub).
   * Optional count goes in the title tooltip only.
   */
  function markNavLive(key, subscribed, msgCount) {
    var btn = document.querySelector('.nav-item[data-mod="' + key + '"]');
    if (!btn) {
      return;
    }
    btn.classList.toggle("is-live", !!subscribed);
    var badge = btn.querySelector('[data-role="msgcount"]');
    if (badge) {
      if (subscribed) {
        badge.hidden = false;
        badge.textContent = "on";
        badge.title =
          typeof msgCount === "number" && msgCount > 0
            ? msgCount + " message(s) this session"
            : "Subscribed";
      } else {
        badge.hidden = true;
        badge.textContent = "";
        badge.title = "";
      }
    }
    var label = (btn.querySelector(".label") || {}).textContent || key;
    if (subscribed && typeof msgCount === "number" && msgCount > 0) {
      btn.title = label + " · subscribed · " + msgCount + " msgs";
    } else if (subscribed) {
      btn.title = label + " · subscribed";
    } else {
      btn.title = label;
    }
  }

  function markNavError(key) {
    var btn = document.querySelector('.nav-item[data-mod="' + key + '"]');
    if (btn) {
      btn.classList.add("is-error");
    }
  }

  function filterNav(query) {
    var q = (query || "").trim().toLowerCase();
    document.querySelectorAll(".nav-item").forEach(function (btn) {
      if (btn.getAttribute("data-mod") === "overview") {
        btn.classList.remove("is-hidden");
        return;
      }
      var label = (btn.querySelector(".label") || {}).textContent || "";
      var match = !q || label.toLowerCase().indexOf(q) >= 0 || btn.getAttribute("data-mod").indexOf(q) >= 0;
      btn.classList.toggle("is-hidden", !match);
    });
    // Hide empty groups
    document.querySelectorAll(".nav-group").forEach(function (g) {
      var visible = g.querySelectorAll(".nav-item:not(.is-hidden)").length;
      g.style.display = visible ? "" : "none";
    });
  }

  /**
   * Ensure a surface exists for a module and return { surface, host }.
   * Host element is what modules receive as `elem` — id tab-{key} for
   * stock CSS selectors (#tab-behaviors …).
   */
  function ensureModuleSurface(key, displayName, description) {
    var stage = $("stage");
    var id = "surface-" + key;
    var surface = $(id);
    if (!surface) {
      surface = document.createElement("section");
      surface.className = "surface";
      surface.id = id;
      surface.dataset.mod = key;

      var head = document.createElement("div");
      head.className = "surface-head";

      var h1 = document.createElement("h1");
      h1.textContent = displayName;
      head.appendChild(h1);

      var desc = document.createElement("span");
      desc.className = "desc";
      desc.textContent = description || "";
      head.appendChild(desc);

      var tools = document.createElement("div");
      tools.className = "tools";
      var subBadge = document.createElement("span");
      subBadge.className = "pill";
      subBadge.id = "substate-" + key;
      subBadge.textContent = "not subscribed";
      tools.appendChild(subBadge);
      var subBtn = document.createElement("button");
      subBtn.type = "button";
      subBtn.className = "btn";
      subBtn.id = "subtoggle-" + key;
      subBtn.dataset.mod = key;
      subBtn.dataset.role = "sub-toggle";
      subBtn.textContent = "Subscribe";
      subBtn.title = "Subscribe / unsubscribe this module’s data stream";
      tools.appendChild(subBtn);
      head.appendChild(tools);

      surface.appendChild(head);

      var host = document.createElement("div");
      // Dual ids: stock modules & createStyles use #tab-{name};
      // panel id is for shell tooling.
      host.id = "tab-" + key;
      host.className = "module-host";
      host.dataset.panel = key;
      // Also set attribute many modules might not need
      host.setAttribute("data-webviz-panel", key);
      surface.appendChild(host);

      stage.appendChild(surface);
    }
    return {
      surface: surface,
      host: surface.querySelector(".module-host"),
    };
  }

  function showSurface(key) {
    document.querySelectorAll(".surface").forEach(function (s) {
      s.classList.toggle("is-active", s.dataset.mod === key || s.id === "surface-" + key);
    });
    setActiveNav(key);
  }

  function setSubState(key, text, subscribed) {
    var el = $("substate-" + key);
    if (el) {
      el.textContent = text;
      el.classList.toggle("is-on", !!subscribed);
    }
    var btn = $("subtoggle-" + key);
    if (btn) {
      btn.textContent = subscribed ? "Unsubscribe" : "Subscribe";
      btn.classList.toggle("is-on", !!subscribed);
      btn.setAttribute("aria-pressed", subscribed ? "true" : "false");
    }
    // Keep nav badge in sync (on / hidden) — never a climbing counter
    markNavLive(key, !!subscribed, null);
  }

  global.WebVizUI = {
    toast: toast,
    setConn: setConn,
    setStatus: setStatus,
    setPill: setPill,
    buildNav: buildNav,
    setActiveNav: setActiveNav,
    markNavLive: markNavLive,
    markNavError: markNavError,
    filterNav: filterNav,
    ensureModuleSurface: ensureModuleSurface,
    showSurface: showSurface,
    setSubState: setSubState,
  };
})(window);
