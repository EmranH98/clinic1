(function(){
  const ui = window.uiRebuild;
  if (!ui) return;

  // Primary sidebar navigation for a "clinic product" feel
  ui.setNav([
    { type: 'section', label: 'Front Desk' },
    { id: 'dashboard', label: 'Dashboard', icon: '🏥' },
    { id: 'patients', label: 'Patients', icon: '🧑‍⚕️' },
    { id: 'appointments', label: 'Appointments', icon: '📅', perm: 'view_appointments' },

    { type: 'section', label: 'Clinical' },
    { id: 'daily', label: 'Visits', icon: '🧾', perm: 'view_operations' },

    { type: 'section', label: 'Finance' },
    { id: 'payroll', label: 'Payroll', icon: '💰', perm: 'view_payroll' },
    { id: 'reports', label: 'Reports', icon: '📈', perm: 'view_reports' },

    { type: 'section', label: 'Admin' },
    { id: 'staff', label: 'Staff', icon: '👥', perm: 'manage_staff' },
    { id: 'settings', label: 'Settings', icon: '⚙️', perm: 'manage_settings' },

    { type: 'section', label: 'More' },
    { id: 'sales', label: 'Product Sales', icon: '🛒', perm: 'view_operations' },
    { id: 'inventory', label: 'Inventory', icon: '📦', perm: 'manage_inventory' },
    { id: 'deposits', label: 'Bank Deposits', icon: '🏦', perm: 'view_month_end' },
    { id: 'monthend', label: 'Month End', icon: '🧾', perm: 'view_month_end' },
    { id: 'notes', label: 'Daily Notes', icon: '📝', perm: 'view_month_end' },
    { id: 'sms', label: 'SMS', icon: '💬', perm: 'send_sms' },
    { id: 'import', label: 'Import', icon: '⬆️', adminOnly: true },
    { id: 'mystats', label: 'My Stats', icon: '📊' }
  ]);
})();
