
CREATE TABLE public.sdr_auto_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keywords text[] NOT NULL DEFAULT '{}',
  transfer_to_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.sdr_auto_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SDR auto config manageable by comercial users"
  ON public.sdr_auto_config FOR ALL
  USING (user_in_department_by_name(auth.uid(), 'Comercial') OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (user_in_department_by_name(auth.uid(), 'Comercial') OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "SDR auto config viewable by comercial users"
  ON public.sdr_auto_config FOR SELECT
  USING (user_in_department_by_name(auth.uid(), 'Comercial') OR has_role(auth.uid(), 'admin'::app_role));
