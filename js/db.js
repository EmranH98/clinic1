// =====================================================
// ClinicOS v3 — Database Layer (Supabase CRUD)
// All DB interactions go through this file.
// =====================================================

// ─── Cached reference data ────────────────────────
let _branches   = [];
let _profiles   = [];   // all staff in branch
let _procedures = [];

// ─── Load reference data (called on login) ────────
async function loadRefData() {
  const branchFilter = me.role === 'admin' ? {} : { branch_id: me.branch_id };

  const [{ data: branches }, { data: profiles }, { data: procedures }] = await Promise.all([
    supabase.from('branches').select('*').order('name'),
    supabase.from('profiles').select('*').eq('active', true).order('name'),
    supabase.from('procedures').select('*').eq('active', true).order('name')
  ]);

  _branches   = branches   || [];
  _profiles   = profiles   || [];
  _procedures = procedures || [];
}

function getBranch(id) { return _branches.find(b => b.id === id); }
function getProfile(id) { return _profiles.find(p => p.id === id); }
function getProcedure(id) { return _procedures.find(p => p.id === id); }

function getDoctors()     { return _profiles.filter(p => p.role === 'doctor'); }
function getSpecialists() { return _profiles.filter(p => p.role === 'specialist'); }
function getStaff()       { return _profiles.filter(p => p.active); }

// ─── OPERATIONS ──────────────────────────────────

async function getOperations({ date, month, year, dateFrom, dateTo, specialistId, doctorId, branchId, search } = {}) {
  const _buildQuery = (withProcedures) => {
    let q = supabase.from('operations_with_total').select(
      withProcedures
        ? `*, specialist:specialist_id(id,name,specialist_type,commission_rate), doctor:doctor_id(id,name), procedure:procedure_id(id,name,name_ar,doctor_profit_pct,specialist_commission,service_type,gender,category), op_procedures:operation_procedures(id,quantity,specialist_commission_override,procedure:procedure_id(id,name,name_ar,specialist_commission,doctor_profit_pct))`
        : `*, specialist:specialist_id(id,name,specialist_type,commission_rate), doctor:doctor_id(id,name), procedure:procedure_id(id,name,name_ar,doctor_profit_pct,specialist_commission,service_type,gender,category)`
    ).order('date', { ascending: false }).order('created_at', { ascending: false });

    if (!hasPerm('view_all_branches')) {
      q = q.eq('branch_id', me.branch_id || branchId);
    } else if (branchId) {
      q = q.eq('branch_id', branchId);
    }
    if (me.role === 'specialist' && !hasPerm('view_all_staff_ops')) {
      q = q.eq('specialist_id', me.id);
    }
    if (date)         q = q.eq('date', date);
    if (month && year) {
      const from = `${year}-${String(month).padStart(2,'0')}-01`;
      const to   = new Date(year, month, 0).toISOString().split('T')[0];
      q = q.gte('date', from).lte('date', to);
    }
    if (dateFrom)     q = q.gte('date', dateFrom);
    if (dateTo)       q = q.lte('date', dateTo);
    if (specialistId) q = q.eq('specialist_id', specialistId);
    if (doctorId)     q = q.eq('doctor_id', doctorId);
    if (search)       q = q.or(`patient_name.ilike.%${search}%,file_number.ilike.%${search}%`);
    return q;
  };

  // Try with op_procedures join first; fall back without it if table not yet migrated
  let { data, error } = await _buildQuery(true);
  if (error && (error.code === '42P01' || error.message?.includes('relation') || error.message?.includes('does not exist'))) {
    ({ data, error } = await _buildQuery(false));
    if (!error) {
      // Add empty op_procedures array so downstream code doesn't break
      data = (data || []).map(o => ({ ...o, op_procedures: [] }));
    }
  }
  if (error) { console.error(error); showToast('error', 'DB Error', error.message); return []; }
  return data || [];
}

