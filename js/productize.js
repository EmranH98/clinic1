// UI loader with versioned asset loading + visible version badge (so we can confirm it loaded).
(function () {
  if (window.__productize_booted) return;
  window.__productize_booted = true;

  const version = 'v11';

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
    root + '/js/ui-appointments.js',
    root + '/js/ui-hotfix.js'
  ];

  // visible version badge to prove the UI loader is active (remove later)
  try {
    const badge = document.createElement('div');
    badge.id = 'uiVersionBadge';
    badge.textContent = version;
    badge.setAttribute('title', 'ClinicOS UI build version');
    badge.style.cssText = [
      'position:fixed',
      'top:8px',
      'right:10px',
      'z-index:9999',
      'font-family:system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
      'font-size:11px',
      'line-height:1',
      'background:rgba(17,24,39,.85)',
      'color:rgba(255,255,255,.9)',
      'padding:3px 7px',
      'border-radius:9999px',
      'border:1px solid rgba(255,255,255,.18)',
      'box-shadow:0 10px 25px rgba(0,0,0,.18)',
      'pointer-events:none'
    ].join(';');

    const inject = () => {
      if (!document.body) return;
      if (!document.getElementById('uiVersionBadge')) {
        document.body.appendChild(badge);
      }
    };

    inject();
    document.addEventListener('DOMContentLoaded', inject, { once: true });
  } catch (e) {}

  // load styling
  try {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssHref + '?v=' + version;
    document.head.appendChild(link);
  } catch (e) {}

  function loadScript(src) {
    return new Promise((resolve) => {
      try {
        const el = document.createElement('script');
        el.src = src + '?v=' + version;
        el.async = false;
        el.onload = () => resolve();
        el.onerror = () => resolve();
        document.head.appendChild(el);
      } catch (e) {
        resolve();
      }
    });
  }

  (async () => {
    for (const s of scripts) await loadScript(s);
    if (window.uiRebuildBootstrap) await window.uiRebuildBootstrap();
  })();
})();
