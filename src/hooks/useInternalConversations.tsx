import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Conversation } from '@/types';
import { useApp } from '@/contexts/AppContext';

export function useInternalConversations() {
  const { user } = useApp();
  const [internalConversations, setInternalConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInternalConversations = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      // 1) Channels
      const { data: channels, error: channelsError } = await supabase
        .from('internal_channels')
        .select('*')
        .order('created_at', { ascending: false });

      if (channelsError) throw channelsError;

      // 2) Channel members (to filter which channels the user can see)
      const { data: allMembers, error: membersError } = await supabase
        .from('channel_members')
        .select('*');

      if (membersError) throw membersError;

      // Determine which channels the user has access to
      const userDepartments = user.departments || [];
      const isAdminOrSupervisor = user.role === 'admin' || user.role === 'supervisor';

      const accessibleChannelIds = new Set<string>();
      (allMembers || []).forEach((member: any) => {
        // User is directly added
        if (member.user_id === user.id) {
          accessibleChannelIds.add(member.channel_id);
        }
        // User belongs to a department that was added
        if (member.department_id && userDepartments.includes(member.department_id)) {
          accessibleChannelIds.add(member.channel_id);
        }
      });

      // Admins and supervisors can see all channels
      const visibleChannels = isAdminOrSupervisor
        ? channels || []
        : (channels || []).filter((ch) => accessibleChannelIds.has(ch.id));

      // 3) DMs (messages where user is sender or receiver with no channel)
      const { data: dmMessages, error: dmError } = await supabase
        .from('internal_messages')
        .select('*')
        .is('channel_id', null)
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (dmError) throw dmError;

      // 4) Team directory (ensures "Equipe" list exists even if profiles are restricted)
      const { data: teamDirectory, error: teamError } = await supabase.rpc('list_team_directory');
      if (teamError) throw teamError;

      const teamMembers = (teamDirectory || [])
        .map((row: any) => ({
          id: String(row.id),
          name: String(row.name),
          avatar: row.avatar_url ? String(row.avatar_url) : '',
        }))
        .filter((m) => m.id !== user.id);

      // Get unique DM conversations (last message per partner)
      const dmPartners = new Map<string, { lastMessage: any; otherUserId: string }>();
      dmMessages?.forEach((msg: any) => {
        const otherUserId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
        if (otherUserId && !dmPartners.has(otherUserId)) {
          dmPartners.set(otherUserId, {
            lastMessage: msg,
            otherUserId,
          });
        }
      });

      // Fetch last message for each visible channel
      const channelConversations: Conversation[] = [];
      for (const channel of visibleChannels) {
        const { data: lastMessages } = await supabase
          .from('internal_messages')
          .select('*')
          .eq('channel_id', channel.id)
          .order('created_at', { ascending: false })
          .limit(1);

        const lastMsg = lastMessages?.[0];

        channelConversations.push({
          id: `internal-channel-${channel.id}`,
          type: 'interna',
          status: 'em_atendimento',
          isInternal: true,
          channelId: channel.id,
          contact: {
            id: channel.id,
            name: `# ${channel.name}`,
            tags: ['canal'],
          },
          departmentId: '',
          messages: lastMsg
            ? [
                {
                  id: lastMsg.id,
                  conversationId: channel.id,
                  senderId: lastMsg.sender_id,
                  senderName: 'Usuário',
                  content: lastMsg.content,
                  type: 'text',
                  timestamp: new Date(lastMsg.created_at),
                  read: true,
                  status: 'read',
                },
              ]
            : [],
          tags: ['interno', 'canal'],
          priority: 'normal',
          createdAt: new Date(channel.created_at),
          updatedAt: lastMsg ? new Date(lastMsg.created_at) : new Date(channel.created_at),
        });
      }

      // Convert team members to DM conversations (always show them)
      const dmConversations: Conversation[] = teamMembers.map((partner) => {
        const existingDm = dmPartners.get(partner.id);
        const last = existingDm?.lastMessage;
        const lastTimestamp = last?.created_at ? new Date(last.created_at) : new Date();

        return {
          id: `internal-dm-${partner.id}`,
          type: 'interna',
          status: 'em_atendimento',
          isInternal: true,
          receiverId: partner.id,
          contact: {
            id: partner.id,
            name: partner.name,
            avatar: partner.avatar,
            tags: ['equipe'],
          },
          departmentId: '',
          messages: last
            ? [
                {
                  id: last.id,
                  conversationId: partner.id,
                  senderId: last.sender_id,
                  senderName: last.sender_id === user.id ? user.name : partner.name,
                  content: last.content,
                  type: 'text',
                  timestamp: new Date(last.created_at),
                  read: true,
                  status: 'read',
                },
              ]
            : [],
          tags: ['interno', 'equipe'],
          priority: 'normal',
          createdAt: lastTimestamp,
          updatedAt: lastTimestamp,
        };
      });

      setInternalConversations([...channelConversations, ...dmConversations]);
    } catch (error) {
      console.error('Error fetching internal conversations:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const finalizeInternalConversation = useCallback(
    async (conversationId: string, channelId?: string, receiverId?: string) => {
      if (!user) return false;

      try {
        if (receiverId) {
          // Delete ALL DM messages between current user and receiver (both sides)
          const { error: msgError1 } = await supabase
            .from('internal_messages')
            .delete()
            .is('channel_id', null)
            .eq('sender_id', user.id)
            .eq('receiver_id', receiverId);

          if (msgError1) throw msgError1;

          const { error: msgError2 } = await supabase
            .from('internal_messages')
            .delete()
            .is('channel_id', null)
            .eq('sender_id', receiverId)
            .eq('receiver_id', user.id);

          if (msgError2) throw msgError2;
        }
        // For channels, we don't delete messages - just clear the view

        toast({
          title: 'Conversa finalizada',
          description: 'A conversa foi encerrada com sucesso.',
        });

        await fetchInternalConversations();
        return true;
      } catch (error: any) {
        console.error('Error finalizing internal conversation:', error);
        toast({
          title: 'Erro',
          description: 'Não foi possível finalizar a conversa.',
          variant: 'destructive',
        });
        return false;
      }
    },
    [user, fetchInternalConversations]
  );

  // Initial load
  useEffect(() => {
    fetchInternalConversations();
  }, [fetchInternalConversations]);

  // Keep list in sync (new messages / new channels)
  useEffect(() => {
    if (!user) return;

    const ch = supabase
      .channel('internal-conversations-sync')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'internal_messages' },
        (payload) => {
          const msg = payload.new as any;
          const isChannelMsg = !!msg.channel_id;
          const isMyDm = !msg.channel_id && (msg.sender_id === user.id || msg.receiver_id === user.id);
          if (isChannelMsg || isMyDm) {
            fetchInternalConversations();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'internal_channels' },
        () => {
          fetchInternalConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, fetchInternalConversations]);

  return {
    internalConversations,
    loading,
    fetchInternalConversations,
    finalizeInternalConversation,
  };
}

