// ════ Greenbar — app-wide state and constants ════
// Loaded FIRST. All other JS files reference these globals.
// Variables that live with a single feature (_flashTimers, _swipe, etc.)
// stay in that feature file -- this file only carries cross-cutting state.

// ════ DEFAULTS ════
// IMPORTANT: this object is deep-cloned via JSON.parse(JSON.stringify(...))
// below, so it must contain ONLY primitives, plain arrays, and plain objects.
// Adding a Date, Set, Map, RegExp, or function here will silently lose or
// corrupt that field on every load.
//
// incomeKw / skipKw / remaps are consumed by _categorize in core.js (first
// keyword match wins). budget seeds the Budget tab if the user skips the
// wizard or has a corrupted CFG; the wizard's computeBudgetFromState in
// features.js produces a richer overriding set in the normal flow.
const DEFAULTS = {
  // Market/locale. Drives currency formatting + the default date order. One
  // currency per profile (a user banks in one country). Auto-detected from the
  // browser on first run (loadCFG) and changeable in Settings → Column Mapping.
  region:'US',
  cols:{ date:'',desc:'',amt:'',cat:'',fmt:'MM/DD/YY' },
  // Income markers (substring, case-insensitive). Includes UK/AU/CA-friendly
  // terms (WAGES/PENSION/DIVIDEND) alongside US ones; kept conservative to avoid
  // mis-tagging expenses as income. Users can edit this list in Settings.
  incomeKw:['PAYROLL','DIRECT DEPOSIT','SALARY','WAGES','PENSION','DIVIDEND','TAX REFUND','CASHOUT','MOBILE DEPOSIT','ZELLE FROM','VENMO CASHOUT'],
  skipKw:[],
  // Transfer/credit-card-payment rules (substring, case-insensitive). A match
  // marks a row tx.transfer=true so it's EXCLUDED from income/spend totals
  // (money moving between your own accounts isn't spending). Empty by default.
  // gbTransfers — the resolver UI that wrote to this list — was removed in
  // the Phase 4 audit cut; any rules a user persisted before that survive
  // here and still drive auto-exclusion via core.js isTransferDesc().
  transferKw:[],
  // Known account/source names (e.g. "Chase Checking"), most-recent first.
  // Every import is tagged to one (tx.acct) so the per-account filter pills
  // on the Budget and Transactions screens can scope by account. The
  // dedicated accounts-manager UI (gbAccounts) was removed in Phase 4;
  // new names are added on import as the user types them in the import modal.
  accounts:[],
  // Legacy: gbProfiles persisted per-account import settings here (type,
  // payment policy, column mapping, last-imported range). The module was
  // removed in the Phase 4 audit cut; this field stays for backward-compat
  // on persisted backups but is no longer written or read.
  profiles:{},
  // Curated default merchant rules -- distinctive keyword substrings, matched
  // case-insensitively against the description (first match wins).
  remaps:[
    {kw:'WALMART',cat:'Groceries'},{kw:'COSTCO',cat:'Groceries'},
    {kw:'KROGER',cat:'Groceries'},{kw:'SAFEWAY',cat:'Groceries'},
    {kw:'TRADER JOE',cat:'Groceries'},{kw:'WHOLE FOODS',cat:'Groceries'},
    {kw:'PUBLIX',cat:'Groceries'},{kw:'WEGMANS',cat:'Groceries'},
    {kw:'MCDONALD',cat:'Fast Food'},{kw:'CHIPOTLE',cat:'Fast Food'},
    {kw:'BURGER KING',cat:'Fast Food'},{kw:'TACO BELL',cat:'Fast Food'},
    {kw:'CHICK-FIL-A',cat:'Fast Food'},{kw:'POPEYES',cat:'Fast Food'},
    {kw:'DOMINO',cat:'Fast Food'},{kw:'PIZZA HUT',cat:'Fast Food'},
    {kw:'PANERA',cat:'Fast Food'},{kw:'DOORDASH',cat:'Fast Food'},
    {kw:'GRUBHUB',cat:'Fast Food'},
    {kw:'STARBUCKS',cat:'Coffee'},{kw:'DUNKIN',cat:'Coffee'},
    {kw:'AMAZON',cat:'Online Shopping'},{kw:'EBAY',cat:'Online Shopping'},
    {kw:'ETSY',cat:'Online Shopping'},{kw:'BEST BUY',cat:'Online Shopping'},
    {kw:'WAYFAIR',cat:'Online Shopping'},
    {kw:'NETFLIX',cat:'Subscriptions'},{kw:'SPOTIFY',cat:'Subscriptions'},
    {kw:'APPLE.COM',cat:'Subscriptions'},{kw:'HULU',cat:'Subscriptions'},
    {kw:'DISNEY PLUS',cat:'Subscriptions'},{kw:'HBO MAX',cat:'Subscriptions'},
    {kw:'AUDIBLE',cat:'Subscriptions'},{kw:'ADOBE',cat:'Subscriptions'},
    {kw:'UBER',cat:'Transport'},{kw:'LYFT',cat:'Transport'},
    {kw:'SHELL',cat:'Gas/Fuel'},{kw:'CHEVRON',cat:'Gas/Fuel'},
    {kw:'EXXON',cat:'Gas/Fuel'},{kw:'MARATHON',cat:'Gas/Fuel'},
    {kw:'SUNOCO',cat:'Gas/Fuel'},{kw:'CITGO',cat:'Gas/Fuel'},
    {kw:'VALERO',cat:'Gas/Fuel'},{kw:'SPEEDWAY',cat:'Gas/Fuel'},
    {kw:'CVS',cat:'Healthcare'},{kw:'WALGREENS',cat:'Healthcare'},
    {kw:'RITE AID',cat:'Healthcare'},
    {kw:'HOME DEPOT',cat:'Home Improvement'},{kw:'LOWES',cat:'Home Improvement'},
    {kw:'MENARDS',cat:'Home Improvement'},
    {kw:'COMCAST',cat:'Internet/Cable'},{kw:'XFINITY',cat:'Internet/Cable'},
    {kw:'SPECTRUM',cat:'Internet/Cable'},
    {kw:'T-MOBILE',cat:'Wireless'},{kw:'VERIZON',cat:'Wireless'},
    {kw:'GAMESTOP',cat:'Entertainment'},{kw:'PLAYSTATION',cat:'Entertainment'},
    {kw:'XBOX',cat:'Entertainment'},{kw:'NINTENDO',cat:'Entertainment'},
    {kw:'CINEMARK',cat:'Entertainment'},
    {kw:'CHEWY',cat:'Pets'},{kw:'PETCO',cat:'Pets'},{kw:'PETSMART',cat:'Pets'},
  ],
  budget:{
    'Groceries':600,'Dining Out':400,'Fast Food':100,'Coffee':60,
    'Gas/Fuel':200,'Transport':100,'Subscriptions':50,'Online Shopping':100,
    'Utilities':150,'Insurance':200,'Rent/Mortgage':1500,'Entertainment':100,
    'Personal Care':100,'Clothing':100,'Healthcare':80,'Pets':50,'Other':200,
  }
};

