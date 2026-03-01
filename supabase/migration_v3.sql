-- =====================================================
-- ClinicOS v3 — Migration v3
-- Run this file once in the Supabase SQL Editor
-- =====================================================

-- 1. material_cost on operations
--    Stored snapshot (sum of qty * unit_price from operation_items).
--    Keeping it denormalized means payroll queries stay fast.
ALTER TABLE operations
  ADD COLUMN IF NOT EXISTS material_cost NUMERIC(10,2) DEFAULT 0;

-- 2. Items consumed during a clinical operation
--    Deleting an operation cascades and removes its items automatically.
--    Deleting an inventory item is restricted if it has been used in operations.
CREATE TABLE IF NOT EXISTS operation_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operation_id  UUID NOT NULL REFERENCES operations(id)  ON DELETE CASCADE,
  inventory_id  UUID NOT NULL REFERENCES inventory(id)   ON DELETE RESTRICT,
  qty           NUMERIC(10,3) NOT NULL CHECK (qty > 0),
  unit_price    NUMERIC(10,2) NOT NULL DEFAULT 0,   -- snapshot at time of use
  branch_id     UUID REFERENCES branches(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Product sales header
--    Separate from clinical operations — used when clinic sells products directly to clients.
CREATE TABLE IF NOT EXISTS product_sales (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date          DATE NOT NULL DEFAULT CURRENT_DATE,
  patient_name  TEXT NOT NULL,
  file_number   TEXT,
  payment_cash  NUMERIC(10,2) DEFAULT 0,
  payment_visa  NUMERIC(10,2) DEFAULT 0,
  payment_cliq  NUMERIC(10,2) DEFAULT 0,
  discount      NUMERIC(10,2) DEFAULT 0,
  notes         TEXT,
  branch_id     UUID REFERENCES branches(id),
  created_by    UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Line items for each product sale
CREATE TABLE IF NOT EXISTS sale_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id       UUID NOT NULL REFERENCES product_sales(id) ON DELETE CASCADE,
  inventory_id  UUID NOT NULL REFERENCES inventory(id)     ON DELETE RESTRICT,
  qty           NUMERIC(10,3) NOT NULL CHECK (qty > 0),
  unit_price    NUMERIC(10,2) NOT NULL DEFAULT 0,   -- selling price snapshot
  branch_id     UUID REFERENCES branches(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Computed total view (mirrors the operations_with_total pattern)
CREATE OR REPLACE VIEW product_sales_with_total AS
SELECT *,
  (payment_cash + payment_visa + payment_cliq - discount) AS total
FROM product_sales;

-- 6. updated_at trigger (update_updated_at() function already exists from schema.sql)
DROP TRIGGER IF EXISTS trg_product_sales_updated_at ON product_sales;
CREATE TRIGGER trg_product_sales_updated_at
  BEFORE UPDATE ON product_sales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_op_items_operation   ON operation_items(operation_id);
CREATE INDEX IF NOT EXISTS idx_op_items_inventory   ON operation_items(inventory_id);
CREATE INDEX IF NOT EXISTS idx_op_items_branch      ON operation_items(branch_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale      ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_inventory ON sale_items(inventory_id);
CREATE INDEX IF NOT EXISTS idx_product_sales_date   ON product_sales(date);
CREATE INDEX IF NOT EXISTS idx_product_sales_branch ON product_sales(branch_id);
CREATE INDEX IF NOT EXISTS idx_ops_material_cost    ON operations(material_cost)
  WHERE material_cost > 0;

-- 8. Enable RLS on all new tables
--    Helper functions (is_admin, is_manager, get_my_branch, has_permission)
--    are already defined in rls.sql.
ALTER TABLE operation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_sales   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items      ENABLE ROW LEVEL SECURITY;

-- operation_items — mirrors the operations table policies
DROP POLICY IF EXISTS "op_items_select" ON operation_items;
CREATE POLICY "op_items_select" ON operation_items
  FOR SELECT USING (
    is_admin()
    OR branch_id = get_my_branch()
  );

DROP POLICY IF EXISTS "op_items_insert" ON operation_items;
CREATE POLICY "op_items_insert" ON operation_items
  FOR INSERT WITH CHECK (
    is_admin()
    OR (
      branch_id = get_my_branch()
      AND (is_manager() OR has_permission('edit_operations'))
    )
  );

DROP POLICY IF EXISTS "op_items_delete" ON operation_items;
CREATE POLICY "op_items_delete" ON operation_items
  FOR DELETE USING (
    is_admin()
    OR (
      branch_id = get_my_branch()
      AND (is_manager() OR has_permission('delete_operations'))
    )
  );

-- product_sales — same write-gate as operations
DROP POLICY IF EXISTS "product_sales_select" ON product_sales;
CREATE POLICY "product_sales_select" ON product_sales
  FOR SELECT USING (
    is_admin()
    OR branch_id = get_my_branch()
  );

DROP POLICY IF EXISTS "product_sales_insert" ON product_sales;
CREATE POLICY "product_sales_insert" ON product_sales
  FOR INSERT WITH CHECK (
    is_admin()
    OR (
      branch_id = get_my_branch()
      AND (is_manager() OR has_permission('edit_operations'))
    )
  );

DROP POLICY IF EXISTS "product_sales_update" ON product_sales;
CREATE POLICY "product_sales_update" ON product_sales
  FOR UPDATE USING (
    is_admin()
    OR (
      branch_id = get_my_branch()
      AND (is_manager() OR has_permission('edit_operations'))
    )
  );

DROP POLICY IF EXISTS "product_sales_delete" ON product_sales;
CREATE POLICY "product_sales_delete" ON product_sales
  FOR DELETE USING (
    is_admin()
    OR (
      branch_id = get_my_branch()
      AND (is_manager() OR has_permission('delete_operations'))
    )
  );

-- sale_items — follows product_sales access
DROP POLICY IF EXISTS "sale_items_select" ON sale_items;
CREATE POLICY "sale_items_select" ON sale_items
  FOR SELECT USING (
    is_admin()
    OR branch_id = get_my_branch()
  );

DROP POLICY IF EXISTS "sale_items_insert" ON sale_items;
CREATE POLICY "sale_items_insert" ON sale_items
  FOR INSERT WITH CHECK (
    is_admin()
    OR (
      branch_id = get_my_branch()
      AND (is_manager() OR has_permission('edit_operations'))
    )
  );

DROP POLICY IF EXISTS "sale_items_delete" ON sale_items;
CREATE POLICY "sale_items_delete" ON sale_items
  FOR DELETE USING (
    is_admin()
    OR (
      branch_id = get_my_branch()
      AND (is_manager() OR has_permission('delete_operations'))
    )
  );
