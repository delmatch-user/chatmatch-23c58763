import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useScheduledResetSync() {
  const { isAdmin, isSupervisor, session } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!session || (!isAdmin && !isSupervisor)) return;

    const sync = async () => {
      try {
        await supabase.functions.invoke('scheduled-report-reset');
      } catch (e) {
        console.error('Scheduled report reset sync error:', e);
      }
    };

    // Run immediately, then every 5 minutes
    sync();
    intervalRef.current = setInterval(sync, 5 * 60_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [session, isAdmin, isSupervisor]);
}
