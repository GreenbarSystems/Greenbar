// ════ Greenbar — features: AI help, walkthrough, setup wizard, bank export ════
// Self-contained interactive flows. Each has its own module-local state
// (_aiOpen, _flashTimers, _wtSlide, _setupState).

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
    a:'Everything stays on your device. Greenbar has no server and no separate account — your data is saved in private storage on your phone and never sent anywhere.' },
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
    appendAIMsg(answerHelpQuery(msg), 'ai-msg-bot');
    _aiTyping = false;
    if(sendBtn) sendBtn.style.opacity = '1';
  }, 300);
}

// Show AI button after setup completes or when returning user has data

// ──────── Interactive walkthrough (slide 1-6) ────────
let _wtSlide = 1;
const _wtTotal = 6;

function showWalkthrough(){
  _wtSlide = 1;

  // Single point of truth: showScreen handles display
  showScreen('walkthrough', null);

  // Reset slide state
  const track = document.getElementById('wt-track');
  if(track) track.querySelectorAll('.wt-slide').forEach((s,i)=>s.classList.toggle('active', i===0));

  // Footer
  const footer = document.getElementById('wt-footer');
  if(footer){ footer.style.display='flex'; footer.style.height=''; footer.style.padding=''; footer.style.pointerEvents=''; }
  const btn = document.getElementById('wt-next-btn');
  if(btn){ btn.textContent='Next →'; btn.style.flex='0 0 auto'; btn.onclick=function(){ wtNext(); }; }
  const dotsWrap = document.getElementById('wt-dots-wrap');
  if(dotsWrap) dotsWrap.style.display='flex';
  for(let i=1;i<=_wtTotal;i++){
    const d=document.getElementById('wt-dot-'+i);
    if(d) d.classList.toggle('active',i===1);
  }
  const counter = document.getElementById('wt-step-counter');
  if(counter){ counter.textContent = `Step 1 of ${_wtTotal}`; counter.style.display = ''; }

  _wtAddSwipe();
}

function wtGo(n){
  _wtSlide = Math.max(1, Math.min(_wtTotal, n));
  // Crossfade: deactivate all slides, activate current
  const track = document.getElementById('wt-track');
  if(track){
    track.querySelectorAll('.wt-slide').forEach((s,i)=>{
      s.classList.toggle('active', i===_wtSlide-1);
    });
  }
  // Update dots
  for(let i=1;i<=_wtTotal;i++){
    const d=document.getElementById('wt-dot-'+i);
    if(d) d.classList.toggle('active',i===_wtSlide);
  }
  // Update step counter (hidden on the last slide where dots are hidden too)
  const _counter = document.getElementById('wt-step-counter');
  if(_counter){
    _counter.textContent = `Step ${_wtSlide} of ${_wtTotal}`;
    _counter.style.display = (_wtSlide===_wtTotal) ? 'none' : '';
  }
  // Footer / button
  const footer = document.getElementById('wt-footer');
  const btn = document.getElementById('wt-next-btn');
  if(_wtSlide===_wtTotal){
    // Last slide: replace Next button with the CTA button in the footer
    if(footer) footer.style.display = 'flex';
    if(btn){
      btn.textContent = 'Set Up My Budget →';
      btn.style.flex = '1';
      btn.onclick = function(){ startWalkthroughSetup(); };
    }
    // Hide dots on last slide
    const dotsWrap = document.getElementById('wt-dots-wrap');
    if(dotsWrap) dotsWrap.style.display = 'none';
  } else {
    if(footer) footer.style.display = 'flex';
    const dotsWrap = document.getElementById('wt-dots-wrap');
    if(dotsWrap) dotsWrap.style.display = 'flex';
    if(btn){
      btn.style.flex = '0 0 auto';
      btn.onclick = function(){ wtNext(); };
      btn.textContent = (_wtSlide===_wtTotal-1) ? 'Get Started' : 'Next →';
    }
  }
}

function wtNext(){
  if(_wtSlide >= _wtTotal) startWalkthroughSetup();
  else wtGo(_wtSlide + 1);
}

function startWalkthroughSetup(){
  try{ localStorage.setItem('gb_wt_done','1'); }catch(e){}

  // Reset wizard state so values from an abandoned earlier run don't pre-fill
  // the new run. The Settings "Open ->" button already calls this; the
  // walkthrough path used to skip it, leaking state across runs.
  if(typeof resetSetupState === 'function') resetSetupState();

  // Step 1: hide every screen
  document.querySelectorAll('.screen').forEach(function(s){ s.classList.remove('active'); });

  // Step 2: activate setup screen
  var ss = document.getElementById('screen-setup');
  if(!ss){ console.error('screen-setup not found'); return; }
  ss.classList.add('active');

  // Step 3: reveal header, then hide nav (showHeaderButtons re-adds .visible, so order matters)
  showHeaderButtons();
  var nav = document.getElementById('bottom-nav');
  if(nav) nav.classList.remove('visible');

  // Step 4: reset wizard state and go to step 2
  resetSetupState();
  setupGo(2);
}

