(function(){
  const ui = window.uiRebuild;
  if (!ui) return;

  function setPage(title, subtitle){
    if (typeof window.setMeta === 'function') window.setMeta(title, subtitle || title);
  }

  function doctorName(id){
    if (!id || !Array.isArray(window._profiles)) return '';
    const p = window._profiles.find(x => x.id === id);
    return p?.name || '';
  }

  function procedureName(id){
    if (!id || !Array.isArray(window._procedures)) return '';
    const p = window._procedures.find(x => x.id === id);
    return p?.name || '';
  }

  ui.registerRoute('patients', async () => {
    await ui.waitFor(() => window.supabase && document.getElementById('pageContent'));
    const page = document.getElementById('pageContent');
    setPage('Patients','Clinic patients');
    page.innerHTML = `
      <div class="ui-card">
        <div class="ui-card__header">
          <div>
            <div class="ui-card__title">Patients</div>
            <div class="ui-card__subtitle">Search, view and open profiles</div>
          </div>
        </div>
        <div class="ui-card__body">
          <input id="ui-patient-search" class="ui-input" placeholder="Search by name, phone or file number" />
          <div id="ui-patient-list" class="ui-table-scroll"></div>
        </div>
      </div>`;

    const render = (rows)=>{
      const target = document.getElementById('ui-patient-list');
      if (!target) return;
      target.innerHTML = rows.length
        ? `
          <table class="ui-table">
            <thead><tr><th>Name</th><th>Phone</th><th>File #</th><th>Last visit</th></tr></thead>
            <tbody>
              ${rows.map(r=>`
                <tr class="ui-table__row" role="button" tabindex="0" onclick="window.goto('patient/${r.id}')">
                  <td>${r.name || ''}</td>
                  <td>${r.phone || ''}</td>
                  <td>${r.file_number || ''}</td>
                  <td>${r.last_visit || ''}</td>
                </tr>`).join('')}
            </tbody>
          </table>`
        : '<div class="ui-empty">No patients found.</div>';
    };

    const { data, error } = await window.supabase
      .from('customers')
      .select('*')
      .order('last_visit', { ascending: false });

    if (error) {
      render([]);
      console.error(error);
      return;
    }

    const all = Array.isArray(data) ? data : [];
    render(all);

    const search = document.getElementById('ui-patient-search');
    search?.addEventListener('input', () => {
      const q = search.value.toLowerCase();
      const filtered = all.filter(r => {
        return [r.name, r.phone, r.file_number]
          .map(x => (x || '').toLowerCase())
          .some(t => t.includes(q));
      });
      render(filtered);
    });
  });

  ui.registerRoute('patient/*', async (routeId) => {
    await ui.waitFor(() => window.supabase && document.getElementById('pageContent'));
    const id = routeId.split('/')[1];
    const page = document.getElementById('pageContent');
    setPage('Patient profile','Profile');

    const { data: pat, error } = await window.supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !pat) {
      page.innerHTML = '<div class="ui-card"><div class="ui-card__body">Patient not found.</div></div>';
      return;
    }

    page.innerHTML = `
      <div class="ui-grid">
        <div class="ui-card">
          <div class="ui-card__header">
            <div>
              <div class="ui-card__title">${pat.name || 'Patient'}</div>
              <div class="ui-card__subtitle">Phone: ${pat.phone || '—'} | File #: ${pat.file_number || '—'}</div>
            </div>
            <button class="ui-btn" onclick="window.goto('patients')">← Patients</button>
          </div>
          <div class="ui-card__body">
            <div class="ui-detail"><label>Branch</label><div>${pat.branch_id || '—'}</div></div>
            <div class="ui-detail"><label>Last visit</label><div>${pat.last_visit || '—'}</div></div>
            <div class="ui-detail"><label>Created</label><div>${pat.created_at || '—'}</div></div>
          </div>
        </div>

        <div class="ui-card ui-grid__full">
          <div class="ui-card__header">
            <div class="ui-card__title">Visit history</div>
            <div class="ui-card__subtitle">From operations (file number match)</div>
          </div>
          <div class="ui-card__body">
            <div id="ui-patient-visits" class="ui-table-scroll"></div>
          </div>
        </div>
      </div>`;

    await ui.waitFor(() => Array.isArray(window._procedures) && Array.isArray(window._profiles));

    const { data: ops } = await window.supabase
      .from('operations')
      .select('id,date,file_number,procedure_id,doctor_id,discount,material_cost')
      .eq('file_number', pat.file_number || '');

    const visits = Array.isArray(ops) ? ops : [];

    const visitsEl = document.getElementById('ui-patient-visits');
    visitsEl.innerHTML = visits.length
      ? `
        <table class="ui-table">
          <thead><tr><th>Date</th><th>Procedure</th><th>Doctor</th><th>Discount</th><th>Materials</th></tr></thead>
          <tbody>
            ${visits.map(v=>`
              <tr>
                <td>${v.date || ''}</td>
                <td>${procedureName(v.procedure_id)}</td>
                <td>${doctorName(v.doctor_id)}</td>
                <td>${v.discount ?? ''}</td>
                <td>${v.material_cost ?? ''}</td>
              </tr>`).join('')}
          </tbody>
        </table>`
      : '<div class="ui-empty">No visits recorded for this file number.</div>';
  });
})();
