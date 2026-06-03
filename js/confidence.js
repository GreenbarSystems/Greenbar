// ════ Greenbar — Import Confidence layer (gbConfidence) ════
// The trust spine of the app. Everything the user needs to TRUST the numbers —
// where they came from, how recently, how much was skipped, and what still
// needs a human look — is derived here from the canonical data (_allTxs) and the
// upload log (gb_log). Pure data/derivation in Phase 1; the trust bar, the
// Confidence Center screen and the "explain this number" drilldowns (Phases 2–4)
// read from these helpers so there is a single source of truth for trust.
//
// Confidence convention (see state.js Tx contract): a transaction with no `conf`
// field is high-confidence; `conf:'low' + needsReview:true` marks a row that was
// parsed with low confidence (e.g. a PDF with no clear table header). A row
// leaves the review queue when `reviewed:true` is set.
const gbConfidence = (() => {

  // Active date format, defensively (CFG may not be loaded in odd states).
  function _fmt(){ return (typeof CFG !== 'undefined' && CFG.cols && CFG.cols.fmt) || 'MM/DD/YY'; }

  // Human label for a transaction's date (e.g. "May 14, 2026"), falling back to
  // the raw string when it can't be parsed.
  function _label(tx){
    if(!tx) return '';
    if(typeof parseDateParts === 'function'){
      const pd = parseDateParts(tx.date, _fmt());
      if(pd && pd.label) return pd.label;
    }
    return tx.date || '';
  }

  function _txs(){ return (typeof _allTxs !== 'undefined' && _allTxs) ? _allTxs : []; }
  function _log(){ return (typeof getLog === 'function') ? getLog() : []; }

  // Earliest / latest transaction across the supplied set (defaults to all).
  // Uses tx.ts (YYYYMMDD integer); rows lacking ts are ignored for the bounds.
  function dateRange(txs){
    txs = txs || _txs();
    let lo = Infinity, hi = -Infinity, loTx = null, hiTx = null;
    for(const t of txs){
      const ts = (typeof t.ts === 'number') ? t.ts : null;
      if(ts === null) continue;
      if(ts < lo){ lo = ts; loTx = t; }
      if(ts > hi){ hi = ts; hiTx = t; }
    }
    if(loTx === null) return null;
    return {
      firstTs: lo, lastTs: hi,
      firstLabel: _label(loTx), lastLabel: _label(hiTx),
      firstMonth: loTx.month || '', lastMonth: hiTx.month || '',
    };
  }

  // Every row flagged low-confidence that the user hasn't yet verified.
  function reviewQueue(){ return _txs().filter(t => t.needsReview && !t.reviewed); }

  // Headline trust metadata for the trust bar + Confidence Center header.
  function trustSummary(){
    const log = _log();
    const skippedTotal = log.reduce((s, e) => s + (e.skipped || 0), 0);
    return {
      txCount:     _txs().length,
      dateRange:   dateRange(),
      lastImport:  log[0] ? { date: log[0].date, filename: log[0].filename } : null,
      importCount: log.length,
      skippedTotal: skippedTotal,
      reviewCount: reviewQueue().length,
    };
  }

  // Normalize a parse result into a confidence verdict for the import preview.
  // level: 'high' (clean) | 'mixed' (some rows flagged) | 'low' (all flagged).
  function importConfidence(result){
    result = result || {};
    const c = result.counts || {};
    const txs = result.txs || [];
    const low = txs.reduce((n, t) => n + (t.needsReview ? 1 : 0), 0);
    let level = result.confidence || (low ? 'low' : 'high');
    if(low > 0 && low < txs.length) level = 'mixed';
    const reasons = (result.reasons || []).slice();
    if(result.warn && reasons.indexOf(result.warn) === -1 && !reasons.length) reasons.push(result.warn);
    return { level, reasons, lowConfCount: low, skipped: c.skipped || 0, undated: c.undated || 0 };
  }

  // Mark a single row reviewed (clears it from the queue) and persist.
  function markReviewed(id){
    const tx = _txs().find(t => t.id === id);
    if(tx && !tx.reviewed){ tx.reviewed = true; if(typeof saveData === 'function') saveData(); return true; }
    return false;
  }

  // Clear the whole queue at once. Returns how many rows were marked.
  function markAllReviewed(){
    let n = 0;
    for(const t of reviewQueue()){ t.reviewed = true; n++; }
    if(n && typeof saveData === 'function') saveData();
    return n;
  }

  // ──────── Views & actions (Phase 2) ────────
  const _money  = (n) => (typeof gbMoneyAbs === 'function') ? gbMoneyAbs(n, 0) : ('$' + Math.abs(n).toFixed(0));
  const _vendor = (tx) => (typeof cleanVendor === 'function' ? cleanVendor(tx.desc) : tx.desc) || tx.desc || 'Transaction';
  const _rangeLabel = (dr) => !dr ? '—' : (dr.firstMonth === dr.lastMonth ? dr.firstMonth : (dr.firstMonth + ' – ' + dr.lastMonth));

  // Compact, accountant-style strip pinned to the top of Summary. Shows no
  // amounts (counts/dates only) so it's safe under privacy mode.
  function renderTrustBar(){
    const s = trustSummary();
    if(!s.txCount) return '';
    const line2 = [];
    if(s.lastImport) line2.push('Imported ' + s.lastImport.date);
    if(s.skippedTotal) line2.push(s.skippedTotal + ' skipped');
    const pill = s.reviewCount
      ? `<span class="tb-pill review">${s.reviewCount} to review</span>`
      : `<span class="tb-pill ok">&#10003; Verified</span>`;
    return `<button type="button" class="trust-bar" onclick="gbConfidence.open()" aria-label="Open Import Confidence Center: ${s.txCount} transaction${s.txCount===1?'':'s'}${s.reviewCount?(', '+s.reviewCount+' to review'):''}">
      <span class="tb-grow">
        <span class="tb-l1">${esc(_rangeLabel(s.dateRange))} <span class="tb-dot">&middot;</span> ${s.txCount} transaction${s.txCount===1?'':'s'}</span>
        ${line2.length?`<span class="tb-l2">${esc(line2.join(' · '))}</span>`:''}
      </span>
      ${pill}
      <span class="tb-chev" aria-hidden="true">&rsaquo;</span>
    </button>`;
  }

  function open(){
    if(typeof showScreen === 'function') showScreen('confidence');
    renderCenter();
  }

  // Keep the Settings → Import Confidence Center badge in sync with the queue.
  function updateBadge(){
    const b = document.getElementById('icc-badge');
    if(!b) return;
    const n = reviewQueue().length;
    if(n){ b.style.display = ''; b.textContent = n + ' to review'; }
    else b.style.display = 'none';
  }

  function _confBadge(level){
    if(level === 'low')   return `<span class="conf-badge low">Low confidence</span>`;
    if(level === 'mixed') return `<span class="conf-badge mixed">Needs review</span>`;
    return `<span class="conf-badge high">Clean</span>`;
  }
  function _statTile(label, value){
    return `<div class="conf-stat"><div class="conf-stat-v">${value}</div><div class="conf-stat-l">${esc(label)}</div></div>`;
  }

  function renderCenter(){
    const host = document.getElementById('confidence-content');
    if(!host) return;
    updateBadge();
    const s = trustSummary();
    if(!s.txCount){
      host.innerHTML = `<div class="conf-empty">No data imported yet.<br><button type="button" class="link-btn" onclick="startFirstImport && startFirstImport()">Import a statement &rarr;</button></div>`;
      return;
    }

    // 1) Trust summary
    const summaryHtml = `
      <div class="conf-stats">
        ${_statTile('Transactions', s.txCount)}
        ${_statTile('Date range', `<span style="font-size:14px;">${esc(_rangeLabel(s.dateRange))}</span>`)}
        ${_statTile('Imports', s.importCount)}
        ${_statTile('Skipped rows', s.skippedTotal)}
      </div>
      ${s.lastImport?`<div class="conf-lastimport">Last import: <strong>${esc(s.lastImport.filename)}</strong> &middot; ${esc(s.lastImport.date)}</div>`:''}`;

    // 2) Review queue (grouped by import)
    const queue = reviewQueue();
    const log = (typeof getLog === 'function') ? getLog() : [];
    const nameOf = (impId) => { const e = log.find(x => String(x.id) === String(impId)); return e ? e.filename : 'Imported rows'; };
    let reviewHtml;
    if(queue.length){
      const groups = {};
      queue.forEach(t => { const k = t.imp || '_'; (groups[k] = groups[k] || []).push(t); });
      reviewHtml = `
        <div class="conf-section-head">
          <h2 class="conf-h2">Needs review <span class="conf-count amber">${queue.length}</span></h2>
          <button type="button" class="conf-allbtn" onclick="gbConfidence.reviewAll()">Mark all reviewed</button>
        </div>
        <div class="conf-note">These rows were parsed with low confidence (e.g. a PDF with no clear table header). Confirm each looks right, or fix its category.</div>
        ${Object.keys(groups).map(k => `
          <div class="conf-card">
            <div class="conf-card-file">${esc(nameOf(k))}</div>
            ${groups[k].map(t => {
              const lbl = (typeof parseDateParts==='function' ? (parseDateParts(t.date, _fmt())||{}).label : '') || t.date || '';
              const cat = t.isIncome ? 'Income' : t.cat;
              return `<div class="conf-row">
                <div class="conf-row-main">
                  <div class="conf-row-v">${esc(_vendor(t))}</div>
                  <div class="conf-row-s">${esc(lbl)} &middot; ${esc(cat)}</div>
                </div>
                <div class="tx-amt ${t.amount<0?'neg':'pos'}">${t.amount<0?'−':'+'}${_money(t.amount)}</div>
                <div class="conf-row-acts">
                  <button type="button" class="conf-ok" onclick="gbConfidence.resolveRow('${esc(t.id)}',false)" aria-label="Looks right">&#10003;</button>
                  <button type="button" class="conf-fix" onclick="gbConfidence.resolveRow('${esc(t.id)}',true)">Fix</button>
                </div>
              </div>`;
            }).join('')}
          </div>`).join('')}`;
    } else {
      reviewHtml = `
        <h2 class="conf-h2">Needs review</h2>
        <div class="conf-allclear">&#10003; All imported rows are verified. Nothing needs your attention.</div>`;
    }

    // 3) Import history (enhanced)
    const histHtml = log.length ? `
      <h2 class="conf-h2">Import history</h2>
      ${log.map(e => {
        const undoable = (typeof _allTxs !== 'undefined') && (_allTxs || []).some(t => String(t.imp) === String(e.id));
        const range = e.dateRange ? _rangeLabel(e.dateRange) : (e.months || '');
        const drops = [];
        if(e.skipped) drops.push(e.skipped + ' skipped');
        if(e.undated) drops.push(e.undated + ' undated');
        if(e.lowConfCount) drops.push(e.lowConfCount + ' low-confidence');
        return `<div class="conf-card">
          <div class="conf-card-top">
            <div class="conf-card-file">${esc(e.filename)}</div>
            ${_confBadge(e.confidence || 'high')}
          </div>
          <div class="conf-card-meta">${esc(String(e.txCount))} txn${e.txCount===1?'':'s'} &middot; ${esc(range)} &middot; ${esc(e.date)}</div>
          ${drops.length?`<div class="conf-card-drops">${esc(drops.join(' · '))}</div>`:''}
          ${undoable?`<button type="button" class="conf-undo" onclick="gbConfidence.undo('${esc(String(e.id))}')">Undo this import</button>`:''}
        </div>`;
      }).join('')}` : '';

    host.innerHTML = summaryHtml + reviewHtml + histHtml;
  }

  // Per-row resolution. Marking reviewed clears it from the queue; openFix also
  // launches the existing per-transaction category editor (fixing == verifying).
  function resolveRow(id, openFix){
    markReviewed(id);
    renderCenter();
    if(typeof renderAll === 'function') renderAll();   // refresh the Summary trust bar too
    if(openFix && typeof openRecatModal === 'function') openRecatModal(id);
  }
  function reviewAll(){
    const n = markAllReviewed();
    renderCenter();
    if(typeof renderAll === 'function') renderAll();
    if(n && typeof showToast === 'function') showToast(n + ' row' + (n===1?'':'s') + ' marked reviewed', 'success');
  }
  async function undo(id){
    if(typeof gbCleanup !== 'undefined' && gbCleanup.undoImport){
      const ok = await gbCleanup.undoImport(id);
      if(ok) renderCenter();
    }
  }

  // Re-render when the user navigates to the Center (the trust-bar tap dispatches
  // gb:screen via showScreen). Refresh the Settings badge on every screen change.
  if(typeof document !== 'undefined'){
    document.addEventListener('gb:screen', (e) => {
      if(e.detail && e.detail.name === 'confidence') renderCenter();
      updateBadge();
    });
  }

  return { dateRange, reviewQueue, trustSummary, importConfidence, markReviewed, markAllReviewed,
           renderTrustBar, renderCenter, open, resolveRow, reviewAll, undo, updateBadge };
})();
