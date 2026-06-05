// ════ Greenbar — gbTour: one-shot "How Greenbar works" modal ════
// Static text modal opened from Settings → "Tour the app". Replaces the
// previous animated coachmark engine (positioned arrows + target-pulse
// halo + resize/drift handlers) — 4 lines of text in a sheet dialog
// covering the same surfaces (Import, period buttons, tile breakdowns,
// bottom nav).
//
// State: localStorage key 'gb_tour_done' = '1' once dismissed.
//
// Public API kept (called from index.html Settings entry):
//   gbTour.reset()           — clear the done flag so it shows again
//   gbTour.startAfterScreen()— open after the screen transition settles
//   gbTour.finish()          — onclick target on the modal's CTA / ✕
// Plus gbTour.start / .skip / .isDone / START_DELAY_MS for any future
// composition; matches the previous module's surface so existing
// callers don't need to change.
const gbTour = (() => {
  const K_DONE = 'gb_tour_done';
  // How long to wait after showScreen() before opening — matches the
  // previous engine so the Settings click flow feels identical.
  const START_DELAY_MS = 250;

  function isDone(){ return localStorage.getItem(K_DONE) === '1'; }
  function markDone(){ safeSetLocal(K_DONE, '1'); }
  function reset(){ try{ localStorage.removeItem(K_DONE); }catch(e){} }

  function start(){
    if(typeof openModal === 'function') openModal('modal-tour');
  }
  function finish(){
    markDone();
    if(typeof closeModal === 'function') closeModal('modal-tour');
  }
  function skip(){ finish(); }
  function startAfterScreen(){ setTimeout(start, START_DELAY_MS); }

  return { start, startAfterScreen, finish, skip, reset, isDone, START_DELAY_MS };
})();
