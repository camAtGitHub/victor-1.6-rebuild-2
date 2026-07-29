/*
 * CloudIntents WebViz module (engine :8888)
 * 2026-07: shell host scoping, safe onData, bounded result list (#tab-cloudintents)
 */

(function(myMethods, sendData) {

  var hostElem = null;
  var MAX_RESULTS = 200;

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

  myMethods.init = function(elem) {
    setHost( elem );
    var cloudDiv = $('<div id="cloud"></div>').appendTo(elem);
    cloudDiv.append('<div id="cloudBottom"></div>' +
                    '<div id="cloudRight"></div>' +
                    '<div id="cloudLeft"></div>');
    $(elem).append('<marquee direction="down" width="400" height="110" behavior="alternate" style="border:solid">' +
                      '<marquee behavior="alternate">Cloud Intent Results</marquee>' +
                    '</marquee>');

    $(elem).append('<div id="result-table"></div>');
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
    } catch( e ) {
      console.warn( 'cloud: onData failed', e );
    }
  };

  myMethods.update = function(dt, elem) {
    if( elem ) { setHost( elem ); }
  };

  myMethods.getStyles = function() {
    return `
      #cloud {
        width:175px;
        height:100px;
        position: relative;
        float:right;
      }

      #cloud div {
        border: solid 5px black;
      }

      #cloudBottom {
        background-color: #fff;
        border-radius: 50px;
        height: 75px;
        position: absolute;
        top: 30px;
        width: 175px;
        z-index: 1;
      }

      #cloudRight {
        background-color: #fff;
        border-radius: 100%;
        height: 75px;
        left: 70px;
        position: absolute;
        top: 0px;
        width: 75px;
        z-index: 0;
      }

      #cloudLeft {
        background-color: #fff;
        border-radius: 100%;
        height: 50px;
        left: 25px;
        position: absolute;
        top: 15px;
        width: 50px;
        z-index: 0;
      }

      #cloud::before {
        background-color: white;
        border-radius: 50%;
        content: '';
        height: 49px;
        left: 28px;
        position: absolute;
        top: 19px;
        width: 44px;
        z-index: 2;
     }

      #cloud::after {
        position: absolute; top: 4px; left: 73px;
        background-color: white;
        border-radius: 50%;
        content: '';
        width: 69px;
        height: 70px;
        z-index: 2;
      }
    `;
  };

})(moduleMethods, moduleSendDataFunc);
