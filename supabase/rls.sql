-- =====================================================
-- ClinicOS v3 — Row Level Security (RLS) Policies
-- Run AFTER schema.sql in the Supabase SQL Editor
-- =====================================================

-- Helper function: get current user's role
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: get current user's branch_id
CREATE OR REPLACE FUNCTION get_my_branch()
RETURNS UUID AS $$
  SELECT branch_id FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: check a specific permission
CREATE OR REPLACE FUNCTION has_permission(perm TEXT)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (permissions->>perm)::boolean,
    FALSE
  )
  FROM profiles
  WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: is admin?
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT get_my_role() = 'admin'
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: is admin or branch_manager?
CREATE OR REPLACE FUNCTION is_manager()
RETURNS BOOLEAN AS $$
  SELECT get_my_role() IN ('admin', 'branch_manager')
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- =====================================================
-- BRANCHES
-- =====================================================
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

-- Everyone can read branches (needed for booking page)
CREATE POLICY "branches_select_all"
  ON branches FOR SELECT USING (true);

-- Only admins can modify branches
CREATE POLICY "branches_admin_all"
  ON branches FOR ALL USING (is_admin());

-- =====================================================
-- PROFILES
-- =====================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT USING (id = auth.uid());

-- Managers can read profiles in their branch; admins see all
CREATE POLICY "profiles_select_managers"
  ON profiles FOR SELECT USING (
    is_admin()
    OR (get_my_role() = 'branch_manager' AND branch_id = get_my_branch())
  );

-- Only admins can create profiles (signup flow)
CREATE POLICY "profiles_insert_admin"
  ON profiles FOR INSERT WITH CHECK (is_admin());

-- Admins can update any profile; managers update their branch; users update own
CREATE POLICY "profiles_update"
  ON profiles FOR UPDATE USING (
    is_admin()
    OR id = auth.uid()
    OR (get_my_role() = 'branch_manager' AND branch_id = get_my_branch())
  );

-- Only admins delete profiles
CREATE POLICY "profiles_delete_admin"
  ON profiles FOR DELETE USING (is_admin());

-- =====================================================
-- PROCEDURES
-- =====================================================
ALTER TABLE procedures ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read procedures (needed for booking)
CREATE POLICY "procedures_select"
  ON procedures FOR SELECT USING (auth.uid() IS NOT NULL OR TRUE);

-- Managers can insert/update; admins can do anything
CREATE POLICY "procedures_manage"
  ON procedures FOR ALL USING (
    is_admin()
    OR (
      get_my_role() = 'branch_manager'
      AND (branch_id = get_my_branch() OR branch_id IS NULL)
    )
  );

-- =====================================================
-- OPERATIONS (core daily entry)
-- =====================================================
ALTER TABLE operations ENABLE ROW LEVEL SECURITY;

-- SELECT: admins see all; branch managers see own branch;
--         specialists see own rows only (unless view_all_staff_ops permission)
--         employees/receptionists see own branch
CREATE POLICY "operations_select"
  ON operations FOR SELECT USING (
    is_admin()
    OR (
      get_my_role() IN ('branch_manager', 'employee', 'receptionist')
      AND branch_id = get_my_branch()
    )
    OR (
      get_my_role() = 'specialist'
      AND (
        specialist_id = auth.uid()
        OR has_permission('view_all_staff_ops')
      )
      AND branch_id = get_my_branch()
    )
    OR (
      get_my_role() = 'doctor'
      AND doctor_id = auth.uid()
    )
  );

-- INSERT: must have edit_operations permission
CREATE POLICY "operations_insert"
  ON operations FOR INSERT WITH CHECK (
    is_admin()
    OR (
      branch_id = get_my_branch()
      AND (
        is_manager()
        OR has_permission('edit_operations')
      )
    )
  );

-- UPDATE: same as insert
CREATE POLICY "operations_update"
  ON operations FOR UPDATE USING (
    is_admin()
    OR (
      branch_id = get_my_branch()
      AND (
        is_manager()
        OR has_permission('edit_operations')
      )
    )
  );

-- DELETE: must have delete_operations permission
CREATE POLICY "operations_delete"
  ON operations FOR DELETE USING (
    is_admin()
    OR (
      branch_id = get_my_branch()
      AND (
        is_manager()
        OR has_permission('delete_operations')
      )
    )
  );

-- =====================================================
-- LASER COUNTER
-- =====================================================
ALTER TABLE laser_counter ENABLE ROW LEVEL SECURITY;

