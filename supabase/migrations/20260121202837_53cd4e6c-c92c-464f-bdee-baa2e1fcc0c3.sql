-- 1. Atualizar política de profile_departments para permitir leitura por todos os autenticados
DROP POLICY IF EXISTS "Profile_departments viewable by authorized users" ON public.profile_departments;

CREATE POLICY "Profile_departments viewable by authenticated users"
ON public.profile_departments
FOR SELECT
TO authenticated
USING (true);

-- 2. Atualizar política de user_roles para permitir leitura por todos os autenticados
DROP POLICY IF EXISTS "Roles viewable by authenticated users" ON public.user_roles;

CREATE POLICY "Roles viewable by authenticated users"
ON public.user_roles
FOR SELECT
TO authenticated
USING (true);