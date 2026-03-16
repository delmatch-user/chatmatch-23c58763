import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

/**
 * Fallback hook — o cron job pg_cron é o mecanismo principal (roda a cada 60s 24/7).
 * Este hook serve como redundância extra quando qualquer usuário está logado.
 */
export function useRobotScheduleSync() {
  const { session } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!session) return;

    const sync = async () => {
      try {
        await supabase.functions.invoke('sync-robot-schedules');
      } catch (e) {
        console.error('Robot schedule sync error:', e);
      }
    };

    // Fallback: run every 2 minutes (cron handles the main 60s cycle)
    sync();
    intervalRef.current = setInterval(sync, 120_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [session]);
}
