// ════ Greenbar — manual transaction entry ════
// Adds cash/manual transactions that aggregate identically to CSV imports.
// Loads after core.js + render.js. Globals used (all defined by load time):
//   _months, _allTxs, _sel, CFG, parseDateParts, aggregateOneMonth, sortKeys,
//   _isQuotaErr, esc, fmt, renderAll, openModal, closeModal, closeOut, showToast.

const CURRENCY = "$"; // single localization point

let _txType = 'expense'; // 'expense' | 'income' — current modal toggle state

// ── small helpers ──
function _titleCase(s){ return String(s||'').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()); }

// Format a Y/M/D into CFG.cols.fmt so renderTxs()'s date-label parser (which
// uses CFG.cols.fmt) groups manual rows under the same headers as CSV rows.
function _formatDateForCfg(y, m, d){
  const fmt = (CFG && CFG.cols && CFG.cols.fmt) || 'MM/DD/YY';
  const mm = String(m).padStart(2,'0'), dd = String(d).padStart(2,'0');
  const yy = String(y).slice(-2), yyyy = String(y);
  switch(fmt){
    case 'YYYY-MM-DD': return `${yyyy}-${mm}-${dd}`;
    case 'DD/MM/YYYY': return `${dd}/${mm}/${yyyy}`;
    case 'MM/DD/YYYY': return `${mm}/${dd}/${yyyy}`;
    default:           return `${mm}/${dd}/${yy}`; // MM/DD/YY
  }
}

// Persist gb_data and SURFACE QuotaExceededError (core saveData() swallows it,
// which would silently drop a user-typed entry). Callers roll back on throw.
function _persistData(){
  localStorage.setItem('gb_data', JSON.stringify({ months: _months, txs: _allTxs, sel: _sel }));
}

// ── shared month aggregator (single source of truth) ──
// Recomputes a month's income/expenses from its txs array by delegating to the
// existing aggregateOneMonth() that the CSV path already uses.
function rebuildMonthAggregates(monthKey){
  const bucket = _months[monthKey];
  if(!bucket) return;
  _months[monthKey] = aggregateOneMonth(bucket.txs || []);
}

