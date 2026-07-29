/*
 * Lists observed objects
 * 2026-07: safe onData guard (#tab-observedobjects)
 */

(function(myMethods, sendData) {

  var kFace = '&#x1F468';
  var kCube = '&#x25A6;';

  var faceList;
  var cubeList;
  var hostElem = null;

  function setHost( el ) {
    if( !el ) { return; }
    if( el.jquery ) {
      hostElem = el[0] || hostElem;
    } else if( el.nodeType ) {
      hostElem = el;
    }
  }

  function sortListById(list) {
    if( !list || !list.length ) { return; }
    var elems = list.children('div');

    elems.sort( function(a,b){
      var aId = a.getAttribute('data-id');
      var bId = b.getAttribute('data-id');

      if(aId > bId) {
        return 1;
      }
      else if(aId < bId) {
        return -1;
      } else {
        return 0;
      }
    });
    elems.detach().appendTo(list);
  }

  myMethods.init = function(elem) {
    setHost( elem );
    var bigStyle = {class: 'bigUnicode'};
    var faceContainer = $('<div class="tableContainer"></div>').appendTo(elem);
    var cubeContainer = $('<div class="tableContainer"></div>').appendTo(elem);

    $('<div></div>', bigStyle).appendTo(faceContainer).html(kFace + "'s");
    faceList = $('<div id="faceList"></div>').appendTo(faceContainer);

    $('<div></div>', bigStyle).appendTo(cubeContainer).html(kCube + "'s");
    cubeList = $('<div id="cubeList"></div>').appendTo(cubeContainer);
  };

  myMethods.onData = function(data, elem) {
    if( elem ) { setHost( elem ); }
    if( !data || typeof data !== 'object' ) {
      return;
    }

    try {
      if( data["type"] == "RobotObservedFace" ) {
        if( !faceList || !faceList.length ) { return; }
        var shouldSort = false;
        var faceId = data["faceID"];
        if( faceId == null ) { return; }
        var faceElem = faceList.find('div[data-id="' + faceId + '"]');
        if( faceElem.length == 0 ) {
          faceElem = $('<div></div>', {class:'faceBlock'}).appendTo(faceList);
          faceElem.attr('data-id', faceId);
          shouldSort = true;
        } else {
          faceElem.empty();
        }
        faceElem.append('<p>id: ' + faceId + '</p>')
                .append('<p>t: ' + (data["timestamp"] != null ? data["timestamp"] : '') + '</p>')
                .append('<p>origin: ' + (data["originID"] != null ? data["originID"] : '') + '</p>');
        if( typeof data.name !== 'undefined' ) {
          faceElem.append($('<p></p>').text( 'name: ' + data["name"] ));
        }
        if( shouldSort ) {
          sortListById( faceList );
        }
      }
      else if( data["type"] == "RobotDeletedFace" ) {
        if( !faceList || !faceList.length ) { return; }
        var delFace = faceList.find('div[data-id="' + data["faceID"] + '"]');
        if( delFace.length != 0 ) {
          delFace.remove();
        }
      }
      else if( data["type"] == "RobotObservedObject" ) {
        if( !cubeList || !cubeList.length ) { return; }
        var shouldSortObj = false;
        var objectID = data["objectID"];
        if( objectID == null ) { return; }
        var cubeElem = cubeList.find('div[data-id="' + objectID + '"]');
        if( cubeElem.length == 0 ) {
          cubeElem = $('<div></div>', {class:'objectBlock'}).appendTo(cubeList);
          cubeElem.attr('data-id', objectID);
          shouldSortObj = true;
        } else {
          cubeElem.empty();
        }
        cubeElem.append('<p>id: ' + objectID + '</p>')
                .append('<p>t: ' + (data["timestamp"] != null ? data["timestamp"] : '') + '</p>')
                .append('<p>type: ' + (data["objectType"] != null ? data["objectType"] : '') + '</p>')
                .append('<p>active: ' + (data["isActive"] != null ? data["isActive"] : '') + '</p>');
        if( shouldSortObj ) {
          sortListById( cubeList );
        }
      }
      else if( data["type"] == "RobotDeletedLocatedObject" ) {
        if( !cubeList || !cubeList.length ) { return; }
        var delCube = cubeList.find('div[data-id="' + data["objectID"] + '"]');
        if( delCube.length != 0 ) {
          delCube.remove();
        }
      }
    } catch( e ) {
      console.warn( 'observedObjects: onData failed', e );
    }
  };

  myMethods.update = function(dt, elem) {
    if( elem ) { setHost( elem ); }
  };

  myMethods.getStyles = function() {
    return `
      .bigUnicode {
        font-size:20px;
      }
      .bigUnicode:not(:first-child) {
        margin-top:20px;
      }

      .tableContainer {
        display: table;
        border-collapse: separate;
        border-spacing: 10px;
      }

      #cubeList,
      #faceList {
        display: table-row;
        margin-bottom:20px;
      }

      #cubeList div,
      #faceList div {
        border: 1px solid black;
        height:30px;
        display: table-cell;
        padding:5px;
      }
    `;
  };

})(moduleMethods, moduleSendDataFunc);
