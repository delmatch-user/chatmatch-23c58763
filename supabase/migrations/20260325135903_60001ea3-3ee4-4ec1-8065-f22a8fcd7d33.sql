
-- Table: delma_memory
CREATE TABLE public.delma_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'data_signal' CHECK (type IN ('data_signal', 'manager_feedback')),
  source text NOT NULL DEFAULT '',
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  weight float NOT NULL DEFAULT 0.5,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '90 days'),
  related_suggestion_id uuid NULL
);

ALTER TABLE public.delma_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and supervisors can manage delma_memory"
  ON public.delma_memory FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

-- Table: delma_suggestions
CREATE TABLE public.delma_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL DEFAULT 'robot_training' CHECK (category IN ('robot_training', 'agent_goals', 'report_schedule')),
  title text NOT NULL,
  justification text NOT NULL DEFAULT '',
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence_score integer NOT NULL DEFAULT 50 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  memories_used jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'edited', 'rejected')),
  reject_reason text NULL,
  decided_by uuid NULL,
  decided_at timestamp with time zone NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.delma_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and supervisors can manage delma_suggestions"
  ON public.delma_suggestions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

-- Table: agent_goals
CREATE TABLE public.agent_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  agent_name text NOT NULL DEFAULT '',
  metric text NOT NULL DEFAULT 'tma' CHECK (metric IN ('tma', 'volume', 'resolution_rate')),
  current_value float NOT NULL DEFAULT 0,
  suggested_value float NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  suggested_at timestamp with time zone NOT NULL DEFAULT now(),
  decided_at timestamp with time zone NULL,
  decided_by uuid NULL,
  reject_reason text NULL,
  suggestion_id uuid NULL REFERENCES public.delma_suggestions(id) ON DELETE SET NULL
);

ALTER TABLE public.agent_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and supervisors can manage agent_goals"
  ON public.agent_goals FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));
