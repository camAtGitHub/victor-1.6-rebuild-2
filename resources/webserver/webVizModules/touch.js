/*
 * touch state and control system
 * 2026-07: safe onData, safe sendData (#tab-touch)
 * Wire: esn, osVersion, enabled, count, calibrated
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

  function safeSend( payload ) {
    try {
      if( typeof sendData === 'function' ) {
        sendData( payload );
      }
    } catch( e ) {
      console.warn( 'touch: sendData failed', e );
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
      '    <h2 class="wv-mod-title">Touch</h2>' +
      '    <span class="wv-mod-live wv-mod-live--waiting">waiting</span>' +
      '    <span class="wv-mod-meta">—</span>' +
      '  </div>' +
      '  <p class="wv-mod-sub">Backpack capacitive touch: count, calibration, and enable.</p>' +
      '</header>' +
      '<section class="wv-mod-kpis" aria-label="Touch status">' +
      kpiButton( 'esn' ) +
      kpiButton( 'osVersion' ) +
      kpiButton( 'enabled' ) +
      kpiButton( 'count' ) +
      kpiButton( 'calibrated' ) +
      '</section>' +
      '<div class="wv-mod-empty">Waiting for touch status.</div>' +
      '<div class="touch-btns">' +
      '  <button type="button" class="wv-mod-btn" data-act="disable">Disable touch sensor</button>' +
      '  <button type="button" class="wv-mod-btn" data-act="enable">Enable touch sensor</button>' +
      '  <button type="button" class="wv-mod-btn" data-act="reset">Reset touch count</button>' +
      '</div>';
    host.appendChild( root );
    els = {
      root: root,
      live: root.querySelector( '.wv-mod-live' ),
      meta: root.querySelector( '.wv-mod-meta' ),
      kpis: root.querySelector( '.wv-mod-kpis' ),
      empty: root.querySelector( '.wv-mod-empty' )
    };
    $(root).find( '[data-act="disable"]' ).on( 'click', function() {
      safeSend({ 'enabled' : 'false' });
    });
    $(root).find( '[data-act="enable"]' ).on( 'click', function() {
      safeSend({ 'enabled' : 'true' });
    });
    $(root).find( '[data-act="reset"]' ).on( 'click', function() {
      safeSend({ 'resetCount' : 'true' });
    });
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
      if( data.hasOwnProperty( 'esn' ) ) {
        setKpi( 'esn', data['esn'] );
      }
      if( data.hasOwnProperty( 'osVersion' ) ) {
        setKpi( 'osVersion', data['osVersion'] );
      }
      if( data.hasOwnProperty( 'enabled' ) ) {
        setKpi( 'enabled', data['enabled'] );
      }
      if( data.hasOwnProperty( 'count' ) ) {
        setKpi( 'count', data['count'] );
      }
      if( data.hasOwnProperty( 'calibrated' ) ) {
        setKpi( 'calibrated', data['calibrated'] );
      }
    } catch( e ) {
      console.warn( 'touch: onData failed', e );
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
    return `
      .touch-btns {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
    `;
  };

})(moduleMethods, moduleSendDataFunc);
