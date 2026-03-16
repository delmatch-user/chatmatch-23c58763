-- Vincular todos os usuários existentes a todos os departamentos
INSERT INTO profile_departments (profile_id, department_id)
SELECT p.id, d.id
FROM profiles p
CROSS JOIN departments d
ON CONFLICT DO NOTHING;