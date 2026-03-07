(function(){
  // productize: navigation + payroll settings
  // --- navigation clean ---
  if (Array.isArray(window.NAV_ITEMS)) {
    try {
      window.NAV_ITEMS.splice(0, window.NAV_ITEMS.length,
        { id:'dashboard', label:'Dashboard', icon:'🏥' },
        { section:'Front Desk' },
        { id:'appointments', label:'Appointments', icon:'📅', perm:'view_appointments' },
        { id:'daily', label:'Daily Operations', icon:'🧾', perm:'view_operations' },
        { section:'Management' },
        { id:'payroll', label:'Payroll', icon:'💸', perm:'view_payroll' },
        { id:'monthend', label:'Reports', icon:'📊', perm:'view_month_end' },
        { id:'staff', label:'Staff', icon:'👥', perm:'manage_staff' },
        { id:'settings', label:'Settings', icon:'⚙️', perm:'manage_settings' },
        { section:'More' },
        { id:'inventory', label:'Inventory', icon:'📦', perm:'manage_inventory' },
        { id:'sales', label:'Sales', icon:'🧾', perm:'view_operations' },
        { id:'deposits', label:'Deposits', icon:'🏦', perm:'view_month_end' },
        { id:'notes', label:'Notes', icon:'📝', perm:'view_month_end' },
        { id:'sms', label:'SMS', icon:'✉️', perm:'send_sms' },
        { id:'mystats', label:'My Stats', icon:'📈' },
        { id:'import', label:'Imports', icon:'⬆️', adminOnly:true }
      );
      if (typeof window.buildSidebar==='function') window.buildSidebar();
    } catch (e) {}
  }

  // --- Payroll settings card in Settings page ---
  function safeLabel(p){
    const candidates=['name','full_name','display_name','username','email'];
    for (const k of candidates){ if (p && p[k]) return p[k]; }
    if (p && p.role) return String(p.role);
    return p && p.id ? String(p.id) : 'Unknown';
  }

  function getProfiles(){
    if (Array.isArray(window._profiles)) return window._profiles;
    if (Array.isArray(window.profiles)) return window.profiles;
    if (Array.isArray(window.users)) return window.users;
    return [];
  }

  function getDoctors(){
    const list=getProfiles();
    const doctors=list.filter(p=>{
      const r=(p.role||'').toString().toLowerCase();
      return r.includes('doc') || r.includes('dent') || r.includes('special');
    });
    return doctors.length ? doctors : list;
  }

  async function ensureMe(){
    try {
      if (window.me && window.me.branch_id) return window.me;
      if (typeof window.getMe==='function') {
        const m=await window.getMe();
        if (m && m.branch_id) { window.me=m; return m; }
      }
    } catch (e){}
    return null;
  }

  async function fetchBranchSettings(branchId){
    try {
      const { data, error } = await supabase
        .from('branch_settings')
        .select('id,default_doctor_profit_pct')
        .eq('branch_id', branchId)
        .order('id');
      if (error) throw error;
      return data && data[0] ? data[0] : {};
    } catch (e) {
      return { __err:e };
    }
  }

  async function upsertBranchSettings(branchId, value){
    if (!branchId) throw new Error('Missing branch');
    return await supabase.from('branch_settings').upsert({ branch_id: branchId, default_doctor_profit_pct: value }, { onConflict: 'branch_id' });
  }

  async function fetchContracts(branchId){
    try {
      const { data, error } = await supabase
        .from('doctor_contracts')
        .select('doctor_id,contract_pct')
        .eq('branch_id', branchId);
      if (error) throw error;
      return data || [];
    } catch (e) {
      return { __err:e };
    }
  }

  async function upsertContract(branchId, doctorId, pct){
    return await supabase.from('doctor_contracts').upsert({ branch_id: branchId, doctor_id: doctorId, contract_pct: pct }, { onConflict: 'branch_id,doctor_id' });
  }

  async function deleteContract(branchId, doctorId){
    return await supabase.from('doctor_contracts').delete().eq('branch_id', branchId).eq('doctor_id', doctorId);
  }

  function removeExistingCard(){
    const page=document.querySelector('#pageContent');
    if (!page) return;
    const existing=page.querySelector('[data-payroll-card]');
    if (existing) existing.remove();
  }

  async function addPayrollCard(){
    const page=document.querySelector('#pageContent');
    if (!page) return;
    removeExistingCard();

    const card=document.createElement('div');
    card.setAttribute('data-payroll-card','1');
    card.style.marginTop='16px';
    card.style.border='1px solid #dee2e6';
    card.style.borderRadius='8px';
    card.style.overflow='hidden';

    card.innerHTML=`
      <div style="padding:12px 16px; font-weight:700; background:#f8f9fa;">Clinic Admin / Payroll rules</div>
      <div style="padding:16px;" data-payroll-body>
        <div data-payroll-status style="margin-bottom:12px; color:#6c757d; font-size:14px;">Loading…</div>
        <div>
          <div style="font-weight:600; margin:8px 0;">Default doctor profit % (everyone)</div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <input id="payrollDefaultPct" type="number" min="0" max="100" step="0.1" style="width:120px;" placeholder="%">
            <button id="payrollDefaultSave" class="btn btn-primary">Save default</button>
          </div>
          <div style="margin-top:8px; font-size:13px; color:#6c757d;">
            This default applies to everyone unless an override is saved for a doctor below.
          </div>
        </div>

        <hr>

        <div>
          <div style="font-weight:600; margin:8px 0;">Doctor overrides (per doctor)</div>
          <div id="payrollDocTable"></div>
          <div style="margin-top:8px; font-size:13px; color:#6c757d;">
            Tip: doctor names come from the existing Staff list. If a name is missing, the ID will be shown.
          </div>
        </div>
      </div>`;

    page.appendChild(card);

    const body=card.querySelector('[data-payroll-body]');
    const status=card.querySelector('[data-payroll-status]');
    const defaultInput=card.querySelector('#payrollDefaultPct');
    const docTable=card.querySelector('#payrollDocTable');

    const meObj=await ensureMe();
    if (!meObj || !meObj.branch_id) {
      status.textContent='Failed to load payroll settings (missing branch info).';
      status.style.color='#dc3545';
      return;
    }

    if (typeof supabase==='undefined' || !supabase) {
      status.textContent='Failed to load payroll settings: Supabase client not ready.';
      status.style.color='#dc3545';
      return;
    }

    const [bs, contracts] = await Promise.all([
      fetchBranchSettings(meObj.branch_id),
      fetchContracts(meObj.branch_id)
    ]);

    if (bs.__err || contracts.__err) {
      status.textContent='Failed to load payroll settings. Check your connection and try again.';
      status.style.color='#dc3545';
      return;
    }

    status.textContent='Loaded. Only admins/managers should change these values.';
    defaultInput.value = (bs.default_doctor_profit_pct ?? '') === null ? '' : (bs.default_doctor_profit_pct ?? '');

    const contractMap=new Map();
    (contracts||[]).forEach(c => contractMap.set(String(c.doctor_id), c.contract_pct));

    const doctors=getDoctors();
    const rows=[];
    // ensure at least one row so user can set new contract by doctor id
    const uniqueDoctors=new Map();
    (doctors||[]).forEach(p => uniqueDoctors.set(String(p.id), p));
    (contracts||[]).forEach(c => {
      if (!uniqueDoctors.has(String(c.doctor_id))) {
        uniqueDoctors.set(String(c.doctor_id), { id: c.doctor_id, role: 'Doctor' });
      }
    });

    uniqueDoctors.forEach((p,pid) => {
      const pct = contractMap.has(pid) ? contractMap.get(pid) : '';
      rows.push(
        `<tr data-doc="${pid}">
          <td style="padding:6px 8px; border-bottom:1px solid #eee;">${safeLabel(p)}</td>
          <td style="padding:6px 8px; border-bottom:1px solid #eee;">
            <input type="number" min="0" max="100" step="0.1" value="${pct ?? ''}" style="width:100px;">
          </td>
          <td style="padding:6px 8px; border-bottom:1px solid #eee;">
            <button class="btn btn-sm btn-primary" data-act="save">Save</button>
            <button class="btn btn-sm btn-outline-danger" data-act="clear">Clear</button>
          </td>
        </tr>`
      );
    });

    docTable.innerHTML=`
      <table style="width:100%; border-collapse:collapse;">
        <thead>
          <tr>
            <th style="text-align:left; padding:6px 8px; border-bottom:1px solid #ccc;">Doctor</th>
            <th style="text-align:left; padding:6px 8px; border-bottom:1px solid #ccc;">Profit %</th>
            <th style="text-align:left; padding:6px 8px; border-bottom:1px solid #ccc;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${rows.join('')}
        </tbody>
      </table>`;

    const defaultSaveBtn=card.querySelector('#payrollDefaultSave');
    defaultSaveBtn.addEventListener('click', async () => {
      const v=parseFloat(defaultInput.value);
      if (!Number.isFinite(v)) {
        alert('Enter a number for the default profit %');
        return;
      }
      status.textContent='Saving default…';
      status.style.color='#6c757d';
      const { error } = await upsertBranchSettings(meObj.branch_id, v);
      if (error) {
        status.textContent='Failed to save default';
        status.style.color='#dc3545';
        return;
      }
      status.textContent='Default saved';
      status.style.color='#198754';
    });

    docTable.addEventListener('click', async (ev) => {
      const btn=ev.target.closest('button');
      if (!btn) return;
      const act=btn.getAttribute('data-act');
      const tr=btn.closest('tr');
      const doctorId=tr.getAttribute('data-doc');
      const input=tr.querySelector('input');
      if (act==='save') {
        const v=parseFloat(input.value);
        if (!Number.isFinite(v)) { alert('Enter a number'); return; }
        status.textContent='Saving override…';
        status.style.color='#6c757d';
        const { error } = await upsertContract(meObj.branch_id, doctorId, v);
        if (error) { status.textContent='Failed to save override'; status.style.color='#dc3545'; return; }
        status.textContent='Override saved';
        status.style.color='#198754';
      }
      if (act==='clear') {
        if (!confirm('Clear override for this doctor?')) return;
        status.textContent='Clearing override…';
        status.style.color='#6c757d';
        const { error } = await deleteContract(meObj.branch_id, doctorId);
        if (error) { status.textContent='Failed to clear override'; status.style.color='#dc3545'; return; }
        input.value='';
        status.textContent='Override cleared';
        status.style.color='#198754';
      }
    });
  }

  function patchSettings(){
    if (window.__productizePatched) return;
    window.__productizePatched=true;
    const orig=window.renderSettingsPage;
    if (typeof orig!=='function') return;
    window.renderSettingsPage = async function(){
      try { await orig(); } catch (e){}
      try { await addPayrollCard(); } catch (e){}
    };
  }

  const poll=setInterval(() => {
    try {
      if (window.renderSettingsPage && window.goto) {
        patchSettings();
        clearInterval(poll);
      }
    } catch (e){}
  }, 250);
})();