-- Create work_schedules table for agent shift management
CREATE TABLE public.work_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 6=Saturday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id),
  UNIQUE(user_id, day_of_week)
);

-- Enable RLS
ALTER TABLE public.work_schedules ENABLE ROW LEVEL SECURITY;

-- Admins can manage all schedules
CREATE POLICY "Admins can manage work schedules"
ON public.work_schedules
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Users can view their own schedule
CREATE POLICY "Users can view own schedule"
ON public.work_schedules
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Create trigger to update updated_at
CREATE TRIGGER update_work_schedules_updated_at
BEFORE UPDATE ON public.work_schedules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();