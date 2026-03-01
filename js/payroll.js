// =====================================================
// ClinicOS v3 — Payroll & Paystub System
// =====================================================

let _payrollOps   = [];   // operations for selected month
let _payrollMonth = new Date().getMonth() + 1;
let _payrollYear  = new Date().getFullYear();

// ─── Payroll Page ─────────────────────────────────
async function pgPayroll() {
  if (!hasPerm('view_payroll')) { showToast('error','Access Denied','You cannot view payroll.'); return; }
  setMeta('Payroll', 'Finance › Payroll');

  const now   = new Date();
  const months = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1, label: d.toLocaleDateString('en', { month: 'long', year: 'numeric' }) });
  }

  document.getElementById('pageContent').innerHTML = `
    <div class="flex-center gap12 mb16">
      <select id="payrollPeriod" class="field" style="margin:0;width:220px" onchange="loadPayrollPeriod()">
        ${months.map((m,i) => `<option value="${m.year}-${m.month}" ${i===0?'selected':''}>${m.label}</option>`).join('')}
      </select>
      ${isManager() ? `
      <select id="payrollBranch" class="field" style="margin:0;width:180px" onchange="loadPayrollPeriod()">
        ${_branches.map(b=>`<option value="${b.id}"${b.id===me.branch_id?' selected':''}>${b.name}</option>`).join('')}
      </select>` : ''}
      <button class="btn btn-secondary btn-sm" onclick="loadPayrollPeriod()">🔄 Refresh</button>
    </div>
    <div id="payrollContent"><div class="empty-state"><div class="spinner"></div><p>Loading payroll data…</p></div></div>
  `;

  await loadPayrollPeriod();
}

async function loadPayrollPeriod() {
  const sel = document.getElementById('payrollPeriod').value.split('-');
  _payrollYear  = parseInt(sel[0]);
  _payrollMonth = parseInt(sel[1]);

  const ops = await getOperations({ month: _payrollMonth, year: _payrollYear });
  _payrollOps = ops;

  const doctors     = getDoctors();
  const specialists = getSpecialists();

  // Calculate doctor earnings
  // Formula: (session_revenue - material_cost) × doctor_profit_pct / 100
  const doctorData = doctors.map(doc => {
    const docOps = ops.filter(o => o.doctor_id === doc.id);
    const sessions = docOps.map(o => {
      const total        = (o.payment_cash + o.payment_visa + o.payment_cliq + o.payment_shot) - o.discount;
      const materialCost = o.material_cost || 0;
      const netRevenue   = total - materialCost;
      const pct          = o.procedure?.doctor_profit_pct ?? 50;
      const earned       = netRevenue * (pct / 100);
      return { ...o, sessionTotal: total, materialCost, netRevenue, docPct: pct, docEarned: earned };
    });
    const totalEarned = sessions.reduce((s, o) => s + o.docEarned, 0);
    return { ...doc, sessions, totalEarned };
  }).filter(d => !hasPerm('view_own_payroll_only') || d.id === me.id || isManager());

  // Calculate specialist earnings
  // Standard specialists: flat commission per session (from procedure or override)
  // Nutritionist / Men's Laser: percentage of session total (spec.commission_rate %)
  const specData = specialists.map(spec => {
    const specType = spec.specialist_type || 'standard';
    const isPct    = specType === 'nutritionist' || specType === 'men_laser';
    const specOps  = ops.filter(o => o.specialist_id === spec.id);
    const sessions = specOps.map(o => {
      let commission;
      if (isPct) {
        const sessionTotal = (o.payment_cash||0)+(o.payment_visa||0)+(o.payment_cliq||0)+(o.payment_shot||0)-(o.discount||0);
        commission = sessionTotal * ((spec.commission_rate || 0) / 100);
      } else {
        commission = o.specialist_commission_override != null
          ? o.specialist_commission_override
          : (o.procedure?.specialist_commission ?? 0);
      }
      return { ...o, commission, hasOverride: !isPct && o.specialist_commission_override != null };
    });
    const commissionTotal = sessions.reduce((s, o) => s + o.commission, 0);
    const totalEarned     = commissionTotal + (spec.salary || 0);
    return { ...spec, sessions, commissionTotal, totalEarned, isPct };
  }).filter(s => !hasPerm('view_own_payroll_only') || s.id === me.id || isManager());

  const periodLabel = new Date(_payrollYear, _payrollMonth - 1, 1).toLocaleDateString('en', { month: 'long', year: 'numeric' });

  document.getElementById('payrollContent').innerHTML = `
    <div class="tabs-bar">
      <button class="tab-btn active" onclick="switchTab('payTabs','payDoctors')">👨‍⚕️ Doctors (${doctorData.length})</button>
      <button class="tab-btn" onclick="switchTab('payTabs','paySpecs')">💆 Specialists (${specData.length})</button>
    </div>

    <!-- DOCTORS TAB -->
    <div id="payDoctors" class="tab-panel active">
      ${doctorData.length === 0
        ? `<div class="empty-state"><div class="ei">👨‍⚕️</div><p>No doctor data for this period.</p></div>`
        : doctorData.map(doc => renderDoctorPayCard(doc, periodLabel)).join('')}
    </div>

    <!-- SPECIALISTS TAB -->
    <div id="paySpecs" class="tab-panel">
      ${specData.length === 0
        ? `<div class="empty-state"><div class="ei">💆</div><p>No specialist data for this period.</p></div>`
        : specData.map(spec => renderSpecPayCard(spec, periodLabel)).join('')}
    </div>
  `;
}

