/*
 * Speech Recognition System
 * 2026-07: shell host scoping, safe onData, row cap, scoped DataTables (#tab-speechrecognizersys)
 */

(function(myMethods, sendData) {

  var table;
  var autoScroll = true;
  var userScrolling = false;
  var tableDirty = true;
  var entryCount = 0;
  var hostElem = null;
  var MAX_ROWS = 2000;

  var dataColumns = ['result', 'score', 'startTime_ms', 'endTime_ms', 'startSampleIndex', 'endSampleIndex', 'notch', 'playback'];
  var prettyColumns = ["TriggerCount", 'Result', 'Score', 'StartTime ms', 'EndTime ms', 'StartSampleIdx', 'EndSampleIdx', 'Notch', 'PlaybackRecog'];
  var enabledColumns = [true, true, true, true, true, true, true, true, true];

  function $host() {
    if( hostElem ) {
      return $(hostElem);
    }
    try {
      var el = document.getElementById( 'tab-speechrecognizersys' );
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

  function scrollBody() {
    return $host().find( '.dataTables_scrollBody' );
  }

  function CreateTable( elem ) {
    var tableElem = $( '<table class="display" style="width:100%"></table>' ).appendTo( elem );
    var thead = $( '<thead></thead>' ).appendTo( tableElem );
    $( '<tbody class="speech-recog-list"></tbody>' ).appendTo( tableElem );

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
      "scrollY":           "600px",
      "scrollX":           false,
      "scrollCollapse":    true,
      "paging":            false,
      "search": {
        "caseInsensitive": true
      },
      "order": [[0, 'asc']]
    });
    enabledColumns.forEach( function( isVisible, idx ){
      table.column( idx ).visible( isVisible );
    });
  }

  function AddTableEntry( data ) {
    if( !table || !data || typeof data !== 'object' ) { return; }
    var columnValues = [];
    ++entryCount;
    columnValues.push( entryCount );
    for( var i=0; i<dataColumns.length; ++i ) {
      if( data.hasOwnProperty( dataColumns[i] ) ) {
        columnValues.push( data[dataColumns[i]] );
      } else {
        columnValues.push( '' );
      }
    }

    table.row.add( columnValues );
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
      console.warn( 'speechRecognizerSys: DrawTable failed', e );
    }
  }

  function UserScrolling() {
    userScrolling = true;
  }

  myMethods.init = function( elem ) {
    setHost( elem );

    $( '<b>Column toggles:</b>' ).appendTo( elem );
    var ul = $( '<ul class="colToggles"></ul>' ).appendTo( elem );
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
        console.warn( 'speechRecognizerSys: column toggle failed', eToggle );
      }
    });

    CreateTable( elem );

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
    if( data == null ) {
      return;
    }
    try {
      if( Array.isArray(data) ) {
        data.forEach(function(entry) {
          if( entry && typeof entry === 'object' ) {
            AddTableEntry( entry );
          }
        });
      } else if( typeof data === 'object' ) {
        AddTableEntry( data );
      } else {
        return;
      }
      tableDirty = true;
    } catch( e ) {
      console.warn( 'speechRecognizerSys: onData failed', e );
    }
  };

  myMethods.update = function( dt, elem ) {
    if( elem ) { setHost( elem ); }
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
