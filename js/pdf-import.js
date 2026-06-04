// ════ Greenbar — PDF bank-statement import (on-device, no network) ════
// Parses text-based statement PDFs into the SAME { txs, mapping, counts } shape
// processCSV() returns, so the existing import-preview → confirm → applyImport
// pipeline handles everything downstream. PDF.js (vendored under js/vendor/,
// lazy-loaded on first use) extracts text in a worker.
//
// Two parsing strategies, tried in order:
//   1. Columnar (Phase 2): when a table header is detected, tokens are assigned
//      to columns by x-position. Cleanly separates amount vs running balance and
//      infers sign from separate Debit/Credit columns. High confidence.
//   2. Line-based fallback (Phase 1): leading-date + trailing-amount per line,
//      choosing the value before a trailing balance. Low confidence (no header).
// Heuristic either way, so the import-preview confirmation is the safety net; a
// low-confidence parse surfaces a warning there.
//
// Scope: text-based PDFs, US MM/DD[/YYYY] dates. Later: OCR for scanned PDFs,
// non-US date orders, multi-line descriptions.
//
// Globals used (by load time): parseDateParts, parseAmt, categorizeTx, newTxId, CFG.

const gbPdf = (() => {
  const LIB_SRC    = 'js/vendor/pdf.min.js';
  const WORKER_SRC = 'js/vendor/pdf.worker.min.js';
  const MAX_PAGES  = 40;
  const Y_TOL      = 3;

  // Currency symbol is optional and may be $ or £ (US/AU/CA use $, UK uses £);
  // amounts still need 2 decimals so dates/IDs don't match.
  const AMT_CORE = '\\(?-?[\\$£]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)\\.\\d{2}\\)?-?';
  const AMT_RE_G = new RegExp(AMT_CORE, 'g');
  const AMT_RE_1 = new RegExp(AMT_CORE);
  const DATE_DMY_RE = /^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/;   // DD/MM or MM/DD (+ optional year)
  const DATE_YMD_RE = /^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})\b/;          // YYYY-MM-DD (Canada)
  const SKIP_RE = /\b(beginning|ending|opening|closing|previous|new|available|present|statement)\s+balance\b|balance\s+forward|\btotal\b|subtotal|page\s+\d+\s+of\s+\d+|account\s+number|minimum\s+payment|payment\s+due|statement\s+period/i;
  const MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };

  // Header column matchers (single-token, anchored). Order matters: first match
  // per token wins, and each column key is assigned at most once.
  const COL_DEFS = [
    ['date',    /^(date|posted|post)$/i],
    ['desc',    /^(description|desc|payee|merchant|memo|details|transaction|activity)$/i],
    ['debit',   /^(debit|debits|withdrawals?|payments?|charges?)$/i],
    ['credit',  /^(credits?|deposits?)$/i],
    ['amount',  /^(amount|amt)$/i],
    ['balance', /^(balance|bal)$/i],
  ];

  // ── lazy-load the vendored PDF.js (precached by the service worker, so this
  //    resolves from cache and works fully offline) ──
  let _libPromise = null;
  function _ensureLib(){
    if(typeof pdfjsLib !== 'undefined') return Promise.resolve();
    if(_libPromise) return _libPromise;
    _libPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = LIB_SRC;
      s.onload = () => resolve();
      s.onerror = () => { _libPromise = null; reject(new Error('Could not load the PDF engine. Please reload the app and try again.')); };
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
    lines.sort((a,b) => b.y - a.y);
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

  // Active date order from CFG.cols.fmt (region-driven): 'YMD' | 'DMY' | 'MDY'.
  function _fmtNow(){ return (typeof CFG !== 'undefined' && CFG.cols && CFG.cols.fmt) || 'MM/DD/YYYY'; }
  function _dateOrder(){ const f = _fmtNow(); if(/^Y/i.test(f)) return 'YMD'; if(/^D/i.test(f)) return 'DMY'; return 'MDY'; }
  // Parse a leading date token per the active order -> { m, d, yRaw, len } | null.
  // This is what makes UK/AU (DD/MM) and CA (YYYY-MM-DD) statements read correctly
  // instead of being mis-interpreted as US MM/DD.
  function _matchLeadDate(text){
    const order = _dateOrder();
    if(order === 'YMD'){
      const m = text.match(DATE_YMD_RE); if(!m) return null;
      return { m:+m[2], d:+m[3], yRaw:m[1], len:m[0].length };
    }
    const m = text.match(DATE_DMY_RE); if(!m) return null;
    return order === 'DMY' ? { m:+m[2], d:+m[1], yRaw:m[3], len:m[0].length }
                           : { m:+m[1], d:+m[2], yRaw:m[3], len:m[0].length };
  }
  // Resolve a row's year: explicit on the row, else backfilled from the period
  // (Dec→prior-year when the statement closes early in the year). Null = unplaceable.
  function _resolveYear(p, ctx){
    if(p.yRaw) return String(p.yRaw).length === 2 ? 2000 + (+p.yRaw) : +p.yRaw;
    if(ctx.year) return (ctx.month && p.m === 12 && ctx.month <= 2) ? ctx.year - 1 : ctx.year;
    return null;
  }
  // Build the date string in the active CFG order, so renderTxs() (which parses
  // tx.date with CFG.cols.fmt) reads it back correctly.
  function _dateStr(p, year){
    const MM = String(p.m).padStart(2,'0'), DD = String(p.d).padStart(2,'0'), order = _dateOrder();
    if(order === 'YMD') return year + '-' + MM + '-' + DD;
    if(order === 'DMY') return DD + '/' + MM + '/' + year;
    return MM + '/' + DD + '/' + year;
  }

  // ── Strategy 1: columnar (header-anchored) ──
  function _detectHeader(lines){
    for(let i = 0; i < lines.length; i++){
      const cols = [], taken = new Set();
      for(const t of lines[i].tokens){
        const w = (t.str || '').trim();
        if(!w) continue;
        for(const [key, re] of COL_DEFS){
          if(taken.has(key)) continue;
          if(re.test(w)){ cols.push({ key, x: t.x }); taken.add(key); break; }
        }
      }
      const hasDate  = cols.some(c => c.key === 'date');
      const hasMoney = cols.some(c => c.key === 'amount' || c.key === 'debit' || c.key === 'credit');
      if(hasDate && hasMoney && cols.length >= 2){
        cols.sort((a,b) => a.x - b.x);
        return { idx: i, cols };
      }
    }
    return null;
  }

  function _parseColumnar(lines, header, ctx){
    const xs = header.cols.map(c => c.x);
    const colOf = (tokenX) => {            // nearest header anchor by left-x
      let best = 0, bestD = Infinity;
      for(let j = 0; j < xs.length; j++){ const d = Math.abs(tokenX - xs[j]); if(d < bestD){ bestD = d; best = j; } }
      return header.cols[best].key;
    };
    const rows = []; let undated = 0;
    for(let i = header.idx + 1; i < lines.length; i++){
      const L = lines[i];
      if(!L.text || SKIP_RE.test(L.text)) continue;
      const buckets = {};
      for(const t of L.tokens){ const s = (t.str || '').trim(); if(!s) continue; const k = colOf(t.x); (buckets[k] = buckets[k] || []).push(s); }
      const p = _matchLeadDate((buckets.date || []).join(''));
      if(!p) continue;                     // no date in the date column -> not a row
      let amount = null;
      if(buckets.amount){ amount = parseAmt(buckets.amount.join('')); }
      else {
        const deb = buckets.debit  ? parseAmt(buckets.debit.join(''))  : 0;
        const cred = buckets.credit ? parseAmt(buckets.credit.join('')) : 0;
        if(deb)       amount = -Math.abs(deb);   // debit column -> expense
        else if(cred) amount =  Math.abs(cred);  // credit column -> income/refund
      }
      if(!amount) continue;
      const year = _resolveYear(p, ctx);
      if(year === null){ undated++; continue; }
      const desc = (buckets.desc || []).join(' ').replace(/\s+/g,' ').trim() || 'Transaction';
      rows.push({ dateStr: _dateStr(p, year), desc, amount });
    }
    return { rows, undated };
  }

  // ── Strategy 2: line-based fallback ──
  function _parseLineBased(lines, ctx){
    const rows = []; let undated = 0;
    for(const L of lines){
      const text = L.text;
      if(!text || SKIP_RE.test(text)) continue;
      const p = _matchLeadDate(text);
      if(!p) continue;
      const amts = text.match(AMT_RE_G);
      if(!amts || !amts.length) continue;
      const amtTok = amts.length >= 2 ? amts[amts.length - 2] : amts[amts.length - 1];
      const amount = parseAmt(amtTok);
      if(!amount) continue;
      const year = _resolveYear(p, ctx);
      if(year === null){ undated++; continue; }
      let desc = text.slice(p.len);
      const firstAmt = desc.search(AMT_RE_1);
      if(firstAmt > 0) desc = desc.slice(0, firstAmt);
      desc = desc.replace(/\s+/g,' ').trim() || 'Transaction';
      rows.push({ dateStr: _dateStr(p, year), desc, amount });
    }
    return { rows, undated };
  }

  // ── raw rows -> the shared { txs, mapping, counts } result (reuses CSV path) ──
  function _rowsToResult(rows, undated, confidence){
    const txs = []; let skipped = 0, und = undated;
    const low = confidence === 'low';
    for(const r of rows){
      const U = r.desc.toUpperCase();
      if(CFG.skipKw.some(kw => U.includes(kw))){ skipped++; continue; }
      const pd = parseDateParts(r.dateStr, _fmtNow());
      if(!pd){ und++; continue; }
      const { cat, isIncome } = categorizeTx(r.desc, '');
      const tx = { id: newTxId(), date: r.dateStr, ts: pd.key, month: pd.month,
                 desc: r.desc, origCat: '', amount: r.amount, cat, isIncome, source: 'pdf' };
      // Low-confidence (line-based, no header) rows still import — but each is
      // flagged so the Import Confidence Center can nag the user to verify it.
      // Nothing is silently dropped or silently trusted.
      if(low){ tx.conf = 'low'; tx.needsReview = true; }
      txs.push(tx);
    }
    if(!txs.length) return null;
    const res = {
      txs,
      mapping: { date: 'auto (PDF layout)', amt: 'auto (PDF layout)', desc: 'auto (PDF layout)', cat: '', fmt: _fmtNow() },
      counts: { total: txs.length + skipped + und, imported: txs.length, skipped, undated: und },
      // Explicit parse confidence + human-readable reasons consumed by the
      // import preview and the Import Confidence Center (gbConfidence).
      confidence: low ? 'low' : 'high',
      reasons: []
    };
    if(low){
      res.warn = 'No clear table header was found — Greenbar inferred the columns from the page layout. Please review the sample below carefully.';
      res.reasons.push('No clear table header was found — columns were inferred from the page layout.');
      if(und) res.reasons.push(und + ' row' + (und === 1 ? '' : 's') + ' had unreadable dates and were dropped.');
    }
    return res;
  }

  // ── public: parse(ArrayBuffer) -> { txs, mapping, counts, warn?, note? } ──
  async function parse(buf){
    await _ensureLib();
    pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_SRC;
    const data = new Uint8Array(buf.slice ? buf.slice(0) : buf);   // getDocument neuters the buffer

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

    // Prefer columnar when a header is found; fall back to line-based otherwise.
    let result = null;
    const header = _detectHeader(allLines);
    if(header){
      const c = _parseColumnar(allLines, header, ctx);
      result = _rowsToResult(c.rows, c.undated, 'high');
    }
    if(!result){
      const lb = _parseLineBased(allLines, ctx);
      result = _rowsToResult(lb.rows, lb.undated, 'low');
    }
    if(!result)
      return empty('Couldn’t find transactions in this PDF — the statement layout may be unusual. Try your bank’s CSV export instead.');
    return result;
  }

  return { parse };
})();
