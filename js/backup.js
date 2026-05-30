// ════ Greenbar — backup: encrypted local export / restore (zero-knowledge) ════
// AES-GCM-256 payload key, derived on-device via PBKDF2 (600k / SHA-256).
// A random 128-bit recovery key wraps a copy of the payload key so a user who
// forgets the passphrase can still decrypt. Nothing leaves the device.
//
// External dependencies (must load before this file via index.html script order):
//   state.js  -> (none required directly; defines its own GB_BACKUP_KEYS below)
//   core.js   -> openModal, closeModal, closeOut, showToast
// All functions are globally scoped, matching the existing codebase pattern.

// The five localStorage keys included in every backup.
const GB_BACKUP_KEYS = ['gb_data', 'gb_cfg2', 'gb_log', 'gb_setup_done', 'gb_wt_done'];

// 32-symbol alphabet (Crockford-style, no I/L/O/U) for the readable recovery key.
const _GB_REC_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const _gbSleep = ms => new Promise(r => setTimeout(r, ms));

// Hard requirement: SubtleCrypto + CSPRNG must exist (HTTPS / WKWebView / packaged app).
function _gbEnsureCrypto(){
  if(!window.crypto || !window.crypto.subtle || !window.crypto.getRandomValues){
    throw new Error('Secure crypto is unavailable here. Encrypted backups need a modern browser over HTTPS.');
  }
}

