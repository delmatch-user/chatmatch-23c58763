-- Adicionar contacts à publicação realtime para que o frontend receba atualizações de nome em tempo real
ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;