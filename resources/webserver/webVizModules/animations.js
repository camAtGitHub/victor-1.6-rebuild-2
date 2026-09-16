/*
 * Lists animations as they play (anim :8889)
 * 2026-07: shell host scoping, safe onData, list cap (#tab-animations)
 */

(function(myMethods, sendData) {

  var list;
  var hostElem = null;
  var MAX_ENTRIES = 500;

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
      var el = document.getElementById( 'tab-animations' );
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
      'Animations',
      'Clip start and stop on the animation process. For trigger, mood, and head angle, use Animation Engine on the engine process (:8888).',
      'Waiting for clip start and stop.'
    );
    var panel = $( '<div class="wv-mod-panel"></div>' ).appendTo( root );
    list = $('<div id="animationList"></div>').appendTo( panel );
  };

  myMethods.onData = function(data, elem) {
    if( elem ) { setHost( elem ); }
    if( !data || typeof data !== 'object' ) {
      return;
    }

    try {
      if( !list || !list.length ) {
        list = $host().find( '#animationList' );
      }
      if( !list.length ) { return; }

      var animation = data["animation"];
      if( animation == null ) { return; }

      if( data["type"] == "start" ) {
        var icon = '►';
        var item = $('<p></p>').html( icon + '&nbsp;' );
        item.append( document.createTextNode( String(animation) ) );
        item.attr('data-animation', animation);
        list.append(item);

        var children = list.children( 'p' );
        while( children.length > MAX_ENTRIES ) {
          children.first().remove();
          children = list.children( 'p' );
        }
      } else { // stop
        var stopIcon = '◼';
        var entry = list.find('p[data-animation="' + String(animation).replace(/"/g, '\\"') + '"]').last();
        if( entry.length ) {
          var txt = entry.text();
          entry.text( stopIcon + (txt.length > 1 ? txt.slice(1) : '') );
        }
      }
      notePacket();
    } catch( e ) {
      console.warn( 'animations: onData failed', e );
    }
  };

  myMethods.update = function(dt, elem) {
    if( elem ) { setHost( elem ); }
    tickLiveIdle();
  };

  myMethods.getStyles = function() {
    return `
      #animationList p {
        line-height:15px;
      }
    `;
  };

})(moduleMethods, moduleSendDataFunc);
