import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { sendNativeNotification } from '@/lib/notifications';

export interface AppointmentAlert {
  id: string;
  appointment_id: string;
  user_id: string;
  alert_type: string;
  title: string;
  body: string;
  is_read: boolean;
  read_at: string | null;
  scheduled_for: string;
  created_at: string;
}

export function useAppointmentAlerts() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<AppointmentAlert[]>([]);

  const fetchAlerts = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('appointment_alerts' as any)
      .select('*')
      .eq('user_id', user.id)
      .eq('is_read', false)
      .order('created_at', { ascending: false });
    if (data) setAlerts(data as any[]);
  };

  const markAsRead = async (id: string) => {
    await supabase
      .from('appointment_alerts' as any)
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id);
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  const markAllAsRead = async () => {
    if (!user || alerts.length === 0) return;
    const ids = alerts.map(a => a.id);
    await supabase
      .from('appointment_alerts' as any)
      .update({ is_read: true, read_at: new Date().toISOString() })
      .in('id', ids);
    setAlerts([]);
  };

  useEffect(() => {
    if (!user) return;
    fetchAlerts();

    const channel = supabase
      .channel('appointment-alerts-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'appointment_alerts',
        filter: `user_id=eq.${user.id}`,
      }, (payload: any) => {
        const newAlert = payload.new as AppointmentAlert;
        setAlerts(prev => [newAlert, ...prev]);
        // Send native notification
        sendNativeNotification(newAlert.title, {
          body: newAlert.body,
          tag: `appointment-${newAlert.appointment_id}`,
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  return { alerts, markAsRead, markAllAsRead, unreadCount: alerts.length };
}