function _wtAddSwipe(){
  const track = document.getElementById('wt-track');
  if(!track || track._swipeInit) return;
  track._swipeInit = true;
  let sx=0, sy=0;
  track.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY;},{passive:true});
  track.addEventListener('touchend',e=>{
    const dx=e.changedTouches[0].clientX-sx;
    const dy=e.changedTouches[0].clientY-sy;
    if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>44){
      if(dx<0&&_wtSlide<_wtTotal) wtGo(_wtSlide+1);
      else if(dx>0&&_wtSlide>1) wtGo(_wtSlide-1);
    }
  },{passive:true});
}



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

function runFlashIntro(){
  // Restore flash HTML if it was replaced by renderSummary (e.g. after data clear)
  const sc = document.getElementById('summary-content');
  if(sc && !document.getElementById('flash-intro')){
    sc.innerHTML = `
      <div id="flash-intro" style="display:flex;flex-direction:column;align-items:center;justify-content:flex-start;height:calc(100dvh - 120px);text-align:center;padding:80px 32px 40px;position:relative;">
        <div id="flash-phase-1" style="opacity:0;transition:opacity 0.5s ease;position:absolute;">
          <div style="font-family:var(--font-display);font-size:38px;font-weight:900;letter-spacing:-1px;color:var(--text);">Hey there.</div>
        </div>
        <div id="flash-phase-2" style="opacity:0;transition:opacity 1.4s ease;width:100%;max-width:340px;padding:0 24px;">
          <div style="font-family:var(--font-display);font-size:36px;font-weight:900;letter-spacing:-1px;margin-bottom:10px;">Welcome to <span class="gb-shimmer">Greenbar</span></div>
          <div style="font-size:16px;color:var(--soft);letter-spacing:0.02em;margin-bottom:40px;">Your money, clearly.</div>
          <div id="flash-cta" style="opacity:0;transition:opacity 1.2s ease;">
            <button class="btn-flash-cta" onclick="startSetupFromFlash()">Get Started &rarr;</button>

          </div>
        </div>
      </div>`;
  }
  const p1  = document.getElementById('flash-phase-1');
  const p2  = document.getElementById('flash-phase-2');
  const cta = document.getElementById('flash-cta');
  const intro = document.getElementById('flash-intro');
  if(!p1) return;
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
    p1.style.transition = 'opacity 0.4s ease';
    p1.style.opacity = '1';
  }, 150);

  // Phase 1 fades out
  schedule(()=>{
    p1.style.transition = 'opacity 0.5s ease';
    p1.style.opacity = '0';
  }, 2200);

  // Phase 2: fades in as phase 1 is fading out -- crossfade, no blank gap
  schedule(()=>{
    const shimmer = p2 ? p2.querySelector('.gb-shimmer') : null;
    if(shimmer){
      // Restart so the shimmer plays in sync with phase 2 appearing.
      shimmer.style.animation = 'none';
      shimmer.offsetWidth;
      shimmer.style.animation = '';
    }
    p2.style.transition = 'opacity 0.7s ease';
    p2.style.opacity = '1';
  }, 2450);

  // CTA fades in
  schedule(()=>{
    cta.style.transition = 'opacity 0.5s ease';
    cta.style.opacity = '1';
    _flashDone = true;
  }, 3700);
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
  if(p1){ p1.style.transition = 'opacity 0.25s ease'; p1.style.opacity = '0'; }
  // Bring in phase 2 + CTA quickly
  if(p2){
    // Restart shimmer so it plays fresh on tap-to-skip
    const shimmer = p2.querySelector('.gb-shimmer');
    if(shimmer){
      shimmer.style.animation='none'; shimmer.offsetWidth; shimmer.style.animation='';
      }
    p2.style.transition = 'opacity 0.4s ease'; p2.style.opacity = '1';
  }
  if(cta){ setTimeout(()=>{ cta.style.transition = 'opacity 0.4s ease'; cta.style.opacity = '1'; }, 350); }
}

function startSetupFromFlash(){
  // Only show walkthrough on first launch -- never again after that
  if(localStorage.getItem('gb_wt_done')){
    showHeaderButtons();
    showScreen('setup', _navBtn(0));
    resetSetupState();
    setupGo(2);
    // Hide nav while wizard is active -- prevents nav taps interrupting setup
    document.getElementById('bottom-nav')?.classList.remove('visible');
  } else {
    showWalkthrough();
  }
}


