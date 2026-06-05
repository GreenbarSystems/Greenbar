// ════ Greenbar — core: util, storage, parsing, import, modals, nav, toast ════
// Foundational layer. Loaded after state.js. render.js / features.js / security.js
// / boot.js all depend on the functions defined here.
//
// External dependencies (must load before this file via index.html script order):
//   state.js    -> CFG, DEFAULTS, MN, GB_KEYS, _months, _allTxs, _sel,
//                  _flashTimers, _flashDone
//   render.js   -> renderAll, renderBudget, renderTxs, renderSummary,
//                  renderBudgetInputs
//   features.js -> runFlashIntro
//   security.js -> gbAuth (unlock gate on data-affecting actions)
// Emits the 'gb:screen' CustomEvent from showScreen() for other modules to hook.

// ──────── Best-effort localStorage write (shared utility) ────────
// Lives here (loaded 3rd) so every later-loaded module can call it without
// having to inline its own try/catch. Swallowed errors (quota exceeded,
// private browsing mode, storage disabled) are intentional — one-shot
// "done"/"dismissed" flags should never crash the UI if the platform
// rejects them.
//
// For multi-write semantics or write-and-react-on-failure flows, callers
// still need a custom try/catch (see saveCFG / addToLog below, which clear
// the quota warning on success).
function safeSetLocal(key, val){
  try{ localStorage.setItem(key, val); }catch(e){}
}

// ──────── Named constants ────────
// Hoisted out of inline magic numbers throughout the file -- single source of
// truth for each tunable, easier to spot at a glance, easier to grep when
// tuning.
const LIMITS = {
  STORAGE_NEAR_FULL:    4_800_000, // soft toast when localStorage payload approaches limit
  RESTORE_MAX_KEY_BYTES: 4_900_000, // single-key cap; backups exceeding this are rejected pre-flight
  LOG_RETENTION:        50,        // most-recent N upload-log entries kept
  LOG_BADGE_MAX:        9,         // log-badge displays "9+" past this count
  VENDOR_TRUNCATE:      40,        // chars kept in cleaned vendor name
};
const TIMING = {
  MODAL_CLOSE_MS:       230,       // matches CSS sheetDown animation duration
  TOAST_VISIBLE_MS:     2_800,
  TOAST_SLOT_MS:        3_300,     // visible + fade-out + small gap between toasts
  SR_ANNOUNCE_DELAY:    30,        // tiny gap so empty -> text diff registers for AT
};
const SWIPE = {
  TOP_STRIP_PX:         60,        // touch must start in this top zone to begin a swipe
  DISMISS_DISTANCE_PX:  80,        // drag farther than this -> close
  FLICK_VELOCITY:       0.5,       // px/ms; faster flick also closes
};

