// ════ Greenbar — suggested budget from actuals ════
// After a user has imported data but is still on the seeded DEFAULTS budget
// (never ran the wizard, applied a suggestion, or hand-edited targets), offer a
// one-tap budget built from their real average spend. Surfaced as a card on the
// Summary screen (render.js calls gbSuggest.cardHTML() behind a typeof guard).
//
// Globals used (all defined by load time): CFG, DEFAULTS, _months, sortKeys,
// fmt, saveCFG, renderBudgetInputs, renderAll, showScreen, showToast.

const gbSuggest = (() => {
  const K_DISMISS = 'gb_budget_suggest_dismissed';
  const MIN_CATS = 3;     // need at least this many real categories to be useful
  const MIN_BUDGET = 10;  // drop trivially small categories from the suggestion

  // Round a raw monthly average to a friendly budget number.
  function _roundBudget(v){
    if(v <= 0) return 0;
    if(v < 50)  return Math.max(MIN_BUDGET, Math.round(v / 5) * 5);  // small -> nearest $5
    if(v < 500) return Math.round(v / 10) * 10;                       // mid   -> nearest $10
    return Math.round(v / 25) * 25;                                   // large -> nearest $25
  }

  // True only while the user is still on the seeded DEFAULTS budget — i.e. they
  // haven't personalized it via the wizard, a prior suggestion, or Settings.
  function _budgetIsDefault(){
    const b = (CFG && CFG.budget) || {}, d = (DEFAULTS && DEFAULTS.budget) || {};
    const bk = Object.keys(b), dk = Object.keys(d);
    if(bk.length !== dk.length) return false;
    for(const k of dk){ if(b[k] !== d[k]) return false; }
    return true;
  }

  // Average monthly spend per category across all tracked months -> rounded
  // budget targets. Returns { budget, total, months }.
  function compute(){
    const keys = sortKeys(_months);
    const n = keys.length;
    if(!n) return { budget: {}, total: 0, months: 0 };
    const totals = {};
    for(const mk of keys){
      for(const [cat, v] of Object.entries(_months[mk].expenses || {})){
        if(cat === '_income') continue;
        if(v > 0) totals[cat] = (totals[cat] || 0) + v;
      }
    }
    const budget = {};
    for(const [cat, sum] of Object.entries(totals)){
      const r = _roundBudget(sum / n);
      if(r >= MIN_BUDGET) budget[cat] = r;
    }
    const total = Object.values(budget).reduce((s, v) => s + v, 0);
    return { budget, total, months: n };
  }

  function _shouldShow(c){
    if(localStorage.getItem(K_DISMISS) === '1') return false;
    if(!_budgetIsDefault()) return false;          // already personalized
    if(!sortKeys(_months).length) return false;    // no data yet
    return Object.keys((c || compute()).budget).length >= MIN_CATS;
  }

  // Card markup, or '' when it shouldn't show. Inlined styles match the app's
  // existing CTA-card look (no new CSS needed). compute() once and reuse.
  function cardHTML(){
    const c = compute();
    if(!_shouldShow(c)) return '';
    const { total, months } = c;
    const n = Object.keys(c.budget).length;
    return `
      <div class="g-card" style="padding:16px 18px;margin-bottom:12px;background:linear-gradient(155deg,rgba(0,214,143,0.08),rgba(41,121,255,0.05));border:1px solid rgba(0,214,143,0.2);">
        <div style="font-family:var(--font-display);font-size:15px;font-weight:900;margin-bottom:4px;">Build your budget in one tap</div>
        <div style="font-size:12.5px;color:var(--soft);line-height:1.6;margin-bottom:12px;">Based on the ${months} month${months===1?'':'s'} you've imported, Greenbar can set <strong>${n} category targets</strong> totalling <strong>${fmt(total)}/mo</strong> from what you actually spent. Fine-tune any of them in Settings.</div>
        <button type="button" class="btn-primary" onclick="gbSuggest.apply()">Use suggested budget</button>
        <div style="text-align:center;margin-top:10px;"><button type="button" onclick="gbSuggest.dismiss()" class="link-btn" style="color:var(--muted);">No thanks</button></div>
      </div>`;
  }

  function apply(){
    try{
      const { budget } = compute();
      if(!Object.keys(budget).length){ showToast('Not enough data to suggest a budget yet.', 'error'); return; }
      CFG.budget = budget;                 // budget is now personalized -> card stops showing
      saveCFG();
      if(typeof renderBudgetInputs === 'function') renderBudgetInputs(); // refresh Settings list
      renderAll();
      showToast('Budget set from your spending. Adjust any target in Settings.', 'success');
      // Jump to the Budget screen so they see targets vs actual immediately.
      if(typeof showScreen === 'function'){
        const budgetNav = document.querySelectorAll('.nav-btn')[1];
        showScreen('budget', budgetNav);
      }
    }catch(e){ showToast(e.message, 'error'); }
  }

  function dismiss(){
    try{ localStorage.setItem(K_DISMISS, '1'); }catch(_){ }
    renderAll();
    showToast('No problem — set targets anytime in Settings.', 'success');
  }

  return { compute, cardHTML, apply, dismiss };
})();