async function saveOperation(op) {
  const payload = {
    date:          op.date,
    patient_name:  op.patientName,
    file_number:   op.fileNumber,
    specialist_id: op.specialistId || null,
    doctor_id:     op.doctorId     || null,
    procedure_id:  op.procedureId  || null,
    session_name:  op.sessionName  || null,
    pricing:       op.pricing      || null,
    payment_cash:  parseFloat(op.cash  || 0),
    payment_visa:  parseFloat(op.visa  || 0),
    payment_cliq:  parseFloat(op.cliq  || 0),
    payment_shot:  parseFloat(op.shot  || 0),
    discount:      parseFloat(op.discount || 0),
    notes:         op.notes || null,
    branch_id:     me.branch_id,
    created_by:    me.id,
    // Commission override: null = use procedure default; number = override for this op
    specialist_commission_override: (op.commissionOverride !== null && op.commissionOverride !== '' && op.commissionOverride !== undefined)
      ? parseFloat(op.commissionOverride)
      : null
  };

  if (op.id) {
    const { data, error } = await supabase.from('operations').update(payload).eq('id', op.id).select().single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabase.from('operations').insert(payload).select().single();
    if (error) throw error;
    return data;
  }
}

async function deleteOperation(id) {
  const { error } = await supabase.from('operations').delete().eq('id', id);
  if (error) throw error;
}

// ─── BULK IMPORT OPERATIONS ───────────────────────
async function bulkInsertOperations(rows) {
  const payload = rows.map(r => ({
    date:          r.date,
    patient_name:  r.patient_name,
    file_number:   r.file_number   || null,
    specialist_id: r.specialist_id || null,
    doctor_id:     r.doctor_id     || null,
    procedure_id:  r.procedure_id  || null,
    session_name:  r.session_name  || null,
    pricing:       r.pricing       || null,
    payment_cash:  parseFloat(r.cash  || 0),
    payment_visa:  parseFloat(r.visa  || 0),
    payment_cliq:  parseFloat(r.cliq  || 0),
    payment_shot:  parseFloat(r.shot  || 0),
    discount:      parseFloat(r.discount || 0),
    notes:         r.notes         || null,
    branch_id:     me.branch_id,
    created_by:    me.id
  }));

  const { data, error } = await supabase.from('operations').insert(payload).select();
  if (error) throw error;
  return data || [];
}

// ─── LASER COUNTER ────────────────────────────────
async function getLaserEntries({ date, specialistId, month, year, dateFrom, dateTo } = {}) {
  let q = supabase.from('laser_counter').select(`
    *, specialist:specialist_id(name)
  `).eq('branch_id', me.branch_id).order('date', { ascending: false });

  if (date)        q = q.eq('date', date);
  if (specialistId) q = q.eq('specialist_id', specialistId);
  if (month && year) {
    const from = `${year}-${String(month).padStart(2,'0')}-01`;
    const to   = new Date(year, month, 0).toISOString().split('T')[0];
    q = q.gte('date', from).lte('date', to);
  }
  if (dateFrom) q = q.gte('date', dateFrom);
  if (dateTo)   q = q.lte('date', dateTo);

  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return data || [];
}

async function saveLaserEntry(entry) {
  const payload = {
    date:          entry.date,
    specialist_id: entry.specialistId,
    start_count:   parseInt(entry.startCount || 0),
    end_count:     parseInt(entry.endCount   || 0),
    notes:         entry.notes || null,
    branch_id:     me.branch_id
  };

  const { data, error } = await supabase
    .from('laser_counter')
    .upsert(payload, { onConflict: 'date,specialist_id,branch_id' })
    .select().single();

  if (error) throw error;
  return data;
}

// ─── APPOINTMENTS ─────────────────────────────────
async function getAppointments({ status, doctorId, branchId, dateFrom, dateTo } = {}) {
  let q = supabase.from('appointments').select(`
    *,
    doctor:doctor_id(id, name),
    procedure:procedure_id(id, name, name_ar)
  `).order('date').order('time');

  if (!hasPerm('view_all_branches')) q = q.eq('branch_id', me.branch_id || branchId);
  else if (branchId) q = q.eq('branch_id', branchId);

  if (me.role === 'doctor') q = q.eq('doctor_id', me.id);
  if (status)   q = q.eq('status', status);
  if (doctorId) q = q.eq('doctor_id', doctorId);
  if (dateFrom) q = q.gte('date', dateFrom);
  if (dateTo)   q = q.lte('date', dateTo);

  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return data || [];
}

