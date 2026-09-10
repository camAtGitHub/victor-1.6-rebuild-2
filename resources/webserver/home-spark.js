/**
 * File: home-spark.js
 *
 * Description: Client SVG sparklines for Home PERF/ENGINE tables.
 * Samples are pushed only from existing poll handlers (no extra HTTP, no rAF).
 */
(function (global) {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var CAP = 90;
  var WIDTH = 120;
  var HEIGHT = 28;
  var PAD = 2;

  function reducedMotion() {
    try {
      return !!(global.matchMedia &&
        global.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e) {
      return false;
    }
  }

  function isFiniteNumber(n) {
    return typeof n === "number" && isFinite(n);
  }

  function formatNum(n) {
    if (!isFiniteNumber(n)) {
      return "—";
    }
    var a = Math.abs(n);
    if (a >= 1000) {
      return String(Math.round(n));
    }
    if (Number(n) === Math.round(n)) {
      return String(Math.round(n));
    }
    if (a >= 100) {
      return n.toFixed(1);
    }
    if (a >= 10) {
      return n.toFixed(2);
    }
    var s = n.toFixed(3);
    return s.replace(/\.?0+$/, "");
  }

  function yAt(value, dMin, dMax) {
    var span = dMax - dMin;
    var inner = HEIGHT - (PAD * 2);
    if (!(span > 0)) {
      return HEIGHT / 2;
    }
    var t = (value - dMin) / span;
    if (t < 0) {
      t = 0;
    } else if (t > 1) {
      t = 1;
    }
    return (HEIGHT - PAD) - (t * inner);
  }

  function el(name, attrs) {
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

  function Spark(host, item) {
    this.host = host;
    this.item = item;
    this.samples = [];
    this.baseMin = isFiniteNumber(item.graphMin) ? item.graphMin : 0;
    this.baseMax = isFiniteNumber(item.graphMax) ? item.graphMax : 1;
    if (this.baseMax < this.baseMin) {
      var swap = this.baseMin;
      this.baseMin = this.baseMax;
      this.baseMax = swap;
    }
    if (this.baseMax === this.baseMin) {
      this.baseMax = this.baseMin + 1;
    }
    this.root = null;
    this.svg = null;
    this.zeroLine = null;
    this.placeholder = null;
    this.line = null;
    this.dot = null;
    this.tickHigh = null;
    this.tickLow = null;
    this.tip = null;
    this._onShowTip = null;
    this._onHideTip = null;
    this._build();
    this.draw();
  }

  Spark.prototype._build = function () {
    var host = this.host;
    while (host.firstChild) {
      host.removeChild(host.firstChild);
    }

    var label = this.item.desc || "value";
    var root = document.createElement("button");
    root.type = "button";
    root.className = "home-spark";
    root.setAttribute("tabindex", "0");
    root.setAttribute("aria-label", label + ": no samples yet");

    var svg = el("svg", {
      class: "home-spark-svg",
      width: String(WIDTH),
      height: String(HEIGHT),
      viewBox: "0 0 " + WIDTH + " " + HEIGHT,
      "aria-hidden": "true",
      focusable: "false"
    });

    this.placeholder = el("line", {
      class: "home-spark-placeholder-line",
      x1: String(PAD),
      y1: String(HEIGHT / 2),
      x2: String(WIDTH - PAD),
      y2: String(HEIGHT / 2)
    });
    this.zeroLine = el("line", {
      class: "home-spark-zero",
      x1: String(PAD),
      x2: String(WIDTH - PAD),
      y1: "0",
      y2: "0",
      visibility: "hidden"
    });
    this.line = el("polyline", {
      class: "home-spark-line",
      fill: "none",
      points: ""
    });
    this.dot = el("circle", {
      class: "home-spark-dot",
      r: "1.75",
      cx: "0",
      cy: "0",
      visibility: "hidden"
    });
    this.tickHigh = el("polygon", {
      class: "home-spark-overflow-tick",
      points: (WIDTH - 7) + ",1 " + (WIDTH - 1) + ",1 " + (WIDTH - 4) + ",6",
      visibility: "hidden"
    });
    this.tickLow = el("polygon", {
      class: "home-spark-overflow-tick",
      points: (WIDTH - 7) + "," + (HEIGHT - 1) + " " + (WIDTH - 1) + "," +
        (HEIGHT - 1) + " " + (WIDTH - 4) + "," + (HEIGHT - 6),
      visibility: "hidden"
    });

    svg.appendChild(this.placeholder);
    svg.appendChild(this.zeroLine);
    svg.appendChild(this.line);
    svg.appendChild(this.dot);
    svg.appendChild(this.tickHigh);
    svg.appendChild(this.tickLow);

    var tip = document.createElement("span");
    tip.className = "home-spark-tip";
    tip.setAttribute("role", "tooltip");
    tip.textContent = "No samples yet";

    root.appendChild(svg);
    host.appendChild(root);
    document.body.appendChild(tip);

    var self = this;
    this._onShowTip = function () {
      self._placeTip();
    };
    this._onHideTip = function () {
      tip.classList.remove("is-open");
    };
    root.addEventListener("mouseenter", this._onShowTip);
    root.addEventListener("mouseleave", this._onHideTip);
    root.addEventListener("focus", this._onShowTip);
    root.addEventListener("blur", this._onHideTip);

    this.root = root;
    this.svg = svg;
    this.tip = tip;
  }

  Spark.prototype._placeTip = function () {
    if (!this.root || !this.tip) {
      return;
    }
    var r = this.root.getBoundingClientRect();
    var tip = this.tip;
    var top = r.bottom + 4;
    tip.style.left = Math.round(r.left) + "px";
    tip.style.top = Math.round(top) + "px";
    tip.classList.add("is-open");
    var h = tip.offsetHeight || 22;
    if ((top + h) > window.innerHeight) {
      tip.style.top = Math.round(r.top - h - 4) + "px";
    }
  };

  Spark.prototype._stats = function () {
    var samples = this.samples;
    var n = samples.length;
    if (n === 0) {
      return null;
    }
    var last = samples[n - 1];
    var sMin = last;
    var sMax = last;
    for (var i = 0; i < n; i++) {
      var v = samples[i];
      if (v < sMin) {
        sMin = v;
      }
      if (v > sMax) {
        sMax = v;
      }
    }
    var dMin = this.baseMin;
    var dMax = this.baseMax;
    var overflowHigh = sMax > this.baseMax;
    var overflowLow = sMin < this.baseMin;
    if (overflowLow) {
      dMin = sMin;
    }
    if (overflowHigh) {
      dMax = sMax;
    }
    if (dMax === dMin) {
      dMax = dMin + 1;
    }
    return {
      last: last,
      sMin: sMin,
      sMax: sMax,
      dMin: dMin,
      dMax: dMax,
      overflowHigh: overflowHigh,
      overflowLow: overflowLow,
      overflow: overflowHigh || overflowLow
    };
  };

  Spark.prototype.draw = function () {
    var stats = this._stats();
    var units = this.item.units ? String(this.item.units) : "";
    var label = this.item.desc || "value";

    if (!stats) {
      this.placeholder.setAttribute("visibility", "visible");
      this.line.setAttribute("points", "");
      this.line.setAttribute("visibility", "hidden");
      this.dot.setAttribute("visibility", "hidden");
      this.zeroLine.setAttribute("visibility", "hidden");
      this.tickHigh.setAttribute("visibility", "hidden");
      this.tickLow.setAttribute("visibility", "hidden");
      this.root.classList.remove("is-overflow");
      this.tip.textContent = "No samples yet";
      this.root.setAttribute("aria-label", label + ": no samples yet");
      return;
    }

    this.placeholder.setAttribute("visibility", "hidden");
    this.line.setAttribute("visibility", "visible");

    var n = this.samples.length;
    var innerW = WIDTH - (PAD * 2);
    var pts = [];
    var xLast = PAD;
    var yLast = yAt(stats.last, stats.dMin, stats.dMax);
    for (var i = 0; i < n; i++) {
      var x = (n === 1) ? (WIDTH - PAD) : (PAD + (innerW * (i / (n - 1))));
      var y = yAt(this.samples[i], stats.dMin, stats.dMax);
      pts.push(x.toFixed(2) + "," + y.toFixed(2));
      if (i === n - 1) {
        xLast = x;
        yLast = y;
      }
    }

    /* Poll-driven: replace polyline points in one shot (no rAF). Reduced
       motion also jumps; there is no path tween to disable. */
    if (reducedMotion()) {
      this.root.classList.add("home-spark--reduce");
    } else {
      this.root.classList.remove("home-spark--reduce");
    }
    this.line.setAttribute("points", pts.join(" "));

    this.dot.setAttribute("cx", xLast.toFixed(2));
    this.dot.setAttribute("cy", yLast.toFixed(2));
    this.dot.setAttribute("visibility", "visible");

    if (stats.dMin < 0 && stats.dMax > 0) {
      var y0 = yAt(0, stats.dMin, stats.dMax);
      this.zeroLine.setAttribute("y1", y0.toFixed(2));
      this.zeroLine.setAttribute("y2", y0.toFixed(2));
      this.zeroLine.setAttribute("visibility", "visible");
    } else {
      this.zeroLine.setAttribute("visibility", "hidden");
    }

    this.tickHigh.setAttribute("visibility", stats.overflowHigh ? "visible" : "hidden");
    this.tickLow.setAttribute("visibility", stats.overflowLow ? "visible" : "hidden");
    if (stats.overflow) {
      this.root.classList.add("is-overflow");
    } else {
      this.root.classList.remove("is-overflow");
    }

    var unitBit = units ? (" " + units) : "";
    var tip = "last " + formatNum(stats.last) + unitBit +
      "  min " + formatNum(stats.sMin) +
      "  max " + formatNum(stats.sMax);
    if (stats.overflow) {
      tip += "  (overflow)";
    }
    this.tip.textContent = tip;
    this.root.setAttribute("aria-label", label + ": " + tip);
  };

  Spark.prototype.push = function (value) {
    var n = (typeof value === "number") ? value : parseFloat(value);
    if (!isFiniteNumber(n)) {
      return;
    }
    this.samples.push(n);
    if (this.samples.length > CAP) {
      this.samples.splice(0, this.samples.length - CAP);
    }
    this.draw();
  };

  function mount(item, host) {
    if (!item || !item.hasGraph || !host) {
      return null;
    }
    if (item._spark && item._spark.host === host) {
      return item._spark;
    }
    item._spark = new Spark(host, item);
    return item._spark;
  }

  function mountAll(items, idPrefix) {
    if (!items) {
      return;
    }
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!item || !item.hasGraph) {
        continue;
      }
      mount(item, document.getElementById(idPrefix + i));
    }
  }

  function push(item, host, value) {
    if (!item || !item.hasGraph) {
      return;
    }
    var spark = item._spark;
    if (!spark) {
      spark = mount(item, host);
    }
    if (spark) {
      spark.push(value);
    }
  }

  global.HomeSpark = {
    CAP: CAP,
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    mount: mount,
    mountAll: mountAll,
    push: push
  };
})(window);
