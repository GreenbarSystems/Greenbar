// ════ Greenbar — features: AI help, walkthrough, setup wizard, bank export ════
// Self-contained interactive flows. Each has its own module-local state
// (_aiOpen, _flashTimers, _setupState).

// Best-effort localStorage write. Swallowed errors (quota, private mode,
// disabled storage) are intentional — the wizard's "done" flag and similar
// one-shot writes should never crash the UI if the platform rejects them.
function safeSetLocal(key, val){
  try{ localStorage.setItem(key, val); }catch(e){}
}

// ──────── AI help panel + topic-keyword routing ────────
let _aiOpen = false;
let _aiTyping = false;

function toggleAIHelp(){
  _aiOpen = !_aiOpen;
  const panel = document.getElementById('ai-panel');
  if(panel) panel.style.transform = _aiOpen ? 'translateY(0)' : 'translateY(100%)';
  if(_aiOpen) setTimeout(()=>document.getElementById('ai-input')?.focus(), 400);
}

function showAIButton(){
  const btn = document.getElementById('ai-help-btn');
  if(btn) btn.style.display = 'flex';
  // Note: button visibility also controlled by hdr-wordmark-wrap opacity
}

function appendAIMsg(text, cls){
  const msgs = document.getElementById('ai-messages');
  if(!msgs) return null;
  const div = document.createElement('div');
  div.className = 'ai-msg ' + cls;
  div.textContent = text;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

// Self-contained help agent -- matches the question against in-app help topics.
// Fully offline: no network call, no API key. Answers app-usage questions only.
const HELP_TOPICS = [
  { kw:['import','csv','upload','add a file','load','statement','get started','how do i start'],
    a:'Tap the green Import button at the top and choose your Bank Transactions. Greenbar reads them instantly on your device — nothing is uploaded. Each new import merges with your existing data, so you can add a file every month.' },
  { kw:['column','mapping','header','date column','amount column','recognize',"can't read"],
    a:'If Greenbar can\'t read your bank\'s file, open Settings → Column Mapping and type the exact header names for Date, Description and Amount. Leave a field blank to auto-detect it.' },
  { kw:['category','categories','remap','reclassify','wrong category','miscategor'],
    a:'Greenbar categorizes each transaction automatically. To change how a merchant is sorted, open Settings → Category Remaps and add a rule: when a description contains a keyword, assign it a category.' },
  { kw:['budget','target','vs actual','over budget','under budget'],
    a:'The Budget screen compares your targets against actual spend for the selected month — green is under budget, red is over. Set or edit targets in Settings, or during the setup wizard.' },
  { kw:['income','payroll','paycheck','salary','deposit','counted as income'],
    a:'Transactions containing your income keywords (like PAYROLL or DIRECT DEPOSIT) are counted as income. Edit that list in Settings → Income Keywords.' },
  { kw:['skip','exclude','ignore','internal transfer','leave out'],
    a:'To exclude transactions such as internal transfers, open Settings → Skip Transactions and add keywords. Any transaction containing one is left out entirely.' },
  { kw:['transaction','search','find','browse','list'],
    a:'The Transactions screen lists every transaction grouped by date. Use the search bar to filter by merchant name or category.' },
  { kw:['health score','grade','score','rating'],
    a:'Each month gets a 0–100 health score from three parts: savings rate (40 pts), budget adherence (40 pts) and tracking diversity (20 pts). It becomes a letter grade — A is 90+, F is below 60.' },
  { kw:['summary','net','dashboard','home screen','overview'],
    a:'The Summary screen is your home view: monthly net, income vs expenses and top categories. Use the month pills at the top to switch months, or All for a multi-month average.' },
  { kw:['insight','vendor','drill','breakdown','deep dive','observation'],
    a:'On the Summary screen, tap a category: Transactions shows every merchant in it ranked by spend, and Insights shows trends, top vendors and observations.' },
  { kw:['privacy','private','secure','safe','server','where is my data','data stored'],
    a:'Your transactions, budgets and settings stay on your device. Greenbar has no server and no account, so there\'s nowhere to send them and nothing to leak.' },
  { kw:['conflict','overlap','same month','already imported','merge','replace'],
    a:'If you import a file covering months you already have, Greenbar asks how to handle it: Replace wipes the old data for those months; Merge combines both sets and skips exact duplicate rows.' },
  { kw:['delete','clear','erase','reset','wipe','remove all'],
    a:'To erase everything, open the Guide screen → Privacy & Data → Clear All Data. This permanently removes all transactions, settings and history from this device.' },
  { kw:['log','upload log','imported files','import history'],
    a:'The Upload Log records all the Bank Transactions you\'ve imported — filename, date, transaction count and months covered. It stores metadata only, never the raw file.' },
  { kw:['offline','internet','connection','work offline','no wifi'],
    a:'Greenbar works fully offline. There are no external calls — importing, categorizing and saving all happen on your device.' },
];

function answerHelpQuery(q){
  const text = q.toLowerCase();
  let best = null, bestScore = 0;
  for(const t of HELP_TOPICS){
    let score = 0;
    for(const k of t.kw){ if(text.includes(k)) score += (k.length > 4 ? 2 : 1); }
    if(score > bestScore){ bestScore = score; best = t; }
  }
  if(best && bestScore > 0) return best.a;
  return 'I can help with questions about using Greenbar — importing Bank Transactions, categories, budgets, the health score, privacy and more. Try "how do I import a file?" or "how is my health score calculated?" I can\'t help with finance or math questions.';
}

function sendAIMessage(){
  if(_aiTyping) return;
  const input = document.getElementById('ai-input');
  const msg = input?.value.trim();
  if(!msg) return;
  input.value = '';
  input.style.height = 'auto';

  appendAIMsg(msg, 'ai-msg-user');
  const loadingDiv = appendAIMsg('Thinking…', 'ai-msg-loading');
  _aiTyping = true;
  const sendBtn = document.getElementById('ai-send-btn');
  if(sendBtn) sendBtn.style.opacity = '0.5';

  // Brief pause so the reply doesn't feel jarringly instant
  setTimeout(()=>{
    if(loadingDiv) loadingDiv.remove();
    // Try the on-device insights engine first (questions about the user's own
    // data — fully local, no network); fall back to app-usage keyword help.
    const dataReply = (typeof gbInsights !== 'undefined') ? gbInsights.answer(msg) : null;
    appendAIMsg(dataReply || answerHelpQuery(msg), 'ai-msg-bot');
    _aiTyping = false;
    if(sendBtn) sendBtn.style.opacity = '1';
  }, 300);
}

// Show AI button after setup completes or when returning user has data

// ──────── showHeaderButtons (reveals wordmark + Import after onboarding) ────────
function showHeaderButtons(){
  ['hdr-import-btn','hdr-wordmark-wrap'].forEach(id=>{
    const el=document.getElementById(id);
    if(el){ el.style.opacity='1'; el.style.pointerEvents='auto'; }
  });
  // Reveal nav buttons
  const nav = document.getElementById('bottom-nav');
  if(nav) nav.classList.add('visible');
  showAIButton();
}

// ──────── Flash intro: "Hey there." -> "Welcome to Greenbar" -> Get Started ────────
// Track all flash timers so we can cancel on tap.
let _flashTimers = [];
let _flashDone = false;

// All timing for the intro animation lives here. Phase delays are absolute
// ms from runFlashIntro entry; durations are CSS transition lengths.
const FLASH = {
  PHASE: {
    P1_IN:     150,   // "Hey there." fades in
    P1_OUT:    1500,  // "Hey there." fades out (trimmed to reduce time-to-CTA)
    P2_IN:     1700,  // "Welcome to Greenbar" crossfades in
    CTA_IN:    2300,  // "Get Started" button fades in (~1.4s sooner than before)
  },
  FADE: {
    P1_IN_S:   '0.4s',  // Phase-1 fade-in duration
    P1_OUT_S:  '0.5s',  // Phase-1 fade-out duration
    P2_IN_S:   '0.7s',  // Phase-2 fade-in duration
    CTA_IN_S:  '0.5s',  // CTA fade-in duration
  },
  SKIP: {
    P1_OUT_S:  '0.25s', // tap-to-skip: phase-1 dismissal
    P2_IN_S:   '0.4s',  // tap-to-skip: phase-2 reveal
    CTA_IN_S:  '0.4s',  // tap-to-skip: CTA reveal
    CTA_DELAY: 350,     // ms to wait before CTA reveal on skip
  },
};

function runFlashIntro(){
  // Restore flash HTML if it was replaced by renderSummary (e.g. after data clear)
  const sc = document.getElementById('summary-content');
  if(sc && !document.getElementById('flash-intro')){
    sc.innerHTML = `
      <div id="flash-intro" style="display:flex;flex-direction:column;align-items:center;justify-content:flex-start;height:calc(100dvh - 120px);text-align:center;padding:80px 32px 40px;position:relative;">
        <div id="flash-phase-1" style="opacity:0;transition:opacity 0.5s ease;position:absolute;">
          <div style="font-family:var(--font-display);font-size:38px;font-weight:900;letter-spacing:-1px;color:var(--text);">Hey there.</div>
          <div style="font-size:13px;color:var(--muted);margin-top:12px;">Tap to continue</div>
        </div>
        <div id="flash-phase-2" style="opacity:0;transition:opacity 1.4s ease;width:100%;max-width:340px;padding:0 24px;">
          <div style="font-family:var(--font-display);font-size:36px;font-weight:900;letter-spacing:-1px;margin-bottom:10px;">Welcome to <span class="gb-shimmer">Greenbar</span></div>
          <div style="font-size:16px;color:var(--soft);letter-spacing:0.02em;margin-bottom:40px;">Your money, clearly.</div>
          <div id="flash-cta" style="opacity:0;transition:opacity 1.2s ease;">
            <button type="button" class="btn-flash-cta" onclick="startSetupFromFlash()">Get Started &rarr;</button>

          </div>
        </div>
      </div>`;
  }
  const p1  = document.getElementById('flash-phase-1');
  const p2  = document.getElementById('flash-phase-2');
  const cta = document.getElementById('flash-cta');
  const intro = document.getElementById('flash-intro');
  if(!p1) return;
  // Cancel any pending timers from a prior runFlashIntro before scheduling
  // new ones — this function is called from multiple boot paths (core.js,
  // boot.js) and a stale phase-3 timer could otherwise flip _flashDone=true
  // mid-way through the second run.
  _flashTimers.forEach(id => clearTimeout(id));
  _flashTimers = [];
  _flashDone = false;

  // Respect prefers-reduced-motion: skip the animated intro and land on CTA immediately
  const reduceMotion = (typeof matchMedia==='function') && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduceMotion){
    p1.style.transition = 'none'; p1.style.opacity = '0';
    p2.style.transition = 'none'; p2.style.opacity = '1';
    if(cta){ cta.style.transition = 'none'; cta.style.opacity = '1'; }
    _flashDone = true;
    return;
  }

  // Reset all phases to invisible so each run starts clean
  p1.style.transition = 'none'; p1.style.opacity = '0';
  p2.style.transition = 'none'; p2.style.opacity = '0';
  if(cta){ cta.style.transition = 'none'; cta.style.opacity = '0'; }
  // Force reflow so the reset takes effect before transitions are re-enabled
  p1.offsetWidth;

  // Flash always shows "Get Started" -- that's the welcome screen's job

  // Tap anywhere = skip to CTA. { once:true } auto-removes after first tap.
  if(intro){
    intro.removeEventListener('click', flashSkipToCTA); // clear any stale listener
    intro.addEventListener('click', flashSkipToCTA, { once: true });
  }


  function schedule(fn, ms){
    const id = setTimeout(()=>{ if(!_flashDone) fn(); }, ms);
    _flashTimers.push(id);
    return id;
  }

  // Phase 1: "Hey there." fades in
  schedule(()=>{
    if(!p1) return;
    p1.style.transition = `opacity ${FLASH.FADE.P1_IN_S} ease`;
    p1.style.opacity = '1';
  }, FLASH.PHASE.P1_IN);

  // Phase 1 fades out
  schedule(()=>{
    if(!p1) return;
    p1.style.transition = `opacity ${FLASH.FADE.P1_OUT_S} ease`;
    p1.style.opacity = '0';
  }, FLASH.PHASE.P1_OUT);

  // Phase 2: fades in as phase 1 is fading out -- crossfade, no blank gap
  schedule(()=>{
    if(!p2) return;
    const shimmer = p2.querySelector('.gb-shimmer');
    if(shimmer){
      // Restart so the shimmer plays in sync with phase 2 appearing.
      shimmer.style.animation = 'none';
      shimmer.offsetWidth;
      shimmer.style.animation = '';
    }
    p2.style.transition = `opacity ${FLASH.FADE.P2_IN_S} ease`;
    p2.style.opacity = '1';
  }, FLASH.PHASE.P2_IN);

  // CTA fades in
  schedule(()=>{
    // Always flip _flashDone even if the CTA element vanished — the user
    // can no longer skip, but state stays consistent for the next entry.
    _flashDone = true;
    if(!cta) return;
    cta.style.transition = `opacity ${FLASH.FADE.CTA_IN_S} ease`;
    cta.style.opacity = '1';
  }, FLASH.PHASE.CTA_IN);
}

