
-- Step 1: Move messages from duplicate conversations to the oldest one
WITH ranked AS (
  SELECT id, contact_id,
    ROW_NUMBER() OVER (PARTITION BY contact_id ORDER BY created_at ASC) as rn
  FROM conversations
  WHERE status IN ('em_fila', 'em_atendimento', 'pendente', 'transferida')
),
keepers AS (SELECT id, contact_id FROM ranked WHERE rn = 1),
removals AS (SELECT id, contact_id FROM ranked WHERE rn > 1)
UPDATE messages SET conversation_id = k.id
FROM removals r JOIN keepers k ON k.contact_id = r.contact_id
WHERE messages.conversation_id = r.id;

-- Step 2: Delete duplicate conversations (keep oldest)
WITH ranked AS (
  SELECT id, contact_id,
    ROW_NUMBER() OVER (PARTITION BY contact_id ORDER BY created_at ASC) as rn
  FROM conversations
  WHERE status IN ('em_fila', 'em_atendimento', 'pendente', 'transferida')
),
removals AS (SELECT id FROM ranked WHERE rn > 1)
DELETE FROM conversations WHERE id IN (SELECT id FROM removals);

-- Step 3: Create partial unique index to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_conversation_per_contact
  ON conversations (contact_id)
  WHERE status IN ('em_fila', 'em_atendimento', 'pendente', 'transferida');
