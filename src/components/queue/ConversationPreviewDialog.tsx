import { Clock, Phone, User, ArrowRight, MessageSquare, X, Mic, ImageIcon, Film, FileText, Loader2, Bike } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Conversation, Message } from '@/types';
import { cn } from '@/lib/utils';
import { extractRealPhone, formatPhoneForDisplay, getContactDisplayName, getInstagramDisplayHandle } from '@/lib/phoneUtils';
import { getTagColorClasses } from '@/lib/tagColors';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AudioPlayer } from '@/components/chat/AudioPlayer';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/contexts/AppContext';
import { ImagePreview } from '@/components/chat/ImagePreview';

interface ConversationPreviewDialogProps {
  conversation: Conversation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssume: () => void;
}

// Ícone do Instagram como SVG
const InstagramIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
  </svg>
);

const ChannelIcon = ({ channel }: { channel?: string }) => {
  switch (channel) {
    case 'instagram':
      return (
        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
          <InstagramIcon className="w-3 h-3 text-white" />
        </div>
      );
    case 'machine':
      return (
        <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center">
          <Bike className="w-3 h-3 text-white" />
        </div>
      );
    case 'whatsapp':
    default:
      return (
        <div className="w-5 h-5 rounded-full bg-[#25D366] flex items-center justify-center">
          <MessageSquare className="w-3 h-3 text-white" />
        </div>
      );
  }
};

