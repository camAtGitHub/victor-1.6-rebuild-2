/*
 * touch state and control system
 * 2026-07: safe onData, safe sendData (#tab-touch)
 */

(function(myMethods, sendData) {

  var touchInfoDiv = null;
  var hostElem = null;

  function setHost( el ) {
    if( !el ) { return; }
    if( el.jquery ) {
      hostElem = el[0] || hostElem;
    } else if( el.nodeType ) {
      hostElem = el;
    }
  }

  function $host() {
    if( hostElem ) { return $(hostElem); }
    try {
      var el = document.getElementById( 'tab-touch' );
      if( el ) { return $(el); }
    } catch( e ) {}
    return $();
  }

  function safeSend( payload ) {
    try {
      if( typeof sendData === 'function' ) {
        sendData( payload );
      }
    } catch( e ) {
      console.warn( 'touch: sendData failed', e );
    }
  }

  myMethods.init = function(elem) {
    setHost( elem );
    $(elem).append('<div id="touch-title">Touch Sensor</div>');

    var setDisableTouchSensor = $('<input class="touchButton" type="button" value="Disable touch sensor"/>');
    var setEnableTouchSensor = $('<input class="touchButton" type="button" value="Enable touch sensor"/>');
    var resetTouchCount = $('<input class="touchButton" type="button" value="Reset touch count"/>');

    setDisableTouchSensor.click( function(){
      safeSend({ 'enabled' : 'false' });
    });
    setDisableTouchSensor.appendTo( elem );

    setEnableTouchSensor.click( function(){
      safeSend({ 'enabled' : 'true' });
    });
    setEnableTouchSensor.appendTo( elem );

    resetTouchCount.click( function(){
      safeSend({ 'resetCount' : 'true' });
    });
    resetTouchCount.appendTo( elem );

    touchInfoDiv = $('<h3 id="touchInfo"></h3>').appendTo( elem );
  };

  myMethods.onData = function(data, elem) {
    if( elem ) { setHost( elem ); }
    if( !data || typeof data !== 'object' ) {
      return;
    }

    try {
      if( !touchInfoDiv || !touchInfoDiv.length ) {
        touchInfoDiv = $host().find( '#touchInfo' );
      }
      if( !touchInfoDiv.length ) { return; }

      touchInfoDiv.empty();
      touchInfoDiv.append('<div class="esnTitle">' + "ESN: " + (data["esn"] != null ? data["esn"] : '') + '</div>');
      touchInfoDiv.append('<div class="osVersionTitle">' + "OS: " + (data["osVersion"] != null ? data["osVersion"] : '') + '</div>');
      touchInfoDiv.append('<div class="modeTitle">' + "enabled: " + (data["enabled"] != null ? data["enabled"] : '') + '</div>');
      touchInfoDiv.append('<div class="countTitle">' + "count: " + (data["count"] != null ? data["count"] : '') + '</div>');
      touchInfoDiv.append('<div class="countTitle">' + "calibrated: " + (data["calibrated"] != null ? data["calibrated"] : '') + '</div>');
    } catch( e ) {
      console.warn( 'touch: onData failed', e );
    }
  };

  myMethods.update = function(dt, elem) {
    if( elem ) { setHost( elem ); }
  };

  myMethods.getStyles = function() {
    return `
      #touch-title {
        font-size:16px;
        margin-bottom:20px;
      }

      .touchButton {
        margin-bottom:20px;
        margin-right:10px;
      }

      .esnTitle {
        margin-bottom:10px;
      }

      .osVersionTitle {
        margin-bottom:10px;
      }

      .modeTitle {
        margin-bottom:10px;
      }

      .countTitle {
        margin-bottom:10px;
      }
    `;
  };

})(moduleMethods, moduleSendDataFunc);
