// =====================================================
// ClinicOS v3 — Daily Operations & Import Module
// =====================================================

let _currentOps  = [];
let _opsDate     = new Date().toISOString().split('T')[0];
let _opsTypeTab  = 'all';   // 'all' | 'specialist' | 'doctor'
let _opItems     = [];      // items-used rows in the op modal
let _opInventory = [];      // inventory items loaded for the modal

// ─── Daily Entry Page ─────────────────────────────
async function pgDailyEntry() {
  if (!hasPerm('view_operations')) { showToast('error','Access Denied','You cannot view operations.'); return; }
  setMeta('Daily Entry', 'Operations › Daily Entry');

  const tbStyle = (active) =>
    `padding:8px 18px;border-radius:8px;font-size:13px;font-weight:600;border:2px solid;cursor:pointer;transition:.15s;` +
    (active ? 'background:var(--teal);color:#fff;border-color:var(--teal)' : 'background:#fff;color:var(--ink2);border-color:var(--border)');

  document.getElementById('pageContent').innerHTML = `
    <!-- Type Tabs -->
    <div style="display:flex;gap:8px;margin-bottom:14px">
      <button id="opsTab-all"        onclick="setOpsTab('all')"        style="${tbStyle(_opsTypeTab==='all')}">📋 All</button>
      <button id="opsTab-specialist" onclick="setOpsTab('specialist')" style="${tbStyle(_opsTypeTab==='specialist')}">💆 Specialist</button>
      <button id="opsTab-doctor"     onclick="setOpsTab('doctor')"     style="${tbStyle(_opsTypeTab==='doctor')}">👨‍⚕️ Doctor</button>
    </div>

    <!-- Filter bar -->
    <div class="flex-center gap8 mb16" style="flex-wrap:wrap">
      <div class="search-box">
        <span>🔍</span>
        <input type="text" id="opsSearch" placeholder="Search patient or file #…" oninput="filterOpsTable(this.value)">
      </div>
      <input type="date" id="opsDate" value="${_opsDate}" style="padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px"
        onchange="_opsDate=this.value;loadOps()">
      <!-- Gender filter -->
      <select id="opsGenderFilter" style="padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px" onchange="applyOpsClientFilter()">
        <option value="">All Genders</option>
        <option value="female">♀ Women</option>
        <option value="male">♂ Men</option>
      </select>
      <!-- Staff filter (manager sees all) -->
      ${isManager() ? `
      <select id="opsStaffFilter" style="padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px" onchange="loadOps()">
        <option value="">All Staff</option>
        <optgroup label="Doctors">
          ${getDoctors().map(d=>`<option value="${esc(d.id)}" data-role="doctor">${esc(d.name)}</option>`).join('')}
        </optgroup>
        <optgroup label="Specialists">
          ${getSpecialists().map(s=>`<option value="${esc(s.id)}" data-role="specialist">${esc(s.name)}</option>`).join('')}
        </optgroup>
      </select>` : ''}
      <span class="ml-auto"></span>
      ${hasPerm('edit_operations') ? `<button class="btn btn-primary btn-sm" onclick="openAddOpModal()">+ Add Entry</button>` : ''}
    </div>

    <!-- Daily Summary Bar -->
    <div id="dailySummary" class="alert alert-info mb16" style="display:none"></div>

    <!-- Operations Table -->
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">📋 Operations Log</div>
          <div class="card-sub" id="opsCountLabel">Loading…</div>
        </div>
        <div class="flex-center gap8">
          <button class="btn btn-secondary btn-sm" onclick="exportOpsToCSV()">📥 Export CSV</button>
        </div>
      </div>
      <div id="opsTableWrap">
        <div class="empty-state"><div class="spinner"></div><p>Loading operations…</p></div>
      </div>
    </div>

    <!-- Laser Counter Card -->
    <div class="card mt20">
      <div class="card-header">
        <div><div class="card-title">⚡ Laser Machine Counter</div><div class="card-sub">Record start/end counter for ${_opsDate}</div></div>
        <button class="btn btn-secondary btn-sm" onclick="loadLaserSection()">🔄 Refresh</button>
      </div>
      <div id="laserSection" class="card-body">
        <div class="empty-state"><div class="spinner"></div></div>
      </div>
    </div>
  `;

  await Promise.all([loadOps(), loadLaserSection()]);
}

async function loadOps() {
  const search     = document.getElementById('opsSearch')?.value     || '';
  const staffFilter = document.getElementById('opsStaffFilter')?.value || '';
  const date        = document.getElementById('opsDate')?.value        || _opsDate;

  // Detect if selected staff is doctor or specialist (for server-side filter)
  const allStaff  = [...getDoctors(), ...getSpecialists()];
  const staffMeta = allStaff.find(s => s.id === staffFilter);
  const specId    = staffMeta?.role === 'specialist' ? staffFilter : undefined;
  const docId     = staffMeta?.role === 'doctor'     ? staffFilter : undefined;

  const ops = await getOperations({
    date,
    search:      search     || undefined,
    specialistId: specId,
    doctorId:    docId
  });

  _currentOps = ops;
  applyOpsClientFilter();   // apply type/gender filters client-side
}

function setOpsTab(tab) {
  _opsTypeTab = tab;
  ['all','specialist','doctor'].forEach(t => {
    const btn = document.getElementById(`opsTab-${t}`);
    if (!btn) return;
    const active = t === tab;
    btn.style.background   = active ? 'var(--teal)' : '#fff';
    btn.style.color        = active ? '#fff'        : 'var(--ink2)';
    btn.style.borderColor  = active ? 'var(--teal)' : 'var(--border)';
  });
  applyOpsClientFilter();
}

