/*
 * Shows modifiable feature flag status
 * 2026-07: shell host scoping, safe onData, safe sendData (#tab-features)
 */

(function(myMethods, sendData) {

  var tableBody;
  var hostElem = null;

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

    $(elem).append($('<div>Note that feature overrides will persist across robot reboots! Some features may not take effect until the next reboot.</div>'));
    $(elem).append($('<div>Also, if you modify feature flags using console vars, this tab may not be updated until you refresh this page.</div>'));

    $(`<div class="table">
        <div class="thead">
          <div class="table-row">
            <div class="table-heading">Feature name</div>
            <div class="table-heading">Build default</div>
            <div class="table-heading">Override</div>
          </div>
        </div>
        <div class="tbody"></div>
      </div>
    `).appendTo(elem);
    tableBody = $host().find( 'div.tbody' );

    $(elem).on('change', 'select.override', function(evt) {
      if( !updateEngineOnDropdownChange ) {
        return;
      }
      var toSend = {"type": "override"};
      toSend["name"] = $(evt.target).attr("name");
      toSend["override"] = $(evt.target).find('option:selected').text();
      safeSend(toSend);
      ChangeDropdownFonts();
    });
    $('<input type="button" value="Reset feature overrides" />').click(function(){
      updateEngineOnDropdownChange = false;
      $host().find( "select.override" ).each(function(idx, dropdown) {
        dropdown.selectedIndex = 0;
      });
      updateEngineOnDropdownChange = true;
      safeSend({"type": "reset"});
      ChangeDropdownFonts();
    }).appendTo(elem);
  };

  myMethods.onData = function(data, elem) {
    if( elem ) { setHost( elem ); }
    if( data == null ) {
      return;
    }

    try {
      if( !tableBody || !tableBody.length ) {
        tableBody = $host().find( 'div.tbody' );
      }
      if( !tableBody.length ) { return; }

      tableBody.empty();
      if( !Array.isArray(data) ) {
        console.warn( 'features: expected array payload' );
        return;
      }

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
        var newRow = $('<div class="table-row"></div>').appendTo(tableBody);
        newRow.append($('<div class="table-cell"></div>').text( entry.name ));
        newRow.append($('<div class="table-cell"></div>').addClass( String(defVal) ).text( String(defVal) ));
        newRow.append($('<div class="table-cell">' + MakeOverrideDropdown(overVal, entry.name, defVal) + '</div>'));
      });
      ChangeDropdownFonts();
    } catch( e ) {
      console.warn( 'features: onData failed', e );
    }
  };

  myMethods.update = function(dt, elem) {
    if( elem ) { setHost( elem ); }
  };

  myMethods.getStyles = function() {
    return `
      div.table {
        display: table;
        width:100%;
        margin-top:20px;
        margin-bottom:10px;
      }

      div.table > div.thead {
        display: table-header-group;
      }

      div.table > div.tbody {
        display: table-row-group;
      }

      div.table > div.thead > div.table-row,
      div.table > div.tbody > div.table-row {
        display: table-row;
      }

      div.table > div.thead > div.table-row > div.table-heading {
        display: table-cell;
        font-weight: bold;
        padding-bottom: 5px;
      }

      div.table > div.tbody > div.table-row > div.table-cell {
        display: table-cell;
        padding-bottom: 5px;
      }

      select {
        width: 90px;
      }

      input {
        height:20px;
        width:190px;
      }

      /*
      colorblind friendly "enabled/disabled" colors below  :D
      these class names should match the constant strings at the top of this file
      */

      div.enabled {
        color: #2C7BB6;
      }
      div.disabled {
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