function flashSkipToCTA(e){
  // Already done -- don't interfere with button taps on visible CTA
  if(_flashDone) return;
  if(e) e.stopPropagation();
  // Cancel all pending timers
  _flashTimers.forEach(id => clearTimeout(id));
  _flashTimers = [];
  _flashDone = true;

  const p1  = document.getElementById('flash-phase-1');
  const p2  = document.getElementById('flash-phase-2');
  const cta = document.getElementById('flash-cta');
  // Force phase 1 off immediately
  if(p1){
    p1.style.transition = `opacity ${FLASH.SKIP.P1_OUT_S} ease`;
    p1.style.opacity = '0';
  }
  // Bring in phase 2 + CTA quickly
  if(p2){
    // Restart shimmer so it plays fresh on tap-to-skip
    const shimmer = p2.querySelector('.gb-shimmer');
    if(shimmer){
      shimmer.style.animation = 'none';
      shimmer.offsetWidth;
      shimmer.style.animation = '';
    }
    p2.style.transition = `opacity ${FLASH.SKIP.P2_IN_S} ease`;
    p2.style.opacity = '1';
  }
  if(cta){
    setTimeout(()=>{
      cta.style.transition = `opacity ${FLASH.SKIP.CTA_IN_S} ease`;
      cta.style.opacity = '1';
    }, FLASH.SKIP.CTA_DELAY);
  }
}

