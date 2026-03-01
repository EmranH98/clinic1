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

async function getOperations({ date, month, year, specialistId, doctorId, branchId, search } = {}) {
  let q = supabase.from('operations_with_total').select(`
    *,
    specialist:specialist_id(id, name),
    doctor:doctor_id(id, name),
    procedure:procedure_id(id, name, name_ar, doctor_profit_pct, specialist_commission)
  `).order('date', { ascending: false }).order('created_at', { ascending: false });

  // Branch filter (always applied unless admin with view_all_branches)
  if (!hasPerm('view_all_branches')) {
    q = q.eq('branch_id', me.branch_id || branchId);
  } else if (branchId) {
    q = q.eq('branch_id', branchId);
  }

  // Specialists only see their own rows (unless they have view_all_staff_ops)
  if (me.role === 'specialist' && !hasPerm('view_all_staff_ops')) {
    q = q.eq('specialist_id', me.id);
  }

  if (date)        q = q.eq('date', date);
  if (month && year) {
    const from = `${year}-${String(month).padStart(2,'0')}-01`;
    const to   = new Date(year, month, 0).toISOString().split('T')[0];
    q = q.gte('date', from).lte('date', to);
  }
  if (specialistId) q = q.eq('specialist_id', specialistId);
  if (doctorId)     q = q.eq('doctor_id', doctorId);
  if (search)       q = q.or(`patient_name.ilike.%${search}%,file_number.ilike.%${search}%`);

  const { data, error } = await q;
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
    created_by:    me.id
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
async function getLaserEntries({ date, specialistId, month, year } = {}) {
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
async function getInventory({ search } = {}) {
  let q = supabase.from('inventory').select('*').eq('branch_id', me.branch_id).order('name');
  if (search) q = q.ilike('name', `%${search}%`);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return data || [];
}

async function saveInventoryItem(item) {
  const payload = {
    name: item.name, category: item.category || null,
    qty: parseFloat(item.qty || 0), min_qty: parseFloat(item.minQty || 0),
    unit: item.unit || 'pcs', cost: parseFloat(item.cost || 0),
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
    name: profile.name, name_ar: profile.nameAr || null,
    role: profile.role, branch_id: profile.branchId || me.branch_id,
    salary: parseFloat(profile.salary || 0),
    commission_rate: parseFloat(profile.commissionRate || 0),
    phone: profile.phone || null,
    avatar_color: profile.avatarColor || '#0d7377',
    active: profile.active !== false,
    permissions: profile.permissions || DEFAULT_PERMISSIONS[profile.role] || {}
  };

  if (profile.id) {
    const { data, error } = await supabase.from('profiles').update(payload).eq('id', profile.id).select().single();
    if (error) throw error; return data;
  } else {
    // Create auth user first (requires admin edge function)
    const { data: authData, error: authError } = await supabase.functions.invoke('admin-create-user', {
      body: { email: profile.email, password: profile.password, name: profile.name }
    });
    if (authError) throw authError;
    const userId = authData.userId;
    const { data, error } = await supabase.from('profiles').insert({ id: userId, ...payload }).select().single();
    if (error) throw error; return data;
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

async function saveMonthlyExpense(exp) {
  const payload = {
    month: exp.month, year: exp.year,
    category: exp.category || 'other',
    description: exp.description || null,
    amount: parseFloat(exp.amount),
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
