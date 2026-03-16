ALTER TABLE public.conversation_logs ADD COLUMN channel text DEFAULT 'whatsapp';
ALTER TABLE public.conversation_logs ADD COLUMN contact_notes text;