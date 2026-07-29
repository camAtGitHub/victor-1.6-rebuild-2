/*
 * habitat state and control system
 * 2026-07: safe onData, safe sendData (#tab-habitat)
 */

(function(myMethods, sendData) {

  var habitatInfoDiv = null;
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
      var el = document.getElementById( 'tab-habitat' );
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
      console.warn( 'habitat: sendData failed', e );
    }
  }

  myMethods.init = function(elem) {
    setHost( elem );
    $(elem).append('<div id="habitat-title">Habitat Detection Info</div>');

    var setStateToUnknownButton = $('<input class="habitatButton" type="button" value="Set to Unknown"/>');
    var setStateToNotInHabitatButton = $('<input class="habitatButton" type="button" value="Set to NotInHabitat"/>');
    var setStateToInHabitatButton = $('<input class="habitatButton" type="button" value="Set to InHabitat"/>');

    setStateToUnknownButton.click( function(){
      safeSend({ 'forceHabitatState' : 'Unknown' });
    });
    setStateToUnknownButton.appendTo( elem );

    setStateToNotInHabitatButton.click( function(){
      safeSend({ 'forceHabitatState' : 'NotInHabitat' });
    });
    setStateToNotInHabitatButton.appendTo( elem );

    setStateToInHabitatButton.click( function(){
      safeSend({ 'forceHabitatState' : 'InHabitat' });
    });
    setStateToInHabitatButton.appendTo( elem );

    habitatInfoDiv = $('<h3 id="habitatInfo"></h3>').appendTo( elem );
  };

  myMethods.onData = function(data, elem) {
    if( elem ) { setHost( elem ); }
    if( !data || typeof data !== 'object' ) {
      return;
    }

    try {
      if( !habitatInfoDiv || !habitatInfoDiv.length ) {
        habitatInfoDiv = $host().find( '#habitatInfo' );
      }
      if( !habitatInfoDiv.length ) { return; }

      habitatInfoDiv.empty();
      habitatInfoDiv.append('<div class="detectionTitle">' + "Detection state: " + (data["habitatState"] != null ? data["habitatState"] : '') + '</div>');
      habitatInfoDiv.append('<div class="stopOnWhiteEnabled">' + "Stop-On-White enabled: " + (data["stopOnWhiteEnabled"] != null ? data["stopOnWhiteEnabled"] : '') + '</div>');
      habitatInfoDiv.append('<div class="reasonTitle">' + "Reason: " + (data["reason"] != null ? data["reason"] : '') + '</div>');
      habitatInfoDiv.append('<div class="whiteThresholdTitle">' + "White Thresholds: " + (data["whiteThresholds"] != null ? data["whiteThresholds"] : '') + '</div>');
    } catch( e ) {
      console.warn( 'habitat: onData failed', e );
    }
  };

  myMethods.update = function(dt, elem) {
    if( elem ) { setHost( elem ); }
  };

  myMethods.getStyles = function() {
    return `
      #habitat-title {
        font-size:16px;
        margin-bottom:20px;
      }

      .detectionTitle {
        margin-bottom:10px;
      }

      .reasonTitle {
        margin-bottom:10px;
      }

      .whiteThresholdTitle {
        margin-bottom:10px;
      }

      .habitatButton {
        margin-bottom:20px;
        margin-right:10px;
      }
    `;
  };

})(moduleMethods, moduleSendDataFunc);