async function saveAppointment(appt) {
  const payload = {
    customer_name:  appt.customerName,
    customer_phone: appt.customerPhone,
    customer_email: appt.customerEmail || null,
    doctor_id:      appt.doctorId      || null,
    procedure_id:   appt.procedureId   || null,
    date:           appt.date,
    time:           appt.time,
    status:         appt.status || 'pending',
    notes:          appt.notes  || null,
    branch_id:      appt.branchId || me.branch_id
  };

  if (appt.id) {
    const { data, error } = await supabase.from('appointments').update(payload).eq('id', appt.id).select().single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabase.from('appointments').insert(payload).select().single();
    if (error) throw error;
    return data;
  }
}

async function confirmAppointment(id) {
  const { data, error } = await supabase.from('appointments').update({
    status: 'confirmed',
    confirmed_by: me.id,
    confirmed_at: new Date().toISOString()
  }).eq('id', id).select(`*, doctor:doctor_id(name), procedure:procedure_id(name)`).single();

  if (error) throw error;

  // Send SMS to customer
  if (data) {
    try {
      const branch = getBranch(data.branch_id);
      await sendAppointmentSMS(data, branch);
      await supabase.from('appointments').update({ sms_sent: true }).eq('id', id);
    } catch (smsErr) {
      console.warn('SMS failed (appointment still confirmed):', smsErr);
    }
  }
  return data;
}

async function cancelAppointment(id) {
  const { error } = await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', id);
  if (error) throw error;
}

async function setAppointmentStatus(id, status) {
  const { error } = await supabase.from('appointments').update({ status }).eq('id', id);
  if (error) throw error;
}

async function deleteAppointment(id) {
  const { error } = await supabase.from('appointments').delete().eq('id', id);
  if (error) throw error;
}

// ─── PROCEDURES ───────────────────────────────────
async function getProcedures() {
  const { data, error } = await supabase.from('procedures').select('*').eq('active', true).order('name');
  if (error) { console.error(error); return []; }
  return data || [];
}

async function saveProcedure(proc) {
  const payload = {
    name: proc.name, name_ar: proc.nameAr || null,
    price: parseFloat(proc.price || 0),
    doctor_profit_pct: parseFloat(proc.doctorPct || 50),
    specialist_commission: parseFloat(proc.specCommission || 0),
    category:     proc.category    || 'General',
    sub_category: proc.subCategory || null,
    service_type: proc.serviceType || 'specialist',
    gender:       proc.gender      || 'unisex',
    branch_id: me.branch_id, active: true
  };
  if (proc.id) {
    const { data, error } = await supabase.from('procedures').update(payload).eq('id', proc.id).select().single();
    if (error) throw error; return data;
  } else {
    const { data, error } = await supabase.from('procedures').insert(payload).select().single();
    if (error) throw error; return data;
  }
}

async function deleteProcedure(id) {
  const { error } = await supabase.from('procedures').update({ active: false }).eq('id', id);
  if (error) throw error;
}

// ─── INVENTORY ────────────────────────────────────
async function getInventory({ search, supplierId } = {}) {
  let q = supabase.from('inventory')
    .select('*, supplier:supplier_id(name)')
    .eq('branch_id', me.branch_id).order('name');
  if (search)     q = q.ilike('name', `%${search}%`);
  if (supplierId) q = q.eq('supplier_id', supplierId);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return data || [];
}

async function saveInventoryItem(item) {
  const payload = {
    name: item.name, category: item.category || null,
    qty: parseFloat(item.qty || 0), min_qty: parseFloat(item.minQty || 0),
    unit: item.unit || 'pcs', cost: parseFloat(item.cost || 0),
    supplier_id: item.supplierId || null,
    branch_id: me.branch_id
  };
  if (item.id) {
    const { data, error } = await supabase.from('inventory').update(payload).eq('id', item.id).select().single();
    if (error) throw error; return data;
  } else {
    const { data, error } = await supabase.from('inventory').insert(payload).select().single();
    if (error) throw error; return data;
  }
}

