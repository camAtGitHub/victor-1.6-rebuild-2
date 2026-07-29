/*
 * alexa state
 * 2026-07: safe onData guard (#tab-alexa)
 */

(function(myMethods, sendData) {

  var authState;
  var uxState;
  var hostElem = null;

  function setHost( el ) {
    if( !el ) { return; }
    if( el.jquery ) {
      hostElem = el[0] || hostElem;
    } else if( el.nodeType ) {
      hostElem = el;
    }
  }

  myMethods.init = function(elem) {
    setHost( elem );
    authState = $('<div></div>').appendTo(elem);
    uxState = $('<div></div>').appendTo(elem);
  };

  function SetAuthState(state) {
    if( authState && authState.length ) {
      authState.html('<span class="label">Auth State: </span> ' + $('<div/>').text(String(state)).html());
    }
  }

  function SetUXState(state) {
    if( uxState && uxState.length ) {
      uxState.html('<span class="label">UX State: </span> ' + $('<div/>').text(String(state)).html());
    }
  }

  myMethods.onData = function(data, elem) {
    if( elem ) { setHost( elem ); }
    if( !data || typeof data !== 'object' ) {
      return;
    }
    try {
      if( typeof data["authState"] !== 'undefined' ) {
        SetAuthState(data["authState"]);
      }
      if( typeof data["uxState"] !== 'undefined' ) {
        SetUXState(data["uxState"]);
      }
    } catch( e ) {
      console.warn( 'alexa: onData failed', e );
    }
  };

  myMethods.update = function(dt, elem) {
    if( elem ) { setHost( elem ); }
  };

  myMethods.getStyles = function() {
    return `
      .label {
        font-weight: bold;
      }
    `;
  };

})(moduleMethods, moduleSendDataFunc);
