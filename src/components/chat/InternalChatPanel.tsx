import React, { useState, useRef, useEffect } from 'react';
import { Send, CheckCircle, Hash, X, Paperclip, Image as ImageIcon, Loader2, Check, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Conversation } from '@/types';
import { cn } from '@/lib/utils';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { useFileUpload, UploadedFile } from '@/hooks/useFileUpload';
import { FilePreview } from '@/components/chat/FilePreview';
import { MessageAttachment } from '@/components/chat/MessageAttachment';

interface InternalChatPanelProps {
  conversation: Conversation | null;
  onFinalize: () => Promise<void>;
}

interface InternalMessage {
  id: string;
  content: string;
  sender_id: string;
  receiver_id?: string | null;
  created_at: string;
  channel_id?: string | null;
}

export function InternalChatPanel({ conversation, onFinalize }: InternalChatPanelProps) {
  const { user, users, quickMessages } = useApp();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [showQuickMessages, setShowQuickMessages] = useState(false);
  const [quickSearchTerm, setQuickSearchTerm] = useState('');
  const [pendingFiles, setPendingFiles] = useState<UploadedFile[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, uploading } = useFileUpload();

  const filteredQuickMessages = quickMessages.filter(qm => 
    qm.title.toLowerCase().includes(quickSearchTerm.toLowerCase()) ||
    qm.content.toLowerCase().includes(quickSearchTerm.toLowerCase())
  );

  // Fetch messages when conversation changes
  useEffect(() => {
    const fetchMessages = async () => {
      if (!conversation) return;

      let query = supabase.from('internal_messages').select('*');
      
      if (conversation.channelId) {
        query = query.eq('channel_id', conversation.channelId);
      } else if (conversation.receiverId && user) {
        query = query
          .is('channel_id', null)
          .or(`and(sender_id.eq.${user.id},receiver_id.eq.${conversation.receiverId}),and(sender_id.eq.${conversation.receiverId},receiver_id.eq.${user.id})`);
      }
      
      const { data, error } = await query.order('created_at', { ascending: true });

      if (!error && data) {
        setMessages(data as InternalMessage[]);
      }
    };

    fetchMessages();
  }, [conversation, user]);

  // Subscribe to realtime messages
  useEffect(() => {
    if (!conversation || !user) return;

    const channel = supabase
      .channel(`internal-chat-${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'internal_messages',
        },
        (payload) => {
          const newMessage = payload.new as InternalMessage;
          
          // Para canais: verificar channel_id
          if (conversation.channelId) {
            if (newMessage.channel_id === conversation.channelId) {
              setMessages(prev => {
                // Evitar duplicação
                if (prev.some(m => m.id === newMessage.id)) return prev;
                return [...prev, newMessage];
              });
            }
          } 
          // Para DMs: verificar sender_id e receiver_id
          else if (conversation.receiverId) {
            const isRelevantDM = 
              (newMessage.sender_id === user.id && newMessage.receiver_id === conversation.receiverId) ||
              (newMessage.sender_id === conversation.receiverId && newMessage.receiver_id === user.id);
            
            if (isRelevantDM && !newMessage.channel_id) {
              setMessages(prev => {
                if (prev.some(m => m.id === newMessage.id)) return prev;
                return [...prev, newMessage];
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !user) return;

    for (const file of Array.from(files)) {
      const uploaded = await uploadFile(file, user.id);
      if (uploaded) {
        setPendingFiles(prev => [...prev, uploaded]);
      }
    }

    // Reset input
    e.target.value = '';
  };

  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  if (!conversation) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-background text-muted-foreground">
        <div className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center mb-4">
          <Send className="w-10 h-10 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-2">Nenhuma conversa selecionada</h3>
        <p className="text-sm">Selecione uma conversa para começar</p>
      </div>
    );
  }

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const handleSend = async () => {
    if ((!message.trim() && pendingFiles.length === 0) || !user || uploading) return;

    setLoading(true);
    try {
      // Build content - if there are files, include them as JSON
      let content = message.trim();
      if (pendingFiles.length > 0) {
        const attachmentsJson = JSON.stringify(pendingFiles);
        content = content ? `${content}\n${attachmentsJson}` : attachmentsJson;
      }

      const { error } = await supabase
        .from('internal_messages')
        .insert({
          content,
          sender_id: user.id,
          channel_id: conversation.channelId || null,
          receiver_id: conversation.receiverId || null,
        });

      if (!error) {
        // Realtime listener cuidará de adicionar a mensagem
        setMessage('');
        setPendingFiles([]);
        setShowQuickMessages(false);
        setQuickSearchTerm('');
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setLoading(false);
    }
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

  const isChannel = !!conversation.channelId;
  const contactName = conversation.contact.name;
  const isAdmin = user?.role === 'admin' || user?.role === 'supervisor';
  // Atendentes só podem finalizar DMs, não canais
  const canFinalize = isChannel ? isAdmin : true;

  // Parse attachments from message content
  const parseMessageContent = (content: string) => {
    try {
      // Check if content contains JSON attachments at the end
      const lines = content.split('\n');
      const lastLine = lines[lines.length - 1];
      if (lastLine.startsWith('[{"')) {
        const attachments = JSON.parse(lastLine);
        const textContent = lines.slice(0, -1).join('\n');
        return { text: textContent, attachments };
      }
    } catch {
      // Not JSON, regular message
    }
    return { text: content, attachments: null };
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Hidden file inputs */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        className="hidden"
        multiple
      />
      <input
        type="file"
        ref={imageInputRef}
        onChange={handleFileSelect}
        className="hidden"
        accept="image/*"
        multiple
      />

      {/* Chat Header */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-border bg-card">
        <div className="flex items-center gap-3">
          {isChannel ? (
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Hash className="w-5 h-5 text-primary" />
            </div>
          ) : (
            <Avatar className="h-10 w-10">
              <AvatarImage src={conversation.contact.avatar} />
              <AvatarFallback className="bg-muted text-muted-foreground">
                {getInitials(contactName.replace('# ', ''))}
              </AvatarFallback>
            </Avatar>
          )}
          <div>
            <h3 className="font-medium text-foreground">{contactName}</h3>
            <p className="text-xs text-muted-foreground">
              {isChannel ? 'Canal interno' : 'Conversa de equipe'}
            </p>
          </div>
        </div>

        {canFinalize && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={onFinalize}
            className="text-green-600 border-green-600 hover:bg-green-600 hover:text-white"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Finalizar Conversa
          </Button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">Nenhuma mensagem ainda</p>
          </div>
        ) : (
          messages.map((msg, msgIndex, msgArr) => {
            const isOwn = msg.sender_id === user?.id;
            const isSystemMessage = msg.sender_id === 'SYSTEM' || (msg as any).senderName === 'SYSTEM';
            
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
            const sender = users.find(u => u.id === msg.sender_id);
            const senderName = isOwn ? (user?.name || 'Você') : (sender?.name || 'Usuário');
            const senderAvatar = isOwn ? user?.avatar : sender?.avatar;
            const { text, attachments } = parseMessageContent(msg.content);

            if (isSystemMessage) {
              return (
                <React.Fragment key={msg.id}>
                  {showDateSep && (
                    <div className="flex justify-center my-2">
                      <span className="text-xs text-muted-foreground bg-muted/60 rounded-full px-4 py-1.5 border border-border/50">
                        {formatDateSep(msgDate)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-center my-2">
                    <span className="text-xs text-muted-foreground bg-muted/60 rounded-full px-4 py-1.5 border border-border/50">
                      {formatTime(msg.created_at)} · {msg.content}
                    </span>
                  </div>
                </React.Fragment>
              );
            }

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
                className={cn(
                  "flex gap-3 animate-fade-in",
                  isOwn ? "justify-end" : "justify-start"
                )}
              >
                {!isOwn && (
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={senderAvatar} />
                    <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                      {getInitials(senderName)}
                    </AvatarFallback>
                  </Avatar>
                )}

                <div className={cn("max-w-[70%]", isOwn && "order-1")}>
                  <p className={cn(
                    "text-xs font-medium text-muted-foreground mb-1",
                    isOwn ? "text-right" : "text-left"
                  )}>
                    {senderName}
                  </p>

                  <div
                    className={cn(
                      "px-4 py-2 rounded-2xl",
                      isOwn
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-secondary text-foreground rounded-bl-md"
                    )}
                  >
                    {text && <p className="text-sm whitespace-pre-wrap break-words">{text}</p>}
                    {attachments && <MessageAttachment attachments={attachments} />}
                  </div>

                  <div className={cn(
                    "mt-1 flex items-center gap-1 text-[10px] text-muted-foreground",
                    isOwn ? "justify-end" : "justify-start"
                  )}>
                    <span>{formatTime(msg.created_at)}</span>
                    {isOwn && (
                      msg.id.startsWith('temp-') ? (
                        <span className="inline-flex items-center text-muted-foreground" title="Enviando...">
                          <Clock className="w-3.5 h-3.5" strokeWidth={2.5} />
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-muted-foreground">
                          <Check className="w-4 h-4" strokeWidth={2.5} />
                        </span>
                      )
                    )}
                  </div>
                </div>

                {isOwn && (
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={senderAvatar} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {getInitials(senderName)}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
              </React.Fragment>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Messages Panel */}
      {showQuickMessages && (
        <div className="border-t border-border bg-card p-3 max-h-48 overflow-y-auto scrollbar-thin animate-slide-in">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">
              Mensagens Rápidas {quickSearchTerm && <span className="text-muted-foreground">- "{quickSearchTerm}"</span>}
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

      {/* File Preview */}
      <FilePreview 
        files={pendingFiles} 
        onRemove={removePendingFile} 
        uploading={uploading} 
      />

      {/* Input Area */}
      <div className="p-4 border-t border-border bg-card">
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-muted-foreground shrink-0"
                disabled={uploading || loading}
              >
                {uploading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Paperclip className="w-5 h-5" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
                <ImageIcon className="w-4 h-4 mr-2" />
                Foto
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                <Paperclip className="w-4 h-4 mr-2" />
                Arquivo
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Textarea
            value={message}
            onChange={handleMessageChange}
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
            placeholder="Digite / para mensagens rápidas..."
            className="flex-1 input-search min-h-[40px] max-h-[120px] resize-none overflow-y-auto py-2"
            disabled={loading || uploading}
            rows={1}
          />
          <Button 
            onClick={handleSend}
            disabled={(!message.trim() && pendingFiles.length === 0) || loading || uploading || showQuickMessages}
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
