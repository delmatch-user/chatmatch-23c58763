
CREATE TABLE public.appointment_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.sdr_appointments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  alert_type text NOT NULL DEFAULT 'daily',
  title text NOT NULL,
  body text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  scheduled_for timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.appointment_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own alerts" ON public.appointment_alerts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can update own alerts" ON public.appointment_alerts
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Admins supervisors can manage alerts" ON public.appointment_alerts
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Service can insert alerts" ON public.appointment_alerts
  FOR INSERT TO public WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.appointment_alerts;
