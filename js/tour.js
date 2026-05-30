// ════ Greenbar — gbTour: on-Summary coachmark tour ════
// Replaces the legacy 6-slide walkthrough screen with 4 brief contextual
// callouts pointing at real UI elements (Import button, month pills, stat
// tiles, bottom nav). Fires once on first Summary load; the user can skip
// the whole thing with one tap on the ✕. Re-trigger from Settings → "Tour
// the app".
//
// State: localStorage key 'gb_tour_done' = '1' once dismissed.
const gbTour = (() => {
  const K_DONE = 'gb_tour_done';

  // Tunable layout/behaviour values. Adjusting any of these is a one-place
  // change with no ripple into call sites.
  const LAYOUT = {
    CARD_MARGIN_PX:        14,  // gap between target and card
    EDGE_PADDING_PX:       12,  // viewport-edge clamp padding
    ARROW_HALF_WIDTH_PX:    6,  // arrow is 12px wide
    ARROW_MIN_LEFT_PX:     20,  // arrow's minimum left offset within the card
    ARROW_MAX_OFFSET_PX:   32,  // arrow's max distance from the card's right edge
    DISMISS_TAP_MAX_DRIFT:  8,  // pointer movement threshold for outside-tap dismiss
    RESIZE_DEBOUNCE_MS:   100,  // resize handler debounce
  };
  // How long to wait after showScreen('summary') before opening the tour —
  // gives the screen transition time to settle so the first card lands at
  // the correct coordinates. Exported via startAfterScreen() so call sites
  // don't have to know the magic number.
  const START_DELAY_MS = 250;

  let _idx = 0;
  let _active = false;
  let _overlay = null;
  let _card = null;
  let _pulseTarget = null;
  let _activeSteps = []; // STEPS filtered to those with a visible target at start()
  let _resizeTimer = null;
  let _downX = 0, _downY = 0; // for outside-tap dismiss threshold

  // Each step targets a CSS selector. side controls the arrow direction:
  //   'top'    -> card sits ABOVE target, arrow points DOWN
  //   'bottom' -> card sits BELOW target, arrow points UP
  // copy is intentionally short -- one sentence each.
  const STEPS = [
    {
      sel: '#hdr-import-btn',
      side: 'bottom',
      title: 'Start here',
      copy: 'Tap Import any time to bring in a new CSV of transactions from your bank.'
    },
    {
      sel: '.pills-row .pill',
      side: 'bottom',
      title: 'Switch months',
      copy: 'Pick a month or tap All for an across-the-board view.'
    },
    {
      sel: 'button.stat-tile',
      side: 'bottom',
      title: 'See the details',
      copy: 'Tap any tile for the breakdown behind the number.'
    },
    {
      sel: '.bottom-nav',
      side: 'top',
      title: 'Everything else',
      copy: 'Budget, Transactions, Guide and Settings live down here.'
    }
  ];

  function isDone(){ return localStorage.getItem(K_DONE) === '1'; }
  function markDone(){ try{ localStorage.setItem(K_DONE, '1'); }catch(e){} }
  function reset(){ try{ localStorage.removeItem(K_DONE); }catch(e){} }

  function buildOverlay(){
    _overlay = document.createElement('div');
    _overlay.id = 'tour-overlay';
    _overlay.setAttribute('role', 'dialog');
    _overlay.setAttribute('aria-modal', 'true');
    _overlay.setAttribute('aria-label', 'Greenbar quick tour');
    _overlay.innerHTML = `
      <div id="tour-card">
        <button type="button" id="tour-skip" aria-label="Skip tour" title="Skip tour">&#x2715;</button>
        <div id="tour-step-indicator"></div>
        <div id="tour-title"></div>
        <div id="tour-copy"></div>
        <div id="tour-actions">
          <button type="button" id="tour-next" class="btn-flash-cta" style="padding:10px 22px;font-size:14px;">Got it &rarr;</button>
        </div>
        <div id="tour-arrow"></div>
      </div>
    `;
    document.body.appendChild(_overlay);
    _card = document.getElementById('tour-card');
    document.getElementById('tour-skip').addEventListener('click', skip);
    document.getElementById('tour-next').addEventListener('click', next);
    // Tap outside the card on the dim overlay = skip — but only if the
    // pointer didn't drift (so a touch-and-drag-to-scroll attempt doesn't
    // accidentally dismiss the tour).
    _overlay.addEventListener('pointerdown', (e) => {
      if(e.target !== _overlay) return;
      _downX = e.clientX;
      _downY = e.clientY;
    });
    _overlay.addEventListener('pointerup', (e) => {
      if(e.target !== _overlay) return;
      const dx = e.clientX - _downX;
      const dy = e.clientY - _downY;
      if(Math.hypot(dx, dy) > LAYOUT.DISMISS_TAP_MAX_DRIFT) return;
      skip();
    });
  }

  function findTarget(sel){
    const el = document.querySelector(sel);
    // Verify visible (offsetParent !== null catches display:none / visibility:hidden).
    // Does NOT catch opacity:0 layouts — sufficient for current call paths,
    // which all fire after showHeaderButtons reveals the nav.
    return (el && el.offsetParent !== null) ? el : null;
  }

  function position(step, target){
    const r = target.getBoundingClientRect();
    const cardRect = _card.getBoundingClientRect();
    const L = LAYOUT;
    let top, left, arrowLeft, arrowSide;
    if(step.side === 'bottom'){
      top = r.bottom + L.CARD_MARGIN_PX;
      arrowSide = 'top';
    } else {
      top = r.top - cardRect.height - L.CARD_MARGIN_PX;
      arrowSide = 'bottom';
    }
    // Horizontal: center on target, clamped to viewport with edge padding.
    const vw = window.innerWidth;
    const targetCenterX = r.left + r.width / 2;
    left = targetCenterX - cardRect.width / 2;
    left = Math.max(L.EDGE_PADDING_PX, Math.min(left, vw - cardRect.width - L.EDGE_PADDING_PX));
    arrowLeft = targetCenterX - left - L.ARROW_HALF_WIDTH_PX;
    arrowLeft = Math.max(L.ARROW_MIN_LEFT_PX, Math.min(arrowLeft, cardRect.width - L.ARROW_MAX_OFFSET_PX));
    _card.style.top  = top  + 'px';
    _card.style.left = left + 'px';
    const arrow = document.getElementById('tour-arrow');
    arrow.style.left = arrowLeft + 'px';
    arrow.className = 'tour-arrow-' + arrowSide;
  }

  function showStep(i){
    const step = _activeSteps[i];
    if(!step) return finish();
    const target = findTarget(step.sel);
    // _activeSteps was filtered at start time so target SHOULD exist, but
    // if the DOM changed mid-tour (e.g., user data was cleared in another
    // tab) we skip rather than crash.
    if(!target){
      _idx++;
      return showStep(_idx);
    }
    // Clear pulse from previous target.
    if(_pulseTarget){ _pulseTarget.classList.remove('tour-target-pulse'); }
    _pulseTarget = target;
    target.classList.add('tour-target-pulse');
    // Instant (not smooth) scroll: smooth would return mid-animation,
    // causing position() to read a half-scrolled rect and land the card
    // and arrow off-target.
    target.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    document.getElementById('tour-step-indicator').textContent = (i + 1) + ' of ' + _activeSteps.length;
    document.getElementById('tour-title').textContent = step.title;
    document.getElementById('tour-copy').textContent  = step.copy;
    document.getElementById('tour-next').innerHTML =
      (i === _activeSteps.length - 1) ? 'Done' : 'Got it &rarr;';
    // Wait one frame for layout, then position the card relative to the target.
    requestAnimationFrame(() => position(step, target));
  }
  function next(){
    if(_idx >= _activeSteps.length - 1) return finish();
    _idx++;
    showStep(_idx);
  }
  function skip(){ finish(); }
  function finish(){
    markDone();
    _active = false;
    if(_resizeTimer){ clearTimeout(_resizeTimer); _resizeTimer = null; }
    if(_pulseTarget){ _pulseTarget.classList.remove('tour-target-pulse'); _pulseTarget = null; }
    if(_overlay){ _overlay.remove(); _overlay = null; _card = null; }
  }

  function start(){
    if(_active) return;
    if(!_overlay) buildOverlay();
    // Precompute the steps whose targets are currently visible. Avoids
    // recursive auto-skip inside showStep AND makes the "Done" button
    // label decision accurate even when steps got skipped.
    _activeSteps = STEPS.filter(s => findTarget(s.sel));
    if(_activeSteps.length === 0){ finish(); return; }
    _active = true;
    _idx = 0;
    showStep(0);
  }

  // Helper for HTML call sites: navigate to Summary, then start the tour
  // once the screen transition has settled. Replaces the duplicated
  //   setTimeout(()=>gbTour.start(), 250)
  // pattern that lived in index.html in two places.
  function startAfterScreen(){ setTimeout(start, START_DELAY_MS); }

  // Re-position when the viewport changes (rotation, soft keyboard). Debounced
  // so a rapid burst of resize events (soft keyboard appearance) doesn't run
  // position() on every frame.
  window.addEventListener('resize', () => {
    if(!_active) return;
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      const step = _activeSteps[_idx];
      if(!step) return;
      const target = findTarget(step.sel);
      if(target) requestAnimationFrame(() => position(step, target));
    }, LAYOUT.RESIZE_DEBOUNCE_MS);
  });

  return { start, startAfterScreen, skip, reset, isDone, START_DELAY_MS };
})();
