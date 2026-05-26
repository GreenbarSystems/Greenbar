// ════ Greenbar — render: every render* function + drill modals ════
// Depends on state.js + core.js (util, storage, sortKeys, sumExpenses, esc, fmt).

// ──────── Palette + grade explanation lookup ────────
const PAL=['#00d68f','#2979ff','#00c9b1','#ffa502','#ff4757','#7c4dff','#ff6b81','#1de9b6','#ff9f43','#5352ed','#26de81','#4bcffa','#fd9644','#a55eea','#45aaf2'];

// ════ RENDER ════
function renderAll(){
  renderSummary();
  // Only render other screens if they're currently active (lazy)
  if(document.getElementById('screen-budget')?.classList.contains('active')) renderBudget();
  if(document.getElementById('screen-txs')?.classList.contains('active')) renderTxs();
}

// Brief one-line explanation shown under the health-score grade.
const GRADE_EXPLAIN = {
  A:'Excellent — strong savings with spending on plan.',
  B:'Great — a solid month with minor overspending.',
  C:'Good — on track, with room to tighten up.',
  D:'Fair — spending is outpacing your budget.',
  F:'Needs work — expenses ran past your income.'
};

// ──────── Health score: compute + breakdown modal ────────
// ════ GAMIFICATION ════

// ── Feature 1: Financial Health Score ──
function computeHealthScore(monthKey){
  const m = _months[monthKey];
  if(!m) return null;
  const expTotal = sumExpenses(m);
  const income = m.income;
  if(income <= 0) return null;

  let score = 0;
  const details = {};

  // 1. Savings rate (0–40 pts)
  // 20%+ = 40pts, 10% = 28pts, 0% = 0pts; deficits scale down and clamp to 0.
  // One continuous line below 20% -- no jump at the break-even point.
  const savingsRate = (income - expTotal) / income;
  const savePts = savingsRate >= 0.20 ? 40
    : savingsRate >= 0.10 ? Math.round(28 + (savingsRate - 0.10)/0.10 * 12)
    : Math.round(savingsRate / 0.10 * 28);
  score += Math.max(0, savePts);
  details.savePts = Math.max(0, savePts);
  details.savingsRate = savingsRate;

  // 2. Budget adherence (0–40 pts)
  // For each budgeted category, score how close spending is to target
  const budgetCats = Object.keys(CFG.budget).filter(k => CFG.budget[k] > 0);
  if(budgetCats.length > 0){
    let budgetScore = 0;
    let counted = 0;
    for(const cat of budgetCats){
      const actual = m.expenses[cat] || 0;
      const target = CFG.budget[cat];
      if(target <= 0) continue;
      const ratio = actual / target;
      // Under by up to 10% = perfect (1.0), over by 50%+ = 0
      const catScore = ratio <= 1.1 ? 1.0
        : ratio <= 1.25 ? 0.7
        : ratio <= 1.5  ? 0.4
        : 0;
      budgetScore += catScore;
      counted++;
    }
    const budPts = counted > 0 ? Math.round((budgetScore / counted) * 40) : 20; // 20 if no budget set
    score += budPts;
    details.budPts = budPts;
    details.budgetCoverage = counted;
  } else {
    score += 20; // no budget set -- neutral
    details.budPts = 20;
  }

  // 3. Spending diversity (0–20 pts)
  // Having 5+ distinct categories = max points (shows balanced tracking)
  const catCount = Object.keys(m.expenses).filter(k => m.expenses[k] > 5).length;
  const divPts = Math.min(20, Math.round(catCount / 5 * 20));
  score += divPts;
  details.divPts = divPts;

  score = Math.min(100, Math.max(0, score));
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
  const gradeColor = score >= 80 ? '#00d68f' : score >= 60 ? '#ffa502' : '#ff4757';
  const label = score >= 90 ? 'Excellent' : score >= 80 ? 'Great' : score >= 70 ? 'Good' : score >= 60 ? 'Fair' : 'Needs Work';

  return { score, grade, gradeColor, label, details };
}

// ── Health-grade breakdown modal ──
// Opens modal-health and fills it with a per-component explanation of the
// grade for the currently-selected month. Only callable when a real month
// is selected (the All view doesn't have a grade); the tile is disabled
// otherwise so this should never be entered without a valid score.
function openHealthBreakdown(){
  const mk = (typeof _sel==='string' && _sel && _sel!=='__all') ? _sel : null;
  if(!mk) return;
  const hs = computeHealthScore(mk);
  if(!hs) return;
  const body = document.getElementById('health-body');
  const title = document.getElementById('health-title');
  if(title) title.textContent = `Grade ${hs.grade} — ${mk}`;
  if(body)  body.innerHTML = renderHealthBreakdown(hs, mk);
  openModal('modal-health');
}

