import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Search, Hash, Users as UsersIcon, Plus, Send, Trash2, Loader2, X, ChevronLeft, Megaphone, Paperclip, Image as ImageIcon, Check } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useApp } from '@/contexts/AppContext';
import { useInternalChat } from '@/hooks/useInternalChat';
import { useDepartments } from '@/hooks/useDepartments';
import { useIsMobile } from '@/hooks/use-mobile';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { playNotificationSoundGlobal } from '@/hooks/useNotificationSound';
import { useSuporteAnnouncements } from '@/components/chat/ChannelAnnouncementOverlay';
import { useFileUpload, UploadedFile } from '@/hooks/useFileUpload';
import { FilePreview } from '@/components/chat/FilePreview';
import { MessageAttachment } from '@/components/chat/MessageAttachment';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type TeamRole = 'admin' | 'supervisor' | 'atendente';
type TeamStatus = 'online' | 'away' | 'busy' | 'offline';

interface TeamDepartment {
  id: string;
  name: string;
  color: string;
}

interface TeamMember {
  id: string;
  name: string;
  avatar: string;
  status: TeamStatus;
  role: TeamRole;
  departments: TeamDepartment[];
}

function getInitials(name: string | undefined | null) {
  if (!name) return '?';
  return name.split(' ').map((n) => n[0]).filter(Boolean).join('').toUpperCase().slice(0, 2);
}

