// ════ Greenbar — cash-flow forecast (on-device, no network) ════
// Projects a typical upcoming month from recent history + detected recurring
// charges. Pure local computation — no model, no external call. Surfaced as a
// section on the Budget screen (render.js calls gbForecast.sectionHTML()).
//
// Globals used: _months, _allTxs, sortKeys, sumExpenses, MN, esc, and
// gbTrends.detectRecurring (recurring.js) for the fixed-charge baseline.

const gbForecast = (() => {
  const _money  = n => gbMoneyAbs(n, 0);   // locale/currency-aware (core.js)
  const _signed = n => (n >= 0 ? '+' : '−') + _money(n);
  const _round  = n => Math.round(Number(n) || 0);
  const _monthName = k => String(k || '').split(' ')[0] || k;
  function _tsToDate(ts){ const y=Math.floor(ts/10000), m=Math.floor((ts%10000)/100), d=ts%100; return new Date(y, m-1, d); }
  function _median(a){ if(!a.length) return 0; const s=a.slice().sort((x,y)=>x-y), n=s.length, mid=n>>1; return n%2 ? s[mid] : (s[mid-1]+s[mid])/2; }

  // "Mon YYYY" + offset months -> "Mon YYYY".
  function _futureMonthLabel(latestKey, offset){
    const parts = String(latestKey).split(' ');
    let mi = MN.indexOf(parts[0]); let y = parseInt(parts[1], 10);
    if(mi < 0 || !y) return '';
    mi += offset; y += Math.floor(mi / 12); mi = ((mi % 12) + 12) % 12;
    return `${MN[mi]} ${y}`;
  }

  // Memoized against _dataVersion — compute() runs another median pass and a
  // detectRecurring() call, and is invoked by both the Budget forecast section
  // and the Goals ETA each render. One computation per data change.
  let _fcCache = null, _fcHasCache = false, _fcCacheVer = -1;
  function compute(){
    if(_fcHasCache && _fcCacheVer === _dataVersion) return _fcCache;
    _fcCache = _compute();
    _fcHasCache = true; _fcCacheVer = _dataVersion;
    return _fcCache;
  }
  function _compute(){
    const keys = sortKeys(_months);
    const n = keys.length;
    if(!n) return null;

    // Use a trailing window (up to 6 months) and the MEDIAN, so a single
    // unusual month doesn't skew the projection.
    const recent  = keys.slice(-6);
    const incomes = recent.map(k => _months[k].income).filter(v => v > 0);
    // Exclude zero-spend (empty/partial) months — keeping them would drag the
    // median down and over-optimistically inflate projected net. Mirrors income.
    const spends  = recent.map(k => sumExpenses(_months[k])).filter(v => v > 0);
    const expectedIncome = _round(_median(incomes));
    const expectedSpend  = _round(_median(spends));
    const hasIncome = expectedIncome > 0;

    const rec = (typeof gbTrends !== 'undefined' && gbTrends.detectRecurring)
      ? gbTrends.detectRecurring() : { series: [], totalMonthly: 0 };
    const recurringMonthly = _round(rec.totalMonthly);
    const variableSpend = Math.max(0, expectedSpend - recurringMonthly);
    const projectedNet = expectedIncome - expectedSpend;
    const latest = keys[keys.length - 1];

    // Cumulative net over the next 3 months if this pace holds.
    const trajectory = [1, 2, 3].map(i => ({ label: _futureMonthLabel(latest, i), cumulative: projectedNet * i }));

    // Upcoming recurring charges, anchored to the latest date in the data
    // (deterministic "as of" point — independent of wall-clock / stale data).
    let anchor = 0;
    for(const k of keys) for(const tx of (_months[k].txs || [])) if(tx.ts > anchor) anchor = tx.ts;
    const anchorDate = anchor ? _tsToDate(anchor) : new Date();
    const windowEnd = new Date(anchorDate); windowEnd.setDate(windowEnd.getDate() + 35);
    const upcoming = (rec.series || [])
      .filter(s => s.nextExpectedTs)
      .map(s => ({ vendor: s.vendor, amount: s.typicalAmount, ts: s.nextExpectedTs, date: s.nextExpected }))
      .filter(s => { const d = _tsToDate(s.ts); return d >= anchorDate && d <= windowEnd; })
      .sort((a, b) => a.ts - b.ts);
    const upcomingTotal = _round(upcoming.reduce((s, x) => s + x.amount, 0));

    return {
      keys, n, latest, hasIncome, expectedIncome, expectedSpend, recurringMonthly,
      variableSpend, projectedNet, trajectory, upcoming, upcomingTotal,
      confidence: n >= 3 ? 'high' : 'low'
    };
  }

  function sectionHTML(){
    const f = compute();
    if(!f) return '';

    if(f.n < 2){
      return `
      <h2 class="sec-hdr">Cash-Flow Forecast</h2>
      <div style="background:var(--glass);border:1px solid var(--border);border-radius:20px;padding:16px;margin-bottom:14px;font-size:13px;color:var(--muted);line-height:1.6;">
        Import a second month and Greenbar will project next month's income, spending and net — computed on your device.</div>`;
    }

    const nextLabel = _monthName(_futureMonthLabel(f.latest, 1));
    const upcomingHtml = f.upcoming.length
      ? f.upcoming.slice(0, 6).map(u => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--o05);font-size:12.5px;">
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(u.vendor)}</span>
          <span style="color:var(--muted);font-size:11px;margin:0 10px;flex-shrink:0;">${esc(u.date)}</span>
          <span style="font-weight:700;flex-shrink:0;">${_money(u.amount)}</span>
        </div>`).join('')
      : `<div style="font-size:12px;color:var(--muted);padding:6px 0;">No recurring charges expected in the next few weeks.</div>`;

    // Income missing → don't show a scary negative "net"; show the spending
    // outlook and point the user at income keywords instead.
    if(!f.hasIncome){
      return `
      <h2 class="sec-hdr">Cash-Flow Forecast</h2>
      <div style="background:linear-gradient(155deg,rgba(41,121,255,0.08),rgba(0,214,143,0.05));border:1px solid rgba(41,121,255,0.22);border-radius:20px;padding:16px 16px 12px;margin-bottom:14px;">
        <div style="font-family:var(--font-display);font-size:11px;font-weight:800;color:var(--soft);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Expected spending · ${esc(nextLabel)}</div>
        <div style="font-family:var(--font-display);font-size:30px;font-weight:900;letter-spacing:-0.5px;line-height:1.1;">${_money(f.expectedSpend)}<span style="font-size:13px;color:var(--muted);font-weight:700;">/mo</span></div>
        <div style="font-size:12px;color:var(--soft);margin:6px 0 12px;">${_money(f.recurringMonthly)} recurring + ${_money(f.variableSpend)} variable. Add income keywords in Settings to project your net.</div>
        <div style="font-family:var(--font-display);font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:2px;">Upcoming recurring${f.upcomingTotal?` · ${_money(f.upcomingTotal)}`:''}</div>
        ${upcomingHtml}
      </div>`;
    }

    const pos = f.projectedNet >= 0;
    const col = pos ? 'var(--green)' : 'var(--red)';
    const trajHtml = f.trajectory.map(t => `<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;">
        <span style="color:var(--muted);">${esc(_monthName(t.label))}</span>
        <span style="color:${t.cumulative>=0?'var(--green)':'var(--red)'};font-weight:700;">${_signed(t.cumulative)}</span></div>`).join('');

    return `
      <h2 class="sec-hdr">Cash-Flow Forecast</h2>
      <div style="background:linear-gradient(155deg,rgba(41,121,255,0.08),rgba(0,214,143,0.05));border:1px solid rgba(41,121,255,0.22);border-radius:20px;padding:16px 16px 12px;margin-bottom:14px;">
        <div style="font-family:var(--font-display);font-size:11px;font-weight:800;color:${col};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Projected net · ${esc(nextLabel)}</div>
        <div style="font-family:var(--font-display);font-size:30px;font-weight:900;letter-spacing:-0.5px;color:${col};line-height:1.1;">${_signed(f.projectedNet)}<span style="font-size:13px;color:var(--muted);font-weight:700;">/mo</span></div>
        <div style="font-size:12px;color:var(--soft);margin:6px 0 12px;">Expected income ${_money(f.expectedIncome)} − spending ${_money(f.expectedSpend)} (${_money(f.recurringMonthly)} recurring + ${_money(f.variableSpend)} variable).</div>

        <div style="font-family:var(--font-display);font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:2px;">If this pace holds</div>
        ${trajHtml}

        <div style="font-family:var(--font-display);font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;margin:10px 0 2px;">Upcoming recurring${f.upcomingTotal?` · ${_money(f.upcomingTotal)}`:''}</div>
        ${upcomingHtml}

        ${f.confidence==='low' ? `<div style="font-size:11px;color:var(--muted);margin-top:10px;line-height:1.5;">Based on ${f.n} months — the forecast sharpens as you import more.</div>` : ''}
      </div>`;
  }

  return { compute, sectionHTML };
})();
