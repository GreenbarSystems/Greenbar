// ════ Greenbar — core: util, storage, parsing, import, modals, nav, toast ════
// Foundational layer. Loaded after state.js. render.js / features.js / security.js
// / boot.js all depend on the functions defined here.

// ──────── gbDialog: native confirm/alert via Capacitor when present ────────
// When running inside the Capacitor shell (iOS/Android), prompts route through
// @capacitor/dialog so the user gets a native system alert/confirm instead of
// a browser sheet. Outside Capacitor (web preview, Pages site), falls back to
// the browser's window.confirm / window.alert. All API surface is async so
// callers can `await gbDialog.confirm(...)` uniformly across both modes.
const gbDialog = {
  async confirm(message, title='Greenbar'){
    const cap = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Dialog;
    if(cap){
      try{
        const r = await cap.confirm({ title, message });
        return !!r.value;
      }catch(e){ return false; }
    }
    return window.confirm(message);
  },
  async alert(message, title='Greenbar'){
    const cap = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Dialog;
    if(cap){
      try{ await cap.alert({ title, message }); }catch(e){}
      return;
    }
    window.alert(message);
  },
};

// ──────── Storage: load/save config + quota helpers ────────
function loadCFG(){
  try{
    const s=localStorage.getItem('gb_cfg2');
    if(s){
      // Merge the saved config over a fresh copy of DEFAULTS so a config written
      // by an older version (missing newer keys) can't break syncUI()/processCSV().
      const saved=JSON.parse(s);
      CFG=Object.assign(JSON.parse(JSON.stringify(DEFAULTS)),saved);
      CFG.cols=Object.assign({},DEFAULTS.cols,saved.cols||{});
    }
  }catch(e){}
  // Type-validate every CFG field. If localStorage was corrupted (e.g. CFG.budget
  // was overwritten with a string), later code that does Object.keys(CFG.budget)
  // would throw "Cannot convert undefined to object" and crash the screen.
  // Coerce each field back to its expected shape, falling through to DEFAULTS.
  const isObj=v=>v!==null && typeof v==='object' && !Array.isArray(v);
  if(!isObj(CFG))            CFG = JSON.parse(JSON.stringify(DEFAULTS));
  if(!isObj(CFG.cols))       CFG.cols   = JSON.parse(JSON.stringify(DEFAULTS.cols));
  if(!isObj(CFG.budget))     CFG.budget = JSON.parse(JSON.stringify(DEFAULTS.budget||{}));
  if(!Array.isArray(CFG.incomeKw)) CFG.incomeKw = (DEFAULTS.incomeKw||[]).slice();
  if(!Array.isArray(CFG.skipKw))   CFG.skipKw   = (DEFAULTS.skipKw||[]).slice();
  if(!Array.isArray(CFG.remaps))   CFG.remaps   = (DEFAULTS.remaps||[]).slice();
  // String fields inside CFG.cols
  ['date','desc','amt','cat','fmt'].forEach(k=>{
    if(typeof CFG.cols[k] !== 'string') CFG.cols[k] = (DEFAULTS.cols && DEFAULTS.cols[k]) || '';
  });
  syncUI(); renderBudgetInputs();
}
// ════ STORAGE-QUOTA HELPERS ════
// Browsers throw different things when localStorage is full. This catches them all.
function _isQuotaErr(e){
  if(!e) return false;
  return e.name === 'QuotaExceededError'
      || e.code === 22                              // most browsers
      || e.code === 1014                            // Firefox: NS_ERROR_DOM_QUOTA_REACHED
      || /quota/i.test(e.name||'')
      || /quota/i.test(e.message||'');
}
// Surface a quota event to the user exactly once -- repeated writes after the
// first failure would otherwise spam alerts. _clearQuotaWarning() resets after
// a successful write so a later failure can re-warn.
let _quotaWarned = false;
function _warnQuota(what){
  if(_quotaWarned) return;
  _quotaWarned = true;
  gbDialog.alert('Storage is full -- your latest '+what+' change was not saved.\n\n'
      + 'Go to Settings -> Data Backup -> Export a Backup to save what you have, '
      + 'then clear old months in the Settings tab to free up space.');
}
function _clearQuotaWarning(){ _quotaWarned = false; }

function saveCFG(){
  try{ localStorage.setItem('gb_cfg2',JSON.stringify(CFG)); _clearQuotaWarning(); }
  catch(e){ if(_isQuotaErr(e)) _warnQuota('settings'); else console.warn('Greenbar: saveCFG failed',e); }
}
async function resetSettings(){ if(!await gbDialog.confirm('Reset all settings?')) return; CFG=JSON.parse(JSON.stringify(DEFAULTS)); saveCFG(); syncUI(); renderBudgetInputs(); }

