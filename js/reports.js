// =====================================================
// ClinicOS v3 — Reports & Month-End Reconciliation
// =====================================================

// ─── Month-End Report Page ────────────────────────
async function pgMonthEnd() {
  if (!hasPerm('view_month_end')) { showToast('error','Access Denied','Month-end report is restricted.'); return; }
  setMeta('Month-End Report', 'Finance › Month-End');

  const now = new Date();
  const months = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth()+1, label: d.toLocaleDateString('en',{month:'long',year:'numeric'}) });
  }

  document.getElementById('pageContent').innerHTML = `
    <div class="flex-center gap12 mb16">
      <select id="mePeriod" style="padding:9px 13px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:14px;outline:none" onchange="loadMonthEnd()">
        ${months.map((m,i)=>`<option value="${m.year}-${m.month}" ${i===0?'selected':''}>${m.label}</option>`).join('')}
      </select>
      ${isManager() && _branches.length > 1 ? `
      <select id="meBranch" style="padding:9px 13px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:14px;outline:none" onchange="loadMonthEnd()">
        ${_branches.map(b=>`<option value="${b.id}"${b.id===me.branch_id?' selected':''}>${b.name}</option>`).join('')}
      </select>` : ''}
      <button class="btn btn-secondary btn-sm" onclick="loadMonthEnd()">🔄 Refresh</button>
      <button class="btn btn-secondary btn-sm ml-auto" onclick="printMonthEnd()">🖨️ Print Report</button>
      <button class="btn btn-secondary btn-sm" onclick="exportMonthEndExcel()">📥 Export Excel</button>
    </div>
    <div id="meContent"><div class="empty-state"><div class="spinner"></div><p>Loading…</p></div></div>
  `;

  await loadMonthEnd();
}