// Build the breakdown HTML. Three sections matching computeHealthScore():
// savings rate (40 pts), budget adherence (40 pts), tracking diversity (20 pts).
function renderHealthBreakdown(hs, monthKey){
  const m = _months[monthKey];
  const income = m.income;
  const expTotal = sumExpenses(m);
  const savePct = Math.round(hs.details.savingsRate * 100);

  // Per-category budget table -- shown if the user has any budget rows
  const budgetCats = Object.keys(CFG.budget||{}).filter(k => CFG.budget[k] > 0);
  let budgetRowsHtml = '';
  if(budgetCats.length){
    const rows = budgetCats.map(cat=>{
      const actual = m.expenses[cat] || 0;
      const target = CFG.budget[cat];
      const ratio  = actual / target;
      const pct    = Math.round(ratio * 100);
      const status = ratio <= 1.1 ? {txt:'On track', col:'#00d68f'}
                   : ratio <= 1.25 ? {txt:'Slightly over', col:'#ffa502'}
                   : ratio <= 1.5  ? {txt:'Over', col:'#ffa502'}
                   :                 {txt:'Way over', col:'#ff4757'};
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px;">
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(cat)}</span>
        <span style="color:var(--muted);font-size:12px;margin:0 10px;flex-shrink:0;">${fmt(actual)} / ${fmt(target)} <span style="opacity:0.7;">(${pct}%)</span></span>
        <span style="color:${status.col};font-weight:700;font-size:12px;flex-shrink:0;">${status.txt}</span>
      </div>`;
    }).join('');
    budgetRowsHtml = `<div style="margin-top:8px;">${rows}</div>`;
  } else {
    budgetRowsHtml = `<div style="font-size:12px;color:var(--muted);margin-top:6px;">No budget set for any category. Setting budgets unlocks the full 40 points here.</div>`;
  }

  // What's driving the grade -- pick the weakest component for a "next step" hint
  const components = [
    { key:'savings',  pts:hs.details.savePts, max:40, label:'Savings rate' },
    { key:'budget',   pts:hs.details.budPts,  max:40, label:'Budget adherence' },
    { key:'tracking', pts:hs.details.divPts,  max:20, label:'Tracking diversity' },
  ];
  // Weakest = lowest pts/max ratio
  const weakest = components.slice().sort((a,b)=> (a.pts/a.max) - (b.pts/b.max))[0];
  const nextStepCopy = {
    savings:  savePct < 0 ? 'You spent more than you earned this month. Trimming the biggest categories would lift this fastest.'
            : savePct < 10 ? `You saved ${savePct}% of income. Pushing toward 20% unlocks the full 40 points here.`
            : savePct < 20 ? `You saved ${savePct}% — close to the 20% target that maxes this out.`
            :                `You saved ${savePct}% of income — this component is already maxed out.`,
    budget:   budgetCats.length === 0
              ? 'You have no budgets set. Add a few in the Budget tab — even rough numbers count.'
              : 'Spending in budgeted categories was further over target than ideal. Tighten the categories above marked "Over" or "Way over".',
    tracking: `${Object.keys(m.expenses).filter(k=>m.expenses[k]>5).length} categories had real spend this month. Maxes out at 5+.`,
  }[weakest.key];

  const savingsBarPct  = Math.round(hs.details.savePts / 40 * 100);
  const budgetBarPct   = Math.round(hs.details.budPts  / 40 * 100);
  const trackingBarPct = Math.round(hs.details.divPts  / 20 * 100);

  // Component card helper. Each card shows the label, points, a progress bar and an explanation.
  const card = (label, pts, max, barPct, barColor, explainHtml) => `
    <div style="background:var(--glass);border:1px solid var(--border);border-radius:16px;padding:14px 14px;margin-bottom:10px;">
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px;">
        <div style="font-family:var(--font-display);font-size:14px;font-weight:800;">${label}</div>
        <div style="font-family:var(--font-display);font-size:14px;font-weight:900;color:${barColor};">${pts}<span style="color:var(--muted);font-weight:700;">/${max}</span></div>
      </div>
      <div style="height:6px;background:rgba(255,255,255,0.07);border-radius:4px;overflow:hidden;margin-bottom:10px;">
        <div style="height:100%;width:${barPct}%;background:${barColor};border-radius:4px;"></div>
      </div>
      <div style="font-size:12.5px;color:var(--soft);line-height:1.5;">${explainHtml}</div>
    </div>`;

  return `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;">
      <div style="width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.04);border:2px solid ${hs.gradeColor};flex-shrink:0;">
        <div style="font-family:var(--font-display);font-size:30px;font-weight:900;color:${hs.gradeColor};line-height:1;">${hs.grade}</div>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-family:var(--font-display);font-size:22px;font-weight:900;color:${hs.gradeColor};">${hs.score}<span style="color:var(--muted);font-size:14px;font-weight:700;">/100</span></div>
        <div style="font-size:13px;color:var(--soft);">${esc(hs.label)} &middot; ${monthKey}</div>
      </div>
    </div>

    ${card('Savings rate', hs.details.savePts, 40, savingsBarPct, hs.gradeColor,
      `Income ${fmt(income)} &minus; spend ${fmt(expTotal)} = <strong>${savePct >= 0 ? `${savePct}% saved` : `${Math.abs(savePct)}% over income`}</strong>. Full 40 points at 20%+ saved; partial credit below that; 0 if you spent more than you earned.`)}

    ${card('Budget adherence', hs.details.budPts, 40, budgetBarPct, '#2979ff',
      `${budgetCats.length ? `How close each budgeted category was to its target. Up to 10% over still counts as on-track.` : 'Neutral 20/40 awarded because no budgets are set yet.'}${budgetRowsHtml}`)}

    ${card('Tracking diversity', hs.details.divPts, 20, trackingBarPct, '#7c4dff',
      `<strong>${Object.keys(m.expenses).filter(k=>m.expenses[k]>5).length}</strong> categories had real spend this month (over $5). Reaches the full 20 points at 5+ categories — rewards balanced tracking rather than lumping everything into one bucket.`)}

    <div style="background:rgba(0,214,143,0.07);border:1px solid rgba(0,214,143,0.25);border-radius:14px;padding:12px 14px;margin-top:6px;">
      <div style="font-family:var(--font-display);font-size:12px;font-weight:800;color:var(--green);letter-spacing:0.04em;text-transform:uppercase;margin-bottom:4px;">Biggest lever</div>
      <div style="font-size:13px;color:var(--soft);line-height:1.5;">${esc(nextStepCopy)}</div>
    </div>
  `;
}


// ──────── Streaks + badges ────────
function computeStreaks(){
  const keys = sortKeys(_months);
  if(!keys.length) return { posStreak: 0, budgetStreak: 0, totalMonths: 0, badges: [] };

  let posStreak = 0, maxPosStreak = 0;
  let budgetStreak = 0, maxBudgetStreak = 0;
  let totalPositive = 0;

  for(const mk of keys){
    const m = _months[mk];
    const expTotal = sumExpenses(m);
    const net = m.income - expTotal;
    const isPos = net >= 0;
    const isBudget = isBudgetMonth(mk);

    if(isPos){ posStreak++; maxPosStreak = Math.max(maxPosStreak, posStreak); totalPositive++; }
    else posStreak = 0;

    if(isBudget){ budgetStreak++; maxBudgetStreak = Math.max(maxBudgetStreak, budgetStreak); }
    else budgetStreak = 0;
  }

  // Current streaks (last consecutive from end)
  let curPosStreak = 0, curBudgetStreak = 0;
  for(let i = keys.length-1; i >= 0; i--){
    const m = _months[keys[i]];
    const expTotal = sumExpenses(m);
    if(m.income - expTotal >= 0) curPosStreak++;
    else break;
  }
  for(let i = keys.length-1; i >= 0; i--){
    if(isBudgetMonth(keys[i])) curBudgetStreak++;
    else break;
  }

  const badges = computeBadges(keys, curPosStreak, curBudgetStreak, maxPosStreak, maxBudgetStreak, totalPositive);
  return { curPosStreak, curBudgetStreak, maxPosStreak, maxBudgetStreak, totalMonths: keys.length, totalPositive, badges };
}

function isBudgetMonth(mk){
  const m = _months[mk];
  if(!m) return false;
  const budgetCats = Object.keys(CFG.budget).filter(k => CFG.budget[k] > 0);
  if(!budgetCats.length) return true; // no budget set -- give benefit of doubt
  let overCount = 0;
  for(const cat of budgetCats){
    const actual = m.expenses[cat] || 0;
    if(actual > CFG.budget[cat] * 1.1) overCount++;
  }
  return overCount === 0;
}

function computeBadges(keys, curPos, curBudget, maxPos, maxBudget, totalPos){
  const badges = [];
  const total = keys.length;

  // Streak badges
  if(curPos >= 1)  badges.push({ label:'On a Roll',     desc:`${curPos} positive month${curPos>1?'s':''} in a row`,    earned:true });
  if(curPos >= 3)  badges.push({ label:'Momentum',       desc:`3+ consecutive positive months`,                          earned:true });
  if(curBudget>=2) badges.push({ label:'Budget Streak',  desc:`${curBudget} months in a row under budget`,               earned:true });

  // Achievement badges
  if(total >= 1)   badges.push({ label:'First Month',    desc:'Imported your first month of transactions',               earned:true });
  if(total >= 3)   badges.push({ label:'Quarter Done',   desc:'Tracking 3+ months of spending',                         earned:true });
  if(total >= 6)   badges.push({ label:'Half Year',      desc:'6 months of consistent tracking',                        earned:true });
  if(total >= 12)  badges.push({ label:'Full Year',      desc:'A complete year of financial visibility',                 earned:true });
  if(totalPos >= 2) badges.push({ label:'Saver',          desc:'2+ months finishing in the green',                       earned:true });

  // Locked badges (things to work toward)
  if(curPos < 3)   badges.push({ label:'Momentum',       desc:'Finish 3 months positive in a row',                      earned:false, progress: curPos, target: 3 });
  if(curBudget < 3) badges.push({ label:'Budget Master', desc:'Stay under budget for 3 months straight',                earned:false, progress: curBudget, target: 3 });
  if(total < 6)    badges.push({ label:'Quarter Done',   desc:`Track ${6-total} more months`,                           earned:false, progress: total, target: 6 });

  // Deduplicate (earned version takes precedence)
  const seen = new Set();
  return badges.filter(b => {
    if(seen.has(b.label)) return false;
    seen.add(b.label);
    return true;
  });
}

// Neon badge icons -- Tabler Icons (MIT). Inline SVG; glow applied via .badge-icon CSS.
const BADGE_ICONS = {
  'On a Roll':     { c:'#ff7a45', p:'<path d="M12 10.941c2.333 -3.308 .167 -7.823 -1 -8.941c0 3.395 -2.235 5.299 -3.667 6.706c-1.43 1.408 -2.333 3.294 -2.333 5.588c0 3.704 3.134 6.706 7 6.706c3.866 0 7 -3.002 7 -6.706c0 -1.712 -1.232 -4.403 -2.333 -5.588c-2.084 3.353 -3.257 3.353 -4.667 2.235"/>' },
  'Momentum':      { c:'#ffd93d', p:'<path d="M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11"/>' },
  'Budget Streak': { c:'#00d68f', p:'<path d="M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M7 12a5 5 0 1 0 10 0a5 5 0 1 0 -10 0"/><path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/>' },
  'Budget Master': { c:'#00d68f', p:'<path d="M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M7 12a5 5 0 1 0 10 0a5 5 0 1 0 -10 0"/><path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/>' },
  'First Month':   { c:'#4bcffa', p:'<path d="M3 12h1m8 -9v1m8 8h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7"/><path d="M9 16a5 5 0 1 1 6 0a3.5 3.5 0 0 0 -1 3a2 2 0 0 1 -4 0a3.5 3.5 0 0 0 -1 -3"/><path d="M9.7 17l4.6 0"/>' },
  'Quarter Done':  { c:'#ffa502', p:'<path d="M8 21l8 0"/><path d="M12 17l0 4"/><path d="M7 4l10 0"/><path d="M17 4v8a5 5 0 0 1 -10 0v-8"/><path d="M3 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M17 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/>' },
  'Half Year':     { c:'#a55eea', p:'<path d="M12 6l4 6l5 -4l-2 10h-14l-2 -10l5 4l4 -6"/>' },
  'Full Year':     { c:'#00c9b1', p:'<path d="M6 5h12l3 5l-8.5 9.5a.7 .7 0 0 1 -1 0l-8.5 -9.5l3 -5"/><path d="M10 12l-2 -2.2l.6 -1"/>' },
  'Saver':         { c:'#ff6b81', p:'<path d="M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572"/>' },
};
function badgeIconHTML(label){
  const ic=BADGE_ICONS[label];
  if(!ic) return '';
  return `<div class="badge-icon" style="color:${ic.c}"><svg aria-hidden="true"viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ic.p}</svg></div>`;
}

function renderStreaks(){
  const s = computeStreaks();
  if(!s.totalMonths) return '';
  const earned = s.badges.filter(b => b.earned);
  const locked = s.badges.filter(b => !b.earned);

  const badgeHTML = (badges, dim) => badges.slice(0,6).map(b => `
    <div class="badge-tile ${dim?'badge-locked':''}">
      ${badgeIconHTML(b.label)}
      <div class="badge-name">${b.label}</div>
      <div class="badge-desc">${b.desc}</div>
      ${b.progress !== undefined ? `<div class="badge-prog"><div style="width:${Math.round(b.progress/b.target*100)}%;height:100%;border-radius:3px;background:rgba(255,255,255,0.3);transition:width 0.8s;"></div></div>` : ''}
    </div>`).join('');

  return `<div class="streaks-card">
    <div class="streaks-header">
      <div class="streak-stat">
        <div class="streak-num">${s.curPosStreak}</div>
        <div class="streak-lbl">Month Streak</div>
      </div>
      <div class="streak-divider"></div>
      <div class="streak-stat">
        <div class="streak-num">${s.curBudgetStreak}</div>
        <div class="streak-lbl">Budget Streak</div>
      </div>
      <div class="streak-divider"></div>
      <div class="streak-stat">
        <div class="streak-num">${s.totalMonths}</div>
        <div class="streak-lbl">Months Tracked</div>
      </div>
    </div>
    ${earned.length ? `<div class="badge-section-title">Earned</div><div class="badge-grid">${badgeHTML(earned, false)}</div>` : ''}
    ${locked.length ? `<div class="badge-section-title" class="c-muted">Next Up</div><div class="badge-grid">${badgeHTML(locked.slice(0,3), true)}</div>` : ''}
  </div>`;
}



// ──────── Category drill-down modals (vendor list + insights) ────────
function showCatInsights(cat){
  if(!cat) return;

  const monthFilter = (_sel && _sel !== '__all') ? _sel : null;
  const txsForCat = _allTxs.filter(tx => tx.cat === cat && tx.amount < 0 && (!monthFilter || tx.month === monthFilter));
  const total = txsForCat.reduce((s,tx)=>s+Math.abs(tx.amount),0);
  const keys = sortKeys(_months);
  const n = keys.length;
  const avgMo = total / n;

  // Build vendor breakdown for context
  const byVendor = {};
  for(const tx of txsForCat){
    const v = cleanVendor(tx.desc);
    byVendor[v]=(byVendor[v]||0)+Math.abs(tx.amount);
  }
  const topVendors = Object.entries(byVendor).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const budget = CFG.budget[cat] || 0;

  // Monthly breakdown
  const byMonth = {};
  for(const mk of keys){
    byMonth[mk] = (_months[mk].expenses[cat]||0);
  }

  // Set header
  document.getElementById('ins-cat-title').textContent = cat;
  document.getElementById('ins-cat-sub').textContent = `${txsForCat.length} transactions · ${fmt(total)} total`;
  document.getElementById('ins-loading').style.display = 'block';
  document.getElementById('ins-content').innerHTML = '';
  openModal('modal-cat-insights');

  // Build the local analysis (no API needed -- fast, private)
  const trend = keys.length >= 2
    ? byMonth[keys[keys.length-1]] - byMonth[keys[0]]
    : 0;
  const trendDir = trend > 50 ? '↑ increasing' : trend < -50 ? '↓ decreasing' : '→ stable';
  const trendColor = trend > 50 ? 'var(--red)' : trend < -50 ? 'var(--green)' : 'var(--muted)';
  const highMonth = keys.reduce((b,k)=>byMonth[k]>byMonth[b]?k:b, keys[0]);
  const lowMonth = keys.reduce((b,k)=>byMonth[k]<byMonth[b]&&byMonth[k]>0?k:b, keys[0]);
  const vsBudget = budget > 0 ? ((avgMo - budget) / budget * 100).toFixed(0) : null;
  const topVendor = topVendors[0];
  const topVendorPct = topVendor ? (topVendor[1]/total*100).toFixed(0) : 0;

  document.getElementById('ins-loading').style.display = 'none';
  document.getElementById('ins-content').innerHTML = `
      <!-- Key metrics -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:12px 14px;">
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;font-weight:700;margin-bottom:4px;">Avg/month</div>
          <div style="font-family: var(--font-display);font-size:20px;font-weight:900;">${fmt(avgMo)}</div>
        </div>
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:12px 14px;">
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;font-weight:700;margin-bottom:4px;">Trend</div>
          <div style="font-family: var(--font-display);font-size:20px;font-weight:900;color:${trendColor};">${trendDir}</div>
        </div>
        ${budget>0?`
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:12px 14px;">
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;font-weight:700;margin-bottom:4px;">Budget</div>
          <div style="font-family: var(--font-display);font-size:20px;font-weight:900;">${fmt(budget)}/mo</div>
        </div>
        <div style="background:${parseFloat(vsBudget)>0?'rgba(255,71,87,0.1)':'rgba(0,214,143,0.1)'};border:1px solid ${parseFloat(vsBudget)>0?'rgba(255,71,87,0.2)':'rgba(0,214,143,0.2)'};border-radius:14px;padding:12px 14px;">
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;font-weight:700;margin-bottom:4px;">vs Budget</div>
          <div style="font-family: var(--font-display);font-size:20px;font-weight:900;color:${parseFloat(vsBudget)>0?'var(--red)':'var(--green)'};">${parseFloat(vsBudget)>0?'+':''}${vsBudget}%</div>
        </div>`:''}
      </div>

      <!-- Monthly trend chart -->
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:14px 16px;margin-bottom:12px;">
        <div style="font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;font-family: var(--font-display);">Month by Month</div>
        ${keys.map(mk=>{
          const amt=byMonth[mk];
          // Math.max(...[]) is -Infinity, which is truthy -- ||1 wouldn't catch it.
          // Seeding with 1 guarantees a positive divisor even if byMonth is empty.
          const maxAmt=Math.max(1, ...Object.values(byMonth));
          const barPct=Math.round(amt/maxAmt*100);
          const isHigh=mk===highMonth;
          return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <div style="font-size:11px;color:var(--muted);width:52px;flex-shrink:0;">${esc(mk)}</div>
            <div style="flex:1;height:6px;background:rgba(255,255,255,0.07);border-radius:3px;">
              <div style="height:6px;border-radius:3px;width:${barPct}%;background:${isHigh?'var(--red)':'#00d68f'};"></div>
            </div>
            <div style="font-family: var(--font-display);font-size:12px;font-weight:700;min-width:56px;text-align:right;color:${isHigh?'var(--red)':'inherit'};">${fmt(amt)}</div>
          </div>`;
        }).join('')}
        ${budget>0?`<div style="margin-top:6px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.07);display:flex;align-items:center;gap:8px;font-size:11px;color:var(--muted);">
          <div style="width:24px;height:2px;background:rgba(255,165,2,0.6);border-radius:1px;border:1px dashed rgba(255,165,2,0.5);"></div> Budget: ${fmt(budget)}/mo
        </div>`:''}
      </div>

      <!-- Top vendors -->
      ${topVendors.length?`
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:14px 16px;margin-bottom:12px;">
        <div style="font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;font-family: var(--font-display);">Top Vendors</div>
        ${topVendors.map(([v,a],i)=>`
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;${i===topVendors.length-1?'margin-bottom:0':''}">
            <div style="font-size:12px;color:var(--soft);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(v)}</div>
            <div style="font-family: var(--font-display);font-size:13px;font-weight:800;flex-shrink:0;">${fmt(a)}</div>
            <div style="font-size:10px;color:var(--muted);flex-shrink:0;min-width:32px;text-align:right;">${(a/total*100).toFixed(0)}%</div>
          </div>`).join('')}
      </div>`:''}

      <!-- Smart observations -->
      <div style="background:linear-gradient(145deg,rgba(0,214,143,0.06),rgba(0,201,177,0.04));border:1px solid rgba(0,214,143,0.15);border-radius:16px;padding:16px;margin-bottom:4px;">
        <div style="font-size:11px;font-weight:800;color:#00d68f;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;font-family: var(--font-display);">Observations</div>
        ${[
          topVendor && parseInt(topVendorPct) > 30
            ? `<b>${esc(topVendor[0])}</b> accounts for <b>${topVendorPct}%</b> of all ${esc(cat)} spending -- your dominant vendor in this category.`
            : topVendor
            ? `Spending is spread across ${topVendors.length} vendors, with <b>${esc(topVendor[0])}</b> leading at ${fmt(topVendor[1])}.`
            : null,
          budget > 0 && parseFloat(vsBudget) > 15
            ? `Averaging <b>${fmt(avgMo)}/mo -- ${vsBudget}% over your ${fmt(budget)} budget</b>. Consider reducing this category.`
            : budget > 0 && parseFloat(vsBudget) < -10
            ? `You're <b>under budget</b> by ${Math.abs(vsBudget)}% -- you have room to spare here.`
            : budget > 0
            ? `Spending is <b>on target</b> -- averaging ${fmt(avgMo)}/mo, within 10% of your ${fmt(budget)} budget.`
            : `No budget set for this category. Consider setting a target in Settings.`,
          highMonth && keys.length > 1
            ? `<b>${highMonth}</b> was your highest spend month at ${fmt(byMonth[highMonth])}.`
            : null,
          trend > 100
            ? `Spending is <b>trending up</b> -- ${fmt(Math.abs(trend))} more than when tracking started.`
            : trend < -100
            ? `Spending is <b>trending down</b> -- ${fmt(Math.abs(trend))} less than when tracking started. Good progress.`
            : null,
        ].filter(Boolean).map(obs=>`<div style="font-size:13px;color:var(--soft);line-height:1.6;margin-bottom:8px;padding-left:12px;border-left:2px solid rgba(0,214,143,0.3);">${obs}</div>`).join('')}
      </div>
    `;
}

function showVendorDrill(cat){
  if(!cat) return;
  // Aggregate all transactions for this category by vendor/description
  // Filter for current month if not 'all', otherwise all months  
  const monthFilter = (_sel && _sel !== '__all') ? _sel : null;
  const txsForCat = _allTxs.filter(tx => tx.cat === cat && tx.amount < 0 && (!monthFilter || tx.month === monthFilter));
  const byVendor = {};
  for(const tx of txsForCat){
    // Clean up description to get vendor name (first ~30 chars, strip bank prefixes)
    const v = cleanVendor(tx.desc);
    byVendor[v] = (byVendor[v] || 0) + Math.abs(tx.amount);
  }

  const vendors = Object.entries(byVendor).sort((a,b) => b[1]-a[1]);
  const total = vendors.reduce((s,[,v])=>s+v,0);
  const maxAmt = vendors[0]?.[1] || 1;
  const keys = sortKeys(_months);
  const n = keys.length;

  // Set modal header
  document.getElementById('vendor-cat-title').textContent = cat;
  document.getElementById('vendor-cat-sub').textContent = `${txsForCat.length} transactions · ${fmt(total)} total · ${fmt(total/n)}/mo avg`;

  // Build vendor list
  const list = document.getElementById('vendor-list');
  list.innerHTML = vendors.slice(0,30).map(([vendor, amt], i)=>{
    const pct = (amt/total*100).toFixed(1);
    const barW = Math.round(amt/maxAmt*100);
    const count = txsForCat.filter(tx=>{
      return cleanVendor(tx.desc)===vendor;
    }).length;
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px;">${esc(vendor)}</div>
        <div style="height:3px;background:rgba(255,255,255,0.07);border-radius:3px;"><div style="height:3px;border-radius:3px;width:${barW}%;background:${PAL[i%15]};"></div></div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-family: var(--font-display);font-size:14px;font-weight:800;">${fmt(amt)}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:1px;">${count} tx · ${pct}%</div>
      </div>
    </div>`;
  }).join('');

  openModal('modal-vendor');
}



