CREATE POLICY "Franqueados can view machine logs"
ON public.conversation_logs
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'franqueado'::app_role)
  AND channel = 'machine'
  AND EXISTS (
    SELECT 1 FROM franqueado_cities fc
    WHERE fc.user_id = auth.uid()
    AND conversation_logs.contact_notes ILIKE '%franqueado:' || fc.city || '%'
  )
);