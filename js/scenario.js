// ════ Greenbar — "What changes if…?" decision analyzer (gbScenario) ════
// Turns the passive cash-flow forecast into a live tradeoff tool: the user
// trims spending and/or changes income, and Greenbar recomputes the
// consequences — projected net, the next 3 months of runway, and the ETA on
// their top goal — instantly, on-device. This is the product's decision wedge:
// not "where your money went," but "what happens if I make this choice."
//
// Pure local math on top of gbForecast.compute() (the median-based baseline) —
// no model, no network. Surfaced from the Cash-Flow Forecast section
// (forecast.js entryHTML) via a "What changes if…?" launcher.
//
// Globals used: _months, sortKeys, gbMoney, esc, openModal, closeModal,
// gbForecast, gbGoals.
const gbScenario = (() => {
  const SPEND_STEP = 25, INCOME_STEP = 100;
  let _cut = 0;     // dollars trimmed from monthly spending (>= 0)
  let _inc = 0;     // change to monthly income (+/-)

  const _money  = n => gbMoney(n);                       // gbMoney abs-es internally
  const _signed = n => (n >= 0 ? '+' : '−') + gbMoney(n);
  const _round  = n => Math.round(Number(n) || 0);

  function _baseline(){ return (typeof gbForecast !== 'undefined' && gbForecast.compute) ? gbForecast.compute() : null; }

  // Top goal by remaining amount (the one a decision most affects).
  function _topGoal(){
    if(typeof gbGoals === 'undefined' || !gbGoals.all) return null;
    const gs = gbGoals.all()
      .map(g => ({ name: g.name, remaining: Math.max(0, (g.target || 0) - (g.saved || 0)) }))
      .filter(g => g.remaining > 0)
      .sort((a, b) => b.remaining - a.remaining);
    return gs[0] || null;
  }

  // Plausible quick cuts seeded from the latest month's top expense categories
  // (~20% trim, rounded) so the levers feel concrete, not abstract.
  function _quickCuts(){
    const keys = (typeof sortKeys === 'function') ? sortKeys(_months) : [];
    if(!keys.length) return [];
    const m = _months[keys[keys.length - 1]];
    return Object.entries(m.expenses || {})
      .filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([cat, amt]) => ({ cat, amt: Math.max(10, Math.round(amt * 0.2 / 5) * 5) }));
  }

  function _results(){
    const f = _baseline();
    if(!f || f.n < 2) return { insufficient: true, n: f ? f.n : 0 };
    const scnSpend  = Math.max(0, f.expectedSpend - _cut);
    const scnIncome = Math.max(0, f.expectedIncome + _inc);
    const baseNet = f.projectedNet;
    const scnNet  = scnIncome - scnSpend;
    const goal = _topGoal();
    const eta = net => (goal && net > 0) ? Math.ceil(goal.remaining / net) : null;
    return {
      f, hasIncome: f.hasIncome, cut: _cut, inc: _inc,
      baseSpend: f.expectedSpend, scnSpend, baseIncome: f.expectedIncome, scnIncome,
      baseNet, scnNet, dNet: scnNet - baseNet, base3: baseNet * 3, scn3: scnNet * 3,
      goal, baseEta: eta(baseNet), scnEta: eta(scnNet)
    };
  }

  // ── controls ──
  function adjustSpend(d){
    const f = _baseline(); if(!f) return;
    _cut = Math.max(0, Math.min(f.expectedSpend, _cut + d));
    render();
  }
  function adjustIncome(d){
    const f = _baseline(); if(!f) return;
    _inc = Math.max(-f.expectedIncome, Math.min(100000, _inc + d));
    render();
  }
  function setCut(amount){ _cut = Math.max(0, _round(amount)); render(); }
  function reset(){ _cut = 0; _inc = 0; render(); }

  function open(){ _cut = 0; _inc = 0; render(); if(typeof openModal === 'function') openModal('modal-scenario'); }
  function goGoals(){ if(typeof closeModal === 'function') closeModal('modal-scenario'); if(typeof gbGoals !== 'undefined' && gbGoals.openGoals) gbGoals.openGoals(); }

  // Launcher embedded in the forecast section.
  function entryHTML(){
    const f = _baseline(); if(!f || f.n < 2) return '';
    return `<button type="button" class="scn-launch" onclick="gbScenario.open()" aria-label="What changes if you adjust spending or income">
      <span aria-hidden="true">&#9878;</span> What changes if…? <span class="scn-launch-sub">run a what-if</span>
    </button>`;
  }

  function _leverHTML(){
    const f = _baseline();
    const cutPct = f.expectedSpend > 0 ? Math.round(_cut / f.expectedSpend * 100) : 0;
    const chips = _quickCuts().map(c =>
      `<button type="button" class="scn-chip" onclick="gbScenario.setCut(${c.amt})">Trim ${esc(c.cat)} ~${_money(c.amt)}</button>`).join('');
    return `
      <div class="scn-lever">
        <div class="scn-lever-top"><span class="scn-lever-lbl">Trim spending</span><span class="scn-lever-val" style="color:${_cut?'var(--green)':'var(--muted)'};">${_cut?'−'+_money(_cut):'$0'}/mo</span></div>
        <div class="scn-stepper">
          <button type="button" class="scn-step" onclick="gbScenario.adjustSpend(${-SPEND_STEP})" aria-label="Trim less" ${_cut<=0?'disabled':''}>&minus;</button>
          <div class="scn-bar"><div class="scn-bar-fill" style="width:${cutPct}%;"></div></div>
          <button type="button" class="scn-step" onclick="gbScenario.adjustSpend(${SPEND_STEP})" aria-label="Trim more" ${_cut>=f.expectedSpend?'disabled':''}>+</button>
        </div>
        ${chips ? `<div class="scn-chips">${chips}</div>` : ''}
      </div>
      <div class="scn-lever">
        <div class="scn-lever-top"><span class="scn-lever-lbl">Change income</span><span class="scn-lever-val" style="color:${_inc>0?'var(--green)':_inc<0?'var(--red)':'var(--muted)'};">${_inc?_signed(_inc):'$0'}/mo</span></div>
        <div class="scn-stepper">
          <button type="button" class="scn-step" onclick="gbScenario.adjustIncome(${-INCOME_STEP})" aria-label="Less income" ${_inc<=-f.expectedIncome?'disabled':''}>&minus;</button>
          <div class="scn-bar"><div class="scn-bar-fill" style="width:${Math.min(100,Math.abs(_inc)/Math.max(1,f.expectedIncome)*100)}%;background:${_inc<0?'var(--red)':'var(--grad-primary)'};"></div></div>
          <button type="button" class="scn-step" onclick="gbScenario.adjustIncome(${INCOME_STEP})" aria-label="More income">+</button>
        </div>
      </div>`;
  }

  function render(){
    const body = document.getElementById('scenario-body'); if(!body) return;
    const r = _results();
    if(r.insufficient){
      body.innerHTML = `<div class="scn-empty">Import a second month and Greenbar can run what-ifs — projecting how a change to spending or income plays out. (${r.n||0} month${r.n===1?'':'s'} so far.)</div>`;
      return;
    }

    const touched = (_cut !== 0 || _inc !== 0);

    // Consequence block. Without income, net isn't meaningful — frame the cut as
    // money freed up instead.
    let out;
    if(!r.hasIncome){
      const freed = _cut;
      out = `<div class="scn-out">
        <div class="scn-head">${_money(r.scnSpend)}<span class="scn-head-sub">/mo spending</span></div>
        <div class="scn-delta" style="color:${freed?'var(--green)':'var(--muted)'};">${freed?`▼ frees ${_money(freed)}/mo · ${_money(freed*3)} over 3 months`:'Adjust a lever to see the impact'}</div>
        <div class="scn-foot">Add income keywords in Settings to project net and goal timing too.</div>
      </div>`;
    } else {
      const col = r.scnNet >= 0 ? 'var(--green)' : 'var(--red)';
      const dCol = r.dNet > 0 ? 'var(--green)' : r.dNet < 0 ? 'var(--red)' : 'var(--muted)';
      const dTxt = r.dNet === 0 ? 'Adjust a lever to see the impact'
        : `${r.dNet>0?'▲':'▼'} ${_money(r.dNet)}/mo vs now · ${_signed(r.scn3)} over 3 months`;
      let goalRow = '';
      if(r.goal){
        const faster = (r.scnEta != null && r.baseEta != null && r.scnEta < r.baseEta);
        const gCol = (r.scnEta != null && r.baseEta != null) ? (r.scnEta < r.baseEta ? 'var(--green)' : r.scnEta > r.baseEta ? 'var(--red)' : 'var(--text)') : 'var(--text)';
        const fmtEta = e => e == null ? '—' : `${e} mo`;
        goalRow = `<div class="scn-row"><span>Reach ${esc(r.goal.name)}</span><span>${fmtEta(r.baseEta)} <span class="scn-arrow">&rarr;</span> <strong style="color:${gCol};">${fmtEta(r.scnEta)}</strong></span></div>`;
      } else {
        goalRow = `<div class="scn-row scn-row-cta"><button type="button" class="link-btn" onclick="gbScenario.goGoals()">Set a goal to see the timeline impact &rarr;</button></div>`;
      }
      out = `<div class="scn-out">
        <div class="scn-head" style="color:${col};">${_signed(r.scnNet)}<span class="scn-head-sub">/mo projected net</span></div>
        <div class="scn-delta" style="color:${dCol};">${dTxt}</div>
        <div class="scn-rows">
          <div class="scn-row"><span>This month's net</span><span>${_signed(r.baseNet)} <span class="scn-arrow">&rarr;</span> <strong style="color:${col};">${_signed(r.scnNet)}</strong></span></div>
          ${goalRow}
        </div>
      </div>`;
    }

    body.innerHTML = `
      <div class="scn-baseline">Now: income ${_money(r.baseIncome)} − spending ${_money(r.baseSpend)} = <strong>${_signed(r.baseNet)}</strong>/mo. Try a change:</div>
      ${_leverHTML()}
      ${out}
      ${touched ? `<div style="text-align:center;"><button type="button" class="link-btn" style="color:var(--muted);" onclick="gbScenario.reset()">Reset</button></div>` : ''}
      <div class="scn-foot" style="text-align:center;margin-top:10px;">A rough projection from your recent months — all computed on your device.</div>`;
  }

  return { open, render, entryHTML, adjustSpend, adjustIncome, setCut, reset, goGoals };
})();
