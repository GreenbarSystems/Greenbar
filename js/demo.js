// ════ Greenbar — demo / sample dataset ════
// One-tap realistic sample so users can explore without their own CSV.
// Deterministic (no RNG): 3 recent complete months with income, recurring
// charges, variable spend and a planted duplicate (so anomaly + cleanup
// features have something to surface). Demo rows are tagged source:'demo' so
// they can be removed without touching any real imported data.
//
// Globals used: _months, _allTxs, _sel, MN, sortKeys, aggregateOneMonth,
// saveData, renderAll, showScreen, _navBtn, showHeaderButtons, gbDialog,
// showToast.

const gbDemo = (() => {
  const FLAG = 'gb_demo';
  function isLoaded(){ return localStorage.getItem(FLAG) === '1'; }

  const _ts = (y, m, d) => y * 10000 + m * 100 + d;
  const _key = (y, m) => MN[m - 1] + ' ' + y;
  const _dateStr = (y, m, d) => `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

  // One month of demo transactions. `idx` (0=oldest) drives gentle variation so
  // trends / variance / forecast have signal; `isLatest` plants a duplicate.
  function _monthTxs(y, m, idx, isLatest){
    const mk = _key(y, m);
    const T = (d, desc, amount, cat, isIncome) =>
      ({ date: _dateStr(y, m, d), ts: _ts(y, m, d), month: mk, desc, amount, cat, isIncome: !!isIncome, source: 'demo' });
    const txs = [
      T(1,  'PAYROLL DIRECT DEPOSIT', 2600, '_income', true),
      T(15, 'PAYROLL DIRECT DEPOSIT', 2600, '_income', true),
      T(1,  'RENT',            -1850,            'Housing'),
      T(3,  'NETFLIX',         -15.99,           'Subscriptions'),
      T(5,  'SPOTIFY',         -11.99,           'Subscriptions'),
      T(6,  'PLANET FITNESS',  -24.99,           'Personal Care'),
      T(8,  'KROGER',          -(230 + idx * 15), 'Groceries'),
      T(22, 'KROGER',          -(180 + idx * 10), 'Groceries'),
      T(10, 'SHELL',           -(55 + idx * 4),   'Gas/Fuel'),
      T(12, 'CHIPOTLE',        -(38 + idx * 3),   'Dining Out'),
      T(19, 'OLIVE GARDEN',    -(64 + idx * 5),   'Dining Out'),
      T(4,  'STARBUCKS',       -6.45,            'Coffee'),
      T(11, 'STARBUCKS',       -5.95,            'Coffee'),
      T(2,  'AMAZON',          -(40 + idx * 20),  'Shopping')
    ];
    // Planted duplicate: NETFLIX charged again within 3 days in the latest month.
    if(isLatest) txs.push(T(4, 'NETFLIX', -15.99, 'Subscriptions'));
    return txs;
  }

  // Rebuild _months from the current _allTxs (re-uses the shared aggregator).
  function _rebuildMonths(){
    const grouped = {};
    for(const tx of (_allTxs || [])) (grouped[tx.month] = grouped[tx.month] || []).push(tx);
    const out = {};
    for(const k of Object.keys(grouped)) out[k] = aggregateOneMonth(grouped[k]);
    return out;
  }

  async function load(){
    try{
      // Confirm before adding sample rows if the user already has real data.
      const hasReal = (_allTxs || []).some(t => t.source !== 'demo');
      if(hasReal && !(await gbDialog.confirm('Load sample data? This adds demo transactions alongside your data — you can remove them anytime.'))) return;
      if(isLoaded()){ showToast('Sample data is already loaded.', 'success'); return; }

      const now = new Date();
      let demoTxs = [];
      for(let i = 3; i >= 1; i--){
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1); // 3 complete prior months
        demoTxs = demoTxs.concat(_monthTxs(d.getFullYear(), d.getMonth() + 1, 3 - i, i === 1));
      }

      _allTxs = (_allTxs || []).concat(demoTxs);
      _months = _rebuildMonths();
      _sel = sortKeys(_months).slice(-1)[0] || null;
      try{ localStorage.setItem(FLAG, '1'); localStorage.setItem('gb_setup_done', '1'); }catch(_){}
      saveData();
      if(typeof showHeaderButtons === 'function') showHeaderButtons();
      renderAll();
      if(typeof showScreen === 'function') showScreen('summary', _navBtn(0));
      showToast('Sample data loaded — explore, then remove it anytime.', 'success');
    }catch(e){ showToast(e.message, 'error'); }
  }

  async function clear(){
    try{
      if(!(await gbDialog.confirm('Remove sample data? Any data you imported yourself stays.'))) return;
      _allTxs = (_allTxs || []).filter(t => t.source !== 'demo');
      _months = _rebuildMonths();
      _sel = sortKeys(_months).slice(-1)[0] || null;
      try{ localStorage.removeItem(FLAG); }catch(_){}
      saveData();
      renderAll();
      showToast('Sample data removed.', 'success');
    }catch(e){ showToast(e.message, 'error'); }
  }

  function toggle(){ return isLoaded() ? clear() : load(); }

  return { load, clear, toggle, isLoaded };
})();
