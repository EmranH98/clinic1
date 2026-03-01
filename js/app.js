// =====================================================
// ClinicOS v3 — App Shell, Navigation, UI Utilities
// =====================================================

let _activePage = 'dashboard';

// ─── App Initialization (called after login) ──────
async function initApp() {
  // Update sidebar user info
  document.getElementById('sbName').textContent  = me.name;
  document.getElementById('sbRole').textContent  = ROLE_LABELS[me.role] || me.role;
  document.getElementById('sbAvatar').textContent = me.name.slice(0,2).toUpperCase();
  document.getElementById('sbAvatar').style.background = me.avatar_color || '#0d7377';
  document.getElementById('sbAvatar').style.color = '#fff';
  document.getElementById('clinicNameSb').textContent  = me.branches?.name || APP_NAME;

  // Update date display
  document.getElementById('tbDate').textContent = '📅 ' + new Date().toLocaleDateString('en', { weekday:'short', year:'numeric', month:'short', day:'numeric' });

  // Load reference data
  await loadRefData();

  // Build sidebar navigation
  buildSidebar();

  // Navigate to dashboard
  await goto('dashboard');
}

// ─── Build sidebar from NAV_ITEMS ─────────────────
function buildSidebar() {
  const nav = document.getElementById('sidebarNav');
  nav.innerHTML = '';

  NAV_ITEMS.forEach(item => {
    if (item.section) {
      const el = document.createElement('div');
      el.className = 'sb-section';
      el.textContent = item.section;
      nav.appendChild(el);
      return;
    }

    // Permission check
    if (item.perm && !hasPerm(item.perm)) return;
    if (item.adminOnly && !isAdmin()) return;

    const el = document.createElement('div');
    el.className = 'nav-item';
    el.id = `nav-${item.id}`;
    el.innerHTML = `<span class="ni">${item.icon}</span><span>${item.label}</span><span class="ni-arrow">›</span>`;
    el.onclick = () => goto(item.id);
    nav.appendChild(el);
  });
}

// ─── Navigate to a page ───────────────────────────
async function goto(pageId) {
  _activePage = pageId;

  // Update active nav
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById(`nav-${pageId}`);
  if (navEl) navEl.classList.add('active');

  // Clear page content
  document.getElementById('pageContent').innerHTML =
    `<div class="empty-state"><div class="spinner"></div><p>Loading…</p></div>`;

  // Dispatch to page renderer
  switch (pageId) {
    case 'dashboard':    await pgDashboard();    break;
    case 'daily':        await pgDailyEntry();   break;
    case 'appointments': await pgAppointments(); break;
    case 'inventory':    await pgInventory();    break;
    case 'payroll':      await pgPayroll();      break;
    case 'monthend':     await pgMonthEnd();     break;
    case 'staff':        await pgStaff();        break;
    case 'sms':          await pgSMS();          break;
    case 'import':       await pgImport();       break;
    case 'settings':     await pgSettings();     break;
    case 'mystats':      await pgMyStats();      break;
    default:
      document.getElementById('pageContent').innerHTML =
        `<div class="empty-state"><div class="ei">🔍</div><p>Page not found.</p></div>`;
  }
}

function setMeta(title, path) {
  document.getElementById('tbTitle').textContent = title;
  document.getElementById('tbPath').textContent  = path;
}