function syncUI(){
  document.getElementById('col-date').value=CFG.cols.date||'';
  document.getElementById('col-desc-inp').value=CFG.cols.desc||'';
  document.getElementById('col-amt').value=CFG.cols.amt||'';
  document.getElementById('col-cat').value=CFG.cols.cat||'';
  document.getElementById('col-fmt').value=CFG.cols.fmt||'MM/DD/YY';
  document.getElementById('income-kw').value=CFG.incomeKw.join('\n');
  document.getElementById('skip-kw').value=CFG.skipKw.join('\n');
  document.getElementById('inc-desc').textContent=`${CFG.incomeKw.length} keywords`;
  document.getElementById('skip-desc').textContent=CFG.skipKw.length?`${CFG.skipKw.length} rules`:'None set';
  document.getElementById('remap-desc').textContent=`${CFG.remaps.length} rules active`;
}
function saveCols(){ CFG.cols={date:document.getElementById('col-date').value.trim(),desc:document.getElementById('col-desc-inp').value.trim(),amt:document.getElementById('col-amt').value.trim(),cat:document.getElementById('col-cat').value.trim(),fmt:document.getElementById('col-fmt').value}; }
function saveIncome(){ CFG.incomeKw=document.getElementById('income-kw').value.split('\n').map(s=>s.trim().toUpperCase()).filter(Boolean); document.getElementById('inc-desc').textContent=`${CFG.incomeKw.length} keywords`; }
function saveSkip(){ CFG.skipKw=document.getElementById('skip-kw').value.split('\n').map(s=>s.trim().toUpperCase()).filter(Boolean); document.getElementById('skip-desc').textContent=CFG.skipKw.length?`${CFG.skipKw.length} rules`:'None set'; }
function saveRemaps(){ CFG.remaps=[]; document.querySelectorAll('.remap-row').forEach(r=>{ const k=r.querySelector('.rk').value.trim().toUpperCase(); const c=r.querySelector('.rc').value.trim(); if(k&&c) CFG.remaps.push({kw:k,cat:c}); }); document.getElementById('remap-desc').textContent=`${CFG.remaps.length} rules active`; }
function renderRemaps(){ document.getElementById('remap-list').innerHTML=(CFG.remaps||[]).map(r=>`<div class="remap-row"><input class="rk" aria-label="Remap keyword"placeholder="Keyword" value="${esc(r.kw||'')}" autocomplete="off"><input class="rc" aria-label="Target category"placeholder="Category" value="${esc(r.cat||'')}" autocomplete="off"><button type="button" class="del-btn" aria-label="Remove rule"onclick="this.parentElement.remove()">×</button></div>`).join(''); }
function addRemap(){ const d=document.createElement('div'); d.className='remap-row'; d.innerHTML=`<input class="rk" aria-label="Remap keyword"placeholder="Keyword" autocomplete="off"><input class="rc" aria-label="Target category"placeholder="Category" autocomplete="off"><button type="button" class="del-btn" aria-label="Remove rule"onclick="this.parentElement.remove()">×</button>`; document.getElementById('remap-list').appendChild(d); }
function renderBudgetInputs(){ document.getElementById('budget-inputs').innerHTML=Object.entries(CFG.budget).map(([c,v])=>`<div class="budget-row"><span class="budget-label">${esc(c)}</span><input class="budget-input" type="number" data-cat="${esc(c)}" aria-label="${esc(c)} budget in dollars" value="${v}" min="0" step="10" autocomplete="off"></div>`).join('')+`<div class="budget-row"><input class="budget-input" id="new-cat" aria-label="New category name" placeholder="New category…" style="width:auto;flex:1;margin-right:8px;text-align:left" autocomplete="off"><input class="budget-input" id="new-val" type="number" aria-label="New category budget in dollars" placeholder="$0" style="width:72px" autocomplete="off"><button type="button" onclick="addBudgetCat()" aria-label="Add budget category" style="margin-left:8px;padding:7px 12px;background:rgba(0,214,143,0.1);border:1px solid rgba(0,214,143,0.3);border-radius:10px;color:var(--green);font-weight:700;cursor:pointer;font-size:14px">+</button></div>`; }
function addBudgetCat(){ const n=document.getElementById('new-cat').value.trim(); const v=parseFloat(document.getElementById('new-val').value)||0; if(!n) return; CFG.budget[n]=v; renderBudgetInputs(); }
function saveSettings(){ document.querySelectorAll('.budget-input[data-cat]').forEach(i=>{ if(i.dataset.cat){ const bv=parseFloat(i.value); CFG.budget[i.dataset.cat]=(isNaN(bv)||bv<0)?0:Math.round(bv*100)/100; i.value=CFG.budget[i.dataset.cat]; } }); saveCFG(); if(_allTxs.length) renderAll(); }

// ──────── Util helpers (esc, fmt, fmtS, _navBtn, cleanVendor) ────────
function cleanVendor(desc){
  return desc
    .replace(/^(Point Of Sale Withdrawal|External Withdrawal|NOW Withdrawal|NOW Deposit|Withdrawal Transfer|Withdrawal|Deposit)\s*/i,'')
    .replace(/\s{2,}/g,' ')
    .trim()
    .substring(0,40)
    .trim();
}


// ── Cached nav button references (avoid repeated querySelectorAll)
function _navBtn(i){ return document.querySelectorAll('.nav-btn')[i||0]; }
// ════ FORMAT ════
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
function fmt(n){ if(n===undefined||n===null||!isFinite(n))return'—'; const a=Math.abs(n); return(n<0?'(':'')+'$'+a.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})+(n<0?')':''); }
function fmtS(n){ return n>=0?`+${fmt(n)}`:`-${fmt(Math.abs(n))}`; }

