// ════ SECURITY: gbAuth (PIN + biometric) + gbPrivacy (blur amounts) + gbSecurityUI ════
// PBKDF2-SHA256 (OWASP 2023: 600k iterations) PIN hash. Biometric via Capacitor
// BiometricAuth plugin when present. The same code works standalone (PIN-only) and
// inside the Capacitor wrapper -- no JS change needed when biometric is wired up.
//
// External dependencies (must load before this file via index.html script order):
//   state.js  -> GB_KEYS
//   core.js   -> gbDialog, openModal, closeModal, showToast,
//                emits the 'gb:screen' custom event from showScreen()

// PIN-dot rendering helper shared by gbAuth (lock pad) and gbSecurityUI
// (set-PIN pad). Caches the NodeList per CSS selector so we don't re-query
// the DOM on every keystroke. Both pads are static markup, so the cache
// stays valid across the app's lifetime.
const _gbDotsCache = new Map();
function _gbPaintDots(selector, count){
  let dots = _gbDotsCache.get(selector);
  if(!dots || !dots.length){ dots = document.querySelectorAll(selector); _gbDotsCache.set(selector, dots); }
  dots.forEach((d, i) => d.classList.toggle('filled', i < count));
}

const gbAuth = (() => {
  const K = { hash:'gb_pin_hash', salt:'gb_pin_salt', enabled:'gb_security_enabled',
              attempts:'gb_pin_attempts', lockUntil:'gb_pin_lockout_until',
              autoBg:'gb_autolock_bg', autoIdle:'gb_autolock_idle' };
  const PIN_LENGTH = 6;
  const FAILURES_BEFORE_LOCKOUT = 5;
  const DEF_BG = 30, DEF_IDLE = 5*60;  // seconds: 30s background, 5min idle
  const LOCKOUT_STEPS = [30, 60, 300, 1800, 3600]; // 30s, 1m, 5m, 30m, 1h
  // PINs that show up in nearly every leaked-credential analysis as top-most-guessed.
  // Reject these so a user can't pick something a casual attacker would brute-force in
  // seconds. 6-digit space is already only 10^6; this trims the worst ~0.1% that
  // disproportionately appears in real-world device PINs.
  const WEAK_PINS = new Set([
    '000000','111111','222222','333333','444444','555555',
    '666666','777777','888888','999999',
    '123456','654321','012345','123123','121212','112233',
    '789456','159753','147258','852456','159357',
  ]);
  let _pinBuf = '';
  // Queue of pending unlock() promise resolvers. Replaces a single
  // _pinResolve slot so two concurrent unlock() callers don't clobber
  // each other -- the previous design only resolved the second caller
  // and left the first hanging forever. resolveAllPending() drains the
  // queue on every success path (PIN entry, biometric).
  let _pinResolvers = [];
  let _idleTimer = null, _bgTimer = null;
  function resolveAllPending(value){
    const queue = _pinResolvers;
    _pinResolvers = [];
    queue.forEach(r => r(value));
  }
  function getItem(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function setItem(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
  function delItem(k){ try{ localStorage.removeItem(k); }catch(e){} }
  function isEnabled(){ return getItem(K.enabled) === '1'; }
  function hasPIN(){ return !!getItem(K.hash) && !!getItem(K.salt); }
  function getAutoBg(){ return parseInt(getItem(K.autoBg)) || DEF_BG; }
  function getAutoIdle(){ return parseInt(getItem(K.autoIdle)) || DEF_IDLE; }
  function setAutoBg(sec){ setItem(K.autoBg, String(sec)); resetTimers(); }
  function setAutoIdle(sec){ setItem(K.autoIdle, String(sec)); resetTimers(); }
  async function hashPIN(pin, saltBytes){
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({name:'PBKDF2', salt:saltBytes, iterations:600000, hash:'SHA-256'}, key, 256);
    return Array.from(new Uint8Array(bits)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  function bytesToHex(b){ return Array.from(b).map(x=>x.toString(16).padStart(2,'0')).join(''); }
  function hexToBytes(h){ const b = new Uint8Array(h.length/2); for(let i=0;i<b.length;i++) b[i]=parseInt(h.slice(i*2, i*2+2),16); return b; }
  // Constant-time hex-string compare. Avoids `===` short-circuit timing leakage
  // when comparing the PBKDF2 output against the stored hash. Practical impact
  // is negligible (PBKDF2 dominates the verify cost by ~6 orders of magnitude)
  // but standard precaution on any hash-equality check.
  function constantTimeEqualHex(a, b){
    if(a.length !== b.length) return false;
    let diff = 0;
    for(let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }
  async function setPIN(pin){
    if(!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) throw new Error(`PIN must be ${PIN_LENGTH} digits`);
    if(WEAK_PINS.has(pin)) throw new Error('That PIN is too common. Pick something less guessable.');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await hashPIN(pin, salt);
    setItem(K.salt, bytesToHex(salt));
    setItem(K.hash, hash);
    setItem(K.enabled, '1');
    delItem(K.attempts); delItem(K.lockUntil);
  }
  async function verifyPIN(pin){
    const salt = getItem(K.salt); const expected = getItem(K.hash);
    if(!salt || !expected) return false;
    const got = await hashPIN(pin, hexToBytes(salt));
    return constantTimeEqualHex(got, expected);
  }
  function lockoutRemaining(){
    const until = parseInt(getItem(K.lockUntil)) || 0;
    return Math.max(0, until - Date.now());
  }
  function recordFailure(){
    const n = (parseInt(getItem(K.attempts)) || 0) + 1;
    setItem(K.attempts, String(n));
    if(n >= FAILURES_BEFORE_LOCKOUT){
      const idx = Math.min(n - FAILURES_BEFORE_LOCKOUT, LOCKOUT_STEPS.length - 1);
      setItem(K.lockUntil, String(Date.now() + LOCKOUT_STEPS[idx] * 1000));
    }
  }
  function clearFailures(){ delItem(K.attempts); delItem(K.lockUntil); }

  // ── Locked state UI ──
  let _locked = false;
  function isLocked(){ return _locked; }
  function showLockScreen(reason){
    _locked = true;
    const el = document.getElementById('screen-lock');
    if(!el) return;
    // 'open' is a sentinel used for the boot-time + auto-lock path (it also
    // triggers the biometric auto-prompt below). It should not display as the
    // user-facing label -- show the default "Enter PIN" copy in that case.
    document.getElementById('lock-prompt-text').textContent = (reason && reason !== 'open') ? reason : 'Enter PIN';
    _pinBuf = ''; renderPinDots();
    document.getElementById('lock-error').textContent = '';
    // Show biometric button if a Capacitor-compatible bridge is available.
    // Use the `hidden` attribute (cleaner than inline style; scanners and AT
    // both understand it as "removed from a11y tree + tab order").
    const biometricBtn = document.getElementById('lock-biometric-btn');
    biometricBtn.hidden = !isBiometricAvailable();
    el.classList.add('active');
    // Mirror state in the native dialog `open` attribute so static a11y
    // scanners see the children as legitimately in the AT tree only while
    // the dialog is actually shown. (We don't use .showModal() because it
    // conflicts with our custom .active animation + focus management.)
    el.setAttribute('open', '');
    updateLockoutDisplay();
    // Auto-try biometric on app open (not on every gate so the user isn't pestered)
    if(reason === 'open' && isBiometricAvailable()){ setTimeout(tryBiometric, 200); }
  }
  function hideLockScreen(){
    _locked = false;
    const el = document.getElementById('screen-lock');
    el.classList.remove('active');
    el.removeAttribute('open');
  }
  function renderPinDots(){ _gbPaintDots('#lock-pin-dots .pin-dot', _pinBuf.length); }
  function shakePinDots(){
    document.querySelectorAll('#lock-pin-dots .pin-dot').forEach(d => {
      d.classList.add('shake');
      setTimeout(() => d.classList.remove('shake'), 450);
    });
  }
  // ── Lock-screen PIN-pad key handler ──
  // The set-PIN pad has its own delegated listener in gbSecurityUI below.
  document.addEventListener('click', (e) => {
    const key = e.target.closest('#lock-pin-pad .pin-key');
    if(!key) return;
    const d = key.dataset.d;
    if(!d) return;
    if(lockoutRemaining() > 0){ return; }
    handleLockKey(d);
  });
  function handleLockKey(d){
    if(d === 'back'){ _pinBuf = _pinBuf.slice(0, -1); renderPinDots(); return; }
    if(_pinBuf.length >= PIN_LENGTH) return;
    _pinBuf += d;
    renderPinDots();
    if(_pinBuf.length === PIN_LENGTH){
      const attempt = _pinBuf;
      (async () => {
        const ok = await verifyPIN(attempt);
        if(ok){
          clearFailures();
          hideLockScreen();
          resolveAllPending(true);
        } else {
          recordFailure();
          shakePinDots();
          _pinBuf = ''; renderPinDots();
          const rem = lockoutRemaining();
          if(rem > 0){ updateLockoutDisplay(); }
          else { document.getElementById('lock-error').textContent = 'Incorrect PIN'; }
        }
      })();
    }
  }
  function updateLockoutDisplay(){
    const rem = lockoutRemaining();
    const err = document.getElementById('lock-error');
    if(rem <= 0){ err.textContent = ''; return; }
    const s = Math.ceil(rem / 1000);
    const txt = s >= 60 ? Math.ceil(s/60) + ' min' : s + ' sec';
    err.textContent = 'Too many attempts. Try again in ' + txt;
    setTimeout(updateLockoutDisplay, 1000);
  }
  // ── Biometric via Capacitor (when present) ──
  function isBiometricAvailable(){
    return !!(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.BiometricAuth);
  }
  async function tryBiometric(reason){
    if(!isBiometricAvailable()) return false;
    try {
      await window.Capacitor.Plugins.BiometricAuth.authenticate({
        reason: reason || 'Unlock Greenbar',
        cancelTitle: 'Use PIN instead',
        allowDeviceCredential: true,
        iosFallbackTitle: 'Use PIN'
      });
      clearFailures();
      hideLockScreen();
      resolveAllPending(true);
      return true;
    } catch (e) {
      // Distinguishing user-cancel / fallback (expected, silent) from real
      // plugin failures (worth logging) saves debugging time in the field
      // -- otherwise every report just shows "biometric didn't work" with
      // no way to tell whether the device is misconfigured or the user
      // simply tapped Cancel.
      const code = e && e.code;
      if(code && code !== 'userCancel' && code !== 'userFallback'){
        console.warn('Greenbar: biometric error', e);
      }
      return false;
    }
  }
  // ── Public unlock() — used by app-open + every destructive gate ──
  async function unlock(reason){
    if(!isEnabled() || !hasPIN()) return true; // security off → no-op
    // Try biometric first if available
    if(isBiometricAvailable()){
      const ok = await tryBiometric(reason);
      if(ok) return true;
    }
    // Fall through to PIN pad. Concurrent unlock() callers queue up here;
    // only the first paints the lock screen (subsequent calls share it).
    return new Promise(resolve => {
      _pinResolvers.push(resolve);
      if(_pinResolvers.length === 1) showLockScreen(reason);
    });
  }
  function lock(){ if(isEnabled() && hasPIN()){ showLockScreen('open'); } }
  async function forgotPIN(){
    if(!await gbDialog.confirm('Forgot your PIN?\n\nThe only way to reset is to wipe all data on this device. Your backups (if any) are unaffected.\n\nWipe and start over?')) return;
    // Nuclear: clear EVERYTHING and reload.
    GB_KEYS.forEach(k => delItem(k));
    [K.hash, K.salt, K.enabled, K.attempts, K.lockUntil, K.autoBg, K.autoIdle].forEach(delItem);
    location.reload();
  }
  function disable(){
    [K.hash, K.salt, K.enabled, K.attempts, K.lockUntil].forEach(delItem);
  }
  // ── Auto-lock: visibility (background) + idle ──
  function startBgTimer(){
    if(_bgTimer) clearTimeout(_bgTimer);
    _bgTimer = setTimeout(()=>{ if(isEnabled() && hasPIN() && !_locked) lock(); }, getAutoBg() * 1000);
  }
  function cancelBgTimer(){ if(_bgTimer){ clearTimeout(_bgTimer); _bgTimer = null; } }
  function resetIdleTimer(){
    if(_idleTimer) clearTimeout(_idleTimer);
    _idleTimer = setTimeout(()=>{ if(isEnabled() && hasPIN() && !_locked) lock(); }, getAutoIdle() * 1000);
  }
  function resetTimers(){ resetIdleTimer(); if(document.hidden) startBgTimer(); else cancelBgTimer(); }
  document.addEventListener('visibilitychange', () => {
    if(document.hidden) startBgTimer();
    else { cancelBgTimer(); resetIdleTimer(); }
  });
  ['touchstart','mousedown','keydown','scroll'].forEach(evt => {
    document.addEventListener(evt, resetIdleTimer, { passive: true });
  });
  return { isEnabled, hasPIN, setPIN, verifyPIN, unlock, lock, isLocked, forgotPIN, disable,
           tryBiometric, isBiometricAvailable, getAutoBg, getAutoIdle, setAutoBg, setAutoIdle,
           lockoutRemaining, resetTimers };
})();

// ════ Privacy mode: blur amounts until the user taps to reveal ════
const gbPrivacy = (() => {
  const K_DEFAULT = 'gb_privacy_default';
  const REVEAL_MS = 12000;  // auto-re-blur after this many ms once revealed
  let _revealTimeout = null;
  function isOn(){ return document.body.classList.contains('privacy-mode'); }
  function isDefault(){ return localStorage.getItem(K_DEFAULT) === '1'; }
  function setDefault(v){ if(v) localStorage.setItem(K_DEFAULT, '1'); else localStorage.removeItem(K_DEFAULT); }
  function turnOn(){
    document.body.classList.add('privacy-mode');
    document.body.classList.remove('revealed');
    document.getElementById('privacy-toggle-btn')?.classList.add('on');
  }
  function turnOff(){
    document.body.classList.remove('privacy-mode', 'revealed');
    document.getElementById('privacy-toggle-btn')?.classList.remove('on');
    if(_revealTimeout){ clearTimeout(_revealTimeout); _revealTimeout = null; }
  }
  function toggle(){ isOn() ? turnOff() : turnOn(); }
  async function reveal(){
    if(!isOn()) return;
    const ok = await gbAuth.unlock('Show amounts');
    if(!ok) return;
    document.body.classList.add('revealed');
    if(_revealTimeout) clearTimeout(_revealTimeout);
    _revealTimeout = setTimeout(()=>{ document.body.classList.remove('revealed'); }, REVEAL_MS);
  }
  // Tap any blurred amount → reveal
  document.addEventListener('click', (e) => {
    if(!isOn() || document.body.classList.contains('revealed')) return;
    const t = e.target;
    if(t.closest('.net-amt, .st-val, .cat-amt, .cat-pct, .tx-amt, .bva-num, .hh-rate, .sec-total')){
      e.preventDefault(); e.stopPropagation();
      reveal();
    }
  }, true);
  function showToggleBtn(){
    document.getElementById('privacy-toggle-btn')?.classList.add('visible');
  }
  return { isOn, isDefault, setDefault, turnOn, turnOff, toggle, reveal, showToggleBtn };
})();

// ════ Security UI controller for the Settings screen ════
const gbSecurityUI = (() => {
  const PIN_LENGTH = 6;
  let _setpinBuf = '', _setpinStage = 'first', _setpinFirst = '';
  function refreshUI(){
    const enabled = gbAuth.isEnabled() && gbAuth.hasPIN();
    const tog = document.getElementById('security-toggle-state');
    const desc = document.getElementById('security-status-desc');
    if(tog)  tog.textContent  = enabled ? 'On' : 'Off';
    if(desc) desc.textContent = enabled
      ? 'On · ' + (gbAuth.isBiometricAvailable() ? 'Biometrics or PIN required to open' : '6-digit PIN required to open')
      : 'Off · anyone with this device can open the app';
    ['security-change-pin-row','security-autolock-row','security-idle-row'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.style.display = enabled ? '' : 'none';
    });
    // Sync pill rows
    const bgSel = String(gbAuth.getAutoBg());
    document.querySelectorAll('#autolock-bg-pills .choice-pill').forEach(p =>
      p.classList.toggle('selected', p.dataset.sec === bgSel));
    const idleSel = String(gbAuth.getAutoIdle());
    document.querySelectorAll('#autolock-idle-pills .choice-pill').forEach(p =>
      p.classList.toggle('selected', p.dataset.sec === idleSel));
    // Privacy default
    const pdState = document.getElementById('privacy-default-state');
    const pdDesc  = document.getElementById('privacy-default-desc');
    if(pdState) pdState.textContent = gbPrivacy.isDefault() ? 'On' : 'Off';
    if(pdDesc)  pdDesc.textContent  = gbPrivacy.isDefault()
      ? 'On · amounts hidden until you tap to reveal'
      : 'Off · amounts show until you tap the eye icon';
  }
  async function toggleEnable(){
    if(gbAuth.isEnabled() && gbAuth.hasPIN()){
      // Disabling -- require current PIN first
      const ok = await gbAuth.unlock('Disable security');
      if(!ok) return;
      gbAuth.disable();
      refreshUI();
    } else {
      openSetPIN(true);
    }
  }
  function openSetPIN(firstTime){
    _setpinBuf = ''; _setpinStage = 'first'; _setpinFirst = '';
    document.getElementById('setpin-title').textContent = firstTime ? 'Set your 6-digit PIN' : 'Choose a new 6-digit PIN';
    document.getElementById('setpin-sub').innerHTML = firstTime
      ? 'Pick a 6-digit number you\'ll remember. We never see it &mdash; just a hash of it stays on this device.'
      : 'Enter a new 6-digit PIN.';
    renderSetPinDots();
    document.getElementById('setpin-error').textContent = '';
    openModal('modal-setpin');
  }
  async function openChangePIN(){
    const ok = await gbAuth.unlock('Change PIN');
    if(!ok) return;
    openSetPIN(false);
  }
  function renderSetPinDots(){ _gbPaintDots('#setpin-dots .pin-dot', _setpinBuf.length); }
  // Set-PIN flow: enter PIN, then confirm by re-entering.
  window.__handleSetPinKey = function(d){
    if(d === 'back'){ _setpinBuf = _setpinBuf.slice(0, -1); renderSetPinDots(); return; }
    if(_setpinBuf.length >= PIN_LENGTH) return;
    _setpinBuf += d;
    renderSetPinDots();
    if(_setpinBuf.length === PIN_LENGTH){
      if(_setpinStage === 'first'){
        _setpinFirst = _setpinBuf;
        _setpinBuf = '';
        _setpinStage = 'confirm';
        renderSetPinDots();
        document.getElementById('setpin-title').textContent = 'Confirm your PIN';
        document.getElementById('setpin-sub').textContent = 'Enter the same 6 digits again.';
      } else {
        if(_setpinBuf === _setpinFirst){
          gbAuth.setPIN(_setpinFirst).then(() => {
            closeModal('modal-setpin');
            refreshUI();
            showToast('PIN set. Greenbar will lock on close.');
          }).catch(e => {
            // Show validation failure (weak-PIN, crypto.subtle absent, etc.)
            // inside the modal instead of leaving it silently stuck.
            document.getElementById('setpin-error').textContent = (e && e.message) || 'Could not set PIN.';
            _setpinBuf = ''; _setpinStage = 'first'; _setpinFirst = '';
            renderSetPinDots();
            document.getElementById('setpin-title').textContent = 'Set your 6-digit PIN';
          });
        } else {
          document.getElementById('setpin-error').textContent = 'PINs did not match. Try again.';
          _setpinBuf = ''; _setpinStage = 'first'; _setpinFirst = '';
          renderSetPinDots();
          document.getElementById('setpin-title').textContent = 'Set your 6-digit PIN';
        }
      }
    }
  };
  // Delegated listener for the set-PIN pad. (gbAuth's lock-pin-pad listener
  // above only handles the unlock pad; set-PIN has its own state machine.)
  document.addEventListener('click', (e) => {
    const key = e.target.closest('#setpin-pad .pin-key');
    if(!key) return;
    const d = key.dataset.d;
    if(d) window.__handleSetPinKey(d);
  });
  // Wire choice-pill clicks for auto-lock timers
  document.addEventListener('click', (e) => {
    const pill = e.target.closest('#autolock-bg-pills .choice-pill, #autolock-idle-pills .choice-pill');
    if(!pill) return;
    const sec = parseInt(pill.dataset.sec) || 0;
    if(pill.closest('#autolock-bg-pills')) gbAuth.setAutoBg(sec);
    else gbAuth.setAutoIdle(sec);
    refreshUI();
  });
  function togglePrivacyDefault(){
    gbPrivacy.setDefault(!gbPrivacy.isDefault());
    refreshUI();
  }
  return { refreshUI, toggleEnable, openSetPIN, openChangePIN, togglePrivacyDefault };
})();

// Refresh the Security UI whenever the user navigates to Settings.
// Subscribes to the 'gb:screen' custom event that core.js's showScreen()
// dispatches -- cleaner than monkey-patching window.showScreen, which was
// fragile if any other module wrapped it later.
document.addEventListener('gb:screen', (e) => {
  if(e.detail && e.detail.name === 'settings') gbSecurityUI.refreshUI();
});