// Client-side filter by service type (tab) and gender (dropdown)
function applyOpsClientFilter() {
  const genderFilter = document.getElementById('opsGenderFilter')?.value || '';

  let filtered = _currentOps;

  if (_opsTypeTab === 'specialist') {
    filtered = filtered.filter(o => o.specialist_id && !o.doctor_id);
  } else if (_opsTypeTab === 'doctor') {
    filtered = filtered.filter(o => !!o.doctor_id);
  }

  if (genderFilter) {
    filtered = filtered.filter(o => {
      const procGender = o.procedure?.gender;
      if (!procGender || procGender === 'unisex') return true; // unknown → show all
      return procGender === genderFilter;
    });
  }

  renderOpsTable(filtered);
  renderDailySummary(filtered);
}

function renderOpsTable(ops) {
  const label = document.getElementById('opsCountLabel');
  if (label) label.textContent = `${ops.length} entries`;

  const wrap = document.getElementById('opsTableWrap');
  if (!wrap) return;

  if (ops.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="ei">📋</div><p>No entries for this date. <button class="btn btn-primary btn-sm" onclick="openAddOpModal()">Add first entry</button></p></div>`;
    return;
  }

  const showMatCost = isAdmin() || isManager();
  wrap.innerHTML = `
    <div class="tbl-wrap">
      <table>
        <thead><tr>
          <th>Type</th><th>Patient</th><th>File #</th><th>Specialist</th><th>Doctor</th>
          <th>Session</th><th>Cash</th><th>Visa</th><th>CliQ</th><th>Shot</th>
          <th>Discount</th><th>Total</th>
          ${showMatCost ? '<th>Materials</th>' : ''}
          <th>Notes</th>
          ${hasPerm('edit_operations') ? '<th>Actions</th>' : ''}
        </tr></thead>
        <tbody>
          ${ops.map(o => {
            const total = (o.payment_cash||0)+(o.payment_visa||0)+(o.payment_cliq||0)+(o.payment_shot||0)-(o.discount||0);
            const isDoc = !!o.doctor_id;
            const typeBadge = isDoc
              ? `<span style="background:var(--blue-light);color:var(--blue);padding:2px 7px;border-radius:5px;font-size:11px;font-weight:600;white-space:nowrap">👨‍⚕️ Dr</span>`
              : `<span style="background:var(--teal-light);color:var(--teal);padding:2px 7px;border-radius:5px;font-size:11px;font-weight:600;white-space:nowrap">💆 Sp</span>`;
            const matCostBadge = (showMatCost && (o.material_cost||0) > 0)
              ? `<span style="color:var(--amber);font-size:11px;font-weight:600">🧴 ${(o.material_cost||0).toFixed(2)}</span>`
              : '—';
            return `<tr>
              <td>${typeBadge}</td>
              <td><strong>${esc(o.patient_name)}</strong></td>
              <td><span class="chip">#${esc(o.file_number)||'-'}</span></td>
              <td>${esc(o.specialist?.name)||'-'}</td>
              <td>${esc(o.doctor?.name)||'-'}</td>
              <td><span class="fs12">${esc(o.session_name||o.procedure?.name||'-')}</span></td>
              <td>${o.payment_cash>0?`<span class="pay-chip pay-cash">💵 ${o.payment_cash.toFixed(2)}</span>`:'—'}</td>
              <td>${o.payment_visa>0?`<span class="pay-chip pay-visa">💳 ${o.payment_visa.toFixed(2)}</span>`:'—'}</td>
              <td>${o.payment_cliq>0?`<span class="pay-chip pay-cliq">📲 ${o.payment_cliq.toFixed(2)}</span>`:'—'}</td>
              <td>${o.payment_shot>0?`<span class="pay-chip pay-shot">🎯 ${o.payment_shot.toFixed(2)}</span>`:'—'}</td>
              <td>${o.discount>0?`<span style="color:var(--red);font-size:12px">-${o.discount.toFixed(2)}</span>`:'—'}</td>
              <td style="font-weight:700;color:var(--teal)">${total.toFixed(2)} ${CURRENCY}</td>
              ${showMatCost ? `<td>${matCostBadge}</td>` : ''}
              <td class="fs12 c-ink3">${esc(o.notes||'')}</td>
              ${hasPerm('edit_operations') ? `
              <td>
                <div class="flex-center gap8">
                  <button class="btn btn-secondary btn-xs" onclick="openEditOpModal('${o.id}')">✏️</button>
                  ${hasPerm('delete_operations') ? `<button class="btn btn-danger btn-xs" onclick="confirmDeleteOp('${o.id}')">🗑</button>` : ''}
                </div>
              </td>` : ''}
            </tr>`;
          }).join('')}
        </tbody>
        <tfoot><tr>
          <td colspan="6">Total (${ops.length} entries)</td>
          <td>${ops.reduce((s,o)=>s+(o.payment_cash||0),0).toFixed(2)}</td>
          <td>${ops.reduce((s,o)=>s+(o.payment_visa||0),0).toFixed(2)}</td>
          <td>${ops.reduce((s,o)=>s+(o.payment_cliq||0),0).toFixed(2)}</td>
          <td>${ops.reduce((s,o)=>s+(o.payment_shot||0),0).toFixed(2)}</td>
          <td style="color:var(--red)">-${ops.reduce((s,o)=>s+(o.discount||0),0).toFixed(2)}</td>
          <td style="color:var(--teal);font-weight:800">${ops.reduce((s,o)=>s+(o.payment_cash||0)+(o.payment_visa||0)+(o.payment_cliq||0)+(o.payment_shot||0)-(o.discount||0),0).toFixed(2)} ${CURRENCY}</td>
          ${showMatCost ? `<td style="color:var(--amber);font-weight:700">🧴 ${ops.reduce((s,o)=>s+(o.material_cost||0),0).toFixed(2)}</td>` : ''}
          <td colspan="2"></td>
        </tr></tfoot>
      </table>
    </div>
  `;
}

function renderDailySummary(ops) {
  const el = document.getElementById('dailySummary');
  if (!el || ops.length === 0) { el.style.display='none'; return; }
  const cash  = ops.reduce((s,o)=>s+(o.payment_cash||0),0);
  const visa  = ops.reduce((s,o)=>s+(o.payment_visa||0),0);
  const cliq  = ops.reduce((s,o)=>s+(o.payment_cliq||0),0);
  const shot  = ops.reduce((s,o)=>s+(o.payment_shot||0),0);
  const disc  = ops.reduce((s,o)=>s+(o.discount||0),0);
  const total = cash+visa+cliq+shot-disc;
  el.style.display = 'flex';
  el.innerHTML = `
    <span>📊</span>
    <span style="flex:1">
      Day total: <strong>${total.toFixed(2)} ${CURRENCY}</strong>
      &nbsp;·&nbsp; <span style="color:var(--green)">💵 Cash: ${cash.toFixed(2)}</span>
      &nbsp;·&nbsp; <span style="color:var(--blue)">💳 Visa: ${visa.toFixed(2)}</span>
      &nbsp;·&nbsp; <span style="color:var(--cliq)">📲 CliQ: ${cliq.toFixed(2)}</span>
      &nbsp;·&nbsp; <span style="color:var(--amber)">🎯 Shots: ${shot.toFixed(2)}</span>
      ${disc>0?`&nbsp;·&nbsp; <span style="color:var(--red)">🏷 Discounts: -${disc.toFixed(2)}</span>`:''}
    </span>
  `;
}

function filterOpsTable(q) {
  const genderFilter = document.getElementById('opsGenderFilter')?.value || '';

  let filtered = _currentOps;
  if (q) {
    const lq = q.toLowerCase();
    filtered = filtered.filter(o =>
      o.patient_name?.toLowerCase().includes(lq) ||
      o.file_number?.toLowerCase().includes(lq)
    );
  }
  if (_opsTypeTab === 'specialist') filtered = filtered.filter(o => o.specialist_id && !o.doctor_id);
  else if (_opsTypeTab === 'doctor') filtered = filtered.filter(o => !!o.doctor_id);
  if (genderFilter) {
    filtered = filtered.filter(o => {
      const g = o.procedure?.gender;
      return !g || g === 'unisex' || g === genderFilter;
    });
  }
  renderOpsTable(filtered);
  renderDailySummary(filtered);
}

// ─── Add/Edit Operation Modal ─────────────────────
// Tracks service type and gender state for the modal
let _opServiceType = 'specialist';
let _opGender      = 'female';

async function openAddOpModal() {
  if (!hasPerm('edit_operations')) { showToast('error','Access Denied','You cannot add operations.'); return; }
  _opServiceType = 'specialist';
  _opGender      = 'female';
  _opItems       = [];
  _opInventory   = await getInventory();
  openModal('Add Operation Entry', buildOpForm(null), [
    { label: 'Cancel',    cls: 'btn-secondary', action: 'closeModal()' },
    { label: 'Save Entry', cls: 'btn-primary',   action: 'saveOpFromModal(null)' }
  ], 'modal-lg');
}

async function openEditOpModal(id) {
  if (!hasPerm('edit_operations')) return;
  const op = _currentOps.find(o => o.id === id);
  if (!op) return;

  // Determine service type from operation
  const proc = _procedures.find(p => p.id === op.procedure_id);
  _opServiceType = op.doctor_id && !op.specialist_id ? 'doctor' : 'specialist';
  _opGender      = proc?.gender === 'male' ? 'male' : 'female';

  // Load existing items consumed for this op
  const existingItems = await getOperationItems(id);
  _opItems     = existingItems.map(i => ({
    inventoryId: i.inventory_id,
    qty:         i.qty,
    unitPrice:   i.unit_price
  }));
  _opInventory = await getInventory();

  openModal('Edit Operation', buildOpForm(op), [
    { label: 'Cancel', cls: 'btn-secondary', action: 'closeModal()' },
    { label: 'Update',  cls: 'btn-primary',   action: `saveOpFromModal('${id}')` }
  ], 'modal-lg');
}

function buildOpForm(op) {
  const doctors     = getDoctors();
  const specialists = getSpecialists();
  const isSpec      = _opServiceType === 'specialist';
  const showCommission = (isAdmin() || isManager()) && isSpec;

  // Filter procedures based on current service type and gender
  const filteredProcs = _procedures.filter(p => {
    const typeOk   = !p.service_type || p.service_type === _opServiceType || p.service_type === 'both';
    const genderOk = isSpec ? (!p.gender || p.gender === _opGender || p.gender === 'unisex') : true;
    return typeOk && genderOk;
  });

  // Pre-select existing procedure
  const existingProcId = op?.procedure_id || '';

  const btnStyle = (active) =>
    `padding:10px 16px;border-radius:8px;font-size:13px;border:2px solid;cursor:pointer;transition:.15s;` +
    (active ? 'background:var(--teal);color:#fff;border-color:var(--teal)' : 'background:#fff;color:var(--ink2);border-color:var(--border)');

  return `
    <!-- Service type toggle -->
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <button type="button" id="opType-specialist" onclick="setOpServiceType('specialist')" style="${btnStyle(isSpec)}">
        💆 Specialist Service
      </button>
      <button type="button" id="opType-doctor" onclick="setOpServiceType('doctor')" style="${btnStyle(!isSpec)}">
        👨‍⚕️ Doctor Service
      </button>
    </div>

    <!-- Gender toggle (specialist only) -->
    <div id="f-gender-row" style="display:${isSpec?'flex':'none'};gap:8px;margin-bottom:12px">
      <button type="button" id="opGender-female" onclick="setOpGender('female')" style="${btnStyle(_opGender==='female')}">
        ♀ Women
      </button>
      <button type="button" id="opGender-male" onclick="setOpGender('male')" style="${btnStyle(_opGender==='male')}">
        ♂ Men
      </button>
    </div>

    <div class="g2">
      <div class="field"><label>Patient Name (اسم العميل) *</label>
        <input type="text" id="f-pat" value="${op?.patient_name||''}" placeholder="Full name" required></div>
      <div class="field"><label>File Number (رقم الملف)</label>
        <input type="text" id="f-file" value="${op?.file_number||''}" placeholder="e.g. 4061"></div>
    </div>
    <div class="g2">
      <div class="field"><label>Date *</label>
        <input type="date" id="f-date" value="${op?.date||_opsDate}"></div>
      <div class="field"><label>Session Name (اسم الجلسة)</label>
        <input type="text" id="f-sess" value="${op?.session_name||''}" placeholder="e.g. فل بدي, بكيني" dir="auto"></div>
    </div>

    <!-- Specialist row (hidden for doctor ops) -->
    <div id="f-spec-row" style="display:${isSpec?'block':'none'}">
      <div class="field"><label>Specialist (الاخصائية)</label>
        <select id="f-spec">
          <option value="">— Select specialist —</option>
          ${specialists.map(s=>`<option value="${s.id}" ${op?.specialist_id===s.id?'selected':''}>${s.name}</option>`).join('')}
        </select>
      </div>
    </div>

    <!-- Doctor row (always shown but required only for doctor ops) -->
    <div id="f-doc-row" style="display:${!isSpec?'block':'none'}">
      <div class="field"><label>Doctor (الدكتور)</label>
        <select id="f-doc">
          <option value="">— Select doctor —</option>
          ${doctors.map(d=>`<option value="${d.id}" ${op?.doctor_id===d.id?'selected':''}>${d.name}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="g2">
      <div class="field"><label>Service / Procedure</label>
        <select id="f-proc" onchange="onProcChange(this.value)">
          <option value="">— Select service —</option>
          ${filteredProcs.map(p=>`<option value="${p.id}" ${existingProcId===p.id?'selected':''}>${p.name}${p.name_ar?' / '+p.name_ar:''}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Pricing (التسعيرة)</label>
        <input type="text" id="f-pricing" value="${op?.pricing||''}" placeholder="مدفوع or amount" dir="auto"></div>
    </div>

    <!-- Commission override (admin/manager only, specialist ops only) -->
    ${showCommission ? `
    <div id="f-commission-row" class="alert" style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:8px;padding:10px 14px;margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <span style="font-size:13px;color:var(--ink2)">🔒 <strong>Specialist Commission</strong> (admin only)</span>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:12px;color:var(--ink3)">Default from procedure:</span>
          <input type="number" id="f-comm-default" style="width:80px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:#f9f9f9" readonly
            value="${op?.specialist_commission_override ?? ''}">
          <span style="font-size:12px;color:var(--ink3)">Override:</span>
          <input type="number" id="f-comm-override" style="width:90px;padding:4px 8px;border:1.5px solid var(--teal);border-radius:6px;font-size:13px;font-weight:600"
            placeholder="Leave blank = default" min="0" step="0.01"
            value="${op?.specialist_commission_override != null ? op.specialist_commission_override : ''}">
          <span style="font-size:12px;color:var(--ink3)">${CURRENCY}</span>
        </div>
      </div>
    </div>` : ''}

    <!-- Payment row -->
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px">
      <div class="field"><label>💵 Cash</label>
        <input type="number" id="f-cash" value="${op?.payment_cash||0}" min="0" step="0.01" class="num-input" style="width:100%" oninput="calcTotal()"></div>
      <div class="field"><label>💳 Visa</label>
        <input type="number" id="f-visa" value="${op?.payment_visa||0}" min="0" step="0.01" class="num-input" style="width:100%" oninput="calcTotal()"></div>
      <div class="field"><label>📲 CliQ</label>
        <input type="number" id="f-cliq" value="${op?.payment_cliq||0}" min="0" step="0.01" class="num-input" style="width:100%" oninput="calcTotal()"></div>
      <div class="field"><label>🎯 Shot</label>
        <input type="number" id="f-shot" value="${op?.payment_shot||0}" min="0" step="0.01" class="num-input" style="width:100%" oninput="calcTotal()"></div>
      <div class="field"><label>🏷 Discount</label>
        <input type="number" id="f-disc" value="${op?.discount||0}" min="0" step="0.01" class="num-input" style="width:100%" oninput="calcTotal()"></div>
    </div>
    <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-bottom:8px">
      <span style="font-size:13px;color:var(--ink3)">Total:</span>
      <span id="f-total-disp" style="font-size:20px;font-weight:700;color:var(--teal);font-family:'Playfair Display',serif">
        ${op ? ((op.payment_cash||0)+(op.payment_visa||0)+(op.payment_cliq||0)+(op.payment_shot||0)-(op.discount||0)).toFixed(2)+' '+CURRENCY : '0.00 '+CURRENCY}
      </span>
    </div>
    <!-- Items / Products Used -->
    <div style="border:1.5px solid var(--border);border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-weight:600;font-size:13px;color:var(--ink2)">🧴 Items / Products Used <span style="font-weight:400;color:var(--ink3);font-size:12px">(deducted from inventory)</span></div>
        <button type="button" onclick="addOpItem()" style="padding:4px 12px;border-radius:6px;border:1.5px solid var(--teal);background:var(--teal-light);color:var(--teal);font-size:12px;font-weight:600;cursor:pointer">+ Add Item</button>
      </div>
      <div id="f-op-items">
        ${_opItems.length === 0
          ? `<div id="f-op-items-empty" style="color:var(--ink3);font-size:12px;padding:6px 0">No items added. Click "+ Add Item" to track products used.</div>`
          : _opItems.map((item, idx) => buildOpItemRow(idx, item)).join('')}
      </div>
      <div style="margin-top:8px;text-align:right;font-size:13px;color:var(--ink3)">
        Materials Cost: <strong id="f-items-total" style="color:var(--amber)">${_opItems.reduce((s,i)=>s+parseFloat(i.qty||0)*parseFloat(i.unitPrice||0),0).toFixed(2)} ${CURRENCY}</strong>
      </div>
    </div>

    <div class="field"><label>Notes (ملاحظات)</label>
      <textarea id="f-notes" rows="2" dir="auto" placeholder="Any additional notes…">${op?.notes||''}</textarea></div>
  `;
}

function buildOpItemRow(idx, item = {}) {
  const opts = _opInventory.map(inv =>
    `<option value="${esc(inv.id)}" data-cost="${inv.cost||0}" ${item.inventoryId===inv.id?'selected':''}>${esc(inv.name)} (${esc(inv.unit||'pcs')})</option>`
  ).join('');
  return `
    <div id="op-item-row-${idx}" style="display:grid;grid-template-columns:1fr 80px 90px auto;gap:8px;align-items:center;margin-bottom:8px">
      <select onchange="onOpItemSelect(${idx},this.value,this)" style="padding:6px 8px;border:1.5px solid var(--border);border-radius:7px;font-size:13px">
        <option value="">— Select product —</option>
        ${opts}
      </select>
      <input type="number" id="op-item-qty-${idx}" value="${item.qty||1}" min="0.001" step="0.001" placeholder="Qty"
        style="padding:6px 8px;border:1.5px solid var(--border);border-radius:7px;font-size:13px;text-align:right"
        oninput="calcItemsTotal()">
      <input type="number" id="op-item-price-${idx}" value="${item.unitPrice||0}" min="0" step="0.01" placeholder="Unit cost"
        style="padding:6px 8px;border:1.5px solid var(--teal-mid);border-radius:7px;font-size:13px;text-align:right"
        oninput="calcItemsTotal()">
      <button type="button" onclick="removeOpItem(${idx})" style="padding:4px 10px;border-radius:6px;border:1.5px solid var(--border);background:#fff;color:var(--red);cursor:pointer;font-size:13px">🗑</button>
    </div>
  `;
}

// ─── Modal dynamic controls ───────────────────────
function setOpServiceType(type) {
  _opServiceType = type;
  const isSpec = type === 'specialist';

  // Update button styles
  const specBtn = document.getElementById('opType-specialist');
  const docBtn  = document.getElementById('opType-doctor');
  const active  = 'background:var(--teal);color:#fff;border-color:var(--teal)';
  const inactive = 'background:#fff;color:var(--ink2);border-color:var(--border)';
  if (specBtn) { specBtn.style.cssText = specBtn.style.cssText.replace(/background:[^;]+;color:[^;]+;border-color:[^;]+/, isSpec ? active : inactive); }
  if (docBtn)  { docBtn.style.cssText  = docBtn.style.cssText.replace(/background:[^;]+;color:[^;]+;border-color:[^;]+/,  !isSpec ? active : inactive); }

  // Show/hide rows
  const genderRow = document.getElementById('f-gender-row');
  const specRow   = document.getElementById('f-spec-row');
  const docRow    = document.getElementById('f-doc-row');
  const commRow   = document.getElementById('f-commission-row');
  if (genderRow) genderRow.style.display = isSpec ? 'flex' : 'none';
  if (specRow)   specRow.style.display   = isSpec ? 'block' : 'none';
  if (docRow)    docRow.style.display    = !isSpec ? 'block' : 'none';
  if (commRow)   commRow.style.display   = isSpec && (isAdmin()||isManager()) ? '' : 'none';

  // Re-filter procedure dropdown
  updateOpProcDropdown();
}

function setOpGender(gender) {
  _opGender = gender;
  ['female','male'].forEach(g => {
    const btn = document.getElementById(`opGender-${g}`);
    if (!btn) return;
    const isActive = g === gender;
    btn.style.background  = isActive ? 'var(--teal)' : '#fff';
    btn.style.color       = isActive ? '#fff'        : 'var(--ink2)';
    btn.style.borderColor = isActive ? 'var(--teal)' : 'var(--border)';
  });
  updateOpProcDropdown();
}

function updateOpProcDropdown() {
  const sel = document.getElementById('f-proc');
  if (!sel) return;

  const filtered = _procedures.filter(p => {
    const typeOk   = !p.service_type || p.service_type === _opServiceType || p.service_type === 'both';
    const genderOk = _opServiceType !== 'specialist' || !p.gender || p.gender === _opGender || p.gender === 'unisex';
    return typeOk && genderOk;
  });

  sel.innerHTML = '<option value="">— Select service —</option>' +
    filtered.map(p => `<option value="${p.id}">${p.name}${p.name_ar ? ' / ' + p.name_ar : ''}</option>`).join('');

  // Reset commission default display
  const commDefault = document.getElementById('f-comm-default');
  if (commDefault) commDefault.value = '';
}

function onProcChange(procId) {
  // Update commission default display when procedure changes
  const proc = _procedures.find(p => p.id === procId);
  const commDefault = document.getElementById('f-comm-default');
  if (commDefault && proc) {
    commDefault.value = proc.specialist_commission || 0;
  }
}

// ─── Op Items (inventory consumed) ───────────────
function addOpItem() {
  // Remove the empty placeholder if present
  const emptyEl = document.getElementById('f-op-items-empty');
  if (emptyEl) emptyEl.remove();

  const idx = _opItems.length;
  _opItems.push({ inventoryId: '', qty: 1, unitPrice: 0 });
  const container = document.getElementById('f-op-items');
  if (container) {
    container.insertAdjacentHTML('beforeend', buildOpItemRow(idx, _opItems[idx]));
  }
}

function removeOpItem(idx) {
  _opItems.splice(idx, 1);
  // Re-render the items container
  const container = document.getElementById('f-op-items');
  if (!container) return;
  if (_opItems.length === 0) {
    container.innerHTML = `<div id="f-op-items-empty" style="color:var(--ink3);font-size:12px;padding:6px 0">No items added. Click "+ Add Item" to track products used.</div>`;
  } else {
    container.innerHTML = _opItems.map((item, i) => buildOpItemRow(i, item)).join('');
  }
  calcItemsTotal();
}

function onOpItemSelect(idx, invId, selectEl) {
  // Auto-fill the unit price from inventory.cost
  const inv = _opInventory.find(i => i.id === invId);
  if (inv) {
    const priceEl = document.getElementById(`op-item-price-${idx}`);
    if (priceEl) priceEl.value = inv.cost || 0;
    _opItems[idx].inventoryId = invId;
    _opItems[idx].unitPrice   = inv.cost || 0;
  }
  calcItemsTotal();
}

function calcItemsTotal() {
  let total = 0;
  _opItems.forEach((_, idx) => {
    const qty   = parseFloat(document.getElementById(`op-item-qty-${idx}`)?.value   || 0);
    const price = parseFloat(document.getElementById(`op-item-price-${idx}`)?.value || 0);
    total += qty * price;
  });
  const el = document.getElementById('f-items-total');
  if (el) el.textContent = `${total.toFixed(2)} ${CURRENCY}`;
}

function collectOpItems() {
  return _opItems.map((item, idx) => {
    const inventoryId = document.querySelector(`#op-item-row-${idx} select`)?.value || item.inventoryId;
    const qty         = parseFloat(document.getElementById(`op-item-qty-${idx}`)?.value   || item.qty   || 0);
    const unitPrice   = parseFloat(document.getElementById(`op-item-price-${idx}`)?.value || item.unitPrice || 0);
    return { inventoryId, qty, unitPrice };
  }).filter(i => i.inventoryId && i.qty > 0);
}

function calcTotal() {
  const c = parseFloat(document.getElementById('f-cash')?.value||0);
  const v = parseFloat(document.getElementById('f-visa')?.value||0);
  const q = parseFloat(document.getElementById('f-cliq')?.value||0);
  const s = parseFloat(document.getElementById('f-shot')?.value||0);
  const d = parseFloat(document.getElementById('f-disc')?.value||0);
  const el = document.getElementById('f-total-disp');
  if (el) el.textContent = (c+v+q+s-d).toFixed(2) + ' ' + CURRENCY;
}

async function saveOpFromModal(id) {
  const patientName = document.getElementById('f-pat').value.trim();
  if (!patientName) { showToast('error','Required','Patient name is required.'); return; }

  const isSpec  = _opServiceType === 'specialist';
  const commOverrideVal = document.getElementById('f-comm-override')?.value.trim();

  // Get specialist/doctor IDs based on service type
  let specialistId = null;
  let doctorId     = null;

  if (isSpec) {
    specialistId = document.getElementById('f-spec')?.value || null;
    if (!specialistId && me.role === 'specialist') specialistId = me.id;
  } else {
    doctorId = document.getElementById('f-doc')?.value || null;
  }

  const op = {
    id:                 id || undefined,
    date:               document.getElementById('f-date').value,
    patientName,
    fileNumber:         document.getElementById('f-file').value.trim(),
    specialistId,
    doctorId,
    procedureId:        document.getElementById('f-proc').value || null,
    sessionName:        document.getElementById('f-sess').value.trim() || null,
    pricing:            document.getElementById('f-pricing').value.trim() || null,
    cash:               parseFloat(document.getElementById('f-cash').value  || 0),
    visa:               parseFloat(document.getElementById('f-visa').value  || 0),
    cliq:               parseFloat(document.getElementById('f-cliq').value  || 0),
    shot:               parseFloat(document.getElementById('f-shot').value  || 0),
    discount:           parseFloat(document.getElementById('f-disc').value  || 0),
    notes:              document.getElementById('f-notes').value.trim() || null,
    commissionOverride: commOverrideVal !== '' && commOverrideVal !== undefined ? commOverrideVal : null
  };

  try {
    const savedOp = await saveOperation(op);
    // Save items consumed (deducts from inventory + stores material_cost)
    const items = collectOpItems();
    await saveOperationItems(savedOp.id, items, me.branch_id);
    closeModal();
    showToast('success', id ? 'Updated' : 'Saved', `Entry for ${esc(patientName)} saved.`);
    loadOps();
  } catch(e) { showToast('error','Save Failed', e.message); }
}

async function confirmDeleteOp(id) {
  if (!hasPerm('delete_operations')) return;
  if (!confirm('Delete this operation record? This cannot be undone.')) return;
  try {
    await deleteOperation(id);
    showToast('success','Deleted','Operation removed.');
    loadOps();
  } catch(e) { showToast('error','Error',e.message); }
}

// ─── Laser Counter Section ────────────────────────
async function loadLaserSection() {
  const entries = await getLaserEntries({ date: _opsDate });
  const specialists = getSpecialists();
  const section = document.getElementById('laserSection');
  if (!section) return;

  section.innerHTML = `
    <div class="g2">
      ${specialists.map(spec => {
        const entry = entries.find(e => e.specialist_id === spec.id);
        return `
          <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:16px">
            <div style="font-weight:700;font-size:13px;margin-bottom:12px">⚡ ${spec.name}</div>
            <div class="g2">
              <div class="field" style="margin:0">
                <label>Start Count</label>
                <input type="number" id="lz-start-${spec.id}" value="${entry?.start_count||''}" placeholder="e.g. 12450" class="num-input" style="width:100%">
              </div>
              <div class="field" style="margin:0">
                <label>End Count</label>
                <input type="number" id="lz-end-${spec.id}" value="${entry?.end_count||''}" placeholder="e.g. 12580" class="num-input" style="width:100%"
                  oninput="updateLaserDiff('${spec.id}')">
              </div>
            </div>
            <div style="margin-top:8px;font-size:12px;color:var(--ink3)" id="lz-diff-${spec.id}">
              ${entry?.shots_used !== undefined ? `Shots used: <strong>${entry.shots_used}</strong>` : 'Enter counts above'}
            </div>
            <button class="btn btn-secondary btn-sm" style="margin-top:10px;width:100%" onclick="saveLaserEntry('${spec.id}')">
              ${entry ? '🔄 Update' : '💾 Save'}
            </button>
          </div>
        `;
      }).join('')}
    </div>
    ${specialists.length === 0 ? '<div class="empty-state" style="padding:16px"><p>No specialists found for this branch.</p></div>' : ''}
  `;
}

function updateLaserDiff(specId) {
  const start = parseInt(document.getElementById(`lz-start-${specId}`)?.value || 0);
  const end   = parseInt(document.getElementById(`lz-end-${specId}`)?.value   || 0);
  const diff  = end - start;
  const el    = document.getElementById(`lz-diff-${specId}`);
  if (el) el.innerHTML = `Shots used: <strong style="color:${diff>=0?'var(--teal)':'var(--red)'}">${diff}</strong>`;
}

async function saveLaserEntry(specId) {
  const startVal = document.getElementById(`lz-start-${specId}`)?.value;
  const endVal   = document.getElementById(`lz-end-${specId}`)?.value;
  if (!startVal || !endVal) { showToast('error','Required','Enter both start and end counts.'); return; }
  try {
    await saveLaserEntry({ date: _opsDate, specialistId: specId, startCount: startVal, endCount: endVal });
    showToast('success','Laser Saved','Counter recorded for today.');
    loadLaserSection();
  } catch(e) { showToast('error','Error',e.message); }
}

// ─── Export ops to CSV ────────────────────────────
function exportOpsToCSV() {
  const headers = ['Date','Patient','File #','Specialist','Doctor','Session','Pricing','Cash','Visa','CliQ','Shot','Discount','Total','Notes'];
  const rows = _currentOps.map(o => [
    o.date, o.patient_name, o.file_number||'', o.specialist?.name||'', o.doctor?.name||'',
    o.session_name||'', o.pricing||'',
    o.payment_cash, o.payment_visa, o.payment_cliq, o.payment_shot, o.discount,
    ((o.payment_cash||0)+(o.payment_visa||0)+(o.payment_cliq||0)+(o.payment_shot||0)-(o.discount||0)).toFixed(2),
    o.notes||''
  ]);
  const csv  = [headers, ...rows].map(r => r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `operations-${_opsDate}.csv`; a.click();
  showToast('success','Exported',`${_currentOps.length} entries exported.`);
}

// ─── Bulk Import Page ─────────────────────────────
async function pgImport() {
  if (!isAdmin() && !isManager()) { showToast('error','Access Denied','Only admins and managers can import data.'); return; }
  setMeta('Import Data', 'Admin › Import Data');

  document.getElementById('pageContent').innerHTML = `
    <div class="card">
      <div class="card-header">
        <div><div class="card-title">📤 Bulk Data Import</div>
          <div class="card-sub">Upload CSV or Excel files to add multiple records at once. Preview before confirming.</div>
        </div>
      </div>
      <div class="card-body">
        <div class="field" style="max-width:320px">
          <label>Import Type</label>
          <select id="importType" onchange="updateImportTemplate()">
            <option value="operations">Daily Operations</option>
            <option value="procedures">Services / Procedures</option>
            <option value="inventory">Inventory Items</option>
            <option value="customers">Customer List</option>
            <option value="staff">Staff / Employees</option>
          </select>
        </div>

        <div id="importTemplateInfo" class="alert alert-info mb16">
          <span>📄</span>
          <span id="importCols">Loading column info…</span>
        </div>

        <div class="drop-zone" id="importDropZone" onclick="document.getElementById('importFileInput').click()"
          ondragover="event.preventDefault();this.classList.add('over')"
          ondragleave="this.classList.remove('over')"
          ondrop="handleImportDrop(event)">
          <div class="dz-icon">📁</div>
          <h3>Drop CSV or Excel file here</h3>
          <p>or click to browse · Supports .csv and .xlsx</p>
        </div>
        <input type="file" id="importFileInput" accept=".csv,.xlsx,.xls" style="display:none" onchange="handleImportFile(this.files[0])">

        <div style="margin-top:12px;display:flex;gap:10px">
          <button class="btn btn-secondary btn-sm" onclick="downloadImportTemplate()">📥 Download Template CSV</button>
        </div>

        <div id="importPreview" style="margin-top:24px;display:none">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <div><strong id="previewCount">0 rows ready</strong> <span class="c-ink3" id="previewErrors"></span></div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-secondary btn-sm" onclick="cancelImport()">✕ Cancel</button>
              <button class="btn btn-primary btn-sm" onclick="confirmImport()">✅ Confirm Import</button>
            </div>
          </div>
          <div class="tbl-wrap" id="previewTable"></div>
        </div>
      </div>
    </div>
  `;
  updateImportTemplate();
}

const IMPORT_TEMPLATES = {
  operations: {
    cols: ['date (YYYY-MM-DD)','specialist_name','doctor_name','patient_name','file_number','session_name','pricing','cash','visa','cliq','shot','discount','notes'],
    required: ['date','patient_name']
  },
  procedures: {
    cols: ['name','name_ar','price','doctor_profit_pct (default 50)','specialist_commission'],
    required: ['name']
  },
  inventory: {
    cols: ['name','category','qty','min_qty','unit','cost'],
    required: ['name']
  },
  customers: {
    cols: ['name','phone','file_number'],
    required: ['name','phone']
  },
  staff: {
    cols: ['name','email','role (admin/branch_manager/doctor/specialist/employee/receptionist)','salary','commission_rate','phone'],
    required: ['name','email','role']
  }
};

let _importRows = [];
let _importType = 'operations';

function updateImportTemplate() {
  _importType = document.getElementById('importType').value;
  const tpl = IMPORT_TEMPLATES[_importType];
  document.getElementById('importCols').innerHTML =
    `Required columns: <strong>${tpl.required.join(', ')}</strong> · All columns: ${tpl.cols.join(' | ')}`;
  _importRows = [];
  document.getElementById('importPreview').style.display = 'none';
}

function downloadImportTemplate() {
  const tpl = IMPORT_TEMPLATES[_importType];
  const csv = tpl.cols.join(',') + '\n' + tpl.cols.map(()=>'').join(',');
  const blob = new Blob([csv],{type:'text/csv'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `template-${_importType}.csv`; a.click();
}

function handleImportDrop(e) {
  e.preventDefault();
  document.getElementById('importDropZone').classList.remove('over');
  const file = e.dataTransfer.files[0];
  if (file) handleImportFile(file);
}

async function handleImportFile(file) {
  if (!file) return;
  showToast('info','Parsing…',`Reading ${file.name}`);

  let rows = [];
  if (file.name.endsWith('.csv')) {
    const text = await file.text();
    rows = parseCSV(text);
  } else {
    // XLSX — use SheetJS CDN
    const ab = await file.arrayBuffer();
    const wb = XLSX.read(ab);
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  }

  if (rows.length === 0) { showToast('error','Empty','No data rows found in file.'); return; }

  // Map and validate rows
  const { valid, invalid } = validateImportRows(rows, _importType);
  _importRows = valid;

  // Show preview
  document.getElementById('importPreview').style.display = 'block';
  document.getElementById('previewCount').textContent = `${valid.length} rows ready`;
  document.getElementById('previewErrors').textContent = invalid.length > 0 ? ` · ${invalid.length} rows skipped (missing required fields)` : '';

  const keys = Object.keys(valid[0] || {});
  document.getElementById('previewTable').innerHTML = `
    <table>
      <thead><tr>${keys.map(k=>`<th>${k}</th>`).join('')}</tr></thead>
      <tbody>
        ${valid.slice(0,20).map(r=>`<tr>${keys.map(k=>`<td>${r[k]||''}</td>`).join('')}</tr>`).join('')}
        ${valid.length > 20 ? `<tr><td colspan="${keys.length}" style="text-align:center;color:var(--ink3);padding:12px">… and ${valid.length-20} more rows</td></tr>` : ''}
      </tbody>
    </table>
  `;
}

function parseCSV(text) {
  const lines  = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g,''));
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g,''));
    return Object.fromEntries(headers.map((h,i) => [h, vals[i]||'']));
  });
}