function renderSummary(){
  const keys=sortKeys(_months);
  const hasData=keys.length>0;
  if(!hasData && !localStorage.getItem('gb_setup_done')) return; // first launch -- flash intro handles it

  const sel=hasData ? ((_sel && _sel!=='__all' && _months[_sel]) ? _sel : keys[keys.length-1]) : null;
  const m=sel ? _months[sel] : null;

  // KPI -- Monthly Budget
  const totalBudget=Object.values(CFG.budget||{}).reduce((s,v)=>s+(v>0?v:0),0);

  // KPI -- health score grade + brief explanation
  const hs=sel ? computeHealthScore(sel) : null;
  const grade=hs ? hs.grade : '—';
  const gradeColor=hs ? hs.gradeColor : 'var(--muted)';
  const gradeExplain=hs ? (GRADE_EXPLAIN[hs.grade]||hs.label)
    : (hasData ? 'Add a month with income to get a grade.' : 'Import transactions to get your grade.');

  // Top 3 spend categories
  const spend=m ? Object.entries(m.expenses).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).slice(0,3) : [];
  const expTotal=sumExpenses(m);
  const maxAmt=spend[0]?.[1]||1;

  const pills=hasData
    ? `<div class="pills-row" role="group" aria-label="Select month" style="margin-bottom:12px;">${keys.map(k=>`<button type="button" class="pill ${k===sel?'active':''}" onclick="selMonth('${k}')"${k===sel?' aria-current="true"':''}>${k}</button>`).join('')}<button type="button" class="pill" onclick="selMonth('__all')">All</button></div>`
    : '';

  const topSpendBody=spend.length
    ? `<div class="cat-list">${spend.map(([cat,amt],i)=>`
        <div class="cat-item">
          <div class="cat-body">
            <div class="cat-name">${esc(cat)}</div>
            <div class="cat-bar-bg"><div class="cat-bar-fg" style="width:${Math.round(amt/maxAmt*100)}%;background:${PAL[i%15]}"></div></div>
          </div>
          <div class="cat-right">
            <div class="cat-amt">${fmt(amt)}</div>
            <div class="cat-pct">${expTotal>0?(amt/expTotal*100).toFixed(1):'0.0'}%</div>
          </div>
        </div>`).join('')}</div>`
    : `<div class="g-card" style="padding:22px 18px;text-align:center;color:var(--muted);font-size:13px;">No spending yet — import your Bank Transactions to see your top categories.</div>`;

  let achievements=hasData ? renderStreaks() : '';
  if(!achievements){
    const goals=computeBadges([],0,0,0,0,0);
    achievements=`<div class="streaks-card">
      <div class="badge-section-title" style="color:var(--muted);margin-top:0;">Start importing to unlock these</div>
      <div class="badge-grid">${goals.map(b=>`
        <div class="badge-tile badge-locked">
          ${badgeIconHTML(b.label)}
          <div class="badge-name">${esc(b.label)}</div>
          <div class="badge-desc">${esc(b.desc)}</div>
          <div class="badge-prog"><div style="width:0%;height:100%;border-radius:3px;background:rgba(255,255,255,0.3);"></div></div>
        </div>`).join('')}</div>
    </div>`;
  }

  const importPrompt=hasData ? '' : `
      <div class="g-card" style="padding:18px;margin:14px 0 0;text-align:center;">
        <div style="font-family:var(--font-display);font-size:16px;font-weight:900;margin-bottom:6px;">You're all set!</div>
        <div style="font-size:13px;color:var(--soft);line-height:1.6;margin-bottom:14px;">Your budget is ready. Import your bank transactions to track spending against these targets.</div>
        <button type="button" class="btn-primary" onclick="startFirstImport()">Import your first Bank Transaction file now</button>
        <div id="first-import-help" style="display:none;margin-top:12px;font-size:12px;color:var(--soft);line-height:1.5;">Don't have a file yet? <span onclick="goToBankExport()" style="color:var(--green);font-weight:700;cursor:pointer;text-decoration:underline;text-underline-offset:2px;">See how to export from your bank &rarr;</span></div>
      </div>`;

  document.getElementById('summary-content').innerHTML=`
    <div class="gb-welcome">
      ${pills}
      <div class="net-card" style="margin-bottom:12px;">
        <div class="pulse"></div>
        <div class="net-lbl">Monthly Budget</div>
        <div class="net-amt surplus">${fmt(totalBudget)}</div>
        <div class="net-mo">Your monthly plan</div>
      </div>
      <div class="stat-row" style="grid-template-columns:1fr 1fr;margin-bottom:8px;">
        ${(()=>{
          // Savings rate: income minus spend, expressed as a % of income.
          // Tapping opens the Health Score Breakdown -- savings rate is the
          // top-weighted component there, so the modal gives the full context.
          if(m && m.income > 0){
            const rate = (m.income - expTotal) / m.income;
            const pct  = Math.round(rate * 100);
            const saved= m.income - expTotal;
            const positive = rate >= 0;
            const valColor = positive ? 'var(--green)' : '#ff4757';
            const subText  = positive ? `${fmt(saved)} saved` : `${fmt(Math.abs(saved))} over`;
            const sign     = positive ? '+' : '−';
            const ariaSign = positive ? 'saved' : 'over income';
            return `<button class="stat-tile" type="button" onclick="openHealthBreakdown()" aria-label="Savings rate ${sign}${Math.abs(pct)} percent ${ariaSign} this month — see what's driving it"><div class="st-lbl">Savings Rate</div><div class="st-val" style="color:${valColor};">${sign}${Math.abs(pct)}%</div><div class="st-tap-hint" style="margin-top:3px;color:var(--soft);">${subText} &rsaquo;</div></button>`;
          }
          return `<button class="stat-tile" type="button" disabled aria-label="Savings rate not available yet — add a month with income"><div class="st-lbl">Savings Rate</div><div class="st-val" class="c-muted">—</div></button>`;
        })()}
        <button class="stat-tile" type="button" ${hs?`onclick="openHealthBreakdown()" aria-label="Health score ${hs.grade}, ${hs.score} out of 100 — see what's driving it"`:'disabled aria-label="Health score not available yet"'}><div class="st-lbl">Health Score</div><div class="st-val" style="color:${gradeColor};">${grade}</div>${hs?`<div class="st-tap-hint">Tap for details &rsaquo;</div>`:''}</button>
      </div>
      <div style="font-size:12px;color:var(--muted);line-height:1.5;margin:0 2px 16px;">${esc(gradeExplain)}</div>
      <h2 class="sec-hdr">Top Spending${(m&&spend.length)?` <span class="sec-total">${fmt(expTotal)}</span>`:''}</h2>
      ${topSpendBody}
      <h2 class="sec-hdr">Achievements</h2>
      ${achievements}
      ${importPrompt}
    </div>`;
  srAnnounce(hasData ? `Summary for ${sel}` : 'Summary, no transactions yet');
}
function selMonth(mk){
  _sel=mk;
  // renderAll() re-renders Summary now and Budget/Transactions only if active;
  // showScreen() refreshes those lazily when the user navigates to them.
  if(mk==='__all')renderSummaryAll();
  else renderAll();
}

