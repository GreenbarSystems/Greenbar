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
  let _idx = 0;
  let _active = false;
  let _overlay = null;
  let _card = null;
  let _pulseTarget = null;
  let _onFinish = null;

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
    // Tap outside the card on the dim overlay = ALSO skip.
    _overlay.addEventListener('click', (e) => { if(e.target === _overlay) skip(); });
  }

  function findTarget(sel){
    const el = document.querySelector(sel);
    // Verify visible (offsetParent !== null catches display:none / visibility:hidden)
    return (el && el.offsetParent !== null) ? el : null;
  }

  function position(step, target){
    const r = target.getBoundingClientRect();
    const cardRect = _card.getBoundingClientRect();
    const margin = 14;
    let top, left, arrowTop, arrowLeft, arrowSide;
    if(step.side === 'bottom'){
      top = r.bottom + margin;
      arrowSide = 'top';
    } else {
      top = r.top - cardRect.height - margin;
      arrowSide = 'bottom';
    }
    // Horizontal: center on target, clamped to viewport with 12px padding.
    const vw = window.innerWidth;
    const targetCenterX = r.left + r.width / 2;
    left = targetCenterX - cardRect.width / 2;
    left = Math.max(12, Math.min(left, vw - cardRect.width - 12));
    arrowLeft = targetCenterX - left - 6; // arrow is 12px wide
    arrowLeft = Math.max(20, Math.min(arrowLeft, cardRect.width - 32));
    _card.style.top  = top  + 'px';
    _card.style.left = left + 'px';
    const arrow = document.getElementById('tour-arrow');
    arrow.style.left = arrowLeft + 'px';
    arrow.className = 'tour-arrow-' + arrowSide;
  }

  function showStep(i){
    const step = STEPS[i];
    if(!step) return finish();
    // Try to find the target. If a step's element isn't on screen
    // (e.g., user has no data yet so .stat-tile doesn't exist), skip the step.
    const target = findTarget(step.sel);
    if(!target){
      _idx++;
      return showStep(_idx);
    }
    // Clear pulse from previous target.
    if(_pulseTarget){ _pulseTarget.classList.remove('tour-target-pulse'); }
    _pulseTarget = target;
    target.classList.add('tour-target-pulse');
    target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    document.getElementById('tour-step-indicator').textContent = (i + 1) + ' of ' + STEPS.length;
    document.getElementById('tour-title').textContent = step.title;
    document.getElementById('tour-copy').textContent  = step.copy;
    document.getElementById('tour-next').innerHTML =
      (i === STEPS.length - 1) ? 'Done' : 'Got it &rarr;';
    // Wait one frame for layout, then position the card relative to the target.
    requestAnimationFrame(() => position(step, target));
  }
  function next(){
    if(_idx >= STEPS.length - 1) return finish();
    _idx++;
    showStep(_idx);
  }
  function skip(){ finish(); }
  function finish(){
    markDone();
    _active = false;
    if(_pulseTarget){ _pulseTarget.classList.remove('tour-target-pulse'); _pulseTarget = null; }
    if(_overlay){ _overlay.remove(); _overlay = null; _card = null; }
    const cb = _onFinish; _onFinish = null;
    if(typeof cb === 'function'){ try { cb(); } catch(e){} }
  }

  // start() accepts an optional { onFinish } callback that fires once the
  // tour is dismissed (whether the user tapped the final Done or skipped via X).
  function start(opts){
    if(_active) return;
    if(!_overlay) buildOverlay();
    _onFinish = (opts && typeof opts.onFinish === 'function') ? opts.onFinish : null;
    _active = true;
    _idx = 0;
    showStep(0);
  }

  // Re-position when the viewport changes (rotation, soft keyboard, etc.)
  window.addEventListener('resize', () => {
    if(_active && _idx >= 0 && _idx < STEPS.length){
      const target = findTarget(STEPS[_idx].sel);
      if(target) requestAnimationFrame(() => position(STEPS[_idx], target));
    }
  });

  return { start, skip, reset, isDone };
})();