// ── A: add a manual transaction ──
function addManualTransaction(txData){
  // ---- validate (never write invalid data) ----
  const dateStr = ((txData && txData.date) || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if(!m) throw new Error('Enter a valid date.');
  const y = +m[1], mo = +m[2], d = +m[3];
  const pd = parseDateParts(dateStr, 'YYYY-MM-DD'); // validates real calendar date
  if(!pd) throw new Error('That date isn’t a real calendar date.');
  const now = new Date();
  const todayKey = now.getFullYear()*10000 + (now.getMonth()+1)*100 + now.getDate();
  if(pd.key > todayKey) throw new Error('Date can’t be in the future.');

  let desc = (txData.desc || '').trim();
  if(!desc) throw new Error('Add a short description.');
  if(desc.length > 80) desc = desc.slice(0, 80);

  const amount = Number(txData.amount);
  if(!isFinite(amount) || amount === 0) throw new Error('Enter a non-zero amount.');

  const category = (txData.category || '').trim();
  if(!category) throw new Error('Pick a category.');

  let vendor = (txData.vendor || '').trim() || desc;
  if(vendor.length > 80) vendor = vendor.slice(0, 80);
  let note = (txData.note || '').trim();
  if(note.length > 120) note = note.slice(0, 120);

  const isIncome = amount > 0;
  const tx = {
    // Stable id so the row renderer can locate this tx in _months[mk].txs even
    // after a reload, when loadData() parses _months and _allTxs into separate
    // object instances (reference equality no longer holds across the two).
    id:     'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    date:   _formatDateForCfg(y, mo, d),
    ts:     pd.key,
    month:  pd.month,        // "Mon YYYY"
    desc:   desc,
    amount: amount,          // signed: negative = expense, positive = income
    cat:    category,
    isIncome: isIncome,
    source: 'manual',
    vendor: vendor,
    note:   note
  };

  // ---- snapshot for rollback ----
  const snap = { months: JSON.parse(JSON.stringify(_months)), txs: _allTxs.slice(), sel: _sel };

  // ---- mutate _months + keep _allTxs in lockstep ----
  const mk = pd.month;
  if(!_months[mk]) _months[mk] = { income: 0, expenses: {}, txs: [] };
  _months[mk].txs.push(tx);
  rebuildMonthAggregates(mk);
  _allTxs = sortKeys(_months).flatMap(k => (_months[k].txs || [])); // rebuild in chrono order
  _sel = mk; // focus the month the entry landed in

  // ---- persist with rollback on quota ----
  try{
    _persistData();
  }catch(e){
    _months = snap.months; _allTxs = snap.txs; _sel = snap.sel;
    try{ renderAll(); }catch(_){}
    showToast(_isQuotaErr(e) ? 'Storage full. Clear older months in Settings.' : 'Could not save transaction.', 'error');
    throw e;
  }
  renderAll();
  return tx;
}

// ── B: delete a manual transaction ──
async function deleteManualTransaction(monthKey, txIndex){
  const bucket = _months[monthKey];
  if(!bucket || !Array.isArray(bucket.txs) || !bucket.txs[txIndex]){
    showToast('Transaction not found.', 'error'); return;
  }
  const tx = bucket.txs[txIndex];
  if(tx.source !== 'manual'){
    showToast('CSV transactions cannot be deleted. Re-import without this entry.', 'error');
    return;
  }
  // Capacitor-aware confirm (native dialog in the app shell, window.confirm on web).
  if(!await gbDialog.confirm('Delete this transaction? This cannot be undone.')) return;

  const snap = { months: JSON.parse(JSON.stringify(_months)), txs: _allTxs.slice(), sel: _sel };
  bucket.txs.splice(txIndex, 1);
  if(bucket.txs.length === 0){
    delete _months[monthKey];                                   // month now empty -> drop it
    if(_sel === monthKey) _sel = sortKeys(_months).slice(-1)[0] || null;
  }else{
    rebuildMonthAggregates(monthKey);                           // recompute from remaining txs
  }
  _allTxs = sortKeys(_months).flatMap(k => (_months[k].txs || []));

  try{
    _persistData();
  }catch(e){
    _months = snap.months; _allTxs = snap.txs; _sel = snap.sel;
    try{ renderAll(); }catch(_){}
    showToast(_isQuotaErr(e) ? 'Storage full. Clear older months in Settings.' : 'Could not update storage.', 'error');
    return;
  }
  renderAll();
  showToast('Transaction deleted.', 'success');
}

// ── C: open the entry modal ──
function openAddTransactionModal(){
  try{
    initAddTxForm();
    openModal('modal-add-tx'); // existing pattern provides focus-trap + Esc close
    // iOS needs a short delay before focus() reliably raises the keyboard.
    setTimeout(() => { document.getElementById('add-tx-amount')?.focus(); }, 100);
  }catch(e){ showToast(e.message, 'error'); }
}

function closeAddTransactionModal(){ closeModal('modal-add-tx'); }

// ── reads the form, calls addManualTransaction ──
function submitAddTransaction(){
  try{
    const amt = Math.abs(parseFloat(document.getElementById('add-tx-amount')?.value));
    const signed = (_txType === 'income') ? amt : -amt;

    const sel = document.getElementById('add-tx-category');
    let category = sel ? sel.value : '';
    if(category === '__new__'){
      category = _titleCase((document.getElementById('add-tx-newcat')?.value || '').trim());
      if(!category){ showToast('Name the new category.', 'error'); return; }
    }

    addManualTransaction({
      date:     document.getElementById('add-tx-date')?.value || '',
      desc:     document.getElementById('add-tx-desc')?.value || '',
      amount:   signed,
      category: category,
      vendor:   document.getElementById('add-tx-vendor')?.value || '',
      note:     document.getElementById('add-tx-note')?.value || ''
    });

    closeAddTransactionModal();
    showToast(_txType === 'income' ? 'Income added.' : 'Expense added.', 'success');
  }catch(e){ showToast(e.message, 'error'); }
}

// ── resets + populates the form on open ──
function initAddTxForm(){
  _txType = 'expense';
  toggleTransactionType('expense');

  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const dateEl = document.getElementById('add-tx-date');
  if(dateEl){ dateEl.value = iso; dateEl.max = iso; }

  ['add-tx-amount','add-tx-desc','add-tx-vendor','add-tx-note','add-tx-newcat'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
  populateCategorySelect();

  const newcatWrap = document.getElementById('add-tx-newcat-wrap'); if(newcatWrap) newcatWrap.style.display = 'none';
  ['vendor','note'].forEach(w => {
    const wrap = document.getElementById('add-tx-'+w+'-wrap'); if(wrap) wrap.style.display = 'none';
  });
  document.querySelectorAll('#modal-add-tx .addtx-toggle-link').forEach(b => {
    b.setAttribute('aria-expanded','false'); const a = b.querySelector('.tw-arrow'); if(a) a.textContent = '▸';
  });
  const dc = document.getElementById('add-tx-desc-count'); if(dc) dc.textContent = '0/80';

  _validateAddTxForm();
}

// ── category universe (fallback defaults ∪ categories seen in data ∪ budget
//    categories), sorted with "Other" pinned last. Shared by the add-tx
//    <select> and the per-transaction recategorize picker. ──
function getAllCategories(){
  const FALLBACK = ["Groceries","Dining Out","Transport","Utilities","Housing","Healthcare",
    "Entertainment","Shopping","Personal Care","Subscriptions","Education","Travel","Giving","Other"];
  const set = new Set(FALLBACK);
  (_allTxs || []).forEach(t => { if(t && t.cat && t.cat !== '_income') set.add(t.cat); });
  Object.keys((CFG && CFG.budget) || {}).forEach(c => set.add(c));
  let cats = Array.from(set).filter(c => c !== 'Other').sort((a,b) => a.localeCompare(b));
  cats.push('Other'); // always last
  return cats;
}

// ── builds the category <select> ──
function populateCategorySelect(){
  const sel = document.getElementById('add-tx-category');
  if(!sel) return;
  const cats = getAllCategories();
  sel.innerHTML =
    `<option value="" disabled selected hidden>Select category…</option>` +
    `<option value="__new__">+ Add new category</option>` +
    cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
}

// ── Per-transaction recategorization (fix a miscategorized row in place) ──
// renderTxs() passes the row's index into the live _allTxs array; we mutate that
// entry, re-aggregate the months from _allTxs, persist and re-render. A pinned
// row (catLocked) is protected from later rule-based recategorization.
let _recatIndex = null;
function openRecatModal(allTxIndex){
  const tx = _allTxs[allTxIndex];
  if(!tx){ showToast('Transaction not found.', 'error'); return; }
  _recatIndex = allTxIndex;
  const vend = (typeof cleanVendor === 'function' ? cleanVendor(tx.desc) : tx.desc) || tx.desc;
  const v = document.getElementById('recat-vendor'); if(v) v.textContent = vend;
  const cur = document.getElementById('recat-current');
  if(cur) cur.textContent = 'Currently in ' + (tx.cat === '_income' ? 'Income' : tx.cat);
  const grid = document.getElementById('recat-grid');
  if(grid){
    grid.innerHTML = getAllCategories().map(cat =>
      `<button type="button" data-cat="${esc(cat)}" onclick="chooseTxCategory(this.dataset.cat)" style="padding:9px 12px;border-radius:12px;border:1px solid ${cat===tx.cat?'rgba(0,214,143,0.5)':'var(--border)'};background:${cat===tx.cat?'rgba(0,214,143,0.12)':'var(--glass)'};color:var(--text);font-size:13px;font-weight:600;cursor:pointer;text-align:left;">${esc(cat)}</button>`
    ).join('');
  }
  // "Make a rule" defaults off; the label names the merchant the rule will match.
  const rule = document.getElementById('recat-make-rule'); if(rule) rule.checked = false;
  const rl = document.getElementById('recat-rule-label'); if(rl) rl.textContent = 'Always categorize “' + vend + '” this way';
  openModal('modal-recat');
}
function chooseTxCategory(newCat){
  if(_recatIndex == null) return;
  const idx = _recatIndex; _recatIndex = null;
  const ruleEl = document.getElementById('recat-make-rule');
  const makeRule = !!(ruleEl && ruleEl.checked);
  const tx = _allTxs[idx];
  setTxCategory(idx, newCat);
  if(makeRule && tx) addVendorRule(tx, newCat);
  closeModal('modal-recat');
}
// Derive a remap keyword that generalizes across a merchant's per-charge
// variants. Conservatively strips a trailing transaction-id token (e.g.
// "AMZN MKTP US*A1B2" -> "AMZN MKTP US") and trailing store/ref numbers, but
// leaves "*MERCHANT"-style processor prefixes (Square/PayPal) intact and falls
// back to the full cleaned vendor if stripping would leave too little to match
// on (avoids an over-broad rule that mis-tags unrelated merchants).
function _vendorRuleKeyword(desc){
  const full = ((typeof cleanVendor === 'function' ? cleanVendor(desc) : desc) || desc || '').toUpperCase().trim();
  const stripped = full
    .replace(/[*#]\S*\s*$/, '')   // trailing *CODE / #CODE
    .replace(/\s+\d{2,}\s*$/, '') // trailing store / reference numbers
    .replace(/\s{2,}/g, ' ')
    .trim();
  return stripped.length >= 4 ? stripped : full;
}

// Turn a one-off fix into a durable remap rule so future imports (and the rest
// of history) categorize this merchant automatically — the "less work next
// month" payoff. Keyword generalizes across per-charge variants; editable in
// Settings → Category Remaps if it needs broadening.
function addVendorRule(tx, cat){
  const vk = _vendorRuleKeyword(tx.desc);
  if(!vk) return;
  if(!Array.isArray(CFG.remaps)) CFG.remaps = [];
  const existing = CFG.remaps.find(r => String(r.kw).toUpperCase() === vk);
  if(existing) existing.cat = cat; else CFG.remaps.push({ kw: vk, cat: cat });
  saveCFG();
  if(typeof recategorizeAll === 'function') recategorizeAll();   // apply to existing history too
  showToast('Rule saved — future “' + vk + '” transactions → ' + cat, 'success');
}
function setTxCategory(allTxIndex, newCat){
  const tx = _allTxs[allTxIndex];
  if(!tx || !newCat || tx.cat === newCat) return;
  const old = { cat: tx.cat, isIncome: tx.isIncome, catLocked: tx.catLocked };
  tx.cat = newCat;
  tx.catLocked = true;   // pin: future rule-based recategorization won't override
  tx.isIncome = false;   // assigning a spend category de-classifies any false income
  _months = aggregate(_allTxs);
  try{
    _persistData();
  }catch(e){
    tx.cat = old.cat; tx.isIncome = old.isIncome;
    if(old.catLocked === undefined) delete tx.catLocked; else tx.catLocked = old.catLocked;
    _months = aggregate(_allTxs);
    try{ renderAll(); }catch(_){}
    showToast(_isQuotaErr(e) ? 'Storage full. Clear older months in Settings.' : 'Could not save change.', 'error');
    return;
  }
  renderAll();
  showToast('Moved to ' + newCat, 'success');
}

// ── switches Expense/Income UI state ──
function toggleTransactionType(type){
  _txType = (type === 'income') ? 'income' : 'expense';
  const exp = document.getElementById('add-tx-type-expense');
  const inc = document.getElementById('add-tx-type-income');
  if(exp){ exp.classList.toggle('active', _txType === 'expense'); exp.setAttribute('aria-pressed', String(_txType === 'expense')); }
  if(inc){ inc.classList.toggle('active', _txType === 'income');  inc.setAttribute('aria-pressed', String(_txType === 'income')); }
  document.getElementById('add-tx-amount-wrap')?.classList.toggle('income', _txType === 'income');
  _validateAddTxForm();
}

// ── floating add button visibility ──
function showFloatingAddBtn(){ document.getElementById('fab-add-tx')?.classList.add('visible'); }
function hideFloatingAddBtn(){ document.getElementById('fab-add-tx')?.classList.remove('visible'); }

// ── form-internal helpers (referenced by markup) ──
function _validateAddTxForm(){
  const amt = parseFloat(document.getElementById('add-tx-amount')?.value);
  const desc = (document.getElementById('add-tx-desc')?.value || '').trim();
  const sel = document.getElementById('add-tx-category');
  let catOk = false;
  if(sel){
    catOk = (sel.value === '__new__')
      ? !!(document.getElementById('add-tx-newcat')?.value || '').trim()
      : !!sel.value;
  }
  const btn = document.getElementById('add-tx-submit');
  if(btn) btn.disabled = !(isFinite(amt) && amt > 0 && !!desc && catOk);
}
function _onCatSelectChange(){
  const sel = document.getElementById('add-tx-category');
  const wrap = document.getElementById('add-tx-newcat-wrap');
  const isNew = !!(sel && sel.value === '__new__');
  if(wrap) wrap.style.display = isNew ? 'block' : 'none';
  if(isNew) setTimeout(() => document.getElementById('add-tx-newcat')?.focus(), 50);
  _validateAddTxForm();
}
function _toggleAddTxExtra(which, btn){
  const wrap = document.getElementById('add-tx-'+which+'-wrap');
  if(!wrap) return;
  const willOpen = wrap.style.display === 'none';
  wrap.style.display = willOpen ? 'block' : 'none';
  if(btn){ btn.setAttribute('aria-expanded', String(willOpen)); const a = btn.querySelector('.tw-arrow'); if(a) a.textContent = willOpen ? '▾' : '▸'; }
  if(willOpen) setTimeout(() => document.getElementById('add-tx-'+which)?.focus(), 50);
}

// ── F-wiring: show the FAB only on the Transactions screen ──
// showScreen() in core.js dispatches 'gb:screen' with detail.name.
document.addEventListener('gb:screen', (e) => {
  if(e.detail && e.detail.name === 'txs') showFloatingAddBtn();
  else hideFloatingAddBtn();
});
