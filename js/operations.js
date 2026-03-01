// =====================================================
// ClinicOS v3 — Daily Operations & Import Module
// =====================================================

let _currentOps = [];
let _opsDate    = new Date().toISOString().split('T')[0];

// ─── Daily Entry Page ─────────────────────────────
async function pgDailyEntry() {
  if (!hasPerm('view_operations')) { showToast('error','Access Denied','You cannot view operations.'); return; }
  setMeta('Daily Entry', 'Operations › Daily Entry');

  document.getElementById('pageContent').innerHTML = `
    <div class="flex-center gap12 mb16">
      <div class="search-box">
        <span>🔍</span>
        <input type="text" id="opsSearch" placeholder="Search patient or file #…" oninput="filterOpsTable(this.value)">
      </div>
      <input type="date" id="opsDate" value="${_opsDate}" style="padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px"
        onchange="_opsDate=this.value;loadOps()">
      ${isManager() ? `
      <select id="opsSpecFilter" style="padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px" onchange="loadOps()">
        <option value="">All Specialists</option>
        ${getSpecialists().map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}
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
  const search      = document.getElementById('opsSearch')?.value || '';
  const specFilter  = document.getElementById('opsSpecFilter')?.value || '';
  const date        = document.getElementById('opsDate')?.value || _opsDate;

  const ops = await getOperations({ date, search: search||undefined, specialistId: specFilter||undefined });
  _currentOps = ops;
  renderOpsTable(ops);
  renderDailySummary(ops);
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

  wrap.innerHTML = `
    <div class="tbl-wrap">
      <table>
        <thead><tr>
          <th>Patient</th><th>File #</th><th>Specialist</th><th>Doctor</th>
          <th>Session</th><th>Cash</th><th>Visa</th><th>CliQ</th><th>Shot</th>
          <th>Discount</th><th>Total</th><th>Notes</th>
          ${hasPerm('edit_operations') ? '<th>Actions</th>' : ''}
        </tr></thead>
        <tbody>
          ${ops.map(o => {
            const total = (o.payment_cash||0)+(o.payment_visa||0)+(o.payment_cliq||0)+(o.payment_shot||0)-(o.discount||0);
            return `<tr>
              <td><strong>${o.patient_name}</strong></td>
              <td><span class="chip">#${o.file_number||'-'}</span></td>
              <td>${o.specialist?.name||'-'}</td>
              <td>${o.doctor?.name||'-'}</td>
              <td><span class="fs12">${o.session_name||o.procedure?.name||'-'}</span></td>
              <td>${o.payment_cash>0?`<span class="pay-chip pay-cash">💵 ${o.payment_cash.toFixed(2)}</span>`:'—'}</td>
              <td>${o.payment_visa>0?`<span class="pay-chip pay-visa">💳 ${o.payment_visa.toFixed(2)}</span>`:'—'}</td>
              <td>${o.payment_cliq>0?`<span class="pay-chip pay-cliq">📲 ${o.payment_cliq.toFixed(2)}</span>`:'—'}</td>
              <td>${o.payment_shot>0?`<span class="pay-chip pay-shot">🎯 ${o.payment_shot.toFixed(2)}</span>`:'—'}</td>
              <td>${o.discount>0?`<span style="color:var(--red);font-size:12px">-${o.discount.toFixed(2)}</span>`:'—'}</td>
              <td style="font-weight:700;color:var(--teal)">${total.toFixed(2)} ${CURRENCY}</td>
              <td class="fs12 c-ink3">${o.notes||''}</td>
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
          <td colspan="5">Total (${ops.length} entries)</td>
          <td>${ops.reduce((s,o)=>s+(o.payment_cash||0),0).toFixed(2)}</td>
          <td>${ops.reduce((s,o)=>s+(o.payment_visa||0),0).toFixed(2)}</td>
          <td>${ops.reduce((s,o)=>s+(o.payment_cliq||0),0).toFixed(2)}</td>
          <td>${ops.reduce((s,o)=>s+(o.payment_shot||0),0).toFixed(2)}</td>
          <td style="color:var(--red)">-${ops.reduce((s,o)=>s+(o.discount||0),0).toFixed(2)}</td>
          <td style="color:var(--teal);font-weight:800">${ops.reduce((s,o)=>s+(o.payment_cash||0)+(o.payment_visa||0)+(o.payment_cliq||0)+(o.payment_shot||0)-(o.discount||0),0).toFixed(2)} ${CURRENCY}</td>
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
  if (!q) { renderOpsTable(_currentOps); return; }
  const filtered = _currentOps.filter(o =>
    o.patient_name?.toLowerCase().includes(q.toLowerCase()) ||
    o.file_number?.toLowerCase().includes(q.toLowerCase())
  );
  renderOpsTable(filtered);
}

