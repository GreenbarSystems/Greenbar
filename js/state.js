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
  cols:{ date:'',desc:'',amt:'',cat:'',fmt:'MM/DD/YY' },
  incomeKw:['PAYROLL','DIRECT DEPOSIT','SALARY','TAX REFUND','CASHOUT','MOBILE DEPOSIT','ZELLE FROM','VENMO CASHOUT'],
  skipKw:[],
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

// Month-name abbreviations. ZERO-INDEXED: MN[0] === 'Jan'. Use MN[monthNum-1]
// when bridging from a 1-based human month number.
const MN='Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec'.split(',');

// Volatile app state -- the user's imported data. Mutated by import/aggregate
// and read by every render function. Stays in memory; persisted via saveData().
//
// Shapes (contract for every consumer in render.js / core.js):
//   _months : { [monthKey]: { income: number,
//                              expenses: { [category]: amount } } }
//             where monthKey is 'YYYY-MM' (e.g. '2026-05').
//   _allTxs : Array<{ date:string, desc:string, amount:number,
//                     cat:string, month:string, ts?:number }>
//             amount is signed: negative = expense, positive = income.
//             ts is a millisecond epoch stamped at import; older saves
//             may lack it (renderTxs falls back to parseDateParts).
//   _sel    : month key 'YYYY-MM' | sentinel '__all' | null (no data yet).
let _months={},_allTxs=[],_sel=null;

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
const GB_KEYS=['gb_data','gb_cfg2','gb_log','gb_setup_done','gb_wt_done','gb_tour_done','gb_anomalies','gb_anomaly_ready'];
