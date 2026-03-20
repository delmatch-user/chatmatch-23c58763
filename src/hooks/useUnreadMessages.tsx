import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface UnreadCount {
  internalChat: number;
  externalChat: number;
}

interface UnreadDetails {
  channels: Record<string, number>;  // channelId -> count
  users: Record<string, number>;     // senderId -> count
}

interface LastActivityDetails {
  channels: Record<string, string>;  // channelId -> timestamp ISO
  users: Record<string, string>;     // userId -> timestamp ISO
}

// Store last read timestamps in localStorage
const LAST_READ_KEY = 'internal_chat_last_read';

function getLastReadTimestamps(): Record<string, string> {
  try {
    const stored = localStorage.getItem(LAST_READ_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function setLastReadTimestamp(conversationId: string, timestamp: string) {
  const current = getLastReadTimestamps();
  current[conversationId] = timestamp;
  localStorage.setItem(LAST_READ_KEY, JSON.stringify(current));
}

export function useUnreadMessages() {
  const { profile } = useAuth();
  const [unreadCount, setUnreadCount] = useState<UnreadCount>({
    internalChat: 0,
    externalChat: 0,
  });
  const [unreadDetails, setUnreadDetails] = useState<UnreadDetails>({
    channels: {},
    users: {},
  });
  const [lastActivityDetails, setLastActivityDetails] = useState<LastActivityDetails>({
    channels: {},
    users: {},
  });

  const fetchUnreadCount = useCallback(async () => {
    if (!profile?.id) return;

    try {
      // Get user's channel memberships
      const { data: memberships } = await supabase
        .from('channel_members')
        .select('channel_id')
        .eq('user_id', profile.id);

      const channelIds = memberships?.map(m => m.channel_id) || [];
      
      // Get last read timestamps
      const lastReadTimestamps = getLastReadTimestamps();
      
      let totalUnread = 0;
      const channelCounts: Record<string, number> = {};
      const userCounts: Record<string, number> = {};
      const channelActivity: Record<string, string> = {};
      const userActivity: Record<string, string> = {};

      // Count unread messages per channel and get last activity
      if (channelIds.length > 0) {
        for (const channelId of channelIds) {
          const lastRead = lastReadTimestamps[`channel_${channelId}`];
          
          // Get unread count
          let query = supabase
            .from('internal_messages')
            .select('id', { count: 'exact', head: true })
            .eq('channel_id', channelId)
            .neq('sender_id', profile.id);
          
          if (lastRead) {
            query = query.gt('created_at', lastRead);
          }
          
          const { count } = await query;
          const unreadCount = count || 0;
          
          if (unreadCount > 0) {
            channelCounts[channelId] = unreadCount;
          }
          totalUnread += unreadCount;

          // Get last message timestamp for channel
          const { data: lastMsg } = await supabase
            .from('internal_messages')
            .select('created_at')
            .eq('channel_id', channelId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (lastMsg) {
            channelActivity[channelId] = lastMsg.created_at;
          }
        }
      }

      // Count unread DMs per sender
      const { data: unreadDMs } = await supabase
        .from('internal_messages')
        .select('id, sender_id, created_at')
        .is('channel_id', null)
        .eq('receiver_id', profile.id)
        .neq('sender_id', profile.id);
      
      if (unreadDMs) {
        for (const dm of unreadDMs) {
          const lastDmRead = lastReadTimestamps[`dm_${dm.sender_id}`];
          // Count as unread if no lastRead OR if message is newer than lastRead
          if (!lastDmRead || dm.created_at > lastDmRead) {
            userCounts[dm.sender_id] = (userCounts[dm.sender_id] || 0) + 1;
            totalUnread += 1;
          }
        }
      }

      // Get all DMs (sent and received) for last activity
      const { data: allDMs } = await supabase
        .from('internal_messages')
        .select('sender_id, receiver_id, created_at')
        .is('channel_id', null)
        .or(`sender_id.eq.${profile.id},receiver_id.eq.${profile.id}`)
        .order('created_at', { ascending: false });

      if (allDMs) {
        for (const dm of allDMs) {
          const otherUserId = dm.sender_id === profile.id ? dm.receiver_id : dm.sender_id;
          if (otherUserId && !userActivity[otherUserId]) {
            userActivity[otherUserId] = dm.created_at;
          }
        }
      }

      setUnreadCount(prev => ({
        ...prev,
        internalChat: totalUnread,
      }));
      
      setUnreadDetails({
        channels: channelCounts,
        users: userCounts,
      });

      setLastActivityDetails({
        channels: channelActivity,
        users: userActivity,
      });
    } catch (error) {
      console.error('[UnreadMessages] Error fetching count:', error);
    }
  }, [profile?.id]);

  // Mark channel or DM as read
  const markAsRead = useCallback((type: 'channel' | 'dm', id?: string) => {
    const now = new Date().toISOString();
    
    if (type === 'channel' && id) {
      setLastReadTimestamp(`channel_${id}`, now);
      // Clear count for this specific channel
      setUnreadDetails(prev => {
        const { [id]: removed, ...restChannels } = prev.channels;
        return { ...prev, channels: restChannels };
      });
    } else if (type === 'dm' && id) {
      // Mark DM from specific user as read
      setLastReadTimestamp(`dm_${id}`, now);
      setUnreadDetails(prev => {
        const { [id]: removed, ...restUsers } = prev.users;
        return { ...prev, users: restUsers };
      });
    }
    
    // Refetch counts
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  // Initial fetch
  useEffect(() => {
    if (profile?.id) {
      fetchUnreadCount();
    }
  }, [profile?.id, fetchUnreadCount]);

  // Listen for new internal messages in realtime
  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel('unread-internal-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'internal_messages',
        },
        (payload) => {
          const newMsg = payload.new as any;
          
          // Update last activity for channel or user
          if (newMsg.channel_id) {
            setLastActivityDetails(prev => ({
              ...prev,
              channels: {
                ...prev.channels,
                [newMsg.channel_id]: newMsg.created_at,
              },
            }));
          } else {
            const otherUserId = newMsg.sender_id === profile.id 
              ? newMsg.receiver_id 
              : newMsg.sender_id;
            if (otherUserId) {
              setLastActivityDetails(prev => ({
                ...prev,
                users: {
                  ...prev.users,
                  [otherUserId]: newMsg.created_at,
                },
              }));
            }
          }
          
          // Only count if message is not from current user
          if (newMsg.sender_id !== profile.id) {
            if (newMsg.channel_id) {
              // Channel message
              setUnreadDetails(prev => ({
                ...prev,
                channels: {
                  ...prev.channels,
                  [newMsg.channel_id]: (prev.channels[newMsg.channel_id] || 0) + 1,
                },
              }));
              setUnreadCount(prev => ({
                ...prev,
                internalChat: prev.internalChat + 1,
              }));
            } else if (newMsg.receiver_id === profile.id) {
              // DM to the user
              setUnreadDetails(prev => ({
                ...prev,
                users: {
                  ...prev.users,
                  [newMsg.sender_id]: (prev.users[newMsg.sender_id] || 0) + 1,
                },
              }));
              setUnreadCount(prev => ({
                ...prev,
                internalChat: prev.internalChat + 1,
              }));
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  return {
    unreadCount,
    unreadDetails,
    lastActivityDetails,
    markAsRead,
    refetchUnreadCount: fetchUnreadCount,
  };
}
