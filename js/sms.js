// =====================================================
// ClinicOS v3 — SMS Integration (Unifonic Jordan)
// =====================================================

// ─── Send a single SMS via Unifonic ──────────────
async function sendSMS(phone, message) {
  // Normalize phone number (add +962 if needed)
  let normalized = phone.replace(/\s/g, '');
  if (normalized.startsWith('07')) normalized = '+962' + normalized.slice(1);
  if (normalized.startsWith('7') && normalized.length === 9) normalized = '+962' + normalized;
  if (!normalized.startsWith('+')) normalized = '+' + normalized;

  // Call via our Supabase Edge Function (to keep API key server-side)
  const { data, error } = await supabase.functions.invoke('send-sms', {
    body: {
      phone:    normalized,
      message:  message,
      sender:   UNIFONIC_SENDER,
      app_sid:  UNIFONIC_APP_SID
    }
  });

  if (error) throw new Error('SMS failed: ' + (error.message || 'Unknown error'));
  return data;
}

// ─── Appointment confirmation SMS ─────────────────
async function sendAppointmentSMS(appointment, branch) {
  const dateFormatted = new Date(appointment.date).toLocaleDateString('ar-JO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  const timeFormatted = formatTime12(appointment.time);
  const branchName = branch?.name_ar || branch?.name || 'عيادتنا';
  const doctorName = appointment.doctor?.name || '';

  const message = `مرحباً ${appointment.customer_name}،\n` +
    `تم تأكيد موعدك في ${branchName}.\n` +
    `📅 ${dateFormatted}\n` +
    `⏰ ${timeFormatted}\n` +
    (doctorName ? `👨‍⚕️ ${doctorName}\n` : '') +
    `للاستفسار أو الإلغاء، يرجى التواصل معنا.\nشكراً لثقتكم 💚`;

  return sendSMS(appointment.customer_phone, message);
}

// ─── SMS Campaign page ────────────────────────────
async function pgSMS() {
  setMeta('SMS Campaigns', 'Admin › SMS Campaigns');
  const campaigns = await getSMSCampaigns();
  const customers = await getCustomers();

  document.getElementById('pageContent').innerHTML = `
    <div class="stats-row" style="grid-template-columns:repeat(3,1fr)">
      <div class="sc">
        <div class="sc-top"><div class="sc-icon bg-teal">📱</div></div>
        <div class="sc-label">Total Customers</div>
        <div class="sc-val">${customers.length}</div>
      </div>
      <div class="sc">
        <div class="sc-top"><div class="sc-icon bg-green">✅</div></div>
        <div class="sc-label">Campaigns Sent</div>
        <div class="sc-val">${campaigns.filter(c=>c.status==='sent').length}</div>
      </div>
      <div class="sc">
        <div class="sc-top"><div class="sc-icon bg-amber">📋</div></div>
        <div class="sc-label">Drafts</div>
        <div class="sc-val">${campaigns.filter(c=>c.status==='draft').length}</div>
      </div>
    </div>

    <div class="g2 mt20">
      <!-- Compose Panel -->
      <div class="card">
        <div class="card-header">
          <div><div class="card-title">✉️ New Campaign</div><div class="card-sub">Compose and send an SMS to your customers</div></div>
        </div>
        <div class="card-body">
          <div class="field">
            <label>Target Audience</label>
            <select id="smsTarget" onchange="updateSMSRecipientCount()">
              <option value="all">All Customers (${customers.length})</option>
              <option value="inactive_30">Inactive 30+ days</option>
              <option value="inactive_60">Inactive 60+ days</option>
              ${_procedures.map(p=>`<option value="proc_${p.id}">Did: ${p.name}</option>`).join('')}
              <option value="custom">Custom phone list</option>
            </select>
          </div>
          <div id="customPhoneWrap" style="display:none" class="field">
            <label>Phone Numbers (one per line)</label>
            <textarea id="customPhones" rows="4" placeholder="+962791234567&#10;+962791234568"></textarea>
          </div>
          <div class="field">
            <label>Message (Arabic supported)</label>
            <textarea id="smsMessage" rows="5" placeholder="اكتب رسالتك هنا..." oninput="updateSMSCount()" dir="auto"></textarea>
            <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:11px;color:var(--ink3)">
              <span id="smsCharCount">0 / 160 chars</span>
              <span id="smsMsgCount">1 SMS per recipient</span>
            </div>
          </div>

          <!-- Quick templates -->
          <div style="margin-bottom:16px">
            <div style="font-size:11px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Quick Templates</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              ${SMS_TEMPLATES.map((t,i) => `
                <button class="btn btn-sm btn-secondary" onclick="setSMSTemplate(${i})">${t.label}</button>
              `).join('')}
            </div>
          </div>

          <div class="alert alert-info" style="margin-bottom:16px">
            <span>ℹ️</span>
            <span>Recipients: <strong id="recipientCount">${customers.length} customers</strong></span>
          </div>

          <div style="display:flex;gap:10px">
            <button class="btn btn-secondary btn-sm" onclick="saveSMSDraft()">💾 Save Draft</button>
            <button class="btn btn-primary btn-sm" style="flex:1" onclick="sendSMSCampaign()">📤 Send Now</button>
          </div>
        </div>
      </div>

      <!-- Campaign History -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">📜 Campaign History</div>
        </div>
        <div class="card-body" style="padding:0">
          ${campaigns.length === 0 ? `<div class="empty-state"><div class="ei">📭</div><p>No campaigns yet</p></div>` : `
          <div class="tbl-wrap">
            <table>
              <thead><tr>
                <th>Date</th><th>Target</th><th>Recipients</th><th>Status</th>
              </tr></thead>
              <tbody>
                ${campaigns.map(c => `
                  <tr>
                    <td>${c.sent_at ? new Date(c.sent_at).toLocaleDateString() : (c.created_at ? new Date(c.created_at).toLocaleDateString() : '-')}</td>
                    <td><span class="chip">${formatSMSTarget(c.target_group)}</span></td>
                    <td>${c.recipients_count || '-'}</td>
                    <td>${smsBadge(c.status)}</td>
                  </tr>
                  <tr><td colspan="4" style="padding:8px 16px;font-size:12px;color:var(--ink3);background:var(--bg);border-bottom:1px solid var(--border)">${c.message}</td></tr>
                `).join('')}
              </tbody>
            </table>
          </div>`}
        </div>
      </div>
    </div>
  `;

  document.getElementById('smsTarget').addEventListener('change', function() {
    document.getElementById('customPhoneWrap').style.display = this.value === 'custom' ? 'block' : 'none';
  });
}

const SMS_TEMPLATES = [
  {
    label: 'Appointment Reminder',
    text: 'عزيزتنا العميلة، نذكركم بموعدكم القادم في عيادتنا. للاستفسار أو التعديل، يرجى التواصل معنا. 💚'
  },
  {
    label: 'Special Offer',
    text: 'عرض خاص لعملائنا الكرام! احجزي موعدك الآن واستفيدي من أسعارنا المميزة. التفاصيل عند التواصل. 🌟'
  },
  {
    label: 'We Miss You',
    text: 'نشتاق لرؤيتك! مضى وقت منذ آخر زيارة، تعالي لنجدد إطلالتك. احجزي موعدك الآن! 💫'
  },
  {
    label: 'Eid Greeting',
    text: 'كل عام وأنتم بخير وسعادة! من عائلة عيادتنا لعائلتك الكريمة، أطيب التهاني بالمناسبة السعيدة. 🌙'
  }
];

function setSMSTemplate(idx) {
  document.getElementById('smsMessage').value = SMS_TEMPLATES[idx].text;
  updateSMSCount();
}

function updateSMSCount() {
  const msg = document.getElementById('smsMessage').value;
  const len = msg.length;
  const msgs = Math.ceil(len / 160) || 1;
  document.getElementById('smsCharCount').textContent = `${len} / 160 chars`;
  document.getElementById('smsMsgCount').textContent = `${msgs} SMS per recipient`;
}

async function updateSMSRecipientCount() {
  const target = document.getElementById('smsTarget').value;
  let count = 0;

  if (target === 'all') {
    const customers = await getCustomers();
    count = customers.length;
  } else if (target.startsWith('inactive_')) {
    const days = parseInt(target.split('_')[1]);
    const customers = await getCustomers({ inactiveDays: days });
    count = customers.length;
  } else if (target === 'custom') {
    count = document.getElementById('customPhones')?.value?.split('\n').filter(l=>l.trim()).length || 0;
  }

  document.getElementById('recipientCount').textContent = `${count} customers`;
}

async function sendSMSCampaign() {
  const message = document.getElementById('smsMessage').value.trim();
  const target  = document.getElementById('smsTarget').value;

  if (!message) { showToast('error', 'Empty Message', 'Please write a message first.'); return; }

  if (!confirm(`Send SMS to all matching customers?\n\nMessage preview:\n${message.slice(0,100)}...`)) return;

  showToast('info', 'Sending…', 'Gathering recipients and sending SMS.');

  try {
    // Get phone list
    let phones = [];
    if (target === 'custom') {
      phones = document.getElementById('customPhones').value.split('\n').map(l=>l.trim()).filter(Boolean);
    } else if (target === 'all') {
      const customers = await getCustomers();
      phones = customers.map(c => c.phone);
    } else if (target.startsWith('inactive_')) {
      const days = parseInt(target.split('_')[1]);
      const customers = await getCustomers({ inactiveDays: days });
      phones = customers.map(c => c.phone);
    }

    if (phones.length === 0) { showToast('warning', 'No Recipients', 'No customers matched this target.'); return; }

    // Call edge function to bulk send
    const { data, error } = await supabase.functions.invoke('bulk-sms', {
      body: { phones, message, sender: UNIFONIC_SENDER, app_sid: UNIFONIC_APP_SID }
    });

    if (error) throw error;

    // Log campaign
    await supabase.from('sms_campaigns').insert({
      message, target_group: target,
      sent_at: new Date().toISOString(), status: 'sent',
      recipients_count: phones.length,
      branch_id: me.branch_id, created_by: me.id
    });

    showToast('success', 'Campaign Sent!', `${phones.length} messages sent successfully.`);
    pgSMS();
  } catch (err) {
    showToast('error', 'Send Failed', err.message);
  }
}

async function saveSMSDraft() {
  const message = document.getElementById('smsMessage').value.trim();
  const target  = document.getElementById('smsTarget').value;
  if (!message) { showToast('error', 'Empty Message', 'Please write a message first.'); return; }
  await supabase.from('sms_campaigns').insert({
    message, target_group: target, status: 'draft',
    branch_id: me.branch_id, created_by: me.id
  });
  showToast('success', 'Draft Saved', 'Your campaign has been saved as a draft.');
  pgSMS();
}

async function getSMSCampaigns() {
  const { data, error } = await supabase.from('sms_campaigns')
    .select('*').eq('branch_id', me.branch_id)
    .order('created_at', { ascending: false }).limit(20);
  if (error) { console.error(error); return []; }
  return data || [];
}

function smsBadge(status) {
  const map = {
    sent: '<span class="badge bg-green">✅ Sent</span>',
    draft: '<span class="badge bg-gray">📋 Draft</span>',
    scheduled: '<span class="badge bg-blue">⏰ Scheduled</span>',
    failed: '<span class="badge bg-red">❌ Failed</span>'
  };
  return map[status] || status;
}

function formatSMSTarget(t) {
  if (!t) return 'All';
  if (t === 'all') return 'All Customers';
  if (t.startsWith('inactive_')) return `Inactive ${t.split('_')[1]}+ days`;
  if (t.startsWith('proc_')) {
    const proc = _procedures.find(p => p.id === t.split('_')[1]);
    return proc ? `Did: ${proc.name}` : 'By Procedure';
  }
  if (t === 'custom') return 'Custom List';
  return t;
}