function startSetupFromFlash(){
  // UX Tier 3 Phase 1 — import-first: Flash CTA now routes straight to
  // Summary so users can import immediately and see real spend before
  // committing to any budget questions. Previously this dropped users
  // into the 6-step wizard (60-90s upfront commitment before any value).
  //
  // The wizard is still available — and still recommended for users who
  // prefer to define their budget targets up front — via
  // Settings -> Budget Setup Wizard ("Open ->"). For users who skip it, the
  // suggested-budget-from-actuals card (gbSuggest, suggest-budget.js) now
  // appears on Summary after the first import and offers a one-tap budget
  // built from real spend.
  //
  // gb_setup_done is marked so subsequent launches route via the
  // _continueBoot "setup done but no data" branch (empty Summary) rather
  // than firing the flash intro again. The flag's semantic broadens
  // here from strictly "wizard completed" to "user has been onboarded
  // past the flash intro" — see boot.js for the consumer side.
  //
  // The contextual coachmark tour is opt-in via the Guide page (and
  // Settings -> Help) -- it no longer runs automatically as part of
  // onboarding.
  safeSetLocal('gb_wt_done', '1');
  safeSetLocal('gb_setup_done', '1');
  showHeaderButtons();
  showScreen('summary', _navBtn(0));
  renderAll();
}


