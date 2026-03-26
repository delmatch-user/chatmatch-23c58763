
CREATE TABLE public.meta_webhook_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  from_phone text,
  phone_number_id_payload text,
  wamid text,
  event_kind text NOT NULL DEFAULT 'message',
  decision text NOT NULL DEFAULT 'unknown',
  reason text,
  connection_id uuid,
  conversation_id uuid,
  contact_id uuid,
  raw_snippet text
);

CREATE INDEX idx_meta_webhook_audit_received ON public.meta_webhook_audit (received_at DESC);
CREATE INDEX idx_meta_webhook_audit_phone ON public.meta_webhook_audit (from_phone);
CREATE INDEX idx_meta_webhook_audit_decision ON public.meta_webhook_audit (decision);

ALTER TABLE public.meta_webhook_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and supervisors can view audit"
  ON public.meta_webhook_audit
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role)
  );

CREATE POLICY "Service role full access audit"
  ON public.meta_webhook_audit
  FOR ALL
  TO public
  USING (true);
