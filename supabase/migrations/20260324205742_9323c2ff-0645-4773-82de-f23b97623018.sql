
CREATE TABLE public.agent_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  sent_by uuid NOT NULL,
  period_days integer NOT NULL DEFAULT 7,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents can view own notifications"
  ON public.agent_notifications FOR SELECT TO authenticated
  USING (agent_id = auth.uid());

CREATE POLICY "Agents can update own notifications"
  ON public.agent_notifications FOR UPDATE TO authenticated
  USING (agent_id = auth.uid())
  WITH CHECK (agent_id = auth.uid());

CREATE POLICY "Admins can manage notifications"
  ON public.agent_notifications FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor'));
