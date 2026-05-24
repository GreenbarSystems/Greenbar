// ════ Boot sequence (loads last) ════
// Runs after all other JS files. Wires up the security gate (if enabled) before
// the original data-load + render flow. Modules above provide loadCFG, loadData,
// gbAuth, gbPrivacy, runFlashIntro, showHeaderButtons, renderAll, showScreen,
// _navBtn, updateLogBadge -- nothing new is declared here.

// ════ Boot sequence ════
// Security gate runs BEFORE any data is rendered. If the user has security
// enabled, the lock screen masks the app immediately on load (preventing a
// "flash of unauthorized content" while waiting for biometric).
loadCFG();
// Show the privacy toggle whenever the user has any persisted data.
function _maybeShowPrivacyToggle(){
  if(localStorage.getItem('gb_setup_done') || localStorage.getItem('gb_data')){
    gbPrivacy.showToggleBtn();
  }
  if(gbPrivacy.isDefault()) gbPrivacy.turnOn();
}
async function _continueBoot(){
  let landedOnSummary = false;
  if(loadData()){
    showHeaderButtons();
    renderAll();
    showScreen('summary',_navBtn(0));
    landedOnSummary = true;
  } else if(localStorage.getItem('gb_setup_done')){
    showHeaderButtons();
    showScreen('summary',_navBtn(0));
    landedOnSummary = true;
  } else {
    setTimeout(()=>{ runFlashIntro(); }, 200);
  }
  updateLogBadge();
  _maybeShowPrivacyToggle();
  gbAuth.resetTimers();
  // First-time coachmark tour on Summary. Only fires for users who've
  // completed setup -- not on the flash-intro path. gbTour.isDone()
  // gates re-fires across boots.
  if(landedOnSummary && typeof gbTour === 'object' && !gbTour.isDone()){
    setTimeout(() => gbTour.start(), 700);
  }
}
if(gbAuth.isEnabled() && gbAuth.hasPIN()){
  // Lock first, then continue boot once the user unlocks.
  (async () => {
    await gbAuth.unlock('open');
    _continueBoot();
  })();
} else {
  _continueBoot();
}
