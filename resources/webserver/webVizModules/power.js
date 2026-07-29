/*
 * power state and control
 * 2026-07: safe onData, safe sendData (#tab-power)
 */

(function(myMethods, sendData) {

  var powerInfoDiv = null;
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
      var el = document.getElementById( 'tab-power' );
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
      console.warn( 'power: sendData failed', e );
    }
  }

  myMethods.init = function(elem) {
    setHost( elem );
    $(elem).append('<div id="power-title">Power State info</div>');

    var setEnablePowerSave = $('<input class="powerButton" type="button" value="Enable Power Save"/>');
    var setDisablePowerSave = $('<input class="powerButton" type="button" value="Disable Power Save"/>');

    setEnablePowerSave.click( function(){
      safeSend({ 'enablePowerSave' : 'true' });
    });
    setEnablePowerSave.appendTo( elem );

    setDisablePowerSave.click( function(){
      safeSend({ 'enablePowerSave' : 'false' });
    });
    setDisablePowerSave.appendTo( elem );

    powerInfoDiv = $('<h3 id="powerInfo"></h3>').appendTo( elem );
  };

  myMethods.onData = function(data, elem) {
    if( elem ) { setHost( elem ); }
    if( !data || typeof data !== 'object' ) {
      return;
    }

    try {
      if( !powerInfoDiv || !powerInfoDiv.length ) {
        powerInfoDiv = $host().find( '#powerInfo' );
      }
      if( !powerInfoDiv.length ) { return; }

      powerInfoDiv.empty();
      powerInfoDiv.append('<div class="enabledTitle">' + "PowerSave Enabled: " + (data["powerSaveEnabled"] != null ? data["powerSaveEnabled"] : '') + '</div>');
      powerInfoDiv.append('<div class="requesterTitle">' + "PowerSave Requesters: " + (data["powerSaveRequesters"] != null ? data["powerSaveRequesters"] : '') + '</div>');
    } catch( e ) {
      console.warn( 'power: onData failed', e );
    }
  };

  myMethods.update = function(dt, elem) {
    if( elem ) { setHost( elem ); }
  };

  myMethods.getStyles = function() {
    return `
      #power-title {
        font-size:16px;
        margin-bottom:20px;
      }

      .enabledTitle {
        margin-bottom:10px;
      }

      .requesterTitle {
        margin-bottom:10px;
      }

      .powerButton {
        margin-bottom:20px;
        margin-right:10px;
      }
    `;
  };

})(moduleMethods, moduleSendDataFunc);
