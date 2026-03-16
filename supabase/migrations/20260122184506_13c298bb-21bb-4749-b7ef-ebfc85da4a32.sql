-- Create ranking_config table for admin-configurable metrics
CREATE TABLE public.ranking_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  conversations_goal_daily INTEGER NOT NULL DEFAULT 15,
  conversations_goal_weekly INTEGER NOT NULL DEFAULT 75,
  conversations_goal_monthly INTEGER NOT NULL DEFAULT 300,
  tma_green_limit INTEGER NOT NULL DEFAULT 10,
  tma_yellow_limit INTEGER NOT NULL DEFAULT 30,
  tme_green_limit INTEGER NOT NULL DEFAULT 10,
  tme_yellow_limit INTEGER NOT NULL DEFAULT 30,
  weight_conversations INTEGER NOT NULL DEFAULT 50,
  weight_tma INTEGER NOT NULL DEFAULT 30,
  weight_tme INTEGER NOT NULL DEFAULT 20,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(department_id)
);

-- Enable RLS
ALTER TABLE public.ranking_config ENABLE ROW LEVEL SECURITY;

-- Admins can manage all configs
CREATE POLICY "Admins can manage ranking config"
ON public.ranking_config
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Supervisors can view configs
CREATE POLICY "Supervisors can view ranking config"
ON public.ranking_config
FOR SELECT
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- Users in the department can view their config
CREATE POLICY "Department users can view ranking config"
ON public.ranking_config
FOR SELECT
USING (
  department_id IN (
    SELECT pd.department_id 
    FROM profile_departments pd 
    WHERE pd.profile_id = auth.uid()
  )
);

-- Create trigger for updated_at
CREATE TRIGGER update_ranking_config_updated_at
BEFORE UPDATE ON public.ranking_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();