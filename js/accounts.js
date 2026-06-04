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
    const money = (typeof gbMoneyAbs === 'function') ? (n => gbMoneyAbs(n, 0)) : (n => '$' + Math.round(Math.abs(n)));
    const hasProfiles = (typeof gbProfiles !== 'undefined');
    host.innerHTML = items.map(a => {
      const bal = balance(a.name);
      const balText = bal ? ` &middot; bal ${bal.balance < 0 ? '−' : ''}${money(bal.balance)}` : '';
      // Saved import profile: type selector, payment policy, last imported range.
      let profileHtml = '';
      if(hasProfiles){
        const p = gbProfiles.get(a.name);
        const type = gbProfiles.typeFor(a.name);
        const cardLike = gbProfiles.isCardLike(type);
        const typeOpts = gbProfiles.TYPES.map(v => `<option value="${v}"${v === type ? ' selected' : ''}>${esc(gbProfiles.typeLabel(v))}</option>`).join('');
        const r = p && p.lastRange;
        const range = r ? (r.firstLabel === r.lastLabel ? r.firstLabel : `${r.firstLabel} – ${r.lastLabel}`) : '';
        profileHtml = `
        <div class="acct-meta">
          <select class="acct-type" aria-label="Account type for ${esc(a.name)}" onchange="gbProfiles.setType(this.closest('.acct-card').dataset.acct, this.value)">${typeOpts}</select>
          ${cardLike ? `<label class="acct-pay"><input type="checkbox" ${p && p.paymentsAsSpending ? 'checked' : ''} onchange="gbProfiles.setPaymentsAsSpending(this.closest('.acct-card').dataset.acct, this.checked)"> payments as spending</label>` : ''}
        </div>
        ${range ? `<div class="acct-last">Last import: <strong>${esc(range)}</strong>${p.lastImport ? ` · ${esc(p.lastImport)}` : ''}</div>` : ''}`;
      }
      return `
      <div class="acct-card" data-acct="${esc(a.name)}">
        <div class="acct-row">
          <input class="acct-name" value="${esc(a.name)}" data-orig="${esc(a.name)}" aria-label="Account name" autocomplete="off"
            onkeydown="if(event.key==='Enter'){event.preventDefault();gbAccounts.rename(this.dataset.orig,this.value);}">
          <span class="acct-count">${a.txCount} txn${a.txCount === 1 ? '' : 's'}${balText}</span>
          <button type="button" class="acct-save" onclick="const i=this.closest('.acct-card').querySelector('.acct-name');gbAccounts.rename(i.dataset.orig,i.value)">Save</button>
          <button type="button" class="acct-del" aria-label="Delete ${esc(a.name)}" onclick="const i=this.closest('.acct-card').querySelector('.acct-name');gbAccounts.remove(i.dataset.orig)">&#x2715;</button>
        </div>
        ${profileHtml}
      </div>`;
    }).join('');
  }

  function openManager(){ renderManager(); if(typeof openModal === 'function') openModal('modal-accounts'); }

  // Current running balance for an account, if a statement closing balance was
  // ever recorded: the most recent closing balance + every transaction dated
  // strictly after it. Returns null when no closing balance is on file.
  function balance(name){
    const log = (typeof getLog === 'function') ? getLog() : [];
    let anchor = null;
    log.forEach(e => {
      if(e.account === name && e.closingBalance != null && typeof e.balanceAsOf === 'number'){
        if(!anchor || e.balanceAsOf > anchor.balanceAsOf) anchor = e;
      }
    });
    if(!anchor) return null;
    let bal = anchor.closingBalance;
    (typeof _allTxs !== 'undefined' ? _allTxs : []).forEach(t => {
      if(((t.acct && String(t.acct)) || UNASSIGNED) === name && (t.ts || 0) > anchor.balanceAsOf) bal += t.amount;
    });
    return { balance: bal, asOf: anchor.balanceAsOf };
  }

  // ──────── Per-account summary (dashboard breakdown) ────────
  // For a month (or all data when monthKey is null/'__all'): income, spend and
  // net per account. net = Σ amount; spend = income − net (matches the dashboard's
  // income/expense semantics, so refunds reduce spend rather than inflate income).
  function summary(monthKey){
    const all = (typeof _allTxs !== 'undefined' ? _allTxs : []);
    const scope = (monthKey && monthKey !== '__all') ? all.filter(t => t.month === monthKey) : all;
    const by = {};
    scope.forEach(t => {
      const a = (t.acct && String(t.acct)) || UNASSIGNED;
      const o = by[a] || (by[a] = { name: a, income: 0, net: 0, count: 0 });
      o.net += t.amount;
      if(t.isIncome) o.income += t.amount;
      o.count++;
    });
    return Object.values(by).map(o => ({ ...o, spend: o.income - o.net })).sort((a, b) => b.spend - a.spend);
  }

  // Dashboard card — only shown when ≥2 accounts have activity in scope (no
  // clutter for single-account users). Amounts use privacy-blurred classes.
  function cardHTML(monthKey){
    const rows = summary(monthKey);
    if(rows.length < 2) return '';
    const money = (typeof gbMoneyAbs === 'function') ? (n => gbMoneyAbs(n, 0)) : (n => '$' + Math.round(Math.abs(n)));
    return `<h2 class="sec-hdr">Accounts</h2>
      <div class="acct-sum-card">
        ${rows.map(a => {
          const bal = balance(a.name);
          const sub = bal
            ? `Balance <span class="cat-amt">${bal.balance < 0 ? '−' : ''}${money(bal.balance)}</span> &middot; ${a.count} txn${a.count === 1 ? '' : 's'}`
            : `in <span class="cat-amt">${money(a.income)}</span> &middot; out <span class="cat-amt">${money(a.spend)}</span> &middot; ${a.count} txn${a.count === 1 ? '' : 's'}`;
          return `<button type="button" class="acct-sum-row" data-acct="${esc(a.name)}" onclick="gbAccounts.viewTxs(this.dataset.acct)" aria-label="View ${esc(a.name)} transactions">
            <span class="asr-main">
              <span class="asr-name">${esc(a.name)}</span>
              <span class="asr-sub">${sub}</span>
            </span>
            <span class="asr-net"><span class="tx-amt ${a.net >= 0 ? 'pos' : 'neg'}">${a.net >= 0 ? '+' : '−'}${money(a.net)}</span></span>
            <span class="asr-chev" aria-hidden="true">&rsaquo;</span>
          </button>`;
        }).join('')}
      </div>`;
  }

  // Open the Transactions screen filtered to one account.
  function viewTxs(name){
    if(typeof showScreen === 'function') showScreen('txs', (typeof _navBtn === 'function' ? _navBtn(2) : null));
    if(typeof setTxAccount === 'function') setTxAccount(name);
  }

  return { list, rename, remove, renderManager, openManager, summary, cardHTML, viewTxs, balance };
})();
