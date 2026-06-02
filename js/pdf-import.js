// ════ Greenbar — PDF bank-statement import (on-device, no network) ════
// Parses text-based statement PDFs into the SAME { txs, mapping, counts } shape
// processCSV() returns, so the existing import-preview → confirm → applyImport
// pipeline handles everything downstream (preview, conflict, dedup, logging).
// PDF.js (vendored under js/vendor/, lazy-loaded on first use) extracts text in a
// worker; row parsing is heuristic (line reconstruction + leading-date /
// trailing-amount), so the preview confirmation is the safety net.
//
// Scope (Phase 1 / MVP): text-based PDFs, US MM/DD[/YYYY] dates, single amount or
// amount+running-balance columns. Out of scope (later phases): scanned/OCR PDFs,
// debit/credit column inference, non-US date orders, multi-line descriptions.
//
// Globals used (defined by load time): parseDateParts, parseAmt, categorizeTx,
// newTxId, CFG, gbDialog (only via thrown messages / returned note — no direct UI).

const gbPdf = (() => {
  const LIB_SRC    = 'js/vendor/pdf.min.js';
  const WORKER_SRC = 'js/vendor/pdf.worker.min.js';
  const MAX_PAGES  = 40;     // hard cap so a pathological PDF can't hang the UI
  const Y_TOL      = 3;      // text items within this many y-units share a line

  // Amount token: optional $ / leading-minus / parens, thousands OR plain digits,
  // mandatory 2-decimal cents (so account numbers / dates don't match).
  const AMT_CORE = '\\(?-?\\$?(?:\\d{1,3}(?:,\\d{3})+|\\d+)\\.\\d{2}\\)?-?';
  const AMT_RE_G = new RegExp(AMT_CORE, 'g');
  const AMT_RE_1 = new RegExp(AMT_CORE);
  const DATE_LEAD_RE = /^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/;
  // Non-transaction lines (balances, totals, page chrome) — never rows.
  const SKIP_RE = /\b(beginning|ending|opening|closing|previous|new|available|present|statement)\s+balance\b|balance\s+forward|\btotal\b|subtotal|page\s+\d+\s+of\s+\d+|account\s+number|minimum\s+payment|payment\s+due|statement\s+period/i;
  const MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };

  // ── lazy-load the vendored PDF.js (kept out of the precached shell) ──
  let _libPromise = null;
  function _ensureLib(){
    if(typeof pdfjsLib !== 'undefined') return Promise.resolve();
    if(_libPromise) return _libPromise;
    _libPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = LIB_SRC;
      s.onload = () => resolve();
      s.onerror = () => { _libPromise = null; reject(new Error('Could not load the PDF engine. Check your connection and try again.')); };
      document.head.appendChild(s);
    });
    return _libPromise;
  }

  // ── group positioned text items into lines (by y), tokens left-to-right ──
  function _reconstructLines(items){
    const lines = [];
    for(const it of items){
      if(!it.str) continue;
      const x = it.transform[4], y = it.transform[5];
      let line = null;
      for(const L of lines){ if(Math.abs(L.y - y) <= Y_TOL){ line = L; break; } }
      if(!line){ line = { y, tokens: [] }; lines.push(line); }
      line.tokens.push({ str: it.str, x });
    }
    lines.sort((a,b) => b.y - a.y);              // top of page first
    for(const L of lines){
      L.tokens.sort((a,b) => a.x - b.x);
      L.text = L.tokens.map(t => t.str).join(' ').replace(/\s+/g,' ').trim();
    }
    return lines;
  }

  // ── statement year/month, for backfilling rows that omit the year ──
  function _detectPeriod(lines){
    for(const L of lines){
      const t = L.text;
      const m = t.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s*(?:-|–|to|through)\s*(\d{1,2})[\/-](\d{1,2})[\/-](\d{4}))?/);
      if(m && /statement|period|closing|through|cycle|as of|ending/i.test(t)){
        return { year: m[6] ? +m[6] : +m[3], month: m[4] ? +m[4] : +m[1] };
      }
      const m2 = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+(\d{4})/i);
      if(m2 && /statement|period|closing|as of|ending/i.test(t)){
        return { year: +m2[2], month: MONTHS[m2[1].toLowerCase().slice(0,3)] };
      }
    }
    for(const L of lines){
      const m = L.text.match(/\b(20\d{2})\b/);
      if(m && /statement|period|closing|as of/i.test(L.text)) return { year: +m[1], month: null };
    }
    return null;
  }

  // ── reconstructed lines -> raw { dateStr, desc, amount } rows ──
  function _parseRows(lines, ctx){
    const rows = [];
    let undated = 0;
    for(const L of lines){
      const text = L.text;
      if(!text || SKIP_RE.test(text)) continue;
      const dm = text.match(DATE_LEAD_RE);
      if(!dm) continue;                              // no leading date -> not a row
      const amts = text.match(AMT_RE_G);
      if(!amts || !amts.length) continue;            // no money -> not a row (e.g. wrapped desc)
      // Transaction amount: the value BEFORE a trailing running-balance when two
      // amounts are present; otherwise the only/last amount.
      const amtTok = amts.length >= 2 ? amts[amts.length - 2] : amts[amts.length - 1];
      const amount = parseAmt(amtTok);
      if(!amount) continue;                          // zero / unparseable -> ignore

      // Description = text between the leading date and the first amount.
      let desc = text.slice(dm[0].length);
      const firstAmt = desc.search(AMT_RE_1);
      if(firstAmt > 0) desc = desc.slice(0, firstAmt);
      desc = desc.replace(/\s+/g,' ').trim() || 'Transaction';

      // Year: explicit on the row, else backfilled from the statement period
      // (with a Dec→prior-year guard when the statement closes early in the year).
      const mm = dm[1].padStart(2,'0'), dd = dm[2].padStart(2,'0');
      let year;
      if(dm[3]){ year = dm[3].length === 2 ? 2000 + (+dm[3]) : +dm[3]; }
      else if(ctx.year){
        year = ctx.year;
        if(ctx.month && +dm[1] === 12 && ctx.month <= 2) year = ctx.year - 1;
      } else { undated++; continue; }                // no year anywhere -> can't place it
      rows.push({ dateStr: mm + '/' + dd + '/' + year, desc, amount });
    }
    return { rows, undated };
  }

  // ── public: parse(ArrayBuffer) -> { txs, mapping, counts, note? } ──
  async function parse(buf){
    await _ensureLib();
    pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_SRC;
    // getDocument transfers (neuters) the buffer — hand it a private copy.
    const data = new Uint8Array(buf.slice ? buf.slice(0) : buf);

    let pdf;
    try{
      pdf = await pdfjsLib.getDocument({ data }).promise;
    }catch(e){
      if(e && e.name === 'PasswordException')
        throw new Error('This PDF is password-protected. Remove the password (or export a CSV) and try again.');
      throw new Error('Could not read this PDF — it may be corrupted or not a real PDF.');
    }

    const empty = (note) => ({ txs: [], mapping: null, counts: { total:0, imported:0, skipped:0, undated:0 }, note });

    const pageCount = Math.min(pdf.numPages, MAX_PAGES);
    let allLines = [], anyText = false, period = null;
    for(let p = 1; p <= pageCount; p++){
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      if(tc.items.some(it => (it.str || '').trim())) anyText = true;
      const lines = _reconstructLines(tc.items);
      if(!period) period = _detectPeriod(lines);
      allLines = allLines.concat(lines);
    }

    if(!anyText)
      return empty('This looks like a scanned PDF (no selectable text). Export a CSV from your bank instead.');

    const ctx = period || { year: null, month: null };
    const parsed = _parseRows(allLines, ctx);

    const txs = [];
    let skipped = 0, undated = parsed.undated;
    for(const r of parsed.rows){
      const U = r.desc.toUpperCase();
      if(CFG.skipKw.some(kw => U.includes(kw))){ skipped++; continue; }
      const pd = parseDateParts(r.dateStr, 'MM/DD/YYYY');
      if(!pd){ undated++; continue; }
      const { cat, isIncome } = categorizeTx(r.desc, '');
      txs.push({ id: newTxId(), date: r.dateStr, ts: pd.key, month: pd.month,
                 desc: r.desc, origCat: '', amount: r.amount, cat, isIncome, source: 'pdf' });
    }

    if(!txs.length)
      return empty('Couldn’t find transactions in this PDF — the statement layout may be unusual. Try your bank’s CSV export instead.');

    return {
      txs,
      mapping: { date: 'auto (PDF layout)', amt: 'auto (PDF layout)', desc: 'auto (PDF layout)', cat: '', fmt: 'MM/DD/YYYY' },
      counts: { total: txs.length + skipped + undated, imported: txs.length, skipped, undated }
    };
  }

  return { parse };
})();
