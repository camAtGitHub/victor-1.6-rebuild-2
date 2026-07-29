/*
 * SoundReactions / micDataEngine WebViz module (engine :8888)
 * Directional mic clock + loudness chart.
 * 2026-07: shell host scoping, safe onData, scoped Flot (#tab-soundreactions)
 */

(function(myMethods, sendData) {

  var ClockData = {};
  ClockData.center = [125, 125];
  ClockData.radius = 100;

  var maxWidth_s = 60.0;
  var MAX_POINTS = 4000;

  var chartOptions = {
    legend: {
      show: true,
      position: "sw",
      labelFormatter: GetLegendLabel
    },
    yaxis: {
      min: 0.0,
      max: 10.0,
      ticks: [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0],
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
  var plotData = [];
  var micDataPower = [];
  var micDataPeakAverage = [];
  var micDataPeakThreshold = [];
  var micDataPeakMinThreshold = [];
  var chart;

  /** Module host (#tab-soundreactions). Prefer over document-global selectors. */
  var hostElem = null;

  function $host() {
    if( hostElem ) {
      return $(hostElem);
    }
    try {
      var el = document.getElementById( 'tab-soundreactions' );
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

  function canvasEl() {
    var c = $host().find( '#myCanvas' )[0];
    return c || null;
  }

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
      console.warn( 'micDataEngine: $.plot failed', ePlot );
      chart = null;
    }
    return chart;
  }

  function GetLegendLabel(label, series) {
    if( series.lines && series.lines.show ) {
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

  function drawClockFace() {
    var canvas = canvasEl();
    if( !canvas ) { return; }
    var context = canvas.getContext( "2d" );
    if( !context ) { return; }

    context.beginPath();
    context.arc( ClockData.center[0], ClockData.center[1], ClockData.radius, 0, 2*Math.PI );
    context.lineWidth = 5;
    context.strokeStyle = '#0000FF';
    context.stroke();
    context.fillStyle = '#FFFFFF';
    context.fill();

    context.beginPath();
    context.arc( ClockData.center[0], ClockData.center[1], 2, 0, 2*Math.PI );
    context.fillStyle = '#000000';
    context.fill();
  }

  function pruneSeries( series, tNow ) {
    if( !Array.isArray( series ) || series.length === 0 ) { return; }
    var dt = tNow - series[0][0];
    while( dt > maxWidth_s && series.length > 0 ) {
      series.shift();
      if( series.length === 0 ) { break; }
      dt = tNow - series[0][0];
    }
    while( series.length > MAX_POINTS ) {
      series.shift();
    }
  }

  myMethods.init = function(elem) {
    setHost( elem );

    if( location.port != "8888" ) {
      $('<h3>You must use this tab with the engine process (port 8888)</h3>').appendTo(elem);
    }

    var angleFactorA = 0.866;
    var angleFactorB = 0.5;

    ClockData.offsets =
    [
      [-0.0, -1.0],
      [angleFactorB, -angleFactorA],
      [angleFactorA, -angleFactorB],
      [1.0, -0.0],
      [angleFactorA, angleFactorB],
      [angleFactorB, angleFactorA],
      [-0.0, 1.0],
      [-angleFactorB, angleFactorA],
      [-angleFactorA, angleFactorB],
      [-1.0, -0.0],
      [-angleFactorA, -angleFactorB],
      [-angleFactorB, -angleFactorA],
      [-0.0, -0.0]
    ];

    $('<canvas></canvas>', {id: 'myCanvas'}).appendTo(elem);

    var canvas = canvasEl();
    if( canvas ) {
      canvas.height = 250;
      canvas.width = 700;
    }

    drawClockFace();

    $(elem).append('<div id="chartContainer"></div>');

    $host().on( 'click', '.legendLabel', function() {
      var labelName = this.innerText;
      var labelIdx = -1;
      for( var i = 0; i < plotData.length; i++ ) {
        if( plotData[i].label == labelName ) {
          labelIdx = i;
          break;
        }
      }
      if( labelIdx != -1 && plotData[labelIdx].lines ) {
        plotData[labelIdx].lines.show = !plotData[labelIdx].lines.show;
        var p = ensurePlot();
        if( p ) {
          try {
            p.setData( plotData );
            p.setupGrid();
            p.draw();
          } catch( e ) {
            console.warn( 'micDataEngine: legend toggle draw failed', e );
          }
        }
      }
    });

    $(elem).append('<p>NOTE: trigger values are for display purposes only (true values live in instance jsons)</p>');
  };

  myMethods.onData = function(data, elem) {
    if( elem ) { setHost( elem ); }
    if( !data || typeof data !== 'object' ) {
      return;
    }

    try {
      var canvas = canvasEl();
      if( !canvas ) { return; }
      var context = canvas.getContext( "2d" );
      if( !context ) { return; }

      context.clearRect( 0, 0, canvas.width, canvas.height );
      drawClockFace();

      var dirIdx = parseInt( data.direction, 10 );
      if( isFinite( dirIdx ) && ClockData.offsets && ClockData.offsets[dirIdx] ) {
        var dotRadius = 8;
        var dotX = ClockData.center[0] + ( ClockData.offsets[dirIdx][0] * ClockData.radius );
        var dotY = ClockData.center[1] + ( ClockData.offsets[dirIdx][1] * ClockData.radius );
        context.beginPath();
        context.arc( dotX, dotY, dotRadius, 0, 2*Math.PI );
        context.fillStyle = '#FF0000';
        context.fill();
      }

      var selIdx = parseInt( data.selectedDirection, 10 );
      if( isFinite( selIdx ) && ClockData.offsets && ClockData.offsets[selIdx] ) {
        var selRadius = 5;
        var selX = ClockData.center[0] + ( ClockData.offsets[selIdx][0] * ClockData.radius );
        var selY = ClockData.center[1] + ( ClockData.offsets[selIdx][1] * ClockData.radius );
        context.beginPath();
        context.arc( selX, selY, selRadius, 0, 2*Math.PI );
        context.fillStyle = '#00FF00';
        context.fill();
      }

      var micPowerValue = parseFloat( data["latestPowerValue"] );
      var micNoiseFloor = parseFloat( data["latestNoiseFloor"] );
      var micPeakValue = parseFloat( data["powerScore"] );
      var micPeakAverage = parseFloat( data["powerScoreAvg"] );
      var micPeakThreshold = parseFloat( data["powerScoreThreshold"] );
      var micPeakMinThreshold = parseFloat( data["powerScoreMinThreshold"] );

      var tNow = parseFloat( data["time"] );

      var labelX = 250, valueX = 400;
      var textY = 25, textHeight = 25;

      context.font = "normal 18px Arial";
      context.textBaseline = "top";
      context.fillStyle = '#000000';
      context.textAlign = "start";

      context.fillText( "Confidence : ", labelX, textY );
      context.fillText( data.confidence != null ? data.confidence : '', valueX, textY );

      textY += textHeight;
      context.fillText( "Scoring Level : ", labelX, textY );
      context.fillText( isFinite( micPeakValue ) ? micPeakValue.toFixed(3) : '', valueX, textY );

      textY += textHeight;
      context.fillText( "Scoring Avg : ", labelX, textY );
      context.fillText( isFinite( micPeakAverage ) ? micPeakAverage.toFixed(3) : '', valueX, textY );

      textY += textHeight;
      context.fillText( "Voice Detected :", labelX, textY );
      context.beginPath();
      context.arc( valueX + 10, textY + 11, 8, 0, 2*Math.PI );
      context.fillStyle = data.activeState ? '#00FF00' : '#FF0000';
      context.fill();
      context.fillStyle = '#000000';

      valueX = 450;
      if( data.isTriggered ) {
        textY += textHeight*2;
        context.fillText( "Reaction Score : ", labelX, textY );
        var tScore = parseFloat( data.triggerScore );
        context.fillText( isFinite( tScore ) ? tScore.toFixed(3) : '', valueX, textY );
        textY += textHeight;
        context.fillText( "Reaction Confidence : ", labelX, textY );
        context.fillText( data.triggerConfidence != null ? data.triggerConfidence : '', valueX, textY );
        textY += textHeight;
        context.fillText( "Reaction Direction : ", labelX, textY );
        context.fillText( data.triggerDirection != null ? data.triggerDirection : '', valueX, textY );
      }

      if( first ) {
        plotData = [];
        plotData.push({ label: "Mic Power", data: micDataPower, lines: {show: true} });
        plotData.push({ label: "Mic Peak Avg", data: micDataPeakAverage, lines: {show: true} });
        plotData.push({ label: "Mic Power Trigger", data: micDataPeakThreshold, lines: {show: true} });
        plotData.push({ label: "Mic Conf Trigger", data: micDataPeakMinThreshold, lines: {show: true} });
        first = false;
      }

      if( !isFinite( tNow ) ) {
        return;
      }

      if( isFinite( micPowerValue ) ) {
        micDataPower.push( [tNow, micPowerValue] );
      }
      if( isFinite( micNoiseFloor ) && isFinite( micPeakAverage ) ) {
        micDataPeakAverage.push( [tNow, micNoiseFloor + micPeakAverage] );
        if( isFinite( micPeakThreshold ) ) {
          micDataPeakThreshold.push( [tNow, micNoiseFloor + micPeakAverage + micPeakThreshold] );
        }
        if( isFinite( micPeakMinThreshold ) ) {
          micDataPeakMinThreshold.push( [tNow, micNoiseFloor + micPeakAverage + micPeakMinThreshold] );
        }
      }

      pruneSeries( micDataPower, tNow );
      pruneSeries( micDataPeakAverage, tNow );
      pruneSeries( micDataPeakThreshold, tNow );
      pruneSeries( micDataPeakMinThreshold, tNow );

      var p = ensurePlot();
      if( !p ) { return; }

      var xMin = tNow - maxWidth_s;
      p.getAxes().xaxis.options.min = xMin;
      p.getAxes().xaxis.options.max = xMin + maxWidth_s + 0.1;
      p.setData( plotData );
      p.setupGrid();
      p.draw();
    } catch( e ) {
      console.warn( 'micDataEngine: onData failed', e );
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

      .legendColorBox {
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
    `;
  };

})(moduleMethods, moduleSendDataFunc);
