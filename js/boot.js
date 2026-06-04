// ════ Boot sequence (loads last) ════
// Runs after all other JS files. Wires up the security gate (if enabled) before
// the original data-load + render flow. Modules above provide loadCFG, loadData,
// gbAuth, gbPrivacy, runFlashIntro, showHeaderButtons, renderAll, showScreen,
// _navBtn, updateLogBadge -- nothing new is declared here.
//
// Security gate runs BEFORE any data is rendered. If the user has security
// enabled, the lock screen masks the app immediately on load (preventing a
// "flash of unauthorized content" while waiting for biometric).

// Brief delay before the flash intro so any in-flight DOM cleanup from
// loadCFG / paint settles before the first phase fades in.
const FLASH_INTRO_DELAY_MS = 200;

loadCFG();

// Show the privacy toggle when there's data to be private about.
//
// The toggle BUTTON appears once setup is done OR data exists (so users
// who finish the wizard see the control before they import).
//
// The privacy STATE (turnOn) is gated on data actually existing. Without
// that gate, a brand-new user who finished setup would see amounts blurred
// the instant their first import lands — within the same session, with no
// toggle yet rendered, no way to discover why. Holding turnOn until data
// exists means the privacy-by-default stance kicks in on the NEXT boot
// (when both data + toggle exist), not surprisingly mid-session.
function _maybeShowPrivacyToggle(){
  const hasData  = !!localStorage.getItem('gb_data');
  const hasSetup = !!localStorage.getItem('gb_setup_done');
  if(hasData || hasSetup){
    gbPrivacy.showToggleBtn();
  }
  if(hasData && gbPrivacy.isDefault()) gbPrivacy.turnOn();
}

// Sync today — declared without `async` because there is no await. If a
// future call site needs to await this, restore the async keyword + a
// return value at that time.
function _continueBoot(){
  if(loadData()){
    // Returning user with data: render everything immediately.
    showHeaderButtons();
    renderAll();
    showScreen('summary',_navBtn(0));
  } else if(localStorage.getItem('gb_setup_done')){
    // User has been onboarded past the flash intro (either via the wizard
    // or via the import-first flash CTA — gb_setup_done covers both since
    // UX Tier 3 Phase 1 broadened its semantic) but has no data yet, or
    // cleared their data. Show the empty Summary so they can import.
    showHeaderButtons();
    showScreen('summary',_navBtn(0));
  } else {
    // True first launch: defer the flash intro so any pending repaint
    // settles before the first phase fades in.
    setTimeout(runFlashIntro, FLASH_INTRO_DELAY_MS);
  }
  updateLogBadge();
  _maybeShowPrivacyToggle();
  gbAuth.resetTimers();
  // Note: the coachmark tour is now fired from startSetupFromFlash() as part
  // of the Get-Started -> tour -> setup wizard flow. We no longer auto-fire
  // it on the first Summary load; users replay the tour via Settings -> Help.
}

// Gate the entire boot on unlock only when BOTH the toggle is on AND a PIN
// is stored. The two checks together provide graceful degradation: if the
// toggle is on but no PIN was ever set (or vice versa, corruption), the app
// loads unlocked rather than wedging behind a lock screen with no key.
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
