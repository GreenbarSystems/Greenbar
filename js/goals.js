// ════ Greenbar — savings goals (on-device) ════
// User-defined savings targets with manually-tracked progress. Because Greenbar
// has no live account balances, "saved so far" is entered by the user; the
// cash-flow forecast's projected net then drives a "time to goal" estimate.
// Stored in localStorage under gb_goals (included in GB_KEYS / GB_BACKUP_KEYS so
// goals are backed up, restored and cleared with everything else).
//
// Globals used: showToast, renderAll, openModal, closeModal, closeOut, esc,
// _isQuotaErr, and gbForecast.compute (forecast.js) for the ETA.

const gbGoals = (() => {
  const K = 'gb_goals';
  const MAX = 12;
  const _money = n => gbMoneyAbs(n, 0);   // locale/currency-aware (core.js)

  // Drop any goal whose id isn't a plain alphanumeric token. Self-generated ids
  // always are, but gb_goals rides in backup/restore (an untrusted file), and
  // g.id is interpolated into inline onclick handlers + element ids — so a
  // crafted id like "');…//" would be an injection vector. Validating on load
  // closes it at the trust boundary.
  function _load(){
    try{
      const a = JSON.parse(localStorage.getItem(K));
      return Array.isArray(a) ? a.filter(g => g && typeof g.id === 'string' && /^[A-Za-z0-9]+$/.test(g.id)) : [];
    }catch(e){ return []; }
  }
  function _save(list){
    try{ localStorage.setItem(K, JSON.stringify(list)); return true; }
    catch(e){
      showToast((typeof _isQuotaErr==='function' && _isQuotaErr(e)) ? 'Storage full. Clear older months in Settings.' : 'Could not save your goals.', 'error');
      return false;
    }
  }
  function all(){ return _load(); }

  // ETA from a precomputed monthly net -> "~N months at your pace".
  function _eta(remaining, net){
    if(remaining <= 0) return null;
    if(net && net > 0) return { months: Math.ceil(remaining / net), perMonth: net };
    return null;
  }

  // ── CRUD ──
  function add(name, target, targetDate){
    name = String(name || '').trim().slice(0, 40);
    target = Math.round((parseFloat(target) || 0) * 100) / 100;
    if(!name){ showToast('Name your goal.', 'error'); return false; }
    if(!(target > 0)){ showToast('Enter a target amount above $0.', 'error'); return false; }
    const list = _load();
    if(list.length >= MAX){ showToast(`You can track up to ${MAX} goals.`, 'error'); return false; }
    list.push({
      id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name, target, saved: 0, targetDate: (targetDate || '') || null, created: Date.now()
    });
    if(!_save(list)) return false;
    render(); if(typeof renderAll === 'function') renderAll();
    showToast('Goal added.', 'success');
    return true;
  }

  function setSaved(id, amount){
    const list = _load(); const g = list.find(x => x.id === id); if(!g) return;
    let v = Math.round((parseFloat(amount) || 0) * 100) / 100;
    if(v < 0) v = 0;
    g.saved = v;
    if(!_save(list)) return;
    render(); if(typeof renderAll === 'function') renderAll();
  }

  async function remove(id){
    // Capacitor-aware confirm (native dialog in the app shell, window.confirm on web).
    if(!await gbDialog.confirm('Delete this goal? This cannot be undone.')) return;
    const list = _load().filter(x => x.id !== id);
    if(!_save(list)) return;
    render(); if(typeof renderAll === 'function') renderAll();
    showToast('Goal deleted.', 'success');
  }

  function addFromForm(){
    const name = document.getElementById('goal-name')?.value || '';
    const target = document.getElementById('goal-target')?.value || '';
    const date = document.getElementById('goal-date')?.value || '';
    if(add(name, target, date)){
      ['goal-name','goal-target','goal-date'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
      document.getElementById('goal-name')?.focus();
    }
  }

  // ── render ──
  function _goalCard(g, net){
    const pct = g.target > 0 ? Math.min(100, Math.round(g.saved / g.target * 100)) : 0;
    const remaining = Math.max(0, g.target - g.saved);
    const done = g.saved >= g.target && g.target > 0;
    const eta = !done ? _eta(remaining, net) : null;
    const bar = done ? 'var(--green)' : '#2979ff';
    const meta = done
      ? `<span style="color:var(--green);font-weight:700;">Reached 🎉</span>`
      : eta
        ? `${_money(remaining)} to go · ~${eta.months} month${eta.months===1?'':'s'} at your pace`
        : `${_money(remaining)} to go`;
    const dateLine = g.targetDate ? `<span style="color:var(--muted);"> · by ${esc(g.targetDate)}</span>` : '';
    return `
      <div class="section-card" style="margin-bottom:10px;">
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;">
          <div style="font-size:14px;font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(g.name)}</div>
          <button type="button" aria-label="Delete goal" onclick="gbGoals.remove('${g.id}')" style="background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;flex-shrink:0;padding:2px 4px;">✕</button>
        </div>
        <div style="height:8px;background:rgba(255,255,255,0.08);border-radius:5px;overflow:hidden;margin:8px 0 6px;">
          <div style="height:100%;width:${pct}%;background:${bar};border-radius:5px;transition:width .4s ease;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;">
          <span style="color:var(--soft);">${_money(g.saved)} of ${_money(g.target)} <strong>(${pct}%)</strong></span>
          <span style="color:var(--muted);font-size:11px;">${meta}${dateLine}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:10px;">
          <label for="goal-saved-${g.id}" style="font-size:11px;color:var(--muted);">Saved so far</label>
          <div style="position:relative;flex:1;max-width:140px;">
            <span style="position:absolute;left:9px;top:50%;transform:translateY(-50%);font-size:12px;color:var(--muted);">$</span>
            <input id="goal-saved-${g.id}" type="number" min="0" step="1" value="${g.saved}" inputmode="decimal"
              onchange="gbGoals.setSaved('${g.id}', this.value)" autocomplete="off"
              style="width:100%;background:var(--glass);border:1px solid var(--border);border-radius:10px;padding:7px 8px 7px 20px;color:var(--text);font-size:13px;font-weight:700;font-family:var(--font-display);outline:none;">
          </div>
        </div>
      </div>`;
  }

  function render(){
    const body = document.getElementById('goals-body');
    if(!body) return;
    const list = _load();
    // Forecast net is identical for every goal — compute it once per render
    // instead of once per card.
    const net = (typeof gbForecast !== 'undefined' && gbForecast.compute)
      ? ((gbForecast.compute() || {}).projectedNet) : null;
    body.innerHTML = list.length
      ? list.map(g => _goalCard(g, net)).join('')
      : `<div style="text-align:center;color:var(--muted);font-size:13px;padding:18px 4px;line-height:1.6;">No goals yet. Add one below — a vacation, an emergency fund, a big purchase.</div>`;
  }

  function openGoals(){ render(); openModal('modal-goals'); }

  // ── Summary card ──
  function cardHTML(){
    const list = _load();
    if(!list.length){
      return `
        <h2 class="sec-hdr">Savings Goals</h2>
        <button type="button" onclick="gbGoals.openGoals()" aria-label="Set a savings goal"
          style="width:100%;text-align:center;background:var(--glass);border:1px dashed var(--border);border-radius:18px;padding:16px;margin-bottom:14px;cursor:pointer;color:var(--soft);font-size:13px;">
          <span style="color:var(--green);font-weight:800;font-family:var(--font-display);">＋ Set a savings goal</span><br>
          <span style="font-size:12px;color:var(--muted);">Track a vacation, emergency fund or big purchase.</span>
        </button>`;
    }
    // Show the two largest-remaining goals compactly + manage entry point.
    const top = list.slice().sort((a,b)=>(b.target-b.saved)-(a.target-a.saved)).slice(0, 2);
    const rows = top.map(g => {
      const pct = g.target > 0 ? Math.min(100, Math.round(g.saved / g.target * 100)) : 0;
      const done = g.saved >= g.target && g.target > 0;
      return `
        <div style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px;">
            <span style="font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(g.name)}</span>
            <span style="color:var(--muted);">${_money(g.saved)} / ${_money(g.target)} (${pct}%)</span>
          </div>
          <div style="height:6px;background:rgba(255,255,255,0.08);border-radius:4px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${done?'var(--green)':'#2979ff'};border-radius:4px;"></div>
          </div>
        </div>`;
    }).join('');
    const more = list.length > top.length ? ` (${list.length})` : '';
    return `
      <h2 class="sec-hdr">Savings Goals</h2>
      <button type="button" onclick="gbGoals.openGoals()" aria-label="Manage savings goals"
        style="width:100%;text-align:left;background:var(--glass);border:1px solid var(--border);border-radius:18px;padding:16px 16px 8px;margin-bottom:14px;cursor:pointer;">
        ${rows}
        <div style="text-align:right;color:var(--green);font-size:12px;font-weight:700;font-family:var(--font-display);">Manage goals${more} &rsaquo;</div>
      </button>`;
  }

  return { all, add, setSaved, remove, addFromForm, render, openGoals, cardHTML };
})();
