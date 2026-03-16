-- Índices para acelerar queries de mensagens e conversas

-- Índice para busca de mensagens por conversa (usado em TODAS as queries de chat)
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);

-- Índice para deduplicação de mensagens (usado no webhook)
CREATE INDEX IF NOT EXISTS idx_messages_external_id ON messages(external_id) WHERE external_id IS NOT NULL;

-- Índice para ordenação de mensagens por data
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at DESC);

-- Índice para busca de contatos por JID (armazenado em notes)
CREATE INDEX IF NOT EXISTS idx_contacts_notes ON contacts(notes) WHERE notes IS NOT NULL;

-- Índice para busca de conversas por contato
CREATE INDEX IF NOT EXISTS idx_conversations_contact_id ON conversations(contact_id);

-- Índice para busca de conversas por status
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);

-- Índice para busca de conversas por departamento
CREATE INDEX IF NOT EXISTS idx_conversations_department ON conversations(department_id, status);