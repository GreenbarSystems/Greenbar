// ════ Greenbar — spending anomaly detection ════
// Runs after every CSV import. Zero deps. Reads the live _months/_allTxs model.
// Globals used: _months, _allTxs, _sel, sortKeys, cleanVendor, MN,
//               openModal, closeModal, closeOut, showScreen, _navBtn.

/* ── F. Statistical helpers (pure; null on invalid input) ── */
function mean(arr){
  if(!Array.isArray(arr) || arr.length === 0) return null;
  let s = 0; for(const x of arr) s += x;
  return s / arr.length;
}
function stdDev(arr){ // POPULATION (÷ N) — we hold the user's full history
  if(!Array.isArray(arr) || arr.length === 0) return null;
  const m = mean(arr);
  let s = 0; for(const x of arr) s += (x - m) * (x - m);
  return Math.sqrt(s / arr.length);
}
function zScore(value, arr){
  const m = mean(arr), sd = stdDev(arr);
  if(m === null || sd === null || sd === 0) return null; // no z when sd is 0
  return (value - m) / sd;
}
function median(arr){
  if(!Array.isArray(arr) || arr.length === 0) return null;
  const s = arr.slice().sort((a,b)=>a-b), n = s.length, mid = n >> 1;
  return n % 2 ? s[mid] : (s[mid-1] + s[mid]) / 2;
}

/* ── small internal helpers ── */
function _money(n){ return gbMoneyAbs(n, 0); }                 // locale/currency-aware (core.js)
function _money2(n){ return gbMoneyAbs(n, 2); }                // keeps cents
function _round2(n){ return Math.round((Number(n)||0) * 100) / 100; }
function _monthName(key){ return String(key||'').split(' ')[0] || key; }
function _tsToDate(ts){ const y=Math.floor(ts/10000), m=Math.floor((ts%10000)/100), d=ts%100; return new Date(y, m-1, d); }
function _dateLabel(ts){ const dt=_tsToDate(ts); return (MN[dt.getMonth()]||'') + ' ' + dt.getDate(); }
function _vendorOf(tx){ return (tx.vendor && String(tx.vendor).trim()) || (typeof cleanVendor==='function' ? cleanVendor(tx.desc) : tx.desc) || tx.desc || 'Unknown'; }
function _vendorKey(tx){ return _vendorOf(tx).toUpperCase(); }
function _capZ(z){ return z === null ? null : Math.min(5, Math.round(z*10)/10); }

// Count of historical months strictly before the earliest newly-imported month.
function _historyDepth(newMonthKeys){
  const order = sortKeys(_months);
  const rank = {}; order.forEach((k,i)=>rank[k]=i);
  const newRanks = newMonthKeys.map(k=>rank[k]).filter(r=>r!=null);
  if(!newRanks.length) return 0;
  const earliest = Math.min(...newRanks);
  return order.filter(k => rank[k] < earliest).length;
}

