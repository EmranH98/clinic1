(function(){
  if (window.uiRebuild) return;

  function safeHasPerm(perm){
    try { return typeof window.hasPerm === 'function' ? window.hasPerm(perm) : true; }
    catch(e){ return true; }
  }

  function isAdmin(){
    try { return typeof window.isAdmin === 'function' ? window.isAdmin() : false; }
    catch(e){ return false; }
  }

  function waitFor(predicate){
    return new Promise((resolve)=>{
      const t = setInterval(()=>{
        try{
          if (predicate()){ clearInterval(t); resolve(true); }
        } catch(e){}
      }, 25);
    });
  }

  function resolveBranchId(){
    try {
      if (window.branchId) return window.branchId;
      if (window.me && window.me.branch_id) return window.me.branch_id;
      const ls = localStorage.getItem('branchId') || localStorage.getItem('branch_id');
      if (ls) return ls;
      if (Array.isArray(window._branches) && window._branches.length) return window._branches[0].id;
    } catch(e){}
    return null;
  }

  window.uiRebuild = {
    safeHasPerm,
    isAdmin,
    waitFor,
    resolveBranchId,
    routes: new Map(),
    navItems: [],
    registerRoute(id, fn){ this.routes.set(id, fn); },
    setNav(items){ this.navItems = Array.isArray(items) ? items : []; }
  };

  function initRoutes(){
    if (!window.__legacyGotoSaved) window.__legacyGotoSaved = window.goto;

    window.goto = function(routeId){
      if (!routeId) routeId = 'dashboard';

      const key = String(routeId);
      // route handlers can use exact match
      if (window.uiRebuild.routes.has(key)){
        return window.uiRebuild.routes.get(key)(key);
      }

      // pattern handlers: patient/<id> etc
      for (const [pattern, fn] of window.uiRebuild.routes.entries()){
        if (pattern.endsWith('/*')){
          const prefix = pattern.slice(0, -2);
          if (key.startsWith(prefix)) return fn(key);
        }
      }

      // fallback
      return window.__legacyGotoSaved(routeId);
    };
  }

  function initSidebar(){
    if (!window.NAV_ITEMS) window.NAV_ITEMS = [];

    const oldBuild = window.buildSidebar;

    window.buildSidebar = async function(){
      if (!window.uiRebuild) return oldBuild();

      const nav = window.uiRebuild.navItems.length ? window.uiRebuild.navItems : window.NAV_ITEMS;
      const navEl = document.getElementById('sidebarNav');
      if (!navEl || !window.me) return oldBuild();

      const canSee = (it)=>{
        if (!it) return false;
        if (it.section) return true;
        if (it.adminOnly) return window.uiRebuild.isAdmin();
        if (it.perm) return window.uiRebuild.safeHasPerm(it.perm);
        return true;
      };

      navEl.innerHTML = '';
      for (const it of nav){
        if (!canSee(it)) continue;

        if (it.section){
          const s = document.createElement('div');
          s.textContent = it.section;
          s.className = 'sb-section';
          navEl.appendChild(s);
          continue;
        }

        const a = document.createElement('div');
        a.className = 'sb-item';
        a.id = 'nav-' + it.id;
        a.innerHTML = `${it.icon || ''}\n${it.label}\n›`;
        a.onclick = () => window.goto(it.id);
        navEl.appendChild(a);
      }
    };

    try { window.buildSidebar(); } catch(e){}
  }

  // bootstrap after legacy app is ready
  window.uiRebuildBootstrap = async function(){
    await waitFor(()=>typeof window.initApp === 'function' && typeof window.goto === 'function');

    initRoutes();
    initSidebar();

    // re-run sidebar when user changes or perms change
    setTimeout(()=>{
      try{ window.buildSidebar(); } catch(e){}
    }, 200);
  };
})();
