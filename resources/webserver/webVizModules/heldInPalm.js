/*
 * Held-In-Palm "trust"-level tracking
 * 2026-07: safe onData guard (#tab-heldinpalm)
 * Note: display body was empty upstream; left as stub with null guards only.
 */

(function(myMethods, sendData) {

  myMethods.init = function(elem) {
    $(elem).append('<div id="heldinpalm-title">Held-In-Palm Status</div>');
  };

  myMethods.onData = function(data, elem) {
    // The engine has sent a new json blob.
    if( data == null || typeof data !== 'object' ) {
      return;
    }
    // Upstream module never rendered fields; keep no-op safe.
  };

  myMethods.update = function(dt, elem) {
  };

  myMethods.getStyles = function() {
    return `
      #heldinpalm-title {
        font-size:16px;
        margin-bottom:20px;
      }
    `;
  };

})(moduleMethods, moduleSendDataFunc);
