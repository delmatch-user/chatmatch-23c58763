-- Add UPDATE policy for conversation_logs so admins can reset time metrics
CREATE POLICY "Admins can update conversation logs"
ON public.conversation_logs
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));