async function updateStock(id, delta) {
  const { data: current } = await supabase.from('inventory').select('qty').eq('id', id).single();
  const newQty = (current?.qty || 0) + delta;
  const { data, error } = await supabase.from('inventory').update({ qty: newQty }).eq('id', id).select().single();
  if (error) throw error; return data;
}

async function deleteInventoryItem(id) {
  const { error } = await supabase.from('inventory').delete().eq('id', id);
  if (error) throw error;
}

// ─── SUPPLIERS ────────────────────────────────────
async function getSuppliers() {
  const { data, error } = await supabase.from('suppliers')
    .select('*').eq('branch_id', me.branch_id).eq('active', true).order('name');
  if (error) { console.error(error); return []; }
  return data || [];
}

async function saveSupplier(supplier) {
  const payload = {
    name: supplier.name,
    contact_name: supplier.contactName || null,
    phone: supplier.phone || null,
    notes: supplier.notes || null,
    branch_id: me.branch_id, active: true
  };
  if (supplier.id) {
    const { data, error } = await supabase.from('suppliers').update(payload).eq('id', supplier.id).select().single();
    if (error) throw error; return data;
  } else {
    const { data, error } = await supabase.from('suppliers').insert(payload).select().single();
    if (error) throw error; return data;
  }
}

async function deleteSupplier(id) {
  const { error } = await supabase.from('suppliers').update({ active: false }).eq('id', id);
  if (error) throw error;
}

// ─── PURCHASE HISTORY ─────────────────────────────
async function getPurchaseHistory(inventoryId) {
  const { data, error } = await supabase.from('purchase_history')
    .select('*, supplier:supplier_id(name)')
    .eq('inventory_id', inventoryId)
    .order('purchase_date', { ascending: false });
  if (error) { console.error(error); return []; }
  return data || [];
}

async function addPurchase({ inventoryId, supplierId, quantity, unitPrice, purchaseDate, notes }) {
  // 1. Insert purchase record
  const { error: phError } = await supabase.from('purchase_history').insert({
    inventory_id:  inventoryId,
    supplier_id:   supplierId  || null,
    quantity:      parseFloat(quantity),
    unit_price:    parseFloat(unitPrice),
    purchase_date: purchaseDate || new Date().toISOString().split('T')[0],
    notes:         notes  || null,
    branch_id:     me.branch_id,
    created_by:    me.id
  });
  if (phError) throw phError;

  // 2. Update inventory qty + last purchase info
  const { data: inv } = await supabase.from('inventory').select('qty').eq('id', inventoryId).single();
  const newQty = (inv?.qty || 0) + parseFloat(quantity);
  const { error: invError } = await supabase.from('inventory').update({
    qty:                 newQty,
    last_purchase_price: parseFloat(unitPrice),
    last_purchase_date:  purchaseDate || new Date().toISOString().split('T')[0],
    supplier_id:         supplierId   || null
  }).eq('id', inventoryId);
  if (invError) throw invError;
}

// ─── OPERATION ITEMS (inventory consumed per op) ──

async function getOperationItems(operationId) {
  const { data, error } = await supabase
    .from('operation_items')
    .select('*, item:inventory_id(id, name, unit, cost)')
    .eq('operation_id', operationId)
    .order('created_at');
  if (error) { console.error(error); return []; }
  return data || [];
}

/**
 * Full-replace of items for an operation:
 *  1. Reverse stock deductions for old items
 *  2. Delete old operation_items rows
 *  3. Insert new items + deduct stock
 *  4. Update operations.material_cost snapshot
 */
