/*
 * Productize patch: simplify navigation + safely scope reference data by branch.
 */
(function () {
  // --- Branch scoping ---
  function shouldScope() {
    try {
      return !(typeof isAdmin === 'function' && isAdmin()) &&
             !(typeof hasPerm === 'function' && hasPerm('view_all_branches'));
    } catch (e) {
      return false;
    }
  }

  function spliceAssign(arr, next) {
    arr.splice(0, arr.length, ...next);
  }

  function applyBranchScope() {
    if (!shouldScope()) return;

    const bid = (typeof me === 'object' && me) ? me.branch_id : null;
    if (!bid) return;

    try {
      if (Array.isArray(_branches)) {
        spliceAssign(_branches, _branches.filter(b => b && b.id === bid));
      }
    } catch (e) {}

    try {
      if (Array.isArray(_profiles)) {
        spliceAssign(
          _profiles,
          _profiles.filter(p => p && (p.branch_id === bid || p.id === me.id))
        );
      }
    } catch (e) {}

    try {
      if (Array.isArray(_procedures)) {
        spliceAssign(
          _procedures,
          _procedures.filter(p => p && (!p.branch_id || p.branch_id === bid))
        );
      }
    } catch (e) {}
  }

  if (typeof loadRefData === 'function') {
    const original = loadRefData;
    loadRefData = async (...args) => {
      await original(...args);
      applyBranchScope();
    };
  }

  // --- Simplified nav ---
  const CLEAN_NAV = [
    { section: 'Front Desk' },
    { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
    { id: 'appointments', label: 'Appointments', icon: '📅', perm: 'view_appointments' },
    { id: 'daily', label: 'Daily Operations', icon: '🧾', perm: 'view_operations' },
    { section: 'Management' },
    { id: 'payroll', label: 'Payroll', icon: '💸', perm: 'view_payroll' },
    { id: 'monthend', label: 'Reports', icon: '📈', perm: 'view_month_end' },
    { id: 'staff', label: 'Staff', icon: '👥', perm: 'manage_staff' },
    { id: 'settings', label: 'Settings', icon: '⚙️', perm: 'manage_settings' },
    { section: 'More' },
    { id: 'sales', label: 'Product Sales', icon: '🛍️', perm: 'view_operations' },
    { id: 'inventory', label: 'Inventory', icon: '📦', perm: 'view_operations' },
    { id: 'deposits', label: 'Bank Deposits', icon: '🏦', perm: 'view_month_end' },
    { id: 'notes', label: 'Daily Notes', icon: '📝', perm: 'view_month_end' },
    { id: 'sms', label: 'SMS', icon: '✉️', perm: 'send_sms' },
    { id: 'mystats', label: 'My Stats', icon: '📊', perm: 'view_payroll' },
    { id: 'import', label: 'Import', icon: '⬆️', adminOnly: true }
  ];

  // Prefer mutating existing NAV_ITEMS binding if it exists (const/let).
  try {
    if (Array.isArray(NAV_ITEMS)) {
      spliceAssign(NAV_ITEMS, CLEAN_NAV);
    } else {
      window.NAV_ITEMS = CLEAN_NAV;
    }
  } catch (e) {
    window.NAV_ITEMS = CLEAN_NAV;
  }
})();
