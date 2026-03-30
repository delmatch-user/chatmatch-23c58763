
-- Revert restrictive contacts RLS policies back to original open access

DROP POLICY IF EXISTS "Contacts viewable by department members" ON public.contacts;
DROP POLICY IF EXISTS "Contacts updatable by authorized users" ON public.contacts;
DROP POLICY IF EXISTS "Franqueados can view relevant contacts" ON public.contacts;

-- Restore original open SELECT
CREATE POLICY "Contacts viewable by authenticated users" ON public.contacts
FOR SELECT TO authenticated
USING (true);

-- Restore original open UPDATE
CREATE POLICY "Contacts updatable by authenticated users" ON public.contacts
FOR UPDATE TO authenticated
USING (true)
WITH CHECK (true);
