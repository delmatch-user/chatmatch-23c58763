-- Criar índice único parcial para evitar conversas duplicadas por contato
-- Isso impede que existam múltiplas conversas "ativas" para o mesmo contato
CREATE UNIQUE INDEX IF NOT EXISTS conversations_unique_active_contact 
ON conversations (contact_id) 
WHERE status IN ('em_fila', 'em_atendimento', 'pendente');