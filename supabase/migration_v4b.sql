-- ═══════════════════════════════════════════════════════════
-- ClinicOS Migration v4b
-- Adds sold_by to product_sales so each sale can track
-- which staff member completed it.
-- Run in Supabase SQL Editor after migration_v4.sql
-- ═══════════════════════════════════════════════════════════

ALTER TABLE product_sales
  ADD COLUMN IF NOT EXISTS sold_by UUID REFERENCES profiles(id);

CREATE INDEX IF NOT EXISTS idx_product_sales_sold_by ON product_sales(sold_by);

-- ═══════════════════════════════════════════════════════════
-- END OF MIGRATION v4b
-- ═══════════════════════════════════════════════════════════
