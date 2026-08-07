/*
 * SocialPresence WebViz module (engine :8888)
 * Wire key: socialpresence (case-insensitive).
 *
 * Data contract (do not invent fields — C++ producer only):
 *   graph tick:  { time: number, graphData: [{ name: string, value: number }, ...] }
 *   info once:   { info: { events: [{ eventName: string, ... }] } }
 *     → event buttons call sendData(event object) as upstream did
 * Client-only: series visibility, window width, dump, Flot hover.
 *
 * UI: dense ops dashboard (ui-ux-pro-max: data-dense, line trend, KPI strip).
 * Styles use content tokens for light .module-host.
 */
(function (myMethods, sendData) {
  "use strict";

  var WINDOW_S = 60;
  var DEFAULT_VISIBLE = ["RSPI"];
  var SERIES_COLORS = [
    "#2563eb",
    "#d97706",
    "#059669",
    "#7c3aed",
    "#dc2626",
    "#0891b2",
    "#db2777",
    "#4f46e5",
  ];

  var hostElem = null;
  var els = null;
  var chart = null;
  var firstSeriesInit = true;
  var seriesNames = []; // ordered names from first graphData
  var seriesVisible = Object.create(null); // name → bool
  var seriesData = Object.create(null); // name → [[t,v], ...]
  var plotSeries = []; // Flot series objects (stable refs)
  var dumpedData = [];
  var dumping = false;
  var lastTime = null;
  var lastPacketAt = 0;
  var packetCount = 0;
  var eventsInfo = null; // last info.events
  var hoverBound = false;
  var enableAllSnapshot = null; // visibility map before "Enable all"

  function $host() {
    if (hostElem) {
      return $(hostElem);
    }
    try {
      var el = document.getElementById("tab-socialpresence");
      if (el) {
        return $(el);
      }
    } catch (e) {}
    return $();
  }

  function setHost(el) {
    if (!el) {
      return;
    }
    if (el.jquery) {
      hostElem = el[0] || hostElem;
    } else if (el.nodeType) {
      hostElem = el;
    }
  }

  function safeSend(payload) {
    try {
      if (typeof sendData === "function") {
        sendData(payload);
      }
    } catch (e) {
      console.warn("socialPresence: sendData failed", e);
    }
  }

  function fmtVal(v, prec) {
    prec = prec == null ? 3 : prec;
    if (typeof v !== "number" || !isFinite(v)) {
      return "—";
    }
    var p = Math.pow(10, prec);
    return (Math.round(v * p) / p).toFixed(prec);
  }

  function fmtTime(t) {
    if (typeof t !== "number" || !isFinite(t)) {
      return "—";
    }
    return t.toFixed(2) + " s";
  }

  function colorFor(idx) {
    return SERIES_COLORS[idx % SERIES_COLORS.length];
  }

  function latestValue(name) {
    var arr = seriesData[name];
    if (!arr || !arr.length) {
      return null;
    }
    var pt = arr[arr.length - 1];
    if (!pt || typeof pt[1] !== "number" || !isFinite(pt[1])) {
      return null;
    }
    return pt[1];
  }

  function primaryName() {
    if (seriesVisible.RSPI && seriesNames.indexOf("RSPI") >= 0) {
      return "RSPI";
    }
    var i;
    for (i = 0; i < seriesNames.length; i++) {
      if (seriesVisible[seriesNames[i]]) {
        return seriesNames[i];
      }
    }
    return seriesNames[0] || null;
  }

  function buildDom(elem) {
    var root = document.createElement("div");
    root.className = "sp-root";
    root.innerHTML =
      '<header class="sp-header">' +
      '  <div class="sp-title-row">' +
      '    <h2 class="sp-title">Social Presence</h2>' +
      '    <span class="sp-live" data-sp="live" aria-live="polite">waiting</span>' +
      '    <span class="sp-meta" data-sp="meta">no packets yet</span>' +
      "  </div>" +
      '  <p class="sp-sub">Live series from engine wire <code>socialpresence</code> · window ' +
      WINDOW_S +
      " s</p>" +
      "</header>" +
      '<section class="sp-kpis" data-sp="kpis" aria-label="Series values"></section>' +
      '<section class="sp-chart-wrap" aria-label="Time series chart">' +
      '  <div class="sp-chart-toolbar">' +
      '    <div class="sp-toggles" data-sp="toggles" role="group" aria-label="Toggle series"></div>' +
      '    <div class="sp-tools">' +
      '      <label class="sp-check"><input type="checkbox" data-sp="fillPrimary" checked /> Area fill (primary)</label>' +
      '      <label class="sp-check"><input type="checkbox" data-sp="dump" /> Dump</label>' +
      '      <label class="sp-check" title="Show every series on the chart"><input type="checkbox" data-sp="enableAll" /> Enable all</label>' +
      '      <span class="sp-dump" data-sp="dumpLink"></span>' +
      "    </div>" +
      "  </div>" +
      '  <div class="sp-chart" data-sp="chart" role="img" aria-label="Social presence time series"></div>' +
      '  <div class="sp-tooltip" data-sp="tooltip" hidden></div>' +
      '  <div class="sp-empty" data-sp="empty">Waiting for graph packets… Subscribe is live when the engine publishes <code>socialpresence</code>.</div>' +
      "</section>" +
      '<section class="sp-events-panel" aria-label="Fire-and-forget events">' +
      '  <div class="sp-events-head">' +
      '    <div class="sp-panel-title">Events</div>' +
      '    <span class="sp-panel-hint">Fire-and-forget · sendData · from <code>info.events</code></span>' +
      "  </div>" +
      '  <div class="sp-events" data-sp="events">' +
      '    <p class="sp-events-empty" data-sp="eventsEmpty">No event actions yet — waiting for <code>info.events</code>.</p>' +
      "  </div>" +
      "</section>";

    elem.appendChild(root);

    els = {
      root: root,
      live: root.querySelector('[data-sp="live"]'),
      meta: root.querySelector('[data-sp="meta"]'),
      kpis: root.querySelector('[data-sp="kpis"]'),
      toggles: root.querySelector('[data-sp="toggles"]'),
      chart: root.querySelector('[data-sp="chart"]'),
      tooltip: root.querySelector('[data-sp="tooltip"]'),
      empty: root.querySelector('[data-sp="empty"]'),
      events: root.querySelector('[data-sp="events"]'),
      eventsEmpty: root.querySelector('[data-sp="eventsEmpty"]'),
      fillPrimary: root.querySelector('[data-sp="fillPrimary"]'),
      dump: root.querySelector('[data-sp="dump"]'),
      enableAll: root.querySelector('[data-sp="enableAll"]'),
      dumpLink: root.querySelector('[data-sp="dumpLink"]'),
    };

    els.dump.addEventListener("change", function () {
      dumping = !!els.dump.checked;
      if (dumping) {
        dumpedData = [];
        els.dumpLink.textContent = "recording… uncheck to download";
        els.dumpLink.removeAttribute("href");
        while (els.dumpLink.firstChild) {
          els.dumpLink.removeChild(els.dumpLink.firstChild);
        }
      } else {
        try {
          var url =
            "data:text/plain;charset=utf-8," +
            encodeURIComponent(JSON.stringify(dumpedData, null, 2));
          els.dumpLink.innerHTML = "";
          var a = document.createElement("a");
          a.id = "sp-download";
          a.download = "socialpresence_data.json";
          a.href = url;
          a.textContent = "download json (" + dumpedData.length + ")";
          els.dumpLink.appendChild(a);
        } catch (eDump) {
          els.dumpLink.textContent = "serialize failed";
        }
      }
    });

    els.enableAll.addEventListener("change", function () {
      applyEnableAll(!!els.enableAll.checked);
    });

    els.fillPrimary.addEventListener("change", function () {
      rebuildPlotSeries();
      redrawChart();
    });
  }

  function allSeriesVisible() {
    var i;
    if (!seriesNames.length) {
      return false;
    }
    for (i = 0; i < seriesNames.length; i++) {
      if (!seriesVisible[seriesNames[i]]) {
        return false;
      }
    }
    return true;
  }

  function syncEnableAllCheckbox() {
    if (!els || !els.enableAll) {
      return;
    }
    els.enableAll.checked = allSeriesVisible();
    els.enableAll.disabled = !seriesNames.length;
  }

  function applyEnableAll(on) {
    var i;
    var name;
    if (!seriesNames.length) {
      syncEnableAllCheckbox();
      return;
    }
    if (on) {
      enableAllSnapshot = Object.create(null);
      for (i = 0; i < seriesNames.length; i++) {
        name = seriesNames[i];
        enableAllSnapshot[name] = !!seriesVisible[name];
        seriesVisible[name] = true;
      }
    } else if (enableAllSnapshot) {
      for (i = 0; i < seriesNames.length; i++) {
        name = seriesNames[i];
        if (Object.prototype.hasOwnProperty.call(enableAllSnapshot, name)) {
          seriesVisible[name] = !!enableAllSnapshot[name];
        }
      }
      enableAllSnapshot = null;
      // If snapshot was already all-on, fall back to defaults (RSPI / first)
      if (allSeriesVisible() && seriesNames.length > 1) {
        for (i = 0; i < seriesNames.length; i++) {
          seriesVisible[seriesNames[i]] = false;
        }
        if (seriesNames.indexOf("RSPI") >= 0) {
          seriesVisible.RSPI = true;
        } else {
          seriesVisible[seriesNames[0]] = true;
        }
      }
    } else {
      // No snapshot: leave only primary on
      for (i = 0; i < seriesNames.length; i++) {
        seriesVisible[seriesNames[i]] = false;
      }
      if (seriesNames.indexOf("RSPI") >= 0) {
        seriesVisible.RSPI = true;
      } else if (seriesNames.length) {
        seriesVisible[seriesNames[0]] = true;
      }
    }
    rebuildPlotSeries();
    renderKpisAndToggles();
    redrawChart();
  }

  function toggleSeries(name) {
    seriesVisible[name] = !seriesVisible[name];
    // Leaving "all on" mode — drop snapshot so uncheck doesn't surprise
    if (enableAllSnapshot && !seriesVisible[name]) {
      enableAllSnapshot = null;
    }
    // Keep at least one series visible
    var any = false;
    var i;
    for (i = 0; i < seriesNames.length; i++) {
      if (seriesVisible[seriesNames[i]]) {
        any = true;
        break;
      }
    }
    if (!any) {
      seriesVisible[name] = true;
    }
    rebuildPlotSeries();
    renderKpisAndToggles();
    redrawChart();
  }

  function setLiveState(state) {
    if (!els || !els.live) {
      return;
    }
    els.live.textContent = state;
    els.live.className = "sp-live sp-live--" + state;
  }

  function updateMeta() {
    if (!els || !els.meta) {
      return;
    }
    var parts = [];
    parts.push(packetCount + " pkt");
    if (lastTime != null) {
      parts.push("t=" + fmtTime(lastTime));
    }
    parts.push(seriesNames.length + " series");
    els.meta.textContent = parts.join(" · ");
  }

  function renderKpisAndToggles() {
    if (!els) {
      return;
    }
    els.kpis.innerHTML = "";
    els.toggles.innerHTML = "";

    if (!seriesNames.length) {
      els.kpis.style.removeProperty("--sp-kpi-n");
      syncEnableAllCheckbox();
      return;
    }

    // Equal columns so common wide layouts stay one full row (no orphan tail)
    els.kpis.style.setProperty("--sp-kpi-n", String(seriesNames.length));

    var i;
    for (i = 0; i < seriesNames.length; i++) {
      (function (name, idx) {
        var val = latestValue(name);
        var on = !!seriesVisible[name];
        var col = colorFor(idx);

        // KPI card — toggle series visibility
        var card = document.createElement("button");
        card.type = "button";
        card.className = "sp-kpi" + (on ? "" : " sp-kpi--off");
        card.setAttribute("aria-pressed", on ? "true" : "false");
        card.title = (on ? "Hide" : "Show") + " series " + name;
        card.innerHTML =
          '<span class="sp-kpi-top">' +
          '<span class="sp-kpi-swatch" style="background:' +
          col +
          '"></span>' +
          '<span class="sp-kpi-name">' +
          escapeHtml(name) +
          "</span>" +
          "</span>" +
          '<span class="sp-kpi-val">' +
          (val == null ? "—" : fmtVal(val)) +
          "</span>";
        card.addEventListener("click", function () {
          toggleSeries(name);
        });
        els.kpis.appendChild(card);

        // Compact chip under chart toolbar
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "sp-chip" + (on ? " sp-chip--on" : "");
        chip.setAttribute("aria-pressed", on ? "true" : "false");
        chip.innerHTML =
          '<span class="sp-chip-line" style="border-color:' +
          col +
          ";background:" +
          (on ? col : "transparent") +
          '"></span>' +
          escapeHtml(name);
        chip.addEventListener("click", function () {
          toggleSeries(name);
        });
        els.toggles.appendChild(chip);
      })(seriesNames[i], i);
    }

    // Primary highlight on first visible / RSPI
    var prim = primaryName();
    if (prim) {
      var cards = els.kpis.querySelectorAll(".sp-kpi");
      for (i = 0; i < cards.length; i++) {
        if (cards[i].querySelector(".sp-kpi-name").textContent === prim) {
          cards[i].classList.add("sp-kpi--primary");
        }
      }
    }

    syncEnableAllCheckbox();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function initSeriesFromPayload(graphDataArr) {
    seriesNames = [];
    seriesData = Object.create(null);
    seriesVisible = Object.create(null);
    plotSeries = [];

    var i;
    for (i = 0; i < graphDataArr.length; i++) {
      var entry = graphDataArr[i];
      if (!entry || typeof entry !== "object" || typeof entry.name !== "string") {
        continue;
      }
      var name = entry.name;
      if (seriesData[name]) {
        continue; // unique names only
      }
      seriesNames.push(name);
      seriesData[name] = [];
      // Default: show RSPI (and any name in DEFAULT_VISIBLE); others off if many
      if (DEFAULT_VISIBLE.indexOf(name) >= 0 || seriesNames.length === 1) {
        seriesVisible[name] = true;
      } else {
        // If only a few series, show all; if many, only defaults
        seriesVisible[name] = graphDataArr.length <= 4;
      }
    }
    // Ensure at least one visible
    var anyOn = false;
    for (i = 0; i < seriesNames.length; i++) {
      if (seriesVisible[seriesNames[i]]) {
        anyOn = true;
        break;
      }
    }
    if (!anyOn && seriesNames.length) {
      seriesVisible[seriesNames[0]] = true;
    }

    rebuildPlotSeries();
    firstSeriesInit = false;
    if (els && els.empty) {
      els.empty.hidden = true;
    }
    renderKpisAndToggles();
  }

  function rebuildPlotSeries() {
    plotSeries = [];
    var fillPrimary = els && els.fillPrimary ? els.fillPrimary.checked : true;
    var prim = primaryName();
    var i;
    for (i = 0; i < seriesNames.length; i++) {
      var name = seriesNames[i];
      var show = !!seriesVisible[name];
      var col = colorFor(i);
      var isPrim = name === prim;
      var ser = {
        label: name,
        data: seriesData[name],
        color: col,
        lines: {
          show: show,
          lineWidth: isPrim ? 2.5 : 1.5,
          fill: show && fillPrimary && isPrim,
          // Solid translucent fill — stock Flot (no gradient plugin required)
          fillColor: isPrim ? "rgba(37, 99, 235, 0.12)" : undefined,
        },
        shadowSize: 0,
      };
      plotSeries.push(ser);
    }
  }

  function pruneWindow(t) {
    var i;
    for (i = 0; i < seriesNames.length; i++) {
      var name = seriesNames[i];
      var arr = seriesData[name];
      if (!arr) {
        continue;
      }
      while (arr.length > 0) {
        var oldest = arr[0];
        if (!Array.isArray(oldest) || typeof oldest[0] !== "number") {
          arr.shift();
          continue;
        }
        if (t - oldest[0] > WINDOW_S) {
          arr.shift();
        } else {
          break;
        }
      }
    }
  }

  function chartOptions(t) {
    var xMin = (typeof t === "number" ? t : 0) - WINDOW_S;
    var xMax = xMin + WINDOW_S + 0.1;
    return {
      legend: { show: false },
      series: {
        lines: { show: true },
        points: { show: false },
      },
      yaxis: {
        min: -1.05,
        max: 1.05,
        ticks: [-1, -0.5, 0, 0.5, 1],
        tickColor: "rgba(0,0,0,0.08)",
        font: { color: "#5c667a", size: 10 },
      },
      xaxis: {
        min: xMin,
        max: xMax,
        ticks: 6,
        tickDecimals: 0,
        tickColor: "rgba(0,0,0,0.08)",
        font: { color: "#5c667a", size: 10 },
      },
      grid: {
        show: true,
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.12)",
        hoverable: true,
        clickable: false,
        autoHighlight: true,
        margin: { top: 8, left: 8, right: 12, bottom: 8 },
      },
      colors: SERIES_COLORS,
    };
  }

  function ensurePlot(t) {
    if (!els || !els.chart) {
      return null;
    }
    var $c = $(els.chart);
    if (!$c.length) {
      return null;
    }
    if (chart) {
      try {
        var ph =
          typeof chart.getPlaceholder === "function"
            ? chart.getPlaceholder()
            : null;
        if (ph && ph.length && ph[0] && document.documentElement.contains(ph[0])) {
          return chart;
        }
      } catch (e) {
        chart = null;
      }
    }
    try {
      chart = $.plot($c, plotSeries.length ? plotSeries : [{ data: [] }], chartOptions(t));
      bindHover($c);
    } catch (ePlot) {
      console.warn("socialPresence: $.plot failed", ePlot);
      chart = null;
    }
    return chart;
  }

  function bindHover($c) {
    if (hoverBound || !$c || !$c.length) {
      return;
    }
    hoverBound = true;
    $c.on("plothover", function (event, pos, item) {
      if (!els || !els.tooltip) {
        return;
      }
      if (item) {
        var v = item.datapoint[1];
        var tx = item.datapoint[0];
        els.tooltip.hidden = false;
        els.tooltip.innerHTML =
          '<strong>' +
          escapeHtml(item.series.label) +
          "</strong> " +
          fmtVal(v) +
          ' <span class="sp-tip-t">@ ' +
          fmtTime(tx) +
          "</span>";
        var off = $c.offset();
        var left = item.pageX - off.left + 12;
        var top = item.pageY - off.top - 28;
        els.tooltip.style.left = left + "px";
        els.tooltip.style.top = top + "px";
      } else {
        els.tooltip.hidden = true;
      }
    });
    $c.on("mouseleave", function () {
      if (els && els.tooltip) {
        els.tooltip.hidden = true;
      }
    });
  }

  function redrawChart() {
    if (!seriesNames.length) {
      return;
    }
    var t = lastTime != null ? lastTime : 0;
    var c = ensurePlot(t);
    if (!c) {
      return;
    }
    try {
      var opts = chartOptions(t);
      c.getAxes().xaxis.options.min = opts.xaxis.min;
      c.getAxes().xaxis.options.max = opts.xaxis.max;
      c.setData(plotSeries);
      c.setupGrid();
      c.draw();
    } catch (e) {
      console.warn("socialPresence: redraw failed", e);
    }
  }

  function renderEvents(events) {
    if (!els || !els.events) {
      return;
    }
    // Clear previous buttons but keep structure
    var keepEmpty = els.eventsEmpty;
    els.events.innerHTML = "";
    if (keepEmpty) {
      els.events.appendChild(keepEmpty);
    }

    var list = [];
    if (Array.isArray(events)) {
      list = events;
    } else if (events && typeof events === "object") {
      var k;
      for (k in events) {
        if (events.hasOwnProperty(k)) {
          list.push(events[k]);
        }
      }
    }

    if (!list.length) {
      if (els.eventsEmpty) {
        els.eventsEmpty.hidden = false;
      }
      return;
    }
    if (els.eventsEmpty) {
      els.eventsEmpty.hidden = true;
    }

    var i;
    for (i = 0; i < list.length; i++) {
      (function (ev, idx) {
        if (!ev || typeof ev !== "object") {
          return;
        }
        var label =
          typeof ev.eventName === "string"
            ? ev.eventName
            : "event " + (idx + 1);
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "sp-event-btn";
        btn.title = "Fire once · sendData(" + label + ")";
        btn.setAttribute("aria-label", "Send event " + label);
        btn.innerHTML =
          '<span class="sp-event-icon" aria-hidden="true">' +
          '<svg width="14" height="14" viewBox="0 0 16 16" fill="none">' +
          '<path d="M2.5 8h9M8.5 4.5L12 8l-3.5 3.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>' +
          "</svg></span>" +
          '<span class="sp-event-label">' +
          escapeHtml(label) +
          "</span>" +
          '<span class="sp-event-hint">send</span>';
        btn.addEventListener("click", function () {
          safeSend(ev);
          btn.classList.remove("sp-event-btn--sent");
          // reflow so animation can re-trigger
          void btn.offsetWidth;
          btn.classList.add("sp-event-btn--sent");
          var hint = btn.querySelector(".sp-event-hint");
          if (hint) {
            hint.textContent = "sent";
          }
          setTimeout(function () {
            btn.classList.remove("sp-event-btn--sent");
            if (hint) {
              hint.textContent = "send";
            }
          }, 650);
        });
        els.events.appendChild(btn);
      })(list[i], i);
    }
  }

  function ingestGraphTick(data) {
    var arr = data.graphData;
    if (!Array.isArray(arr)) {
      return;
    }
    var t = data.time;
    if (typeof t !== "number" || !isFinite(t)) {
      return;
    }
    lastTime = t;
    lastPacketAt = Date.now();
    packetCount++;

    if (firstSeriesInit) {
      initSeriesFromPayload(arr);
    }

    var j;
    for (j = 0; j < arr.length; j++) {
      var g = arr[j];
      if (!g || typeof g !== "object" || typeof g.name !== "string") {
        continue;
      }
      if (!seriesData[g.name]) {
        // New series mid-stream: add without dropping existing (still only names/values from wire)
        seriesNames.push(g.name);
        seriesData[g.name] = [];
        seriesVisible[g.name] = seriesNames.length <= 4;
        rebuildPlotSeries();
      }
      var numVal = parseFloat(g.value);
      if (!isFinite(numVal)) {
        continue;
      }
      seriesData[g.name].push([t, numVal]);
    }

    pruneWindow(t);
    setLiveState("live");
    updateMeta();
    renderKpisAndToggles();
    redrawChart();
  }

  // ——— WebViz module API ———

  myMethods.init = function (elem) {
    setHost(elem);
    firstSeriesInit = true;
    seriesNames = [];
    seriesData = Object.create(null);
    seriesVisible = Object.create(null);
    plotSeries = [];
    chart = null;
    hoverBound = false;
    dumpedData = [];
    dumping = false;
    lastTime = null;
    packetCount = 0;
    eventsInfo = null;
    enableAllSnapshot = null;
    buildDom(elem);
    setLiveState("waiting");
    updateMeta();
  };

  myMethods.onData = function (data, elem) {
    try {
      if (elem) {
        setHost(elem);
      }
      if (data == null || typeof data !== "object") {
        return;
      }

      if (dumping) {
        dumpedData.push(data);
      }

      // Subscription handshake / control payload
      if (typeof data.info !== "undefined" && data.info != null) {
        eventsInfo = data.info.events;
        renderEvents(eventsInfo);
        // info-only packets often have no graphData
        if (!Array.isArray(data.graphData)) {
          updateMeta();
          return;
        }
      }

      if (Array.isArray(data.graphData)) {
        ingestGraphTick(data);
      }
    } catch (err) {
      console.warn("socialPresence: onData error", err);
    }
  };

  myMethods.update = function (dt, elem) {
    if (elem) {
      setHost(elem);
    }
    // Stale pulse: if no packets for 3s, show idle
    if (els && lastPacketAt && Date.now() - lastPacketAt > 3000) {
      if (els.live && els.live.textContent === "live") {
        setLiveState("idle");
      }
    }
  };

  myMethods.getStyles = function () {
    return `
      .sp-root {
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 12px 14px 16px;
        min-height: 100%;
        color: var(--wv-content-text, #1a1d24);
        font-family: var(--wv-sans, system-ui, sans-serif);
        font-size: 13px;
        line-height: 1.45;
      }
      .sp-root *, .sp-root *::before, .sp-root *::after {
        box-sizing: border-box;
      }
      .sp-header {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .sp-title-row {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 10px 14px;
      }
      .sp-title {
        margin: 0;
        font-size: 15px;
        font-weight: 650;
        letter-spacing: -0.01em;
      }
      .sp-live {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        padding: 2px 8px;
        border-radius: 999px;
        background: #e8ecf2;
        color: #5c667a;
      }
      .sp-live--waiting { background: #e8ecf2; color: #5c667a; }
      .sp-live--live {
        background: rgba(62, 207, 142, 0.18);
        color: #0f7a4a;
      }
      .sp-live--idle {
        background: rgba(230, 180, 80, 0.2);
        color: #8a6a12;
      }
      .sp-meta {
        font-family: var(--wv-mono, ui-monospace, monospace);
        font-size: 11px;
        color: #5c667a;
      }
      .sp-sub {
        margin: 0;
        font-size: 12px;
        color: #5c667a;
      }
      .sp-sub code {
        font-family: var(--wv-mono, ui-monospace, monospace);
        font-size: 11px;
        background: #e8ecf2;
        padding: 1px 5px;
        border-radius: 4px;
      }

      /* One equal-width row at desktop; no orphan tail of 2–3 cards */
      .sp-kpis {
        display: grid;
        grid-template-columns: repeat(var(--sp-kpi-n, 1), minmax(0, 1fr));
        gap: 8px;
      }
      @media (max-width: 640px) {
        .sp-kpis {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      .sp-kpi {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        justify-content: space-between;
        gap: 6px;
        min-width: 0;
        width: 100%;
        padding: 8px 10px;
        border: 1px solid var(--wv-content-line, #c5cad3);
        border-radius: 8px;
        background: #fff;
        cursor: pointer;
        text-align: left;
        transition: border-color 160ms ease, box-shadow 160ms ease, opacity 160ms ease;
      }
      .sp-kpi:hover {
        border-color: #9aa6b8;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
      }
      .sp-kpi:focus-visible {
        outline: 2px solid #2563eb;
        outline-offset: 2px;
      }
      .sp-kpi--primary {
        border-color: #2563eb;
        box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.25);
      }
      .sp-kpi--off {
        opacity: 0.48;
      }
      .sp-kpi-top {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        width: 100%;
      }
      .sp-kpi-swatch {
        flex: 0 0 auto;
        width: 14px;
        height: 3px;
        border-radius: 2px;
      }
      .sp-kpi-name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 11px;
        font-weight: 600;
        color: #5c667a;
        letter-spacing: 0.02em;
      }
      .sp-kpi-val {
        font-family: var(--wv-mono, ui-monospace, monospace);
        font-size: 17px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: #1a1d24;
        letter-spacing: -0.02em;
        line-height: 1.15;
      }

      .sp-chart-wrap {
        position: relative;
        border: 1px solid var(--wv-content-line, #c5cad3);
        border-radius: 8px;
        background: #fff;
        padding: 8px 10px 10px;
      }
      .sp-chart-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 6px;
      }
      .sp-toggles {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .sp-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border: 1px solid #c5cad3;
        border-radius: 999px;
        background: #f4f6f9;
        font-size: 11px;
        font-weight: 500;
        color: #5c667a;
        cursor: pointer;
        transition: background 150ms ease, border-color 150ms ease, color 150ms ease;
      }
      .sp-chip:hover { border-color: #9aa6b8; }
      .sp-chip:focus-visible {
        outline: 2px solid #2563eb;
        outline-offset: 2px;
      }
      .sp-chip--on {
        background: #fff;
        color: #1a1d24;
        border-color: #9aa6b8;
      }
      .sp-chip-line {
        width: 14px;
        height: 0;
        border-top-width: 2px;
        border-top-style: solid;
      }
      .sp-tools {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
        font-size: 12px;
        color: #5c667a;
      }
      .sp-check {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        cursor: pointer;
        user-select: none;
      }
      .sp-check input { accent-color: #2563eb; }
      .sp-dump a {
        color: #2563eb;
        font-weight: 500;
      }
      .sp-chart {
        width: 100%;
        height: 300px;
      }
      .sp-tooltip {
        position: absolute;
        z-index: 5;
        pointer-events: none;
        padding: 6px 10px;
        border-radius: 6px;
        background: rgba(26, 29, 36, 0.92);
        color: #f0f2f6;
        font-size: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        white-space: nowrap;
      }
      .sp-tooltip strong { font-weight: 600; }
      .sp-tip-t { opacity: 0.75; margin-left: 4px; }
      .sp-empty {
        position: absolute;
        inset: 48px 16px 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 24px;
        color: #5c667a;
        font-size: 13px;
        background: linear-gradient(180deg, rgba(255,255,255,0.4), rgba(248,250,252,0.95));
        border-radius: 6px;
        pointer-events: none;
      }
      .sp-empty[hidden] { display: none; }
      .sp-empty code {
        font-family: var(--wv-mono, ui-monospace, monospace);
        font-size: 12px;
      }

      @media (max-width: 720px) {
        .sp-chart { height: 240px; }
      }

      /* Full-width action strip — no dead split with Latest values */
      .sp-events-panel {
        border: 1px solid var(--wv-content-line, #c5cad3);
        border-radius: 10px;
        background:
          linear-gradient(180deg, #fbfcfe 0%, #fff 48%);
        padding: 10px 12px 12px;
      }
      .sp-events-head {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 8px 12px;
        margin-bottom: 10px;
      }
      .sp-panel-title {
        font-size: 11px;
        font-weight: 650;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #5c667a;
        margin: 0;
      }
      .sp-panel-hint {
        font-size: 11px;
        font-weight: 400;
        color: #8b95a8;
      }
      .sp-panel-hint code {
        font-family: var(--wv-mono, ui-monospace, monospace);
        font-size: 10px;
        background: #e8ecf2;
        padding: 1px 5px;
        border-radius: 4px;
        color: #5c667a;
      }
      .sp-events {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
        gap: 8px;
        align-items: stretch;
      }
      .sp-events-empty {
        grid-column: 1 / -1;
        margin: 0;
        font-size: 12px;
        color: #8b95a8;
      }
      .sp-events-empty[hidden] { display: none; }
      .sp-event-btn {
        appearance: none;
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 44px;
        padding: 8px 12px;
        border: 1px solid #b8c0ce;
        border-radius: 9px;
        background:
          linear-gradient(180deg, #ffffff 0%, #f3f6fb 100%);
        box-shadow:
          0 1px 0 rgba(255, 255, 255, 0.9) inset,
          0 1px 2px rgba(26, 29, 36, 0.06);
        color: #1a1d24;
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: -0.01em;
        cursor: pointer;
        text-align: left;
        transition:
          background 160ms ease,
          border-color 160ms ease,
          box-shadow 160ms ease,
          transform 120ms ease;
      }
      .sp-event-icon {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        border-radius: 7px;
        background: rgba(37, 99, 235, 0.1);
        color: #2563eb;
      }
      .sp-event-label {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .sp-event-hint {
        flex: 0 0 auto;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #8b95a8;
      }
      .sp-event-btn:hover {
        border-color: #2563eb;
        background: linear-gradient(180deg, #ffffff 0%, #eef4ff 100%);
        box-shadow:
          0 1px 0 rgba(255, 255, 255, 0.95) inset,
          0 2px 8px rgba(37, 99, 235, 0.12);
      }
      .sp-event-btn:hover .sp-event-icon {
        background: rgba(37, 99, 235, 0.16);
      }
      .sp-event-btn:hover .sp-event-hint {
        color: #2563eb;
      }
      .sp-event-btn:focus-visible {
        outline: 2px solid #2563eb;
        outline-offset: 2px;
      }
      .sp-event-btn:active {
        transform: scale(0.98);
        box-shadow: 0 1px 0 rgba(255, 255, 255, 0.7) inset;
      }
      .sp-event-btn--sent {
        border-color: #0f7a4a;
        background: linear-gradient(180deg, #f0fdf6 0%, #dcfce8 100%);
        box-shadow: 0 0 0 1px rgba(15, 122, 74, 0.18);
      }
      .sp-event-btn--sent .sp-event-icon {
        background: rgba(15, 122, 74, 0.14);
        color: #0f7a4a;
      }
      .sp-event-btn--sent .sp-event-hint {
        color: #0f7a4a;
      }

      @media (prefers-reduced-motion: reduce) {
        .sp-kpi, .sp-chip, .sp-event-btn {
          transition: none;
        }
        .sp-event-btn:active {
          transform: none;
        }
      }
    `;
  };
})(moduleMethods, moduleSendDataFunc);
