// UI loader with versioned asset loading + visible version badge (so we can confirm it loaded).
(function () {
  if (window.__productize_booted) return;
  window.__productize_booted = true;

  const version = 'v12';

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

  // Visible badge after login so we can verify live quickly
  try {
    const badge = document.createElement('div');
    badge.textContent = version;
    badge.style.position = 'fixed';
    badge.style.right = '8px';
    badge.style.top = '8px';
    badge.style.padding = '3px 8px';
    badge.style.borderRadius = '999px';
    badge.style.fontSize = '12px';
    badge.style.background = '#0f172a';
    badge.style.color = 'white';
    badge.style.zIndex = 999999;
    badge.style.opacity = '0.75';
    document.documentElement.appendChild(badge);
  } catch {}

  if (!root) return;

  const cssHref = `${root}/css/ui-rebuild.css?v=${version}`;
  const scripts = [
    `${root}/js/ui-core.js?v=${version}`,
    `${root}/js/ui-nav.js?v=${version}`,
    `${root}/js/ui-patients.js?v=${version}`,
    `${root}/js/ui-settings.js?v=${version}`,
    `${root}/js/ui-appointments.js?v=${version}`,
    `${root}/js/ui-hotfix.js?v=${version}`,
    `${root}/js/ui-boot.js?v=${version}`
  ];

  function loadCss(href) {
    return new Promise((resolve) => {
      try {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.onload = () => resolve();
        link.onerror = () => resolve();
        document.head.appendChild(link);
      } catch {
        resolve();
      }
    });
  }

  function loadScript(src) {
    return new Promise((resolve) => {
      try {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => resolve();
        document.head.appendChild(s);
      } catch {
        resolve();
      }
    });
  }

  (async () => {
    await loadCss(cssHref);
    for (const src of scripts) {
      await loadScript(src);
    }

    if (window.uiRebuildBootstrap) {
      try {
        await window.uiRebuildBootstrap();
      } catch {}
    }
  })();
})();