/* ── A. Core detection engine ── */
function detectAnomalies(newMonthKeys){
  const keys = (newMonthKeys || []).filter(k => _months[k]);
  if(!keys.length) return [];

  const order = sortKeys(_months);
  const rank = {}; order.forEach((k,i)=>rank[k]=i);
  const earliestNewRank = Math.min(...keys.map(k=>rank[k]));
  const historicalKeys = order.filter(k => rank[k] < earliestNewRank);
  const coldStart = historicalKeys.length < 3;

  // ---- pre-index history once (O(n)) ----
  const histVendorSet = new Set();          // Pass 3 O(1) lookup
  const histTxByCat = new Map();            // Pass 2: cat -> [abs amounts]
  const histCatMaxTx = new Map();           // Pass 2: cat -> max abs single tx
  const histCatMonthly = new Map();         // Pass 1: cat -> [monthly totals]
  const histIncome = [];                    // Pass 5

  for(const hk of historicalKeys){
    const mo = _months[hk];
    for(const tx of (mo.txs || [])) histVendorSet.add(_vendorKey(tx));
    for(const tx of (mo.txs || [])){
      if(tx.amount < 0){
        const a = Math.abs(tx.amount), c = tx.cat;
        if(!histTxByCat.has(c)) histTxByCat.set(c, []);
        histTxByCat.get(c).push(a);
        histCatMaxTx.set(c, Math.max(histCatMaxTx.get(c)||0, a));
      }
    }
    for(const [c,v] of Object.entries(mo.expenses || {})){
      if(v > 0){ if(!histCatMonthly.has(c)) histCatMonthly.set(c, []); histCatMonthly.get(c).push(v); }
    }
    if(mo.income > 0) histIncome.push(mo.income);
  }

  const out = [];
  const pass2Ids = new Set(); // for dedup with Pass 3

  // ---- PASS 1: category spike ----
  if(!coldStart) for(const mk of keys){
    for(const [cat, amount] of Object.entries(_months[mk].expenses || {})){
      if(!(amount > 0)) continue;
      const hist = histCatMonthly.get(cat);
      if(!hist || hist.length < 3) continue;
      const m = mean(hist), sd = stdDev(hist), mx = Math.max(...hist);
      const diff = amount - m, pct = m > 0 ? (diff / m) * 100 : Infinity;
      // noise gate: meaningful in BOTH absolute and relative terms
      if(!(diff > 50 && pct > 30)) continue;

      let flagged = false, sev = 'medium', z = null;
      if(sd > 0){
        z = (amount - m) / sd;
        if(z >= 2){ flagged = true; sev = z > 3 ? 'high' : 'medium'; }
      } else {                                  // sd 0 -> percentage logic
        if(amount > m){ flagged = true; sev = amount > m * 2 ? 'high' : 'medium'; }
      }
      if(!flagged && amount > mx * 1.5){ flagged = true; sev = 'medium'; } // small-sigma catch
      if(!flagged) continue;

      const ratio = m > 0 ? amount / m : null;
      out.push({
        type:'category_spike', severity:sev, month:mk, category:cat,
        amount:_round2(amount), historicalMean:_round2(m), historicalMax:_round2(mx),
        zScore:_capZ(z),
        message:`${cat} is ${_money(amount)} this month — ${ratio?ratio.toFixed(1)+'× ':''}your usual ${_money(m)}.`
      });
    }
  }

  // ---- PASS 2: single-transaction outlier ----
  if(!coldStart) for(const mk of keys){
    for(const tx of (_months[mk].txs || [])){
      if(tx.amount >= 0) continue;
      const cat = tx.cat, a = Math.abs(tx.amount);
      const arr = histTxByCat.get(cat) || [];
      let flag = false, sev = 'medium';
      if(arr.length >= 5){
        const m = mean(arr), sd = stdDev(arr);
        if(sd > 0){ if((a - m)/sd > 3){ flag = true; sev = 'high'; } }
        else if(a > m * 2){ flag = true; sev = 'high'; }
      }
      const histMax = histCatMaxTx.get(cat) || 0;
      if(!flag && a > 500 && histMax < 200){ flag = true; sev = 'high'; } // new large charge
      if(!flag) continue;

      const vendor = _vendorOf(tx);
      const cm = arr.length ? mean(arr) : 0;
      pass2Ids.add(mk + '|' + tx.ts + '|' + _vendorKey(tx) + '|' + a.toFixed(2));
      const msg = cm > 0
        ? `Unusual charge: ${vendor} ${_money(a)} — much larger than your typical ${cat} expense of ${_money(cm)}.`
        : `Unusual charge: ${vendor} ${_money(a)} — a large ${cat} charge, with little history to compare.`;
      out.push({
        type:'large_transaction', severity:sev, month:mk, date:tx.date, vendor, category:cat,
        amount:_round2(tx.amount), categoryMean:_round2(cm), message:msg
      });
    }
  }

  // ---- PASS 3: new vendor (grouped by category, max 3 largest) ----
  const newByCat = new Map(); const seenVendor = new Set();
  for(const mk of keys){
    for(const tx of (_months[mk].txs || [])){
      const a = Math.abs(tx.amount);
      if(a <= 100) continue;                          // ignore small/noisy
      const vk = _vendorKey(tx);
      if(histVendorSet.has(vk) || seenVendor.has(vk)) continue;
      if(pass2Ids.has(mk + '|' + tx.ts + '|' + vk + '|' + a.toFixed(2))){ seenVendor.add(vk); continue; } // dedup w/ Pass 2
      seenVendor.add(vk);
      if(!newByCat.has(tx.cat)) newByCat.set(tx.cat, { month:mk, vendors:[] });
      newByCat.get(tx.cat).vendors.push({ vendor:_vendorOf(tx), amount:tx.amount, abs:a });
    }
  }
  const catGroups = Array.from(newByCat.entries())
    .map(([cat,g]) => { g.vendors.sort((x,y)=>y.abs-x.abs); return { cat, month:g.month, vendors:g.vendors, top:g.vendors[0], total:g.vendors.reduce((s,v)=>s+v.abs,0) }; })
    .sort((a,b)=>b.top.abs-a.top.abs).slice(0, 3);
  for(const g of catGroups){
    const more = g.vendors.length - 1;
    const msg = more > 0
      ? `First time seeing ${g.top.vendor} and ${more} other${more>1?'s':''} in ${g.cat} (${_money(g.total)}).`
      : `First time seeing ${g.top.vendor} (${_money(g.top.abs)}) in ${g.cat}.`;
    out.push({ type:'new_vendor', severity:'low', month:g.month, vendor:g.top.vendor, category:g.cat, amount:_round2(g.top.amount), message:msg });
  }

  // ---- PASS 4: duplicate (new months + immediately prior month) ----
  const dupKeys = keys.slice();
  const priorKey = order[earliestNewRank - 1];
  if(priorKey) dupKeys.push(priorKey);
  const groups = new Map();
  for(const mk of dupKeys){
    for(const tx of (_months[mk].txs || [])){
      const k = _vendorKey(tx) + '|' + Math.abs(tx.amount).toFixed(2);
      if(!groups.has(k)) groups.set(k, []);
      groups.get(k).push(tx);
    }
  }
  for(const [, list] of groups){
    if(list.length < 2) continue;
    list.sort((a,b)=>a.ts-b.ts);
    for(let i=0;i<list.length-1;i++){
      const d1=_tsToDate(list[i].ts), d2=_tsToDate(list[i+1].ts);
      if(Math.abs((d2-d1)/86400000) <= 3){
        const a = list[i], b = list[i+1];
        if(!(keys.includes(a.month) || keys.includes(b.month))) break; // require a new-month row
        const vendor = _vendorOf(a);
        out.push({
          type:'duplicate', severity:'high', month: keys.includes(a.month)?a.month:b.month,
          vendor, amount:_round2(a.amount), date:a.date,
          message:`Possible duplicate: ${vendor} ${_money2(a.amount)} on ${_dateLabel(a.ts)} appears twice within 3 days.`
        });
        break;
      }
    }
  }

  // ---- PASS 5: income change ----
  if(!coldStart && histIncome.length >= 2){
    const m = mean(histIncome);
    for(const mk of keys){
      const inc = _months[mk].income;
      if(!(inc > 0)) continue;
      let dir = null;
      if(inc < m * 0.7) dir = 'down';
      else if(inc > m * 1.3) dir = 'up';
      if(!dir) continue;
      const pct = Math.round(Math.abs(inc - m) / m * 100);
      out.push({
        type:'income_change', severity:'medium', month:mk, amount:_round2(inc), historicalMean:_round2(m), direction:dir,
        message:`Income this month (${_money(inc)}) is ${pct}% ${dir==='down'?'below':'above'} your usual ${_money(m)}.`
      });
    }
  }

  // ---- prioritize + cap at 8: duplicates, then high, medium, low ----
  const pr = a => a.type==='duplicate' ? 0 : a.severity==='high' ? 1 : a.severity==='medium' ? 2 : 3;
  out.sort((a,b)=>pr(a)-pr(b));
  return out.slice(0, 8);
}