async function saveOperationItems(operationId, items, branchId, manualCost = 0) {
  // Reverse old stock
  const existing = await getOperationItems(operationId);
  for (const old of existing) {
    await updateStock(old.inventory_id, +parseFloat(old.qty));
  }

  // Delete old rows
  const { error: delErr } = await supabase
    .from('operation_items')
    .delete()
    .eq('operation_id', operationId);
  if (delErr) throw delErr;

  const cleanItems = (items || []).filter(i => i.inventoryId && parseFloat(i.qty) > 0);

  if (cleanItems.length > 0) {
    const payload = cleanItems.map(i => ({
      operation_id: operationId,
      inventory_id: i.inventoryId,
      qty:          parseFloat(i.qty),
      unit_price:   parseFloat(i.unitPrice || 0),
      branch_id:    branchId
    }));
    const { error: insErr } = await supabase.from('operation_items').insert(payload);
    if (insErr) throw insErr;

    // Deduct stock
    for (const i of cleanItems) {
      await updateStock(i.inventoryId, -parseFloat(i.qty));
    }
  }

  // material_cost snapshot:
  //   • If inventory items were selected → use their computed total
  //   • If no inventory items → honour the manually-entered cost (may be 0)
  const itemsTotal = cleanItems.reduce(
    (s, i) => s + parseFloat(i.qty) * parseFloat(i.unitPrice || 0), 0
  );
  const materialCost = cleanItems.length > 0 ? itemsTotal : parseFloat(manualCost || 0);

  const { error: updErr } = await supabase
    .from('operations')
    .update({ material_cost: materialCost })
    .eq('id', operationId);
  if (updErr) throw updErr;
}

// ─── OPERATION PROCEDURES (multi-procedure sessions) ───────────────

/**
 * Full-replace the procedure list for an operation.
 * Deletes existing rows then inserts the new list.
 */
async function saveOperationProcedures(operationId, procedures) {
  // Helper: is this a "table missing" error from Supabase?
  const isMissingTable = e => e && (
    e.code === '42P01' ||
    e.message?.includes('relation') ||
    e.message?.includes('does not exist')
  );

  // Delete existing rows first
  const { error: delErr } = await supabase
    .from('operation_procedures')
    .delete()
    .eq('operation_id', operationId);

  if (delErr) {
    // Table not created yet → silently skip and warn once
    if (isMissingTable(delErr)) {
      showToast('warn', 'Migration needed', 'Run migration_v4c.sql to enable multi-procedure sessions.');
      return;
    }
    throw delErr;
  }

  if (!procedures || procedures.length === 0) return;

  const { error } = await supabase.from('operation_procedures').insert(
    procedures.map(p => ({
      operation_id:                   operationId,
      procedure_id:                   p.procedureId || null,
      quantity:                       p.quantity    || 1,
      specialist_commission_override: p.commOverride || null
    }))
  );
  if (error) {
    if (isMissingTable(error)) {
      showToast('warn', 'Migration needed', 'Run migration_v4c.sql to enable multi-procedure sessions.');
      return;
    }
    throw error;
  }
}

// ─── PRODUCT SALES ────────────────────────────────

async function getProductSales({ dateFrom, dateTo, search } = {}) {
  // Use base table (not view) so we can join seller profile;
  // compute total client-side from payment fields.
  let q = supabase
    .from('product_sales')
    .select('*, seller:sold_by(id, name)')
    .eq('branch_id', me.branch_id)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (dateFrom) q = q.gte('date', dateFrom);
  if (dateTo)   q = q.lte('date', dateTo);
  if (search)   q = q.ilike('patient_name', `%${search}%`);

  const { data, error } = await q;
  if (error) { console.error(error); showToast('error', 'DB Error', error.message); return []; }
  // Compute total from payment fields (matches the view's computation)
  return (data || []).map(s => ({
    ...s,
    total: (s.payment_cash||0) + (s.payment_visa||0) + (s.payment_cliq||0) - (s.discount||0)
  }));
}

async function getSaleItems(saleId) {
  const { data, error } = await supabase
    .from('sale_items')
    .select('*, item:inventory_id(id, name, unit, cost)')
    .eq('sale_id', saleId)
    .order('created_at');
  if (error) { console.error(error); return []; }
  return data || [];
}

/**
 * Create a product_sale header + its line items, deducting stock.
 */
