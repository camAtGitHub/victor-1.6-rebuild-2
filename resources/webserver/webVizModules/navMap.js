/*  
 *  NavMap viz
 *  ross
 *  april 13 2018
 *  Copyright Anki, Inc. 2018
 *
 *  2026: orbit camera, 3D rendering fixes, data-path bugfixes
 */

(function(myMethods, sendData) {

  // for debugging:
  var dumpInput = false; // print all input the engine sends
  var showFakeDataUponDisconnect = false;

  // Y-flip origin used so screen left/right matches robot left/right
  var kArbitraryXAxis = 5000; // mm
  var kArbitraryXAxis_m = kArbitraryXAxis * 0.001; // meters

  // ---------- math helpers ----------

  function Vector( x, y, z ) {
    this.x = 1.0 * x;
    this.y = 1.0 * y;
    this.z = 1.0 * z;
  }
  Vector.prototype.clone = function() {
    return new Vector( this.x, this.y, this.z );
  };
  Vector.prototype.getLength = function() {
    return Math.sqrt( this.x*this.x + this.y*this.y + this.z*this.z );
  };
  Vector.prototype.makeUnitLength = function() {
    var length = this.getLength();
    if( length === 0.0 ) {
      this.x = 0.0; this.y = 0.0; this.z = 0.0;
    } else {
      this.x /= length; this.y /= length; this.z /= length;
    }
    return this;
  };
  Vector.prototype.cross = function( v ) {
    return new Vector(
      this.y*v.z - this.z*v.y,
      this.z*v.x - this.x*v.z,
      this.x*v.y - this.y*v.x
    );
  };
  Vector.prototype.dot = function( v ) {
    return this.x*v.x + this.y*v.y + this.z*v.z;
  };
  Vector.prototype.getScaled = function( a ) {
    return this.clone().scale( a );
  };
  Vector.prototype.getAfterAdd = function( v ) {
    return this.clone().add( v );
  };
  Vector.prototype.scale = function( a ) {
    this.x *= a; this.y *= a; this.z *= a;
    return this;
  };
  Vector.prototype.add = function( v ) {
    this.x += v.x; this.y += v.y; this.z += v.z;
    return this;
  };
  Vector.prototype.sub = function( v ) {
    this.x -= v.x; this.y -= v.y; this.z -= v.z;
    return this;
  };

  function Point( x, y ) {
    this.x = x;
    this.y = y;
  }

  function Color( r, g, b, a ) {
    this.r = r;
    this.g = g;
    this.b = b;
    this.a = (typeof a === 'undefined') ? 255 : a;
  }

  // Flip world Y so viz left/right matches robot left/right (consistent mm/m).
  function flipY_mm( yMm ) { return kArbitraryXAxis - yMm; }
  function flipY_m( yM )   { return kArbitraryXAxis_m - yM; }


  // webviz (2018) may pass a raw DOM node or a jQuery object
  function asJq( el ) {
    if( !el ) { return $(); }
    if( el.jquery ) { return el; }           // already jQuery
    if( typeof el === 'string' ) { return $(el); }
    return $(el);                             // HTMLElement / Document
  }


  // ---------- DOM / session state ----------

  var updateBtn;
  var canvasContainer;
  var legendContainer;
  var noteDiv;
  var autoUpdate = false;
  var waitingOnData = false;
  var is3D = false;
  // p5 WEBGL needs the camera up-vector flipped for a correct tabletop view.
  // "Flip view" checkbox; default on (confirmed correct for this stack).
  var invertHeight = true;
  // Fixed yaw so default 3D view matches 2D orientation.
  // -90° was the correct direction; another -90° squares it up (−180° total).
  var kMapYaw3D = -Math.PI;

  function callUpdate() {
    waitingOnData = true;
    if( updateBtn ) {
      updateBtn.prop( 'disabled', true );
    }
    sendData( { 'update': true } );
    if( $('#status').length &&
        ($('#status').text() != "Connected") &&
        showFakeDataUponDisconnect &&
        (typeof noteDiv !== 'undefined') )
    {
      noteDiv.text( 'DISCONNECTED: DISPLAYING FAKE DATA' );
      fakeData();
    }
  }

  // ---------- quadtree / robot / objects ----------

  var memoryMapQuadInfoVectorMapIncoming = {}; // origin => { seqNum => quads }
  var memoryMapInfo = {}; // origin => map info
  var quadTreeQuads = [];
  var dataExtentsInfo = {};
  var cubeData;
  var faceData = {};
  var robotPosition;

  function SimpleQuad( center, sideSize, color ) {
    this.center = center;
    this.sideSize = sideSize;
    this.color = color;
  }

  function getQuadColor( content ) {
    var color = new Color( 0, 0, 0 );
    switch( content )
    {
      case 'Unknown'                : { color = new Color(  77,  77,  77,  51 ); break; } // DARKGRAY  alpha=0.2
      case 'ClearOfObstacle'        : { color = new Color(   0, 255,   0, 127 ); break; } // GREEN     alpha=0.5
      case 'ClearOfCliff'           : { color = new Color(   0, 127,   0, 204 ); break; } // DARKGREEN alpha=0.8
      case 'ObstacleCube'           : { color = new Color( 255,   0,   0, 127 ); break; } // RED       alpha=0.5
      case 'ObstacleCharger'        : { color = new Color( 255, 127,   0, 127 ); break; } // ORANGE    alpha=0.5
      case 'ObstacleProx'           : { color = new Color(   0, 255, 255, 127 ); break; } // CYAN      alpha=0.5
      case 'ObstacleProxExplored'   : { color = new Color(   0,   0, 255, 255 ); break; } // BLUE      alpha=1.0
      case 'ObstacleUnrecognized'   : { color = new Color(   0,   0,   0, 127 ); break; } // BLACK     alpha=0.5
      case 'Cliff'                  : { color = new Color(   0,   0,   0, 204 ); break; } // BLACK     alpha=0.8
      case 'InterestingEdge'        : { color = new Color( 255,   0, 255, 127 ); break; } // MAGENTA   alpha=0.5
      case 'NotInterestingEdge'     : { color = new Color( 255,  20, 148, 204 ); break; } // PINK      alpha=0.8
    }
    return color;
  }

  // duplicates the code in physVizController
  function MemoryMapNode( depth, size_m, center ) {
    this.depth = depth;
    this.size_m = size_m;
    this.center = center;
    this.nextChild = 0;
    this.children = [];

    this.AddChild = function( destSimpleQuads, extentsInfo, content, depth ) {
      if( this.depth == depth ) {
        var half = 0.5 * this.size_m;
        var color = getQuadColor( content );
        if( this.center.x - half < extentsInfo.minX ) { extentsInfo.minX = this.center.x - half; }
        if( this.center.x + half > extentsInfo.maxX ) { extentsInfo.maxX = this.center.x + half; }
        if( this.center.y - half < extentsInfo.minY ) { extentsInfo.minY = this.center.y - half; }
        if( this.center.y + half > extentsInfo.maxY ) { extentsInfo.maxY = this.center.y + half; }
        destSimpleQuads.push( new SimpleQuad( this.center, this.size_m, color ) );
        return true;
      }

      if( this.children.length === 0 ) {
        var nextDepth = this.depth - 1;
        var nextSize = this.size_m * 0.5;
        var offset = nextSize * 0.5;

        this.children.push( new MemoryMapNode( nextDepth, nextSize, new Point( this.center.x + offset, this.center.y + offset ) ) );
        this.children.push( new MemoryMapNode( nextDepth, nextSize, new Point( this.center.x + offset, this.center.y - offset ) ) );
        this.children.push( new MemoryMapNode( nextDepth, nextSize, new Point( this.center.x - offset, this.center.y + offset ) ) );
        this.children.push( new MemoryMapNode( nextDepth, nextSize, new Point( this.center.x - offset, this.center.y - offset ) ) );
      }

      if( this.children[this.nextChild].AddChild( destSimpleQuads, extentsInfo, content, depth ) ) {
        ++this.nextChild;
      }

      return (this.nextChild > 3);
    };
  }


  /** True if this browser can create a WebGL context (software OK). */
  function webglAvailable() {
    try {
      var canvas = document.createElement( 'canvas' );
      var attrs = { alpha: true, failIfMajorPerformanceCaveat: false };
      var gl = canvas.getContext( 'webgl', attrs ) ||
               canvas.getContext( 'experimental-webgl', attrs );
      if( !gl ) { return false; }
      // Free the test context so we don't exhaust driver slots
      var lose = gl.getExtension && gl.getExtension( 'WEBGL_lose_context' );
      if( lose ) { lose.loseContext(); }
      return true;
    } catch( e ) {
      return false;
    }
  }

  function showWebGLError( parentElem ) {
    var msg = '3D unavailable: this browser could not create a WebGL context ' +
              '(no GPU / driver, remote session, or WebGL disabled). Staying in 2D.';
    console.warn( 'navMap: ' + msg );
    var $parent = asJq( parentElem );
    if( $parent.length ) {
      $parent.find( '.navMapWebGLError' ).remove();
      $('<div class="navMapWebGLError"></div>')
        .text( msg )
        .css({
          color: '#f66',
          background: '#2a1515',
          border: '1px solid #633',
          padding: '8px 10px',
          margin: '8px 0',
          fontSize: '12px',
          maxWidth: '700px'
        })
        .prependTo( $parent );
    }
  }

  // ---------- viz ----------

  var myp5;
  var vizDirty = false;
  var mapBakeDirty = true; // rebuild top-down map texture when quads change
  var cameraResetPending = false; // one-shot 3D camera fit after data / mode change

  /** Schedule a paint without spinning requestAnimationFrame forever. */
  function kickRedraw() {
    vizDirty = true;
    if( myp5 && typeof myp5.redraw === 'function' ) {
      try { myp5.redraw(); } catch( e ) {}
    }
  }
  var shouldDrawRobot = true;
  var shouldDrawCubes = true;
  var shouldDrawFaces = false;
  var kKnownTypes = [
    'Unknown','ClearOfObstacle','ClearOfCliff','ObstacleCube','ObstacleCharger',
    'ObstacleProx','ObstacleProxExplored','ObstacleUnrecognized','Cliff',
    'InterestingEdge','NotInterestingEdge'
  ];

  /**
   * 3D uses p5's native Y-up space + orbitControl (no custom camera()).
   * Custom camera() with a near-vertical lookAt was flipping the view into a "ceiling".
   *
   *   p5X = mapX - originX
   *   p5Y = mapZ  (height, +Y = up / sky)
   *   p5Z = mapY - originY
   */
  function mapOriginMm() {
    if( typeof dataExtentsInfo.minX === 'undefined' ) {
      return { x: 0, y: 0 };
    }
    return {
      x: 0.5 * (dataExtentsInfo.minX + dataExtentsInfo.maxX) * 1000,
      y: 0.5 * (dataExtentsInfo.minY + dataExtentsInfo.maxY) * 1000
    };
  }

  var sketch = function( p ) {
    var kCanvasWidth = 700;  // note: container is ~800
    var kCanvasHeight = 600;
    var kInitialMargin = 50; // padding on either side for initial draw
    // World units in 3D are millimeters (robot/cube data are mm; quads converted)
    var kMmPerMeter = 1000;
    var kFovAngle = Math.PI / 3;
    // (no mesh scale — .obj assets are not used)
    // Created AFTER createCanvas — calling p.color() earlier can force p5's 100x100 defaultCanvas
    var kQuadBorderColor3D;
    var kQuadBorderColor2D;

    var dragging = false;
    var draggingInfo = {};
    var webglLive = false; // true only if WEBGL canvas actually created

    var scaleFactor2D;
    var scaleFactor2D0;
    var xOffset2D;
    var yOffset2D;

    // No .obj meshes ship with this viz (cozmo.obj / cube.obj are absent).
    // 3D uses solid primitives; 2D uses optional PNGs if present.
    var faceImg;
    var robotImg;
    var cubeImg;

    function forceIs2D( reason ) {
      console.warn( 'navMap: ' + reason );
      is3D = false;
      webglLive = false;
      var $chk = $('#chk3D');
      if( $chk.length ) { $chk.prop( 'checked', false ); }
      $('#chkFaces, label[for="chkFaces"]').hide();
      showWebGLError( $('#tab-navmap') );
    }

    p.setup = function() {
      var markReady = function() { kickRedraw(); };

      // IMPORTANT: createCanvas must be the first renderer touch.
      // Do not call p.color / p.fill / etc. before this, or p5 leaves defaultCanvas0 100x100.
      var use3D = !!is3D;
      webglLive = false;

      if( use3D && !webglAvailable() ) {
        forceIs2D( 'WebGL probe failed; using 2D' );
        use3D = false;
      }

      if( use3D ) {
        try {
          // Do NOT call setAttributes here: p5 0.5–0.7 (2018 webviz) throws
          // "_resetContext is not a function" and aborts WEBGL entirely.
          p.createCanvas( kCanvasWidth, kCanvasHeight, p.WEBGL );
          // Confirm we actually got a GL context (some browsers create a 2d fallback canvas)
          var gl = p._renderer && p._renderer.GL;
          if( !gl ) {
            throw new Error( 'createCanvas(WEBGL) returned no GL context' );
          }
          webglLive = true;
        } catch( err ) {
          console.warn( 'navMap: WEBGL createCanvas failed, falling back to 2D', err );
          forceIs2D( 'WEBGL createCanvas failed' );
          use3D = false;
          // Remove any half-built canvas, then make a real 2D one
          try {
            if( p.canvas && p.canvas.parentNode ) {
              p.canvas.parentNode.removeChild( p.canvas );
            }
          } catch( e2 ) {}
          p.createCanvas( kCanvasWidth, kCanvasHeight, p.P2D );
        }
      } else {
        p.createCanvas( kCanvasWidth, kCanvasHeight, p.P2D );
      }

      // If something still left us at the p5 default size, force a proper canvas
      if( p.width < 200 || p.height < 200 ) {
        console.warn( 'navMap: canvas was ' + p.width + 'x' + p.height + '; recreating 700x600 P2D' );
        forceIs2D( 'canvas too small after setup' );
        use3D = false;
        webglLive = false;
        p.createCanvas( kCanvasWidth, kCanvasHeight, p.P2D );
      }

      p.pixelDensity( 1 );
      kQuadBorderColor3D = p.color( 'rgba(255,255,255,0.35)' );
      kQuadBorderColor2D = p.color( 'rgba(255,255,255,0.1)' );

      // Optional bitmaps only (no .obj meshes). Try webVizModules/ then same-dir.
      var loadBitmap = function( name, assign ) {
        var paths = [ 'webVizModules/' + name, name ];
        var tryAt = function( i ) {
          if( i >= paths.length ) {
            assign( null );
            markReady();
            return;
          }
          p.loadImage(
            paths[i],
            function( img ) {
              if( img && img.width > 1 ) {
                assign( img );
                markReady();
              } else {
                tryAt( i + 1 );
              }
            },
            function() { tryAt( i + 1 ); }
          );
        };
        tryAt( 0 );
      };

      if( use3D && webglLive ) {
        faceImg = null;
        loadBitmap( 'face01.png', function( img ) { faceImg = img; } );
      } else {
        robotImg = null;
        cubeImg = null;
        loadBitmap( 'robot.png', function( img ) { robotImg = img; } );
        loadBitmap( 'cube.png',  function( img ) { cubeImg = img; } );
      }

      // Idle = no rAF spam (was causing Violation on 2D). Redraw on demand.
      if( typeof p.noLoop === 'function' ) {
        p.noLoop();
      }
      // First paint once setup finishes (and again when data arrives via kickRedraw)
      if( typeof p.redraw === 'function' ) {
        p.redraw();
      }
    };

    function rgbaColor( c ) {
      return p.color( 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + (c.a / 255.0) + ')' );
    }

    function drawRect2D( centerX, centerY, width, height, fillColor, borderColor ) {
      // Inputs are top-left corner style (matching prior behavior)
      p.push();
      p.translate( Math.round( centerX ), Math.round( centerY ) );
      p.stroke( borderColor );
      p.fill( fillColor );
      p.rect( 0, 0, Math.round( width ), Math.round( height ) );
      p.pop();
    }

    /**
     * Ground-plane quad in p5 Y-up space (floor = XZ, height = Y).
     * centerX/centerY are map-floor coords in mm; yLift is height above floor.
     */
    /**
     * Floor tile. Map floor (centerX, centerY) mm -> p5 XZ at height yLift.
     * p5(x,y,z) = (mapX, height, mapY)
     */
    // quaternion -> euler for p5 rotateZ/X/Y (Z-X-Y). Same as before.
    function calcEuler( w, x, y, z ) {
      var threeaxisrot = function( r11, r12, r21, r31, r32 ) {
        return new Vector(
          Math.atan2( r31, r32 ),
          Math.asin( Math.max( -1, Math.min( 1, r21 ) ) ),
          Math.atan2( r11, r12 )
        );
      };
      return threeaxisrot(
        -2*(x*y - w*z),
         w*w - x*x + y*y - z*z,
         2*(y*z + w*x),
        -2*(x*z - w*y),
         w*w - x*x - y*y + z*z
      );
    }

    // ---- 3D drawing (fast path: bake map → one textured plane) ----

    var mapBakeG = null;       // p5.Graphics top-down cache
    var mapBakeMinX = 0;
    var mapBakeMinY = 0;
    var mapBakeMaxX = 1;
    var mapBakeMaxY = 1;
    var mapBakeRes = 512;
    var interact3D = false;    // true while dragging / short zoom burst
    var wheelFramesLeft = 0;
    var originCache = { x: 0, y: 0, valid: false };

    function toScene( mapX, mapY, mapZ ) {
      if( !originCache.valid ) {
        var o = mapOriginMm();
        originCache.x = o.x;
        originCache.y = o.y;
        originCache.valid = true;
      }
      // Map-Y → p5 Z is negated so 3D matches 2D screen layout:
      // 2D canvas has y-down, so larger mapY draws toward the BOTTOM of the view.
      // Without the minus, 3D put that same point toward the TOP (~1,3 vs 2D ~1,1).
      // Robot, cubes, faces, and map bake all use toScene — they stay locked together.
      return {
        x: mapX - originCache.x,
        y: mapZ,
        z: originCache.y - mapY
      };
    }

    function invalidateOriginCache() {
      originCache.valid = false;
    }

    /**
     * Rasterize all map cells once into a 2D texture. Drawing hundreds of
     * beginShape quads every orbit frame was the main 3D cost.
     */
    function rebuildMapBake() {
      if( typeof dataExtentsInfo.minX === 'undefined' || quadTreeQuads.length === 0 ) {
        return;
      }
      invalidateOriginCache();

      mapBakeMinX = dataExtentsInfo.minX * kMmPerMeter;
      mapBakeMaxX = dataExtentsInfo.maxX * kMmPerMeter;
      mapBakeMinY = dataExtentsInfo.minY * kMmPerMeter;
      mapBakeMaxY = dataExtentsInfo.maxY * kMmPerMeter;
      var worldW = Math.max( 1, mapBakeMaxX - mapBakeMinX );
      var worldD = Math.max( 1, mapBakeMaxY - mapBakeMinY );

      // Aspect-correct bake so texture cells stay aligned with world mm
      var base = 512;
      if( quadTreeQuads.length > 800 ) { base = 384; }
      if( quadTreeQuads.length > 2000 ) { base = 256; }
      var resX, resY;
      if( worldW >= worldD ) {
        resX = base;
        resY = Math.max( 64, Math.round( base * worldD / worldW ) );
      } else {
        resY = base;
        resX = Math.max( 64, Math.round( base * worldW / worldD ) );
      }
      mapBakeRes = resX;

      if( !mapBakeG || mapBakeG.width !== resX || mapBakeG.height !== resY ) {
        if( mapBakeG && mapBakeG.remove ) {
          try { mapBakeG.remove(); } catch( e ) {}
        }
        mapBakeG = p.createGraphics( resX, resY );
        mapBakeG.pixelDensity( 1 );
      }

      var g = mapBakeG;
      g.pixelDensity( 1 );
      g.background( 30, 32, 38 );
      g.noStroke();

      var sx = resX / worldW;
      var sy = resY / worldD;
      var n = quadTreeQuads.length;
      for( var i = 0; i < n; ++i ) {
        var q = quadTreeQuads[i];
        var c = q.color;
        if( c.a < 8 ) { continue; }
        var cx = q.center.x * kMmPerMeter;
        var cy = q.center.y * kMmPerMeter;
        var side = q.sideSize * kMmPerMeter;
        var half = 0.5 * side;
        var x0 = (cx - half - mapBakeMinX) * sx;
        var y0 = (cy - half - mapBakeMinY) * sy;
        var sw = Math.max( 1, side * sx );
        var sh = Math.max( 1, side * sy );
        // Boost alpha so the texture reads clearly under WEBGL lighting/modulation
        var a = Math.max( c.a, 180 );
        g.fill( c.r, c.g, c.b, a );
        g.rect( x0, y0, sw, sh );
      }

      mapBakeDirty = false;
    }

    function drawMapBake3D() {
      if( !mapBakeG ) { return; }
      // Same mm space as robot/cube (toScene). Bake (0,0)=top-left=(minX,minY).
      var s00 = toScene( mapBakeMinX, mapBakeMinY, 1 );
      var s10 = toScene( mapBakeMaxX, mapBakeMinY, 1 );
      var s11 = toScene( mapBakeMaxX, mapBakeMaxY, 1 );
      var s01 = toScene( mapBakeMinX, mapBakeMaxY, 1 );

      var gl = p._renderer && p._renderer.GL;
      if( gl ) { gl.disable( gl.CULL_FACE ); }

      p.push();
      p.fill( 255 ); // required: WEBGL multiplies texture by fill
      p.noStroke();
      p.textureMode( p.NORMAL );
      p.texture( mapBakeG );
      // u: minX→0 maxX→1   v: minY→0 maxY→1  (matches g.rect bake)
      p.beginShape();
      p.vertex( s00.x, s00.y, s00.z, 0, 0 );
      p.vertex( s10.x, s10.y, s10.z, 1, 0 );
      p.vertex( s11.x, s11.y, s11.z, 1, 1 );
      p.vertex( s01.x, s01.y, s01.z, 0, 1 );
      p.endShape( p.CLOSE );
      p.pop();
    }

    function drawSupportFloor() {
      if( typeof dataExtentsInfo.minX === 'undefined' ) { return; }
      var minX = dataExtentsInfo.minX * kMmPerMeter;
      var maxX = dataExtentsInfo.maxX * kMmPerMeter;
      var minY = dataExtentsInfo.minY * kMmPerMeter;
      var maxY = dataExtentsInfo.maxY * kMmPerMeter;
      var c = toScene( 0.5*(minX+maxX), 0.5*(minY+maxY), 0 );
      c.y = -8;
      var w = (maxX - minX) + 240;
      var d = (maxY - minY) + 240;
      p.push();
      p.translate( c.x, c.y, c.z );
      p.noStroke();
      p.fill( 36, 38, 44 );
      p.box( w, 16, d );
      p.pop();
    }

    function drawGroundGrid() {
      var axis = 200;
      p.push();
      p.strokeWeight( 2 );
      p.stroke( 220, 60, 60 );
      p.line( 0, 2, 0, axis, 2, 0 );
      p.stroke( 60, 200, 60 );
      // +mapY after toScene flip is -p5Z
      p.line( 0, 2, 0, 0, 2, -axis );
      p.stroke( 80, 140, 255 );
      p.line( 0, 2, 0, 0, 2 + axis, 0 );
      p.pop();
    }

    function drawRobot3D() {
      if( typeof robotPosition === 'undefined' ) { return; }
      var h = robotPosition.z || 15;
      var s = toScene( robotPosition.x, robotPosition.y, h );
      p.push();
      p.translate( s.x, s.y, s.z );
      var euler = calcEuler( robotPosition.qW, robotPosition.qX, robotPosition.qY, robotPosition.qZ );
      p.rotateY( euler.z );
      p.noStroke();
      p.fill( 240, 220, 60 );
      p.box( 60, 30, 40 );
      p.push();
      p.translate( 40, 0, 0 );
      p.fill( 255, 120, 40 );
      p.box( 18 );
      p.pop();
      p.pop();
    }

    function drawCubes3D() {
      if( typeof cubeData === 'undefined' ) { return; }
      p.noStroke();
      for( var idx = 0; idx < cubeData.length; ++idx ) {
        var cubePos = cubeData[idx];
        var h = (typeof cubePos.z === 'number') ? cubePos.z : 22;
        var s = toScene( cubePos.x, cubePos.y, h );
        p.push();
        p.translate( s.x, s.y, s.z );
        p.rotateY( cubePos.angle || 0 );
        p.fill( 220, 70, 70 );
        p.box( 44 );
        p.pop();
      }
    }

    function drawFaces3D() {
      var hasTex = faceImg && faceImg.width > 1;
      for( var faceId in faceData ) {
        if( !faceData.hasOwnProperty( faceId ) ) { continue; }
        var facePose = faceData[faceId].pose;
        var s = toScene( facePose.x, facePose.y, facePose.z || 100 );
        p.push();
        p.translate( s.x, s.y, s.z );
        var euler = calcEuler( facePose.qW, facePose.qX, facePose.qY, facePose.qZ );
        p.rotateY( euler.z );
        // Stand in XZ-facing card: rotate so local plane faces camera-ish (XY → vertical)
        // Flip vertical so PNG is right-side-up with default Flip view
        p.scale( 1, -1, 1 );
        p.noStroke();
        p.fill( 255 );
        if( hasTex ) {
          p.textureMode( p.NORMAL );
          p.texture( faceImg );
          // Explicit textured quad (more reliable than rect+texture in some p5 builds)
          var h = 40;
          p.beginShape();
          p.vertex( -h, -h, 0, 0, 0 );
          p.vertex(  h, -h, 0, 1, 0 );
          p.vertex(  h,  h, 0, 1, 1 );
          p.vertex( -h,  h, 0, 0, 1 );
          p.endShape( p.CLOSE );
        } else {
          p.fill( 180, 160, 220 );
          p.rectMode( p.CENTER );
          p.rect( 0, 0, 80, 80 );
        }
        p.pop();
      }
    }

    function resetOrbitView() {
      var dist = 1200;
      if( typeof dataExtentsInfo.minX !== 'undefined' ) {
        var dx = (dataExtentsInfo.maxX - dataExtentsInfo.minX) * kMmPerMeter;
        var dy = (dataExtentsInfo.maxY - dataExtentsInfo.minY) * kMmPerMeter;
        dist = Math.max( 800, 1.2 * Math.sqrt( dx*dx + dy*dy ) );
      }
      var upY = invertHeight ? -1 : 1;
      // Camera sits on +Z looking at origin; world is then yawed by kMapYaw3D
      // so the map matches 2D (X right, map-Y toward bottom of the view).
      p.camera( 0, dist * 0.55, dist * 0.85,  0, 0, 0,  0, upY, 0 );
    }

    function drawRobot2D() {
      if( typeof robotPosition === 'undefined' || !robotImg ) { return; }
      p.push();
      var x = scaleFactor2D * (0.001 * robotPosition.x - xOffset2D);
      var y = scaleFactor2D * (0.001 * robotPosition.y - yOffset2D);
      var euler = calcEuler( robotPosition.qW, robotPosition.qX, robotPosition.qY, robotPosition.qZ );
      var robotLength = 50.0 * scaleFactor2D0 / 780;
      var robotWidth  = 26.0 * scaleFactor2D0 / 780;
      p.translate( x, y );
      p.imageMode( p.CENTER );
      p.rotate( -euler.z );
      p.scale( scaleFactor2D / scaleFactor2D0 );
      p.image( robotImg, 0, 0, robotLength, robotWidth );
      p.pop();
    }

    function drawCubes2D() {
      if( typeof cubeData === 'undefined' || !cubeImg ) { return; }
      for( var idx = 0; idx < cubeData.length; ++idx ) {
        var cubePos = cubeData[idx];
        p.push();
        var x = scaleFactor2D * (0.001 * cubePos.x - xOffset2D);
        var y = scaleFactor2D * (0.001 * cubePos.y - yOffset2D);
        var cubeSide = 15.0 * scaleFactor2D / scaleFactor2D0;
        p.imageMode( p.CENTER );
        p.translate( x, y );
        p.rotate( -cubePos.angle );
        p.image( cubeImg, 0, 0, cubeSide, cubeSide );
        p.pop();
      }
    }

    function fitView2D() {
      var scaleX = (dataExtentsInfo.maxX - dataExtentsInfo.minX) / (kCanvasWidth  - 2 * kInitialMargin);
      var scaleY = (dataExtentsInfo.maxY - dataExtentsInfo.minY) / (kCanvasHeight - 2 * kInitialMargin);
      if( scaleX > 0 || scaleY > 0 ) {
        scaleFactor2D = (scaleX > scaleY) ? 1.0 / scaleX : 1.0 / scaleY;
      } else {
        scaleFactor2D = 500;
      }
      scaleFactor2D0 = scaleFactor2D;
      xOffset2D = dataExtentsInfo.minX - (1.0 * kInitialMargin) / scaleFactor2D;
      yOffset2D = dataExtentsInfo.minY - (1.0 * kInitialMargin) / scaleFactor2D;
    }

    
    p.draw = function() {
      if( quadTreeQuads.length === 0 ) {
        return;
      }

      if( is3D && webglLive ) {
        // When draw() runs (redraw or loop while dragging), always paint + orbitControl.
        // Skipping frames broke orbit/zoom (camera never updated).
        if( mapBakeDirty ) {
          rebuildMapBake();
        }

        p.background( 24, 24, 28 );

        if( typeof p.orbitControl === 'function' ) {
          p.orbitControl( 2, 1, 1.5 );
        }

        if( cameraResetPending || vizDirty ) {
          resetOrbitView();
          cameraResetPending = false;
        }

        p.rotateY( kMapYaw3D );

        if( typeof p.noLights === 'function' ) {
          p.noLights();
        }
        drawSupportFloor();
        drawMapBake3D();
        drawGroundGrid();

        p.ambientLight( 110 );
        p.directionalLight( 230, 230, 230, 0.35, -1.0, 0.25 );

        if( shouldDrawRobot ) { drawRobot3D(); }
        if( shouldDrawCubes ) { drawCubes3D(); }
        if( shouldDrawFaces ) { drawFaces3D(); }

        vizDirty = false;
        return;
      }

      // ---- 2D (only runs when kickRedraw/redraw was requested) ----
      if( typeof scaleFactor2D === 'undefined' ) {
        fitView2D();
      }

      p.clear();
      p.background( 0 );

      for( var q2 = 0; q2 < quadTreeQuads.length; ++q2 ) {
        var q = quadTreeQuads[q2];
        var col = rgbaColor( q.color );
        var x2 = scaleFactor2D * (q.center.x - 0.5 * q.sideSize - xOffset2D);
        var y2 = scaleFactor2D * (q.center.y - 0.5 * q.sideSize - yOffset2D);
        var side2 = scaleFactor2D * q.sideSize;
        drawRect2D( x2, y2, side2, side2, col, kQuadBorderColor2D );
      }

      if( shouldDrawRobot ) { drawRobot2D(); }
      if( shouldDrawCubes ) { drawCubes2D(); }
      vizDirty = false;
    };

    var mouseWithinCanvas = function() {
      return (p.mouseX >= 0) && (p.mouseX < kCanvasWidth) &&
             (p.mouseY >= 0) && (p.mouseY < kCanvasHeight);
    };

    function start3DInteract() {
      interact3D = true;
      // Continuous frames only while dragging so orbitControl gets deltas
      if( typeof p.loop === 'function' ) {
        p.loop();
      }
    }
    function stop3DInteract() {
      interact3D = false;
      if( typeof p.noLoop === 'function' ) {
        p.noLoop();
      }
      // Final frame to settle
      if( typeof p.redraw === 'function' ) {
        p.redraw();
      }
    }

    p.mousePressed = function( event ) {
      if( is3D && webglLive ) {
        if( mouseWithinCanvas() ) {
          start3DInteract();
        }
        return true; // let orbitControl see the event
      }
      if( quadTreeQuads.length === 0 ) { return true; }
      if( !mouseWithinCanvas() ) {
        dragging = false;
        return true;
      }
      dragging = true;
      draggingInfo = {
        startX: p.mouseX,
        startY: p.mouseY,
        startXOffset: xOffset2D,
        startYOffset: yOffset2D
      };
      return false;
    };

    p.mouseReleased = function( event ) {
      if( is3D && webglLive ) {
        stop3DInteract();
        return true;
      }
      if( quadTreeQuads.length === 0 ) { return true; }
      var was = dragging;
      dragging = false;
      if( was ) {
        kickRedraw();
      }
      return !was;
    };

    p.mouseDragged = function( event ) {
      if( is3D && webglLive ) {
        // loop() already running from mousePressed
        return true;
      }
      if( quadTreeQuads.length === 0 || !dragging ) { return true; }
      var dx = p.mouseX - draggingInfo.startX;
      var dy = p.mouseY - draggingInfo.startY;
      xOffset2D = draggingInfo.startXOffset - dx / scaleFactor2D;
      yOffset2D = draggingInfo.startYOffset - dy / scaleFactor2D;
      kickRedraw();
      return false;
    };

    p.mouseWheel = function( event ) {
      if( is3D && webglLive ) {
        if( mouseWithinCanvas() ) {
          // One (or few) paints so orbitControl can apply zoom delta
          if( typeof p.redraw === 'function' ) {
            p.redraw();
          }
          return false;
        }
        return true;
      }
      if( dragging || !event.isTrusted || !mouseWithinCanvas() || quadTreeQuads.length === 0 ) {
        return true;
      }
      var delta = 0.5 * event.delta;
      var prevScaleFactor = scaleFactor2D;
      var newFactor = scaleFactor2D * (100 - delta) / 100;
      if( newFactor / scaleFactor2D0 > 0.05 && newFactor / scaleFactor2D0 < 50 ) {
        scaleFactor2D = newFactor;
        xOffset2D += p.mouseX * (1.0 / prevScaleFactor - 1.0 / scaleFactor2D);
        yOffset2D += p.mouseY * (1.0 / prevScaleFactor - 1.0 / scaleFactor2D);
        kickRedraw();
      }
      return false;
    };

    p.doubleClicked = function() {
      if( !mouseWithinCanvas() || quadTreeQuads.length === 0 ) { return true; }
      if( is3D && webglLive ) {
        cameraResetPending = true;
        kickRedraw();
        return false;
      }
      fitView2D();
      kickRedraw();
      return false;
    };


  };

  // ---------- webviz methods ----------

  function destroySketch() {
    if( typeof myp5 !== 'undefined' && myp5 ) {
      myp5.remove();
      myp5 = undefined;
    }
    if( typeof canvasContainer !== 'undefined' && canvasContainer ) {
      canvasContainer.remove();
      canvasContainer = undefined;
    }
    if( typeof legendContainer !== 'undefined' && legendContainer ) {
      legendContainer.remove();
      legendContainer = undefined;
    }
  }

  function initializeSketch( elem ) {
    var $elem = asJq( elem );
    canvasContainer = $('<div></div>', { id: 'navMapContainer' }).appendTo( $elem );
    // p5 instance mode: prefer DOM node (works on 0.5–1.x); id string also ok
    var host = canvasContainer[0] || 'navMapContainer';
    myp5 = new p5( sketch, host );

    legendContainer = $('<div></div>', { id: 'legendContainer' }).appendTo( $elem );
    for( var idx = 0; idx < kKnownTypes.length; ++idx ) {
      legendContainer.append(
        '<span class="navMapLegendEntry" data-quadtype="' + kKnownTypes[idx] + '">' +
        kKnownTypes[idx] + '</span>'
      );
    }
    if( dumpInput ) {
      $('<div id="pastebin"></div>').appendTo( $elem );
    }
  }

  myMethods.init = function( elem ) {
    elem = asJq( elem ); // 2018 webviz often passes a raw HTMLElement
    updateBtn = $('<input type="button" value="Update"/>');
    updateBtn.click( function() {
      if( dumpInput ) {
        $('#pastebin').html( '' );
      }
      callUpdate();
    });
    updateBtn.appendTo( elem ).prop( 'disabled', autoUpdate );

    var chkAuto  = $('<input />', { type: 'checkbox', id: 'chkAuto'  }).appendTo( elem ).prop( 'checked', autoUpdate );
    $('<label />', { for: 'chkAuto',  text: 'Auto-update' }).appendTo( elem );
    var chk3D    = $('<input />', { type: 'checkbox', id: 'chk3D'    }).appendTo( elem ).prop( 'checked', is3D );
    $('<label />', { for: 'chk3D',    text: '3D' }).appendTo( elem );
    var chkInvH  = $('<input />', { type: 'checkbox', id: 'chkInvH'  }).appendTo( elem ).prop( 'checked', invertHeight );
    $('<label />', { for: 'chkInvH',  text: 'Flip view' }).appendTo( elem );
    var chkRobot = $('<input />', { type: 'checkbox', id: 'chkRobot' }).appendTo( elem ).prop( 'checked', shouldDrawRobot );
    $('<label />', { for: 'chkRobot', text: 'Show robot' }).appendTo( elem );
    var chkCubes = $('<input />', { type: 'checkbox', id: 'chkCubes' }).appendTo( elem ).prop( 'checked', shouldDrawCubes );
    $('<label />', { for: 'chkCubes', text: 'Show cubes' }).appendTo( elem );
    var chkFaces = $('<input />', { type: 'checkbox', id: 'chkFaces' }).appendTo( elem ).prop( 'checked', shouldDrawFaces );
    $('<label />', { for: 'chkFaces', text: 'Show faces' }).appendTo( elem );

    // Faces / invert-height only in 3D
    if( !is3D ) {
      chkFaces.hide();
      $('label[for="chkFaces"]').hide();
      chkInvH.hide();
      $('label[for="chkInvH"]').hide();
    }

    chkInvH.change( function() {
      invertHeight = $(this).is( ':checked' );
      cameraResetPending = true;
      kickRedraw();
    });

    chkAuto.change( function() {
      autoUpdate = $(this).is( ':checked' );
      updateBtn.prop( 'disabled', autoUpdate );
    });
    chkRobot.change( function() {
      var old = shouldDrawRobot;
      shouldDrawRobot = $(this).is( ':checked' );
      if( old != shouldDrawRobot ) { kickRedraw(); }
    });
    chkCubes.change( function() {
      var old = shouldDrawCubes;
      shouldDrawCubes = $(this).is( ':checked' );
      if( old != shouldDrawCubes ) { kickRedraw(); }
    });
    chkFaces.change( function() {
      var old = shouldDrawFaces;
      shouldDrawFaces = $(this).is( ':checked' );
      if( old != shouldDrawFaces ) { kickRedraw(); }
    });
    chk3D.change( function() {
      var old = is3D;
      var want3D = $(this).is( ':checked' );
      if( old == want3D ) { return; }

      if( want3D && !webglAvailable() ) {
        // Don't tear down a working 2D view just to crash
        $(this).prop( 'checked', false );
        is3D = false;
        showWebGLError( elem );
        return;
      }

      is3D = want3D;

      if( is3D ) {
        chkFaces.show();
        $('label[for="chkFaces"]').show();
        chkInvH.show();
        $('label[for="chkInvH"]').show();
        elem.find( '.navMapWebGLError' ).remove();
      } else {
        chkFaces.hide();
        $('label[for="chkFaces"]').hide();
        chkInvH.hide();
        $('label[for="chkInvH"]').hide();
      }

      // Tear down canvas; rebuild on next data (or immediately if we already have quads)
      destroySketch();

      if( quadTreeQuads.length > 0 ) {
        // Rebuild immediately from cached map so toggle is snappy
        initializeSketch( elem );
        mapBakeDirty = true;
        cameraResetPending = true;
        kickRedraw();
      } else if( !waitingOnData ) {
        timeTilAutoUpdate = kAutoUpdatePeriod_s;
        callUpdate();
      }
      // if waitingOnData: sketch rebuilds when the in-flight response arrives
    });

    callUpdate();
  };

  myMethods.onData = function( data, elem ) {
    elem = asJq( elem );
    if( typeof canvasContainer === 'undefined' || !canvasContainer ) {
      initializeSketch( elem );
    }

    if( dumpInput ) {
      $('#pastebin').html(
        $('#pastebin').html() + '\n\n************************************\n\n' + JSON.stringify( data )
      );
    }

    var type = data["type"];
    var originId = data["originId"];

    if( type == 'MemoryMapMessageVizBegin' ) {
      memoryMapQuadInfoVectorMapIncoming[originId] = {};
      memoryMapInfo[originId] = data["mapInfo"];
    }
    else if( type == "MemoryMapMessageViz" ) {
      var dest = memoryMapQuadInfoVectorMapIncoming[originId];
      if( !dest ) {
        console.warn( 'navMap: MemoryMapMessageViz for unknown originId', originId );
        return;
      }
      dest[data["seqNum"]] = data["quadInfos"];
    }
    else if( type == "MemoryMapMessageVizEnd" ) {
      if( !memoryMapInfo[originId] ) {
        console.warn( 'navMap: MemoryMapMessageVizEnd for unknown originId', originId );
        waitingOnData = false;
        if( updateBtn ) { updateBtn.prop( 'disabled', autoUpdate ); }
        return;
      }

      quadTreeQuads = [];
      dataExtentsInfo = {
        minX:  Number.MAX_VALUE,
        maxX: -Number.MAX_VALUE,
        minY:  Number.MAX_VALUE,
        maxY: -Number.MAX_VALUE
      };

      var centerX_m = 0.001 * memoryMapInfo[originId].rootCenterX;
      var centerY_m = 0.001 * memoryMapInfo[originId].rootCenterY;
      var depth     = memoryMapInfo[originId].rootDepth;
      var rootSize  = 0.001 * memoryMapInfo[originId].rootSize_mm;

      var root = new MemoryMapNode( depth, rootSize, new Point( centerX_m, centerY_m ) );
      var expectedSeqNum = 0;
      var srcQuadInfos = memoryMapQuadInfoVectorMapIncoming[originId] || {};

      // Seq nums may arrive as string keys; walk in numeric order
      var seqKeys = Object.keys( srcQuadInfos ).map( Number ).sort( function( a, b ) { return a - b; } );
      for( var s = 0; s < seqKeys.length; ++s ) {
        var seqNum = seqKeys[s];
        if( seqNum !== expectedSeqNum ) {
          console.log( 'DROPPED VIZ MESSAGE. map will be incorrect (expected seq ' +
                       expectedSeqNum + ', got ' + seqNum + ')' );
          break;
        }
        var quadInfo = srcQuadInfos[seqNum] || srcQuadInfos[String(seqNum)];
        for( var idx = 0; idx < quadInfo.length; ++idx ) {
          var quad = quadInfo[idx];
          root.AddChild( quadTreeQuads, dataExtentsInfo, quad["content"], quad["depth"] );
        }
        ++expectedSeqNum;
      }

      delete memoryMapQuadInfoVectorMapIncoming[originId];
      delete memoryMapInfo[originId];

      robotPosition = data["robot"];

      // Flip Y (quads are in meters; robot is mm)
      quadTreeQuads.forEach( function( q ) {
        q.center.y = flipY_m( q.center.y );
      });
      var tmpMaxY = dataExtentsInfo.maxY;
      dataExtentsInfo.maxY = flipY_m( dataExtentsInfo.minY );
      dataExtentsInfo.minY = flipY_m( tmpMaxY );
      if( robotPosition ) {
        robotPosition.y = flipY_mm( robotPosition.y );
      }

      mapBakeDirty = true;
      cameraResetPending = true;
      kickRedraw();
      if( updateBtn ) { updateBtn.prop( 'disabled', autoUpdate ); }
      waitingOnData = false;
    }
    else if( type == "MemoryMapCubes" ) {
      var newCubeData = data["cubes"];
      if( typeof newCubeData === 'undefined' ) { return; }
      cubeData = newCubeData;
      cubeData.forEach( function( cube ) {
        cube.y = flipY_mm( cube.y );
      });
      kickRedraw();
    }
    else if( type == "MemoryMapFace" ) {
      var id = data["faceID"];
      data["pose"].y = flipY_mm( data["pose"].y );
      faceData[id] = data;
      kickRedraw();
    }
    else if( type == "RobotDeletedFace" ) {
      var faceId = data["faceID"];
      if( typeof faceData[faceId] !== 'undefined' ) {
        delete faceData[faceId];
        kickRedraw();
      }
    }
  };

  var kAutoUpdatePeriod_s = 5.0;
  var timeTilAutoUpdate = kAutoUpdatePeriod_s;
  myMethods.update = function( dt, elem ) {
    timeTilAutoUpdate -= dt;
    if( (timeTilAutoUpdate < 0) && autoUpdate && !waitingOnData ) {
      callUpdate();
      timeTilAutoUpdate = kAutoUpdatePeriod_s;
    }
  };

  myMethods.getStyles = function() {
    var styles = `
      span.navMapLegendEntry {
        display: block;
        margin: 1px 3px 0px 0px;
        font-size:10px;
      }
      span.navMapLegendEntry:before {
        content: "";
        display: inline-block;
        width: 12px;
        height: 12px;
        margin-right: 5px;
      }
      input[type=checkbox] {
        margin-left:20px;
        margin-right:5px;
      }
      #navMapContainer {
        background: #000;
      }
    `;
    for( var idx = 0; idx < kKnownTypes.length; ++idx ) {
      var color = getQuadColor( kKnownTypes[idx] );
      styles += 'span.navMapLegendEntry[data-quadtype="' + kKnownTypes[idx] + '"]:before {';
      styles +=    'background: rgba(' + color.r + ',' + color.g + ',' + color.b + ',' + ((1.0*color.a)/255) + ')';
      styles += '}';
    }
    return styles;
  };

  // for debugging when there's no engine connected
  function fakeData() {
    var msgs = [];
    msgs.push( '{"mapInfo":{"identifier":"QuadTree_0x7fdb4d531d80","rootCenterX":560,"rootCenterY":240,"rootCenterZ":1,"rootDepth":7,"rootSize_mm":1280},"originId":1,"type":"MemoryMapMessageVizBegin"}' );
    msgs.push( '{"originId":1,"quadInfos":[{"content":"Unknown","depth":6},{"content":"Unknown","depth":5},{"content":"Unknown","depth":5},{"content":"Unknown","depth":4},{"content":"Unknown","depth":4},{"content":"Unknown","depth":4},{"content":"Unknown","depth":3},{"content":"Unknown","depth":3},{"content":"Unknown","depth":2},{"content":"Unknown","depth":2},{"content":"Unknown","depth":2},{"content":"Unknown","depth":1},{"content":"Unknown","depth":1},{"content":"Unknown","depth":1},{"content":"Unknown","depth":0},{"content":"Unknown","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":3},{"content":"Unknown","depth":5},{"content":"Unknown","depth":6},{"content":"Unknown","depth":4},{"content":"Unknown","depth":2},{"content":"Unknown","depth":1},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":1},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":2},{"content":"Unknown","depth":1},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":1},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":2},{"content":"Unknown","depth":2},{"content":"Unknown","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"Unknown","depth":1},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"Unknown","depth":1},{"content":"Unknown","depth":2},{"content":"Unknown","depth":2},{"content":"Unknown","depth":1},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":1},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":2},{"content":"Unknown","depth":1},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":1},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"Unknown","depth":1},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"Unknown","depth":1},{"content":"Unknown","depth":2},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"Unknown","depth":1},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"Unknown","depth":1},{"content":"Unknown","depth":2},{"content":"Unknown","depth":4},{"content":"Unknown","depth":2},{"content":"Unknown","depth":1},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":1},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":2},{"content":"Unknown","depth":1},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":1},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"Unknown","depth":1},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"Unknown","depth":1},{"content":"Unknown","depth":2},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"Unknown","depth":1},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"Unknown","depth":1},{"content":"Unknown","depth":2},{"content":"Unknown","depth":2},{"content":"Unknown","depth":1},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":1},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":2},{"content":"Unknown","depth":1},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":1},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"Unknown","depth":1},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"Unknown","depth":1},{"content":"Unknown","depth":2},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"Unknown","depth":1},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"Unknown","depth":1},{"content":"Unknown","depth":2},{"content":"Unknown","depth":5},{"content":"Unknown","depth":4},{"content":"Unknown","depth":2},{"content":"Unknown","depth":1},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":1},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":2},{"content":"Unknown","depth":1},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"ClearOfObstacle","depth":1},{"content":"ClearOfObstacle","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"ClearOfCliff","depth":0},{"content":"ClearOfCliff","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"Unknown","depth":1},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"Unknown","depth":1},{"content":"Unknown","depth":2},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"Unknown","depth":1},{"content":"ClearOfObstacle","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"ClearOfCliff","depth":0},{"content":"ClearOfCliff","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":2},{"content":"Unknown","depth":2},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"ClearOfCliff","depth":1},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"ClearOfCliff","depth":1},{"content":"Unknown","depth":2},{"content":"Unknown","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"ClearOfCliff","depth":1},{"content":"ClearOfObstacle","depth":1},{"content":"ClearOfCliff","depth":1},{"content":"ClearOfCliff","depth":1},{"content":"ClearOfObstacle","depth":1},{"content":"ClearOfCliff","depth":1},{"content":"ClearOfObstacle","depth":1},{"content":"Unknown","depth":2},{"content":"ClearOfCliff","depth":1},{"content":"ClearOfObstacle","depth":1},{"content":"ClearOfCliff","depth":1},{"content":"ClearOfObstacle","depth":1},{"content":"Unknown","depth":2},{"content":"Unknown","depth":4},{"content":"Unknown","depth":2},{"content":"ClearOfObstacle","depth":1},{"content":"ClearOfCliff","depth":1},{"content":"ClearOfObstacle","depth":1},{"content":"ClearOfCliff","depth":1},{"content":"Unknown","depth":1},{"content":"Unknown","depth":0},{"content":"Unknown","depth":0},{"content":"Unknown","depth":0},{"content":"ObstacleCharger","depth":0},{"content":"Unknown","depth":1},{"content":"Unknown","depth":0},{"content":"ObstacleCharger","depth":0},{"content":"Unknown","depth":0},{"content":"ObstacleCharger","depth":0},{"content":"ClearOfObstacle","depth":1},{"content":"ClearOfCliff","depth":1},{"content":"ClearOfObstacle","depth":1},{"content":"ClearOfCliff","depth":1},{"content":"ClearOfCliff","depth":1},{"content":"ClearOfObstacle","depth":1},{"content":"ClearOfCliff","depth":1},{"content":"ClearOfObstacle","depth":1},{"content":"Unknown","depth":2},{"content":"ClearOfCliff","depth":1},{"content":"ClearOfObstacle","depth":1},{"content":"ClearOfCliff","depth":1},{"content":"ClearOfObstacle","depth":1},{"content":"ObstacleCharger","depth":0},{"content":"Unknown","depth":0},{"content":"ObstacleCharger","depth":0},{"content":"Unknown","depth":0},{"content":"Unknown","depth":1},{"content":"ObstacleCharger","depth":0},{"content":"Unknown","depth":0},{"content":"ObstacleCharger","depth":0},{"content":"Unknown","depth":0},{"content":"Unknown","depth":1},{"content":"Unknown","depth":1},{"content":"Unknown","depth":0},{"content":"ObstacleCharger","depth":0},{"content":"Unknown","depth":0},{"content":"ObstacleCharger","depth":0},{"content":"Unknown","depth":1},{"content":"Unknown","depth":0},{"content":"ObstacleCharger","depth":0},{"content":"Unknown","depth":0},{"content":"ObstacleCharger","depth":0},{"content":"ClearOfObstacle","depth":1},{"content":"ClearOfCliff","depth":1},{"content":"ClearOfObstacle","depth":1},{"content":"ClearOfCliff","depth":1},{"content":"Unknown","depth":1},{"content":"Unknown","depth":0},{"content":"ObstacleCharger","depth":0},{"content":"Unknown","depth":0},{"content":"ObstacleCharger","depth":0},{"content":"Unknown","depth":1},{"content":"Unknown","depth":0},{"content":"ObstacleCharger","depth":0},{"content":"Unknown","depth":0},{"content":"ObstacleCharger","depth":0},{"content":"ClearOfObstacle","depth":1},{"content":"ClearOfCliff","depth":1},{"content":"ClearOfObstacle","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"ObstacleCharger","depth":0},{"content":"ObstacleCharger","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"ObstacleCharger","depth":0},{"content":"ObstacleCharger","depth":0},{"content":"ClearOfCliff","depth":1},{"content":"ClearOfObstacle","depth":1},{"content":"ClearOfCliff","depth":1},{"content":"ClearOfObstacle","depth":1},{"content":"ObstacleCharger","depth":0},{"content":"Unknown","depth":0},{"content":"ObstacleCharger","depth":0},{"content":"Unknown","depth":0},{"content":"Unknown","depth":1},{"content":"ObstacleCharger","depth":0},{"content":"Unknown","depth":0},{"content":"ObstacleCharger","depth":0},{"content":"Unknown","depth":0},{"content":"Unknown","depth":1},{"content":"ClearOfCliff","depth":1},{"content":"ClearOfObstacle","depth":1},{"content":"ClearOfObstacle","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"ObstacleCharger","depth":0},{"content":"ObstacleCharger","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"ClearOfObstacle","depth":0},{"content":"ObstacleCharger","depth":0},{"content":"ObstacleCharger","depth":0},{"content":"ObstacleCharger","depth":0},{"content":"Unknown","depth":0},{"content":"ObstacleCharger","depth":0},{"content":"Unknown","depth":0},{"content":"Unknown","depth":1},{"content":"ObstacleCharger","depth":0},{"content":"Unknown","depth":0},{"content":"ObstacleCharger","depth":0},{"content":"Unknown","depth":0},{"content":"Unknown","depth":1},{"content":"Unknown","depth":5}],"seqNum":0,"type":"MemoryMapMessageViz"}' );
    msgs.push( '{"originId":1,"type":"MemoryMapMessageVizEnd","robot": {"x": 0, "y": 0, "z": 0, "qW":1.0,"qX":0.0,"qY":0.0,"qZ":0.0}}' );
    msgs.push( '{"faceID":1,"pose":{"qW":0.7038945423784015,"qX":-0.06860959401309058,"qY":0.06858566274866171,"qZ":-0.7036484944093795,"x":768.1229248046875,"y":-10.172940254211426,"z":174.9200439453125},"timestamp":35655,"type":"MemoryMapFace"}' );
    msgs.push( '{"cubes":[{"angle":0.049684006720781326,"x":99.4178695678711,"y":0.0902092456817627,"z":29.857250213623047}],"type":"MemoryMapCubes"}' );
    
    for( var idx=0; idx<msgs.length; ++idx ) {
      myMethods.onData( JSON.parse( msgs[idx] ), $('#tab-navmap') );
    }
  }

})(moduleMethods, moduleSendDataFunc);
