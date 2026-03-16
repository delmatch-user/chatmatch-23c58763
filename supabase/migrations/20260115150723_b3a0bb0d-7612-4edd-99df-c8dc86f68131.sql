-- Adicionar coluna delivery_status e external_id na tabela messages se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'delivery_status') THEN
    ALTER TABLE public.messages ADD COLUMN delivery_status TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'external_id') THEN
    ALTER TABLE public.messages ADD COLUMN external_id TEXT;
  END IF;
END $$;

-- Adicionar coluna last_message_preview na tabela conversations se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'last_message_preview') THEN
    ALTER TABLE public.conversations ADD COLUMN last_message_preview TEXT;
  END IF;
END $$;