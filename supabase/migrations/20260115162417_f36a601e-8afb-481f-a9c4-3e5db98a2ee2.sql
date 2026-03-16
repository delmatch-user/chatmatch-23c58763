-- Habilitar REPLICA IDENTITY para capturar todos os dados nas mudanças
ALTER TABLE public.internal_messages REPLICA IDENTITY FULL;

-- Adicionar à publicação de realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_messages;