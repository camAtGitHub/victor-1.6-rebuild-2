/*
 * Mood WebViz module (engine :8888)
 * 2026-07: shell host scoping, safe onData, scoped Flot (#tab-mood)
 */
(function(myMethods, sendData) {

  // max width of the chart
  var maxWidth_s = 60.0;
  var yLabelPose = -1.0;
  var overlappingWidth_s = 1.3;

  var defaultDisplayedEmotions = ['Stimulated', 'Trust'];

  var gridMarkings = [];
  var gridMarkingLabels = [];
  var numLabelDivs = 0;

  var chartOptions = {
    legend: {
      show: true,
      position: "sw",
      labelFormatter: GetLegendLabel
    },
    yaxis: {
      min: -1.05,
      max: 1.05,
      ticks: [-1.0, 0.0, 1.0],
    },
    xaxis: {
      ticks: 10,
      tickLength: 10,

      tickDecimals: 0
    },
    grid: {
      show: true,
    }
  };

  var first = true;
  var emoToIdxMap = {};
  var moodData = [];
  var plotData = [];
  var dumpedData = [];
  var chart;
  var ignoreOnChange = false;
  var draggingSlider;

  /** Module host element (#tab-mood). Prefer over document-global selectors. */
  var hostElem = null;

  function $host() {
    if( hostElem ) {
      return $(hostElem);
    }
    try {
      var el = document.getElementById( 'tab-mood' );
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

  function chartContainer() {
    return $host().find( '#chartContainer' );
  }

  /**
   * Create or re-create the Flot plot on the host-scoped container.
   * Avoids global "#chartContainer" collisions with cpu/mic modules.
   */
  function ensurePlot() {
    var $c = chartContainer();
    if( !$c.length ) {
      return null;
    }
    if( chart ) {
      try {
        var ph = (typeof chart.getPlaceholder === 'function') ? chart.getPlaceholder() : null;
        if( ph && ph.length && ph[0] && document.documentElement.contains( ph[0] ) ) {
          return chart;
        }
      } catch( e ) {
        chart = null;
      }
    }
    try {
      chart = $.plot( $c, plotData, chartOptions );
    } catch( ePlot ) {
      console.warn( 'mood: $.plot failed', ePlot );
      chart = null;
    }
    return chart;
  }

  function safeSend( payload ) {
    try {
      if( typeof sendData === 'function' ) {
        sendData( payload );
      }
    } catch( e ) {
      console.warn( 'mood: sendData failed', e );
    }
  }

  function GetLegendLabel(label, series) {
    if( series.lines.show ) {
      return `<div class="legendLabelBox">
                <div class="legendLabelBoxFill" style="background-color:` + series.color + `"></div>
              </div>`
              + label;
    } else {
      return `<div class="legendLabelBox">
                <div class="legendLabelBoxUnused"></div>
              </div>`
              + label;
    }
  }

  function CreateControls( elem, info ) {
    if( !info || typeof info !== 'object' ) {
      return;
    }
    setHost( elem );
    var $root = $host();
    var container = $root.find( '#bottomContainer' );
    if( !container.length ) {
      return;
    }
    // jQuery .remove(selector) filters the matched set; use find().remove()
    container.find( '#slidersCntr,#buttonCntr' ).remove();
    var slidersCntr = $( '<div></div>', {id: 'slidersCntr'} ).appendTo( container );
    var buttonCntr =  $( '<div></div>', {id: 'buttonCntr'} ).appendTo( container );

    var emotions = Array.isArray( info.emotions ) ? info.emotions : [];
    for( var idx=0; idx<emotions.length; ++idx ) {
      var emotionInfo = emotions[idx];
      if( !emotionInfo || typeof emotionInfo !== 'object' ) {
        continue;
      }
      var emotionName = emotionInfo.emotionType;
      if( typeof emotionName !== 'string' ) {
        continue;
      }
      var emoMin = (typeof emotionInfo.min === 'number') ? emotionInfo.min : -1;
      var emoMax = (typeof emotionInfo.max === 'number') ? emotionInfo.max : 1;

      var onChange = function(value, emotionName) {
        if( ignoreOnChange ) {
          return;
        }
        SetControlsValue( emotionName, value);
      };

      // create a label
      $( '<div class="sliderLabel">' + emotionName + '</div>' ).appendTo( slidersCntr );

      // create a slider
      var slider = $( '<input type="range" class="slider"  data-emotion="' + emotionName + '" step="0.05" '
          + 'min="' + emoMin + '" '
          + 'max="' + emoMax + '" '
          + 'value="' + emoMin + '">' ).appendTo( slidersCntr );
      slider.on( 'input', function() {
              onChange( this.value, $(this).attr('data-emotion') );
            })
            .on( 'mousedown', function(e){
              draggingSlider = this;
              $( this ).attr( 'data-prev-value', $(this).val() );
            })
            .on( 'mouseup' , function() {
              draggingSlider = undefined;
              var prevValue = $( this ).attr( 'data-prev-value' );
              var newVal = $( this ).val();
              if( newVal !== prevValue ) {
                SendCurrentControlData();
              }
            });

      //create a textbox within a div
      var valueTextDiv = $( '<div class="sliderValueCntr"></div>' ).appendTo( slidersCntr );
      var currentValueText = $( '<input type="text" class="sliderValue"  data-emotion="' + emotionName + '" '
                                 + 'value="' + FloatToString( emoMin ) + '"></input>' ).appendTo( valueTextDiv );
      currentValueText.change( function() {
                        onChange( parseFloat(this.value.trim()), $( this ).attr( 'data-emotion' ) );
                        SendCurrentControlData();
                      })
                      .keydown( function (e) {
                        if( $.inArray( e.keyCode, [46, 8, 9, 27, 13, 110, 189, 190] ) !== -1 // backspace, delete, tab, escape, enter, -, and .
                            || (e.keyCode == 65 && (e.ctrlKey === true || e.metaKey === true)) // ctrl/cmd+A
                            || (e.keyCode == 67 && (e.ctrlKey === true || e.metaKey === true)) // ctrl/cmd+C
                            || (e.keyCode == 88 && (e.ctrlKey === true || e.metaKey === true)) // ctrl/cmd+X
                            || (e.keyCode >= 35 && e.keyCode <= 39) ) // home, end, left, right
                        {
                          return; // allowed
                        }
                        // ensure that it is a number and stop the keypress
                        if( (e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105) ) {
                          e.preventDefault();
                        }
                      })
                      .keyup( (function( min, max ) {
                                return function() {
                                  var val = parseFloat( this.value );
                                  if( !isNaN( val ) ) {
                                    if( val < min ) {
                                      this.value = FloatToString( min );
                                    }
                                    if( val > max ) {
                                      this.value = FloatToString( max );
                                    }
                                  }
                                }
                              })( emoMin, emoMax ) );
    }

    var simpleMoods = (info.simpleMoods && typeof info.simpleMoods === 'object') ? info.simpleMoods : {};
    for( var simpleMood in simpleMoods ) {
      if( simpleMoods.hasOwnProperty( simpleMood ) ) {
        var values = simpleMoods[simpleMood];
        var btn = $('<button/>', {
          text: simpleMood,
          click: (function( values ) {
            return function() {
              safeSend( values );
            };
          })( values )
        });
        btn.appendTo( buttonCntr );
      }
    }
  }

  function FloatToString( val, prec ) {
    prec = prec || 2;
    var p = Math.pow( 10, prec );
    var strVal = parseFloat( Math.round( val * p ) / p ).toFixed( prec );
    return (val < 0) ? strVal : (' ' + strVal);
  }

  function SetControlsValue( emoName, emoVal ) {
    ignoreOnChange = true;
    var $root = $host();
    // update text
    var textDiv = $root.find( '.sliderValue[data-emotion="' + emoName + '"]' );
    textDiv.val( FloatToString( emoVal ) );
    // update slider
    var slider = $root.find( '.slider[data-emotion="' + emoName + '"]' );
    slider.val( emoVal );
    ignoreOnChange = false;
  }

  function UpdateControlsData() {
    for( var emoName in emoToIdxMap ) {
      if( emoToIdxMap.hasOwnProperty( emoName ) ) {
        var idx = emoToIdxMap[ emoName ];
        var series = moodData[idx];
        if( !Array.isArray( series ) || series.length === 0 ) {
          continue;
        }
        var lastPt = series[series.length - 1];
        if( !Array.isArray( lastPt ) || lastPt.length < 2 ) {
          continue;
        }
        var value = lastPt[1];

        if( typeof draggingSlider !== 'undefined' && draggingSlider &&
            ($(draggingSlider).attr('data-emotion') == emoName) ) {
          // don't update if it's being dragged
          return;
        }
        if( $host().find('.sliderValue[data-emotion="' + emoName + '"]').is(':focus') ) {
          // don't update if the text is being changed
          return;
        }

        SetControlsValue( emoName, value );
      }
    }
  }

  function SendCurrentControlData() {
    var toSend = {};
    $host().find('.slider').each( function() {
      var emoName = $( this ).attr( 'data-emotion' );
      var emoVal = $( this ).val();
      toSend[emoName] = parseFloat( emoVal );
    });
    safeSend( toSend );
  }

  function PruneOverlapingEvents() {
    if( gridMarkings.length <= 1 ) {
      return;
    }

    var toRemove = [];

    var last = gridMarkings[0]['xaxis']['from'];
    for( var i=1; i<gridMarkings.length; ++i ) {
      var curr = gridMarkings[i]['xaxis']['from'];
      if( curr - last <= overlappingWidth_s ) {
        // just remove the earlier one (not ideal....)
        toRemove.push(i-1);
        console.log("removing event '" + gridMarkingLabels[i-1] + "' at index " +
                    (i-1) + " at t=" + last + " next t=" + curr);
      }
      else {
        last = curr;
      }
    }

    // remove high indices first so splice positions stay valid
    toRemove.sort( function(a, b) { return b - a; } );
    toRemove.forEach( function(i) {
      gridMarkings.splice(i, 1);
      gridMarkingLabels.splice(i, 1);
    });
  }

  myMethods.init = function(elem) {
    setHost( elem );
    var $root = $(elem);

    $root.append('<div id="chartContainer"></div>');
    var bottomContainer = $('<div id="bottomContainer"></div>').appendTo($root);
    var leftControls = $('<div id="leftControls"></div>').appendTo(bottomContainer);
    leftControls.append('<div id="simpleMoodDisplay"></div>');
    leftControls.append('<div>' +
                        '<input type="checkbox" id="showEvents" checked/>' +
                        '<label for="showEvents">Show events</label>' +
                        '</div>');
    leftControls.append('<div>' +
                        '<input type="checkbox" id="hideOverlappingEvents"/>' +
                        '<label for="hideOverlappingEvents">Hide overlapping events</label>' +
                        '</div>');
    leftControls.append('<div>' +
                        '<input type="checkbox" id="showLegend" checked/>' +
                        '<label for="showLegend">Show chart legend</label>' +
                        '</div>');
    leftControls.append('<div id="periodControl"' +
                        '<label for="sendPeriod">Update period (seconds)</label>' +
                        '<input type="text" id="sendPeriod" min="0" max="10.0" value="1.0" size="4"/>' +
                        '</div');
    leftControls.append('<div>' +
                        '<input type="checkbox" id="dumpData"/>' +
                        '<label for="dumpData">Dump raw data</label>' +
                        '</div>');
    leftControls.append('<div id="downloadDataDump"></div>');
    leftControls.append('</div>');

    $root.find('#showEvents').change(function() {
      var isChecked =  $(this).is(':checked');
      $host().find('.verticalLabel').toggle( isChecked );
      var c = ensurePlot();
      if( !c ) { return; }
      try {
        c.getOptions().grid.markings = isChecked ? gridMarkings : undefined;
        c.setupGrid();
        c.draw();
      } catch( e ) {
        console.warn( 'mood: showEvents failed', e );
      }
    });

    $root.find('#showLegend').change(function() {
      var isChecked =  $(this).is(':checked');
      var c = ensurePlot();
      if( !c ) { return; }
      try {
        c.getOptions().legend.show = isChecked;
      } catch( e ) {
        console.warn( 'mood: showLegend failed', e );
      }
    });

    $root.find('#hideOverlappingEvents').change(function() {
      if( $(this).is(':checked') ) {
        PruneOverlapingEvents();
      }
    });

    $root.find('#dumpData').change(function() {
      var isChecked =  $(this).is(':checked');
      var $dump = $host().find('#downloadDataDump');
      if( isChecked ) {
        $dump.text('dumping... (stop to enable download)');
        $host().find('#downloadDataDumpLink').remove();
      }
      else {
        $dump.empty();
        try {
          var url = "data:text/plain;charset=utf-8," + encodeURIComponent(JSON.stringify(dumpedData, null, 2));
          $dump.append('<a id="downloadDataDumpLink" download="mood_data.json"'+
                       ' href="' + url + '">download json</a>');
        } catch( eDump ) {
          $dump.text( 'dump serialize failed' );
        }
      }
    });

    $root.find('#sendPeriod').change(function() {
      var value = this.value;
      try {
        $.post('consolevarset', {key: 'MoodManager_WebVizPeriod_s', value: value}, function(result){});
      } catch( e ) {
        console.warn( 'mood: consolevarset failed', e );
      }
    });

    // Scope legend toggles to this host (not document body — other Flot modules share .legendLabel)
    $root.off( 'click.moodLegend', '.legendLabel' );
    $root.on( 'click.moodLegend', '.legendLabel', function () {
      try {
        var emo = this.innerText;
        var idx = emoToIdxMap[emo];
        if( typeof idx !== 'number' || !plotData[idx] ) {
          return;
        }
        plotData[idx].lines.show = !plotData[idx].lines.show;
        var c = ensurePlot();
        if( !c ) { return; }
        c.setData(plotData);
        c.setupGrid();
        c.draw();
      } catch( e ) {
        console.warn( 'mood: legend click failed', e );
      }
    });
  };

  myMethods.onData = function(data, elem) {
    // Never throw on null / unexpected payload shapes (shell surfaces module errors as toasts).
    try {
      if( elem ) { setHost( elem ); }

      if( data == null || typeof data !== 'object' ) {
        return;
      }

      if( first && Array.isArray( data.moods ) && data.moods.length > 0 ) {

        for( var i=0; i<data.moods.length; ++i ) {
          var moodEntry = data.moods[i];
          if( !moodEntry || typeof moodEntry !== 'object' ) {
            continue;
          }
          var emo = moodEntry.emotion;
          if( typeof emo !== 'string' ) {
            continue;
          }
          var seriesIdxInit = moodData.length;
          emoToIdxMap[emo] = seriesIdxInit;
          moodData.push( [] );
          var newData = { label: emo,
                          data: moodData[seriesIdxInit],
                          lines: {show: true} };
          if( defaultDisplayedEmotions.indexOf( emo ) < 0 ) {
            newData.lines.show = false;
          }
          plotData.push( newData );
        }
        if( plotData.length > 0 ) {
          ensurePlot();
          first = false;
        }
      }

      if( typeof data.info !== 'undefined' ) {
        CreateControls( elem || hostElem, data.info );
        return;
      }

      if( $host().find('#dumpData').is(':checked') ) {
        dumpedData.push( data );
      }

      if( "simpleMood" in data ) {
        $host().find('#simpleMoodDisplay').text( 'SimpleMood: ' + data.simpleMood );
      }

      if( !Array.isArray( data.moods ) ) {
        // info-only or partial payloads already handled above
        return;
      }

      var t = data["time"];
      if( typeof t !== 'number' || !isFinite( t ) ) {
        return;
      }

      for( var j=0; j<data.moods.length; ++j ) {
        var m = data.moods[j];
        if( !m || typeof m !== 'object' || typeof m.emotion !== 'string' ) {
          continue;
        }
        var seriesIdx = emoToIdxMap[ m.emotion ];
        if( typeof seriesIdx !== 'number' || !Array.isArray( moodData[seriesIdx] ) ) {
          continue;
        }

        var numVal = parseFloat( m.value );
        if( !isFinite( numVal ) ) {
          continue;
        }

        moodData[seriesIdx].push( [t, numVal] );

        while( moodData[seriesIdx].length > 0 ) {
          var oldest = moodData[seriesIdx][0];
          if( !Array.isArray( oldest ) || typeof oldest[0] !== 'number' ) {
            moodData[seriesIdx].shift();
            continue;
          }
          if( (t - oldest[0]) > maxWidth_s ) {
            moodData[seriesIdx].shift();
          } else {
            break;
          }
        }
      }

      UpdateControlsData();

      if( "emotionEvent" in data ) {
        gridMarkings.push( { xaxis: {from: t, to: t},
                             color: "#000",
                             lineWidth: 2
                           });
        gridMarkingLabels.push(data["emotionEvent"]);

        if( $host().find('#hideOverlappingEvents').is(':checked') ) {
          PruneOverlapingEvents();
        }
      }

      if( gridMarkings.length > 0 ) {

        while( gridMarkings.length > 0 ) {
          var fromT = gridMarkings[0].xaxis && gridMarkings[0].xaxis.from;
          if( typeof fromT !== 'number' || (t - fromT) > maxWidth_s ) {
            gridMarkings.shift();
            gridMarkingLabels.shift();
          } else {
            break;
          }
        }

        var cMark = ensurePlot();
        if( cMark ) {
          cMark.getOptions().grid.markings =
            $host().find('#showEvents').is(':checked') ? gridMarkings : undefined;
        }
      }


      // fixed width data
      var c = ensurePlot();
      if( !c ) {
        return;
      }

      var xMin = t - maxWidth_s;
      c.getAxes().xaxis.options.min = xMin;
      c.getAxes().xaxis.options.max = xMin + maxWidth_s + 0.1;

      c.setData(plotData);
      c.setupGrid();
      c.draw();

      if( gridMarkingLabels.length > 0 ) {
        var $chart = chartContainer();
        // add label divs if we need them
        while( numLabelDivs < gridMarkingLabels.length ) {
          $chart.append("<div class='verticalLabel' id='vl" + numLabelDivs + "'></div>");
          numLabelDivs++;
        }

        var li;
        for( li=0; li<gridMarkings.length; ++li ) {
          var div = $host().find( "#vl" + li );
          if( !div.length ) { continue; }

          div.text(gridMarkingLabels[li]);

          var chartPos = { x: gridMarkings[li].xaxis.from, y: yLabelPose};
          var pos = c.pointOffset(chartPos);
          div.toggle( $host().find('#showEvents').is(':checked') );
          div.css({position: "absolute",
                   left: (pos.left - div.height() + 2) + "px",
                   top: (pos.top - 2) + "px"});

        }

        // hide remaining divs
        for( ; li<numLabelDivs; ++li ) {
          $host().find( "#vl" + li ).hide();
        }
      }

    } catch( err ) {
      console.warn( 'mood: onData error', err );
    }
  };

  myMethods.update = function(dt, elem) {
    if( elem ) { setHost( elem ); }
  };

  myMethods.getStyles = function() {
    return `
      #chartContainer {
        height: 370px;
        width: 100%;
      }

      .verticalLabel {
        text-align: left;
        transform: rotate(-90deg);
        transform-origin: left;
        color: #606060
      }
      .sliderLabel:not(:first-child) {
        margin-top:10px;
      }
      .sliderValue, .slider {
        vertical-align:middle;
      }
      .sliderValue {
        width:40px;
        padding-left:5px;
        color:white;
        background-color:#6c90d8;
        border:0px;
        height:14px;
      }
      .sliderValueCntr {
        display:inline;
        padding-left:10px;

      }
      .sliderValueCntr::before {
        content: "";
        width: 0;
        height: 0;
        display:inline-block;
        border-top: 7px solid transparent;
        border-bottom: 7px solid transparent;
        vertical-align:middle;
        border-right:7px solid #6c90d8;
      }
      button {
        padding: 5px 10px;
        margin: 5px 5px 10px 40px;
        display:block;
        width:100px;
      }
      #buttonCntr:before {
        content: "Quick-set SimpleMood";
        margin-left:40px;
      }
      #bottomContainer {
        height:200px;
        padding-top:10px;
      }
      #bottomContainer > div {
        float:left;
        width:250px;
        padding-left:20px;
      }

      .legendColorBox {
        /* we manually create the boxes below */
        display:none;
      }
      .legendLabel {
        cursor: pointer;
      }
      .legendLabelBox {
        display: inline-block;
        border: 1px solid #ccc;
        padding: 1px;
        height: 14px;
        width: 14px;
        vertical-align: middle;
        margin-right: 3px;
      }
      .legendLabelBoxFill {
        display:inline-block;
        width:10px;
        height:10px;
      }
      .legendLabelBoxUnused {
        width: 18px;
        height: 18px;
        border-bottom: 1px solid black;
        transform: translateY(-10px) translateX(-10px) rotate(-45deg);
        -ms-transform: translateY(-10px) translateX(-10px) rotate(-45deg);
        -moz-transform: translateY(-10px) translateX(-10px) rotate(-45deg);
        -webkit-transform: translateY(-10px) translateX(-10px) rotate(-45deg);
      }
      #leftControls > * {
        margin: 0px 3px 10px 0;
      }
      #sendPeriod {
        margin: 0px 3px 10px 0;
      }
      #simpleMoodDisplay {
        font-weight: bold
      }

      `;
  };
})(moduleMethods, moduleSendDataFunc);
