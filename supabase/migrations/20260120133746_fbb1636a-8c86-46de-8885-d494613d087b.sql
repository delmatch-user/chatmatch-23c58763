-- =====================================================
-- Security Fix 1: Time-restricted access to conversation_logs
-- =====================================================

-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Users can view own finalized logs" ON public.conversation_logs;

-- Create new time-restricted policy (30 days for agents, unlimited for admins/supervisors)
CREATE POLICY "Time-restricted log access" ON public.conversation_logs
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'supervisor'::app_role) OR
  (finalized_by = auth.uid() AND finalized_at > now() - interval '30 days')
);

-- =====================================================
-- Security Fix 2: Create profiles_public view to hide PII
-- =====================================================

-- Create view without sensitive fields (email, phone)
CREATE VIEW public.profiles_public 
WITH (security_invoker = on) AS
SELECT 
  id, 
  name, 
  avatar_url, 
  status, 
  created_at, 
  updated_at
FROM public.profiles;

-- Grant access to authenticated users
GRANT SELECT ON public.profiles_public TO authenticated;

-- Update profiles SELECT policy to be more restrictive
-- Only allow full access to own profile or admin/supervisor
DROP POLICY IF EXISTS "Users can view own profile and colleagues" ON public.profiles;

CREATE POLICY "Restrict full profile access" ON public.profiles
FOR SELECT TO authenticated
USING (
  id = auth.uid() OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'supervisor'::app_role)
);