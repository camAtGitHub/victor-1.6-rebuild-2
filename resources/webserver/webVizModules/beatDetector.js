/*
 * Lists details about detected beats
 * 2026-07: shell host scoping, safe onData, scoped DataTables (#tab-beatdetector)
 */

(function(myMethods, sendData) {

  var table;
  var autoScroll = true;
  var userScrolling = false;
  var tableDirty = true;
  var paused = false;
  var hostElem = null;
  var beatDetectorInfoDiv = null;

  var dataColumns = ['timeSinceBeat', 'tempo_bpm', 'conf', 'aboveThresh'];
  var prettyColumns = ['Time Since Beat (sec)', 'Tempo (bpm)', 'Confidence', 'AboveThresh'];
  var enabledColumns = [true, true, true, true];

  function $host() {
    if( hostElem ) {
      return $(hostElem);
    }
    try {
      var el = document.getElementById( 'tab-beatdetector' );
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
    $( '<tbody class="beat-list"></tbody>' ).appendTo( tableElem );

    var colsToCreate = '<tr>';
    prettyColumns.forEach( function( col ){
      colsToCreate += '<th>' + col + '</th>';
    });
    colsToCreate += '</tr>';
    $( colsToCreate ).appendTo( thead );

    // Destroy previous instance if re-init
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
  }

  function ClearTable() {
    if( table ) {
      try { table.clear(); } catch( e ) {}
    }
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
      console.warn( 'beatDetector: DrawTable failed', e );
    }
  }

  function UserScrolling() {
    userScrolling = true;
  }

  myMethods.init = function( elem ) {
    setHost( elem );

    $('<p>Beat detector component information</p>').appendTo( elem );

    $( '<b>Column toggles:</b>' ).appendTo( elem );
    var ul = $( '<ul class="colToggles"></ul>' ).appendTo( elem );
    prettyColumns.forEach( function( col, idx ){
      var shouldDisplay = enabledColumns[idx] ? 'colEnabled' : '';
      // Fixed invalid </div> on <li>
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
        console.warn( 'beatDetector: column toggle failed', eToggle );
      }
    });

    var chkPaused = $('<input />', { type: 'checkbox', id: 'chkPaused'}).appendTo( elem ).prop('checked', paused);
    $('<label />', { 'for': 'chkPaused', text: 'Pause' }).appendTo( elem );

    chkPaused.change( function() {
      paused = $(this).is(':checked');
    });

    beatDetectorInfoDiv = $('<h3 id="detectorInfo"></h3>').appendTo( elem );

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
    if( paused ) {
      return;
    }
    if( !data || typeof data !== 'object' ) {
      return;
    }

    try {
      if( !beatDetectorInfoDiv || !beatDetectorInfoDiv.length ) {
        beatDetectorInfoDiv = $host().find( '#detectorInfo' );
      }
      var detectorInfo = (data["detectorInfo"] && typeof data["detectorInfo"] === 'object')
        ? data["detectorInfo"] : {};
      if( beatDetectorInfoDiv.length ) {
        beatDetectorInfoDiv.empty();
        beatDetectorInfoDiv.append('<div>' + "Possible beat detected: " + (detectorInfo["possibleBeatDetected"] != null ? detectorInfo["possibleBeatDetected"] : '') + '</div>');
        beatDetectorInfoDiv.append('<div>' + "Definite beat detected: " + (detectorInfo["beatDetected"] != null ? detectorInfo["beatDetected"] : '') + '</div>');
        beatDetectorInfoDiv.append('<div>' + "Latest tempo (bpm): " + (detectorInfo["latestTempo_bpm"] != null ? detectorInfo["latestTempo_bpm"] : '') + '</div>');
        beatDetectorInfoDiv.append('<div>' + "Latest confidence: " + (detectorInfo["latestConf"] != null ? detectorInfo["latestConf"] : '') + '</div>');
      }

      ClearTable();
      var beatInfo = Array.isArray( data["beatInfo"] ) ? data["beatInfo"].slice() : [];
      beatInfo.reverse().forEach(function(d) {
        AddTableEntry( d );
      });
      tableDirty = true;
    } catch( e ) {
      console.warn( 'beatDetector: onData failed', e );
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
