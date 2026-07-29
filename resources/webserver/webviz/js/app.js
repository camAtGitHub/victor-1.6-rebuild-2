/**
 * WebViz application bootstrap.
 * Hosts stock webVizModules with a modular shell: sidebar nav, reconnecting
 * socket, per-module error isolation (toasts, not alert spam).
 */
(function () {
  "use strict";

  var Cfg = window.WebVizConfig;
  var UI = window.WebVizUI;
  var Loader = window.WebVizLoader;
  var SocketCtor = window.WebVizSocket;

  var state = {
    profile: null,
    feed: null, // { host, port, mode, wsUrl, remoteHost }
    byKey: Object.create(null),
    displayNames: Object.create(null),
    mounted: Object.create(null), // key → true after init (once)
    subscribed: Object.create(null), // key → true while WS subscribed
    msgCount: Object.create(null),
    moduleErrors: Object.create(null), // key → last error string
    activeKey: "overview",
    socket: null,
    fakeData: undefined,
    autoTab: "",
    updateTimer: null,
    /** Show Robot feed IP UI after remote params / WebViz feed commands */
    feedUiUnlocked: false,
  };

  function init() {
    // Feed target: ?host= / localStorage / page origin (see resolveFeed)
    state.feed = Cfg.resolveFeed();
    state.profile = Cfg.profileForPort(state.feed.port);

    paintProfileChrome();
    wireChrome();
    installConsoleApi();

    UI.setConn("connecting", "connecting…");
    UI.setStatus("Loading modules…", feedStatusLabel());

    state.socket = new SocketCtor({
      url: state.feed.wsUrl,
      onStatus: onSocketStatus,
      onMessage: onSocketMessage,
      onError: function (err) {
        UI.toast("WebSocket", String(err && err.message ? err.message : err), "error");
      },
    });

    Loader.loadAllModules(state.profile.modules, function (moduleKey, data) {
      if (state.socket) {
        state.socket.sendData(moduleKey, data);
      }
    }).then(function (result) {
      state.byKey = result.byKey;
      state.displayNames = result.displayNames;

      result.errors.forEach(function (e) {
        UI.toast("Module load", e.name + ": " + e.error, "error");
        UI.markNavError(e.name.toLowerCase());
      });

      UI.buildNav({
        profile: state.profile,
        displayNames: state.displayNames,
        byKey: state.byKey,
        onSelect: selectModule,
      });

      fillOverview(result);
      startUpdateLoop();
      state.socket.connect();
      tryLoadFakeData();

      var query = Cfg.parseQuery(window.location.search);
      if (query.tab) {
        state.autoTab = String(query.tab).toLowerCase();
      }

      // Default surface
      selectModule("overview");
      UI.setStatus(
        "Shell ready · " + Object.keys(state.byKey).length + " modules",
        feedStatusLabel()
      );

      if (state.feed.mode === "remote") {
        UI.toast(
          "Remote feed",
          state.feed.host + ":" + state.feed.port + " (assets from this page)",
          "ok"
        );
      }
    });
  }

  function feedStatusLabel() {
    var f = state.feed;
    var p = state.profile;
    if (!f || !p) {
      return "—";
    }
    if (f.mode === "remote") {
      return p.label + " @ " + f.host + ":" + f.port;
    }
    return p.processTitle + " :" + f.port;
  }

  function paintProfileChrome() {
    var p = state.profile;
    var f = state.feed;
    UI.setPill("pillProcess", p.label + " · " + p.processTitle);
    if (f && f.mode === "remote") {
      UI.setPill("pillPort", f.host + ":" + f.port);
    } else {
      UI.setPill("pillPort", ":" + p.port);
    }
    UI.setPill("pillModuleCount", Object.keys(p.modules).length + " modules");

    var title = document.getElementById("brandSubtitle");
    if (title) {
      title.textContent = f && f.mode === "remote" ? p.label + " · remote" : p.label;
    }

    var portSel = document.getElementById("portSel");
    if (portSel) {
      portSel.value = p.port === "8889" ? "8889" : "8888";
    }

    var hostInput = document.getElementById("feedHost");
    if (hostInput) {
      hostInput.value = (f && f.remoteHost) || "";
      hostInput.placeholder = "robot IP (blank = this host)";
    }

    var otherLink = document.getElementById("otherProcessLink");
    if (otherLink) {
      otherLink.href = buildSamePageUrl({ port: p.otherPort });
      otherLink.textContent = p.otherLabel + " :" + p.otherPort;
    }

    var feedHint = document.getElementById("feedHint");
    if (feedHint && f) {
      feedHint.textContent =
        f.mode === "remote"
          ? "Feed: " + f.wsUrl
          : "Feed: this page host · console: WebViz.connect('robot-ip')";
    }

    updateFeedControlsVisibility();
  }

  /**
   * Robot feed IP row is hidden by default.
   * Shown when remote feed is active (?host= / localStorage / connect)
   * or after any WebViz.* API use that unlocks it.
   * Process port select always stays visible.
   */
  function updateFeedControlsVisibility() {
    var el = document.getElementById("feedControls");
    if (!el) {
      return;
    }
    var q = Cfg.parseQuery(window.location.search);
    var fromQuery = !!(q.host || q.robot);
    var remote = state.feed && state.feed.mode === "remote";
    var show = !!(state.feedUiUnlocked || fromQuery || remote);
    if (show) {
      el.hidden = false;
      el.removeAttribute("hidden");
    } else {
      el.hidden = true;
      el.setAttribute("hidden", "");
    }
  }

  /** Reveal feed UI (console / URL / remote session). */
  function unlockFeedControls() {
    state.feedUiUnlocked = true;
    updateFeedControlsVisibility();
  }

  /** Stay on the dev-PC page; only change query host/port (and reload if needed). */
  function buildSamePageUrl(opts) {
    opts = opts || {};
    var loc = window.location;
    var q = Cfg.parseQuery(loc.search);
    var host =
      opts.host !== undefined
        ? opts.host
        : state.feed && state.feed.remoteHost
          ? state.feed.remoteHost
          : q.host || q.robot || "";
    var port =
      opts.port !== undefined
        ? opts.port
        : (state.feed && state.feed.port) || q.port || "8888";

    var parts = [];
    if (host) {
      parts.push("host=" + encodeURIComponent(host));
    }
    if (port) {
      parts.push("port=" + encodeURIComponent(port));
    }
    if (q.tab) {
      parts.push("tab=" + encodeURIComponent(q.tab));
    }
    var search = parts.length ? "?" + parts.join("&") : "";
    // Prefer current origin (dev server); file:// keeps path only
    if (loc.protocol === "file:") {
      return loc.pathname + search;
    }
    return loc.protocol + "//" + loc.host + loc.pathname + search;
  }

  /**
   * Point the live socket at a robot (or clear remote feed).
   * Does not reload if only host/port for the *same* module profile changes.
   * Reloads when engine↔anim module set must change.
   */
  function applyFeedTarget(hostInput, portInput, options) {
    options = options || {};
    var parsed = hostInput
      ? Cfg.parseFeedTarget(hostInput, portInput || (state.feed && state.feed.port) || "8888")
      : { host: "", port: portInput || (state.feed && state.feed.port) || "8888" };

    if (hostInput && !parsed) {
      UI.toast("Feed", "Could not parse host: " + hostInput, "error");
      unlockFeedControls();
      return false;
    }

    var newHost = parsed && parsed.host ? parsed.host : "";
    var newPort = (parsed && parsed.port) || portInput || "8888";
    var oldPort = state.feed ? state.feed.port : Cfg.portFromLocation();
    var oldProfile = Cfg.profileForPort(oldPort);
    var newProfile = Cfg.profileForPort(newPort);

    // Any feed retarget (including Local) is a “dev feed” action → show the row
    if (options.unlockUi !== false) {
      unlockFeedControls();
    }

    Cfg.writeStoredFeed(newHost || null, newPort);

    // Module set change (engine ↔ anim) → full reload with query params
    if (oldProfile.id !== newProfile.id) {
      window.location.href = buildSamePageUrl({ host: newHost, port: newPort });
      return true;
    }

    state.feed = Cfg.resolveFeed({ host: newHost, port: newPort });
    state.profile = newProfile;
    paintProfileChrome();

    if (state.socket) {
      state.socket.setUrl(state.feed.wsUrl);
      state.socket.connect();
    }

    UI.toast(
      newHost ? "Remote feed" : "Local feed",
      state.feed.wsUrl,
      "ok"
    );
    UI.setStatus("Feed updated", feedStatusLabel());

    if (options.syncUrl !== false) {
      try {
        var url = buildSamePageUrl({ host: newHost, port: newPort });
        window.history.replaceState(null, "", url);
      } catch (e) {
        /* file:// may block */
      }
    }
    return true;
  }

  function wireChrome() {
    var btnNav = document.getElementById("btnNavToggle");
    if (btnNav) {
      btnNav.addEventListener("click", function () {
        document.getElementById("app").classList.toggle("nav-collapsed");
      });
    }

    var search = document.getElementById("moduleSearch");
    if (search) {
      search.addEventListener("input", function () {
        UI.filterNav(search.value);
      });
      document.addEventListener("keydown", function (e) {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
          e.preventDefault();
          search.focus();
        }
      });
    }

    var portSel = document.getElementById("portSel");
    if (portSel) {
      portSel.addEventListener("change", function () {
        var port = portSel.value;
        var remote = state.feed && state.feed.remoteHost;
        // Remote (or local static server): stay on this origin, retarget WS
        if (remote || isDevStaticServer()) {
          applyFeedTarget(remote || "", port);
          return;
        }
        // Classic: page is served by the robot process itself → navigate
        var loc = window.location;
        if (loc.protocol === "file:") {
          UI.toast("Port switch", "Use WebViz.connect('robot-ip', " + port + ")", "warn");
          return;
        }
        window.location.href =
          loc.protocol + "//" + loc.hostname + ":" + port + loc.pathname + loc.search + loc.hash;
      });
    }

    var feedHost = document.getElementById("feedHost");
    var btnFeed = document.getElementById("btnFeedApply");
    function applyFromUi() {
      var host = feedHost ? feedHost.value.trim() : "";
      var port = portSel ? portSel.value : state.feed.port;
      applyFeedTarget(host, port);
    }
    if (btnFeed) {
      btnFeed.addEventListener("click", applyFromUi);
    }
    if (feedHost) {
      feedHost.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          applyFromUi();
        }
      });
    }

    var btnFeedClear = document.getElementById("btnFeedClear");
    if (btnFeedClear) {
      btnFeedClear.addEventListener("click", function () {
        if (feedHost) {
          feedHost.value = "";
        }
        applyFeedTarget("", state.feed ? state.feed.port : "8888");
      });
    }

    var btnReconnect = document.getElementById("btnReconnect");
    if (btnReconnect) {
      btnReconnect.addEventListener("click", function () {
        if (state.socket) {
          state.socket.connect();
          UI.toast("Socket", "Reconnecting…", "ok");
        }
      });
    }

    // Module header Subscribe / Unsubscribe
    var stage = document.getElementById("stage");
    if (stage) {
      stage.addEventListener("click", function (e) {
        var btn = e.target && e.target.closest && e.target.closest('[data-role="sub-toggle"]');
        if (!btn) {
          return;
        }
        var key = btn.getAttribute("data-mod");
        if (!key) {
          return;
        }
        if (state.subscribed[key]) {
          unsubscribeModule(key);
        } else {
          subscribeModule(key);
        }
      });
    }
  }

  function subscribedCount() {
    return Object.keys(state.subscribed).length;
  }

  function subscribedList() {
    return Object.keys(state.subscribed).sort();
  }

  /** Keep top/bottom chrome honest about WS + subscription count. */
  function refreshConnStatus(socketStatus) {
    var open = state.socket && state.socket.isOpen();
    var n = subscribedCount();
    var names = subscribedList();

    if (socketStatus === "connecting") {
      UI.setStatus("Connecting… · " + n + " will resubscribe", feedStatusLabel());
      return;
    }
    if (socketStatus === "dead" || socketStatus === "error" || (!open && socketStatus !== "live")) {
      if (!open) {
        UI.setStatus(
          (socketStatus === "error" ? "Error" : "Disconnected") +
            " · " +
            n +
            " module" +
            (n === 1 ? "" : "s") +
            " remembered",
          feedStatusLabel()
        );
        return;
      }
    }

    if (open) {
      var left =
        "Connected · " +
        n +
        " subscribed" +
        (n > 0 && n <= 4 ? " (" + names.join(", ") + ")" : n > 4 ? " (" + names.slice(0, 3).join(", ") + "…)" : "");
      UI.setStatus(left, feedStatusLabel());
    }
  }

  /** True when HTML is not coming from robot ports 8887–8889 (dev PC static server). */
  function isDevStaticServer() {
    var loc = window.location;
    if (loc.protocol === "file:") {
      return true;
    }
    var p = String(loc.port || "");
    if (p === "8888" || p === "8889" || p === "8887") {
      return false;
    }
    // default http port or any other → treat as static / reverse-proxy host
    return true;
  }

  function consoleHelpText() {
    var feed = state.feed;
    var feedLine = feed
      ? "  Current feed: " + feed.wsUrl + " (" + feed.mode + ")"
      : "  Current feed: (resolving…)";
    return [
      "",
      "┌─ WebViz ──────────────────────────────────────────────────────────┐",
      "│  Page assets: this browser tab (dev PC or robot).                 │",
      "│  Live data:   WebSocket feed (can be a different robot IP).       │",
      "├───────────────────────────────────────────────────────────────────┤",
      "│  Point feed at robot (keep this page):                            │",
      "│                                                                   │",
      "│    WebViz.connect('192.168.1.42')                                  │",
      "│    WebViz.connect('192.168.1.42', 8889)   // anim                  │",
      "│    WebViz.connect('192.168.1.42:8888')                             │",
      "│                                                                   │",
      "│    WebViz.useLocal()     // feed = this page host again            │",
      "│    WebViz.reconnect()                                             │",
      "│    WebViz.subscribe('behaviors')                                  │",
      "│    WebViz.unsubscribe('behaviors')                                │",
      "│    WebViz.status()                                                │",
      "│    WebViz.help()         // print this again                      │",
      "│                                                                   │",
      "│  URL:  ?host=192.168.1.42&port=8888                                │",
      "│  UI:   sidebar → Robot feed → Apply                               │",
      feedLine,
      "└───────────────────────────────────────────────────────────────────┘",
      "",
    ].join("\n");
  }

  function installConsoleApi() {
    function withFeedUi(fn) {
      return function () {
        unlockFeedControls();
        return fn.apply(this, arguments);
      };
    }

    var api = {
      /**
       * Point the data feed at a robot while keeping this page's assets.
       * @example WebViz.connect("192.168.1.42")
       * @example WebViz.connect("192.168.1.42", 8889)  // anim modules
       * @example WebViz.connect("192.168.1.42:8888")
       */
      connect: withFeedUi(function (hostOrUrl, port) {
        if (hostOrUrl == null || hostOrUrl === "") {
          console.warn(
            "[WebViz] Usage: WebViz.connect('robot-ip'[, port])\n" +
              "  example: WebViz.connect('192.168.1.42')\n" +
              "  clear:   WebViz.useLocal()\n" +
              "  help:    WebViz.help()"
          );
          return api.status();
        }
        var parsed = Cfg.parseFeedTarget(hostOrUrl, port);
        if (!parsed || !parsed.host) {
          console.error("[WebViz] Could not parse robot address:", hostOrUrl);
          console.info(consoleHelpText());
          return null;
        }
        var p = port != null ? String(port) : parsed.port || (state.feed && state.feed.port) || "8888";
        applyFeedTarget(parsed.host, p, { unlockUi: true });
        console.info(
          "[WebViz] Feed → " + state.feed.wsUrl + "\n" +
            "  Open a module in the sidebar to subscribe."
        );
        return api.status();
      }),

      /** Clear remote robot target; feed = this page's host again. */
      useLocal: withFeedUi(function () {
        applyFeedTarget("", (state.feed && state.feed.port) || "8888", { unlockUi: true });
        console.info("[WebViz] Feed → local page host: " + (state.feed && state.feed.wsUrl));
        return api.status();
      }),

      /** Force reconnect to current feed URL. */
      reconnect: withFeedUi(function () {
        if (state.socket) {
          state.socket.connect();
        }
        console.info("[WebViz] Reconnecting → " + (state.feed && state.feed.wsUrl));
        return api.status();
      }),

      /** Subscribe a module stream (same as opening it / clicking Subscribe). */
      subscribe: withFeedUi(function (name) {
        var key = String(name || "").toLowerCase();
        if (!key || !state.byKey[key]) {
          console.warn("[WebViz] Unknown module. Try:", Object.keys(state.byKey).sort().join(", "));
          return api.status();
        }
        selectModule(key);
        subscribeModule(key);
        return api.status();
      }),

      /** Stop robot data for a module (keeps the panel mounted). */
      unsubscribe: withFeedUi(function (name) {
        var key = String(name || "").toLowerCase();
        if (!key) {
          console.warn("[WebViz] Usage: WebViz.unsubscribe('behaviors')");
          return api.status();
        }
        unsubscribeModule(key);
        return api.status();
      }),

      status: withFeedUi(function () {
        var s = {
          feed: state.feed,
          profile: state.profile && {
            id: state.profile.id,
            label: state.profile.label,
            port: state.profile.port,
          },
          socketOpen: !!(state.socket && state.socket.isOpen()),
          subscribed: subscribedList(),
          subscribedCount: subscribedCount(),
          mounted: Object.keys(state.mounted).sort(),
          page: window.location.href,
        };
        console.log("[WebViz] status", s);
        return s;
      }),

      help: withFeedUi(function () {
        var msg = consoleHelpText();
        console.log(msg);
        return msg;
      }),
    };

    window.WebViz = api;

    // Always echo how-to when the shell boots (what you asked for).
    console.log(consoleHelpText());
    console.info(
      "%c[WebViz]%c type %cWebViz.connect('robot-ip')%c  ·  %cWebViz.help()%c for this box again",
      "color:#3ecf8e;font-weight:700",
      "color:inherit",
      "color:#5b9fd4;font-weight:600",
      "color:inherit",
      "color:#5b9fd4;font-weight:600",
      "color:inherit"
    );
  }

  function fillOverview(result) {
    var host = document.querySelector("#surface-overview .module-host");
    if (!host) {
      return;
    }

    var p = state.profile;
    var loaded = Object.keys(state.byKey).length;
    var total = Object.keys(p.modules).length;
    var failed = result.errors.length;

    var otherUrl = Cfg.siblingUrl(p.otherPort);

    host.innerHTML =
      '<div class="overview">' +
      "<h2>WebViz</h2>" +
      "<p>Live debug surface for Vector. Each module subscribes over WebSocket " +
      "when you open it. This shell replaces the old folder-tab UI with a modular host — " +
      "module scripts under <code>webVizModules/</code> are unchanged.</p>" +
      '<div class="card-grid">' +
      '<div class="card"><h3>Process</h3><p><b>' +
      escapeHtml(p.label) +
      "</b><br/>" +
      escapeHtml(p.processTitle) +
      " on port <code>" +
      escapeHtml(p.port) +
      "</code></p></div>" +
      '<div class="card"><h3>Modules</h3><p><b>' +
      loaded +
      "</b> loaded / " +
      total +
      " registered" +
      (failed ? "<br/><span style=\"color:var(--wv-bad)\">" + failed + " failed</span>" : "") +
      "</p></div>" +
      '<div class="card"><h3>Data feed</h3><p>' +
      (state.feed && state.feed.mode === "remote"
        ? "<b>Remote robot</b><br/><code>" + escapeHtml(state.feed.wsUrl) + "</code>"
        : "<b>This page host</b><br/><code>" +
          escapeHtml((state.feed && state.feed.wsUrl) || "—") +
          "</code>") +
      "</p></div>" +
      '<div class="card"><h3>Other process</h3><p>Need ' +
      escapeHtml(p.otherLabel) +
      ' tabs?<br/><a href="' +
      escapeHtml(otherUrl) +
      '">' +
      escapeHtml(p.otherLabel) +
      " :" +
      escapeHtml(p.otherPort) +
      "</a></p></div>" +
      "</div>" +
      '<div class="callout">' +
      "<b>Dev PC + robot feed:</b> serve this folder on your machine, then in the browser console:<br/>" +
      "<code>WebViz.connect('192.168.x.x')</code> &nbsp;or&nbsp; " +
      "<code>?host=192.168.x.x&amp;port=8888</code> in the URL. " +
      "Assets stay local; WebSocket goes to the robot." +
      "</div>" +
      '<div class="callout">' +
      "<b>Tip:</b> Open a module in the sidebar to subscribe. Data only streams for open (subscribed) modules. " +
      "Force-refresh assets with <code>Cmd/Ctrl+Shift+R</code> if tabs look stale after a deploy." +
      "</div>" +
      "<p>Stock shell kept as <code>webViz.legacy.html</code>. Module API is still " +
      "<code>init</code> / <code>onData</code> / <code>update</code> / <code>getStyles</code> + <code>sendData</code>.</p>" +
      '<div id="devDataDump"><div>{</div><div>}</div></div>' +
      "</div>";
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function selectModule(key) {
    key = String(key || "overview").toLowerCase();
    state.activeKey = key;

    if (key === "overview") {
      UI.showSurface("overview");
      UI.setPill("pillActive", "Overview");
      return;
    }

    if (!state.byKey[key]) {
      UI.toast("Module", (state.displayNames[key] || key) + " is not loaded", "error");
      UI.showSurface("overview");
      return;
    }

    var display = state.displayNames[key] || key;
    var desc = (Cfg.DESCRIPTIONS && Cfg.DESCRIPTIONS[display]) || (Cfg.DESCRIPTIONS && Cfg.DESCRIPTIONS[key]) || "";
    var pair = UI.ensureModuleSurface(key, display, desc);
    UI.showSurface(key);
    UI.setPill("pillActive", display);

    // Opening a module always ensures a live subscription (re-sub if you left and came back).
    if (!state.mounted[key]) {
      mountModule(key, pair.host);
    }
    if (!state.subscribed[key]) {
      subscribeModule(key);
    } else {
      refreshConnStatus("live");
    }
  }

  /** One-time DOM init + styles for a module panel. */
  function mountModule(key, hostElem) {
    var methods = state.byKey[key];
    if (!methods || !hostElem || state.mounted[key]) {
      return;
    }

    try {
      var styles = methods.getStyles();
      if (styles) {
        Loader.createScopedStyles(key, styles);
      }
    } catch (err) {
      reportModuleError(key, "getStyles", err);
    }

    try {
      methods.init(hostElem);
    } catch (err) {
      reportModuleError(key, "init", err);
    }

    state.mounted[key] = true;

    if (state.fakeData && state.fakeData[key]) {
      state.fakeData[key].forEach(function (entry) {
        deliverData(key, entry);
      });
    }
  }

  function subscribeModule(key) {
    key = String(key).toLowerCase();
    if (!state.byKey[key]) {
      return;
    }
    // Idempotent: already on → just refresh chrome (no double socket subscribe spam)
    if (state.subscribed[key]) {
      UI.setSubState(key, "subscribed", true);
      UI.markNavLive(key, true, state.msgCount[key] || 0);
      refreshConnStatus(state.socket && state.socket.isOpen() ? "live" : "dead");
      return;
    }
    if (!state.mounted[key]) {
      var pair = UI.ensureModuleSurface(
        key,
        state.displayNames[key] || key,
        ""
      );
      mountModule(key, pair.host);
    }
    // Fresh subscription session: reset per-module message tally for tooltips only
    state.msgCount[key] = 0;
    if (state.socket) {
      state.socket.subscribe(key);
    }
    state.subscribed[key] = true;
    UI.setSubState(key, "subscribed", true);
    UI.markNavLive(key, true, 0);
    refreshConnStatus(state.socket && state.socket.isOpen() ? "live" : "dead");
    console.info(
      "[WebViz] Subscribed:",
      key,
      "· total modules:",
      subscribedCount(),
      subscribedList()
    );
  }

  function unsubscribeModule(key) {
    key = String(key).toLowerCase();
    if (!state.subscribed[key]) {
      UI.setSubState(key, "not subscribed", false);
      UI.markNavLive(key, false, 0);
      refreshConnStatus(state.socket && state.socket.isOpen() ? "live" : "dead");
      return;
    }
    if (state.socket) {
      state.socket.unsubscribe(key);
    }
    delete state.subscribed[key];
    // Stop counting msgs for this module until they sub again
    state.msgCount[key] = 0;
    UI.setSubState(key, "not subscribed", false);
    UI.markNavLive(key, false, 0);
    UI.toast(
      state.displayNames[key] || key,
      "Unsubscribed — robot will stop sending this module’s data",
      "ok"
    );
    refreshConnStatus(state.socket && state.socket.isOpen() ? "live" : "dead");
    console.info(
      "[WebViz] Unsubscribed:",
      key,
      "· still subscribed (" + subscribedCount() + "):",
      subscribedList()
    );
  }

  function onSocketStatus(status) {
    var labels = {
      live: "connected",
      connecting: "connecting…",
      error: "error",
      dead: "disconnected",
    };
    UI.setConn(status, labels[status] || status);

    if (status === "live" && state.autoTab) {
      var tab = state.autoTab;
      state.autoTab = "";
      selectModule(tab);
    }

    if (status === "live") {
      // Socket layer already resends subscribe for _wanted; refresh badges
      Object.keys(state.subscribed).forEach(function (k) {
        UI.setSubState(k, "subscribed", true);
      });
    }
    refreshConnStatus(status);
  }

  function onSocketMessage(moduleKey, data) {
    deliverData(moduleKey, data);
  }

  function deliverData(moduleKey, data) {
    var methods = state.byKey[moduleKey];
    if (!methods) {
      return;
    }

    // Drop late packets after unsubscribe (robot may still flush a frame or two)
    if (!state.subscribed[moduleKey]) {
      return;
    }

    state.msgCount[moduleKey] = (state.msgCount[moduleKey] || 0) + 1;
    // Tooltip only — badge stays "on", not 2 / 4 / 8…
    UI.markNavLive(moduleKey, true, state.msgCount[moduleKey]);

    // Host element: prefer #tab-{key} (stock id)
    var elem = document.getElementById("tab-" + moduleKey);
    if (!elem) {
      return;
    }

    try {
      methods.onData(data, elem);
    } catch (err) {
      reportModuleError(moduleKey, "onData", err);
    }

    if (methods.devShouldDumpData) {
      dumpDevData(moduleKey, data);
    }
  }

  function reportModuleError(moduleKey, phase, err) {
    var msg = err && err.stack ? err.stack : String(err && err.message ? err.message : err);
    console.error("[WebViz]", moduleKey, phase, err);
    state.moduleErrors[moduleKey] = msg;
    UI.markNavError(moduleKey);

    // Throttle toasts per module
    var now = Date.now();
    var last = reportModuleError._last || (reportModuleError._last = Object.create(null));
    if (last[moduleKey] && now - last[moduleKey] < 4000) {
      return;
    }
    last[moduleKey] = now;
    UI.toast(
      "Module error · " + (state.displayNames[moduleKey] || moduleKey),
      phase + ": " + (err && err.message ? err.message : String(err)),
      "error"
    );
  }

  function dumpDevData(moduleKey, data) {
    var dump = document.getElementById("devDataDump");
    if (!dump) {
      return;
    }
    dump.style.display = "block";
    var moduleData = dump.querySelector('div[data-tab="' + moduleKey + '"]');
    var container;
    if (!moduleData) {
      container = document.createElement("div");
      container.setAttribute("data-tab", moduleKey);
      container.textContent = '"' + moduleKey + '": [';
      var last = dump.lastElementChild;
      dump.insertBefore(container, last);
    } else {
      container = moduleData;
      container.textContent = container.textContent.slice(0, -1) + ", ";
    }
    container.textContent = container.textContent + JSON.stringify(data) + "]";
  }

  function startUpdateLoop() {
    var dt = Cfg.UPDATE_PERIOD_MS || 200;
    function tick() {
      var seconds = dt / 1000.0;
      // Only tick modules that are currently subscribed (saves work when unsubbed)
      Object.keys(state.subscribed).forEach(function (key) {
        var methods = state.byKey[key];
        if (!methods || typeof methods.update !== "function") {
          return;
        }
        var elem = document.getElementById("tab-" + key);
        try {
          // Stock signature: update(dt, elem) — some modules ignore elem
          methods.update(seconds, elem);
        } catch (err) {
          reportModuleError(key, "update", err);
        }
      });
      state.updateTimer = setTimeout(tick, dt);
    }
    tick();
  }

  function tryLoadFakeData() {
    // Same as stock: optional resources/webserver/devData.json
    if (typeof window.jQuery === "undefined") {
      return;
    }
    window.jQuery.getJSON("devData.json").done(function (data) {
      state.fakeData = data;
      UI.toast("Dev data", "USING FAKE DATA from devData.json", "warn");
      var overview = document.querySelector("#surface-overview .overview");
      if (overview) {
        var call = document.createElement("div");
        call.className = "callout warn";
        call.innerHTML =
          "<b>USING FAKE DATA!</b> Remove <code>devData.json</code> when done.";
        overview.insertBefore(call, overview.firstChild.nextSibling);
      }
    });
  }

  // Boot when DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