// Reassigned wholesale by loadCFG() in core.js — declared with `let` for that.
let CFG = JSON.parse(JSON.stringify(DEFAULTS));

// Supported markets. Greenbar is single-currency-per-profile; CFG.region selects
// one of these, which drives money formatting (locale + currency) and the default
// date order. UK/AU/CA share the US number convention (. decimal, , thousands),
// so only the currency symbol and date order differ. dateFmt values must be ones
// parseDateParts() understands (MM/DD/YYYY → its default branch).
const REGIONS = {
  US: { label:'United States',  locale:'en-US', currency:'USD', dateFmt:'MM/DD/YYYY' },
  GB: { label:'United Kingdom', locale:'en-GB', currency:'GBP', dateFmt:'DD/MM/YYYY' },
  AU: { label:'Australia',      locale:'en-AU', currency:'AUD', dateFmt:'DD/MM/YYYY' },
  CA: { label:'Canada',         locale:'en-CA', currency:'CAD', dateFmt:'YYYY-MM-DD' },
};

// Month-name abbreviations. ZERO-INDEXED: MN[0] === 'Jan'. Use MN[monthNum-1]
// when bridging from a 1-based human month number.
const MN='Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec'.split(',');

// Volatile app state -- the user's imported data. Mutated by import/aggregate
// and read by every render function. Stays in memory; persisted via saveData().
//
// Shapes (contract for every consumer in render.js / core.js):
//   _months : { [monthKey]: { income: number,
//                              expenses: { [category]: amount },
//                              txs: Array<Tx> } }
//             where monthKey is 'Mon YYYY' (e.g. 'May 2026').
//   _allTxs : Array<Tx>, where Tx = { date:string, desc:string,
//                     amount:number, cat:string, month:string, ts?:number,
//                     isIncome?:boolean, source?:string, vendor?:string,
//                     id?:string, imp?:string, acct?:string, catLocked?:boolean,
//                     note?:string,
//                     transfer?:boolean (excluded from income/spend totals),
//                     transferLocked?:boolean (user pinned the transfer state, so
//                       saved rules won't override it), transferPair?:string (id
//                       of the matching opposite-side row),
//                     conf?:'high'|'low', needsReview?:boolean, reviewed?:boolean }
//             acct is the account/source this row was imported under (e.g.
//             "Chase Checking"); absent on legacy/manual rows = unassigned.
//             amount is signed: negative = expense, positive = income.
//             conf / needsReview / reviewed are the Import Confidence layer:
//             ABSENT means high-confidence + nothing to review (the common
//             case — keeps saved data lean). A low-confidence parse (e.g. a
//             PDF with no clear table header) sets conf:'low' + needsReview:true
//             on each row; the review queue clears a row by setting reviewed:true.
//             ts is a YYYYMMDD integer (e.g. 20260514), NOT an epoch — it is
//             pd.key from parseDateParts(); older saves may lack it
//             (renderTxs falls back to parseDateParts on tx.date).
//   _sel    : month key 'Mon YYYY' | sentinel '__all' | null (no data yet).
let _months={},_allTxs=[],_sel=null;