// ──────── Bank export instructions (per-bank steps) ────────
// Each entry is tagged with a region so the picker (populateBankSelect) shows
// the banks for the user's CFG.region. "Other / not listed" is region 'ALL'.
const BANK_EXPORTS = {
  'Chase': { region:'US', steps:[
    'Sign in at chase.com and select the account you want to export.',
    'On the account activity page, click "Download account activity."',
    'Choose a date range (or "All transactions") and the "Spreadsheet (CSV)" file type.',
    'Click Download — the file saves to your Downloads folder.'
  ], note:'Chase\'s CSV export covers roughly the last 24 months. For older history, download monthly statements instead.' },
  'Bank of America': { region:'US', steps:[
    'Sign in at bankofamerica.com and select your account.',
    'On the Activity tab, choose Download (Bank of America labels it "Download Transactions").',
    'Pick a date range and the CSV file format.',
    'Click Download.'
  ], note:'Bank of America limits each download to about 60 days, so a full year may take several downloads.' },
  'Wells Fargo': { region:'US', steps:[
    'Sign in at wellsfargo.com and open your account.',
    'Click "Download Account Activity" above your transaction list.',
    'Choose a date range and set the format to "Comma Delimited (CSV)."',
    'Click Download.'
  ], note:'Wells Fargo offers up to about 18 months of activity for CSV download.' },
  'Citi': { region:'US', steps:[
    'Sign in at citi.com and open the account you want.',
    'On the account activity page, select the Download option.',
    'Choose a date range and the CSV (or Excel) file format.',
    'Click Download.'
  ] },
  'Capital One': { region:'US', steps:[
    'Sign in at capitalone.com and open your account.',
    'Select "Download Transactions" (under "View More" or the account menu).',
    'Choose a date range and the CSV file type.',
    'Click Download.'
  ] },
  'U.S. Bank': { region:'US', steps:[
    'Sign in at usbank.com and select your account.',
    'From the account activity page, choose "Download Transactions."',
    'Pick a date range and the "Spreadsheet (CSV)" format.',
    'Click Download.'
  ] },
  'PNC': { region:'US', steps:[
    'Sign in at pnc.com and open your account\'s Activity.',
    'Select the Export or Download option.',
    'Choose a date range and the CSV format.',
    'Click Download.'
  ] },
  'Truist': { region:'US', steps:[
    'Sign in at truist.com and open the account.',
    'From the transaction history, choose the Export or Download option.',
    'Choose a date range and the CSV format.',
    'Click Download.'
  ] },
  'TD Bank': { region:'US', steps:[
    'Sign in at td.com and select your account.',
    'On the account activity page, choose Download.',
    'Pick a date range and the CSV (spreadsheet) format.',
    'Click Download.'
  ] },
  'American Express': { region:'US', steps:[
    'Sign in at americanexpress.com and open "Statements & Activity."',
    'Choose the Download option for the period you want.',
    'Select the CSV (Excel) file format.',
    'Click Download.'
  ] },

  // ── United Kingdom ──
  'Barclays (UK)': { region:'GB', steps:[
    'Sign in to Barclays online banking at barclays.co.uk and open the account.',
    'Open the account\'s transactions, then choose "Export" / "Download".',
    'Select CSV (Excel) and a date range.',
    'Download the file.'
  ], note:'In the Barclays app, statements export may be limited — online banking gives the fullest CSV export.' },
  'HSBC UK': { region:'GB', steps:[
    'Sign in at hsbc.co.uk and open the account.',
    'Select "Download" above your transactions.',
    'Choose CSV (or QIF/Excel) and a date range.',
    'Download the file.'
  ] },
  'Lloyds Bank': { region:'GB', steps:[
    'Sign in at lloydsbank.com and open the account.',
    'Choose "Search, view or download transactions" / "Export".',
    'Select the CSV / "Internet banking text file" format and a date range.',
    'Download the file.'
  ] },
  'NatWest': { region:'GB', steps:[
    'Sign in at natwest.com and open the account.',
    'Select "Download transactions" / "Statements".',
    'Choose CSV (Excel) and a date range.',
    'Download the file.'
  ] },
  'Santander UK': { region:'GB', steps:[
    'Sign in at santander.co.uk and open the account.',
    'Open transactions and choose "Download" / "Export".',
    'Select CSV (Excel) and a date range.',
    'Download the file.'
  ] },
  'Monzo': { region:'GB', steps:[
    'Open the Monzo app and go to the account.',
    'Tap the account, then "Statements" / "Export".',
    'Choose CSV and the month or date range.',
    'Save or share the file to your device.'
  ], note:'Monzo also lets you export from monzo.com — handy on a computer.' },
  'Starling Bank': { region:'GB', steps:[
    'Open the Starling app and go to the account.',
    'Open "Statements" and choose to export.',
    'Select CSV and a date range.',
    'Save or share the file to your device.'
  ] },
  'Nationwide': { region:'GB', steps:[
    'Sign in at nationwide.co.uk and open the account.',
    'Choose "Manage / download statements" or "Download transactions".',
    'Select CSV and a date range.',
    'Download the file.'
  ] },

  // ── Australia ──
  'Commonwealth Bank (CBA)': { region:'AU', steps:[
    'Sign in to NetBank at commbank.com.au and open the account.',
    'Select "Export transactions".',
    'Choose CSV and a date range.',
    'Download the file.'
  ] },
  'Westpac': { region:'AU', steps:[
    'Sign in to Westpac online banking and open the account.',
    'Choose "Export" above your transactions.',
    'Select CSV and a date range.',
    'Download the file.'
  ] },
  'ANZ (Australia)': { region:'AU', steps:[
    'Sign in to ANZ Internet Banking and open the account.',
    'Select "Export" / "Download transactions".',
    'Choose CSV and a date range.',
    'Download the file.'
  ] },
  'NAB': { region:'AU', steps:[
    'Sign in to NAB Internet Banking and open the account.',
    'Choose "Export transactions".',
    'Select CSV and a date range.',
    'Download the file.'
  ] },
  'ING (Australia)': { region:'AU', steps:[
    'Sign in at ing.com.au and open the account.',
    'Choose "Export" on the transactions page.',
    'Select CSV and a date range.',
    'Download the file.'
  ] },

  // ── Canada ──
  'RBC Royal Bank': { region:'CA', steps:[
    'Sign in at rbcroyalbank.com and open the account.',
    'Choose "Download Transactions".',
    'Select the Spreadsheet (CSV) format and a date range.',
    'Download the file.'
  ] },
  'TD Canada Trust': { region:'CA', steps:[
    'Sign in to EasyWeb at td.com and open the account.',
    'Choose "Download" above your transactions.',
    'Select CSV and a date range.',
    'Download the file.'
  ] },
  'Scotiabank': { region:'CA', steps:[
    'Sign in at scotiabank.com and open the account.',
    'Choose "Download" / "Export transactions".',
    'Select CSV and a date range.',
    'Download the file.'
  ] },
  'BMO': { region:'CA', steps:[
    'Sign in at bmo.com and open the account.',
    'Choose "Download Transactions".',
    'Select CSV and a date range.',
    'Download the file.'
  ] },
  'CIBC': { region:'CA', steps:[
    'Sign in at cibc.com and open the account.',
    'Choose "Download Transactions".',
    'Select CSV and a date range.',
    'Download the file.'
  ] },

  'Other / not listed': { region:'ALL', steps:[
    'Sign in to your bank\'s website or app and open the account.',
    'Find "Account Activity," "Transaction History," or "Statements."',
    'Look for a Download, Export, or Statements option, and choose CSV (sometimes labeled "Comma Delimited" or "Spreadsheet").',
    'Pick a date range and download the file.'
  ] },
};
// Fill the bank picker with the banks for the active region (+ "Other"). Called
// when the Guide screen opens and after the region changes.
function populateBankSelect(){
  const sel = document.getElementById('bank-export-select');
  if(!sel) return;
  const region = (typeof CFG !== 'undefined' && CFG.region) || 'US';
  const names = Object.keys(BANK_EXPORTS).filter(k => BANK_EXPORTS[k].region === region);
  sel.innerHTML = '<option value="" disabled selected>Select your bank…</option>'
    + names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')
    + '<option value="Other / not listed">Other / not listed</option>';
  showBankExport('');   // reset the steps panel
}
// Repopulate when the user opens the Guide screen (region may have changed).
document.addEventListener('gb:screen', (e) => {
  if(e.detail && e.detail.name === 'intro') populateBankSelect();
});
function showBankExport(key){
  const el=document.getElementById('bank-export-steps');
  if(!el) return;
  if(!key){ el.innerHTML='<div style="font-size:12px;color:var(--muted);padding:2px;">Pick your bank above for step-by-step export instructions.</div>'; return; }
  const b=BANK_EXPORTS[key];
  if(!b) return;
  el.innerHTML=b.steps.map((s,i)=>`<div style="display:flex;gap:10px;align-items:flex-start;padding:6px 0;">
      <div style="width:20px;height:20px;border-radius:6px;background:rgba(0,214,143,0.12);color:var(--green);font-family:var(--font-display);font-size:11px;font-weight:900;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${i+1}</div>
      <div style="font-size:12px;color:var(--soft);line-height:1.6;">${esc(s)}</div>
    </div>`).join('')
    + (b.note?`<div style="font-size:11px;color:var(--amber);background:rgba(255,165,2,0.07);border:1px solid rgba(255,165,2,0.2);border-radius:10px;padding:8px 11px;margin-top:8px;line-height:1.5;">${esc(b.note)}</div>`:'')
    + `<div style="font-size:11px;color:var(--muted);line-height:1.5;margin-top:8px;">Exact labels and steps can change — if something looks different, search your bank's help center for &ldquo;download transactions.&rdquo;</div>`;
}

