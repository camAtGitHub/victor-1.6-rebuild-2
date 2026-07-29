/*  
 *  NavMap viz
 *  ross
 *  april 13 2018
 *  Copyright Anki, Inc. 2018
 *
 *  2026: orbit camera, 3D rendering fixes, data-path bugfixes
 *  2026-07: shell host scoping, safe onData, canvas size-to-host
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

  function domNode( el ) {
    if( !el ) { return null; }
    if( el.jquery ) { return el[0] || null; }
    if( typeof el === 'string' ) {
      try { return document.querySelector( el ); } catch( e ) { return null; }
    }
    return el.nodeType ? el : null;
  }


  // ---------- DOM / session state ----------

  /** Module host element (#tab-navmap). Prefer over document-global selectors. */
  var hostElem = null;
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

  // Canvas pixel size — sized from host, not a hard-coded document layout.
  // Defaults match the pre-shell 700×600; measureCanvasSize() updates them.
  var kCanvasWidth = 700;
  var kCanvasHeight = 600;
  var viewFitPending = false; // re-fit 2D after resize
  var hostResizeObserver = null;
  var resizeRaf = 0;

  function $host() {
    if( hostElem ) { return asJq( hostElem ); }
    // Fallback: stock/shell id only (never throw)
    try {
      var el = document.getElementById( 'tab-navmap' );
      if( el ) { return $(el); }
    } catch( e ) {}
    return $();
  }

  function setHost( el ) {
    var node = domNode( el );
    if( node ) { hostElem = node; }
  }

  /**
   * Size canvas from host client box. Avoids layout that depends on document
   * width and keeps the viewport-locked shell from growing without bound.
   */
  function measureCanvasSize() {
    var el = hostElem;
    if( !el || !el.clientWidth || el.clientWidth < 40 ) {
      // Host hidden / not laid out yet — keep last good size
      return { w: kCanvasWidth, h: kCanvasHeight };
    }
    var pad = 24;
    var w = Math.max( 280, Math.floor( el.clientWidth - pad ) );
    var top = 0;
    try { top = el.getBoundingClientRect().top; } catch( e ) {}
    var winH = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 800;
    // Leave room for toolbar checkboxes + legend under the canvas
    var h = Math.max( 220, Math.floor( winH - top - 200 ) );
    w = Math.min( w, 1600 );
    h = Math.min( h, 1000 );
    return { w: w, h: h };
  }

  function applyMeasuredCanvasSize( p ) {
    var size = measureCanvasSize();
    var changed = ( size.w !== kCanvasWidth ) || ( size.h !== kCanvasHeight );
    kCanvasWidth = size.w;
    kCanvasHeight = size.h;
    if( p && typeof p.resizeCanvas === 'function' &&
        ( typeof p.width === 'undefined' || p.width !== size.w || p.height !== size.h ) ) {
      try { p.resizeCanvas( size.w, size.h ); } catch( e ) {}
      changed = true;
    }
    if( changed ) {
      viewFitPending = true;
      cameraResetPending = true;
      mapBakeDirty = true;
      kickRedraw();
    }
    return changed;
  }

  function attachHostResizeObserver() {
    if( typeof ResizeObserver === 'undefined' || !hostElem ) { return; }
    if( hostResizeObserver ) {
      try { hostResizeObserver.disconnect(); } catch( e ) {}
      hostResizeObserver = null;
    }
    hostResizeObserver = new ResizeObserver( function() {
      if( resizeRaf ) { return; }
      resizeRaf = (typeof requestAnimationFrame === 'function')
        ? requestAnimationFrame( function() {
            resizeRaf = 0;
            applyMeasuredCanvasSize( myp5 );
          } )
        : (setTimeout( function() {
            resizeRaf = 0;
            applyMeasuredCanvasSize( myp5 );
          }, 50 ), 1);
    });
    try { hostResizeObserver.observe( hostElem ); } catch( e2 ) {}
  }

  function detachHostResizeObserver() {
    if( hostResizeObserver ) {
      try { hostResizeObserver.disconnect(); } catch( e ) {}
      hostResizeObserver = null;
    }
    if( resizeRaf && typeof cancelAnimationFrame === 'function' ) {
      try { cancelAnimationFrame( resizeRaf ); } catch( e2 ) {}
    }
    resizeRaf = 0;
  }

  function callUpdate() {
    waitingOnData = true;
    if( updateBtn ) {
      updateBtn.prop( 'disabled', true );
    }
    try {
      sendData( { 'update': true } );
    } catch( e ) {
      console.warn( 'navMap: sendData failed', e );
      waitingOnData = false;
      if( updateBtn ) { updateBtn.prop( 'disabled', autoUpdate ); }
    }
    // Legacy shell only: #status lives outside the module host. Never throw.
    try {
      var $status = $('#status');
      if( $status.length &&
          ($status.text() != "Connected") &&
          showFakeDataUponDisconnect )
      {
        if( noteDiv ) {
          noteDiv.text( 'DISCONNECTED: DISPLAYING FAKE DATA' );
        }
        fakeData();
      }
    } catch( e2 ) {}
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
      var $h = $host();
      var $chk = $h.find( '#navMap-chk3D' );
      if( $chk.length ) { $chk.prop( 'checked', false ); }
      // Faces stay available in 2D; only Flip view is 3D-only
      $h.find( '#navMap-chkInvH, label[for="navMap-chkInvH"]' ).hide();
      showWebGLError( hostElem || $h );
    }

    p.setup = function() {
      var markReady = function() { kickRedraw(); };

      // Size from host before createCanvas (shell module-host, not fixed 800px tab)
      var measured = measureCanvasSize();
      kCanvasWidth = measured.w;
      kCanvasHeight = measured.h;

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
        console.warn( 'navMap: canvas was ' + p.width + 'x' + p.height + '; recreating sized P2D' );
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

      // Faces bitmap used in both modes; robot/cube sprites are 2D-only
      faceImg = null;
      loadBitmap( 'face01.png', function( img ) { faceImg = img; kickRedraw(); } );
      if( !( use3D && webglLive ) ) {
        robotImg = null;
        cubeImg = null;
        loadBitmap( 'robot.png', function( img ) { robotImg = img; kickRedraw(); } );
        loadBitmap( 'cube.png',  function( img ) { cubeImg = img; kickRedraw(); } );
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

    /** Top-down face markers (map XY only; z ignored in 2D). */
    function drawFaces2D() {
      if( !faceData ) { return; }
      var faceSide = 18.0 * scaleFactor2D / scaleFactor2D0;
      if( !isFinite( faceSide ) || faceSide < 4 ) { faceSide = 12; }
      var hasTex = faceImg && faceImg.width > 1;

      for( var faceId in faceData ) {
        if( !faceData.hasOwnProperty( faceId ) ) { continue; }
        var entry = faceData[faceId];
        if( !entry || !entry.pose ) { continue; }
        var facePose = entry.pose;
        if( typeof facePose.x !== 'number' || typeof facePose.y !== 'number' ) { continue; }

        p.push();
        var x = scaleFactor2D * (0.001 * facePose.x - xOffset2D);
        var y = scaleFactor2D * (0.001 * facePose.y - yOffset2D);
        p.translate( x, y );
        if( hasTex ) {
          p.imageMode( p.CENTER );
          try {
            var euler = calcEuler( facePose.qW, facePose.qX, facePose.qY, facePose.qZ );
            if( euler && isFinite( euler.z ) ) {
              p.rotate( -euler.z );
            }
          } catch( e ) { /* ignore */ }
          p.image( faceImg, 0, 0, faceSide, faceSide );
        } else {
          // Fallback marker if face01.png not loaded yet
          p.noStroke();
          p.fill( 120, 200, 255, 220 );
          p.ellipse( 0, 0, faceSide, faceSide );
          p.fill( 20, 30, 40 );
          p.ellipse( 0, 0, faceSide * 0.35, faceSide * 0.35 );
        }
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
      // Empty / cleared map: wipe stale frame (never leave previous draw)
      if( !quadTreeQuads || quadTreeQuads.length === 0 ) {
        try {
          p.clear();
          p.background( is3D && webglLive ? 24 : 0 );
        } catch( e ) {}
        vizDirty = false;
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
      if( typeof scaleFactor2D === 'undefined' || viewFitPending ) {
        fitView2D();
        viewFitPending = false;
      }

      p.clear();
      p.background( 0 );

      for( var q2 = 0; q2 < quadTreeQuads.length; ++q2 ) {
        var q = quadTreeQuads[q2];
        if( !q || !q.center || !q.color ) { continue; }
        var col = rgbaColor( q.color );
        var x2 = scaleFactor2D * (q.center.x - 0.5 * q.sideSize - xOffset2D);
        var y2 = scaleFactor2D * (q.center.y - 0.5 * q.sideSize - yOffset2D);
        var side2 = scaleFactor2D * q.sideSize;
        drawRect2D( x2, y2, side2, side2, col, kQuadBorderColor2D );
      }

      if( shouldDrawRobot ) { drawRobot2D(); }
      if( shouldDrawCubes ) { drawCubes2D(); }
      if( shouldDrawFaces ) { drawFaces2D(); }
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
    detachHostResizeObserver();
    if( typeof myp5 !== 'undefined' && myp5 ) {
      try { myp5.remove(); } catch( e ) {}
      myp5 = undefined;
    }
    if( typeof canvasContainer !== 'undefined' && canvasContainer ) {
      try { canvasContainer.remove(); } catch( e2 ) {}
      canvasContainer = undefined;
    }
    if( typeof legendContainer !== 'undefined' && legendContainer ) {
      try { legendContainer.remove(); } catch( e3 ) {}
      legendContainer = undefined;
    }
  }

  function initializeSketch( elem ) {
    var $elem = asJq( elem );
    setHost( $elem );
    // Avoid duplicate containers if called twice
    if( canvasContainer && canvasContainer.length ) {
      try { canvasContainer.remove(); } catch( e ) {}
    }
    if( legendContainer && legendContainer.length ) {
      try { legendContainer.remove(); } catch( e2 ) {}
    }
    canvasContainer = $('<div></div>', { id: 'navMapContainer' }).appendTo( $elem );
    // p5 instance mode: prefer DOM node (works on 0.5–1.x); id string also ok
    var host = canvasContainer[0] || 'navMapContainer';
    try {
      myp5 = new p5( sketch, host );
    } catch( err ) {
      console.warn( 'navMap: p5 sketch failed', err );
      myp5 = undefined;
      return;
    }

    legendContainer = $('<div></div>', { id: 'legendContainer' }).appendTo( $elem );
    for( var idx = 0; idx < kKnownTypes.length; ++idx ) {
      legendContainer.append(
        '<span class="navMapLegendEntry" data-quadtype="' + kKnownTypes[idx] + '">' +
        kKnownTypes[idx] + '</span>'
      );
    }
    if( dumpInput ) {
      $elem.find( '#navMap-pastebin' ).remove();
      $('<div id="navMap-pastebin"></div>').appendTo( $elem );
    }
    attachHostResizeObserver();
  }

  /** Clear live map geometry (keeps controls). Used for empty / failed rebuilds. */
  function clearMapDrawing() {
    quadTreeQuads = [];
    dataExtentsInfo = {};
    robotPosition = undefined;
    cubeData = undefined;
    faceData = {};
    mapBakeDirty = true;
    viewFitPending = true;
    kickRedraw();
  }

  myMethods.init = function( elem ) {
    elem = asJq( elem ); // 2018 webviz often passes a raw HTMLElement
    setHost( elem );

    // Toolbar row — keep controls grouped so layout stays stable under shell host
    var $toolbar = $('<div class="navMapToolbar"></div>').appendTo( elem );

    updateBtn = $('<input type="button" value="Update"/>');
    updateBtn.click( function() {
      if( dumpInput ) {
        $host().find( '#navMap-pastebin' ).html( '' );
      }
      callUpdate();
    });
    updateBtn.appendTo( $toolbar ).prop( 'disabled', autoUpdate );

    // Prefixed ids: unique under #tab-navmap; labels scoped to host (not document)
    var chkAuto  = $('<input />', { type: 'checkbox', id: 'navMap-chkAuto'  }).appendTo( $toolbar ).prop( 'checked', autoUpdate );
    $('<label />', { 'for': 'navMap-chkAuto',  text: 'Auto-update' }).appendTo( $toolbar );
    var chk3D    = $('<input />', { type: 'checkbox', id: 'navMap-chk3D'    }).appendTo( $toolbar ).prop( 'checked', is3D );
    $('<label />', { 'for': 'navMap-chk3D',    text: '3D' }).appendTo( $toolbar );
    var chkInvH  = $('<input />', { type: 'checkbox', id: 'navMap-chkInvH'  }).appendTo( $toolbar ).prop( 'checked', invertHeight );
    $('<label />', { 'for': 'navMap-chkInvH',  text: 'Flip view' }).appendTo( $toolbar );
    var chkRobot = $('<input />', { type: 'checkbox', id: 'navMap-chkRobot' }).appendTo( $toolbar ).prop( 'checked', shouldDrawRobot );
    $('<label />', { 'for': 'navMap-chkRobot', text: 'Show robot' }).appendTo( $toolbar );
    var chkCubes = $('<input />', { type: 'checkbox', id: 'navMap-chkCubes' }).appendTo( $toolbar ).prop( 'checked', shouldDrawCubes );
    $('<label />', { 'for': 'navMap-chkCubes', text: 'Show cubes' }).appendTo( $toolbar );
    var chkFaces = $('<input />', { type: 'checkbox', id: 'navMap-chkFaces' }).appendTo( $toolbar ).prop( 'checked', shouldDrawFaces );
    $('<label />', { 'for': 'navMap-chkFaces', text: 'Show faces' }).appendTo( $toolbar );

    var $lblFaces = $toolbar.find( 'label[for="navMap-chkFaces"]' );
    var $lblInvH  = $toolbar.find( 'label[for="navMap-chkInvH"]' );

    // Faces work in 2D and 3D; Flip view is 3D-only
    if( !is3D ) {
      chkInvH.hide();
      $lblInvH.hide();
    }
    // Ensure faces control is visible (re-show if a prior forceIs2D hid it)
    chkFaces.show();
    $lblFaces.show();

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
        $lblFaces.show();
        chkInvH.show();
        $lblInvH.show();
        elem.find( '.navMapWebGLError' ).remove();
      } else {
        chkFaces.hide();
        $lblFaces.hide();
        chkInvH.hide();
        $lblInvH.hide();
      }

      // Tear down canvas; rebuild on next data (or immediately if we already have quads)
      destroySketch();

      if( quadTreeQuads && quadTreeQuads.length > 0 ) {
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
    // Never throw on null / unexpected payload shapes (shell surfaces module errors as toasts).
    try {
      if( elem ) { setHost( elem ); }
      elem = asJq( elem || hostElem );

      if( data == null || typeof data !== 'object' ) {
        return;
      }

      if( typeof canvasContainer === 'undefined' || !canvasContainer || !canvasContainer.length ) {
        if( elem && elem.length ) {
          initializeSketch( elem );
        }
      }

      if( dumpInput ) {
        var $pb = $host().find( '#navMap-pastebin' );
        if( $pb.length ) {
          try {
            $pb.html(
              $pb.html() + '\n\n************************************\n\n' + JSON.stringify( data )
            );
          } catch( eDump ) {}
        }
      }

      var type = data.type;
      if( typeof type !== 'string' ) {
        return;
      }
      var originId = data.originId;

      if( type === 'MemoryMapMessageVizBegin' ) {
        if( originId === undefined || originId === null ) { return; }
        memoryMapQuadInfoVectorMapIncoming[originId] = {};
        // mapInfo may be missing/malformed — store as object so End can reject cleanly
        memoryMapInfo[originId] = ( data.mapInfo && typeof data.mapInfo === 'object' )
          ? data.mapInfo
          : {};
      }
      else if( type === 'MemoryMapMessageViz' ) {
        if( originId === undefined || originId === null ) { return; }
        var dest = memoryMapQuadInfoVectorMapIncoming[originId];
        if( !dest ) {
          console.warn( 'navMap: MemoryMapMessageViz for unknown originId', originId );
          return;
        }
        var seqNumIn = data.seqNum;
        if( seqNumIn === undefined || seqNumIn === null ) { return; }
        // Accept array or missing; non-array becomes empty so End does not throw
        dest[seqNumIn] = Array.isArray( data.quadInfos ) ? data.quadInfos : [];
      }
      else if( type === 'MemoryMapMessageVizEnd' ) {
        if( originId === undefined || originId === null || !memoryMapInfo[originId] ) {
          console.warn( 'navMap: MemoryMapMessageVizEnd for unknown originId', originId );
          waitingOnData = false;
          if( updateBtn ) { updateBtn.prop( 'disabled', autoUpdate ); }
          return;
        }

        var mapInfo = memoryMapInfo[originId];
        var hasRoot =
          typeof mapInfo.rootCenterX === 'number' &&
          typeof mapInfo.rootCenterY === 'number' &&
          typeof mapInfo.rootDepth === 'number' &&
          typeof mapInfo.rootSize_mm === 'number';
        if( !hasRoot ) {
          console.warn( 'navMap: MemoryMapMessageVizEnd missing mapInfo fields', mapInfo );
          delete memoryMapQuadInfoVectorMapIncoming[originId];
          delete memoryMapInfo[originId];
          clearMapDrawing();
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

        var centerX_m = 0.001 * mapInfo.rootCenterX;
        var centerY_m = 0.001 * mapInfo.rootCenterY;
        var depth     = mapInfo.rootDepth;
        var rootSize  = 0.001 * mapInfo.rootSize_mm;

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
          if( !Array.isArray( quadInfo ) ) {
            ++expectedSeqNum;
            continue;
          }
          for( var idx = 0; idx < quadInfo.length; ++idx ) {
            var quad = quadInfo[idx];
            if( !quad || typeof quad !== 'object' ) { continue; }
            root.AddChild( quadTreeQuads, dataExtentsInfo, quad.content, quad.depth );
          }
          ++expectedSeqNum;
        }

        delete memoryMapQuadInfoVectorMapIncoming[originId];
        delete memoryMapInfo[originId];

        // No cells → clear stale drawing rather than keep previous map
        if( !quadTreeQuads.length ||
            typeof dataExtentsInfo.minX === 'undefined' ||
            dataExtentsInfo.minX === Number.MAX_VALUE ) {
          clearMapDrawing();
          if( updateBtn ) { updateBtn.prop( 'disabled', autoUpdate ); }
          waitingOnData = false;
          return;
        }

        robotPosition = ( data.robot && typeof data.robot === 'object' ) ? data.robot : undefined;

        // Flip Y (quads are in meters; robot is mm)
        for( var qi = 0; qi < quadTreeQuads.length; ++qi ) {
          var qq = quadTreeQuads[qi];
          if( qq && qq.center && typeof qq.center.y === 'number' ) {
            qq.center.y = flipY_m( qq.center.y );
          }
        }
        var tmpMaxY = dataExtentsInfo.maxY;
        dataExtentsInfo.maxY = flipY_m( dataExtentsInfo.minY );
        dataExtentsInfo.minY = flipY_m( tmpMaxY );
        if( robotPosition && typeof robotPosition.y === 'number' ) {
          robotPosition.y = flipY_mm( robotPosition.y );
        }

        mapBakeDirty = true;
        cameraResetPending = true;
        viewFitPending = true;
        kickRedraw();
        if( updateBtn ) { updateBtn.prop( 'disabled', autoUpdate ); }
        waitingOnData = false;
      }
      else if( type === 'MemoryMapCubes' ) {
        var newCubeData = data.cubes;
        if( !Array.isArray( newCubeData ) ) { return; }
        cubeData = newCubeData;
        for( var ci = 0; ci < cubeData.length; ++ci ) {
          var cube = cubeData[ci];
          if( cube && typeof cube.y === 'number' ) {
            cube.y = flipY_mm( cube.y );
          }
        }
        kickRedraw();
      }
      else if( type === 'MemoryMapFace' ) {
        var id = data.faceID;
        var pose = data.pose;
        if( id === undefined || id === null || !pose || typeof pose !== 'object' ) {
          return;
        }
        if( typeof pose.y === 'number' ) {
          pose.y = flipY_mm( pose.y );
        }
        faceData[id] = data;
        kickRedraw();
      }
      else if( type === 'RobotDeletedFace' ) {
        var faceId = data.faceID;
        if( faceId !== undefined && typeof faceData[faceId] !== 'undefined' ) {
          delete faceData[faceId];
          kickRedraw();
        }
      }
      // Unknown types: ignore (no throw)
    } catch( err ) {
      console.warn( 'navMap: onData error', err );
      waitingOnData = false;
      if( updateBtn ) {
        try { updateBtn.prop( 'disabled', autoUpdate ); } catch( e2 ) {}
      }
    }
  };

  var kAutoUpdatePeriod_s = 5.0;
  var timeTilAutoUpdate = kAutoUpdatePeriod_s;
  myMethods.update = function( dt, elem ) {
    if( elem ) { setHost( elem ); }
    if( typeof dt !== 'number' || !isFinite( dt ) ) { return; }
    timeTilAutoUpdate -= dt;
    if( (timeTilAutoUpdate < 0) && autoUpdate && !waitingOnData ) {
      callUpdate();
      timeTilAutoUpdate = kAutoUpdatePeriod_s;
    }
  };

  myMethods.getStyles = function() {
    var styles = `
      .navMapToolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 2px 0;
        margin-bottom: 6px;
        max-width: 100%;
      }
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
        max-width: 100%;
        line-height: 0;
        overflow: hidden;
      }
      #navMapContainer canvas {
        display: block;
        max-width: 100%;
      }
      #legendContainer {
        max-width: 100%;
        margin-top: 6px;
      }
      .navMapWebGLError {
        max-width: 100%;
        box-sizing: border-box;
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

    var host = hostElem || document.getElementById( 'tab-navmap' );
    for( var idx=0; idx<msgs.length; ++idx ) {
      try {
        myMethods.onData( JSON.parse( msgs[idx] ), host );
      } catch( e ) {
        console.warn( 'navMap: fakeData message failed', e );
      }
    }
  }

})(moduleMethods, moduleSendDataFunc);