function renderDoctorPayCard(doc, period) {
  const initials = doc.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  return `
    <div class="card mt16">
      <div class="card-header">
        <div class="flex-center gap12">
          <div class="av av-blue" style="width:44px;height:44px;font-size:16px">${initials}</div>
          <div>
            <div class="card-title">${doc.name}</div>
            <div class="card-sub">${ROLE_LABELS[doc.role] || 'Doctor'} · ${doc.sessions.length} sessions</div>
          </div>
        </div>
        <div class="flex-center gap8">
          <div style="text-align:right">
            <div style="font-size:22px;font-weight:700;color:var(--teal);font-family:'Playfair Display',serif">${doc.totalEarned.toFixed(2)} ${CURRENCY}</div>
            <div style="font-size:11px;color:var(--ink3)">Total earnings</div>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="printPaystub('doctor','${doc.id}','${period}')">🖨️ Print</button>
          ${doc.phone ? `<a class="btn btn-success btn-sm" href="https://wa.me/${doc.phone.replace(/\D/g,'')}" target="_blank">📲 WhatsApp</a>` : ''}
        </div>
      </div>
      ${doc.sessions.length > 0 ? `
      <div class="tbl-wrap">
        <table>
          <thead><tr>
            <th>Date</th><th>Patient</th><th>Session</th>
            <th>Revenue</th><th>Materials</th><th>Net Rev.</th><th>Dr %</th><th>Earns</th>
          </tr></thead>
          <tbody>
            ${doc.sessions.map(s => `
              <tr>
                <td>${s.date}</td>
                <td>${esc(s.patient_name)}<br><span class="fs12 c-ink3">#${esc(s.file_number||'-')}</span></td>
                <td>${esc(s.session_name || s.procedure?.name || '-')}</td>
                <td>${s.sessionTotal.toFixed(2)} ${CURRENCY}</td>
                <td>${s.materialCost>0?`<span style="color:var(--amber)">−${s.materialCost.toFixed(2)}</span>`:'—'}</td>
                <td>${s.materialCost>0?`<strong>${s.netRevenue.toFixed(2)}</strong>`:'—'}</td>
                <td>${s.docPct}%</td>
                <td style="font-weight:700;color:var(--teal)">${s.docEarned.toFixed(2)} ${CURRENCY}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot><tr>
            <td colspan="3">Total (${doc.sessions.length} sessions)</td>
            <td>${doc.sessions.reduce((s,o)=>s+o.sessionTotal,0).toFixed(2)} ${CURRENCY}</td>
            <td style="color:var(--amber)">${doc.sessions.reduce((s,o)=>s+(o.materialCost||0),0)>0?`−${doc.sessions.reduce((s,o)=>s+(o.materialCost||0),0).toFixed(2)}`:'—'}</td>
            <td>${doc.sessions.reduce((s,o)=>s+o.netRevenue,0).toFixed(2)} ${CURRENCY}</td>
            <td>—</td>
            <td>${doc.totalEarned.toFixed(2)} ${CURRENCY}</td>
          </tr></tfoot>
        </table>
      </div>` : ''}
    </div>
  `;
}

function renderSpecPayCard(spec, period) {
  const initials   = spec.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const typeLabel  = spec.specialist_type === 'nutritionist' ? '🥗 Nutritionist'
                   : spec.specialist_type === 'men_laser'    ? '♂ Men\'s Laser'
                   : '💆 Specialist';
  const commLabel  = spec.isPct
    ? `${(spec.commission_rate||0)}% of session`
    : 'Fixed per session';
  return `
    <div class="card mt16">
      <div class="card-header">
        <div class="flex-center gap12">
          <div class="av av-amber" style="width:44px;height:44px;font-size:16px">${initials}</div>
          <div>
            <div class="card-title">${esc(spec.name)}</div>
            <div class="card-sub">${typeLabel} · ${spec.sessions.length} sessions · ${commLabel}${spec.salary ? ' · Base: '+(spec.salary||0).toFixed(2)+' '+CURRENCY : ''}</div>
          </div>
        </div>
        <div class="flex-center gap8">
          <div style="text-align:right">
            <div style="font-size:22px;font-weight:700;color:var(--teal);font-family:'Playfair Display',serif">${spec.totalEarned.toFixed(2)} ${CURRENCY}</div>
            <div style="font-size:11px;color:var(--ink3)">Total earnings</div>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="printPaystub('specialist','${spec.id}','${period}')">🖨️ Print</button>
          ${spec.phone ? `<a class="btn btn-success btn-sm" href="https://wa.me/${spec.phone.replace(/\D/g,'')}" target="_blank">📲 WhatsApp</a>` : ''}
        </div>
      </div>
      ${spec.sessions.length > 0 ? `
      <div class="tbl-wrap">
        <table>
          <thead><tr>
            <th>Date</th><th>Patient</th><th>Session</th>
            ${spec.isPct ? '<th>Revenue</th><th>%</th>' : ''}
            <th>Earned</th>
          </tr></thead>
          <tbody>
            ${spec.sessions.map(s => {
              const total = (s.payment_cash||0)+(s.payment_visa||0)+(s.payment_cliq||0)+(s.payment_shot||0)-(s.discount||0);
              return `<tr>
                <td>${s.date}</td>
                <td>${esc(s.patient_name)}<br><span class="fs12 c-ink3">#${esc(s.file_number||'-')}</span></td>
                <td>${esc(s.session_name || s.procedure?.name || '-')}</td>
                ${spec.isPct ? `<td>${total.toFixed(2)} ${CURRENCY}</td><td>${spec.commission_rate||0}%</td>` : ''}
                <td style="font-weight:700;color:var(--teal)">${s.commission.toFixed(2)} ${CURRENCY}</td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot><tr>
            <td colspan="${spec.isPct ? 5 : 3}">Commission total (${spec.sessions.length} sessions)</td>
            <td>${spec.commissionTotal.toFixed(2)} ${CURRENCY}</td>
          </tr>
          ${spec.salary ? `<tr><td colspan="${spec.isPct ? 5 : 3}">Base Salary</td><td>${spec.salary.toFixed(2)} ${CURRENCY}</td></tr>` : ''}
          <tr><td colspan="${spec.isPct ? 5 : 3}"><strong>Total Payout</strong></td><td><strong>${spec.totalEarned.toFixed(2)} ${CURRENCY}</strong></td></tr>
          </tfoot>
        </table>
      </div>` : ''}
    </div>
  `;
}

// ─── Paystub Print ────────────────────────────────
async function printPaystub(type, staffId, period) {
  const staff = _profiles.find(p => p.id === staffId);
  if (!staff) { showToast('error','Not Found','Staff member not found.'); return; }

  let ops;
  if (type === 'doctor') {
    ops = _payrollOps.filter(o => o.doctor_id === staffId).map(o => {
      const total        = (o.payment_cash + o.payment_visa + o.payment_cliq + o.payment_shot) - o.discount;
      const materialCost = o.material_cost || 0;
      const netRevenue   = total - materialCost;
      const pct          = o.procedure?.doctor_profit_pct ?? 50;
      return { ...o, sessionTotal: total, materialCost, netRevenue, earned: netRevenue * (pct/100), pct };
    });
  } else {
    const specType = staff.specialist_type || 'standard';
    const isPct    = specType === 'nutritionist' || specType === 'men_laser';
    ops = _payrollOps.filter(o => o.specialist_id === staffId).map(o => {
      let earned;
      if (isPct) {
        const t = (o.payment_cash||0)+(o.payment_visa||0)+(o.payment_cliq||0)+(o.payment_shot||0)-(o.discount||0);
        earned = t * ((staff.commission_rate || 0) / 100);
      } else {
        earned = o.specialist_commission_override ?? (o.procedure?.specialist_commission ?? 0);
      }
      return { ...o, earned };
    });
  }

  const commTotal = ops.reduce((s,o) => s + o.earned, 0);
  const baseSalary = type === 'specialist' ? (staff.salary || 0) : 0;
  const grandTotal  = commTotal + baseSalary;
  const branchObj  = getBranch(me.branch_id);

  const rows = ops.map(o => `
    <tr>
      <td>${o.date}</td>
      <td>${esc(o.patient_name)}</td>
      <td>${esc(o.session_name || o.procedure?.name || '-')}</td>
      ${type === 'doctor' ? `<td>${o.sessionTotal?.toFixed(2)} ${CURRENCY}</td>${o.materialCost>0?`<td style="color:var(--amber)">−${o.materialCost.toFixed(2)}</td>`:'<td>—</td>'}<td>${o.pct}%</td>` : ''}
      <td style="font-weight:700;color:var(--teal)">${o.earned.toFixed(2)} ${CURRENCY}</td>
    </tr>
  `).join('');

  document.getElementById('printTarget').innerHTML = `
    <div class="paystub">
      <div class="ps-header">
        <div>
          <h2>💊 ${branchObj?.name || 'Clinic'}</h2>
          <p>Paystub — ${period}</p>
        </div>
        <div style="text-align:right">
          <div style="font-size:13px;opacity:0.8">Issued: ${new Date().toLocaleDateString()}</div>
          <div style="font-size:13px;opacity:0.8">Role: ${ROLE_LABELS[staff.role]}</div>
        </div>
      </div>
      <div class="ps-body">
        <div class="ps-row"><span class="pk">Employee Name</span><span class="pv">${staff.name}</span></div>
        <div class="ps-row"><span class="pk">Period</span><span class="pv">${period}</span></div>
        <div class="ps-row"><span class="pk">Sessions Worked</span><span class="pv">${ops.length}</span></div>
        <div class="ps-row"><span class="pk">Commission Type</span><span class="pv">${type === 'doctor' ? 'Percentage of Revenue' : 'Fixed per Session'}</span></div>

        <div class="divider"></div>

        <table class="ps-detail-table">
          <thead><tr>
            <th>Date</th><th>Patient</th><th>Service</th>
            ${type === 'doctor' ? '<th>Revenue</th><th>%</th>' : ''}
            <th>Earned</th>
          </tr></thead>
          <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:#999;padding:20px">No sessions this period</td></tr>'}</tbody>
        </table>

        <div class="divider"></div>
        <div class="ps-row"><span class="pk">Total Commission</span><span class="pv">${commTotal.toFixed(2)} ${CURRENCY}</span></div>
        ${baseSalary > 0 ? `<div class="ps-row"><span class="pk">Base Salary</span><span class="pv">${baseSalary.toFixed(2)} ${CURRENCY}</span></div>` : ''}

        <div class="ps-sig">
          <div><div class="sig-line"></div><p>Employee Signature</p></div>
          <div><div class="sig-line"></div><p>Authorized by</p></div>
        </div>
      </div>
      <div class="ps-total">
        <span class="ptk">Net Payout</span>
        <span class="ptv">${grandTotal.toFixed(2)} ${CURRENCY}</span>
      </div>
    </div>
    <div style="text-align:center;margin-top:24px">
      <button onclick="window.print()" style="padding:10px 24px;background:var(--teal);color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:600">🖨️ Print / Save as PDF</button>
    </div>
  `;

  window.print();
}
