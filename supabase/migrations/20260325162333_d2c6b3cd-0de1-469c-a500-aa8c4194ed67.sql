INSERT INTO conversation_logs (
  conversation_id, contact_name, contact_phone, contact_notes,
  department_id, department_name, assigned_to, assigned_to_name,
  finalized_by, finalized_by_name, started_at, finalized_at,
  total_messages, tags, priority, channel, protocol, whatsapp_instance_id,
  messages
)
SELECT
  c.id,
  ct.name,
  ct.phone,
  ct.notes,
  c.department_id,
  d.name,
  c.assigned_to,
  p_assigned.name,
  null,
  'Delma [AUTO-24H]',
  c.created_at,
  now(),
  (SELECT count(*) FROM messages m WHERE m.conversation_id = c.id)::int,
  c.tags,
  c.priority::text,
  c.channel,
  c.protocol,
  c.whatsapp_instance_id,
  COALESCE(
    (SELECT jsonb_agg(jsonb_build_object(
      'content', m.content,
      'sender_name', m.sender_name,
      'created_at', m.created_at,
      'message_type', m.message_type
    ) ORDER BY m.created_at)
    FROM messages m WHERE m.conversation_id = c.id),
    '[]'::jsonb
  )
FROM conversations c
JOIN contacts ct ON ct.id = c.contact_id
LEFT JOIN departments d ON d.id = c.department_id
LEFT JOIN profiles p_assigned ON p_assigned.id = c.assigned_to
WHERE c.status IN ('em_fila', 'em_atendimento', 'pendente', 'transferida')
AND c.channel = 'whatsapp'
AND c.updated_at < now() - interval '24 hours';

UPDATE conversations
SET status = 'finalizada', updated_at = now()
WHERE status IN ('em_fila', 'em_atendimento', 'pendente', 'transferida')
AND channel = 'whatsapp'
AND updated_at < now() - interval '24 hours';