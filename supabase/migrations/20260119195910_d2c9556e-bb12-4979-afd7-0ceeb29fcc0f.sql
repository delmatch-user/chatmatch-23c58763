-- Add columns to support dual WhatsApp integration
ALTER TABLE whatsapp_connections 
ADD COLUMN IF NOT EXISTS connection_type text NOT NULL DEFAULT 'baileys',
ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES departments(id),
ADD COLUMN IF NOT EXISTS verify_token text,
ADD COLUMN IF NOT EXISTS name text;

-- Add constraint for connection_type
ALTER TABLE whatsapp_connections 
ADD CONSTRAINT whatsapp_connections_connection_type_check 
CHECK (connection_type IN ('baileys', 'meta_api'));

-- Create index for faster lookups by department
CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_department 
ON whatsapp_connections(department_id);

-- Create index for connection type
CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_type 
ON whatsapp_connections(connection_type);