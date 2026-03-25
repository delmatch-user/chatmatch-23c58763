ALTER TABLE robot_training_suggestions 
  ADD COLUMN IF NOT EXISTS compliance_status text DEFAULT 'aligned',
  ADD COLUMN IF NOT EXISTS compliance_notes text,
  ADD COLUMN IF NOT EXISTS knowledge_base_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS knowledge_base_updated_at timestamptz;