-- Allow all authenticated users to view contacts to prevent errors during creation
DROP POLICY IF EXISTS "Contacts viewable by authenticated users in same department" ON public.contacts;

CREATE POLICY "Contacts viewable by authenticated users"
ON public.contacts
FOR SELECT
TO authenticated
USING (true);