CREATE POLICY "laser_select"
  ON laser_counter FOR SELECT USING (
    is_admin()
    OR (is_manager() AND branch_id = get_my_branch())
    OR (get_my_role() = 'specialist' AND specialist_id = auth.uid())
  );

CREATE POLICY "laser_insert_update"
  ON laser_counter FOR ALL USING (
    is_admin()
    OR (is_manager() AND branch_id = get_my_branch())
    OR (get_my_role() = 'specialist' AND specialist_id = auth.uid())
  );

-- =====================================================
-- APPOINTMENTS
-- =====================================================
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Public insert (for booking page — no auth required)
CREATE POLICY "appointments_public_insert"
  ON appointments FOR INSERT WITH CHECK (true);

-- SELECT: admins see all; managers/receptionists/employees see branch;
--         doctors see own appointments
CREATE POLICY "appointments_select"
  ON appointments FOR SELECT USING (
    is_admin()
    OR (
      get_my_role() IN ('branch_manager', 'employee', 'receptionist')
      AND branch_id = get_my_branch()
    )
    OR (
      get_my_role() = 'doctor'
      AND doctor_id = auth.uid()
    )
  );

-- UPDATE (confirm/cancel): needs manage_appointments permission
CREATE POLICY "appointments_update"
  ON appointments FOR UPDATE USING (
    is_admin()
    OR (
      branch_id = get_my_branch()
      AND (is_manager() OR has_permission('manage_appointments'))
    )
  );

-- DELETE: managers and above only
CREATE POLICY "appointments_delete"
  ON appointments FOR DELETE USING (
    is_admin()
    OR (is_manager() AND branch_id = get_my_branch())
  );

-- =====================================================
-- CUSTOMERS
-- =====================================================
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Public insert (auto-created from appointment/operation)
CREATE POLICY "customers_public_insert"
  ON customers FOR INSERT WITH CHECK (true);

CREATE POLICY "customers_select"
  ON customers FOR SELECT USING (
    is_admin()
    OR branch_id = get_my_branch()
  );

CREATE POLICY "customers_update"
  ON customers FOR UPDATE USING (
    is_admin()
    OR branch_id = get_my_branch()
  );

-- =====================================================
-- ATTENDANCE
-- =====================================================
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attendance_select"
  ON attendance FOR SELECT USING (
    is_admin()
    OR (is_manager() AND branch_id = get_my_branch())
    OR staff_id = auth.uid()
  );

CREATE POLICY "attendance_insert_update"
  ON attendance FOR ALL USING (
    is_admin()
    OR (is_manager() AND branch_id = get_my_branch())
    OR staff_id = auth.uid()
  );

-- =====================================================
-- MONTHLY EXPENSES
-- =====================================================
ALTER TABLE monthly_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expenses_select"
  ON monthly_expenses FOR SELECT USING (
    is_admin()
    OR (is_manager() AND branch_id = get_my_branch())
  );

CREATE POLICY "expenses_manage"
  ON monthly_expenses FOR ALL USING (
    is_admin()
    OR (is_manager() AND branch_id = get_my_branch())
  );

-- =====================================================
-- INVENTORY
-- =====================================================
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

-- Everyone in branch can view inventory
CREATE POLICY "inventory_select"
  ON inventory FOR SELECT USING (
    is_admin()
    OR branch_id = get_my_branch()
  );

-- Only those with manage_inventory permission can modify
CREATE POLICY "inventory_manage"
  ON inventory FOR ALL USING (
    is_admin()
    OR (
      branch_id = get_my_branch()
      AND (is_manager() OR has_permission('manage_inventory'))
    )
  );

-- =====================================================
-- SMS CAMPAIGNS
-- =====================================================
ALTER TABLE sms_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_select"
  ON sms_campaigns FOR SELECT USING (
    is_admin()
    OR (is_manager() AND branch_id = get_my_branch())
  );

CREATE POLICY "sms_manage"
  ON sms_campaigns FOR ALL USING (
    is_admin()
    OR (
      branch_id = get_my_branch()
      AND (is_manager() OR has_permission('send_sms'))
    )
  );

-- =====================================================
-- IMPORT LOGS
-- =====================================================
ALTER TABLE import_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_logs_select"
  ON import_logs FOR SELECT USING (
    is_admin()
    OR (is_manager() AND branch_id = get_my_branch())
  );

CREATE POLICY "import_logs_insert"
  ON import_logs FOR INSERT WITH CHECK (
    is_admin()
    OR (is_manager() AND branch_id = get_my_branch())
  );

-- =====================================================
-- PROCEDURES: also allow public read for booking page
-- =====================================================
CREATE POLICY "procedures_public_select"
  ON procedures FOR SELECT USING (active = true);
