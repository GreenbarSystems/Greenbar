// ════ Greenbar — account/source management (gbAccounts) ════
// Settings → Accounts: rename, merge (rename into an existing name), or remove an
// account/source created by imports. Operates on the canonical data: tx.acct on
// every row, CFG.accounts (known names), and the account field on gb_log entries.
// Pure on-device — no network.
//
// Globals used: _allTxs, _months, _sel, CFG, getLog, saveLog, saveData, saveCFG,
// rebuildMonths, sortKeys, updateLogBadge, openModal, gbDialog, showToast, esc,
// renderAll, _txAcct (render.js), gbConfidence.
const gbAccounts = (() => {
  const UNASSIGNED = 'Unassigned';

  // Accounts present in the data (tx.acct, blank => "Unassigned") plus any known
  // names with no rows yet (e.g. an import that was later undone), with counts.
  function list(){
    const counts = {};
    (typeof _allTxs !== 'undefined' ? _allTxs : []).forEach(t => {
      const a = (t.acct && String(t.acct)) || UNASSIGNED;
      counts[a] = (counts[a] || 0) + 1;
    });
    ((typeof CFG !== 'undefined' && CFG.accounts) || []).forEach(a => { if(!(a in counts)) counts[a] = 0; });
    return Object.keys(counts).sort((a, b) => a.localeCompare(b)).map(name => ({ name, txCount: counts[name] }));
  }

  function _persist(){
    if(typeof saveData === 'function') saveData();
    if(typeof saveCFG === 'function') saveCFG();
    if(typeof renderAll === 'function') renderAll();
    if(typeof gbConfidence !== 'undefined' && gbConfidence.updateBadge) gbConfidence.updateBadge();
    renderManager();
  }

  // Rename oldName -> newName. If newName already exists it's a merge (confirmed).
  async function rename(oldName, raw){
    const neu = (raw || '').trim();
    if(!neu || neu === oldName) { renderManager(); return; }
    const existing = list().some(a => a.name === neu);
    if(existing){
      if(!(await gbDialog.confirm(`Merge "${oldName}" into "${neu}"? Their transactions will share one account.`))) { renderManager(); return; }
    }
    (typeof _allTxs !== 'undefined' ? _allTxs : []).forEach(t => {
      const cur = (t.acct && String(t.acct)) || UNASSIGNED;
      if(cur === oldName) t.acct = neu;
    });
    // CFG.accounts: swap old->new, dedup, keep most-recent-first order; ensure present.
    const out = [];
    ((CFG.accounts) || []).forEach(a => { const v = (a === oldName) ? neu : a; if(out.indexOf(v) === -1) out.push(v); });
    if(out.indexOf(neu) === -1) out.unshift(neu);
    CFG.accounts = out;
    // gb_log entries
    if(typeof getLog === 'function'){
      const log = getLog(); let changed = false;
      log.forEach(e => { if(e.account === oldName){ e.account = neu; changed = true; } });
      if(changed && typeof saveLog === 'function') saveLog(log);
    }
    if(typeof _txAcct !== 'undefined' && _txAcct === oldName) _txAcct = neu; // keep the Transactions filter consistent
    _persist();
    if(typeof showToast === 'function') showToast(existing ? `Merged into ${neu}` : `Renamed to ${neu}`, 'success');
  }

  // Remove an account and all of its transactions (+ its log entries).
  async function remove(name){
    const n = (typeof _allTxs !== 'undefined' ? _allTxs : []).filter(t => ((t.acct && String(t.acct)) || UNASSIGNED) === name).length;
    if(!(await gbDialog.confirm(`Delete "${name}" and its ${n} transaction${n === 1 ? '' : 's'}? This can't be undone.`))) return;
    _allTxs = (_allTxs || []).filter(t => (((t.acct && String(t.acct)) || UNASSIGNED) !== name));
    if(typeof rebuildMonths === 'function') rebuildMonths();
    if(typeof _sel !== 'undefined' && _sel !== '__all' && typeof _months !== 'undefined' && !_months[_sel]){
      _sel = (typeof sortKeys === 'function' ? sortKeys(_months).slice(-1)[0] : null) || null;
    }
    CFG.accounts = ((CFG.accounts) || []).filter(a => a !== name);
    if(typeof getLog === 'function'){
      const log = getLog().filter(e => e.account !== name);
      if(typeof saveLog === 'function') saveLog(log);
      if(typeof updateLogBadge === 'function') updateLogBadge();
    }
    if(typeof _txAcct !== 'undefined' && _txAcct === name) _txAcct = '';
    _persist();
    if(typeof showToast === 'function') showToast(`Deleted ${name}`, 'success');
  }

  function renderManager(){
    const host = document.getElementById('accounts-body');
    if(!host) return;
    const items = list();
    if(!items.length){
      host.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:10px 2px;">No accounts yet — import bank transactions to create one.</div>`;
      return;
    }
    host.innerHTML = items.map(a => `
      <div class="acct-row">
        <input class="acct-name" value="${esc(a.name)}" data-orig="${esc(a.name)}" aria-label="Account name" autocomplete="off"
          onkeydown="if(event.key==='Enter'){event.preventDefault();gbAccounts.rename(this.dataset.orig,this.value);}">
        <span class="acct-count">${a.txCount} txn${a.txCount === 1 ? '' : 's'}</span>
        <button type="button" class="acct-save" onclick="const i=this.parentElement.querySelector('.acct-name');gbAccounts.rename(i.dataset.orig,i.value)">Save</button>
        <button type="button" class="acct-del" aria-label="Delete ${esc(a.name)}" onclick="const i=this.parentElement.querySelector('.acct-name');gbAccounts.remove(i.dataset.orig)">&#x2715;</button>
      </div>`).join('');
  }

  function openManager(){ renderManager(); if(typeof openModal === 'function') openModal('modal-accounts'); }

  return { list, rename, remove, renderManager, openManager };
})();
