
-- 1. Update user_can_access_conversation to remove supervisor global access
CREATE OR REPLACE FUNCTION public.user_can_access_conversation(_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
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
    )
  )
$$;

-- 2. Update conversation_logs SELECT policy to restrict supervisor by department
DROP POLICY IF EXISTS "Time-restricted log access" ON public.conversation_logs;
CREATE POLICY "Time-restricted log access" ON public.conversation_logs
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'supervisor'::app_role)
    AND department_id IN (
      SELECT pd.department_id FROM profile_departments pd
      WHERE pd.profile_id = auth.uid()
    )
  )
  OR (
    finalized_by = auth.uid()
    AND finalized_at > (now() - '30 days'::interval)
  )
);
