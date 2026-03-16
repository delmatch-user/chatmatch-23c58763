DROP POLICY "Conversations updatable by authorized users" ON conversations;

CREATE POLICY "Conversations updatable by authorized users"
ON conversations
FOR UPDATE
TO authenticated
USING (user_can_access_conversation(id))
WITH CHECK (true);