// Post-setup import button: open the file picker. The bank-export shortcut
// for first-timers without a file is rendered inline alongside this button
// (see renderSummary's importPrompt) so they see the offer BEFORE tapping
// import — not after a useless picker opens.
function startFirstImport(){
  document.getElementById('csv-input').click();
}
function goToBankExport(){
  showScreen('intro', _navBtn(3));
  setTimeout(()=>{ document.getElementById('bank-export-section')?.scrollIntoView({block:'start'}); }, 60);
}


// ──────── Setup wizard (6 steps: income / housing / food / lifestyle / review) ────────
// ════ SETUP WALKTHROUGH ════
// ════ SETUP WIZARD ════

// All default budget numbers used by the wizard live here. Tuning the
// generated budget should not require touching code below this block.
const BUDGET_DEFAULTS = {
  // Initial groceries/dining values _setupState carries before the user
  // picks a food-style tile. Matches the "Mix" preset roughly.
  FOOD_INIT: { GROC: 600, DINING: 300 },

  // Fast Food is auto-derived: a fraction of the dining-out budget, with
  // a floor so it never lands at $0 when dining is set.
  FAST_FOOD_RATIO: 0.15,
  FAST_FOOD_MIN:   50,

  // Utilities scales with income, capped and floored.
  UTILITIES_RATIO:    0.03,
  UTILITIES_MAX:      200,
  UTILITIES_FALLBACK: 150,

  // Fixed-cost defaults applied every run regardless of income / lifestyle.
  FIXED: {
    'Wireless':        80,
    'Internet/Cable':  80,
    'Subscriptions':   50,
    'Personal Care':   80,
    'Clothing':        100,
    'Entertainment':   80,
    'Healthcare':      80,
    'Other':           150,
  },

  // Lifestyle add-ons — keys mirror _setupState.lifestyle entries. Each
  // value is a category->$/mo map merged into the budget when the entry
  // is in the Set. (Investments uses a separate ratio rule, below.)
  LIFESTYLE: {
    car:    { 'Gas/Fuel': 200, 'Auto Insurance': 150, 'Automotive': 80 },
    pets:   { 'Pets': 120 },
    kids:   { 'Childcare': 600, 'Kids': 150 },
    gym:    { 'Fitness': 80 },
    travel: { 'Travel': 200 },
    side:   { 'Business Expenses': 150 },
  },

  // Investments scales with income with a fixed fallback when income is 0.
  INVEST_RATIO:    0.10,
  INVEST_FALLBACK: 200,

  // Rule-of-thumb shown in the income-step explainer copy.
  HOUSING_GUIDELINE_PCT: 30,
};

