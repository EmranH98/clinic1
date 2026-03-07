(function(){
  if(window.__productize_booted) return;
  window.__productize_booted = true;

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
  const cssHref = root + '/css/ui-rebuild.css';
  const scripts = [
    root + '/js/ui-core.js',
    root + '/js/ui-nav.js',
    root + '/js/ui-patients.js',
    root + '/js/ui-settings.js'
  ];

  // load styling
  try {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssHref;
    document.head.appendChild(link);
  } catch (e) {}

  function loadScriptSequentially(list){
    return list.reduce((p, src) => p.then(() => new Promise(resolve => {
      try {
        const s = document.createElement('script');
        s.src = src;
        s.async = false;
        s.onload = () => resolve(true);
        s.onerror = () => resolve(true);
        document.head.appendChild(s);
      } catch (e) {
        resolve(true);
      }
    })), Promise.resolve(true));
  }

  loadScriptSequentially(scripts).then(() => {
    try {
      if(typeof window.uiRebuildBootstrap === 'function'){
        window.uiRebuildBootstrap();
      }
    } catch (e) {}
  });
})();
