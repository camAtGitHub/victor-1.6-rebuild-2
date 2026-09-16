/*
 * Held-in-palm tracker
 * 2026-07: safe onData guard (#tab-heldinpalm)
 * Engine PopulateWebVizJson is empty {}; do not invent isHeldInPalm / trust.
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
    // Keep empty visible: this feed has no fields.
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

  function buildDom( host ) {
    host.innerHTML = '';
    var root = document.createElement( 'div' );
    root.className = 'wv-mod';
    root.innerHTML =
      '<header class="wv-mod-header">' +
      '  <div class="wv-mod-title-row">' +
      '    <h2 class="wv-mod-title">Held in palm</h2>' +
      '    <span class="wv-mod-live wv-mod-live--waiting">waiting</span>' +
      '    <span class="wv-mod-meta">—</span>' +
      '  </div>' +
      '  <p class="wv-mod-sub">Held-in-palm tracker.</p>' +
      '</header>' +
      '<section class="wv-mod-kpis" aria-label="Held-in-palm status">' +
      '  <button type="button" class="wv-mod-kpi" disabled>' +
      '    <span class="wv-mod-kpi-name">—</span>' +
      '    <span class="wv-mod-kpi-val">—</span>' +
      '  </button>' +
      '</section>' +
      '<div class="wv-mod-empty">No held-in-palm fields on this feed.</div>';
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
    } catch( e ) {
      console.warn( 'heldInPalm: onData failed', e );
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
