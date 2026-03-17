import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { sendNativeNotification } from '@/lib/notifications';

export function useQueueNotifications(queueCount: number, enabled: boolean = true) {
  const prevCountRef = useRef(queueCount);

  // Play notification sound via AudioContext (respects user settings)
  const playNotification = useCallback(() => {
    const soundEnabled = localStorage.getItem('sound_enabled') !== 'false';
    if (!soundEnabled) return;

    const volume = parseFloat(localStorage.getItem('sound_volume') || '0.5');

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(volume * 0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
      console.log('[Sound] Audio not supported');
    }
  }, []);

  // Watch for queue count changes
  useEffect(() => {
    if (!enabled) return;

    if (queueCount > prevCountRef.current) {
      const newItems = queueCount - prevCountRef.current;
      playNotification();

      const body = `${newItems} nova${newItems > 1 ? 's' : ''} conversa${newItems > 1 ? 's' : ''} na fila!`;
      toast.info(body, { duration: 2500, icon: '🔔' });

      // Native notification (works in background / PWA)
      sendNativeNotification('Nova conversa na fila!', {
        body,
        tag: 'queue-update',
        renotify: true,
      });
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
          toast.info('Nova conversa na fila!', { duration: 2500, icon: '🔔' });

          sendNativeNotification('Nova conversa na fila!', {
            body: 'Uma nova conversa está aguardando atendimento.',
            tag: 'queue-insert',
            renotify: true,
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