/* ── B. Orchestrator ── */
function runAnomalyDetection(newMonthKeys){
  // Yield to the render thread first — never block the import UI.
  setTimeout(() => {
    try{
      const keys = (newMonthKeys || []).filter(k => _months[k]);
      if(!keys.length) return;
      const cold = _historyDepth(keys) < 3;
      if(!cold){ try{ localStorage.setItem('gb_anomaly_ready','1'); }catch(_){ } } // self-enable flag

      const items = detectAnomalies(keys);
      const hasDup = items.some(a => a.type === 'duplicate');
      // Cold-start: only surface if a duplicate was found.
      if(cold && !hasDup) return;
      if(!items.length) return;

      const payload = { ts:new Date().toISOString(), months:keys, items, reviewed:false };
      try{ localStorage.setItem('gb_anomalies', JSON.stringify(payload)); }catch(_){ }
      showAnomalyReport(items);
      renderAnomalyBadge();
    }catch(e){ /* detection must never break an import */ }
  }, 0);
}

/* ── D. Retrieval ── */
function getStoredAnomalies(){
  try{ const s = localStorage.getItem('gb_anomalies'); return s ? JSON.parse(s) : null; }
  catch(e){ return null; }
}

/* ── C. Report modal ── */
const _ANOM_ICON = { category_spike:'📈', large_transaction:'💳', new_vendor:'🔍', duplicate:'⚠', income_change:'💰' };

