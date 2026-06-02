// ════ Greenbar — import friction reducers (all on-device, no network) ════
// Extra ways to get a statement in without hunting through the file picker —
// every route funnels into the existing handleFiles() pipeline (preview →
// confirm → save), so the privacy model is unchanged: nothing is uploaded.
//   1. Drag & drop a CSV/PDF onto the window (desktop / installed PWA).
//   2. File Handling API — "Open with Greenbar" for .csv/.pdf (installed PWA).
//   3. Web Share Target — "Share → Greenbar" from another app; the service
//      worker stashes the shared file and this module picks it up on launch.
//
// Support note: routes 2 & 3 require an installed PWA and are unsupported on
// iOS Safari (which needs a native share extension — out of scope here). They
// are progressive enhancements: absent support, the file picker still works.
(function(){
  function imp(files){
    const arr = Array.from(files || []).filter(Boolean);
    if(arr.length && typeof handleFiles === 'function') handleFiles(arr);
  }

  // ── 1. Drag & drop ──
  let _overlay = null, _depth = 0;
  function overlayEl(){
    if(_overlay) return _overlay;
    const d = document.createElement('div');
    d.id = 'gb-drop-overlay'; d.setAttribute('aria-hidden', 'true');
    d.style.cssText = 'position:fixed;inset:0;z-index:1200;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);';
    d.innerHTML = '<div style="background:var(--bg);border:2px dashed var(--green);border-radius:20px;padding:28px 34px;text-align:center;font-family:var(--font-display);">'
      + '<div style="font-size:34px;margin-bottom:8px;" aria-hidden="true">&#x2193;</div>'
      + '<div style="font-size:16px;font-weight:900;color:var(--text);">Drop to import</div>'
      + '<div style="font-size:12.5px;color:var(--soft);margin-top:4px;font-family:var(--font-body);">CSV or PDF &middot; stays on your device</div></div>';
    document.body.appendChild(d); _overlay = d; return d;
  }
  function show(v){ overlayEl().style.display = v ? 'flex' : 'none'; }
  function hasFiles(e){ return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0; }
  window.addEventListener('dragenter', function(e){ if(!hasFiles(e)) return; e.preventDefault(); _depth++; show(true); });
  window.addEventListener('dragover',  function(e){ if(!hasFiles(e)) return; e.preventDefault(); try{ e.dataTransfer.dropEffect = 'copy'; }catch(_){} });
  window.addEventListener('dragleave', function(e){ if(!hasFiles(e)) return; _depth = Math.max(0, _depth - 1); if(_depth === 0) show(false); });
  window.addEventListener('drop',      function(e){ if(!hasFiles(e)) return; e.preventDefault(); _depth = 0; show(false); imp(e.dataTransfer.files); });

  // ── 2. File Handling API ("Open with Greenbar") ──
  if('launchQueue' in window){
    try{
      window.launchQueue.setConsumer(async function(params){
        if(!params || !params.files || !params.files.length) return;
        const files = [];
        for(const handle of params.files){ try{ files.push(await handle.getFile()); }catch(_){} }
        imp(files);
      });
    }catch(_){}
  }

  // ── 3. Web Share Target pickup ──
  // The SW handled the share POST, stashed the file(s) in the 'gb-share' cache,
  // and redirected to ?shared=N. Reconstruct File objects and import them.
  async function consumeShared(){
    try{
      const u = new URL(location.href);
      if(!u.searchParams.has('shared')) return;
      u.searchParams.delete('shared');
      history.replaceState({}, '', u.pathname + (u.search || '') + (u.hash || ''));
      if(!('caches' in window)) return;
      const cache = await caches.open('gb-share');
      const metaRes = await cache.match('gb-shared-meta');
      if(!metaRes) return;
      const names = await metaRes.json();
      const files = [];
      for(let i = 0; i < names.length; i++){
        const r = await cache.match('gb-shared-' + i);
        if(r){ const blob = await r.blob(); files.push(new File([blob], names[i] || ('statement-' + i), { type: r.headers.get('Content-Type') || '' })); }
      }
      await caches.delete('gb-share');
      imp(files);
    }catch(_){}
  }
  // Run after boot has rendered (load fires after all module scripts execute).
  if(document.readyState === 'complete') setTimeout(consumeShared, 0);
  else window.addEventListener('load', function(){ setTimeout(consumeShared, 0); });

  // Exposed for verification/testing.
  window._gbConsumeShared = consumeShared;
})();
