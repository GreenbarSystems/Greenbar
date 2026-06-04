// ════ Greenbar — Import Confidence layer (gbConfidence) ════
// The trust spine of the app. Everything the user needs to TRUST the numbers —
// where they came from, how recently, how much was skipped, and what still
// needs a human look — is derived here from the canonical data (_allTxs) and the
// upload log (gb_log). Pure data/derivation in Phase 1; the trust bar, the
// Confidence Center screen and the "explain this number" drilldowns (Phases 2–4)
// read from these helpers so there is a single source of truth for trust.
//
// Confidence convention (see state.js Tx contract): a transaction with no `conf`
// field is high-confidence; `conf:'low' + needsReview:true` marks a row that was
// parsed with low confidence (e.g. a PDF with no clear table header). A row
// leaves the review queue when `reviewed:true` is set.
const gbConfidence = (() => {

  // Active date format, defensively (CFG may not be loaded in odd states).
  function _fmt(){ return (typeof CFG !== 'undefined' && CFG.cols && CFG.cols.fmt) || 'MM/DD/YY'; }

  // Human label for a transaction's date (e.g. "May 14, 2026"), falling back to
  // the raw string when it can't be parsed.
  function _label(tx){
    if(!tx) return '';
    if(typeof parseDateParts === 'function'){
      const pd = parseDateParts(tx.date, _fmt());
      if(pd && pd.label) return pd.label;
    }
    return tx.date || '';
  }

  function _txs(){ return (typeof _allTxs !== 'undefined' && _allTxs) ? _allTxs : []; }
  function _log(){ return (typeof getLog === 'function') ? getLog() : []; }

  // Earliest / latest transaction across the supplied set (defaults to all).
  // Uses tx.ts (YYYYMMDD integer); rows lacking ts are ignored for the bounds.
  function dateRange(txs){
    txs = txs || _txs();
    let lo = Infinity, hi = -Infinity, loTx = null, hiTx = null;
    for(const t of txs){
      const ts = (typeof t.ts === 'number') ? t.ts : null;
      if(ts === null) continue;
      if(ts < lo){ lo = ts; loTx = t; }
      if(ts > hi){ hi = ts; hiTx = t; }
    }
    if(loTx === null) return null;
    return {
      firstTs: lo, lastTs: hi,
      firstLabel: _label(loTx), lastLabel: _label(hiTx),
      firstMonth: loTx.month || '', lastMonth: hiTx.month || '',
    };
  }

  // ──────── Expanded review queue ────────
  // Beyond low-confidence parse rows, surface anything worth a human glance:
  // duplicates, suspicious +/- signs, transfers, large outliers, uncategorized
  // rows, and merchants new to your history. Each transaction yields at most one
  // item (highest-priority kind). A row leaves the queue when the user marks it
  // reviewed (tx.reviewed) or fixes the underlying issue (e.g. categorizes it).
  const _REVIEW_LABELS = {
    lowconf:       { title: 'Low-confidence parse',       note: 'Read from a layout with no clear table — double-check these.' },
    duplicate:     { title: 'Possible duplicate payments', note: 'Same merchant and amount within a few days.' },
    sign:          { title: 'Check the + / − sign',        note: 'The amount sign looks unusual for this kind of row.' },
    transfer:      { title: 'Possible transfers',          note: 'Looks like money moved between accounts, not spending.' },
    outlier:       { title: 'Large outliers',              note: 'Much bigger than usual for the category.' },
    uncategorized: { title: 'Uncategorized',               note: 'No category yet — assign one so it counts correctly.' },
    newmerchant:   { title: 'New merchants',               note: 'First time this merchant has appeared in your data.' },
  };
  const _REVIEW_ORDER = ['lowconf','duplicate','sign','transfer','outlier','uncategorized','newmerchant'];
  const _TRANSFER_RE = /\b(transfer|xfer|to savings|from savings|to checking|credit card payment|online transfer|internal transfer|account transfer|wire|ach\s+(?:transfer|debit|credit)|zelle|venmo|cash ?app|e-?transfer|interac)\b/i;
  let _reviewCache = null, _reviewCacheVer = -1;
  function _median(arr){ if(!arr.length) return 0; const s = arr.slice().sort((a,b)=>a-b), n = s.length, m = n>>1; return n%2 ? s[m] : (s[m-1]+s[m])/2; }
  function _computeReviewItems(){
    const txs = _txs();
    const items = []; const seen = new Set();
    const add = (t, kind) => { if(seen.has(t.id)) return; seen.add(t.id); items.push({ id: t.id, tx: t, kind }); };
    // Possible duplicates — reuse the clean-up scanner (vendor + amount within 3 days).
    const dupIds = new Set();
    try { if(typeof gbCleanup !== 'undefined' && gbCleanup.scanDuplicates) gbCleanup.scanDuplicates().forEach(d => dupIds.add(String(d.id))); } catch(_){}
    // Per-category expense magnitudes (outliers) + vendor groups (new merchants).
    const catAmts = {}, byVendor = {};
    const latestId = (() => { const l = _log(); return l[0] ? String(l[0].id) : null; })();
    let hasHistoryOutsideLatest = false;
    for(const t of txs){
      if(!t.isIncome && t.amount < 0){ (catAmts[t.cat] = catAmts[t.cat] || []).push(Math.abs(t.amount)); }
      (byVendor[_vendor(t).toUpperCase()] = byVendor[_vendor(t).toUpperCase()] || []).push(t);
      if(latestId && String(t.imp) !== latestId) hasHistoryOutsideLatest = true;
    }
    const catMed = {}; for(const c in catAmts) catMed[c] = _median(catAmts[c]);
    for(const t of txs){
      if(t.reviewed || seen.has(t.id)) continue;
      if(t.transfer) continue;   // already resolved as a transfer — excluded, nothing to review
      if(t.needsReview){ add(t, 'lowconf'); continue; }
      if(dupIds.has(String(t.id))){ add(t, 'duplicate'); continue; }
      // Suspicious sign: income shown as negative, or a sizable positive in a spend category.
      if((t.isIncome && t.amount < 0) || (!t.isIncome && t.amount > 0 && Math.abs(t.amount) >= 100)){ add(t, 'sign'); continue; }
      if(!t.transferLocked && _TRANSFER_RE.test(t.desc || '')){ add(t, 'transfer'); continue; }
      if(!t.isIncome && t.amount < 0){
        const arr = catAmts[t.cat];
        if(arr && arr.length >= 4){ const med = catMed[t.cat]; if(med > 0 && Math.abs(t.amount) >= Math.max(250, med * 4)){ add(t, 'outlier'); continue; } }
      }
      if(!t.isIncome && t.cat === 'Uncategorized'){ add(t, 'uncategorized'); continue; }
      // New merchant: a vendor that only exists in the latest import, once there
      // is prior history to be "new" relative to (silent on the very first import).
      if(latestId && hasHistoryOutsideLatest){
        const grp = byVendor[_vendor(t).toUpperCase()];
        if(grp && grp[0].id === t.id && grp.every(x => String(x.imp) === latestId)){ add(t, 'newmerchant'); continue; }
      }
    }
    return items;
  }
  // Memoized against _dataVersion (bumped by saveData/rebuildMonths) so the trust
  // bar can call it on every render without re-scanning until the data changes.
  function reviewItems(){
    const ver = (typeof _dataVersion !== 'undefined') ? _dataVersion : -1;
    if(_reviewCache && _reviewCacheVer === ver) return _reviewCache;
    _reviewCache = _computeReviewItems(); _reviewCacheVer = ver;
    return _reviewCache;
  }
  // The flat set of transactions needing review (drives every count + "mark all").
  function reviewQueue(){ return reviewItems().map(i => i.tx); }

  // ──────── Status taxonomy ────────
  // "Verified" overclaimed — it read as strong evidence when it only meant
  // "nothing is currently flagged." This returns the strongest claim we can
  // honestly back up:
  //   Needs review — something is flagged in the queue.
  //   Reconciled   — every account with data is anchored to a statement closing
  //                  balance (the user tied the numbers to a real statement).
  //   Reviewed     — nothing flagged AND a human has cleared flagged rows.
  //   Clean        — nothing flagged (the baseline; weakest — not "verified").
  // (Unreconciled is the implicit state behind Clean/Reviewed: data exists but
  //  isn't anchored to a statement balance — we just don't dress it up.)
  function statusLabel(){
    if(!_txs().length) return null;
    if(reviewQueue().length > 0) return { label: 'Needs review', tone: 'review' };
    // Reconciliation: only claimed when the imported data actually matches the
    // statement balances (gbReconcile verifies opening + net == closing).
    const rec = (typeof gbReconcile !== 'undefined' && gbReconcile.status) ? gbReconcile.status() : null;
    if(rec === 'unreconciled') return { label: 'Unreconciled', tone: 'review' };
    if(rec === 'reconciled')   return { label: 'Reconciled',   tone: 'ok' };
    if(_txs().some(t => t.reviewed)) return { label: 'Reviewed',  tone: 'ok' };
    return { label: 'Clean', tone: 'ok' };
  }

  // Headline trust metadata for the trust bar + Confidence Center header.
  function trustSummary(){
    const log = _log();
    const skippedTotal = log.reduce((s, e) => s + (e.skipped || 0), 0);
    return {
      txCount:     _txs().length,
      dateRange:   dateRange(),
      lastImport:  log[0] ? { date: log[0].date, filename: log[0].filename } : null,
      importCount: log.length,
      skippedTotal: skippedTotal,
      reviewCount: reviewQueue().length,
    };
  }

  // Normalize a parse result into a confidence verdict for the import preview.
  // level: 'high' (clean) | 'mixed' (some rows flagged) | 'low' (all flagged).
  function importConfidence(result){
    result = result || {};
    const c = result.counts || {};
    const txs = result.txs || [];
    const low = txs.reduce((n, t) => n + (t.needsReview ? 1 : 0), 0);
    let level = result.confidence || (low ? 'low' : 'high');
    if(low > 0 && low < txs.length) level = 'mixed';
    const reasons = (result.reasons || []).slice();
    if(result.warn && reasons.indexOf(result.warn) === -1 && !reasons.length) reasons.push(result.warn);
    return { level, reasons, lowConfCount: low, skipped: c.skipped || 0, undated: c.undated || 0 };
  }

  // Mark a single row reviewed (clears it from the queue) and persist.
  function markReviewed(id){
    const tx = _txs().find(t => t.id === id);
    if(tx && !tx.reviewed){ tx.reviewed = true; if(typeof saveData === 'function') saveData(); return true; }
    return false;
  }

  // Clear the whole queue at once. Returns how many rows were marked.
  function markAllReviewed(){
    let n = 0;
    for(const t of reviewQueue()){ t.reviewed = true; n++; }
    if(n && typeof saveData === 'function') saveData();
    return n;
  }

  // ──────── Views & actions (Phase 2) ────────
  const _money  = (n) => gbMoney(n);    // -> core.js
  const _vendor = (tx) => gbVendor(tx); // -> core.js
  const _rangeLabel = (dr) => !dr ? '—' : (dr.firstMonth === dr.lastMonth ? dr.firstMonth : (dr.firstMonth + ' – ' + dr.lastMonth));

  // Compact, accountant-style strip pinned to the top of Summary. Shows no
  // amounts (counts/dates only) so it's safe under privacy mode.
  function renderTrustBar(){
    const s = trustSummary();
    if(!s.txCount) return '';
    const line2 = [];
    if(s.lastImport) line2.push('Imported ' + s.lastImport.date);
    if(s.skippedTotal) line2.push(s.skippedTotal + ' skipped');
    const st = statusLabel();
    const pill = s.reviewCount
      ? `<span class="tb-pill review">${s.reviewCount} to review</span>`
      : (st ? `<span class="tb-pill ok">&#10003; ${esc(st.label)}</span>` : '');
    return `<button type="button" class="trust-bar" onclick="gbConfidence.open()" aria-label="Open Import Confidence Center: ${s.txCount} transaction${s.txCount===1?'':'s'}${s.reviewCount?(', '+s.reviewCount+' to review'):''}">
      <span class="tb-grow">
        <span class="tb-l1">${esc(_rangeLabel(s.dateRange))} <span class="tb-dot">&middot;</span> ${s.txCount} transaction${s.txCount===1?'':'s'}</span>
        ${line2.length?`<span class="tb-l2">${esc(line2.join(' · '))}</span>`:''}
      </span>
      ${pill}
      <span class="tb-chev" aria-hidden="true">&rsaquo;</span>
    </button>`;
  }

  // Persistent, prominent nag shown above the trust bar on Summary whenever the
  // review queue is non-empty — it stays until every flagged row is cleared.
  function renderReviewBanner(){
    const n = reviewQueue().length;
    if(!n) return '';
    return `<button type="button" class="review-banner" onclick="gbConfidence.open()" aria-label="Review ${n} low-confidence transaction${n===1?'':'s'}">
      <span class="rb-icon" aria-hidden="true">&#9888;</span>
      <span class="rb-text"><strong>${n} transaction${n===1?'':'s'} need${n===1?'s':''} review</strong><span class="rb-sub">A few rows could use a quick check — tap to review.</span></span>
      <span class="rb-cta" aria-hidden="true">Review &rsaquo;</span>
    </button>`;
  }

  function open(){
    if(typeof showScreen === 'function') showScreen('confidence');
    renderCenter();
  }

  // ──────── Post-import receipt ────────
  // A committed-import summary shown OVER the dashboard after every import (even
  // clean ones): how many landed, from which file(s), the period, what was
  // dropped, and the verification status. onDismiss runs when the receipt closes
  // (used to defer anomaly detection so its report never fights the receipt).
  let _receiptOnDismiss = null;
  function showReceipt(s, onDismiss){
    if(!s) return;
    _receiptOnDismiss = (typeof onDismiss === 'function') ? onDismiss : null;
    const months = [...(s.months || [])];
    const mkObj = {}; months.forEach(k => { mkObj[k] = true; });
    const ordered = (typeof sortKeys === 'function') ? sortKeys(mkObj) : months;
    const range = ordered.length ? (ordered[0] === ordered[ordered.length-1] ? ordered[0] : ordered[0] + ' – ' + ordered[ordered.length-1]) : '—';
    const fileLabel = (s.files && s.files.length === 1) ? s.files[0] : ((s.files ? s.files.length : 0) + ' files');
    const accts = [...(s.accounts || [])];
    const acctLabel = accts.length === 1 ? accts[0] : (accts.length + ' accounts');
    // Prefer the broader review count (low-confidence + duplicates + signs + …)
    // for this batch; fall back to the parse-only low-confidence count.
    const flagged = (s.reviewCount != null) ? s.reviewCount : (s.lowConf || 0);
    const clean = !flagged;
    const check = document.getElementById('receipt-check');
    if(check){ check.className = 'receipt-check' + (clean ? '' : ' flag'); check.innerHTML = clean ? '&#10003;' : '&#9888;'; }
    const title = document.getElementById('receipt-title');
    if(title) title.textContent = clean ? 'Import complete' : 'Imported — review needed';
    const drops = [];
    if(s.skipped) drops.push(s.skipped + ' skipped');
    if(s.undated) drops.push(s.undated + ' undated date' + (s.undated === 1 ? '' : 's'));
    const row = (l, v, cls) => `<div class="receipt-row"><span class="rr-l">${esc(l)}</span><span class="rr-v ${cls||''}">${v}</span></div>`;
    const body = document.getElementById('receipt-body');
    if(body){
      body.innerHTML =
        `<div class="receipt-big">${s.txCount} transaction${s.txCount === 1 ? '' : 's'}</div>`
        + `<div class="receipt-big-sub">added to your data</div>`
        + `<div class="receipt-rows">`
        + row((s.files && s.files.length > 1) ? 'Files' : 'File', esc(fileLabel))
        + (accts.length ? row(accts.length > 1 ? 'Accounts' : 'Account', esc(acctLabel)) : '')
        + row(months.length > 1 ? 'Months' : 'Month', esc(range))
        + (drops.length ? row('Dropped', esc(drops.join(' · ')), 'flag') : '')
        + row('Status', clean ? '&#10003; All clear' : (flagged + ' to review'), clean ? 'ok' : 'flag')
        + `</div>`
        // First-run wizard import: point the user to the Import button for next time.
        + (s.fromWizard ? `<div class="receipt-tip">That's it! Next time, import anytime with the <strong>Import</strong> button at the top — no wizard needed.</div>` : '');
    }
    const actions = document.getElementById('receipt-actions');
    if(actions){
      actions.innerHTML = flagged
        ? `<button type="button" class="btn-primary" style="margin:0 0 10px;" onclick="gbConfidence.dismissReceipt(); gbConfidence.open();">Review ${flagged} &rarr;</button>`
          + `<button type="button" class="btn-secondary" style="margin:0;" onclick="gbConfidence.dismissReceipt()">Go to dashboard</button>`
        : `<button type="button" class="btn-primary" style="margin:0;" onclick="gbConfidence.dismissReceipt()">View dashboard</button>`;
    }
    if(typeof openModal === 'function') openModal('modal-import-receipt');
  }
  function dismissReceipt(){
    if(typeof closeModal === 'function') closeModal('modal-import-receipt');
    const cb = _receiptOnDismiss; _receiptOnDismiss = null;
    if(typeof cb === 'function'){ try{ cb(); }catch(_){} }
  }

  // Keep the Settings → Import Confidence Center badge in sync with the queue.
  function updateBadge(){
    const b = document.getElementById('icc-badge');
    if(!b) return;
    const n = reviewQueue().length;
    if(n){ b.style.display = ''; b.textContent = n + ' to review'; }
    else b.style.display = 'none';
  }

  function _confBadge(level){
    if(level === 'low')   return `<span class="conf-badge low">Low confidence</span>`;
    if(level === 'mixed') return `<span class="conf-badge mixed">Needs review</span>`;
    return `<span class="conf-badge high">Clean</span>`;
  }
  function _statTile(label, value){
    return `<div class="conf-stat"><div class="conf-stat-v">${value}</div><div class="conf-stat-l">${esc(label)}</div></div>`;
  }
  // One review-queue row. "Looks right" marks it reviewed; the secondary action
  // is "Remove" for a duplicate, otherwise "Fix" (the per-tx category editor).
  function _reviewRowHTML(it){
    const t = it.tx;
    const lbl = (typeof parseDateParts === 'function' ? (parseDateParts(t.date, _fmt()) || {}).label : '') || t.date || '';
    const cat = t.isIncome ? 'Income' : t.cat;
    const second = it.kind === 'duplicate'
      ? `<button type="button" class="conf-fix" onclick="gbConfidence.removeDup('${esc(t.id)}')">Remove</button>`
      : `<button type="button" class="conf-fix" onclick="gbConfidence.resolveRow('${esc(t.id)}',true)">Fix</button>`;
    return `<div class="conf-row">
      <div class="conf-row-main">
        <div class="conf-row-v">${esc(_vendor(t))}</div>
        <div class="conf-row-s">${esc(lbl)} &middot; ${esc(cat)}</div>
      </div>
      <div class="tx-amt ${t.amount<0?'neg':'pos'}">${t.amount<0?'−':'+'}${_money(t.amount)}</div>
      <div class="conf-row-acts">
        <button type="button" class="conf-ok" onclick="gbConfidence.resolveRow('${esc(t.id)}',false)" aria-label="Looks right">&#10003;</button>
        ${second}
      </div>
    </div>`;
  }

  function renderCenter(){
    const host = document.getElementById('confidence-content');
    if(!host) return;
    updateBadge();
    const s = trustSummary();
    if(!s.txCount){
      host.innerHTML = `<div class="conf-empty">No data imported yet.<br><button type="button" class="link-btn" onclick="startFirstImport && startFirstImport()">Import bank transactions &rarr;</button></div>`;
      return;
    }

    // 1) Trust summary
    const summaryHtml = `
      <div class="conf-stats">
        ${_statTile('Transactions', s.txCount)}
        ${_statTile('Date range', `<span style="font-size:14px;">${esc(_rangeLabel(s.dateRange))}</span>`)}
        ${_statTile('Imports', s.importCount)}
        ${_statTile('Skipped rows', s.skippedTotal)}
      </div>
      ${s.lastImport?`<div class="conf-lastimport">Last import: <strong>${esc(s.lastImport.filename)}</strong> &middot; ${esc(s.lastImport.date)}</div>`:''}`;

    // 2) Review queue — grouped by category.
    const log = (typeof getLog === 'function') ? getLog() : [];
    const items = reviewItems();
    let reviewHtml;
    if(items.length){
      const groups = {};
      items.forEach(it => { (groups[it.kind] = groups[it.kind] || []).push(it); });
      const groupsHtml = _REVIEW_ORDER.filter(k => groups[k]).map(k => {
        const lab = _REVIEW_LABELS[k];
        const footer = (k === 'transfer' && typeof gbTransfers !== 'undefined')
          ? `<button type="button" class="conf-allbtn" style="margin-top:8px;" onclick="gbTransfers.open()">Resolve transfers &rarr;</button>`
          : '';
        return `<div class="conf-card">
          <div class="conf-card-top"><div class="conf-card-file">${esc(lab.title)} <span class="conf-count amber">${groups[k].length}</span></div></div>
          <div class="conf-note" style="margin:5px 0 2px;">${esc(lab.note)}</div>
          ${groups[k].map(_reviewRowHTML).join('')}
          ${footer}
        </div>`;
      }).join('');
      reviewHtml = `
        <div class="conf-section-head">
          <h2 class="conf-h2">Needs review <span class="conf-count amber">${items.length}</span></h2>
          <button type="button" class="conf-allbtn" onclick="gbConfidence.reviewAll()">Mark all reviewed</button>
        </div>
        <div class="conf-note">Rows worth a second look. Confirm each, fix a category, or remove a duplicate.</div>
        ${groupsHtml}`;
    } else {
      reviewHtml = `
        <h2 class="conf-h2">Needs review</h2>
        <div class="conf-allclear">&#10003; Everything looks good — nothing needs your attention.</div>`;
    }

    // 3) Import history (enhanced)
    const histHtml = log.length ? `
      <h2 class="conf-h2">Import history</h2>
      ${log.map(e => {
        const undoable = (typeof _allTxs !== 'undefined') && (_allTxs || []).some(t => String(t.imp) === String(e.id));
        const range = e.dateRange ? _rangeLabel(e.dateRange) : (e.months || '');
        const drops = [];
        if(e.skipped) drops.push(e.skipped + ' skipped');
        if(e.undated) drops.push(e.undated + ' undated');
        if(e.lowConfCount) drops.push(e.lowConfCount + ' low-confidence');
        return `<div class="conf-card">
          <div class="conf-card-top">
            <div class="conf-card-file">${esc(e.filename)}</div>
            ${_confBadge(e.confidence || 'high')}
          </div>
          <div class="conf-card-meta">${e.account?`<strong style="color:var(--soft);">${esc(e.account)}</strong> &middot; `:''}${esc(String(e.txCount))} txn${e.txCount===1?'':'s'} &middot; ${esc(range)} &middot; ${esc(e.date)}</div>
          ${drops.length?`<div class="conf-card-drops">${esc(drops.join(' · '))}</div>`:''}
          ${(typeof gbReconcile !== 'undefined') ? `<div class="conf-rec">${gbReconcile.badgeHTML(e)}</div>` : ''}
          ${undoable?`<button type="button" class="conf-undo" onclick="gbConfidence.undo('${esc(String(e.id))}')">Undo this import</button>`:''}
        </div>`;
      }).join('')}` : '';

    host.innerHTML = summaryHtml + reviewHtml + histHtml;
  }

  // Per-row resolution. Marking reviewed clears it from the queue; openFix also
  // launches the existing per-transaction category editor (fixing == verifying).
  function resolveRow(id, openFix){
    markReviewed(id);
    renderCenter();
    if(typeof renderAll === 'function') renderAll();   // refresh the Summary trust bar too
    if(openFix && typeof openRecatModal === 'function') openRecatModal(id);
  }
  function reviewAll(){
    const n = markAllReviewed();
    renderCenter();
    if(typeof renderAll === 'function') renderAll();
    if(n && typeof showToast === 'function') showToast(n + ' row' + (n===1?'':'s') + ' marked reviewed', 'success');
  }
  async function undo(id){
    if(typeof gbCleanup !== 'undefined' && gbCleanup.undoImport){
      const ok = await gbCleanup.undoImport(id);
      if(ok) renderCenter();
    }
  }
  // Remove a possible-duplicate row from the queue (delegates to the clean-up
  // module's confirm + delete), then refresh the Center.
  async function removeDup(id){
    if(typeof gbCleanup !== 'undefined' && gbCleanup.removeDuplicate){
      await gbCleanup.removeDuplicate(id);
      renderCenter();
    }
  }

  // ──────── "Explain this number" drilldowns ────────
  // Every headline total is auditable: explain(kind, mk) decomposes a number into
  // its parts and the exact transactions behind it; renderExplain paints the
  // shared #modal-explain. Amounts use the privacy-blurred classes (cat-amt /
  // tx-amt / bva-num) so "hide amounts" mode applies here too.
  function _monthOf(mk){
    if(mk && mk !== '__all' && typeof _months !== 'undefined' && _months[mk]) return { m: _months[mk], label: mk };
    const all = (typeof aggregateOneMonth === 'function') ? aggregateOneMonth(_txs()) : { income: 0, expenses: {}, txs: _txs() };
    return { m: all, label: 'all months' };
  }
  function explain(kind, mk){
    const { m, label } = _monthOf(mk);
    const monthTxs = (m && m.txs) ? m.txs : [];
    const exp = (typeof sumExpenses === 'function') ? sumExpenses(m) : Object.values(m.expenses || {}).reduce((s, v) => s + v, 0);
    if(kind === 'income'){
      const inc = monthTxs.filter(t => t.isIncome && !t.transfer);
      const byV = {}; inc.forEach(t => { const v = _vendor(t); byV[v] = (byV[v] || 0) + t.amount; });
      return { kind, title: 'Income — ' + label, total: (m.income || 0), totalSign: '+',
        formula: 'Income is every deposit tagged by your income keywords this month.',
        lines: Object.entries(byV).sort((a, b) => b[1] - a[1]).map(([v, a]) => ({ label: v, amount: a })), txs: inc };
    }
    if(kind === 'net'){
      const net = (m.income || 0) - exp;
      return { kind, title: 'Net — ' + label, total: net, totalSign: net >= 0 ? '+' : '−',
        formula: 'Net is your income minus total spending this month.',
        lines: [{ label: 'Income', amount: (m.income || 0) }, { label: 'Spending', amount: exp }], txs: monthTxs };
    }
    if(kind === 'budget'){
      const b = (typeof CFG !== 'undefined' && CFG.budget) || {};
      const ents = Object.entries(b).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
      return { kind, title: 'Monthly budget', total: ents.reduce((s, [, v]) => s + v, 0), totalSign: '',
        formula: 'Your monthly plan is the sum of the per-category targets you set in Settings → Monthly Budget Targets.',
        lines: ents.map(([cat, v]) => ({ label: cat, amount: v })), txs: [], noTxs: true };
    }
    if(kind === 'variance'){
      const b = (typeof CFG !== 'undefined' && CFG.budget) || {};
      const budTotal = Object.values(b).reduce((s, v) => s + (v > 0 ? v : 0), 0);
      const cats = new Set([...Object.keys(b), ...Object.keys(m.expenses || {})]);
      const lines = [...cats].map(cat => ({ label: cat, target: b[cat] || 0, actual: (m.expenses && m.expenses[cat]) || 0 }))
        .filter(l => l.target > 0 || l.actual > 0).map(l => ({ ...l, delta: l.target - l.actual })).sort((a, b) => b.actual - a.actual);
      return { kind, title: 'Budget vs actual — ' + label, total: budTotal - exp, totalSign: (budTotal - exp) >= 0 ? '+' : '−',
        formula: 'Variance is your total budget minus what you actually spent. Positive means under budget.',
        lines, txs: [], variance: true, noTxs: true };
    }
    // default: expenses
    const cats = Object.entries(m.expenses || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    return { kind: 'expenses', title: 'Spending — ' + label, total: exp, totalSign: '−',
      formula: 'Total spending is the sum of every spending category this month. Tap a category to see the merchants behind it.',
      lines: cats.map(([cat, v]) => ({ label: cat, amount: v, cat })), txs: monthTxs.filter(t => !t.isIncome && t.amount < 0 && !t.transfer) };
  }
  // Distinct source files behind a set of rows (via tx.imp → gb_log).
  function _sourceImports(txs){
    if(!txs || !txs.length) return '';
    const log = (typeof getLog === 'function') ? getLog() : [];
    const ids = new Set(); txs.forEach(t => { if(t.imp) ids.add(String(t.imp)); });
    const names = [...ids].map(id => { const e = log.find(x => String(x.id) === id); return e ? e.filename : null; }).filter(Boolean);
    const uniq = [...new Set(names)];
    if(!uniq.length) return '';
    return uniq.length <= 2 ? uniq.join(', ') : (uniq.slice(0, 2).join(', ') + ' +' + (uniq.length - 2) + ' more');
  }
  function renderExplain(kind, mk){
    const d = explain(kind, mk); if(!d) return;
    const t = document.getElementById('explain-title'); if(t) t.textContent = d.title;
    let linesHtml = '';
    if(d.variance){
      linesHtml = d.lines.map(l => { const over = l.delta < 0; return `<div class="ex-row">
        <div class="ex-row-l">${esc(l.label)}</div>
        <div class="ex-vnum"><span class="bva-num">${_money(l.actual)}</span> <span class="ex-of">/ ${_money(l.target)}</span></div>
        <div class="bva-num ${over?'v-over':'v-under'}" style="text-align:right;min-width:60px;">${over?'−':'+'}${_money(Math.abs(l.delta))}</div></div>`; }).join('');
    } else {
      linesHtml = d.lines.map(l => { const c = l.cat ? ` onclick="closeModal('modal-explain');showVendorDrill('${esc(l.cat)}')" role="button" tabindex="0" style="cursor:pointer;"` : '';
        return `<div class="ex-row"${c}><div class="ex-row-l">${esc(l.label)}</div><div class="ex-row-a"><span class="cat-amt">${_money(l.amount)}</span>${l.cat?'<span class="ex-chev">&rsaquo;</span>':''}</div></div>`; }).join('');
    }
    const totLabel = d.kind === 'variance' ? 'Variance' : (d.kind === 'budget' ? 'Total plan' : (d.kind === 'net' ? 'Net' : 'Total'));
    const totalHtml = `<div class="ex-total"><span>${totLabel}</span><span class="cat-amt ex-total-v">${d.totalSign}${_money(Math.abs(d.total))}</span></div>`;
    let txsHtml = '';
    if(!d.noTxs && d.txs && d.txs.length){
      const f = _fmt();
      const sorted = d.txs.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
      const cap = 80, shown = sorted.slice(0, cap);
      txsHtml = `<div class="ex-h">Transactions <span class="ex-count">${d.txs.length}</span></div>` +
        shown.map(tx => { const lbl = (typeof parseDateParts === 'function' ? (parseDateParts(tx.date, f) || {}).label : '') || tx.date || '';
          return `<div class="ex-tx"><div class="ex-tx-main"><div class="ex-tx-v">${esc(_vendor(tx))}${tx.needsReview?' <span class="ex-flag">unverified</span>':''}</div><div class="ex-tx-s">${esc(lbl)} &middot; ${esc(tx.isIncome?'Income':tx.cat)}</div></div><div class="tx-amt ${tx.amount<0?'neg':'pos'}">${tx.amount<0?'−':'+'}${_money(tx.amount)}</div></div>`; }).join('') +
        (d.txs.length > cap ? `<div class="ex-more">Showing ${cap} of ${d.txs.length}. Open the Transactions tab for the full list.</div>` : '');
    }
    const src = _sourceImports(d.txs);
    const fnHtml = src ? `<div class="ex-foot">Source: ${esc(src)}</div>` : '';
    const body = document.getElementById('explain-body');
    if(body) body.innerHTML = `<div class="ex-formula">${esc(d.formula)}</div>${linesHtml?`<div class="ex-lines">${linesHtml}</div>`:''}${totalHtml}${txsHtml}${fnHtml}`;
    if(typeof openModal === 'function') openModal('modal-explain');
  }
  function openExplain(kind, mk){ renderExplain(kind, mk); }

  // Re-render when the user navigates to the Center (the trust-bar tap dispatches
  // gb:screen via showScreen). Refresh the Settings badge on every screen change.
  if(typeof document !== 'undefined'){
    document.addEventListener('gb:screen', (e) => {
      if(e.detail && e.detail.name === 'confidence') renderCenter();
      updateBadge();
    });
  }

  return { dateRange, reviewQueue, reviewItems, trustSummary, statusLabel, importConfidence, markReviewed, markAllReviewed,
           renderTrustBar, renderReviewBanner, renderCenter, open, resolveRow, reviewAll, undo, removeDup, updateBadge,
           explain, renderExplain, openExplain, showReceipt, dismissReceipt };
})();
