/**
 * File: home-catalog.js
 *
 * Description: Explainer catalog for Home PERF/ENGINE table rows, keyed by
 * the engineItems/perfItems `desc` string. Rows without an entry stay
 * undecorated. `?` control matches consolevars (title + click popover).
 */
(function (global) {
  "use strict";

  var CATALOG = {
    "CPU freq": {
      blurb: "Application-processor clock from sysfs. Typical 400000–1267200 kHz (powersave vs turbo)."
    },
    "Temperature": {
      blurb: "SoC temperature in Celsius. Typical 40–80 °C sitting; backpack CPU-hot overlay uses 90 °C."
    },
    "Uptime": {
      blurb: "Seconds since this process’s host booted. Grows without bound; not a load metric."
    },
    "Idle time": {
      blurb: "Aggregate CPU idle seconds from /proc/stat. Compare with uptime, not used as a percentage."
    },
    "Real time clock": {
      blurb: "Wall-clock timestamp from the robot. Not a sparkline; format is the host RTC string."
    },
    "Memory Claimed": {
      blurb: "Total minus free RAM (kB). Vector userspace budget is ~428 MB (graph scale 438388 kB)."
    },
    "Memory Used": {
      blurb: "Total minus available RAM (kB), including reclaimable cache. Typical 150000–350000 kB under load."
    },
    "Overall CPU": {
      blurb: "All-core used fraction of /proc/stat since the last poll. Typical 10–60 %; 0–100 % scale."
    },
    "CPU0": {
      blurb: "Core 0 used fraction since the last poll. Typical 10–80 %; 0–100 % scale."
    },
    "CPU1": {
      blurb: "Core 1 used fraction since the last poll. Typical 10–80 %; 0–100 % scale."
    },
    "CPU2": {
      blurb: "Core 2 used fraction since the last poll. Typical 10–80 %; 0–100 % scale."
    },
    "CPU3": {
      blurb: "Core 3 used fraction since the last poll. Typical 10–80 %; 0–100 % scale."
    },

    "Battery (filtered)": {
      blurb: "Low-pass battery voltage from BatteryComponent. Typical 3.6–4.2 V; cutoff near 3.5 V, full ~4.2 V."
    },
    "Battery (raw)": {
      blurb: "Instantaneous pack voltage. Typical 3.6–4.2 V; noisier than the filtered reading."
    },
    "Charger (raw)": {
      blurb: "Charger-contact voltage. ~0 V off the contacts; ~5 V when docked on the base."
    },
    "Battery level": {
      blurb: "Discrete pack state: Unknown, Low, Nominal, or Full (clad BatteryLevel)."
    },
    "Battery temp": {
      blurb: "Pack temperature in Celsius. Typical 15–40 °C; charger-cooldown overheat lights use 41 °C."
    },
    "Battery charging": {
      blurb: "True while the pack is taking current. Often true together with on-charger-contacts."
    },
    "On charger contacts": {
      blurb: "True when rear contacts are electrically on the dock. False on the platform but not seated."
    },
    "On charger platform": {
      blurb: "True when cliff/pose logic thinks the robot is on the charger platform, seated or not."
    },
    "Fully charged time": {
      blurb: "Seconds spent at BatteryLevel Full this session. 0 if not full."
    },
    "Low battery time": {
      blurb: "Seconds spent at BatteryLevel Low this session. 0 if not low."
    },
    "Off treads state": {
      blurb: "Support pose: OnTreads, InAir, OnBack, OnLeftSide, OnRightSide, OnFace, or Falling."
    },
    "Pose angle": {
      blurb: "Yaw of the robot pose in degrees. Typical −180 to 180; 0 is the current localization origin."
    },
    "Pose pitch": {
      blurb: "Pitch in degrees. Near 0 on treads; large when climbing the charger or tipped."
    },
    "Head angle": {
      blurb: "Head motor angle in degrees. Mechanical range about −22 (down) to +45 (up)."
    },
    "Lift height": {
      blurb: "Lift fork height in mm. ~32 mm down, 76 mm high dock, 92 mm carry."
    },
    "Left wheel speed": {
      blurb: "Left tread speed in mm/s. Typical −220 to 220; sign is forward/back."
    },
    "Right wheel speed": {
      blurb: "Right tread speed in mm/s. Typical −220 to 220; sign is forward/back."
    },
    "Accel X": {
      blurb: "Body accelerometer X (forward) in mm/s². Gravity is ~9800 on Z when sitting level."
    },
    "Accel Y": {
      blurb: "Body accelerometer Y (left) in mm/s². Near 0 on treads; ±9800 if lying on a side."
    },
    "Accel Z": {
      blurb: "Body accelerometer Z (up) in mm/s². ~9800 sitting; near 0 in free fall."
    },
    "Gyro X": {
      blurb: "Body gyro X in rad/s. Near 0 at rest; spikes while turning or being held."
    },
    "Gyro Y": {
      blurb: "Body gyro Y in rad/s. Near 0 at rest; responds to pitch rate."
    },
    "Gyro Z": {
      blurb: "Body gyro Z (yaw rate) in rad/s. Typical ±1 while turning in place; graph ±6."
    },
    "Backpack touch sensor": {
      blurb: "Raw capacitive backpack reading. Untouched often <200; pressed climbs into the thousands (scale 0–5000)."
    },
    "Cliff sensor 0 (FL)": {
      blurb: "Front-left IR reflectance 0–1024. Table ~200–800; drop-off <~40; habitat white ≥~350–400."
    },
    "Cliff sensor 1 (FR)": {
      blurb: "Front-right IR reflectance 0–1024. Table ~200–800; drop-off <~40; habitat white ≥~350–400."
    },
    "Cliff sensor 2 (BL)": {
      blurb: "Back-left IR reflectance 0–1024. Table ~200–800; drop-off <~40; habitat white ≥~350–400."
    },
    "Cliff sensor 3 (BR)": {
      blurb: "Back-right IR reflectance 0–1024. Table ~200–800; drop-off <~40; habitat white ≥~350–400."
    },
    "Cliff sensor reads white": {
      blurb: "Four 0/1 flags (FL FR BL BR) for habitat-white detection. 1 means that cliff is over the white line."
    },
    "Prox latest data timestamp": {
      blurb: "ToF sample time in robot ms. Stalls if the lift sensor is not updating."
    },
    "Prox distance": {
      blurb: "Forward ToF distance in mm from the lift. Useful ~30–300 mm; graph 0–1000; ignore unless RANGE_VALID."
    },
    "Prox signal intensity": {
      blurb: "Return-signal strength (Mcps). Typical 0–30; low values often come with SIGNAL_FAIL."
    },
    "Prox ambient intensity": {
      blurb: "Ambient IR when the emitter is off. Typical 0–0.5; high ambient can cause SIGMA_FAIL."
    },
    "Prox SPAD count": {
      blurb: "Effective SPADs used for the ToF sample. Typical up to 196."
    },
    "Prox range status": {
      blurb: "VL53 status string: RANGE_VALID, SIGMA_FAIL, SIGNAL_FAIL, PHASE_FAIL, HARDWARE_FAIL, or NO_UPDATE."
    },
    "Carrying object ID": {
      blurb: "Observable-object id currently in the lift, or −1 if empty."
    },
    "Carrying object on top ID": {
      blurb: "Id of a cube stacked on the carried object, or −1 if none."
    },
    "Head tracking object ID": {
      blurb: "Id the head tracker is locked to, or −1 if not tracking."
    },
    "Localized to object ID": {
      blurb: "Id of the object used for localization, or −1 if not locked to one."
    },
    "Status flags": {
      blurb: "RobotStatusFlag bitfield as hex 0xXXXXXXXX. Set bits are also listed as named pills beside the value."
    },
    "Mic recent direction": {
      blurb: "Latest Signal Essence direction 0–11 (30° clock, 0 = 12 o’clock / forward); 12 = unknown."
    },
    "Mic selected direction": {
      blurb: "Held/selected mic direction 0–11 (same clock as recent); 12 = unknown."
    }
  };

  var openPop = null;

  function entryFor(desc) {
    if (!desc) {
      return null;
    }
    return CATALOG[desc] || null;
  }

  function closePopovers() {
    if (openPop) {
      openPop.setAttribute("hidden", "");
      var btn = openPop._helpBtn;
      if (btn) {
        btn.setAttribute("aria-expanded", "false");
      }
      openPop = null;
    }
  }

  function placePopover(btn, pop) {
    var r = btn.getBoundingClientRect();
    pop.style.position = "fixed";
    pop.style.right = "auto";
    var top = r.bottom + 4;
    var left = r.right - 280;
    if (left < 8) {
      left = 8;
    }
    pop.style.left = Math.round(left) + "px";
    pop.style.top = Math.round(top) + "px";
    var h = pop.offsetHeight || 48;
    if ((top + h) > window.innerHeight) {
      pop.style.top = Math.round(r.top - h - 4) + "px";
    }
  }

  function togglePopover(btn, pop) {
    var willOpen = pop.hasAttribute("hidden");
    closePopovers();
    if (willOpen) {
      pop.removeAttribute("hidden");
      btn.setAttribute("aria-expanded", "true");
      pop._helpBtn = btn;
      openPop = pop;
      placePopover(btn, pop);
    }
  }

  function decorateItems(items) {
    if (!items) {
      return;
    }
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!item || !item.desc) {
        continue;
      }
      var meta = entryFor(item.desc);
      if (!meta || !meta.blurb) {
        continue;
      }
      var row = document.querySelector(
        "tr.home-data-row[data-desc=\"" + item.desc.replace(/"/g, "") + "\"]"
      );
      if (!row || row.querySelector(".home-help")) {
        continue;
      }
      var cell = row.querySelector(".home-desc-cell");
      if (!cell) {
        continue;
      }
      var marks = document.createElement("span");
      marks.className = "home-help-marks";

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "home-help";
      btn.setAttribute("aria-label", "About " + item.desc);
      btn.setAttribute("aria-expanded", "false");
      btn.textContent = "?";
      btn.title = meta.blurb;

      var pop = document.createElement("div");
      pop.className = "home-help-pop";
      pop.setAttribute("hidden", "");
      pop.setAttribute("role", "tooltip");
      var p = document.createElement("p");
      p.className = "home-help-blurb";
      p.textContent = meta.blurb;
      pop.appendChild(p);

      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        togglePopover(this.btn, this.pop);
      }.bind({ btn: btn, pop: pop }));

      marks.appendChild(btn);
      marks.appendChild(pop);
      cell.appendChild(marks);
    }
  }

  function decorate(perf, engine) {
    decorateItems(perf);
    decorateItems(engine);
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t) {
      return;
    }
    if (t.closest && (t.closest(".home-help") || t.closest(".home-help-pop"))) {
      return;
    }
    closePopovers();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closePopovers();
    }
  });

  global.HomeCatalog = {
    CATALOG: CATALOG,
    entryFor: entryFor,
    decorate: decorate,
    decorateItems: decorateItems,
    closePopovers: closePopovers
  };
})(window);
