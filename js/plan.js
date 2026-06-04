// ════ Greenbar — "Make a plan" guided flow (gbPlan) ════
// Ties the four otherwise-separate surfaces into one linear loop so a normal user
// connects them: build a budget from real spending (gbSuggest) → set one savings
// goal and see its ETA (gbGoals + forecast) → see the projected next 3 months
// (gbForecast). The closed loop is then reflected on Summary as Plan score /
// Budget / Goals. Shown after a few months of data, once (gb_plan_done).
//
// Globals used: CFG, _months, sortKeys, fmt, esc, saveCFG, renderBudgetInputs,
// renderAll, openModal, closeModal, showToast, analyticsUnlocked, gbSuggest,
// gbGoals, gbForecast.
const gbPlan = (() => {
  const K_DONE = 'gb_plan_done', K_DISMISS = 'gb_plan_dismissed';
  let _step = 1, _goalEta = null, _goalName = '';

  function _months_n(){ return (typeof sortKeys === 'function' && typeof _months !== 'undefined') ? sortKeys(_months).length : 0; }

  // Offer the flow once the user is engaged: unlocked (real import + seen a
  // Summary) and at least two months of data so budget/forecast are meaningful.
  function shouldShow(){
    try{ if(localStorage.getItem(K_DONE) === '1' || localStorage.getItem(K_DISMISS) === '1') return false; }catch(_){}
    if(typeof analyticsUnlocked === 'function' && !analyticsUnlocked()) return false;
    return _months_n() >= 2;
  }

  // Summary banner that launches the flow.
  function renderBanner(){
    if(!shouldShow()) return '';
    return `<button type="button" class="plan-cta" onclick="gbPlan.open()" aria-label="Make a plan — build a budget, set a goal, see your forecast">
      <span class="plan-cta-ic" aria-hidden="true">&#9733;</span>
      <span class="plan-cta-txt"><strong>Make a plan</strong><span>Build a budget, set a goal, see your forecast — about a minute.</span></span>
      <span class="plan-cta-go" aria-hidden="true">Start &rsaquo;</span>
    </button>`;
  }

  function open(){ _step = 1; _goalEta = null; render(); if(typeof openModal === 'function') openModal('modal-plan'); }
  function go(step){ _step = step; render(); }

  function _suggestion(){ return (typeof gbSuggest !== 'undefined') ? gbSuggest.compute() : { budget:{}, total:0, months:0 }; }
  function _budgetTotal(){ return (typeof CFG !== 'undefined' && CFG.budget) ? Object.values(CFG.budget).reduce((s,v)=>s+(v>0?v:0),0) : 0; }

  // Step 1 — build the budget from spending (no navigation, stay in the flow).
  function buildBudget(){
    const c = _suggestion();
    if(Object.keys(c.budget).length){
      CFG.budget = c.budget;
      if(typeof saveCFG === 'function') saveCFG();
      if(typeof renderBudgetInputs === 'function') renderBudgetInputs();
      if(typeof renderAll === 'function') renderAll();
      if(typeof showToast === 'function') showToast('Budget set from your spending.', 'success');
    }
    go(2);
  }

  // Step 2 — set one goal, then derive the ETA from the forecast's projected net.
  function saveGoal(){
    const name = (document.getElementById('plan-goal-name')?.value || '').trim();
    const target = document.getElementById('plan-goal-target')?.value || '';
    if(!name || !(parseFloat(target) > 0)){
      if(typeof showToast === 'function') showToast('Name your goal and enter a target above $0.', 'error');
      return;
    }
    if(typeof gbGoals !== 'undefined' && gbGoals.add(name, target)){
      _goalName = name;
      const remaining = Math.round(parseFloat(target));
      const net = (typeof gbForecast !== 'undefined' && gbForecast.compute) ? ((gbForecast.compute() || {}).projectedNet) : null;
      _goalEta = (remaining > 0 && net && net > 0) ? { months: Math.ceil(remaining / net), perMonth: net } : null;
      go(3);
    }
  }

  function finish(){
    try{ localStorage.setItem(K_DONE, '1'); }catch(_){}
    if(typeof closeModal === 'function') closeModal('modal-plan');
    if(typeof renderAll === 'function') renderAll();
    if(typeof showToast === 'function') showToast('Your plan is set — track it on the Summary.', 'success');
  }
  function dismiss(){
    try{ localStorage.setItem(K_DISMISS, '1'); }catch(_){}
    if(typeof closeModal === 'function') closeModal('modal-plan');
    if(typeof renderAll === 'function') renderAll();
  }

  function render(){
    const body = document.getElementById('plan-body'); if(!body) return;
    const title = document.getElementById('plan-title');
    const dots = `<div class="plan-dots">${[1,2,3].map(i => `<span class="plan-dot ${i===_step?'on':''}${i<_step?' done':''}"></span>`).join('')}</div>`;

    if(_step === 1){
      if(title) title.textContent = 'Make a plan';
      const c = _suggestion();
      const n = Object.keys(c.budget).length;
      const suggestible = (typeof gbSuggest !== 'undefined' && gbSuggest.shouldShow()) && n > 0;
      body.innerHTML = dots + (suggestible
        ? `<div class="plan-step-lbl">Step 1 of 3 · Budget</div>
           <div class="plan-h">Build a budget from how you actually spend</div>
           <div class="plan-p">From your ${c.months} month${c.months===1?'':'s'} of data, Greenbar can set <strong>${n} category targets</strong> totalling <strong>${fmt(c.total)}/mo</strong> — fine-tune any later.</div>
           <button type="button" class="btn-primary" style="width:100%;" onclick="gbPlan.buildBudget()">Build my budget from my spending</button>
           <div style="text-align:center;margin-top:10px;"><button type="button" class="link-btn" onclick="gbPlan.go(2)">I'll set it later &rsaquo;</button></div>`
        : `<div class="plan-step-lbl">Step 1 of 3 · Budget</div>
           <div class="plan-h">Your budget's set &#10003;</div>
           <div class="plan-p">You already have budget targets (${fmt(_budgetTotal())}/mo). On to your savings goal.</div>
           <button type="button" class="btn-primary" style="width:100%;" onclick="gbPlan.go(2)">Next: set a goal &rarr;</button>`)
        + `<div style="text-align:center;margin-top:6px;"><button type="button" class="link-btn" style="color:var(--muted);" onclick="gbPlan.dismiss()">Maybe later</button></div>`;
    } else if(_step === 2){
      if(title) title.textContent = 'Make a plan';
      body.innerHTML = dots + `
        <div class="plan-step-lbl">Step 2 of 3 · Goal</div>
        <div class="plan-h">Set one simple savings goal</div>
        <div class="plan-p">We'll show your ETA from your forecast pace.</div>
        <input id="plan-goal-name" type="text" maxlength="40" placeholder="e.g. Emergency fund" autocomplete="off" class="plan-input">
        <div class="plan-input-money"><span class="plan-input-pre">$</span><input id="plan-goal-target" type="number" min="1" inputmode="decimal" placeholder="Target amount" autocomplete="off" class="plan-input"></div>
        <button type="button" class="btn-primary" style="width:100%;" onclick="gbPlan.saveGoal()">Set goal &amp; show ETA</button>
        <div style="text-align:center;margin-top:10px;"><button type="button" class="link-btn" onclick="gbPlan.go(3)">Skip for now &rsaquo;</button></div>`;
    } else {
      if(title) title.textContent = 'Make a plan';
      const f = (typeof gbForecast !== 'undefined' && gbForecast.compute) ? gbForecast.compute() : null;
      const etaHtml = _goalEta
        ? `<div class="plan-eta">At about <strong>${fmt(_goalEta.perMonth)}/mo</strong>, you'll reach <strong>${esc(_goalName)}</strong> in roughly <strong>${_goalEta.months} month${_goalEta.months===1?'':'s'}</strong>.</div>`
        : '';
      let fcHtml;
      if(f && f.hasIncome){
        fcHtml = `<div class="plan-fc-net" style="color:${f.projectedNet>=0?'var(--green)':'var(--red)'};">${f.projectedNet>=0?'+':'−'}${fmt(Math.abs(f.projectedNet))}<span class="plan-fc-mo">/mo projected net</span></div>
          <div class="plan-traj">${f.trajectory.map(t => `<div class="plan-traj-row"><span>${esc((t.label||'').split(' ')[0])}</span><span style="color:${t.cumulative>=0?'var(--green)':'var(--red)'};">${t.cumulative>=0?'+':'−'}${fmt(Math.abs(t.cumulative))}</span></div>`).join('')}</div>
          <div class="plan-p" style="margin-top:8px;">Cumulative net if this pace holds.</div>`;
      } else if(f){
        fcHtml = `<div class="plan-p">Expected spending about <strong>${fmt(f.expectedSpend)}/mo</strong>. Add income keywords in Settings to project your net too.</div>`;
      } else {
        fcHtml = `<div class="plan-p">Import another month and your forecast will appear here.</div>`;
      }
      body.innerHTML = dots + `
        <div class="plan-step-lbl">Step 3 of 3 · Forecast</div>
        <div class="plan-h">Your projected next 3 months</div>
        ${etaHtml}
        <div class="plan-fc">${fcHtml}</div>
        <button type="button" class="btn-primary" style="width:100%;margin-top:4px;" onclick="gbPlan.finish()">Done — show my plan</button>`;
    }
  }

  return { shouldShow, renderBanner, open, go, buildBudget, saveGoal, finish, dismiss, render };
})();
