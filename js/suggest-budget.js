// ════ Greenbar — suggested budget from actuals ════
// After a user has imported data but is still on the seeded DEFAULTS budget
// (never ran the wizard, applied a suggestion, or hand-edited targets), offer a
// one-tap budget built from their real average spend. Surfaced as a card on the
// Summary screen (render.js calls gbSuggest.cardHTML() behind a typeof guard).
//
// Globals used (all defined by load time): CFG, DEFAULTS, _months, sortKeys,
// fmt, saveCFG, renderBudgetInputs, renderAll, showScreen, showToast.

// Algorithm design notes:
//   - Average across ALL tracked months (sum / n), not median. Simpler;
//     the user reviews the result and can edit any line in Settings.
//     Tradeoff: under-budgets infrequent categories (Travel, annual
//     insurance) where the per-event spend is larger than the per-month
//     average. Worth revisiting if users complain that suggested
//     Travel/Insurance lines feel too tight.
//   - Tiered rounding ($5 / $10 / $25 step) makes the result feel like a
//     human-picked number, not an arithmetic mean.
//   - MIN_BUDGET = 10 floor drops categories whose average is below $10
//     so the user isn't asked to track every $3/mo subscription.

const gbSuggest = (() => {
  const K_DISMISS = 'gb_budget_suggest_dismissed';
  const MIN_CATS = 3;     // need at least this many real categories to be useful
  const MIN_BUDGET = 10;  // drop trivially small categories (enforced by the
                          // filter in compute() — _roundBudget intentionally
                          // does NOT floor at MIN_BUDGET so the filter can
                          // see and discard the rounded-low values).

  // Round a raw monthly average to a friendly budget number. Returns 0 for
  // non-positive inputs; otherwise rounds to nearest $5 / $10 / $25 depending
  // on magnitude. Callers must enforce their own minimum-acceptable-budget
  // floor (compute() uses MIN_BUDGET) — _roundBudget does not.
  function _roundBudget(v){
    if(v <= 0) return 0;
    if(v < 50)  return Math.round(v / 5) * 5;    // small -> nearest $5
    if(v < 500) return Math.round(v / 10) * 10;  // mid   -> nearest $10
    return Math.round(v / 25) * 25;              // large -> nearest $25
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

  // Whether the suggestion is currently offerable (still on default budget, has
  // data, enough real categories). Exposed so the import flow can route the user
  // straight to the Budget screen — where this card is pinned at the top — only
  // when there's actually a suggestion to make.
  function shouldShow(){ return _shouldShow(); }

  // Card markup, or '' when it shouldn't show. Pinned at the top of the Budget
  // screen (and shown on Summary): full-width, distinct green accent border, and
  // a single large primary CTA so it's impossible to miss. Inlined styles only —
  // no new CSS.
  //
  // Short-circuits the cheap localStorage / object-equality checks BEFORE
  // calling compute() — dismissed users, personalized users, and pre-data
  // users used to pay for a full per-category aggregation on every Summary
  // render, even though the card never rendered.
  function cardHTML(){
    if(localStorage.getItem(K_DISMISS) === '1') return '';
    if(!_budgetIsDefault()) return '';
    if(!sortKeys(_months).length) return '';
    const c = compute();
    if(Object.keys(c.budget).length < MIN_CATS) return '';
    const { total, months } = c;
    const n = Object.keys(c.budget).length;
    return `
      <div class="g-card" style="padding:20px 18px;margin:0 0 16px;background:linear-gradient(155deg,rgba(var(--green-rgb),0.14),rgba(var(--blue-rgb),0.06));border:2px solid var(--green);border-radius:20px;">
        <div style="font-family:var(--font-display);font-size:17px;font-weight:900;letter-spacing:-0.3px;margin-bottom:6px;">Build your budget from your spending</div>
        <div style="font-size:13px;color:var(--soft);line-height:1.6;margin-bottom:14px;">From the ${months} month${months===1?'':'s'} you've imported, Greenbar can set <strong>${n} category targets</strong> totalling <strong>${fmt(total)}/mo</strong> based on what you actually spent — fine-tune any of them later.</div>
        <button type="button" class="btn-primary" style="width:100%;padding:15px;font-size:15px;font-weight:900;" onclick="gbSuggest.apply()">Build my budget from my actual spending</button>
        <div style="text-align:center;margin-top:10px;"><button type="button" onclick="gbSuggest.dismiss()" class="link-btn" style="color:var(--muted);">Not now</button></div>
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
      // _navBtn(1) is the canonical pattern used elsewhere (core.js, boot.js,
      // features.js) for "the nth bottom-nav button" — same DOM query, single
      // source of truth so a future scoping change (e.g., restricting the
      // selector to inside #bottom-nav) reaches every consumer.
      if(typeof showScreen === 'function' && typeof _navBtn === 'function'){
        showScreen('budget', _navBtn(1));
      }
    }catch(e){ showToast(e.message, 'error'); }
  }

  function dismiss(){
    safeSetLocal(K_DISMISS, '1');
    renderAll();
    showToast('No problem — set targets anytime in Settings.', 'success');
  }

  return { compute, cardHTML, apply, dismiss, shouldShow };
})();
