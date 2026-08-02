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
  // newest first: { id, t, stack, leaf, fromLeaf, fromDepth, toDepth, tag }
  // tag is client-derived only: { kind, label } or null — never engine [T]/[F]
  var transitionLog = [];
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
  var shouldFlashLog = false; // flash newest row once after pushTransition
  // Persist collapsible gate open state: key = owner + "\0" + label (P4)
  var openGates = Object.create(null);
  // P5 client-only filters (hide DOM rows; do not drop state)
  var logFilter = "";
  var gatesFilter = "";
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

  /**
   * Client-only transition kind from stack depth / leaf change.
   * Does not invent condition [T]/[F] — those need factor data we do not log.
   * @returns {{ kind: string, label: string }|null}
   */
  function deriveTransitionTag(fromDepth, toDepth, fromLeaf, toLeaf) {
    if (toDepth === 0) {
      return { kind: "empty", label: "clear" };
    }
    if (fromDepth === 0) {
      return { kind: "enter", label: "enter" };
    }
    if (toDepth > fromDepth) {
      return { kind: "deeper", label: "deeper" };
    }
    if (toDepth < fromDepth) {
      return { kind: "shallower", label: "shallower" };
    }
    // same depth, different leaf (or identical — key change would not call us)
    if (fromLeaf !== toLeaf) {
      return { kind: "same-depth", label: "swap" };
    }
    return null;
  }

  /**
   * Push stack-identity transition. Caller must still hold previous liveStack.
   * Cond-only messages must not call this.
   */
  function pushTransition(t, stack) {
    var fromStack = liveStack;
    var fromDepth = fromStack.length;
    var toDepth = stack.length;
    var fromLeaf = leafOf(fromStack);
    var toLeaf = leafOf(stack);
    var entry = {
      id: ++logSeq,
      t: t,
      stack: stack.slice(),
      leaf: toLeaf,
      fromLeaf: fromLeaf,
      fromDepth: fromDepth,
      toDepth: toDepth,
      tag: deriveTransitionTag(fromDepth, toDepth, fromLeaf, toLeaf),
    };
    transitionLog.unshift(entry);
    if (transitionLog.length > MAX_LOG) {
      transitionLog.length = MAX_LOG;
    }
    shouldFlashLog = true;
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

  /**
   * Gate display kind for sort + default collapse (P4).
   * inactive wins over TRUE/FALSE when both present.
   * rank: 0 FALSE, 1 unknown, 2 inactive, 3 TRUE — false-first then alpha within.
   * defaultOpen: unmet/unknown/inactive open; met closed.
   */
  function gateKind(fac, isInactive) {
    var met = fac && fac.areConditionsMet;
    if (isInactive) {
      return {
        rank: 2,
        statusCls: "fp-gate-inactive",
        statusTxt: "inactive",
        defaultOpen: true,
      };
    }
    if (fac && typeof met === "boolean") {
      if (met) {
        return {
          rank: 3,
          statusCls: "fp-met",
          statusTxt: "TRUE",
          defaultOpen: false,
        };
      }
      return {
        rank: 0,
        statusCls: "fp-unmet",
        statusTxt: "FALSE",
        defaultOpen: true,
      };
    }
    return {
      rank: 1,
      statusCls: "fp-gate-unknown",
      statusTxt: "—",
      defaultOpen: true,
    };
  }

  function openGatesKey(owner, label) {
    return String(owner) + "\0" + String(label);
  }

  function openStockTab(name) {
    if (window.WebViz && typeof window.WebViz.subscribe === "function") {
      window.WebViz.subscribe(name);
    }
  }

  /** True when active element should keep keyboard for typing (P5.1). */
  function isTypingTarget(el) {
    if (!el || !el.tagName) {
      return false;
    }
    var tag = el.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") {
      return true;
    }
    if (el.isContentEditable) {
      return true;
    }
    return false;
  }

  /** Return to live stack/view (Live button, L, Escape when scrubbing). */
  function goLive() {
    liveMode = true;
    viewStack = null;
    selectedLogId = null;
    ownerPinned = false;
    selectedOwner = liveStack.length ? leafOf(liveStack) : null;
    render(true);
  }

  /** Scrub to a transitionLog entry by index (newest-first list). */
  function selectLogByIndex(idx) {
    if (!transitionLog.length) {
      return;
    }
    if (idx < 0) {
      idx = 0;
    }
    if (idx >= transitionLog.length) {
      idx = transitionLog.length - 1;
    }
    var entry = transitionLog[idx];
    liveMode = false;
    ownerPinned = false;
    viewStack = entry.stack.slice();
    selectedLogId = entry.id;
    selectedOwner = entry.leaf || null;
    render(true);
    scrollLogSelectionIntoView();
  }

  /**
   * Move scrub selection in log. delta +1 = older (down/j), -1 = newer (up/k).
   * From live with no selection, either direction selects first visible row.
   * Skips rows hidden by log filter (state still held; selection id intact).
   */
  function moveLogSelection(delta) {
    if (!transitionLog.length) {
      return;
    }
    var q = (logFilter || "").toLowerCase().trim();
    var idx = -1;
    var i;
    if (selectedLogId != null && !liveMode) {
      for (i = 0; i < transitionLog.length; i++) {
        if (transitionLog[i].id === selectedLogId) {
          idx = i;
          break;
        }
      }
    }
    if (idx < 0 || liveMode) {
      // Enter scrub: first matching from newest
      for (i = 0; i < transitionLog.length; i++) {
        if (logEntryMatches(transitionLog[i], q)) {
          selectLogByIndex(i);
          return;
        }
      }
      return;
    }
    var next = idx + delta;
    while (next >= 0 && next < transitionLog.length) {
      if (logEntryMatches(transitionLog[next], q)) {
        selectLogByIndex(next);
        return;
      }
      next += delta;
    }
    // No further match in that direction — keep current selection
  }

  function scrollLogSelectionIntoView() {
    if (!els || !els.logList || selectedLogId == null) {
      return;
    }
    var row = els.logList.querySelector(
      '[data-log-id="' + String(selectedLogId) + '"]'
    );
    if (row && typeof row.scrollIntoView === "function") {
      try {
        row.scrollIntoView({ block: "nearest" });
      } catch (e) {
        row.scrollIntoView(false);
      }
    }
  }

  function logEntryMatches(e, q) {
    if (!q) {
      return true;
    }
    var parts = [e.leaf || "", e.fromLeaf || ""];
    var i;
    for (i = 0; i < parts.length; i++) {
      if (String(parts[i]).toLowerCase().indexOf(q) >= 0) {
        return true;
      }
    }
    return false;
  }

  /** Hide non-matching log rows; does not drop transitionLog state. */
  function applyLogFilter() {
    if (!els || !els.logList) {
      return;
    }
    var q = (logFilter || "").toLowerCase().trim();
    var rows = els.logList.querySelectorAll(".fp-log-row");
    var i;
    for (i = 0; i < rows.length; i++) {
      var e = transitionLog[i];
      var match = e ? logEntryMatches(e, q) : true;
      rows[i].style.display = match ? "" : "none";
    }
  }

  /** Hide non-matching gate cards by condition label; state retained. */
  function applyGatesFilter() {
    if (!els || !els.gatesList) {
      return;
    }
    var q = (gatesFilter || "").toLowerCase().trim();
    var cards = els.gatesList.querySelectorAll(".fp-gate");
    var i;
    for (i = 0; i < cards.length; i++) {
      var lab = cards[i].getAttribute("data-gate-label") || "";
      var match = !q || lab.toLowerCase().indexOf(q) >= 0;
      cards[i].style.display = match ? "" : "none";
    }
  }

  /** Clear client transition log only (not wire / not engine). */
  function clearTransitionLog() {
    transitionLog = [];
    lastRenderedLogHeadId = null;
    lastRenderedSelectedLogId = null;
    shouldFlashLog = false;
    // Scrub target may be gone — return to live
    if (!liveMode) {
      liveMode = true;
      viewStack = null;
      selectedLogId = null;
      ownerPinned = false;
      selectedOwner = liveStack.length ? leafOf(liveStack) : null;
    } else {
      selectedLogId = null;
    }
    render(true);
  }

  /** Dev tools: copy transitionLog JSON (silent fail → console). */
  function copyLogJson() {
    var payload;
    try {
      payload = JSON.stringify(transitionLog, null, 2);
    } catch (e) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[freeplay] copy log stringify failed", e);
      }
      return;
    }
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      navigator.clipboard.writeText(payload).catch(function (err) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[freeplay] clipboard write failed", err);
        }
      });
      return;
    }
    try {
      var ta = document.createElement("textarea");
      ta.value = payload;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    } catch (e2) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[freeplay] clipboard fallback failed", e2);
      }
    }
  }

  function updateSilenceBanner() {
    if (!els || !els.silenceBanner) {
      return;
    }
    var bothSilent = isStale("behaviors") && isStale("behaviorconds");
    if (bothSilent) {
      els.silenceBanner.hidden = false;
      els.silenceBanner.removeAttribute("hidden");
    } else {
      els.silenceBanner.hidden = true;
      els.silenceBanner.setAttribute("hidden", "");
    }
  }

  /**
   * P5.1 keyboard on .fp-root when focus is within root.
   * Bound on root only (not window) so re-init via buildDom cannot double-bind.
   */
  function onRootKeydown(ev) {
    if (!els || !els.root) {
      return;
    }
    var ae = document.activeElement;
    if (ae !== els.root && !els.root.contains(ae)) {
      return;
    }
    if (isTypingTarget(ae)) {
      // Do not steal keys from filter/inputs (Escape blurs filter → root)
      if (
        ev.key === "Escape" &&
        ae &&
        ae.getAttribute &&
        (ae.getAttribute("data-fp") === "logFilter" ||
          ae.getAttribute("data-fp") === "gatesFilter")
      ) {
        ae.blur();
        if (els.root.focus) {
          els.root.focus();
        }
        ev.preventDefault();
      }
      return;
    }

    var key = ev.key;
    if (key === "/" ) {
      if (els.logFilter) {
        ev.preventDefault();
        els.logFilter.focus();
        if (typeof els.logFilter.select === "function") {
          els.logFilter.select();
        }
      }
      return;
    }
    if ((key === "l" || key === "L" || key === "Escape") && !liveMode) {
      ev.preventDefault();
      goLive();
      return;
    }
    if (key === "j" || key === "ArrowDown") {
      ev.preventDefault();
      moveLogSelection(1);
      return;
    }
    if (key === "k" || key === "ArrowUp") {
      ev.preventDefault();
      moveLogSelection(-1);
      return;
    }
  }

  function buildDom(elem) {
    // Clears prior root + listeners (re-init safe; no window-level binds)
    elem.innerHTML = "";
    var root = document.createElement("div");
    root.className = "fp-root";
    root.tabIndex = 0;
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", "FreePlay console");
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
      '    <button type="button" class="fp-live-btn" data-fp="liveBtn" title="Return to live stack" aria-pressed="true">Live</button>' +
      '    <span class="fp-mode" data-fp="mode">live</span>' +
      "  </div>" +
      '  <div class="fp-debug-line" data-fp="debugState"></div>' +
      "</header>" +
      '<div class="fp-silence-banner" data-fp="silenceBanner" hidden role="status">' +
      "No freeplay stream (both channels silent)" +
      "</div>" +
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
      '      <div class="fp-panel-head">' +
      '        <div class="fp-panel-title fp-panel-title-inline">Transition log <span class="fp-meta" data-fp="logMeta">0/' +
      MAX_LOG +
      "</span></div>" +
      '        <div class="fp-panel-tools">' +
      '          <input type="search" class="fp-filter" data-fp="logFilter" placeholder="Filter log…" aria-label="Filter transition log" autocomplete="off" />' +
      '          <button type="button" class="fp-tool-btn" data-fp="clearLog" title="Clear transition log (client only)">Clear log</button>' +
      "        </div>" +
      "      </div>" +
      '      <div class="fp-panel-body" data-fp="logBody">' +
      '        <div class="fp-log-list" data-fp="logList"></div>' +
      "      </div>" +
      "    </section>" +
      "  </div>" +
      '  <section class="fp-panel fp-gates" aria-label="Activation gates">' +
      '    <div class="fp-panel-title">Gates <span class="fp-meta" data-fp="gatesCount"></span></div>' +
      '    <div class="fp-panel-body fp-gates-panel-body">' +
      '      <div class="fp-gates-toolbar">' +
      '        <span class="fp-gates-focus" data-fp="gatesOwner"></span>' +
      '        <input type="search" class="fp-filter fp-filter-gates" data-fp="gatesFilter" placeholder="Filter gates…" aria-label="Filter gates by condition label" autocomplete="off" />' +
      "      </div>" +
      '      <div class="fp-gates-scroll">' +
      '        <div class="fp-gates-list" data-fp="gatesList"></div>' +
      '        <div class="fp-empty" data-fp="gatesEmpty">No condition factors for this behavior yet</div>' +
      "      </div>" +
      "    </div>" +
      "  </section>" +
      "</div>" +
      '<details class="fp-dev" data-fp="devDetails">' +
      "  <summary>Dev tools</summary>" +
      '  <p class="fp-dev-hint">Force-run / inject: use stock tabs (FreePlay is read-only). Keys (focus FreePlay): L/Esc → Live · j/k or ↓/↑ log scrub · / filter log.</p>' +
      '  <div class="fp-dev-links">' +
      '    <button type="button" class="fp-dev-link" data-fp="openBehaviors">Open Behaviors</button>' +
      '    <button type="button" class="fp-dev-link" data-fp="openConds">Open BehaviorConds</button>' +
      '    <button type="button" class="fp-dev-link" data-fp="copyLog" title="Copy transitionLog JSON to clipboard">Copy log JSON</button>' +
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
      silenceBanner: root.querySelector('[data-fp="silenceBanner"]'),
      stackList: root.querySelector('[data-fp="stackList"]'),
      stackEmpty: root.querySelector('[data-fp="stackEmpty"]'),
      logMeta: root.querySelector('[data-fp="logMeta"]'),
      logBody: root.querySelector('[data-fp="logBody"]'),
      logList: root.querySelector('[data-fp="logList"]'),
      logFilter: root.querySelector('[data-fp="logFilter"]'),
      clearLog: root.querySelector('[data-fp="clearLog"]'),
      gatesCount: root.querySelector('[data-fp="gatesCount"]'),
      gatesOwner: root.querySelector('[data-fp="gatesOwner"]'),
      gatesFilter: root.querySelector('[data-fp="gatesFilter"]'),
      gatesList: root.querySelector('[data-fp="gatesList"]'),
      gatesEmpty: root.querySelector('[data-fp="gatesEmpty"]'),
      rawBehaviors: root.querySelector('[data-fp="rawBehaviors"]'),
      rawConds: root.querySelector('[data-fp="rawConds"]'),
      devDetails: root.querySelector('[data-fp="devDetails"]'),
      openBehaviors: root.querySelector('[data-fp="openBehaviors"]'),
      openConds: root.querySelector('[data-fp="openConds"]'),
      copyLog: root.querySelector('[data-fp="copyLog"]'),
    };

    els.liveBtn.addEventListener("click", function () {
      goLive();
    });

    els.openBehaviors.addEventListener("click", function () {
      openStockTab("behaviors");
    });
    els.openConds.addEventListener("click", function () {
      openStockTab("behaviorconds");
    });
    if (els.copyLog) {
      els.copyLog.addEventListener("click", function () {
        copyLogJson();
      });
    }
    if (els.clearLog) {
      els.clearLog.addEventListener("click", function () {
        clearTransitionLog();
      });
    }
    if (els.logFilter) {
      els.logFilter.addEventListener("input", function () {
        logFilter = els.logFilter.value || "";
        applyLogFilter();
      });
    }
    if (els.gatesFilter) {
      els.gatesFilter.addEventListener("input", function () {
        gatesFilter = els.gatesFilter.value || "";
        applyGatesFilter();
      });
    }

    // Keyboard on root only (tabIndex=0); destroyed with DOM on re-init
    root.addEventListener("keydown", onRootKeydown);

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
    // P5.6 a11y
    els.liveBtn.setAttribute("aria-pressed", liveMode ? "true" : "false");
    els.debugState.textContent = debugState
      ? "debugState: " + debugState
      : "";

    els.pillBehaviors.className =
      "fp-pill" + (isStale("behaviors") ? " fp-pill-stale" : " fp-pill-fresh");
    els.pillConds.className =
      "fp-pill" +
      (isStale("behaviorconds") ? " fp-pill-stale" : " fp-pill-fresh");
    updateSilenceBanner();
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

    var leafName = leafOf(stack);
    var i;
    for (i = 0; i < stack.length; i++) {
      var name = stack[i];
      var isLeaf = i === stack.length - 1;
      var li = document.createElement("li");
      li.className = "fp-stack-li";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "fp-stack-item";
      if (isLeaf) {
        btn.className += " fp-stack-leaf";
      }
      if (selectedOwner && name === selectedOwner) {
        btn.className += " fp-stack-selected";
      }
      btn.setAttribute("data-owner", name);
      btn.setAttribute("aria-selected", selectedOwner && name === selectedOwner ? "true" : "false");

      // Depth gutters with tree connectors (content-line color via CSS)
      var d;
      for (d = 0; d < i; d++) {
        var gut = document.createElement("span");
        gut.className = "fp-stack-indent";
        gut.setAttribute("aria-hidden", "true");
        var connV = document.createElement("span");
        connV.className = "fp-stack-connector";
        var connH = document.createElement("span");
        connH.className = "fp-stack-connector-h";
        gut.appendChild(connV);
        gut.appendChild(connH);
        btn.appendChild(gut);
      }

      var main = document.createElement("span");
      main.className = "fp-stack-main";
      var nameEl = document.createElement("span");
      nameEl.className = "fp-stack-name";
      nameEl.textContent = name;
      main.appendChild(nameEl);

      // Honest meta only: depth index; parent name from previous stack entry (not mock roles)
      var meta = document.createElement("span");
      meta.className = "fp-stack-meta";
      if (i === 0) {
        meta.textContent = "L0 · root";
      } else {
        meta.textContent = "L" + i + " · " + stack[i - 1];
      }
      main.appendChild(meta);
      btn.appendChild(main);

      if (isLeaf) {
        var badge = document.createElement("span");
        badge.className = "fp-stack-badge";
        badge.textContent = "leaf";
        btn.appendChild(badge);
      }

      btn.addEventListener(
        "click",
        (function (owner, leaf) {
          return function () {
            var isLeafClick = owner === leaf;
            selectedOwner = isLeafClick ? leaf : owner;
            // Live: pin only non-leaf frames so later ticks keep gates target.
            // Leaf click (incl. re-click) clears pin → gates follow live leaf.
            if (liveMode) {
              ownerPinned = !isLeafClick;
            }
            render(true);
          };
        })(name, leafName)
      );
      li.appendChild(btn);
      els.stackList.appendChild(li);
    }
  }

  function logRowSelected(entry) {
    return !liveMode && selectedLogId != null && entry && entry.id === selectedLogId;
  }

  function leafDisplay(name) {
    return name ? String(name) : "(empty)";
  }

  function tagClassForKind(kind) {
    if (kind === "empty") {
      return " fp-log-tag-empty";
    }
    if (kind === "enter") {
      return " fp-log-tag-enter";
    }
    if (kind === "deeper") {
      return " fp-log-tag-deeper";
    }
    if (kind === "shallower") {
      return " fp-log-tag-shallower";
    }
    if (kind === "same-depth") {
      return " fp-log-tag-swap";
    }
    return "";
  }

  function updateLogMeta() {
    if (!els || !els.logMeta) {
      return;
    }
    els.logMeta.textContent = transitionLog.length + "/" + MAX_LOG;
  }

  function renderLog() {
    if (!els) {
      return;
    }
    updateLogMeta();

    var headId = transitionLog.length ? transitionLog[0].id : null;
    if (
      headId === lastRenderedLogHeadId &&
      lastRenderedSelectedLogId === selectedLogId &&
      els.logList.childNodes.length === transitionLog.length &&
      transitionLog.length > 0 &&
      !shouldFlashLog
    ) {
      return;
    }
    // Selection-only change: update classes without full rebuild
    if (
      headId === lastRenderedLogHeadId &&
      els.logList.childNodes.length === transitionLog.length &&
      transitionLog.length > 0 &&
      !shouldFlashLog
    ) {
      var rows = els.logList.querySelectorAll(".fp-log-row");
      var ri;
      for (ri = 0; ri < rows.length && ri < transitionLog.length; ri++) {
        var sel = logRowSelected(transitionLog[ri]);
        rows[ri].className = "fp-log-row" + (sel ? " fp-log-selected" : "");
        rows[ri].setAttribute("aria-selected", sel ? "true" : "false");
      }
      lastRenderedSelectedLogId = selectedLogId;
      applyLogFilter();
      return;
    }

    // Pin to newest (top) only if user has not scrolled into history
    var prevTop = els.logBody ? els.logBody.scrollTop : 0;
    var pinToNewest = prevTop < 8;

    lastRenderedLogHeadId = headId;
    lastRenderedSelectedLogId = selectedLogId;

    els.logList.innerHTML = "";
    if (!transitionLog.length) {
      var empty = document.createElement("div");
      empty.className = "fp-empty";
      empty.textContent = "No transitions yet";
      els.logList.appendChild(empty);
      shouldFlashLog = false;
      return;
    }
    var doFlash = shouldFlashLog;
    shouldFlashLog = false;

    var i;
    for (i = 0; i < transitionLog.length; i++) {
      var e = transitionLog[i];
      var row = document.createElement("button");
      row.type = "button";
      row.className = "fp-log-row";
      if (logRowSelected(e)) {
        row.className += " fp-log-selected";
      }
      if (doFlash && i === 0) {
        row.className += " fp-log-flash";
      }
      row.setAttribute("data-log-id", String(e.id));
      row.setAttribute("aria-selected", logRowSelected(e) ? "true" : "false");

      var fromLabel = leafDisplay(e.fromLeaf);
      var toLabel = leafDisplay(e.leaf);
      var tLabel = formatTime(e.t);
      var depth =
        typeof e.toDepth === "number" ? e.toDepth : e.stack ? e.stack.length : 0;
      var sameLeaf = fromLabel === toLabel;
      var fromLine =
        "from " + escapeHtml(fromLabel) + (sameLeaf ? " (same)" : "");

      var tagsHtml =
        '<span class="fp-log-tag fp-log-tag-meta">n=' + depth + "</span>";
      if (e.tag && e.tag.label) {
        tagsHtml +=
          '<span class="fp-log-tag' +
          tagClassForKind(e.tag.kind) +
          '">' +
          escapeHtml(e.tag.label) +
          "</span>";
      }

      row.innerHTML =
        '<span class="fp-log-time">' +
        tLabel +
        '</span><span class="fp-log-arrow" aria-hidden="true">→</span>' +
        '<div class="fp-log-body">' +
        '<div class="fp-log-to">' +
        escapeHtml(toLabel) +
        '</div><div class="fp-log-from">' +
        fromLine +
        "</div></div>" +
        '<div class="fp-log-tags">' +
        tagsHtml +
        "</div>";

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

    applyLogFilter();

    if (els.logBody) {
      if (pinToNewest) {
        els.logBody.scrollTop = 0;
      } else {
        els.logBody.scrollTop = prevTop;
      }
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
    // Honesty: factors are latest for owner — not frozen at log-row time
    els.gatesOwner.textContent = owner
      ? "Focus: " +
        owner +
        " · latest factors — not time-aligned to log row"
      : "Focus: — · latest factors — not time-aligned to log row";
    if (els.gatesCount) {
      els.gatesCount.textContent = "";
    }
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

    if (!labels.length) {
      els.gatesEmpty.style.display = "block";
      els.gatesEmpty.textContent =
        "No condition factors for this behavior yet";
      return;
    }
    els.gatesEmpty.style.display = "none";

    // Sort false-first (FALSE, unknown, inactive, TRUE), then alpha within rank
    labels.sort(function (a, b) {
      var ka = gateKind(byLabel[a], !!inactive[a]);
      var kb = gateKind(byLabel[b], !!inactive[b]);
      if (ka.rank !== kb.rank) {
        return ka.rank - kb.rank;
      }
      if (a < b) {
        return -1;
      }
      if (a > b) {
        return 1;
      }
      return 0;
    });

    var total = labels.length;
    var metCount = 0;
    var ti;
    for (ti = 0; ti < total; ti++) {
      var kindT = gateKind(byLabel[labels[ti]], !!inactive[labels[ti]]);
      if (kindT.statusTxt === "TRUE") {
        metCount++;
      }
    }
    if (els.gatesCount) {
      els.gatesCount.textContent = metCount + "/" + total + " met";
    }

    var truncated = 0;
    if (labels.length > MAX_GATES_DISPLAY) {
      truncated = labels.length - MAX_GATES_DISPLAY;
      labels = labels.slice(0, MAX_GATES_DISPLAY);
    }

    var i;
    for (i = 0; i < labels.length; i++) {
      var lab = labels[i];
      var fac = byLabel[lab];
      var isInactive = !!inactive[lab];
      var kind = gateKind(fac, isInactive);
      var ogKey = openGatesKey(owner, lab);
      var isOpen =
        openGates[ogKey] !== undefined
          ? !!openGates[ogKey]
          : kind.defaultOpen;

      var card = document.createElement("div");
      card.className = "fp-gate" + (isOpen ? " fp-gate-open" : "");
      card.setAttribute("data-gate-label", lab);

      var head = document.createElement("button");
      head.type = "button";
      head.className = "fp-gate-head";
      head.setAttribute("aria-expanded", isOpen ? "true" : "false");
      head.setAttribute(
        "title",
        isOpen ? "Collapse gate factors" : "Expand gate factors"
      );
      head.innerHTML =
        '<span class="fp-gate-status ' +
        kind.statusCls +
        '">' +
        kind.statusTxt +
        '</span><span class="fp-gate-label" title="' +
        escapeHtml(lab) +
        '">' +
        escapeHtml(lab) +
        '</span><span class="fp-gate-chevron" aria-hidden="true">▶</span>';

      var body = document.createElement("div");
      body.className = "fp-gate-body";

      // Still show last factor details when inactive (optional context)
      if (fac) {
        var keys = Object.keys(fac);
        var ki;
        var anyFactor = false;
        for (ki = 0; ki < keys.length; ki++) {
          var k = keys[ki];
          if (factorSkipKey(k)) {
            continue;
          }
          anyFactor = true;
          var line = document.createElement("div");
          line.className = "fp-factor-line";
          var valStr = formatFactorVal(fac[k]);
          line.innerHTML =
            '<span class="fp-factor-key" title="' +
            escapeHtml(k) +
            '">' +
            escapeHtml(k) +
            '</span><span class="fp-factor-val" title="' +
            escapeHtml(valStr) +
            '">' +
            escapeHtml(valStr) +
            "</span>";
          body.appendChild(line);
        }
        if (!anyFactor) {
          body.innerHTML =
            '<div class="fp-factor-line"><span class="fp-factor-key">—</span>' +
            '<span class="fp-factor-val">no factors</span></div>';
        }
      } else {
        body.innerHTML =
          '<div class="fp-factor-line"><span class="fp-factor-key">—</span>' +
          '<span class="fp-factor-val">no factors</span></div>';
      }

      head.addEventListener(
        "click",
        (function (cardEl, headEl, key) {
          return function () {
            var nowOpen = !cardEl.classList.contains("fp-gate-open");
            if (nowOpen) {
              cardEl.classList.add("fp-gate-open");
            } else {
              cardEl.classList.remove("fp-gate-open");
            }
            headEl.setAttribute("aria-expanded", nowOpen ? "true" : "false");
            headEl.setAttribute(
              "title",
              nowOpen ? "Collapse gate factors" : "Expand gate factors"
            );
            openGates[key] = nowOpen;
          };
        })(card, head, ogKey)
      );

      card.appendChild(head);
      card.appendChild(body);
      els.gatesList.appendChild(card);
    }

    if (truncated > 0) {
      var more = document.createElement("div");
      more.className = "fp-gates-more";
      more.textContent = "+" + truncated + " more (capped at " + MAX_GATES_DISPLAY + ")";
      els.gatesList.appendChild(more);
    }

    applyGatesFilter();
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
    shouldFlashLog = false;
    openGates = Object.create(null);
    logFilter = "";
    gatesFilter = "";
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
      // Sync filter inputs cleared by clearSessionState (DOM kept on reset)
      if (els.logFilter) {
        els.logFilter.value = "";
      }
      if (els.gatesFilter) {
        els.gatesFilter.value = "";
      }
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
    // Refresh stream pill stale state + dual-silence banner (P5.4)
    els.pillBehaviors.className =
      "fp-pill" + (isStale("behaviors") ? " fp-pill-stale" : " fp-pill-fresh");
    els.pillConds.className =
      "fp-pill" +
      (isStale("behaviorconds") ? " fp-pill-stale" : " fp-pill-fresh");
    updateSilenceBanner();
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
      "  outline: none;" +
      "}" +
      ".fp-root:focus {" +
      "  outline: 2px solid var(--wv-accent);" +
      "  outline-offset: 1px;" +
      "}" +
      ".fp-root:focus:not(:focus-visible) { outline: none; }" +
      ".fp-header {" +
      "  flex-shrink: 0;" +
      "  padding: var(--wv-space-2) var(--wv-space-3);" +
      "  border: 1px solid var(--wv-content-line);" +
      "  border-radius: var(--wv-radius);" +
      "  background: var(--wv-content-bg);" +
      "  box-shadow: var(--wv-shadow-sm);" +
      "}" +
      /* P5.4 dual-channel silence banner (under header; pills stay) */
      ".fp-silence-banner {" +
      "  flex-shrink: 0;" +
      "  padding: var(--wv-space-1) var(--wv-space-2);" +
      "  border: 1px solid var(--wv-warn);" +
      "  border-radius: var(--wv-radius-sm);" +
      "  color: var(--wv-warn);" +
      "  font-size: 12px;" +
      "  font-weight: 600;" +
      "  background: var(--wv-content-bg);" +
      "}" +
      ".fp-silence-banner[hidden] { display: none !important; }" +
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
      /* P5.2/5.3 log head: title + filter + clear (no double border) */
      ".fp-panel-head {" +
      "  flex-shrink: 0;" +
      "  display: flex;" +
      "  flex-direction: column;" +
      "  gap: var(--wv-space-1);" +
      "  padding: var(--wv-space-1) var(--wv-space-2);" +
      "  border-bottom: 1px solid var(--wv-content-line);" +
      "  min-width: 0;" +
      "}" +
      ".fp-panel-title-inline {" +
      "  padding: 0;" +
      "  border-bottom: none;" +
      "}" +
      ".fp-panel-tools {" +
      "  display: flex;" +
      "  flex-wrap: nowrap;" +
      "  align-items: center;" +
      "  gap: var(--wv-space-1);" +
      "  min-width: 0;" +
      "}" +
      ".fp-filter {" +
      "  flex: 1 1 auto;" +
      "  min-width: 0;" +
      "  box-sizing: border-box;" +
      "  font: inherit;" +
      "  font-size: 11px;" +
      "  font-family: var(--wv-mono);" +
      "  padding: 2px 6px;" +
      "  border: 1px solid var(--wv-content-line);" +
      "  border-radius: var(--wv-radius-sm);" +
      "  background: var(--wv-content-bg);" +
      "  color: var(--wv-content-text);" +
      "}" +
      ".fp-filter:focus {" +
      "  outline: 2px solid var(--wv-accent);" +
      "  outline-offset: 0;" +
      "}" +
      ".fp-filter-gates {" +
      "  flex: 0 1 140px;" +
      "  max-width: 160px;" +
      "}" +
      ".fp-tool-btn {" +
      "  flex-shrink: 0;" +
      "  font: inherit;" +
      "  font-size: 11px;" +
      "  font-weight: 600;" +
      "  padding: 2px 8px;" +
      "  border-radius: var(--wv-radius-sm);" +
      "  border: 1px solid var(--wv-content-line);" +
      "  background: var(--wv-content-bg);" +
      "  color: var(--wv-content-text);" +
      "  cursor: pointer;" +
      "  white-space: nowrap;" +
      "}" +
      ".fp-tool-btn:hover { background: var(--wv-accent-dim); }" +
      ".fp-tool-btn:focus {" +
      "  outline: 2px solid var(--wv-accent);" +
      "  outline-offset: 1px;" +
      "}" +
      ".fp-meta { font-weight: 400; opacity: 0.55; text-transform: none; letter-spacing: 0; }" +
      ".fp-panel-body {" +
      "  flex: 1 1 auto;" +
      "  min-height: 0;" +
      "  overflow: auto;" +
      "  overscroll-behavior: contain;" +
      "  padding: var(--wv-space-1) var(--wv-space-2);" +
      "}" +
      /* P2 stack hierarchy: indent gutters, connectors, leaf badge, depth meta */
      ".fp-stack-list {" +
      "  list-style: none;" +
      "  margin: 0;" +
      "  padding: 0;" +
      "  display: flex;" +
      "  flex-direction: column;" +
      "  gap: 1px;" +
      "}" +
      ".fp-stack-li { margin: 0; padding: 0; min-width: 0; }" +
      ".fp-stack-item {" +
      "  display: flex;" +
      "  align-items: stretch;" +
      "  width: 100%;" +
      "  text-align: left;" +
      "  box-sizing: border-box;" +
      "  font: inherit;" +
      "  padding: 0;" +
      "  border-radius: var(--wv-radius-sm);" +
      "  cursor: pointer;" +
      "  border: 1px solid transparent;" +
      "  background: transparent;" +
      "  color: var(--wv-content-text);" +
      "  min-width: 0;" +
      "}" +
      ".fp-stack-item:hover { background: var(--wv-accent-dim); }" +
      ".fp-stack-item:focus { outline: 2px solid var(--wv-accent); outline-offset: 1px; }" +
      ".fp-stack-indent {" +
      "  width: 12px;" +
      "  flex-shrink: 0;" +
      "  position: relative;" +
      "}" +
      ".fp-stack-connector {" +
      "  position: absolute;" +
      "  left: 5px;" +
      "  top: 0;" +
      "  bottom: 50%;" +
      "  width: 1px;" +
      "  background: var(--wv-content-line);" +
      "}" +
      ".fp-stack-connector-h {" +
      "  position: absolute;" +
      "  left: 5px;" +
      "  top: 50%;" +
      "  width: 7px;" +
      "  height: 1px;" +
      "  background: var(--wv-content-line);" +
      "}" +
      ".fp-stack-main {" +
      "  flex: 1 1 auto;" +
      "  min-width: 0;" +
      "  padding: var(--wv-space-1) var(--wv-space-1) var(--wv-space-1) 2px;" +
      "  display: flex;" +
      "  flex-direction: column;" +
      "  justify-content: center;" +
      "}" +
      ".fp-stack-name {" +
      "  font-family: var(--wv-mono);" +
      "  font-size: 11.5px;" +
      "  font-weight: 500;" +
      "  white-space: nowrap;" +
      "  overflow: hidden;" +
      "  text-overflow: ellipsis;" +
      "}" +
      ".fp-stack-meta {" +
      "  font-size: 10px;" +
      "  opacity: 0.5;" +
      "  margin-top: 1px;" +
      "  white-space: nowrap;" +
      "  overflow: hidden;" +
      "  text-overflow: ellipsis;" +
      "}" +
      ".fp-stack-leaf { background: var(--wv-accent-dim); }" +
      ".fp-stack-leaf .fp-stack-name {" +
      "  color: var(--wv-accent);" +
      "  font-weight: 600;" +
      "}" +
      ".fp-stack-selected {" +
      "  background: var(--wv-accent-dim);" +
      "  border-color: var(--wv-content-line);" +
      "}" +
      ".fp-stack-leaf.fp-stack-selected {" +
      "  border-color: var(--wv-accent);" +
      "}" +
      ".fp-stack-badge {" +
      "  align-self: center;" +
      "  flex-shrink: 0;" +
      "  margin-right: var(--wv-space-1);" +
      "  font-size: 9px;" +
      "  font-weight: 600;" +
      "  text-transform: uppercase;" +
      "  letter-spacing: 0.04em;" +
      "  color: var(--wv-accent);" +
      "  background: var(--wv-accent-dim);" +
      "  padding: 2px 5px;" +
      "  border-radius: var(--wv-radius-sm);" +
      "}" +
      ".fp-empty {" +
      "  opacity: 0.55;" +
      "  font-size: 12px;" +
      "  padding: var(--wv-space-2) 0;" +
      "}" +
      /* P3 transition log: time | → | from→to | tags; flash newest; pin scroll in logBody */
      ".fp-log-list {" +
      "  display: flex;" +
      "  flex-direction: column;" +
      "  gap: 2px;" +
      "}" +
      ".fp-log-row {" +
      "  display: grid;" +
      "  grid-template-columns: 58px 14px minmax(0, 1fr) auto;" +
      "  gap: 6px;" +
      "  align-items: start;" +
      "  text-align: left;" +
      "  width: 100%;" +
      "  box-sizing: border-box;" +
      "  font: inherit;" +
      "  font-family: var(--wv-mono);" +
      "  font-size: 11px;" +
      "  padding: 5px 8px;" +
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
      ".fp-log-flash { animation: fp-log-flash-in 0.45s ease; }" +
      "@keyframes fp-log-flash-in {" +
      "  from { background: var(--wv-accent-dim); }" +
      "  to { background: transparent; }" +
      "}" +
      "@media (prefers-reduced-motion: reduce) {" +
      "  .fp-log-flash { animation: none; }" +
      "}" +
      ".fp-log-time { opacity: 0.55; }" +
      ".fp-log-arrow { color: var(--wv-accent); }" +
      ".fp-log-body { min-width: 0; }" +
      ".fp-log-to {" +
      "  font-weight: 600;" +
      "  white-space: nowrap;" +
      "  overflow: hidden;" +
      "  text-overflow: ellipsis;" +
      "}" +
      ".fp-log-from {" +
      "  opacity: 0.55;" +
      "  font-size: 10px;" +
      "  margin-top: 1px;" +
      "  white-space: nowrap;" +
      "  overflow: hidden;" +
      "  text-overflow: ellipsis;" +
      "}" +
      ".fp-log-tags {" +
      "  display: flex;" +
      "  flex-wrap: nowrap;" +
      "  gap: 3px;" +
      "  justify-content: flex-end;" +
      "  max-width: 140px;" +
      "  overflow: hidden;" +
      "}" +
      ".fp-log-tag {" +
      "  font-size: 9px;" +
      "  padding: 1px 5px;" +
      "  border-radius: 3px;" +
      "  border: 1px solid var(--wv-content-line);" +
      "  color: var(--wv-content-text);" +
      "  opacity: 0.75;" +
      "  white-space: nowrap;" +
      "}" +
      ".fp-log-tag-meta { opacity: 0.5; }" +
      ".fp-log-tag-empty { opacity: 1; color: var(--wv-warn); }" +
      ".fp-log-tag-enter { opacity: 1; color: var(--wv-good); }" +
      ".fp-log-tag-deeper { opacity: 1; color: var(--wv-accent); }" +
      ".fp-log-tag-shallower { opacity: 1; color: var(--wv-warn); }" +
      ".fp-log-tag-swap { opacity: 0.85; }" +
      /* P4 gates: collapsible cards, focus toolbar, false-first sort in JS */
      ".fp-gates-panel-body {" +
      "  display: flex;" +
      "  flex-direction: column;" +
      "  overflow: hidden;" +
      "  padding: var(--wv-space-1) var(--wv-space-2);" +
      "}" +
      ".fp-gates-toolbar {" +
      "  flex-shrink: 0;" +
      "  display: flex;" +
      "  flex-wrap: nowrap;" +
      "  align-items: center;" +
      "  gap: var(--wv-space-2);" +
      "  min-width: 0;" +
      "  margin-bottom: var(--wv-space-1);" +
      "  padding-bottom: var(--wv-space-1);" +
      "  border-bottom: 1px solid var(--wv-content-line);" +
      "}" +
      ".fp-gates-focus {" +
      "  font-family: var(--wv-mono);" +
      "  font-size: 11px;" +
      "  font-weight: 500;" +
      "  color: var(--wv-content-text);" +
      "  opacity: 0.75;" +
      "  flex: 1 1 auto;" +
      "  min-width: 0;" +
      "  overflow: hidden;" +
      "  text-overflow: ellipsis;" +
      "  white-space: nowrap;" +
      "}" +
      ".fp-gates-scroll {" +
      "  flex: 1 1 auto;" +
      "  min-height: 0;" +
      "  overflow: auto;" +
      "  overscroll-behavior: contain;" +
      "}" +
      ".fp-gates-list {" +
      "  display: flex;" +
      "  flex-direction: column;" +
      "  gap: 4px;" +
      "}" +
      ".fp-gate {" +
      "  border: 1px solid var(--wv-content-line);" +
      "  border-radius: var(--wv-radius-sm);" +
      "  overflow: hidden;" +
      "  background: var(--wv-content-bg);" +
      "}" +
      ".fp-gate-head {" +
      "  display: flex;" +
      "  align-items: center;" +
      "  gap: var(--wv-space-2);" +
      "  width: 100%;" +
      "  box-sizing: border-box;" +
      "  text-align: left;" +
      "  font: inherit;" +
      "  padding: 5px 8px;" +
      "  border: none;" +
      "  background: transparent;" +
      "  color: var(--wv-content-text);" +
      "  cursor: pointer;" +
      "  user-select: none;" +
      "  min-width: 0;" +
      "}" +
      ".fp-gate-head:hover { background: var(--wv-accent-dim); }" +
      ".fp-gate-head:focus { outline: 2px solid var(--wv-accent); outline-offset: -1px; }" +
      ".fp-gate-status {" +
      "  font-family: var(--wv-mono);" +
      "  font-size: 10px;" +
      "  font-weight: 700;" +
      "  min-width: 52px;" +
      "  text-align: center;" +
      "  padding: 2px 0;" +
      "  border-radius: 3px;" +
      "  flex-shrink: 0;" +
      "}" +
      ".fp-met { color: var(--wv-good); }" +
      ".fp-unmet { color: var(--wv-bad); }" +
      ".fp-gate-unknown, .fp-gate-inactive { opacity: 0.55; }" +
      ".fp-gate-label {" +
      "  font-family: var(--wv-mono);" +
      "  font-size: 11.5px;" +
      "  font-weight: 600;" +
      "  flex: 1 1 auto;" +
      "  min-width: 0;" +
      "  overflow: hidden;" +
      "  text-overflow: ellipsis;" +
      "  white-space: nowrap;" +
      "}" +
      ".fp-gate-chevron {" +
      "  flex-shrink: 0;" +
      "  font-size: 10px;" +
      "  opacity: 0.45;" +
      "  transition: transform 0.15s ease;" +
      "}" +
      ".fp-gate-open .fp-gate-chevron { transform: rotate(90deg); }" +
      "@media (prefers-reduced-motion: reduce) {" +
      "  .fp-gate-chevron { transition: none; }" +
      "}" +
      ".fp-gate-body {" +
      "  display: none;" +
      "  padding: 0 8px 8px 48px;" +
      "  border-top: 1px solid var(--wv-content-line);" +
      "}" +
      ".fp-gate-open .fp-gate-body { display: block; }" +
      ".fp-factor-line {" +
      "  display: grid;" +
      "  grid-template-columns: minmax(80px, 120px) minmax(0, 1fr);" +
      "  gap: 6px;" +
      "  font-family: var(--wv-mono);" +
      "  font-size: 11px;" +
      "  padding: 3px 0;" +
      "  border-bottom: 1px solid var(--wv-content-line);" +
      "}" +
      ".fp-factor-line:last-child { border-bottom: none; }" +
      ".fp-factor-key { opacity: 0.55; overflow: hidden; text-overflow: ellipsis; }" +
      ".fp-factor-val {" +
      "  overflow: hidden;" +
      "  text-overflow: ellipsis;" +
      "  white-space: nowrap;" +
      "}" +
      ".fp-gates-more {" +
      "  font-size: 11px;" +
      "  opacity: 0.55;" +
      "  padding: var(--wv-space-1) 0;" +
      "  font-family: var(--wv-mono);" +
      "}" +
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
