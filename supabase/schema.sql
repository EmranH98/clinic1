-- =====================================================
-- ClinicOS v3 — Supabase Database Schema
-- Run this entire file once in the Supabase SQL Editor
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. BRANCHES
-- =====================================================
CREATE TABLE IF NOT EXISTS branches (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  name_ar     TEXT,
  address     TEXT,
  phone       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 2. PROFILES (extends auth.users)
-- =====================================================
CREATE TABLE IF NOT EXISTS profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  name_ar         TEXT,
  role            TEXT NOT NULL DEFAULT 'employee'
                    CHECK (role IN ('admin','branch_manager','doctor','specialist','employee','receptionist')),
  branch_id       UUID REFERENCES branches(id),
  salary          NUMERIC(10,2) DEFAULT 0,      -- fixed monthly salary
  commission_rate NUMERIC(5,2)  DEFAULT 0,      -- % commission per service (for specialists)
  phone           TEXT,
  avatar_color    TEXT DEFAULT '#0d7377',
  active          BOOLEAN DEFAULT TRUE,
  permissions     JSONB DEFAULT '{
    "view_operations":       true,
    "edit_operations":       false,
    "delete_operations":     false,
    "view_all_staff_ops":    false,
    "view_appointments":     true,
    "manage_appointments":   false,
    "view_payroll":          false,
    "view_own_payroll_only": true,
    "view_month_end":        false,
    "manage_staff":          false,
    "send_sms":              false,
    "manage_inventory":      false,
    "manage_settings":       false,
    "view_all_branches":     false
  }',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 3. PROCEDURES / SERVICES
