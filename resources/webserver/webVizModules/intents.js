/*
 * Intents WebViz module (engine :8888)
 * 2026-07: shell host scoping, safe onData, fixed invalid HTML (#tab-intents)
 * 2026-09: wv-mod chrome; hide empty app select; toast instead of alert
 */

(function(myMethods, sendData) {

  var intentTypes = ['user', 'cloud', 'app'];
  var hostElem = null;
  var liveEl = null;
  var metaEl = null;
  var lastPacketAt = 0;
  var packetCount = 0;
  var MAX_REPEAT_ENTRIES = 50;

  function $host() {
    if( hostElem ) {
      return $(hostElem);
    }
    try {
      var el = document.getElementById( 'tab-intents' );
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
      console.warn( 'intents: sendData failed', e );
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
  }

  function toastOrWarn(title, message) {
    if( window.WebVizUI && typeof window.WebVizUI.toast === 'function' ) {
      window.WebVizUI.toast(title, message, 'warn');
    } else {
      console.warn(title + ': ' + message);
    }
  }

  myMethods.init = function(elem) {
    setHost( elem );
    packetCount = 0;
    lastPacketAt = 0;

    var root = $('<div class="wv-mod"></div>');
    root.append(
      '<header class="wv-mod-header">' +
        '<div class="wv-mod-title-row">' +
          '<h2 class="wv-mod-title">Intents</h2>' +
          '<span class="wv-mod-live wv-mod-live--waiting" aria-live="polite">waiting</span>' +
          '<span class="wv-mod-meta">—</span>' +
        '</div>' +
        '<p class="wv-mod-sub">Pending and last-seen intents. Type a name and trigger it for testing.</p>' +
      '</header>'
    );

    var pendingPanel = $('<section class="wv-mod-panel"></section>').appendTo(root);
    $('<h3 class="intents-h">Pending / last intent</h3>').appendTo(pendingPanel);
    var dropDownList = $('<div></div>', {id:'dropDownList'}).appendTo( pendingPanel );

    var recentPanel = $('<section class="wv-mod-panel"></section>').appendTo(root);
    $('<h3 class="intents-h">Recent injections</h3>').appendTo(recentPanel);
    var recentList = $('<div></div>', {id:'repeatEntriesList'}).appendTo( recentPanel );

    root.appendTo(elem);
    liveEl = root.find('.wv-mod-live')[0] || null;
    metaEl = root.find('.wv-mod-meta')[0] || null;
    setLiveState('waiting');
    updateMeta();

    for( var i=0; i<intentTypes.length; ++i ) {
      var intent = intentTypes[i];

      var container = $('<div></div>', {class:'intent-row', id: ('intent-'+intent)}).appendTo( dropDownList );

      $('<div>' + intent + ':</div>', {class: 'intent-label'}).appendTo( container );
      $('<div></div>', {class: 'current-intent'}).appendTo( container );
      $('<select></select>', {class: 'intent-list'}).appendTo( container ).on('change', function() {
        var selected = $(this).val();
        $(this).next().val(selected);
        this.selectedIndex = 0;
      });
      var placeholder = '';
      if( intent == 'app' ) {
        placeholder = 'intent_name [param]';
      } else if( intent == 'cloud' ) {
        placeholder = 'intent_name, or JSON';
      } else {
        placeholder = 'intent_name';
      }
      var text = $('<input/>', {class: 'intent-text'}).appendTo( container );
      text.attr('placeholder', placeholder );
      var button = $('<button type="button" class="wv-mod-btn intent-submit">Trigger</button>').appendTo( container );
      button.on('click', (function(intent) {
        return function() {
          var onClick = function(requestedIntent, textBox) {
            if( !requestedIntent ) { return; }
            if( intent == 'app' ) {
              var url = 'http://' + window.location.href.split('/')[2];
              url += '/sendAppMessage?type=AppIntent&intent=';
              var splitRequest = requestedIntent.split(' ');
              if( splitRequest.length == 2 ) {
                url += encodeURIComponent(splitRequest[0]) + '&param=' + encodeURIComponent(splitRequest[1]);
              } else if( splitRequest.length == 1 ) {
                url += encodeURIComponent(splitRequest[0]);
              } else {
                toastOrWarn('Intents', 'Format is either one string (the intent type), or two strings separated by a space: the intent type and its param');
                return;
              }
              try { $.get(url); } catch( eGet ) {
                console.warn( 'intents: app intent GET failed', eGet );
              }
            } else {
              safeSend({ intentType: intent, request: requestedIntent });
            }

            if( textBox && textBox.val ) {
              textBox.val('');
            }
          };

          var textBox = $(this).prev();
          var requestedIntent = textBox.val();
          onClick( requestedIntent, textBox );

          // add repeat entry if it doesnt exist (scoped to this host)
          if( requestedIntent && $host().find('.repeat-entry div').filter(function(){
                return $(this).text() === requestedIntent;
              }).length === 0 ) {
            var repeatEntry = $('<div></div>', {class: 'repeat-entry'}).appendTo( recentList );
            $('<div>' + $('<div/>').text(requestedIntent).html() + '</div>').appendTo( repeatEntry );
            var repeatBtn = $('<button type="button" class="wv-mod-btn">Resend</button>').appendTo( repeatEntry );
            repeatBtn.on('click', function() { onClick(requestedIntent, textBox); } );

            // Cap resend list growth
            var entries = recentList.children( '.repeat-entry' );
            while( entries.length > MAX_REPEAT_ENTRIES ) {
              entries.first().remove();
              entries = recentList.children( '.repeat-entry' );
            }
          }
        };
      })(intent) );
    }
  };

  myMethods.onData = function(data, elem) {
    if( elem ) { setHost( elem ); }
    if( data == null ) {
      return;
    }

    try {
      notePacket();
      // Engine may send a single blob or an array of blobs
      var items = Array.isArray( data ) ? data : [data];
      for( var i=0; i<items.length; ++i ) {
        var blob = items[i];
        if( !blob || typeof blob !== 'object' ) { continue; }
        var intent = blob.intentType;
        if( intentTypes.indexOf(intent) >= 0 ) {
          var container = $host().find( '#intent-'+intent );
          if( container.length ) {
            if( blob.type == 'current-intent' ) {
              container.find('.current-intent').text( blob.value != null ? blob.value : '' );
            } else if( blob.type == 'all-intents' ) {
              var list = Array.isArray( blob.list ) ? blob.list : [];
              // App dropdown stays hidden until a real app all-intents list arrives (C++ currently sends user+cloud only)
              if( intent === 'app' && list.length === 0 ) {
                continue;
              }
              var dropdown = container.find('.intent-list');
              dropdown.empty();
              $("<option/>", {val: '', text:'Select a ' + intent + ' intent'}).appendTo(dropdown);
              $(list).each(function() {
                $("<option/>", {val: this, text: this}).appendTo(dropdown);
              });
              dropdown.addClass('is-populated');
            }
          }
        }
      }
    } catch( e ) {
      console.warn( 'intents: onData failed', e );
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
      .intents-h {
        margin: 0 0 8px;
        font-size: 13px;
        font-weight: 650;
      }

      .intent-row {
        display: table-row;
      }

      .intent-row * {
        height:30px;
        display: table-cell;
        margin: 0px 5px;
      }

      /* hidden until all-intents list arrives; app stays hidden (no C++ list) */
      .intent-row .intent-list {
        display: none;
        min-width: 200px;
      }
      .intent-row .intent-list.is-populated {
        display: table-cell;
      }

      .current-intent,
      .intent-text {
        min-width:100px;
      }
      .current-intent {
        padding-left:10px;
        font-weight:bold;
      }

      .repeat-entry div {
        font-family: courier, courier new, serif;
      }

      .repeat-entry {
        display: table-row;
      }
      .repeat-entry * {
        display: table-cell;
        margin: 10px 5px;
      }
    `;
  };

})(moduleMethods, moduleSendDataFunc);
