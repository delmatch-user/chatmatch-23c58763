
CREATE TABLE public.robot_change_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  robot_id uuid NOT NULL,
  suggestion_id uuid,
  current_instruction text NOT NULL,
  new_instruction text NOT NULL,
  affected_section text,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  applied_at timestamptz,
  applied_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.robot_change_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage robot_change_schedule" ON public.robot_change_schedule
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.delma_chat_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  command text NOT NULL,
  action_type text NOT NULL,
  result text NOT NULL DEFAULT 'pending',
  result_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.delma_chat_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage delma_chat_logs" ON public.delma_chat_logs
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