// ──────── gbDialog: native confirm/alert via Capacitor when present ────────
// When running inside the Capacitor shell (iOS/Android), prompts route through
// @capacitor/dialog so the user gets a native system alert/confirm instead of
// a browser sheet. Outside Capacitor (web preview, Pages site), falls back to
// the browser's window.confirm / window.alert. All API surface is async so
// callers can `await gbDialog.confirm(...)` uniformly across both modes.
const gbDialog = {
  async confirm(message, title='Greenbar'){
    const cap = window.Capacitor?.Plugins?.Dialog;
    if(cap){
      try{
        const r = await cap.confirm({ title, message });
        return !!r.value;
      }catch(e){ return false; }
    }
    return window.confirm(message);
  },
  async alert(message, title='Greenbar'){
    const cap = window.Capacitor?.Plugins?.Dialog;
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
  if(!Array.isArray(CFG.transferKw)) CFG.transferKw = (DEFAULTS.transferKw||[]).slice();
  if(!Array.isArray(CFG.remaps))   CFG.remaps   = (DEFAULTS.remaps||[]).slice();
  if(!Array.isArray(CFG.accounts)) CFG.accounts = [];
  if(!CFG.profiles || typeof CFG.profiles !== 'object' || Array.isArray(CFG.profiles)) CFG.profiles = {};
  // String fields inside CFG.cols
  ['date','desc','amt','cat','fmt'].forEach(k=>{
    if(typeof CFG.cols[k] !== 'string') CFG.cols[k] = (DEFAULTS.cols && DEFAULTS.cols[k]) || '';
  });
  // Market/region: must be a known market, else fall back to US.
  if(!REGIONS[CFG.region]) CFG.region = 'US';
  // First-run auto-detection: a brand-new user (no saved config) starts in the
  // market matching their browser locale, so non-US users land in their own
  // currency + date order. A returning user's saved choice is never overridden.
  if(!localStorage.getItem('gb_cfg2')){
    const det = _detectRegion();
    if(det && REGIONS[det]){ CFG.region = det; CFG.cols.fmt = REGIONS[det].dateFmt; }
  }
  syncUI(); renderBudgetInputs();
}
// Best-effort market guess from the browser locale's region subtag (en-GB ->
// GB, en-AU -> AU, en-CA -> CA). Returns null when unknown so the US default stands.
function _detectRegion(){
  let lang = '';
  try{ lang = (navigator.language || (navigator.languages && navigator.languages[0]) || '').toLowerCase(); }catch(e){}
  const sub = lang.split('-')[1];
  if(sub === 'gb' || sub === 'uk') return 'GB';
  if(sub === 'au') return 'AU';
  if(sub === 'ca') return 'CA';
  if(sub === 'us') return 'US';
  return null;
}
// Change market: updates currency + the default date order, persists, and
// re-renders. Wired to the Region selector in the Column Mapping modal.
function setRegion(code){
  if(!REGIONS[code]) return;
  CFG.region = code;
  CFG.cols.fmt = REGIONS[code].dateFmt;   // adopt the region's date order as the default
  saveCFG();
  syncUI();
  if(typeof populateBankSelect === 'function') populateBankSelect();  // show this region's bank list
  if(typeof renderAll === 'function' && _allTxs.length) renderAll();
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
  const _rsel=document.getElementById('region-select'); if(_rsel) _rsel.value=CFG.region||'US';
  document.getElementById('income-kw').value=CFG.incomeKw.join('\n');
  document.getElementById('skip-kw').value=CFG.skipKw.join('\n');
  document.getElementById('inc-desc').textContent=`${CFG.incomeKw.length} keywords`;
  document.getElementById('skip-desc').textContent=CFG.skipKw.length?`${CFG.skipKw.length} rules`:'None set';
  document.getElementById('remap-desc').textContent=`${CFG.remaps.length} rules active`;
}
// Each rule editor persists immediately via saveCFG() — the modal "Save"
// buttons used to mutate CFG in memory only, so rules were silently lost on
// reload unless the user also hit "Save & Apply" on the Settings screen.
function saveCols(){ CFG.cols={date:document.getElementById('col-date').value.trim(),desc:document.getElementById('col-desc-inp').value.trim(),amt:document.getElementById('col-amt').value.trim(),cat:document.getElementById('col-cat').value.trim(),fmt:document.getElementById('col-fmt').value}; saveCFG(); }
function saveIncome(){ CFG.incomeKw=document.getElementById('income-kw').value.split('\n').map(s=>s.trim().toUpperCase()).filter(Boolean); document.getElementById('inc-desc').textContent=`${CFG.incomeKw.length} keywords`; saveCFG(); _recategorizeAfterRuleChange(); }
// Skip keywords only drop rows at import time, so changing them is not applied
// retroactively (existing rows stay) -- it just affects the next import.
function saveSkip(){ CFG.skipKw=document.getElementById('skip-kw').value.split('\n').map(s=>s.trim().toUpperCase()).filter(Boolean); document.getElementById('skip-desc').textContent=CFG.skipKw.length?`${CFG.skipKw.length} rules`:'None set'; saveCFG(); }
function saveRemaps(){ CFG.remaps=[]; document.querySelectorAll('.remap-row').forEach(r=>{ const k=r.querySelector('.rk').value.trim().toUpperCase(); const c=r.querySelector('.rc').value.trim(); if(k&&c) CFG.remaps.push({kw:k,cat:c}); }); document.getElementById('remap-desc').textContent=`${CFG.remaps.length} rules active`; saveCFG(); _recategorizeAfterRuleChange(); }
function renderRemaps(){ document.getElementById('remap-list').innerHTML=(CFG.remaps||[]).map(r=>`<div class="remap-row"><input class="rk" aria-label="Remap keyword"placeholder="Keyword" value="${esc(r.kw||'')}" autocomplete="off"><input class="rc" aria-label="Target category"placeholder="Category" value="${esc(r.cat||'')}" autocomplete="off"><button type="button" class="del-btn" aria-label="Remove rule"onclick="this.parentElement.remove()">×</button></div>`).join(''); }
function addRemap(){ const d=document.createElement('div'); d.className='remap-row'; d.innerHTML=`<input class="rk" aria-label="Remap keyword"placeholder="Keyword" autocomplete="off"><input class="rc" aria-label="Target category"placeholder="Category" autocomplete="off"><button type="button" class="del-btn" aria-label="Remove rule"onclick="this.parentElement.remove()">×</button>`; document.getElementById('remap-list').appendChild(d); }
function renderBudgetInputs(){ document.getElementById('budget-inputs').innerHTML=Object.entries(CFG.budget).map(([c,v])=>`<div class="budget-row"><span class="budget-label">${esc(c)}</span><input class="budget-input" type="number" data-cat="${esc(c)}" aria-label="${esc(c)} budget in dollars" value="${v}" min="0" step="10" autocomplete="off"></div>`).join('')+`<div class="budget-row"><input class="budget-input" id="new-cat" aria-label="New category name" placeholder="New category…" style="width:auto;flex:1;margin-right:8px;text-align:left" autocomplete="off"><input class="budget-input" id="new-val" type="number" aria-label="New category budget in dollars" placeholder="$0" style="width:72px" autocomplete="off"><button type="button" onclick="addBudgetCat()" aria-label="Add budget category" style="margin-left:8px;padding:7px 12px;background:rgba(var(--green-rgb),0.1);border:1px solid rgba(var(--green-rgb),0.3);border-radius:10px;color:var(--green);font-weight:700;cursor:pointer;font-size:14px">+</button></div>`; }
function addBudgetCat(){ const n=document.getElementById('new-cat').value.trim(); const v=parseFloat(document.getElementById('new-val').value)||0; if(!n) return; CFG.budget[n]=v; renderBudgetInputs(); }
function saveSettings(){ document.querySelectorAll('.budget-input[data-cat]').forEach(i=>{ if(i.dataset.cat){ const bv=parseFloat(i.value); CFG.budget[i.dataset.cat]=(isNaN(bv)||bv<0)?0:Math.round(bv*100)/100; i.value=CFG.budget[i.dataset.cat]; } }); saveCFG(); if(_allTxs.length) renderAll(); if(typeof showToast==='function') showToast('Budget saved.', 'success'); }

// ──────── Util helpers (esc, fmt, _navBtn, cleanVendor) ────────
function cleanVendor(desc){
  return desc
    .replace(/^(Point Of Sale Withdrawal|External Withdrawal|NOW Withdrawal|NOW Deposit|Withdrawal Transfer|Withdrawal|Deposit)\s*/i,'')
    .replace(/\s{2,}/g,' ')
    .trim()
    .substring(0,LIMITS.VENDOR_TRUNCATE)
    .trim();
}


// ── Cached nav button references (avoid repeated querySelectorAll)
function _navBtn(i){ return document.querySelectorAll('.nav-btn')[i||0]; }
// ════ FORMAT ════
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }

// ── Locale / currency (single source of truth for money formatting) ──
// CFG.region selects the market; everything money-related routes through these
// so adding a market is a data change in REGIONS, not per-module string edits.
function gbRegion(){ return REGIONS[CFG && CFG.region] || REGIONS.US; }
// Currency symbol for the active region (e.g. "$", "£"), derived from Intl so it
// stays correct per locale (e.g. en-CA renders CAD as "$").
let _gbSymCache = {};
function gbCurrencySymbol(){
  const r = gbRegion(); const key = r.locale + '|' + r.currency;
  if(_gbSymCache[key]) return _gbSymCache[key];
  let sym = '$';
  try{
    const parts = new Intl.NumberFormat(r.locale, { style:'currency', currency:r.currency }).formatToParts(0);
    const c = parts.find(p => p.type === 'currency'); if(c) sym = c.value;
  }catch(e){}
  return (_gbSymCache[key] = sym);
}
// Format the ABSOLUTE value as a locale-grouped currency string, e.g. "£1,234"
// or "$1,234.56". Callers that need a sign add it themselves (matches the old
// _money/_money2 contract); fmt() below handles signed display.
function gbMoneyAbs(n, frac){
  const r = gbRegion(); frac = frac || 0;
  return gbCurrencySymbol() + Math.abs(Number(n) || 0).toLocaleString(r.locale, { minimumFractionDigits:frac, maximumFractionDigits:frac });
}
// Signed money for dashboards: negative shown in accounting parens, e.g. "($1,234)".
function fmt(n){ if(n===undefined||n===null||!isFinite(n))return'—'; const a=Math.abs(n); return(n<0?'(':'')+gbCurrencySymbol()+a.toLocaleString(gbRegion().locale,{minimumFractionDigits:0,maximumFractionDigits:0})+(n<0?')':''); }

