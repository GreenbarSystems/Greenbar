// ════ Greenbar — saved import profiles (gbProfiles) ════
// Each account remembers how it imports, so repeat monthly use is smoother:
//   • Bank/source name  — the account key itself (tx.acct / CFG.accounts).
//   • Account type       — checking | savings | credit | cash | paymentapp.
//   • Expected columns / date format — the mapping last used (remembered, shown).
//   • Payment policy     — for cards/apps, whether payments count as spending.
//   • Transfer rules     — global CFG.transferKw apply to all; the payment policy
//                          is the account-specific rule layered on top.
//   • Last imported range — so you know which statement to grab next.
// Stored in CFG.profiles (rides in gb_cfg2 → backed up / cleared with everything).
//
// Globals used: CFG, saveCFG, _allTxs, rebuildMonths, saveData, renderAll,
// gbTransfers, gbConfidence.
const gbProfiles = (() => {
  const TYPES = ['checking','savings','credit','cash','paymentapp'];
  const TYPE_LABEL = { checking:'Checking', savings:'Savings', credit:'Credit card', cash:'Cash', paymentapp:'Payment app' };
  // A card/app statement shows the bill PAYMENT as an inflow; left uncounted it
  // would otherwise look like income or cancel out real spend.
  const _PAY_RE = /\b(payment|thank ?you|autopay|auto ?pay|bill ?pay|pymt|e-?payment|online payment)\b/i;
  const isCardLike = t => t === 'credit' || t === 'paymentapp';

  function _all(){ if(!CFG.profiles || typeof CFG.profiles !== 'object') CFG.profiles = {}; return CFG.profiles; }
  function get(name){ return (name && _all()[name]) || null; }
  function typeLabel(t){ return TYPE_LABEL[t] || 'Checking'; }

  // Best-guess type from the account name (used as the default when there's no
  // saved profile yet).
  function inferType(name){
    const n = String(name || '').toLowerCase();
    if(/\b(credit|card|amex|visa|mastercard|cc)\b/.test(n)) return 'credit';
    if(/\b(paypal|venmo|cash ?app|zelle|wise|revolut|chime|wallet)\b/.test(n)) return 'paymentapp';
    if(/saving/.test(n)) return 'savings';
    if(/\bcash\b/.test(n)) return 'cash';
    return 'checking';
  }
  function typeFor(name){ const p = get(name); return (p && p.type) || inferType(name); }
  function paymentsAsSpendingFor(name){ const p = get(name); return p ? !!p.paymentsAsSpending : false; }

  // Should this row be auto-excluded as a card/app payment (an inflow that just
  // pays the balance), given the account's type + payment policy?
  function _isPayment(tx){
    return tx && tx.amount > 0 && (_PAY_RE.test(tx.desc || '') ||
      (typeof gbTransfers !== 'undefined' && gbTransfers.isTransferLike && gbTransfers.isTransferLike(tx.desc)));
  }
  // Apply the payment policy to a set of rows (in place). Card/app accounts whose
  // payments don't count as spending get their payment inflows marked transfer.
  function applyPaymentPolicy(txs, type, paymentsAsSpending){
    if(!isCardLike(type) || paymentsAsSpending) return 0;
    let n = 0;
    (txs || []).forEach(t => { if(!t.transferLocked && _isPayment(t) && !t.transfer){ t.transfer = true; n++; } });
    return n;
  }

  // Upsert the profile after an import.
  function recordImport(name, opts){
    if(!name) return;
    opts = opts || {};
    const all = _all(); const p = all[name] || {};
    if(opts.type) p.type = opts.type;
    if(typeof opts.paymentsAsSpending === 'boolean') p.paymentsAsSpending = opts.paymentsAsSpending;
    if(opts.cols) p.cols = opts.cols;
    if(opts.range) p.lastRange = opts.range;
    if(typeof opts.txCountDelta === 'number') p.txCount = (p.txCount || 0) + opts.txCountDelta;
    if(opts.when) p.lastImport = opts.when;
    all[name] = p;
    if(typeof saveCFG === 'function') saveCFG();
  }

  // Change an account's type from the manager and re-apply the payment policy to
  // its existing rows (so switching to "credit card" excludes its payments).
  function setType(name, type){
    if(!name || TYPES.indexOf(type) < 0) return;
    const all = _all(); const p = all[name] || {}; p.type = type; all[name] = p;
    _reapply(name);
  }
  function setPaymentsAsSpending(name, val){
    const all = _all(); const p = all[name] || {}; p.paymentsAsSpending = !!val; all[name] = p;
    _reapply(name);
  }
  // Re-derive transfer flags for an account's (non-pinned) rows from its current
  // policy: card/app + payments-not-spending → payment inflows excluded; else the
  // policy-driven exclusions are lifted.
  function _reapply(name){
    const p = get(name); const cardPolicy = p && isCardLike(p.type) && !p.paymentsAsSpending;
    (_allTxs || []).forEach(t => {
      if(((t.acct && String(t.acct)) || '') !== name || t.transferLocked) return;
      if(cardPolicy && _isPayment(t)) t.transfer = true;
      else if(!cardPolicy && t.transfer && _isPayment(t)) delete t.transfer; // lift only payment-policy exclusions
    });
    if(typeof saveCFG === 'function') saveCFG();
    if(typeof rebuildMonths === 'function') rebuildMonths();
    if(typeof saveData === 'function') saveData();
    if(typeof renderAll === 'function') renderAll();
    if(typeof gbConfidence !== 'undefined' && gbConfidence.renderCenter) gbConfidence.renderCenter();
    if(typeof gbAccounts !== 'undefined' && gbAccounts.renderManager) gbAccounts.renderManager();
  }

  // ── Import-preview reactivity ──
  // When the account name changes, default the type + payment toggle + "last
  // import" line from that account's saved profile.
  function onAccountChange(name){
    const sel = document.getElementById('import-type-select');
    if(sel){ sel.value = typeFor(name); }
    onTypeChange(sel ? sel.value : typeFor(name), name);
    _renderLastRange(name);
  }
  function onTypeChange(type, name){
    const row = document.getElementById('import-payments-row');
    if(row) row.style.display = isCardLike(type) ? '' : 'none';
    const cb = document.getElementById('import-payments-spending');
    if(cb){ const p = get(name || (document.getElementById('import-account-input') || {}).value); cb.checked = p ? !!p.paymentsAsSpending : false; }
  }
  function _renderLastRange(name){
    const el = document.getElementById('import-lastrange'); if(!el) return;
    const p = get(name);
    if(p && p.lastRange){
      const r = p.lastRange;
      const range = (r.firstLabel && r.lastLabel) ? (r.firstLabel === r.lastLabel ? r.firstLabel : `${r.firstLabel} – ${r.lastLabel}`) : '';
      el.style.display = ''; el.innerHTML = `&#128338; Last import for this account: <strong>${range || '—'}</strong>${p.lastImport ? ` (${p.lastImport})` : ''}. ${typeLabel(p.type)}.`;
    } else if(p){
      el.style.display = ''; el.innerHTML = `${typeLabel(p.type)} account.`;
    } else { el.style.display = 'none'; el.innerHTML = ''; }
  }

  return { TYPES, TYPE_LABEL, typeLabel, get, inferType, typeFor, paymentsAsSpendingFor, isCardLike,
           applyPaymentPolicy, recordImport, setType, setPaymentsAsSpending,
           onAccountChange, onTypeChange };
})();
