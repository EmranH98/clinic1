// =====================================================
// ClinicOS v3 — Configuration
// Replace the placeholder values below with your actual
// Supabase project URL and anon key from:
// https://supabase.com/dashboard → Project Settings → API
// =====================================================

const SUPABASE_URL  = 'https://ybahrnazkicvvgvwbeez.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InliYWhybmF6a2ljdnZndndiZWV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNDMzNjQsImV4cCI6MjA4NzkxOTM2NH0.evbnlJ8gNKxobs132m2KAG2uzfQCqu7kCEZedjZoLXQ';

// Unifonic SMS (Jordan) — get from unifonic.com dashboard
const UNIFONIC_APP_SID  = 'YOUR_UNIFONIC_APP_SID';
const UNIFONIC_SENDER   = 'YourClinic';   // Must be approved sender ID

// App settings
const APP_NAME      = 'ClinicOS';
const APP_VERSION   = '3.0.0';
const DEFAULT_BRANCH = 'Khalda';         // Shown on login if branch not yet loaded

// Initialize Supabase client
// Using var so the binding is shared across all script files as window.supabase
var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  }
});

// Currency label
const CURRENCY = 'JD';

// Time slots available for booking
const TIME_SLOTS = [
  '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '12:00', '12:30',
  '13:00', '14:00', '14:30', '15:00',
  '15:30', '16:00', '16:30', '17:00'
];

// Permission keys with human-readable labels
const PERMISSION_LABELS = {
  view_operations:       'View Daily Operations',
  edit_operations:       'Add / Edit Operations',
  delete_operations:     'Delete Operations',
  view_all_staff_ops:    'View All Staff Operations',
  view_appointments:     'View Appointments',
  manage_appointments:   'Confirm / Cancel Appointments',
  view_payroll:          'View Payroll Reports',
  view_own_payroll_only: 'Limit Payroll to Own Earnings',
  view_month_end:        'Access Month-End Report',
  manage_staff:          'Manage Staff Accounts',
  send_sms:              'Send SMS Campaigns',
  manage_inventory:      'Manage Inventory',
  manage_settings:       'Change Clinic Settings',
  view_all_branches:     'View All Branches'
};

// Default permissions per role (used when creating new accounts)
const DEFAULT_PERMISSIONS = {
  admin: Object.fromEntries(Object.keys(PERMISSION_LABELS).map(k => [k, true])),
  branch_manager: {
    view_operations: true, edit_operations: true, delete_operations: true,
    view_all_staff_ops: true, view_appointments: true, manage_appointments: true,
    view_payroll: true, view_own_payroll_only: false, view_month_end: true,
    manage_staff: true, send_sms: true, manage_inventory: true,
    manage_settings: true, view_all_branches: false
  },
  doctor: {
    view_operations: false, edit_operations: false, delete_operations: false,
    view_all_staff_ops: false, view_appointments: true, manage_appointments: false,
    view_payroll: true, view_own_payroll_only: true, view_month_end: false,
    manage_staff: false, send_sms: false, manage_inventory: false,
    manage_settings: false, view_all_branches: false
  },
  specialist: {
    view_operations: true, edit_operations: true, delete_operations: false,
    view_all_staff_ops: false, view_appointments: false, manage_appointments: false,
    view_payroll: true, view_own_payroll_only: true, view_month_end: false,
    manage_staff: false, send_sms: false, manage_inventory: false,
    manage_settings: false, view_all_branches: false
  },
  employee: {
    view_operations: true, edit_operations: true, delete_operations: false,
    view_all_staff_ops: true, view_appointments: true, manage_appointments: true,
    view_payroll: false, view_own_payroll_only: false, view_month_end: false,
    manage_staff: false, send_sms: false, manage_inventory: false,
    manage_settings: false, view_all_branches: false
  },
  receptionist: {
    view_operations: true, edit_operations: false, delete_operations: false,
    view_all_staff_ops: true, view_appointments: true, manage_appointments: true,
    view_payroll: false, view_own_payroll_only: false, view_month_end: false,
    manage_staff: false, send_sms: false, manage_inventory: false,
    manage_settings: false, view_all_branches: false
  }
};

// Role display names
const ROLE_LABELS = {
  admin:          'Administrator',
  branch_manager: 'Branch Manager',
  doctor:         'Doctor',
  specialist:     'Specialist',
  employee:       'Employee',
  receptionist:   'Receptionist'
};

// Navigation items (id, icon, label, permission required)
const NAV_ITEMS = [
  { section: 'Overview' },
  { id: 'dashboard',   icon: '📊', label: 'Dashboard',        perm: null },
  { section: 'Operations' },
  { id: 'daily',       icon: '📋', label: 'Daily Entry',       perm: 'view_operations' },
  { id: 'appointments',icon: '📅', label: 'Appointments',      perm: 'view_appointments' },
  { id: 'inventory',   icon: '📦', label: 'Inventory',         perm: null },
  { section: 'Finance' },
  { id: 'payroll',     icon: '💰', label: 'Payroll',           perm: 'view_payroll' },
  { id: 'monthend',    icon: '📈', label: 'Month-End Report',  perm: 'view_month_end' },
  { section: 'Admin' },
  { id: 'staff',       icon: '👥', label: 'Staff & Access',    perm: 'manage_staff' },
  { id: 'sms',         icon: '📱', label: 'SMS Campaigns',     perm: 'send_sms' },
  { id: 'import',      icon: '📤', label: 'Import Data',       perm: 'manage_settings', adminOnly: true },
  { id: 'settings',    icon: '⚙️',  label: 'Settings',         perm: 'manage_settings' },
  { section: 'Personal' },
  { id: 'mystats',     icon: '🏅', label: 'My Performance',   perm: null }
];
