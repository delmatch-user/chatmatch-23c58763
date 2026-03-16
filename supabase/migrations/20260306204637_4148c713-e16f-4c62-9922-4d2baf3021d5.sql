
-- 1. Set DEFAULT 'sent' on delivery_status column
ALTER TABLE messages ALTER COLUMN delivery_status SET DEFAULT 'sent';

-- 2. Create trigger function to ensure delivery_status is never NULL for agent messages
CREATE OR REPLACE FUNCTION set_delivery_status_for_non_webhook_channels()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.delivery_status IS NULL AND NEW.sender_id IS NOT NULL THEN
    NEW.delivery_status := 'sent';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create trigger
CREATE TRIGGER trg_default_delivery_status
BEFORE INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION set_delivery_status_for_non_webhook_channels();
