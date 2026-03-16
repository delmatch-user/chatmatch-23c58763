
-- Add protocol column to conversations
ALTER TABLE conversations ADD COLUMN protocol text UNIQUE;

-- Add protocol column to conversation_logs
ALTER TABLE conversation_logs ADD COLUMN protocol text;

-- Create trigger function to auto-generate protocol
CREATE OR REPLACE FUNCTION generate_conversation_protocol()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  today_prefix text;
  seq_num integer;
BEGIN
  today_prefix := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYYMMDD');
  
  SELECT COALESCE(MAX(
    CAST(split_part(protocol, '-', 2) AS integer)
  ), 0) + 1 INTO seq_num
  FROM conversations
  WHERE protocol LIKE today_prefix || '-%';
  
  NEW.protocol := today_prefix || '-' || lpad(seq_num::text, 5, '0');
  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER trg_generate_protocol
  BEFORE INSERT ON conversations
  FOR EACH ROW
  WHEN (NEW.protocol IS NULL)
  EXECUTE FUNCTION generate_conversation_protocol();
