-- Criar trigger para novos usuários (não existe atualmente)
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Também garantir que user_roles tem a FK correta para profiles (não auth.users)
-- Primeiro verificar se a FK atual aponta para auth.users e corrigir se necessário

-- Adicionar constraint unique para evitar duplicatas de role por usuário
ALTER TABLE public.user_roles 
  DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;

ALTER TABLE public.user_roles 
  ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);