function validateImportRows(rows, type) {
  const required = IMPORT_TEMPLATES[type].required;
  const valid = [], invalid = [];
  rows.forEach(r => {
    const missing = required.filter(f => !r[f] && !r[f.split(' ')[0]]);
    if (missing.length > 0) { invalid.push({ ...r, _errors: missing.join(', ') }); }
    else valid.push(r);
  });
  return { valid, invalid };
}

async function confirmImport() {
  if (_importRows.length === 0) return;
  const btn = event.target;
  btn.textContent = 'Importing…'; btn.disabled = true;

  let success = 0, failed = 0, errorLog = [];

  try {
    if (_importType === 'operations') {
      // Map names to IDs
      const rows = _importRows.map(r => ({
        date:          r.date || r['date (YYYY-MM-DD)'],
        patient_name:  r.patient_name,
        file_number:   r.file_number || '',
        session_name:  r.session_name || '',
        pricing:       r.pricing || '',
        cash:          parseFloat(r.cash||0), visa: parseFloat(r.visa||0),
        cliq:          parseFloat(r.cliq||0), shot: parseFloat(r.shot||0),
        discount:      parseFloat(r.discount||0),
        notes:         r.notes || '',
        specialist_id: _profiles.find(p=>p.name===r.specialist_name)?.id || null,
        doctor_id:     _profiles.find(p=>p.name===r.doctor_name)?.id     || null,
        procedure_id:  _procedures.find(p=>p.name===r.procedure_name||p.name_ar===r.procedure_name)?.id || null
      }));
      await bulkInsertOperations(rows);
      success = rows.length;
    } else if (_importType === 'inventory') {
      for (const r of _importRows) {
        try { await saveInventoryItem({ name:r.name, category:r.category, qty:r.qty, minQty:r.min_qty, unit:r.unit, cost:r.cost }); success++; }
        catch(e) { failed++; errorLog.push({ row:r, error:e.message }); }
      }
    } else if (_importType === 'procedures') {
      for (const r of _importRows) {
        try { await saveProcedure({ name:r.name, nameAr:r.name_ar, price:r.price, doctorPct:r['doctor_profit_pct (default 50)']||r.doctor_profit_pct||50, specCommission:r.specialist_commission||0 }); success++; }
        catch(e) { failed++; errorLog.push({ row:r, error:e.message }); }
      }
    } else if (_importType === 'customers') {
      for (const r of _importRows) {
        try {
          await supabase.from('customers').upsert({ name:r.name, phone:r.phone, file_number:r.file_number||null, branch_id:me.branch_id }, { onConflict:'phone,branch_id' });
          success++;
        } catch(e) { failed++; errorLog.push({ row:r, error:e.message }); }
      }
    }

    await logImport(_importType, '', _importRows.length, success, failed, errorLog);

    showToast('success','Import Complete',`${success} records imported. ${failed>0?failed+' failed.':''}`);
    document.getElementById('importPreview').style.display = 'none';
    _importRows = [];
  } catch(e) {
    showToast('error','Import Failed', e.message);
  } finally {
    btn.textContent = '✅ Confirm Import'; btn.disabled = false;
  }
}

function cancelImport() {
  _importRows = [];
  document.getElementById('importPreview').style.display = 'none';
  document.getElementById('importFileInput').value = '';
}
