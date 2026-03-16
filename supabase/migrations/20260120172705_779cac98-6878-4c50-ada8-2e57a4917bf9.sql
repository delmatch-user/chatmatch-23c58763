-- Add assigned_to_robot column to conversations table
ALTER TABLE conversations 
  ADD COLUMN IF NOT EXISTS assigned_to_robot UUID REFERENCES robots(id) ON DELETE SET NULL;

-- Add robot transfer fields to transfer_logs table
ALTER TABLE transfer_logs
  ADD COLUMN IF NOT EXISTS to_robot_id UUID REFERENCES robots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS to_robot_name TEXT;

-- Create index for faster robot assignment queries
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_to_robot ON conversations(assigned_to_robot);

-- Update conversations RLS to allow robot-assigned conversations
DROP POLICY IF EXISTS "Conversations viewable by authorized users" ON conversations;
CREATE POLICY "Conversations viewable by authorized users" ON conversations
  FOR SELECT TO authenticated
  USING (user_can_access_conversation(id));

-- Allow robots table to be queried for department matching
DROP POLICY IF EXISTS "Robots viewable by all authenticated users" ON robots;
CREATE POLICY "Robots viewable by all authenticated users" ON robots
  FOR SELECT TO authenticated
  USING (true);