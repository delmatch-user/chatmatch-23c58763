
-- Primeiro criar o perfil
INSERT INTO public.profiles (id, email, name) 
VALUES ('e10981ad-7938-4d4a-a225-15cb766b3f30', 'matteus.febronio@hotmail.com', 'Matteus Febronio')
ON CONFLICT (id) DO NOTHING;
