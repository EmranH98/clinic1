// Productize patch: simplify navigation + safely scope reference data by branch
(function(){
  // --- Branch scoping ---
  function shouldScope(){
    try {
      return !(typeof isAdmin==='function' && isAdmin()) &&
             !(typeof hasPerm==='function' && hasPerm('view_all_branches'));
    } catch(e) { return false; }
  }

  function applyBranchScope(){
    if (!shouldScope()) return;
    const bid = (typeof me === 'object' && me) ? me.branch_id : null;
    if (!bid) return;

    if (Array.isArray(window._branches)) {
      window._branches = window._branches.filter(b => b && b.id === bid);
    }
    if (Array.isArray(window._profiles)) {
      window._profiles = window._profiles.filter(p => p && (p.branch_id === bid || p.id === me.id));
    }
    if (Array.isArray(window._procedures)) {
      window._procedures = window._procedures.filter(p => p && (!p.branch_id || p.branch_id === bid));
    }
  }

  if (typeof window.loadRefData === 'function') {
    const original = window.loadRefData;
    window.loadRefData = async (...args) => {
      await original(...args);
      applyBranchScope();
    };
  }

  // --- Simplified nav ---
  window.NAV_ITEMS = [
    { section: 'Front Desk' },
    { id: 'dashboard',   label: 'Dashboard',        icon: '🏠' },
    { id: 'appointments',label: 'Appointments',     icon: '📅', perm: 'view_appointments' },
    { id: 'daily',       label: 'Daily Operations', icon: '🧾', perm: 'view_operations' },

    { section: 'Management' },
    { id: 'payroll',     label: 'Payroll',   icon: '💸', perm: 'view_payroll' },
    { id: 'monthend',    label: 'Reports',   icon: '📈', perm: 'view_month_end' },
    { id: 'staff',       label: 'Staff',     icon: '👥', perm: 'manage_staff' },
    { id: 'settings',    label: 'Settings',  icon: '⚙️', perm: 'manage_settings' },

    { section: 'More' },
    { id: 'sales',       label: 'Product Sales', icon: '🛍️', perm: 'view_operations' },
    { id: 'inventory',   label: 'Inventory',     icon: '📦', perm: 'view_operations' },
    { id: 'deposits',    label: 'Bank Deposits', icon: '🏦', perm: 'view_month_end' },
    { id: 'notes',       label: 'Daily Notes',   icon: '📝', perm: 'view_month_end' },
    { id: 'sms',         label: 'SMS',           icon: '✉️', perm: 'send_sms' },
    { id: 'mystats',     label: 'My Stats',      icon: '📊', perm: 'view_payroll' },

    // admin tools
    { id: 'import',      label: 'Import', icon: '⬆️', adminOnly: true }
  ];
})();
