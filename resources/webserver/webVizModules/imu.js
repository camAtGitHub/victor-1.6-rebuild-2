/*
 * imu information tracking tab
 * 2026-07: safe onData (#tab-imu); fixed shared var name collision with touch
 */

(function(myMethods, sendData) {

  var imuInfoDiv = null;
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
      var el = document.getElementById( 'tab-imu' );
      if( el ) { return $(el); }
    } catch( e ) {}
    return $();
  }

  myMethods.init = function(elem) {
    setHost( elem );
    $(elem).append('<div id="imu-title">IMU</div>');
    // Was accidentally named touchInfoDiv (global leak across modules)
    imuInfoDiv = $('<h3 id="imuInfo"></h3>').appendTo( elem );
  };

  myMethods.onData = function(data, elem) {
    if( elem ) { setHost( elem ); }
    if( !data || typeof data !== 'object' ) {
      return;
    }

    try {
      if( !imuInfoDiv || !imuInfoDiv.length ) {
        imuInfoDiv = $host().find( '#imuInfo' );
      }
      if( !imuInfoDiv.length ) { return; }

      imuInfoDiv.empty();
      imuInfoDiv.append('<div class="countTitle">' + "Fall Impact Count: " + (data["fall_impact_count"] != null ? data["fall_impact_count"] : '') + '</div>');
    } catch( e ) {
      console.warn( 'imu: onData failed', e );
    }
  };

  myMethods.update = function(dt, elem) {
    if( elem ) { setHost( elem ); }
  };

  myMethods.getStyles = function() {
    return `
      #imu-title {
        font-size:16px;
        margin-bottom:20px;
      }

      .countTitle {
        margin-bottom:10px;
      }
    `;
  };

})(moduleMethods, moduleSendDataFunc);
