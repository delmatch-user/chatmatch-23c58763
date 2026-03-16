-- Drop the old partial unique index
DROP INDEX IF EXISTS conversations_unique_active_contact;

-- Create new index that also covers 'transferida' status
CREATE UNIQUE INDEX conversations_unique_active_contact 
ON public.conversations (contact_id) 
WHERE status IN ('em_fila', 'em_atendimento', 'pendente', 'transferida');