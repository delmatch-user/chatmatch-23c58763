-- Adicionar coluna para rastrear quando a pausa iniciou
ALTER TABLE profiles ADD COLUMN pause_started_at TIMESTAMP WITH TIME ZONE;

-- Adicionar coluna para registrar status do agente na finalização
ALTER TABLE conversation_logs ADD COLUMN agent_status_at_finalization TEXT;

-- Migrar usuários com status 'busy' para 'offline' já que busy será removido da interface
UPDATE profiles SET status = 'offline' WHERE status = 'busy';