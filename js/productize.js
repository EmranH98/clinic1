(function(){
  // Avoid double load
  if (window.__productize_booted) return;
  window.__productize_booted = true;

  function safeHasPerm(perm){
    try{ return typeof window.hasPerm === 'function' ? window.hasPerm(perm) : true; }
    catch(e){ return true; }
  }

  function resolveBranchId(){
    try{
      if (window.branchId) return window.branchId;
      if (window.me && window.me.branch_id) return window.me.branch_id;
      const ls = localStorage.getItem('branchId') || localStorage.getItem('branch_id');
      if (ls) return ls;
      if (Array.isArray(window._branches) && window._branches.length) return window._branches[0].id;
    } catch(e){ }
    return null;
  }

  // 1) Navigation cleanup (sections)
  const nav = [
    { section: 'Overview' },
    { id:'dashboard', label:'Dashboard', icon:'📊'},
    { id:'patients', label:'Patients', icon:'🩺', perm:'view_customers'},

    { section: 'Operations' },
    { id:'daily', label:'Daily Entry', icon:'📋', perm:'view_operations'},
    { id:'sales', label:'Product Sales', icon:'🛍️', perm:'view_operations'},
    { id:'appointments', label:'Appointments', icon:'📅', perm:'view_appointments'},
    { id:'inventory', label:'Inventory', icon:'📦', perm:'manage_inventory'},

    { section: 'Finance' },
    { id:'payroll', label:'Payroll', icon:'💸', perm:'view_payroll'},
    { id:'reports', label:'Reports', icon:'📈', perm:'view_reports'},
    { id:'deposits', label:'Bank Deposits', icon:'🏦', perm:'view_month_end'},

    { section: 'Admin' },
    { id:'staff', label:'Staff & Access', icon:'👥', perm:'manage_staff'},
    { id:'notes', label:'Daily Notes', icon:'📝', perm:'view_notes'},
    { id:'sms', label:'SMS Campaigns', icon:'📱', perm:'send_sms'},
    { id:'import', label:'Import Data', icon:'📤', adminOnly:true},
    { id:'settings', label:'Settings', icon:'⚙️', perm:'manage_settings'},

    { section: 'Personal' },
    { id:'mystats', label:'My Performance', icon:'🏅', perm:'view_mystats'}
  ];

  // Inject a custom buildSidebar that uses our nav
  const waitFor = (fn) => new Promise((res)=>{
    const t = setInterval(()=>{
      try{ if(fn()){ clearInterval(t); res(true); } } catch(e){}
    },25);
  });

  waitFor(()=> typeof window.initApp === 'function' && typeof window.buildSidebar === 'function').then(()=>{
    window.NAV_ITEMS = nav;
    const oldBuild = window.buildSidebar;

    window.buildSidebar = async function(){
      try{
        const navEl = document.getElementById('sidebarNav');
        if (!navEl) return oldBuild();
        if (!window.me) return oldBuild();

        const items = Array.isArray(window.NAV_ITEMS) ? window.NAV_ITEMS : nav;
        const canSee = (it)=>{
          if (!it) return false;
          if (it.section) return true;
          if (it.adminOnly) return (window.isAdmin?.() ?? false);
          if (it.perm) return safeHasPerm(it.perm);
          return true;
        };

        navEl.innerHTML = '';
        let currentSection = '';
        for (const it of items){
          if (!canSee(it)) continue;

          if (it.section){
            currentSection = it.section;
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
      } catch(e){
        // fallback to original
        return oldBuild();
      }
    };

    // Rebuild immediately
    try{ window.buildSidebar(); } catch(e){ }
  });

  // 2) Lightweight Patients module
  const Patients = {
    list: async function(){
      try{
        const root = document.getElementById('pageContent');
        if (!root) return;

        let title = document.getElementById('pageTitle');
        let subtitle = document.getElementById('pageSubtitle');
        if (title) title.textContent = 'Patients';
        if (subtitle) subtitle.textContent = 'Home › Patients';

        const { data, error } = await window.supabase
          .from('customers')
          .select('id, name, phone, gender')
          .order('created_at', { ascending:false })
          .limit(100);

        if (error) {
          root.innerHTML = `<p>Failed to load patients (${error.message})</p>`;
          return;
        }

        const rows = (data || []).map(c=>`
          <tr>
            <td>${c.name || ''}</td>
            <td>${c.phone || ''}</td>
            <td>${c.gender || ''}</td>
            <td><button onclick="window.goto('patient/${c.id}')">View</button></td>
          </tr>`).join('');

        root.innerHTML = `
          <div class="card">
            <h2>Patients</h2>
            <p>A simple list to speed up front-desk work.</p>
            <table class="table">
              <thead>
                <tr><th>Name</th><th>Phone</th><th>Gender</th><th>Actions</th></tr>
              </thead>
              <tbody>${rows || '<tr><td colspan="4">No patients found.</td></tr>'}</tbody>
            </table>
          </div>`;
      } catch(e){
        console.error(e);
      }
    },

    profile: async function(id){
      try{
        const root = document.getElementById('pageContent');
        if (!root) return;
        let title = document.getElementById('pageTitle');
        let subtitle = document.getElementById('pageSubtitle');

        const { data, error } = await window.supabase
          .from('customers')
          .select('*')
          .eq('id', id)
          .maybeSingle?.() || {};

        const c = data || null;
        if (title) title.textContent = c?.name || 'Patient';
        if (subtitle) subtitle.textContent = 'Patients › Profile';

        if (error) {
          root.innerHTML = `<p>Failed to load patient (${error.message})</p>`;
          return;
        }
        if (!c) {
          root.innerHTML = '<p>Patient not found.</p>';
          return;
        }

        root.innerHTML = `
          <div class="card">
            <h2>${c.name || 'Patient'}</h2>
            <p>${c.phone || ''}</p>
            <button onclick="window.goto('patients')">Back to list</button>
          </div>`;
      } catch(e){
        console.error(e);
      }
    }
  };

  // 3) Payroll settings card (branch settings + doctor overrides)
  async function patchSettingsCard(){
    await waitFor(()=>document.getElementById('pageContent') && window.supabase);

    const root = document.getElementById('pageContent');
    if (!root) return;

    // re-render every time settings page is built
    const obs = new MutationObserver(()=>{
      // Only apply if settings title visible
      const titleText = (document.getElementById('pageTitle')?.textContent || '').toLowerCase();
      if (!titleText.includes('settings')) return;

      // remove old card
      const old = document.getElementById('productize-payroll-card');
      if (old && old.parentElement) old.parentElement.removeChild(old);

      const card = document.createElement('div');
      card.className = 'card';
      card.id = 'productize-payroll-card';

      const status = document.createElement('div');
      status.style.fontSize = '12px';
      status.style.color = '#666';
      card.appendChild(status);

      const error = (msg)=>{
        status.textContent = msg;
      };

      // UI
      const ui = document.createElement('div');
      ui.innerHTML = `
        <h2>Clinic Admin / Payroll rules</h2>
        <p id="pz-payroll-msg"></p>
        <h3>Default doctor profit % (everyone)</h3>
        <input id="pz-default-doctor" type="number" placeholder="%" style="width: 120px;">
        <button id="pz-default-save">Save default</button>
        <p class="help">This default applies to everyone unless an override is saved below.</p>
        <h3>Doctor overrides (per doctor)</h3>
        <p class="help">Tip: doctor names come from the existing Staff list. If a name is missing, the ID will be shown.</p>
        <table class="table">
          <thead>
            <tr><th>Doctor</th><th>%</th><th>Effective from</th><th>Action</th></tr>
          </thead>
          <tbody id="pz-doctor-rows"></tbody>
        </table>
      `;

      card.appendChild(ui);
      root.appendChild(card);

      async function getStaffMap(){
        const list = Array.isArray(window._profiles) ? window._profiles : [];
        const m = new Map();
        for (const p of list){
          const name = p.full_name || p.name || p.email || p.id;
          m.set(p.id, name);
        }
        return m;
      }

      async function load(){
        const branchId = resolveBranchId();
        if (!branchId) {
          error('Failed to load payroll settings (missing branch info).');
          return;
        }

        status.textContent = 'Loading...';

        const staffMap = await getStaffMap();

        const { data: settings, error: settingsErr } = await window.supabase
          .from('branch_settings')
          .select('*')
          .eq('branch_id', branchId)
          .limit(1);

        if (settingsErr) {
          error('Failed to load payroll settings (branch_settings).');
          return;
        }

        const defaults = (settings && settings[0]) || {};
        const defEl = document.getElementById('pz-default-doctor');
        if (defEl) defEl.value = defaults.default_doctor_profit_pct ?? '';

        const { data: contracts, error: contractsErr } = await window.supabase
          .from('doctor_contracts')
          .select('id, doctor_id, contract_pct, effective_from')
          .eq('branch_id', branchId)
          .order('effective_from', { ascending:false });

        if (contractsErr) {
          error('Failed to load doctor overrides.');
          return;
        }

        const body = document.getElementById('pz-doctor-rows');
        if (!body) return;
        body.innerHTML = '';
        if (!contracts || contracts.length === 0){
          body.innerHTML = '<tr><td colspan="4">No overrides saved.</td></tr>';
        } else {
          for (const row of contracts){
            const tr = document.createElement('tr');
            const name = staffMap.get(row.doctor_id) || row.doctor_id;
            tr.innerHTML = `
              <td>${name}</td>
              <td>${row.contract_pct ?? ''}%</td>
              <td>${(row.effective_from || '').split('T')[0] || ''}</td>
              <td><button data-id="${row.id}" class="pz-del">Delete</button></td>
            `;
            body.appendChild(tr);
          }
        }

        status.textContent = 'Loaded.';

        const delBtns = body.querySelectorAll('button.pz-del');
        delBtns.forEach((btn)=>{
          btn.onclick = async ()=>{
            const id = btn.getAttribute('data-id');
            if (!id) return;
            const confirmDel = window.confirm('Delete this override?');
            if (!confirmDel) return;
            await window.supabase.from('doctor_contracts').delete().eq('id', id);
            await load();
          };
        });

        const saveBtn = document.getElementById('pz-default-save');
        if (saveBtn) saveBtn.onclick = async ()=>{
          const pct = Number(defEl?.value);
          if (Number.isNaN(pct) || pct <= 0) {
            status.textContent = 'Enter a valid percent (positive number).';
            return;
          }
          await window.supabase.from('branch_settings').upsert({
            branch_id: branchId,
            default_doctor_profit_pct: pct,
            updated_at: new Date().toISOString()
          });
          status.textContent = 'Saved default percent.';
          await load();
        };
      }

      load();
    });

    obs.observe(root, { childList:true, subtree:true });
  }

  patchSettingsCard();

  // 4) Routing overrides (patients + legacy)
  waitFor(()=> typeof window.goto === 'function').then(()=>{
    if (!window.__legacyGotoSaved) window.__legacyGotoSaved = window.goto;
    window.goto = function(routeId){
      if (!routeId) routeId = 'dashboard';
      if (routeId === 'patients') return Patients.list();
      if (routeId.startsWith?.('patient/')){
        const id = routeId.split('/')[1];
        return Patients.profile(id);
      }
      return window.__legacyGotoSaved(routeId);
    };
  });

})();