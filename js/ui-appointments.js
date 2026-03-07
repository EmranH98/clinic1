// UI overrides for appointment editing
// Ensures branch_id always resolves even for admins without a branch.
(function(){
  try {
    if (!window.saveAppointment || !window.uiRebuild) return;

    const ui = window.uiRebuild;
    const legacy = window.saveAppointment;

    window.saveAppointment = async (appt) => {
      const branchId = appt?.branchId || ui.resolveBranchId(appt?.branchId);
      const safe = { ...appt, branchId };
      return legacy(safe);
    };
  } catch (e) {
    console.error('ui-appointments override failed', e);
  }
})();
