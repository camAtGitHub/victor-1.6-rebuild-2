/*
 * Shows modifiable feature flag status
 * 2026-07: shell host scoping, safe onData, safe sendData (#tab-features)
 * 2026-09: wv-mod chrome; none→default override; error toast without wiping table
 */

(function(myMethods, sendData) {

  var tableBody;
  var hostElem = null;
  var emptyEl = null;
  var liveEl = null;
  var metaEl = null;
  var lastPacketAt = 0;
  var packetCount = 0;

  var kNoneString  = 'none';
  var kEnabledString  = 'enabled';
  var kDisabledString = 'disabled';

  var updateEngineOnDropdownChange = true;

  function $host() {
    if( hostElem ) {
      return $(hostElem);
    }
    try {
      var el = document.getElementById( 'tab-features' );
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

  function safeSend( payload ) {
    try {
      if( typeof sendData === 'function' ) {
        sendData( payload );
      }
    } catch( e ) {
      console.warn( 'features: sendData failed', e );
    }
  }

  function setLiveState(state) {
    if( !liveEl ) { return; }
    liveEl.textContent = state;
    liveEl.className = 'wv-mod-live wv-mod-live--' + state;
  }

  function updateMeta() {
    if( !metaEl ) { return; }
    metaEl.textContent = packetCount ? (packetCount + ' pkt') : '—';
  }

  function notePacket() {
    lastPacketAt = Date.now();
    packetCount += 1;
    setLiveState('live');
    updateMeta();
  }

  function MakeOpt(currValue, optStr) {
    return '<option class="' + optStr +  '"'
      + (currValue == optStr  ? ' selected' : '') + '>'
      + optStr + '</option>';
  }

  function MakeOverrideDropdown(currValue, featureName, defaultValue) {
    var str = '<select class="override" name="' + $('<div/>').text(featureName).html() + '">';
    str += MakeOpt(currValue, kNoneString);
    if( (defaultValue != kEnabledString) || (currValue == kEnabledString) ) {
      str += MakeOpt(currValue, kEnabledString);
    }
    if( (defaultValue != kDisabledString) || (currValue == kDisabledString) ) {
      str += MakeOpt(currValue, kDisabledString);
    }
    str += '</select>';
    return str;
  }

  function ChangeDropdownFonts() {
    $host().find( 'select.override' ).each(function(idx, el){
      var selectedOpt = $(el).find('option:selected').text();
      if( selectedOpt == kEnabledString ) {
        $(el).removeClass('disabled');
        $(el).addClass('enabled');
      } else if( selectedOpt == kDisabledString ) {
        $(el).addClass('disabled');
        $(el).removeClass('enabled');
      } else {
        $(el).removeClass('disabled');
        $(el).removeClass('enabled');
      }
    });
  }

  myMethods.init = function(elem) {
    setHost( elem );
    packetCount = 0;
    lastPacketAt = 0;

    var root = $('<div class="wv-mod"></div>');
    root.append(
      '<header class="wv-mod-header">' +
        '<div class="wv-mod-title-row">' +
          '<h2 class="wv-mod-title">Feature gates</h2>' +
          '<span class="wv-mod-live wv-mod-live--waiting" aria-live="polite">waiting</span>' +
          '<span class="wv-mod-meta">—</span>' +
        '</div>' +
        '<p class="wv-mod-sub">Build defaults and persistent overrides. Overrides are saved on the robot and survive reboot. Some flags apply only after the next boot. Console-var changes appear here after you refresh.</p>' +
      '</header>'
    );
    emptyEl = $('<div class="wv-mod-empty">Waiting for feature gates.</div>').appendTo(root);
    root.append(
      `<div class="wv-mod-panel">
        <table class="wv-mod-table">
          <thead>
            <tr>
              <th>Feature name</th>
              <th>Build default</th>
              <th>Override</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>`
    );
    $('<button type="button" class="wv-mod-btn">Reset feature overrides</button>').click(function(){
      updateEngineOnDropdownChange = false;
      $host().find( "select.override" ).each(function(idx, dropdown) {
        dropdown.selectedIndex = 0;
      });
      updateEngineOnDropdownChange = true;
      safeSend({"type": "reset"});
      ChangeDropdownFonts();
    }).appendTo(root);
    root.appendTo(elem);

    tableBody = $host().find( 'table.wv-mod-table tbody' );
    liveEl = root.find('.wv-mod-live')[0] || null;
    metaEl = root.find('.wv-mod-meta')[0] || null;
    setLiveState('waiting');
    updateMeta();

    $(elem).on('change', 'select.override', function(evt) {
      if( !updateEngineOnDropdownChange ) {
        return;
      }
      var toSend = {"type": "override"};
      toSend["name"] = $(evt.target).attr("name");
      var selected = $(evt.target).find('option:selected').text();
      // C++ cozmoFeatureGate accepts default|enabled|disabled only; UI label stays "none"
      toSend["override"] = (selected === kNoneString) ? "default" : selected;
      safeSend(toSend);
      ChangeDropdownFonts();
    });
  };

  myMethods.onData = function(data, elem) {
    if( elem ) { setHost( elem ); }
    if( data == null ) {
      return;
    }

    try {
      if( typeof data === 'object' && !Array.isArray(data) && data.error === true ) {
        notePacket();
        if( window.WebVizUI && typeof window.WebVizUI.toast === 'function' ) {
          window.WebVizUI.toast("Feature gates", "Could not apply that override", "error");
        }
        return;
      }

      if( !tableBody || !tableBody.length ) {
        tableBody = $host().find( 'table.wv-mod-table tbody' );
      }
      if( !tableBody.length ) { return; }

      if( !Array.isArray(data) ) {
        console.warn( 'features: expected array payload' );
        return;
      }

      notePacket();
      tableBody.empty();

      var rows = data.slice();
      rows.sort(function(a, b){
        if( !a || !b ) { return 0; }
        var nameA = String(a.name || '').toLowerCase();
        var nameB = String(b.name || '').toLowerCase();
        if( nameA < nameB ) {
          return -1;
        } else if( nameA > nameB ) {
          return 1;
        }
        return 0;
      });
      $.each( rows, function( idx, entry ) {
        if( !entry || typeof entry !== 'object' || typeof entry.name !== 'string' ) {
          return;
        }
        var defVal = entry.default != null ? entry.default : kNoneString;
        var overVal = entry.override != null ? entry.override : kNoneString;
        var newRow = $('<tr></tr>').appendTo(tableBody);
        newRow.append($('<td></td>').text( entry.name ));
        newRow.append($('<td></td>').addClass( String(defVal) ).text( String(defVal) ));
        newRow.append($('<td></td>').html( MakeOverrideDropdown(overVal, entry.name, defVal) ));
      });
      ChangeDropdownFonts();
      if( emptyEl && emptyEl.length ) {
        emptyEl.hide();
      }
    } catch( e ) {
      console.warn( 'features: onData failed', e );
    }
  };

  myMethods.update = function(dt, elem) {
    if( elem ) { setHost( elem ); }
    if( lastPacketAt && (Date.now() - lastPacketAt > 3000) ) {
      if( liveEl && liveEl.textContent === 'live' ) {
        setLiveState('idle');
      }
    }
  };

  myMethods.getStyles = function() {
    return `
      select.override {
        width: 90px;
      }

      /*
      colorblind friendly "enabled/disabled" colors below  :D
      these class names should match the constant strings at the top of this file
      */

      td.enabled {
        color: #2C7BB6;
      }
      td.disabled {
        color: #D7191C;
      }
      select.enabled {
        color: white;
        background-color: #2C7BB6;
      }
      select.disabled {
        color: white;
        background-color: #D7191C;
      }
      select.none {
        color: #C8C8C8;
      }
    `;
  };

})(moduleMethods, moduleSendDataFunc);
