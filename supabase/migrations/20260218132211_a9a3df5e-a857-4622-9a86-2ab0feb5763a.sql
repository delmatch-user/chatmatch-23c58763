
-- Update SELECT policy to allow department members to see shared messages
DROP POLICY IF EXISTS "Users can view their own quick messages" ON public.quick_messages;

CREATE POLICY "Users can view their own or department quick messages"
ON public.quick_messages
FOR SELECT
USING (
  user_id = auth.uid()
  OR (
    department_id IS NOT NULL
    AND department_id IN (
      SELECT pd.department_id FROM profile_departments pd WHERE pd.profile_id = auth.uid()
    )
  )
);
