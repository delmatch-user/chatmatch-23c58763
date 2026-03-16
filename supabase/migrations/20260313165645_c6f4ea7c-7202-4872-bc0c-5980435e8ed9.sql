
-- Fix contacts where phone is actually a LID (>13 digits)
-- Update notes to use @lid suffix instead of @s.whatsapp.net
UPDATE contacts 
SET notes = 'jid:' || REGEXP_REPLACE(phone, '\D', '', 'g') || '@lid'
WHERE LENGTH(REGEXP_REPLACE(COALESCE(phone,''), '\D', '', 'g')) > 13
  AND notes LIKE '%@s.whatsapp.net%';
