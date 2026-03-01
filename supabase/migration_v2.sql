-- =====================================================
-- ClinicOS v3 — Migration v2
-- Run this file once in the Supabase SQL Editor
-- =====================================================

-- 1. Allow "work-only" profiles not linked to auth.users
--    (Specialists, Doctors added just for operations tracking — no app login needed)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS requires_login BOOLEAN DEFAULT true;

-- 2. Procedure categorisation — category, subcategory, service type, gender
ALTER TABLE procedures
  ADD COLUMN IF NOT EXISTS category     TEXT DEFAULT 'General',
  ADD COLUMN IF NOT EXISTS sub_category TEXT,
  ADD COLUMN IF NOT EXISTS service_type TEXT DEFAULT 'specialist',
  ADD COLUMN IF NOT EXISTS gender       TEXT DEFAULT 'unisex';

-- 3. Per-operation commission override for specialist
--    NULL = use procedure default; a value = override for this specific op only
ALTER TABLE operations
  ADD COLUMN IF NOT EXISTS specialist_commission_override NUMERIC(10,2);

-- 4. Suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  contact_name TEXT,
  phone        TEXT,
  notes        TEXT,
  branch_id    UUID REFERENCES branches(id),
  active       BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Purchase history table (tracks every purchase made from a supplier)
CREATE TABLE IF NOT EXISTS purchase_history (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inventory_id  UUID REFERENCES inventory(id) ON DELETE CASCADE,
  supplier_id   UUID REFERENCES suppliers(id),
  quantity      NUMERIC(10,2) NOT NULL,
  unit_price    NUMERIC(10,2) NOT NULL,
  purchase_date DATE DEFAULT CURRENT_DATE,
  notes         TEXT,
  branch_id     UUID REFERENCES branches(id),
  created_by    UUID,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Link inventory items to their preferred supplier + track last purchase
ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS supplier_id          UUID REFERENCES suppliers(id),
  ADD COLUMN IF NOT EXISTS last_purchase_price  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS last_purchase_date   DATE;

-- 7. RLS for new tables
ALTER TABLE suppliers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "branch_suppliers"        ON suppliers;
DROP POLICY IF EXISTS "branch_purchase_history" ON purchase_history;

CREATE POLICY "branch_suppliers" ON suppliers
  FOR ALL USING (
    branch_id = (SELECT branch_id FROM profiles WHERE id = auth.uid())
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "branch_purchase_history" ON purchase_history
  FOR ALL USING (
    branch_id = (SELECT branch_id FROM profiles WHERE id = auth.uid())
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- 8. Indexes for new tables
CREATE INDEX IF NOT EXISTS idx_suppliers_branch          ON suppliers(branch_id);
CREATE INDEX IF NOT EXISTS idx_purchase_history_item     ON purchase_history(inventory_id);
CREATE INDEX IF NOT EXISTS idx_purchase_history_branch   ON purchase_history(branch_id);
CREATE INDEX IF NOT EXISTS idx_operations_commission_ovr ON operations(specialist_commission_override)
  WHERE specialist_commission_override IS NOT NULL;
