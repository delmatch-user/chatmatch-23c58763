UPDATE messages SET deleted = false 
WHERE deleted = true 
AND created_at > now() - interval '6 hours'
AND conversation_id IN (
  SELECT id FROM conversations WHERE whatsapp_instance_id = 'suporte'
);