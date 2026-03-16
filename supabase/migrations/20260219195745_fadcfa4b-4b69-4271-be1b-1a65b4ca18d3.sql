-- Recriar profiles_public sem security_invoker para que todos os atendentes
-- possam ver o status/nome dos outros usuários (dados públicos apenas)
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = off)
AS
SELECT
  id,
  name,
  avatar_url,
  status,
  created_at,
  updated_at
FROM profiles;

-- Garantir acesso para usuários autenticados
GRANT SELECT ON public.profiles_public TO authenticated;