function formatTime(date: Date | string | undefined | null) {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function InternalChat() {
  const { user, quickMessages } = useApp();
  const { departments } = useDepartments();
  const { pendingCount: announcementCount, suporteChannelId: announcementChannelId, markAllAsRead: markAnnouncementsRead } = useSuporteAnnouncements();
  const { markAsRead, unreadDetails, lastActivityDetails } = useUnreadMessages();
  const {
    channels,
    messages,
    isLoading,
    fetchMessages,
    sendMessage,
    createChannel,
    deleteChannel,
    fetchChannels,
    fetchChannelMembers,
    addMessage,
  } = useInternalChat();

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(true);

  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showQuickMessages, setShowQuickMessages] = useState(false);
  const [quickSearchTerm, setQuickSearchTerm] = useState('');
  const [pendingFiles, setPendingFiles] = useState<UploadedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, uploading } = useFileUpload();

  const isAdmin = user?.role === 'admin' || user?.role === 'supervisor';
  const isMobile = useIsMobile();
  const hasSelection = !!selectedChannelId || !!selectedUserId;

  // Mark as read when selection changes
  useEffect(() => {
    if (selectedChannelId) {
      markAsRead('channel', selectedChannelId);
      // Auto-mark announcements as read when opening Suporte channel
      if (selectedChannelId === announcementChannelId && announcementCount > 0) {
        markAnnouncementsRead();
      }
    } else if (selectedUserId) {
      markAsRead('dm', selectedUserId);
    }
  }, [selectedChannelId, selectedUserId, markAsRead, announcementChannelId, announcementCount, markAnnouncementsRead]);
  const loadTeamDirectory = useCallback(async () => {
    setTeamLoading(true);
    try {
      const { data, error } = await supabase.rpc('list_team_directory');
      if (error) throw error;

      const mapped = (data || []).map((row: any) => {
        const deptsRaw = Array.isArray(row.departments) ? row.departments : [];
        const mappedDepts: TeamDepartment[] = deptsRaw
          .filter((d: any) => d && typeof d === 'object')
          .map((d: any) => ({
            id: String(d.id),
            name: String(d.name),
            color: String(d.color),
          }));

        return {
          id: String(row.id),
          name: String(row.name),
          avatar: row.avatar_url ? String(row.avatar_url) : '',
          status: (row.status as TeamStatus) || 'offline',
          role: (row.role as TeamRole) || 'atendente',
          departments: mappedDepts,
        } satisfies TeamMember;
      });

      setTeamMembers(mapped);
    } catch (e) {
      console.error('Error loading team directory:', e);
      setTeamMembers([]);
    } finally {
      setTeamLoading(false);
    }
  }, []);

  // Initial sync (channels + members + directory)
  useEffect(() => {
    loadTeamDirectory();
    // Ensure lists refresh even if the page was open during backend updates
    fetchChannels();
    fetchChannelMembers();
  }, [loadTeamDirectory, fetchChannels, fetchChannelMembers]);

  // Filter quick messages based on search term after "/"
  const filteredQuickMessages = quickMessages.filter((qm) =>
    qm.title.toLowerCase().includes(quickSearchTerm.toLowerCase()) ||
    qm.content.toLowerCase().includes(quickSearchTerm.toLowerCase())
  );

  const otherUsers = useMemo(
    () => teamMembers.filter((m) => m.id !== user?.id),
    [teamMembers, user?.id]
  );

  const selectedChannel = channels.find((c) => c.id === selectedChannelId);
  const selectedUser = otherUsers.find((u) => u.id === selectedUserId);

  // Sort channels by last activity (most recent first)
  const sortedChannels = useMemo(() => {
    return [...channels].sort((a, b) => {
      const aTime = lastActivityDetails.channels[a.id] || a.created_at;
      const bTime = lastActivityDetails.channels[b.id] || b.created_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
  }, [channels, lastActivityDetails.channels]);

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return otherUsers;

    return otherUsers.filter((u) => {
      const inName = u.name.toLowerCase().includes(term);
      const inRole = u.role.toLowerCase().includes(term);
      const inDept = u.departments.some((d) => d.name.toLowerCase().includes(term));
      return inName || inRole || inDept;
    });
  }, [otherUsers, searchTerm]);

  // Sort users by last activity (most recent first)
  const sortedFilteredUsers = useMemo(() => {
    return [...filteredUsers].sort((a, b) => {
      const aTime = lastActivityDetails.users[a.id];
      const bTime = lastActivityDetails.users[b.id];
      
      // Users with messages come first
      if (aTime && bTime) {
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      }
      if (aTime && !bTime) return -1;
      if (!aTime && bTime) return 1;
      
      // Fallback: sort by name
      return a.name.localeCompare(b.name);
    });
  }, [filteredUsers, lastActivityDetails.users]);

  // Fetch messages when selection changes
  useEffect(() => {
    if (selectedChannelId) {
      fetchMessages(selectedChannelId);
    } else if (selectedUserId) {
      fetchMessages(undefined, selectedUserId);
    }
  }, [selectedChannelId, selectedUserId, fetchMessages]);

  // Realtime listener para mensagens
  useEffect(() => {
    if (!selectedChannelId && !selectedUserId) return;
    if (!user) return;

    const channel = supabase
      .channel(`internal-chat-realtime-${selectedChannelId || selectedUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'internal_messages',
        },
        (payload) => {
          const newMessage = payload.new as any;
          
          // Para canais
          if (selectedChannelId && newMessage.channel_id === selectedChannelId) {
            addMessage(newMessage);
            // Tocar som se não é mensagem própria
            if (newMessage.sender_id !== user.id) {
              playNotificationSoundGlobal('message');
            }
          }
          // Para DMs
          else if (selectedUserId && !newMessage.channel_id) {
            const isRelevantDM = 
              (newMessage.sender_id === user.id && newMessage.receiver_id === selectedUserId) ||
              (newMessage.sender_id === selectedUserId && newMessage.receiver_id === user.id);
            
            if (isRelevantDM) {
              addMessage(newMessage);
              // Tocar som se não é mensagem própria
              if (newMessage.sender_id !== user.id) {
                playNotificationSoundGlobal('message');
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedChannelId, selectedUserId, user, addMessage]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !user) return;

    for (const file of Array.from(files)) {
      const uploaded = await uploadFile(file, user.id);
      if (uploaded) {
        setPendingFiles(prev => [...prev, uploaded]);
      }
    }
    e.target.value = '';
  };

  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const parseMessageContent = (content: string) => {
    try {
      const lines = content.split('\n');
      const lastLine = lines[lines.length - 1];
      if (lastLine.startsWith('[{"')) {
        const attachments = JSON.parse(lastLine);
        const textContent = lines.slice(0, -1).join('\n');
        return { text: textContent, attachments };
      }
    } catch {
      // Not JSON
    }
    return { text: content, attachments: null };
  };

  const handleSend = async () => {
    const text = message.trim();
    if (!text && pendingFiles.length === 0) return;

    let content = text;
    if (pendingFiles.length > 0) {
      const attachmentsJson = JSON.stringify(pendingFiles);
      content = content ? `${content}\n${attachmentsJson}` : attachmentsJson;
    }

    await sendMessage(content, selectedChannelId || undefined, selectedUserId || undefined);
    setMessage('');
    setPendingFiles([]);
    setShowQuickMessages(false);
    setQuickSearchTerm('');
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessage(value);

    // Auto-resize
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;

    if (value.startsWith('/')) {
      setShowQuickMessages(true);
      setQuickSearchTerm(value.slice(1));
    } else {
      setShowQuickMessages(false);
      setQuickSearchTerm('');
    }
  };

  const insertQuickMessage = (content: string) => {
    setMessage(content);
    setShowQuickMessages(false);
    setQuickSearchTerm('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !showQuickMessages) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape' && showQuickMessages) {
      setShowQuickMessages(false);
      setQuickSearchTerm('');
      setMessage('');
    }
  };

  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return;
    setIsSubmitting(true);

    await createChannel(newChannelName.trim(), 'channel', {
      userIds: selectedMembers,
      departmentIds: selectedDepts,
    });

    setIsSubmitting(false);
    setIsCreateOpen(false);
    setNewChannelName('');
    setSelectedMembers([]);
    setSelectedDepts([]);
  };

  const handleDeleteChannel = async (channelId: string) => {
    if (confirm('Tem certeza que deseja excluir este canal?')) {
      await deleteChannel(channelId);
      if (selectedChannelId === channelId) {
        setSelectedChannelId(null);
      }
    }
  };

  if (isLoading) {
    return (
      <MainLayout title="Chat Interno">
        <div className="h-full flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Chat Interno">
      <div className="h-full flex w-full min-w-0">
        {/* Sidebar */}
        <div
          className={cn(
            "w-full sm:w-80 shrink-0 bg-card border-r border-border flex flex-col",
            isMobile && hasSelection && "hidden"
          )}
        >
          <div className="p-3 sm:p-4 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, departamento ou cargo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 input-search"
              />
            </div>
          </div>

          <Tabs defaultValue="channels" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="mx-4 mt-2 shrink-0">
              <TabsTrigger value="channels" className="flex-1">
                <Hash className="w-4 h-4 mr-1" />Canais
              </TabsTrigger>
              <TabsTrigger value="users" className="flex-1">
                <UsersIcon className="w-4 h-4 mr-1" />Equipe
              </TabsTrigger>
            </TabsList>

            <TabsContent value="channels" className="flex-1 overflow-y-auto scrollbar-thin p-2 m-0 data-[state=inactive]:hidden">
              <div className="space-y-1">
                {sortedChannels.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">Nenhum canal disponível.</div>
                ) : (
                  sortedChannels.map((channel) => (
                    <div
                      key={channel.id}
                      className={cn(
                        'w-full flex items-center gap-3 p-3 rounded-lg transition-all cursor-pointer group',
                        selectedChannelId === channel.id
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
                      )}
                      onClick={() => {
                        setSelectedChannelId(channel.id);
                        setSelectedUserId(null);
                      }}
                    >
                      <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                        <Hash className="w-4 h-4" />
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className="font-medium truncate">{channel.name}</p>
                      </div>
                      {unreadDetails.channels[channel.id] > 0 && (
                        <Badge className="bg-primary text-primary-foreground text-xs min-w-[20px] h-5 flex items-center justify-center">
                          {unreadDetails.channels[channel.id]}
                        </Badge>
                      )}
                      {channel.id === announcementChannelId && announcementCount > 0 && (
                        <Badge variant="outline" className="border-destructive text-destructive text-xs min-w-[20px] h-5 flex items-center justify-center gap-1">
                          <Megaphone className="w-3 h-3" />
                          {announcementCount}
                        </Badge>
                      )}
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 group-hover:opacity-100 h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteChannel(channel.id);
                          }}
                        >
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>
              {isAdmin && (
                <Button
                  variant="ghost"
                  className="w-full mt-4 text-muted-foreground"
                  onClick={() => setIsCreateOpen(true)}
                >
                  <Plus className="w-4 h-4 mr-2" />Novo Canal
                </Button>
              )}
            </TabsContent>

            <TabsContent value="users" className="flex-1 overflow-y-auto scrollbar-thin p-2 m-0 data-[state=inactive]:hidden">
              {teamLoading ? (
                <div className="h-full flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-1">
                  {sortedFilteredUsers.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground">Nenhum membro encontrado.</div>
                  ) : (
                    sortedFilteredUsers.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => {
                          setSelectedUserId(u.id);
                          setSelectedChannelId(null);
                        }}
                        className={cn(
                          'w-full flex items-start gap-3 p-3 rounded-lg transition-all',
                          selectedUserId === u.id
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-secondary text-foreground'
                        )}
                      >
                        <div className="relative mt-0.5">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={u.avatar} />
                            <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                              {getInitials(u.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span
                            className={cn(
                              'absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-card',
                              u.status === 'online' && 'bg-online',
                              u.status === 'away' && 'bg-away',
                              u.status === 'busy' && 'bg-busy',
                              u.status === 'offline' && 'bg-offline'
                            )}
                          />
                          {unreadDetails.users[u.id] > 0 && (
                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full border-2 border-card" />
                          )}
                        </div>

                        <div className="flex-1 text-left min-w-0">
                          <p className="font-medium truncate">{u.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">{u.role}</p>

                          {u.departments.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {u.departments.slice(0, 2).map((d) => (
                                <Badge key={d.id} variant="outline" className="text-[11px]">
                                  <span
                                    className="inline-block w-2 h-2 rounded-full mr-1"
                                    style={{ backgroundColor: d.color }}
                                  />
                                  {d.name}
                                </Badge>
                              ))}
                              {u.departments.length > 2 && (
                                <Badge variant="outline" className="text-[11px]">
                                  +{u.departments.length - 2}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Chat Area */}
        <div
          className={cn(
            "flex-1 min-w-0 flex flex-col bg-background",
            isMobile && !hasSelection && "hidden"
          )}
        >
          {selectedChannel || selectedUser ? (
            <> 
              <div className="h-16 px-3 sm:px-6 flex items-center gap-3 border-b border-border bg-card">
                {isMobile && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setSelectedChannelId(null);
                      setSelectedUserId(null);
                    }}
                    aria-label="Voltar"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </Button>
                )}
                {selectedChannel && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                      <Hash className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-medium text-foreground">{selectedChannel.name}</h3>
                    </div>
                  </div>
                )}

                {selectedUser && (
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={selectedUser.avatar} />
                      <AvatarFallback className="bg-muted text-muted-foreground">
                        {getInitials(selectedUser.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-medium text-foreground">{selectedUser.name}</h3>
                      <p className="text-xs text-muted-foreground capitalize">{selectedUser.status}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex-1 p-3 sm:p-6 overflow-y-auto scrollbar-thin space-y-3">
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <p>Inicie uma conversa</p>
                  </div>
                ) : (
                  messages.map((msg, msgIndex, msgArr) => {
                    const isOwn = msg.sender_id === user?.id;
                    const sender = teamMembers.find((u) => u.id === msg.sender_id);
                    const senderName = isOwn ? (user?.name || 'Você') : (sender?.name || 'Usuário');

                    const msgDate = new Date(msg.created_at);
                    const prevMsg = msgIndex > 0 ? msgArr[msgIndex - 1] : null;
                    const prevDate = prevMsg ? new Date(prevMsg.created_at) : null;
                    const showDateSep = !prevDate || msgDate.toDateString() !== prevDate.toDateString();
                    const formatDateSep = (d: Date) => {
                      const today = new Date();
                      const yesterday = new Date(today);
                      yesterday.setDate(yesterday.getDate() - 1);
                      if (d.toDateString() === today.toDateString()) return 'Hoje';
                      if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
                      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                    };

                    return (
                      <React.Fragment key={msg.id}>
                        {showDateSep && (
                          <div className="flex justify-center my-2">
                            <span className="text-xs text-muted-foreground bg-muted/60 rounded-full px-4 py-1.5 border border-border/50">
                              {formatDateSep(msgDate)}
                            </span>
                          </div>
                        )}
                      <div
                        className={cn('flex gap-3', isOwn ? 'justify-end' : 'justify-start')}
                      >
                        {!isOwn && (
                          <Avatar className="h-9 w-9 shrink-0">
                            <AvatarImage src={sender?.avatar} />
                            <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                              {getInitials(senderName)}
                            </AvatarFallback>
                          </Avatar>
                        )}

                        <div className={cn('max-w-[80%] sm:max-w-[70%]', isOwn && 'order-1')}>
                          <p
                            className={cn(
                              'text-xs font-medium text-muted-foreground mb-1',
                              isOwn ? 'text-right' : 'text-left'
                            )}
                          >
                            {senderName}
                          </p>

                          {(() => {
                            const { text, attachments } = parseMessageContent(msg.content);
                            return (
                              <div
                                className={cn(
                                  'px-4 py-2 rounded-2xl',
                                  isOwn
                                    ? 'bg-primary text-primary-foreground rounded-br-md'
                                    : 'bg-secondary text-foreground rounded-bl-md'
                                )}
                              >
                                {text && <p className="text-sm whitespace-pre-wrap break-words">{text}</p>}
                                {attachments && <MessageAttachment attachments={attachments} />}
                              </div>
                            );
                          })()}

                          <div
                            className={cn(
                              'mt-1 flex items-center gap-1 text-[10px] text-muted-foreground',
                              isOwn ? 'justify-end' : 'justify-start'
                            )}
                          >
                            <span>{formatTime(msg.created_at)}</span>
                            {isOwn && (
                              <Check className="w-4 h-4 text-muted-foreground/60" strokeWidth={3} />
                            )}
                          </div>
                        </div>

                        {isOwn && (
                          <Avatar className="h-9 w-9 shrink-0">
                            <AvatarImage src={user?.avatar} />
                            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                              {getInitials(user?.name || 'U')}
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                      </React.Fragment>
                    );
                  })
                )}
              </div>

              {/* Quick Messages Panel */}
              {showQuickMessages && (
                <div className="border-t border-border bg-card p-3 max-h-48 overflow-y-auto scrollbar-thin animate-slide-in">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-foreground">
                      Mensagens Rápidas{' '}
                      {quickSearchTerm && (
                        <span className="text-muted-foreground">- "{quickSearchTerm}"</span>
                      )}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        setShowQuickMessages(false);
                        setQuickSearchTerm('');
                        setMessage('');
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="space-y-1">
                    {filteredQuickMessages.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">Nenhuma mensagem encontrada</p>
                    ) : (
                      filteredQuickMessages.map((qm) => (
                        <button
                          key={qm.id}
                          onClick={() => insertQuickMessage(qm.content)}
                          className="w-full text-left p-2 rounded-lg hover:bg-secondary transition-colors"
                        >
                          <p className="text-sm font-medium text-foreground">{qm.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{qm.content}</p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Hidden file inputs */}
              <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" multiple />
              <input type="file" ref={imageInputRef} onChange={handleFileSelect} className="hidden" accept="image/*" multiple />

              {/* File Preview */}
              <FilePreview files={pendingFiles} onRemove={removePendingFile} uploading={uploading} />

              <div className="p-3 sm:p-4 border-t border-border bg-card">
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-muted-foreground shrink-0" disabled={uploading}>
                        {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
                        <ImageIcon className="w-4 h-4 mr-2" />Foto
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                        <Paperclip className="w-4 h-4 mr-2" />Arquivo
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Textarea
                    value={message}
                    onChange={handleMessageChange}
                    placeholder="Digite / para mensagens rápidas..."
                    className="flex-1 input-search min-h-[40px] max-h-[120px] resize-none overflow-y-auto py-2"
                    onKeyDown={handleKeyDown}
                    onPaste={async (e: React.ClipboardEvent) => {
                      const items = e.clipboardData?.items;
                      if (!items || !user) return;
                      for (const item of Array.from(items)) {
                        if (item.type.startsWith('image/')) {
                          e.preventDefault();
                          const file = item.getAsFile();
                          if (file) {
                            const namedFile = new File([file], `screenshot-${Date.now()}.png`, { type: file.type });
                            const uploaded = await uploadFile(namedFile, user.id);
                            if (uploaded) setPendingFiles(prev => [...prev, uploaded]);
                          }
                        }
                      }
                    }}
                    disabled={uploading}
                    rows={1}
                  />
                  <Button onClick={handleSend} disabled={(!message.trim() && pendingFiles.length === 0) || showQuickMessages || uploading}>
                    <Send className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mb-4">
                <UsersIcon className="w-10 h-10" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">Chat Interno</h3>
              <p className="text-sm">Selecione um canal ou colega para conversar</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Channel Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Canal</DialogTitle>
            <DialogDescription>Crie um canal para comunicação interna</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome do Canal *</Label>
              <Input
                placeholder="Ex: Geral"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Adicionar Usuários</Label>
              <div className="flex flex-wrap gap-2">
                {otherUsers.map((u) => (
                  <Button
                    key={u.id}
                    type="button"
                    variant={selectedMembers.includes(u.id) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() =>
                      setSelectedMembers((prev) =>
                        prev.includes(u.id) ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                      )
                    }
                  >
                    {u.name}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Adicionar Departamentos</Label>
              <div className="flex flex-wrap gap-2">
                {departments.map((d) => (
                  <Button
                    key={d.id}
                    type="button"
                    variant={selectedDepts.includes(d.id) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() =>
                      setSelectedDepts((prev) =>
                        prev.includes(d.id) ? prev.filter((id) => id !== d.id) : [...prev, d.id]
                      )
                    }
                  >
                    <span className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: d.color }} />
                    {d.name}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setIsCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateChannel} disabled={isSubmitting || !newChannelName.trim()}>
              {isSubmitting ? 'Criando...' : 'Criar Canal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
