
CREATE TABLE public.brain_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  period integer NOT NULL DEFAULT 7,
  provider text NOT NULL DEFAULT 'unknown',
  content text NOT NULL DEFAULT '',
  context text,
  schedule_type text DEFAULT 'manual'
);

ALTER TABLE public.brain_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and supervisors can manage brain_reports"
  ON public.brain_reports
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));
