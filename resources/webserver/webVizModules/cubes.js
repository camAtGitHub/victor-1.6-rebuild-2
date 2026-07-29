/*
 * Cube connection information (i.e. are we connected to
 * a cube? Which one? Which ones do we know about?)
 * 2026-07: shell host scoping, safe onData, safe sendData (#tab-cubes)
 */

(function(myMethods, sendData) {

  var hostElem = null;
  var cubeInfoDiv = null;
  var cccInfoDiv = null;
  var citInfoDiv = null;

  function $host() {
    if( hostElem ) {
      return $(hostElem);
    }
    try {
      var el = document.getElementById( 'tab-cubes' );
      if( el ) { return $(el); }
    } catch( e ) {}
    return $();
  }

  function setHost( el ) {
    if( !el ) { return; }
    if( el.jquery ) {
      hostElem = el[0] || hostElem;
    } else if( el.nodeType ) {
      hostElem = el;
    }
  }

  function safeSend( payload ) {
    try {
      if( typeof sendData === 'function' ) {
        sendData( payload );
      }
    } catch( e ) {
      console.warn( 'cubes: sendData failed', e );
    }
  }

  function flashCubeLights() {
    safeSend({ 'flashCubeLights' : true });
  }

  function connectCube() {
    safeSend({ 'connectCube' : true });
  }

  function disconnectCube() {
    safeSend({ 'disconnectCube' : true });
  }

  function forgetPreferredCube() {
    safeSend({ 'forgetPreferredCube' : true });
  }

  function setInteractableSubscription(subscribe) {
    safeSend({ 'subscribeInteractable' : subscribe });
  }

  function setTempInteractableSubscription() {
    safeSend({ 'subscribeTempInteractable' : true });
  }

  function setBackgroundSubscription(subscribe) {
    safeSend({ 'subscribeBackground' : subscribe });
  }

  function setTempBackgroundSubscription() {
    safeSend({ 'subscribeTempBackground' : true });
  }

  function safeNum( val, digits ) {
    var n = parseFloat( val );
    if( !isFinite( n ) ) { return ''; }
    if( typeof digits === 'number' ) {
      return n.toFixed( digits );
    }
    return String( n );
  }

  myMethods.init = function(elem) {
    setHost( elem );

    $(elem).append('<div id="cubes-title">Cube connection info</div>');

    var flashCubesButton = $('<input class="cubeButton" type="button" value="Flash Cube Lights"/>');
    flashCubesButton.click( function(){ flashCubeLights(); });
    flashCubesButton.appendTo( elem );

    var connectCubeButton = $('<input class="cubeButton" type="button" value="Connect To Cube"/>');
    connectCubeButton.click( function(){ connectCube(); });
    connectCubeButton.appendTo( elem );

    var disconnectCubeButton = $('<input class="cubeButton" type="button" value="Disconnect From Cube"/>');
    disconnectCubeButton.click( function(){ disconnectCube(); });
    disconnectCubeButton.appendTo( elem );

    var forgetPreferredCubeButton = $('<input class="cubeButton" type="button" value="Forget Preferred Cube"/>');
    forgetPreferredCubeButton.click( function(){ forgetPreferredCube(); });
    forgetPreferredCubeButton.appendTo( elem );

    cubeInfoDiv = $('<h3 id="cubeInfo"></h3>').appendTo( elem );

    $(elem).append('<div id="ccc-title">CubeConnectionCoordinator</div>');

    var subInterButton = $('<input class="cccInteractableButton" type="button" value="Subscribe Interactable"/>');
    subInterButton.click( function(){ setInteractableSubscription( true ); });
    subInterButton.appendTo( elem );

    var unSubInterButton = $('<input class="cccInteractableButton" type="button" value="Unsubscribe Interactable"/>');
    unSubInterButton.click( function(){ setInteractableSubscription( false ); });
    unSubInterButton.appendTo( elem );

    var tempSubInterButton = $('<input class="cccInteractableButton" type="button" value="Temp Subscribe Interactable"/>');
    tempSubInterButton.click( function(){ setTempInteractableSubscription(); });
    tempSubInterButton.appendTo( elem );

    $(elem).append('<div id="cccButtonBreak"></div>');

    var subBackButton = $('<input class="cccBackgroundButton" type="button" value="Subscribe Background"/>');
    subBackButton.click( function(){ setBackgroundSubscription( true ); });
    subBackButton.appendTo( elem );

    var unSubBackButton = $('<input class="cccBackgroundButton" type="button" value="Unsubscribe Background"/>');
    unSubBackButton.click( function(){ setBackgroundSubscription( false ); });
    unSubBackButton.appendTo( elem );

    var tempSubBackButton = $('<input class="cccBackgroundButton" type="button" value="Temp Subscribe Background"/>');
    tempSubBackButton.click( function(){ setTempBackgroundSubscription(); });
    tempSubBackButton.appendTo( elem );

    cccInfoDiv = $('<h3 id="cccInfo"></h3>').appendTo( elem );

    $(elem).append('<div id="cit-title">CubeInteractionTracker</div>');

    citInfoDiv = $('<h3 id="citInfo"></h3>').appendTo( elem );
  };

  myMethods.onData = function(data, elem) {
    if( elem ) { setHost( elem ); }
    if( !data || typeof data !== 'object' ) {
      return;
    }

    try {
      if( data.hasOwnProperty('commInfo') ) {
        if( !cubeInfoDiv || !cubeInfoDiv.length ) {
          cubeInfoDiv = $host().find( '#cubeInfo' );
        }
        if( !cubeInfoDiv.length ) { return; }

        var commInfo = data["commInfo"] || {};
        cubeInfoDiv.empty();
        cubeInfoDiv.append('<div class="cubeTypeTitle">' + "Connection state: " + (commInfo["connectionState"] != null ? commInfo["connectionState"] : '') + '</div>');
        cubeInfoDiv.append('<div class="cubeTypeTitle">' + "Connected cube: " + (commInfo["connectedCube"] != null ? commInfo["connectedCube"] : '') + '</div>');
        cubeInfoDiv.append('<div class="cubeTypeTitle">' + "Preferred cube: " + (commInfo["preferredCube"] != null ? commInfo["preferredCube"] : '') + '</div>');
        cubeInfoDiv.append('<div class="cubeTypeTitle">' + "Latest scan results (sorted by signal strength): " + '</div>');

        function compareRssi(a,b) {
          var ar = (a && a.lastRssi != null) ? a.lastRssi : 0;
          var br = (b && b.lastRssi != null) ? b.lastRssi : 0;
          return (ar < br ? 1 : -1);
        }
        var cubeData = Array.isArray( commInfo["cubeData"] ) ? commInfo["cubeData"].slice() : [];
        cubeData.sort( compareRssi );
        cubeData.forEach(function(entry) {
          if( !entry || typeof entry !== 'object' ) { return; }
          Object.keys(entry).forEach(function(key) {
            cubeInfoDiv.append( '<div class="cubeEntry">' + key + ': ' + entry[key] + '</div>');
          });
          cubeInfoDiv.append('<div class="cubeTypeTitle"></div>');
        });

      } else if( data.hasOwnProperty("cccInfo") ) {
        if( !cccInfoDiv || !cccInfoDiv.length ) {
          cccInfoDiv = $host().find( '#cccInfo' );
        }
        if( !cccInfoDiv.length ) { return; }

        var cccInfo = data["cccInfo"] || {};
        cccInfoDiv.empty();
        cccInfoDiv.append('<div class="cccTypeTitle">' + "Connection state: " + (cccInfo["connectionState"] != null ? cccInfo["connectionState"] : '') + '</div>');
        var stateCountdown = Array.isArray( cccInfo["stateCountdown"] ) ? cccInfo["stateCountdown"] : [];
        stateCountdown.forEach(function(entry){
          if( !entry || typeof entry !== 'object' ) { return; }
          Object.keys(entry).forEach(function(key){
            cccInfoDiv.append('<div class="cccTypeTitle">' + key + ': ' + entry[key] + '</div>');
          });
          cccInfoDiv.append('<div class="cccTypeTitle"></div>');
        });
        cccInfoDiv.append('<div class="cccTypeTitle">' + "Subscribers: " );
        var subscriberData = Array.isArray( cccInfo["subscriberData"] ) ? cccInfo["subscriberData"] : [];
        subscriberData.forEach(function(entry) {
          if( !entry || typeof entry !== 'object' ) { return; }
          Object.keys(entry).forEach(function(key){
            cccInfoDiv.append('<div class="subscriberEntry">' + key + ': ' + entry[key] + '</div>');
          });
          cccInfoDiv.append('<div class="cccTypeTitle"></div>');
        });

      } else if( data.hasOwnProperty("citInfo") ) {
        if( !citInfoDiv || !citInfoDiv.length ) {
          citInfoDiv = $host().find( '#citInfo' );
        }
        if( !citInfoDiv.length ) { return; }

        var citInfo = data["citInfo"] || {};
        citInfoDiv.empty();
        if( citInfo["noTarget"] == true ){
          citInfoDiv.append('<div class="citTypeTitle">' + "NO TARGET" + '</div>');
        }
        citInfoDiv.append('<div class="citTypeTitle">' + "Tracking State: " + (citInfo["trackingState"] != null ? citInfo["trackingState"] : '') + '</div>');
        citInfoDiv.append('<div class="citTypeTitle">' + "VSM Tracking Rate Request: " + (citInfo["visTrackingRate"] != null ? citInfo["visTrackingRate"] : '') + '</div>');
        citInfoDiv.append('<div class="citTypeTitle">' + "User Holding Cube: " + (citInfo["userHoldingCube"] != null ? citInfo["userHoldingCube"] : '') + '</div>');
        var heldProbability = safeNum( citInfo["heldProbability"], 0 );
        citInfoDiv.append('<div class="citTypeTitle">' + "Cube Held Probability: " + heldProbability + "%" + '</div>');
        citInfoDiv.append('<div class="citTypeTitle">' + "Recently Moved: " + (citInfo["movedRecently"] != null ? citInfo["movedRecently"] : '') + '</div>');
        if( citInfo["movedFarRecently"] == true ){
          citInfoDiv.append('<div class="citTypeTitle">' + "Recently Moved Far, assuming is held " + '</div>');
        }
        citInfoDiv.append('<div class="citTypeTitle">' + "Recently Visible: " + (citInfo["visibleRecently"] != null ? citInfo["visibleRecently"] : '') + '</div>');
        if( citInfo["userHoldingCube"] != true ){
          citInfoDiv.append('<div class="citTypeTitle">' + "Time Since Held: " + safeNum( citInfo["timeSinceHeld"], 2 ) + '</div>');
        }
        if( citInfo["movedRecently"] != true ){
          citInfoDiv.append('<div class="citTypeTitle">' + "Time Since Moved: " + safeNum( citInfo["timeSinceMoved"], 2 ) + '</div>');
        }
        if( citInfo["visibleRecently"] != true ){
          citInfoDiv.append('<div class="citTypeTitle">' + "Time Since Seen: " + safeNum( citInfo["timeSinceObserved"], 2 ) + '</div>');
        }
        citInfoDiv.append('<div class="citTypeTitle">' + "Time Since Tapped: " + safeNum( citInfo["timeSinceTapped"], 2 ) + '</div>');
        if( citInfo.hasOwnProperty("targetInfo") && citInfo["targetInfo"] && typeof citInfo["targetInfo"] === 'object' ){
          var targetInfo = citInfo["targetInfo"];
          citInfoDiv.append('<div class="citTypeTitle">' + "Dist To Target [mm]: " + (targetInfo["distance"] != null ? targetInfo["distance"] : '') + '</div>');
          citInfoDiv.append('<div class="citTypeTitle">' + "Dist Measured by prox: " + (targetInfo["distMeasuredByProx"] != null ? targetInfo["distMeasuredByProx"] : '') + '</div>');
          citInfoDiv.append('<div class="citTypeTitle">' + "Angle To Target: " + (targetInfo["angle"] != null ? targetInfo["angle"] : '') + '</div>');
        }
      }
    } catch( e ) {
      console.warn( 'cubes: onData failed', e );
    }
  };

  myMethods.update = function(dt, elem) {
    if( elem ) { setHost( elem ); }
  };

  myMethods.getStyles = function() {
    return `
      #cubes-title {
        font-size:16px;
        margin-bottom:20px;
      }

      .cubeTypeTitle {
        margin-bottom:10px;
      }

      .cubeButton {
        margin-bottom:20px;
        margin-right:10px;
      }

      .cubeEntry {
        margin-left:10px;
      }

      #ccc-title {
        font-size:16px;
        margin-top:20px;
        margin-bottom:20px;
      }

      .cccTypeTitle {
        margin-bottom:10px;
      }

      .cccButtonBreak {
      }

      .cccInteractableButton {
        margin-bottom:20px;
        margin-right:10px;
      }

      .cccBackgroundButton {
        margin-bottom:20px;
        margin-right:10px;
      }

      .subscriberEntry{
        margin-left:10px;
      }

      #cit-title {
        font-size: 16px;
        margin-top: 20px;
        margin-bottom: 20px;
      }

      .citTypeTitle {
        margin-bottom:10px;
      }
    `;
  };

})(moduleMethods, moduleSendDataFunc);