export function ConversationPreviewDialog({
  conversation,
  open,
  onOpenChange,
  onAssume,
}: ConversationPreviewDialogProps) {
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const [liveWaitTime, setLiveWaitTime] = useState(0);
  const [isMarkingAsRead, setIsMarkingAsRead] = useState(false);
  const [realMessages, setRealMessages] = useState<Message[] | null>(null);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const { refetchConversations } = useApp();

  // Calcular tempo de espera
  const calculateWaitTime = () => {
    const createdAt = conversation.createdAt instanceof Date 
      ? conversation.createdAt 
      : new Date(conversation.createdAt);
    return Math.floor((Date.now() - createdAt.getTime()) / 1000);
  };

  useEffect(() => {
    setLiveWaitTime(calculateWaitTime());
    const interval = setInterval(() => {
      setLiveWaitTime(calculateWaitTime());
    }, 1000);
    return () => clearInterval(interval);
  }, [conversation.createdAt]);

  // Carregar mensagens reais do banco ao abrir o preview
  useEffect(() => {
    if (open && conversation?.id) {
      const fetchRealMessages = async () => {
        setIsLoadingMessages(true);
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conversation.id)
          .order('created_at', { ascending: true });

        if (!error && data) {
          const mapped: Message[] = data.map((m) => ({
            id: m.id,
            conversationId: m.conversation_id,
            senderId: m.sender_id || 'contact',
            senderName: m.sender_name,
            content: m.content,
            type: m.message_type as Message['type'],
            timestamp: new Date(m.created_at),
            read: m.status === 'read',
            status: m.status as Message['status'],
            deleted: m.deleted ?? false,
          }));
          setRealMessages(mapped);
        } else {
          setRealMessages(null);
        }
        setIsLoadingMessages(false);
      };
      fetchRealMessages();
    } else {
      setRealMessages(null);
    }
  }, [open, conversation?.id]);

  // Marcar mensagens como lidas ao abrir o preview
  useEffect(() => {
    if (open && conversation?.id) {
      const markMessagesAsRead = async () => {
        setIsMarkingAsRead(true);
        const { error } = await supabase
          .from('messages')
          .update({ status: 'read' })
          .eq('conversation_id', conversation.id)
          .eq('sender_id', 'contact')
          .neq('status', 'read');
        
        if (!error) {
          refetchConversations();
        }
        setIsMarkingAsRead(false);
      };
      markMessagesAsRead();
    }
  }, [open, conversation?.id, refetchConversations]);

  const scrollViewportRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on open
  const scrollToBottom = useCallback(() => {
    if (scrollViewportRef.current) {
      scrollViewportRef.current.scrollTop = scrollViewportRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    if (open && !isLoadingMessages) {
      setTimeout(scrollToBottom, 100);
    }
  }, [open, isLoadingMessages, scrollToBottom]);

  const formatDateLabel = (date: Date) => {
    if (isToday(date)) return 'Hoje';
    if (isYesterday(date)) return 'Ontem';
    return format(date, 'dd/MM/yyyy', { locale: ptBR });
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatWaitTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}min`;
  };

  const getWaitTimeColor = (seconds: number) => {
    if (seconds < 300) return 'text-success';
    if (seconds < 600) return 'text-warning';
    return 'text-destructive';
  };

  const getChannelLabel = (channel?: string) => {
    switch (channel) {
      case 'instagram':
        return 'Instagram';
      case 'machine':
        return 'Machine';
      case 'whatsapp':
      default:
        return 'WhatsApp';
    }
  };

  const handleAssume = () => {
    onOpenChange(false);
    onAssume();
  };

  // Renderiza o conteúdo da mensagem com suporte a mídias
  const renderMessageContent = (message: Message) => {
    const msgType = message.type as string;
    const mediaTypes = ['audio', 'image', 'video', 'document', 'file'];
    const isMediaType = mediaTypes.includes(msgType);
    
    if (!isMediaType) {
      return <p className="whitespace-pre-wrap break-words">{message.content}</p>;
    }
    
    const content = message.content?.trim() || '';
    const isValidUrl = content.startsWith('http://') || 
                       content.startsWith('https://') || 
                       content.startsWith('blob:');
    
    // Áudio
    if (msgType === 'audio') {
      if (isValidUrl) {
        return <AudioPlayer url={content} className="bg-transparent" />;
      }
      return (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Mic className="w-4 h-4" />
          <span className="text-xs">Mensagem de voz</span>
        </div>
      );
    }
    
    // Imagem
    if (msgType === 'image') {
      if (isValidUrl) {
        return <ImagePreview url={content} alt="Imagem" />;
      }
      return (
        <div className="flex items-center gap-2 text-muted-foreground">
          <ImageIcon className="w-4 h-4" />
          <span className="text-xs">Imagem</span>
        </div>
      );
    }
    
    // Vídeo
    if (msgType === 'video') {
      if (isValidUrl) {
        return (
          <video src={content} controls className="max-w-full max-h-[200px] rounded" />
        );
      }
      return (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Film className="w-4 h-4" />
          <span className="text-xs">Vídeo</span>
        </div>
      );
    }
    
    // Documento/File
    if (msgType === 'document' || msgType === 'file') {
      if (isValidUrl) {
        return (
          <a 
            href={content} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-primary underline"
          >
            <FileText className="w-4 h-4" />
            <span className="text-xs">Abrir documento</span>
          </a>
        );
      }
      return (
        <div className="flex items-center gap-2 text-muted-foreground">
          <FileText className="w-4 h-4" />
          <span className="text-xs">Documento</span>
        </div>
      );
    }
    
    return <p className="whitespace-pre-wrap break-words">{message.content}</p>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader className="border-b border-border pb-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="h-12 w-12">
                <AvatarImage src={conversation.contact.avatar} />
                <AvatarFallback className="bg-secondary text-muted-foreground">
                  {getInitials(conversation.contact.name)}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -right-1">
                <ChannelIcon channel={conversation.channel || conversation.contact.channel} />
              </div>
            </div>

            <div className="flex-1">
              <DialogTitle className="text-lg font-semibold">
                {getContactDisplayName(conversation.contact.name, conversation.contact.phone, conversation.contact.notes)}
              </DialogTitle>
              <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                {(() => {
                  const channel = conversation.channel || conversation.contact.channel;
                  if (channel === 'instagram') {
                    const handle = getInstagramDisplayHandle(conversation.contact.phone, conversation.contact.notes);
                    return handle ? (
                      <span className="flex items-center gap-1">{handle}</span>
                    ) : null;
                  }
                  const realPhone = extractRealPhone(conversation.contact.phone, conversation.contact.notes);
                  const formatted = realPhone ? formatPhoneForDisplay(realPhone) : null;
                  return formatted ? (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {formatted}
                    </span>
                  ) : null;
                })()}
                <span className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                  (conversation.channel || conversation.contact.channel) === 'instagram' 
                    ? "bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-pink-400"
                    : (conversation.channel || conversation.contact.channel) === 'machine'
                      ? "bg-orange-500/20 text-orange-400"
                      : "bg-[#25D366]/20 text-[#25D366]"
                )}>
                  {getChannelLabel(conversation.channel || conversation.contact.channel)}
                </span>
              </div>
            </div>

            <div className="text-right">
              <div className={cn(
                "flex items-center gap-1 text-sm font-medium",
                getWaitTimeColor(liveWaitTime)
              )}>
                <Clock className="w-4 h-4" />
                {formatWaitTime(liveWaitTime)}
              </div>
              {isMarkingAsRead ? (
                <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Marcando como lida...
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">aguardando</span>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Messages */}
        <ScrollArea className="flex-1 min-h-0 max-h-[45vh]" viewportRef={scrollViewportRef}>
          <div className="py-4 px-3 space-y-3">
            {isLoadingMessages ? (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Carregando histórico...</span>
              </div>
            ) : (realMessages || conversation.messages).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma mensagem ainda
              </div>
            ) : (
              (realMessages || conversation.messages).map((message, index, arr) => {
                const isSystemMessage = (message.type as string) === 'system' || message.senderName === 'SYSTEM';
                const isFromContact = !message.senderId || message.senderId === 'contact';
                const messageTime = message.timestamp instanceof Date 
                  ? message.timestamp 
                  : new Date(message.timestamp);

                // Date separator
                const prevMessage = index > 0 ? arr[index - 1] : null;
                const prevTime = prevMessage 
                  ? (prevMessage.timestamp instanceof Date ? prevMessage.timestamp : new Date(prevMessage.timestamp))
                  : null;
                const showDateSeparator = !prevTime || !isSameDay(messageTime, prevTime);

                return (
                  <div key={message.id}>
                    {showDateSeparator && (
                      <div className="flex items-center justify-center my-3">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-[11px] text-muted-foreground bg-background px-3 font-medium">
                          {formatDateLabel(messageTime)}
                        </span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                    )}

                    {isSystemMessage ? (
                      <div className="flex justify-center my-2">
                        <span className="text-xs text-muted-foreground bg-muted/60 rounded-full px-4 py-1.5 border border-border/50">
                          {format(messageTime, 'HH:mm', { locale: ptBR })} · {message.content}
                        </span>
                      </div>
                    ) : (
                      <div className={cn("flex", isFromContact ? "justify-start" : "justify-end")}>
                        <div
                          className={cn(
                            "max-w-[75%] px-3 py-2 rounded-lg text-sm",
                            message.deleted
                              ? "bg-destructive/20 border border-destructive/40"
                              : isFromContact 
                                ? "bg-muted text-foreground rounded-bl-sm" 
                                : "bg-primary text-primary-foreground rounded-br-sm"
                          )}
                        >
                          {!message.deleted && (
                            <p className={cn(
                              "text-xs font-medium mb-1",
                              isFromContact ? "text-muted-foreground" : "opacity-80"
                            )}>
                              {isFromContact 
                                ? getContactDisplayName(conversation.contact.name, conversation.contact.phone, conversation.contact.notes)
                                : message.senderName}
                            </p>
                          )}
                          {message.deleted ? (
                            <p className="text-sm italic text-destructive line-through">
                              🚫 Esta mensagem foi apagada
                            </p>
                          ) : (
                            renderMessageContent(message)
                          )}
                          <p className={cn(
                            "text-[10px] mt-1",
                            isFromContact ? "text-muted-foreground" : "opacity-70"
                          )}>
                            {format(messageTime, 'HH:mm', { locale: ptBR })}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="border-t border-border pt-4 flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            {conversation.tags.map((tag) => (
              <span 
                key={tag}
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full border",
                  getTagColorClasses(tag)
                )}
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              <X className="w-4 h-4 mr-1.5" />
              Fechar
            </Button>
            <Button onClick={handleAssume}>
              <User className="w-4 h-4 mr-1.5" />
              Assumir Atendimento
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
