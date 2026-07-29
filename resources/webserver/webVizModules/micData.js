/*
 * MicData WebViz module (anim :8889)
 * Directional mic clock + power chart.
 * 2026-07: shell host scoping, safe onData, scoped Flot (#tab-micdata)
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
  var mic0data = [];
  var mic0NoiseFloor = [];
  var chart;

  /** Module host element (#tab-micdata). Prefer over document-global selectors. */
  var hostElem = null;

  function $host() {
    if( hostElem ) {
      return $(hostElem);
    }
    try {
      var el = document.getElementById( 'tab-micdata' );
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
      console.warn( 'micData: $.plot failed', ePlot );
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

    // Feed port, not location.port (dev PC static server + remote robot :8889)
    var animOk = window.WebVizConfig && typeof window.WebVizConfig.isFeedPort === 'function'
      ? window.WebVizConfig.isFeedPort( '8889' )
      : String( location.port ) === '8889';
    if( !animOk ) {
      $('<h3>You must use this tab with the anim process (feed port 8889)</h3>').appendTo(elem);
    }

    var angleFactorA = 0.866; // cos(30 degrees)
    var angleFactorB = 0.5; // sin(30 degrees)

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
      canvas.width = 500;
    }

    drawClockFace();

    $(elem).append('<div id="chartContainer"></div>');

    // Scope legend toggles to this host only (avoid cross-module collisions)
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
            console.warn( 'micData: legend toggle draw failed', e );
          }
        }
      }
    });
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

      var directions = Array.isArray( data.directions ) ? data.directions : null;
      var maxConf = parseFloat( data.maxConfidence );
      if( directions && isFinite( maxConf ) && maxConf > 0 && Array.isArray( ClockData.offsets ) ) {
        for( var i = 0; i < 12; i++ ) {
          var dirVal = parseFloat( directions[i] );
          if( isFinite( dirVal ) && dirVal > 0 ) {
            var barFactor = dirVal / maxConf;
            context.beginPath();
            context.moveTo( ClockData.center[0], ClockData.center[1] );
            var lineX = ClockData.center[0] + ( ClockData.offsets[i][0] * barFactor * ClockData.radius );
            var lineY = ClockData.center[1] + ( ClockData.offsets[i][1] * barFactor * ClockData.radius );
            context.lineWidth = 2;
            context.lineTo( lineX, lineY );
            context.stroke();
          }
        }
      }

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

      var labelX = 250, valueX = 425;
      var textY = 25, textHeight = 25;

      context.font = "normal 18px Arial";
      context.textBaseline = "top";
      context.fillStyle = '#000000';
      context.textAlign = "start";
      context.fillText( "Confidence : ", labelX, textY );
      context.fillText( data.confidence != null ? data.confidence : '', valueX, textY );

      textY += textHeight;
      context.fillText( "Delay Time (ms) : ", labelX, textY );
      context.fillText( data.delayTime != null ? data.delayTime : '', valueX, textY );

      textY += textHeight;
      context.fillText( "Voice Detected :", labelX, textY );
      context.beginPath();
      context.arc( valueX + 10, textY + 11, 8, 0, 2*Math.PI );
      context.fillStyle = data.activeState ? '#00FF00' : '#FF0000';
      context.fill();
      context.fillStyle = '#000000';

      textY += 2*textHeight;
      context.fillText( "Beat Detector:", labelX, textY );

      var bd = (data.beatDetector && typeof data.beatDetector === 'object') ? data.beatDetector : {};
      textY += textHeight;
      context.fillText( "tempo (bpm) : ", labelX, textY );
      context.fillText( bd.tempo_bpm != null ? bd.tempo_bpm : '', valueX, textY );

      textY += textHeight;
      context.fillText( "confidence : ", labelX, textY );
      context.fillText( bd.confidence != null ? bd.confidence : '', valueX, textY );

      if( data.triggerDetected ) {
        textY += textHeight;
        context.fillText( "Trigger Word Detected", labelX, textY );
      }

      if( first ) {
        plotData = [];
        plotData.push({ label: "Mic0 (back-left)", data: mic0data, lines: {show: true} });
        plotData.push({ label: "Mic0 Floor (back-left)", data: mic0NoiseFloor, lines: {show: true} });
        first = false;
      }

      var tNow = parseFloat( data["time"] );
      if( !isFinite( tNow ) ) {
        return;
      }

      var powerRaw = parseFloat( data["latestPowerValue"] );
      var floorRaw = parseFloat( data["latestNoiseFloor"] );
      if( isFinite( powerRaw ) && powerRaw > 0 ) {
        mic0data.push( [tNow, Math.log(powerRaw)/Math.LN10] );
      }
      if( isFinite( floorRaw ) && floorRaw > 0 ) {
        mic0NoiseFloor.push( [tNow, Math.log(floorRaw)/Math.LN10] );
      }

      pruneSeries( mic0data, tNow );
      pruneSeries( mic0NoiseFloor, tNow );

      var p = ensurePlot();
      if( !p ) { return; }

      var xMin = tNow - maxWidth_s;
      p.getAxes().xaxis.options.min = xMin;
      p.getAxes().xaxis.options.max = xMin + maxWidth_s + 0.1;
      p.setData( plotData );
      p.setupGrid();
      p.draw();
    } catch( e ) {
      console.warn( 'micData: onData failed', e );
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
