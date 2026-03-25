import { useState, useEffect } from 'react';
import { Bell, CheckCircle2, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface AgentNotification {
  id: string;
  period_days: number;
  metrics: any;
  message: string;
  is_read: boolean;
  created_at: string;
}

const Notifications = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AgentNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchNotifications = async () => {
    try {
      const { data, error } = await supabase
        .from('agent_notifications' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setNotifications((data as any[]) || []);
    } catch (e) {
      console.error('Error fetching notifications:', e);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await supabase
        .from('agent_notifications' as any)
        .update({ is_read: true })
        .eq('id', id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (e) {
      console.error('Error marking as read:', e);
    }
  };

  const toggleExpand = (id: string, isRead: boolean) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      if (!isRead) markAsRead(id);
    }
  };

  useEffect(() => {
    if (user) fetchNotifications();
  }, [user]);

  // Subscribe to realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('agent-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_notifications', filter: `agent_id=eq.${user.id}` }, () => {
        fetchNotifications();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <MainLayout>
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Bell className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Minhas Notificações</h1>
            <p className="text-sm text-muted-foreground">
              Feedbacks de desempenho da Delma
              {unreadCount > 0 && <span className="ml-2 text-primary font-medium">({unreadCount} nova{unreadCount > 1 ? 's' : ''})</span>}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Card key={i}><CardContent className="h-20 animate-pulse bg-muted/30" /></Card>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Bell className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">Nenhuma notificação recebida ainda.</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Quando a Delma enviar um feedback, ele aparecerá aqui.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {notifications.map(n => {
              const isExpanded = expandedId === n.id;
              return (
                <Card
                  key={n.id}
                  className={cn(
                    "cursor-pointer transition-all hover:border-primary/30",
                    !n.is_read && "border-primary/40 bg-primary/5"
                  )}
                  onClick={() => toggleExpand(n.id, n.is_read)}
                >
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start gap-3">
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                        n.is_read ? "bg-muted" : "bg-primary/15"
                      )}>
                        {n.is_read ? <CheckCircle2 className="w-4 h-4 text-muted-foreground" /> : <Bell className="w-4 h-4 text-primary" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">Feedback de Desempenho</span>
                            {!n.is_read && <Badge className="text-[10px] bg-primary text-primary-foreground">Nova</Badge>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(n.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </span>
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Período: {n.period_days} dias
                        </p>
                        {isExpanded && (
                          <div className="mt-4 p-4 rounded-lg bg-secondary/30 border border-border/50">
                            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{n.message}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default Notifications;
