import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useApp } from '@/contexts/AppContext';

export interface InternalChannel {
  id: string;
  name: string;
  type: 'channel' | 'department';
  description: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ChannelMember {
  id: string;
  channel_id: string;
  user_id: string | null;
  department_id: string | null;
}

export interface InternalMessage {
  id: string;
  channel_id: string | null;
  sender_id: string;
  receiver_id: string | null;
  content: string;
  created_at: string;
  sender_name?: string;
}

export function useInternalChat() {
  const { user } = useApp();
  const [allChannels, setAllChannels] = useState<InternalChannel[]>([]);
  const [channelMembers, setChannelMembers] = useState<ChannelMember[]>([]);
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Adicionar mensagem diretamente ao state (mais rápido que refetch)
  const addMessage = useCallback((newMessage: InternalMessage) => {
    setMessages(prev => {
      if (prev.some(m => m.id === newMessage.id)) return prev;
      return [...prev, newMessage];
    });
  }, []);

  // Fetch all channels
  const fetchChannels = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('internal_channels')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAllChannels((data as InternalChannel[]) || []);
    } catch (error: any) {
      console.error('Error fetching channels:', error);
    }
  }, []);

  // Fetch channel members
  const fetchChannelMembers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('channel_members')
        .select('*');

      if (error) throw error;
      setChannelMembers((data as ChannelMember[]) || []);
    } catch (error: any) {
      console.error('Error fetching channel members:', error);
    }
  }, []);

  // Compute visible channels based on membership
  const channels = useMemo(() => {
    if (!user) return allChannels;

    const isAdminOrSupervisor = user.role === 'admin' || user.role === 'supervisor';
    if (isAdminOrSupervisor) return allChannels;

    const userDepartments = user.departments || [];
    const accessibleChannelIds = new Set<string>();

    channelMembers.forEach((member) => {
      // User is directly added
      if (member.user_id === user.id) {
        accessibleChannelIds.add(member.channel_id);
      }
      // User belongs to a department that was added
      if (member.department_id && userDepartments.includes(member.department_id)) {
        accessibleChannelIds.add(member.channel_id);
      }
    });

    return allChannels.filter((ch) => accessibleChannelIds.has(ch.id));
  }, [allChannels, channelMembers, user]);

  // Fetch messages for a channel or DM
  const fetchMessages = useCallback(
    async (channelId?: string, otherUserId?: string) => {
      try {
        let query = supabase.from('internal_messages').select('*');

        if (channelId) {
          query = query.eq('channel_id', channelId);
        } else if (otherUserId && user) {
          // DM: messages between current user and otherUserId
          query = query
            .is('channel_id', null)
            .or(
              `and(sender_id.eq.${user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${user.id})`
            );
        }

        const { data, error } = await query.order('created_at', { ascending: true });

        if (error) throw error;
        setMessages((data as InternalMessage[]) || []);
      } catch (error: any) {
        console.error('Error fetching messages:', error);
      }
    },
    [user]
  );

  // Send a message
  const sendMessage = async (content: string, channelId?: string, receiverId?: string) => {
    if (!user) return { error: new Error('Not authenticated') };

    try {
      const { error } = await supabase.from('internal_messages').insert({
        content,
        sender_id: user.id,
        channel_id: channelId || null,
        receiver_id: receiverId || null,
      });

      if (error) throw error;
      return { error: null };
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast.error('Erro ao enviar mensagem');
      return { error };
    }
  };

  // Create a channel
  const createChannel = async (
    name: string,
    type: 'channel' | 'department',
    members: { userIds?: string[]; departmentIds?: string[] }
  ) => {
    if (!user) return { error: new Error('Not authenticated') };

    try {
      // Create the channel
      const { data: channelData, error: channelError } = await supabase
        .from('internal_channels')
        .insert({
          name,
          type,
          created_by: user.id,
        })
        .select()
        .single();

      if (channelError) throw channelError;

      // Add members
      const memberInserts: Array<{ channel_id: string; user_id: string | null; department_id: string | null }> = [];

      if (members.userIds) {
        for (const userId of members.userIds) {
          memberInserts.push({
            channel_id: channelData.id,
            user_id: userId,
            department_id: null,
          });
        }
      }

      if (members.departmentIds) {
        for (const deptId of members.departmentIds) {
          memberInserts.push({
            channel_id: channelData.id,
            user_id: null,
            department_id: deptId,
          });
        }
      }

      if (memberInserts.length > 0) {
        const { error: membersError } = await supabase.from('channel_members').insert(memberInserts);
        if (membersError) throw membersError;
      }

      toast.success('Canal criado com sucesso!');
      await fetchChannels();
      await fetchChannelMembers();
      return { data: channelData, error: null };
    } catch (error: any) {
      console.error('Error creating channel:', error);
      toast.error('Erro ao criar canal');
      return { error };
    }
  };

  // Delete a channel
  const deleteChannel = async (channelId: string) => {
    try {
      const { error } = await supabase.from('internal_channels').delete().eq('id', channelId);

      if (error) throw error;

      toast.success('Canal excluído com sucesso!');
      await fetchChannels();
      await fetchChannelMembers();
      return { error: null };
    } catch (error: any) {
      console.error('Error deleting channel:', error);
      toast.error('Erro ao excluir canal');
      return { error };
    }
  };

  // Initial fetch
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await Promise.all([fetchChannels(), fetchChannelMembers()]);
      setIsLoading(false);
    };
    init();
  }, [fetchChannels, fetchChannelMembers]);

  // Listener global removido para evitar duplicação
  // Cada componente de chat tem seu próprio listener específico

  return {
    channels,
    channelMembers,
    messages,
    isLoading,
    fetchMessages,
    sendMessage,
    createChannel,
    deleteChannel,
    fetchChannels,
    fetchChannelMembers,
    addMessage,
  };
}

