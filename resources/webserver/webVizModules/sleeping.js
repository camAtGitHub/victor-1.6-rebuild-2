/*
 * sleep tracking, behaviors, and power save
 * 2026-07: shell host scoping, safe onData (#tab-sleeping)
 * Wire: sleep_debt_hours (SleepTracker) + sleep_cycle / reaction_state /
 * last_sleep_reason / last_wake_reason (BehaviorSleepCycle, when activated)
 */

(function(myMethods, sendData) {

  var KPI_COUNT = 5;
  var hostElem = null;
  var els = null;
  var lastPacketAt = 0;
  var packetCount = 0;
  var kpiResizeBound = false;

  function setHost( el ) {
    if( !el ) { return; }
    if( el.jquery ) {
      hostElem = el[0] || hostElem;
    } else if( el.nodeType ) {
      hostElem = el;
    }
  }

  function setLiveState( state ) {
    if( !els || !els.live ) { return; }
    els.live.textContent = state;
    els.live.className = 'wv-mod-live wv-mod-live--' + state;
  }

  function updateMeta() {
    if( !els || !els.meta ) { return; }
    els.meta.textContent = packetCount ? (packetCount + ' pkt') : '—';
  }

  function notePacket() {
    lastPacketAt = Date.now();
    packetCount++;
    setLiveState( 'live' );
    updateMeta();
    if( els && els.empty ) {
      els.empty.style.display = 'none';
    }
  }

  function layoutKpiGrid() {
    if( !els || !els.kpis ) { return; }
    var n = KPI_COUNT;
    var w =
      (typeof window !== 'undefined' && window.innerWidth) ||
      (document.documentElement && document.documentElement.clientWidth) ||
      0;
    var cols;
    if( w > 0 && w < 640 ) {
      cols = Math.min( 2, n );
    } else if( w > 0 && w < 2400 ) {
      cols = Math.max( 1, Math.ceil( n / 2 ) );
    } else {
      cols = n;
    }
    els.kpis.style.display = 'grid';
    els.kpis.style.gap = '8px';
    els.kpis.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0,1fr))';
  }

  function setKpi( name, value ) {
    if( !els || !els.kpis ) { return; }
    var node = els.kpis.querySelector( '[data-kpi="' + name + '"] .wv-mod-kpi-val' );
    if( !node ) { return; }
    if( value == null || value === '' ) {
      node.textContent = '—';
    } else {
      node.textContent = String( value );
    }
  }

  function kpiButton( name ) {
    return '<button type="button" class="wv-mod-kpi" disabled data-kpi="' + name + '">' +
      '<span class="wv-mod-kpi-name">' + name + '</span>' +
      '<span class="wv-mod-kpi-val">—</span>' +
      '</button>';
  }

  function buildDom( host ) {
    host.innerHTML = '';
    var root = document.createElement( 'div' );
    root.className = 'wv-mod';
    root.innerHTML =
      '<header class="wv-mod-header">' +
      '  <div class="wv-mod-title-row">' +
      '    <h2 class="wv-mod-title">Sleep</h2>' +
      '    <span class="wv-mod-live wv-mod-live--waiting">waiting</span>' +
      '    <span class="wv-mod-meta">—</span>' +
      '  </div>' +
      '  <p class="wv-mod-sub">Sleep cycle, debt, and the last reasons for sleeping and waking.</p>' +
      '</header>' +
      '<section class="wv-mod-kpis" aria-label="Sleep status">' +
      kpiButton( 'sleep_debt_hours' ) +
      kpiButton( 'sleep_cycle' ) +
      kpiButton( 'reaction_state' ) +
      kpiButton( 'last_sleep_reason' ) +
      kpiButton( 'last_wake_reason' ) +
      '</section>' +
      '<div class="wv-mod-empty">Waiting for sleep status.</div>';
    host.appendChild( root );
    els = {
      root: root,
      live: root.querySelector( '.wv-mod-live' ),
      meta: root.querySelector( '.wv-mod-meta' ),
      kpis: root.querySelector( '.wv-mod-kpis' ),
      empty: root.querySelector( '.wv-mod-empty' )
    };
    layoutKpiGrid();
    if( !kpiResizeBound ) {
      kpiResizeBound = true;
      window.addEventListener( 'resize', layoutKpiGrid );
    }
    setLiveState( 'waiting' );
    updateMeta();
  }

  myMethods.init = function(elem) {
    setHost( elem );
    lastPacketAt = 0;
    packetCount = 0;
    if( !hostElem ) { return; }
    buildDom( hostElem );
  };

  myMethods.onData = function(data, elem) {
    if( elem ) { setHost( elem ); }
    if( data == null || typeof data !== 'object' ) {
      return;
    }

    try {
      if( !els ) { return; }
      notePacket();

      if( data.hasOwnProperty( 'sleep_debt_hours' ) ) {
        var debt = parseFloat( data['sleep_debt_hours'] );
        setKpi(
          'sleep_debt_hours',
          isFinite( debt ) ? debt.toFixed( 3 ) : String( data['sleep_debt_hours'] )
        );
      }
      if( data.hasOwnProperty( 'sleep_cycle' ) ) {
        setKpi( 'sleep_cycle', data['sleep_cycle'] );
      }
      if( data.hasOwnProperty( 'reaction_state' ) ) {
        setKpi( 'reaction_state', data['reaction_state'] );
      }
      if( data.hasOwnProperty( 'last_sleep_reason' ) ) {
        setKpi( 'last_sleep_reason', data['last_sleep_reason'] );
      }
      if( data.hasOwnProperty( 'last_wake_reason' ) ) {
        setKpi( 'last_wake_reason', data['last_wake_reason'] );
      }
    } catch( e ) {
      console.warn( 'sleeping: onData failed', e );
    }
  };

  myMethods.update = function(dt, elem) {
    if( elem ) { setHost( elem ); }
    if( lastPacketAt && (Date.now() - lastPacketAt > 3000) ) {
      if( els && els.live && els.live.textContent === 'live' ) {
        setLiveState( 'idle' );
      }
    }
  };

  myMethods.getStyles = function() {
    return '';
  };

})(moduleMethods, moduleSendDataFunc);
