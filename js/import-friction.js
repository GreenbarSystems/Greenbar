// ════ Greenbar — import friction reducers (all on-device, no network) ════
// Extra ways to get a statement in without hunting through the file picker —
// every route funnels into the existing handleFiles() pipeline (preview →
// confirm → save), so the privacy model is unchanged: nothing is uploaded.
//   1. File Handling API — "Open with Greenbar" for .csv/.pdf (installed PWA).
//   2. Web Share Target — "Share → Greenbar" from another app; the service
//      worker stashes the shared file and this module picks it up on launch.
//
// Support note: both paths require an installed PWA and are unsupported on
// iOS Safari (which needs a native share extension — out of scope here). They
// are progressive enhancements: absent support, the file picker still works.
(function(){
  function imp(files){
    const arr = Array.from(files || []).filter(Boolean);
    if(arr.length && typeof handleFiles === 'function') handleFiles(arr);
  }

  // ── 1. File Handling API ("Open with Greenbar") ──
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

  // ── 2. Web Share Target pickup ──
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
