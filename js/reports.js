// =====================================================
// ClinicOS v4 — Reports & Reconciliation
// =====================================================

// ─── Report State (persists across page navigations) ─
let _reportDateFrom = '';
let _reportDateTo   = '';
let _reportPreset   = 'month';
let _reportBranchId = null;

// ─── Date Helpers ─────────────────────────────────
function _rptFmt(d)  { return d.toISOString().slice(0, 10); }
function _rptToday() { return _rptFmt(new Date()); }

function _initReportDates() {
  if (_reportDateFrom) return; // Already set — preserve user's selection
  const now = new Date();
  _reportDateFrom = _rptFmt(new Date(now.getFullYear(), now.getMonth(), 1));
  _reportDateTo   = _rptFmt(new Date(now.getFullYear(), now.getMonth() + 1, 0));
}

function setReportPreset(p) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();

  if (p === 'today') {
    _reportDateFrom = _reportDateTo = _rptToday();
  } else if (p === 'week') {
    const day  = now.getDay();                  // 0=Sun
    const diff = day === 0 ? -6 : 1 - day;     // offset to Monday
    const mon  = new Date(now); mon.setDate(now.getDate() + diff);
    _reportDateFrom = _rptFmt(mon);
    _reportDateTo   = _rptToday();
  } else if (p === 'month') {
    _reportDateFrom = _rptFmt(new Date(y, m, 1));
    _reportDateTo   = _rptFmt(new Date(y, m + 1, 0));
  } else if (p === 'last_month') {
    _reportDateFrom = _rptFmt(new Date(y, m - 1, 1));
    _reportDateTo   = _rptFmt(new Date(y, m, 0));
  }
  // 'custom' — don't change the dates; just switch preset so UI shows pickers
  _reportPreset = p;
  _syncRptUI();
  loadMonthEnd();
}

function applyCustomRange() {
  const f = document.getElementById('rptFrom')?.value;
  const t = document.getElementById('rptTo')?.value;
  if (f) _reportDateFrom = f;
  if (t) _reportDateTo   = t;
  _reportPreset = 'custom';
  _syncRptUI();
  loadMonthEnd();
}

function _syncRptUI() {
  // Sync date inputs
  const fromEl = document.getElementById('rptFrom');
  const toEl   = document.getElementById('rptTo');
  if (fromEl) fromEl.value = _reportDateFrom;
  if (toEl)   toEl.value   = _reportDateTo;
  // Show / hide custom row
  const customRow = document.getElementById('rptCustomRow');
  if (customRow) customRow.style.display = _reportPreset === 'custom' ? 'flex' : 'none';
  // Toggle active button
  ['today','week','month','last_month','custom'].forEach(id => {
    const btn = document.getElementById(`rptBtn-${id}`);
    if (!btn) return;
    btn.classList.toggle('btn-primary',   id === _reportPreset);
    btn.classList.toggle('btn-secondary', id !== _reportPreset);
  });
}

function _rptPeriodLabel() {
  if (!_reportDateFrom || !_reportDateTo) return '';
  const from = new Date(_reportDateFrom + 'T00:00:00');
  const to   = new Date(_reportDateTo   + 'T00:00:00');

  // Single day
  if (_reportDateFrom === _reportDateTo) {
    return from.toLocaleDateString('en', { weekday:'short', day:'numeric', month:'long', year:'numeric' });
  }
  // Full calendar month?
  const firstOfMon = new Date(from.getFullYear(), from.getMonth(), 1);
  const lastOfMon  = new Date(to.getFullYear(), to.getMonth() + 1, 0);
  if (from.getTime() === firstOfMon.getTime() && to.getTime() === lastOfMon.getTime() &&
      from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()) {
    return from.toLocaleDateString('en', { month:'long', year:'numeric' });
  }
  // Custom range
  const fmt = { day:'numeric', month:'short', year:'numeric' };
  return `${from.toLocaleDateString('en', fmt)} – ${to.toLocaleDateString('en', fmt)}`;
}

