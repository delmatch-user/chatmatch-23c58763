ALTER TABLE public.meta_webhook_audit
  ADD COLUMN IF NOT EXISTS field text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS entry_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS signature_valid boolean DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_test boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_meta_webhook_audit_received_at ON public.meta_webhook_audit (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_webhook_audit_is_test ON public.meta_webhook_audit (is_test) WHERE is_test = true;
CREATE INDEX IF NOT EXISTS idx_meta_webhook_audit_field ON public.meta_webhook_audit (field);