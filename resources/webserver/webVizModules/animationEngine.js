/*
 * Lists details about animations that are triggered
 * 2026-07: shell host scoping, safe onData, row cap, scoped DataTables (#tab-animationengine)
 */

(function(myMethods, sendData) {

  var table;
  var autoScroll = true;
  var userScrolling = false;
  var tableDirty = true;
  var hostElem = null;
  var MAX_ROWS = 2000;

  var liveEl = null;
  var metaEl = null;
  var emptyEl = null;
  var lastPacketAt = 0;
  var packetCount = 0;

  var dataColumns = ['clip', 'group', 'trigger', 'mood', 'headAngle_deg'];
  var prettyColumns = ['Clip Name', 'Group', 'Trigger', 'SimpleMood', 'Head Angle (deg)'];
  var enabledColumns = [true, true, true, true, false];

  function $host() {
    if( hostElem ) {
      return $(hostElem);
    }
    try {
      var el = document.getElementById( 'tab-animationengine' );
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

  function scrollBody() {
    return $host().find( '.dataTables_scrollBody' );
  }

  function CreateTable( elem ) {
    var tableElem = $( '<table class="display wv-mod-table" style="width:100%"></table>' ).appendTo( elem );
    var thead = $( '<thead></thead>' ).appendTo( tableElem );
    $( '<tbody class="anim-engine-list"></tbody>' ).appendTo( tableElem );

    var colsToCreate = '<tr>';
    prettyColumns.forEach( function( col ){
      colsToCreate += '<th>' + col + '</th>';
    });
    colsToCreate += '</tr>';
    $( colsToCreate ).appendTo( thead );

    if( table ) {
      try { table.destroy( true ); } catch( e ) {}
      table = null;
    }

    table = tableElem.DataTable({
      "ordering":          false,
      "scrollY":           "600px",
      "scrollX":           false,
      "scrollCollapse":    true,
      "paging":            false,
      "search": {
        "caseInsensitive": true
      }
    });
    enabledColumns.forEach( function( isVisible, idx ){
      table.column( idx ).visible( isVisible );
    });
  }

  function AddTableEntry( data ) {
    if( !table || !data || typeof data !== 'object' ) { return; }
    var columnValues = [];
    for( var i=0; i<dataColumns.length; ++i ) {
      if( data.hasOwnProperty( dataColumns[i] ) ) {
        columnValues.push( data[dataColumns[i]] );
      } else {
        columnValues.push( '' );
      }
    }
    table.row.add( columnValues );

    // Cap unbounded growth
    try {
      while( table.rows().count() > MAX_ROWS ) {
        table.row( 0 ).remove();
      }
    } catch( eCap ) {}
  }

  function DrawTable() {
    if( !table ) { return; }
    try {
      userScrolling = false;
      table.draw( false );
      if( autoScroll ) {
        var $sb = scrollBody();
        if( $sb.length && $sb[0] ) {
          $sb.scrollTop( $sb[0].scrollHeight );
        }
      }
    } catch( e ) {
      console.warn( 'animationEngine: DrawTable failed', e );
    }
  }

  function UserScrolling() {
    userScrolling = true;
  }

  myMethods.init = function( elem ) {
    setHost( elem );

    var root = mountChrome(
      elem,
      'Animation engine',
      'One row per animation started by an engine action.',
      'Waiting for animation rows.'
    );

    $( '<b>Column toggles:</b>' ).appendTo( root );
    var ul = $( '<ul class="colToggles"></ul>' ).appendTo( root );
    prettyColumns.forEach( function( col, idx ){
      var shouldDisplay = enabledColumns[idx] ? 'colEnabled' : '';
      ul.append( '<li class="toggleViz ' + shouldDisplay + '" data-column="' + idx + '">' + col + '</li>' );
    });
    $host().find( '.toggleViz' ).on( 'click', function( e ) {
      e.preventDefault();
      if( !table ) { return; }
      try {
        var column = table.column( $( this ).attr( 'data-column' ) );
        column.visible( !column.visible() );
        $( this ).toggleClass( 'colEnabled' );
      } catch( eToggle ) {
        console.warn( 'animationEngine: column toggle failed', eToggle );
      }
    });

    var panel = $( '<div class="wv-mod-panel"></div>' ).appendTo( root );
    CreateTable( panel );

    scrollBody().on( 'scroll', function() {
      if( !userScrolling ) {
        return;
      }
      autoScroll = ($( this ).scrollTop() + $( this ).innerHeight() >= $( this )[0].scrollHeight);
    });

    if( document.addEventListener ) {
      document.addEventListener( 'mousewheel', UserScrolling, false );
      document.addEventListener( 'DOMMouseScroll', UserScrolling, false );
    } else {
      document.attachEvent( 'onmousewheel', UserScrolling );
    }
  };

  myMethods.onData = function( data, elem ) {
    if( elem ) { setHost( elem ); }
    if( !data || typeof data !== 'object' ) {
      return;
    }
    try {
      AddTableEntry( data );
      tableDirty = true;
      notePacket();
    } catch( e ) {
      console.warn( 'animationEngine: onData failed', e );
    }
  };

  myMethods.update = function( dt, elem ) {
    if( elem ) { setHost( elem ); }
    tickLiveIdle();
    if( tableDirty ) {
      tableDirty = false;
      DrawTable();
    }
  };

  myMethods.getStyles = function() {
    return `
      li{
        list-style-type:none;
        font-size:1em;
        display:inline-block;
        cursor:pointer;
        margin-right:20px;
      }

      li:before {
        content:' ';
        display:inline-block;
        color:blue;
        width:10px;
        height:12px;
        padding:0 6px 0 0;
      }

      li.colEnabled:before {
        content:'\\2713';
      }

      th {
        font-size: 11px;
      }

      td {
        font-size: 10px;
      }
    `;
  };

})(moduleMethods, moduleSendDataFunc);
