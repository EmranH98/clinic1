// Small, stable loader to bring in the UI rebuild modules.
(function() {
  if (window.__productize_booted) return;
  window.__productize_booted = true;

  function inferRoot() {
    try {
      const s = document.currentScript;
      if (!s) return '';
      const src = s.src || '';
      const idx = src.indexOf('/js/productize.js');
      if (idx === -1) return '';
      return src.slice(0, idx);
    } catch (e) {
      return '';
    }
  }

  const root = inferRoot();
  const cssHref = root + '/css/ui-rebuild.css';
  const scripts = [
    root + '/js/ui-core.js',
    root + '/js/ui-nav.js',
    root + '/js/ui-patients.js',
    root + '/js/ui-settings.js',
    root + '/js/ui-appointments.js'
  ];

  // load styling
  try {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssHref;
    document.head.appendChild(link);
  } catch (e) {
    console.warn('CSS load warning', e);
  }

  function loadScript(src) {
    return new Promise((resolve) => {
      const el = document.createElement('script');
      el.src = src;
      el.async = false;
      el.onload = () => resolve();
      el.onerror = () => resolve();
      document.head.appendChild(el);
    });
  }

  (async () => {
    for (const s of scripts) {
      if (!s) continue;
      await loadScript(s);
    }
    try {
      window.uiRebuildBootstrap?.();
    } catch (e) {
      console.error('productize bootstrap failed', e);
    }
  })();
})();
