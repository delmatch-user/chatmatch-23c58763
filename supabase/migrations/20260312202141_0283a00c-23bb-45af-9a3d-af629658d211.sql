
-- Tabela persistente para mapeamento LID → telefone real
CREATE TABLE public.whatsapp_lid_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lid_jid text NOT NULL,
  phone_digits text NOT NULL,
  instance_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(lid_jid)
);

-- RLS
ALTER TABLE public.whatsapp_lid_map ENABLE ROW LEVEL SECURITY;

-- Service role pode tudo (webhook usa service role)
CREATE POLICY "Service role full access" ON public.whatsapp_lid_map FOR ALL USING (true);

-- Index para busca rápida por LID canônico
CREATE INDEX idx_lid_map_lid_jid ON public.whatsapp_lid_map (lid_jid);
CREATE INDEX idx_lid_map_phone ON public.whatsapp_lid_map (phone_digits);
