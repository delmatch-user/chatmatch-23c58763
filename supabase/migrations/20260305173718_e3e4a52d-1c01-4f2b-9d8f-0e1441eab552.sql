
-- Create google_calendar_tokens table for centralized OAuth token storage
CREATE TABLE public.google_calendar_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz NOT NULL,
  google_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.google_calendar_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage google tokens"
  ON public.google_calendar_tokens
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access google tokens"
  ON public.google_calendar_tokens
  FOR SELECT
  USING (true);

-- Add columns to sdr_appointments for Google Meet integration
ALTER TABLE public.sdr_appointments 
  ADD COLUMN IF NOT EXISTS google_meet_url text,
  ADD COLUMN IF NOT EXISTS google_event_id text,
  ADD COLUMN IF NOT EXISTS transcription_text text,
  ADD COLUMN IF NOT EXISTS transcription_summary text,
  ADD COLUMN IF NOT EXISTS processing_status text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS transcript_import_attempts integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transcript_import_error text,
  ADD COLUMN IF NOT EXISTS next_transcript_check timestamptz;
