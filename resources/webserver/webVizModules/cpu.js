/*
 * Cpu WebViz module (engine :8888)
 * 2026-07: shell host scoping, safe onData, scoped Flot (#tab-cpu)
 */

(function(myMethods, sendData) {

  var maxWidth_ms = 10.0*1000.0;

  var chartOptions = {
    legend: {
      show: true,
      position: "sw",
      labelFormatter: GetLegendLabel
    },
    yaxis: {
      min: 0.0,
      max: 100.0,
      ticks: [0, 25, 50, 75, 100],
      tickFormatter: function(val, axis) { return val.toString()+ "%"; }
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

  var cpuUsed = [];
  var currentTime_ms = 0;
  var plotData = [];
  var chart = null;
  var prevCpuTime = [];
  var hostElem = null;

  function $host() {
    if( hostElem ) {
      return $(hostElem);
    }
    try {
      var el = document.getElementById( 'tab-cpu' );
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
      console.warn( 'cpu: $.plot failed', ePlot );
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

  myMethods.init = function(elem) {
    setHost( elem );

    try {
      $.post('consolevarset', {key: 'WebvizUpdatePeriod', value: 3}, function(result){});
    } catch( e ) {
      console.warn( 'cpu: consolevarset failed', e );
    }

    $(elem).append('<div id="chartContainer"></div>');

    $host().on( 'click', '.legendLabel', function() {
      try {
        var stringValues = this.innerText.split( ' ' );
        var idx = parseInt( stringValues[1], 10 ) - 1;
        if( !isFinite( idx ) || idx < 0 || idx >= plotData.length ) { return; }
        if( !plotData[idx].lines ) { return; }
        plotData[idx].lines.show = !plotData[idx].lines.show;
        var p = ensurePlot();
        if( p ) {
          p.setData( plotData );
          p.setupGrid();
          p.draw();
        }
      } catch( eClick ) {
        console.warn( 'cpu: legend toggle failed', eClick );
      }
    });
  };

  var kNumCPUTimeValues = 8;

  // http://www.linuxhowtos.org/System/procstat.htm
  function CPUTimeInfo(payload, itemIndex) {
    if( typeof payload !== 'string' ) {
      return null;
    }
    payload = payload.substring(5);
    var stringValues = payload.split( ' ' );
    var values = [];
    var totalTime = 0;
    for( var i = 0; i < kNumCPUTimeValues; i++ ) {
      var v = parseInt( stringValues[i], 10 );
      if( !isFinite( v ) ) { return null; }
      values[i] = v;
      totalTime += v;
    }
    var idleTime = values[3] + values[4];
    var usedTime = totalTime - idleTime;
    var prev = prevCpuTime[itemIndex];
    if( !prev ) {
      prevCpuTime[itemIndex] = { prevUsedTime: usedTime, prevTotalTime: totalTime };
      return null;
    }
    var deltaTotalTime = totalTime - prev.prevTotalTime;
    var deltaUsedTime = usedTime - prev.prevUsedTime;
    if( deltaTotalTime <= 0 ) {
      prev.prevUsedTime = usedTime;
      prev.prevTotalTime = totalTime;
      return null;
    }

    var usedPct = deltaUsedTime * 100 / deltaTotalTime;

    prev.prevUsedTime = usedTime;
    prev.prevTotalTime = totalTime;

    return usedPct;
  }

  myMethods.onData = function(data, elem) {
    if( elem ) { setHost( elem ); }
    if( !data || typeof data !== 'object' ) {
      return;
    }
    if( !Array.isArray( data.usage ) || data.usage.length < 2 ) {
      return;
    }

    try {
      var delta = parseFloat( data.deltaTime_ms );
      if( !isFinite( delta ) || delta < 0 ) {
        delta = 0;
      }
      currentTime_ms += delta;

      var numCpus = data.usage.length;

      if( cpuUsed.length === 0 ) {
        for( var i = 0; i < numCpus; ++i ) {
          cpuUsed.push( [] );
          prevCpuTime.push({ prevUsedTime:0, prevTotalTime:0 });
        }

        plotData = [];
        for( var j = 1; j < numCpus; ++j ) {
          plotData.push({label: "cpu "+j.toString(), data: cpuUsed[j], lines: {show: true}});
          CPUTimeInfo( data.usage[j], j );
        }
      }

      for( var k = 1; k < numCpus && k < cpuUsed.length; ++k ) {
        var usedPct = CPUTimeInfo( data.usage[k], k );
        if( usedPct == null || !isFinite( usedPct ) ) { continue; }
        cpuUsed[k].push( [currentTime_ms, usedPct] );
      }

      if( cpuUsed.length > 1 && cpuUsed[1].length > 0 ) {
        var num_data = cpuUsed[1].length;
        var dt = currentTime_ms - cpuUsed[1][0][0];
        while( dt > maxWidth_ms && num_data > 0 ) {
          for( var m = 1; m < cpuUsed.length; ++m ) {
            if( cpuUsed[m].length ) { cpuUsed[m].shift(); }
          }
          --num_data;
          if( !cpuUsed[1].length ) { break; }
          dt = currentTime_ms - cpuUsed[1][0][0];
        }
      }

      var p = ensurePlot();
      if( !p ) { return; }

      var xMin = currentTime_ms - maxWidth_ms;
      p.getAxes().xaxis.options.min = xMin;
      p.getAxes().xaxis.options.max = xMin + maxWidth_ms + 0.1;

      p.setData( plotData );
      p.setupGrid();
      p.draw();
    } catch( e ) {
      console.warn( 'cpu: onData failed', e );
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
