-- Fix infinite recursion in profile_departments RLS policy
DROP POLICY IF EXISTS "Profile_departments viewable by authorized users" ON profile_departments;

-- Create new policy without self-reference
CREATE POLICY "Profile_departments viewable by authorized users" ON profile_departments
  FOR SELECT TO authenticated
  USING (
    profile_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
  );

-- Fix robots SELECT policy to avoid dependency on profile_departments
DROP POLICY IF EXISTS "Robots viewable by users in matching departments" ON robots;

-- Robots are system configurations - all authenticated users can view
CREATE POLICY "Robots viewable by all authenticated users" ON robots
  FOR SELECT TO authenticated
  USING (true);