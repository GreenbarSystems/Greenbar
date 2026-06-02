// ════ Greenbar — light/dark theme ════
// Sets data-theme="light"|"dark" on <html>. Preference is stored in localStorage
// under gb_theme: 'light' | 'dark' | (absent = 'system', follow the OS). An inline
// script in <head> applies the resolved theme before first paint (no flash); this
// module is the live toggle, the OS-change listener, and the Settings control.
//
// The whole app themes from CSS variables (palette + overlay tokens in main.css),
// so switching is a single attribute flip — no per-element work here.

const gbTheme = (() => {
  const K = 'gb_theme';
  const mq = (typeof matchMedia === 'function') ? matchMedia('(prefers-color-scheme: light)') : null;

  function pref(){ try{ return localStorage.getItem(K) || 'system'; }catch(e){ return 'system'; } }
  function resolve(p){ p = p || pref(); if(p === 'light' || p === 'dark') return p; return (mq && mq.matches) ? 'light' : 'dark'; }

  function apply(){
    const mode = resolve();
    document.documentElement.setAttribute('data-theme', mode);
    const tc = document.querySelector('meta[name="theme-color"]');
    if(tc) tc.setAttribute('content', mode === 'light' ? '#f6f8fc' : '#050a14');
    refreshUI();
  }

  // pref: 'light' | 'dark' | 'system'. 'system' clears the stored override.
  function set(p){
    try{ if(p === 'system') localStorage.removeItem(K); else localStorage.setItem(K, p); }catch(e){}
    apply();
  }

  // Reflect the current choice on the Settings segmented control.
  function refreshUI(){
    const p = pref();
    document.querySelectorAll('#theme-seg .theme-opt').forEach(b => {
      const on = b.dataset.theme === p;
      b.classList.toggle('selected', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  // Follow the OS when in 'system' mode.
  if(mq){
    const onChange = () => { if(pref() === 'system') apply(); };
    try{ mq.addEventListener('change', onChange); }catch(e){ try{ mq.addListener(onChange); }catch(_){ } }
  }
  // Keep the Settings control in sync when the screen opens.
  document.addEventListener('gb:screen', (e) => { if(e.detail && e.detail.name === 'settings') refreshUI(); });

  apply();
  return { pref, resolve, apply, set, refreshUI };
})();
