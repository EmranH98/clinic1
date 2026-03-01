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
async function pgInventory() {
  setMeta('Inventory', 'Operations › Inventory');
  const items = await getInventory();
  const low   = items.filter(i => i.qty <= i.min_qty);

  document.getElementById('pageContent').innerHTML = `
    ${low.length > 0 ? `<div class="alert alert-warning mb16">⚠️ <strong>${low.length} item(s) below minimum stock:</strong> ${low.map(i=>i.name).join(', ')}</div>` : ''}
    <div class="flex-center gap12 mb16">
      <div class="search-box"><span>🔍</span><input type="text" placeholder="Search items…" oninput="filterInvTable(this.value)"></div>
      <span class="ml-auto"></span>
      ${hasPerm('manage_inventory') ? `<button class="btn btn-primary btn-sm" onclick="openAddItemModal()">+ Add Item</button>` : ''}
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">📦 Inventory</div><div class="card-sub">${items.length} items</div></div>
      <div id="invTableWrap"></div>
    </div>
  `;
  renderInvTable(items);
}

let _invItems = [];
async function filterInvTable(q) {
  const items = await getInventory({ search: q });
  renderInvTable(items);
}

function renderInvTable(items) {
  _invItems = items;
  const wrap = document.getElementById('invTableWrap');
  if (!wrap) return;
  if (items.length === 0) { wrap.innerHTML = `<div class="empty-state"><div class="ei">📦</div><p>No items found.</p></div>`; return; }
  wrap.innerHTML = `<div class="tbl-wrap"><table>
    <thead><tr><th>Item</th><th>Category</th><th>Qty</th><th>Min Qty</th><th>Unit</th><th>Cost</th><th>Status</th>
    ${hasPerm('manage_inventory')?'<th>Actions</th>':''}</tr></thead>
    <tbody>
      ${items.map(i=>`<tr>
        <td><strong>${i.name}</strong></td>
        <td>${i.category||'-'}</td>
        <td style="font-weight:700">${i.qty}</td>
        <td>${i.min_qty}</td>
        <td>${i.unit||'pcs'}</td>
        <td>${i.cost?.toFixed(2)||'0.00'} ${CURRENCY}</td>
        <td>${i.qty<=i.min_qty?'<span class="badge bg-red">⚠️ Low</span>':'<span class="badge bg-green">✓ OK</span>'}</td>
        ${hasPerm('manage_inventory')?`<td>
          <div class="flex-center gap8">
            <button class="btn btn-secondary btn-xs" onclick="openUpdateStockModal('${i.id}')">+ Stock</button>
            <button class="btn btn-secondary btn-xs" onclick="openEditItemModal('${i.id}')">✏️</button>
            <button class="btn btn-danger btn-xs" onclick="doDeleteItem('${i.id}')">🗑</button>
          </div>
        </td>`:''}
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

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
  openModal(`Update Stock: ${item.name}`, `
    <div class="field"><label>Current Qty: ${item.qty} ${item.unit}</label></div>
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
  `;
}
async function saveItemFromModal(id) {
  const name = document.getElementById('inv-name').value.trim();
  if (!name) { showToast('error','Required','Item name is required.'); return; }
  try {
    await saveInventoryItem({ id:id||undefined, name, category:document.getElementById('inv-cat').value.trim()||null,
      qty:document.getElementById('inv-qty').value, minQty:document.getElementById('inv-min').value,
      unit:document.getElementById('inv-unit').value.trim()||'pcs', cost:document.getElementById('inv-cost').value });
    closeModal(); showToast('success','Saved',''); pgInventory();
  } catch(e) { showToast('error','Error',e.message); }
}
async function doDeleteItem(id) {
  if (!confirm('Delete this inventory item?')) return;
  try { await deleteInventoryItem(id); showToast('success','Deleted',''); pgInventory(); } catch(e) { showToast('error','Error',e.message); }
}

// ─── Staff Management Page ────────────────────────
async function pgStaff() {
  if (!hasPerm('manage_staff') && !isAdmin()) { showToast('error','Access Denied',''); return; }
  setMeta('Staff & Access', 'Admin › Staff');
  const staff = await getAllProfiles();

  document.getElementById('pageContent').innerHTML = `
    <div class="flex-center gap12 mb16">
      <span class="ml-auto"></span>
      ${isAdmin() ? `<button class="btn btn-primary btn-sm" onclick="openAddUserModal()">+ Create Account</button>` : ''}
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">👥 Staff Accounts</div><div class="card-sub">${staff.length} members</div></div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Name</th><th>Role</th><th>Branch</th><th>Salary</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          ${staff.map(s=>`<tr>
            <td>
              <div class="flex-center gap8">
                <div class="av av-teal" style="width:32px;height:32px;font-size:12px;background:${s.avatar_color||'#0d7377'};color:#fff;border:none">${s.name.slice(0,2).toUpperCase()}</div>
                <div><div style="font-weight:600">${s.name}</div><div class="fs12 c-ink3">${s.phone||''}</div></div>
              </div>
            </td>
            <td><span class="badge bg-teal">${ROLE_LABELS[s.role]||s.role}</span></td>
            <td>${s.branches?.name||'-'}</td>
            <td>${s.salary>0?s.salary.toFixed(2)+' '+CURRENCY:'-'}</td>
            <td>${s.active?'<span class="badge bg-green">Active</span>':'<span class="badge bg-red">Inactive</span>'}</td>
            <td>
              <div class="flex-center gap8">
                <button class="btn btn-secondary btn-xs" onclick="openEditUserModal('${s.id}')">✏️ Edit</button>
                <button class="btn btn-secondary btn-xs" onclick="openPermissionsModal('${s.id}')">🔑 Permissions</button>
                ${s.id!==me.id?`<button class="btn btn-${s.active?'danger':'success'} btn-xs" onclick="toggleUser('${s.id}',${!s.active})">${s.active?'Deactivate':'Activate'}</button>`:''}
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table></div>
    </div>
  `;
}

async function toggleUser(id, active) {
  try { await toggleProfileActive(id, active); showToast('success', active?'Activated':'Deactivated',''); pgStaff(); }
  catch(e) { showToast('error','Error',e.message); }
}

function openAddUserModal() {
  openModal('Create Staff Account', staffForm(null), [
    { label:'Cancel', cls:'btn-secondary', action:'closeModal()' },
    { label:'Create Account', cls:'btn-primary', action:'saveUserFromModal(null)' }
  ]);
}
function openEditUserModal(id) {}   // implement similar to above
function openPermissionsModal(id) {
  const s = _profiles.find(p=>p.id===id);
  if (!s) return;
  const perms = s.permissions || DEFAULT_PERMISSIONS[s.role] || {};
  openModal(`Permissions: ${s.name}`, `
    <div class="alert alert-info mb16">ℹ️ Toggle each permission on or off. Changes take effect immediately.</div>
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

function staffForm(staff) {
  return `
    <div class="g2">
      <div class="field"><label>Full Name *</label><input type="text" id="sf-name" value="${staff?.name||''}" placeholder="Full name"></div>
      <div class="field"><label>Phone</label><input type="text" id="sf-phone" value="${staff?.phone||''}" placeholder="+962 7xx xxx xxx"></div>
    </div>
    ${!staff ? `<div class="field"><label>Email *</label><input type="email" id="sf-email" placeholder="email@clinic.com"></div>
    <div class="field"><label>Password *</label><input type="password" id="sf-pass" placeholder="Temporary password"></div>` : ''}
    <div class="g2">
      <div class="field"><label>Role *</label>
        <select id="sf-role" onchange="applyDefaultPerms(this.value)">
          ${Object.entries(ROLE_LABELS).map(([k,v])=>`<option value="${k}" ${staff?.role===k?'selected':''}>${v}</option>`).join('')}
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
      <div class="field"><label>Commission Rate (%)</label><input type="number" id="sf-comm" value="${staff?.commission_rate||0}" min="0" max="100" step="0.1"></div>
    </div>
  `;
}

async function saveUserFromModal(id) {
  const name = document.getElementById('sf-name').value.trim();
  if (!name) { showToast('error','Required','Name is required.'); return; }
  try {
    await saveProfile({
      id: id||undefined,
      name, phone: document.getElementById('sf-phone')?.value.trim()||null,
      email: document.getElementById('sf-email')?.value.trim(),
      password: document.getElementById('sf-pass')?.value,
      role: document.getElementById('sf-role').value,
      branchId: document.getElementById('sf-branch').value,
      salary: document.getElementById('sf-salary').value,
      commissionRate: document.getElementById('sf-comm').value,
      permissions: DEFAULT_PERMISSIONS[document.getElementById('sf-role').value] || {}
    });
    closeModal(); showToast('success',id?'Updated':'Account Created',''); pgStaff();
  } catch(e) { showToast('error','Error',e.message); }
}

// ─── Settings Page ────────────────────────────────
async function pgSettings() {
  if (!hasPerm('manage_settings')) { showToast('error','Access Denied',''); return; }
  setMeta('Settings', 'Admin › Settings');
  const procedures = await getProcedures();

  document.getElementById('pageContent').innerHTML = `
    <div class="g2">
      <div class="card">
        <div class="card-header"><div class="card-title">⚙️ Clinic Settings</div></div>
        <div class="card-body">
          <div class="field"><label>Clinic Name</label><input type="text" id="settClinicName" value="${me.branches?.name||''}"></div>
          <div class="field"><label>Clinic Phone</label><input type="text" id="settPhone" value="${me.branches?.phone||''}" placeholder="+962 6 xxx xxxx"></div>
          <button class="btn btn-primary btn-sm mt16" onclick="saveSettings()">Save Settings</button>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div><div class="card-title">🏥 Services / Procedures</div><div class="card-sub">${procedures.length} active services</div></div>
          <button class="btn btn-secondary btn-sm" onclick="openAddProcModal()">+ Add Service</button>
        </div>
        <div class="tbl-wrap"><table>
          <thead><tr><th>Service</th><th>Price</th><th>Doctor %</th><th>Spec. Commission</th><th></th></tr></thead>
          <tbody>
            ${procedures.map(p=>`<tr>
              <td><strong>${p.name}</strong><br><span class="fs12 c-ink3">${p.name_ar||''}</span></td>
              <td>${p.price} ${CURRENCY}</td>
              <td>${p.doctor_profit_pct}%</td>
              <td>${p.specialist_commission} ${CURRENCY}</td>
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

function openAddProcModal()  { openModal('Add Service', procForm(null), [{label:'Cancel',cls:'btn-secondary',action:'closeModal()'},{label:'Save',cls:'btn-primary',action:'saveProcFromModal(null)'}]); }
function openEditProcModal(id) {
  const proc = _procedures.find(p=>p.id===id);
  if (!proc) return;
  openModal('Edit Service', procForm(proc), [{label:'Cancel',cls:'btn-secondary',action:'closeModal()'},{label:'Update',cls:'btn-primary',action:`saveProcFromModal('${id}')`}]);
}
function procForm(proc) {
  return `
    <div class="g2">
      <div class="field"><label>Name (English) *</label><input type="text" id="pf-name" value="${proc?.name||''}"></div>
      <div class="field"><label>Name (Arabic)</label><input type="text" id="pf-ar" value="${proc?.name_ar||''}" dir="rtl"></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
      <div class="field"><label>List Price (${CURRENCY})</label><input type="number" id="pf-price" value="${proc?.price||0}" min="0"></div>
      <div class="field"><label>Doctor Profit %</label><input type="number" id="pf-docpct" value="${proc?.doctor_profit_pct||50}" min="0" max="100"></div>
      <div class="field"><label>Spec. Commission (${CURRENCY})</label><input type="number" id="pf-speccomm" value="${proc?.specialist_commission||0}" min="0" step="0.01"></div>
    </div>
  `;
}
async function saveProcFromModal(id) {
  const name = document.getElementById('pf-name').value.trim();
  if (!name) { showToast('error','Required','Service name required.'); return; }
  try {
    await saveProcedure({ id:id||undefined, name, nameAr:document.getElementById('pf-ar').value.trim()||null,
      price:document.getElementById('pf-price').value, doctorPct:document.getElementById('pf-docpct').value,
      specCommission:document.getElementById('pf-speccomm').value });
    closeModal(); showToast('success','Saved',''); pgSettings(); await loadRefData();
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

function applyDefaultPerms(role) {}  // can be used to pre-fill perm checkboxes

// ─── Keyboard shortcut: Escape closes modal ────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});
