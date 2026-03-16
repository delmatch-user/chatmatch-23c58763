-- Fix RLS for creating conversations from the client
-- The previous ALL policy used user_can_access_conversation(id) in WITH CHECK, which fails on INSERT
-- because the row doesn't exist yet when the function queries the table.

DROP POLICY IF EXISTS "Conversations modifiable by authorized users" ON public.conversations;

-- Allow creating a conversation if the user is admin/supervisor, is assigning it to themselves,
-- or belongs to the selected department.
CREATE POLICY "Conversations insertable by authorized users"
ON public.conversations
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::public.app_role)
  OR has_role(auth.uid(), 'supervisor'::public.app_role)
  OR assigned_to = auth.uid()
  OR department_id IN (
    SELECT pd.department_id
    FROM public.profile_departments pd
    WHERE pd.profile_id = auth.uid()
  )
);

-- Keep update/delete protected by the existing access function
CREATE POLICY "Conversations updatable by authorized users"
ON public.conversations
FOR UPDATE
USING (user_can_access_conversation(id))
WITH CHECK (user_can_access_conversation(id));

CREATE POLICY "Conversations deletable by authorized users"
ON public.conversations
FOR DELETE
USING (user_can_access_conversation(id));
