CREATE OR REPLACE FUNCTION public.user_can_access_conversation(_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = _conversation_id
    AND (
      c.assigned_to = auth.uid()
      OR has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.profile_departments pd
        WHERE pd.profile_id = auth.uid()
        AND pd.department_id = c.department_id
      )
      OR (
        has_role(auth.uid(), 'franqueado'::app_role)
        AND c.channel = 'machine'
        AND EXISTS (
          SELECT 1 FROM public.contacts ct
          JOIN public.franqueado_cities fc ON fc.user_id = auth.uid()
          WHERE ct.id = c.contact_id
          AND ct.notes ILIKE '%franqueado:' || fc.city || '%'
        )
      )
    )
  )
$$;