
-- 1. Add manually_activated column
ALTER TABLE public.robots ADD COLUMN manually_activated boolean NOT NULL DEFAULT false;

-- 2. Recreate sync_robot_statuses with manual activation support
CREATE OR REPLACE FUNCTION public.sync_robot_statuses()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  activated integer := 0;
  paused integer := 0;
BEGIN
  -- Ativar robôs que estão no horário mas pausados (e resetar manually_activated)
  UPDATE robots SET status = 'active', manually_activated = false, updated_at = now()
  WHERE status = 'paused'
    AND id IN (
      SELECT DISTINCT rs.robot_id FROM robot_schedules rs
      WHERE rs.is_active = true
        AND rs.day_of_week = EXTRACT(DOW FROM now() AT TIME ZONE 'America/Sao_Paulo')::integer
        AND (now() AT TIME ZONE 'America/Sao_Paulo')::time BETWEEN rs.start_time AND rs.end_time
    );
  GET DIAGNOSTICS activated = ROW_COUNT;

  -- Pausar robôs que estão fora do horário mas ativos (apenas se tem escala e NÃO foi ativado manualmente)
  UPDATE robots SET status = 'paused', updated_at = now()
  WHERE status = 'active'
    AND manually_activated = false
    AND id IN (
      SELECT DISTINCT rs2.robot_id FROM robot_schedules rs2
      WHERE rs2.is_active = true
    )
    AND id NOT IN (
      SELECT DISTINCT rs3.robot_id FROM robot_schedules rs3
      WHERE rs3.is_active = true
        AND rs3.day_of_week = EXTRACT(DOW FROM now() AT TIME ZONE 'America/Sao_Paulo')::integer
        AND (now() AT TIME ZONE 'America/Sao_Paulo')::time BETWEEN rs3.start_time AND rs3.end_time
    );
  GET DIAGNOSTICS paused = ROW_COUNT;

  RETURN activated + paused;
END;
$function$;
