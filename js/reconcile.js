// ════ Greenbar — statement reconciliation (gbReconcile) ════
// "Reconciled" must mean the imported data ACTUALLY matches the statement — not
// merely that a balance was entered. An import reconciles when, for the
// transactions it added, opening balance + their net == closing balance (within
// a cent). Balances are captured at import (core.js) or entered retroactively
// here; the check is computed live so it stays honest as data changes.
//
// Globals used: getLog, saveLog, _allTxs, parseAmt, gbMoney, esc, openModal,
// closeModal, showToast, renderAll, gbConfidence.
const gbReconcile = (() => {
  const TOL = 0.01;   // a cent of slack for rounding
  const _money = n => gbMoney(n);
  function _log(){ return (typeof getLog === 'function') ? getLog() : []; }
  function _entry(id){ return _log().find(e => String(e.id) === String(id)) || null; }
  function _netOf(id){ return (_allTxs || []).filter(t => String(t.imp) === String(id)).reduce((s, t) => s + (t.amount || 0), 0); }

  // Reconciliation verdict for one import (log entry).
  function of(entry){
    if(!entry || entry.openingBalance == null || entry.closingBalance == null) return { has:false };
    const net = _netOf(entry.id);
    const expected = entry.openingBalance + net;
    const diff = Math.round((entry.closingBalance - expected) * 100) / 100;
    return { has:true, net, expected, diff, reconciled: Math.abs(diff) <= TOL };
  }

  // Overall reconciliation state across all imports that have balances:
  //   'unreconciled' if any checkable import is off, else 'reconciled' if at
  //   least one matched, else null (nothing to reconcile against).
  function status(){
    let anyOk = false, anyOff = false;
    for(const e of _log()){ const r = of(e); if(!r.has) continue; if(r.reconciled) anyOk = true; else anyOff = true; }
    if(anyOff) return 'unreconciled';
    if(anyOk)  return 'reconciled';
    return null;
  }

  // Per-import badge for the Import Confidence Center history.
  function badgeHTML(entry){
    const r = of(entry);
    if(!r.has) return `<button type="button" class="rec-badge rec-none" onclick="gbReconcile.open('${esc(String(entry.id))}')">Reconcile&hellip;</button>`;
    return r.reconciled
      ? `<button type="button" class="rec-badge rec-ok" onclick="gbReconcile.open('${esc(String(entry.id))}')">&#10003; Reconciled</button>`
      : `<button type="button" class="rec-badge rec-off" onclick="gbReconcile.open('${esc(String(entry.id))}')">&#9888; Off by ${_money(Math.abs(r.diff))}</button>`;
  }

  // ── retroactive entry / fix ──
  let _curId = null;
  function open(id){ _curId = id; _renderModal(); if(typeof openModal === 'function') openModal('modal-reconcile'); }
  function _read(elId){ const el = document.getElementById(elId); const v = el ? String(el.value).trim() : ''; return v !== '' ? parseAmt(v) : null; }

  // Live feedback as the user types balances.
  function preview(){
    const out = document.getElementById('reconcile-status'); if(!out) return;
    const e = _entry(_curId); if(!e) return;
    const net = _netOf(e.id);
    const o = _read('rec-open'), c = _read('rec-close');
    if(o == null || c == null){ out.className = 'rec-status'; out.innerHTML = 'Enter both balances to check whether this import reconciles.'; return; }
    const diff = Math.round((c - (o + net)) * 100) / 100;
    if(Math.abs(diff) <= TOL){ out.className = 'rec-status ok'; out.innerHTML = '&#10003; Reconciles exactly — these transactions account for the full change.'; }
    else { out.className = 'rec-status off'; out.innerHTML = `&#9888; Off by <strong>${_money(Math.abs(diff))}</strong>. ${diff > 0 ? 'The statement changed more than these transactions account for — rows may be missing.' : 'These transactions exceed the statement change — there may be extra or duplicate rows.'}`; }
  }

  function _renderModal(){
    const e = _entry(_curId); const body = document.getElementById('reconcile-body'); if(!body || !e) return;
    const net = _netOf(e.id);
    body.innerHTML = `
      <div class="rec-file">${esc(e.filename || 'Import')} &middot; ${esc(String(e.txCount || 0))} txn${e.txCount === 1 ? '' : 's'}${e.account ? ` &middot; ${esc(e.account)}` : ''}</div>
      <div class="rec-net">These transactions net <strong>${net >= 0 ? '+' : '−'}${_money(net)}</strong>. Enter the statement's balances and Greenbar checks they reconcile.</div>
      <label class="rec-lbl" for="rec-open">Opening balance</label>
      <input id="rec-open" type="text" inputmode="decimal" class="plan-input" value="${e.openingBalance != null ? e.openingBalance : ''}" placeholder="Statement starting balance" autocomplete="off" oninput="gbReconcile.preview()">
      <label class="rec-lbl" for="rec-close">Closing balance</label>
      <input id="rec-close" type="text" inputmode="decimal" class="plan-input" value="${e.closingBalance != null ? e.closingBalance : ''}" placeholder="Statement ending balance" autocomplete="off" oninput="gbReconcile.preview()">
      <div id="reconcile-status" class="rec-status"></div>
      <button type="button" class="btn-primary" style="width:100%;margin-top:6px;" onclick="gbReconcile.save()">Save</button>`;
    preview();
  }

  function save(){
    const e = _entry(_curId); if(!e) return;
    const o = _read('rec-open'), c = _read('rec-close');
    e.openingBalance = o;
    e.closingBalance = c;
    if(c != null){
      // anchor the closing balance to this import's latest tx date (running balance)
      let hi = -Infinity; (_allTxs || []).forEach(t => { if(String(t.imp) === String(e.id) && t.ts > hi) hi = t.ts; });
      e.balanceAsOf = isFinite(hi) ? hi : (e.balanceAsOf || null);
    } else { e.balanceAsOf = null; }
    const log = _log(); const idx = log.findIndex(x => String(x.id) === String(e.id));
    if(idx >= 0){ log[idx] = e; if(typeof saveLog === 'function') saveLog(log); }
    if(typeof closeModal === 'function') closeModal('modal-reconcile');
    const r = of(e);
    if(typeof showToast === 'function'){
      if(!r.has) showToast('Statement balances cleared.', 'info');
      else showToast(r.reconciled ? 'Reconciled — the numbers match the statement.' : `Saved — off by ${_money(Math.abs(r.diff))}.`, r.reconciled ? 'success' : 'error');
    }
    if(typeof gbConfidence !== 'undefined' && gbConfidence.renderCenter) gbConfidence.renderCenter();
    if(typeof renderAll === 'function') renderAll();   // refresh the status pill
  }

  return { of, status, badgeHTML, open, preview, save };
})();