function renderSummaryAll(){
  const keys=sortKeys(_months);
  const pills=keys.map(k=>`<button type="button" class="pill" onclick="selMonth('${k}')">${k}</button>`).join('')
    +`<button type="button" class="pill active" onclick="selMonth('__all')" aria-current="true">All</button>`;
  const allCats={};let totalInc=0,totalExp=0;
  for(const mk of keys){const m=_months[mk];totalInc+=m.income;for(const[c,v]of Object.entries(m.expenses)){allCats[c]=(allCats[c]||0)+v;totalExp+=v;}}
  const n=keys.length;
  const cats=Object.entries(allCats).map(([c,t])=>([c,t/n])).sort((a,b)=>b[1]-a[1]);
  const maxAvg=cats[0]?.[1]||1;

  document.getElementById('summary-content').innerHTML=`
    <div class="gb-welcome">
      <div class="gb-brand-wrap">
        <div class="gb-brand-glow"></div>
        <svg aria-hidden="true"class="gb-logo-svg" viewBox="0 0 280 180" xmlns="http://www.w3.org/2000/svg">
          <rect x="20" y="110" width="28" height="50" rx="6" fill="url(#barGrad1b)" opacity="0.9"/>
          <rect x="56" y="80" width="28" height="80" rx="6" fill="url(#barGrad1b)" opacity="0.95"/>
          <rect x="92" y="50" width="28" height="110" rx="6" fill="url(#barGrad1b)"/>
          <rect x="128" y="70" width="28" height="90" rx="6" fill="url(#barGrad2b)" opacity="0.85"/>
          <rect x="164" y="90" width="28" height="70" rx="6" fill="url(#barGrad2b)" opacity="0.8"/>
          <rect x="200" y="60" width="28" height="100" rx="6" fill="url(#barGrad1b)" opacity="0.9"/>
          <rect x="236" y="40" width="28" height="120" rx="6" fill="url(#barGrad1b)"/>
          <rect x="10" y="161" width="260" height="2" rx="1" fill="rgba(255,255,255,0.1)"/>
          <polyline points="34,110 70,80 106,50 142,70 178,90 214,60 250,40" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" fill="none" stroke-dasharray="4,3"/>
          <defs>
            <linearGradient id="barGrad1b" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#00d68f"/><stop offset="100%" stop-color="#00a86b" stop-opacity="0.7"/></linearGradient>
            <linearGradient id="barGrad2b" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#00c9b1"/><stop offset="100%" stop-color="#0099a0" stop-opacity="0.7"/></linearGradient>
          </defs>
        </svg>
        <div class="gb-brand-tagline">Your money, clearly.</div>
      </div>

      <div class="pills-row" role="group" aria-label="Select month" style="margin-bottom:12px;">${pills}</div>
      <div class="net-card" style="margin-bottom:12px;">
        <div class="pulse"></div>
        <div class="net-lbl">Total Net -- ${n} Months</div>
        <div class="net-amt ${totalInc>=totalExp?'surplus':'deficit'}">${totalInc>=totalExp?'+':''}${fmt(totalInc-totalExp)}</div>
        <div class="net-mo">Avg ${fmt((totalInc-totalExp)/n)}/mo</div>
      </div>
      <div class="stat-row">
        <div class="stat-tile"><div class="st-lbl">Total Inc</div><div class="st-val c-green">${fmt(totalInc)}</div></div>
        <div class="stat-tile"><div class="st-lbl">Total Exp</div><div class="st-val c-red">${fmt(totalExp)}</div></div>
        <div class="stat-tile"><div class="st-lbl">Months</div><div class="st-val c-teal">${n}</div></div>
      </div>
      <h2 class="sec-hdr">Avg Monthly Spend <span class="sec-total">${fmt(totalExp/n)}/mo</span></h2>
      <div class="cat-list">
        ${cats.slice(0,8).map(([cat,avg],i)=>`
        <div class="cat-item" style="flex-direction:column;align-items:stretch;gap:8px;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div class="cat-body">
              <div class="cat-name">${esc(cat)}</div>
              <div class="cat-bar-bg"><div class="cat-bar-fg" style="width:${Math.round(avg/maxAvg*100)}%;background:${PAL[i%15]}"></div></div>
            </div>
            <div class="cat-right">
              <div class="cat-amt">${fmt(avg)}/mo</div>
              <div class="cat-pct">${(avg/(totalExp/n)*100).toFixed(1)}%</div>
            </div>
          </div>
          <div style="display:flex;gap:8px;">
            <button type="button" onclick="showVendorDrill(this.dataset.cat)" data-cat="${esc(cat)}" style="flex:1;padding:7px 0;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:var(--soft);font-size:11px;font-weight:600;cursor:pointer;font-family: var(--font-display);">Transactions</button>
            <button type="button" onclick="showCatInsights(this.dataset.cat)" data-cat="${esc(cat)}" style="flex:1;padding:7px 0;border-radius:10px;border:1px solid rgba(0,214,143,0.25);background:rgba(0,214,143,0.08);color:#00d68f;font-size:11px;font-weight:600;cursor:pointer;font-family: var(--font-display);">Insights</button>
          </div>
        </div>`).join('')}
      </div>
    </div>`;
  srAnnounce(`Summary across all ${n} months`);
}

