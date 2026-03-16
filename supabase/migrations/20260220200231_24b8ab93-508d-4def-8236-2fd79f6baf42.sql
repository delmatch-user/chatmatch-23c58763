-- Mudança 1: Nova RPC get_ranking_team_members (SECURITY DEFINER, sem restrição de departamento)
CREATE OR REPLACE FUNCTION public.get_ranking_team_members(_department_id uuid)
RETURNS TABLE(id uuid, name text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.avatar_url
  FROM profiles p
  JOIN profile_departments pd ON pd.profile_id = p.id
  WHERE pd.department_id = _department_id
    AND auth.uid() IS NOT NULL;
$$;

-- Mudança 2: Nova política RLS em conversation_logs para qualquer autenticado (fins de ranking)
CREATE POLICY "Authenticated users can view ranking logs"
ON public.conversation_logs FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Mudança 3: Nova política RLS em ranking_config para qualquer autenticado
CREATE POLICY "Authenticated users can view ranking config"
ON public.ranking_config FOR SELECT
USING (auth.uid() IS NOT NULL);