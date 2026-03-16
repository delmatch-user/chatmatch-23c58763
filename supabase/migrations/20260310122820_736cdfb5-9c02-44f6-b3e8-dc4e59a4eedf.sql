-- Step 1: Move messages from duplicate contacts to the original (oldest) contact's conversations
-- For each group of duplicates, keep the first (oldest) contact, merge conversations

-- Move messages from duplicate conversations to the original conversation
DO $$
DECLARE
  rec RECORD;
  dup_contact_id uuid;
  orig_contact_id uuid;
  orig_conv_id uuid;
  dup_conv RECORD;
BEGIN
  -- For each group of duplicate JID notes
  FOR rec IN 
    SELECT notes, 
           (array_agg(id ORDER BY created_at))[1] as keep_id,
           array_agg(id ORDER BY created_at) as all_ids
    FROM contacts 
    WHERE channel = 'whatsapp' AND notes LIKE 'jid:%'
    GROUP BY notes 
    HAVING count(*) > 1
  LOOP
    orig_contact_id := rec.keep_id;
    
    -- Get or find the original conversation for the kept contact
    SELECT id INTO orig_conv_id
    FROM conversations
    WHERE contact_id = orig_contact_id
    ORDER BY created_at ASC
    LIMIT 1;
    
    -- Process each duplicate contact (skip the first/original)
    FOR i IN 2..array_length(rec.all_ids, 1) LOOP
      dup_contact_id := rec.all_ids[i];
      
      -- Move all messages from duplicate's conversations to original conversation
      FOR dup_conv IN 
        SELECT id FROM conversations WHERE contact_id = dup_contact_id
      LOOP
        IF orig_conv_id IS NOT NULL THEN
          -- Move messages
          UPDATE messages SET conversation_id = orig_conv_id WHERE conversation_id = dup_conv.id;
          -- Move reactions
          UPDATE message_reactions SET message_id = message_id WHERE message_id IN (
            SELECT id FROM messages WHERE conversation_id = dup_conv.id
          );
        END IF;
        -- Delete the duplicate conversation
        DELETE FROM conversations WHERE id = dup_conv.id;
      END LOOP;
      
      -- Delete the duplicate contact
      DELETE FROM contacts WHERE id = dup_contact_id;
      
      RAISE NOTICE 'Cleaned duplicate contact % (kept %)', dup_contact_id, orig_contact_id;
    END LOOP;
  END LOOP;
END $$;

-- Step 2: Create unique partial index to prevent future duplicates
CREATE UNIQUE INDEX uq_contact_whatsapp_jid 
ON contacts(notes) 
WHERE channel = 'whatsapp' AND notes LIKE 'jid:%';