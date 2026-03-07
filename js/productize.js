(function(){
  // ---- ClinicOS NEXT (live on main) ----
  // Lightweight modernization without nuking legacy code.

  // 1) Navigation reset
  // Keep legacy NAV_ITEMS-based sidebar builder, but swap the data.
  if (Array.isArray(window.NAV_ITEMS)) {
    window.NAV_ITEMS.splice(0, window.NAV_ITEMS.length,
      { id:'dashboard', label:'Dashboard', icon:'🏥' },

      { section:'Front Desk' },
      { id:'patients', label:'Patients', icon:'🧑‍⚕️', perm:'view_customers' },
      { id:'appointments', label:'Appointments', icon:'📅', perm:'view_appointments' },
      { id:'daily', label:'Daily Operations', icon:'🧾', perm:'view_operations' },

      { section:'Management' },
      { id:'payroll', label:'Payroll', icon:'💸', perm:'view_payroll' },
      { id:'monthend', label:'Reports', icon:'📊', perm:'view_month_end' },
      { id:'staff', label:'Staff', icon:'👥', perm:'manage_staff' },

      { section:'Settings' },
      { id:'settings', label:'Settings', icon:'⚙️', perm:'manage_settings' },

      { section:'More' },
      { id:'inventory', label:'Inventory', icon:'📦', perm:'manage_inventory' },
      { id:'sales', label:'Sales', icon:'🧾', perm:'view_operations' },
      { id:'deposits', label:'Deposits', icon:'🏦', perm:'view_month_end' },
      { id:'notes', label:'Notes', icon:'📝', perm:'view_month_end' },
      { id:'sms', label:'SMS', icon:'✉️', perm:'send_sms' },
      { id:'mystats', label:'My Stats', icon:'📈' },
      { id:'import', label:'Import', icon:'⬆️', adminOnly:true }
    );
    try { if (typeof buildSidebar === 'function') buildSidebar(); } catch (e) {}
  }

  // 2) UI helpers
  function safe(v){
    const s = v == null ? '' : String(v);
    return s
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  function setMetaSafe(title, subtitle){
    try { if (typeof setMeta === 'function') return setMeta(title, subtitle); } catch (e) {}
    const tEl = document.querySelector('#pageTitle');
    const sEl = document.querySelector('#pageSubtitle');
    if (tEl) tEl.textContent = title || '';
    if (sEl) sEl.textContent = subtitle || '';
  }

  function toast(msg, kind='info'){
    const box = document.createElement('div');
    box.textContent = msg;
    box.style.position='fixed';
    box.style.right='16px';
    box.style.bottom='16px';
    box.style.zIndex='9999';
    box.style.padding='10px 12px';
    box.style.borderRadius='8px';
    box.style.background = kind==='success' ? '#198754' : kind==='error' ? '#dc3545' : '#0d6efd';
    box.style.color='#fff';
    box.style.boxShadow='0 8px 30px rgba(0,0,0,0.18)';
    document.body.appendChild(box);
    setTimeout(()=> box.remove(), 3000);
  }

  function pageContent(){
    const el = document.querySelector('#pageContent');
    if (!el) throw new Error('Missing #pageContent');
    return el;
  }

  async function ensureMe(){
    if (window.me && window.me.branch_id) return window.me;
    if (typeof window.getMe==='function') {
      const m = await window.getMe();
      if (m && m.branch_id) { window.me=m; return m; }
    }
    throw new Error('Missing user/branch context');
  }

  // 3) New module: Patients
  const Patients = {
    async list(){
      setMetaSafe('Patients', 'Front Desk');
      const root = pageContent();
      root.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h3 style="margin:0;">Patients</h3>
          <div style="color:#6c757d; font-size:13px;">Pulling latest…</div>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:12px;">
          <input id="patientSearch" type="text" placeholder="Search by name or phone" style="min-width:280px; max-width:420px;">
          <button id="patientRefresh" class="btn btn-sm btn-outline-secondary">Refresh</button>
        </div>
        <div id="patientTableWrap" style="min-height:120px;">Loading…</div>`;

      let me; try { me = await ensureMe(); } catch (e) {
        toast('Not signed in properly', 'error');
        document.querySelector('#patientTableWrap').textContent='Cannot load patients.';
        return;
      }

      const wrap = document.querySelector('#patientTableWrap');
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('branch_id', me.branch_id)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) {
        wrap.innerHTML = `<div class="text-danger">Failed to load patients. (Schema mismatch or connectivity)</div>`;
        toast('Failed to load patients', 'error');
        return;
      }

      let rows = Array.isArray(data) ? data : [];
      const build = (q='') => {
        const query = q.trim().toLowerCase();
        const filtered = !query ? rows : rows.filter(r => {
          const name = (r.name||r.full_name||'').toString().toLowerCase();
          const phone = (r.phone||r.mobile||'').toString().toLowerCase();
          return name.includes(query) || phone.includes(query);
        });

        const htmlRows = filtered.slice(0, 150).map(r => {
          const name = r.name || r.full_name || 'Unknown';
          const phone = r.phone || r.mobile || '-';
          const created = (r.created_at || '').toString().split('T')[0];
          return `
            <tr data-id="${safe(r.id)}" style="border-bottom:1px solid #eee;">
              <td style="padding:8px 10px;">${safe(name)}</td>
              <td style="padding:8px 10px; color:#495057;">${safe(phone)}</td>
              <td style="padding:8px 10px; color:#6c757d; font-size:12px;">${safe(created)}</td>
              <td style="padding:8px 10px; text-align:right;">
                <button class="btn btn-sm btn-primary" data-act="open">Open</button>
              </td>
            </tr>`;
        }).join('') || `<tr><td colspan="4" style="padding:10px; color:#6c757d;">No patients found.</td></tr>`;

        wrap.innerHTML = `
          <div style="overflow:auto;">
            <table style="width:100%; border-collapse:collapse;">
              <thead>
                <tr style="background:#f8f9fa;">
                  <th style="text-align:left; padding:8px 10px;">Name</th>
                  <th style="text-align:left; padding:8px 10px;">Phone</th>
                  <th style="text-align:left; padding:8px 10px;">Created</th>
                  <th style="text-align:right; padding:8px 10px;">Action</th>
                </tr>
              </thead>
              <tbody>${htmlRows}</tbody>
            </table>
          </div>`;

        wrap.querySelector('tbody').addEventListener('click', (ev) => {
          const btn = ev.target.closest('button');
          if (!btn) return;
          const tr = btn.closest('tr');
          const id = tr && tr.getAttribute('data-id');
          if (!id) return;
          goto(`patient/${id}`);
        }, { once:true });
      };

      build('');

      document.querySelector('#patientSearch').addEventListener('input', (ev) => build(ev.target.value));
      document.querySelector('#patientRefresh').addEventListener('click', () => Patients.list());
    },

    async profile(id){
      setMetaSafe('Patient Profile', id ? `ID: ${id}` : '');
      const root = pageContent();
      root.innerHTML = `<div style="padding:16px;">Loading patient…</div>`;

      let me; try { me = await ensureMe(); } catch (e) {
        root.innerHTML = `<div class="text-danger" style="padding:16px;">Not signed in.</div>`;
        return;
      }

      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('id', id)
        .eq('branch_id', me.branch_id)
        .maybeSingle();

      if (error) {
        root.innerHTML = `<div class="text-danger" style="padding:16px;">Failed to load patient.</div>`;
        toast('Failed to load patient', 'error');
        return;
      }

      const p = data || {};
      const name = p.name || p.full_name || `Patient ${id}`;

      root.innerHTML = `
        <div style="display:flex; gap:12px; align-items:center; justify-content:space-between; margin-bottom:12px;">
          <div>
            <div style="font-size:18px; font-weight:700;">${safe(name)}</div>
            <div style="color:#6c757d; font-size:13px;">ID: ${safe(id)}</div>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-sm btn-secondary" id="patientBack">← Back</button>
            <button class="btn btn-sm btn-primary" id="patientRefresh">Refresh</button>
          </div>
        </div>

        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:12px;">
          <div style="border:1px solid #dee2e6; border-radius:8px; padding:12px;">
            <div style="font-weight:700; margin-bottom:8px;">Contact</div>
            <div style="color:#495057;">Phone: ${safe(p.phone||p.mobile||'-')}</div>
            <div style="color:#495057;">Email: ${safe(p.email||'-')}</div>
            <div style="color:#495057;">Created: ${safe((p.created_at||'').toString().split('T')[0])}</div>
          </div>

          <div style="border:1px solid #dee2e6; border-radius:8px; padding:12px;">
            <div style="font-weight:700; margin-bottom:8px;">Clinic</div>
            <div style="color:#495057;">Branch: ${safe(me.branch_id)}</div>
            <div style="color:#495057;">Status: <span style="color:#198754; font-weight:700;">Active</span></div>
          </div>
        </div>

        <div style="margin-top:16px;">
          <div style="font-weight:700; margin-bottom:8px;">Appointments (recent)</div>
          <div id="patientAppts">Loading…</div>
        </div>`;

      document.querySelector('#patientBack').addEventListener('click', () => goto('patients'));
      document.querySelector('#patientRefresh').addEventListener('click', () => Patients.profile(id));

      const apWrap = document.querySelector('#patientAppts');
      try {
        const { data: appts, error: apErr } = await supabase
          .from('appointments')
          .select('*')
          .eq('customer_id', id)
          .eq('branch_id', me.branch_id)
          .order('date', { ascending:false })
          .limit(25);
        if (apErr) throw apErr;
        const rows = (appts||[]).map(a => {
          const date = (a.date||a.created_at||'').toString().slice(0,10);
          const status = (a.status||a.state||'').toString() || '—';
          const proc = (a.procedure_name||a.procedure||'').toString() || '—';
          return `<tr style="border-bottom:1px solid #eee;"><td style="padding:8px 10px;">${safe(date)}</td><td style="padding:8px 10px;">${safe(proc)}</td><td style="padding:8px 10px; color:#6c757d;">${safe(status)}</td></tr>`;
        }).join('') || `<tr><td colspan="3" style="padding:10px; color:#6c757d;">No appointments found.</td></tr>`;
        apWrap.innerHTML = `
          <div style="overflow:auto;">
            <table style="width:100%; border-collapse:collapse;">
              <thead>
                <tr style="background:#f8f9fa;">
                  <th style="text-align:left; padding:8px 10px;">Date</th>
                  <th style="text-align:left; padding:8px 10px;">Procedure</th>
                  <th style="text-align:left; padding:8px 10px;">Status</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`;
      } catch (e) {
        apWrap.innerHTML = `<div class="text-muted" style="padding:8px 0; color:#6c757d;">Appointments table not enabled (schema mismatch).</div>`;
      }
    }
  };

  // 4) Stable payroll settings patch (Settings page)
  // Uses legacy renderSettingsPage; wraps it.
  function patchSettingsCard(){
    if (window.__payrollSettingsPatched) return;
    window.__payrollSettingsPatched = true;
    const orig = window.renderSettingsPage;
    if (typeof orig !== 'function') return;
    window.renderSettingsPage = async function(){
      await orig();
      try { await addPayrollCard(); } catch (e) {}
    };
  }

  async function addPayrollCard(){
    const page = document.querySelector('#pageContent');
    if (!page) return;
    const existing = page.querySelector('[data-payroll-card]');
    if (existing) existing.remove();

    const card = document.createElement('div');
    card.setAttribute('data-payroll-card','1');
    card.style.marginTop='16px';
    card.style.border='1px solid #dee2e6';
    card.style.borderRadius='8px';
    card.style.overflow='hidden';
    card.innerHTML = `
      <div style="padding:12px 16px; font-weight:700; background:#f8f9fa;">Clinic Admin / Payroll rules</div>
      <div style="padding:16px;">
        <div id="payrollCardStatus" style="margin-bottom:12px; color:#6c757d; font-size:14px;">Loading…</div>
        <div>
          <div style="font-weight:600; margin:8px 0;">Default doctor profit % (everyone)</div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <input id="payrollDefaultPct" type="number" min="0" max="100" step="0.1" style="width:120px;" placeholder="%">
            <button id="payrollDefaultSave" class="btn btn-primary">Save default</button>
          </div>
          <div style="margin-top:8px; font-size:13px; color:#6c757d;">Default applies unless an override is saved for a doctor below.</div>
        </div>
        <hr>
        <div>
          <div style="font-weight:600; margin:8px 0;">Doctor overrides</div>
          <div id="payrollDocTable" style="min-height:60px;">Loading…</div>
        </div>
      </div>`;

    page.appendChild(card);

    const status = document.querySelector('#payrollCardStatus');
    if (!window.supabase) { status.textContent='Supabase not ready'; status.style.color='#dc3545'; return; }

    let me; try { me = await ensureMe(); } catch (e) { status.textContent='Cannot load (not signed in)'; status.style.color='#dc3545'; return; }

    async function loadData(){
      const { data: bsData } = await supabase
        .from('branch_settings')
        .select('default_doctor_profit_pct')
        .eq('branch_id', me.branch_id)
        .order('created_at',{ascending:false})
        .limit(1);
      const defaultPct = bsData && bsData[0] ? bsData[0].default_doctor_profit_pct : '';

      const { data: contracts } = await supabase
        .from('doctor_contracts')
        .select('doctor_id,contract_pct')
        .eq('branch_id', me.branch_id);

      const input = document.querySelector('#payrollDefaultPct');
      input.value = defaultPct ?? '';

      const map = new Map();
      (contracts||[]).forEach(c => map.set(String(c.doctor_id), c.contract_pct));

      const doctors = Array.isArray(window._profiles) ? window._profiles.filter(p => String(p.branch_id) === String(me.branch_id)) : [];

      const rows = [];
      doctors.forEach(p => {
        const pid = String(p.id);
        const pct = map.has(pid) ? map.get(pid) : '';
        const label = safe(p.name || p.full_name || p.email || pid);
        rows.push(`<tr data-doc="${safe(pid)}" style="border-bottom:1px solid #eee;">
          <td style="padding:6px 8px;">${label}</td>
          <td style="padding:6px 8px;"><input type="number" min="0" max="100" step="0.1" value="${pct ?? ''}" style="width:100px;"></td>
          <td style="padding:6px 8px;">
            <button class="btn btn-sm btn-primary" data-act="save">Save</button>
            <button class="btn btn-sm btn-outline-danger" data-act="clear">Clear</button>
          </td>
        </tr>`);
      });

      const docWrap = document.querySelector('#payrollDocTable');
      docWrap.innerHTML = rows.length ? `
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="background:#f8f9fa;">
              <th style="text-align:left; padding:6px 8px;">Doctor</th>
              <th style="text-align:left; padding:6px 8px;">Profit %</th>
              <th style="text-align:left; padding:6px 8px;">Action</th>
            </tr>
          </thead>
          <tbody>${rows.join('')}</tbody>
        </table>` : `<div style="color:#6c757d;">No doctors found in staff list.</div>`;

      document.querySelector('#payrollDefaultSave').onclick = async () => {
        const v = parseFloat(input.value);
        if (!Number.isFinite(v)) { toast('Enter a number', 'error'); return; }
        status.textContent='Saving default…'; status.style.color='#6c757d';
        const { error } = await supabase
          .from('branch_settings')
          .upsert({ branch_id: me.branch_id, default_doctor_profit_pct: v }, { onConflict: 'branch_id' });
        if (error) { status.textContent='Failed to save default'; status.style.color='#dc3545'; toast('Save failed','error'); return; }
        status.textContent='Default saved'; status.style.color='#198754'; toast('Default saved','success');
      };

      docWrap.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('button');
        if (!btn) return;
        const act = btn.getAttribute('data-act');
        const tr = btn.closest('tr');
        const docId = tr.getAttribute('data-doc');
        const pctInput = tr.querySelector('input');

        if (act === 'save') {
          const v = parseFloat(pctInput.value);
          if (!Number.isFinite(v)) { toast('Enter a number', 'error'); return; }
          status.textContent='Saving…'; status.style.color='#6c757d';
          const { error } = await supabase
            .from('doctor_contracts')
            .upsert({ branch_id: me.branch_id, doctor_id: docId, contract_pct: v }, { onConflict: 'branch_id,doctor_id' });
          if (error) { status.textContent='Failed to save override'; status.style.color='#dc3545'; toast('Save failed','error'); return; }
          status.textContent='Override saved'; status.style.color='#198754'; toast('Override saved','success');
        }

        if (act === 'clear') {
          if (!confirm('Clear override for this doctor?')) return;
          status.textContent='Clearing…'; status.style.color='#6c757d';
          const { error } = await supabase
            .from('doctor_contracts')
            .delete()
            .eq('branch_id', me.branch_id)
            .eq('doctor_id', docId);
          if (error) { status.textContent='Failed to clear override'; status.style.color='#dc3545'; toast('Clear failed','error'); return; }
          pctInput.value='';
          status.textContent='Override cleared'; status.style.color='#198754'; toast('Override cleared','success');
        }
      }, { once:true });

      status.textContent='Loaded. Only admins/managers should edit payroll rules.';
    }

    await loadData();
  }

  // 5) Routing override
  if (!window.__legacyGotoSaved && typeof window.goto === 'function') {
    window.__legacyGotoSaved = window.goto;
  }

  window.goto = function(routeId){
    if (!routeId) routeId='dashboard';

    // param routes
    if (routeId.startsWith('patient/')) {
      const id = routeId.split('/')[1];
      return Patients.profile(id);
    }

    if (routeId === 'patients') return Patients.list();

    // legacy fallback
    if (typeof window.__legacyGotoSaved === 'function') {
      return window.__legacyGotoSaved(routeId);
    }
  };

  // patch settings card
  patchSettingsCard();
})();