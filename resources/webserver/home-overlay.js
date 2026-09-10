/**
 * File: home-overlay.js
 *
 * Description: ENGINE-page extras painted from existing engineItems values
 * (no extra HTTP): RobotStatusFlag pills, mic clock labels, and the SVG
 * robot overlay. Overlay photo is sideways — backpack/rear LEFT, lift/front
 * RIGHT — so mic 0 (12 o'clock / forward) points toward the lift.
 *
 * Coordinate assumptions (viewBox 1000×710 = 2048×1454 photo × 1000/2048):
 *   Robot opaque bbox ≈ (117,109)–(883,598). Compass center (500,355).
 *   dir k at k×30° from +x (screen-right), clockwise in SVG y-down.
 *   Cliffs: FL (640,190) FR (640,520) BL (230,190) BR (230,520)
 *     (robot-left = screen-up; FL/FR on fork/right, BL/BR on backpack/left).
 *   Touch: gold LED bar ellipse (245,358) rx=70 ry=28.
 *   Prox beam: lift front, from x≈800 toward +x.
 *   Charger contacts: backpack rear cap around (150,355).
 */
(function (global) {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";

  var STATUS_FLAGS = [
    { bit: 0x00000001, name: "IS_MOVING", tone: "" },
    { bit: 0x00000002, name: "IS_CARRYING_BLOCK", tone: "" },
    { bit: 0x00000004, name: "IS_PICKING_OR_PLACING", tone: "" },
    { bit: 0x00000008, name: "IS_PICKED_UP", tone: "warn" },
    { bit: 0x00000010, name: "IS_BUTTON_PRESSED", tone: "" },
    { bit: 0x00000020, name: "IS_FALLING", tone: "bad" },
    { bit: 0x00000040, name: "IS_ANIMATING", tone: "" },
    { bit: 0x00000080, name: "IS_PATHING", tone: "" },
    { bit: 0x00000100, name: "LIFT_IN_POS", tone: "good" },
    { bit: 0x00000200, name: "HEAD_IN_POS", tone: "good" },
    { bit: 0x00000400, name: "CALM_POWER_MODE", tone: "warn" },
    { bit: 0x00000800, name: "IS_BATTERY_DISCONNECTED", tone: "bad" },
    { bit: 0x00001000, name: "IS_ON_CHARGER", tone: "good" },
    { bit: 0x00002000, name: "IS_CHARGING", tone: "good" },
    { bit: 0x00004000, name: "CLIFF_DETECTED", tone: "bad" },
    { bit: 0x00008000, name: "ARE_WHEELS_MOVING", tone: "" },
    { bit: 0x00010000, name: "IS_BEING_HELD", tone: "warn" },
    { bit: 0x00020000, name: "IS_MOTION_DETECTED", tone: "" },
    { bit: 0x00040000, name: "IS_BATTERY_OVERHEATED", tone: "bad" },
    { bit: 0x00100000, name: "ENCODERS_DISABLED", tone: "warn" },
    { bit: 0x00200000, name: "ENCODER_HEAD_INVALID", tone: "warn" },
    { bit: 0x00400000, name: "ENCODER_LIFT_INVALID", tone: "warn" },
    { bit: 0x01000000, name: "IS_BATTERY_LOW", tone: "warn" },
    { bit: 0x02000000, name: "IS_SHUTDOWN_IMMINENT", tone: "bad" }
  ];

  var OVERLAY_BY_DESC = {
    "Cliff sensor 0 (FL)": "cliff-fl",
    "Cliff sensor 1 (FR)": "cliff-fr",
    "Cliff sensor 2 (BL)": "cliff-bl",
    "Cliff sensor 3 (BR)": "cliff-br",
    "Cliff sensor reads white": "cliff-white",
    "Mic recent direction": "mic",
    "Mic selected direction": "mic",
    "Backpack touch sensor": "touch",
    "Prox latest data timestamp": "prox",
    "Prox distance": "prox",
    "Prox signal intensity": "prox",
    "Prox ambient intensity": "prox",
    "Prox SPAD count": "prox",
    "Prox range status": "prox",
    "Battery (filtered)": "charger",
    "Battery (raw)": "charger",
    "Charger (raw)": "charger",
    "Battery level": "charger",
    "Battery temp": "charger",
    "Battery charging": "charger",
    "On charger contacts": "charger",
    "On charger platform": "charger",
    "Fully charged time": "charger",
    "Low battery time": "charger"
  };

  var CLIFF_DESCS = [
    "Cliff sensor 0 (FL)",
    "Cliff sensor 1 (FR)",
    "Cliff sensor 2 (BL)",
    "Cliff sensor 3 (BR)"
  ];
  var CLIFF_KEYS = ["cliff-fl", "cliff-fr", "cliff-bl", "cliff-br"];
  var CLIFF_LABELS = ["FL", "FR", "BL", "BR"];

  var CX = 500;
  var CY = 355;
  var COMPASS_R = 96;

  var selectedKey = "";
  var inited = false;

  function cssVar(name, fallback) {
    try {
      var s = getComputedStyle(document.documentElement).getPropertyValue(name);
      s = (s || "").trim();
      return s || fallback;
    } catch (e) {
      return fallback;
    }
  }

  function colors() {
    return {
      accent: cssVar("--wv-accent", "#5b9fd4"),
      good: cssVar("--wv-good", "#3ecf8e"),
      warn: cssVar("--wv-warn", "#e6b450"),
      bad: cssVar("--wv-bad", "#f07178"),
      text: cssVar("--wv-text", "#e8edf5"),
      faint: cssVar("--wv-text-faint", "#5c667a"),
      line: cssVar("--wv-line", "#2a3344")
    };
  }

  function engineItems() {
    return global.engineItems || [];
  }

  function itemByDesc(desc) {
    var items = engineItems();
    for (var i = 0; i < items.length; i++) {
      if (items[i] && items[i].desc === desc) {
        return items[i];
      }
    }
    return null;
  }

  function valOf(desc) {
    var it = itemByDesc(desc);
    return it && it.val != null ? String(it.val) : "";
  }

  function parseHexStatus(text) {
    if (!text) {
      return NaN;
    }
    var s = String(text).trim();
    if (!s) {
      return NaN;
    }
    return parseInt(s, 16);
  }

  function parseMicDir(text) {
    var n = parseInt(text, 10);
    if (!isFinite(n)) {
      return 12;
    }
    return n;
  }

  function micClockLabel(dir) {
    if (dir === 12 || dir < 0 || dir > 12) {
      return "unknown";
    }
    if (dir === 0) {
      return "12 o'clock / forward";
    }
    return dir + " o'clock";
  }

  function parseWhiteFlags(text) {
    var out = [false, false, false, false];
    if (!text) {
      return out;
    }
    var parts = String(text).trim().split(/\s+/);
    for (var i = 0; i < 4 && i < parts.length; i++) {
      var p = parts[i].toLowerCase();
      out[i] = p === "1" || p === "true" || p === "yes";
    }
    return out;
  }

  function isTruthyFlag(text) {
    var p = String(text || "").trim().toLowerCase();
    return p === "true" || p === "1" || p === "yes";
  }

  function parseNum(text) {
    var n = parseFloat(text);
    return isFinite(n) ? n : NaN;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function setText(id, text) {
    var el = $(id);
    if (el) {
      el.textContent = text;
    }
  }

  function svgEl(name, attrs) {
    var node = document.createElementNS(NS, name);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) {
          node.setAttribute(k, attrs[k]);
        }
      }
    }
    return node;
  }

  function wedgePath(cx, cy, r, dir, halfDeg) {
    var a0 = ((dir * 30) - halfDeg) * Math.PI / 180;
    var a1 = ((dir * 30) + halfDeg) * Math.PI / 180;
    var x0 = cx + r * Math.cos(a0);
    var y0 = cy + r * Math.sin(a0);
    var x1 = cx + r * Math.cos(a1);
    var y1 = cy + r * Math.sin(a1);
    return "M " + cx.toFixed(1) + " " + cy.toFixed(1) +
      " L " + x0.toFixed(1) + " " + y0.toFixed(1) +
      " A " + r + " " + r + " 0 0 1 " +
      x1.toFixed(1) + " " + y1.toFixed(1) + " Z";
  }

  function dirPoint(cx, cy, r, dir) {
    var a = dir * 30 * Math.PI / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }

  function cliffFill(raw, white) {
    var c = colors();
    if (white) {
      return c.warn;
    }
    if (!isFinite(raw)) {
      return c.faint;
    }
    if (raw < 40) {
      return c.bad;
    }
    if (raw >= 400) {
      return c.accent;
    }
    return c.good;
  }

  function updateStatusPills() {
    var item = itemByDesc("Status flags");
    if (!item) {
      return;
    }
    var extra = $("id_engine_row_extra_" + engineItems().indexOf(item));
    if (!extra) {
      return;
    }
    var bits = parseHexStatus(item.val);
    extra.className = "home-val-extra flag-pills";
    while (extra.firstChild) {
      extra.removeChild(extra.firstChild);
    }
    if (!isFinite(bits) || bits === 0) {
      if (isFinite(bits) && bits === 0) {
        var none = document.createElement("span");
        none.className = "flag-pill flag-pill-none";
        none.textContent = "(none set)";
        extra.appendChild(none);
      }
      return;
    }
    for (var i = 0; i < STATUS_FLAGS.length; i++) {
      var f = STATUS_FLAGS[i];
      if ((bits & f.bit) === 0) {
        continue;
      }
      var pill = document.createElement("span");
      pill.className = "flag-pill" + (f.tone ? " is-" + f.tone : "");
      pill.textContent = f.name;
      pill.title = f.name + " (0x" + f.bit.toString(16).toUpperCase() + ")";
      extra.appendChild(pill);
    }
  }

  function updateMicLabels() {
    var items = engineItems();
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!item) {
        continue;
      }
      if (item.desc !== "Mic recent direction" &&
          item.desc !== "Mic selected direction") {
        continue;
      }
      var extra = $("id_engine_row_extra_" + i);
      if (!extra) {
        continue;
      }
      extra.className = "home-val-extra mic-clock-label";
      var dir = parseMicDir(item.val);
      extra.textContent = " · " + micClockLabel(dir);
    }
  }

  function markRowsForKey(key) {
    var rows = document.querySelectorAll("#engine_table tr.home-data-row");
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var match = key && row.getAttribute("data-overlay") === key;
      if (match) {
        row.classList.add("is-selected");
      } else {
        row.classList.remove("is-selected");
      }
    }
    var spots = document.querySelectorAll(".engine-overlay-svg [data-overlay]");
    for (var s = 0; s < spots.length; s++) {
      var g = spots[s];
      var ok = key && hotspotMatches(g.getAttribute("data-overlay"), key);
      if (ok) {
        g.classList.add("is-selected");
        g.setAttribute("aria-pressed", "true");
      } else {
        g.classList.remove("is-selected");
        g.setAttribute("aria-pressed", "false");
      }
    }
  }

  function hotspotMatches(spotKey, selKey) {
    if (!selKey) {
      return false;
    }
    if (spotKey === selKey) {
      return true;
    }
    if (selKey === "cliff-white") {
      return CLIFF_KEYS.indexOf(spotKey) >= 0;
    }
    return false;
  }

  function captionFor(key) {
    if (!key) {
      return "Nothing selected — click a table row or a hotspot. Clear deselects.";
    }
    if (key === "cliff-white") {
      return "Cliff white-detect (FL FR BL BR): " + (valOf("Cliff sensor reads white") || "—");
    }
    if (key.indexOf("cliff-") === 0) {
      var idx = CLIFF_KEYS.indexOf(key);
      var desc = CLIFF_DESCS[idx];
      var white = parseWhiteFlags(valOf("Cliff sensor reads white"));
      var w = white[idx] ? " white" : "";
      return "Cliff " + CLIFF_LABELS[idx] + ": " + (valOf(desc) || "—") + w;
    }
    if (key === "mic") {
      var rec = parseMicDir(valOf("Mic recent direction"));
      var sel = parseMicDir(valOf("Mic selected direction"));
      return "Mic recent " + rec + " (" + micClockLabel(rec) + "), selected " +
        sel + " (" + micClockLabel(sel) + ")";
    }
    if (key === "touch") {
      return "Backpack touch: " + (valOf("Backpack touch sensor") || "—");
    }
    if (key === "prox") {
      return "Prox " + (valOf("Prox distance") || "—") + " mm  " +
        (valOf("Prox range status") || "");
    }
    if (key === "charger") {
      var bits = [];
      bits.push("batt " + (valOf("Battery (filtered)") || "—") + " V");
      bits.push("chg " + (valOf("Charger (raw)") || "—") + " V");
      if (isTruthyFlag(valOf("On charger contacts"))) {
        bits.push("on contacts");
      }
      if (isTruthyFlag(valOf("Battery charging"))) {
        bits.push("charging");
      }
      return "Charger: " + bits.join(" · ");
    }
    return key;
  }

  function selectKey(key) {
    selectedKey = key || "";
    markRowsForKey(selectedKey);
    setText("engine_overlay_caption", captionFor(selectedKey));
    if (selectedKey && global.HomeCatalog && HomeCatalog.closePopovers) {
      /* keep help popovers from covering the overlay caption */
    }
  }

  function clearSelection() {
    selectKey("");
  }

  function paintCliffs() {
    var white = parseWhiteFlags(valOf("Cliff sensor reads white"));
    for (var i = 0; i < 4; i++) {
      var raw = parseNum(valOf(CLIFF_DESCS[i]));
      var shape = $("overlay-shape-" + CLIFF_KEYS[i]);
      var label = $("overlay-val-" + CLIFF_KEYS[i]);
      var g = $("hotspot-" + CLIFF_KEYS[i]);
      if (shape) {
        shape.setAttribute("fill", cliffFill(raw, white[i]));
        var op = 0.35;
        if (isFinite(raw)) {
          if (raw < 40) {
            op = 0.7;
          } else if (white[i]) {
            op = 0.65;
          } else {
            op = 0.4 + Math.min(0.35, raw / 2048);
          }
        }
        shape.setAttribute("fill-opacity", String(op));
      }
      if (g) {
        if (white[i]) {
          g.classList.add("is-white");
        } else {
          g.classList.remove("is-white");
        }
        if (isFinite(raw) && raw < 40) {
          g.classList.add("is-cliff");
        } else {
          g.classList.remove("is-cliff");
        }
      }
      if (label) {
        var txt = isFinite(raw) ? String(Math.round(raw)) : "—";
        if (white[i]) {
          txt += " W";
        }
        label.textContent = txt;
      }
    }
  }

  function paintMic() {
    var recent = parseMicDir(valOf("Mic recent direction"));
    var selected = parseMicDir(valOf("Mic selected direction"));
    var wedge = $("overlay-mic-wedge");
    var selLine = $("overlay-mic-selected");
    var unk = $("overlay-mic-unknown");
    var label = $("overlay-val-mic");
    var knownRecent = recent >= 0 && recent <= 11;
    var knownSel = selected >= 0 && selected <= 11;

    if (wedge) {
      if (knownRecent) {
        wedge.setAttribute("d", wedgePath(CX, CY, COMPASS_R, recent, 15));
        wedge.setAttribute("visibility", "visible");
      } else {
        wedge.setAttribute("visibility", "hidden");
      }
    }
    if (selLine) {
      if (knownSel) {
        var p = dirPoint(CX, CY, COMPASS_R - 4, selected);
        selLine.setAttribute("x2", p[0].toFixed(1));
        selLine.setAttribute("y2", p[1].toFixed(1));
        selLine.setAttribute("visibility", "visible");
      } else {
        selLine.setAttribute("visibility", "hidden");
      }
    }
    if (unk) {
      if (!knownRecent) {
        unk.setAttribute("visibility", "visible");
      } else {
        unk.setAttribute("visibility", "hidden");
      }
    }
    if (label) {
      if (knownRecent) {
        label.textContent = recent + " · " + micClockLabel(recent);
      } else {
        label.textContent = "unknown";
      }
    }
  }

  function paintTouch() {
    var raw = parseNum(valOf("Backpack touch sensor"));
    var shape = $("overlay-shape-touch");
    var label = $("overlay-val-touch");
    var g = $("hotspot-touch");
    var c = colors();
    var pressed = isFinite(raw) && raw >= 400;
    if (shape) {
      shape.setAttribute("fill", pressed ? c.warn : c.accent);
      var op = 0.25;
      if (isFinite(raw)) {
        op = 0.2 + Math.min(0.6, Math.max(0, raw) / 5000);
      }
      shape.setAttribute("fill-opacity", String(op));
    }
    if (g) {
      if (pressed) {
        g.classList.add("is-active");
      } else {
        g.classList.remove("is-active");
      }
    }
    if (label) {
      label.textContent = isFinite(raw) ? String(Math.round(raw)) : "—";
    }
  }

  function paintProx() {
    var dist = parseNum(valOf("Prox distance"));
    var status = valOf("Prox range status") || "";
    var valid = /RANGE_VALID/i.test(status);
    var beam = $("overlay-shape-prox");
    var label = $("overlay-val-prox");
    var g = $("hotspot-prox");
    var c = colors();
    if (beam) {
      var len = 40;
      if (isFinite(dist)) {
        /* closer object → longer/more opaque beam toward +x (lift) */
        var t = 1 - Math.min(1, Math.max(0, dist) / 400);
        len = 40 + t * 140;
      }
      var x0 = 800;
      var y0 = 355;
      var x1 = x0 + len;
      var half = 10 + len * 0.08;
      var d = "M " + x0 + " " + (y0 - 8) +
        " L " + x1.toFixed(1) + " " + (y0 - half).toFixed(1) +
        " L " + x1.toFixed(1) + " " + (y0 + half).toFixed(1) +
        " L " + x0 + " " + (y0 + 8) + " Z";
      beam.setAttribute("d", d);
      beam.setAttribute("fill", valid ? c.good : c.faint);
      beam.setAttribute("fill-opacity", valid ? "0.45" : "0.22");
    }
    if (g) {
      if (valid && isFinite(dist) && dist < 120) {
        g.classList.add("is-active");
      } else {
        g.classList.remove("is-active");
      }
    }
    if (label) {
      var txt = isFinite(dist) ? Math.round(dist) + " mm" : "—";
      if (status) {
        txt += " " + status;
      }
      label.textContent = txt;
    }
  }

  function paintCharger() {
    var onC = isTruthyFlag(valOf("On charger contacts"));
    var charging = isTruthyFlag(valOf("Battery charging"));
    var batt = parseNum(valOf("Battery (filtered)"));
    var shape = $("overlay-shape-charger");
    var label = $("overlay-val-charger");
    var g = $("hotspot-charger");
    var c = colors();
    if (shape) {
      var fill = c.faint;
      var op = 0.25;
      if (charging) {
        fill = c.good;
        op = 0.55;
      } else if (onC) {
        fill = c.accent;
        op = 0.45;
      }
      shape.setAttribute("fill", fill);
      shape.setAttribute("fill-opacity", String(op));
    }
    if (g) {
      if (onC || charging) {
        g.classList.add("is-active");
      } else {
        g.classList.remove("is-active");
      }
    }
    if (label) {
      var parts = [];
      if (isFinite(batt)) {
        parts.push(batt.toFixed(2) + " V");
      }
      if (charging) {
        parts.push("charging");
      } else if (onC) {
        parts.push("contacts");
      } else {
        parts.push("off");
      }
      label.textContent = parts.join(" · ");
    }
  }

  function paint() {
    if (!inited) {
      return;
    }
    paintCliffs();
    paintMic();
    paintTouch();
    paintProx();
    paintCharger();
    setText("engine_overlay_caption", captionFor(selectedKey));
    markRowsForKey(selectedKey);
  }

  function onPoll() {
    updateStatusPills();
    updateMicLabels();
    paint();
  }

  function rowClicked(ev) {
    var t = ev.target;
    if (t && t.closest && (t.closest(".home-help") || t.closest(".home-help-pop"))) {
      return;
    }
    var tr = t && t.closest ? t.closest("#engine_table tr.home-data-row") : null;
    if (!tr) {
      return;
    }
    var key = tr.getAttribute("data-overlay") || "";
    if (key) {
      selectKey(key);
    }
  }

  function rowFocused(ev) {
    var t = ev.target;
    if (t && t.classList && t.classList.contains("home-help")) {
      return;
    }
    var tr = t && t.closest ? t.closest("#engine_table tr.home-data-row") : null;
    if (!tr) {
      return;
    }
    var key = tr.getAttribute("data-overlay") || "";
    if (key) {
      selectKey(key);
    }
  }

  function hotspotActivate(ev) {
    var g = ev.currentTarget;
    var key = g.getAttribute("data-overlay") || "";
    if (!key) {
      return;
    }
    selectKey(key);
    var row = document.querySelector(
      "#engine_table tr.home-data-row[data-overlay=\"" + key + "\"]"
    );
    if (row && typeof row.scrollIntoView === "function") {
      row.scrollIntoView({ block: "nearest" });
    }
  }

  function hotspotKey(ev) {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      hotspotActivate(ev);
    }
  }

  function stampRows() {
    var items = engineItems();
    var table = $("engine_table");
    if (!table) {
      return;
    }
    var rows = table.querySelectorAll("tr.home-data-row");
    for (var i = 0; i < items.length && i < rows.length; i++) {
      var desc = items[i].desc;
      var key = OVERLAY_BY_DESC[desc] || "";
      rows[i].setAttribute("data-desc", desc);
      if (key) {
        rows[i].setAttribute("data-overlay", key);
        rows[i].setAttribute("tabindex", "0");
      }
    }
  }

  function buildCompassTicks(parent) {
    for (var d = 0; d < 12; d++) {
      var p0 = dirPoint(CX, CY, COMPASS_R - 6, d);
      var p1 = dirPoint(CX, CY, COMPASS_R + 2, d);
      parent.appendChild(svgEl("line", {
        x1: p0[0].toFixed(1),
        y1: p0[1].toFixed(1),
        x2: p1[0].toFixed(1),
        y2: p1[1].toFixed(1),
        "class": "overlay-tick" + (d === 0 ? " is-forward" : "")
      }));
    }
  }

  function makeHotspot(id, overlayKey, aria, children) {
    var g = svgEl("g", {
      id: id,
      "class": "overlay-hotspot",
      "data-overlay": overlayKey,
      tabindex: "0",
      focusable: "true",
      role: "button",
      "aria-label": aria,
      "aria-pressed": "false"
    });
    for (var i = 0; i < children.length; i++) {
      g.appendChild(children[i]);
    }
    g.addEventListener("click", hotspotActivate);
    g.addEventListener("keydown", hotspotKey);
    g.addEventListener("focus", hotspotActivate);
    return g;
  }

  function fillSvg(svg) {
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    var compass = makeHotspot("hotspot-mic", "mic", "Mic direction compass", []);
    compass.appendChild(svgEl("circle", {
      cx: String(CX),
      cy: String(CY),
      r: String(COMPASS_R),
      "class": "overlay-compass-face"
    }));
    buildCompassTicks(compass);
    compass.appendChild(svgEl("path", {
      id: "overlay-mic-wedge",
      "class": "overlay-mic-wedge",
      d: "",
      visibility: "hidden"
    }));
    compass.appendChild(svgEl("line", {
      id: "overlay-mic-selected",
      "class": "overlay-mic-selected",
      x1: String(CX),
      y1: String(CY),
      x2: String(CX),
      y2: String(CY),
      visibility: "hidden"
    }));
    compass.appendChild(svgEl("text", {
      id: "overlay-mic-unknown",
      x: String(CX),
      y: String(CY + 4),
      "class": "overlay-unknown-label",
      "text-anchor": "middle",
      visibility: "hidden"
    })).textContent = "unknown";
    compass.appendChild(svgEl("text", {
      id: "overlay-val-mic",
      x: String(CX),
      y: String(CY + COMPASS_R + 18),
      "class": "overlay-val",
      "text-anchor": "middle"
    })).textContent = "mic";
    svg.appendChild(compass);

    var cliffs = [
      { key: "cliff-fl", cx: 640, cy: 190, aria: "Cliff FL" },
      { key: "cliff-fr", cx: 640, cy: 520, aria: "Cliff FR" },
      { key: "cliff-bl", cx: 230, cy: 190, aria: "Cliff BL" },
      { key: "cliff-br", cx: 230, cy: 520, aria: "Cliff BR" }
    ];
    for (var i = 0; i < cliffs.length; i++) {
      var cl = cliffs[i];
      var shape = svgEl("circle", {
        id: "overlay-shape-" + cl.key,
        "class": "hotspot-shape",
        cx: String(cl.cx),
        cy: String(cl.cy),
        r: "28"
      });
      var val = svgEl("text", {
        id: "overlay-val-" + cl.key,
        x: String(cl.cx),
        y: String(cl.cy + 44),
        "class": "overlay-val",
        "text-anchor": "middle"
      });
      val.textContent = CLIFF_LABELS[i];
      svg.appendChild(makeHotspot(
        "hotspot-" + cl.key,
        cl.key,
        cl.aria,
        [shape, val]
      ));
    }

    var touchShape = svgEl("ellipse", {
      id: "overlay-shape-touch",
      "class": "hotspot-shape",
      cx: "245",
      cy: "358",
      rx: "70",
      ry: "28"
    });
    var touchVal = svgEl("text", {
      id: "overlay-val-touch",
      x: "245",
      y: "400",
      "class": "overlay-val",
      "text-anchor": "middle"
    });
    touchVal.textContent = "touch";
    svg.appendChild(makeHotspot(
      "hotspot-touch",
      "touch",
      "Backpack touch",
      [touchShape, touchVal]
    ));

    var chgShape = svgEl("rect", {
      id: "overlay-shape-charger",
      "class": "hotspot-shape",
      x: "118",
      y: "292",
      width: "52",
      height: "126",
      rx: "18"
    });
    var chgVal = svgEl("text", {
      id: "overlay-val-charger",
      x: "144",
      y: "440",
      "class": "overlay-val",
      "text-anchor": "middle"
    });
    chgVal.textContent = "charger";
    svg.appendChild(makeHotspot(
      "hotspot-charger",
      "charger",
      "Charger contacts",
      [chgShape, chgVal]
    ));

    var proxShape = svgEl("path", {
      id: "overlay-shape-prox",
      "class": "hotspot-shape overlay-prox-beam",
      d: "M 800 347 L 880 335 L 880 375 L 800 363 Z"
    });
    var proxVal = svgEl("text", {
      id: "overlay-val-prox",
      x: "890",
      y: "348",
      "class": "overlay-val",
      "text-anchor": "start"
    });
    proxVal.textContent = "prox";
    svg.appendChild(makeHotspot(
      "hotspot-prox",
      "prox",
      "Prox beam",
      [proxShape, proxVal]
    ));
  }

  function init() {
    var panel = $("engine_overlay_panel");
    var svg = $("engine_overlay_svg");
    if (!panel || !svg) {
      return;
    }
    stampRows();
    fillSvg(svg);

    var table = $("engine_table");
    if (table) {
      table.addEventListener("click", rowClicked);
      table.addEventListener("focusin", rowFocused);
    }
    var clearBtn = $("engine_overlay_clear");
    if (clearBtn) {
      clearBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        clearSelection();
      });
    }
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") {
        return;
      }
      var page = $("page_engine");
      if (page && page.style && page.style.display === "none") {
        return;
      }
      clearSelection();
    });
    inited = true;
    onPoll();
  }

  global.HomeOverlay = {
    init: init,
    onPoll: onPoll,
    paint: paint,
    selectKey: selectKey,
    clearSelection: clearSelection,
    micClockLabel: micClockLabel,
    OVERLAY_BY_DESC: OVERLAY_BY_DESC,
    STATUS_FLAGS: STATUS_FLAGS
  };
})(window);
