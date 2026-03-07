// UI loader v13: forces newer modules to load after login.
(function(){
  if (window.__productize_booted) return;
  window.__productize_booted = true;

  const version = 'v13';
  const scripts = [
    'js/ui-core.js',
    'js/ui-nav.js',
    'js/ui-patients.js',
    'js/ui-settings.js',
    'js/ui-appointments.js',
    'js/ui-hotfix.js',
    'js/ui-boot.js'
  ];
  const cssFiles = [
    'css/ui-rebuild.css'
  ];

  function inferRoot(){
    try{
      const s = document.currentScript;
      if(!s) return '';
      const src = s.src || '';
      const idx = src.indexOf('/js/productize.js');
      if(idx === -1) return '';
      return src.slice(0, idx);
    }catch(e){
      return '';
    }
  }
  const root = inferRoot();

  // Glue the global lexical `me` binding (from auth.js) onto window/globalThis
  // so modules that check window.me do not crash.
  const syncMe = () => {
    try {
      if (typeof me !== 'undefined') {
        window.me = me;
        globalThis.me = me;
      }
    } catch (e) {
      // ignore ReferenceError
    }
  };
  syncMe();
  const t = setInterval(() => {
    syncMe();
    if (window.me && window.me.name) clearInterval(t);
  }, 50);

  function loadCSS(path){
    return new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `${root}/${path}?v=${version}`;
      link.onload = () => resolve(true);
      link.onerror = () => resolve(false);
      document.head.appendChild(link);
    });
  }

  function loadScript(path){
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = `${root}/${path}?v=${version}`;
      s.async = false;
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  }

  cssFiles.forEach((c) => loadCSS(c));

  scripts
    .reduce((p, x) => p.then(() => loadScript(x)), Promise.resolve())
    .then(() => {
      try {
        if (typeof window.uiRebuildBootstrap === 'function') {
          window.uiRebuildBootstrap();
        }
      } catch (e) {
        // ignore
      }
    });

  // Visible version badge
  try {
    const badge = document.createElement('div');
    badge.textContent = version;
    badge.style.position = 'fixed';
    badge.style.right = '8px';
    badge.style.top = '8px';
    badge.style.padding = '3px 8px';
    badge.style.background = 'rgba(15, 23, 42, 0.85)';
    badge.style.color = '#e2e8f0';
    badge.style.font = '12px/1 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
    badge.style.borderRadius = '999px';
    badge.style.zIndex = 9999;
    document.addEventListener('DOMContentLoaded', () => {
      document.body.appendChild(badge);
    });
  } catch (e) {
    // ignore
  }
})();
