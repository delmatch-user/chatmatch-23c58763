CREATE TABLE public.message_deletion_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  deleted_by uuid NOT NULL,
  deleted_by_name text NOT NULL,
  reason text NOT NULL,
  message_content text,
  message_sender_name text,
  message_created_at timestamptz,
  contact_name text,
  contact_phone text,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.message_deletion_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert deletion logs"
ON public.message_deletion_logs FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can view deletion logs"
ON public.message_deletion_logs FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));