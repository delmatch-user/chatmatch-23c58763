CREATE UNIQUE INDEX IF NOT EXISTS unique_baileys_phone 
ON whatsapp_connections (phone_number_id, connection_type);