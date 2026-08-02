/**
 * FreePlay WebViz module — live freeplay stack, transition log, activation gates.
 *
 * Multi-subscribes existing wire channels (no C++ freeplay producer):
 *   behaviors, behaviorconds
 *
 * Stock Behaviors / BehaviorConds tabs stay untouched as power tools.
 * Styles: content tokens only (--wv-content-*) on light .module-host.
 *
 * Manual verify (S1–S9): plan Phase 6. No automated harness in this tree.
 */
(function (myMethods, sendData) {
  "use strict";

  var MAX_LOG = 200;
  var STALE_MS = 5000;
  var MAX_CONDS_PER_OWNER = 50;
  var MAX_OWNERS = 100;
  var MAX_GATES_DISPLAY = 50;

  var liveStack = [];
  var bsTime = null;
  var activeFeature = "";
  var debugState = "";
  var transitionLog = []; // newest first: { t, stack, leaf, id }
  var lastStackKey = null;
  var factorsByOwner = Object.create(null); // owner → { label → factorsObj }
  var inactiveByOwner = Object.create(null); // owner → { label → true }
  var ownerOrder = []; // insertion/LRU order for owner map cap
  var selectedOwner = null;
  var ownerPinned = false; // true when user picked a non-default stack frame while live
  var viewStack = null; // when scrubbing: stack from log row; null = use live
  var selectedLogId = null; // scrub highlight by entry id (not stack key)
  var liveMode = true;
  var lastMsgAt = { behaviors: 0, behaviorconds: 0 };
  var lastRaw = { behaviors: null, behaviorconds: null };
  var hostElem = null;
  var logSeq = 0;
  var els = null;
  var lastRenderedLogHeadId = null;
  var lastRenderedStackKey = null;
  var lastRenderedOwner = null;
  var lastRenderedSelectedLogId = null;

  // Multi-channel shell contract (app.js wireRetain / onChannelData)
  myMethods.channels = ["behaviors", "behaviorconds"];

  function stackKeyOf(stack) {
    return stack.join("\0");
  }

  function leafOf(stack) {
    if (!stack || !stack.length) {
      return "";
    }
    return String(stack[stack.length - 1] || "");
  }

  function normalizeStack(raw) {
    if (!Array.isArray(raw)) {
      return [];
    }
    var out = [];
    var i;
    for (i = 0; i < raw.length; i++) {
      if (raw[i] == null) {
        continue;
      }
      out.push(String(raw[i]));
    }
    return out;
  }

  function pushTransition(t, stack) {
    var entry = {
      id: ++logSeq,
      t: t,
      stack: stack.slice(),
      leaf: leafOf(stack),
    };
    transitionLog.unshift(entry);
    if (transitionLog.length > MAX_LOG) {
      transitionLog.length = MAX_LOG;
    }
    return entry;
  }

  function trimOwnerMap(ownerMap) {
    var labels = Object.keys(ownerMap);
    if (labels.length <= MAX_CONDS_PER_OWNER) {
      return;
    }
    var drop = labels.length - MAX_CONDS_PER_OWNER;
    var i;
    for (i = 0; i < drop; i++) {
      delete ownerMap[labels[i]];
    }
  }

  function touchOwner(owner) {
    var idx = ownerOrder.indexOf(owner);
    if (idx >= 0) {
      ownerOrder.splice(idx, 1);
    }
    ownerOrder.push(owner);
    pruneOwners();
  }

  function pruneOwners() {
    if (ownerOrder.length <= MAX_OWNERS) {
      return;
    }
    var keep = Object.create(null);
    var i;
    for (i = 0; i < liveStack.length; i++) {
      keep[liveStack[i]] = true;
    }
    if (selectedOwner) {
      keep[selectedOwner] = true;
    }
    while (ownerOrder.length > MAX_OWNERS) {
      var dropIdx = -1;
      for (i = 0; i < ownerOrder.length; i++) {
        if (!keep[ownerOrder[i]]) {
          dropIdx = i;
          break;
        }
      }
      if (dropIdx < 0) {
        // All remaining are on stack / selected — drop oldest
        dropIdx = 0;
      }
      var drop = ownerOrder[dropIdx];
      ownerOrder.splice(dropIdx, 1);
      delete factorsByOwner[drop];
      delete inactiveByOwner[drop];
    }
  }

  function emptyDirty() {
    return { header: false, stack: false, log: false, gates: false, raw: false };
  }

  function dirtyAny(d) {
    return !!(d && (d.header || d.stack || d.log || d.gates || d.raw));
  }

  /**
   * @returns {Object} dirty flags { header, stack, log, gates, raw }
   */
  function handleBehaviors(data) {
    var dirty = emptyDirty();
    if (!data || typeof data !== "object") {
      return dirty;
    }
    // Stock force-run behavior id list — ignore
    if (Array.isArray(data)) {
      return dirty;
    }

    if (data.activeFeature != null) {
      var af = String(data.activeFeature);
      if (af !== activeFeature) {
        activeFeature = af;
        dirty.header = true;
      }
    }
    if (data.debugState != null) {
      var ds = String(data.debugState);
      if (ds !== debugState) {
        debugState = ds;
        dirty.header = true;
      }
    }
    if (typeof data.time === "number" && isFinite(data.time)) {
      if (bsTime !== data.time) {
        bsTime = data.time;
        dirty.header = true; // time-only: header, not full gates rebuild
      }
    }

    if (!("stack" in data)) {
      return dirty;
    }

    var stack = normalizeStack(data.stack);
    var key = stackKeyOf(stack);
    var stackChanged = key !== lastStackKey;
    if (stackChanged) {
      pushTransition(
        typeof data.time === "number" && isFinite(data.time) ? data.time : null,
        stack
      );
      lastStackKey = key;
      dirty.stack = true;
      dirty.log = true;
      dirty.header = true;
    }
    liveStack = stack;

    if (liveMode) {
      viewStack = null;
      selectedLogId = null;
      // Only reset gates target to leaf when stack identity changes, or user
      // has not pinned a frame via stack click.
      if (stackChanged || !ownerPinned) {
        var leaf = stack.length ? leafOf(stack) : null;
        if (selectedOwner !== leaf) {
          selectedOwner = leaf;
          dirty.gates = true;
          dirty.stack = true;
          dirty.header = true;
        }
        if (stackChanged) {
          ownerPinned = false;
          dirty.gates = true;
        }
      } else if (selectedOwner && stack.indexOf(selectedOwner) < 0) {
        selectedOwner = stack.length ? leafOf(stack) : null;
        ownerPinned = false;
        dirty.gates = true;
        dirty.stack = true;
        dirty.header = true;
      }
    }

    return dirty;
  }

  /**
   * @returns {Object} dirty flags; empty if stack blob ignored
   */
  function handleBehaviorConds(data) {
    var dirty = emptyDirty();
    if (!data || typeof data !== "object") {
      return dirty;
    }

    // Prefer stack only on behaviors channel — ignore stack blobs here (avoid double log)
    if (data.factors && typeof data.factors === "object" && !Array.isArray(data.factors)) {
      var factors = data.factors;
      var owner = factors.ownerDebugLabel;
      var label = factors.conditionLabel;
      if (owner == null || label == null) {
        return dirty;
      }
      owner = String(owner);
      label = String(label);
      if (!factorsByOwner[owner]) {
        factorsByOwner[owner] = Object.create(null);
      }
      factorsByOwner[owner][label] = factors;
      if (inactiveByOwner[owner]) {
        delete inactiveByOwner[owner][label];
      }
      trimOwnerMap(factorsByOwner[owner]);
      touchOwner(owner);
      dirty.gates = true;
      dirty.raw = true;
      return dirty;
    }

    if (typeof data.inactive !== "undefined" && typeof data.owner !== "undefined") {
      var iname = String(data.inactive);
      var iowner = String(data.owner);
      if (!inactiveByOwner[iowner]) {
        inactiveByOwner[iowner] = Object.create(null);
      }
      inactiveByOwner[iowner][iname] = true;
      trimOwnerMap(inactiveByOwner[iowner]);
      touchOwner(iowner);
      dirty.gates = true;
      dirty.raw = true;
      return dirty;
    }

    // stack/tree on this channel: ignore (behaviors handles) — no render
    return dirty;
  }

  function displayStack() {
    if (!liveMode && viewStack) {
      return viewStack;
    }
    return liveStack;
  }

  function isStale(ch) {
    var t = lastMsgAt[ch] || 0;
    if (!t) {
      return true;
    }
    return Date.now() - t >= STALE_MS;
  }

  function formatTime(t) {
    if (t == null || typeof t !== "number" || !isFinite(t)) {
      return "—";
    }
    return t.toFixed(3) + " s";
  }

  function factorSkipKey(k) {
    return (
      k === "areConditionsMet" ||
      k === "conditionLabel" ||
      k === "ownerDebugLabel"
    );
  }

  function formatFactorVal(v) {
    if (v == null) {
      return "null";
    }
    if (typeof v === "object") {
      try {
        return JSON.stringify(v);
      } catch (e) {
        return String(v);
      }
    }
    return String(v);
  }

  function openStockTab(name) {
    if (window.WebViz && typeof window.WebViz.subscribe === "function") {
      window.WebViz.subscribe(name);
    }
  }

  function buildDom(elem) {
    elem.innerHTML = "";
    var root = document.createElement("div");
    root.className = "fp-root";
    // Ops layout: header + workspace (stack|log top, gates bottom) + collapsible dev
    root.innerHTML =
      '<header class="fp-header">' +
      '  <div class="fp-header-row">' +
      '    <span class="fp-label">ActiveFeature</span>' +
      '    <span class="fp-value" data-fp="activeFeature">—</span>' +
      '    <span class="fp-sep">·</span>' +
      '    <span class="fp-label">Leaf</span>' +
      '    <span class="fp-value fp-leaf" data-fp="leaf">—</span>' +
      '    <span class="fp-sep">·</span>' +
      '    <span class="fp-label">BS time</span>' +
      '    <span class="fp-value fp-mono" data-fp="bsTime">—</span>' +
      "  </div>" +
      '  <div class="fp-header-row fp-pills-row">' +
      '    <span class="fp-pill" data-fp="pill-behaviors" title="behaviors channel">behaviors</span>' +
      '    <span class="fp-pill" data-fp="pill-behaviorconds" title="behaviorconds channel">conds</span>' +
      '    <button type="button" class="fp-live-btn" data-fp="liveBtn" title="Return to live stack">Live</button>' +
      '    <span class="fp-mode" data-fp="mode">live</span>' +
      "  </div>" +
      '  <div class="fp-debug-line" data-fp="debugState"></div>' +
      "</header>" +
      '<div class="fp-workspace">' +
      '  <div class="fp-ops-top">' +
      '    <section class="fp-panel fp-stack" aria-label="Live stack">' +
      '      <div class="fp-panel-title">Stack</div>' +
      '      <div class="fp-panel-body">' +
      '        <ol class="fp-stack-list" data-fp="stackList"></ol>' +
      '        <div class="fp-empty" data-fp="stackEmpty">No running behavior</div>' +
      "      </div>" +
      "    </section>" +
      '    <section class="fp-panel fp-log" aria-label="Transition log">' +
      '      <div class="fp-panel-title">Transition log <span class="fp-meta">(newest first, max ' +
      MAX_LOG +
      ")</span></div>" +
      '      <div class="fp-panel-body">' +
      '        <div class="fp-log-list" data-fp="logList"></div>' +
      "      </div>" +
      "    </section>" +
      "  </div>" +
      '  <section class="fp-panel fp-gates" aria-label="Activation gates">' +
      '    <div class="fp-panel-title">Gates <span class="fp-meta" data-fp="gatesOwner"></span></div>' +
      '    <div class="fp-panel-body">' +
      '      <div class="fp-gates-list" data-fp="gatesList"></div>' +
      '      <div class="fp-empty" data-fp="gatesEmpty">No condition factors for this behavior yet</div>' +
      "    </div>" +
      "  </section>" +
      "</div>" +
      '<details class="fp-dev" data-fp="devDetails">' +
      "  <summary>Dev tools</summary>" +
      '  <p class="fp-dev-hint">Force-run / inject: use stock tabs (FreePlay is read-only).</p>' +
      '  <div class="fp-dev-links">' +
      '    <button type="button" class="fp-dev-link" data-fp="openBehaviors">Open Behaviors</button>' +
      '    <button type="button" class="fp-dev-link" data-fp="openConds">Open BehaviorConds</button>' +
      "  </div>" +
      '  <div class="fp-raw-wrap"><div class="fp-raw-label">Last behaviors</div><pre class="fp-raw" data-fp="rawBehaviors">—</pre></div>' +
      '  <div class="fp-raw-wrap"><div class="fp-raw-label">Last behaviorconds</div><pre class="fp-raw" data-fp="rawConds">—</pre></div>' +
      "</details>";

    elem.appendChild(root);

    els = {
      root: root,
      activeFeature: root.querySelector('[data-fp="activeFeature"]'),
      leaf: root.querySelector('[data-fp="leaf"]'),
      bsTime: root.querySelector('[data-fp="bsTime"]'),
      pillBehaviors: root.querySelector('[data-fp="pill-behaviors"]'),
      pillConds: root.querySelector('[data-fp="pill-behaviorconds"]'),
      liveBtn: root.querySelector('[data-fp="liveBtn"]'),
      mode: root.querySelector('[data-fp="mode"]'),
      debugState: root.querySelector('[data-fp="debugState"]'),
      stackList: root.querySelector('[data-fp="stackList"]'),
      stackEmpty: root.querySelector('[data-fp="stackEmpty"]'),
      logList: root.querySelector('[data-fp="logList"]'),
      gatesOwner: root.querySelector('[data-fp="gatesOwner"]'),
      gatesList: root.querySelector('[data-fp="gatesList"]'),
      gatesEmpty: root.querySelector('[data-fp="gatesEmpty"]'),
      rawBehaviors: root.querySelector('[data-fp="rawBehaviors"]'),
      rawConds: root.querySelector('[data-fp="rawConds"]'),
      devDetails: root.querySelector('[data-fp="devDetails"]'),
      openBehaviors: root.querySelector('[data-fp="openBehaviors"]'),
      openConds: root.querySelector('[data-fp="openConds"]'),
    };

    els.liveBtn.addEventListener("click", function () {
      liveMode = true;
      viewStack = null;
      selectedLogId = null;
      ownerPinned = false;
      selectedOwner = liveStack.length ? leafOf(liveStack) : null;
      render(true);
    });

    els.openBehaviors.addEventListener("click", function () {
      openStockTab("behaviors");
    });
    els.openConds.addEventListener("click", function () {
      openStockTab("behaviorconds");
    });

    // Refresh raw JSON when user expands Dev tools
    els.devDetails.addEventListener("toggle", function () {
      if (els.devDetails.open) {
        renderRaw(true);
      }
    });
  }

  function renderHeader() {
    if (!els) {
      return;
    }
    var stack = displayStack();
    els.activeFeature.textContent = activeFeature || "—";
    els.leaf.textContent = leafOf(stack) || "—";
    els.bsTime.textContent = formatTime(bsTime);
    els.mode.textContent = liveMode ? "live" : "scrub";
    els.mode.className = "fp-mode" + (liveMode ? " fp-mode-live" : " fp-mode-scrub");
    els.liveBtn.className =
      "fp-live-btn" + (liveMode ? " fp-live-btn-on" : "");
    els.debugState.textContent = debugState
      ? "debugState: " + debugState
      : "";

    els.pillBehaviors.className =
      "fp-pill" + (isStale("behaviors") ? " fp-pill-stale" : " fp-pill-fresh");
    els.pillConds.className =
      "fp-pill" +
      (isStale("behaviorconds") ? " fp-pill-stale" : " fp-pill-fresh");
  }

  function renderStack() {
    if (!els) {
      return;
    }
    var stack = displayStack();
    var sk = stackKeyOf(stack);
    // Skip rebuild if stack identity + selection unchanged
    if (
      sk === lastRenderedStackKey &&
      selectedOwner === lastRenderedOwner &&
      els.stackList.childNodes.length === stack.length &&
      stack.length > 0
    ) {
      return;
    }
    lastRenderedStackKey = sk;
    lastRenderedOwner = selectedOwner;

    els.stackList.innerHTML = "";
    if (!stack.length) {
      els.stackEmpty.style.display = "block";
      els.stackList.style.display = "none";
      return;
    }
    els.stackEmpty.style.display = "none";
    els.stackList.style.display = "block";

    var i;
    for (i = 0; i < stack.length; i++) {
      var name = stack[i];
      var li = document.createElement("li");
      li.className = "fp-stack-li";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "fp-stack-item";
      if (i === stack.length - 1) {
        btn.className += " fp-stack-leaf";
      }
      if (selectedOwner && name === selectedOwner) {
        btn.className += " fp-stack-selected";
      }
      btn.setAttribute("data-owner", name);
      btn.textContent = name;
      if (i === stack.length - 1) {
        var mark = document.createElement("span");
        mark.className = "fp-leaf-mark";
        mark.textContent = " ◀";
        btn.appendChild(mark);
      }
      btn.addEventListener(
        "click",
        (function (owner) {
          return function () {
            selectedOwner = owner;
            // Stay live; pin so subsequent stack ticks do not wipe gates target
            if (liveMode) {
              ownerPinned = true;
            }
            render(true);
          };
        })(name)
      );
      li.appendChild(btn);
      els.stackList.appendChild(li);
    }
  }

  function logRowSelected(entry) {
    return !liveMode && selectedLogId != null && entry && entry.id === selectedLogId;
  }

  function renderLog() {
    if (!els) {
      return;
    }
    var headId = transitionLog.length ? transitionLog[0].id : null;
    if (
      headId === lastRenderedLogHeadId &&
      lastRenderedSelectedLogId === selectedLogId &&
      els.logList.childNodes.length === transitionLog.length &&
      transitionLog.length > 0
    ) {
      return;
    }
    // Selection-only change: update classes without full rebuild
    if (
      headId === lastRenderedLogHeadId &&
      els.logList.childNodes.length === transitionLog.length &&
      transitionLog.length > 0
    ) {
      var rows = els.logList.querySelectorAll(".fp-log-row");
      var ri;
      for (ri = 0; ri < rows.length && ri < transitionLog.length; ri++) {
        rows[ri].className =
          "fp-log-row" + (logRowSelected(transitionLog[ri]) ? " fp-log-selected" : "");
      }
      lastRenderedSelectedLogId = selectedLogId;
      return;
    }
    lastRenderedLogHeadId = headId;
    lastRenderedSelectedLogId = selectedLogId;

    els.logList.innerHTML = "";
    if (!transitionLog.length) {
      var empty = document.createElement("div");
      empty.className = "fp-empty";
      empty.textContent = "No transitions yet";
      els.logList.appendChild(empty);
      return;
    }
    var i;
    for (i = 0; i < transitionLog.length; i++) {
      var e = transitionLog[i];
      var row = document.createElement("button");
      row.type = "button";
      row.className = "fp-log-row";
      if (logRowSelected(e)) {
        row.className += " fp-log-selected";
      }
      row.setAttribute("data-log-id", String(e.id));
      var leafLabel = e.leaf || "(empty)";
      var tLabel = formatTime(e.t);
      var depth = e.stack.length;
      row.innerHTML =
        '<span class="fp-log-time">' +
        tLabel +
        '</span><span class="fp-log-leaf">' +
        escapeHtml(leafLabel) +
        '</span><span class="fp-log-depth">n=' +
        depth +
        "</span>";
      row.addEventListener(
        "click",
        (function (entry) {
          return function () {
            liveMode = false;
            ownerPinned = false;
            viewStack = entry.stack.slice();
            selectedLogId = entry.id;
            selectedOwner = entry.leaf || null;
            render(true);
          };
        })(e)
      );
      els.logList.appendChild(row);
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderGates() {
    if (!els) {
      return;
    }
    var owner = selectedOwner;
    els.gatesOwner.textContent = owner
      ? "for " + owner + " (latest factors)"
      : "";
    els.gatesList.innerHTML = "";

    if (!owner) {
      els.gatesEmpty.style.display = "block";
      els.gatesEmpty.textContent = "No behavior selected";
      return;
    }

    var byLabel = factorsByOwner[owner] || Object.create(null);
    var labels = Object.keys(byLabel);
    var inactive = inactiveByOwner[owner] || Object.create(null);
    // Include inactive-only labels
    Object.keys(inactive).forEach(function (lab) {
      if (labels.indexOf(lab) < 0) {
        labels.push(lab);
      }
    });
    labels.sort();
    if (labels.length > MAX_GATES_DISPLAY) {
      labels = labels.slice(0, MAX_GATES_DISPLAY);
    }

    if (!labels.length) {
      els.gatesEmpty.style.display = "block";
      els.gatesEmpty.textContent =
        "No condition factors for this behavior yet";
      return;
    }
    els.gatesEmpty.style.display = "none";

    var i;
    for (i = 0; i < labels.length; i++) {
      var lab = labels[i];
      var fac = byLabel[lab];
      var card = document.createElement("div");
      card.className = "fp-gate";

      var met = fac && fac.areConditionsMet;
      var isInactive = !!inactive[lab];
      var statusCls = "fp-gate-unknown";
      var statusTxt = "—";
      // Prefer inactive over stale TRUE/FALSE when both exist (Issue 1)
      if (isInactive) {
        statusCls = "fp-gate-inactive";
        statusTxt = "inactive";
      } else if (fac && typeof met === "boolean") {
        statusCls = met ? "fp-met" : "fp-unmet";
        statusTxt = met ? "TRUE" : "FALSE";
      }

      var head = document.createElement("div");
      head.className = "fp-gate-head";
      head.innerHTML =
        '<span class="fp-gate-status ' +
        statusCls +
        '">' +
        statusTxt +
        '</span><span class="fp-gate-label">' +
        escapeHtml(lab) +
        "</span>";
      card.appendChild(head);

      // Still show last factor details when inactive (optional context)
      if (fac) {
        var body = document.createElement("div");
        body.className = "fp-gate-factors";
        var keys = Object.keys(fac);
        var ki;
        for (ki = 0; ki < keys.length; ki++) {
          var k = keys[ki];
          if (factorSkipKey(k)) {
            continue;
          }
          var line = document.createElement("div");
          line.className = "fp-factor-line";
          line.innerHTML =
            '<span class="fp-factor-key">' +
            escapeHtml(k) +
            '</span><span class="fp-factor-val">' +
            escapeHtml(formatFactorVal(fac[k])) +
            "</span>";
          body.appendChild(line);
        }
        if (body.childNodes.length) {
          card.appendChild(body);
        }
      }
      els.gatesList.appendChild(card);
    }
  }

  function renderRaw(force) {
    if (!els) {
      return;
    }
    // Skip JSON.stringify while Dev tools collapsed (Issue 6)
    if (!force && els.devDetails && !els.devDetails.open) {
      return;
    }
    try {
      els.rawBehaviors.textContent = lastRaw.behaviors
        ? JSON.stringify(lastRaw.behaviors, null, 2)
        : "—";
    } catch (e1) {
      els.rawBehaviors.textContent = String(lastRaw.behaviors);
    }
    try {
      els.rawConds.textContent = lastRaw.behaviorconds
        ? JSON.stringify(lastRaw.behaviorconds, null, 2)
        : "—";
    } catch (e2) {
      els.rawConds.textContent = String(lastRaw.behaviorconds);
    }
  }

  /**
   * Apply partial UI updates from dirty flags (Issue 1: time-only skips gates).
   * @param {Object} dirty
   * @param {boolean} [force]
   */
  function applyDirty(dirty, force) {
    if (!els || !hostElem) {
      return;
    }
    if (force) {
      lastRenderedLogHeadId = null;
      lastRenderedStackKey = null;
      lastRenderedSelectedLogId = null;
      renderHeader();
      renderStack();
      renderLog();
      renderGates();
      renderRaw(false);
      return;
    }
    if (!dirtyAny(dirty)) {
      return;
    }
    if (dirty.header) {
      renderHeader();
    }
    if (dirty.stack) {
      renderStack();
    }
    if (dirty.log) {
      renderLog();
    }
    if (dirty.gates) {
      renderGates();
    }
    if (dirty.raw || dirty.header || dirty.log || dirty.stack || dirty.gates) {
      // raw only when open; lastRaw always updated by caller
      renderRaw(false);
    }
  }

  /**
   * @param {boolean} [force] full rebuild of log/stack even if caches match
   */
  function render(force) {
    applyDirty(
      {
        header: true,
        stack: true,
        log: true,
        gates: true,
        raw: true,
      },
      !!force
    );
  }

  function clearSessionState() {
    liveStack = [];
    bsTime = null;
    activeFeature = "";
    debugState = "";
    transitionLog = [];
    lastStackKey = null;
    factorsByOwner = Object.create(null);
    inactiveByOwner = Object.create(null);
    ownerOrder = [];
    selectedOwner = null;
    ownerPinned = false;
    viewStack = null;
    selectedLogId = null;
    liveMode = true;
    lastMsgAt = { behaviors: 0, behaviorconds: 0 };
    lastRaw = { behaviors: null, behaviorconds: null };
    logSeq = 0;
    lastRenderedLogHeadId = null;
    lastRenderedStackKey = null;
    lastRenderedOwner = null;
    lastRenderedSelectedLogId = null;
  }

  myMethods.init = function (elem) {
    hostElem = elem;
    clearSessionState();
    buildDom(elem);
    render(true);
  };

  /**
   * Shell calls on each FreePlay subscribe (including re-subscribe) so fake dumps
   * do not pile onto previous session state.
   */
  myMethods.resetSession = function (elem) {
    if (elem) {
      hostElem = elem;
    }
    clearSessionState();
    if (els && hostElem) {
      render(true);
    }
  };

  myMethods.onChannelData = function (channel, data, elem) {
    if (elem) {
      hostElem = elem;
    }
    channel = String(channel || "").toLowerCase();
    var dirty = emptyDirty();
    if (channel === "behaviors") {
      lastMsgAt.behaviors = Date.now();
      lastRaw.behaviors = data;
      dirty = handleBehaviors(data);
      dirty.raw = true;
    } else if (channel === "behaviorconds") {
      lastMsgAt.behaviorconds = Date.now();
      lastRaw.behaviorconds = data;
      dirty = handleBehaviorConds(data);
    }
    // Partial render: time-only ticks update header, not gates (Issue 1)
    applyDirty(dirty, false);
  };

  // Required by loader. Shell prefers onChannelData for multi-channel modules.
  myMethods.onData = function (data, elem, channel) {
    if (channel) {
      myMethods.onChannelData(channel, data, elem);
      return;
    }
    // Unknown single-channel delivery — try behaviors-shaped payloads only
    if (data && typeof data === "object" && !Array.isArray(data)) {
      if (
        "stack" in data ||
        data.activeFeature != null ||
        data.debugState != null
      ) {
        myMethods.onChannelData("behaviors", data, elem);
      } else if (data.factors || typeof data.inactive !== "undefined") {
        myMethods.onChannelData("behaviorconds", data, elem);
      }
    }
  };

  myMethods.update = function (dt, elem) {
    if (!els) {
      return;
    }
    // Refresh stream pill stale state
    els.pillBehaviors.className =
      "fp-pill" + (isStale("behaviors") ? " fp-pill-stale" : " fp-pill-fresh");
    els.pillConds.className =
      "fp-pill" +
      (isStale("behaviorconds") ? " fp-pill-stale" : " fp-pill-fresh");
  };

  myMethods.getStyles = function () {
    // Content-host tokens only. No hex. No --wv-text/--wv-bg for body.
    // P1 Ops layout: fill .module-host height; scroll only in .fp-panel-body.
    return (
      ".fp-root {" +
      "  font-family: var(--wv-sans);" +
      "  font-size: 13px;" +
      "  line-height: 1.45;" +
      "  color: var(--wv-content-text);" +
      "  box-sizing: border-box;" +
      "  height: 100%;" +
      "  min-height: 0;" +
      "  display: flex;" +
      "  flex-direction: column;" +
      "  overflow: hidden;" +
      "  gap: var(--wv-space-2);" +
      "}" +
      ".fp-header {" +
      "  flex-shrink: 0;" +
      "  padding: var(--wv-space-2) var(--wv-space-3);" +
      "  border: 1px solid var(--wv-content-line);" +
      "  border-radius: var(--wv-radius);" +
      "  background: var(--wv-content-bg);" +
      "  box-shadow: var(--wv-shadow-sm);" +
      "}" +
      ".fp-header-row {" +
      "  display: flex;" +
      "  flex-wrap: wrap;" +
      "  align-items: center;" +
      "  gap: var(--wv-space-2);" +
      "}" +
      ".fp-header-row + .fp-header-row { margin-top: var(--wv-space-2); }" +
      ".fp-label {" +
      "  color: var(--wv-content-text);" +
      "  opacity: 0.55;" +
      "  font-size: 11px;" +
      "  text-transform: uppercase;" +
      "  letter-spacing: 0.04em;" +
      "}" +
      ".fp-value { font-weight: 600; }" +
      ".fp-leaf { color: var(--wv-accent); }" +
      ".fp-mono { font-family: var(--wv-mono); font-weight: 500; }" +
      ".fp-sep { opacity: 0.35; }" +
      ".fp-pill {" +
      "  display: inline-block;" +
      "  padding: 2px 8px;" +
      "  border-radius: var(--wv-radius-pill);" +
      "  border: 1px solid var(--wv-content-line);" +
      "  font-size: 11px;" +
      "  font-family: var(--wv-mono);" +
      "  opacity: 0.55;" +
      "}" +
      ".fp-pill-fresh {" +
      "  opacity: 1;" +
      "  border-color: var(--wv-good);" +
      "  color: var(--wv-good);" +
      "}" +
      ".fp-pill-stale { opacity: 0.45; }" +
      ".fp-live-btn {" +
      "  font: inherit;" +
      "  font-size: 11px;" +
      "  font-weight: 600;" +
      "  padding: 2px 10px;" +
      "  border-radius: var(--wv-radius-pill);" +
      "  border: 1px solid var(--wv-content-line);" +
      "  background: var(--wv-content-bg);" +
      "  color: var(--wv-content-text);" +
      "  cursor: pointer;" +
      "}" +
      ".fp-live-btn-on {" +
      "  border-color: var(--wv-accent);" +
      "  background: var(--wv-accent-dim);" +
      "  color: var(--wv-accent);" +
      "}" +
      ".fp-live-btn:focus {" +
      "  outline: 2px solid var(--wv-accent);" +
      "  outline-offset: 1px;" +
      "}" +
      ".fp-mode { font-size: 11px; opacity: 0.55; font-family: var(--wv-mono); }" +
      ".fp-mode-scrub { opacity: 1; color: var(--wv-warn); }" +
      ".fp-debug-line {" +
      "  margin-top: var(--wv-space-1);" +
      "  font-family: var(--wv-mono);" +
      "  font-size: 11px;" +
      "  opacity: 0.55;" +
      "  white-space: pre-wrap;" +
      "  word-break: break-all;" +
      "}" +
      /* Ops workspace: ~45% top (stack|log) / ~55% gates; internal scroll only */
      ".fp-workspace {" +
      "  flex: 1 1 auto;" +
      "  min-height: 0;" +
      "  min-width: 0;" +
      "  display: grid;" +
      "  grid-template-rows: minmax(0, 0.9fr) minmax(0, 1.1fr);" +
      "  gap: var(--wv-space-2);" +
      "  overflow: hidden;" +
      "}" +
      ".fp-ops-top {" +
      "  min-height: 0;" +
      "  min-width: 0;" +
      "  display: grid;" +
      "  grid-template-columns: minmax(160px, 220px) minmax(0, 1fr);" +
      "  gap: var(--wv-space-2);" +
      "  overflow: hidden;" +
      "}" +
      ".fp-panel {" +
      "  border: 1px solid var(--wv-content-line);" +
      "  border-radius: var(--wv-radius);" +
      "  background: var(--wv-content-bg);" +
      "  box-shadow: var(--wv-shadow-sm);" +
      "  display: flex;" +
      "  flex-direction: column;" +
      "  min-height: 0;" +
      "  min-width: 0;" +
      "  overflow: hidden;" +
      "}" +
      ".fp-panel-title {" +
      "  flex-shrink: 0;" +
      "  font-weight: 600;" +
      "  font-size: 11px;" +
      "  text-transform: uppercase;" +
      "  letter-spacing: 0.04em;" +
      "  padding: var(--wv-space-1) var(--wv-space-2);" +
      "  border-bottom: 1px solid var(--wv-content-line);" +
      "}" +
      ".fp-meta { font-weight: 400; opacity: 0.55; text-transform: none; letter-spacing: 0; }" +
      ".fp-panel-body {" +
      "  flex: 1 1 auto;" +
      "  min-height: 0;" +
      "  overflow: auto;" +
      "  overscroll-behavior: contain;" +
      "  padding: var(--wv-space-1) var(--wv-space-2);" +
      "}" +
      ".fp-stack-list {" +
      "  list-style: none;" +
      "  margin: 0;" +
      "  padding: 0;" +
      "}" +
      ".fp-stack-li { margin: 0; padding: 0; }" +
      ".fp-stack-item {" +
      "  display: block;" +
      "  width: 100%;" +
      "  text-align: left;" +
      "  box-sizing: border-box;" +
      "  font: inherit;" +
      "  font-family: var(--wv-mono);" +
      "  font-size: 12px;" +
      "  padding: var(--wv-space-1) var(--wv-space-2);" +
      "  border-radius: var(--wv-radius-sm);" +
      "  cursor: pointer;" +
      "  border: 1px solid transparent;" +
      "  background: transparent;" +
      "  color: var(--wv-content-text);" +
      "}" +
      ".fp-stack-item:hover { background: var(--wv-accent-dim); }" +
      ".fp-stack-item:focus { outline: 2px solid var(--wv-accent); outline-offset: 1px; }" +
      ".fp-stack-leaf { color: var(--wv-accent); font-weight: 600; }" +
      ".fp-stack-selected {" +
      "  background: var(--wv-accent-dim);" +
      "  border-color: var(--wv-content-line);" +
      "}" +
      ".fp-leaf-mark { opacity: 0.7; }" +
      ".fp-empty {" +
      "  opacity: 0.55;" +
      "  font-size: 12px;" +
      "  padding: var(--wv-space-2) 0;" +
      "}" +
      ".fp-log-list {" +
      "  display: flex;" +
      "  flex-direction: column;" +
      "  gap: 2px;" +
      "}" +
      ".fp-log-row {" +
      "  display: grid;" +
      "  grid-template-columns: 72px 1fr auto;" +
      "  gap: var(--wv-space-2);" +
      "  align-items: center;" +
      "  text-align: left;" +
      "  width: 100%;" +
      "  font: inherit;" +
      "  font-family: var(--wv-mono);" +
      "  font-size: 11px;" +
      "  padding: var(--wv-space-1) var(--wv-space-2);" +
      "  border: 1px solid transparent;" +
      "  border-radius: var(--wv-radius-sm);" +
      "  background: transparent;" +
      "  color: var(--wv-content-text);" +
      "  cursor: pointer;" +
      "}" +
      ".fp-log-row:hover { background: var(--wv-accent-dim); }" +
      ".fp-log-row:focus { outline: 2px solid var(--wv-accent); outline-offset: 1px; }" +
      ".fp-log-selected {" +
      "  background: var(--wv-accent-dim);" +
      "  border-color: var(--wv-content-line);" +
      "}" +
      ".fp-log-time { opacity: 0.55; }" +
      ".fp-log-leaf { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }" +
      ".fp-log-depth { opacity: 0.45; }" +
      ".fp-gates-list {" +
      "  display: flex;" +
      "  flex-direction: column;" +
      "  gap: var(--wv-space-2);" +
      "}" +
      ".fp-gate {" +
      "  border: 1px solid var(--wv-content-line);" +
      "  border-radius: var(--wv-radius-sm);" +
      "  padding: var(--wv-space-2);" +
      "}" +
      ".fp-gate-head {" +
      "  display: flex;" +
      "  align-items: baseline;" +
      "  gap: var(--wv-space-2);" +
      "  margin-bottom: var(--wv-space-1);" +
      "}" +
      ".fp-gate-status {" +
      "  font-family: var(--wv-mono);" +
      "  font-size: 11px;" +
      "  font-weight: 700;" +
      "  min-width: 52px;" +
      "}" +
      ".fp-met { color: var(--wv-good); }" +
      ".fp-unmet { color: var(--wv-bad); }" +
      ".fp-gate-unknown, .fp-gate-inactive { opacity: 0.55; }" +
      ".fp-gate-label { font-family: var(--wv-mono); font-size: 12px; font-weight: 600; }" +
      ".fp-gate-factors { padding-left: var(--wv-space-1); }" +
      ".fp-factor-line {" +
      "  display: grid;" +
      "  grid-template-columns: minmax(80px, 140px) 1fr;" +
      "  gap: var(--wv-space-2);" +
      "  font-family: var(--wv-mono);" +
      "  font-size: 11px;" +
      "  padding: 1px 0;" +
      "}" +
      ".fp-factor-key { opacity: 0.55; overflow: hidden; text-overflow: ellipsis; }" +
      ".fp-factor-val { word-break: break-all; }" +
      /* Dev tools: collapsed = summary only; open may grow into host scroll */
      ".fp-dev {" +
      "  flex-shrink: 0;" +
      "  border: 1px solid var(--wv-content-line);" +
      "  border-radius: var(--wv-radius);" +
      "  background: var(--wv-content-bg);" +
      "  padding: var(--wv-space-2) var(--wv-space-3);" +
      "  box-shadow: var(--wv-shadow-sm);" +
      "  max-height: 40%;" +
      "  overflow: auto;" +
      "}" +
      ".fp-dev summary {" +
      "  cursor: pointer;" +
      "  font-weight: 600;" +
      "  font-size: 12px;" +
      "  text-transform: uppercase;" +
      "  letter-spacing: 0.03em;" +
      "}" +
      ".fp-dev-hint {" +
      "  margin: var(--wv-space-2) 0;" +
      "  font-size: 12px;" +
      "  opacity: 0.75;" +
      "}" +
      ".fp-dev-links {" +
      "  display: flex;" +
      "  flex-wrap: wrap;" +
      "  gap: var(--wv-space-2);" +
      "  margin-bottom: var(--wv-space-2);" +
      "}" +
      ".fp-dev-link {" +
      "  font: inherit;" +
      "  font-size: 12px;" +
      "  font-weight: 600;" +
      "  padding: var(--wv-space-1) var(--wv-space-2);" +
      "  border-radius: var(--wv-radius-sm);" +
      "  border: 1px solid var(--wv-content-line);" +
      "  background: var(--wv-content-bg);" +
      "  color: var(--wv-accent);" +
      "  cursor: pointer;" +
      "}" +
      ".fp-dev-link:hover { background: var(--wv-accent-dim); }" +
      ".fp-dev-link:focus { outline: 2px solid var(--wv-accent); outline-offset: 1px; }" +
      ".fp-raw-wrap { margin-top: var(--wv-space-2); }" +
      ".fp-raw-label {" +
      "  font-size: 11px;" +
      "  opacity: 0.55;" +
      "  margin-bottom: 2px;" +
      "}" +
      ".fp-raw {" +
      "  margin: 0;" +
      "  max-height: 160px;" +
      "  overflow: auto;" +
      "  padding: var(--wv-space-2);" +
      "  border: 1px solid var(--wv-content-line);" +
      "  border-radius: var(--wv-radius-sm);" +
      "  font-family: var(--wv-mono);" +
      "  font-size: 10px;" +
      "  white-space: pre-wrap;" +
      "  word-break: break-all;" +
      "  color: var(--wv-content-text);" +
      "  background: var(--wv-content-bg);" +
      "}" +
      /* Narrow viewports: stack ops-top vertically so panels stay usable */
      "@media (max-width: 700px) {" +
      "  .fp-ops-top {" +
      "    grid-template-columns: 1fr;" +
      "    grid-template-rows: minmax(0, 1fr) minmax(0, 1.2fr);" +
      "  }" +
      "}"
    );
  };
})(moduleMethods, moduleSendDataFunc);
