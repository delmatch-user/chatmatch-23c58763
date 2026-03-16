
-- Add remarketing columns to sdr_deals
ALTER TABLE public.sdr_deals 
  ADD COLUMN IF NOT EXISTS last_customer_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS remarketing_stopped boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS remarketing_attempts integer NOT NULL DEFAULT 0;

-- Create sdr_remarketing_config table
CREATE TABLE public.sdr_remarketing_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position integer NOT NULL DEFAULT 0,
  days_inactive integer NOT NULL DEFAULT 2,
  message_template text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sdr_remarketing_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SDR remarketing config manageable by comercial users"
  ON public.sdr_remarketing_config FOR ALL
  USING (user_in_department_by_name(auth.uid(), 'Comercial') OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (user_in_department_by_name(auth.uid(), 'Comercial') OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "SDR remarketing config viewable by comercial users"
  ON public.sdr_remarketing_config FOR SELECT
  USING (user_in_department_by_name(auth.uid(), 'Comercial') OR has_role(auth.uid(), 'admin'::app_role));

-- Create sdr_remarketing_log table
CREATE TABLE public.sdr_remarketing_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.sdr_deals(id) ON DELETE CASCADE,
  config_id uuid NOT NULL REFERENCES public.sdr_remarketing_config(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL DEFAULT 1,
  sent_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sdr_remarketing_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SDR remarketing log manageable by comercial users"
  ON public.sdr_remarketing_log FOR ALL
  USING (user_in_department_by_name(auth.uid(), 'Comercial') OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (user_in_department_by_name(auth.uid(), 'Comercial') OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "SDR remarketing log viewable by comercial users"
  ON public.sdr_remarketing_log FOR SELECT
  USING (user_in_department_by_name(auth.uid(), 'Comercial') OR has_role(auth.uid(), 'admin'::app_role));

-- Insert default remarketing rules
INSERT INTO public.sdr_remarketing_config (position, days_inactive, message_template) VALUES
  (1, 2, 'Olá! Notei que nossa conversa ficou parada. Posso te ajudar com alguma dúvida sobre o sistema?'),
  (2, 5, 'Passando aqui para lembrar que nosso sistema pode ajudar a aumentar seus pedidos e organizar seu delivery. Quer que eu te mostre como funciona?'),
  (3, 10, 'Só para confirmar: você ainda tem interesse em conhecer nossa solução ou prefere que eu encerre o contato?');
