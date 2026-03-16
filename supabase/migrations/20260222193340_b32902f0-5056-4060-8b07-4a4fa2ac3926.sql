
-- 1. Reverter RPC para verificar que o usuario pertence ao departamento
CREATE OR REPLACE FUNCTION public.get_ranking_team_members(_department_id uuid)
RETURNS TABLE(id uuid, name text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.name, p.avatar_url
  FROM profiles p
  JOIN profile_departments pd ON pd.profile_id = p.id
  WHERE pd.department_id = _department_id
    AND EXISTS (
      SELECT 1 FROM profile_departments my_pd
      WHERE my_pd.profile_id = auth.uid()
      AND my_pd.department_id = _department_id
    );
$$;

-- 2. Remover politica aberta em conversation_logs
DROP POLICY IF EXISTS "Authenticated users can view ranking logs" ON public.conversation_logs;

-- 3. Remover politica aberta em ranking_config
DROP POLICY IF EXISTS "Authenticated users can view ranking config" ON public.ranking_config;
