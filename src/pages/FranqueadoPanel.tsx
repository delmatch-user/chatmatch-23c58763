import { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, Bike, MessageSquare, LogOut, Moon, Sun, Search } from 'lucide-react';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/contexts/ThemeContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { Conversation, Message, Contact } from '@/types';
import { extractCidade, getContactDisplayName } from '@/lib/phoneUtils';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

export default function FranqueadoPanel() {
  const { profile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [cities, setCities] = useState<string[]>([]);

  const hasSelection = !!selectedConversation;

  // Fetch franqueado's cities
  useEffect(() => {
    if (!profile) return;
    const fetchCities = async () => {
      const { data } = await supabase
        .from('franqueado_cities')
        .select('city')
        .eq('user_id', profile.id);
      if (data) setCities(data.map(d => d.city));
    };
    fetchCities();
  }, [profile]);

  // Fetch Machine conversations filtered by city (RLS handles the filtering)
  const fetchConversations = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      // RLS policy filters to only machine conversations for franqueado's cities
      const { data: convData, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('channel', 'machine')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      if (!convData) return;

      const contactIds = [...new Set(convData.map(c => c.contact_id))];
      const { data: contactsData } = await supabase
        .from('contacts')
        .select('*')
        .in('id', contactIds);

      const conversationIds = convData.map(c => c.id);
      let allMessages: any[] = [];
      const batchSize = 1000;
      let offset = 0;
      let hasMore = true;
      while (hasMore && conversationIds.length > 0) {
        const { data: batch } = await supabase
          .from('messages')
          .select('*')
          .in('conversation_id', conversationIds)
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

      const mapped: Conversation[] = convData.map(conv => {
        const contact = contactsData?.find(c => c.id === conv.contact_id);
        const messages = allMessages.filter(m => m.conversation_id === conv.id);

        return {
          id: conv.id,
          type: 'externa' as const,
          status: conv.status as Conversation['status'],
          contact: {
            id: contact?.id || conv.contact_id,
            name: contact?.name || 'Contato',
            phone: contact?.phone || '',
            email: contact?.email || undefined,
            avatar: contact?.avatar_url || undefined,
            tags: conv.tags || [],
            notes: contact?.notes || undefined,
            channel: 'machine' as const,
          },
          departmentId: conv.department_id,
          assignedTo: conv.assigned_to || undefined,
          messages: messages.map(m => ({
            id: m.id,
            conversationId: m.conversation_id,
            senderId: m.sender_id || 'contact',
            senderName: m.sender_name,
            content: m.content,
            type: m.message_type as Message['type'],
            timestamp: new Date(m.created_at),
            read: m.status === 'read',
            status: (m.delivery_status || m.status || 'sent') as Message['status'],
            deleted: m.deleted || false,
            reactions: [],
          })),
          tags: conv.tags || [],
          priority: conv.priority as Conversation['priority'],
          createdAt: new Date(conv.created_at),
          updatedAt: new Date(conv.updated_at),
          waitTime: conv.wait_time || 0,
          channel: 'machine' as const,
          protocol: conv.protocol || undefined,
        };
      });

      setConversations(mapped);
      
      // Update selected conversation
      setSelectedConversation(prev => {
        if (!prev) return null;
        return mapped.find(c => c.id === prev.id) || null;
      });
    } catch (err) {
      console.error('Error fetching franqueado conversations:', err);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('franqueado-conversations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        fetchConversations();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        fetchConversations();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchConversations]);

  const filteredConversations = useMemo(() => {
    let list = conversations;
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      list = list.filter(c => 
        c.contact.name.toLowerCase().includes(lower) ||
        (c.contact.phone && c.contact.phone.toLowerCase().includes(lower)) ||
        (extractCidade(c.contact.notes) || '').toLowerCase().includes(lower)
      );
    }
    return [...list].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }, [conversations, searchTerm]);

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top bar */}
      <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
            <Bike className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground">Painel Franqueado</h1>
            {cities.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {cities.join(', ')}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
          <span className="text-sm text-muted-foreground hidden sm:inline">{profile?.name}</span>
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Conversation List */}
        <div className={cn(
          "w-full sm:w-96 shrink-0 border-r border-border flex flex-col bg-card",
          isMobile && hasSelection && 'hidden'
        )}>
          {/* Search */}
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar conversa..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </div>

          {/* List */}
          <ScrollArea className="flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <Bike className="w-10 h-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  {searchTerm ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa Machine para suas cidades'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredConversations.map(conv => {
                  const cidade = extractCidade(conv.contact.notes);
                  const displayName = getContactDisplayName(conv.contact.name, conv.contact.phone, conv.contact.notes);
                  const lastMsg = conv.messages[conv.messages.length - 1];
                  const isSelected = selectedConversation?.id === conv.id;

                  return (
                    <button
                      key={conv.id}
                      onClick={() => setSelectedConversation(conv)}
                      className={cn(
                        "w-full flex items-start gap-3 p-3 text-left hover:bg-accent/50 transition-colors",
                        isSelected && "bg-accent"
                      )}
                    >
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarFallback className="bg-orange-500/20 text-orange-500 text-xs">
                          <Bike className="w-4 h-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                        {cidade && (
                          <p className="text-[11px] text-orange-500 truncate">📍 {cidade}</p>
                        )}
                        {lastMsg && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {lastMsg.content}
                          </p>
                        )}
                        <div className="flex items-center justify-between gap-1 mt-1">
                          <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded-full",
                            conv.status === 'em_atendimento' && "bg-green-500/20 text-green-500",
                            conv.status === 'em_fila' && "bg-yellow-500/20 text-yellow-500",
                            conv.status === 'finalizada' && "bg-muted text-muted-foreground",
                            conv.status === 'pendente' && "bg-blue-500/20 text-blue-500",
                          )}>
                            {conv.status === 'em_atendimento' ? 'Ativo' : 
                             conv.status === 'em_fila' ? 'Na fila' : 
                             conv.status === 'finalizada' ? 'Finalizado' :
                             conv.status === 'pendente' ? 'Pendente' : conv.status}
                          </span>
                          {lastMsg && (
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {format(lastMsg.timestamp, 'HH:mm')}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {/* Stats */}
          <div className="p-3 border-t border-border text-center">
            <span className="text-xs text-muted-foreground">
              {conversations.length} conversa{conversations.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Chat Panel */}
        <div className={cn(
          "flex-1 min-w-0 flex flex-col",
          isMobile && !hasSelection && 'hidden'
        )}>
          {isMobile && hasSelection && (
            <div className="h-12 px-2 flex items-center border-b border-border bg-card">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1"
                onClick={() => setSelectedConversation(null)}
              >
                <ChevronLeft className="w-4 h-4" />
                Voltar
              </Button>
            </div>
          )}
          <div className="flex-1 min-h-0">
            {selectedConversation ? (
              <ChatPanel 
                conversation={selectedConversation}
                showContactDetails={false}
                onToggleContactDetails={() => {}}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
                <MessageSquare className="w-12 h-12 opacity-30" />
                <p className="text-sm">Selecione uma conversa para visualizar</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
