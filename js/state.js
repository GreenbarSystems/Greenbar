// ════ Greenbar — app-wide state and constants ════
// Loaded FIRST. All other JS files reference these globals.
// Variables that live with a single feature (_flashTimers, _wtSlide, etc.)
// stay in that feature file -- this file only carries cross-cutting state.

// ════ DEFAULTS ════
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

let CFG = JSON.parse(JSON.stringify(DEFAULTS));

const MN='Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec'.split(',');

// Volatile app state -- the user`s imported data. Mutated by import/aggregate
// and read by every render function. Stays in memory; persisted via saveData().
let _months={},_allTxs=[],_sel=null;

// Keys that exist in localStorage. Used by exportData / restoreData / clearAllData.
const GB_KEYS=['gb_data','gb_cfg2','gb_log','gb_setup_done','gb_wt_done'];