function renderBudget(){
  const mk=_sel==='__all'?sortKeys(_months).slice(-1)[0]:_sel;
  const m=_months[mk];
  if(!m){document.getElementById('budget-content').innerHTML='<div class="empty"><p>Your budget is ready. Import your Bank Transactions to compare actual spending.</p><button type="button" class="empty-action" onclick="document.getElementById(\'csv-input\').click()">Import a CSV file</button></div>';srAnnounce('Budget, no transactions yet');return;}
  const expTotal=sumExpenses(m);
  const budTotal=Object.values(CFG.budget).reduce((s,v)=>s+v,0);
  const rows=Object.entries(CFG.budget).map(([cat,bud])=>({cat,bud,actual:m.expenses[cat]||0})).filter(r=>r.bud>0||r.actual>0).sort((a,b)=>b.actual-a.actual);
  const unb=Object.entries(m.expenses).filter(([cat])=>!CFG.budget[cat]).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const totalVar=budTotal-expTotal;
  const varColor = totalVar >= 0 ? 'var(--green)' : '#ff4757';
  const varTint  = totalVar >= 0 ? 'rgba(0,214,143,0.07)' : 'rgba(255,71,87,0.07)';
  const varBdr   = totalVar >= 0 ? 'rgba(0,214,143,0.25)' : 'rgba(255,71,87,0.25)';
  const varLabel = totalVar >= 0 ? 'under budget' : 'over budget';
  const varPrefix= totalVar >= 0 ? '+' : '−';
  document.getElementById('budget-content').innerHTML=`
    <h2 class="sec-hdr" style="margin-top:0">Budget vs Actual <span class="sec-total">${esc(mk)}</span></h2>
    <!-- Variance hero: the headline number for this screen, sized accordingly. -->
    <div style="background:${varTint};border:1px solid ${varBdr};border-radius:20px;padding:18px 18px 16px;margin-bottom:14px;">
      <div style="font-family:var(--font-display);font-size:11px;font-weight:800;color:${varColor};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">${budTotal>0?'This month':'No budget set'}</div>
      <div style="font-family:var(--font-display);font-size:32px;font-weight:900;letter-spacing:-1px;color:${varColor};line-height:1;">${varPrefix}${fmt(Math.abs(totalVar))}</div>
      <div style="font-size:13px;color:var(--soft);margin-top:6px;">${esc(varLabel)} &middot; ${fmt(expTotal)} spent of ${fmt(budTotal)} budgeted</div>
    </div>
    <div style="font-size:12px;color:var(--muted);margin:-4px 2px 14px;line-height:1.5;">Targets come from your Setup &mdash; update them in Settings anytime.</div>
    <div class="bva-card">
      <div class="bva-head"><span>Category</span><span>Budget</span><span>Actual</span><span>Δ</span></div>
      ${rows.map(r=>{const v=r.bud-r.actual;const cls=v<-20?'v-over':v>20?'v-under':'v-flat';
        return`<div class="bva-row"><div class="bva-cat">${esc(r.cat)}</div><div class="bva-num" style="color:var(--muted)">${fmt(r.bud)}</div><div class="bva-num">${fmt(r.actual)}</div><div class="bva-num ${cls}">${v>=0?'+':''}${fmt(v)}</div></div>`;}).join('')}
    </div>
    ${unb.length?`<h2 class="sec-hdr">Unbudgeted</h2><div class="bva-card">${unb.map(([cat,amt])=>`<div class="bva-row"><div class="bva-cat">${esc(cat)}</div><div class="bva-num" style="color:var(--muted)">-</div><div class="bva-num">${fmt(amt)}</div><div class="bva-num v-flat">--</div></div>`).join('')}</div>`:''}`;
  srAnnounce(`Budget for ${mk}, ${rows.length} ${rows.length===1?'category':'categories'}`);
}

