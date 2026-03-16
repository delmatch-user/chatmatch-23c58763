-- Habilitar realtime para tabela conversations
ALTER TABLE conversations REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;

-- Habilitar realtime para tabela messages
ALTER TABLE messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;