async function saveProductSale(sale, items) {
  let payload = {
    date:         sale.date,
    patient_name: sale.patientName,
    file_number:  sale.fileNumber  || null,
    sold_by:      sale.soldBy      || null,
    payment_cash: parseFloat(sale.cash     || 0),
    payment_visa: parseFloat(sale.visa     || 0),
    payment_cliq: parseFloat(sale.cliq     || 0),
    discount:     parseFloat(sale.discount  || 0),
    notes:        sale.notes  || null,
    branch_id:    me.branch_id,
    created_by:   me.id
  };
  let { data: saleData, error: saleErr } = await supabase
    .from('product_sales').insert(payload).select().single();
  // Graceful fallback: if sold_by column doesn't exist yet, retry without it
  if (saleErr && saleErr.message?.includes('sold_by')) {
    delete payload.sold_by;
    ({ data: saleData, error: saleErr } = await supabase
      .from('product_sales').insert(payload).select().single());
    if (!saleErr) showToast('warn', 'Migration needed', 'Run migration_v4b.sql to track Sold By.');
  }
  if (saleErr) throw saleErr;

  const cleanItems = (items || []).filter(i => i.inventoryId && parseFloat(i.qty) > 0);
  if (cleanItems.length > 0) {
    const payload = cleanItems.map(i => ({
      sale_id:      saleData.id,
      inventory_id: i.inventoryId,
      qty:          parseFloat(i.qty),
      unit_price:   parseFloat(i.unitPrice || 0),
      branch_id:    me.branch_id
    }));
    const { error: itemErr } = await supabase.from('sale_items').insert(payload);
    if (itemErr) throw itemErr;

    for (const i of cleanItems) {
      await updateStock(i.inventoryId, -parseFloat(i.qty));
    }
  }
  return saleData;
}

/**
 * Delete a product_sale. CASCADE removes sale_items.
 * Stock is NOT restored (sales are final; use inventory adjustment if needed).
 */
async function deleteProductSale(id) {
  const { error } = await supabase.from('product_sales').delete().eq('id', id);
  if (error) throw error;
}

// ─── STAFF (profiles) ─────────────────────────────
async function getAllProfiles() {
  let q = supabase.from('profiles').select('*, branches(name)').order('name');
  if (!isAdmin()) q = q.eq('branch_id', me.branch_id);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return data || [];
}

async function saveProfile(profile) {
  const payload = {
    name:             profile.name,
    name_ar:          profile.nameAr   || null,
    role:             profile.role,
    branch_id:        profile.branchId || me.branch_id,
    salary:           parseFloat(profile.salary         || 0),
    commission_rate:  parseFloat(profile.commissionRate || 0),
    specialist_type:  profile.role === 'specialist' ? (profile.specialistType || 'standard') : 'standard',
    phone:            profile.phone || null,
    avatar_color:     profile.avatarColor || '#0d7377',
    active:           profile.active !== false,
    permissions:      profile.permissions || DEFAULT_PERMISSIONS[profile.role] || {},
    requires_login:   profile.requiresLogin !== false
  };

  if (profile.id) {
    // Editing existing profile
    const { data, error } = await supabase.from('profiles').update(payload).eq('id', profile.id).select().single();
    if (error) throw error;
    return data;

  } else if (!profile.requiresLogin) {
    // ── Work-only staff (no app login) ──
    // Just insert a profile record with a random UUID — no auth account needed
    const id = crypto.randomUUID();
    const { data, error } = await supabase.from('profiles').insert({ id, ...payload, requires_login: false }).select().single();
    if (error) throw error;
    return data;

  } else {
    // ── Login staff — create Supabase auth account ──
    // Store admin's current session so we can restore it after signUp
    const { data: { session: adminSession } } = await supabase.auth.getSession();

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email:    profile.email,
      password: profile.password,
      options:  { data: { name: profile.name } }
    });
    if (authError) throw authError;

    const userId = authData?.user?.id;
    if (!userId) throw new Error('User creation failed — no user ID returned.');

    // Insert the profile record
    const { data, error } = await supabase.from('profiles').insert({ id: userId, ...payload }).select().single();
    if (error) throw error;

    // Restore admin session (signUp replaces the session when email confirm is off)
    if (adminSession) {
      try {
        await supabase.auth.setSession({
          access_token:  adminSession.access_token,
          refresh_token: adminSession.refresh_token
        });
      } catch (e) { console.warn('Session restore warning (non-fatal):', e); }
    }
    return data;
  }
}

async function toggleProfileActive(id, active) {
  const { error } = await supabase.from('profiles').update({ active }).eq('id', id);
  if (error) throw error;
}

