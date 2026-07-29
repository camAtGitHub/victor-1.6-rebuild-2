/**
 * File: visionScheduleMediator.js
 *
 * Author: Sam Russell
 * Date:   2/24/2018
 *
 * Description:  basic javascript file for displaying VisionMode Schedule info in WebViz
 * 2026-07: shell host scoping, safe onData (#tab-visionschedulemediator)
 *
 * Copyright: Anki, Inc. 2016
 **/

(function(myMethods, sendData) {

  var canvasHeight = 500;
  var canvasWidth = 900;
  var labelWidth = 300;
  var rowHeight = 20;
  var hostElem = null;

  function $host() {
    if( hostElem ) {
      return $(hostElem);
    }
    try {
      var el = document.getElementById( 'tab-visionschedulemediator' );
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

  function canvasEl() {
    return $host().find( '#vsmCanvas' )[0] || null;
  }

  function drawVisionScheduleGrid(rows, cols) {
    var canvas = canvasEl();
    if( !canvas ) { return; }
    var context = canvas.getContext( "2d" );
    if( !context ) { return; }

    var frameWidth = (canvasWidth - labelWidth) / cols;

    context.beginPath();
    context.fillStyle = "white";
    context.lineWidth = 2;
    context.strokeStyle = "black";
    for( var row = 0; row < rows; row++ ) {
      for( var column = 0; column < cols; column++ ) {
        var x = column * frameWidth;
        var y = row * rowHeight;
        context.rect(x, y, frameWidth, rowHeight);
        context.fill();
        context.stroke();
      }
    }
    context.closePath();
  }

  myMethods.init = function(elem) {
    setHost( elem );

    if( location.port != '8888' ) {
      $('<h3>You must use this tab with the engine process (port 8888)</h3>').appendTo(elem);
      return;
    }

    $('<canvas></canvas>', {id: 'vsmCanvas'}).appendTo(elem);

    var canvas = canvasEl();
    if( !canvas ) { return; }
    canvas.height = canvasHeight;
    canvas.width = canvasWidth;

    var context = canvas.getContext("2d");
    if( context ) {
      context.font="normal 18px Arial";
      context.textBaseline="top";
      context.textAlign = "start";
      context.fillStyle = '#000000';
      context.fillText( "Waiting on Data...", 0, 0);
    }
  };

  myMethods.onData = function(data, elem) {
    if( elem ) { setHost( elem ); }
    if( !data || typeof data !== 'object' ) {
      return;
    }

    try {
      var canvas = canvasEl();
      if( !canvas ) { return; }
      var context = canvas.getContext( "2d" );
      if( !context ) { return; }

      var numActiveModes = parseInt( data.numActiveModes, 10 );
      var patternWidth = parseInt( data.patternWidth, 10 );
      if( !isFinite( numActiveModes ) || numActiveModes < 0 ) { return; }
      if( !isFinite( patternWidth ) || patternWidth <= 0 ) { return; }

      context.clearRect(0, 0, canvas.width, canvas.height);
      drawVisionScheduleGrid(numActiveModes, patternWidth);

      var frameWidth = (canvasWidth - labelWidth) / patternWidth;
      var fillSquareWidth = frameWidth * 0.8;
      var fillSquareWidthOffset = (frameWidth - fillSquareWidth) / 2.0;
      var fillSquareHeight = rowHeight * 0.8;
      var fillSquareHeightOffset = (rowHeight - fillSquareHeight) / 2.0;

      context.font="normal 18px Arial";
      context.textBaseline="top";
      context.textAlign = "start";
      var textSpacing = 10;
      var textHeight = rowHeight * 0.8;
      var textYOffset = (rowHeight - textHeight) / 2.0;
      var labelX = canvasWidth - labelWidth + textSpacing;

      var fullSchedule = Array.isArray( data.fullSchedule ) ? data.fullSchedule : [];

      for( var i = 0; i < numActiveModes; i++ ) {
        var modeSchedule = fullSchedule[i];
        if( !modeSchedule || typeof modeSchedule !== 'object' ) { continue; }
        var updatePeriod = parseInt( modeSchedule.updatePeriod, 10 );
        var offset = parseInt( modeSchedule.offset, 10 );
        if( !isFinite( updatePeriod ) || updatePeriod <= 0 ) { continue; }
        if( !isFinite( offset ) ) { offset = 0; }

        var ypos = i * rowHeight;
        var labelY = ypos + textYOffset;
        context.fillStyle = '#000000';
        context.fillText( modeSchedule.visionMode != null ? String(modeSchedule.visionMode) : '', labelX, labelY);

        for( var j = offset; j < patternWidth; j += updatePeriod ) {
          var xpos = j * frameWidth;
          context.fillStyle = "grey";
          context.fillRect(xpos + fillSquareWidthOffset,
                           ypos + fillSquareHeightOffset,
                           fillSquareWidth,
                           fillSquareHeight);
        }
      }
    } catch( e ) {
      console.warn( 'visionScheduleMediator: onData failed', e );
    }
  };

  myMethods.update = function(dt, elem) {
    if( elem ) { setHost( elem ); }
  };

  myMethods.getStyles = function() {
    return "";
  };

})(moduleMethods, moduleSendDataFunc);
