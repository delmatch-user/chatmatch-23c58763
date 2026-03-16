
-- Create franqueado_cities table to map franqueados to cities
CREATE TABLE IF NOT EXISTS public.franqueado_cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  city text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, city)
);

-- Enable RLS
ALTER TABLE public.franqueado_cities ENABLE ROW LEVEL SECURITY;

-- Admins can manage all franqueado_cities
CREATE POLICY "Admins can manage franqueado_cities"
  ON public.franqueado_cities
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Franqueados can view their own cities
CREATE POLICY "Franqueados can view own cities"
  ON public.franqueado_cities
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
