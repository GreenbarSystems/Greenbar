// ════ Greenbar — transfer & card-payment resolution (gbTransfers) ════
// Detection (the review queue's "Possible transfers") only flags candidates.
// This is the workflow that lets the user actually RESOLVE them:
//   • Classify   — mark a row as a transfer (money moved between your accounts)
//                  or confirm it's real spending.
//   • Exclude    — a transfer (tx.transfer) is dropped from income/spend totals
//                  so it never looks like spending; the row stays visible.
//   • Pair       — link the two opposite sides (out + in) of one transfer; the
//                  resolver auto-suggests a match (opposite sign, equal amount,
//                  within a week).
//   • Save rules — "Always exclude <merchant>" adds a CFG.transferKw keyword so
//                  future imports (and the rest of your history) auto-exclude it.
//
// A manual choice sets tx.transferLocked so saved rules never override it.
// All on-device; nothing leaves the browser.
//
// Globals used: _allTxs, _txById, CFG, saveCFG, rebuildMonths, saveData,
// recategorizeAll, renderAll, openModal, closeModal, showToast, esc, gbMoney,
// gbVendor, gbTsToDate, parseDateParts, gbConfidence.
const gbTransfers = (() => {
  const CAP = 80;
  // Candidate heuristic — same shape gbConfidence uses to flag the review queue.
  // This only SURFACES rows; auto-exclusion comes solely from saved rules
  // (CFG.transferKw, applied in core.js isTransferDesc).
  const _RE = /\b(transfer|xfer|to savings|from savings|to checking|credit card payment|online transfer|internal transfer|account transfer|wire|ach\s+(?:transfer|debit|credit)|zelle|venmo|cash ?app|e-?transfer|interac)\b/i;

  const _money  = n => gbMoney(n);
  const _vendor = t => (typeof gbVendor === 'function') ? gbVendor(t) : (t.desc || '');
  function _fmt(){ return (typeof CFG !== 'undefined' && CFG.cols && CFG.cols.fmt) || 'MM/DD/YY'; }
  function _label(t){
    if(typeof parseDateParts === 'function'){ const pd = parseDateParts(t.date, _fmt()); if(pd && pd.label) return pd.label; }
    return t.date || '';
  }
  function _txs(){ return (typeof _allTxs !== 'undefined' && _allTxs) ? _allTxs : []; }

  function isTransferLike(desc){ return _RE.test(String(desc || '')); }
  function _ruleKey(t){ return String(_vendor(t) || '').toUpperCase().trim(); }
  function _hasRule(t){
    const d = String(t.desc || '').toUpperCase();
    return (CFG.transferKw || []).some(kw => kw && d.includes(String(kw).toUpperCase()));
  }

  // Every row worth showing: a detected candidate OR an already-excluded transfer.
  function _candidates(){
    return _txs().filter(t => t && (t.transfer === true || isTransferLike(t.desc)))
      .slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  }
  function summary(){
    const c = _candidates();
    const excluded = c.filter(t => t.transfer === true);
    return { candidateCount: c.length, excludedCount: excluded.length,
             excludedTotal: excluded.reduce((s, t) => s + Math.abs(t.amount), 0),
             unresolved: c.filter(t => !t.transfer && !t.transferLocked).length };
  }

  // ── persistence helper: re-derive totals, save, and refresh every surface ──
  function _commit(){
    if(typeof rebuildMonths === 'function') rebuildMonths();
    if(typeof saveData === 'function') saveData();
    render();
    if(typeof renderAll === 'function') renderAll();
    if(typeof gbConfidence !== 'undefined'){ if(gbConfidence.renderCenter) gbConfidence.renderCenter(); if(gbConfidence.updateBadge) gbConfidence.updateBadge(); }
  }

  // ── actions ──
  function classify(id, isTransfer){
    const t = _txById(id); if(!t) return;
    if(isTransfer){ t.transfer = true; }
    else {
      delete t.transfer;
      if(t.transferPair){ const p = _txById(t.transferPair); if(p) delete p.transferPair; delete t.transferPair; }
    }
    t.transferLocked = true;   // user pinned it — saved rules won't override
    _commit();
  }

  function toggleRule(id, on){
    const t = _txById(id); if(!t) return;
    const key = _ruleKey(t);
    if(!key){ if(typeof showToast === 'function') showToast('Couldn\'t read a merchant name to build a rule.', 'error'); render(); return; }
    CFG.transferKw = CFG.transferKw || [];
    if(on){ if(!CFG.transferKw.some(k => k.toUpperCase() === key)) CFG.transferKw.push(key); }
    else  { CFG.transferKw = CFG.transferKw.filter(k => k.toUpperCase() !== key); }
    if(typeof saveCFG === 'function') saveCFG();
    // Apply across history (skips transferLocked rows), which rebuilds + renders.
    if(typeof recategorizeAll === 'function') recategorizeAll();
    render();
    if(typeof showToast === 'function') showToast(on ? `Future “${key}” rows will be excluded.` : `Rule removed.`, on ? 'success' : 'info');
  }

  // Find the opposite side of a transfer: opposite sign, ~equal amount, within a
  // week, not already paired. Prefers a different account, then the closest date.
  function suggestPair(t){
    if(!t) return null; const amt = Math.abs(t.amount);
    let best = null, bestScore = Infinity;
    for(const o of _txs()){
      if(o.id === t.id || o.transferPair) continue;
      if(o.amount * t.amount >= 0) continue;                  // need opposite sign
      if(Math.abs(Math.abs(o.amount) - amt) > 1) continue;    // ~equal magnitude
      let days = 999;
      if(typeof gbTsToDate === 'function' && t.ts && o.ts){ days = Math.abs((gbTsToDate(o.ts) - gbTsToDate(t.ts)) / 86400000); }
      if(days > 7) continue;
      const score = days + ((o.acct && t.acct && o.acct === t.acct) ? 3 : 0); // prefer cross-account
      if(score < bestScore){ bestScore = score; best = o; }
    }
    return best;
  }
  function pair(idA, idB){
    const a = _txById(idA), b = _txById(idB); if(!a || !b) return;
    a.transfer = b.transfer = true; a.transferLocked = b.transferLocked = true;
    a.transferPair = b.id; b.transferPair = a.id;
    _commit();
    if(typeof showToast === 'function') showToast('Paired — both sides excluded as one transfer.', 'success');
  }
  function pairSuggested(id){
    const t = _txById(id); if(!t) return;
    const s = suggestPair(t);
    if(s) pair(id, s.id);
    else if(typeof showToast === 'function') showToast('No matching transaction found to pair with.', 'info');
  }
  function unpair(id){
    const t = _txById(id); if(!t) return;
    if(t.transferPair){ const p = _txById(t.transferPair); if(p) delete p.transferPair; delete t.transferPair; }
    if(typeof saveData === 'function') saveData();
    render();
  }

  function open(){ render(); if(typeof openModal === 'function') openModal('modal-transfers'); }

  // ── render ──
  function _rowHTML(t){
    const id = esc(t.id);
    const excluded = t.transfer === true;
    const neg = t.amount < 0;
    const vendor = _vendor(t);
    let pairHtml = '';
    if(excluded){
      if(t.transferPair){
        const p = _txById(t.transferPair);
        pairHtml = p
          ? `<div class="xfer-pair">&#8644; Paired with ${esc(_vendor(p))} ${p.amount<0?'−':'+'}${_money(p.amount)} <button type="button" class="link-btn" onclick="gbTransfers.unpair('${id}')">Unpair</button></div>`
          : `<div class="xfer-pair">&#8644; Paired <button type="button" class="link-btn" onclick="gbTransfers.unpair('${id}')">Unpair</button></div>`;
      } else {
        const s = suggestPair(t);
        if(s) pairHtml = `<button type="button" class="xfer-pairbtn" onclick="gbTransfers.pairSuggested('${id}')">&#8644; Pair with ${esc(_vendor(s))} ${s.amount<0?'−':'+'}${_money(s.amount)} · ${esc(_label(s))}</button>`;
      }
    }
    return `<div class="xfer-row${excluded?' is-excluded':''}">
      <div class="xfer-top">
        <div class="xfer-main"><div class="xfer-v">${esc(vendor)}</div><div class="xfer-s">${esc(_label(t))}${t.acct?` &middot; ${esc(t.acct)}`:''}</div></div>
        <div class="tx-amt ${neg?'neg':'pos'}">${neg?'−':'+'}${_money(t.amount)}</div>
      </div>
      <div class="xfer-seg" role="group" aria-label="Classify ${esc(vendor)}">
        <button type="button" class="${(!excluded && t.transferLocked)?'on':''}" onclick="gbTransfers.classify('${id}',false)">Spending</button>
        <button type="button" class="${excluded?'on':''}" onclick="gbTransfers.classify('${id}',true)">Transfer</button>
      </div>
      ${excluded?`<div class="xfer-extra">
        <label class="xfer-rule"><input type="checkbox" ${_hasRule(t)?'checked':''} onchange="gbTransfers.toggleRule('${id}',this.checked)"> Always exclude “${esc(_ruleKey(t))}”</label>
        ${pairHtml}
      </div>`:''}
    </div>`;
  }

  function render(){
    const body = document.getElementById('transfers-body'); if(!body) return;
    const c = _candidates();
    if(!c.length){
      body.innerHTML = `<div class="xfer-empty">No transfers or card payments detected yet.<br>When Greenbar spots money moving between your own accounts (a transfer, a credit-card payment), you'll resolve it here so it doesn't count as spending.</div>`;
      return;
    }
    const s = summary();
    const head = `<div class="xfer-head">
      <div class="xfer-head-n">${s.excludedCount} excluded${s.unresolved?` &middot; ${s.unresolved} to resolve`:''}</div>
      <div class="xfer-head-sub">${s.excludedCount?`${_money(s.excludedTotal)} kept out of your spending and income totals.`:'Mark money that just moves between your accounts so it doesn\'t look like spending.'}</div>
    </div>`;
    const shown = c.slice(0, CAP);
    const more = c.length > CAP ? `<div class="xfer-more">Showing ${CAP} of ${c.length}. Resolve these, then reopen for the rest.</div>` : '';
    body.innerHTML = head + shown.map(_rowHTML).join('') + more
      + `<div class="xfer-foot">Excluded transfers stay visible in your transactions — they just don't count as spending or income.</div>`;
  }

  return { open, render, classify, toggleRule, suggestPair, pair, pairSuggested, unpair, isTransferLike, summary };
})();
