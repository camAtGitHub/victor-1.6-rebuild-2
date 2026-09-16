/*
 * Cube connection information (i.e. are we connected to
 * a cube? Which one? Which ones do we know about?)
 * 2026-07: shell host scoping, safe onData, safe sendData (#tab-cubes)
 * 2026-09: wv-mod chrome; NoTarget casing; grouped connection vs coordinator
 */

(function(myMethods, sendData) {

  var hostElem = null;
  var cubeInfoDiv = null;
  var cccInfoDiv = null;
  var citInfoDiv = null;
  var emptyEl = null;
  var liveEl = null;
  var metaEl = null;
  var lastPacketAt = 0;
  var packetCount = 0;

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

  function setLiveState(state) {
    if( !liveEl ) { return; }
    liveEl.textContent = state;
    liveEl.className = 'wv-mod-live wv-mod-live--' + state;
  }

  function updateMeta() {
    if( !metaEl ) { return; }
    metaEl.textContent = packetCount ? (packetCount + ' pkt') : '—';
  }

  function notePacket() {
    lastPacketAt = Date.now();
    packetCount += 1;
    setLiveState('live');
    updateMeta();
    if( emptyEl && emptyEl.length ) {
      emptyEl.hide();
    }
  }

  function addBtn(parent, label, onClick) {
    var btn = $('<button type="button" class="wv-mod-btn"></button>').text(label);
    btn.on('click', onClick);
    btn.appendTo(parent);
    return btn;
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
    packetCount = 0;
    lastPacketAt = 0;

    var root = $('<div class="wv-mod"></div>');
    root.append(
      '<header class="wv-mod-header">' +
        '<div class="wv-mod-title-row">' +
          '<h2 class="wv-mod-title">Cubes</h2>' +
          '<span class="wv-mod-live wv-mod-live--waiting" aria-live="polite">waiting</span>' +
          '<span class="wv-mod-meta">—</span>' +
        '</div>' +
        '<p class="wv-mod-sub">Connection, coordinator subscriptions, and whether the robot is tracking a cube.</p>' +
      '</header>'
    );
    emptyEl = $('<div class="wv-mod-empty">Waiting for cube status.</div>').appendTo(root);

    var connPanel = $('<section class="wv-mod-panel"></section>').appendTo(root);
    var connBtns = $('<div class="cubes-btn-row"></div>').appendTo(connPanel);
    addBtn(connBtns, 'Flash Cube Lights', function(){ flashCubeLights(); });
    addBtn(connBtns, 'Connect To Cube', function(){ connectCube(); });
    addBtn(connBtns, 'Disconnect From Cube', function(){ disconnectCube(); });
    addBtn(connBtns, 'Forget Preferred Cube', function(){ forgetPreferredCube(); });
    cubeInfoDiv = $('<div id="cubeInfo"></div>').appendTo(connPanel);

    var cccPanel = $('<section class="wv-mod-panel"></section>').appendTo(root);
    $('<h3 class="cubes-h">Coordinator</h3>').appendTo(cccPanel);
    var interBtns = $('<div class="cubes-btn-row"></div>').appendTo(cccPanel);
    addBtn(interBtns, 'Subscribe Interactable', function(){ setInteractableSubscription( true ); });
    addBtn(interBtns, 'Unsubscribe Interactable', function(){ setInteractableSubscription( false ); });
    addBtn(interBtns, 'Temp Subscribe Interactable', function(){ setTempInteractableSubscription(); });
    var backBtns = $('<div class="cubes-btn-row"></div>').appendTo(cccPanel);
    addBtn(backBtns, 'Subscribe Background', function(){ setBackgroundSubscription( true ); });
    addBtn(backBtns, 'Unsubscribe Background', function(){ setBackgroundSubscription( false ); });
    addBtn(backBtns, 'Temp Subscribe Background', function(){ setTempBackgroundSubscription(); });
    cccInfoDiv = $('<div id="cccInfo"></div>').appendTo(cccPanel);

    var citPanel = $('<section class="wv-mod-panel"></section>').appendTo(root);
    $('<h3 class="cubes-h">Hold tracking</h3>').appendTo(citPanel);
    citInfoDiv = $('<div id="citInfo"></div>').appendTo(citPanel);

    root.appendTo(elem);
    liveEl = root.find('.wv-mod-live')[0] || null;
    metaEl = root.find('.wv-mod-meta')[0] || null;
    setLiveState('waiting');
    updateMeta();
  };

  myMethods.onData = function(data, elem) {
    if( elem ) { setHost( elem ); }
    if( !data || typeof data !== 'object' ) {
      return;
    }

    try {
      notePacket();
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
        // C++ sends NoTarget; accept lowercase fallback
        if( citInfo.NoTarget === true || citInfo.noTarget === true ){
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
    if( lastPacketAt && (Date.now() - lastPacketAt > 3000) ) {
      if( liveEl && liveEl.textContent === 'live' ) {
        setLiveState('idle');
      }
    }
  };

  myMethods.getStyles = function() {
    return `
      .cubes-h {
        margin: 0 0 8px;
        font-size: 13px;
        font-weight: 650;
      }

      .cubes-btn-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 10px;
      }

      .cubeTypeTitle {
        margin-bottom:10px;
      }

      .cubeEntry {
        margin-left:10px;
      }

      .cccTypeTitle {
        margin-bottom:10px;
      }

      .subscriberEntry{
        margin-left:10px;
      }

      .citTypeTitle {
        margin-bottom:10px;
      }
    `;
  };

})(moduleMethods, moduleSendDataFunc);
