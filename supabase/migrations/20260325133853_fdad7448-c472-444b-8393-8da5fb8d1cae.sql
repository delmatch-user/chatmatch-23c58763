
-- Table to store Delma's training suggestions for robots
CREATE TABLE public.robot_training_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  robot_id UUID NOT NULL REFERENCES public.robots(id) ON DELETE CASCADE,
  robot_name TEXT NOT NULL,
  suggestion_type TEXT NOT NULL DEFAULT 'qa', -- 'qa', 'tone', 'instruction'
  title TEXT NOT NULL,
  content TEXT NOT NULL, -- The actual suggestion content (Q&A pair, instruction text, etc.)
  reasoning TEXT, -- Why Delma thinks this is needed
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  applied_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.robot_training_suggestions ENABLE ROW LEVEL SECURITY;

-- Admins and supervisors can manage suggestions
CREATE POLICY "Admins and supervisors can manage training suggestions"
ON public.robot_training_suggestions
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.robot_training_suggestions;
