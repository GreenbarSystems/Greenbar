// ════ Greenbar — "Monthly checkup" guided routine (gbCheckup) ════
// A once-a-month walkthrough that turns the otherwise-separate surfaces into a
// habit:
//   1. Import last month's statement
//   2. Review anything unusual we found
//   3. See your grade and savings rate
//   4. Adjust your budget and goals
//   5. Preview your next 3 months
// On finish it records the checked month and shows a completion streak
// ("You've done your checkup N months in a row"), using the same YYYY-MM
// month-key model the other streaks/badges use.
//
// Globals used: CFG, _months, MN, sortKeys, fmt, esc, saveCFG,
// renderBudgetInputs, renderAll, openModal, closeModal, showToast,
// computeHealthScore, GRADE_EXPLAIN, sumExpenses, summaryCheckCounts,
// savingsSentence (render.js), gbConfidence, gbSuggest, gbGoals, gbForecast,
// gbLoadWizard.
const gbCheckup = (() => {
  const K = 'gb_checkups';   // JSON array of completed month keys (YYYY-MM)
  const STEPS = 5;
  let _step = 1;

  function _read(){ try{ const s = localStorage.getItem(K); const a = s ? JSON.parse(s) : []; return Array.isArray(a) ? a : []; }catch(_){ return []; } }
  function _write(a){ try{ localStorage.setItem(K, JSON.stringify(a)); }catch(_){} }

  function _keys(){ return (typeof sortKeys === 'function' && typeof _months !== 'undefined') ? sortKeys(_months) : []; }
  // The checkup's subject is the most recent month of data.
  function targetMonth(){ const k = _keys(); return k.length ? k[k.length-1] : null; }

  // Month keys are "<MN[m-1]> YYYY" (e.g. "May 2026"), per core.js — step back
  // one calendar month using the same MN table the rest of the app uses.
  function _monthPrev(mk){
    const parts = String(mk).split(' ');
    if(parts.length !== 2 || typeof MN === 'undefined') return '';
    let mi = MN.indexOf(parts[0]); const y = parseInt(parts[1], 10);
    if(mi < 0 || !y) return '';
    mi -= 1;
    return mi < 0 ? `${MN[11]} ${y-1}` : `${MN[mi]} ${y}`;
  }
  // Consecutive months (ending at the latest logged) with a completed checkup.
  function streak(){
    const arr = _read(); if(!arr.length) return 0;
    const set = new Set(arr);
    const sorted = arr.slice().sort();
    let cur = sorted[sorted.length-1], n = 0;
    while(cur && set.has(cur)){ n++; cur = _monthPrev(cur); }
    return n;
  }
  function doneThisMonth(){ const t = targetMonth(); return t ? _read().includes(t) : false; }

  // Show the entry banner whenever there's data to check.
  function shouldShow(){ return targetMonth() !== null; }

  function renderBanner(){
    if(!shouldShow()) return '';
    const st = streak();
    if(doneThisMonth()){
      return `<button type="button" class="plan-cta checkup-done" onclick="gbCheckup.open()" aria-label="Monthly checkup done${st>1?` — ${st} month streak`:''}. Open it again.">
        <span class="plan-cta-ic" aria-hidden="true">&#10003;</span>
        <span class="plan-cta-txt"><strong>Monthly checkup done</strong><span>${st>1?`${st} months in a row — nice work.`:`Reviewed for ${esc(targetMonth())}.`}</span></span>
        <span class="plan-cta-go">Review &rsaquo;</span>
      </button>`;
    }
    return `<button type="button" class="plan-cta" onclick="gbCheckup.open()" aria-label="Start your monthly checkup — five quick steps">
      <span class="plan-cta-ic" aria-hidden="true">&#129658;</span>
      <span class="plan-cta-txt"><strong>Monthly checkup</strong><span>${st?`${st}-month streak &middot; `:''}Five quick steps to stay on track.</span></span>
      <span class="plan-cta-go">Start &rsaquo;</span>
    </button>`;
  }

  function open(){ _step = 1; render(); if(typeof openModal === 'function') openModal('modal-checkup'); }
  function go(s){ _step = s; render(); }
  function close(){ if(typeof closeModal === 'function') closeModal('modal-checkup'); if(typeof renderAll === 'function') renderAll(); }

  // ── step actions ──
  // Importing supersedes the checkup (the import preview is its own sheet), so
  // close first; the user re-opens the checkup once the new month is in.
  function importStatement(){
    if(typeof closeModal === 'function') closeModal('modal-checkup');
    if(typeof gbLoadWizard !== 'undefined' && gbLoadWizard.open){ gbLoadWizard.open(); return; }
    const inp = document.getElementById('csv-input'); if(inp) inp.click();
  }
  function openReview(){ if(typeof gbConfidence !== 'undefined' && gbConfidence.open) gbConfidence.open(); }

  function buildBudget(){
    const c = (typeof gbSuggest !== 'undefined') ? gbSuggest.compute() : { budget:{}, total:0 };
    if(Object.keys(c.budget || {}).length){
      CFG.budget = c.budget;
      if(typeof saveCFG === 'function') saveCFG();
      if(typeof renderBudgetInputs === 'function') renderBudgetInputs();
      if(typeof renderAll === 'function') renderAll();
      if(typeof showToast === 'function') showToast('Budget set from your spending.', 'success');
    }
    render();
  }
  function addGoal(){
    const name = (document.getElementById('checkup-goal-name')?.value || '').trim();
    const target = document.getElementById('checkup-goal-target')?.value || '';
    if(!name || !(parseFloat(target) > 0)){
      if(typeof showToast === 'function') showToast('Name your goal and enter a target above $0.', 'error');
      return;
    }
    if(typeof gbGoals !== 'undefined' && gbGoals.add(name, target)){
      if(typeof renderAll === 'function') renderAll();
      if(typeof showToast === 'function') showToast('Goal added.', 'success');
      render();
    }
  }

  function finish(){
    const t = targetMonth();
    if(t){ const a = _read(); if(!a.includes(t)){ a.push(t); _write(a); } }
    _step = STEPS + 1;          // completion screen
    render();
    if(typeof renderAll === 'function') renderAll();   // refresh the banner underneath
  }

  // ── content helpers ──
  function _hs(){ const t = targetMonth(); return (t && typeof computeHealthScore === 'function') ? computeHealthScore(t) : null; }
  // Reuses summaryCheckCounts() (render.js) so the checkup and the Summary
  // "What to check" card always agree on what needs attention.
  function _checks(){
    const { reviewN, anomN, dupN } = (typeof summaryCheckCounts === 'function') ? summaryCheckCounts() : { reviewN:0, anomN:0, dupN:0 };
    const out = [];
    if(reviewN) out.push({ l:`${reviewN} transaction${reviewN===1?'':'s'} to review`, s:'Low-confidence or uncategorised' });
    if(anomN) out.push({ l:`${anomN} unusual item${anomN===1?'':'s'}`, s:'From your last import' });
    if(dupN) out.push({ l:`${dupN} possible duplicate${dupN===1?'':'s'}`, s:'Same charge close together' });
    return out;
  }

  function render(){
    const body = document.getElementById('checkup-body'); if(!body) return;
    const title = document.getElementById('checkup-title');
    const done = _step > STEPS;
    if(title) title.textContent = done ? 'Checkup complete' : 'Monthly checkup';
    const dots = done ? '' : `<div class="plan-dots">${Array.from({length:STEPS},(_,i)=>{const n=i+1;return `<span class="plan-dot ${n===_step?'on':''}${n<_step?' done':''}"></span>`;}).join('')}</div>`;

    let html;
    if(_step === 1){
      const t = targetMonth();
      html = `<div class="plan-step-lbl">Step 1 of 5 &middot; Import</div>
        <div class="plan-h">Import last month's statement</div>
        <div class="plan-p">You're caught up through <strong>${esc(t || '—')}</strong>. If a newer statement is ready, import it so this checkup covers the latest month.</div>
        <button type="button" class="btn-primary" style="width:100%;" onclick="gbCheckup.go(2)">My data's current — continue &rarr;</button>
        <div style="text-align:center;margin-top:10px;"><button type="button" class="link-btn" onclick="gbCheckup.importStatement()">Import a new statement &rsaquo;</button></div>`;
    } else if(_step === 2){
      const ch = _checks();
      html = `<div class="plan-step-lbl">Step 2 of 5 &middot; Review</div>
        <div class="plan-h">Review anything unusual</div>`
        + (ch.length
          ? `<div class="plan-p">We flagged ${ch.length} thing${ch.length===1?'':'s'} worth a look:</div>
             <div class="check-card" style="margin-bottom:14px;">${ch.map(c=>`<div class="check-row" style="cursor:default;"><span class="check-ic" style="background:rgba(255,165,2,0.16);" aria-hidden="true">&#9888;</span><span class="check-tx"><span class="check-tx-l">${esc(c.l)}</span><span class="check-tx-s">${esc(c.s)}</span></span></div>`).join('')}</div>
             <button type="button" class="btn-primary" style="width:100%;" onclick="gbCheckup.go(3)">I've reviewed these &rarr;</button>
             <div style="text-align:center;margin-top:10px;"><button type="button" class="link-btn" onclick="gbCheckup.openReview()">Open the review queue &rsaquo;</button></div>`
          : `<div class="plan-p">&#10003; Nothing unusual this month — your import looks clean.</div>
             <button type="button" class="btn-primary" style="width:100%;" onclick="gbCheckup.go(3)">Continue &rarr;</button>`);
    } else if(_step === 3){
      const hs = _hs(); const t = targetMonth(); const m = t ? _months[t] : null;
      const income = m ? m.income : 0;
      const exp = (typeof sumExpenses === 'function') ? sumExpenses(m) : 0;
      const net = income - exp;
      const line = (typeof savingsSentence === 'function')
        ? savingsSentence(income, net, t || 'this month')
        : '';
      html = `<div class="plan-step-lbl">Step 3 of 5 &middot; Grade</div>
        <div class="plan-h">Your grade &amp; savings rate</div>
        <div class="checkup-grade">
          <span class="checkup-grade-letter" style="color:${hs ? hs.gradeColor : 'var(--muted)'};">${hs ? hs.grade : '—'}</span>
          <span class="checkup-grade-meta">
            <span class="checkup-grade-score">${hs ? `${hs.score} / 100` : 'No score yet'}</span>
            <span class="plan-p" style="margin:0;">${line}</span>
          </span>
        </div>
        ${hs ? `<div class="plan-p">${esc(GRADE_EXPLAIN[hs.grade] || hs.label || '')}</div>` : ''}
        <button type="button" class="btn-primary" style="width:100%;" onclick="gbCheckup.go(4)">Continue &rarr;</button>`;
    } else if(_step === 4){
      const total = (typeof CFG !== 'undefined' && CFG.budget) ? Object.values(CFG.budget).reduce((s,v)=>s+(v>0?v:0),0) : 0;
      const needBudget = (typeof gbSuggest !== 'undefined' && gbSuggest.shouldShow());
      const goalN = (typeof gbGoals !== 'undefined') ? gbGoals.all().length : 0;
      html = `<div class="plan-step-lbl">Step 4 of 5 &middot; Budget &amp; goals</div>
        <div class="plan-h">Adjust your budget &amp; goals</div>`
        + (needBudget
          ? `<div class="plan-p">You don't have a budget yet — build one from how you actually spend.</div>
             <button type="button" class="btn-primary" style="width:100%;" onclick="gbCheckup.buildBudget()">Build my budget from my spending</button>`
          : `<div class="plan-p">Your budget is <strong>${fmt(total)}/mo</strong>. Fine-tune category targets anytime on the Budget tab.</div>`)
        + `<div class="plan-p" style="margin-top:14px;margin-bottom:8px;">${goalN?`You have <strong>${goalN}</strong> savings goal${goalN===1?'':'s'}. Add another if you like:`:`Set one savings goal to aim for:`}</div>
           <input id="checkup-goal-name" type="text" maxlength="40" placeholder="Goal name (e.g. Emergency fund)" autocomplete="off" class="plan-input">
           <div class="plan-input-money"><span class="plan-input-pre">$</span><input id="checkup-goal-target" type="number" min="1" inputmode="decimal" placeholder="Target amount" autocomplete="off" class="plan-input"></div>
           <button type="button" class="btn-secondary" style="width:100%;margin:0 0 12px;" onclick="gbCheckup.addGoal()">Add this goal</button>
           <button type="button" class="btn-primary" style="width:100%;" onclick="gbCheckup.go(5)">Continue &rarr;</button>`;
    } else if(_step === 5){
      const f = (typeof gbForecast !== 'undefined' && gbForecast.compute) ? gbForecast.compute() : null;
      let fc;
      if(f && f.hasIncome){
        fc = `<div class="plan-fc-net" style="color:${f.projectedNet>=0?'var(--green)':'var(--red)'};">${f.projectedNet>=0?'+':'−'}${fmt(Math.abs(f.projectedNet))}<span class="plan-fc-mo">/mo projected net</span></div>
          <div class="plan-traj">${(f.trajectory||[]).map(t=>`<div class="plan-traj-row"><span>${esc((t.label||'').split(' ')[0])}</span><span style="color:${t.cumulative>=0?'var(--green)':'var(--red)'};">${t.cumulative>=0?'+':'−'}${fmt(Math.abs(t.cumulative))}</span></div>`).join('')}</div>
          <div class="plan-p" style="margin:8px 0 0;">Cumulative net if this pace holds.</div>`;
      } else if(f){
        fc = `<div class="plan-p" style="margin:0;">Expected spending about <strong>${fmt(f.expectedSpend)}/mo</strong>. Add income keywords in Settings to project your net too.</div>`;
      } else {
        fc = `<div class="plan-p" style="margin:0;">Import another month and your forecast will appear here.</div>`;
      }
      html = `<div class="plan-step-lbl">Step 5 of 5 &middot; Forecast</div>
        <div class="plan-h">Preview your next 3 months</div>
        <div class="plan-fc">${fc}</div>
        <button type="button" class="btn-primary" style="width:100%;" onclick="gbCheckup.finish()">Finish checkup &#10003;</button>`;
    } else {
      // completion
      const st = streak();
      html = `<div style="text-align:center;padding:4px 0 2px;">
        <div class="checkup-celebrate" aria-hidden="true">&#10003;</div>
        <div class="plan-h" style="font-size:21px;text-align:center;">Checkup complete!</div>
        <div class="checkup-streak-num">${st}</div>
        <div class="plan-p" style="text-align:center;">${st>1?`You've done your checkup <strong>${st} months in a row</strong> — keep the streak alive.`:`That's your first checkup logged. Come back next month to start a streak.`}</div>
        <button type="button" class="btn-primary" style="width:100%;" onclick="gbCheckup.close()">Done</button>
      </div>`;
    }

    body.innerHTML = dots + html + (done ? '' : `<div style="text-align:center;margin-top:8px;"><button type="button" class="link-btn" style="color:var(--muted);" onclick="gbCheckup.close()">Close</button></div>`);
  }

  return { shouldShow, renderBanner, open, go, close, render, importStatement, openReview, buildBudget, addGoal, finish, streak, doneThisMonth, targetMonth };
})();
