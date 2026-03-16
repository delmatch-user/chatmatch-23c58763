-- ==============================================
-- FIX 1: Restrict internal_messages to sender/receiver/channel members only
-- ==============================================

-- Drop the existing overly permissive policy
DROP POLICY IF EXISTS "Mensagens internas visíveis" ON internal_messages;

-- Create a new policy that only allows users to see their own messages
CREATE POLICY "Users can only view their own internal messages"
ON internal_messages
FOR SELECT
TO authenticated
USING (
  sender_id = auth.uid() 
  OR receiver_id = auth.uid()
  OR (
    channel_id IS NOT NULL AND 
    channel_id IN (
      SELECT cm.channel_id FROM channel_members cm 
      WHERE cm.user_id = auth.uid() 
      OR cm.department_id IN (SELECT pd.department_id FROM profile_departments pd WHERE pd.profile_id = auth.uid())
    )
  )
);

-- ==============================================
-- FIX 2: Restrict internal_channels to members only
-- ==============================================

DROP POLICY IF EXISTS "Canais visíveis por usuários autenticados" ON internal_channels;

CREATE POLICY "Users can view channels they belong to"
ON internal_channels
FOR SELECT
TO authenticated
USING (
  -- Admins and supervisors can see all channels
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role)
  OR
  -- Regular users can see channels they're members of
  id IN (
    SELECT cm.channel_id FROM channel_members cm 
    WHERE cm.user_id = auth.uid() 
    OR cm.department_id IN (SELECT pd.department_id FROM profile_departments pd WHERE pd.profile_id = auth.uid())
  )
);

-- ==============================================
-- FIX 3: Restrict channel_members visibility
-- ==============================================

DROP POLICY IF EXISTS "Membros visíveis por usuários autenticados" ON channel_members;

CREATE POLICY "Users can view channel members they belong to"
ON channel_members
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role)
  OR user_id = auth.uid()
  OR channel_id IN (
    SELECT cm.channel_id FROM channel_members cm 
    WHERE cm.user_id = auth.uid() 
    OR cm.department_id IN (SELECT pd.department_id FROM profile_departments pd WHERE pd.profile_id = auth.uid())
  )
);

-- ==============================================
-- FIX 4: Restrict contacts to authenticated users in same department
-- ==============================================

DROP POLICY IF EXISTS "Contacts viewable by authenticated users" ON contacts;

CREATE POLICY "Contacts viewable by authenticated users in same department"
ON contacts
FOR SELECT
TO authenticated
USING (
  -- Admins and supervisors can see all contacts
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role)
  OR
  -- Regular users can see contacts from conversations they have access to
  id IN (
    SELECT c.contact_id FROM conversations c
    WHERE user_can_access_conversation(c.id)
  )
);

-- ==============================================
-- FIX 5: Restrict conversations access
-- ==============================================

DROP POLICY IF EXISTS "Conversations viewable by authenticated users" ON conversations;

CREATE POLICY "Conversations viewable by authorized users"
ON conversations
FOR SELECT
TO authenticated
USING (user_can_access_conversation(id));

DROP POLICY IF EXISTS "Conversations modifiable by authenticated users" ON conversations;

CREATE POLICY "Conversations modifiable by authorized users"
ON conversations
FOR ALL
TO authenticated
USING (user_can_access_conversation(id))
WITH CHECK (user_can_access_conversation(id));

-- ==============================================
-- FIX 6: Restrict conversation_logs visibility
-- ==============================================

-- Keep existing policy but ensure it requires auth
-- The existing policy already restricts to finalized_by or admin/supervisor

-- ==============================================
-- FIX 7: Restrict transfer_logs visibility
-- ==============================================

DROP POLICY IF EXISTS "Transfer logs viewable by authenticated users" ON transfer_logs;

CREATE POLICY "Transfer logs viewable by authorized users"
ON transfer_logs
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR from_user_id = auth.uid()
  OR to_user_id = auth.uid()
  OR conversation_id IN (SELECT id FROM conversations WHERE user_can_access_conversation(id))
);

-- ==============================================
-- FIX 8: Protect whatsapp_connections verify_token from exposure
-- ==============================================

DROP POLICY IF EXISTS "WA connections viewable by authenticated users" ON whatsapp_connections;

-- Create a view that excludes verify_token for non-admins
-- Regular users can see connections but not the verify_token
CREATE POLICY "WA connections viewable by admins only"
ON whatsapp_connections
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- ==============================================
-- FIX 9: Restrict user_roles visibility 
-- ==============================================

DROP POLICY IF EXISTS "Roles viewable by authenticated users" ON user_roles;

CREATE POLICY "Roles viewable by authenticated users"
ON user_roles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() 
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
);

-- ==============================================
-- FIX 10: Restrict departments visibility (keep for all auth users)
-- ==============================================

-- Departments are generally safe to be visible to all authenticated users
-- since they don't contain sensitive data - keeping as is

-- ==============================================
-- FIX 11: Restrict profile_departments visibility
-- ==============================================

DROP POLICY IF EXISTS "Profile_departments viewable by authenticated users" ON profile_departments;

CREATE POLICY "Profile_departments viewable by authorized users"
ON profile_departments
FOR SELECT
TO authenticated
USING (
  profile_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR department_id IN (SELECT pd.department_id FROM profile_departments pd WHERE pd.profile_id = auth.uid())
);

-- ==============================================
-- FIX 12: Restrict robots visibility to auth users who need it
-- ==============================================

DROP POLICY IF EXISTS "Robots viewable by authenticated users" ON robots;

CREATE POLICY "Robots viewable by users in matching departments"
ON robots
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR departments && ARRAY(
    SELECT d.id::text FROM profile_departments pd 
    JOIN departments d ON d.id = pd.department_id 
    WHERE pd.profile_id = auth.uid()
  )
);