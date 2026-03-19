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
  UPDATE robots SET status = 'active', manually_activated = false, updated_at = now()
  WHERE status = 'paused'
    AND auto_assign = true
    AND id IN (
      SELECT DISTINCT rs.robot_id FROM robot_schedules rs
      WHERE rs.is_active = true
        AND rs.day_of_week = EXTRACT(DOW FROM now() AT TIME ZONE 'America/Sao_Paulo')::integer
        AND (now() AT TIME ZONE 'America/Sao_Paulo')::time BETWEEN rs.start_time AND rs.end_time
    );
  GET DIAGNOSTICS activated = ROW_COUNT;

  UPDATE robots SET status = 'paused', updated_at = now()
  WHERE status = 'active'
    AND auto_assign = true
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