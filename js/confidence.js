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

  return { dateRange, reviewQueue, trustSummary, importConfidence, markReviewed, markAllReviewed };
})();