// ── Binary <-> string helpers ──
function _gbBufToB64(buf){
  const bytes = new Uint8Array(buf);
  let bin = '';
  for(let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function _gbB64ToBytes(b64){
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function _gbBufToHex(buf){
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Derive a 256-bit AES-GCM key from a secret + salt using PBKDF2 (600k, SHA-256).
// `extractable` is true only for the payload key (it must be exported so the
// recovery key can wrap a copy of it).
async function _gbDeriveAesKey(secret, saltBytes, extractable){
  const enc = new TextEncoder();
  // Import the raw secret as PBKDF2 base key material (not usable for encrypt directly).
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
  // Stretch it: 600,000 PBKDF2 rounds over the random salt -> AES-GCM-256 key.
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: 600000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    !!extractable,
    ['encrypt', 'decrypt']
  );
}

// SHA-256 of a string, returned as lowercase hex (used for recovery-key verification).
async function _gbSha256Hex(str){
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return _gbBufToHex(digest);
}

// Constant-time hex-string compare: XOR every char code, OR the diffs.
// Avoids the early-exit timing leak of `===` when checking the recovery hash.
function _gbConstTimeEqual(a, b){
  if(a.length !== b.length) return false;
  let diff = 0;
  for(let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Generate a 24-char recovery key from the CSPRNG. 256 % 32 === 0, so `byte & 31`
// maps each random byte onto the alphabet with no modulo bias.
function _gbGenRecoveryKey(){
  const rnd = crypto.getRandomValues(new Uint8Array(24));
  let out = '';
  for(let i = 0; i < 24; i++) out += _GB_REC_ALPHABET[rnd[i] & 31];
  return out;
}
function _gbFormatRecoveryKey(canonical){ return canonical.match(/.{1,4}/g).join('-'); }
function _gbNormalizeRecoveryKey(input){ return (input || '').toUpperCase().replace(/[^0-9A-Z]/g, ''); }

// File download with the iOS Safari workaround: the anchor must be in the DOM,
// and the object URL is revoked after the click has been dispatched.
function _gbDownloadFile(filename, text){
  const blob = new Blob([text], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);  // iOS Safari requires the anchor to be attached
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ──────── A. EXPORT ──────── */
async function exportEncrypted(){
  try{
    _gbEnsureCrypto();

    // Prompt for a passphrase via the export modal (resolves null on cancel).
    const passphrase = await _gbPromptPassphrase();
    if(passphrase === null) return;

    // 1) Collect the five keys into a versioned, UTC-timestamped payload.
    const data = {};
    GB_BACKUP_KEYS.forEach(k => { const v = localStorage.getItem(k); if(v !== null) data[k] = v; });
    const payload = { v: 1, ts: new Date().toISOString(), data };
    const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));

    // 2) Random 16-byte salt -> derive the extractable AES-GCM payload key (PBKDF2 600k).
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const payloadKey = await _gbDeriveAesKey(passphrase, salt, true);

    // 2b) Zero-retention: drop the passphrase from the DOM the instant it's no longer needed.
    _gbClearPassInputs();

    // 3) Encrypt the payload with AES-GCM under a random 12-byte IV.
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, payloadKey, payloadBytes);

    // 4) Recovery path: derive a wrap-key from the random recovery key (same PBKDF2),
    //    then AES-GCM-encrypt the RAW payload key under it. recoveryKeyHash lets restore
    //    verify the entered recovery key before attempting the unwrap.
    const recoveryCanonical = _gbGenRecoveryKey();
    const recoveryWrapKey = await _gbDeriveAesKey(recoveryCanonical, salt, false);
    const rawPayloadKey = await crypto.subtle.exportKey('raw', payloadKey); // 32 bytes
    const recoveryIv = crypto.getRandomValues(new Uint8Array(12));
    const recoveryCt = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: recoveryIv }, recoveryWrapKey, rawPayloadKey);
    const recoveryKeyHash = await _gbSha256Hex(recoveryCanonical);

    // 5) Assemble the .greenbar file and trigger the download.
    const fileObj = {
      v: 1,
      ts: payload.ts,
      salt: _gbBufToB64(salt),
      iv: _gbBufToB64(iv),
      ct: _gbBufToB64(ct),
      recoveryIv: _gbBufToB64(recoveryIv),
      recoveryCt: _gbBufToB64(recoveryCt),
      recoveryKeyHash
    };
    _gbDownloadFile('greenbar-backup_' + payload.ts.slice(0, 10) + '.greenbar', JSON.stringify(fileObj));

    // 6) Show the recovery key with a copy button + mandatory acknowledgement.
    _gbShowRecoveryModal(_gbFormatRecoveryKey(recoveryCanonical));
    showToast('Encrypted backup downloaded.', 'success');
  }catch(e){
    showToast(e.message, 'error');
  }
}

/* ──────── B. RESTORE ──────── */
async function restoreEncrypted(){
  try{
    _gbEnsureCrypto();

    // Pick the .greenbar file (resolves null if the picker is dismissed).
    const file = await _gbPickFile();
    if(!file) return;

    const text = await file.text();
    let pkg;
    try{ pkg = JSON.parse(text); }
    catch(_){ throw new Error('That file is not a valid .greenbar backup.'); }
    _gbValidatePackage(pkg);

    // Ask how to unlock: passphrase or recovery key.
    const secret = await _gbPromptRestoreSecret();
    if(!secret) return;

    let payloadStr;
    try{ payloadStr = await _gbDecryptPackage(pkg, secret); }
    finally{ _gbClearRestoreInputs(); }  // zero-retention on both success and failure

    let payload;
    try{ payload = JSON.parse(payloadStr); }
    catch(_){ throw new Error('Incorrect passphrase or corrupted file'); }

    _gbApplyRestore(payload);            // atomic: all keys or none
    _gbShowRestoreSuccess();
  }catch(e){
    showToast(e.message, 'error');
  }
}

// Structural validation before any crypto runs.
function _gbValidatePackage(pkg){
  if(!pkg || typeof pkg !== 'object') throw new Error('That file is not a valid .greenbar backup.');
  if(pkg.v !== 1) throw new Error('Unsupported backup version.');
  for(const k of ['salt', 'iv', 'ct', 'recoveryIv', 'recoveryCt', 'recoveryKeyHash']){
    if(typeof pkg[k] !== 'string' || !pkg[k]) throw new Error('Backup file is missing required fields.');
  }
}

// Decrypt via the chosen path. On ANY failure: wait 500ms, then throw one generic
// message — never reveal whether the passphrase, recovery key, or file was at fault.
async function _gbDecryptPackage(pkg, secret){
  try{
    const salt = _gbB64ToBytes(pkg.salt);
    const iv   = _gbB64ToBytes(pkg.iv);
    const ct   = _gbB64ToBytes(pkg.ct);

    let payloadKey;
    if(secret.mode === 'pass'){
      // Path 1: re-derive the payload key straight from passphrase + stored salt.
      payloadKey = await _gbDeriveAesKey(secret.value, salt, false);
    }else{
      // Path 2: recovery key. Normalize, constant-time-verify its hash, then unwrap.
      const canonical = _gbNormalizeRecoveryKey(secret.value);
      if(canonical.length !== 24) throw new Error('bad recovery key length');
      const hashHex = await _gbSha256Hex(canonical);
      if(!_gbConstTimeEqual(hashHex, pkg.recoveryKeyHash)) throw new Error('recovery hash mismatch');
      const wrapKey = await _gbDeriveAesKey(canonical, salt, false);
      const rawPayloadKey = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: _gbB64ToBytes(pkg.recoveryIv) }, wrapKey, _gbB64ToBytes(pkg.recoveryCt));
      // Import the unwrapped raw key bytes back into a usable AES-GCM key.
      payloadKey = await crypto.subtle.importKey('raw', rawPayloadKey, { name: 'AES-GCM' }, false, ['decrypt']);
    }

    // AES-GCM verifies the auth tag here — a wrong key throws rather than returning garbage.
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, payloadKey, ct);
    return new TextDecoder().decode(plainBuf);
  }catch(_){
    await _gbSleep(500);  // uniform delay defeats timing-based oracles
    throw new Error('Incorrect passphrase or corrupted file');
  }
}

