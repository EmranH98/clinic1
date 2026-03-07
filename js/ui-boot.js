(() => {
  if (window.__ui_boot_setup) return;
  window.__ui_boot_setup = true;

  // hard poll so changes apply even after login (when window.me appears later)
  const poll = async () => {
    try {
      // ensure core exists
      if (!window.uiRebuild || !window.uiRebuild.waitFor) return;
      await window.uiRebuild.waitFor(
        () => typeof window.initApp === 'function' &&
              typeof window.buildSidebar === 'function' &&
              typeof window.goto === 'function'
      );

      // load nav + core overrides
      if (window.uiRebuild.setNav && window.uiRebuild.navItems) {
        window.uiRebuild.setNav(window.uiRebuild.navItems);
      }

      // call sidebar once and again when me is available
      try { window.buildSidebar(); } catch {}

      if (window.uiRebuild.waitFor) {
        try {
          await window.uiRebuild.waitFor(() => !!window.me);
          try { window.buildSidebar(); } catch {}
        } catch {}
      }

      // appointment modal save button hard fix
      const oldOpen = window.openApptEditModal;
      window.openApptEditModal = async (apptId) => {
        if (oldOpen) {
          try { await oldOpen(apptId); } catch { return; }
        }

        if (typeof window.openModal !== 'function') return;

        // re-open the modal content with explicit actions
        try {
          const app = window.app || window;
          const appts = (app._appointments || window._appointments || []).filter(x => x?.id === apptId);
          const appt = appts[0] || {};

          const esc = (t = '') => String(t)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;');

          const doctorName = (window._profiles || []).find(p => p?.id === appt.doctor_id)?.name || 'Unknown';
          const procName = (window._procedures || []).find(p => p?.id === appt.procedure_id)?.name || 'Unknown';

          const html = `
            <div class="uic-grid">
              <label class="uic-input">
                <span>Customer name</span>
                <input id="apptEditName" value="${esc(appt.customer_name || '')}">
              </label>
              <label class="uic-input">
                <span>Phone</span>
                <input id="apptEditPhone" value="${esc(appt.customer_phone || '')}">
              </label>
              <label class="uic-input">
                <span>Doctor</span>
                <input value="${esc(doctorName)}" disabled>
              </label>
              <label class="uic-input">
                <span>Procedure</span>
                <input value="${esc(procName)}" disabled>
              </label>
              <label class="uic-input">
                <span>Date</span>
                <input id="apptEditDate" type="date" value="${esc(appt.date || '')}">
              </label>
              <label class="uic-input">
                <span>Time</span>
                <input id="apptEditTime" value="${esc(appt.time || '')}">
              </label>
              <label class="uic-input">
                <span>Status</span>
                <select id="apptEditStatus" value="${esc(appt.status || '')}">
                  <option value="scheduled">Scheduled</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="no_show">No show</option>
                </select>
              </label>
              <label class="uic-input">
                <span>Notes</span>
                <textarea id="apptEditNotes">${esc(appt.notes || '')}</textarea>
              </label>
            </div>
          `;

          window.openModal('Edit Appointment', html, [
            { label: 'Cancel', onClick: () => {} },
            {
              label: 'Save Changes',
              primary: true,
              onClick: () => {
                try {
                  window.saveAppointment?.({
                    id: appt.id,
                    customerName: document.getElementById('apptEditName')?.value,
                    customerPhone: document.getElementById('apptEditPhone')?.value,
                    date: document.getElementById('apptEditDate')?.value,
                    time: document.getElementById('apptEditTime')?.value,
                    status: document.getElementById('apptEditStatus')?.value,
                    notes: document.getElementById('apptEditNotes')?.value
                  });
                } catch {}
              }
            }
          ]);

        } catch {}
      };

    } catch {}
  };

  const interval = setInterval(() => {
    poll().catch(() => {});
  }, 1200);

  // stop later (10 minutes) to avoid infinite polling
  setTimeout(() => clearInterval(interval), 10 * 60 * 1000);
})();
