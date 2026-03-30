
-- 1. Replace overly permissive contacts SELECT policy with department-scoped access
DROP POLICY IF EXISTS "Contacts viewable by authenticated users" ON public.contacts;

CREATE POLICY "Contacts viewable by department members" ON public.contacts
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR EXISTS (
    SELECT 1 FROM conversations c
    JOIN profile_departments pd ON pd.department_id = c.department_id
    WHERE c.contact_id = contacts.id
    AND pd.profile_id = auth.uid()
  )
  OR is_franqueado_for_city(auth.uid(), contacts.city)
);

-- 2. Tighten contacts UPDATE policy to department-scoped access
DROP POLICY IF EXISTS "Contacts updatable by authenticated users" ON public.contacts;

CREATE POLICY "Contacts updatable by authorized users" ON public.contacts
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR EXISTS (
    SELECT 1 FROM conversations c
    JOIN profile_departments pd ON pd.department_id = c.department_id
    WHERE c.contact_id = contacts.id
    AND pd.profile_id = auth.uid()
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR EXISTS (
    SELECT 1 FROM conversations c
    JOIN profile_departments pd ON pd.department_id = c.department_id
    WHERE c.contact_id = contacts.id
    AND pd.profile_id = auth.uid()
  )
);

-- 3. Tighten contacts INSERT - only admins, supervisors, or service role should create
-- Keep existing INSERT policy as-is since contacts are created via webhooks (service role)
-- and by authenticated users starting conversations