let _setupState = {
  housing: 0, housingType: 'own',
  income: 0,
  groceries: BUDGET_DEFAULTS.FOOD_INIT.GROC, dining: BUDGET_DEFAULTS.FOOD_INIT.DINING,
  lifestyle: new Set(),
  currentStep: 1
};

function resetSetupState(){
  // Reset all wizard state and DOM -- call once when opening fresh
  _setupState.housing = 0;
  _setupState.housingType = 'own';
  _setupState.income = 0;
  _setupState.groceries = BUDGET_DEFAULTS.FOOD_INIT.GROC;
  _setupState.dining = BUDGET_DEFAULTS.FOOD_INIT.DINING;
  _setupState.lifestyle = new Set();
  _setupState.currentStep = 1;
  ['s2-housing','s3-income','s4-groc','s4-dine-in'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = '';
  });
  ['ht-own','ht-rent'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.classList.remove('chosen');
  });
  document.querySelectorAll('.food-btn').forEach(b => b.classList.remove('chosen'));
  document.querySelectorAll('.lifestyle-btn').forEach(b => b.classList.remove('chosen'));
  const ci = document.getElementById('s4-custom-inputs');
  if(ci) ci.style.display = 'none';
}

function setupGo(step){
  _setupState.currentStep = step;
  document.querySelectorAll('.setup-step').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('setup-step-' + step);
  if(el){
    el.classList.add('active');
    el.scrollTop = 0;
  }
  if(step === 6) buildSetupReview();
}

