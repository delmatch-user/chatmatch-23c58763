
-- 1) Mover mensagens da conversa LID para a conversa com telefone real
UPDATE messages 
SET conversation_id = '92831f09-17d5-4f7b-85e8-5d260264d611'
WHERE conversation_id = '3b1ccbc1-96cd-4c0c-9a94-b1d198047120';

-- 2) Deletar a conversa duplicada (LID)
DELETE FROM conversations WHERE id = '3b1ccbc1-96cd-4c0c-9a94-b1d198047120';

-- 3) Atualizar o contato LID para apontar para o telefone real (merge)
-- Primeiro atualizar o contato principal com o avatar se não tiver
UPDATE contacts 
SET avatar_url = COALESCE(
  (SELECT avatar_url FROM contacts WHERE id = 'ac2e6f51-33c3-4ae1-a9f8-77edeba7d600'),
  avatar_url
),
notes = COALESCE(notes, '') || '|lid:230446839402527@lid'
WHERE id = 'db1d5529-a654-45f3-9aff-5b51551a526d';

-- 4) Deletar o contato duplicado (LID)
DELETE FROM contacts WHERE id = 'ac2e6f51-33c3-4ae1-a9f8-77edeba7d600';

-- 5) Registrar no whatsapp_lid_map para evitar duplicação futura
INSERT INTO whatsapp_lid_map (lid_jid, phone_digits, instance_id)
VALUES ('230446839402527@lid', '5516996194049', 'default')
ON CONFLICT DO NOTHING;
