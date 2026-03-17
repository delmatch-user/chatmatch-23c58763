import React, { createContext, useContext, useState, useEffect, ReactNode, Dispatch, SetStateAction, useCallback, useRef } from 'react';
import { User, Conversation, Department, QuickMessage, Contact, Message, MessageReaction } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { playNotificationSoundGlobal } from '@/hooks/useNotificationSound';
import { sendNativeNotification } from '@/lib/notifications';
interface AppContextType {
  user: User | null;
  setUser: Dispatch<SetStateAction<User | null>>;
  conversations: Conversation[];
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
  selectedConversation: Conversation | null;
  setSelectedConversation: Dispatch<SetStateAction<Conversation | null>>;
  departments: Department[];
  quickMessages: QuickMessage[];
  users: User[];
  sidebarCollapsed: boolean;
  setSidebarCollapsed: Dispatch<SetStateAction<boolean>>;
  loading: boolean;
  refetchConversations: () => Promise<void>;
  refetchQuickMessages: () => Promise<void>;
  loadConversationMessages: (conversationId: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const { profile, roles } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [quickMessages, setQuickMessages] = useState<QuickMessage[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [realtimeRetryKey, setRealtimeRetryKey] = useState(0);

  // Ref para manter user atualizado nos callbacks de realtime (evita closure stale)
  const userRef = useRef<User | null>(null);
  const lastPollTimestampRef = useRef<string>(new Date(0).toISOString());
  
  // Manter ref sincronizada com o state
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Map auth profile to User type (include user's departments)
  useEffect(() => {
    const loadUserWithDepartments = async () => {
      if (!profile) return;

      // Fetch user's departments
      const { data: deptData } = await supabase
        .from('profile_departments')
        .select('department_id')
        .eq('profile_id', profile.id);

      const userDepts = deptData?.map((d) => d.department_id) || [];

      setUser({
        id: profile.id,
        name: profile.name,
        email: profile.email,
        avatar: profile.avatar_url || '',
        role: roles.includes('admin') ? 'admin' : roles.includes('supervisor') ? 'supervisor' : roles.includes('franqueado') ? 'franqueado' : 'atendente',
        status: profile.status as 'online' | 'away' | 'busy' | 'offline',
        departments: userDepts,
        createdAt: new Date(profile.created_at),
      });
    };

    loadUserWithDepartments();
  }, [profile, roles]);

  // Fetch departments
  useEffect(() => {
    const fetchDepartments = async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .order('name');

      if (!error && data) {
        setDepartments(data.map(d => ({
          id: d.id,
          name: d.name,
          description: d.description || '',
          color: d.color,
          supervisors: [],
          queueCount: 0,
          onlineCount: 0,
          maxWaitTime: d.max_wait_time || 600,
        })));
      }
    };

    fetchDepartments();
  }, []);

  // Fetch users - using profiles_public view to protect PII (email, phone)
  useEffect(() => {
    const fetchUsers = async () => {
      // Use profiles_public view which excludes email and phone
      const { data: profiles, error } = await supabase
        .from('profiles_public')
        .select('*')
        .order('name');

      if (!error && profiles) {
        const { data: rolesData } = await supabase
          .from('user_roles')
          .select('user_id, role');

        const { data: deptData } = await supabase
          .from('profile_departments')
          .select('profile_id, department_id');

        const mappedUsers = profiles.map(p => {
          const userRole = rolesData?.find(r => r.user_id === p.id)?.role || 'atendente';
          const userDepts = deptData?.filter(d => d.profile_id === p.id).map(d => d.department_id) || [];
          
          return {
            id: p.id,
            name: p.name,
            email: '', // Not available from public view - PII protected
            avatar: p.avatar_url || '',
            role: userRole as 'admin' | 'supervisor' | 'atendente',
            status: p.status as 'online' | 'away' | 'busy' | 'offline',
            departments: userDepts,
            createdAt: new Date(p.created_at),
          };
        });

        setUsers(mappedUsers);
      }
    };

    fetchUsers();
  }, []);

  // Recalcular onlineCount dos departamentos sempre que users mudar (tempo real)
  // Inclui usuários online E em pausa (away) para melhor visibilidade da equipe
  useEffect(() => {
    if (users.length === 0) return;
    
    setDepartments(prevDepts => prevDepts.map(dept => ({
      ...dept,
      onlineCount: users.filter(u => 
        (u.status === 'online' || u.status === 'away') && u.departments.includes(dept.id)
      ).length
    })));
  }, [users]);

  // Recalcular queueCount dos departamentos sempre que conversations mudar (tempo real)
  useEffect(() => {
    if (departments.length === 0) return;
    
    setDepartments(prevDepts => prevDepts.map(dept => ({
      ...dept,
      queueCount: conversations.filter(c => 
        c.status === 'em_fila' && c.departmentId === dept.id
      ).length
    })));
  }, [conversations]);

  // Fetch quick messages
  const fetchQuickMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('quick_messages')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setQuickMessages(data.map(qm => ({
        id: qm.id,
        title: qm.title,
        content: qm.content,
        category: qm.category,
        isFavorite: qm.is_favorite,
        userId: qm.user_id,
        departmentId: (qm as any).department_id || undefined,
        createdAt: new Date(qm.created_at),
      })));
    }
  }, []);

  // Fetch quick messages on mount and when user changes
  useEffect(() => {
    if (profile) {
      fetchQuickMessages();
    }
  }, [profile, fetchQuickMessages]);

  // ID do departamento Administrativo que pode ver TODAS as conversas
  const ADMINISTRATIVO_ID = '32f29add-f21d-4b08-8c9d-5108827a2caf';
  const DEPARTAMENTOS_GLOBAIS = [ADMINISTRATIVO_ID];

  // Fetch conversations
  const fetchConversations = async () => {
    setLoading(true);
    try {
      const { data: convData, error: convError } = await supabase
        .from('conversations')
        .select('*')
        .order('updated_at', { ascending: false });

      if (convError) throw convError;

      if (convData) {
        // Fetch all contacts for these conversations
        const contactIds = [...new Set(convData.map(c => c.contact_id))];
        const convIds = convData.map(c => c.id);
        
        // Fetch contacts and last messages in parallel
        const [contactsResult, lastMsgsResult] = await Promise.all([
          supabase.from('contacts').select('*').in('id', contactIds),
          // Fetch latest message per conversation for preview
          supabase.from('messages').select('*')
            .in('conversation_id', convIds)
            .order('created_at', { ascending: false })
        ]);
        
        const contactsData = contactsResult.data;
        const allLastMsgs = lastMsgsResult.data || [];
        
        // Build map: conversation_id -> latest message (first occurrence per conv since ordered desc)
        const lastMsgMap = new Map<string, any>();
        for (const msg of allLastMsgs) {
          if (!lastMsgMap.has(msg.conversation_id)) {
            lastMsgMap.set(msg.conversation_id, msg);
          }
        }

        // Messages are lazy-loaded per conversation on selection (performance optimization)
        const mappedConversations: Conversation[] = convData.map(conv => {
          const contact = contactsData?.find(c => c.id === conv.contact_id);
          const tags = conv.tags || [];
          const isInternal = tags.includes('interno') || tags.includes('equipe') || tags.includes('internal');
          
          // Use last message for preview (single message array)
          // Fallback to last_message_preview from DB when message query hits 1000-row limit
          const lastMsg = lastMsgMap.get(conv.id);
          let previewMessages: Message[] = [];
          if (lastMsg) {
            previewMessages = [{
              id: lastMsg.id,
              conversationId: lastMsg.conversation_id,
              senderId: lastMsg.sender_id || '',
              senderName: lastMsg.sender_name,
              content: lastMsg.content,
              type: lastMsg.message_type as Message['type'],
              timestamp: new Date(lastMsg.created_at),
              read: true,
              status: lastMsg.status as Message['status'],
              deleted: lastMsg.deleted || false,
            }];
          } else if (conv.last_message_preview) {
            // Synthetic preview from DB field (covers conversations beyond 1000-msg limit)
            previewMessages = [{
              id: `preview-${conv.id}`,
              conversationId: conv.id,
              senderId: '',
              senderName: '',
              content: conv.last_message_preview,
              type: 'text' as Message['type'],
              timestamp: new Date(conv.updated_at),
              read: true,
              status: 'sent' as Message['status'],
              deleted: false,
            }];
          }

          return {
            id: conv.id,
            type: isInternal ? 'interna' as const : 'externa' as const,
            isInternal,
            status: conv.status as Conversation['status'],
            contact: {
              id: contact?.id || conv.contact_id,
              name: contact?.name || 'Contato',
              phone: contact?.phone || '',
              email: contact?.email || undefined,
              avatar: contact?.avatar_url || undefined,
              tags: tags,
              notes: contact?.notes || undefined,
              channel: (contact as any)?.channel || 'whatsapp',
            },
            departmentId: conv.department_id,
            assignedTo: conv.assigned_to || undefined,
            assignedToRobot: (conv as any).assigned_to_robot || undefined,
            messages: previewMessages, // Last message for preview; full history lazy-loaded on selection
            tags: tags,
            priority: conv.priority as Conversation['priority'],
            createdAt: new Date(conv.created_at),
            updatedAt: new Date(conv.updated_at),
            waitTime: conv.wait_time || 0,
            channel: (conv as any).channel || 'whatsapp',
            whatsappInstanceId: (conv as any).whatsapp_instance_id || undefined,
            protocol: (conv as any).protocol || undefined,
          };
        });

        // Filtrar conversas baseado nas permissões do usuário
        // Se user não está disponível ainda, mostrar todas (será refiltrado quando user carregar)
        // Usuários de Suporte e Administrativo podem ver TODAS as conversas
        const userHasGlobalAccess = user?.departments?.some(deptId => DEPARTAMENTOS_GLOBAIS.includes(deptId));
        const canViewAll = !user || user.role === 'admin' || userHasGlobalAccess;
        
        const filteredConversations = canViewAll 
          ? mappedConversations 
          : mappedConversations.filter(conv => 
              conv.assignedTo === user?.id || 
              user?.departments?.includes(conv.departmentId)
            );

        // Preserve existing messages when refreshing metadata
        setConversations(prev => {
          return filteredConversations.map(conv => {
            const existing = prev.find(c => c.id === conv.id);
            return existing ? { ...conv, messages: existing.messages } : conv;
          });
        });
        
        // Atualizar conversa selecionada preservando mensagens
        setSelectedConversation(prev => {
          if (!prev) return null;
          const updatedConv = filteredConversations.find(c => c.id === prev.id);
          if (!updatedConv) return prev;
          return { ...updatedConv, messages: prev.messages };
        });
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  // Lazy-load messages + reactions for a specific conversation
  const loadConversationMessages = useCallback(async (conversationId: string) => {
    let allMessages: any[] = [];
    const batchSize = 1000;
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const { data: batch } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .range(offset, offset + batchSize - 1);
      if (batch && batch.length > 0) {
        allMessages.push(...batch);
        offset += batchSize;
        hasMore = batch.length === batchSize;
      } else {
        hasMore = false;
      }
    }

    // Fetch reactions
    const messageIds = allMessages.map(m => m.id);
    let reactionsData: any[] = [];
    if (messageIds.length > 0) {
      const rBatchSize = 200;
      for (let i = 0; i < messageIds.length; i += rBatchSize) {
        const batch = messageIds.slice(i, i + rBatchSize);
        const { data } = await supabase
          .from('message_reactions')
          .select('*')
          .in('message_id', batch);
        if (data) reactionsData.push(...data);
      }
    }

    const reactionsByMessage = new Map<string, MessageReaction[]>();
    reactionsData.forEach(r => {
      const existing = reactionsByMessage.get(r.message_id) || [];
      existing.push({ id: r.id, emoji: r.emoji, senderPhone: r.sender_phone || undefined });
      reactionsByMessage.set(r.message_id, existing);
    });

    const mappedMessages: Message[] = allMessages.map(m => {
      const isRobotMessage = m.sender_name?.includes('[ROBOT]') || m.sender_name?.includes('(IA)');
      return {
        id: m.id,
        conversationId: m.conversation_id,
        senderId: m.sender_id || (isRobotMessage ? 'robot' : 'contact'),
        senderName: m.sender_name,
        content: m.content,
        type: m.message_type as Message['type'],
        timestamp: new Date(m.created_at),
        read: (m.delivery_status || m.status) === 'read',
        status: (m.delivery_status || m.status || 'sent') as Message['status'],
        deleted: m.deleted || false,
        reactions: reactionsByMessage.get(m.id) || [],
      };
    });

    setConversations(prev => prev.map(conv =>
      conv.id === conversationId ? { ...conv, messages: mappedMessages } : conv
    ));
    setSelectedConversation(prev =>
      prev?.id === conversationId ? { ...prev, messages: mappedMessages } : prev
    );
  }, []);

  // Fetch quando user mudar (para aplicar filtro correto)
  useEffect(() => {
    fetchConversations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role, user?.departments?.join(',')]);

  // Realtime: escutar mudanças em conversations e messages (GRANULAR - sem refetch completo)
  useEffect(() => {
    console.log('[Realtime] Configurando canais de tempo real (granular)...');
    
    // Canal para mudanças em conversations
    const conversationsChannel = supabase
      .channel('conversations-realtime-granular')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations'
        },
        async (payload) => {
          console.log('[Realtime] Conversa atualizada:', payload.eventType);
          
          if (payload.eventType === 'DELETE') {
            // Remover conversa do estado local
            setConversations(prev => prev.filter(c => c.id !== (payload.old as any).id));
          } else if (payload.eventType === 'INSERT') {
            // OTIMIZADO: Adicionar conversa sem refetch completo
            const newConvData = payload.new as any;
            
            // Buscar apenas o contato desta conversa específica
            const { data: contact } = await supabase
              .from('contacts')
              .select('*')
              .eq('id', newConvData.contact_id)
              .single();
            
            if (contact) {
              const newConv: Conversation = {
                id: newConvData.id,
                type: 'externa' as const,
                isInternal: false,
                status: newConvData.status as Conversation['status'],
                contact: {
                  id: contact.id,
                  name: contact.name,
                  phone: contact.phone || '',
                  email: contact.email || undefined,
                  avatar: contact.avatar_url || undefined,
                  tags: newConvData.tags || [],
                  notes: contact.notes || undefined,
                  channel: (contact as any).channel || 'whatsapp',
                },
                departmentId: newConvData.department_id,
                assignedTo: newConvData.assigned_to || undefined,
                assignedToRobot: newConvData.assigned_to_robot || undefined,
                messages: newConvData.last_message_preview ? [{
                  id: `preview-${newConvData.id}`,
                  conversationId: newConvData.id,
                  senderId: '',
                  senderName: '',
                  content: newConvData.last_message_preview,
                  type: 'text' as Message['type'],
                  timestamp: new Date(newConvData.updated_at || newConvData.created_at),
                  read: true,
                  status: 'sent' as Message['status'],
                  deleted: false,
                }] : [],
                tags: newConvData.tags || [],
                priority: newConvData.priority as Conversation['priority'],
                createdAt: new Date(newConvData.created_at),
                updatedAt: new Date(newConvData.updated_at),
                waitTime: newConvData.wait_time || 0,
                channel: (newConvData.channel || 'whatsapp') as Conversation['channel'],
              };
              
              // Verificar permissões antes de adicionar (usar userRef para valor atualizado)
              const currentUser = userRef.current;
              const userHasGlobalAccess = currentUser?.departments?.some(deptId => DEPARTAMENTOS_GLOBAIS.includes(deptId));
              const canViewAll = !currentUser || currentUser.role === 'admin' || userHasGlobalAccess;
              const canView = canViewAll || 
                              newConv.assignedTo === currentUser?.id || 
                              currentUser?.departments?.includes(newConv.departmentId);
              
              if (canView) {
                setConversations(prev => {
                  // Evitar duplicatas verificando apenas por ID da conversa
                  // Não verificar por contact_id pois o mesmo contato pode ter múltiplas conversas (ex: canal Machine)
                  const alreadyExists = prev.some(c => c.id === newConv.id);
                  if (alreadyExists) {
                    console.log('[Realtime] Conversa duplicada ignorada:', newConv.id?.substring(0, 8));
                    return prev;
                  }
                  return [newConv, ...prev];
                });
                playNotificationSoundGlobal('notification'); // Nova conversa na fila
              }
            }
          } else if (payload.eventType === 'UPDATE') {
            // Para UPDATE, atualizar a conversa específica no estado local
            const updated = payload.new as any;
            const applyUpdate = (conv: Conversation): Conversation => {
              // Update preview message if last_message_preview changed
              let updatedMessages = conv.messages;
              if (updated.last_message_preview && updated.last_message_preview !== conv.messages[conv.messages.length - 1]?.content) {
                // Only replace if we have NO messages or ONLY synthetic preview messages
                // Never overwrite real messages (from realtime INSERT) with synthetic preview
                const hasOnlySyntheticMessages = conv.messages.length === 0 || 
                  conv.messages.every(m => m.id.startsWith('preview-'));
                if (hasOnlySyntheticMessages) {
                  updatedMessages = [{
                    id: `preview-${conv.id}`,
                    conversationId: conv.id,
                    senderId: '',
                    senderName: '',
                    content: updated.last_message_preview,
                    type: 'text' as Message['type'],
                    timestamp: new Date(updated.updated_at),
                    read: true,
                    status: 'sent' as Message['status'],
                    deleted: false,
                  }];
                }
              }
              return {
                ...conv,
                status: updated.status,
                priority: updated.priority,
                assignedTo: updated.assigned_to || undefined,
                assignedToRobot: updated.assigned_to_robot || undefined,
                departmentId: updated.department_id,
                tags: updated.tags || conv.tags,
                waitTime: updated.wait_time ?? conv.waitTime,
                createdAt: new Date(updated.created_at),
                updatedAt: new Date(updated.updated_at),
                channel: (updated.channel || conv.channel) as Conversation['channel'],
                messages: updatedMessages,
              };
            };
            setConversations(prev => prev.map(conv => 
              conv.id === updated.id ? applyUpdate(conv) : conv
            ));
            setSelectedConversation(prev => 
              prev?.id === updated.id ? applyUpdate(prev) : prev
            );
          }
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Status conversations channel:', status);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[Realtime] Canal conversations com erro, reconectando em 5s...');
          setTimeout(() => setRealtimeRetryKey(k => k + 1), 5000);
        }
      });

    // Canal para mudanças em messages (GRANULAR - atualiza só a mensagem)
    const messagesChannel = supabase
      .channel('messages-realtime-granular')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
          const newMsg = payload.new as any;
          console.log('[Realtime] Nova mensagem:', newMsg.id?.substring(0, 8));
          
          // Criar objeto Message - identificar robôs pelo sender_name
          const isRobotMessage = newMsg.sender_name?.includes('[ROBOT]') || newMsg.sender_name?.includes('(IA)');
          const message: Message = {
            id: newMsg.id,
            conversationId: newMsg.conversation_id,
            senderId: newMsg.sender_id || (isRobotMessage ? 'robot' : 'contact'),
            senderName: newMsg.sender_name,
            content: newMsg.content,
            type: newMsg.message_type as Message['type'],
            timestamp: new Date(newMsg.created_at),
            read: (newMsg.delivery_status || newMsg.status) === 'read',
            status: (newMsg.delivery_status || newMsg.status || 'sent') as Message['status'],
            deleted: newMsg.deleted || false,
          };

          // Tocar som e notificação nativa se mensagem é de um contato (não do próprio usuário)
          if (!newMsg.sender_id) {
            playNotificationSoundGlobal('message');
            
            // Buscar nome do contato para a notificação nativa
            const conv = prev.find(c => c.id === newMsg.conversation_id);
            const contactName = conv?.contact?.name || 'Contato';
            sendNativeNotification(`Nova mensagem de ${contactName}`, {
              body: newMsg.content?.substring(0, 100) || 'Nova mensagem recebida',
              tag: `msg-${newMsg.conversation_id}`,
              renotify: true,
            });
          }

          // Atualizar conversations de forma granular
          setConversations(prev => {
            // Verificar se a conversa existe no estado local
            const convExists = prev.some(c => c.id === newMsg.conversation_id);
            
            // Se a conversa não existe, buscar e adicionar (usuário pode ter permissão)
            if (!convExists) {
              console.log('[Realtime] Conversa não encontrada localmente, buscando:', newMsg.conversation_id?.substring(0, 8));
              
              // Buscar conversa em background e adicionar ao estado
              (async () => {
                const currentUser = userRef.current;
                
                const { data: convData } = await supabase
                  .from('conversations')
                  .select('*')
                  .eq('id', newMsg.conversation_id)
                  .single();
                
                if (!convData) return;
                
                // Verificar permissões
                const userHasGlobalAccess = currentUser?.departments?.some(deptId => DEPARTAMENTOS_GLOBAIS.includes(deptId));
                const canViewAll = !currentUser || currentUser.role === 'admin' || userHasGlobalAccess;
                const canView = canViewAll || 
                                convData.assigned_to === currentUser?.id || 
                                currentUser?.departments?.includes(convData.department_id);
                
                if (!canView) return;
                
                // Buscar contato
                const { data: contact } = await supabase
                  .from('contacts')
                  .select('*')
                  .eq('id', convData.contact_id)
                  .single();
                
                if (!contact) return;
                
                // Buscar todas as mensagens da conversa
                const { data: messagesData } = await supabase
                  .from('messages')
                  .select('*')
                  .eq('conversation_id', convData.id)
                  .order('created_at', { ascending: true });

                // Buscar reações para essas mensagens
                const msgIds = messagesData?.map(m => m.id) || [];
                const { data: reactionsForNewConv } = msgIds.length > 0
                  ? await supabase
                      .from('message_reactions')
                      .select('*')
                      .in('message_id', msgIds)
                  : { data: [] };

                // Mapear reações por message_id
                const reactionMap = new Map<string, MessageReaction[]>();
                reactionsForNewConv?.forEach(r => {
                  const existing = reactionMap.get(r.message_id) || [];
                  existing.push({ id: r.id, emoji: r.emoji, senderPhone: r.sender_phone || undefined });
                  reactionMap.set(r.message_id, existing);
                });
                
                const newConv: Conversation = {
                  id: convData.id,
                  type: 'externa' as const,
                  isInternal: false,
                  status: convData.status as Conversation['status'],
                  contact: {
                    id: contact.id,
                    name: contact.name,
                    phone: contact.phone || '',
                    email: contact.email || undefined,
                    avatar: contact.avatar_url || undefined,
                    tags: convData.tags || [],
                    notes: contact.notes || undefined,
                    channel: (contact as any).channel || 'whatsapp',
                  },
                  departmentId: convData.department_id,
                  assignedTo: convData.assigned_to || undefined,
                  assignedToRobot: convData.assigned_to_robot || undefined,
                  messages: (messagesData || []).map(m => {
                    const isRobotMsg = m.sender_name?.includes('[ROBOT]') || m.sender_name?.includes('(IA)');
                    return {
                      id: m.id,
                      conversationId: m.conversation_id,
                      senderId: m.sender_id || (isRobotMsg ? 'robot' : 'contact'),
                      senderName: m.sender_name,
                      content: m.content,
                      type: m.message_type as Message['type'],
                      timestamp: new Date(m.created_at),
                      read: (m.delivery_status || m.status) === 'read',
                      status: (m.delivery_status || m.status || 'sent') as Message['status'],
                      deleted: m.deleted || false,
                      reactions: reactionMap.get(m.id) || [],
                    };
                  }),
                  tags: convData.tags || [],
                  priority: convData.priority as Conversation['priority'],
                  createdAt: new Date(convData.created_at),
                  updatedAt: new Date(convData.updated_at),
                  waitTime: convData.wait_time || 0,
                  channel: (convData.channel || 'whatsapp') as Conversation['channel'],
                };
                
                setConversations(current => {
                  // Verificar novamente se já foi adicionada
                  if (current.some(c => c.id === newConv.id)) return current;
                  return [newConv, ...current];
                });
              })();
              
              return prev; // Retornar estado atual, será atualizado assincronamente
            }
            
            return prev.map(conv => {
            if (conv.id !== newMsg.conversation_id) return conv;
            
            // Verificar se mensagem já existe (evitar duplicatas de otimistic update)
            const msgExists = conv.messages.some(m => 
              m.id === newMsg.id || 
              (m.id.startsWith('temp-') && m.content === newMsg.content && m.senderId === newMsg.sender_id)
            );
            
            if (msgExists) {
              // Substituir mensagem temporária pela real
              return {
                ...conv,
                messages: conv.messages.map(m => 
                  m.id.startsWith('temp-') && m.content === newMsg.content && m.senderId === newMsg.sender_id
                    ? message
                    : m
                ),
                updatedAt: new Date()
              };
            }
            
            // Adicionar nova mensagem e ordenar por timestamp
            const updatedMessages = [...conv.messages, message].sort(
              (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );
            
            return {
              ...conv,
              messages: updatedMessages,
              updatedAt: new Date()
            };
          });
          });

          // Atualizar selectedConversation também
          setSelectedConversation(prev => {
            if (!prev || prev.id !== newMsg.conversation_id) return prev;
            
            const msgExists = prev.messages.some(m => 
              m.id === newMsg.id || 
              (m.id.startsWith('temp-') && m.content === newMsg.content && m.senderId === newMsg.sender_id)
            );
            
            if (msgExists) {
              return {
                ...prev,
                messages: prev.messages.map(m => 
                  m.id.startsWith('temp-') && m.content === newMsg.content && m.senderId === newMsg.sender_id
                    ? message
                    : m
                ),
                updatedAt: new Date()
              };
            }
            
            // Adicionar nova mensagem e ordenar por timestamp
            const updatedMessages = [...prev.messages, message].sort(
              (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );
            
            return {
              ...prev,
              messages: updatedMessages,
              updatedAt: new Date()
            };
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
          const updatedMsg = payload.new as any;
          const newStatus = (updatedMsg.delivery_status || updatedMsg.status || 'sent') as Message['status'];
          const newRead = newStatus === 'read';
          console.log('[Realtime] Mensagem atualizada:', updatedMsg.id?.substring(0, 8), 'delivery_status:', updatedMsg.delivery_status, 'deleted:', updatedMsg.deleted);
          
          const updateMsg = (msg: Message) => 
            msg.id === updatedMsg.id
              ? { ...msg, deleted: updatedMsg.deleted || false, status: newStatus, read: newRead }
              : msg;

          // Atualizar a mensagem nas conversas
          setConversations(prev => prev.map(conv => 
            conv.id === updatedMsg.conversation_id
              ? { ...conv, messages: conv.messages.map(updateMsg) }
              : conv
          ));

          // Atualizar selectedConversation também
          setSelectedConversation(prev => {
            if (!prev) return null;
            return {
              ...prev,
              messages: prev.messages.map(updateMsg)
            };
          });
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Status messages channel:', status);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[Realtime] Canal messages com erro, reconectando em 5s...');
          setTimeout(() => setRealtimeRetryKey(k => k + 1), 5000);
        }
      });

    // Canal para mudanças em profiles (status de usuários)
    const profilesChannel = supabase
      .channel('profiles-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles'
        },
        (payload) => {
          const updated = payload.new as any;
          console.log('[Realtime] Profile atualizado:', updated.id?.substring(0, 8), updated.status);
          
          // Atualizar usuários - o useEffect separado recalculará onlineCount automaticamente
          setUsers(prev => prev.map(u => 
            u.id === updated.id 
              ? { ...u, status: updated.status as 'online' | 'away' | 'busy' | 'offline' }
              : u
          ));
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Status profiles channel:', status);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[Realtime] Canal profiles com erro, reconectando em 5s...');
          setTimeout(() => setRealtimeRetryKey(k => k + 1), 5000);
        }
      });

    // Canal para mudanças em contacts (nomes atualizados em tempo real)
    const contactsChannel = supabase
      .channel('contacts-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'contacts'
        },
        (payload) => {
          const updated = payload.new as any;
          console.log('[Realtime] Contato atualizado:', updated.id?.substring(0, 8), updated.name);
          
          // Atualizar TODOS os campos do contato em todas as conversas (previne stale state)
          const contactPatch = {
            name: updated.name,
            phone: updated.phone || '',
            avatar: updated.avatar_url || undefined,
            notes: updated.notes || undefined,
            channel: updated.channel || 'whatsapp',
          };
          setConversations(prev => prev.map(conv =>
            conv.contact.id === updated.id
              ? { ...conv, contact: { ...conv.contact, ...contactPatch } }
              : conv
          ));
          setSelectedConversation(prev =>
            prev?.contact.id === updated.id
              ? { ...prev, contact: { ...prev.contact, ...contactPatch } }
              : prev
          );
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Status contacts channel:', status);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[Realtime] Canal contacts com erro, reconectando em 5s...');
          setTimeout(() => setRealtimeRetryKey(k => k + 1), 5000);
        }
      });

    // Canal para mudanças em reações de mensagens
    const reactionsChannel = supabase
      .channel('reactions-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reactions'
        },
        (payload) => {
          const newReaction = payload.new as any;
          console.log('[Realtime] Nova reação:', newReaction.emoji, 'na mensagem:', newReaction.message_id?.substring(0, 8));
          
          const reaction: MessageReaction = {
            id: newReaction.id,
            emoji: newReaction.emoji,
            senderPhone: newReaction.sender_phone || undefined
          };

          // Atualizar conversations com a nova reação
          setConversations(prev => prev.map(conv => {
            const hasMsg = conv.messages.some(m => m.id === newReaction.message_id);
            if (!hasMsg) return conv;
            return {
              ...conv,
              messages: conv.messages.map(msg => 
                msg.id === newReaction.message_id
                  ? { ...msg, reactions: [...(msg.reactions || []), reaction] }
                  : msg
              )
            };
          }));

          // Atualizar selectedConversation também
          setSelectedConversation(prev => {
            if (!prev) return null;
            return {
              ...prev,
              messages: prev.messages.map(msg =>
                msg.id === newReaction.message_id
                  ? { ...msg, reactions: [...(msg.reactions || []), reaction] }
                  : msg
              )
            };
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'message_reactions'
        },
        (payload) => {
          const deletedReaction = payload.old as any;
          console.log('[Realtime] Reação removida:', deletedReaction.id);

          // Remover reação do estado
          setConversations(prev => prev.map(conv => {
            const hasMsg = conv.messages.some(m => m.reactions?.some(r => r.id === deletedReaction.id));
            if (!hasMsg) return conv;
            return {
              ...conv,
              messages: conv.messages.map(msg => ({
                ...msg,
                reactions: msg.reactions?.filter(r => r.id !== deletedReaction.id)
              }))
            };
          }));

          setSelectedConversation(prev => {
            if (!prev) return null;
            return {
              ...prev,
              messages: prev.messages.map(msg => ({
                ...msg,
                reactions: msg.reactions?.filter(r => r.id !== deletedReaction.id)
              }))
            };
          });
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Status reactions channel:', status);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[Realtime] Canal reactions com erro, reconectando em 5s...');
          setTimeout(() => setRealtimeRetryKey(k => k + 1), 5000);
        }
      });

    // Cleanup
    return () => {
      console.log('[Realtime] Removendo canais...');
      supabase.removeChannel(conversationsChannel);
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(profilesChannel);
      supabase.removeChannel(reactionsChannel);
      supabase.removeChannel(contactsChannel);
    };
  }, [user?.id, realtimeRetryKey]); // Recriar canais quando user mudar ou retry forçar reconexão

  // Polling de fallback global (60s) - garante sincronização mesmo com websocket instável
  // Reduzido de 30s para 60s pois o realtime granular já cuida das atualizações instantâneas
  useEffect(() => {
    if (!user?.id) return;
    
    const interval = setInterval(() => {
      console.log('[Polling] Fallback sync (60s)...');
      fetchConversations();
    }, 60000);
    
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Refetch ao voltar para a aba (visibilitychange)
  useEffect(() => {
    if (!user?.id) return;
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[Visibility] Tab voltou ao foco, refetching...');
        fetchConversations();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Update polling timestamp ref when messages change
  useEffect(() => {
    if (selectedConversation?.messages.length) {
      const lastMsg = selectedConversation.messages[selectedConversation.messages.length - 1];
      lastPollTimestampRef.current = lastMsg.timestamp.toISOString();
    }
  }, [selectedConversation?.messages.length, selectedConversation?.id]);

  // Incremental polling for selected conversation (5s) — only fetches NEW messages
  useEffect(() => {
    if (!selectedConversation) return;

    const convId = selectedConversation.id;

    const interval = setInterval(async () => {
      const { data: newMessages } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', convId)
        .gt('created_at', lastPollTimestampRef.current)
        .order('created_at', { ascending: true });

      if (!newMessages || newMessages.length === 0) return;

      const mapMsg = (m: any): Message => {
        const isRobotMsg = m.sender_name?.includes('[ROBOT]') || m.sender_name?.includes('(IA)');
        return {
          id: m.id,
          conversationId: m.conversation_id,
          senderId: m.sender_id || (isRobotMsg ? 'robot' : 'contact'),
          senderName: m.sender_name,
          content: m.content,
          type: m.message_type as Message['type'],
          timestamp: new Date(m.created_at),
          read: (m.delivery_status || m.status) === 'read',
          status: (m.delivery_status || m.status || 'sent') as Message['status'],
          deleted: m.deleted || false,
        };
      };

      const addNewMessages = (prev: Message[]): Message[] | null => {
        const cleaned = prev.filter(m => 
          !m.id.startsWith('temp-') || 
          !newMessages.some(nm => nm.content === m.content && (nm.sender_id === m.senderId || nm.sender_name === m.senderName))
        );
        const existingIds = new Set(cleaned.map(m => m.id));
        const trulyNew = newMessages.filter(m => !existingIds.has(m.id));
        if (trulyNew.length === 0 && cleaned.length === prev.length) return null;
        console.log('[Polling] Novas mensagens:', trulyNew.length);
        return [...cleaned, ...trulyNew.map(mapMsg)].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
      };

      setSelectedConversation(prev => {
        if (!prev || prev.id !== convId) return prev;
        const updated = addNewMessages(prev.messages);
        return updated ? { ...prev, messages: updated, updatedAt: new Date() } : prev;
      });

      setConversations(prev => prev.map(conv => {
        if (conv.id !== convId) return conv;
        const updated = addNewMessages(conv.messages);
        return updated ? { ...conv, messages: updated, updatedAt: new Date() } : conv;
      }));
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedConversation?.id]);

  return (
    <AppContext.Provider
      value={{
        user,
        setUser,
        conversations,
        setConversations,
        selectedConversation,
        setSelectedConversation,
        departments,
        quickMessages,
        users,
        sidebarCollapsed,
        setSidebarCollapsed,
        loading,
        refetchConversations: fetchConversations,
        refetchQuickMessages: fetchQuickMessages,
        loadConversationMessages,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextType {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
