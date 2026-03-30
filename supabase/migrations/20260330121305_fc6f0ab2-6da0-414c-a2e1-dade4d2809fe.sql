CREATE POLICY "Supervisors can manage sdr_appointments"
ON public.sdr_appointments FOR ALL TO authenticated
USING (has_role(auth.uid(), 'supervisor'::app_role))
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));