// ──────── CSV parsing pipeline ────────
function decodeBytes(buf){
  const bytes = new Uint8Array(buf);
  if(bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(buf);
  if(bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(buf);
  // UTF-8 (with or without BOM) -- TextDecoder strips the BOM for us.
  try{ return new TextDecoder('utf-8',{fatal:false}).decode(buf); }
  catch(_){ return new TextDecoder().decode(buf); }
}
// Streaming CSV tokenizer. Walks the input character-by-character tracking
// quote state, so values containing embedded newlines (e.g. memos with
// `\n` inside a quoted field, common in Sparkasse / ING / Excel-edited CSVs)
// stay one cell instead of breaking the row. Falls back to detectDelim()
// against the first physical line for the column separator.
function parseCSV(text){
  if(text.charCodeAt(0)===0xFEFF) text=text.slice(1);
  // detectDelim only inspects the header line, so split on the FIRST physical
  // newline (which is necessarily outside any quoted field -- a CSV with a
  // newline embedded in the header would be malformed beyond our recovery).
  const headerLine = text.split(/[\r\n]/, 1)[0] || '';
  const delim = detectDelim(headerLine);
  const rows = [];
  let cur = '', inQ = false, row = [];
  for(let i = 0; i < text.length; i++){
    const c = text[i];
    if(c === '"'){
      if(inQ && text[i+1] === '"'){ cur += '"'; i++; }   // "" -> literal "
      else inQ = !inQ;
    } else if(!inQ && c === delim){
      row.push(cur); cur = '';
    } else if(!inQ && (c === '\r' || c === '\n')){
      // Row terminator. Push the in-progress cell, then the row, but skip
      // wholly-blank rows (common after a trailing newline in the source).
      if(cur !== '' || row.length){ row.push(cur); rows.push(row); row = []; cur = ''; }
      if(c === '\r' && text[i+1] === '\n') i++;          // CRLF -> single break
    } else {
      cur += c;
    }
  }
  // Final cell / row if the file didn't end on a newline.
  if(cur !== '' || row.length){ row.push(cur); rows.push(row); }
  if(!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].map(s => s.trim());
  const data = rows.slice(1)
    .filter(r => r.some(c => c.trim()))
    .map(r => {
      const o = {};
      headers.forEach((k, i) => { o[k] = (r[i] || '').trim(); });
      return o;
    });
  return { headers, rows: data };
}
// Auto-detect the column delimiter (comma, tab, or semicolon) from the header line.
function detectDelim(line){
  const counts={',':0,'\t':0,';':0}; let inQ=false;
  for(let i=0;i<line.length;i++){ const c=line[i]; if(c==='"') inQ=!inQ; else if(!inQ && counts[c]!==undefined) counts[c]++; }
  let best=',', n=counts[','];
  if(counts['\t']>n){ best='\t'; n=counts['\t']; }
  if(counts[';']>n){ best=';'; }
  return best;
}
function parseAmt(s){ if(!s)return 0; const c=s.replace(/[",\$ ]/g,''); const neg=c.startsWith('-')||c.startsWith('('); const n=parseFloat(c.replace(/[^0-9.]/g,'')); if(!isFinite(n))return 0; return neg?-n:n; }
// Find a header matching one of the candidate names. Returns '' when nothing
// matches -- callers decide whether that column is required or optional.
function autoCol(headers,candidates){ for(const c of candidates){ const f=headers.find(h=>h.toLowerCase().includes(c.toLowerCase())); if(f) return f; } return ''; }
// Parse a raw date string (in the given format) into sortable parts.
// Returns { key:YYYYMMDD number, month:"Mon YYYY", label:"Mon D, YYYY" } or null.
function parseDateParts(str,fmt){
  if(!str) return null;
  const s=String(str).replace(/[^0-9\/\-]/g,'');
  const p=s.split(/[\/\-]/);
  if(p.length<3) return null;
  let m,d,y;
  if(fmt==='YYYY-MM-DD'){[y,m,d]=p;}
  else if(fmt==='DD/MM/YYYY'){[d,m,y]=p;}
  else{[m,d,y]=p;}
  m=parseInt(m,10); d=parseInt(d,10); y=parseInt(y,10);
  if(!m||!d||!y) return null;
  if(y<100) y+=2000;
  if(m<1||m>12||d<1||d>31) return null;
  // Month-aware day validation. Catches Feb 30, Apr 31, Sep 31, etc. --
  // otherwise silently accepted and producing a wrong-month key. Especially
  // common when the user picked the wrong date-format dropdown (DD/MM vs
  // MM/DD) -- now those bad rows are rejected by processCSV instead of
  // misclassified.
  const probe = new Date(y, m-1, d);
  if(probe.getFullYear() !== y || probe.getMonth() !== m-1 || probe.getDate() !== d) return null;
  return { key:y*10000+m*100+d, month:`${MN[m-1]} ${y}`, label:`${MN[m-1]} ${d}, ${y}` };
}

// Bank category name -> Greenbar canonical category. Hoisted out of the
// processCSV loop -- previously this 24-entry object was re-allocated per
// row, so a 1000-row CSV did 1000 redundant allocations. Now created once
// at module load.
const CAT_NORM = {
  'Restaurants/Dining':'Dining Out','Dining':'Dining Out','Food & Drink':'Dining Out',
  'Groceries/Supermarkets':'Groceries','Supermarkets':'Groceries',
  'Gas/Automotive':'Gas/Fuel','Gasoline':'Gas/Fuel','Auto & Transport':'Automotive',
  'Healthcare/Medical':'Healthcare','Medical':'Healthcare','Pharmacy':'Healthcare',
  'Cable/Satellite Services':'Internet/Cable','Internet':'Internet/Cable',
  'Telephone Services':'Wireless','Cell Phone':'Wireless','Mobile Phone':'Wireless',
  'Dues and Subscriptions':'Subscriptions','Online Services':'Subscriptions',
  'Clothing/Shoes':'Clothing','Shopping':'General Merchandise',
  'Home Maintenance':'Home Improvement',
  'Movies & Music':'Entertainment',
  'ATM/Cash Withdrawals':'ATM/Cash','ATM':'ATM/Cash','Cash':'ATM/Cash',
  'Uncategorized Transaction':'Uncategorized',
  'Transfers':'Other Transfers','Transfer':'Other Transfers',
  'Credit Card Payment':'Credit Card Payments','Credit Card':'Credit Card Payments',
};

function processCSV(rows,headers){
  if(!headers||headers.length<2){ gbDialog.alert('These Bank Transactions have no headers. Check the file format and try again.'); return []; }
  if(!rows||rows.length===0){ gbDialog.alert('This Bank Transactions file appears to be empty.'); return []; }
  const colDate=CFG.cols.date||autoCol(headers,['date','posted','transaction date']);
  const colDesc=CFG.cols.desc||autoCol(headers,['description','merchant','memo','payee']);
  const colAmt=CFG.cols.amt||autoCol(headers,['amount','transaction amount']);
  // Category is optional -- left blank when the file has no category column,
  // so rows fall through to keyword/remap categorization instead of being
  // mis-mapped onto whatever column happens to be first.
  const colCat=CFG.cols.cat||autoCol(headers,['category']);
  const fmt=CFG.cols.fmt||'MM/DD/YY';
  if(!colDate||!colAmt){
    gbDialog.alert('Couldn’t identify the Date and Amount columns in this file. Open Settings → Column Mapping, enter your bank’s exact column names, then import again.');
    return [];
  }
  const txs=[];
  for(const row of rows){
    const raw=row[colDesc]||''; const desc=raw.toUpperCase();
    const amount=parseAmt(row[colAmt]||'0');
    const pd=parseDateParts(row[colDate]||'',fmt);
    if(!pd) continue;
    const month=pd.month;
    if(CFG.skipKw.some(kw=>desc.includes(kw))) continue;
    let cat=(row[colCat]||'Uncategorized').trim();
    // Normalize common bank category names to standard budget names
    // (CAT_NORM is hoisted to module scope above; see comment there).
    if(CAT_NORM[cat]) cat=CAT_NORM[cat];
    // Income is keyword-driven only. A positive amount with no income keyword is
    // a refund -- it nets against its category rather than counting as income.
    let isIncome=false;
    if(CFG.incomeKw.some(kw=>desc.includes(kw))){isIncome=true;cat='_income';}
    else{ for(const r of CFG.remaps){ if(desc.includes(r.kw.toUpperCase())){cat=r.cat;break;} } }
    txs.push({date:row[colDate]||'',ts:pd.key,month,desc:raw,amount,cat,isIncome});
  }
  return txs;
}

// Income comes only from keyword-tagged transactions. Everything else nets into
// its category: a normal expense (negative amount) adds to spend, a refund
// (positive amount) subtracts -- so refunds reduce a category, not inflate income.
function aggregate(txs){ const mo={}; for(const tx of txs){ if(!mo[tx.month])mo[tx.month]={income:0,expenses:{},txs:[]}; mo[tx.month].txs.push(tx); if(tx.isIncome)mo[tx.month].income+=tx.amount; else mo[tx.month].expenses[tx.cat]=(mo[tx.month].expenses[tx.cat]||0)-tx.amount; } return mo; }
// Single-month variant used by applyImport's merge path: avoids allocating
// the outer { [month]: {...} } map just to read one key. Caller already
// knows the month -- we just need the totals.
function aggregateOneMonth(txs){
  const m = { income: 0, expenses: {}, txs };
  for(const tx of txs){
    if(tx.isIncome) m.income += tx.amount;
    else m.expenses[tx.cat] = (m.expenses[tx.cat] || 0) - tx.amount;
  }
  return m;
}
function sortKeys(mo){ return Object.keys(mo).sort((a,b)=>{ const[am,ay]=a.split(' '),[bm,by]=b.split(' '); return parseInt(ay)!==parseInt(by)?parseInt(ay)-parseInt(by):MN.indexOf(am)-MN.indexOf(bm); }); }
// Total spend for a month object. Defensive against m / m.expenses being
// null so callers without a guard can still call it safely.
function sumExpenses(m){ return m && m.expenses ? Object.values(m.expenses).reduce((s,v)=>s+v,0) : 0; }
// Identity key for a transaction row -- used to merge overlapping imports.
// Uses U+0001 (Start-of-Heading control char) as separator: illegal in CSV
// text per spec, so descriptions can't collide. Prior `|` separator could
// theoretically collide if a description ended with a pipe and the next row's
// date started with one (vanishingly unlikely in practice, but free to fix).
function txKey(tx){ return tx.date+''+tx.desc+''+tx.amount; }

// ──────── Storage: transaction data + upload log + backup/restore ────────
function saveData(){
  try{
    const payload={months:_months,txs:_allTxs,sel:_sel};
    const str=JSON.stringify(payload);
    // Near-full warning is a soft toast, not a blocking alert -- saves still work.
    if(str.length>4800000 && typeof showToast==='function'){
      showToast('Storage nearly full ('+Math.round(str.length/1024)+' KB). Export a backup soon.');
    }
    localStorage.setItem('gb_data',str);
    _clearQuotaWarning();
  }catch(e){
    if(_isQuotaErr(e)) _warnQuota('transactions');
    else console.warn('Greenbar: save failed',e);
  }
}
function loadData(){
  try{
    const s=localStorage.getItem('gb_data');
    if(!s) return false;
    const d=JSON.parse(s);
    _months=d.months||{}; _allTxs=d.txs||[];
    const ks=sortKeys(_months); _sel=(d.sel&&_months[d.sel])?d.sel:(ks[ks.length-1]||null);
    return ks.length>0;
  }catch(e){ return false; }
}

// ════ DATA BACKUP / RESTORE ════
// Export every Greenbar key to one JSON file the user can save off-device, and
// restore from it -- the safety net for browser-only (localStorage) storage.
// GB_KEYS is declared in state.js so it's available before this file loads.
async function exportData(){
  // Phase B: biometric/PIN gate on destructive/data-exfil actions.
  if(!await gbAuth.unlock('Export backup')) return;
  try{
    const payload={ _greenbar_backup:1, version:1, exported:new Date().toISOString(), data:{} };
    GB_KEYS.forEach(k=>{ const v=localStorage.getItem(k); if(v!==null) payload.data[k]=v; });
    const blob=new Blob([JSON.stringify(payload)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download='greenbar-backup-'+new Date().toISOString().slice(0,10)+'.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    showToast('Backup downloaded to your device.');
  }catch(e){ gbDialog.alert('Could not create a backup: '+(e&&e.message||e)); }
}
async function restoreData(file){
  if(!file) return;
  // Phase B: biometric/PIN gate before overwriting all data with a backup.
  if(!await gbAuth.unlock('Restore backup')) return;
  const rd=new FileReader();
  rd.onload=async e=>{
    let payload;
    try{ payload=JSON.parse(e.target.result); }
    catch(err){ gbDialog.alert('That file is not a valid Greenbar backup.'); return; }
    if(!payload || payload._greenbar_backup!==1 || !payload.data){
      gbDialog.alert('That file is not a valid Greenbar backup.'); return;
    }
    // Defense-in-depth: every value we'll write must be a string. localStorage
    // coerces non-strings to "[object Object]" or similar, which then poisons
    // those keys (loadData() etc. would JSON.parse-throw forever after).
    // Tampered backup files are the only trust boundary in the app -- catch
    // bad shapes here, before we touch the user's existing data.
    for(const k of GB_KEYS){
      const v = payload.data[k];
      if(v !== undefined && typeof v !== 'string'){
        gbDialog.alert('That backup contains a non-text value for "'+k+'". Restore aborted -- your current data is unchanged.');
        return;
      }
    }
    // Pre-flight: a single value over ~4.9 MB will fail localStorage on most
    // browsers. Bail before touching anything so the user's data is untouched.
    const oversizedKey = GB_KEYS.find(k => typeof payload.data[k] === 'string' && payload.data[k].length > 4900000);
    if(oversizedKey){
      gbDialog.alert('This backup is too large to fit in browser storage (key "'+oversizedKey+'" alone is '
          + Math.round(payload.data[oversizedKey].length/1024) + ' KB). Restore aborted -- your current data is unchanged.');
      return;
    }
    if(!await gbDialog.confirm('Restore this backup? It replaces ALL data currently on this device.')) return;

    // Snapshot every key BEFORE writing so we can roll back atomically if a
    // mid-restore setItem fails (quota exceeded after some keys already wrote).
    const snapshot = {};
    GB_KEYS.forEach(k => { snapshot[k] = localStorage.getItem(k); });
    const written = [];
    try{
      GB_KEYS.forEach(k=>{
        if(payload.data[k]!==undefined){ localStorage.setItem(k,payload.data[k]); }
        else { localStorage.removeItem(k); }
        written.push(k);
      });
    }catch(err){
      // Roll back partial writes -- restore each key to its prior state.
      written.forEach(k => {
        try{
          if(snapshot[k] === null) localStorage.removeItem(k);
          else localStorage.setItem(k, snapshot[k]);
        }catch(_){ /* if rollback also fails there is nothing left to do */ }
      });
      const reason = _isQuotaErr(err)
        ? 'this device does not have enough storage space for the backup'
        : 'a storage error occurred ('+(err&&err.message||err)+')';
      gbDialog.alert('Restore was rolled back -- ' + reason + '.\n\nYour current data is unchanged.');
      return;
    }
    await gbDialog.alert('Backup restored. Greenbar will now reload.');
    location.reload();
  };
  rd.onerror=()=>gbDialog.alert('Could not read that file.');
  rd.readAsText(file);
}
// Rough indicator of how much device storage Greenbar is using.
function updateStorageDesc(){
  const el=document.getElementById('storage-desc');
  if(!el) return;
  let bytes=0;
  try{ GB_KEYS.forEach(k=>{ bytes+=(localStorage.getItem(k)||'').length; }); }catch(e){}
  const size=bytes>1024?Math.round(bytes/1024)+' KB':bytes+' bytes';
  el.textContent='Save all your data to a file · '+size+' stored';
}

// ════ UPLOAD LOG ════
function getLog(){ try{ return JSON.parse(localStorage.getItem('gb_log')||'[]'); }catch(e){ return []; } }
function saveLog(log){
  try{ localStorage.setItem('gb_log',JSON.stringify(log)); _clearQuotaWarning(); }
  catch(e){ if(_isQuotaErr(e)) _warnQuota('upload log'); /* not critical -- log is rebuildable */ }
}
function addToLog(filename, txCount, monthCount, months){
  const log=getLog();
  log.unshift({ id: Date.now(), filename, txCount, monthCount, months, date: new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}) });
  // Hard-cap retention: a single pop() leaves the log oversize if it ever
  // started larger than the cap (e.g. after a backup restore from a future
  // version that allowed more entries).
  while(log.length > 50) log.pop();
  saveLog(log);
  updateLogBadge();
}
function updateLogBadge(){
  const log=getLog();
  const badge=document.getElementById('log-badge');
  if(!badge) return;
  if(log.length>0){ badge.style.display='block'; badge.textContent=log.length>9?'9+':log.length; }
  else { badge.style.display='none'; }
}
async function clearAllData(){
  if(!await gbDialog.confirm('Delete ALL data? This cannot be undone.')) return;
  // Phase B: biometric/PIN gate after the user confirms intent.
  if(!await gbAuth.unlock('Clear all data')) return;
  // GB_KEYS is the single source of truth for user-data keys -- iterating
  // it here means any future onboarding/state key added there is wiped too.
  try{ GB_KEYS.forEach(k => localStorage.removeItem(k)); }catch(e){}
  _months={}; _allTxs=[]; _sel=null;
  _flashTimers=[]; _flashDone=false;
  CFG=JSON.parse(JSON.stringify(DEFAULTS));
  const badge=document.getElementById('log-badge');
  if(badge) badge.style.display='none';
  // Hide header buttons + wordmark -- user is back to fresh state
  ['hdr-import-btn','hdr-wordmark-wrap'].forEach(id=>{
    const el=document.getElementById(id);
    if(el){ el.style.opacity='0'; el.style.pointerEvents='none'; }
  });
  // Hide the bottom nav too, matching a fresh first launch
  document.getElementById('bottom-nav')?.classList.remove('visible');
  // Reset to summary screen and run flash intro
  showScreen('summary',_navBtn(0));
  setTimeout(()=>{ runFlashIntro(); },100);
}

async function clearLog(){
  if(!await gbDialog.confirm('Clear all upload history?')) return;
  localStorage.removeItem('gb_log');
  updateLogBadge();
  renderLog();
}
function renderLog(){
  const log=getLog();
  const list=document.getElementById('log-list');
  const empty=document.getElementById('log-empty');
  if(!list) return;
  if(log.length===0){ list.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';
  // Defense-in-depth: every interpolated entry value is escaped, in case a
  // restored backup contains a tampered log row. Filename was already escaped;
  // the rest are now too. txCount/monthCount are numbers in normal use but a
  // malicious backup could put a script-bearing string here.
  list.innerHTML=log.map(entry=>`
    <div style="background:var(--glass);border:1px solid var(--border);border-radius:16px;padding:14px 16px;margin-bottom:10px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px;">
        <div style="font-size:14px;font-weight:600;flex:1;word-break:break-all;">${esc(entry.filename)}</div>
        <div style="font-size:11px;color:var(--muted);flex-shrink:0;margin-top:2px;">${esc(entry.date)}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <span style="background:rgba(0,214,143,0.10);border:1px solid rgba(0,214,143,0.2);border-radius:8px;padding:3px 10px;font-size:11px;font-weight:600;color:var(--green)">${esc(String(entry.txCount))} transaction${entry.txCount===1?'':'s'}</span>
        <span style="background:rgba(41,121,255,0.10);border:1px solid rgba(41,121,255,0.2);border-radius:8px;padding:3px 10px;font-size:11px;font-weight:600;color:#2979ff">${esc(String(entry.monthCount))} month${entry.monthCount===1?'':'s'}</span>
        <span style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:3px 10px;font-size:11px;color:var(--muted)">${esc(entry.months)}</span>
      </div>
    </div>`).join('');
}

// ──────── Import flow (multi-file + conflict resolution) ────────
let _pendingFiles = [];       // queue of File objects waiting to process
let _pendingConflict = null;  // { file, newTxs, newMonths, newKeys, conflictingMonths }
let _importBusy = false;      // true between handleFiles start and final processNextFile drain

function handleFiles(files){
  if(!files || !files.length) return;
  const incoming = Array.from(files);
  if(_importBusy || _pendingFiles.length || _pendingConflict){
    // An import is already in progress. Append rather than overwrite so we
    // never drop files the user picked earlier or clobber a pending conflict.
    _pendingFiles.push(...incoming);
    return;
  }
  _pendingFiles = incoming;
  _importBusy = true;
  processNextFile();
}

function processNextFile(){
  if(!_pendingFiles.length){
    // All files done -- final render. Clear the busy flag so the next
    // user-initiated import starts a fresh batch.
    _importBusy = false;
    saveData();
    renderAll();
    showScreen('summary', _navBtn(0));
    return;
  }
  const f = _pendingFiles.shift();
  // Tell the user something is happening -- parseCSV / aggregate can block
  // 100-500ms on a multi-thousand-row file and a frozen UI feels broken.
  if(typeof showToast === 'function') showToast('Reading ' + f.name + '…');
  const rd = new FileReader();
  rd.onload = e => {
    try{
      // Decode the raw bytes ourselves so a UTF-16-encoded CSV (e.g. saved
      // from Excel on Windows) is read with the right encoding instead of
      // garbled as UTF-8.
      const text = decodeBytes(e.target.result);
      const{headers,rows} = parseCSV(text);
      const newTxs = processCSV(rows, headers);
      if(!newTxs.length){ processNextFile(); return; } // file empty or rejected -- skip it, don't log an empty import
      const newMonths = aggregate(newTxs);
      const newKeys = sortKeys(newMonths);
      // Friendly summary toast: how many transactions, how many months covered.
      const monthSpan = newKeys.length === 1 ? newKeys[0] : newKeys[0] + '–' + newKeys[newKeys.length-1];
      showToast('Imported ' + newTxs.length + ' transaction' + (newTxs.length===1?'':'s') + ' (' + monthSpan + ')');

      // Check for month conflicts with existing data
      const conflictingMonths = newKeys.filter(mk => _months[mk] && _months[mk].txs.length > 0);

      if(conflictingMonths.length > 0){
        // Show conflict resolution modal. _pendingConflict only ever holds
        // ONE file at a time -- handleFiles queues additional files into
        // _pendingFiles, so resolution proceeds serially.
        _pendingConflict = { f, newTxs, newMonths, newKeys, conflictingMonths };
        showConflictModal(f.name, conflictingMonths, newKeys);
      } else {
        // No conflict -- merge automatically
        applyImport(f, newTxs, newMonths, newKeys, 'merge');
        processNextFile();
      }
    }catch(err){
      // A bug in parseCSV / processCSV / aggregate must not strand _importBusy.
      console.warn('Greenbar: error processing "'+f.name+'"',err);
      gbDialog.alert('Could not process "'+f.name+'": '+(err&&err.message||err));
      processNextFile();
    }
  };
  rd.onerror=()=>{ gbDialog.alert('Could not read "'+f.name+'". Please make sure it is a valid Bank Transactions file.'); processNextFile(); };
  rd.readAsArrayBuffer(f);
}

function showConflictModal(filename, conflictingMonths, allNewMonths){
  document.getElementById('conflict-title').textContent = 'Month conflict detected';
  document.getElementById('conflict-sub').textContent =
    `"${filename}" contains data for months you've already imported. How would you like to handle it?`;

  const monthsHtml = `
    <div style="background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:14px;padding:12px 14px;">
      <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:10px;font-family: var(--font-display);">Overlapping months</div>
      ${conflictingMonths.map(mk => {
        const existing = _months[mk];
        const existingTxs = existing ? existing.txs.length : 0;
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px;">
          <span style="font-weight:600;">${esc(mk)}</span>
          <span style="color:var(--muted);font-size:11px;">${existingTxs} existing txs</span>
        </div>`;
      }).join('')}
      <div style="font-size:11px;color:var(--muted);margin-top:10px;">
        <strong class="c-soft">Replace</strong> = wipe existing data for these months and use the new file.<br>
        <strong class="c-soft">Merge</strong> = combine both sets of transactions for these months.
      </div>
    </div>`;

  document.getElementById('conflict-months').innerHTML = monthsHtml;
  const conflict = document.getElementById('modal-conflict');
  conflict.classList.add('open');
  conflict.setAttribute('open', '');
}

function resolveConflict(action){
  const conflictModal = document.getElementById('modal-conflict');
  if(conflictModal){ conflictModal.classList.remove('open'); conflictModal.removeAttribute('open'); }

  if(action === 'cancel' || action === 'skip'){
    _pendingConflict = null;
    processNextFile();
    return;
  }

  const { f, newTxs, newMonths, newKeys } = _pendingConflict;
  _pendingConflict = null;

  if(action === 'replace'){
    // Remove existing data for conflicting months
    _allTxs = _allTxs.filter(tx => !newKeys.includes(tx.month));
    for(const mk of newKeys){ delete _months[mk]; }
  }

  // Apply import (merge or clean replace)
  applyImport(f, newTxs, newMonths, newKeys, action);
  processNextFile();
}

function applyImport(f, newTxs, newMonths, newKeys, mode){
  // Merge month aggregates
  for(const mk of newKeys){
    if(mode === 'replace' || !_months[mk]){
      _months[mk] = newMonths[mk];
    } else {
      // Merge: keep every existing tx, and from the new file add only the copies
      // of each (date|desc|amount) key beyond what we already have -- re-importing
      // the same statement adds nothing, but genuine repeat purchases still come in.
      const existing = _months[mk].txs || [];
      const have = {};
      for(const tx of existing){ const k=txKey(tx); have[k]=(have[k]||0)+1; }
      const combined = existing.slice();
      const seen = {};
      for(const tx of newMonths[mk].txs){
        const k=txKey(tx);
        seen[k]=(seen[k]||0)+1;
        if(seen[k] > (have[k]||0)) combined.push(tx);
      }
      _months[mk] = aggregateOneMonth(combined);
    }
  }

  // Rebuild _allTxs from per-month data so it stays consistent with _months.
  // Iterate via sortKeys() so the array is in chronological order -- raw
  // iteration by other render paths (streak detection etc.) sees sorted data
  // without each consumer having to sort.
  _allTxs = sortKeys(_months).flatMap(mk => _months[mk].txs || []);

  _sel = newKeys[newKeys.length-1];
  addToLog(f.name, newTxs.length, newKeys.length, newKeys.join(', '));
}




// ── Shared utility: clean bank transaction description to vendor name

// ──────── Navigation + modals (open/close/swipe/keyboard) ────────
function showScreen(name,btn){
  // Clear any pending flash-intro timers when leaving the summary/intro area.
  // Otherwise they keep firing on a hidden DOM and can flip _flashDone state.
  if(name !== 'summary' && Array.isArray(_flashTimers) && _flashTimers.length){
    _flashTimers.forEach(id => clearTimeout(id));
    _flashTimers = [];
    _flashDone = true;
  }
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>{ b.classList.remove('active'); b.removeAttribute('aria-current'); });
  const el = document.getElementById('screen-'+name);
  if(!el){ console.error('showScreen: missing screen-'+name); return; }
  el.classList.add('active');
  if(btn){ btn.classList.add('active'); btn.setAttribute('aria-current','true'); }
  // Tell screen-reader users which screen they're on now
  srAnnounce(({summary:'Summary screen',budget:'Budget screen',txs:'Transactions screen',intro:'Guide screen',settings:'Settings screen'}[name])||'Screen changed');
  if(name==='budget') renderBudget();
  if(name==='txs') renderTxs();
  if(name==='settings'){ syncUI(); renderBudgetInputs(); updateStorageDesc(); }
  if(name==='summary' && !Object.keys(_months||{}).length){
    if(localStorage.getItem('gb_setup_done')){
      renderSummary();
    } else {
      const setupActive = document.getElementById('screen-setup')?.classList.contains('active');
      if(!setupActive) setTimeout(()=>{ runFlashIntro(); }, 50);
    }
  }
  // Notify other modules that the screen changed. Cleaner than each module
  // monkey-patching window.showScreen -- avoids ordering / collision issues.
  document.dispatchEvent(new CustomEvent('gb:screen', { detail: { name } }));
}

// ════ MODALS ════
let _modalReturnFocus=null;
function openModal(id){
  const el=document.getElementById(id);
  if(!el) return;
  // Close any OTHER currently-open modal first. We do this directly rather
  // than via closeModal() because closeModal restores _modalReturnFocus, and
  // we want focus to flow into the new modal instead.
  document.querySelectorAll('.modal-overlay.open').forEach(m=>{
    if(m !== el){
      m.classList.remove('open'); m.classList.remove('closing');
      m.removeAttribute('open');
    }
  });
  // If this modal is mid-close-animation, cancel it so the open animation plays cleanly.
  el.classList.remove('closing');
  // Reset any leftover inline transform/transition from a previous swipe drag.
  const _sheet = el.querySelector('.sheet');
  if(_sheet){ _sheet.style.transform=''; _sheet.style.transition=''; }
  el.classList.add('open');
  // Sync the native <dialog> open attribute so the children only register in
  // the a11y tree while the modal is visible. (We don't use .showModal()
  // because it would conflict with our custom .open animation + focus trap.)
  el.setAttribute('open', '');
  if(id==='modal-remaps')renderRemaps();
  if(id==='modal-log')renderLog();
  // Accessibility: remember where focus was, then move it into the dialog.
  _modalReturnFocus=document.activeElement;
  const focusable=el.querySelector('input,select,textarea')||el.querySelector('button');
  if(focusable) setTimeout(()=>{ try{ focusable.focus(); }catch(e){} },60);
}
function closeModal(id){
  const el=document.getElementById(id);
  if(!el) return;
  // Restore focus immediately so keyboard users don't wait for the close animation.
  if(_modalReturnFocus){ try{ _modalReturnFocus.focus(); }catch(e){} _modalReturnFocus=null; }
  // Respect prefers-reduced-motion: skip the slide-down and just remove the
  // class immediately, matching the existing no-animation feel for those users.
  const reduceMotion = (typeof matchMedia==='function') && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduceMotion){ el.classList.remove('open'); el.removeAttribute('open'); return; }
  // Otherwise play the reverse animation (~220ms), then hide.
  el.classList.add('closing');
  setTimeout(()=>{
    el.classList.remove('open');
    el.classList.remove('closing');
    el.removeAttribute('open');
    // Clear any inline transform left over from a partial swipe-dismiss.
    const sheet = el.querySelector('.sheet');
    if(sheet){ sheet.style.transform=''; sheet.style.transition=''; }
  }, 230);
}
function closeOut(e,id){ if(e.target===document.getElementById(id)) closeModal(id); }
// Keyboard support for modal dialogs: Esc closes, Tab is trapped inside.
document.addEventListener('keydown',function(e){
  const open=document.querySelector('.modal-overlay.open');
  if(!open) return;
  if(e.key==='Escape'){
    e.preventDefault();
    if(open.id==='modal-conflict') resolveConflict('cancel');
    else closeModal(open.id);
    return;
  }
  if(e.key!=='Tab') return;
  const items=[...open.querySelectorAll('button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])')]
    .filter(el=>!el.disabled && el.offsetParent!==null);
  if(!items.length) return;
  const first=items[0], last=items[items.length-1];
  if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
  else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
});

// Swipe-to-dismiss on modal sheets. Delegated listeners on the overlay so the
// handler is attached once and works for every modal. To avoid hijacking
// scroll inside long modals (e.g. Category Remaps with many rows), drags only
// "take" if the touch starts in the top ~60px of the sheet (the area around
// the handle / title bar). Releasing past 80px triggers closeModal; otherwise
// the sheet springs back via CSS transition.
let _swipe = null;
document.addEventListener('touchstart', function(e){
  const overlay = e.target.closest('.modal-overlay.open');
  if(!overlay || overlay.id === 'modal-conflict') return; // conflict modal must use buttons
  const sheet = overlay.querySelector('.sheet');
  if(!sheet || !sheet.contains(e.target)) return;
  const rectTop = sheet.getBoundingClientRect().top;
  const touchY = e.touches[0].clientY;
  // Only start the gesture if the user grabbed the top strip (handle/title area).
  if(touchY - rectTop > 60) return;
  _swipe = { sheet, overlay, startY: touchY, dy: 0, t0: Date.now() };
  sheet.style.transition = 'none';
},{passive:true});
document.addEventListener('touchmove', function(e){
  if(!_swipe) return;
  const dy = e.touches[0].clientY - _swipe.startY;
  if(dy <= 0){ _swipe.sheet.style.transform = ''; _swipe.dy = 0; return; } // only track downward drags
  _swipe.dy = dy;
  _swipe.sheet.style.transform = 'translateY(' + dy + 'px)';
},{passive:true});
document.addEventListener('touchend', function(){
  if(!_swipe) return;
  const { sheet, overlay, dy, t0 } = _swipe;
  _swipe = null;
  const velocity = dy / Math.max(1, Date.now() - t0); // px/ms
  // Dismiss if dragged > 80px OR flicked hard (>0.5 px/ms).
  if(dy > 80 || velocity > 0.5){
    sheet.style.transition = '';   // let closeModal's animation take over
    if(overlay.id === 'modal-conflict') resolveConflict('cancel');
    else closeModal(overlay.id);
  } else {
    // Spring back to resting position.
    sheet.style.transition = 'transform 0.2s cubic-bezier(0.34,1.2,0.64,1)';
    sheet.style.transform = '';
    setTimeout(()=>{ sheet.style.transition=''; }, 250);
  }
},{passive:true});

// ──────── srAnnounce (live region) + showToast (queued) ────────
// Push a short status message into the global #sr-status live region so that
// VoiceOver / TalkBack announce screen and data changes. Same-text writes are
// re-broadcast by toggling the node empty first (some screen readers ignore
// a write that doesn't change the diff).
function srAnnounce(msg){
  const el = document.getElementById('sr-status');
  if(!el) return;
  if(el.textContent === msg) el.textContent = '';
  // tiny delay lets the empty -> text diff register as a change
  setTimeout(()=>{ el.textContent = msg; }, 30);
}
// Toasts queue rather than overwrite. A second showToast() call while the
// first is still on screen used to clobber the message and fight the fade
// timer. Now each message gets its own ~3.2s slot in order.
let _toastQueue = [];
let _toastShowing = false;
function showToast(msg){
  _toastQueue.push(msg);
  if(!_toastShowing) _drainToast();
}
function _drainToast(){
  if(!_toastQueue.length){ _toastShowing = false; return; }
  _toastShowing = true;
  const msg = _toastQueue.shift();
  let toast = document.getElementById('gb-toast');
  if(!toast){
    toast = document.createElement('div');
    toast.id = 'gb-toast';
    toast.setAttribute('role','status');
    toast.setAttribute('aria-live','polite');
    toast.style.cssText = 'position:fixed;bottom:calc(70px + var(--safe-b));left:50%;transform:translateX(-50%) translateY(20px);background:rgba(0,214,143,0.95);color:#050a14;padding:12px 20px;border-radius:14px;font-size:13px;font-weight:700;font-family:var(--font-display);white-space:nowrap;z-index:999;opacity:0;transition:all 0.3s cubic-bezier(0.34,1.4,0.64,1);pointer-events:none;max-width:90vw;white-space:normal;text-align:center;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  setTimeout(()=>{ toast.style.opacity='1'; toast.style.transform='translateX(-50%) translateY(0)'; },10);
  setTimeout(()=>{ toast.style.opacity='0'; toast.style.transform='translateX(-50%) translateY(10px)'; },2800);
  // Advance to the next queued message after the fade-out, with a small
  // gap so messages don't visually overlap.
  setTimeout(()=>{ _drainToast(); }, 3300);
}