// Monotonic counter bumped whenever the transaction model (_months/_allTxs)
// changes. Read-heavy analyzers used to memoize their results against it
// (gbTrends and gbForecast — both removed in the Phase 3 cleanup), so the cards that
// each call them during a single render recompute once per data change instead of
// once per call. Bumped in rebuildMonths(), saveData(), and clearAllData() — the
// points where the model is rebuilt, persisted, or reset.
let _dataVersion = 0;

// App-data localStorage keys. NOT a complete localStorage manifest — the
// security module (gbAuth) manages its own keys (K.hash, K.salt, K.enabled,
// K.attempts, K.lockUntil, K.autoBg, K.autoIdle) and the privacy module
// stores 'gb_privacy_default' separately. exportData / restoreData /
// clearAllData operate on this app-data subset; gbAuth.forgotPIN wipes
// both GB_KEYS and the security keys.
//
// gb_anomalies / gb_anomaly_ready are import-review state written by
// anomaly.js. They live here so clearAllData() (which iterates GB_KEYS)
// wipes them too — otherwise a stale anomaly badge/report survives a data
// wipe and reappears on the next Summary load.
const GB_KEYS=['gb_data','gb_cfg2','gb_log','gb_setup_done','gb_wt_done','gb_tour_done','gb_anomalies','gb_anomaly_ready','gb_goals','gb_demo','gb_seen_summary'];