// Write all keys or none. Snapshot first; roll back every written key on any failure.
function _gbApplyRestore(payload){
  if(!payload || typeof payload !== 'object' || !payload.data || typeof payload.data !== 'object'){
    throw new Error('Backup contents are not in the expected format.');
  }
  const data = payload.data;
  for(const k of GB_BACKUP_KEYS){
    if(data[k] !== undefined && typeof data[k] !== 'string'){
      throw new Error('Backup contains an invalid value for "' + k + '".');
    }
  }
  const snapshot = {};
  GB_BACKUP_KEYS.forEach(k => { snapshot[k] = localStorage.getItem(k); });
  const written = [];
  try{
    GB_BACKUP_KEYS.forEach(k => {
      if(data[k] !== undefined) localStorage.setItem(k, data[k]);
      else localStorage.removeItem(k);
      written.push(k);
    });
  }catch(_){
    written.forEach(k => {
      try{
        if(snapshot[k] === null) localStorage.removeItem(k);
        else localStorage.setItem(k, snapshot[k]);
      }catch(__){ /* nothing more we can do */ }
    });
    throw new Error('Restore failed and was rolled back. Your existing data is unchanged.');
  }
}

/* ──────── C. Passphrase-entry modal controller ──────── */
let _gbPassResolver = null;

