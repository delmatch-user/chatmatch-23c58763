CREATE TABLE public.delma_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  severity text NOT NULL DEFAULT 'yellow',
  description text NOT NULL,
  affected_entity text,
  affected_entity_id uuid,
  metric_current numeric,
  metric_baseline numeric,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution_notes text,
  auto_suggestion_id uuid
);

ALTER TABLE public.delma_anomalies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage anomalies" ON public.delma_anomalies
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'supervisor'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'supervisor'::app_role));