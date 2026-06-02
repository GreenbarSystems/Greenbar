// ════ Greenbar — recurring-charge detection + month-over-month variance ════
// Two read-only analyses over the live model, surfaced on the Budget screen:
//   1. detectRecurring()      -> fixed/repeating charges (subscriptions, rent,
//                                utilities) with typical amount, cadence and
//                                next-expected date.
//   2. computeMonthVariance() -> per-category change for the selected month vs
//                                the immediately-prior tracked month and the
//                                trailing average.
// Zero deps beyond globals defined by load time:
//   _months, _allTxs, sortKeys, sumExpenses, cleanVendor, fmt, esc, MN,
//   openModal. All functions pure except the render/open helpers.
//
// ts contract: every tx.ts is a YYYYMMDD integer (y*10000 + m*100 + d), the
// same key produced by parseDateParts() — NOT an epoch. The date helpers below
// decode it accordingly.

const gbTrends = (() => {

  /* ── pure stat helpers ── */
  function _mean(a){ if(!a.length) return 0; let s=0; for(const x of a) s+=x; return s/a.length; }
  function _stddev(a){ if(!a.length) return 0; const m=_mean(a); let s=0; for(const x of a) s+=(x-m)*(x-m); return Math.sqrt(s/a.length); }
  function _median(a){ if(!a.length) return 0; const s=a.slice().sort((x,y)=>x-y), n=s.length, mid=n>>1; return n%2 ? s[mid] : (s[mid-1]+s[mid])/2; }
  function _round2(n){ return Math.round((Number(n)||0)*100)/100; }

  /* ── ts (YYYYMMDD) helpers ── */
  function _tsToDate(ts){ const y=Math.floor(ts/10000), m=Math.floor((ts%10000)/100), d=ts%100; return new Date(y, m-1, d); }
  function _dateLabel(ts){ const y=Math.floor(ts/10000), m=Math.floor((ts%10000)/100), d=ts%100; return (MN[m-1]||'') + ' ' + d + ', ' + y; }
  function _addDays(ts, days){
    const dt=_tsToDate(ts); dt.setDate(dt.getDate()+Math.round(days));
    return dt.getFullYear()*10000 + (dt.getMonth()+1)*100 + dt.getDate();
  }
  // Map a median inter-charge gap (in days) to a human cadence + a canonical
  // day-count used for next-expected and monthly-equivalent normalization.
  function _classifyCadence(days){
    if(days <= 10)  return { label:'Weekly',          days:7 };
    if(days <= 20)  return { label:'Biweekly',        days:14 };
    if(days <= 45)  return { label:'Monthly',         days:30.44 };
    if(days <= 75)  return { label:'Every ~2 months', days:61 };
    if(days <= 135) return { label:'Quarterly',       days:91 };
    return { label:'Occasional', days:Math.max(30.44, days) };
  }

  // Prefer an explicit curated vendor (manual txs) before deriving from desc,
  // matching anomaly.js so the same merchant groups/labels identically.
  function _vendorOf(tx){ return (tx.vendor && String(tx.vendor).trim()) || (typeof cleanVendor==='function' ? cleanVendor(tx.desc) : tx.desc) || tx.desc || 'Unknown'; }

  /* ════ A. Recurring-charge detection ════
   * Groups expenses by cleaned vendor name and keeps the groups that look like
   * fixed repeating charges:
   *   - present in at least half the tracked months (and >= minMonths),
   *   - about once per active month (filters out frequent discretionary spend
   *     like coffee/groceries, which recur but aren't fixed charges),
   *   - with a positive typical amount.
   * Returns { series:[…], totalMonthly, totalMonths }, series sorted by the
   * monthly-equivalent burden (largest first).
   */
  function detectRecurring(){
    const keys = sortKeys(_months);
    const totalMonths = keys.length;
    if(totalMonths < 2) return { series: [], totalMonthly: 0, totalMonths };

    const groups = new Map(); // vendorKey -> { display, occ:[{ts,abs}], cats:Map, months:Set }
    for(const mk of keys){
      for(const tx of (_months[mk].txs || [])){
        if(!(tx.amount < 0)) continue;                 // expenses only
        const display = _vendorOf(tx);
        const vk = display.toUpperCase();
        let g = groups.get(vk);
        if(!g){ g = { display, occ:[], cats:new Map(), months:new Set() }; groups.set(vk, g); }
        g.occ.push({ ts: tx.ts || 0, abs: Math.abs(tx.amount) });
        g.months.add(tx.month);
        g.cats.set(tx.cat, (g.cats.get(tx.cat) || 0) + 1);
      }
    }

    const minMonths = totalMonths >= 3 ? 3 : 2;
    const series = [];
    for(const g of groups.values()){
      const monthsSeen = g.months.size;
      if(monthsSeen < minMonths) continue;
      if(monthsSeen / totalMonths < 0.5) continue;       // must appear in >= half the months
      if(g.occ.length / monthsSeen > 1.6) continue;      // ~once a month, not many times

      const amounts = g.occ.map(o => o.abs);
      const med = _median(amounts);
      if(!(med > 0)) continue;
      const cv = (() => { const m=_mean(amounts); return m>0 ? _stddev(amounts)/m : 0; })();

      // Cadence from the median gap between consecutive charge dates.
      const tsSorted = g.occ.map(o => o.ts).filter(Boolean).sort((a,b)=>a-b);
      const gaps = [];
      for(let i=1;i<tsSorted.length;i++){
        const d = (_tsToDate(tsSorted[i]) - _tsToDate(tsSorted[i-1])) / 86400000;
        if(d > 0) gaps.push(d);
      }
      const cad = _classifyCadence(gaps.length ? _median(gaps) : 30.44);

      let cat = 'Uncategorized', best = -1;
      for(const [c,n] of g.cats){ if(n > best){ best = n; cat = c; } }

      const lastTs = tsSorted.length ? tsSorted[tsSorted.length-1] : 0;
      series.push({
        vendor: g.display,
        category: cat,
        typicalAmount: _round2(med),
        amountVaries: cv > 0.15,
        occurrences: g.occ.length,
        monthsSeen, totalMonths,
        cadence: cad.label,
        lastDate: lastTs ? _dateLabel(lastTs) : '',
        nextExpected: lastTs ? _dateLabel(_addDays(lastTs, cad.days)) : '',
        nextExpectedTs: lastTs ? _addDays(lastTs, cad.days) : 0,
        monthlyEquivalent: _round2(med * (30.44 / cad.days)),
        confidence: (monthsSeen / totalMonths >= 0.8 && cv <= 0.15) ? 'high' : 'medium'
      });
    }
    series.sort((a,b)=> b.monthlyEquivalent - a.monthlyEquivalent);
    const totalMonthly = _round2(series.reduce((s,x)=>s+x.monthlyEquivalent, 0));
    return { series, totalMonthly, totalMonths };
  }

  /* ════ B. Month-over-month variance ════
   * Compares mk against the immediately-prior tracked month (keys[idx-1]) and
   * the trailing average across every month before mk. Returns null when mk is
   * the first tracked month (nothing to compare against).
   */
  function computeMonthVariance(mk){
    const keys = sortKeys(_months);
    const idx = keys.indexOf(mk);
    if(idx < 1) return null;                              // need a prior month
    const m = _months[mk];
    if(!m) return null;
    const priorKey = keys[idx-1];
    const prior = _months[priorKey];
    const priorMonths = keys.slice(0, idx);              // every month before mk

    const cats = new Set([...Object.keys(m.expenses||{}), ...Object.keys(prior.expenses||{})]);
    const rows = [];
    for(const cat of cats){
      const cur = m.expenses[cat] || 0;
      const pri = prior.expenses[cat] || 0;
      let sum = 0, cnt = 0;
      for(const pk of priorMonths){ const v = _months[pk].expenses[cat]; if(v != null){ sum += v; cnt++; } }
      const avgPrior = cnt ? sum/cnt : 0;
      const delta = cur - pri;
      rows.push({
        cat, current:_round2(cur), prior:_round2(pri), avgPrior:_round2(avgPrior),
        delta:_round2(delta), pct: pri > 0 ? Math.round(delta/pri*100) : null,
        deltaVsAvg:_round2(cur - avgPrior)
      });
    }

    const curTotal = sumExpenses(m), priTotal = sumExpenses(prior);
    let tsum = 0; for(const pk of priorMonths) tsum += sumExpenses(_months[pk]);
    const avgTotal = priorMonths.length ? tsum/priorMonths.length : 0;

    // Movers: categories that changed by at least $20 vs the prior month,
    // biggest absolute swing first.
    const movers = rows.filter(r => Math.abs(r.delta) >= 20).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));

    return {
      monthKey: mk, priorKey, priorCount: priorMonths.length,
      currentTotal:_round2(curTotal), priorTotal:_round2(priTotal), avgTotal:_round2(avgTotal),
      totalDelta:_round2(curTotal - priTotal),
      totalPct: priTotal > 0 ? Math.round((curTotal - priTotal)/priTotal*100) : null,
      incomeCur:_round2(m.income), incomePri:_round2(prior.income), incomeDelta:_round2(m.income - prior.income),
      rows, movers
    };
  }

  /* ════ C. Render: variance section (inline on the Budget screen) ════ */
  function varianceSectionHTML(mk){
    const v = computeMonthVariance(mk);
    if(!v) return '';
    const up   = v.totalDelta > 0;
    const col  = up ? 'var(--red)' : 'var(--green)';
    const sign = up ? '+' : '−';
    const pctTxt = v.totalPct === null ? '' : ` (${up?'+':''}${v.totalPct}%)`;

    const moverRow = r => {
      const rUp = r.delta > 0;
      const rc  = rUp ? 'var(--red)' : 'var(--green)';
      const pct = r.pct === null ? '' : ` · ${rUp?'+':''}${r.pct}%`;
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px;">
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(r.cat)}</span>
        <span style="color:var(--muted);font-size:11px;margin:0 10px;flex-shrink:0;">${fmt(r.prior)} → ${fmt(r.current)}</span>
        <span style="color:${rc};font-weight:700;font-size:12px;flex-shrink:0;min-width:74px;text-align:right;">${rUp?'+':'−'}${fmt(Math.abs(r.delta))}${pct}</span>
      </div>`;
    };

    const top = v.movers.slice(0, 6);
    const moversHtml = top.length
      ? top.map(moverRow).join('')
      : `<div style="font-size:12px;color:var(--muted);padding:8px 0;">No category moved more than ${fmt(20)} vs ${esc(v.priorKey)}.</div>`;

    return `
    <h2 class="sec-hdr">Change vs Last Month</h2>
    <div style="background:var(--glass);border:1px solid var(--border);border-radius:20px;padding:16px 16px 8px;margin-bottom:14px;">
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:4px;">
        <div style="font-family:var(--font-display);font-size:11px;font-weight:800;color:${col};text-transform:uppercase;letter-spacing:0.08em;">Total spend vs ${esc(v.priorKey)}</div>
        <div style="font-size:11px;color:var(--muted);">avg ${fmt(v.avgTotal)}/mo over ${v.priorCount} mo</div>
      </div>
      <div style="font-family:var(--font-display);font-size:28px;font-weight:900;letter-spacing:-0.5px;color:${col};line-height:1.1;">${sign}${fmt(Math.abs(v.totalDelta))}${pctTxt}</div>
      <div style="font-size:12px;color:var(--soft);margin:6px 0 12px;">${fmt(v.priorTotal)} last month → ${fmt(v.currentTotal)} this month${up?' — spending rose':' — spending fell'}.</div>
      <div style="font-family:var(--font-display);font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:2px;">Biggest movers</div>
      ${moversHtml}
    </div>`;
  }

  /* ════ D. Render: recurring summary card (inline) + detail modal ════ */
  function recurringCardHTML(){
    const { series, totalMonthly } = detectRecurring();
    if(!series.length) return '';
    const n = series.length;
    return `
    <h2 class="sec-hdr">Recurring Charges</h2>
    <button type="button" onclick="gbTrends.openRecurring()" aria-label="View all recurring charges"
      style="width:100%;text-align:left;background:var(--glass);border:1px solid var(--border);border-radius:20px;padding:16px;margin-bottom:14px;cursor:pointer;display:flex;align-items:center;gap:14px;">
      <div style="flex:1;min-width:0;">
        <div style="font-family:var(--font-display);font-size:24px;font-weight:900;color:var(--green);line-height:1;">${fmt(totalMonthly)}<span style="font-size:13px;color:var(--muted);font-weight:700;">/mo</span></div>
        <div style="font-size:12px;color:var(--soft);margin-top:4px;">${n} recurring charge${n===1?'':'s'} detected — subscriptions, bills and other repeats.</div>
      </div>
      <span style="color:var(--green);font-size:13px;font-weight:700;flex-shrink:0;font-family:var(--font-display);">View &rsaquo;</span>
    </button>`;
  }

  function _recurringBodyHTML(rec){
    const { series, totalMonthly, totalMonths } = rec || detectRecurring();
    if(!series.length){
      return `<div style="font-size:13px;color:var(--muted);padding:20px 4px;text-align:center;line-height:1.6;">
        No recurring charges detected yet. Import at least two months of transactions and Greenbar will spot subscriptions, rent, utilities and other repeats.</div>`;
    }
    const conf = c => c==='high'
      ? '<span style="color:var(--green);">●</span>'
      : '<span style="color:var(--amber);">●</span>';
    const cards = series.map(s => `
      <div class="section-card" style="margin-bottom:10px;">
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;">
          <div style="font-size:14px;font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(s.vendor)}</div>
          <div style="font-family:var(--font-display);font-size:15px;font-weight:900;flex-shrink:0;">${fmt(s.typicalAmount)}${s.amountVaries?'<span style="font-size:11px;color:var(--muted);font-weight:700;">~avg</span>':''}</div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">
          <span style="background:rgba(0,214,143,0.10);border:1px solid rgba(0,214,143,0.2);border-radius:8px;padding:3px 9px;font-size:11px;font-weight:600;color:var(--green);">${esc(s.category)}</span>
          <span style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:3px 9px;font-size:11px;color:var(--muted);">${esc(s.cadence)}</span>
          <span style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:3px 9px;font-size:11px;color:var(--muted);">${s.monthsSeen}/${s.totalMonths} months</span>
          <span style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:3px 9px;font-size:11px;color:var(--muted);">${conf(s.confidence)} ${s.confidence}</span>
        </div>
        ${s.nextExpected ? `<div style="font-size:11.5px;color:var(--soft);margin-top:8px;">Last ${esc(s.lastDate)} · next expected around <strong>${esc(s.nextExpected)}</strong></div>` : ''}
      </div>`).join('');

    return `
      <div style="background:linear-gradient(145deg,rgba(0,214,143,0.06),rgba(0,201,177,0.04));border:1px solid rgba(0,214,143,0.15);border-radius:16px;padding:14px 16px;margin-bottom:14px;">
        <div style="font-family:var(--font-display);font-size:11px;font-weight:800;color:var(--green);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Estimated monthly recurring</div>
        <div style="font-family:var(--font-display);font-size:26px;font-weight:900;color:var(--green);line-height:1;">${fmt(totalMonthly)}<span style="font-size:13px;color:var(--muted);font-weight:700;">/mo</span></div>
        <div style="font-size:12px;color:var(--soft);margin-top:4px;">Across ${series.length} charge${series.length===1?'':'s'}, normalized to a monthly rate.</div>
      </div>
      ${cards}`;
  }

  function openRecurring(){
    const rec = detectRecurring();   // compute once; reuse for body + subtitle
    const body = document.getElementById('recurring-body');
    if(body) body.innerHTML = _recurringBodyHTML(rec);
    const sub = document.getElementById('recurring-sub');
    if(sub){
      sub.textContent = rec.series.length
        ? `${rec.series.length} repeating charge${rec.series.length===1?'':'s'} · ~${fmt(rec.totalMonthly)}/mo`
        : 'Nothing detected yet';
    }
    openModal('modal-recurring');
  }

  return { detectRecurring, computeMonthVariance, varianceSectionHTML, recurringCardHTML, openRecurring };
})();
