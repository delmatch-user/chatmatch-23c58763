
-- 1) Mover mensagens da conversa duplicada (LID 277291745701923) para a conversa principal
UPDATE messages 
SET conversation_id = '92831f09-17d5-4f7b-85e8-5d260264d611'
WHERE conversation_id = '091eb816-1bd2-4fb7-a5e1-4b8df093d1c0';

-- 2) Deletar a conversa duplicada
DELETE FROM conversations WHERE id = '091eb816-1bd2-4fb7-a5e1-4b8df093d1c0';

-- 3) Atualizar o contato principal com o avatar do duplicado (se melhor)
UPDATE contacts 
SET notes = COALESCE(notes, '') || '|lid:277291745701923@lid'
WHERE id = 'db1d5529-a654-45f3-9aff-5b51551a526d';

-- 4) Deletar o contato duplicado
DELETE FROM contacts WHERE id = '8a2dda93-4133-4e9e-becc-0a8333b2595c';

-- 5) Registrar no whatsapp_lid_map para evitar duplicação futura
INSERT INTO whatsapp_lid_map (lid_jid, phone_digits, instance_id)
VALUES ('277291745701923@lid', '5516996194049', 'default')
ON CONFLICT DO NOTHING;
