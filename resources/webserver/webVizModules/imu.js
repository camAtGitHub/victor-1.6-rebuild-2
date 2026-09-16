/*
 * imu information tracking tab
 * 2026-07: safe onData (#tab-imu); fixed shared var name collision with touch
 * Wire: fall_impact_count only (robotToEngineImplMessaging.cpp)
 */

(function(myMethods, sendData) {

  var KPI_COUNT = 1;
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

  function buildDom( host ) {
    host.innerHTML = '';
    var root = document.createElement( 'div' );
    root.className = 'wv-mod';
    root.innerHTML =
      '<header class="wv-mod-header">' +
      '  <div class="wv-mod-title-row">' +
      '    <h2 class="wv-mod-title">Fall impacts</h2>' +
      '    <span class="wv-mod-live wv-mod-live--waiting">waiting</span>' +
      '    <span class="wv-mod-meta">—</span>' +
      '  </div>' +
      '  <p class="wv-mod-sub">Count of body-IMU fall impacts this session.</p>' +
      '</header>' +
      '<section class="wv-mod-kpis" aria-label="Fall impact count">' +
      '  <button type="button" class="wv-mod-kpi" disabled data-kpi="fall_impact_count">' +
      '    <span class="wv-mod-kpi-name">fall_impact_count</span>' +
      '    <span class="wv-mod-kpi-val">—</span>' +
      '  </button>' +
      '</section>' +
      '<div class="wv-mod-empty">No fall impacts reported yet.</div>';
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
    if( !data || typeof data !== 'object' ) {
      return;
    }

    try {
      if( !els ) { return; }
      notePacket();
      if( data.hasOwnProperty( 'fall_impact_count' ) ) {
        setKpi( 'fall_impact_count', data['fall_impact_count'] );
      }
    } catch( e ) {
      console.warn( 'imu: onData failed', e );
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
