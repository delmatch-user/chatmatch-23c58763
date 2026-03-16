
-- =============================================
-- SDR / Comercial Module Tables
-- =============================================

-- Helper function to check if user belongs to a department by name
CREATE OR REPLACE FUNCTION public.user_in_department_by_name(_user_id uuid, _dept_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profile_departments pd
    JOIN public.departments d ON d.id = pd.department_id
    WHERE pd.profile_id = _user_id
    AND lower(d.name) = lower(_dept_name)
  )
$$;

-- 1. Pipeline Stages
CREATE TABLE public.sdr_pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  color text NOT NULL DEFAULT 'border-slate-500',
  position integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  is_ai_managed boolean NOT NULL DEFAULT false,
  ai_trigger_criteria text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sdr_pipeline_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SDR stages viewable by comercial users"
ON public.sdr_pipeline_stages FOR SELECT
USING (
  user_in_department_by_name(auth.uid(), 'Comercial')
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "SDR stages manageable by comercial users"
ON public.sdr_pipeline_stages FOR ALL
USING (
  user_in_department_by_name(auth.uid(), 'Comercial')
  OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  user_in_department_by_name(auth.uid(), 'Comercial')
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Seed default stages
INSERT INTO public.sdr_pipeline_stages (title, color, position, is_system) VALUES
  ('Novo Lead', 'border-cyan-500', 0, false),
  ('Qualificado', 'border-violet-500', 1, false),
  ('Proposta', 'border-orange-500', 2, false),
  ('Negociação', 'border-blue-500', 3, false),
  ('Ganho', 'border-emerald-500', 4, true),
  ('Perdido', 'border-red-500', 5, true);

-- 2. Deals (no default for stage_id, will be set in app code)
CREATE TABLE public.sdr_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  company text,
  value numeric NOT NULL DEFAULT 0,
  stage_id uuid REFERENCES public.sdr_pipeline_stages(id),
  contact_id uuid REFERENCES public.contacts(id),
  owner_id uuid REFERENCES public.profiles(id),
  tags text[] NOT NULL DEFAULT '{}',
  priority text NOT NULL DEFAULT 'medium',
  due_date date,
  won_at timestamptz,
  lost_at timestamptz,
  lost_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sdr_deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SDR deals viewable by comercial users"
ON public.sdr_deals FOR SELECT
USING (
  user_in_department_by_name(auth.uid(), 'Comercial')
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "SDR deals manageable by comercial users"
ON public.sdr_deals FOR ALL
USING (
  user_in_department_by_name(auth.uid(), 'Comercial')
  OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  user_in_department_by_name(auth.uid(), 'Comercial')
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- 3. Deal Activities
CREATE TABLE public.sdr_deal_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.sdr_deals(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'note',
  title text NOT NULL,
  description text,
  scheduled_at timestamptz,
  completed_at timestamptz,
  is_completed boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sdr_deal_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SDR activities viewable by comercial users"
ON public.sdr_deal_activities FOR SELECT
USING (
  user_in_department_by_name(auth.uid(), 'Comercial')
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "SDR activities manageable by comercial users"
ON public.sdr_deal_activities FOR ALL
USING (
  user_in_department_by_name(auth.uid(), 'Comercial')
  OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  user_in_department_by_name(auth.uid(), 'Comercial')
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- 4. Appointments
CREATE TABLE public.sdr_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  date date NOT NULL,
  time time NOT NULL DEFAULT '09:00',
  duration integer NOT NULL DEFAULT 60,
  type text NOT NULL DEFAULT 'meeting',
  attendees text[] NOT NULL DEFAULT '{}',
  contact_id uuid REFERENCES public.contacts(id),
  user_id uuid REFERENCES public.profiles(id),
  meeting_url text,
  status text NOT NULL DEFAULT 'scheduled',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sdr_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SDR appointments viewable by comercial users"
ON public.sdr_appointments FOR SELECT
USING (
  user_in_department_by_name(auth.uid(), 'Comercial')
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "SDR appointments manageable by comercial users"
ON public.sdr_appointments FOR ALL
USING (
  user_in_department_by_name(auth.uid(), 'Comercial')
  OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  user_in_department_by_name(auth.uid(), 'Comercial')
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Triggers for updated_at
CREATE TRIGGER update_sdr_deals_updated_at
BEFORE UPDATE ON public.sdr_deals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sdr_pipeline_stages_updated_at
BEFORE UPDATE ON public.sdr_pipeline_stages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sdr_deal_activities_updated_at
BEFORE UPDATE ON public.sdr_deal_activities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sdr_appointments_updated_at
BEFORE UPDATE ON public.sdr_appointments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.sdr_deals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sdr_pipeline_stages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sdr_appointments;