// ──────── Bank export instructions (per-bank steps) ────────
const BANK_EXPORTS = {
  chase: { name:'Chase', steps:[
    'Sign in at chase.com and select the account you want to export.',
    'On the account activity page, click "Download account activity."',
    'Choose a date range (or "All transactions") and the "Spreadsheet (CSV)" file type.',
    'Click Download — the file saves to your Downloads folder.'
  ], note:'Chase\'s CSV export covers roughly the last 24 months. For older history, download monthly statements instead.' },
  bofa: { name:'Bank of America', steps:[
    'Sign in at bankofamerica.com and select your account.',
    'On the Activity tab, choose Download (Bank of America labels it "Download Transactions").',
    'Pick a date range and the CSV file format.',
    'Click Download.'
  ], note:'Bank of America limits each download to about 60 days, so a full year may take several downloads.' },
  wells: { name:'Wells Fargo', steps:[
    'Sign in at wellsfargo.com and open your account.',
    'Click "Download Account Activity" above your transaction list.',
    'Choose a date range and set the format to "Comma Delimited (CSV)."',
    'Click Download.'
  ], note:'Wells Fargo offers up to about 18 months of activity for CSV download.' },
  citi: { name:'Citi', steps:[
    'Sign in at citi.com and open the account you want.',
    'On the account activity page, select the Download option.',
    'Choose a date range and the CSV (or Excel) file format.',
    'Click Download.'
  ] },
  capitalone: { name:'Capital One', steps:[
    'Sign in at capitalone.com and open your account.',
    'Select "Download Transactions" (under "View More" or the account menu).',
    'Choose a date range and the CSV file type.',
    'Click Download.'
  ] },
  usbank: { name:'U.S. Bank', steps:[
    'Sign in at usbank.com and select your account.',
    'From the account activity page, choose "Download Transactions."',
    'Pick a date range and the "Spreadsheet (CSV)" format.',
    'Click Download.'
  ] },
  pnc: { name:'PNC', steps:[
    'Sign in at pnc.com and open your account\'s Activity.',
    'Select the Export or Download option.',
    'Choose a date range and the CSV format.',
    'Click Download.'
  ] },
  truist: { name:'Truist', steps:[
    'Sign in at truist.com and open the account.',
    'From the transaction history, choose the Export or Download option.',
    'Choose a date range and the CSV format.',
    'Click Download.'
  ] },
  tdbank: { name:'TD Bank', steps:[
    'Sign in at td.com and select your account.',
    'On the account activity page, choose Download.',
    'Pick a date range and the CSV (spreadsheet) format.',
    'Click Download.'
  ] },
  amex: { name:'American Express', steps:[
    'Sign in at americanexpress.com and open "Statements & Activity."',
    'Choose the Download option for the period you want.',
    'Select the CSV (Excel) file format.',
    'Click Download.'
  ] },
  other: { name:'Other / not listed', steps:[
    'Sign in to your bank\'s website or app and open the account.',
    'Find "Account Activity," "Transaction History," or "Statements."',
    'Look for a Download, Export, or Statements option, and choose CSV (sometimes labeled "Comma Delimited" or "Spreadsheet").',
    'Pick a date range and download the file.'
  ] },
};
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

// Post-setup import button: open the file picker, then reveal a shortcut to the
// bank-export instructions for first-timers who don't have a file yet.
function startFirstImport(){
  document.getElementById('csv-input').click();
  const help=document.getElementById('first-import-help');
  if(help) help.style.display='block';
}
function goToBankExport(){
  showScreen('intro', _navBtn(3));
  setTimeout(()=>{ document.getElementById('bank-export-section')?.scrollIntoView({block:'start'}); }, 60);
}


// ──────── Setup wizard (6 steps: income / housing / food / lifestyle / giving / review) ────────
// ════ SETUP WALKTHROUGH ════
// ════ SETUP WIZARD ════
let _setupState = {
  housing: 0, housingType: 'own',
  income: 0,
  groceries: 600, dining: 300,
  lifestyle: new Set(),
  givingPct: 0,
  currentStep: 1
};