function _gbPromptPassphrase(){
  return new Promise(resolve => {
    _gbPassResolver = resolve;
    _gbClearPassInputs();
    openModal('modal-enc-export');
    setTimeout(() => document.getElementById('enc-pass')?.focus(), 60);
  });
}
function _gbPassStrength(v){
  const n = v.length;
  if(n >= 16) return 'strong';
  if(n >= 8)  return 'fair';
  return 'weak';
}
function _gbUpdatePassStrength(){
  const v  = document.getElementById('enc-pass')?.value || '';
  const v2 = document.getElementById('enc-pass-confirm')?.value || '';
  const s  = _gbPassStrength(v);
  const map = {
    weak:   { w: '33%',  c: '#ff4757',      t: 'Weak' },
    fair:   { w: '66%',  c: '#ffa502',      t: 'Fair' },
    strong: { w: '100%', c: 'var(--green)', t: 'Strong' }
  };
  const bar = document.getElementById('enc-strength-bar');
  const lbl = document.getElementById('enc-strength-lbl');
  const mh  = document.getElementById('enc-match-hint');
  const btn = document.getElementById('enc-confirm-btn');
  if(bar){ bar.style.width = map[s].w; bar.style.background = map[s].c; }
  if(lbl){ lbl.textContent = v ? map[s].t : ''; lbl.style.color = map[s].c; }
  const match = v.length > 0 && v === v2;
  if(mh) mh.textContent = (v2.length > 0 && !match) ? 'Passphrases do not match' : '';
  // Enabled only when both fields match AND strength is at least fair.
  if(btn) btn.disabled = !(match && (s === 'fair' || s === 'strong'));
}
function _gbToggleReveal(inputId, btn){
  const el = document.getElementById(inputId);
  if(!el) return;
  el.type = el.type === 'password' ? 'text' : 'password';
  if(btn) btn.textContent = el.type === 'password' ? 'Show' : 'Hide';
}
function _gbClearPassInputs(){
  ['enc-pass', 'enc-pass-confirm'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  _gbUpdatePassStrength();
}
function _gbEncConfirm(){
  const pass = document.getElementById('enc-pass')?.value || '';
  closeModal('modal-enc-export');
  const r = _gbPassResolver; _gbPassResolver = null;
  if(r) r(pass);
}
function _gbEncCancel(){
  closeModal('modal-enc-export');
  _gbClearPassInputs();
  const r = _gbPassResolver; _gbPassResolver = null;
  if(r) r(null);
}

/* ──────── D. Recovery-key display modal controller ──────── */
function _gbShowRecoveryModal(formattedKey){
  const disp = document.getElementById('enc-recovery-display');
  if(disp) disp.textContent = formattedKey;
  const cb = document.getElementById('enc-recovery-saved');
  if(cb) cb.checked = false;
  const btn = document.getElementById('enc-recovery-dismiss');
  if(btn) btn.disabled = true;
  openModal('modal-enc-recovery');
}
function _gbRecoveryCheckbox(){
  const cb  = document.getElementById('enc-recovery-saved');
  const btn = document.getElementById('enc-recovery-dismiss');
  if(btn) btn.disabled = !(cb && cb.checked);
}
async function _gbCopyRecovery(){
  const txt = document.getElementById('enc-recovery-display')?.textContent || '';
  try{
    await navigator.clipboard.writeText(txt);
    showToast('Recovery key copied.', 'success');
  }catch(_){
    // WKWebView fallback when the async Clipboard API is blocked.
    const ta = document.createElement('textarea');
    ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    try{ document.execCommand('copy'); showToast('Recovery key copied.', 'success'); }
    catch(e2){ showToast('Copy failed — select and copy it manually.', 'error'); }
    document.body.removeChild(ta);
  }
}
function _gbDismissRecovery(){ closeModal('modal-enc-recovery'); }

/* ──────── E. Restore modal controller ──────── */
let _gbRestoreResolver = null;
let _gbFileResolver = null;

function _gbPickFile(){
  return new Promise(resolve => {
    _gbFileResolver = resolve;
    const inp = document.getElementById('enc-restore-file');
    if(!inp){ resolve(null); return; }
    inp.value = '';
    inp.click();
  });
}
function _gbRestoreFileChosen(input){
  const f = (input.files && input.files[0]) ? input.files[0] : null;
  const r = _gbFileResolver; _gbFileResolver = null;
  if(r) r(f);
}
function _gbPromptRestoreSecret(){
  return new Promise(resolve => {
    _gbRestoreResolver = resolve;
    _gbClearRestoreInputs();
    _gbRestoreTab('pass');
    openModal('modal-enc-restore');
    setTimeout(() => document.getElementById('enc-restore-pass')?.focus(), 60);
  });
}
function _gbRestoreTab(which){
  const isPass = which === 'pass';
  const tp = document.getElementById('enc-tab-pass');
  const tr = document.getElementById('enc-tab-rec');
  const pp = document.getElementById('enc-restore-pass-pane');
  const rp = document.getElementById('enc-restore-rec-pane');
  if(pp) pp.style.display = isPass ? 'block' : 'none';
  if(rp) rp.style.display = isPass ? 'none' : 'block';
  const on = '1px solid var(--green)', off = '1px solid var(--border)';
  if(tp){ tp.style.border = isPass ? on : off; tp.style.color = isPass ? 'var(--green)' : 'var(--text)'; }
  if(tr){ tr.style.border = !isPass ? on : off; tr.style.color = !isPass ? 'var(--green)' : 'var(--text)'; }
  document.getElementById('modal-enc-restore')?.setAttribute('data-mode', isPass ? 'pass' : 'rec');
}
function _gbClearRestoreInputs(){
  ['enc-restore-pass', 'enc-restore-reckey'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
}
function _gbRestoreConfirm(){
  const mode = document.getElementById('modal-enc-restore')?.getAttribute('data-mode') || 'pass';
  const value = mode === 'pass'
    ? (document.getElementById('enc-restore-pass')?.value || '')
    : (document.getElementById('enc-restore-reckey')?.value || '');
  closeModal('modal-enc-restore');
  const r = _gbRestoreResolver; _gbRestoreResolver = null;
  if(r) r({ mode, value });
}
function _gbRestoreCancel(){
  closeModal('modal-enc-restore');
  _gbClearRestoreInputs();
  const r = _gbRestoreResolver; _gbRestoreResolver = null;
  if(r) r(null);
}
function _gbShowRestoreSuccess(){
  showToast('Backup restored. Reload to see your data.', 'success');
  openModal('modal-enc-reload');
}