function _expPeriodLabel(e) {
  if (e.date_from && e.date_to) {
    const f = new Date(e.date_from + 'T00:00:00');
    const t = new Date(e.date_to   + 'T00:00:00');
    const fStr = f.toLocaleDateString('en', { day:'numeric', month:'short' });
    const tStr = t.toLocaleDateString('en', { day:'numeric', month:'short' });
    return `${fStr} – ${tStr}, ${t.getFullYear()}`;
  }
  if (e.month && e.year) {
    return new Date(e.year, e.month - 1, 1).toLocaleDateString('en', { month:'short', year:'numeric' });
  }
  return '—';
}

// Helper: get CSS classes for preset button based on current active state
function _rbc(id) { return id === _reportPreset ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'; }

// ─── Month-End Report Page ─────────────────────────
async function pgMonthEnd() {
  if (!hasPerm('view_month_end')) { showToast('error','Access Denied','Report is restricted.'); return; }
  setMeta('Reports', 'Finance › Reports');
  _initReportDates();
  if (!_reportBranchId) _reportBranchId = me.branch_id;

  const branchSel = isManager() && _branches.length > 1 ? `
    <select id="meBranch"
      style="padding:9px 13px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:14px;outline:none"
      onchange="_reportBranchId=this.value;loadMonthEnd()">
      ${_branches.map(b=>`<option value="${b.id}"${b.id===_reportBranchId?' selected':''}>${esc(b.name)}</option>`).join('')}
    </select>` : '';

  document.getElementById('pageContent').innerHTML = `
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:16px">
      <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px">
        <span style="font-size:13px;color:var(--ink3);font-weight:600;white-space:nowrap">📅 Period:</span>
        <button id="rptBtn-today"      class="${_rbc('today')}"      onclick="setReportPreset('today')">Today</button>
        <button id="rptBtn-week"       class="${_rbc('week')}"       onclick="setReportPreset('week')">This Week</button>
        <button id="rptBtn-month"      class="${_rbc('month')}"      onclick="setReportPreset('month')">This Month</button>
        <button id="rptBtn-last_month" class="${_rbc('last_month')}" onclick="setReportPreset('last_month')">Last Month</button>
        <button id="rptBtn-custom"     class="${_rbc('custom')}"     onclick="setReportPreset('custom')">Custom ▾</button>
        <div id="rptCustomRow" style="display:${_reportPreset==='custom'?'flex':'none'};align-items:center;gap:8px;flex-wrap:wrap">
          <input type="date" id="rptFrom" value="${_reportDateFrom}"
            style="padding:7px 10px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px">
          <span style="color:var(--ink3);font-weight:600">→</span>
          <input type="date" id="rptTo"   value="${_reportDateTo}"
            style="padding:7px 10px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px">
          <button class="btn btn-primary btn-sm" onclick="applyCustomRange()">Apply</button>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          ${branchSel}
          <button class="btn btn-secondary btn-sm" onclick="loadMonthEnd()">🔄</button>
          <button class="btn btn-secondary btn-sm" onclick="printMonthEnd()">🖨️ Print</button>
          <button class="btn btn-secondary btn-sm" onclick="exportMonthEndExcel()">📥 Excel</button>
        </div>
      </div>
    </div>
    <div id="meContent"><div class="empty-state"><div class="spinner"></div><p>Loading…</p></div></div>
  `;

  await loadMonthEnd();
}

async function loadMonthEnd() {
  const branchId = _reportBranchId || me.branch_id;
  const branch   = getBranch(branchId);

  const [ops, expenses, staffProfiles, laserEntries] = await Promise.all([
    getOperations({ dateFrom: _reportDateFrom, dateTo: _reportDateTo }),
    getExpenses({ dateFrom: _reportDateFrom, dateTo: _reportDateTo }),
    getAllProfiles(),
    getLaserEntries({ dateFrom: _reportDateFrom, dateTo: _reportDateTo })
  ]);

  const period = _rptPeriodLabel();

  // Derive month/year from start date — used when adding a new expense
  const fromD    = new Date(_reportDateFrom + 'T00:00:00');
  const expMonth = fromD.getMonth() + 1;
  const expYear  = fromD.getFullYear();

  // ── Revenue breakdown ────────────────────────────
  let totalCash = 0, totalVisa = 0, totalCliq = 0, totalShot = 0, totalDiscount = 0;
  ops.forEach(o => {
    totalCash     += o.payment_cash     || 0;
    totalVisa     += o.payment_visa     || 0;
    totalCliq     += o.payment_cliq     || 0;
    totalShot     += o.payment_shot     || 0;
    totalDiscount += o.discount         || 0;
  });
  const grossRevenue = totalCash + totalVisa + totalCliq + totalShot;
  const netRevenue   = grossRevenue - totalDiscount;

  // ── Doctor commissions ───────────────────────────
  const doctorMap = {};
  ops.forEach(o => {
    if (!o.doctor_id) return;
    const total  = (o.payment_cash||0) + (o.payment_visa||0) + (o.payment_cliq||0) + (o.payment_shot||0) - (o.discount||0);
    const pct    = o.procedure?.doctor_profit_pct ?? 50;
    const earned = total * (pct / 100);
    if (!doctorMap[o.doctor_id]) doctorMap[o.doctor_id] = { name: o.doctor?.name || '?', sessions: 0, earned: 0 };
    doctorMap[o.doctor_id].sessions++;
    doctorMap[o.doctor_id].earned += earned;
  });
  const totalDoctorComm = Object.values(doctorMap).reduce((s,d) => s + d.earned, 0);

  // ── Specialist commissions ───────────────────────
  const specMap = {};
  ops.forEach(o => {
    if (!o.specialist_id) return;
    const spec     = o.specialist || {};
    const specType = spec.specialist_type || 'standard';
    const isPct    = specType === 'nutritionist' || specType === 'men_laser';
    let commission;
    if (isPct) {
      const tot = (o.payment_cash||0)+(o.payment_visa||0)+(o.payment_cliq||0)+(o.payment_shot||0)-(o.discount||0);
      commission = tot * ((spec.commission_rate || 0) / 100);
    } else {
      commission = o.specialist_commission_override ?? (o.procedure?.specialist_commission ?? 0);
    }
    if (!specMap[o.specialist_id]) {
      specMap[o.specialist_id] = { name: spec.name || '?', sessions: 0, commission: 0, isPct, rate: spec.commission_rate || 0 };
    }
    specMap[o.specialist_id].sessions++;
    specMap[o.specialist_id].commission += commission;
  });
  const totalSpecComm = Object.values(specMap).reduce((s,d) => s + d.commission, 0);

  // ── Staff salaries ───────────────────────────────
  const salaryStaff = staffProfiles.filter(p =>
    p.branch_id === branchId && p.salary > 0 && !['doctor','specialist'].includes(p.role)
  );
  const totalSalaries = salaryStaff.reduce((s,p) => s + (p.salary || 0), 0);

  // ── Other expenses ───────────────────────────────
  const totalOtherExp = expenses.reduce((s,e) => s + e.amount, 0);

  // ── Totals ───────────────────────────────────────
  const totalExpenses = totalDoctorComm + totalSpecComm + totalSalaries + totalOtherExp;
  const netProfit     = netRevenue - totalExpenses;

  // ── Laser counter ────────────────────────────────
  const totalShots = laserEntries.reduce((s,l) => s + l.shots_used, 0);

  document.getElementById('meContent').innerHTML = `
    <div id="monthEndPrintArea">

      <!-- Report Header -->
      <div class="card mb16" style="background:var(--teal);color:#fff;border:none">
        <div class="card-body" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-family:'Playfair Display',serif;font-size:22px;font-weight:700">Financial Report</div>
            <div style="opacity:0.8;font-size:14px;margin-top:4px">${esc(period)} · ${esc(branch?.name || 'Branch')}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:13px;opacity:0.8">Generated: ${new Date().toLocaleDateString()}</div>
            <div style="font-size:13px;opacity:0.8">${ops.length} operations recorded</div>
          </div>
        </div>
      </div>

      <!-- Payment method totals -->
      <div class="stats-row mb16">
        <div class="sc"><div class="sc-top"><div class="sc-icon bg-green">💵</div></div>
          <div class="sc-label">Cash</div><div class="sc-val">${totalCash.toFixed(2)}</div><div class="sc-sub">${CURRENCY}</div></div>
        <div class="sc"><div class="sc-top"><div class="sc-icon bg-blue">💳</div></div>
          <div class="sc-label">Visa</div><div class="sc-val">${totalVisa.toFixed(2)}</div><div class="sc-sub">${CURRENCY}</div></div>
        <div class="sc"><div class="sc-top"><div class="sc-icon bg-cliq">📲</div></div>
          <div class="sc-label">CliQ</div><div class="sc-val">${totalCliq.toFixed(2)}</div><div class="sc-sub">${CURRENCY}</div></div>
        <div class="sc"><div class="sc-top"><div class="sc-icon bg-amber">🎯</div></div>
          <div class="sc-label">Shots</div><div class="sc-val">${totalShot.toFixed(2)}</div><div class="sc-sub">${CURRENCY}</div></div>
      </div>

      <div class="g2 mb16">
        <!-- Revenue & Expense Summary -->
        <div class="card">
          <div class="card-header"><div class="card-title">📊 Revenue & Expense Summary</div></div>
          <div class="card-body" style="padding:0">
            <table>
              <tbody>
                <tr><td colspan="2" style="padding:10px 16px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;color:var(--ink3);background:var(--bg)">Revenue</td></tr>
                <tr>
                  <td style="padding:10px 16px">Gross Revenue</td>
                  <td style="padding:10px 16px;font-weight:600;text-align:right">${grossRevenue.toFixed(2)} ${CURRENCY}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;color:var(--red)">Discounts Given</td>
                  <td style="padding:10px 16px;font-weight:600;text-align:right;color:var(--red)">-${totalDiscount.toFixed(2)} ${CURRENCY}</td>
                </tr>
                <tr style="background:var(--green-light)">
                  <td style="padding:10px 16px;font-weight:700;color:var(--green)">Net Revenue</td>
                  <td style="padding:10px 16px;font-weight:700;text-align:right;color:var(--green)">${netRevenue.toFixed(2)} ${CURRENCY}</td>
                </tr>
                <tr><td colspan="2" style="padding:10px 16px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;color:var(--ink3);background:var(--bg)">Expenses</td></tr>
                <tr>
                  <td style="padding:10px 16px">Doctor Commissions</td>
                  <td style="padding:10px 16px;font-weight:600;text-align:right;color:var(--red)">-${totalDoctorComm.toFixed(2)} ${CURRENCY}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px">Specialist Commissions</td>
                  <td style="padding:10px 16px;font-weight:600;text-align:right;color:var(--red)">-${totalSpecComm.toFixed(2)} ${CURRENCY}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px">Staff Salaries</td>
                  <td style="padding:10px 16px;font-weight:600;text-align:right;color:var(--red)">-${totalSalaries.toFixed(2)} ${CURRENCY}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px">Other Expenses</td>
                  <td style="padding:10px 16px;font-weight:600;text-align:right;color:var(--red)">-${totalOtherExp.toFixed(2)} ${CURRENCY}</td>
                </tr>
                <tr style="background:var(--bg)">
                  <td style="padding:10px 16px;font-weight:700">Total Expenses</td>
                  <td style="padding:10px 16px;font-weight:700;text-align:right;color:var(--red)">-${totalExpenses.toFixed(2)} ${CURRENCY}</td>
                </tr>
                <tr style="background:${netProfit >= 0 ? 'var(--green-light)' : 'var(--red-light)'}">
                  <td style="padding:12px 16px;font-weight:800;font-size:16px;color:${netProfit >= 0 ? 'var(--green)' : 'var(--red)'}">Net Profit</td>
                  <td style="padding:12px 16px;font-weight:800;font-size:16px;text-align:right;color:${netProfit >= 0 ? 'var(--green)' : 'var(--red)'}">${netProfit >= 0 ? '+' : ''}${netProfit.toFixed(2)} ${CURRENCY}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Right column: commission breakdowns -->
        <div style="display:flex;flex-direction:column;gap:16px">
          <!-- Doctor breakdown -->
          <div class="card">
            <div class="card-header"><div class="card-title">👨‍⚕️ Doctor Commissions</div></div>
            <div class="tbl-wrap"><table>
              <thead><tr><th>Doctor</th><th>Sessions</th><th>Commission</th></tr></thead>
              <tbody>
                ${Object.values(doctorMap).length === 0
                  ? `<tr><td colspan="3" style="text-align:center;color:var(--ink3);padding:16px">No doctor data for this period</td></tr>`
                  : Object.values(doctorMap).map(d => `
                    <tr>
                      <td>${esc(d.name)}</td>
                      <td>${d.sessions}</td>
                      <td style="font-weight:700;color:var(--teal)">${d.earned.toFixed(2)} ${CURRENCY}</td>
                    </tr>`).join('')}
              </tbody>
              <tfoot><tr><td>Total</td><td>—</td><td>${totalDoctorComm.toFixed(2)} ${CURRENCY}</td></tr></tfoot>
            </table></div>
          </div>

          <!-- Specialist breakdown -->
          <div class="card">
            <div class="card-header"><div class="card-title">💆 Specialist Commissions</div></div>
            <div class="tbl-wrap"><table>
              <thead><tr><th>Specialist</th><th>Type</th><th>Sessions</th><th>Commission</th></tr></thead>
              <tbody>
                ${Object.values(specMap).length === 0
                  ? `<tr><td colspan="4" style="text-align:center;color:var(--ink3);padding:16px">No specialist data for this period</td></tr>`
                  : Object.values(specMap).map(s => `
                    <tr>
                      <td>${esc(s.name)}</td>
                      <td>${s.isPct
                        ? `<span class="badge bg-amber">${s.rate}%</span>`
                        : `<span class="badge bg-gray">Fixed</span>`}</td>
                      <td>${s.sessions}</td>
                      <td style="font-weight:700;color:var(--teal)">${s.commission.toFixed(2)} ${CURRENCY}</td>
                    </tr>`).join('')}
              </tbody>
              <tfoot><tr><td colspan="2">Total</td><td>—</td><td>${totalSpecComm.toFixed(2)} ${CURRENCY}</td></tr></tfoot>
            </table></div>
          </div>
        </div>
      </div>

      <!-- Other Expenses Section -->
      <div class="card mb16">
        <div class="card-header">
          <div>
            <div class="card-title">📋 Other Expenses</div>
            <div class="card-sub">Rent, utilities, consumables, etc.</div>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="openAddExpenseModal(${expMonth},${expYear})">+ Add Expense</button>
        </div>
        ${expenses.length === 0
          ? `<div class="card-body"><div class="empty-state" style="padding:24px">
               <div class="ei" style="font-size:32px">📋</div>
               <p>No expenses recorded for this period.</p>
             </div></div>`
          : `<div class="tbl-wrap"><table>
               <thead>
                 <tr><th>Category</th><th>Description</th><th>Period</th><th>Amount</th><th></th></tr>
               </thead>
               <tbody>
                 ${expenses.map(e => `
                   <tr>
                     <td><span class="badge bg-gray">${esc(e.category)}</span></td>
                     <td>${esc(e.description || '—')}</td>
                     <td style="color:var(--ink3);font-size:12px;white-space:nowrap">${_expPeriodLabel(e)}</td>
                     <td style="font-weight:600">${e.amount.toFixed(2)} ${CURRENCY}</td>
                     <td><button class="btn btn-danger btn-xs" onclick="removeExpense('${e.id}')">✕</button></td>
                   </tr>`).join('')}
               </tbody>
               <tfoot>
                 <tr><td colspan="3">Total Other Expenses</td><td>${totalOtherExp.toFixed(2)} ${CURRENCY}</td><td></td></tr>
               </tfoot>
             </table></div>`}
      </div>

      <!-- Laser Counter Summary -->
      ${laserEntries.length > 0 ? `
      <div class="card">
        <div class="card-header"><div class="card-title">⚡ Laser Machine Counter</div></div>
        <div class="tbl-wrap"><table>
          <thead><tr><th>Date</th><th>Specialist</th><th>Start</th><th>End</th><th>Shots Used</th></tr></thead>
          <tbody>
            ${laserEntries.map(l => `
              <tr>
                <td>${l.date}</td>
                <td>${esc(l.specialist?.name || '—')}</td>
                <td>${l.start_count}</td>
                <td>${l.end_count}</td>
                <td style="font-weight:700">${l.shots_used}</td>
              </tr>`).join('')}
          </tbody>
          <tfoot><tr><td colspan="4">Total Shots Used</td><td>${totalShots}</td></tr></tfoot>
        </table></div>
      </div>` : ''}

    </div>
  `;
}

// ─── Add Expense Modal ─────────────────────────────
function openAddExpenseModal(month, year) {
  openModal('Add Expense', `
    <div class="field"><label>Category</label>
      <select id="expCat">
        <option value="rent">Rent</option>
        <option value="utilities">Utilities</option>
        <option value="consumables">Consumables / Supplies</option>
        <option value="other" selected>Other</option>
      </select>
    </div>
    <div class="field">
      <label>Description</label>
      <input type="text" id="expDesc" placeholder="e.g. Monthly rent, Laser gel supplies…">
    </div>
    <div class="field">
      <label>Amount (${CURRENCY})</label>
      <input type="number" id="expAmt" min="0" step="0.01" placeholder="0.00">
    </div>
    <div class="g2">
      <div class="field">
        <label>Period From <span style="color:var(--ink3);font-weight:400">(optional)</span></label>
        <input type="date" id="expFrom">
      </div>
      <div class="field">
        <label>Period To <span style="color:var(--ink3);font-weight:400">(optional)</span></label>
        <input type="date" id="expTo">
      </div>
    </div>
    <p style="font-size:12px;color:var(--ink3);margin-top:2px">Leave period blank to use the selected month as default.</p>
  `, [
    { label: 'Cancel',      cls: 'btn-secondary', action: 'closeModal()' },
    { label: 'Add Expense', cls: 'btn-primary',   action: `addExpenseFromModal(${month},${year})` }
  ]);
}

async function addExpenseFromModal(month, year) {
  const cat  = document.getElementById('expCat').value;
  const desc = document.getElementById('expDesc').value.trim();
  const amt  = parseFloat(document.getElementById('expAmt').value || 0);
  const from = document.getElementById('expFrom')?.value || null;
  const to   = document.getElementById('expTo')?.value   || null;
  if (!amt) { showToast('error','Invalid','Please enter a valid amount.'); return; }
  try {
    await saveMonthlyExpense({ month, year, category: cat, description: desc, amount: amt, date_from: from, date_to: to });
    closeModal();
    showToast('success','Expense Added', `${amt.toFixed(2)} ${CURRENCY} added.`);
    loadMonthEnd();
  } catch(e) { showToast('error','Error', e.message); }
}

async function removeExpense(id) {
  if (!confirm('Remove this expense?')) return;
  try { await deleteMonthlyExpense(id); loadMonthEnd(); }
  catch(e) { showToast('error','Error', e.message); }
}

// ─── Print / Export ────────────────────────────────
function printMonthEnd() {
  const area = document.getElementById('monthEndPrintArea');
  if (!area) return;
  document.getElementById('printTarget').innerHTML = area.innerHTML;
  window.print();
}

function exportMonthEndExcel() {
  const rows = [
    [`ClinicOS Financial Report`],
    [`Period: ${_rptPeriodLabel()}`],
    [],
    ['Section', 'Item', 'Amount'],
  ];
  document.querySelectorAll('#meContent table').forEach(tbl => {
    const title = tbl.closest('.card')?.querySelector('.card-title')?.textContent?.trim() || '';
    tbl.querySelectorAll('tbody tr, tfoot tr').forEach(tr => {
      const cells = [...tr.querySelectorAll('td,th')].map(td => td.textContent.trim().replace(/\s+/g,' '));
      if (cells.length >= 2) rows.push([title, ...cells]);
    });
    rows.push([]);
  });
  const csv  = rows.map(r => r.map(c => `"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `report-${_reportDateFrom}-to-${_reportDateTo}.csv`;
  a.click();
}

// ─── My Stats Page ─────────────────────────────────
async function pgMyStats() {
  setMeta('My Performance', 'Personal › My Stats');
  const now   = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();

  let ops = [];
  if (me.role === 'doctor') {
    ops = await getOperations({ doctorId: me.id, month, year });
  } else if (me.role === 'specialist') {
    ops = await getOperations({ specialistId: me.id, month, year });
  }

  const totalSessions = ops.length;
  const specType = me.specialist_type || 'standard';
  const isPct    = specType === 'nutritionist' || specType === 'men_laser';

  let totalEarned = 0;
  if (me.role === 'doctor') {
    totalEarned = ops.reduce((s,o) => {
      const tot = (o.payment_cash||0)+(o.payment_visa||0)+(o.payment_cliq||0)+(o.payment_shot||0)-(o.discount||0);
      return s + tot * ((o.procedure?.doctor_profit_pct ?? 50) / 100);
    }, 0);
  } else if (me.role === 'specialist') {
    if (isPct) {
      totalEarned = ops.reduce((s,o) => {
        const tot = (o.payment_cash||0)+(o.payment_visa||0)+(o.payment_cliq||0)+(o.payment_shot||0)-(o.discount||0);
        return s + tot * ((me.commission_rate || 0) / 100);
      }, 0);
    } else {
      totalEarned = ops.reduce((s,o) => s + (o.procedure?.specialist_commission ?? 0), 0) + (me.salary || 0);
    }
  }

  const period = now.toLocaleDateString('en', { month:'long', year:'numeric' });

  document.getElementById('pageContent').innerHTML = `
    <div class="stats-row" style="grid-template-columns:repeat(3,1fr);margin-bottom:24px">
      <div class="sc">
        <div class="sc-top"><div class="sc-icon bg-teal">📋</div></div>
        <div class="sc-label">Sessions This Month</div>
        <div class="sc-val">${totalSessions}</div>
        <div class="sc-sub">${period}</div>
      </div>
      <div class="sc">
        <div class="sc-top"><div class="sc-icon bg-green">💰</div></div>
        <div class="sc-label">My Earnings</div>
        <div class="sc-val">${totalEarned.toFixed(0)}</div>
        <div class="sc-sub">${CURRENCY} this month</div>
      </div>
      <div class="sc">
        <div class="sc-top"><div class="sc-icon bg-amber">📈</div></div>
        <div class="sc-label">Avg per Session</div>
        <div class="sc-val">${totalSessions ? (totalEarned / totalSessions).toFixed(0) : 0}</div>
        <div class="sc-sub">${CURRENCY}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div><div class="card-title">My Sessions — ${period}</div></div>
        <button class="btn btn-secondary btn-sm" onclick="exportMyStats()">📥 Export</button>
      </div>
      ${ops.length === 0
        ? `<div class="card-body"><div class="empty-state"><div class="ei">📋</div><p>No sessions recorded this month yet.</p></div></div>`
        : `<div class="tbl-wrap"><table>
             <thead><tr><th>Date</th><th>Patient</th><th>Session</th><th>My Earnings</th></tr></thead>
             <tbody>
               ${ops.map(o => {
                 let earned = 0;
                 if (me.role === 'doctor') {
                   const tot = (o.payment_cash||0)+(o.payment_visa||0)+(o.payment_cliq||0)+(o.payment_shot||0)-(o.discount||0);
                   earned = tot * ((o.procedure?.doctor_profit_pct ?? 50) / 100);
                 } else {
                   if (isPct) {
                     const tot = (o.payment_cash||0)+(o.payment_visa||0)+(o.payment_cliq||0)+(o.payment_shot||0)-(o.discount||0);
                     earned = tot * ((me.commission_rate || 0) / 100);
                   } else {
                     earned = o.procedure?.specialist_commission ?? 0;
                   }
                 }
                 return `<tr>
                   <td>${o.date}</td>
                   <td>${esc(o.patient_name)}</td>
                   <td>${esc(o.session_name || o.procedure?.name || '—')}</td>
                   <td style="font-weight:700;color:var(--teal)">${earned.toFixed(2)} ${CURRENCY}</td>
                 </tr>`;
               }).join('')}
             </tbody>
             <tfoot><tr><td colspan="3">Total</td><td>${totalEarned.toFixed(2)} ${CURRENCY}</td></tr></tfoot>
           </table></div>`}
    </div>
  `;
}

async function exportMyStats() {
  const rows = [['Date','Patient','Session','Earnings']];
  document.querySelectorAll('#pageContent table tbody tr').forEach(tr => {
    const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim());
    if (cells.length >= 4) rows.push(cells.slice(0, 4));
  });
  const csv  = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const now  = new Date();
  a.href = url;
  a.download = `my-stats-${now.getFullYear()}-${now.getMonth() + 1}.csv`;
  a.click();
  showToast('success','Exported','Your stats have been downloaded.');
}
