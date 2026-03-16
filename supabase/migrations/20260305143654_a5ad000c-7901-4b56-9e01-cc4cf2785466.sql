
CREATE TABLE public.channel_announcement_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.internal_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

ALTER TABLE public.channel_announcement_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own reads"
  ON public.channel_announcement_reads
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own reads"
  ON public.channel_announcement_reads
  FOR SELECT
  USING (user_id = auth.uid());
