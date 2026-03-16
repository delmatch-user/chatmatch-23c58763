
-- Adicionar role admin
INSERT INTO public.user_roles (user_id, role) 
VALUES ('e10981ad-7938-4d4a-a225-15cb766b3f30', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