// ─── Dashboard Page ───────────────────────────────
async function pgDashboard() {
  setMeta('Dashboard', 'Home › Dashboard');
  const today = new Date().toISOString().split('T')[0];
  const now   = new Date();

  const [todayOps, pendingAppts, inventory, allOps] = await Promise.all([
    getOperations({ date: today }),
    getAppointments({ status: 'pending' }),
    getInventory(),
    getOperations({ month: now.getMonth()+1, year: now.getFullYear() })
  ]);

  const todayRevenue = todayOps.reduce((s,o) => s+(o.payment_cash||0)+(o.payment_visa||0)+(o.payment_cliq||0)+(o.payment_shot||0)-(o.discount||0), 0);
  const monthRevenue = allOps.reduce((s,o) => s+(o.payment_cash||0)+(o.payment_visa||0)+(o.payment_cliq||0)+(o.payment_shot||0)-(o.discount||0), 0);
  const lowStock     = inventory.filter(i => i.qty <= i.min_qty);

  document.getElementById('pageContent').innerHTML = `
    <!-- Stat Cards -->
    <div class="stats-row">
      <div class="sc">
        <div class="sc-top">
          <div class="sc-icon bg-teal">📊</div>
          <span class="sc-badge bg-teal">Today</span>
        </div>
        <div class="sc-label">Today's Revenue</div>
        <div class="sc-val">${todayRevenue.toFixed(0)}</div>
        <div class="sc-sub">💰 ${CURRENCY} · ${todayOps.length} sessions</div>
        <div class="sc-bar"><div class="sc-bar-fill" style="width:${Math.min(100,todayRevenue/10)}%;background:var(--teal)"></div></div>
      </div>
      <div class="sc">
        <div class="sc-top">
          <div class="sc-icon bg-blue">📅</div>
          <span class="sc-badge bg-amber">${now.toLocaleDateString('en',{month:'short'})}</span>
        </div>
        <div class="sc-label">Month Revenue</div>
        <div class="sc-val">${monthRevenue.toFixed(0)}</div>
        <div class="sc-sub">💰 ${CURRENCY} · ${allOps.length} sessions</div>
        <div class="sc-bar"><div class="sc-bar-fill" style="width:60%;background:var(--blue)"></div></div>
      </div>
      <div class="sc">
        <div class="sc-top">
          <div class="sc-icon bg-amber">⏳</div>
          ${pendingAppts.length > 0 ? `<span class="sc-badge bg-red">Action needed</span>` : `<span class="sc-badge bg-green">All clear</span>`}
        </div>
        <div class="sc-label">Pending Bookings</div>
        <div class="sc-val">${pendingAppts.length}</div>
        <div class="sc-sub">Awaiting your confirmation</div>
        <div class="sc-bar"><div class="sc-bar-fill" style="width:${Math.min(100,pendingAppts.length*20)}%;background:var(--amber)"></div></div>
      </div>
      <div class="sc">
        <div class="sc-top">
          <div class="sc-icon bg-red">📦</div>
          ${lowStock.length > 0 ? `<span class="sc-badge bg-red">${lowStock.length} items</span>` : `<span class="sc-badge bg-green">Stocked</span>`}
        </div>
        <div class="sc-label">Low Stock Alerts</div>
        <div class="sc-val">${lowStock.length}</div>
        <div class="sc-sub">${lowStock.length > 0 ? lowStock.map(i=>i.name).join(', ').slice(0,40) : 'All items above minimum'}</div>
        <div class="sc-bar"><div class="sc-bar-fill" style="width:${lowStock.length>0?'100%':'0%'};background:var(--red)"></div></div>
      </div>
    </div>

    <div class="g2">
      <!-- Pending Appointments -->
      <div class="card">
        <div class="card-header">
          <div><div class="card-title">📅 Pending Appointments</div><div class="card-sub">Awaiting your confirmation</div></div>
          <button class="btn btn-secondary btn-sm" onclick="goto('appointments')">View All</button>
        </div>
        ${pendingAppts.length === 0
          ? `<div class="card-body"><div class="empty-state" style="padding:24px"><div class="ei" style="font-size:32px">🎉</div><p>No pending bookings!</p></div></div>`
          : `<div class="tbl-wrap"><table>
              <thead><tr><th>Customer</th><th>Date</th><th>Time</th><th>Service</th><th></th></tr></thead>
              <tbody>
                ${pendingAppts.slice(0,5).map(a=>`
                  <tr>
                    <td><strong>${a.customer_name}</strong><br><span class="fs12 c-ink3">${a.customer_phone}</span></td>
                    <td>${a.date}</td>
                    <td>${formatTime12(a.time)}</td>
                    <td>${a.procedure?.name||'-'}</td>
                    <td>
                      <button class="btn btn-success btn-xs" onclick="confirmApptFromDash('${a.id}')">✓ Confirm</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table></div>`
        }
      </div>

      <!-- Today's Operations Summary -->
      <div class="card">
        <div class="card-header">
          <div><div class="card-title">📋 Today's Operations</div><div class="card-sub">${today}</div></div>
          <button class="btn btn-secondary btn-sm" onclick="goto('daily')">View All</button>
        </div>
        ${todayOps.length === 0
          ? `<div class="card-body"><div class="empty-state" style="padding:24px"><div class="ei" style="font-size:32px">📋</div><p>No operations today yet.</p></div></div>`
          : `<div class="tbl-wrap"><table>
              <thead><tr><th>Patient</th><th>Specialist</th><th>Session</th><th>Total</th></tr></thead>
              <tbody>
                ${todayOps.slice(0,5).map(o=>{
                  const t=(o.payment_cash||0)+(o.payment_visa||0)+(o.payment_cliq||0)+(o.payment_shot||0)-(o.discount||0);
                  return `<tr>
                    <td>${o.patient_name}</td>
                    <td>${o.specialist?.name||'-'}</td>
                    <td>${o.session_name||o.procedure?.name||'-'}</td>
                    <td style="font-weight:700;color:var(--teal)">${t.toFixed(2)} ${CURRENCY}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table></div>`
        }
      </div>
    </div>
  `;
}

async function confirmApptFromDash(id) {
  try {
    await confirmAppointment(id);
    showToast('success','Confirmed!','Appointment confirmed and SMS sent to customer.');
    pgDashboard();
  } catch(e) { showToast('error','Error',e.message); }
}

// ─── Appointments Page ────────────────────────────
async function pgAppointments() {
  if (!hasPerm('view_appointments')) { showToast('error','Access Denied',''); return; }
  setMeta('Appointments', 'Operations › Appointments');

  const appts = await getAppointments();

  document.getElementById('pageContent').innerHTML = `
    <div class="flex-center gap12 mb16">
      <select id="apptStatusFilter" style="padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px" onchange="filterApptsByStatus(this.value)">
        <option value="">All Statuses</option>
        <option value="pending">Pending</option>
        <option value="confirmed">Confirmed</option>
        <option value="completed">Completed</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <select id="apptDoctorFilter" style="padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px" onchange="filterApptsByDoctor(this.value)">
        <option value="">All Doctors</option>
        ${getDoctors().map(d=>`<option value="${d.id}">${d.name}</option>`).join('')}
      </select>
      <span class="ml-auto"></span>
      ${hasPerm('manage_appointments') ? `<button class="btn btn-primary btn-sm" onclick="openAddApptModal()">+ Add Booking</button>` : ''}
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title">📅 All Appointments</div>
        <div class="card-sub">${appts.length} total</div>
      </div>
      <div id="apptTableWrap"></div>
    </div>
  `;

  renderApptTable(appts);
}

let _allAppts = [];
async function filterApptsByStatus(s) {
  const appts = await getAppointments({ status: s||undefined });
  renderApptTable(appts);
}
async function filterApptsByDoctor(d) {
  const appts = await getAppointments({ doctorId: d||undefined });
  renderApptTable(appts);
}

function renderApptTable(appts) {
  const wrap = document.getElementById('apptTableWrap');
  if (!wrap) return;
  if (appts.length === 0) { wrap.innerHTML = `<div class="empty-state"><div class="ei">📅</div><p>No appointments found.</p></div>`; return; }
  wrap.innerHTML = `
    <div class="tbl-wrap"><table>
      <thead><tr><th>Customer</th><th>Phone</th><th>Doctor</th><th>Service</th><th>Date</th><th>Time</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>
        ${appts.map(a=>`
          <tr>
            <td><strong>${a.customer_name}</strong></td>
            <td>${a.customer_phone}</td>
            <td>${a.doctor?.name||'-'}</td>
            <td>${a.procedure?.name||'-'}</td>
            <td>${a.date}</td>
            <td>${formatTime12(a.time)}</td>
            <td>${apptStatusBadge(a.status)}</td>
            <td>
              <div class="flex-center gap8">
                ${a.status==='pending'&&hasPerm('manage_appointments') ? `<button class="btn btn-success btn-xs" onclick="doConfirmAppt('${a.id}')">✓ Confirm</button>` : ''}
                ${a.status!=='cancelled'&&hasPerm('manage_appointments') ? `<button class="btn btn-danger btn-xs" onclick="doCancelAppt('${a.id}')">✕</button>` : ''}
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table></div>
  `;
}

async function doConfirmAppt(id) {
  try { await confirmAppointment(id); showToast('success','Confirmed!','SMS sent to customer.'); pgAppointments(); }
  catch(e) { showToast('error','Error',e.message); }
}
async function doCancelAppt(id) {
  if (!confirm('Cancel this appointment?')) return;
  try { await cancelAppointment(id); showToast('info','Cancelled','Appointment cancelled.'); pgAppointments(); }
  catch(e) { showToast('error','Error',e.message); }
}

function apptStatusBadge(s) {
  return { pending:'<span class="badge bg-amber">⏳ Pending</span>', confirmed:'<span class="badge bg-green">✅ Confirmed</span>',
    cancelled:'<span class="badge bg-red">✕ Cancelled</span>', completed:'<span class="badge bg-teal">✓ Done</span>' }[s] || s;
}

function openAddApptModal() {
  openModal('Add Appointment', `
    <div class="g2">
      <div class="field"><label>Customer Name *</label><input type="text" id="aa-name" placeholder="Full name"></div>
      <div class="field"><label>Phone Number *</label><input type="text" id="aa-phone" placeholder="+962 7xx xxx xxx"></div>
    </div>
    <div class="g2">
      <div class="field"><label>Doctor</label>
        <select id="aa-doc"><option value="">— Select —</option>${getDoctors().map(d=>`<option value="${d.id}">${d.name}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Service</label>
        <select id="aa-proc"><option value="">— Select —</option>${_procedures.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}</select>
      </div>
    </div>
    <div class="g2">
      <div class="field"><label>Date</label><input type="date" id="aa-date" value="${new Date().toISOString().split('T')[0]}"></div>
      <div class="field"><label>Time</label>
        <select id="aa-time">${TIME_SLOTS.map(t=>`<option value="${t}">${formatTime12(t)}</option>`).join('')}</select>
      </div>
    </div>
    <div class="field"><label>Notes</label><textarea id="aa-notes" rows="2"></textarea></div>
  `, [
    { label:'Cancel', cls:'btn-secondary', action:'closeModal()' },
    { label:'Save Appointment', cls:'btn-primary', action:'saveApptFromModal()' }
  ]);
}

async function saveApptFromModal() {
  const name  = document.getElementById('aa-name').value.trim();
  const phone = document.getElementById('aa-phone').value.trim();
  if (!name||!phone) { showToast('error','Required','Customer name and phone are required.'); return; }
  try {
    await saveAppointment({
      customerName: name, customerPhone: phone,
      doctorId: document.getElementById('aa-doc').value||null,
      procedureId: document.getElementById('aa-proc').value||null,
      date: document.getElementById('aa-date').value,
      time: document.getElementById('aa-time').value,
      notes: document.getElementById('aa-notes').value.trim()||null,
      status: 'confirmed'
    });
    closeModal();
    showToast('success','Appointment Added','');
    pgAppointments();
  } catch(e) { showToast('error','Error',e.message); }
}

// ─── Inventory Page ───────────────────────────────
let _invItems     = [];
let _invSuppliers = [];
let _invSupFilter = '';

async function pgInventory() {
  setMeta('Inventory', 'Operations › Inventory');
  _invSupFilter = '';

  const [items, suppliers] = await Promise.all([getInventory(), getSuppliers()]);
  _invItems     = items;
  _invSuppliers = suppliers;

  renderInventoryPage();
}

function renderInventoryPage() {
  const items = _invItems;
  const low   = items.filter(i => i.qty <= i.min_qty);

  document.getElementById('pageContent').innerHTML = `
    ${low.length > 0 ? `<div class="alert alert-warning mb16">⚠️ <strong>${low.length} item(s) below minimum stock:</strong> ${low.map(i=>i.name).join(', ')}</div>` : ''}

    <div class="flex-center gap12 mb16">
      <div class="search-box"><span>🔍</span><input type="text" id="invSearch" placeholder="Search items…" oninput="filterInvTable(this.value)"></div>
      <select id="invSupFilter" style="padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px" onchange="filterInvBySupplier(this.value)">
        <option value="">All Suppliers</option>
        ${_invSuppliers.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}
      </select>
      <span class="ml-auto"></span>
      ${hasPerm('manage_inventory') ? `<button class="btn btn-primary btn-sm" onclick="openAddItemModal()">+ Add Item</button>` : ''}
    </div>

    <!-- Inventory table -->
    <div class="card mb16">
      <div class="card-header"><div class="card-title">📦 Inventory</div><div class="card-sub" id="invCountLabel">${items.length} items</div></div>
      <div id="invTableWrap"></div>
    </div>

    <!-- Suppliers section (admin/manager only) -->
    ${isManager() ? `
    <div class="card">
      <div class="card-header">
        <div><div class="card-title">🏭 Suppliers</div><div class="card-sub">${_invSuppliers.length} suppliers</div></div>
        <button class="btn btn-secondary btn-sm" onclick="openAddSupplierModal()">+ Add Supplier</button>
      </div>
      <div id="supplierTableWrap"></div>
    </div>` : ''}
  `;

  renderInvTable(items);
  if (isManager()) renderSupplierTable(_invSuppliers);
}

async function filterInvTable(q) {
  const items = await getInventory({ search: q, supplierId: _invSupFilter||undefined });
  _invItems = items;
  renderInvTable(items);
  const lbl = document.getElementById('invCountLabel');
  if (lbl) lbl.textContent = `${items.length} items`;
}

async function filterInvBySupplier(supId) {
  _invSupFilter = supId;
  const search = document.getElementById('invSearch')?.value || '';
  const items  = await getInventory({ search: search||undefined, supplierId: supId||undefined });
  _invItems = items;
  renderInvTable(items);
  const lbl = document.getElementById('invCountLabel');
  if (lbl) lbl.textContent = `${items.length} items`;
}

function renderInvTable(items) {
  const wrap = document.getElementById('invTableWrap');
  if (!wrap) return;
  if (items.length === 0) { wrap.innerHTML = `<div class="empty-state"><div class="ei">📦</div><p>No items found.</p></div>`; return; }
  wrap.innerHTML = `<div class="tbl-wrap"><table>
    <thead><tr>
      <th>Item</th><th>Category</th><th>Supplier</th><th>Qty</th><th>Min</th><th>Unit</th><th>Cost</th><th>Last Price</th><th>Status</th>
      ${hasPerm('manage_inventory')?'<th>Actions</th>':''}
    </tr></thead>
    <tbody>
      ${items.map(i=>`<tr>
        <td><strong>${i.name}</strong></td>
        <td>${i.category||'—'}</td>
        <td class="fs12">${i.supplier?.name||'—'}</td>
        <td style="font-weight:700">${i.qty}</td>
        <td>${i.min_qty}</td>
        <td>${i.unit||'pcs'}</td>
        <td>${i.cost?.toFixed(2)||'0.00'} ${CURRENCY}</td>
        <td class="fs12">${i.last_purchase_price ? i.last_purchase_price.toFixed(2)+' '+CURRENCY+(i.last_purchase_date ? '<br><span class="c-ink3">'+i.last_purchase_date+'</span>' : '') : '—'}</td>
        <td>${i.qty<=i.min_qty?'<span class="badge bg-red">⚠️ Low</span>':'<span class="badge bg-green">✓ OK</span>'}</td>
        ${hasPerm('manage_inventory')?`<td>
          <div class="flex-center gap8" style="flex-wrap:wrap">
            <button class="btn btn-success btn-xs" onclick="openPurchaseModal('${i.id}')">📦 Purchase</button>
            <button class="btn btn-secondary btn-xs" onclick="openUpdateStockModal('${i.id}')">± Stock</button>
            <button class="btn btn-secondary btn-xs" onclick="openPurchaseHistoryModal('${i.id}')">📋</button>
            <button class="btn btn-secondary btn-xs" onclick="openEditItemModal('${i.id}')">✏️</button>
            <button class="btn btn-danger btn-xs" onclick="doDeleteItem('${i.id}')">🗑</button>
          </div>
        </td>`:''}
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

function renderSupplierTable(suppliers) {
  const wrap = document.getElementById('supplierTableWrap');
  if (!wrap) return;
  if (suppliers.length === 0) {
    wrap.innerHTML = `<div class="empty-state" style="padding:20px"><p>No suppliers yet. Add your first supplier above.</p></div>`;
    return;
  }
  wrap.innerHTML = `<div class="tbl-wrap"><table>
    <thead><tr><th>Supplier Name</th><th>Contact</th><th>Phone</th><th>Notes</th><th>Actions</th></tr></thead>
    <tbody>
      ${suppliers.map(s=>`<tr>
        <td><strong>${s.name}</strong></td>
        <td>${s.contact_name||'—'}</td>
        <td>${s.phone||'—'}</td>
        <td class="fs12 c-ink3">${s.notes||'—'}</td>
        <td>
          <div class="flex-center gap8">
            <button class="btn btn-secondary btn-xs" onclick="openEditSupplierModal('${s.id}')">✏️</button>
            <button class="btn btn-danger btn-xs" onclick="doDeleteSupplier('${s.id}')">🗑</button>
          </div>
        </td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

// ─── Inventory Item Modals ─────────────────────────
function openAddItemModal() {
  openModal('Add Inventory Item', invForm(null), [
    { label:'Cancel', cls:'btn-secondary', action:'closeModal()' },
    { label:'Add Item', cls:'btn-primary', action:'saveItemFromModal(null)' }
  ]);
}
function openEditItemModal(id) {
  const item = _invItems.find(i=>i.id===id);
  if (!item) return;
  openModal('Edit Item', invForm(item), [
    { label:'Cancel', cls:'btn-secondary', action:'closeModal()' },
    { label:'Update', cls:'btn-primary', action:`saveItemFromModal('${id}')` }
  ]);
}
function openUpdateStockModal(id) {
  const item = _invItems.find(i=>i.id===id);
  if (!item) return;
  openModal(`Adjust Stock: ${item.name}`, `
    <div class="field"><label>Current Qty: <strong>${item.qty} ${item.unit||'pcs'}</strong></label></div>
    <div class="field"><label>Adjustment (+ to add, - to remove)</label>
      <input type="number" id="stockDelta" placeholder="e.g. +10 or -3"></div>
  `, [
    { label:'Cancel', cls:'btn-secondary', action:'closeModal()' },
    { label:'Apply', cls:'btn-primary', action:`applyStockUpdate('${id}')` }
  ], 'modal-sm');
}
async function applyStockUpdate(id) {
  const delta = parseFloat(document.getElementById('stockDelta').value||0);
  try { await updateStock(id, delta); closeModal(); showToast('success','Stock Updated',''); pgInventory(); }
  catch(e) { showToast('error','Error',e.message); }
}
function invForm(item) {
  return `
    <div class="g2">
      <div class="field"><label>Item Name *</label><input type="text" id="inv-name" value="${item?.name||''}" placeholder="e.g. Laser Gel"></div>
      <div class="field"><label>Category</label><input type="text" id="inv-cat" value="${item?.category||''}" placeholder="e.g. Consumable"></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
      <div class="field"><label>Quantity</label><input type="number" id="inv-qty" value="${item?.qty||0}" min="0" class="num-input" style="width:100%"></div>
      <div class="field"><label>Min Qty</label><input type="number" id="inv-min" value="${item?.min_qty||0}" min="0" class="num-input" style="width:100%"></div>
      <div class="field"><label>Unit</label><input type="text" id="inv-unit" value="${item?.unit||'pcs'}" placeholder="pcs"></div>
      <div class="field"><label>Cost (${CURRENCY})</label><input type="number" id="inv-cost" value="${item?.cost||0}" min="0" step="0.01" class="num-input" style="width:100%"></div>
    </div>
    <div class="field"><label>Default Supplier</label>
      <select id="inv-supplier">
        <option value="">— No supplier —</option>
        ${_invSuppliers.map(s=>`<option value="${s.id}" ${item?.supplier_id===s.id?'selected':''}>${s.name}</option>`).join('')}
      </select>
    </div>
  `;
}
async function saveItemFromModal(id) {
  const name = document.getElementById('inv-name').value.trim();
  if (!name) { showToast('error','Required','Item name is required.'); return; }
  try {
    await saveInventoryItem({
      id: id||undefined, name,
      category:   document.getElementById('inv-cat').value.trim()||null,
      qty:        document.getElementById('inv-qty').value,
      minQty:     document.getElementById('inv-min').value,
      unit:       document.getElementById('inv-unit').value.trim()||'pcs',
      cost:       document.getElementById('inv-cost').value,
      supplierId: document.getElementById('inv-supplier').value||null
    });
    closeModal(); showToast('success','Saved',''); pgInventory();
  } catch(e) { showToast('error','Error',e.message); }
}
async function doDeleteItem(id) {
  if (!confirm('Delete this inventory item?')) return;
  try { await deleteInventoryItem(id); showToast('success','Deleted',''); pgInventory(); } catch(e) { showToast('error','Error',e.message); }
}

// ─── Purchase Modal ────────────────────────────────
function openPurchaseModal(itemId) {
  const item = _invItems.find(i=>i.id===itemId);
  if (!item) return;
  openModal(`📦 Record Purchase: ${item.name}`, `
    <div class="alert alert-info mb12" style="font-size:12px">Current stock: <strong>${item.qty} ${item.unit||'pcs'}</strong>. Quantity you enter will be ADDED to current stock.</div>
    <div class="field"><label>Supplier</label>
      <select id="pur-supplier">
        <option value="">— No supplier —</option>
        ${_invSuppliers.map(s=>`<option value="${s.id}" ${item.supplier_id===s.id?'selected':''}>${s.name}</option>`).join('')}
      </select>
    </div>
    <div class="g2">
      <div class="field"><label>Quantity Purchased *</label><input type="number" id="pur-qty" placeholder="e.g. 50" min="1" step="0.01"></div>
      <div class="field"><label>Unit Price (${CURRENCY}) *</label><input type="number" id="pur-price" placeholder="e.g. 2.50" min="0" step="0.01" value="${item.last_purchase_price||''}"></div>
    </div>
    <div class="field"><label>Purchase Date</label><input type="date" id="pur-date" value="${new Date().toISOString().split('T')[0]}"></div>
    <div class="field"><label>Notes</label><input type="text" id="pur-notes" placeholder="Optional notes"></div>
  `, [
    { label:'Cancel', cls:'btn-secondary', action:'closeModal()' },
    { label:'Record Purchase', cls:'btn-primary', action:`savePurchaseFromModal('${itemId}')` }
  ], 'modal-sm');
}

async function savePurchaseFromModal(itemId) {
  const qty   = document.getElementById('pur-qty').value;
  const price = document.getElementById('pur-price').value;
  if (!qty || !price) { showToast('error','Required','Quantity and unit price are required.'); return; }
  try {
    await addPurchase({
      inventoryId:  itemId,
      supplierId:   document.getElementById('pur-supplier').value||null,
      quantity:     qty,
      unitPrice:    price,
      purchaseDate: document.getElementById('pur-date').value,
      notes:        document.getElementById('pur-notes').value.trim()||null
    });
    closeModal();
    showToast('success','Purchase Recorded',`${qty} units added to stock.`);
    pgInventory();
  } catch(e) { showToast('error','Error',e.message); }
}

// ─── Purchase History Modal ────────────────────────
async function openPurchaseHistoryModal(itemId) {
  const item    = _invItems.find(i=>i.id===itemId);
  const history = await getPurchaseHistory(itemId);
  openModal(`📋 Purchase History: ${item?.name||'Item'}`, `
    ${history.length === 0
      ? `<div class="empty-state" style="padding:24px"><p>No purchase history yet.</p></div>`
      : `<div class="tbl-wrap"><table>
          <thead><tr><th>Date</th><th>Supplier</th><th>Qty</th><th>Unit Price</th><th>Total</th><th>Notes</th></tr></thead>
          <tbody>
            ${history.map(h=>`<tr>
              <td>${h.purchase_date}</td>
              <td>${h.supplier?.name||'—'}</td>
              <td>${h.quantity}</td>
              <td>${(h.unit_price||0).toFixed(2)} ${CURRENCY}</td>
              <td style="font-weight:700">${((h.quantity||0)*(h.unit_price||0)).toFixed(2)} ${CURRENCY}</td>
              <td class="fs12 c-ink3">${h.notes||''}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>`
    }
  `, [{ label:'Close', cls:'btn-secondary', action:'closeModal()' }]);
}

// ─── Supplier Modals ───────────────────────────────
function openAddSupplierModal() {
  openModal('Add Supplier', supplierForm(null), [
    { label:'Cancel', cls:'btn-secondary', action:'closeModal()' },
    { label:'Add Supplier', cls:'btn-primary', action:'saveSupplierFromModal(null)' }
  ], 'modal-sm');
}
function openEditSupplierModal(id) {
  const s = _invSuppliers.find(sup=>sup.id===id);
  if (!s) return;
  openModal(`Edit: ${s.name}`, supplierForm(s), [
    { label:'Cancel', cls:'btn-secondary', action:'closeModal()' },
    { label:'Update', cls:'btn-primary', action:`saveSupplierFromModal('${id}')` }
  ], 'modal-sm');
}
function supplierForm(s) {
  return `
    <div class="field"><label>Supplier Name *</label><input type="text" id="sup-name" value="${s?.name||''}" placeholder="e.g. Al-Nasser Medical"></div>
    <div class="g2">
      <div class="field"><label>Contact Name</label><input type="text" id="sup-contact" value="${s?.contact_name||''}" placeholder="Person to call"></div>
      <div class="field"><label>Phone</label><input type="text" id="sup-phone" value="${s?.phone||''}" placeholder="+962 6 xxx xxxx"></div>
    </div>
    <div class="field"><label>Notes</label><input type="text" id="sup-notes" value="${s?.notes||''}" placeholder="Any notes"></div>
  `;
}
async function saveSupplierFromModal(id) {
  const name = document.getElementById('sup-name').value.trim();
  if (!name) { showToast('error','Required','Supplier name is required.'); return; }
  try {
    await saveSupplier({
      id: id||undefined, name,
      contactName: document.getElementById('sup-contact').value.trim()||null,
      phone:       document.getElementById('sup-phone').value.trim()||null,
      notes:       document.getElementById('sup-notes').value.trim()||null
    });
    closeModal(); showToast('success','Saved',''); pgInventory();
  } catch(e) { showToast('error','Error',e.message); }
}
async function doDeleteSupplier(id) {
  if (!confirm('Remove this supplier?')) return;
  try { await deleteSupplier(id); showToast('success','Removed',''); pgInventory(); } catch(e) { showToast('error','Error',e.message); }
}

// ─── Staff Management Page ────────────────────────
let _staffList = [];

async function pgStaff() {
  if (!hasPerm('manage_staff') && !isAdmin()) { showToast('error','Access Denied',''); return; }
  setMeta('Staff & Access', 'Admin › Staff');
  _staffList = await getAllProfiles();
  renderStaffPage(_staffList);
}

function renderStaffPage(staff) {
  document.getElementById('pageContent').innerHTML = `
    <div class="flex-center gap12 mb16">
      <select id="staffRoleFilter" style="padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px" onchange="filterStaffTable(this.value)">
        <option value="">All Roles</option>
        ${Object.entries(ROLE_LABELS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}
        <option value="__login">Login Users Only</option>
        <option value="__workonly">Work-Only (No Login)</option>
      </select>
      <span class="ml-auto"></span>
      ${hasPerm('manage_staff') ? `<button class="btn btn-primary btn-sm" onclick="openAddUserModal()">+ Add Staff</button>` : ''}
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">👥 Staff</div><div class="card-sub" id="staffCount">${staff.length} members</div></div>
      <div class="tbl-wrap" id="staffTableWrap">
        ${renderStaffRows(staff)}
      </div>
    </div>
  `;
}

function renderStaffRows(staff) {
  if (staff.length === 0) return `<div class="empty-state"><div class="ei">👥</div><p>No staff found.</p></div>`;
  return `<table>
    <thead><tr><th>Name</th><th>Role</th><th>Branch</th><th>Salary</th><th>Type</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>
      ${staff.map(s=>`<tr>
        <td>
          <div class="flex-center gap8">
            <div class="av av-teal" style="width:32px;height:32px;font-size:12px;background:${s.avatar_color||'#0d7377'};color:#fff;border:none">${s.name.slice(0,2).toUpperCase()}</div>
            <div>
              <div style="font-weight:600">${s.name}</div>
              <div class="fs12 c-ink3">${s.phone||''}</div>
            </div>
          </div>
        </td>
        <td><span class="badge bg-teal">${ROLE_LABELS[s.role]||s.role}</span></td>
        <td>${s.branches?.name||'-'}</td>
        <td>${s.salary>0?s.salary.toFixed(2)+' '+CURRENCY:'-'}</td>
        <td>${s.requires_login===false ? '<span class="badge bg-amber" title="Cannot log into the app">📋 Work-Only</span>' : '<span class="badge bg-blue" title="Has app login">🔑 Login</span>'}</td>
        <td>${s.active?'<span class="badge bg-green">Active</span>':'<span class="badge bg-red">Inactive</span>'}</td>
        <td>
          <div class="flex-center gap8">
            <button class="btn btn-secondary btn-xs" onclick="openEditUserModal('${s.id}')">✏️ Edit</button>
            ${s.requires_login!==false ? `<button class="btn btn-secondary btn-xs" onclick="openPermissionsModal('${s.id}')">🔑 Perms</button>` : ''}
            ${s.id!==me.id?`<button class="btn btn-${s.active?'danger':'success'} btn-xs" onclick="toggleUser('${s.id}',${!s.active})">${s.active?'Deactivate':'Activate'}</button>`:''}
          </div>
        </td>
      </tr>`).join('')}
    </tbody>
  </table>`;
}

function filterStaffTable(val) {
  let filtered = _staffList;
  if (val === '__login')    filtered = _staffList.filter(s => s.requires_login !== false);
  else if (val === '__workonly') filtered = _staffList.filter(s => s.requires_login === false);
  else if (val)             filtered = _staffList.filter(s => s.role === val);
  const wrap = document.getElementById('staffTableWrap');
  const count = document.getElementById('staffCount');
  if (wrap)  wrap.innerHTML  = renderStaffRows(filtered);
  if (count) count.textContent = `${filtered.length} members`;
}

async function toggleUser(id, active) {
  try { await toggleProfileActive(id, active); showToast('success', active?'Activated':'Deactivated',''); pgStaff(); }
  catch(e) { showToast('error','Error',e.message); }
}

function openAddUserModal() {
  openModal('Add Staff Member', staffForm(null), [
    { label:'Cancel', cls:'btn-secondary', action:'closeModal()' },
    { label:'Save', cls:'btn-primary', action:'saveUserFromModal(null)' }
  ], 'modal-lg');
}

function openEditUserModal(id) {
  const s = _staffList.find(p => p.id === id);
  if (!s) return;
  openModal(`Edit: ${s.name}`, staffForm(s), [
    { label:'Cancel', cls:'btn-secondary', action:'closeModal()' },
    { label:'Update', cls:'btn-primary', action:`saveUserFromModal('${id}')` }
  ], 'modal-lg');
}

function openPermissionsModal(id) {
  const s = _staffList.find(p=>p.id===id) || _profiles.find(p=>p.id===id);
  if (!s) return;
  const perms = s.permissions || DEFAULT_PERMISSIONS[s.role] || {};
  openModal(`Permissions: ${s.name}`, `
    <div class="flex-center gap8 mb16">
      <button class="btn btn-secondary btn-sm" onclick="applyReadOnlyPreset()">📖 Set Read Only</button>
      <button class="btn btn-secondary btn-sm" onclick="applyFullAccessPreset('${s.role}')">🔓 Reset to Role Defaults</button>
    </div>
    <div class="alert alert-info mb16">ℹ️ Toggle each permission on or off. Click "Set Read Only" to quickly grant view-only access.</div>
    <div class="perm-grid">
      ${Object.entries(PERMISSION_LABELS).map(([key,label])=>`
        <div class="perm-item">
          <label for="perm-${key}">${label}</label>
          <button id="perm-${key}" class="toggle ${perms[key]?'on':''}" onclick="this.classList.toggle('on')"></button>
        </div>
      `).join('')}
    </div>
  `, [
    { label:'Cancel', cls:'btn-secondary', action:'closeModal()' },
    { label:'Save Permissions', cls:'btn-primary', action:`savePermissions('${id}')` }
  ]);
}

function applyReadOnlyPreset() {
  // Read-only: can view operations, appointments, and own payroll — cannot edit/manage anything
  const readOnlyPerms = {
    view_operations: true, edit_operations: false, delete_operations: false,
    view_all_staff_ops: false, view_appointments: true, manage_appointments: false,
    view_payroll: true, view_own_payroll_only: true, view_month_end: false,
    manage_staff: false, send_sms: false, manage_inventory: false,
    manage_settings: false, view_all_branches: false
  };
  Object.entries(readOnlyPerms).forEach(([key, val]) => {
    const btn = document.getElementById(`perm-${key}`);
    if (btn) { btn.classList.toggle('on', val); }
  });
  showToast('info','Read Only Applied','Review and save when ready.');
}

function applyFullAccessPreset(role) {
  const defaults = DEFAULT_PERMISSIONS[role] || {};
  Object.entries(defaults).forEach(([key, val]) => {
    const btn = document.getElementById(`perm-${key}`);
    if (btn) { btn.classList.toggle('on', val); }
  });
  showToast('info','Defaults Applied','Review and save when ready.');
}

async function savePermissions(userId) {
  const perms = {};
  Object.keys(PERMISSION_LABELS).forEach(key => {
    perms[key] = document.getElementById(`perm-${key}`)?.classList.contains('on') || false;
  });
  try {
    await supabase.from('profiles').update({ permissions: perms }).eq('id', userId);
    closeModal();
    showToast('success','Permissions Saved','Changes take effect on next login.');
    pgStaff();
  } catch(e) { showToast('error','Error',e.message); }
}

// Determines if a role should default to work-only (no app login needed)
function isWorkOnlyRole(role) {
  return role === 'doctor' || role === 'specialist';
}

function staffForm(staff) {
  // For new staff: default to work-only for doctor/specialist, login for others
  const defaultWorkOnly = staff ? (staff.requires_login === false) : isWorkOnlyRole('specialist');
  const isNew = !staff;

  return `
    ${isNew ? `
    <!-- Account Type Toggle (new staff only) -->
    <div style="margin-bottom:16px">
      <label style="font-size:12px;font-weight:600;color:var(--ink2);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:8px">Account Type</label>
      <div style="display:flex;gap:8px">
        <button type="button" id="sfType-work" onclick="setStaffType('work')"
          style="flex:1;padding:10px;border-radius:8px;font-size:13px;cursor:pointer;border:2px solid;transition:.15s"
          class="${defaultWorkOnly ? 'sf-type-active' : 'sf-type-inactive'}">
          📋 Work-Only<br><small style="font-weight:400;opacity:.8">Specialist/Doctor — no app login. Just name + salary.</small>
        </button>
        <button type="button" id="sfType-login" onclick="setStaffType('login')"
          style="flex:1;padding:10px;border-radius:8px;font-size:13px;cursor:pointer;border:2px solid;transition:.15s"
          class="${!defaultWorkOnly ? 'sf-type-active' : 'sf-type-inactive'}">
          🔑 Login Account<br><small style="font-weight:400;opacity:.8">Admin/Manager/Receptionist — can sign into the app.</small>
        </button>
      </div>
    </div>
    ` : `
    <div class="alert alert-info mb16" style="font-size:12px">
      ${staff.requires_login === false
        ? '📋 This is a <strong>Work-Only</strong> staff member (no app login). Edit their details below.'
        : '🔑 This is a <strong>Login Account</strong> holder. Use Supabase dashboard to change their password.'}
    </div>
    `}

    <!-- Login fields (hidden for work-only, visible for login accounts) -->
    <div id="sf-login-fields" style="display:${isNew ? (defaultWorkOnly ? 'none' : 'block') : 'none'}">
      <div class="g2">
        <div class="field"><label>Email *</label><input type="email" id="sf-email" placeholder="email@clinic.com"></div>
        <div class="field"><label>Password *</label><input type="password" id="sf-pass" placeholder="Temporary password (min 6 chars)"></div>
      </div>
    </div>

    <div class="g2">
      <div class="field"><label>Full Name *</label><input type="text" id="sf-name" value="${staff?.name||''}" placeholder="Full name"></div>
      <div class="field"><label>Phone</label><input type="text" id="sf-phone" value="${staff?.phone||''}" placeholder="+962 7xx xxx xxx"></div>
    </div>
    <div class="g2">
      <div class="field"><label>Role *</label>
        <select id="sf-role" onchange="${isNew ? 'onStaffRoleChange(this.value)' : ''}">
          ${Object.entries(ROLE_LABELS).map(([k,v])=>`<option value="${k}" ${(staff?.role||'specialist')===k?'selected':''}>${v}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Branch</label>
        <select id="sf-branch">
          ${_branches.map(b=>`<option value="${b.id}" ${(staff?.branch_id||me.branch_id)===b.id?'selected':''}>${b.name}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="g2">
      <div class="field"><label>Monthly Salary (${CURRENCY})</label><input type="number" id="sf-salary" value="${staff?.salary||0}" min="0" step="0.01"></div>
      <div class="field"><label>Fixed Commission / Session (${CURRENCY})</label><input type="number" id="sf-comm" value="${staff?.commission_rate||0}" min="0" step="0.01"
        title="Fixed amount earned per session (for specialists). 0 if not applicable."></div>
    </div>
  `;
}

// Inline style helpers for type toggle buttons
const SF_ACTIVE_STYLE   = 'background:var(--teal);color:#fff;border-color:var(--teal)';
const SF_INACTIVE_STYLE = 'background:#fff;color:var(--ink2);border-color:var(--border)';

function setStaffType(type) {
  const workBtn  = document.getElementById('sfType-work');
  const loginBtn = document.getElementById('sfType-login');
  const fields   = document.getElementById('sf-login-fields');
  if (!workBtn || !loginBtn || !fields) return;

  if (type === 'work') {
    workBtn.style.cssText  += ';background:var(--teal);color:#fff;border-color:var(--teal)';
    loginBtn.style.cssText += ';background:#fff;color:var(--ink2);border-color:var(--border)';
    workBtn.setAttribute('data-active','1'); loginBtn.removeAttribute('data-active');
    fields.style.display = 'none';
  } else {
    loginBtn.style.cssText += ';background:var(--teal);color:#fff;border-color:var(--teal)';
    workBtn.style.cssText  += ';background:#fff;color:var(--ink2);border-color:var(--border)';
    loginBtn.setAttribute('data-active','1'); workBtn.removeAttribute('data-active');
    fields.style.display = 'block';
  }
}

function onStaffRoleChange(role) {
  // Auto-switch type based on role
  setStaffType(isWorkOnlyRole(role) ? 'work' : 'login');
}

async function saveUserFromModal(id) {
  const name = document.getElementById('sf-name').value.trim();
  if (!name) { showToast('error','Required','Name is required.'); return; }

  // Determine account type
  const workBtn = document.getElementById('sfType-work');
  const requiresLogin = workBtn ? !workBtn.hasAttribute('data-active') : (id ? undefined : false);

  // Validate login fields if needed
  if (requiresLogin && !id) {
    const email = document.getElementById('sf-email')?.value.trim();
    const pass  = document.getElementById('sf-pass')?.value;
    if (!email || !pass) { showToast('error','Required','Email and password are required for login accounts.'); return; }
    if (pass.length < 6)  { showToast('error','Password too short','Password must be at least 6 characters.'); return; }
  }

  const role = document.getElementById('sf-role').value;
  try {
    await saveProfile({
      id: id||undefined,
      name,
      phone:          document.getElementById('sf-phone')?.value.trim()||null,
      email:          document.getElementById('sf-email')?.value.trim(),
      password:       document.getElementById('sf-pass')?.value,
      role,
      branchId:       document.getElementById('sf-branch').value,
      salary:         document.getElementById('sf-salary').value,
      commissionRate: document.getElementById('sf-comm').value,
      permissions:    DEFAULT_PERMISSIONS[role] || {},
      requiresLogin:  requiresLogin !== undefined ? requiresLogin : true
    });
    closeModal();
    showToast('success', id ? 'Updated' : 'Staff Added', id ? '' : 'Staff member added successfully.');
    await loadRefData();   // refresh _profiles so they appear in dropdowns
    pgStaff();
  } catch(e) { showToast('error','Error',e.message); }
}

// ─── Settings Page ────────────────────────────────
let _settingsBranches   = [];
let _settingsProcedures = [];

async function pgSettings() {
  if (!hasPerm('manage_settings')) { showToast('error','Access Denied',''); return; }
  setMeta('Settings', 'Admin › Settings');

  [_settingsBranches, _settingsProcedures] = await Promise.all([
    getBranches(),
    getProcedures()
  ]);

  renderSettingsPage();
}

function renderSettingsPage() {
  const procs = _settingsProcedures;

  // Build filter state for procedures
  const procTypeFilter   = window._procTypeFilter   || '';
  const procGenderFilter = window._procGenderFilter || '';
  const procCatFilter    = window._procCatFilter    || '';

  const filteredProcs = procs.filter(p => {
    const typeOk   = !procTypeFilter   || p.service_type === procTypeFilter;
    const genderOk = !procGenderFilter || p.gender === procGenderFilter || p.gender === 'unisex';
    const catOk    = !procCatFilter    || p.category === procCatFilter;
    return typeOk && genderOk && catOk;
  });

  document.getElementById('pageContent').innerHTML = `
    <!-- Clinic Settings -->
    <div class="card mb16">
      <div class="card-header"><div class="card-title">⚙️ Clinic Settings</div></div>
      <div class="card-body">
        <div class="g2">
          <div class="field"><label>Clinic Name</label><input type="text" id="settClinicName" value="${me.branches?.name||''}"></div>
          <div class="field"><label>Clinic Phone</label><input type="text" id="settPhone" value="${me.branches?.phone||''}" placeholder="+962 6 xxx xxxx"></div>
        </div>
        <button class="btn btn-primary btn-sm mt8" onclick="saveSettings()">Save Settings</button>
      </div>
    </div>

    <!-- Branch Management (admin only) -->
    ${isAdmin() ? `
    <div class="card mb16">
      <div class="card-header">
        <div><div class="card-title">🏢 Branches</div><div class="card-sub">${_settingsBranches.length} branches</div></div>
        <button class="btn btn-secondary btn-sm" onclick="openBranchModal(null)">+ Add Branch</button>
      </div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Branch Name</th><th>Arabic Name</th><th>Phone</th><th></th></tr></thead>
        <tbody>
          ${_settingsBranches.map(b=>`<tr>
            <td><strong>${b.name}</strong></td>
            <td>${b.name_ar||'—'}</td>
            <td>${b.phone||'—'}</td>
            <td><button class="btn btn-secondary btn-xs" onclick="openBranchModal(${JSON.stringify(b).replace(/"/g,'&quot;')})">✏️ Edit</button></td>
          </tr>`).join('')}
        </tbody>
      </table></div>
    </div>` : ''}

    <!-- Services / Procedures -->
    <div class="card">
      <div class="card-header">
        <div><div class="card-title">🏥 Services / Procedures</div><div class="card-sub">${filteredProcs.length} of ${procs.length} shown</div></div>
        <button class="btn btn-secondary btn-sm" onclick="openAddProcModal()">+ Add Service</button>
      </div>

      <!-- Procedure filters -->
      <div class="flex-center gap8 mb12" style="padding:0 16px">
        <select style="padding:7px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:12px;font-family:inherit" onchange="window._procTypeFilter=this.value;renderSettingsPage()">
          <option value="">All Types</option>
          ${Object.entries(SERVICE_TYPES).map(([k,v])=>`<option value="${k}" ${procTypeFilter===k?'selected':''}>${v}</option>`).join('')}
        </select>
        <select style="padding:7px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:12px;font-family:inherit" onchange="window._procGenderFilter=this.value;renderSettingsPage()">
          <option value="">All Genders</option>
          <option value="female" ${procGenderFilter==='female'?'selected':''}>♀ Women</option>
          <option value="male"   ${procGenderFilter==='male'?'selected':''}>♂ Men</option>
          <option value="unisex" ${procGenderFilter==='unisex'?'selected':''}>Mixed</option>
        </select>
        <select style="padding:7px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:12px;font-family:inherit" onchange="window._procCatFilter=this.value;renderSettingsPage()">
          <option value="">All Categories</option>
          ${PROCEDURE_CATEGORIES.map(c=>`<option value="${c}" ${procCatFilter===c?'selected':''}>${c}</option>`).join('')}
        </select>
        ${procTypeFilter||procGenderFilter||procCatFilter ? `<button class="btn btn-secondary btn-xs" onclick="window._procTypeFilter='';window._procGenderFilter='';window._procCatFilter='';renderSettingsPage()">✕ Clear</button>` : ''}
      </div>

      <div class="tbl-wrap"><table>
        <thead><tr><th>Service</th><th>Type</th><th>Gender</th><th>Category</th><th>Sub-Cat</th><th>Price</th><th>Doctor %</th><th>Spec. Commission</th><th></th></tr></thead>
        <tbody>
          ${filteredProcs.map(p=>`<tr>
            <td><strong>${p.name}</strong><br><span class="fs12 c-ink3">${p.name_ar||''}</span></td>
            <td><span class="badge ${p.service_type==='doctor'?'bg-blue':p.service_type==='specialist'?'bg-teal':'bg-amber'}">${SERVICE_TYPES[p.service_type]||p.service_type||'Specialist'}</span></td>
            <td>${p.gender==='female'?'♀ Women':p.gender==='male'?'♂ Men':'Mixed'}</td>
            <td>${p.category||'—'}</td>
            <td class="fs12 c-ink3">${p.sub_category||'—'}</td>
            <td>${p.price} ${CURRENCY}</td>
            <td>${p.service_type==='doctor'||p.service_type==='both' ? p.doctor_profit_pct+'%' : '—'}</td>
            <td>${p.service_type!=='doctor' ? p.specialist_commission+' '+CURRENCY : '—'}</td>
            <td>
              <div class="flex-center gap8">
                <button class="btn btn-secondary btn-xs" onclick="openEditProcModal('${p.id}')">✏️</button>
                <button class="btn btn-danger btn-xs" onclick="doDeleteProc('${p.id}')">🗑</button>
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table></div>
    </div>
  `;
}

async function saveSettings() {
  const name  = document.getElementById('settClinicName').value.trim();
  const phone = document.getElementById('settPhone').value.trim();
  try {
    await saveBranch({ id: me.branch_id, name, phone });
    document.getElementById('clinicNameSb').textContent = name;
    showToast('success','Settings Saved','');
  } catch(e) { showToast('error','Error',e.message); }
}

// ─── Branch Modal ──────────────────────────────────
function openBranchModal(branch) {
  openModal(branch ? `Edit Branch: ${branch.name}` : 'Add New Branch', `
    <div class="g2">
      <div class="field"><label>Branch Name (English) *</label><input type="text" id="br-name" value="${branch?.name||''}" placeholder="e.g. Khalda"></div>
      <div class="field"><label>Branch Name (Arabic)</label><input type="text" id="br-ar" value="${branch?.name_ar||''}" placeholder="خلدا" dir="rtl"></div>
    </div>
    <div class="field"><label>Phone</label><input type="text" id="br-phone" value="${branch?.phone||''}" placeholder="+962 6 xxx xxxx"></div>
  `, [
    { label:'Cancel', cls:'btn-secondary', action:'closeModal()' },
    { label: branch ? 'Update Branch' : 'Add Branch', cls:'btn-primary', action:`saveBranchFromModal(${branch?`'${branch.id}'`:'null'})` }
  ], 'modal-sm');
}

async function saveBranchFromModal(id) {
  const name = document.getElementById('br-name').value.trim();
  if (!name) { showToast('error','Required','Branch name is required.'); return; }
  try {
    await saveBranch({
      id:     id||undefined,
      name,
      nameAr: document.getElementById('br-ar').value.trim()||null,
      phone:  document.getElementById('br-phone').value.trim()||null
    });
    closeModal();
    showToast('success', id ? 'Branch Updated' : 'Branch Added', '');
    await loadRefData();
    pgSettings();
  } catch(e) { showToast('error','Error',e.message); }
}

// ─── Procedure Modals ──────────────────────────────
function openAddProcModal() {
  openModal('Add Service', procForm(null), [
    { label:'Cancel', cls:'btn-secondary', action:'closeModal()' },
    { label:'Save Service', cls:'btn-primary', action:'saveProcFromModal(null)' }
  ], 'modal-lg');
}

function openEditProcModal(id) {
  const proc = _procedures.find(p=>p.id===id) || _settingsProcedures.find(p=>p.id===id);
  if (!proc) return;
  openModal('Edit Service', procForm(proc), [
    { label:'Cancel', cls:'btn-secondary', action:'closeModal()' },
    { label:'Update', cls:'btn-primary', action:`saveProcFromModal('${id}')` }
  ], 'modal-lg');
}

function procForm(proc) {
  const svcType = proc?.service_type || 'specialist';
  return `
    <!-- Service type selector -->
    <div style="display:flex;gap:8px;margin-bottom:16px">
      ${Object.entries(SERVICE_TYPES).map(([k,v]) => `
        <button type="button" onclick="setProcType('${k}')" id="procType-${k}"
          style="flex:1;padding:10px 6px;border-radius:8px;font-size:13px;border:2px solid;cursor:pointer;
          background:${svcType===k?'var(--teal)':'#fff'};color:${svcType===k?'#fff':'var(--ink2)'};border-color:${svcType===k?'var(--teal)':'var(--border)'}">
          ${k==='doctor'?'👨‍⚕️':k==='specialist'?'💆':'🔀'} ${v}
        </button>`).join('')}
    </div>
    <input type="hidden" id="pf-service-type" value="${svcType}">

    <div class="g2">
      <div class="field"><label>Name (English) *</label><input type="text" id="pf-name" value="${proc?.name||''}"></div>
      <div class="field"><label>Name (Arabic)</label><input type="text" id="pf-ar" value="${proc?.name_ar||''}" dir="rtl"></div>
    </div>
    <div class="g2">
      <div class="field"><label>Category</label>
        <select id="pf-cat">
          ${PROCEDURE_CATEGORIES.map(c=>`<option value="${c}" ${(proc?.category||'General')===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Sub-Category</label>
        <input type="text" id="pf-subcat" value="${proc?.sub_category||''}" placeholder="e.g. Full Body, Face, Bikini">
      </div>
    </div>
    <div class="field"><label>Gender</label>
      <div style="display:flex;gap:8px">
        ${[['female','♀ Women'],['male','♂ Men'],['unisex','Mixed / Both']].map(([k,v])=>`
          <button type="button" onclick="setProcGender('${k}')" id="procGender-${k}"
            style="flex:1;padding:8px;border-radius:8px;font-size:13px;border:2px solid;cursor:pointer;
            background:${(proc?.gender||'female')===k?'var(--teal)':'#fff'};
            color:${(proc?.gender||'female')===k?'#fff':'var(--ink2)'};
            border-color:${(proc?.gender||'female')===k?'var(--teal)':'var(--border)'}">${v}</button>
        `).join('')}
      </div>
    </div>
    <input type="hidden" id="pf-gender" value="${proc?.gender||'female'}">

    <!-- Commission fields — depend on service type -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
      <div class="field"><label>List Price (${CURRENCY})</label><input type="number" id="pf-price" value="${proc?.price||0}" min="0"></div>
      <div class="field" id="pf-docpct-wrap" style="display:${svcType!=='specialist'?'block':'none'}">
        <label>Doctor Profit %</label><input type="number" id="pf-docpct" value="${proc?.doctor_profit_pct||50}" min="0" max="100">
      </div>
      <div class="field" id="pf-speccomm-wrap" style="display:${svcType!=='doctor'?'block':'none'}">
        <label>Specialist Commission (${CURRENCY})</label><input type="number" id="pf-speccomm" value="${proc?.specialist_commission||0}" min="0" step="0.01">
      </div>
    </div>
  `;
}

function setProcType(type) {
  document.getElementById('pf-service-type').value = type;
  Object.keys(SERVICE_TYPES).forEach(k => {
    const btn = document.getElementById(`procType-${k}`);
    if (!btn) return;
    btn.style.background   = k === type ? 'var(--teal)' : '#fff';
    btn.style.color        = k === type ? '#fff'        : 'var(--ink2)';
    btn.style.borderColor  = k === type ? 'var(--teal)' : 'var(--border)';
  });
  // Show/hide commission fields based on type
  const docWrap  = document.getElementById('pf-docpct-wrap');
  const specWrap = document.getElementById('pf-speccomm-wrap');
  if (docWrap)  docWrap.style.display  = type !== 'specialist' ? 'block' : 'none';
  if (specWrap) specWrap.style.display = type !== 'doctor'     ? 'block' : 'none';
}

function setProcGender(gender) {
  document.getElementById('pf-gender').value = gender;
  ['female','male','unisex'].forEach(k => {
    const btn = document.getElementById(`procGender-${k}`);
    if (!btn) return;
    btn.style.background  = k === gender ? 'var(--teal)' : '#fff';
    btn.style.color       = k === gender ? '#fff'        : 'var(--ink2)';
    btn.style.borderColor = k === gender ? 'var(--teal)' : 'var(--border)';
  });
}

async function saveProcFromModal(id) {
  const name = document.getElementById('pf-name').value.trim();
  if (!name) { showToast('error','Required','Service name required.'); return; }
  try {
    await saveProcedure({
      id:             id||undefined,
      name,
      nameAr:         document.getElementById('pf-ar').value.trim()||null,
      price:          document.getElementById('pf-price').value,
      doctorPct:      document.getElementById('pf-docpct')?.value || 50,
      specCommission: document.getElementById('pf-speccomm')?.value || 0,
      category:       document.getElementById('pf-cat').value,
      subCategory:    document.getElementById('pf-subcat').value.trim()||null,
      serviceType:    document.getElementById('pf-service-type').value || 'specialist',
      gender:         document.getElementById('pf-gender').value || 'female'
    });
    closeModal();
    showToast('success','Saved','');
    await loadRefData();   // refresh _procedures
    pgSettings();
  } catch(e) { showToast('error','Error',e.message); }
}

async function doDeleteProc(id) {
  if (!confirm('Deactivate this service?')) return;
  try { await deleteProcedure(id); showToast('success','Removed',''); pgSettings(); } catch(e) { showToast('error','Error',e.message); }
}

// ─── Modal System ──────────────────────────────────
function openModal(title, body, btns, size='') {
  document.getElementById('modalOverlay').classList.add('show');
  document.getElementById('modalBox').className = `modal ${size}`;
  document.getElementById('modalHead').innerHTML = `<h3>${title}</h3><button class="mc-btn" onclick="closeModal()">✕</button>`;
  document.getElementById('modalBody').innerHTML = body;
  document.getElementById('modalFoot').innerHTML = (btns||[]).map(b=>`<button class="btn ${b.cls}" onclick="${b.action}">${b.label}</button>`).join('');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('show');
}

// ─── Tab Switcher ──────────────────────────────────
function switchTab(barId, panelId) {
  const bar    = barId ? document.getElementById(barId) : event.target.closest('.tabs-bar');
  const panel  = document.getElementById(panelId);
  if (!panel) return;
  const tabBar = bar || event.target.closest('.tabs-bar');
  if (tabBar) tabBar.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  const panelParent = panel.parentElement;
  panelParent.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  panel.classList.add('active');
}

// ─── Toast Notifications ───────────────────────────
function showToast(type, title, sub, dur=4000) {
  const icons = { success:'✅', error:'❌', info:'ℹ️', warning:'⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast-item ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]||'📢'}</span><div class="toast-text"><div class="tt">${title}</div>${sub?`<div class="ts">${sub}</div>`:''}</div>`;
  document.getElementById('toastStack').appendChild(toast);
  setTimeout(() => { toast.classList.add('out'); setTimeout(()=>toast.remove(), 350); }, dur);
}

// ─── Helpers ──────────────────────────────────────
function formatTime12(time) {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h%12||12}:${String(m).padStart(2,'0')} ${ampm}`;
}

function applyDefaultPerms(role) { /* Handled via onStaffRoleChange */ }

// ─── Keyboard shortcut: Escape closes modal ────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});
