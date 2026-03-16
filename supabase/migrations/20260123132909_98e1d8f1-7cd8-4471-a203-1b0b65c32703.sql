-- Add deleted column to messages table
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false;

-- Create message_reactions table
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  external_message_id TEXT,
  emoji TEXT NOT NULL,
  sender_phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_reactions_message ON public.message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_reactions_external ON public.message_reactions(external_message_id);

-- Enable RLS
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- RLS policies for message_reactions
CREATE POLICY "Reactions viewable by conversation participants"
ON public.message_reactions
FOR SELECT
USING (
  message_id IN (
    SELECT m.id FROM public.messages m
    WHERE user_can_access_conversation(m.conversation_id)
  )
);

CREATE POLICY "Reactions insertable by system"
ON public.message_reactions
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Reactions deletable by admins"
ON public.message_reactions
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));