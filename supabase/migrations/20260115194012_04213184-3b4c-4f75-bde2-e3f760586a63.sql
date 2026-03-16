-- Adicionar coluna channel em contacts para identificar origem
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'whatsapp';

-- Adicionar coluna channel em conversations para identificar origem
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'whatsapp';

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_contacts_channel ON contacts(channel);
CREATE INDEX IF NOT EXISTS idx_conversations_channel ON conversations(channel);