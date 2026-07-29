/*
 * sleep tracking, behaviors, and power save
 * 2026-07: shell host scoping, safe onData (#tab-sleeping)
 */

(function(myMethods, sendData) {

  var hostElem = null;

  function $host() {
    if( hostElem ) {
      return $(hostElem);
    }
    try {
      var el = document.getElementById( 'tab-sleeping' );
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

  myMethods.init = function(elem) {
    setHost( elem );
    $(elem).append('<div id="sleeping-title">Sleeping Status</div>');

    $('<h3 id="sleepDebt">Sleep Debt: Unknown (sent infrequently)</h3>').appendTo( elem );
    $('<h3 id="sleepState">Sleep Cycle: Unknown</h3>').appendTo( elem );
    $('<h3 id="sleepReaction">Sleeping Reaction: Unknown</h3>').appendTo( elem );
    $('<h3 id="sleepReason">Last Sleep Reason: Unknown</h3>').appendTo( elem );
    $('<h3 id="wakeReason">Last Wake Reason: Unknown</h3>').appendTo( elem );
  };

  myMethods.onData = function(data, elem) {
    if( elem ) { setHost( elem ); }
    if( data == null || typeof data !== 'object' ) {
      return;
    }

    try {
      var $root = $host();
      if( data.hasOwnProperty('sleep_debt_hours') ) {
        var debt = parseFloat( data['sleep_debt_hours'] );
        $root.find( '#sleepDebt' ).text(
          'Sleep Debt: ' + (isFinite(debt) ? debt.toFixed(3) : String(data['sleep_debt_hours'])) + ' hours'
        );
      }

      if( data.hasOwnProperty('sleep_cycle') ) {
        $root.find( '#sleepState' ).text( 'Sleep Cycle: ' + data['sleep_cycle'] );
      }

      if( data.hasOwnProperty('reaction_state') ) {
        $root.find( '#sleepReaction' ).text( 'Sleeping Reaction: ' + data['reaction_state'] );
      }

      if( data.hasOwnProperty('last_sleep_reason') ) {
        $root.find( '#sleepReason' ).text( 'Last Sleep Reason: ' + data['last_sleep_reason'] );
      }

      if( data.hasOwnProperty('last_wake_reason') ) {
        $root.find( '#wakeReason' ).text( 'Last Wake Reason: ' + data['last_wake_reason'] );
      }
    } catch( e ) {
      console.warn( 'sleeping: onData failed', e );
    }
  };

  myMethods.update = function(dt, elem) {
    if( elem ) { setHost( elem ); }
  };

  myMethods.getStyles = function() {
    return `
      #sleeping-title {
        font-size:16px;
        margin-bottom:20px;
      }
    `;
  };

})(moduleMethods, moduleSendDataFunc);
