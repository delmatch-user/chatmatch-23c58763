import { useState, useEffect, useMemo } from 'react';
import { Clock, User, ArrowRight, MessageSquare, Eye, Mic, ImageIcon, Film, FileText, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Conversation, Message } from '@/types';
import { cn } from '@/lib/utils';
import { extractRealPhone, formatPhoneForDisplay, getContactDisplayName, extractInstagramUsername } from '@/lib/phoneUtils';
import { ConversationPreviewDialog } from './ConversationPreviewDialog';

interface QueueCardProps {
  conversation: Conversation;
  onAssume: () => void;
  canPreview?: boolean;
}

// Ícone do Instagram como SVG
const InstagramIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
  </svg>
);

// Componente para o ícone do canal
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
          <Bot className="w-3 h-3 text-white" />
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

export function QueueCard({ conversation, onAssume, canPreview = false }: QueueCardProps) {
  const [showPreview, setShowPreview] = useState(false);

  // Calcula o tempo de espera baseado no createdAt da conversa (persistente)
  const calculateWaitTime = () => {
    const createdAt = conversation.createdAt instanceof Date 
      ? conversation.createdAt 
      : new Date(conversation.createdAt);
    return Math.floor((Date.now() - createdAt.getTime()) / 1000);
  };

  // Estado para tempo de espera em tempo real
  const [liveWaitTime, setLiveWaitTime] = useState(calculateWaitTime);

  // Atualiza o tempo de espera a cada segundo baseado no createdAt
  useEffect(() => {
    // Inicializa com o tempo calculado baseado no createdAt
    setLiveWaitTime(calculateWaitTime());
    
    const interval = setInterval(() => {
      setLiveWaitTime(calculateWaitTime());
    }, 1000);

    return () => clearInterval(interval);
  }, [conversation.createdAt, conversation.id]);

  const getInitials = (name: string) => {
    // Se for número de telefone, pegar últimos 2 dígitos
    const cleaned = name.replace(/\D/g, '');
    if (cleaned.length >= 2 && cleaned.length === name.replace(/[\s\-\(\)\+]/g, '').length) {
      return cleaned.slice(-2);
    }
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

  // Verifica se espera é crítica (>= 5 minutos)
  const isCriticalWait = liveWaitTime >= 300;

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

  // Helper para extrair cidade do franqueado do notes
  const getCidade = (notes?: string) => {
    if (!notes) return null;
    const match = notes.match(/franqueado:(.+?)(\||$)/);
    return match ? match[1] : null;
  };

  const cidade = getCidade(conversation.contact.notes);

  return (
    <div className={cn(
      "p-4 rounded-xl bg-card border transition-all duration-200 card-hover animate-fade-in",
      isCriticalWait 
        ? "border-destructive animate-pulse-border" 
        : "border-border hover:border-primary/50"
    )}>
      <div className="flex items-start gap-3">
        <div className="relative">
          <Avatar className="h-12 w-12">
            <AvatarImage src={conversation.contact.avatar} />
            <AvatarFallback className="bg-secondary text-muted-foreground">
              {getInitials(conversation.contact.name)}
            </AvatarFallback>
          </Avatar>
          {/* Ícone do canal */}
          <div className="absolute -bottom-1 -right-1">
            <ChannelIcon channel={conversation.channel || conversation.contact.channel} />
          </div>
          {(conversation.priority === 'urgent' || isCriticalWait) && (
            <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-destructive flex items-center justify-center">
              <span className="text-[8px] text-destructive-foreground font-bold">!</span>
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-medium text-foreground truncate">{getContactDisplayName(conversation.contact.name, conversation.contact.phone, conversation.contact.notes)}</h3>
            <span className={cn(
              "flex items-center gap-1 text-xs font-medium",
              getWaitTimeColor(liveWaitTime)
            )}>
              <Clock className="w-3 h-3" />
              {formatWaitTime(liveWaitTime)}
            </span>
          </div>

          {/* Subtítulo: telefone para WhatsApp, @handle para Instagram, nada para machine */}
          {(() => {
            const channel = conversation.channel || conversation.contact.channel;
            if (channel === 'machine') return null;
            if (channel === 'instagram') {
              const username = extractInstagramUsername(conversation.contact.notes);
              return username ? (
                <p className="text-sm text-muted-foreground mb-2">@{username}</p>
              ) : null;
            }
            const realPhone = extractRealPhone(conversation.contact.phone, conversation.contact.notes);
            const formatted = realPhone ? formatPhoneForDisplay(realPhone) : null;
            return formatted ? (
              <p className="text-sm text-muted-foreground mb-2">{formatted}</p>
            ) : null;
          })()}

          <div className="flex items-center gap-2 flex-wrap mb-3">
            {/* Badge do canal */}
            <span 
              className={cn(
                "text-xs px-2 py-0.5 rounded-full font-medium",
                (conversation.channel || conversation.contact.channel) === 'instagram' 
                  ? "bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-pink-400"
                  : (conversation.channel || conversation.contact.channel) === 'machine'
                  ? "bg-orange-500/20 text-orange-400"
                  : "bg-[#25D366]/20 text-[#25D366]"
              )}
            >
            {getChannelLabel(conversation.channel || conversation.contact.channel)}
            </span>
            {cidade && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-500/20 text-blue-400">
                📍 {cidade}
              </span>
            )}
            {conversation.tags
              .filter((tag) => !cidade || tag !== cidade)
              .map((tag) => (
              <span 
                key={tag}
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full",
                  tag === 'urgente' && "tag-urgent",
                  tag === 'novo' && "tag-new",
                  tag === 'retorno' && "tag-return"
                )}
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Formatação inteligente da última mensagem */}
          {(() => {
            const lastMsg = conversation.messages[conversation.messages.length - 1];
            if (!lastMsg) return <p className="text-sm text-muted-foreground line-clamp-2 mb-3">Sem mensagens</p>;
            
            const msgType = lastMsg.type as string;
            const mediaLabels: Record<string, { icon: React.ReactNode; label: string }> = {
              audio: { icon: <Mic className="w-3 h-3 inline mr-1" />, label: 'Mensagem de voz' },
              image: { icon: <ImageIcon className="w-3 h-3 inline mr-1" />, label: 'Imagem' },
              video: { icon: <Film className="w-3 h-3 inline mr-1" />, label: 'Vídeo' },
              document: { icon: <FileText className="w-3 h-3 inline mr-1" />, label: 'Documento' },
              file: { icon: <FileText className="w-3 h-3 inline mr-1" />, label: 'Arquivo' },
            };
            
            const mediaInfo = mediaLabels[msgType];
            if (mediaInfo) {
              return (
                <p className="text-sm text-muted-foreground line-clamp-2 mb-3 flex items-center">
                  {mediaInfo.icon}
                  {mediaInfo.label}
                </p>
              );
            }
            
            return <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{lastMsg.content || 'Sem mensagens'}</p>;
          })()}

          <div className="flex gap-1.5 min-w-0">
            {canPreview && (
              <Button 
                variant="outline" 
                onClick={() => setShowPreview(true)} 
                className="flex-1 min-w-0 text-xs h-8 px-2" 
                size="sm"
              >
                <Eye className="w-3.5 h-3.5 shrink-0 mr-1" />
                <span className="truncate">Ver Conversa</span>
              </Button>
            )}
            <Button onClick={onAssume} className={cn("flex-1 min-w-0 text-xs h-8 px-2", !canPreview && "w-full")} size="sm">
              <User className="w-3.5 h-3.5 shrink-0 mr-1" />
              <span className="truncate">Assumir</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Preview Dialog */}
      {canPreview && (
        <ConversationPreviewDialog
          conversation={conversation}
          open={showPreview}
          onOpenChange={setShowPreview}
          onAssume={onAssume}
        />
      )}
    </div>
  );
}