function _anomSecondary(a){
  switch(a.type){
    case 'category_spike':    return `Historical average: ${_money(a.historicalMean)} · This month: ${_money(a.amount)}`;
    case 'large_transaction': return `Typical ${a.category}: ${_money(a.categoryMean)} · This charge: ${_money(a.amount)}`;
    case 'new_vendor':        return `${a.category} · ${_money(a.amount)}`;
    case 'duplicate':         return `${_money2(a.amount)} · ${a.date}`;
    case 'income_change':     return `Usual: ${_money(a.historicalMean)} · This month: ${_money(a.amount)}`;
    default:                  return '';
  }
}

function showAnomalyReport(anomalies){
  if(!anomalies || !anomalies.length) return;
  const pr = a => a.type==='duplicate' ? 0 : a.severity==='high' ? 1 : a.severity==='medium' ? 2 : 3;
  const items = anomalies.slice().sort((a,b)=>pr(a)-pr(b));

  const anyHigh = items.some(a => a.severity === 'high');
  const anyMed  = items.some(a => a.severity === 'medium');
  const headIcon = anyHigh ? '<span style="color:var(--red)">⚠</span>'
                 : anyMed  ? '<span style="color:var(--amber)">⚠</span>'
                           : '<span style="color:#2979ff">ℹ</span>';
  const monthName = _monthName(items[0].month);

  document.getElementById('anom-head-icon').innerHTML = headIcon;
  document.getElementById('anom-subtitle').textContent =
    `${items.length} thing${items.length===1?'':'s'} worth checking in your ${monthName} import.`;

  const sevColor = s => s==='high' ? 'var(--red)' : s==='medium' ? 'var(--amber)' : 'var(--muted)';
  document.getElementById('anom-body').innerHTML = items.map((a, i) => `
    <div class="anom-card" data-idx="${i}" style="border-left-color:${sevColor(a.severity)};">
      <div class="anom-card-row">
        <span class="anom-card-icon" aria-hidden="true">${_ANOM_ICON[a.type]||'•'}</span>
        <div class="anom-card-body">
          <div class="anom-card-msg">${esc(a.message)}</div>
          <div class="anom-card-sub">${esc(_anomSecondary(a))}</div>
          ${a.type==='duplicate' ? `<button type="button" class="anom-review-btn" onclick="_markAnomalyReviewed(${i}, this)">Mark as reviewed</button>` : ''}
        </div>
      </div>
    </div>`).join('');

  // store the affected month for the "View Transactions" jump
  document.getElementById('modal-anomaly-report').dataset.month = items[0].month;
  openModal('modal-anomaly-report');
}

function _markAnomalyReviewed(idx, btn){
  const card = btn.closest('.anom-card');
  if(card){ card.classList.add('anom-reviewed'); btn.textContent = '✓ Reviewed'; btn.disabled = true; }
  const data = getStoredAnomalies();
  if(data && data.items && data.items[idx]){ data.items[idx].reviewed = true; try{ localStorage.setItem('gb_anomalies', JSON.stringify(data)); }catch(_){ } }
}

function dismissAllAnomalies(){
  const data = getStoredAnomalies();
  if(data){ data.reviewed = true; try{ localStorage.setItem('gb_anomalies', JSON.stringify(data)); }catch(_){ } }
  closeModal('modal-anomaly-report');
  renderAnomalyBadge();
}
function viewAnomalyTransactions(){
  const mk = document.getElementById('modal-anomaly-report').dataset.month;
  if(mk){ _sel = mk; }
  closeModal('modal-anomaly-report');
  showScreen('txs');
}

/* ── E. Summary-screen badge ── */
function renderAnomalyBadge(){
  const data = getStoredAnomalies();
  const onSummary = document.getElementById('screen-summary')?.classList.contains('active');
  let el = document.getElementById('anomaly-badge');
  const show = onSummary && data && data.items && data.items.length && !data.reviewed;
  if(!show){ if(el) el.style.display = 'none'; return; }
  if(!el){
    el = document.createElement('button');
    el.id = 'anomaly-badge'; el.type = 'button';
    el.onclick = () => { const d = getStoredAnomalies(); if(d && d.items) showAnomalyReport(d.items); };
    document.body.appendChild(el);
  }
  const n = data.items.length;
  el.style.display = '';
  el.textContent = `⚠ ${n} item${n===1?'':'s'} from last import · Review`;
}

// Keep the badge correct as the user navigates between screens.
document.addEventListener('gb:screen', () => renderAnomalyBadge());
