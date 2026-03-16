import { useState, useEffect, useCallback, useRef, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/contexts/AppContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Megaphone } from 'lucide-react';
import { format } from 'date-fns';

interface PendingAnnouncement {
  id: string;
  content: string;
  sender_id: string;
  sender_name: string;
  created_at: string;
}

interface SuporteAnnouncementContextType {
  pendingCount: number;
  suporteChannelId: string | null;
  markAllAsRead: () => Promise<void>;
}

const SuporteAnnouncementContext = createContext<SuporteAnnouncementContextType>({
  pendingCount: 0,
  suporteChannelId: null,
  markAllAsRead: async () => {},
});

export const useSuporteAnnouncements = () => useContext(SuporteAnnouncementContext);

export function SuporteAnnouncementProvider({ children }: { children: ReactNode }) {
  const { user } = useApp();
  const [pending, setPending] = useState<PendingAnnouncement[]>([]);
  const [confirming, setConfirming] = useState(false);
  const suporteChannelIdRef = useRef<string | null>(null);
  const [suporteChannelId, setSuporteChannelId] = useState<string | null>(null);
  const isEligibleRef = useRef(false);
  const readSetRef = useRef(new Set<string>());

  const initialize = useCallback(async () => {
    if (!user) return;

    const { data: channels } = await supabase
      .from('internal_channels')
      .select('id')
      .ilike('name', 'suporte')
      .limit(1);

    if (!channels || channels.length === 0) return;
    const channelId = channels[0].id;
    suporteChannelIdRef.current = channelId;
    setSuporteChannelId(channelId);

    // Only show for users who are members of the Suporte channel (regardless of role)
    const { data: membership } = await supabase
      .from('channel_members')
      .select('id')
      .eq('channel_id', channelId)
      .or(`user_id.eq.${user.id},department_id.in.(${(user.departments || []).join(',')})`)
      .limit(1);

    if (!membership || membership.length === 0) return;

    isEligibleRef.current = true;

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: messages } = await supabase
      .from('internal_messages')
      .select('id, content, sender_id, created_at')
      .eq('channel_id', channelId)
      .neq('sender_id', user.id)
      .gte('created_at', since)
      .order('created_at', { ascending: true });

    if (!messages || messages.length === 0) return;

    const msgIds = messages.map(m => m.id);
    const { data: reads } = await (supabase as any)
      .from('channel_announcement_reads')
      .select('message_id')
      .eq('user_id', user.id)
      .in('message_id', msgIds);

    const readSet = new Set<string>((reads || []).map((r: any) => r.message_id as string));
    readSetRef.current = readSet;

    const senderIds = [...new Set(messages.filter(m => !readSet.has(m.id)).map(m => m.sender_id))];
    const nameMap: Record<string, string> = {};
    if (senderIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles_public')
        .select('id, name')
        .in('id', senderIds);
      (profiles || []).forEach(p => { if (p.id && p.name) nameMap[p.id] = p.name; });
    }

    const unread = messages
      .filter(m => !readSet.has(m.id))
      .map(m => ({
        ...m,
        sender_name: nameMap[m.sender_id] || 'Usuário',
      }));

    if (unread.length > 0) setPending(unread);
  }, [user]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Realtime listener
  useEffect(() => {
    if (!user) return;

    const timer = setTimeout(() => {
      const channelId = suporteChannelIdRef.current;
      if (!channelId || !isEligibleRef.current) return;

      const sub = supabase
        .channel('suporte-announcements')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'internal_messages',
            filter: `channel_id=eq.${channelId}`,
          },
          async (payload) => {
            const msg = payload.new as any;
            if (msg.sender_id === user.id) return;

            // Check if already read
            if (readSetRef.current.has(msg.id)) return;

            const { data: profile } = await supabase
              .from('profiles_public')
              .select('name')
              .eq('id', msg.sender_id)
              .single();

            setPending(prev => {
              if (prev.some(p => p.id === msg.id)) return prev;
              return [...prev, {
                id: msg.id,
                content: msg.content,
                sender_id: msg.sender_id,
                sender_name: profile?.name || 'Usuário',
                created_at: msg.created_at,
              }];
            });
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(sub);
      };
    }, 2000);

    return () => clearTimeout(timer);
  }, [user]);

  const handleConfirm = async () => {
    if (pending.length === 0 || !user) return;
    setConfirming(true);

    const current = pending[0];
    await (supabase as any).from('channel_announcement_reads').insert({
      message_id: current.id,
      user_id: user.id,
    });

    readSetRef.current.add(current.id);
    setPending(prev => prev.slice(1));
    setConfirming(false);
  };

  const markAllAsRead = useCallback(async () => {
    if (pending.length === 0 || !user) return;

    const inserts = pending.map(p => ({
      message_id: p.id,
      user_id: user.id,
    }));

    await (supabase as any).from('channel_announcement_reads').upsert(inserts, {
      onConflict: 'message_id,user_id',
    });

    pending.forEach(p => readSetRef.current.add(p.id));
    setPending([]);
  }, [pending, user]);

  const current = pending[0];

  return (
    <SuporteAnnouncementContext.Provider value={{ pendingCount: pending.length, suporteChannelId, markAllAsRead }}>
      {children}
      {current && (
        <AnnouncementDialog
          current={current}
          pendingCount={pending.length}
          confirming={confirming}
          onConfirm={handleConfirm}
        />
      )}
    </SuporteAnnouncementContext.Provider>
  );
}

function AnnouncementDialog({
  current,
  pendingCount,
  confirming,
  onConfirm,
}: {
  current: PendingAnnouncement;
  pendingCount: number;
  confirming: boolean;
  onConfirm: () => void;
}) {
  const initials = current.sender_name
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            Aviso do Canal Suporte
            {pendingCount > 1 && (
              <span className="text-xs text-muted-foreground ml-auto">
                +{pendingCount - 1} pendente{pendingCount > 2 ? 's' : ''}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-start gap-3 py-2">
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary text-sm">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{current.sender_name}</span>
              <span className="text-xs text-muted-foreground">
                {format(new Date(current.created_at), 'HH:mm')}
              </span>
            </div>
            <p className="text-sm whitespace-pre-wrap break-words">{current.content}</p>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onConfirm} disabled={confirming} className="w-full">
            {confirming ? 'Confirmando...' : 'Entendi'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
