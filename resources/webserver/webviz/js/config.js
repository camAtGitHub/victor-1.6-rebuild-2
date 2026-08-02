/**
 * WebViz module registry.
 *
 * Keys become tab / subscribe names (case-insensitive on the wire).
 * Paths are relative to resources/webserver/ (same origin as webViz.html).
 *
 * Engine process (:8888) and Anim process (:8889) expose different sets —
 * the shell picks by window.location.port (overridable via ?port= / UI).
 */
(function (global) {
  "use strict";

  var MODULES_ENGINE = {
    SoundReactions: "webVizModules/micDataEngine.js",
    Behaviors: "webVizModules/behaviors.js",
    Intents: "webVizModules/intents.js",
    CloudIntents: "webVizModules/cloud.js",
    BehaviorConds: "webVizModules/behaviorConditions.js",
    VisionScheduleMediator: "webVizModules/visionScheduleMediator.js",
    ObservedObjects: "webVizModules/observedObjects.js",
    Mood: "webVizModules/mood.js",
    Cpu: "webVizModules/cpu.js",
    CpuProfile: "webVizModules/cpuprofile.js",
    NavMap: "webVizModules/navMap.js",
    Cubes: "webVizModules/cubes.js",
    Habitat: "webVizModules/habitat.js",
    HeldInPalm: "webVizModules/heldInPalm.js",
    Touch: "webVizModules/touch.js",
    Power: "webVizModules/power.js",
    AnimationEngine: "webVizModules/animationEngine.js",
    Sleeping: "webVizModules/sleeping.js",
    BeatDetector: "webVizModules/beatDetector.js",
    IMU: "webVizModules/imu.js",
    Features: "webVizModules/features.js",
  };

  var MODULES_ANIM = {
    MicData: "webVizModules/micData.js",
    Alexa: "webVizModules/alexa.js",
    Animations: "webVizModules/animations.js",
    AudioEvents: "webVizModules/audioEvents.js",
    CpuProfile: "webVizModules/cpuprofile.js",
    SpeechRecognizerSys: "webVizModules/speechRecognizerSys.js",
  };

  /** Optional grouping for the sidebar (display only). */
  var GROUPS_ENGINE = [
    {
      id: "ai",
      label: "Behavior & AI",
      keys: ["Behaviors", "BehaviorConds", "Intents", "CloudIntents", "Features", "Sleeping"],
    },
    {
      id: "sense",
      label: "Perception",
      keys: [
        "VisionScheduleMediator",
        "ObservedObjects",
        "NavMap",
        "Mood",
        "SoundReactions",
        "BeatDetector",
      ],
    },
    {
      id: "body",
      label: "Body & cubes",
      keys: ["Cubes", "Touch", "Habitat", "HeldInPalm", "Power", "IMU"],
    },
    {
      id: "sys",
      label: "System",
      keys: ["Cpu", "CpuProfile", "AnimationEngine"],
    },
  ];

  var GROUPS_ANIM = [
    {
      id: "audio",
      label: "Audio & speech",
      keys: ["MicData", "AudioEvents", "SpeechRecognizerSys", "Alexa", "Animations"],
    },
    {
      id: "sys",
      label: "System",
      keys: ["CpuProfile"],
    },
  ];

  var DESCRIPTIONS = {
    overview: "Connection status, module index, and how WebViz works",
    Behaviors: "Behavior stack / tree timeline (engine freeplay spine)",
    BehaviorConds: "BEI activation conditions & factors",
    Intents: "User intents pending / inject",
    CloudIntents: "Cloud intent stream",
    Mood: "Emotion graph & simple mood controls",
    NavMap: "Memory map visualization",
    ObservedObjects: "Vision-observed objects",
    VisionScheduleMediator: "Vision schedule",
    Cubes: "Cube connection coordinator",
    Cpu: "Process CPU / thermal",
    CpuProfile: "CPU profiler hooks",
    Features: "Active feature flags",
    SoundReactions: "Mic directionality (engine)",
    MicData: "Mic data (anim)",
    Animations: "Animation playback",
    AnimationEngine: "Animation engine events",
    AudioEvents: "Audio event stream",
    SpeechRecognizerSys: "Wake-word / recognizer",
    Alexa: "Alexa integration",
    BeatDetector: "Beat detector",
    Touch: "Capacitive touch",
    Habitat: "Habitat / cliff",
    HeldInPalm: "Held-in-palm status",
    Power: "Battery / power",
    IMU: "IMU samples",
    Sleeping: "Sleep cycle",
  };

  function portFromLocation() {
    var q = parseQuery(window.location.search);
    if (q.port) {
      return sanitizePort(q.port, "8888");
    }
    var p = String(window.location.port || "");
    if (p === "8889" || p === "8888" || p === "8887") {
      return p;
    }
    // file:// or odd host → default engine for module list
    return "8888";
  }

  function parseQuery(queryString) {
    var query = {};
    if (!queryString) {
      return query;
    }
    var s = queryString[0] === "?" ? queryString.slice(1) : queryString;
    if (!s) {
      return query;
    }
    // Accidental second "?" (…&port=8888?theme=6) must become "&" or port/wsUrl break.
    s = s.replace(/\?/g, "&");
    s.split("&").forEach(function (part) {
      if (!part) {
        return;
      }
      var eq = part.indexOf("=");
      var kRaw = eq >= 0 ? part.slice(0, eq) : part;
      var vRaw = eq >= 0 ? part.slice(eq + 1) : "";
      var k = "";
      var v = "";
      try {
        k = decodeURIComponent(kRaw || "");
        v = decodeURIComponent(vRaw || "");
      } catch (e) {
        k = kRaw || "";
        v = vRaw || "";
      }
      if (k) {
        query[k] = v;
      }
    });
    return query;
  }

  /** Engine/anim ports are 4-digit; strip junk like "8888?theme=6" → "8888". */
  function sanitizePort(port, fallback) {
    var m = String(port == null ? "" : port).match(/^\d{2,5}/);
    if (m) {
      return m[0];
    }
    return fallback != null ? String(fallback) : "8888";
  }

  function profileForPort(port) {
    port = sanitizePort(port, "8888");
    if (port === "8889") {
      return {
        port: "8889",
        id: "anim",
        label: "Anim",
        processTitle: "vic-anim",
        modules: MODULES_ANIM,
        groups: GROUPS_ANIM,
        otherPort: "8888",
        otherLabel: "Engine",
      };
    }
    // 8888 engine, 8887 standalone, or unknown → engine module set
    return {
      port: port === "8887" ? "8887" : "8888",
      id: "engine",
      label: "Engine",
      processTitle: port === "8887" ? "standalone / webserver" : "vic-engine",
      modules: MODULES_ENGINE,
      groups: GROUPS_ENGINE,
      otherPort: "8889",
      otherLabel: "Anim",
    };
  }

  function siblingUrl(port) {
    var loc = window.location;
    var path = loc.pathname || "/webViz.html";
    return "http://" + loc.hostname + ":" + port + path;
  }

  /** localStorage keys for remote robot feed (page on dev PC, data from robot). */
  var LS_FEED_HOST = "webviz.feedHost";
  var LS_FEED_PORT = "webviz.feedPort";

  /**
   * Normalize a robot address from console / UI / query.
   * Accepts: "192.168.1.5", "192.168.1.5:8888", "http://192.168.1.5:8888/", "ws://…"
   * Returns { host, port } or null.
   */
  function parseFeedTarget(input, defaultPort) {
    if (input == null) {
      return null;
    }
    var s = String(input).trim();
    if (!s) {
      return null;
    }
    // Strip scheme
    s = s.replace(/^(https?|wss?):\/\//i, "");
    // Strip path/query
    s = s.split("/")[0];
    if (!s) {
      return null;
    }
    var host = s;
    var port = defaultPort != null ? String(defaultPort) : null;
    // IPv6 in brackets [::1]:8888
    var m6 = s.match(/^\[([^\]]+)\](?::(\d+))?$/);
    if (m6) {
      host = m6[1];
      if (m6[2]) {
        port = m6[2];
      }
    } else if (s.indexOf(":") >= 0) {
      // host:port (last colon — fine for IPv4 / hostname)
      var idx = s.lastIndexOf(":");
      var maybePort = s.slice(idx + 1);
      if (/^\d+$/.test(maybePort)) {
        host = s.slice(0, idx);
        port = maybePort;
      }
    }
    if (!host) {
      return null;
    }
    return { host: host, port: port };
  }

  function readStoredFeedHost() {
    try {
      return localStorage.getItem(LS_FEED_HOST) || "";
    } catch (e) {
      return "";
    }
  }

  function readStoredFeedPort() {
    try {
      return localStorage.getItem(LS_FEED_PORT) || "";
    } catch (e) {
      return "";
    }
  }

  function writeStoredFeed(host, port) {
    try {
      if (host) {
        localStorage.setItem(LS_FEED_HOST, host);
      } else {
        localStorage.removeItem(LS_FEED_HOST);
      }
      if (port) {
        localStorage.setItem(LS_FEED_PORT, String(port));
      } else {
        localStorage.removeItem(LS_FEED_PORT);
      }
    } catch (e) {
      /* private mode */
    }
  }

  /**
   * Resolve where the WebSocket should point.
   * Priority: explicit override → ?host= / ?robot= → localStorage → page host.
   * Returns { host, port, mode: "remote"|"local", wsUrl }.
   */
  function resolveFeed(overrides) {
    overrides = overrides || {};
    var q = parseQuery(window.location.search);
    var host =
      overrides.host != null
        ? String(overrides.host).trim()
        : q.host || q.robot || readStoredFeedHost() || "";
    // Empty / "local" / "this" means use the page origin as feed
    if (!host || host === "local" || host === "this" || host === ".") {
      host = "";
    }

    var port =
      overrides.port != null && overrides.port !== ""
        ? String(overrides.port)
        : q.port || (host ? readStoredFeedPort() : "") || portFromLocation();

    port = sanitizePort(port, "8888");

    var loc = window.location;
    var pageHost = loc.hostname || "127.0.0.1";
    var feedHost = host || pageHost;
    var mode = host ? "remote" : "local";

    // Prefer ws on http page; wss only if page is https (mixed content rules)
    var proto = loc.protocol === "https:" ? "wss:" : "ws:";
    var wsUrl = proto + "//" + feedHost + ":" + port + "/socket";

    return {
      host: feedHost,
      port: String(port),
      remoteHost: host || null,
      mode: mode,
      wsUrl: wsUrl,
    };
  }

  /**
   * True when the WebSocket *feed* targets this process port.
   * Prefer this over location.port — page may be on a dev static server
   * while data comes from robot :8888 / :8889.
   */
  function isFeedPort(port) {
    var f = resolveFeed();
    return String(f.port) === String(port);
  }

  global.WebVizConfig = {
    MODULES_ENGINE: MODULES_ENGINE,
    MODULES_ANIM: MODULES_ANIM,
    DESCRIPTIONS: DESCRIPTIONS,
    UPDATE_PERIOD_MS: 200,
    RECONNECT_MS: 1500,
    MAX_RECONNECT_MS: 12000,
    LS_FEED_HOST: LS_FEED_HOST,
    LS_FEED_PORT: LS_FEED_PORT,
    portFromLocation: portFromLocation,
    parseQuery: parseQuery,
    sanitizePort: sanitizePort,
    profileForPort: profileForPort,
    siblingUrl: siblingUrl,
    parseFeedTarget: parseFeedTarget,
    readStoredFeedHost: readStoredFeedHost,
    readStoredFeedPort: readStoredFeedPort,
    writeStoredFeed: writeStoredFeed,
    resolveFeed: resolveFeed,
    isFeedPort: isFeedPort,
  };
})(window);