// ─── Add/Edit Operation Modal ─────────────────────
function openAddOpModal() {
  if (!hasPerm('edit_operations')) { showToast('error','Access Denied','You cannot add operations.'); return; }
  openModal('Add Operation Entry', buildOpForm(null), [
    { label: 'Cancel',    cls: 'btn-secondary', action: 'closeModal()' },
    { label: 'Save Entry', cls: 'btn-primary',   action: 'saveOpFromModal(null)' }
  ], 'modal-lg');
}

function openEditOpModal(id) {
  if (!hasPerm('edit_operations')) return;
  const op = _currentOps.find(o => o.id === id);
  if (!op) return;
  openModal('Edit Operation', buildOpForm(op), [
    { label: 'Cancel', cls: 'btn-secondary', action: 'closeModal()' },
    { label: 'Update',  cls: 'btn-primary',   action: `saveOpFromModal('${id}')` }
  ], 'modal-lg');
}

function buildOpForm(op) {
  const doctors     = getDoctors();
  const specialists = getSpecialists();

  return `
    <div class="g2">
      <div class="field"><label>Patient Name (اسم العميل) *</label>
        <input type="text" id="f-pat" value="${op?.patient_name||''}" placeholder="Full name" required></div>
      <div class="field"><label>File Number (رقم الملف)</label>
        <input type="text" id="f-file" value="${op?.file_number||''}" placeholder="e.g. 4061"></div>
    </div>
    <div class="g2">
      <div class="field"><label>Date (التاريخ) *</label>
        <input type="date" id="f-date" value="${op?.date||_opsDate}"></div>
      <div class="field"><label>Session Name (اسم الجلسة)</label>
        <input type="text" id="f-sess" value="${op?.session_name||''}" placeholder="e.g. فل بدي, بكيني" dir="auto"></div>
    </div>
    <div class="g2">
      <div class="field"><label>Specialist (الاخصائية)</label>
        <select id="f-spec">
          <option value="">— Select specialist —</option>
          ${specialists.map(s=>`<option value="${s.id}" ${op?.specialist_id===s.id?'selected':''}>${s.name}</option>`).join('')}
          ${me.role==='specialist' ? '' : ''}
        </select>
      </div>
      <div class="field"><label>Doctor (الدكتور)</label>
        <select id="f-doc">
          <option value="">— Select doctor —</option>
          ${doctors.map(d=>`<option value="${d.id}" ${op?.doctor_id===d.id?'selected':''}>${d.name}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="g2">
      <div class="field"><label>Procedure / Service</label>
        <select id="f-proc">
          <option value="">— Select procedure —</option>
          ${_procedures.map(p=>`<option value="${p.id}" ${op?.procedure_id===p.id?'selected':''}>${p.name}${p.name_ar?' / '+p.name_ar:''}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Pricing (التسعيرة)</label>
        <input type="text" id="f-pricing" value="${op?.pricing||''}" placeholder="مدفوع or amount" dir="auto"></div>
    </div>
    <!-- Payment row: Cash, Visa, CliQ, Shot, Discount -->
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
      <span id="f-total-disp" style="font-size:20px;font-weight:700;color:var(--teal);font-family:'Playfair Display',serif">0.00 ${CURRENCY}</span>
    </div>
    <div class="field"><label>Notes (ملاحظات)</label>
      <textarea id="f-notes" rows="2" dir="auto" placeholder="Any additional notes…">${op?.notes||''}</textarea></div>
  `;
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

  const op = {
    id:           id || undefined,
    date:         document.getElementById('f-date').value,
    patientName,
    fileNumber:   document.getElementById('f-file').value.trim(),
    specialistId: document.getElementById('f-spec').value || null,
    doctorId:     document.getElementById('f-doc').value  || null,
    procedureId:  document.getElementById('f-proc').value || null,
    sessionName:  document.getElementById('f-sess').value.trim() || null,
    pricing:      document.getElementById('f-pricing').value.trim() || null,
    cash:         parseFloat(document.getElementById('f-cash').value || 0),
    visa:         parseFloat(document.getElementById('f-visa').value || 0),
    cliq:         parseFloat(document.getElementById('f-cliq').value || 0),
    shot:         parseFloat(document.getElementById('f-shot').value || 0),
    discount:     parseFloat(document.getElementById('f-disc').value || 0),
    notes:        document.getElementById('f-notes').value.trim() || null
  };

  // Pre-fill specialist if user is a specialist
  if (!op.specialistId && me.role === 'specialist') op.specialistId = me.id;

  try {
    await saveOperation(op);
    closeModal();
    showToast('success', id ? 'Updated' : 'Saved', `Entry for ${patientName} saved.`);
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
