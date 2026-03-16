import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Sound for queue notification
const NOTIFICATION_SOUND = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdHyFjoyLhoJ/fHyBhIOFg4F+fHt+gYWGhoSBfHp5fICDhYeHhoOAfnx7foKHioyLiYaCfHl3d3t/g4eJiomJhoN/e3h2d3p+goaIioqKhoJ9eXZ0dHd7gIOGiYuKiYaCfXl0c3V5fYKGiouKiYWBfHd0cnR3fIKGiYuLioiDfnh0cXJ1eX6Eh4qLioqHg357dnJxc3h+g4eKi4qKh4N+enVxcHJ2fIGGiYuLioiEgHt2cnBxdXuBhomLi4qIhIB7dnFwcXV7goaJi4uKiISAe3ZycXF1e4KGiouLioiEgHt2cnFydXuChoqLi4qIhIB7d3JxcnV8goaKi4uKiISAfHd0cnJ1fIKGiYuLioiFgXx3dHJydX2ChoqLi4qIhYF8d3Ryc3Z9goaKi4uKiIWBfHd0c3N2fYKGiouLioiFgXx3dHNzdX2ChomLi4qIhYF8d3R0dHZ9goaJi4uKiIWBfHd0dHR2fYKGiouLioiFgX14dXR0dn2ChomKi4qIhYF9eHV0dXZ9gYWJioqKh4WBfXh1dXV2fYGFiYqKioeFgX14dXV1dn6BhYmKioqHhYF9eHZ2dnZ9gYSIiYqKh4WBfXl2dnZ2fYCDhomKioqHhYF+eXd2dnd9gIOGiImKioeFgX55d3d3d32Ag4aIiYqKh4WBfnl3d3d4foGDhoiJioqHhYJ+enh3d3h+gYOGiImJioeFgn56eHd4eH6Bg4aIiYqJh4WCfnp4eHh4foCCh4iJiYmHhYJ+e3l4eHh+gIKFh4iJiYeGgoB7eXh4eX5/goWHiImJh4aCgHt5eXl5foCChYeIiYmHhoKAfHp5eXl+gIKFh4iJiIeGgoB8enl5en6AgoWHiImIh4aCgHx6enl6fn+ChYeIiIiHhoKAfHp6enp+f4KFh4iIiIeGgoB8enp6en5/goWHiIiIh4aCgH16enp6fn+ChYeHiIiHhoOBfXp6enp+f4GEhoiIiIeGg4F9e3p6e36AgYSGiIiIh4aDgX17enp7fn+BhIaHiIiHhYOBfXt6ent+f4GEhoeIiIeFg4F9e3t7e35/gYSGh4iHhoWDgX17e3t7fn+BhIaHiIeGhYOBfXt7e3t+f4GEhoeIh4aFg4F9e3t7e35/gYSGh4eHhoWDgX17e3t7fn+BhIaHh4eGhYOBfnt7e3x+f4GEhoeHh4aFg4J+fHt7fH5/gYSGh4eHhoWDgn58fHt8fn+BhIaHh4eGhYOCfnx8e3x+f4GDhoaHh4aFg4J+fHx8fH5/gYOGhoeHhoWDgn58fHx8fn+Bg4aGh4eGhYOCfnx8fHx+f4GDhoaHh4aFg4J+fXx8fH5/gYOFhoeHhoWEgn5';

export function useQueueNotifications(queueCount: number, enabled: boolean = true) {
  const prevCountRef = useRef(queueCount);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize audio on mount
  useEffect(() => {
    audioRef.current = new Audio(NOTIFICATION_SOUND);
    audioRef.current.volume = 0.5;
    
    return () => {
      audioRef.current = null;
    };
  }, []);

  // Play notification sound
  const playNotification = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(console.error);
    }
  }, []);

  // Watch for queue count changes
  useEffect(() => {
    if (!enabled) return;

    // Only notify when count increases
    if (queueCount > prevCountRef.current) {
      const newItems = queueCount - prevCountRef.current;
      playNotification();
      toast.info(
        `${newItems} nova${newItems > 1 ? 's' : ''} conversa${newItems > 1 ? 's' : ''} na fila!`,
        {
        duration: 2500,
          icon: '🔔',
        }
      );
    }
    
    prevCountRef.current = queueCount;
  }, [queueCount, enabled, playNotification]);

  // Subscribe to realtime conversation changes
  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel('queue-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversations',
          filter: 'status=eq.em_fila',
        },
        () => {
          playNotification();
          toast.info('Nova conversa na fila!', {
            duration: 2500,
            icon: '🔔',
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, playNotification]);

  return { playNotification };
}
