
-- Tabela robot_schedules
CREATE TABLE public.robot_schedules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  robot_id uuid NOT NULL REFERENCES public.robots(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(robot_id, day_of_week)
);

-- Trigger updated_at
CREATE TRIGGER update_robot_schedules_updated_at
  BEFORE UPDATE ON public.robot_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.robot_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Robot schedules viewable by authenticated users"
  ON public.robot_schedules FOR SELECT
  USING (true);

CREATE POLICY "Robot schedules manageable by admins and supervisors"
  ON public.robot_schedules FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

-- Função is_robot_within_schedule
CREATE OR REPLACE FUNCTION public.is_robot_within_schedule(robot_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM robot_schedules WHERE robot_id = robot_uuid
    ) THEN true
    ELSE EXISTS (
      SELECT 1 FROM robot_schedules
      WHERE robot_id = robot_uuid
        AND is_active = true
        AND day_of_week = EXTRACT(DOW FROM now() AT TIME ZONE 'America/Sao_Paulo')::integer
        AND (now() AT TIME ZONE 'America/Sao_Paulo')::time BETWEEN start_time AND end_time
    )
  END;
$$;
