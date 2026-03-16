-- Finalizar conversa duplicada criada pelo contato LID fantasma
UPDATE conversations SET status = 'finalizada' WHERE id = 'fcf083bc-c34d-4071-b4bc-9419860b564f';

-- Deletar o contato LID fantasma sem telefone (já existe o contato real a05c64b2)
DELETE FROM contacts WHERE id = '5a1fe5b2-de7d-45b1-ad3b-c0a6434ad584';