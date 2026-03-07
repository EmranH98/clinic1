(function(){
  const ui = window.uiRebuild;
  if (!ui) return;
  ui.registerRoute('settings', async () => {
    // Render via legacy first
    await ui.waitFor(() => typeof window.__legacyGotoSaved === 'function');
    window.__legacyGotoSaved('settings');
  });

  // add panel after legacy settings renders
  async function attachPanel() {
    const branchId = await ui.resolveBranchId();
    const me = window.me || window._me || {};
    const pageContent = document.querySelector('#pageContent');

    if (!pageContent) return;

    // Only show for admins/managers or if they can manage settings
    const canManageSettings = ui.safeHasPerm ? ui.safeHasPerm('manage_settings') : true;
    if (!canManageSettings) return;

    // avoid duplicates
    const existing = pageContent.querySelector('#uic-payroll-card');
    if (existing) existing.remove();

    const card = document.createElement('div');
    card.id = 'uic-payroll-card';
    card.className = 'uic-card';

    card.innerHTML = `
      <div class="uic-card-head">
        <div>
          <h3 class="uic-card-title">Clinic Admin / Payroll rules</h3>
          <div class="uic-card-subtitle">Profit-based doctor payout (default + overrides).</div>
        </div>
        <button id="uic-refresh-payroll" class="uic-btn uic-btn-soft">Refresh</button>
      </div>

      <div class="uic-card-body" id="uic-payroll-body">
        <div class="uic-body-row">Loading payroll settings…</div>
      </div>
    `;

    pageContent.appendChild(card);

    const body = card.querySelector('#uic-payroll-body');
    const refreshBtn = card.querySelector('#uic-refresh-payroll');

    refreshBtn.onclick = () => loadSettings(body, branchId);
    loadSettings(body, branchId);

    function doctorLabel(p) {
      return p?.name || p?.name_ar || p?.phone || p?.id || 'Unknown';
    }

    async function loadSettings(bodyEl, branchIdMaybe) {
      bodyEl.innerHTML = `<div class="uic-body-row">Loading payroll settings…</div>`;

      if (!branchIdMaybe) {
        bodyEl.innerHTML = `<div class="uic-body-row uic-text-danger">Missing branch info. Set the branch for this account first.</div>`;
        return;
      }

      const supabase = window.supabase;
      if (!supabase) {
        bodyEl.innerHTML = `<div class="uic-body-row uic-text-danger">Supabase client missing.</div>`;
        return;
      }

      const { data: settings } = await supabase
        .from('branch_settings')
        .select('branch_id, default_doctor_profit_pct, default_specialist_profit_pct')
        .eq('branch_id', branchIdMaybe)
        .maybeSingle();

      const defaultDoctor = settings?.default_doctor_profit_pct ?? '';

      await ui.waitFor(() => Array.isArray(window._profiles) && window._profiles.length);
      const profiles = (window._profiles || []).filter(p => !p?.role?.includes('customer'));

      const { data: overrides } = await supabase
        .from('doctor_contracts')
        .select('id, branch_id, doctor_id, contract_pct, effective_from')
        .eq('branch_id', branchIdMaybe);

      const overrideMap = new Map();
      (overrides || []).forEach(o => overrideMap.set(o.doctor_id, o));

      bodyEl.innerHTML = `
        <div class="uic-body-row uic-grid">
          <div>
            <label class="uic-label">Default doctor profit %</label>
            <input id="uic-default-doctor" class="uic-input" type="number" min="0" max="100" step="0.1" value="${defaultDoctor}">
            <div class="uic-help">This is the default payout percent for everyone (profit-based). Individual overrides below.</div>
          </div>
          <div class="uic-actions">
            <button id="uic-save-default" class="uic-btn">Save default</button>
          </div>
        </div>

        <div class="uic-body-row">
          <div class="uic-table-head">
            <strong>Doctor overrides</strong>
            <button id="uic-reset-overrides" class="uic-btn uic-btn-danger uic-btn-small">Reset all overrides</button>
          </div>

          <table class="uic-table" id="uic-override-table">
            <thead>
              <tr>
                <th>Doctor</th>
                <th>%</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${profiles.map(p => {
                const o = overrideMap.get(p.id);
                return `
                  <tr data-doc="${p.id}">
                    <td>${doctorLabel(p)}</td>
                    <td><input type="number" class="uic-input uic-input-sm" min="0" max="100" step="0.1" value="${o?.contract_pct ?? ''}"></n                    <td class="uic-table-actions">
                      <button class="uic-btn uic-btn-soft uic-btn-small" data-action="save">Save</button>
                      <button class="uic-btn uic-btn-danger uic-btn-small" data-action="clear">Clear</button>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;

      // Wire up actions
      bodyEl.querySelector('#uic-save-default').onclick = async () => {
        const pct = parseFloat(bodyEl.querySelector('#uic-default-doctor').value);
        const ok = Number.isFinite(pct);
        if (!ok) {
          alert('Enter a valid percent');
          return;
        }

        const { error } = await supabase
          .from('branch_settings')
          .upsert({ branch_id: branchIdMaybe, default_doctor_profit_pct: pct }, { onConflict: ['branch_id'] });

        if (error) alert('Save failed: ' + (error.message || 'unknown'));
        else alert('Saved');
      };

      bodyEl.querySelector('#uic-reset-overrides').onclick = async () => {
        if (!confirm('Reset all doctor overrides?')) return;
        const { error } = await supabase
          .from('doctor_contracts')
          .delete()
          .eq('branch_id', branchIdMaybe);
        if (error) alert('Reset failed: ' + (error.message || 'unknown'));
        else loadSettings(bodyEl, branchIdMaybe);
      };

      bodyEl.querySelector('#uic-override-table').onclick = async (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const row = btn.closest('tr');
        const doctorId = row.getAttribute('data-doc');
        const pctInput = row.querySelector('input');
        const pct = parseFloat(pctInput.value);

        if (btn.dataset.action === 'clear') {
          if (!confirm('Clear override?')) return;
          const { error } = await supabase
            .from('doctor_contracts')
            .delete()
            .eq('branch_id', branchIdMaybe)
            .eq('doctor_id', doctorId);
          if (error) alert('Clear failed: ' + (error.message || 'unknown'));
          else loadSettings(bodyEl, branchIdMaybe);
          return;
        }

        if (!Number.isFinite(pct)) {
          alert('Enter a valid percent');
          return;
        }

        // Save override; keep it simple
        const { error } = await supabase
          .from('doctor_contracts')
          .upsert({
            branch_id: branchIdMaybe,
            doctor_id: doctorId,
            contract_pct: pct,
            effective_from: new Date().toISOString().slice(0, 10)
          }, { onConflict: ['branch_id', 'doctor_id'] });

        if (error) alert('Save failed: ' + (error.message || 'unknown'));
        else alert('Saved');
      };
    }
  }

  // Observe settings page content and attach when settings renders
  const observer = new MutationObserver(() => {
    const pageContent = document.querySelector('#pageContent');
    if (!pageContent) return;
    const title = pageContent.querySelector('h2')?.innerText || '';
    if (!title.toLowerCase().includes('settings')) return;

    // Attach once after a brief settling time
    setTimeout(() => attachPanel().catch(console.error), 100);
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
