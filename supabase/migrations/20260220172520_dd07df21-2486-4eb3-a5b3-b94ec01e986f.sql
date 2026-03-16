-- Migração 1: Criar função SECURITY DEFINER para expor apenas id/name/avatar_url
-- de membros do mesmo departamento, sem expor email/phone sensíveis
CREATE OR REPLACE FUNCTION public.get_department_members_public(_department_id uuid)
RETURNS TABLE(id uuid, name text, avatar_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
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

-- Migração 2: Permitir atendentes verem logs do seu próprio departamento
-- (necessário para o ranking funcionar para todos os perfis)
CREATE POLICY "Department members can view department logs"
ON public.conversation_logs
FOR SELECT
USING (
  department_id IN (
    SELECT pd.department_id
    FROM profile_departments pd
    WHERE pd.profile_id = auth.uid()
  )
);