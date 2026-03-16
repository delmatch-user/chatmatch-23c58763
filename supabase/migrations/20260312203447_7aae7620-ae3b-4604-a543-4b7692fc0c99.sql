
-- Função utilitária para merge transacional de contatos duplicados
CREATE OR REPLACE FUNCTION public.merge_duplicate_contacts(primary_id uuid, duplicate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  moved_messages int := 0;
  moved_conversations int := 0;
  merged_conversations int := 0;
  primary_conv_id uuid;
  dup_conv record;
BEGIN
  -- Validar que ambos existem
  IF NOT EXISTS (SELECT 1 FROM contacts WHERE id = primary_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Primary contact not found');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM contacts WHERE id = duplicate_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Duplicate contact not found');
  END IF;
  IF primary_id = duplicate_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot merge contact with itself');
  END IF;

  -- Buscar conversa ativa do contato primário
  SELECT id INTO primary_conv_id FROM conversations
    WHERE contact_id = primary_id
    AND status IN ('em_fila', 'em_atendimento', 'pendente', 'transferida')
    ORDER BY created_at DESC LIMIT 1;

  -- Processar conversas do contato duplicado
  FOR dup_conv IN
    SELECT id, status, assigned_to, assigned_to_robot
    FROM conversations WHERE contact_id = duplicate_id
    AND status IN ('em_fila', 'em_atendimento', 'pendente', 'transferida')
  LOOP
    IF primary_conv_id IS NOT NULL THEN
      -- Mover mensagens para a conversa do primário
      UPDATE messages SET conversation_id = primary_conv_id WHERE conversation_id = dup_conv.id;
      GET DIAGNOSTICS moved_messages = ROW_COUNT;
      -- Finalizar conversa duplicada
      UPDATE conversations SET status = 'finalizada', updated_at = now() WHERE id = dup_conv.id;
      merged_conversations := merged_conversations + 1;
    ELSE
      -- Reatribuir conversa ao contato primário
      UPDATE conversations SET contact_id = primary_id WHERE id = dup_conv.id;
      primary_conv_id := dup_conv.id;
      moved_conversations := moved_conversations + 1;
    END IF;
  END LOOP;

  -- Também reatribuir conversas finalizadas do duplicado
  UPDATE conversations SET contact_id = primary_id WHERE contact_id = duplicate_id AND status = 'finalizada';

  -- Marcar contato duplicado como merged
  UPDATE contacts SET phone = null, notes = 'merged_into:' || primary_id::text WHERE id = duplicate_id;

  RETURN jsonb_build_object(
    'success', true,
    'moved_messages', moved_messages,
    'moved_conversations', moved_conversations,
    'merged_conversations', merged_conversations
  );
END;
$$;