// ── Shared helpers (consolidated from per-module copies; QA dedup) ──
// One source of truth so the IIFE feature modules delegate instead of each
// redefining the same logic. core.js loads before every consumer, so these are
// always defined by call time.
function gbMoney(n){ return gbMoneyAbs(n, 0); }              // unsigned, 0-dp money
function gbTsToDate(ts){ const y=Math.floor(ts/10000), m=Math.floor((ts%10000)/100), d=ts%100; return new Date(y, m-1, d); }  // YYYYMMDD int -> Date
// Display vendor: a curated tx.vendor wins, else the cleaned description.
function gbVendor(tx){ return (tx && tx.vendor && String(tx.vendor).trim()) || (typeof cleanVendor==='function' ? cleanVendor(tx && tx.desc) : (tx && tx.desc)) || (tx && tx.desc) || 'Unknown'; }

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

// Categorize one row from its raw description + the bank-provided category
// (origCat; '' when the file had no category column). Precedence:
//   income keyword  >  remap rule  >  normalized bank category  >  Uncategorized
// Extracted so processCSV (import) and recategorizeAll (rule changes) share one
// definition of how a row gets its category + income flag.
function categorizeTx(rawDesc, origCat){
  const desc = String(rawDesc||'').toUpperCase();
  if(CFG.incomeKw.some(kw => desc.includes(kw))) return { cat:'_income', isIncome:true };
  for(const r of CFG.remaps){ if(r.kw && desc.includes(String(r.kw).toUpperCase())) return { cat:r.cat, isIncome:false }; }
  let cat = (origCat||'Uncategorized').trim() || 'Uncategorized';
  if(CAT_NORM[cat]) cat = CAT_NORM[cat];
  return { cat, isIncome:false };
}

// Does a description match a saved transfer rule (CFG.transferKw)? Only saved
// rules AUTO-exclude a row as a transfer. (gbTransfers, the resolver UI in
// transfers.js, writes these rules; they apply across history via this path.)
function isTransferDesc(rawDesc){
  const d = String(rawDesc||'').toUpperCase();
  return (CFG.transferKw||[]).some(kw => kw && d.includes(String(kw).toUpperCase()));
}

// Returns { txs, mapping, counts } so the import-preview can show the user how
// the file was understood (which columns, date format) and how many rows were
// imported vs dropped — instead of silently keeping survivors. Hard format
// errors still alert and return an empty result.
function processCSV(rows,headers){
  const empty = { txs:[], mapping:null, counts:{ total:0, imported:0, skipped:0, undated:0 } };
  if(!headers||headers.length<2){ gbDialog.alert('This file has no column headers. Check the file format and try again.'); return empty; }
  if(!rows||rows.length===0){ gbDialog.alert('This file appears to be empty.'); return empty; }
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
    return empty;
  }
  const txs=[];
  let skipped=0, undated=0;     // dropped-row tallies surfaced in the preview
  for(const row of rows){
    const raw=row[colDesc]||''; const desc=raw.toUpperCase();
    const amount=parseAmt(row[colAmt]||'0');
    const pd=parseDateParts(row[colDate]||'',fmt);
    if(!pd){ undated++; continue; }
    const month=pd.month;
    if(CFG.skipKw.some(kw=>desc.includes(kw))){ skipped++; continue; }
    // Keep the raw bank category (origCat) so rules can be re-applied later via
    // recategorizeAll() without re-importing. categorizeTx() owns the
    // income-keyword / remap / normalization precedence.
    const origCat=(row[colCat]||'').trim();
    const {cat,isIncome}=categorizeTx(raw, origCat);
    const tx={id:newTxId(),date:row[colDate]||'',ts:pd.key,month,desc:raw,origCat,amount,cat,isIncome};
    if(isTransferDesc(raw)) tx.transfer=true;   // saved-rule auto-exclusion
    txs.push(tx);
  }
  return { txs, mapping:{ date:colDate, desc:colDesc, amt:colAmt, cat:colCat, fmt }, counts:{ total:rows.length, imported:txs.length, skipped, undated } };
}

// Re-derive category + income for every imported transaction from the CURRENT
// rules, then rebuild the month aggregates. Manual entries and rows the user
// pinned via the per-transaction picker (catLocked) are left untouched. Returns
// the count of rows whose category changed. Lets a rule edit apply to existing
// data immediately -- no re-import needed.
function recategorizeAll(){
  let changed = 0;
  for(const tx of _allTxs){
    // Transfer rules apply across ALL rows except those the user manually
    // pinned (transferLocked) — independent of category locking.
    if(!tx.transferLocked){
      const t = isTransferDesc(tx.desc);
      if(t && !tx.transfer){ tx.transfer = true; changed++; }
      else if(!t && tx.transfer){ delete tx.transfer; changed++; }
    }
    if(tx.source === 'manual' || tx.catLocked) continue;
    // Legacy rows saved before origCat existed fall back to their current cat
    // as the bank-category base, so a no-rule-match row keeps its category.
    const base = (tx.origCat != null) ? tx.origCat : tx.cat;
    const { cat, isIncome } = categorizeTx(tx.desc, base);
    if(tx.cat !== cat || tx.isIncome !== isIncome){ tx.cat = cat; tx.isIncome = isIncome; changed++; }
  }
  if(changed){ rebuildMonths(); saveData(); renderAll(); }
  return changed;
}
// Shared post-rule-change hook: re-apply rules across history and tell the user
// how many rows moved. Called by the income/remap editors after they persist.
function _recategorizeAfterRuleChange(){
  if(!_allTxs.length) return;
  const n = recategorizeAll();
  if(typeof showToast === 'function' && n > 0) showToast(n + ' transaction' + (n===1?'':'s') + ' recategorized', 'success');
}

