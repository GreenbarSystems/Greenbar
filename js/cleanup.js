// ════ Greenbar — import review & clean-up center ════
// One place to review imports and fix data problems:
//   • Undo last import  (removes exactly the batch tagged with tx.imp)
//   • Delete a month     (drops all of a month's transactions)
//   • Remove duplicates  (all-history exact-duplicate scan within 3 days)
// All destructive actions are gated behind gbDialog.confirm and re-aggregate +
// persist. Pure local — no network.
//
// Globals used: _months, _allTxs, _sel, sortKeys, sumExpenses, rebuildMonths,
// _txById, cleanVendor, fmt, esc, saveData, renderAll, getLog, saveLog,
// updateLogBadge, gbDialog, showToast.

const gbCleanup = (() => {
  const _money = n => gbMoneyAbs(n, 0);   // locale/currency-aware (core.js)
  function _tsToDate(ts){ const y=Math.floor(ts/10000), m=Math.floor((ts%10000)/100), d=ts%100; return new Date(y, m-1, d); }
  function _vendorOf(tx){ return (typeof cleanVendor==='function' ? cleanVendor(tx.desc) : tx.desc) || tx.desc || 'Unknown'; }

  function _persistRender(){ saveData(); if(typeof renderAll==='function') renderAll(); render(); }

  // ── per-month stats ──
  function monthSummary(){
    return sortKeys(_months).map(mk => {
      const m = _months[mk];
      const spend = sumExpenses(m);
      return { mk, txCount: (m.txs||[]).length, income: m.income||0, spend, net: (m.income||0) - spend };
    });
  }

  // ── all-history exact-duplicate scan (same vendor + amount within 3 days) ──
  function scanDuplicates(){
    const groups = new Map();
    (_allTxs || []).forEach(tx => {
      if(!(tx.amount < 0)) return; // expenses only
      const k = _vendorOf(tx).toUpperCase() + '|' + Math.abs(tx.amount).toFixed(2);
      if(!groups.has(k)) groups.set(k, []);
      groups.get(k).push(tx);
    });
    const dups = [];
    for(const [, list] of groups){
      if(list.length < 2) continue;
      list.sort((a, b) => (a.ts||0) - (b.ts||0));
      for(let j = 1; j < list.length; j++){
        const a = list[j-1], b = list[j];
        if(!a.ts || !b.ts) continue;
        if(Math.abs((_tsToDate(b.ts) - _tsToDate(a.ts)) / 86400000) <= 3){
          dups.push({ id: b.id, vendor: _vendorOf(b), amount: b.amount, dateA: a.date, dateB: b.date });
        }
      }
    }
    return dups;
  }

  // ── actions ──
  async function deleteMonth(mk){
    const m = _months[mk]; if(!m) return;
    if(!(await gbDialog.confirm(`Delete all ${(m.txs||[]).length} transactions for ${mk}? This can't be undone.`))) return;
    _allTxs = (_allTxs || []).filter(t => t.month !== mk);
    rebuildMonths();
    if(_sel === mk) _sel = sortKeys(_months).slice(-1)[0] || null;
    _persistRender();
    showToast(`${mk} deleted.`, 'success');
  }

  async function removeDuplicate(id){
    const tx = _txById(id); if(!tx) return;
    if(!(await gbDialog.confirm(`Remove this duplicate — ${_vendorOf(tx)} ${_money(tx.amount)}?`))) return;
    // confirm() is async (non-blocking) in the app shell — re-resolve by id so a
    // concurrent action can't make us remove the wrong row.
    const live = _txById(id);
    if(!live){ showToast('Transaction not found.', 'error'); return; }
    _allTxs = (_allTxs || []).filter(t => t !== live);
    rebuildMonths();
    _persistRender();
    showToast('Duplicate removed.', 'success');
  }

  async function undoLastImport(){
    const log = getLog();
    const last = log[0];
    if(!last){ showToast('No imports to undo.', 'error'); return; }
    const affected = (_allTxs || []).filter(t => t.imp === last.id).length;
    if(!affected){ showToast('That import predates undo tracking and can\'t be undone here — use Delete month instead.', 'error'); return; }
    if(!(await gbDialog.confirm(`Undo import "${last.filename}"? This removes ${affected} transaction${affected===1?'':'s'}.`))) return;
    _allTxs = (_allTxs || []).filter(t => t.imp !== last.id);
    rebuildMonths();
    _sel = sortKeys(_months).slice(-1)[0] || null;
    log.shift(); saveLog(log);
    if(typeof updateLogBadge === 'function') updateLogBadge();
    _persistRender();
    showToast('Last import undone.', 'success');
  }

  // ── render ──
  function render(){
    const body = document.getElementById('cleanup-body');
    if(!body) return;

    // 1) Undo last import
    const log = getLog();
    const last = log[0];
    const undoable = last && (_allTxs || []).some(t => t.imp === last.id);
    const undoHtml = undoable ? `
      <h3 class="sec-hdr" style="margin-top:0;">Last import</h3>
      <div class="section-card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(last.filename)}</div>
        <div style="font-size:11.5px;color:var(--muted);margin:3px 0 10px;">${esc(String(last.txCount))} transactions · ${esc(last.months || '')}</div>
        <button type="button" class="btn-secondary" onclick="gbCleanup.undoLastImport()" style="margin:0;">Undo this import</button>
      </div>` : '';

    // 2) Months
    const months = monthSummary();
    const monthsHtml = months.length ? `
      <h3 class="sec-hdr" style="margin-top:0;">Months (${months.length})</h3>
      <div class="section-card" style="margin-bottom:14px;">
        ${months.map(s => `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--o05);">
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:700;">${esc(s.mk)}</div>
              <div style="font-size:11px;color:var(--muted);">${s.txCount} txs · net <span style="color:${s.net>=0?'var(--green)':'var(--red)'};">${s.net>=0?'+':'−'}${_money(s.net)}</span></div>
            </div>
            <button type="button" aria-label="Delete ${esc(s.mk)}" onclick="gbCleanup.deleteMonth('${esc(s.mk)}')" style="flex-shrink:0;border:1px solid rgba(255,71,87,0.3);background:rgba(255,71,87,0.08);color:var(--red);border-radius:10px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font-display);">Delete</button>
          </div>`).join('')}
      </div>` : `<div style="color:var(--muted);font-size:13px;padding:8px 2px;">No transactions yet.</div>`;

    // 3) Duplicates
    const dups = scanDuplicates();
    const dupHtml = `
      <h3 class="sec-hdr" style="margin-top:0;">Possible duplicates${dups.length?` (${dups.length})`:''}</h3>
      ${dups.length ? `<div class="section-card">${dups.map(d => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--o05);">
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(d.vendor)} ${_money(d.amount)}</div>
            <div style="font-size:11px;color:var(--muted);">${esc(d.dateA)} &amp; ${esc(d.dateB)}</div>
          </div>
          <button type="button" aria-label="Remove duplicate" onclick="gbCleanup.removeDuplicate('${esc(d.id)}')" style="flex-shrink:0;border:1px solid rgba(255,165,2,0.35);background:rgba(255,165,2,0.08);color:var(--amber);border-radius:10px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font-display);">Remove</button>
        </div>`).join('')}</div>`
      : `<div style="color:var(--muted);font-size:13px;padding:8px 2px;">No duplicate charges detected.</div>`}`;

    body.innerHTML = undoHtml + monthsHtml + dupHtml;
  }

  function openCleanup(){ render(); openModal('modal-cleanup'); }

  return { monthSummary, scanDuplicates, deleteMonth, removeDuplicate, undoLastImport, render, openCleanup };
})();
