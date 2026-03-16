-- Create ai_providers table
CREATE TABLE IF NOT EXISTS public.ai_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  default_model TEXT,
  is_active BOOLEAN DEFAULT false,
  models JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;

-- Only admins can manage ai_providers
CREATE POLICY "Admins can manage ai_providers"
  ON public.ai_providers FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Insert default providers
INSERT INTO public.ai_providers (provider, display_name, default_model, models) VALUES
  ('openai', 'OpenAI (ChatGPT)', 'gpt-4o', '["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"]'::jsonb),
  ('google', 'Google (Gemini)', 'gemini-2.5-flash', '["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"]'::jsonb)
ON CONFLICT (provider) DO NOTHING;

-- Create trigger for updated_at
CREATE TRIGGER update_ai_providers_updated_at
  BEFORE UPDATE ON public.ai_providers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();