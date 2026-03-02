-- ═══════════════════════════════════════════════════════════
-- ClinicOS Migration v4
-- New features: specialist types, appointment no-show,
--               expense periods, bank deposits, daily notes
-- Run this in Supabase SQL Editor after migration_v3.sql
-- ═══════════════════════════════════════════════════════════

-- ── 1. SPECIALIST TYPE ──────────────────────────────────────
-- Differentiates standard specialists from nutritionists and
-- men's laser technicians (who earn % of session, not flat fee)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS specialist_type TEXT DEFAULT 'standard'
  CHECK (specialist_type IN ('standard', 'nutritionist', 'men_laser'));

-- ── 2. APPOINTMENT NO-SHOW STATUS ───────────────────────────
-- Supabase: safest way to extend a CHECK constraint is drop + re-add
ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show'));

-- ── 3. EXPENSE TIME PERIOD ──────────────────────────────────
-- Optional date range so each expense can declare what period
-- it covers (e.g. rent Mar 1 – Mar 31, insurance Feb 15 – Mar 14)
ALTER TABLE monthly_expenses
  ADD COLUMN IF NOT EXISTS date_from DATE,
  ADD COLUMN IF NOT EXISTS date_to   DATE;

-- ── 4. BANK DEPOSITS ────────────────────────────────────────
-- Records cash taken to the bank each day
CREATE TABLE IF NOT EXISTS bank_deposits (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  date        DATE        NOT NULL DEFAULT CURRENT_DATE,
  amount      NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  description TEXT,
  branch_id   UUID        REFERENCES branches(id),
  created_by  UUID        REFERENCES profiles(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_deposits_date   ON bank_deposits(date);
CREATE INDEX IF NOT EXISTS idx_bank_deposits_branch ON bank_deposits(branch_id);

-- Reuse the existing update_updated_at() trigger function
CREATE TRIGGER trg_bank_deposits_updated_at
  BEFORE UPDATE ON bank_deposits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE bank_deposits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deposits_select" ON bank_deposits;
CREATE POLICY "deposits_select" ON bank_deposits
  FOR SELECT USING (is_admin() OR branch_id = get_my_branch());

DROP POLICY IF EXISTS "deposits_insert" ON bank_deposits;
CREATE POLICY "deposits_insert" ON bank_deposits
  FOR INSERT WITH CHECK (
    is_admin() OR (branch_id = get_my_branch() AND is_manager())
  );

DROP POLICY IF EXISTS "deposits_update" ON bank_deposits;
CREATE POLICY "deposits_update" ON bank_deposits
  FOR UPDATE USING (
    is_admin() OR (branch_id = get_my_branch() AND is_manager())
  );

DROP POLICY IF EXISTS "deposits_delete" ON bank_deposits;
CREATE POLICY "deposits_delete" ON bank_deposits
  FOR DELETE USING (
    is_admin() OR (branch_id = get_my_branch() AND is_manager())
  );

-- ── 5. DAILY NOTES ──────────────────────────────────────────
-- Internal per-day notepad accessible only to managers / admins
CREATE TABLE IF NOT EXISTS daily_notes (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  date       DATE        NOT NULL DEFAULT CURRENT_DATE,
  content    TEXT        NOT NULL,
  branch_id  UUID        REFERENCES branches(id),
  created_by UUID        REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_notes_date   ON daily_notes(date);
CREATE INDEX IF NOT EXISTS idx_daily_notes_branch ON daily_notes(branch_id);

CREATE TRIGGER trg_daily_notes_updated_at
  BEFORE UPDATE ON daily_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE daily_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notes_select" ON daily_notes;
CREATE POLICY "notes_select" ON daily_notes
  FOR SELECT USING (
    is_admin() OR (branch_id = get_my_branch() AND is_manager())
  );

DROP POLICY IF EXISTS "notes_insert" ON daily_notes;
CREATE POLICY "notes_insert" ON daily_notes
  FOR INSERT WITH CHECK (
    is_admin() OR (branch_id = get_my_branch() AND is_manager())
  );

DROP POLICY IF EXISTS "notes_update" ON daily_notes;
CREATE POLICY "notes_update" ON daily_notes
  FOR UPDATE USING (
    is_admin() OR (branch_id = get_my_branch() AND is_manager())
  );

DROP POLICY IF EXISTS "notes_delete" ON daily_notes;
CREATE POLICY "notes_delete" ON daily_notes
  FOR DELETE USING (
    is_admin() OR (branch_id = get_my_branch() AND is_manager())
  );

-- ═══════════════════════════════════════════════════════════
-- END OF MIGRATION v4
-- ═══════════════════════════════════════════════════════════
