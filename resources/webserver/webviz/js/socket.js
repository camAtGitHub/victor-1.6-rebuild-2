/**
 * WebViz WebSocket client — reconnect, resubscribe, safe parse.
 * Protocol (unchanged from stock):
 *   → { type: "subscribe"|"unsubscribe"|"data", module, data? }
 *   ← { module, data }
 */
(function (global) {
  "use strict";

  function WebVizSocket(options) {
    this._url = options.url || defaultUrl();
    this._onStatus = options.onStatus || function () {};
    this._onMessage = options.onMessage || function () {};
    this._onError = options.onError || function () {};
    this._socket = null;
    this._wanted = Object.create(null); // moduleKey → true
    this._reconnectAttempt = 0;
    this._reconnectTimer = null;
    this._closedByUser = false;
    this._cfg = global.WebVizConfig || {};
  }

  function defaultUrl() {
    var loc = window.location;
    var proto = loc.protocol === "https:" ? "wss:" : "ws:";
    // file:// has no host suitable for robot WS — caller should override
    if (!loc.host || loc.protocol === "file:") {
      return "ws://127.0.0.1:8888/socket";
    }
    return proto + "//" + loc.host + "/socket";
  }

  WebVizSocket.prototype.connect = function () {
    var self = this;
    this._closedByUser = false;
    this._clearReconnect();

    if (this._socket) {
      try {
        this._socket.onopen = null;
        this._socket.onclose = null;
        this._socket.onerror = null;
        this._socket.onmessage = null;
        this._socket.close();
      } catch (e) {
        /* ignore */
      }
      this._socket = null;
    }

    this._onStatus("connecting");

    var ws;
    try {
      ws = new WebSocket(this._url);
    } catch (err) {
      this._onError(err);
      this._onStatus("error");
      this._scheduleReconnect();
      return;
    }

    this._socket = ws;

    ws.onopen = function () {
      self._reconnectAttempt = 0;
      self._onStatus("live");
      // Resubscribe everything the UI still wants
      Object.keys(self._wanted).forEach(function (mod) {
        self._sendRaw({ type: "subscribe", module: mod });
      });
    };

    ws.onmessage = function (ev) {
      var jsonData;
      try {
        jsonData = JSON.parse(ev.data);
      } catch (err) {
        self._onError(new Error("Bad JSON from robot: " + String(err.message || err)));
        return;
      }
      var moduleName = jsonData && jsonData.module;
      if (typeof moduleName !== "string") {
        return;
      }
      self._onMessage(moduleName.toLowerCase(), jsonData.data);
    };

    ws.onclose = function () {
      self._socket = null;
      if (self._closedByUser) {
        self._onStatus("dead");
        return;
      }
      self._onStatus("dead");
      self._scheduleReconnect();
    };

    ws.onerror = function () {
      // onclose will fire; avoid double reconnect
      self._onStatus("error");
    };
  };

  WebVizSocket.prototype.disconnect = function () {
    this._closedByUser = true;
    this._clearReconnect();
    if (this._socket) {
      try {
        this._socket.close();
      } catch (e) {
        /* ignore */
      }
      this._socket = null;
    }
    this._onStatus("dead");
  };

  WebVizSocket.prototype.setUrl = function (url) {
    this._url = url;
  };

  WebVizSocket.prototype.isOpen = function () {
    return this._socket && this._socket.readyState === WebSocket.OPEN;
  };

  WebVizSocket.prototype.subscribe = function (moduleName) {
    var key = String(moduleName).toLowerCase();
    this._wanted[key] = true;
    if (this.isOpen()) {
      this._sendRaw({ type: "subscribe", module: key });
    }
  };

  WebVizSocket.prototype.unsubscribe = function (moduleName) {
    var key = String(moduleName).toLowerCase();
    delete this._wanted[key];
    if (this.isOpen()) {
      this._sendRaw({ type: "unsubscribe", module: key });
    }
  };

  WebVizSocket.prototype.sendData = function (moduleName, data) {
    this._sendRaw({
      type: "data",
      module: String(moduleName).toLowerCase(),
      data: data,
    });
  };

  WebVizSocket.prototype._sendRaw = function (payload) {
    if (!this.isOpen()) {
      return false;
    }
    try {
      this._socket.send(JSON.stringify(payload));
      return true;
    } catch (err) {
      this._onError(err);
      return false;
    }
  };

  WebVizSocket.prototype._scheduleReconnect = function () {
    var self = this;
    if (this._closedByUser) {
      return;
    }
    this._clearReconnect();
    var base = this._cfg.RECONNECT_MS || 1500;
    var max = this._cfg.MAX_RECONNECT_MS || 12000;
    var attempt = this._reconnectAttempt++;
    var delay = Math.min(max, base * Math.pow(1.5, attempt));
    this._onStatus("connecting");
    this._reconnectTimer = setTimeout(function () {
      self.connect();
    }, delay);
  };

  WebVizSocket.prototype._clearReconnect = function () {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  };

  global.WebVizSocket = WebVizSocket;
})(window);
