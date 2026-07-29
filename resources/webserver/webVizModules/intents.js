/*
 * Intents WebViz module (engine :8888)
 * 2026-07: shell host scoping, safe onData, fixed invalid HTML (#tab-intents)
 */

(function(myMethods, sendData) {

  var intentTypes = ['user', 'cloud', 'app'];
  var hostElem = null;
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

  myMethods.init = function(elem) {
    setHost( elem );

    // Fixed: was '</div' (invalid/unclosed)
    $(elem).append('<div id="intent-title">Last-received intents:</div>');

    var dropDownList = $('<div></div>', {id:'dropDownList'}).appendTo( elem );

    $(elem).append('<div id="intent-title-resend">Resend intents:</div>');
    var recentList = $('<div></div>', {id:'repeatEntriesList'}).appendTo( elem );

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
      var button = $('<input/>', {class: 'intent-submit', type:'submit', value:'Trigger'}).appendTo( container );
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
                alert('Format is either one string (the intent type), or two strings separated by a space: the intent type and its param');
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
            var repeatBtn = $('<input/>', {type:'submit', value:'Resend'}).appendTo( repeatEntry );
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
              var dropdown = container.find('.intent-list');
              dropdown.empty();
              $("<option/>", {val: '', text:'Select a ' + intent + ' intent'}).appendTo(dropdown);
              $(list).each(function() {
                $("<option/>", {val: this, text: this}).appendTo(dropdown);
              });
              dropdown.css('visibility', 'visible');
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
  };

  myMethods.getStyles = function() {
    return `
      #intent-title,
      #intent-title-resend {
        font-size:16px;
        margin-bottom:20px;
      }

      .intent-row {
        display: table-row;
      }

      .intent-row * {
        height:30px;
        display: table-cell;
        margin: 0px 5px;
      }

      /* initially hidden */
      .intent-list {
        visibility:hidden
      }

      .current-intent,
      .intent-text {
        min-width:100px;
      }
      .intent-list {
        min-width: 200px;
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