async function loadMonthEnd() {
  const [yr, mo] = document.getElementById('mePeriod').value.split('-').map(Number);
  const branchId = document.getElementById('meBranch')?.value || me.branch_id;
  const branch   = getBranch(branchId);

  const [ops, expenses, staffProfiles, laserEntries] = await Promise.all([
    getOperations({ month: mo, year: yr }),
    getMonthlyExpenses(mo, yr),
    getAllProfiles(),
    getLaserEntries({ month: mo, year: yr })
  ]);

  const period = new Date(yr, mo-1, 1).toLocaleDateString('en',{month:'long',year:'numeric'});

  // ── Revenue breakdown ───────────────────────────
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

  // ── Doctor commissions ──────────────────────────
  const doctorMap = {};
  ops.forEach(o => {
    if (!o.doctor_id) return;
    const total  = (o.payment_cash + o.payment_visa + o.payment_cliq + o.payment_shot) - o.discount;
    const pct    = o.procedure?.doctor_profit_pct ?? 50;
    const earned = total * (pct / 100);
    if (!doctorMap[o.doctor_id]) doctorMap[o.doctor_id] = { name: o.doctor?.name || '?', sessions:0, earned:0 };
    doctorMap[o.doctor_id].sessions++;
    doctorMap[o.doctor_id].earned += earned;
  });
  const totalDoctorComm = Object.values(doctorMap).reduce((s,d)=>s+d.earned,0);

  // ── Specialist commissions ──────────────────────
  const specMap = {};
  ops.forEach(o => {
    if (!o.specialist_id) return;
    const commission = o.procedure?.specialist_commission ?? 0;
    if (!specMap[o.specialist_id]) specMap[o.specialist_id] = { name: o.specialist?.name || '?', sessions:0, commission:0 };
    specMap[o.specialist_id].sessions++;
    specMap[o.specialist_id].commission += commission;
  });
  const totalSpecComm = Object.values(specMap).reduce((s,d)=>s+d.commission,0);

  // ── Staff salaries ──────────────────────────────
  const salaryStaff = staffProfiles.filter(p =>
    p.branch_id === branchId && p.salary > 0 && !['doctor','specialist'].includes(p.role)
  );
  const totalSalaries = salaryStaff.reduce((s,p)=>s+(p.salary||0),0);

  // ── Other expenses ──────────────────────────────
  const totalOtherExp = expenses.reduce((s,e)=>s+e.amount,0);

  // ── Totals ──────────────────────────────────────
  const totalExpenses = totalDoctorComm + totalSpecComm + totalSalaries + totalOtherExp;
  const netProfit     = netRevenue - totalExpenses;

  // ── Laser counter summary ───────────────────────
  const totalShots = laserEntries.reduce((s,l)=>s+l.shots_used,0);

  document.getElementById('meContent').innerHTML = `
    <div id="monthEndPrintArea">
      <!-- Header -->
      <div class="card mb16" style="background:var(--teal);color:#fff;border:none">
        <div class="card-body" style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-family:'Playfair Display',serif;font-size:22px;font-weight:700">Month-End Report</div>
            <div style="opacity:0.8;font-size:14px;margin-top:4px">${period} · ${branch?.name || 'Branch'}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:13px;opacity:0.8">Generated: ${new Date().toLocaleDateString()}</div>
            <div style="font-size:13px;opacity:0.8">${ops.length} operations recorded</div>
          </div>
        </div>
      </div>

      <!-- Revenue Summary -->
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
        <!-- Reconciliation Table -->
        <div class="card">
          <div class="card-header"><div class="card-title">📊 Revenue & Expense Summary</div></div>
          <div class="card-body" style="padding:0">
            <table>
              <tbody>
                <tr><td colspan="2" style="padding:10px 16px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;color:var(--ink3);background:var(--bg)">Revenue</td></tr>
                <tr><td style="padding:10px 16px">Gross Revenue</td><td style="padding:10px 16px;font-weight:600;text-align:right">${grossRevenue.toFixed(2)} ${CURRENCY}</td></tr>
                <tr><td style="padding:10px 16px;color:var(--red)">Discounts Given</td><td style="padding:10px 16px;font-weight:600;text-align:right;color:var(--red)">-${totalDiscount.toFixed(2)} ${CURRENCY}</td></tr>
                <tr style="background:var(--green-light)"><td style="padding:10px 16px;font-weight:700;color:var(--green)">Net Revenue</td><td style="padding:10px 16px;font-weight:700;text-align:right;color:var(--green)">${netRevenue.toFixed(2)} ${CURRENCY}</td></tr>
                <tr><td colspan="2" style="padding:10px 16px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;color:var(--ink3);background:var(--bg)">Expenses</td></tr>
                <tr><td style="padding:10px 16px">Doctor Commissions</td><td style="padding:10px 16px;font-weight:600;text-align:right;color:var(--red)">-${totalDoctorComm.toFixed(2)} ${CURRENCY}</td></tr>
                <tr><td style="padding:10px 16px">Specialist Commissions</td><td style="padding:10px 16px;font-weight:600;text-align:right;color:var(--red)">-${totalSpecComm.toFixed(2)} ${CURRENCY}</td></tr>
                <tr><td style="padding:10px 16px">Staff Salaries</td><td style="padding:10px 16px;font-weight:600;text-align:right;color:var(--red)">-${totalSalaries.toFixed(2)} ${CURRENCY}</td></tr>
                <tr><td style="padding:10px 16px">Other Expenses</td><td style="padding:10px 16px;font-weight:600;text-align:right;color:var(--red)">-${totalOtherExp.toFixed(2)} ${CURRENCY}</td></tr>
                <tr style="background:var(--bg)"><td style="padding:10px 16px;font-weight:700">Total Expenses</td><td style="padding:10px 16px;font-weight:700;text-align:right;color:var(--red)">-${totalExpenses.toFixed(2)} ${CURRENCY}</td></tr>
                <tr style="background:${netProfit>=0?'var(--green-light)':'var(--red-light)'}">
                  <td style="padding:12px 16px;font-weight:800;font-size:16px;color:${netProfit>=0?'var(--green)':'var(--red)'}">Net Profit</td>
                  <td style="padding:12px 16px;font-weight:800;font-size:16px;text-align:right;color:${netProfit>=0?'var(--green)':'var(--red)'}">${netProfit>=0?'+':''}${netProfit.toFixed(2)} ${CURRENCY}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Right column: breakdowns + expenses -->
        <div style="display:flex;flex-direction:column;gap:16px">
          <!-- Doctor breakdown -->
          <div class="card">
            <div class="card-header"><div class="card-title">👨‍⚕️ Doctor Commissions</div></div>
            <div class="tbl-wrap">
              <table>
                <thead><tr><th>Doctor</th><th>Sessions</th><th>Commission</th></tr></thead>
                <tbody>
                  ${Object.values(doctorMap).length === 0
                    ? `<tr><td colspan="3" style="text-align:center;color:var(--ink3);padding:16px">No doctor data</td></tr>`
                    : Object.values(doctorMap).map(d=>`
                      <tr><td>${d.name}</td><td>${d.sessions}</td><td style="font-weight:700;color:var(--teal)">${d.earned.toFixed(2)} ${CURRENCY}</td></tr>
                    `).join('')}
                </tbody>
                <tfoot><tr><td>Total</td><td>—</td><td>${totalDoctorComm.toFixed(2)} ${CURRENCY}</td></tr></tfoot>
              </table>
            </div>
          </div>

          <!-- Specialist breakdown -->
          <div class="card">
            <div class="card-header"><div class="card-title">💆 Specialist Commissions</div></div>
            <div class="tbl-wrap">
              <table>
                <thead><tr><th>Specialist</th><th>Sessions</th><th>Commission</th></tr></thead>
                <tbody>
                  ${Object.values(specMap).length === 0
                    ? `<tr><td colspan="3" style="text-align:center;color:var(--ink3);padding:16px">No specialist data</td></tr>`
                    : Object.values(specMap).map(s=>`
                      <tr><td>${s.name}</td><td>${s.sessions}</td><td style="font-weight:700;color:var(--teal)">${s.commission.toFixed(2)} ${CURRENCY}</td></tr>
                    `).join('')}
                </tbody>
                <tfoot><tr><td>Total</td><td>—</td><td>${totalSpecComm.toFixed(2)} ${CURRENCY}</td></tr></tfoot>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Other Expenses Section -->
      <div class="card mb16">
        <div class="card-header">
          <div><div class="card-title">📋 Other Expenses</div><div class="card-sub">Rent, utilities, consumables, etc.</div></div>
          <button class="btn btn-secondary btn-sm" onclick="openAddExpenseModal(${mo},${yr})">+ Add Expense</button>
        </div>
        ${expenses.length === 0
          ? `<div class="card-body"><div class="empty-state" style="padding:24px"><div class="ei" style="font-size:32px">📋</div><p>No expenses added yet for this period.</p></div></div>`
          : `<div class="tbl-wrap"><table>
              <thead><tr><th>Category</th><th>Description</th><th>Amount</th><th></th></tr></thead>
              <tbody>
                ${expenses.map(e=>`
                  <tr>
                    <td><span class="badge bg-gray">${e.category}</span></td>
                    <td>${e.description||'-'}</td>
                    <td style="font-weight:600">${e.amount.toFixed(2)} ${CURRENCY}</td>
                    <td><button class="btn btn-danger btn-xs" onclick="removeExpense('${e.id}')">✕</button></td>
                  </tr>
                `).join('')}
              </tbody>
              <tfoot><tr><td colspan="2">Total Other Expenses</td><td>${totalOtherExp.toFixed(2)} ${CURRENCY}</td><td></td></tr></tfoot>
            </table></div>`
        }
      </div>

      <!-- Laser Counter Summary -->
      ${laserEntries.length > 0 ? `
      <div class="card">
        <div class="card-header"><div class="card-title">⚡ Laser Machine Counter</div></div>
        <div class="tbl-wrap"><table>
          <thead><tr><th>Date</th><th>Specialist</th><th>Start</th><th>End</th><th>Shots Used</th></tr></thead>
          <tbody>
            ${laserEntries.map(l=>`
              <tr>
                <td>${l.date}</td>
                <td>${l.specialist?.name||'-'}</td>
                <td>${l.start_count}</td>
                <td>${l.end_count}</td>
                <td style="font-weight:700">${l.shots_used}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot><tr><td colspan="4">Total Shots Used</td><td>${totalShots}</td></tr></tfoot>
        </table></div>
      </div>` : ''}
    </div>
  `;
}

// ─── Add Expense Modal ────────────────────────────
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
    <div class="field"><label>Description</label><input type="text" id="expDesc" placeholder="e.g. Monthly rent, Laser gel supplies..."></div>
    <div class="field"><label>Amount (${CURRENCY})</label><input type="number" id="expAmt" min="0" step="0.01" placeholder="0.00"></div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: 'closeModal()' },
    { label: 'Add Expense', cls: 'btn-primary', action: `addExpenseFromModal(${month},${year})` }
  ]);
}

async function addExpenseFromModal(month, year) {
  const cat   = document.getElementById('expCat').value;
  const desc  = document.getElementById('expDesc').value.trim();
  const amt   = parseFloat(document.getElementById('expAmt').value || 0);
  if (!amt) { showToast('error','Invalid','Please enter a valid amount.'); return; }
  try {
    await saveMonthlyExpense({ month, year, category: cat, description: desc, amount: amt });
    closeModal();
    showToast('success','Expense Added',`${amt.toFixed(2)} ${CURRENCY} added.`);
    loadMonthEnd();
  } catch(e) { showToast('error','Error',e.message); }
}

async function removeExpense(id) {
  if (!confirm('Remove this expense?')) return;
  try { await deleteMonthlyExpense(id); loadMonthEnd(); } catch(e) { showToast('error','Error',e.message); }
}

// ─── Print / Export ───────────────────────────────
function printMonthEnd() {
  const area = document.getElementById('monthEndPrintArea');
  if (!area) return;
  document.getElementById('printTarget').innerHTML = area.innerHTML;
  window.print();
}

function exportMonthEndExcel() {
  // Basic CSV export
  const rows = [
    ['Category','Item','Amount'],
    ['Revenue','Cash', document.querySelector('#meContent')?.textContent?.match(/Cash[\s\S]*?(\d+\.\d+)/)?.[1] || ''],
  ];
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `month-end-report.csv`; a.click();
}

// ─── My Stats Page ────────────────────────────────
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
  let totalEarned = 0;

  if (me.role === 'doctor') {
    totalEarned = ops.reduce((s,o) => {
      const tot = (o.payment_cash+o.payment_visa+o.payment_cliq+o.payment_shot) - o.discount;
      return s + tot * ((o.procedure?.doctor_profit_pct ?? 50) / 100);
    }, 0);
  } else {
    totalEarned = ops.reduce((s,o) => s + (o.procedure?.specialist_commission ?? 0), 0) + (me.salary || 0);
  }

  const period = now.toLocaleDateString('en',{month:'long',year:'numeric'});

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
        <div class="sc-val">${totalSessions ? (totalEarned/totalSessions).toFixed(0) : 0}</div>
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
                  const tot = (o.payment_cash+o.payment_visa+o.payment_cliq+o.payment_shot)-o.discount;
                  earned = tot * ((o.procedure?.doctor_profit_pct??50)/100);
                } else {
                  earned = o.procedure?.specialist_commission ?? 0;
                }
                return `<tr>
                  <td>${o.date}</td>
                  <td>${o.patient_name}</td>
                  <td>${o.session_name||o.procedure?.name||'-'}</td>
                  <td style="font-weight:700;color:var(--teal)">${earned.toFixed(2)} ${CURRENCY}</td>
                </tr>`;
              }).join('')}
            </tbody>
            <tfoot><tr><td colspan="3">Total</td><td>${totalEarned.toFixed(2)} ${CURRENCY}</td></tr></tfoot>
          </table></div>`
      }
    </div>
  `;
}

async function exportMyStats() {
  // Build CSV from the operations table
  const rows = [['Date','Patient','Session','Earnings']];
  document.querySelectorAll('#pageContent table tbody tr').forEach(tr => {
    const cells = [...tr.querySelectorAll('td')].map(td=>td.textContent.trim());
    if (cells.length >= 4) rows.push(cells.slice(0,4));
  });
  const csv  = rows.map(r=>r.join(',')).join('\n');
  const blob = new Blob([csv],{type:'text/csv'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const now  = new Date();
  a.href = url;
  a.download = `my-stats-${now.getFullYear()}-${now.getMonth()+1}.csv`;
  a.click();
  showToast('success','Exported','Your stats have been downloaded.');
}
