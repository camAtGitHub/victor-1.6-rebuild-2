/*
 * Lists animations as they play (anim :8889)
 * 2026-07: shell host scoping, safe onData, list cap (#tab-animations)
 */

(function(myMethods, sendData) {

  var list;
  var hostElem = null;
  var MAX_ENTRIES = 500;

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

  myMethods.init = function(elem) {
    setHost( elem );
    $('<h3>NOTE: there is a new tab in the engine process (8888) that includes much more information helpful for developers</h3>').appendTo( elem );
    list = $('<div id="animationList"></div>').appendTo(elem);
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
    } catch( e ) {
      console.warn( 'animations: onData failed', e );
    }
  };

  myMethods.update = function(dt, elem) {
    if( elem ) { setHost( elem ); }
  };

  myMethods.getStyles = function() {
    return `
      #animationList p {
        line-height:15px;
      }
    `;
  };

})(moduleMethods, moduleSendDataFunc);
