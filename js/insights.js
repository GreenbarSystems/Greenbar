// ════ Greenbar — on-device private insights engine ════
// Generates plain-English insights and answers data questions about the user's
// OWN spending — entirely in-process. NO model, NO network, NO external call of
// any kind: this is deterministic natural-language generation over the local
// data, so it honours Greenbar's "nothing leaves your device" promise and runs
// on every device (no WebGPU/WASM/model download).
//
// Reuses existing analyzers instead of duplicating logic:
//   render.js   -> computeHealthScore, computeStreaks, GRADE_EXPLAIN
//   recurring.js-> gbTrends.detectRecurring, gbTrends.computeMonthVariance
//   core/state  -> _months, _allTxs, CFG, sortKeys, sumExpenses, fmt, esc, MN,
//                  openModal, closeModal, closeOut

const gbInsights = (() => {
  const _money = n => gbMoney(n);   // -> core.js
  const _monthName = k => String(k || '').split(' ')[0] || k;

  // Single structured pass over the data; both generate() and answer() use it.
  function _analyze(){
    const keys = sortKeys(_months);
    const n = keys.length;
    if(!n) return null;

    let totalInc = 0, totalExp = 0; const catTotals = {};
    for(const mk of keys){
      const m = _months[mk];
      totalInc += m.income || 0;
      for(const [c, v] of Object.entries(m.expenses || {})){
        if(v > 0){ catTotals[c] = (catTotals[c] || 0) + v; totalExp += v; }
      }
    }
    const avgInc = totalInc / n, avgExp = totalExp / n, net = avgInc - avgExp;
    const savingsRate = avgInc > 0 ? net / avgInc : null;
    const cats = Object.entries(catTotals)
      .map(([c, t]) => ({ cat: c, avg: t / n, total: t }))
      .sort((a, b) => b.avg - a.avg);
    const latest = keys[keys.length - 1];

    const recurring = (typeof gbTrends !== 'undefined' && gbTrends.detectRecurring) ? gbTrends.detectRecurring() : null;
    const health    = (typeof computeHealthScore === 'function') ? computeHealthScore(latest) : null;
    const streaks   = (typeof computeStreaks === 'function') ? computeStreaks() : null;
    const variance  = (typeof gbTrends !== 'undefined' && gbTrends.computeMonthVariance) ? gbTrends.computeMonthVariance(latest) : null;

    return { keys, n, latest, totalInc, totalExp, avgInc, avgExp, net, savingsRate, cats, recurring, health, streaks, variance };
  }

  // Largest gap between a category's average and its own lowest tracked month —
  // the most actionable "trim" opportunity. Returns null if none qualifies.
  function _biggestLever(a, minGap){
    let lever = null;
    for(const c of a.cats.slice(0, 8)){
      const series = a.keys.map(k => _months[k].expenses[c.cat] || 0).filter(v => v > 0);
      if(series.length < 2) continue;
      const lo = Math.min(...series), gap = c.avg - lo;
      if(gap >= minGap && (!lever || gap > lever.gap)) lever = { cat: c.cat, avg: c.avg, lo, gap };
    }
    return lever;
  }

  function _narrative(a){
    if(a.n < 2) return `You've imported 1 month so far. Add another and I'll surface trends, recurring charges and where you can save — all computed on your device.`;
    const parts = [];
    if(a.savingsRate !== null){
      const pct = Math.round(a.savingsRate * 100);
      parts.push(pct >= 0 ? `you're keeping about ${pct}% of your income (~${_money(a.net)}/mo)`
                          : `you're spending about ${_money(-a.net)}/mo more than you earn`);
    }
    if(a.cats.length) parts.push(`${a.cats[0].cat} is your biggest category at ~${_money(a.cats[0].avg)}/mo`);
    if(a.recurring && a.recurring.series.length) parts.push(`about ${_money(a.recurring.totalMonthly)}/mo goes to recurring charges`);
    return `Across ${a.n} months, ${parts.join('; ')}.`;
  }

  // Build the full set of insight cards.
  function generate(){
    const a = _analyze();
    if(!a) return { summary: '', items: [] };
    const items = [];

    if(a.n < 2){
      items.push({ icon:'📥', tone:'info', title:'Import another month to unlock trends',
        body:`Insights get much richer with 2+ months — Greenbar will then show trends, recurring charges and savings opportunities.` });
    }

    // savings
    if(a.savingsRate !== null){
      const pct = Math.round(a.savingsRate * 100);
      if(a.savingsRate >= 0.2)
        items.push({ icon:'🟢', tone:'good', title:`You're saving about ${pct}% of income`,
          body:`Across ${a.n} month${a.n>1?'s':''} you keep ~${_money(a.net)}/mo after spending — a strong, sustainable rate.` });
      else if(a.savingsRate >= 0)
        items.push({ icon:'💰', tone:'info', title:`You're saving about ${pct}% of income`,
          body:`You net ~${_money(a.net)}/mo. Nudging toward 20% would build a stronger cushion.` });
      else
        items.push({ icon:'📉', tone:'warn', title:`Spending is outpacing income`,
          body:`On average you spend ~${_money(-a.net)}/mo more than you earn. The biggest lever is below.` });
    }

    // spending trend (month vs prior)
    if(a.variance){
      const v = a.variance, up = v.totalDelta > 0;
      let body = `${_monthName(v.monthKey)} spending is ${_money(v.currentTotal)} — ${up?'up':'down'} ${_money(Math.abs(v.totalDelta))}${v.totalPct!=null?` (${up?'+':''}${v.totalPct}%)`:''} vs ${_monthName(v.priorKey)}.`;
      if(v.movers && v.movers[0]) body += ` Biggest change: ${v.movers[0].cat} ${v.movers[0].delta>0?'up':'down'} ${_money(Math.abs(v.movers[0].delta))}.`;
      items.push({ icon:'📈', tone: up?'warn':'good', title: up?'Spending rose vs last month':'Spending eased vs last month', body });
    }

    // recurring burden
    if(a.recurring && a.recurring.series.length){
      const r = a.recurring, top = r.series[0];
      const pctInc = a.avgInc > 0 ? Math.round(r.totalMonthly / a.avgInc * 100) : null;
      items.push({ icon:'🔁', tone:'info', title:`~${_money(r.totalMonthly)}/mo in recurring charges`,
        body:`${r.series.length} repeating charge${r.series.length>1?'s':''}${pctInc!=null?` — about ${pctInc}% of income`:''}. Largest: ${top.vendor} (~${_money(top.typicalAmount)} ${String(top.cadence).toLowerCase()}).` });
    }

    // concentration
    if(a.cats.length){
      const top = a.cats[0], pct = a.avgExp > 0 ? Math.round(top.avg / a.avgExp * 100) : 0;
      if(pct >= 25)
        items.push({ icon:'🍰', tone:'info', title:`${top.cat} is ${pct}% of your spending`,
          body:`At ~${_money(top.avg)}/mo it's your largest category — worth a look if you want to trim.` });
    }

    // biggest opportunity
    const lever = _biggestLever(a, 30);
    if(lever)
      items.push({ icon:'🎯', tone:'good', title:`Biggest opportunity: ${lever.cat}`,
        body:`It averages ${_money(lever.avg)}/mo, but you've had months as low as ${_money(lever.lo)}. Matching that would free about ${_money(lever.gap)}/mo.` });

    // latest health
    if(a.health)
      items.push({ icon:'🩺', tone: a.health.score>=80?'good':a.health.score>=60?'info':'warn',
        title:`${_monthName(a.latest)} health: grade ${a.health.grade} (${a.health.score}/100)`,
        body: (typeof GRADE_EXPLAIN !== 'undefined' && GRADE_EXPLAIN[a.health.grade]) || a.health.label });

    // positive streak
    if(a.streaks && a.streaks.curPosStreak >= 2)
      items.push({ icon:'🔥', tone:'good', title:`${a.streaks.curPosStreak} positive months in a row`,
        body:`You've finished in the green ${a.streaks.curPosStreak} months straight. Keep it going.` });

    return { summary: _narrative(a), items };
  }

  // Answer a natural-language question about the user's data, locally.
  // Returns a string, or null so the keyword help (answerHelpQuery) can take
  // app-usage questions instead.
  function answer(q){
    const a = _analyze();
    if(!a) return null;
    const t = (q || '').toLowerCase();
    const has = (...ws) => ws.some(w => t.includes(w));

    if(has('subscription','recurring','bills','recurring charge')){
      if(!a.recurring || !a.recurring.series.length)
        return 'I haven\'t spotted recurring charges yet — import at least two months and I\'ll find subscriptions and bills, on your device.';
      const top = a.recurring.series.slice(0, 3).map(s => `${s.vendor} (~${_money(s.typicalAmount)} ${String(s.cadence).toLowerCase()})`).join(', ');
      return `You have ${a.recurring.series.length} recurring charge${a.recurring.series.length>1?'s':''} totalling about ${_money(a.recurring.totalMonthly)}/mo. Largest: ${top}. (Computed on your device.)`;
    }
    if(has('save','cut','reduce','spend less','lower','trim','cut back','where can i')){
      const lever = _biggestLever(a, 20);
      if(lever) return `Your best opportunity looks like ${lever.cat}: it averages ${_money(lever.avg)}/mo but you've had months as low as ${_money(lever.lo)}. Getting back to that would free about ${_money(lever.gap)}/mo.`;
      return 'Your spending is fairly steady across categories — no single one stands out as an easy cut right now.';
    }
    if(has('how am i','doing','savings','save rate','health','grade','on track')){
      let s = '';
      if(a.savingsRate !== null){
        const pct = Math.round(a.savingsRate * 100);
        s += pct >= 0 ? `You're saving about ${pct}% of income (~${_money(a.net)}/mo). `
                      : `You're spending about ${_money(-a.net)}/mo more than you earn. `;
      }
      if(a.health) s += `${_monthName(a.latest)}'s health grade is ${a.health.grade} (${a.health.score}/100).`;
      return s.trim() || null;
    }
    // A specifically-named category wins over the generic spending-trend reply
    // (e.g. "how much do I spend on dining out?").
    for(const c of a.cats){
      if(t.includes(c.cat.toLowerCase()))
        return `You spend about ${_money(c.avg)}/mo on ${c.cat}, across ${a.n} month${a.n>1?'s':''}.`;
    }
    if(has('spend','spending','trend','this month','compared','vs last')){
      if(a.variance){
        const v = a.variance, up = v.totalDelta > 0;
        let s = `${_monthName(v.monthKey)} spending is ${_money(v.currentTotal)}, ${up?'up':'down'} ${_money(Math.abs(v.totalDelta))}${v.totalPct!=null?` (${up?'+':''}${v.totalPct}%)`:''} vs ${_monthName(v.priorKey)}.`;
        if(v.movers && v.movers[0]) s += ` Biggest change: ${v.movers[0].cat} ${v.movers[0].delta>0?'up':'down'} ${_money(Math.abs(v.movers[0].delta))}.`;
        return s;
      }
      return `You spend about ${_money(a.avgExp)}/mo on average across ${a.n} month${a.n>1?'s':''}.`;
    }
    if(has('income','earn','paycheck','salary','make')){
      return a.avgInc > 0
        ? `Your tracked income averages about ${_money(a.avgInc)}/mo across ${a.n} month${a.n>1?'s':''}.`
        : `I don't see income yet — add income keywords in Settings so deposits are counted.`;
    }
    if(has('top','biggest','most','largest','where does','where is my money','categories')){
      if(!a.cats.length) return null;
      const top = a.cats.slice(0, 3).map(c => `${c.cat} (~${_money(c.avg)}/mo)`).join(', ');
      return `Your biggest categories are ${top}.`;
    }
    return null;
  }

  // Summary-screen card (narrative + entry point). '' when no data.
  function cardHTML(){
    const a = _analyze();
    if(!a) return '';
    return `
      <h2 class="sec-hdr">Insights</h2>
      <button type="button" onclick="gbInsights.openInsights()" aria-label="View your insights"
        style="width:100%;text-align:left;background:linear-gradient(155deg,rgba(var(--purple-rgb),0.10),rgba(var(--green-rgb),0.06));border:1px solid rgba(var(--purple-rgb),0.25);border-radius:20px;padding:16px;margin-bottom:14px;cursor:pointer;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span style="font-size:16px;" aria-hidden="true">✨</span>
          <span style="font-family:var(--font-display);font-size:13px;font-weight:800;">What stands out</span>
          <span style="margin-left:auto;color:var(--green);font-size:12px;font-weight:700;font-family:var(--font-display);">View all &rsaquo;</span>
        </div>
        <div style="font-size:13px;color:var(--soft);line-height:1.6;">${esc(_narrative(a))}</div>
        <div style="font-size:10.5px;color:var(--muted);margin-top:8px;">Computed on your device · nothing sent</div>
      </button>`;
  }

  function openInsights(){
    const { summary, items } = generate();
    const toneCol = t => t==='good' ? 'var(--green)' : t==='warn' ? 'var(--amber)' : '#7c4dff';
    const body = document.getElementById('insights-body');
    if(body){
      body.innerHTML =
        (summary ? `<div style="font-size:13.5px;color:var(--soft);line-height:1.6;margin-bottom:14px;">${esc(summary)}</div>` : '')
        + (items.length
            ? items.map(it => `
              <div class="section-card" style="border-left:4px solid ${toneCol(it.tone)};margin-bottom:10px;">
                <div style="display:flex;gap:10px;align-items:flex-start;">
                  <span style="font-size:18px;line-height:1.2;flex-shrink:0;" aria-hidden="true">${it.icon}</span>
                  <div style="flex:1;min-width:0;">
                    <div style="font-size:13.5px;font-weight:700;margin-bottom:3px;">${esc(it.title)}</div>
                    <div style="font-size:12.5px;color:var(--soft);line-height:1.5;">${esc(it.body)}</div>
                  </div>
                </div>
              </div>`).join('')
            : `<div style="text-align:center;color:var(--muted);font-size:13px;padding:24px 4px;">Import some transactions and your insights will appear here.</div>`);
    }
    openModal('modal-insights');
  }

  return { generate, answer, cardHTML, openInsights };
})();
