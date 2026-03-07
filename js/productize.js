(function(){
  // Clinic Admin payroll: branch default doctor profit % + per-doctor overrides
  function escapeHtml(s){
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function getBranchId(){
    return (typeof me === 'object' && me) ? me.branch_id : null;
  }

  function patchNavigation(){
    if(typeof NAV_ITEMS === 'undefined' || !Array.isArray(NAV_ITEMS)) return false;
    const items = [
      {section:'Front Desk'},
      {id:'dashboard', label:'Dashboard', icon:'🏠', perm:'view_dashboard'},
      {id:'appointments', label:'Appointments', icon:'📅', perm:'view_appointments'},
      {id:'daily', label:'Daily Operations', icon:'🧾', perm:'view_operations'},

      {section:'Management'},
      {id:'payroll', label:'Payroll', icon:'💸', perm:'view_payroll'},
      {id:'monthend', label:'Reports', icon:'📊', perm:'view_month_end'},
      {id:'staff', label:'Staff', icon:'👥', perm:'manage_staff'},
      {id:'settings', label:'Settings', icon:'⚙️', perm:'manage_settings'},

      {section:'More'},
      {id:'sales', label:'Sales', icon:'🛒', perm:'view_operations'},
      {id:'inventory', label:'Inventory', icon:'📦', perm:'manage_inventory'},
      {id:'deposits', label:'Deposits', icon:'🏦', perm:'view_month_end'},
      {id:'notes', label:'Notes', icon:'📝', perm:'view_month_end'},
      {id:'sms', label:'SMS', icon:'✉️', perm:'send_sms'},
      {id:'mystats', label:'My Stats', icon:'📈', perm:'view_my_stats'},
      {id:'import', label:'Import', icon:'⬇️', perm:'manage_settings', adminOnly:true}
    ];
    NAV_ITEMS.splice(0, NAV_ITEMS.length, ...items);
    try{ buildSidebar(); }catch(_){ }
    return true;
  }

  async function renderPayrollSettings(body){
    if(typeof supabase === 'undefined'){ body.innerHTML = '<div class="text-danger">Supabase not ready.</div>'; return; }
    const branchId = getBranchId();
    if(!branchId){ body.innerHTML = '<div class="text-danger">No branch selected.</div>'; return; }
    body.innerHTML = '<div class="text-muted">Loading…</div>';

    try{
      const today = new Date().toISOString().slice(0,10);
      const [defaultsRes, doctorsRes, contractsRes] = await Promise.all([
        supabase.from('branch_settings').select('*').eq('branch_id', branchId).maybeSingle(),
        supabase.from('profiles').select('id,name,role,branch_id').eq('branch_id', branchId),
        supabase.from('doctor_contracts').select('doctor_id, contract_pct, effective_from').eq('branch_id', branchId)
      ]);
      if(doctorsRes.error) throw doctorsRes.error;
      if(defaultsRes.error) throw defaultsRes.error;
      if(contractsRes.error) throw contractsRes.error;

      const defaults = defaultsRes.data || {};
      const docs = (doctorsRes.data || []).filter(p => p && (!p.role || p.role === 'doctor' || p.role === 'specialist'));

      const overrideByDoctor = new Map();
      (contractsRes.data || []).forEach(c => {
        const eff = c && c.effective_from ? String(c.effective_from).slice(0,10) : '0000-00-00';
        if(eff <= today) overrideByDoctor.set(String(c.doctor_id), c.contract_pct);
      });

      const rows = docs.map(d => {
        const id = String(d.id);
        const pct = overrideByDoctor.has(id) ? overrideByDoctor.get(id) : '';
        const name = escapeHtml(d.name || ('Doctor #' + id));
        return `<tr data-doctor-id="${escapeHtml(id)}"><td>${name}</td><td><input type="number" step="0.01" class="form-control form-control-sm" value="${pct}" placeholder="default" /></td><td class="text-end"><button class="btn btn-sm btn-primary" type="button" data-role="doctor-save">Save</button> <button class="btn btn-sm btn-link text-danger" type="button" data-role="doctor-clear">Clear</button></td></tr>`;
      }).join('');

      body.innerHTML = `
        <div class="row g-3">
          <div class="col-md-4">
            <label class="form-label">Default doctor profit %</label>
            <div class="input-group input-group-sm">
              <input type="number" step="0.01" class="form-control" data-name="default_doctor_profit_pct" value="${defaults.default_doctor_profit_pct ?? ''}" placeholder="e.g. 50" />
              <span class="input-group-text">%</span>
            </div>
          </div>
          <div class="col-md-4 d-flex align-items-end">
            <button class="btn btn-sm btn-primary" type="button" data-role="save-defaults">Save defaults</button>
          </div>
        </div>

        <hr />

        <div class="d-flex justify-content-between align-items-center mb-2">
          <h6 class="mb-0">Doctor overrides</h6>
          <button class="btn btn-sm btn-outline-secondary" type="button" data-role="reset-all">Reset all overrides</button>
        </div>

        <table class="table table-sm table-striped mb-0">
          <thead><tr><th>Doctor</th><th style="width:160px">Override %</th><th style="width:160px"></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;

      // Event delegation (wired once per render)
      if(!body.dataset.wired){
        body.dataset.wired = '1';
        body.addEventListener('click', async (evt)=>{
          const t = evt.target;
          if(t.matches('[data-role="save-defaults"]')){
            const input = body.querySelector('[data-name="default_doctor_profit_pct"]');
            const val = input ? input.value.trim() : '';
            const pct = val === '' ? null : parseFloat(val);
            if(val !== '' && Number.isNaN(pct)){ alert('Enter a number'); return; }
            try{
              await supabase.from('branch_settings').upsert({branch_id: branchId, default_doctor_profit_pct: pct}, { onConflict:'branch_id' });
              await renderPayrollSettings(body);
            }catch(e){ alert('Failed to save defaults'); }
          }
          if(t.matches('[data-role="doctor-save"]')){
            const tr = t.closest('tr[data-doctor-id]');
            const doctorId = tr.getAttribute('data-doctor-id');
            const input = tr.querySelector('input');
            const val = input ? input.value.trim() : '';
            if(val === ''){
              if(!confirm('Clear override and use default?')) return;
              await supabase.from('doctor_contracts').delete().eq('branch_id', branchId).eq('doctor_id', doctorId);
              await renderPayrollSettings(body);
              return;
            }
            const pct = parseFloat(val);
            if(Number.isNaN(pct)){ alert('Enter a number'); return; }
            try{
              const effective_from = new Date().toISOString().slice(0,10);
              await supabase.from('doctor_contracts').upsert({branch_id: branchId, doctor_id: doctorId, procedure_id: null, contract_pct: pct, effective_from, deleted:false});
              await renderPayrollSettings(body);
            }catch(e){ alert('Failed to save override'); }
          }
          if(t.matches('[data-role="doctor-clear"]')){
            const tr = t.closest('tr[data-doctor-id]');
            const doctorId = tr.getAttribute('data-doctor-id');
            if(!confirm('Clear override and use default?')) return;
            await supabase.from('doctor_contracts').delete().eq('branch_id', branchId).eq('doctor_id', doctorId);
            await renderPayrollSettings(body);
          }
          if(t.matches('[data-role="reset-all"]')){
            if(!confirm('Reset ALL doctor overrides to default?')) return;
            await supabase.from('doctor_contracts').delete().eq('branch_id', branchId);
            await renderPayrollSettings(body);
          }
        });
      }
    }catch(e){
      body.innerHTML = '<div class="text-danger">Failed to load payroll settings</div>';
    }
  }

  async function buildPayrollSettingsPanel(){
    if(typeof hasPerm === 'function' && !hasPerm('manage_settings')) return;
    const p = document.getElementById('pageContent');
    if(!p) return;
    const existing = document.getElementById('payrollSettingsPanel');
    if(existing) existing.remove();
    const panel = document.createElement('div');
    panel.id = 'payrollSettingsPanel';
    panel.innerHTML = '<div class="card my-3"><div class="card-header d-flex justify-content-between align-items-center"><div><h5 class="mb-1">Clinic Admin / Payroll rules</h5><div class="text-muted small">Profit-based doctor percentages</div></div><button class="btn btn-sm btn-outline-secondary" type="button" data-role="refresh">Refresh</button></div><div class="card-body" data-role="body"><div class="text-muted">Loading…</div></div></div>';
    p.appendChild(panel);
    const body = panel.querySelector('[data-role="body"]');
    panel.querySelector('[data-role="refresh"]').addEventListener('click', async ()=>{
      body.innerHTML = '<div class="text-muted">Refreshing…</div>';
      await renderPayrollSettings(body);
    });
    await renderPayrollSettings(body);
  }

  function patchSettings(){
    if(typeof renderSettingsPage !== 'function') return false;
    if(renderSettingsPage.__patchedClinicPayroll) return true;
    const original = renderSettingsPage;
    renderSettingsPage = async function(){
      await original.apply(this, arguments);
      await buildPayrollSettingsPanel();
    };
    renderSettingsPage.__patchedClinicPayroll = true;
    return true;
  }

  let doneNav=false, doneSettings=false;
  const poll = setInterval(()=>{
    try{ doneNav = patchNavigation() || doneNav; }catch(_){ }
    try{ doneSettings = patchSettings() || doneSettings; }catch(_){ }
    if(doneNav && doneSettings) clearInterval(poll);
  }, 500);
})();
