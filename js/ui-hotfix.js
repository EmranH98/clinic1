(function(){
  // 1) Apply new nav items through legacy NAV_ITEMS so old sidebar styles work
  function applyNavFallback(){
    try{
      if (!window.NAV_ITEMS) return;
      const nav = (window.uiRebuild && window.uiRebuild.navItems && window.uiRebuild.navItems.length)
        ? window.uiRebuild.navItems
        : window.NAV_ITEMS;
      if (!Array.isArray(nav) || nav.length === 0) return;
      // mutate NAV_ITEMS in-place (works even if NAV_ITEMS is a const)
      window.NAV_ITEMS.splice(0, window.NAV_ITEMS.length, ...nav);
      if (typeof window.buildSidebar === 'function') window.buildSidebar();
    } catch(e){}
  }

  // 2) Make sure appointment edit modal always has an explicit "Save Changes" button
  //    (some setups hide the default modal footer)
  const legacyOpen = window.openApptEditModal;
  window.openApptEditModal = function(apptId){
    try{
      const a = window._allAppts?.find?.(x=>x.id===apptId);
      if (!a || !window.openModal || typeof window.openModal !== 'function') {
        legacyOpen?.(apptId);
        return;
      }

      const statuses=[
        { value:'pending',   label:'🟡 Pending' },
        { value:'confirmed', label:'🟢 Confirmed' },
        { value:'completed', label:'✅ Completed' },
        { value:'cancelled', label:'🔴 Cancelled' },
        { value:'no_show',   label:'⚫ No Show' }
      ];

      const html=`
        <div class="g2">
          <div class="field"><label>Patient Name *</label>
            <input type="text" id="ea-name" value="${window.esc(a.customer_name)}"></div>
          <div class="field"><label>Phone *</label>
            <input type="text" id="ea-phone" value="${window.esc(a.customer_phone)}"></div>
        </div>
        <div class="g2">
          <div class="field"><label>Doctor</label>
            <select id="ea-doctor">
              <option value="">— No doctor —</option>
              ${(window.getDoctors?.()||[]).map(d=>`<option value="${d.id}" ${a.doctor_id===d.id?'selected':''}>${window.esc(d.name)}</option>`).join('')}
            </select></div>
          <div class="field"><label>Service</label>
            <select id="ea-proc">
              <option value="">— No service —</option>
              ${(window._procedures||[]).map(p=>`<option value="${p.id}" ${a.procedure_id===p.id?'selected':''}>${window.esc(p.name)}</option>`).join('')}
            </select></div>
        </div>
        <div class="g2">
          <div class="field"><label>Date *</label>
            <input type="date" id="ea-date" value="${a.date}"></div>
          <div class="field"><label>Time *</label>
            <select id="ea-time">
              ${(window.TIME_SLOTS||[]).map(t=>`<option value="${t}" ${a.time?.startsWith(t)?'selected':''}>${window.formatTime12?.(t)||t}</option>`).join('')}
            </select></div>
        </div>
        <div class="field"><label>Status</label>
          <select id="ea-status">
            ${statuses.map(s=>`<option value="${s.value}" ${a.status===s.value?'selected':''}>${s.label}</option>`).join('')}
          </select></div>
        <div class="field"><label>Notes</label>
          <textarea id="ea-notes" rows="2" dir="auto">${window.esc(a.notes||'')}</textarea></div>
      `;

      window.openModal('Edit Appointment', html, [
        { label:'Cancel', cls:'btn-secondary', action:'closeModal()' },
        { label:'Save Changes', cls:'btn-primary', action:`saveApptEdit('${apptId}')` }
      ]);
    } catch(e){ legacyOpen?.(apptId); }
  };

  // run after other modules loaded
  setTimeout(applyNavFallback, 400);
})();