// ─── MONTHLY EXPENSES ─────────────────────────────
async function getMonthlyExpenses(month, year) {
  const { data, error } = await supabase.from('monthly_expenses')
    .select('*').eq('branch_id', me.branch_id)
    .eq('month', month).eq('year', year).order('category');
  if (error) { console.error(error); return []; }
  return data || [];
}

/**
 * Fetch expenses for a date range — used by the flexible Reports page.
 * Includes expenses whose (month, year) falls within the given date window.
 */
async function getExpenses({ dateFrom, dateTo } = {}) {
  const { data, error } = await supabase.from('monthly_expenses')
    .select('*').eq('branch_id', me.branch_id).order('year').order('month').order('category');
  if (error) { console.error(error); return []; }

  // Client-side date-range filter: include expense records whose month/year
  // overlaps with the selected period (or whose date_from/date_to overlap).
  const from = dateFrom ? new Date(dateFrom) : null;
  const to   = dateTo   ? new Date(dateTo)   : null;

  return (data || []).filter(exp => {
    // If expense has explicit date_from/date_to, use those for overlap check
    if (exp.date_from && exp.date_to) {
      const ef = new Date(exp.date_from);
      const et = new Date(exp.date_to);
      if (from && et < from) return false;
      if (to   && ef > to)   return false;
      return true;
    }
    // Otherwise use month/year — treat as entire month
    const eFrom = new Date(exp.year, exp.month - 1, 1);
    const eTo   = new Date(exp.year, exp.month, 0);   // last day of month
    if (from && eTo < from) return false;
    if (to   && eFrom > to) return false;
    return true;
  });
}

async function saveMonthlyExpense(exp) {
  const payload = {
    month: exp.month, year: exp.year,
    category: exp.category || 'other',
    description: exp.description || null,
    amount: parseFloat(exp.amount),
    date_from: exp.dateFrom || null,
    date_to:   exp.dateTo   || null,
    branch_id: me.branch_id, created_by: me.id
  };
  if (exp.id) {
    const { data, error } = await supabase.from('monthly_expenses').update(payload).eq('id', exp.id).select().single();
    if (error) throw error; return data;
  } else {
    const { data, error } = await supabase.from('monthly_expenses').insert(payload).select().single();
    if (error) throw error; return data;
  }
}

async function deleteMonthlyExpense(id) {
  const { error } = await supabase.from('monthly_expenses').delete().eq('id', id);
  if (error) throw error;
}

// ─── ATTENDANCE ───────────────────────────────────
async function getAttendance({ date, staffId, month, year } = {}) {
  let q = supabase.from('attendance').select('*, staff:staff_id(name, role)')
    .eq('branch_id', me.branch_id).order('date', { ascending: false });
  if (date)    q = q.eq('date', date);
  if (staffId) q = q.eq('staff_id', staffId);
  if (month && year) {
    const from = `${year}-${String(month).padStart(2,'0')}-01`;
    const to   = new Date(year, month, 0).toISOString().split('T')[0];
    q = q.gte('date', from).lte('date', to);
  }
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return data || [];
}

async function saveAttendance(entry) {
  const payload = {
    staff_id: entry.staffId, date: entry.date,
    check_in: entry.checkIn || null, check_out: entry.checkOut || null,
    notes: entry.notes || null, branch_id: me.branch_id
  };
  const { data, error } = await supabase.from('attendance')
    .upsert(payload, { onConflict: 'staff_id,date' }).select().single();
  if (error) throw error; return data;
}

// ─── IMPORT LOG ───────────────────────────────────
async function logImport(importType, filename, rowsTotal, rowsSuccess, rowsFailed, errorLog) {
  await supabase.from('import_logs').insert({
    import_type: importType, filename, rows_total: rowsTotal,
    rows_success: rowsSuccess, rows_failed: rowsFailed,
    error_log: errorLog, branch_id: me.branch_id, imported_by: me.id
  });
}

// ─── BRANCHES ─────────────────────────────────────
async function getBranches() {
  const { data, error } = await supabase.from('branches').select('*').order('name');
  if (error) { console.error(error); return []; }
  return data || [];
}

