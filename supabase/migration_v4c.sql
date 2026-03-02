-- ═══════════════════════════════════════════════════════════
-- ClinicOS Migration v4c
-- 1. Adds 'nutritionist' to procedures.service_type CHECK
-- 2. Creates operation_procedures table for multi-procedure sessions
-- Run in Supabase SQL Editor after migration_v4b.sql
-- ═══════════════════════════════════════════════════════════

-- 1. Extend procedures.service_type to include 'nutritionist'
ALTER TABLE procedures DROP CONSTRAINT IF EXISTS procedures_service_type_check;
ALTER TABLE procedures ADD CONSTRAINT procedures_service_type_check
  CHECK (service_type IN ('specialist', 'doctor', 'both', 'nutritionist'));

-- 2. Multi-procedure sessions table
CREATE TABLE IF NOT EXISTS operation_procedures (
  id                             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operation_id                   UUID NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  procedure_id                   UUID REFERENCES procedures(id),
  quantity                       INT NOT NULL DEFAULT 1,
  specialist_commission_override NUMERIC(10,2),
  created_at                     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_op_proc_operation ON operation_procedures(operation_id);

-- Row-level security
ALTER TABLE operation_procedures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "op_proc_branch_select" ON operation_procedures
  FOR SELECT
  USING (
    operation_id IN (
      SELECT id FROM operations WHERE branch_id = get_my_branch()
    )
  );

CREATE POLICY "op_proc_manage" ON operation_procedures
  FOR ALL
  USING (
    operation_id IN (
      SELECT id FROM operations WHERE branch_id = get_my_branch()
    )
  );

-- ═══════════════════════════════════════════════════════════
-- END OF MIGRATION v4c
-- ═══════════════════════════════════════════════════════════