function renderTxs(filter=''){
  const mk=_sel==='__all'?null:_sel;
  const dateFmt=CFG.cols.fmt||'MM/DD/YY';
  // Resolve each tx to a sortable key + readable label. Prefer the ts stored at
  // import; fall back to parsing the raw date for data saved by older versions.
  const rows=(_allTxs||[])
    .filter(tx=>(!mk||tx.month===mk)&&(!filter||tx.desc.toLowerCase().includes(filter.toLowerCase())||tx.cat.toLowerCase().includes(filter.toLowerCase())))
    .map(tx=>{
      const pd=parseDateParts(tx.date,dateFmt);
      const key=(typeof tx.ts==='number'&&tx.ts)||(pd&&pd.key)||0;
      const label=(pd&&pd.label)||tx.date||'Undated';
      return {tx,key,label};
    })
    .sort((a,b)=>b.key-a.key);
  if(!rows.length){
    const html = filter
      ? `<div class="empty"><p>No matches for &ldquo;${esc(filter)}&rdquo;.</p><button type="button" class="empty-link" onclick="renderTxs('')">Clear search</button></div>`
      : `<div class="empty"><p>No transactions in this month.</p></div>`;
    document.getElementById('txs-content').innerHTML = html;
    srAnnounce(filter?`No transactions match "${filter}"`:'No transactions');
    return;
  }
  const byDate={};for(const r of rows){(byDate[r.label]=byDate[r.label]||[]).push(r.tx);}
  document.getElementById('txs-content').innerHTML=`
    <div class="search-wrap${filter?' has-value':''}">
      <input type="text" aria-label="Search transactions" placeholder="Search…" value="${esc(filter)}"
        oninput="this.parentElement.classList.toggle('has-value', !!this.value); clearTimeout(this._t); this._t=setTimeout(()=>renderTxs(this.value),120)"
        autocomplete="off">
      <button type="button" class="search-clear" aria-label="Clear search" onclick="const i=this.previousElementSibling; if(i){ i.value=''; clearTimeout(i._t); } renderTxs('')">&#x2715;</button>
    </div>
    ${Object.entries(byDate).map(([date,dTxs])=>`
      <div class="tx-date-hdr">${esc(date)}</div>
      <div class="tx-group">
        ${dTxs.map(tx=>{
          return`<div class="tx-item">
            <div class="tx-bd"><div class="tx-desc">${esc(cleanVendor(tx.desc)||tx.desc)}</div><div class="tx-cat">${esc(tx.cat)}</div></div>
            <div class="tx-amt ${tx.amount<0?'neg':'pos'}">${tx.amount<0?'−':'+'}${fmt(Math.abs(tx.amount))}</div>
          </div>`;}).join('')}
      </div>`).join('')}`;
  srAnnounce(`${rows.length} ${rows.length===1?'transaction':'transactions'}${filter?` matching "${filter}"`:''}`);
}

// ════ BANK EXPORT GUIDE ════
// Curated high-level download steps for common US banks. Exact labels drift over