async function saveBranch(branch) {
  const payload = { name: branch.name, name_ar: branch.nameAr || null, phone: branch.phone || null };
  if (branch.id) {
    const { data, error } = await supabase.from('branches').update(payload).eq('id', branch.id).select().single();
    if (error) throw error; return data;
  } else {
    const { data, error } = await supabase.from('branches').insert(payload).select().single();
    if (error) throw error; return data;
  }
}

// ─── CUSTOMERS ────────────────────────────────────
async function getCustomers({ search, inactiveDays } = {}) {
  let q = supabase.from('customers').select('*').eq('branch_id', me.branch_id).order('name');
  if (search) q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
  if (inactiveDays) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - inactiveDays);
    q = q.lt('last_visit', cutoff.toISOString().split('T')[0]);
  }
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return data || [];
}

// ─── PUBLIC: procedures & doctors for booking page ─
async function getPublicProcedures(branchId) {
  const { data, error } = await supabase.from('procedures').select('*').eq('active', true).eq('branch_id', branchId).order('name');
  if (error) { console.error(error); return []; }
  return data || [];
}

async function getPublicDoctors(branchId) {
  const { data, error } = await supabase.from('profiles').select('id,name,name_ar,role')
    .eq('role', 'doctor').eq('branch_id', branchId).eq('active', true).order('name');
  if (error) { console.error(error); return []; }
  return data || [];
}

async function getBookedSlots(doctorId, date) {
  const { data, error } = await supabase.from('appointments')
    .select('time').eq('doctor_id', doctorId).eq('date', date)
    .in('status', ['pending', 'confirmed']);
  if (error) { console.error(error); return []; }
  return (data || []).map(r => r.time.slice(0,5));
}

async function submitPublicBooking(booking) {
  const { data, error } = await supabase.from('appointments').insert({
    customer_name:  booking.customerName,
    customer_phone: booking.customerPhone,
    doctor_id:      booking.doctorId,
    procedure_id:   booking.procedureId,
    date:           booking.date,
    time:           booking.time,
    notes:          booking.notes || null,
    branch_id:      booking.branchId,
    status:         'pending'
  }).select().single();
  if (error) throw error;
  return data;
}

// ─── BANK DEPOSITS ────────────────────────────────
async function getBankDeposits({ dateFrom, dateTo } = {}) {
  let q = supabase.from('bank_deposits')
    .select('*, created_by_profile:created_by(name)')
    .eq('branch_id', me.branch_id)
    .order('date', { ascending: false });
  if (dateFrom) q = q.gte('date', dateFrom);
  if (dateTo)   q = q.lte('date', dateTo);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return data || [];
}

async function saveBankDeposit(dep) {
  const payload = {
    date:        dep.date,
    amount:      parseFloat(dep.amount),
    description: dep.description || null,
    branch_id:   me.branch_id,
    created_by:  me.id
  };
  if (dep.id) {
    const { data, error } = await supabase.from('bank_deposits').update(payload).eq('id', dep.id).select().single();
    if (error) throw error; return data;
  } else {
    const { data, error } = await supabase.from('bank_deposits').insert(payload).select().single();
    if (error) throw error; return data;
  }
}

async function deleteBankDeposit(id) {
  const { error } = await supabase.from('bank_deposits').delete().eq('id', id);
  if (error) throw error;
}

// ─── DAILY NOTES ──────────────────────────────────
async function getDailyNotes(date) {
  const { data, error } = await supabase.from('daily_notes')
    .select('*, author:created_by(name, role)')
    .eq('branch_id', me.branch_id)
    .eq('date', date)
    .order('created_at', { ascending: false });
  if (error) { console.error(error); return []; }
  return data || [];
}

async function saveDailyNote(note) {
  const payload = {
    date:      note.date,
    content:   note.content,
    branch_id: me.branch_id,
    created_by: me.id
  };
  if (note.id) {
    const { data, error } = await supabase.from('daily_notes').update(payload).eq('id', note.id).select().single();
    if (error) throw error; return data;
  } else {
    const { data, error } = await supabase.from('daily_notes').insert(payload).select().single();
    if (error) throw error; return data;
  }
}

async function deleteDailyNote(id) {
  const { error } = await supabase.from('daily_notes').delete().eq('id', id);
  if (error) throw error;
}
