
-- Fase 1: Isolamento por instância no whatsapp_lid_map
-- 1) Normalizar instance_id nulo para 'default'
UPDATE public.whatsapp_lid_map SET instance_id = 'default' WHERE instance_id IS NULL;

-- 2) Remover constraint UNIQUE antiga (lid_jid global)
ALTER TABLE public.whatsapp_lid_map DROP CONSTRAINT IF EXISTS whatsapp_lid_map_lid_jid_key;

-- 3) Criar constraint UNIQUE composta (lid_jid, instance_id)
ALTER TABLE public.whatsapp_lid_map ADD CONSTRAINT whatsapp_lid_map_instance_lid_unique UNIQUE (lid_jid, instance_id);

-- 4) Alterar instance_id para NOT NULL com default 'default'
ALTER TABLE public.whatsapp_lid_map ALTER COLUMN instance_id SET NOT NULL;
ALTER TABLE public.whatsapp_lid_map ALTER COLUMN instance_id SET DEFAULT 'default';

-- 5) Criar índices para lookup eficiente
CREATE INDEX IF NOT EXISTS idx_lid_map_instance_lid ON public.whatsapp_lid_map (instance_id, lid_jid);
CREATE INDEX IF NOT EXISTS idx_lid_map_instance_phone ON public.whatsapp_lid_map (instance_id, phone_digits);