function resetSetupState(){
  // Reset all wizard state and DOM -- call once when opening fresh
  _setupState.housing = 0;
  _setupState.housingType = 'own';
  _setupState.income = 0;
  _setupState.groceries = 600;
  _setupState.dining = 300;
  _setupState.lifestyle = new Set();
  _setupState.givingPct = 0;
  _setupState.currentStep = 1;
  ['s2-housing','s3-income','s4-groc','s4-dine-in','s5-giving-custom'].forEach(id => {
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
  const gw = document.getElementById('s5-giving-wrap');
  if(gw) gw.style.display = 'none';
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

function setupGoValidate(step, inputId, msg){
  const el = document.getElementById(inputId);
  const val = parseFloat(el?.value);
  if(!val || val <= 0){ el?.focus(); el?.style && (el.style.borderColor='rgba(255,71,87,0.6)'); setTimeout(()=>el?.style&&(el.style.borderColor=''),2000); return; }
  setupGo(step);
}

function setupToggle(el, group){
  el.classList.toggle('chosen');
  const id = el.id.replace(group + '-','');
  if(el.classList.contains('chosen')) _setupState.lifestyle.add(id);
  else _setupState.lifestyle.delete(id);
}

function toggleHousingType(type){
  const tile = document.getElementById('ht-' + type);
  if(!tile) return;
  const isOn = tile.classList.contains('chosen');
  tile.classList.toggle('chosen');
  if(!isOn){ _setupState.housingType = type; }
  else {
    const other = type === 'own' ? 'rent' : 'own';
    const otherTile = document.getElementById('ht-' + other);
    _setupState.housingType = otherTile?.classList.contains('chosen') ? other : 'own';
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

function updateGivingFromIncome(){
  const income = _setupState.income;
  const noteEl = document.getElementById('s3-income-note');
  const breakEl = document.getElementById('s3-income-breakdown');
  if(income > 0 && noteEl && breakEl){
    noteEl.style.display = 'block';
    const housing = _setupState.housing;
    const pctHousing = housing > 0 ? Math.round(housing/income*100) : '--';
    const pct30 = Math.round(income*0.30);
    breakEl.innerHTML = housing > 0
      ? 'Housing is <b>' + pctHousing + '%</b> of your income. ' + (pctHousing <= 30 ? 'Under the 30% guideline.' : 'Above the 30% guideline.')
      : '30% rule guideline: keep housing under <b>$' + pct30.toLocaleString() + '/mo</b>.';
  } else if(noteEl){
    noteEl.style.display = 'none';
  }
}

function toggleGiving(){
  const wrap = document.getElementById('s5-giving-wrap');
  if(!wrap) return;
  const isSelected = document.getElementById('s5-charity').classList.contains('chosen');
  wrap.style.display = isSelected ? 'block' : 'none';
  if(!isSelected){
    _setupState.givingPct = 0;
    const inp = document.getElementById('s5-giving-custom');
    if(inp) inp.value = '';
  } else {
    // Focus the input when giving is selected
    setTimeout(()=>{ document.getElementById('s5-giving-custom')?.focus(); }, 150);
  }
}

function buildSetupReview(){
  const budget = computeBudgetFromState();
  const listEl = document.getElementById('setup-review-list');
  if(!listEl) return;

  const categories = Object.entries(budget).sort((a,b)=>b[1]-a[1]);
  const total = categories.reduce((s,[,v])=>s+v,0);

  listEl.innerHTML = categories.map(([cat,amt])=>`
    <div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
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
            onblur="this.style.borderColor=''">
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
  if(totalEl) totalEl.textContent = '$' + total.toLocaleString() + '/mo';
}

function computeBudgetFromState(){
  const { housing, housingType, income, groceries, dining, lifestyle, givingPct } = _setupState;
  const budget = {};

  // Housing
  if(housing > 0){
    budget[housingType === 'rent' ? 'Rent' : 'Mortgage/Housing'] = housing;
  }

  // Food
  if(groceries > 0) budget['Groceries'] = groceries;
  if(dining > 0) budget['Dining Out'] = dining;
  budget['Fast Food'] = Math.round(dining * 0.15) || 50;

  // Fixed essentials
  budget['Utilities'] = Math.round(Math.min(income * 0.03, 200)) || 150;
  budget['Wireless'] = 80;
  budget['Internet/Cable'] = 80;
  budget['Subscriptions'] = 50;
  budget['Personal Care'] = 80;
  budget['Clothing'] = 100;
  budget['Entertainment'] = 80;
  budget['Healthcare'] = 80;
  budget['Other'] = 150;

  // Lifestyle add-ons
  if(lifestyle.has('car')){ budget['Gas/Fuel'] = 200; budget['Auto Insurance'] = 150; budget['Automotive'] = 80; }
  if(lifestyle.has('pets')){ budget['Pets'] = 120; }
  if(lifestyle.has('kids')){ budget['Childcare'] = 600; budget['Kids'] = 150; }
  if(lifestyle.has('gym')){ budget['Fitness'] = 80; }
  if(lifestyle.has('travel')){ budget['Travel'] = 200; }
  if(lifestyle.has('invest')){ budget['Investments'] = Math.round(income * 0.10) || 200; }
  if(lifestyle.has('side')){ budget['Business Expenses'] = 150; }

  // Giving
  if(givingPct > 0 && income > 0){
    budget['Charitable Giving'] = Math.round(income * givingPct / 100);
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
  CFG.income = Number(_setupState.income)||0;
  saveCFG();
  try{ localStorage.setItem('gb_setup_done','1'); }catch(e){}

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
  try{ localStorage.setItem('gb_setup_done','1'); }catch(e){}
  showScreen('summary', _navBtn(0));
  showHeaderButtons();
}