-- =====================================================
CREATE TABLE IF NOT EXISTS procedures (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                  TEXT NOT NULL,
  name_ar               TEXT,
  price                 NUMERIC(10,2) DEFAULT 0,
  doctor_profit_pct     NUMERIC(5,2)  DEFAULT 50,   -- e.g. 50 = 50% of session revenue
  specialist_commission NUMERIC(10,2) DEFAULT 0,    -- fixed JD per session
  branch_id             UUID REFERENCES branches(id),
  active                BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 4. DAILY OPERATIONS (replaces the Google Sheet)
-- =====================================================
CREATE TABLE IF NOT EXISTS operations (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date           DATE NOT NULL,
  patient_name   TEXT NOT NULL,
  file_number    TEXT,
  specialist_id  UUID REFERENCES profiles(id),
  doctor_id      UUID REFERENCES profiles(id),
  procedure_id   UUID REFERENCES procedures(id),
  session_name   TEXT,                            -- free text e.g. "فل بدي", "بكيني"
  pricing        TEXT,                            -- "مدفوع" or numeric string
  payment_cash   NUMERIC(10,2) DEFAULT 0,
  payment_visa   NUMERIC(10,2) DEFAULT 0,
  payment_cliq   NUMERIC(10,2) DEFAULT 0,         -- CLIQ / CliQ Jordan payment
  payment_shot   NUMERIC(10,2) DEFAULT 0,         -- package/pre-paid shots
  discount       NUMERIC(10,2) DEFAULT 0,
  notes          TEXT,
  branch_id      UUID REFERENCES branches(id),
  created_by     UUID REFERENCES profiles(id),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Computed total (view)
CREATE OR REPLACE VIEW operations_with_total AS
SELECT *,
  (payment_cash + payment_visa + payment_cliq + payment_shot - discount) AS total
FROM operations;

-- =====================================================
-- 5. LASER COUNTER (replaces end-of-day sheet row)
-- =====================================================
CREATE TABLE IF NOT EXISTS laser_counter (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date          DATE NOT NULL,
  specialist_id UUID REFERENCES profiles(id),
  start_count   INTEGER NOT NULL DEFAULT 0,
  end_count     INTEGER NOT NULL DEFAULT 0,
  shots_used    INTEGER GENERATED ALWAYS AS (end_count - start_count) STORED,
  notes         TEXT,
  branch_id     UUID REFERENCES branches(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (date, specialist_id, branch_id)
);

-- =====================================================
-- 6. APPOINTMENTS
-- =====================================================
CREATE TABLE IF NOT EXISTS appointments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_name   TEXT NOT NULL,
  customer_phone  TEXT NOT NULL,
  customer_email  TEXT,
  doctor_id       UUID REFERENCES profiles(id),
  procedure_id    UUID REFERENCES procedures(id),
  date            DATE NOT NULL,
  time            TIME NOT NULL,
  status          TEXT DEFAULT 'pending'
                    CHECK (status IN ('pending','confirmed','cancelled','completed')),
  notes           TEXT,
  sms_sent        BOOLEAN DEFAULT FALSE,
  branch_id       UUID REFERENCES branches(id),
  confirmed_by    UUID REFERENCES profiles(id),
  confirmed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 7. CUSTOMERS (auto-built from appointments + ops)
-- =====================================================
CREATE TABLE IF NOT EXISTS customers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  file_number TEXT,
  branch_id   UUID REFERENCES branches(id),
  last_visit  DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (phone, branch_id)
);

-- =====================================================
-- 8. ATTENDANCE
-- =====================================================
CREATE TABLE IF NOT EXISTS attendance (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id   UUID REFERENCES profiles(id),
  date       DATE NOT NULL,
  check_in   TIME,
  check_out  TIME,
  notes      TEXT,
  branch_id  UUID REFERENCES branches(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (staff_id, date)
);

-- =====================================================
-- 9. MONTHLY EXPENSES
-- =====================================================
CREATE TABLE IF NOT EXISTS monthly_expenses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  month       INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year        INTEGER NOT NULL,
  category    TEXT DEFAULT 'other'
                CHECK (category IN ('salary','rent','utilities','consumables','other')),
  description TEXT,
  amount      NUMERIC(10,2) NOT NULL,
  branch_id   UUID REFERENCES branches(id),
  created_by  UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 10. INVENTORY
-- =====================================================
CREATE TABLE IF NOT EXISTS inventory (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  category   TEXT,
  qty        NUMERIC(10,2) DEFAULT 0,
  min_qty    NUMERIC(10,2) DEFAULT 0,
  unit       TEXT DEFAULT 'pcs',
  cost       NUMERIC(10,2) DEFAULT 0,
  branch_id  UUID REFERENCES branches(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 11. SMS CAMPAIGNS
-- =====================================================
CREATE TABLE IF NOT EXISTS sms_campaigns (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message          TEXT NOT NULL,
  target_group     TEXT,   -- 'all', 'procedure:{id}', 'inactive_30', 'custom'
  custom_phones    TEXT[], -- for custom list
  scheduled_at     TIMESTAMPTZ,
  sent_at          TIMESTAMPTZ,
  status           TEXT DEFAULT 'draft'
                     CHECK (status IN ('draft','scheduled','sent','failed')),
  recipients_count INTEGER DEFAULT 0,
  branch_id        UUID REFERENCES branches(id),
  created_by       UUID REFERENCES profiles(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 12. IMPORT LOGS (tracks bulk uploads)
-- =====================================================
CREATE TABLE IF NOT EXISTS import_logs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_type  TEXT NOT NULL,   -- 'operations','procedures','inventory','customers','staff'
  filename     TEXT,
  rows_total   INTEGER DEFAULT 0,
  rows_success INTEGER DEFAULT 0,
  rows_failed  INTEGER DEFAULT 0,
  error_log    JSONB DEFAULT '[]',
  branch_id    UUID REFERENCES branches(id),
  imported_by  UUID REFERENCES profiles(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- TRIGGERS: auto-update updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_operations_updated_at
  BEFORE UPDATE ON operations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_inventory_updated_at
  BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- TRIGGER: auto-upsert customer when operation added
-- =====================================================
CREATE OR REPLACE FUNCTION sync_customer_from_operation()
RETURNS TRIGGER AS $$
BEGIN
  -- Only if we have a patient name (some ops might not link to a customer)
  IF NEW.patient_name IS NOT NULL THEN
    INSERT INTO customers (name, file_number, branch_id, last_visit)
    VALUES (NEW.patient_name, NEW.file_number, NEW.branch_id, NEW.date)
    ON CONFLICT (phone, branch_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGER: auto-upsert customer when appointment confirmed
-- =====================================================
CREATE OR REPLACE FUNCTION sync_customer_from_appointment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status != 'confirmed' THEN
    INSERT INTO customers (name, phone, branch_id, last_visit)
    VALUES (NEW.customer_name, NEW.customer_phone, NEW.branch_id, NEW.date)
    ON CONFLICT (phone, branch_id)
    DO UPDATE SET last_visit = EXCLUDED.last_visit, name = EXCLUDED.name;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_customer_from_appointment
  AFTER UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION sync_customer_from_appointment();

-- =====================================================
-- SEED DATA: Initial branches
-- =====================================================
INSERT INTO branches (name, name_ar, phone) VALUES
  ('Khalda',  'خلدا',  NULL),
  ('Zarqa',   'الزرقاء', NULL)
ON CONFLICT DO NOTHING;

-- =====================================================
-- INDEXES for performance
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_operations_date      ON operations(date);
CREATE INDEX IF NOT EXISTS idx_operations_branch    ON operations(branch_id);
CREATE INDEX IF NOT EXISTS idx_operations_specialist ON operations(specialist_id);
CREATE INDEX IF NOT EXISTS idx_operations_doctor    ON operations(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date    ON appointments(date);
CREATE INDEX IF NOT EXISTS idx_appointments_branch  ON appointments(branch_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status  ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_customers_phone      ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_profiles_branch      ON profiles(branch_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role        ON profiles(role);
