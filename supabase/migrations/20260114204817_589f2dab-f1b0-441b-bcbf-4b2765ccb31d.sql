-- Inserir perfil para usuário que faltou
INSERT INTO public.profiles (id, email, name)
VALUES ('e5056cbc-5b6a-4fe6-a4b2-087eaf0aeb36', 'mayara@delmatch.com.br', 'Mayara')
ON CONFLICT (id) DO NOTHING;

-- Inserir role padrão
INSERT INTO public.user_roles (user_id, role)
VALUES ('e5056cbc-5b6a-4fe6-a4b2-087eaf0aeb36', 'atendente')
ON CONFLICT (user_id, role) DO NOTHING;