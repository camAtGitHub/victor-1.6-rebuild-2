/*
 * CpuProfile WebViz module (engine :8888 / anim :8889)
 * 2026-07: shell host scoping, safe onData, scoped Flot (#tab-cpuprofile)
 * Globals that were outside the IIFE are now internal (avoids multi-instance bleed).
 */

(function(myMethods, sendData) {

  var currentThread = -1;
  var threads = [];

  var maxWidth_s = 60.0;

  var chartOptions = {
    legend: {
      noColumns: 1,
      show: true,
      position: "nw"
    },
    xaxis: {
      ticks: 10,
      tickLength: 10,
      tickDecimals: 0
    },
    yaxis: {
      tickFormatter: function(val, axis) { return val < axis.max ? val.toFixed(2) : "ms"; }
    },
    grid: {
      show: true,
    }
  };

  var threadNameToIdxMap = {};
  var chart = null;
  var plotData = [];
  var hostElem = null;
  var lastPacketAt = 0;
  var packetCount = 0;
  var liveEl = null;
  var metaEl = null;
  var emptyEl = null;

  function $host() {
    if( hostElem ) {
      return $(hostElem);
    }
    try {
      var el = document.getElementById( 'tab-cpuprofile' );
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

  function setLiveState( state ) {
    if( !liveEl ) { return; }
    liveEl.textContent = state;
    liveEl.className = "wv-mod-live wv-mod-live--" + state;
  }

  function updateLiveMeta() {
    if( !metaEl ) { return; }
    metaEl.textContent = packetCount > 0 ? (packetCount + " pkt") : "—";
  }

  function notePacket() {
    packetCount += 1;
    lastPacketAt = Date.now();
    setLiveState( "live" );
    updateLiveMeta();
    if( emptyEl ) {
      emptyEl.hidden = true;
    }
  }

  function tickLiveIdle() {
    if( lastPacketAt && (Date.now() - lastPacketAt > 3000) ) {
      if( liveEl && liveEl.textContent === "live" ) {
        setLiveState( "idle" );
      }
    }
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
      console.warn( 'cpuprofile: $.plot failed', ePlot );
      chart = null;
    }
    return chart;
  }

  function DoFieldToggling(that, event, thread) {
    if( !thread || !event || !event.target ) { return; }
    var idx = thread.nameToIdxMap[event.target.id];
    if( idx === undefined ) { return; }
    thread.show[idx] = that.checked;
    thread.changed = true;
  }

  function DoToggling(that, event, thread) {
    if( !thread || !event || !event.target ) { return; }
    if( event.target.id == "min" ) {
      thread.min = that.checked;
    } else if( event.target.id == "max" ) {
      thread.max = that.checked;
    } else if( event.target.id == "mean" ) {
      thread.mean = that.checked;
    }
    thread.changed = true;
  }

  function bindOptionClicks(thread) {
    $host().find( "#chartOptions" ).find( "input[type='checkbox']" ).off( 'click.cpuprofile' ).on( 'click.cpuprofile', function(event) {
      DoToggling( this, event, thread );
    });
    $host().find( "#chartFields" ).find( "input[type='checkbox']" ).off( 'click.cpuprofile' ).on( 'click.cpuprofile', function(event) {
      DoFieldToggling( this, event, thread );
    });
  }

  myMethods.init = function(elem) {
    setHost( elem );

    var $root = $(
      '<div class="wv-mod">' +
        '<header class="wv-mod-header">' +
          '<div class="wv-mod-title-row">' +
            '<h2 class="wv-mod-title">CPU profile</h2>' +
            '<span class="wv-mod-live wv-mod-live--waiting" data-wv="live" aria-live="polite">waiting</span>' +
            '<span class="wv-mod-meta" data-wv="meta">—</span>' +
          '</div>' +
          '<p class="wv-mod-sub">Per-thread profiler samples.</p>' +
        '</header>' +
        '<div class="wv-mod-toolbar">' +
          '<button type="button" class="wv-mod-btn" data-wv="sendHere">Send samples here</button>' +
          '<button type="button" class="wv-mod-btn" data-wv="sendConsole">Send samples to console</button>' +
        '</div>' +
        '<div class="wv-mod-empty" data-wv="empty">Profiler output is not sent here. Send samples to this tab to plot them.</div>' +
      '</div>'
    );
    $(elem).append( $root );

    liveEl = $root.find( '[data-wv="live"]' )[0] || null;
    metaEl = $root.find( '[data-wv="meta"]' )[0] || null;
    emptyEl = $root.find( '[data-wv="empty"]' )[0] || null;

    $root.on( 'click', '[data-wv="sendHere"]', function() {
      try {
        $.post( 'consolevarset', {key:'ProfilerLogOutput', value:2}, function(result){} );
      } catch( e ) {
        console.warn( 'cpuprofile: consolevarset failed', e );
      }
    });
    $root.on( 'click', '[data-wv="sendConsole"]', function() {
      try {
        $.post( 'consolevarset', {key:'ProfilerLogOutput', value:0}, function(result){} );
      } catch( e ) {
        console.warn( 'cpuprofile: consolevarset failed', e );
      }
    });

    var $sel = $('<select id="chartSelect" name="Tick"><option>No active ticks</option></select>');
    $sel.on( 'change', function() {
      currentThread = this.selectedIndex;
      if( currentThread >= 0 && threads[currentThread] ) {
        threads[currentThread].changed = true;
      }
    });
    $root.append( $sel );

    $root.append(
      '<div id="chartOptions">' +
      '<input id="mean" type="checkbox" checked="checked" />Mean ' +
      '<input id="min" type="checkbox" />Min ' +
      '<input id="max" type="checkbox" />Max ' +
      '</div>'
    );

    $root.append( '<div class="wv-mod-panel"><div id="chartContainer"></div></div>' );
    $root.append( '<div id="chartFields"></div>' );
  };

  myMethods.onData = function(data, elem) {
    if( elem ) { setHost( elem ); }
    if( !data || typeof data !== 'object' ) {
      return;
    }

    try {
      var threadName = data.threadName;
      if( typeof threadName !== 'string' || !threadName ) {
        return;
      }

      notePacket();

      var thread = null;
      var threadIdx = threadNameToIdxMap[threadName];
      if( threadIdx === undefined ) {
        threadIdx = threads.length;
        thread = {
          "nameToIdxMap": {},
          "time": 0,
          "changed": true,
          "meanData": [],
          "maxData": [],
          "minData": [],
          "show": [],
          "mean": true,
          "min": false,
          "max": false
        };
        threads.push( thread );
        threadNameToIdxMap[threadName] = threadIdx;

        if( threadIdx === 0 ) {
          $host().find( '#chartSelect' ).html( "" );
          currentThread = 0;
        }
        $host().find( '#chartSelect' ).append( $('<option></option>').text( threadName ) );
      } else {
        thread = threads[threadIdx];
      }

      if( Array.isArray( data.sample ) ) {
        thread.time = parseFloat( data.time );
        if( !isFinite( thread.time ) ) {
          thread.time = 0;
        }

        var num_samples = data.sample.length;
        for( var i=0; i<num_samples; ++i ) {
          var sample = data.sample[i];
          if( !sample || typeof sample !== 'object' || typeof sample.name !== 'string' ) {
            continue;
          }
          var idx = thread.nameToIdxMap[sample.name];
          if( idx === undefined ) {
            idx = thread.meanData.length;
            thread.nameToIdxMap[sample.name] = idx;
            thread.meanData[idx] = [];
            thread.minData[idx] = [];
            thread.maxData[idx] = [];

            if( idx < 10 ) {
              thread.show.push( true );
            } else {
              thread.show.push( false );
            }

            if( currentThread == threadIdx ) {
              if( thread.show[idx] ) {
                // Escape name for id/text — use text nodes for display
                var $inp = $('<input type="checkbox" checked="checked" />');
                $inp.attr( 'id', sample.name );
                $host().find( '#chartFields' ).append( $inp ).append( document.createTextNode( sample.name + ' ' ) );
              }
              bindOptionClicks( thread );
            }
          }

          var mean = parseFloat( sample.mean );
          var min = parseFloat( sample.min );
          var max = parseFloat( sample.max );
          if( isFinite( mean ) ) { thread.meanData[idx].push( [thread.time, mean] ); }
          if( isFinite( min ) ) { thread.minData[idx].push( [thread.time, min] ); }
          if( isFinite( max ) ) { thread.maxData[idx].push( [thread.time, max] ); }

          var series = thread.meanData[idx];
          if( series.length ) {
            var num_data = series.length;
            var dt = thread.time - series[0][0];
            while( dt > maxWidth_s && num_data > 0 ) {
              thread.meanData[idx].shift();
              if( thread.minData[idx].length ) { thread.minData[idx].shift(); }
              if( thread.maxData[idx].length ) { thread.maxData[idx].shift(); }
              --num_data;
              if( !thread.meanData[idx].length ) { break; }
              dt = thread.time - thread.meanData[idx][0][0];
            }
          }
        }
      }

      if( currentThread >= 0 && threads[currentThread] && threads[currentThread].changed ) {
        thread = threads[currentThread];
        thread.changed = false;

        var $fields = $host().find( '#chartFields' );
        $fields.html( '' );
        for( var field in thread.nameToIdxMap ) {
          if( !thread.nameToIdxMap.hasOwnProperty( field ) ) { continue; }
          var fidx = thread.nameToIdxMap[field];
          var $cb = $('<input type="checkbox" />');
          $cb.attr( 'id', field );
          if( thread.show[fidx] ) {
            $cb.prop( 'checked', true );
          }
          $fields.append( $cb ).append( document.createTextNode( field + ' ' ) );
        }

        bindOptionClicks( thread );

        var noColumns = 0;
        if( thread.mean ) { noColumns++; }
        if( thread.min ) { noColumns++; }
        if( thread.max ) { noColumns++; }
        chartOptions.legend.noColumns = noColumns;

        plotData = [];
        var name;
        if( thread.mean ) {
          for( name in thread.nameToIdxMap ) {
            if( !thread.nameToIdxMap.hasOwnProperty( name ) ) { continue; }
            var midx = thread.nameToIdxMap[name];
            if( thread.show[midx] ) {
              plotData.push({label: name, data: thread.meanData[midx]});
            }
          }
        }
        if( thread.min ) {
          for( name in thread.nameToIdxMap ) {
            if( !thread.nameToIdxMap.hasOwnProperty( name ) ) { continue; }
            var nidx = thread.nameToIdxMap[name];
            if( thread.show[nidx] ) {
              plotData.push({label: name+" [min]", data: thread.minData[nidx]});
            }
          }
        }
        if( thread.max ) {
          for( name in thread.nameToIdxMap ) {
            if( !thread.nameToIdxMap.hasOwnProperty( name ) ) { continue; }
            var xidx = thread.nameToIdxMap[name];
            if( thread.show[xidx] ) {
              plotData.push({label: name+" [max]", data: thread.maxData[xidx]});
            }
          }
        }
      }

      if( currentThread < 0 || !threads[currentThread] ) {
        return;
      }

      var p = ensurePlot();
      if( !p ) { return; }

      thread = threads[currentThread];
      var xMin = thread.time - maxWidth_s;
      p.getAxes().xaxis.options.min = xMin;
      p.getAxes().xaxis.options.max = xMin + maxWidth_s + 0.1;

      p.setData( plotData );
      p.setupGrid();
      p.draw();
    } catch( e ) {
      console.warn( 'cpuprofile: onData failed', e );
    }
  };

  myMethods.update = function(dt, elem) {
    if( elem ) { setHost( elem ); }
    tickLiveIdle();
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
      `;
  };

})(moduleMethods, moduleSendDataFunc);
