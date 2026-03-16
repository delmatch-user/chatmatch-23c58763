-- Migration para corrigir contatos com LID no campo phone
-- Extrai o número real do campo notes (formato: jid:NUMERO@s.whatsapp.net)

-- Atualiza contatos onde:
-- 1. O phone atual parece ser um LID (mais de 15 dígitos ou não começa com código de país válido)
-- 2. O notes contém um JID com número real (@s.whatsapp.net, não @lid)
UPDATE public.contacts
SET phone = (
  -- Extrai o número do formato jid:NUMERO@s.whatsapp.net
  substring(notes from 'jid:(\d+)@s\.whatsapp\.net')
)
WHERE 
  -- Tem notes com JID real (não LID)
  notes ~ 'jid:\d+@s\.whatsapp\.net'
  -- E o phone atual não parece ser um número válido
  AND (
    -- Phone tem mais de 15 dígitos (provavelmente é LID)
    length(regexp_replace(phone, '\D', '', 'g')) > 15
    -- OU phone não começa com código de país comum
    OR (
      phone !~ '^55' 
      AND phone !~ '^\+55'
      AND length(regexp_replace(phone, '\D', '', 'g')) > 13
    )
  );

-- Log: Mostrar quantos contatos foram afetados (apenas para referência)
-- SELECT id, name, phone, notes FROM public.contacts WHERE notes ~ 'jid:\d+@s\.whatsapp\.net';