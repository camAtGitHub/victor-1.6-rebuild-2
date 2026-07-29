/*  
 * Displays IBEIConditon info that prevents behavior transitions
 *
 * Hardened for freeplay streams: never throw on missing parents / bad
 * payloads; cap history growth; unique condition classes (no id="cond").
 */

(function(myMethods, sendData) {

  // myMethods.devShouldDumpData = true;

  /** Soft cap on history steps (stack/factor/inactive events). */
  var MAX_HISTORY = 800;

  var instructions = 'Arrows &#8678 and &#8680 move to the next time the stack changed.<br/>'
    + 'Arrows &#8676; and &#8677; move backwards/forwards any change in factors, condition activation, or the stack.<br/>'
    + 'If nothing changes with &#8676; and &#8677, it probably means a condition was activated for a behavior that is in the '
    + 'process of activating, so continue clicking.<br/>'
    + 'Note that conditions are only updated if they are evaluated.'

  var history = [];
  var stacks = [];
  var inScopeBehaviors = []; // shares same index with stacks
  var condChanges = [];

  var condsByBehavior = {};
  var changesByCond = {};

  var autoScroll = true;
  var scrollToChange = true;
  var firstDraw = true;
  var drawIndex = 0;

  var parentsByBehavior = {};

  /** Module host element (#tab-behaviorconds). Prefer over document-global selectors. */
  var hostElem = null;

  function $host() {
    return hostElem ? $(hostElem) : $(document);
  }

  function conditionsContainer() {
    return $host().find('#conditionsContainer');
  }

  function GetMaxEntryIndex() {
    return history.length - 1;
  }
  function GetEntry(index) {
    if( index < 0 || index >= history.length ) {
      return undefined;
    }
    return history[index];
  }
  function GetLatestEntry() {
    return GetEntry( GetMaxEntryIndex() );
  }
  function GetCurrentBehavior(index) {
    var entry = GetEntry(index);
    if( !entry ) {
      return '';
    }
    var stack = stacks[entry.stackIndex];
    if( !Array.isArray(stack) || stack.length === 0 ) {
      return '';
    }
    return stack[stack.length - 1];
  }

  function isFiniteNumber(v) {
    return typeof v === 'number' && isFinite(v);
  }

  /** Ensure we always have a stack slot for cond events that arrive before first stack msg. */
  function ensureStackSlot() {
    if( stacks.length === 0 ) {
      stacks.push([]);
      inScopeBehaviors.push([]);
    }
    return stacks.length - 1;
  }

  function MergeTree(newData) {
    if( !Array.isArray(newData) ) {
      return;
    }
    newData.forEach(function(elem){
      if( !elem || typeof elem !== 'object' ) {
        return;
      }
      var behaviorID = elem['behaviorID'];
      if( typeof behaviorID === 'undefined' || behaviorID === null ) {
        return;
      }
      var parent = elem['parent'];
      if( !(behaviorID in parentsByBehavior) ) {
        parentsByBehavior[behaviorID] = [];
      }
      // Dedupe parent links so long freeplay sessions do not grow forever
      var list = parentsByBehavior[behaviorID];
      if( list.indexOf(parent) === -1 ) {
        list.push(parent);
      }
    });
  }

  function AddActiveCondition(parent, condition, newChange) {
    if( !condition || typeof condition !== 'object' ) {
      return;
    }
    var name = condition['conditionLabel'];
    if( typeof name === 'undefined' ) {
      name = '(unnamed)';
    }
    var areConditionsMet = condition['areConditionsMet'];
    var metStr = (areConditionsMet ? '[TRUE]' : '[FALSE]') + ' ' + name;
    // class="cond" — never reuse a fixed HTML id (was id="cond" for every row)
    var newDiv = $('<div class="cond">' + metStr + '</div>').appendTo(parent);
    if( newChange ) {
      newDiv.addClass('newChange');
    }
  
    var children = []; // cache children theyre added after factors
    Object.keys(condition).forEach( function(key){
      if( key != 'areConditionsMet' && key != 'conditionLabel' && key != 'ownerDebugLabel' ) {
        if( condition[key] !== null && typeof condition[key] === 'object' ) {
          children.push( condition[key] );
        } else {
          var factorStr = key + ': ' + condition[key];
          $('<div class="factor">' + factorStr + '</div>').appendTo( newDiv );
        }
      }
    });
    // now add children
    children.forEach(function(child){
      // assume active
      AddActiveCondition( newDiv, child );
    });
  }

  function AddInactiveCondition(parent, name, newChange) {
    var inactiveStr = 'inactive ' + name;
    var newDiv = $('<div class="cond">' + inactiveStr + '</div>').appendTo(parent);
    if( newChange ) {
      newDiv.addClass('newChange');
    }
  }

  /**
   * Place a behavior div under the best available parent. Never throw when
   * parent is missing from the current inScope snapshot (common under freeplay).
   */
  function placeBehaviorDiv(div, behaviorID, behaviorDivs) {
    var parents = parentsByBehavior[behaviorID];
    var $root = conditionsContainer();
    if( !parents || !parents.length ) {
      $root.append(div);
      return;
    }
    var placed = false;
    // Prefer last known parent (most recent merge) but fall back safely
    for( var i = parents.length - 1; i >= 0; --i ) {
      var parent = parents[i];
      if( typeof parent !== 'undefined' && parent == null ) {
        $root.append(div);
        placed = true;
        break;
      }
      if( parent != null && behaviorDivs[parent] ) {
        behaviorDivs[parent].append(div);
        placed = true;
        break;
      }
      // parent string exists in history but not in this inScope snapshot — try older
    }
    if( !placed ) {
      // Orphan: attach at root rather than throw on undefined.append
      $root.append(div);
    }
  }

  function Redraw() {
    var $container = conditionsContainer();
    if( !$container.length ) {
      return;
    }
    $container.empty();

    if( !history.length || drawIndex < 0 || drawIndex >= history.length ) {
      return;
    }
    var entry = history[drawIndex];
    if( !entry ) {
      return;
    }

    var condChangedThisTick = entry.whatChanged == 'c' || entry.whatChanged == 'i';
    var condChangeIndex = entry.condChangeIndex;
    var stack = stacks[entry.stackIndex];
    if( !Array.isArray(stack) ) {
      stack = [];
    }
    var inScope = inScopeBehaviors[entry.stackIndex];
    if( typeof inScope === 'undefined' || !Array.isArray(inScope) ) { // no behaviors yet
      return;
    }
    var behaviorDivs = {};
    var currentBeh = GetCurrentBehavior(drawIndex);

    inScope.forEach(function(behaviorID){
      if( typeof behaviorID === 'undefined' || behaviorID === null ) {
        return;
      }
      var behaviorDiv = $('<div class="behavior">' + behaviorID + '</div>');
      if( (!condChangedThisTick) && (currentBeh == behaviorID) ) {
        behaviorDiv.addClass('currentBehavior')
      }
      var conds = condsByBehavior[behaviorID];
      var setInactiveForThisBehavior = new Set();
      if( typeof conds !== 'undefined' ) {
        conds.forEach(function(cond) {
          var changes = changesByCond[cond];
          if( typeof changes === 'undefined' ) {
            return;
          }
          // find the last change with index <= condChangeIndex
          var lastMatch;
          var newChange = false;
          changes.forEach(function(change){
            if( change <= condChangeIndex ) {
              newChange = condChangedThisTick && (change == condChangeIndex);
              lastMatch = change;
            }
          });
          if( typeof lastMatch !== 'undefined' ) {
            var matchingChange = condChanges[lastMatch];
            // behaviorID owns cond, which has matchingChange as the last entry
            if( matchingChange && typeof matchingChange === 'object' && !Array.isArray(matchingChange) && ('areConditionsMet' in matchingChange) ) {
              // it's a factor change
              AddActiveCondition(behaviorDiv, matchingChange, newChange);
            } else if( matchingChange && typeof matchingChange === 'object' && Array.isArray(matchingChange) ) {
              for( var i=0; i<matchingChange.length; ++i ) {
                if( !setInactiveForThisBehavior.has( matchingChange[i] ) ) {
                  AddInactiveCondition(behaviorDiv, matchingChange[i], newChange)
                  setInactiveForThisBehavior.add( matchingChange[i] );
                }
              }
            }
            // else: unknown shape — skip silently
          }
        });
      }
      behaviorDivs[behaviorID] = behaviorDiv;
    });

    // Hierarchy: place under known in-scope parent, else root — never throw
    Object.keys(behaviorDivs).forEach(function(behaviorID){
      placeBehaviorDiv(behaviorDivs[behaviorID], behaviorID, behaviorDivs);
    });

    // and finally toggle white/grey classes
    $container.find('*').each(function(){
      var parentWhite = $(this).parent().hasClass('whiteBox');
      $(this).toggleClass('whiteBox', !parentWhite);
    });

    $host().find('input[type=range]').val(drawIndex);
    UpdateScrollPos();
    UpdateDisabledState();
  }

  function RedrawIfNeeded() {
    if( autoScroll || firstDraw ) {
      firstDraw = false;
      drawIndex = Math.max(0, history.length - 1);
      Redraw();
    }
  }

  function UpdateSlider() {
    var maxIdx = Math.max(0, history.length - 1);
    var $slider = $host().find('#timeSlider');
    $slider.attr('max', maxIdx);
    if( !history.length ) {
      $host().find('#timeSliderLabel').text('time = —');
      return;
    }
    var val = parseInt($slider.val(), 10);
    if( !isFinite(val) || val < 0 ) {
      val = 0;
    }
    if( val > maxIdx ) {
      val = maxIdx;
      $slider.val(val);
    }
    var entry = GetEntry(val);
    if( !entry ) {
      return;
    }
    var time = Math.round( entry.time * 1000 ) / 1000;
    $host().find('#timeSliderLabel').text('time = ' + time);
  }

  function UpdateScrollPos() {
    if( !scrollToChange ) {
      return;
    }
    var entry = GetEntry(drawIndex);
    if( !entry ) {
      return;
    }
    var changed = entry.whatChanged;
    var highlightCond = (changed == 'c' || changed == 'i'); // else highlight behavior
    var $container = conditionsContainer();
    var scrollTo = highlightCond ? $container.find('div.newChange') : $container.find('div.currentBehavior');
    if( scrollTo.length ) {
      var top = scrollTo[0].offsetTop - 150;
      $container.stop().animate({
        scrollTop: top
      }, 100);
    }
  }

  function AddEntry(time, change, stackIndex, condChangeIndex) {
    history.push({
      time: time,
      whatChanged: change,
      stackIndex: stackIndex,
      condChangeIndex: condChangeIndex
    });
    TrimHistoryIfNeeded();
    UpdateSlider();
  }

  /**
   * Cap history / parallel arrays so freeplay sessions do not grow without bound.
   * Remaps stackIndex / condChangeIndex and rebuilds changesByCond after trim.
   */
  function TrimHistoryIfNeeded() {
    if( history.length <= MAX_HISTORY ) {
      return;
    }
    var drop = history.length - MAX_HISTORY;
    history.splice(0, drop);
    drawIndex = Math.max(0, drawIndex - drop);
    if( drawIndex >= history.length ) {
      drawIndex = Math.max(0, history.length - 1);
    }

    // Compact stacks / condChanges based on min indices still referenced
    var minStack = Infinity;
    var minCond = Infinity;
    for( var i = 0; i < history.length; ++i ) {
      var e = history[i];
      if( typeof e.stackIndex === 'number' && e.stackIndex < minStack ) {
        minStack = e.stackIndex;
      }
      if( typeof e.condChangeIndex === 'number' && e.condChangeIndex < minCond ) {
        minCond = e.condChangeIndex;
      }
    }
    if( !isFinite(minStack) ) {
      minStack = 0;
    }
    if( !isFinite(minCond) ) {
      minCond = 0;
    }

    if( minStack > 0 ) {
      stacks.splice(0, minStack);
      inScopeBehaviors.splice(0, minStack);
      for( var s = 0; s < history.length; ++s ) {
        history[s].stackIndex -= minStack;
      }
    }

    if( minCond > 0 ) {
      condChanges.splice(0, minCond);
      for( var c = 0; c < history.length; ++c ) {
        history[c].condChangeIndex = Math.max(0, history[c].condChangeIndex - minCond);
      }
      // Remap changesByCond indices; drop empty sets
      Object.keys(changesByCond).forEach(function(name) {
        var oldSet = changesByCond[name];
        var newSet = new Set();
        if( oldSet && typeof oldSet.forEach === 'function' ) {
          oldSet.forEach(function(idx) {
            if( idx >= minCond ) {
              newSet.add(idx - minCond);
            }
          });
        }
        if( newSet.size === 0 ) {
          delete changesByCond[name];
        } else {
          changesByCond[name] = newSet;
        }
      });
      // Drop cond names no longer referenced from condsByBehavior
      Object.keys(condsByBehavior).forEach(function(owner) {
        var set = condsByBehavior[owner];
        if( !set || typeof set.forEach !== 'function' ) {
          delete condsByBehavior[owner];
          return;
        }
        var keep = new Set();
        set.forEach(function(name) {
          if( name in changesByCond ) {
            keep.add(name);
          }
        });
        if( keep.size === 0 ) {
          delete condsByBehavior[owner];
        } else {
          condsByBehavior[owner] = keep;
        }
      });
    }
  }

  function ClearHistory() {
    history = [];
    stacks = [];
    inScopeBehaviors = [];
    condChanges = [];
    condsByBehavior = {};
    changesByCond = {};
    // Keep parentsByBehavior — hierarchy hints are cheap and useful across clears
    drawIndex = 0;
    autoScroll = true;
    firstDraw = true;
    UpdateSlider();
    UpdateDisabledState();
    conditionsContainer().empty();
  }

  function AddToCondsByBehavior(name, owner) {
    if( typeof name === 'undefined' || typeof owner === 'undefined' ) {
      return;
    }
    if( !(name in changesByCond) ) {
      changesByCond[name] = new Set();
    }
    changesByCond[ name ].add( condChanges.length - 1 );
    if( !(owner in condsByBehavior) ) {
      condsByBehavior[owner] = new Set();
    }
    condsByBehavior[owner].add( name );
  }

  function OnFactorsChanged(data) {
    // todo: when the stack changes, we'll receive new conditions before
    // receiving the stack. So when adding the stack, it should be inserted
    // before the first 'c' entry of the same time.
    if( !data || typeof data !== 'object' ) {
      return;
    }
    var time = data['time'];
    var factors = data['factors'];
    if( !isFiniteNumber(time) ) {
      return;
    }
    if( !factors || typeof factors !== 'object' || Array.isArray(factors) ) {
      return;
    }
    var name = factors['conditionLabel'];
    var owner = factors['ownerDebugLabel'];
    if( typeof name === 'undefined' || typeof owner === 'undefined' ) {
      return;
    }
    var stackIdx = ensureStackSlot();
    condChanges.push( factors );
    AddEntry( time, 'c', stackIdx, condChanges.length - 1 );
    AddToCondsByBehavior(name, owner);

    RedrawIfNeeded();
  }

  function OnInactive( data ) {
    if( !data || typeof data !== 'object' ) {
      return;
    }
    var time = data['time'];
    var name = data['inactive'];
    var owner = data['owner'];
    if( !isFiniteNumber(time) ) {
      return;
    }
    if( typeof name === 'undefined' || typeof owner === 'undefined' ) {
      return;
    }
    var stackIdx = ensureStackSlot();
    if( (history.length > 0)
        && (history[history.length - 1].whatChanged == 'i')
        && (history[history.length - 1].time == time) )
    {
      // the current tick deactivated another condition(s) so add it to that list
      var last = condChanges[condChanges.length - 1];
      if( Array.isArray(last) ) {
        last.push( name );
      } else {
        // unexpected shape — start a fresh inactive batch
        condChanges.push( [name] );
        AddEntry( time, 'i', stackIdx, condChanges.length - 1 );
      }
    } else {
      condChanges.push( [name] );
      AddEntry( time, 'i', stackIdx, condChanges.length - 1 );
    }
    
    AddToCondsByBehavior(name, owner);

    RedrawIfNeeded();
  }

  function OnStackChanged( data ) {
    if( !data || typeof data !== 'object' ) {
      return;
    }
    var stack = data['stack'];
    var tree = data['tree'];
    var time = data['time'];
    if( !isFiniteNumber(time) ) {
      return;
    }
    if( !Array.isArray(stack) ) {
      stack = [];
    }
    if( !Array.isArray(tree) ) {
      // Without tree we still record the stack snapshot so history advances
      tree = [];
    }
    MergeTree(tree);
    var inScope = [];
    tree.forEach(function(e) {
      if( e && typeof e === 'object' && typeof e['behaviorID'] !== 'undefined' ) {
        inScope.push( e['behaviorID'] );
      }
    });
    // If tree empty but stack has names, still show stack members as in-scope
    if( !inScope.length && stack.length ) {
      inScope = stack.slice();
    }
    var latest = history.length ? GetLatestEntry() : null;
    if( latest && latest.whatChanged == 's' && latest.time == time ) {
      stacks[ latest.stackIndex ] = stack;
      inScopeBehaviors[ latest.stackIndex ] = inScope;
    } else {
      stacks.push( stack );
      inScopeBehaviors.push( inScope );
      AddEntry( time, 's', stacks.length - 1, Math.max(0, condChanges.length - 1) );
    }
    RedrawIfNeeded();
  }

  function UpdateDisabledState() {
    if( !history.length ) {
      $host().find('#nextButton, #nextStack, #backButton, #backStack').prop('disabled', true);
      return;
    }
    var entry = GetEntry(drawIndex);
    if( !entry ) {
      return;
    }
    var stackIndex = entry.stackIndex;
    var condIndex = entry.condChangeIndex;

    var noMoreStacks = (stackIndex >= stacks.length - 1 );
    var noMoreFactors = (condIndex >= condChanges.length - 1 ) || (drawIndex >= history.length - 1);
    $host().find('#nextButton').prop('disabled', noMoreFactors );
    $host().find('#nextStack').prop('disabled', noMoreStacks );
    var noPrevStacks = (stackIndex <= 0);
    var noPrevFactors = (drawIndex <= 0);
    $host().find('#backButton').prop('disabled', noPrevFactors );
    $host().find('#backStack').prop('disabled', noPrevStacks );
  }

  myMethods.init = function(elem) {
    hostElem = elem;
    var $root = $(elem);

    $('<div class="bcInstructions">' + instructions + '</div>').appendTo($root);
    var controls = $('<div id="controls"></div>').appendTo($root);
    $('<div id="conditionsContainer"></div>').appendTo($root);

    controls.append('<button type="button" class="button" id="backStack">&#8678;</button>');
    controls.append('<button type="button" class="button" id="backButton">&#8676;</button>');
    controls.append('<input id="timeSlider" type="range" min="0" max="0" value="0" step="1" />');
    controls.append('<button type="button" class="button" id="nextButton">&#8677;</button>');
    controls.append('<button type="button" class="button" id="nextStack">&#8680;</button>');
    controls.append('<label id="timeSliderLabel">0</label>');
    controls.append('<button type="button" class="button" id="clearHistory" title="Clear condition history">Clear</button>');
    controls.append('<div id="timeSliderTooltip"></div>');
    controls.append('<label for="chkScroll">Scroll to modified</label>');
    controls.append('<input id="chkScroll" type="checkbox" checked/>');
    

    $root.find('#timeSlider').on('input', function() { // sliding, but not finished sliding
      if( !history.length ) {
        return;
      }
      var slider = $(this);
      var val = parseInt(slider.val(), 10);
      if( !isFinite(val) || val < 0 || val > GetMaxEntryIndex() ) {
        return;
      }
      var width = slider.width();
      var minAttr = parseFloat(slider.attr("min")) || 0;
      var maxAttr = parseFloat(slider.attr("max"));
      if( !isFinite(maxAttr) || maxAttr <= minAttr ) {
        maxAttr = minAttr + 1;
      }
      var ballPct = (val - minAttr) / (maxAttr - minAttr);
      var left = width * ballPct + slider.offset().left;
      var top = slider.offset().top;
      var currBehavior = GetCurrentBehavior(val);
      $root.find('#timeSliderTooltip')
        .text(currBehavior || '(no stack)')
        .css({
          left: left,
          top: top
        })
        .show();
    });
    $root.find('#timeSlider').change(function() { // finished sliding
      $root.find('#timeSliderTooltip').hide();
      if( !history.length ) {
        return;
      }
      var val = parseInt($(this).val(), 10);
      var maxIdx = GetMaxEntryIndex();
      if( !isFinite(val) ) {
        return;
      }
      if( val <= maxIdx ) {
        var entry = GetEntry(val);
        if( !entry ) {
          return;
        }
        var time = Math.round( entry.time * 1000 ) / 1000;
        $root.find('#timeSliderLabel').text( 'time = ' + time );
        if( val != drawIndex ) {
          drawIndex = val;
          Redraw();
        }
      }
      if( val == maxIdx ) {
        autoScroll = true;
      } else {
        autoScroll = false;
      }
    });

    $root.find('#chkScroll').change(function() {
      scrollToChange = $(this).is(':checked');
    });

    $root.find('#clearHistory').click(function() {
      ClearHistory();
    });

    // todo: buttons should really just apply the change instead of redraw
    // if the current sketch is the previous tick
    $root.find('#nextButton').click(function() {
      if( !history.length || drawIndex == GetMaxEntryIndex() ) {
        return;
      }
      ++drawIndex;
      if( drawIndex == GetMaxEntryIndex() ) {
        autoScroll = true;
      }
      Redraw();
    });
    $root.find('#nextStack').click(function() {
      if( !history.length ) {
        return;
      }
      var entry = GetEntry(drawIndex);
      if( !entry ) {
        return;
      }
      var nextStack = 1 + entry.stackIndex;
      if( nextStack <= stacks.length - 1 ) {
        for( var idx = drawIndex; idx < history.length; ++idx ) {
          if( GetEntry(idx).stackIndex == nextStack ) {
            drawIndex = idx;
            if( drawIndex == GetMaxEntryIndex() ) {
              autoScroll = true;
            }
            Redraw();
            break;
          }
        }
      }
    });
    $root.find('#backButton').click(function() {
      if( !history.length || drawIndex == 0 ) {
        return;
      }
      autoScroll = false;
      --drawIndex;
      Redraw();
    });
    $root.find('#backStack').click(function() {
      if( !history.length ) {
        return;
      }
      var entry = GetEntry(drawIndex);
      if( !entry ) {
        return;
      }
      var currStack = entry.stackIndex;
      if( currStack > 0 ) {
        var prevStack = currStack - 1;
        for( var idx = drawIndex; idx >= 0; --idx ) {
          if( GetEntry(idx).stackIndex == prevStack ) {
            drawIndex = idx;
          }
          if( idx == 0 || GetEntry(idx).stackIndex < prevStack ) {
            autoScroll = false;
            Redraw();
            break;
          }
        }
      }
    });
  };

  myMethods.onData = function(data, elem) {
    // Never throw on null / unexpected payload shapes (shell surfaces module errors as toasts).
    if( data == null || typeof data !== 'object' ) {
      return;
    }
    if( typeof data['factors'] !== 'undefined' ) {
      OnFactorsChanged( data );
    } else if( typeof data['inactive'] !== 'undefined' ) {
      OnInactive( data );
    } else if( typeof data['stack'] !== 'undefined' || typeof data['tree'] !== 'undefined' ) {
      OnStackChanged(data);
    }
    // else: ignore unknown shapes
  };

  myMethods.update = function(dt, elem) {};

  myMethods.getStyles = function() {
    return `
      #conditionsContainer {
        overflow-y: scroll; 
        min-height:300px;
        max-height:600px;
        width:100%;
        padding:10px;
        margin-top:10px;
        border:1px solid #aaa;
      }
      #conditionsContainer div {
        margin-top:5px;
        padding: 5px 10px;
        font-family: monospace;
      }
      div {
        background-color:#ededed;
      }
      div.whiteBox {
        background-color:white;
      }
      div {
        font-weight:normal;
        border:1px solid transparent;
      }
      div.currentBehavior {
        font-weight:bold;
        border: 1px solid red;
      }
      #controls {
        padding-left:10px;
        padding-top:5px;
      }
      #controls > * {
        margin-left:5px;
      }
      #timeSliderLabel {
        margin-left:10px;
      }
      input[type=range],
      button {
        vertical-align:middle;
      }
      .newChange {
        border: 1px solid red;
      }
      #timeSliderTooltip {
        display:none;
        position:fixed;
        top:0;
        left:0;
        width:auto;
        height:20px;
        border:1px solid black;
        padding:5px 10px 10px 5px;
        vertical-align:middle;
        background-color:white;
      }
      #chkScroll, label[for=chkScroll] {
        float:right;
      }
      #clearHistory {
        margin-left:12px;
      }
      .bcInstructions {
        margin: 6px 10px;
        font-size: 12px;
      }
    `;
  };

})(moduleMethods, moduleSendDataFunc);
