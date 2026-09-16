/*
 * power state and control
 * 2026-07: safe onData, safe sendData (#tab-power)
 * Wire: powerSaveEnabled, powerSaveRequesters (powerStateManager.cpp)
 */

(function(myMethods, sendData) {

  var KPI_COUNT = 2;
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
      console.warn( 'power: sendData failed', e );
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
      '    <h2 class="wv-mod-title">Power save</h2>' +
      '    <span class="wv-mod-live wv-mod-live--waiting">waiting</span>' +
      '    <span class="wv-mod-meta">—</span>' +
      '  </div>' +
      '  <p class="wv-mod-sub">Whether this process has requested power-save, and who asked.</p>' +
      '</header>' +
      '<section class="wv-mod-kpis" aria-label="Power-save status">' +
      kpiButton( 'powerSaveEnabled' ) +
      kpiButton( 'powerSaveRequesters' ) +
      '</section>' +
      '<div class="wv-mod-empty">Waiting for power-save status.</div>' +
      '<div class="power-btns">' +
      '  <button type="button" class="wv-mod-btn" data-act="enable">Enable power save</button>' +
      '  <button type="button" class="wv-mod-btn" data-act="disable">Disable power save</button>' +
      '</div>';
    host.appendChild( root );
    els = {
      root: root,
      live: root.querySelector( '.wv-mod-live' ),
      meta: root.querySelector( '.wv-mod-meta' ),
      kpis: root.querySelector( '.wv-mod-kpis' ),
      empty: root.querySelector( '.wv-mod-empty' )
    };
    $(root).find( '[data-act="enable"]' ).on( 'click', function() {
      safeSend({ 'enablePowerSave' : 'true' });
    });
    $(root).find( '[data-act="disable"]' ).on( 'click', function() {
      safeSend({ 'enablePowerSave' : 'false' });
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
      if( data.hasOwnProperty( 'powerSaveEnabled' ) ) {
        setKpi( 'powerSaveEnabled', data['powerSaveEnabled'] );
      }
      if( data.hasOwnProperty( 'powerSaveRequesters' ) ) {
        setKpi( 'powerSaveRequesters', data['powerSaveRequesters'] );
      }
    } catch( e ) {
      console.warn( 'power: onData failed', e );
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
      .power-btns {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
    `;
  };

})(moduleMethods, moduleSendDataFunc);
