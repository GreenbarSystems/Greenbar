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
  if(loadData()){
    showHeaderButtons();
    renderAll();
    showScreen('summary',_navBtn(0));
  } else if(localStorage.getItem('gb_setup_done')){
    showHeaderButtons();
    showScreen('summary',_navBtn(0));
  } else {
    setTimeout(()=>{ runFlashIntro(); }, 200);
  }
  updateLogBadge();
  _maybeShowPrivacyToggle();
  gbAuth.resetTimers();
  // Note: the coachmark tour is now fired from startSetupFromFlash() as part
  // of the Get-Started -> tour -> setup wizard flow. We no longer auto-fire
  // it on the first Summary load; users replay the tour via Settings -> Help.
}
if(gbAuth.isEnabled() && gbAuth.hasPIN()){
  // Lock first, then continue boot once the user unlocks. The whole flow
  // is wrapped in try/catch:
  //   - gbAuth.unlock() can reject if the biometric API throws (the PIN-pad
  //     Promise itself never rejects — it just stays pending until input).
  //     One retry typically falls through to the PIN pad even when biometric
  //     is broken; if the retry also fails, we log and leave the lock screen
  //     visible. The user can reload to attempt again.
  //   - _continueBoot() is sync today but defensively wrapped so a render
  //     exception doesn't silently kill the post-unlock setup (badge,
  //     privacy toggle, auth timer reset).
  (async () => {
    try {
      await gbAuth.unlock('open');
    } catch (err) {
      console.error('Boot unlock failed, retrying:', err);
      try {
        await gbAuth.unlock('open');
      } catch (retryErr) {
        console.error('Retry failed; staying locked:', retryErr);
        return;
      }
    }
    try {
      _continueBoot();
    } catch (err) {
      console.error('Post-unlock boot threw:', err);
    }
  })();
} else {
  _continueBoot();
}