// Advance the wizard to `step` only if the input at `inputId` parses to a
// positive number; otherwise focus the input, flash its border red for 2s,
// and surface `msg` as a toast + aria-live announcement so the user knows
// WHY the advance was blocked (the red border alone was easy to miss on
// small screens and invisible to screen readers).
const VALIDATE_FLASH_MS = 2000;
function setupGoValidate(step, inputId, msg){
  const el = document.getElementById(inputId);
  const val = parseFloat(el?.value);
  if(!val || val <= 0){
    if(el){
      el.focus();
      el.style.borderColor = 'rgba(255,71,87,0.6)';
      setTimeout(() => { el.style.borderColor = ''; }, VALIDATE_FLASH_MS);
    }
    if(msg){
      if(typeof showToast === 'function') showToast(msg);
      if(typeof srAnnounce === 'function') srAnnounce(msg);
    }
    return;
  }
  setupGo(step);
}

// Toggle a multi-select lifestyle chip. `idPrefix` is the leading segment
// of the element's id (e.g. 's5' for #s5-car) that gets stripped to derive
// the lifestyle key ('car') stored in _setupState.lifestyle.
function setupToggle(el, idPrefix){
  el.classList.toggle('chosen');
  const key = el.id.replace(idPrefix + '-', '');
  if(el.classList.contains('chosen')) _setupState.lifestyle.add(key);
  else _setupState.lifestyle.delete(key);
}

function toggleHousingType(type){
  const tile = document.getElementById('ht-' + type);
  if(!tile) return;
  const other = type === 'own' ? 'rent' : 'own';
  const otherTile = document.getElementById('ht-' + other);
  const wasOn = tile.classList.contains('chosen');
  // Radio semantics: exactly one of {own, rent} is selected at a time. Tapping
  // an already-chosen tile deselects it (state falls back to default 'own');
  // tapping the other tile flips the selection.
  if(wasOn){
    tile.classList.remove('chosen');
    _setupState.housingType = 'own'; // sensible default when neither is chosen
  } else {
    tile.classList.add('chosen');
    if(otherTile) otherTile.classList.remove('chosen');
    _setupState.housingType = type;
  }
}


function foodSelect(el){
  document.querySelectorAll('.food-btn').forEach(b => b.classList.remove('chosen'));
  el.classList.add('chosen');
  const customInputs = document.getElementById('s4-custom-inputs');
  if(customInputs) customInputs.style.display = el.id === 's4-custom' ? 'block' : 'none';
  // When switching away from custom, clear the custom inputs
  if(el.id !== 's4-custom'){
    const groc = document.getElementById('s4-groc');
    const dine = document.getElementById('s4-dine-in');
    if(groc) groc.value = '';
    if(dine) dine.value = '';
  }
}
function setFoodBudget(groc, dine){
  _setupState.groceries = groc;
  _setupState.dining = dine;
}

// Income-step note: frames the entered housing cost against the 30% guideline.
function updateIncomeNote(){
  const income = _setupState.income;
  const noteEl = document.getElementById('s3-income-note');
  const breakEl = document.getElementById('s3-income-breakdown');
  if(income > 0 && noteEl && breakEl){
    noteEl.style.display = 'block';
    const housing = _setupState.housing;
    const guidePct = BUDGET_DEFAULTS.HOUSING_GUIDELINE_PCT;
    const pctHousing = housing > 0 ? Math.round(housing/income*100) : '--';
    const guideCap   = Math.round(income * guidePct / 100);
    breakEl.innerHTML = housing > 0
      ? 'Housing is <b>' + pctHousing + '%</b> of your income. ' + (pctHousing <= guidePct ? `Under the ${guidePct}% guideline.` : `Above the ${guidePct}% guideline.`)
      : `${guidePct}% rule guideline: keep housing under <b>` + gbMoneyAbs(guideCap, 0) + '/mo</b>.';
  } else if(noteEl){
    noteEl.style.display = 'none';
  }
}