// Income comes only from keyword-tagged transactions. Everything else nets into
// its category: a normal expense (negative amount) adds to spend, a refund
// (positive amount) subtracts -- so refunds reduce a category, not inflate income.
function aggregate(txs){ const mo={}; for(const tx of txs){ if(!mo[tx.month])mo[tx.month]={income:0,expenses:{},txs:[]}; mo[tx.month].txs.push(tx); if(tx.transfer) continue; /* transfers move between accounts — not income or spend */ if(tx.isIncome)mo[tx.month].income+=tx.amount; else mo[tx.month].expenses[tx.cat]=(mo[tx.month].expenses[tx.cat]||0)-tx.amount; } return mo; }
// Single-month variant used by applyImport's merge path: avoids allocating
// the outer { [month]: {...} } map just to read one key. Caller already
// knows the month -- we just need the totals.
function aggregateOneMonth(txs){
  const m = { income: 0, expenses: {}, txs };
  for(const tx of txs){
    if(tx.transfer) continue;   // excluded: money moved between accounts
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
function txKey(tx){ return (tx.acct||'')+""+tx.date+""+tx.desc+""+tx.amount; }

// ──────── Canonical data invariant ────────
// _allTxs (the flat, signed-amount transaction list) is the single source of
// truth. _months is a DERIVED view: every month bucket's income / expenses /
// txs is computed from _allTxs. rebuildMonths() re-derives _months and restores
// _allTxs to canonical (chronological) order — EVERY transaction mutation must
// end by calling it, so the two structures can never drift.
//
// Row operations address a transaction by its stable tx.id (assigned at
// creation, backfilled on load), never by array index — an index goes stale the
// moment the list is re-sorted or a row is removed, which is the class of bug
// the per-handler "re-resolve after await" guards used to paper over.
let _txIdSeq = 0;
function newTxId(){ return 't' + Date.now().toString(36) + (_txIdSeq++).toString(36) + Math.random().toString(36).slice(2, 5); }
function _txById(id){ return id ? ((_allTxs || []).find(t => t && t.id === id) || null) : null; }
function rebuildMonths(){
  _months = aggregate(_allTxs);
  // Re-derive _allTxs from the freshly-built buckets so it lands in canonical
  // chronological (sortKeys) order and shares object identity with _months.txs.
  _allTxs = sortKeys(_months).flatMap(mk => _months[mk].txs || []);
  _dataVersion++;   // invalidate analyzer memoization (recurring / variance / forecast)
}

// ──────── Storage: transaction data + upload log + backup/restore ────────
function saveData(){
  // The model is being persisted because it changed (import, edit, cleanup,
  // demo). Bump here too so paths that mutate _allTxs/_months without going
  // through rebuildMonths (e.g. applyImport) still invalidate the analyzer memo.
  _dataVersion++;
  try{
    const payload={months:_months,txs:_allTxs,sel:_sel};
    const str=JSON.stringify(payload);
    // Near-full warning is a soft toast, not a blocking alert -- saves still work.
    if(str.length>LIMITS.STORAGE_NEAR_FULL && typeof showToast==='function'){
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
    _allTxs = Array.isArray(d.txs) ? d.txs : [];
    // Backfill stable ids on any row saved before universal ids existed, so all
    // row operations can address transactions by tx.id.
    let backfilled = false;
    for(const tx of _allTxs){ if(tx && !tx.id){ tx.id = newTxId(); backfilled = true; } }
    // _months is derived, never trusted from storage: rebuild it from _allTxs so
    // the two can't drift and so _months.txs share object identity with _allTxs
    // (loadData would otherwise parse them into separate instances). This also
    // re-applies the canonical chronological ordering.
    rebuildMonths();
    const ks=sortKeys(_months); _sel=(d.sel&&_months[d.sel])?d.sel:(ks[ks.length-1]||null);
    if(backfilled) saveData();   // persist the new ids once
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
    const oversizedKey = GB_KEYS.find(k => typeof payload.data[k] === 'string' && payload.data[k].length > LIMITS.RESTORE_MAX_KEY_BYTES);
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
      let rollbackOk = true;
      written.forEach(k => {
        try{
          if(snapshot[k] === null) localStorage.removeItem(k);
          else localStorage.setItem(k, snapshot[k]);
        }catch(_){ rollbackOk = false; }   // restore write also failed -> mixed store
      });
      const reason = _isQuotaErr(err)
        ? 'this device does not have enough storage space for the backup'
        : 'a storage error occurred ('+(err&&err.message||err)+')';
      gbDialog.alert(rollbackOk
        ? 'Restore was rolled back -- ' + reason + '.\n\nYour current data is unchanged.'
        : 'Restore failed -- ' + reason + ' -- and the rollback was incomplete. Some data may be inconsistent; reload Greenbar before making further changes.');
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
// Object-destructured params: `monthCount` (number) and `months` (string) used
// to be adjacent positional args -- easy to swap by accident. Now self-documenting.
function addToLog({ id, filename, txCount, monthCount, months, skipped, undated, confidence, lowConfCount, dateRange, account, closingBalance, balanceAsOf, openingBalance }){
  const log=getLog();
  // `id` links the log entry to the transactions tagged with tx.imp at import
  // time, so the clean-up center can undo exactly this batch. Falls back to a
  // timestamp for any caller that doesn't supply one.
  //
  // Trust metadata (skipped / undated / confidence / lowConfCount / dateRange)
  // powers the Import Confidence Center. All optional — entries written by
  // older builds (or callers that don't supply them) read back as a clean,
  // high-confidence import with nothing skipped.
  log.unshift({ id: id || Date.now(), filename, txCount, monthCount, months,
    skipped: skipped || 0, undated: undated || 0,
    confidence: confidence || 'high', lowConfCount: lowConfCount || 0,
    dateRange: dateRange || null, account: account || '',
    closingBalance: (closingBalance == null ? null : closingBalance),
    balanceAsOf: (typeof balanceAsOf === 'number') ? balanceAsOf : null,
    openingBalance: (openingBalance == null ? null : openingBalance),
    date: new Date().toLocaleDateString(gbRegion().locale,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}) });
  // Hard-cap retention: a single pop() leaves the log oversize if it ever
  // started larger than the cap (e.g. after a backup restore from a future
  // version that allowed more entries).
  while(log.length > LIMITS.LOG_RETENTION) log.pop();
  saveLog(log);
  updateLogBadge();
}
function updateLogBadge(){
  const log=getLog();
  const badge=document.getElementById('log-badge');
  if(!badge) return;
  if(log.length>0){ badge.style.display='block'; badge.textContent=log.length>LIMITS.LOG_BADGE_MAX?LIMITS.LOG_BADGE_MAX+'+':log.length; }
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
  _dataVersion++;   // reset bypasses rebuildMonths/saveData — invalidate memo here
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
        <span style="background:rgba(var(--green-rgb),0.10);border:1px solid rgba(var(--green-rgb),0.2);border-radius:8px;padding:3px 10px;font-size:11px;font-weight:600;color:var(--green)">${esc(String(entry.txCount))} transaction${entry.txCount===1?'':'s'}</span>
        <span style="background:rgba(var(--blue-rgb),0.10);border:1px solid rgba(var(--blue-rgb),0.2);border-radius:8px;padding:3px 10px;font-size:11px;font-weight:600;color:#2979ff">${esc(String(entry.monthCount))} month${entry.monthCount===1?'':'s'}</span>
        <span style="background:var(--o05);border:1px solid var(--o08);border-radius:8px;padding:3px 10px;font-size:11px;color:var(--muted)">${esc(entry.months)}</span>
      </div>
    </div>`).join('');
}

// ──────── Import flow (multi-file + conflict resolution) ────────
let _pendingFiles = [];       // queue of File objects waiting to process
let _pendingConflict = null;  // { file, newTxs, newMonths, newKeys, conflictingMonths }
let _pendingPreview = null;   // { file, result } awaiting user confirm in the import-preview modal
let _importBusy = false;      // true between handleFiles start and final processNextFile drain
let _lastImportedMonths = null; // accumulates month keys across a batch for anomaly detection
let _lastImportReceipt = null;  // accumulates the committed-import summary shown as a receipt after a batch
let _pendingAccountHint = null; // default account/source for the next import preview (e.g. the bank picked in the wizard)
let _fromWizard = false;        // true when the in-progress import was started from the first-run wizard (drives the receipt's "use the Import button next time" note)

function handleFiles(files){
  if(!files || !files.length) return;
  const incoming = Array.from(files);
  if(_importBusy || _pendingFiles.length || _pendingConflict || _pendingPreview){
    // An import is already in progress. Append rather than overwrite so we
    // never drop files the user picked earlier or clobber a pending conflict.
    _pendingFiles.push(...incoming);
    return;
  }
  _pendingFiles = incoming;
  _importBusy = true;
  _setImportBusyUI(true);
  processNextFile();
}

// Reflect import progress on the header Import button so the app never feels
// frozen while a CSV/PDF parses (parsing blocks with no other visible cue).
function _setImportBusyUI(busy){
  const btn = document.getElementById('hdr-import-btn');
  if(!btn) return;
  btn.disabled = busy;
  btn.textContent = busy ? 'Importing…' : 'Import';
}

function processNextFile(){
  if(!_pendingFiles.length){
    // All files done -- final render. Clear the busy flag so the next
    // user-initiated import starts a fresh batch.
    _importBusy = false;
    _setImportBusyUI(false);
    saveData();
    renderAll();
    // Land on the dashboard first (Budget when still on defaults, so the "build a
    // budget from your spending" card is front-and-centre; otherwise Summary)…
    const _toBudget = (typeof gbSuggest !== 'undefined' && gbSuggest.shouldShow && gbSuggest.shouldShow());
    showScreen(_toBudget ? 'budget' : 'summary', _navBtn(_toBudget ? 1 : 0));
    // …then show a committed-import receipt OVER it — a summary of exactly what
    // landed, even for a clean import. Low-confidence batches get a prominent
    // "Review N flagged" CTA in the receipt (explicit review without yanking the
    // user away first). Anomaly detection is deferred to the receipt's dismissal
    // so its report modal never competes with the receipt for the screen.
    const _anomMonths = (_lastImportedMonths && _lastImportedMonths.size) ? [..._lastImportedMonths] : null;
    const _runAnom = () => { if(typeof runAnomalyDetection === 'function' && _anomMonths) runAnomalyDetection(_anomMonths); };
    if(_lastImportReceipt && typeof gbConfidence !== 'undefined' && gbConfidence.showReceipt){
      // Count this batch's review items (low-confidence + duplicates + signs +
      // transfers + outliers + uncategorized + new merchants) so the receipt's
      // status reflects everything worth a look, not just the parse confidence.
      const _batchIds = new Set((_lastImportReceipt.importIds || []).map(String));
      try {
        _lastImportReceipt.reviewCount = gbConfidence.reviewItems()
          .filter(it => _batchIds.has(String(it.tx.imp))).length;
      } catch(_){ _lastImportReceipt.reviewCount = _lastImportReceipt.lowConf; }
      gbConfidence.showReceipt(_lastImportReceipt, _runAnom);
    } else {
      _runAnom();
    }
    _lastImportedMonths = null;
    _lastImportReceipt = null;
    _fromWizard = false;
    return;
  }
  const file = _pendingFiles.shift();
  // Tell the user something is happening -- parseCSV / aggregate can block
  // 100-500ms on a multi-thousand-row file and a frozen UI feels broken.
  if(typeof showToast === 'function') showToast('Reading ' + file.name + '…');
  const rd = new FileReader();
  rd.onload = async e => {
    try{
      const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
      let result;
      if(isPdf){
        // PDF statements: text-extract + heuristic row parse (gbPdf), returning
        // the same { txs, mapping, counts } shape the CSV path produces.
        if(typeof gbPdf === 'undefined') throw new Error('PDF support is unavailable in this build.');
        result = await gbPdf.parse(e.target.result);
      } else {
        // Decode the raw bytes ourselves so a UTF-16-encoded CSV (e.g. saved
        // from Excel on Windows) is read with the right encoding instead of
        // garbled as UTF-8.
        const text = decodeBytes(e.target.result);
        const{headers,rows} = parseCSV(text);
        result = processCSV(rows, headers);
      }
      if(!result.txs.length){
        // Nothing usable. If the file had rows but every one was dropped, say
        // why rather than failing silently (the core "confirm it was understood"
        // gap) -- the date format is the usual culprit.
        if(result.note){ gbDialog.alert(result.note); processNextFile(); return; }
        const c = result.counts;
        if(c.total > 0){
          const reasons = [];
          if(c.undated) reasons.push(c.undated + ' had unreadable dates');
          if(c.skipped) reasons.push(c.skipped + ' matched your skip rules');
          gbDialog.alert('No transactions could be read from "' + file.name + '".\n\n'
            + c.total + ' row' + (c.total===1?'':'s') + ' found'
            + (reasons.length ? ' — ' + reasons.join(', ') : '')
            + '.\n\nCheck Settings → Column Mapping, especially the date format.');
        }
        processNextFile();
        return;
      }
      // Pause and let the user confirm the file was understood before committing.
      // Confirm/cancel resume the flow via confirmImportPreview / cancelImportPreview.
      _pendingPreview = { file, result };
      showImportPreview(file.name, result);
    }catch(err){
      // A bug in parseCSV / processCSV / aggregate must not strand _importBusy.
      console.warn('Greenbar: error processing "'+file.name+'"',err);
      gbDialog.alert('Could not process "'+file.name+'": '+(err&&err.message||err));
      processNextFile();
    }
  };
  rd.onerror=()=>{ gbDialog.alert('Could not read "'+file.name+'". Please make sure it is a valid CSV or PDF file.'); processNextFile(); };
  rd.readAsArrayBuffer(file);
}

// ──────── Import confirmation (preview before commit) ────────
// Show how the file was parsed: detected columns + date format, imported vs
// dropped counts, and a small sample. The user confirms or cancels; only on
// confirm do we aggregate, check month conflicts, and apply.
function showImportPreview(filename, result){
  const m = result.mapping || {};
  const c = result.counts || {};
  const dropped = (c.undated||0) + (c.skipped||0);

  // Friendly "we detected X" chip (no "column mapping"/"auto-detect" jargon).
  // state: 'ok' (green check) | 'warn' (amber, required field missing) | 'optional'.
  const detChip = (label, state, src) => {
    const ic = state === 'ok' ? '&#10003;' : (state === 'warn' ? '&#9888;' : '&middot;');
    return `<div class="det-chip ${state}"><span class="det-ic" aria-hidden="true">${ic}</span><span class="det-l">${esc(label)}</span><span class="det-src">${esc(src)}</span></div>`;
  };

  const sampleRows = result.txs.slice(0,5).map(t => {
    const lbl = (parseDateParts(t.date, m.fmt)||{}).label || t.date || '';
    const cat = t.isIncome ? 'Income' : t.cat;
    return `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--o05);">
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(cleanVendor(t.desc)||t.desc)}</div>
        <div style="font-size:11px;color:var(--muted);">${esc(lbl)} · ${esc(cat)}</div>
      </div>
      <div style="font-family:var(--font-display);font-size:13px;font-weight:800;flex-shrink:0;color:${t.amount<0?'var(--text)':'var(--green)'};">${t.amount<0?'−':'+'}${fmt(Math.abs(t.amount))}</div>
    </div>`;
  }).join('');

  const sub = document.getElementById('import-preview-sub');
  if(sub) sub.textContent = filename;
  // Confidence header — make a low-confidence parse impossible to miss. A clean
  // (high-confidence) parse gets a calm green chip; a low/mixed parse gets a
  // prominent colored panel listing the specific reasons and stating plainly
  // that the rows will import flagged for review.
  const verdict = (typeof gbConfidence !== 'undefined')
    ? gbConfidence.importConfidence(result)
    : { level: (result.confidence || 'high'), reasons: (result.reasons || []) };
  const lvl = verdict.level;
  let confHtml;
  if(lvl === 'high'){
    confHtml = `<div class="imp-conf high">&#10003; Looks clean — we read your file with high confidence.</div>`;
  } else {
    const reasons = (verdict.reasons && verdict.reasons.length)
      ? verdict.reasons
      : (result.warn ? [result.warn] : ['Greenbar inferred the columns from the page layout.']);
    confHtml = `<div class="imp-conf ${lvl === 'low' ? 'low' : 'mixed'}">
      <div class="imp-conf-title">&#9888; Low confidence — please review</div>
      <ul class="imp-conf-reasons">${reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
      <div class="imp-conf-note">These rows will import <strong>flagged for review</strong> so you can verify each one in the Import Confidence Center.</div>
    </div>`;
  }
  const _cbtn = document.getElementById('import-confirm-btn');
  if(_cbtn) _cbtn.textContent = (lvl === 'high') ? 'Import' : 'Import & review';
  // Account / source — every import belongs to one (foundation for multi-account
  // accuracy). Free-type or pick a known account; defaults to the wizard's bank
  // hint, else the most-recently-used account.
  const _accts = Array.isArray(CFG.accounts) ? CFG.accounts : [];
  const _acctDefault = _pendingAccountHint || _accts[0] || '';
  const acctHtml = `
    <div style="margin-bottom:12px;">
      <label for="import-account-input" class="eyebrow" style="display:block;margin-bottom:6px;">Account / source</label>
      <input id="import-account-input" list="import-account-list" value="${esc(_acctDefault)}" placeholder="e.g. Chase Checking" autocomplete="off" style="width:100%;box-sizing:border-box;background:var(--glass);border:1px solid var(--border);border-radius:12px;color:var(--text);font-size:14px;font-family:var(--font-body);padding:10px 12px;">
      <datalist id="import-account-list">${_accts.map(a => `<option value="${esc(a)}"></option>`).join('')}</datalist>
      <div style="font-size:11px;color:var(--muted);margin-top:5px;line-height:1.5;">These transactions are tagged to this account, so multiple accounts stay separate.</div>
      <label for="import-open-input" class="eyebrow" style="display:block;margin:12px 0 6px;">Statement balances (optional)</label>
      <div style="display:flex;gap:8px;">
        <input id="import-open-input" type="text" inputmode="decimal" placeholder="Opening balance" autocomplete="off" style="flex:1;min-width:0;box-sizing:border-box;background:var(--glass);border:1px solid var(--border);border-radius:12px;color:var(--text);font-size:14px;font-family:var(--font-body);padding:10px 12px;">
        <input id="import-balance-input" type="text" inputmode="decimal" placeholder="Closing balance" autocomplete="off" style="flex:1;min-width:0;box-sizing:border-box;background:var(--glass);border:1px solid var(--border);border-radius:12px;color:var(--text);font-size:14px;font-family:var(--font-body);padding:10px 12px;">
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:5px;line-height:1.5;">Enter both and Greenbar checks the import <strong>reconciles</strong> — that these transactions exactly account for the change from opening to closing balance. Closing alone still powers a running balance.</div>
    </div>`;
  document.getElementById('import-preview-body').innerHTML = confHtml + acctHtml + `
    <div style="background:var(--glass);border:1px solid var(--border);border-radius:14px;padding:12px 14px;margin-bottom:12px;">
      <div style="font-size:13px;font-weight:700;margin-bottom:9px;">We read your file — does this look right?</div>
      <div class="det-chips">
        ${detChip('Date', m.date?'ok':'warn', m.date||'not found')}
        ${detChip('Description', m.desc?'ok':'optional', m.desc||'optional')}
        ${detChip('Amount', m.amt?'ok':'warn', m.amt||'not found')}
      </div>
      ${(!m.date||!m.amt)
        ? `<div style="font-size:12px;color:var(--amber);margin-top:9px;line-height:1.5;">We couldn't find a ${!m.date&&!m.amt?'Date and Amount column':(!m.date?'Date column':'Amount column')}. Set your bank's column names in Settings &rarr; Bank Transactions Format.</div>`
        : `<div style="font-size:11px;color:var(--muted);margin-top:9px;line-height:1.5;">Dates read as ${esc(m.fmt||'MM/DD/YY')} &middot; categories assigned automatically.</div>`}
    </div>
    <div style="display:flex;gap:8px;margin-bottom:${dropped?'8px':'12px'};">
      <div style="flex:1;background:rgba(var(--green-rgb),0.08);border:1px solid rgba(var(--green-rgb),0.2);border-radius:12px;padding:10px;text-align:center;">
        <div style="font-family:var(--font-display);font-size:20px;font-weight:900;color:var(--green);">${c.imported||0}</div>
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;">Ready to import</div>
      </div>
      <div style="flex:1;background:${dropped?'rgba(var(--amber-rgb),0.08)':'var(--o04)'};border:1px solid ${dropped?'rgba(var(--amber-rgb),0.25)':'var(--border)'};border-radius:12px;padding:10px;text-align:center;">
        <div style="font-family:var(--font-display);font-size:20px;font-weight:900;color:${dropped?'var(--amber)':'var(--muted)'};">${dropped}</div>
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;">Skipped</div>
      </div>
    </div>
    ${dropped ? `<div style="font-size:12px;color:var(--soft);margin:0 2px 12px;line-height:1.5;">${c.undated?c.undated+' row'+(c.undated===1?'':'s')+' with unreadable dates':''}${c.undated&&c.skipped?'; ':''}${c.skipped?c.skipped+' matched skip rules':''}. If the date count looks wrong, adjust the date format in Settings → Bank Transactions Format.</div>` : ''}
    <div style="display:flex;align-items:center;gap:10px;padding:0 0 5px;border-bottom:1px solid var(--o05);font-family:var(--font-display);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);">
      <div style="flex:1;">Description &middot; Date</div><div>Amount</div>
    </div>
    ${sampleRows || '<div style="font-size:12px;color:var(--muted);padding:6px 0;">No rows to preview.</div>'}`;
  openModal('modal-import-preview');
}

function confirmImportPreview(){
  // Read the account before the modal teardown; default to "Unassigned" so every
  // import still belongs to a source.
  const _acctEl = document.getElementById('import-account-input');
  const account = ((_acctEl && _acctEl.value) || '').trim() || 'Unassigned';
  // Optional statement balances. Closing alone -> running balance; opening +
  // closing -> a reconciliation check (do these transactions account for the
  // exact change between them?).
  const _balEl = document.getElementById('import-balance-input');
  const closingBalance = (_balEl && String(_balEl.value).trim() !== '') ? parseAmt(_balEl.value) : null;
  const _openEl = document.getElementById('import-open-input');
  const openingBalance = (_openEl && String(_openEl.value).trim() !== '') ? parseAmt(_openEl.value) : null;
  // Account type + payment policy were profile-driven (gbProfiles, removed in
  // the Phase 4 audit cut). Defaults kept for backward-compat on the
  // applyImport / _pendingConflict signatures; they no longer drive behaviour.
  const acctType = 'checking';
  const paymentsAsSpending = false;
  closeModal('modal-import-preview');
  _pendingAccountHint = null;
  const pend = _pendingPreview; _pendingPreview = null;
  if(!pend){ processNextFile(); return; }
  const { file, result } = pend;
  const newTxs = result.txs;
  const newMonths = aggregate(newTxs);
  const newKeys = sortKeys(newMonths);
  const conflictingMonths = newKeys.filter(mk => _months[mk] && _months[mk].txs.length > 0);
  if(conflictingMonths.length > 0){
    _pendingConflict = { file, newTxs, newMonths, newKeys, conflictingMonths, result, account, closingBalance, openingBalance, acctType, paymentsAsSpending };
    showConflictModal(file.name, conflictingMonths, newKeys);
  } else {
    applyImport(file, newTxs, newMonths, newKeys, 'merge', result, account, closingBalance, openingBalance, acctType, paymentsAsSpending);
    processNextFile();
  }
}

function cancelImportPreview(){
  closeModal('modal-import-preview');
  _pendingPreview = null;
  _pendingAccountHint = null;
  processNextFile();   // skip this file, continue the queue
}

function showConflictModal(filename, conflictingMonths, allNewMonths){
  document.getElementById('conflict-title').textContent = 'Month conflict detected';
  document.getElementById('conflict-sub').textContent =
    `"${filename}" contains data for months you've already imported. How would you like to handle it?`;

  const monthsHtml = `
    <div style="background:var(--o04);border:1px solid var(--border);border-radius:14px;padding:12px 14px;">
      <div class="eyebrow" style="font-weight:700;margin-bottom:10px;">Overlapping months</div>
      ${conflictingMonths.map(mk => {
        const existing = _months[mk];
        const existingTxs = existing ? existing.txs.length : 0;
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--o05);font-size:13px;">
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

  // Guard the null case too: a stray/double call (e.g. button after Esc already
  // resolved) must not throw on the destructure below and strand _importBusy.
  if(action === 'cancel' || action === 'skip' || !_pendingConflict){
    _pendingConflict = null;
    processNextFile();
    return;
  }

  const { file, newTxs, newMonths, newKeys, result, account, closingBalance, openingBalance, acctType, paymentsAsSpending } = _pendingConflict;
  _pendingConflict = null;

  if(action === 'replace'){
    // Drop existing aggregates for conflicting months. _allTxs is rebuilt
    // wholesale from _months at the end of applyImport, so it needs no edit here.
    for(const mk of newKeys){ delete _months[mk]; }
  }

  // Apply import (merge or clean replace)
  applyImport(file, newTxs, newMonths, newKeys, action, result, account, closingBalance, openingBalance, acctType, paymentsAsSpending);
  processNextFile();
}

function applyImport(file, newTxs, newMonths, newKeys, mode, result, account, closingBalance, openingBalance, acctType, paymentsAsSpending){
  // Tag every row in this batch with a shared import id so the clean-up center
  // can undo exactly these transactions later. newMonths[mk].txs are the same
  // objects as newTxs, so tagging here covers both the replace and merge paths.
  const importId = 'imp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  // Account/source: tag every row, and remember the account (most-recent first)
  // so it's offered as a default and a datalist option next time.
  const acct = ((account || '').trim()) || 'Unassigned';
  for(const tx of newTxs){ tx.imp = importId; tx.acct = acct; }
  if(!Array.isArray(CFG.accounts)) CFG.accounts = [];
  CFG.accounts = [acct, ...CFG.accounts.filter(a => a !== acct)];
  if(typeof saveCFG === 'function') saveCFG();
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
  // Accumulate the months touched by this batch so processNextFile() can run
  // anomaly detection over all of them once the whole import drains.
  if(!_lastImportedMonths) _lastImportedMonths = new Set();
  newKeys.forEach(k => _lastImportedMonths.add(k));
  // Derive the trust metadata for this batch. lowConfCount / dateRange come
  // from the rows themselves; skipped / undated / parse confidence come from
  // the parse result (the dropped rows aren't in newTxs, so they can only be
  // read from result.counts). `result` is optional — absent on legacy paths.
  const _counts = (result && result.counts) || {};
  const _lowConf = newTxs.reduce((n, t) => n + (t.needsReview ? 1 : 0), 0);
  const _confidence = (result && result.confidence)
    || (_lowConf ? (_lowConf < newTxs.length ? 'mixed' : 'low') : 'high');
  let _lo = Infinity, _hi = -Infinity;
  for(const t of newTxs){ if(t.ts < _lo) _lo = t.ts; if(t.ts > _hi) _hi = t.ts; }
  const _dateRange = newTxs.length
    ? { firstTs: _lo, lastTs: _hi, firstMonth: newKeys[0], lastMonth: newKeys[newKeys.length - 1] }
    : null;
  addToLog({
    id:           importId,
    filename:     file.name,
    txCount:      newTxs.length,
    monthCount:   newKeys.length,
    months:       newKeys.join(', '),
    skipped:      _counts.skipped || 0,
    undated:      _counts.undated || 0,
    confidence:   _confidence,
    lowConfCount: _lowConf,
    dateRange:    _dateRange,
    account:      acct,
    // Optional statement closing balance, anchored to the import's latest tx date
    // (so a running balance = closingBalance + later transactions for this account).
    closingBalance: (closingBalance == null ? null : closingBalance),
    balanceAsOf:    (closingBalance != null && isFinite(_hi)) ? _hi : null,
    // Opening balance enables reconciliation: opening + sum(this import's txns)
    // should equal closing. The match is computed live by gbReconcile.
    openingBalance: (openingBalance == null ? null : openingBalance),
  });
  // Accumulate the committed-import summary for the post-import receipt shown
  // once the whole batch drains (replaces the old per-commit "Imported N" toast,
  // which the receipt now supersedes).
  if(!_lastImportReceipt) _lastImportReceipt = { files: [], importIds: [], accounts: new Set(), txCount: 0, skipped: 0, undated: 0, lowConf: 0, months: new Set(), fromWizard: false };
  if(_fromWizard) _lastImportReceipt.fromWizard = true;
  _lastImportReceipt.files.push(file.name);
  _lastImportReceipt.importIds.push(importId);
  _lastImportReceipt.accounts.add(acct);
  _lastImportReceipt.txCount += newTxs.length;
  _lastImportReceipt.skipped += (_counts.skipped || 0);
  _lastImportReceipt.undated += (_counts.undated || 0);
  _lastImportReceipt.lowConf += _lowConf;
  newKeys.forEach(k => _lastImportReceipt.months.add(k));
}




// ── Shared utility: clean bank transaction description to vendor name

// ──────── Navigation + modals (open/close/swipe/keyboard) ────────
// Analyst surfaces (anomaly / cleanup / forecast / trends) stay hidden until the
// user has a REAL import (a gb_log entry — demo data doesn't count) AND has seen
// a populated Summary at least once. Before that, the app stays simple instead of
// feeling like an analyst workstation.
function analyticsUnlocked(){
  try{ return (typeof getLog === 'function' && getLog().length > 0) && localStorage.getItem('gb_seen_summary') === '1'; }
  catch(e){ return false; }
}
// Toggle the visibility of gated Settings rows (currently: Fix data issues).
function _updateGatedSurfaces(){
  const unlocked = analyticsUnlocked();
  const cr = document.getElementById('cleanup-row');
  if(cr) cr.style.display = unlocked ? '' : 'none';
}

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
  srAnnounce(({summary:'Summary screen',budget:'Budget screen',txs:'Transactions screen',settings:'Settings screen',confidence:'Import Confidence Center'}[name])||'Screen changed');
  if(name==='budget') renderBudget();
  if(name==='txs') renderTxs();
  if(name==='settings'){ syncUI(); renderBudgetInputs(); updateStorageDesc(); _updateGatedSurfaces(); }
  if(name==='summary' && !Object.keys(_months||{}).length){
    if(localStorage.getItem('gb_setup_done')){
      renderSummary();
    } else {
      const setupActive = document.getElementById('screen-setup')?.classList.contains('active');
      if(!setupActive) setTimeout(()=>{ runFlashIntro(); }, 50);
    }
  }
  // Mark that a populated Summary has been viewed (half of the analyst-surface gate).
  if(name==='summary' && Object.keys(_months||{}).length){
    try{ if(localStorage.getItem('gb_seen_summary') !== '1') localStorage.setItem('gb_seen_summary','1'); }catch(_){}
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
  }, TIMING.MODAL_CLOSE_MS);
}
function closeOut(e,id){ if(e.target===document.getElementById(id)) closeModal(id); }
// Keyboard support for modal dialogs: Esc closes, Tab is trapped inside.
document.addEventListener('keydown',function(e){
  const open=document.querySelector('.modal-overlay.open');
  if(!open) return;
  if(e.key==='Escape'){
    e.preventDefault();
    if(open.id==='modal-conflict') resolveConflict('cancel');
    else if(open.id==='modal-import-preview') cancelImportPreview();
    else if(open.id==='modal-import-receipt' && typeof gbConfidence !== 'undefined') gbConfidence.dismissReceipt();
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
  if(!overlay || overlay.id === 'modal-conflict' || overlay.id === 'modal-import-preview') return; // these modals must use buttons
  const sheet = overlay.querySelector('.sheet');
  if(!sheet || !sheet.contains(e.target)) return;
  const rectTop = sheet.getBoundingClientRect().top;
  const touchY = e.touches[0].clientY;
  // Only start the gesture if the user grabbed the top strip (handle/title area).
  if(touchY - rectTop > SWIPE.TOP_STRIP_PX) return;
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
  // Dismiss if dragged past threshold OR flicked hard.
  if(dy > SWIPE.DISMISS_DISTANCE_PX || velocity > SWIPE.FLICK_VELOCITY){
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
  setTimeout(()=>{ el.textContent = msg; }, TIMING.SR_ANNOUNCE_DELAY);
}
// Toasts queue rather than overwrite. A second showToast() call while the
// first is still on screen used to clobber the message and fight the fade
// timer. Now each message gets its own ~3.2s slot in order.
let _toastQueue = [];
let _toastShowing = false;
// type: 'success' (default) | 'error'. Callers across backup.js / manual-tx.js
// pass an explicit type; it drives the toast color in _drainToast so failures
// don't read as success-green.
function showToast(msg, type){
  _toastQueue.push({ msg, type: type || 'success' });
  if(!_toastShowing) _drainToast();
}
// Per-type toast palette. Default/unknown types fall back to success.
const _TOAST_COLORS = {
  success: { bg:'rgba(var(--green-rgb),0.95)', fg:'#050a14' },
  error:   { bg:'rgba(var(--red-rgb),0.97)', fg:'#fff'     },
};
function _drainToast(){
  if(!_toastQueue.length){ _toastShowing = false; return; }
  _toastShowing = true;
  const { msg, type } = _toastQueue.shift();
  let toast = document.getElementById('gb-toast');
  if(!toast){
    toast = document.createElement('div');
    toast.id = 'gb-toast';
    toast.setAttribute('role','status');
    toast.setAttribute('aria-live','polite');
    toast.style.cssText = 'position:fixed;bottom:calc(70px + var(--safe-b));left:50%;transform:translateX(-50%) translateY(20px);padding:12px 20px;border-radius:14px;font-size:13px;font-weight:700;font-family:var(--font-display);white-space:nowrap;z-index:999;opacity:0;transition:all 0.3s cubic-bezier(0.34,1.4,0.64,1);pointer-events:none;max-width:90vw;white-space:normal;text-align:center;';
    document.body.appendChild(toast);
  }
  // Recolor per message type (error toasts must not read as success-green).
  const pal = _TOAST_COLORS[type] || _TOAST_COLORS.success;
  toast.style.background = pal.bg;
  toast.style.color = pal.fg;
  toast.textContent = msg;
  setTimeout(()=>{ toast.style.opacity='1'; toast.style.transform='translateX(-50%) translateY(0)'; },10);
  setTimeout(()=>{ toast.style.opacity='0'; toast.style.transform='translateX(-50%) translateY(10px)'; },TIMING.TOAST_VISIBLE_MS);
  // Advance to the next queued message after the fade-out, with a small
  // gap so messages don't visually overlap.
  setTimeout(()=>{ _drainToast(); }, TIMING.TOAST_SLOT_MS);
}
