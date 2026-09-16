/*
 * CloudIntents WebViz module (engine :8888)
 * 2026-07: shell host scoping, safe onData, bounded result list (#tab-cloudintents)
 */

(function(myMethods, sendData) {

  var hostElem = null;
  var MAX_RESULTS = 200;

  var liveEl = null;
  var metaEl = null;
  var emptyEl = null;
  var lastPacketAt = 0;
  var packetCount = 0;

  function $host() {
    if( hostElem ) {
      return $(hostElem);
    }
    try {
      var el = document.getElementById( 'tab-cloudintents' );
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

  function setLiveState( state ) {
    if( !liveEl ) { return; }
    liveEl.textContent = state;
    liveEl.className = 'wv-mod-live wv-mod-live--' + state;
  }

  function updateMeta() {
    if( !metaEl ) { return; }
    metaEl.textContent = packetCount ? ( packetCount + ' pkt' ) : '—';
  }

  function notePacket() {
    lastPacketAt = Date.now();
    packetCount += 1;
    setLiveState( 'live' );
    updateMeta();
    if( emptyEl ) {
      emptyEl.hidden = true;
    }
  }

  function tickLiveIdle() {
    if( lastPacketAt && ( Date.now() - lastPacketAt > 3000 ) ) {
      if( liveEl && liveEl.textContent === 'live' ) {
        setLiveState( 'idle' );
      }
    }
  }

  function mountChrome( elem, title, sub, emptyText ) {
    var root = document.createElement( 'div' );
    root.className = 'wv-mod';
    root.innerHTML =
      '<header class="wv-mod-header">' +
        '<div class="wv-mod-title-row">' +
          '<h2 class="wv-mod-title"></h2>' +
          '<span class="wv-mod-live wv-mod-live--waiting" aria-live="polite">waiting</span>' +
          '<span class="wv-mod-meta">—</span>' +
        '</div>' +
        '<p class="wv-mod-sub"></p>' +
      '</header>';
    root.querySelector( '.wv-mod-title' ).textContent = title;
    root.querySelector( '.wv-mod-sub' ).textContent = sub;
    liveEl = root.querySelector( '.wv-mod-live' );
    metaEl = root.querySelector( '.wv-mod-meta' );
    if( emptyText ) {
      emptyEl = document.createElement( 'div' );
      emptyEl.className = 'wv-mod-empty';
      emptyEl.textContent = emptyText;
      root.appendChild( emptyEl );
    }
    elem.appendChild( root );
    return root;
  }

  myMethods.init = function(elem) {
    setHost( elem );
    var root = mountChrome(
      elem,
      'Cloud intents',
      'Cloud recognizer results as they arrive.',
      'Waiting for cloud recognizer results.'
    );
    var panel = $( '<div class="wv-mod-panel"></div>' ).appendTo( root );
    panel.append( '<div id="result-table"></div>' );
  };

  myMethods.onData = function(data, elem) {
    if( elem ) { setHost( elem ); }
    if( data == null ) {
      return;
    }

    try {
      var items = Array.isArray( data ) ? data : [data];
      var parent = $host().find( '#result-table' );
      if( !parent.length ) { return; }

      items.forEach(function(item) {
        if( !item || typeof item !== 'object' ) { return; }
        var d = new Date(0);
        var t = parseFloat( item.time );
        if( isFinite( t ) ) {
          d.setUTCSeconds( t );
        }
        // Shallow copy so we don't mutate the live payload
        var copy = {};
        for( var k in item ) {
          if( item.hasOwnProperty(k) && k !== 'time' ) {
            copy[k] = item[k];
          }
        }
        if( copy.type == "debugFile" && copy.file ) {
          var href = String( copy.file ).substr( '/data/data/com.anki.victor'.length );
          $('<div></div>').text( String(d) + ' - ' ).append(
            $('<a></a>').attr( 'href', href ).text( 'Captured audio link' )
          ).appendTo( parent );
        } else {
          $('<div></div>').text( String(d) + ' - ' + JSON.stringify(copy) ).appendTo( parent );
        }
      });

      // Cap unbounded growth
      var children = parent.children();
      while( children.length > MAX_RESULTS ) {
        children.first().remove();
        children = parent.children();
      }
      notePacket();
    } catch( e ) {
      console.warn( 'cloud: onData failed', e );
    }
  };

  myMethods.update = function(dt, elem) {
    if( elem ) { setHost( elem ); }
    tickLiveIdle();
  };

  myMethods.getStyles = function() {
    return `
      #result-table {
        font-size: 12px;
        line-height: 1.45;
      }
    `;
  };

})(moduleMethods, moduleSendDataFunc);