function buildSetupReview(){
  const budget = computeBudgetFromState();
  const listEl = document.getElementById('setup-review-list');
  if(!listEl) return;

  const categories = Object.entries(budget).sort((a,b)=>b[1]-a[1]);
  const total = categories.reduce((s,[,v])=>s+v,0);

  listEl.innerHTML = categories.map(([cat,amt])=>`
    <div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--o05);">
      <div style="flex:1;font-size:14px;font-weight:500;">${esc(cat)}</div>
      <div style="display:flex;align-items:center;gap:8px;">
        <div class="caption-xs">${Math.round(amt/total*100)}%</div>
        <div style="position:relative;">
          <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:13px;color:var(--muted);font-weight:700;pointer-events:none;">$</span>
          <input type="number" value="${amt}" min="0"
            style="width:88px;padding:7px 8px 7px 22px;background:var(--glass);border:1px solid var(--border);border-radius:10px;color:var(--text);font-size:14px;font-weight:700;font-family:var(--font-display);outline:none;text-align:right;"
            data-cat="${esc(cat)}"
            onchange="updateReviewBudget(this)"
            onfocus="this.style.borderColor='rgba(0,214,143,0.5)'"
            onblur="this.style.borderColor=''" autocomplete="off">
        </div>
      </div>
    </div>`).join('') +
    `<div style="display:flex;justify-content:space-between;padding:12px 0 4px;font-size:13px;font-weight:700;">
      <span class="c-muted">Total budgeted</span>
      <span id="review-total" style="font-family:var(--font-display);font-size:16px;font-weight:900;color:var(--green);">${fmt(total)}/mo</span>
    </div>`;
}

function updateReviewBudget(input){
  const cat = input.dataset.cat;
  const val = Math.max(0, parseFloat(input.value)||0);
  input.value = val;
  // Update review total
  let total = 0;
  document.querySelectorAll('#setup-review-list input[data-cat]').forEach(i=>{ total += parseFloat(i.value)||0; });
  const totalEl = document.getElementById('review-total');
  if(totalEl) totalEl.textContent = gbMoneyAbs(total, 0) + '/mo';
}

function computeBudgetFromState(){
  const { housing, housingType, income, groceries, dining, lifestyle } = _setupState;
  const D = BUDGET_DEFAULTS;
  const budget = {};

  // Housing
  if(housing > 0){
    budget[housingType === 'rent' ? 'Rent' : 'Mortgage/Housing'] = housing;
  }

  // Food — Fast Food is derived from dining: a fixed % with a $-floor.
  if(groceries > 0) budget['Groceries'] = groceries;
  if(dining > 0) budget['Dining Out'] = dining;
  budget['Fast Food'] = Math.round(dining * D.FAST_FOOD_RATIO) || D.FAST_FOOD_MIN;

  // Fixed essentials. Utilities scales with income, capped + floored.
  budget['Utilities'] = Math.round(Math.min(income * D.UTILITIES_RATIO, D.UTILITIES_MAX)) || D.UTILITIES_FALLBACK;
  Object.assign(budget, D.FIXED);

  // Lifestyle add-ons. Each lifestyle key maps to a category->$/mo group.
  for(const key of Object.keys(D.LIFESTYLE)){
    if(lifestyle.has(key)) Object.assign(budget, D.LIFESTYLE[key]);
  }
  // Investments is income-scaled, kept separate from the LIFESTYLE map.
  if(lifestyle.has('invest')){
    budget['Investments'] = Math.round(income * D.INVEST_RATIO) || D.INVEST_FALLBACK;
  }

  // Remove zeros
  Object.keys(budget).forEach(k => { if(!budget[k]) delete budget[k]; });
  return budget;
}

function finishSetup(){
  // Restore nav after wizard
  document.getElementById('bottom-nav')?.classList.add('visible');
  // Read any edited values from the review screen
  const budget = {};
  document.querySelectorAll('#setup-review-list input[data-cat]').forEach(input=>{
    const cat = input.dataset.cat;
    const val = Math.max(0, parseFloat(input.value)||0);
    if(cat && val > 0) budget[cat] = val;
  });

  // If review wasn't built (skipped to finish), use computed budget
  const finalBudget = Object.keys(budget).length > 0 ? budget : computeBudgetFromState();

  CFG.budget = finalBudget;
  saveCFG();
  safeSetLocal('gb_setup_done', '1');

  // Smooth transition to summary with success indicator
  const navBtns = document.querySelectorAll('.nav-btn');
  // If opened from settings, return there; otherwise go to summary
  const fromSettings = document.querySelector('.nav-btn.active')?.textContent?.includes('Settings');
  if(fromSettings){
    showScreen('settings', document.querySelector('.nav-btn:last-child'));
  } else {
    showScreen('summary', navBtns[0]);
  }
  showHeaderButtons();

  // Show a brief toast instead of blocking alert
  showToast('Budget saved! Import your Bank Transactions to start tracking.');
}

function skipSetup(){
  // Restore nav after wizard
  document.getElementById('bottom-nav')?.classList.add('visible');
  safeSetLocal('gb_setup_done', '1');
  showScreen('summary', _navBtn(0));
  showHeaderButtons();
}
