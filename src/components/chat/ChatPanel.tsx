import React, { useState, useRef, useEffect, useCallback } from 'react';
import { formatWhatsAppText } from '@/lib/whatsappFormat';
import { 
  Send, 
  Paperclip, 
  Smile, 
  Zap, 
  MoreVertical,
  ArrowRightLeft,
  CheckCircle,
  Clock,
  X,
  Image as ImageIcon,
  Loader2,
  Mic,
  Square,
  UserCheck,
  PanelRight,
  Trash2,
  Check,
  CheckCheck,
  AlertCircle,
  WifiOff,
  RefreshCw
} from 'lucide-react';
import EmojiPicker, { Theme } from 'emoji-picker-react';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Conversation, Message, MessageReaction } from '@/types';
import { cn } from '@/lib/utils';
import { extractRealPhone, formatPhoneForDisplay, extractJid, getContactDisplayName, getInstagramDisplayHandle } from '@/lib/phoneUtils';
import { useApp } from '@/contexts/AppContext';
import { TransferDialog } from '@/components/chat/TransferDialog';
import { useConversations } from '@/hooks/useConversations';
import { useFileUpload, UploadedFile } from '@/hooks/useFileUpload';
import { FilePreview } from '@/components/chat/FilePreview';
import { MessageAttachment } from '@/components/chat/MessageAttachment';
import { useWhatsAppSend } from '@/hooks/useWhatsAppSend';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { EditableName } from '@/components/chat/EditableName';
import { useContacts } from '@/hooks/useContacts';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNotificationSound } from '@/hooks/useNotificationSound';

interface ChatPanelProps {
  conversation: Conversation | null;
  showContactDetails?: boolean;
  onToggleContactDetails?: () => void;
}

export function ChatPanel({ conversation, showContactDetails, onToggleContactDetails }: ChatPanelProps) {
  const { user, quickMessages, setSelectedConversation, setConversations, refetchConversations, departments, users, loadConversationMessages } = useApp();
  const [message, setMessage] = useState('');
  const [showQuickMessages, setShowQuickMessages] = useState(false);
  const [quickSearchTerm, setQuickSearchTerm] = useState('');
  const [transferOpen, setTransferOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<UploadedFile[]>([]);
  const [sending, setSending] = useState(false);
  const [isContactTyping, setIsContactTyping] = useState(false);
  const [typingStatus, setTypingStatus] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteMessageId, setDeleteMessageId] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { finalizeConversation, setPendingConversation, loading } = useConversations();
  const { uploadFile, uploading } = useFileUpload();
  const { sendMessage: sendWhatsAppMessage } = useWhatsAppSend();
  const { playSound } = useNotificationSound();
  const { updateContactName } = useContacts();
  const { 
    isRecording, 
    formattedTime, 
    startRecording, 
    stopRecording, 
    cancelRecording 
  } = useAudioRecorder();

  // Handler para atualizar nome do contato
  const handleUpdateContactName = async (newName: string): Promise<boolean> => {
    if (!conversation) return false;
    
    const success = await updateContactName(conversation.contact.id, newName);
    if (success) {
      // Atualizar estado local
      setConversations(prev => prev.map(c => 
        c.contact.id === conversation.contact.id 
          ? { ...c, contact: { ...c.contact, name: newName } }
          : c
      ));
      setSelectedConversation(prev => 
        prev && prev.contact.id === conversation.contact.id
          ? { ...prev, contact: { ...prev.contact, name: newName } }
          : prev
      );
    }
    return success;
  };

  // Qualquer usuário pode ver e assumir conversa atribuída a outro atendente
  const isAdminOrSupervisor = user?.role === 'admin' || user?.role === 'supervisor';
  const isAssignedToOther = conversation?.assignedTo && 
                            conversation.assignedTo !== user?.id &&
                            conversation.status === 'em_atendimento';
  const needsAssume = isAssignedToOther || 
    (conversation?.status === 'em_fila' && conversation?.assignedTo !== user?.id) ||
    (!conversation?.assignedTo && conversation?.status !== 'finalizada');
  const currentAttendant = isAssignedToOther 
    ? users.find(u => u.id === conversation?.assignedTo)
    : null;

  // Lazy-load messages when conversation is selected and history not yet loaded
  useEffect(() => {
    if (conversation && !conversation.historyLoaded) {
      loadConversationMessages(conversation.id);
    }
  }, [conversation?.id, conversation?.historyLoaded, loadConversationMessages]);

  // Scroll to bottom quando mensagens mudam
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages.length]);

  // Realtime para typing indicator
  useEffect(() => {
    if (!conversation) return;

    console.log('[Typing] Inscrevendo para typing da conversa:', conversation.id);

    const typingChannel = supabase
      .channel(`typing-${conversation.id}`)
      .on('broadcast', { event: 'typing' }, (payload) => {
        console.log('[Typing] Evento recebido:', payload);
        const { isTyping, status } = payload.payload;
        
        setIsContactTyping(isTyping);
        setTypingStatus(status);

        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        
        if (isTyping) {
          typingTimeoutRef.current = setTimeout(() => {
            setIsContactTyping(false);
            setTypingStatus(null);
          }, 5000);
        }
      })
      .subscribe((status) => {
        console.log('[Typing] Status da inscrição:', status);
      });

    return () => {
      console.log('[Typing] Removendo canal:', conversation.id);
      supabase.removeChannel(typingChannel);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [conversation?.id]);

  // Realtime para status de conexão WhatsApp
  useEffect(() => {
    if (!conversation) return;
    const isWa = !conversation.channel || conversation.channel === 'whatsapp';
    if (!isWa) {
      setIsDisconnected(false);
      return;
    }

    // Check initial status
    const checkConnection = async () => {
      const { data } = await supabase
        .from('whatsapp_connections')
        .select('status')
        .eq('department_id', conversation.departmentId)
        .in('status', ['connected', 'active'])
        .in('connection_type', ['baileys', 'meta_api'])
        .limit(1)
        .maybeSingle();
      
      if (!data) {
        // Fallback: any active connection
        const { data: any } = await supabase
          .from('whatsapp_connections')
          .select('status')
          .in('status', ['connected', 'active'])
          .in('connection_type', ['baileys', 'meta_api'])
          .limit(1)
          .maybeSingle();
        setIsDisconnected(!any);
      } else {
        setIsDisconnected(false);
      }
    };
    checkConnection();

    const connChannel = supabase
      .channel('wa-conn-status')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_connections' },
        () => { checkConnection(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(connChannel); };
  }, [conversation?.id, conversation?.departmentId, conversation?.channel]);

  const filteredQuickMessages = quickMessages.filter(qm => 
    qm.title.toLowerCase().includes(quickSearchTerm.toLowerCase()) ||
    qm.content.toLowerCase().includes(quickSearchTerm.toLowerCase())
  );

  const [finalizing, setFinalizing] = useState(false);

  const handleFinalize = async () => {
    if (!conversation || !user || finalizing) return;
    setFinalizing(true);
    try {

    // 1. Buscar protocolo da conversa e mensagem customizada
    const [{ data: convProtocol }, { data: customMsgRow }] = await Promise.all([
      supabase.from('conversations').select('protocol').eq('id', conversation.id).single(),
      supabase.from('app_settings').select('value').eq('key', 'auto_finalize_protocol_message').maybeSingle()
    ]);

    const protocol = convProtocol?.protocol;
    const defaultMsg = '📋 *Protocolo de Atendimento*\nSeu número de protocolo é: *{protocolo}*\nGuarde este número para futuras referências.\nAgradecemos pelo contato! 😊';
    const templateMsg = customMsgRow?.value || defaultMsg;

    // 2. Enviar mensagem de protocolo ao cliente antes de finalizar (nunca bloqueia finalização)
    if (protocol) {
      try {
        const protocolMessage = templateMsg.replace(/\\n/g, '\n').replace('{protocolo}', protocol);

        const isMachine = conversation.channel === 'machine' 
          || conversation.contact.channel === 'machine'
          || conversation.contact.notes?.startsWith('machine:');
        const notes = conversation.contact.notes;
        const targetJid = extractJid(notes);
        const realPhone = extractRealPhone(conversation.contact.phone, notes);
        const sendTo = isMachine ? conversation.id : (realPhone || targetJid);

        if (sendTo) {
          const department = departments.find(d => d.id === conversation.departmentId);
          const firstName = user.name.split(' ')[0];
          const senderLabel = user.role === 'franqueado' ? `${firstName} - Franqueado` : `${firstName} - ${department?.name || 'Atendimento'}`;
          const formattedMsg = isMachine ? protocolMessage : `*${senderLabel}*: ${protocolMessage}`;

          const protocolResult = await sendWhatsAppMessage(
            sendTo, formattedMsg, 'text',
            conversation.contact.id, conversation.departmentId,
            undefined, undefined,
            conversation.channel || undefined,
            isMachine ? senderLabel : undefined,
            conversation.whatsappInstanceId
          );
          if (protocolResult.error) {
            throw protocolResult.error;
          }
        }
      } catch (protocolError: any) {
        if (protocolError?.code === 'WINDOW_EXPIRED') {
          console.warn('[ChatPanel] Janela de 24h expirada — protocolo não enviado (esperado)');
        } else {
          console.error('[ChatPanel] Erro ao enviar protocolo (prosseguindo com finalização):', protocolError);
        }
      }
    }

    // 3. Finalizar conversa
    const success = await finalizeConversation(
      conversation.id, 
      conversation, 
      user.id, 
      user.name,
      user.status
    );
    if (success) {
      setConversations(prev => prev.filter(c => c.id !== conversation.id));
      setSelectedConversation(null);
    }
    } finally {
      setFinalizing(false);
    }
  };

  const handlePending = async () => {
    if (!conversation) return;
    const success = await setPendingConversation(conversation.id);
    if (success) {
      setConversations(prev => prev.map(c => 
        c.id === conversation.id ? { ...c, status: 'pendente' } : c
      ));
    }
  };

  const handleAssumeFromRobot = async () => {
    if (!conversation || !user) return;
    
    // Atualizar estado local ANTES para feedback imediato
    const updatedConversation = { 
      ...conversation, 
      assignedToRobot: undefined, 
      assignedTo: user.id, 
      status: 'em_atendimento' as const
    };
    
    setConversations(prev => prev.map(c => 
      c.id === conversation.id ? updatedConversation : c
    ));
    
    setSelectedConversation(updatedConversation);
    
    try {
      const { error } = await supabase
        .from('conversations')
        .update({
          assigned_to_robot: null,
          assigned_to: user.id,
          status: 'em_atendimento',
          robot_lock_until: null,
        })
        .eq('id', conversation.id);

      if (error) throw error;

      // Mensagem de sistema
      await supabase.from('messages').insert({
        conversation_id: conversation.id,
        content: `${user.name} assumiu a conversa`,
        sender_name: 'SYSTEM',
        sender_id: null,
        message_type: 'system',
        status: 'sent',
      });

      // Carregar mensagens após assumir
      await loadConversationMessages(conversation.id);
      
      toast.success('Você assumiu o atendimento desta conversa');
      playSound('takeover');
    } catch (error) {
      console.error('Erro ao assumir conversa:', error);
      toast.error('Erro ao assumir conversa do robô');
      // Reverter em caso de erro
      refetchConversations();
    }
  };

  const handleAssumeFromOtherAgent = async () => {
    if (!conversation || !user) return;
    
    const previousAttendantName = currentAttendant?.name || 'outro atendente';
    
    // Atualizar estado local ANTES para feedback imediato
    const updatedConversation = { 
      ...conversation, 
      assignedTo: user.id
    };
    
    setConversations(prev => prev.map(c => 
      c.id === conversation.id ? updatedConversation : c
    ));
    
    setSelectedConversation(updatedConversation);
    
    try {
      const { error } = await supabase
        .from('conversations')
        .update({
          assigned_to: user.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversation.id);

      if (error) throw error;

      // Mensagem de sistema
      await supabase.from('messages').insert({
        conversation_id: conversation.id,
        content: `${user.name} assumiu a conversa`,
        sender_name: 'SYSTEM',
        sender_id: null,
        message_type: 'system',
        status: 'sent',
      });

      // Carregar mensagens após assumir
      await loadConversationMessages(conversation.id);
      
      toast.success(`Você assumiu a conversa de ${previousAttendantName}`);
      playSound('takeover');
    } catch (error) {
      console.error('Erro ao assumir conversa:', error);
      toast.error('Erro ao assumir conversa');
      // Reverter em caso de erro
      refetchConversations();
    }
  };

  // ====== REENVIAR MENSAGEM FALHA ======
  const handleResendMessage = async (msg: Message) => {
    if (!conversation || !user || sending) return;
    
    // Determinar destino (mesma lógica do handleSend)
    let isMachine = conversation.channel === 'machine' 
      || conversation.contact.channel === 'machine'
      || conversation.contact.notes?.startsWith('machine:');
    
    if (!isMachine && !conversation.channel) {
      try {
        const { data: convData } = await supabase.from('conversations').select('channel').eq('id', conversation.id).single();
        if (convData?.channel === 'machine') isMachine = true;
      } catch {}
    }
    
    const notes = conversation.contact.notes;
    const targetJid = extractJid(notes);
    const realPhone = extractRealPhone(conversation.contact.phone, notes);
    const sendTo = isMachine ? conversation.id : (realPhone || targetJid);
    
    if (!sendTo) {
      toast.error('Contato sem número de telefone ou identificador');
      return;
    }
    
    const department = departments.find(d => d.id === conversation.departmentId);
    const firstName = user.name.split(' ')[0];
    const senderLabel = user.role === 'franqueado' ? `${firstName} - Franqueado` : `${firstName} - ${department?.name || 'Atendimento'}`;
    
    // Determinar tipo e conteúdo
    const msgType = msg.type || 'text';
    let sendContent = msg.content;
    let fileName: string | undefined;
    let mimeType: string | undefined;
    
    if (msgType !== 'text') {
      // Para arquivos/imagens, o content é JSON com url
      try {
        const parsed = JSON.parse(msg.content);
        if (Array.isArray(parsed) && parsed[0]) {
          sendContent = parsed[0].url;
          fileName = parsed[0].name;
          mimeType = parsed[0].type;
        }
      } catch {}
    } else {
      // Para texto, formatar como no envio original
      sendContent = isMachine ? msg.content : `*${senderLabel}*: ${msg.content}`;
    }
    
    // Optimistic: marcar como "sending"
    const updateMsgStatus = (status: string) => {
      setConversations(prev => prev.map(c => 
        c.id === conversation.id 
          ? { ...c, messages: c.messages.map(m => m.id === msg.id ? { ...m, status: status as any } : m) }
          : c
      ));
      setSelectedConversation(prev => 
        prev ? { ...prev, messages: prev.messages.map(m => m.id === msg.id ? { ...m, status: status as any } : m) } : null
      );
    };
    
    updateMsgStatus('sent');
    
    try {
      const result = await sendWhatsAppMessage(
        sendTo, 
        sendContent, 
        msgType, 
        conversation.contact.id, 
        conversation.departmentId,
        fileName,
        mimeType,
        conversation.channel || undefined,
        isMachine ? senderLabel : undefined,
        conversation.whatsappInstanceId
      );
      
      if (result.error) {
        const errCode = (result.error as any)?.code;
        if (errCode === 'DISCONNECTED') {
          setIsDisconnected(true);
          toast.error('WhatsApp desconectado. Reconecte para enviar mensagens.');
        } else {
          toast.error('Falha ao reenviar mensagem');
        }
        updateMsgStatus('failed');
      } else {
        toast.success('Mensagem reenviada com sucesso');
      }
    } catch (err) {
      console.error('[ChatPanel] Erro ao reenviar:', err);
      updateMsgStatus('failed');
      toast.error('Erro ao reenviar mensagem');
    }
  };

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

  if (!conversation) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-background text-muted-foreground">
        <div className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center mb-4">
          <Send className="w-10 h-10 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-2">Nenhuma conversa selecionada</h3>
        <p className="text-sm">Selecione uma conversa para começar o atendimento</p>
      </div>
    );
  }

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  // Helper: canais sem webhook de status recebem 'delivered' direto
  const getDeliveryStatus = (sendSuccess: boolean, channel?: string) => {
    if (!sendSuccess) return null;
    if (channel === 'machine' || channel === 'instagram') return 'delivered';
    return 'sent';
  };

   const handleSend = async () => {
    if ((!message.trim() && pendingFiles.length === 0) || !conversation || !user || sending) return;
    
    // Bloquear envio se WhatsApp desconectado
    const isWhatsApp = !conversation.channel || conversation.channel === 'whatsapp';
    if (isDisconnected && isWhatsApp) {
      toast.error('WhatsApp desconectado. Reconecte para enviar mensagens.');
      return;
    }
    
    setSending(true);

    // Para Machine, o identificador é o próprio conversation.id
    // Detecção robusta: verifica conversation.channel, contact.channel, contact.notes e fallback no banco
    let isMachine = conversation.channel === 'machine' 
      || conversation.contact.channel === 'machine'
      || conversation.contact.notes?.startsWith('machine:');
    
    // Fallback: se canal não detectado localmente, buscar do banco
    if (!isMachine && !conversation.channel) {
      try {
        const { data: convData } = await supabase.from('conversations').select('channel').eq('id', conversation.id).single();
        if (convData?.channel === 'machine') {
          isMachine = true;
          console.log('[ChatPanel] Canal Machine detectado via fallback do banco');
        }
      } catch (e) {
        console.warn('[ChatPanel] Erro ao buscar canal do banco:', e);
      }
    }
    
    const notes = conversation.contact.notes;
    const targetJid = extractJid(notes);
    const realPhone = extractRealPhone(conversation.contact.phone, notes);
    const sendTo = isMachine ? conversation.id : (realPhone || targetJid);
    
    if (!sendTo) {
      toast.error('Contato sem número de telefone ou identificador');
      setSending(false);
      return;
    }

    const currentMessage = message.trim();
    const currentFiles = [...pendingFiles];
    const department = departments.find(d => d.id === conversation.departmentId);
    const firstName = user.name.split(' ')[0];
    const senderLabel = user.role === 'franqueado' ? `${firstName} - Franqueado` : `${firstName} - ${department?.name || 'Atendimento'}`;
    
    // 1. OPTIMISTIC UPDATE: Limpar input e mostrar mensagem IMEDIATAMENTE
    setMessage('');
    setPendingFiles([]);
    
    // Criar mensagens temporárias para exibição instantânea
    const tempMessages: Message[] = [];
    
    // Adicionar arquivos como mensagens temporárias
    for (const file of currentFiles) {
      const fileType = file.type.startsWith('image/') ? 'image' : 
                       file.type.startsWith('audio/') ? 'audio' : 'document';
      tempMessages.push({
        id: `temp-${Date.now()}-${Math.random()}`,
        conversationId: conversation.id,
        senderId: user.id,
        senderName: senderLabel,
        content: JSON.stringify([{ name: file.name, url: file.url, type: file.type, size: file.size }]),
        type: fileType as Message['type'],
        timestamp: new Date(),
        read: false,
        status: 'sent'
      });
    }
    
    // Adicionar texto como mensagem temporária
    if (currentMessage) {
      tempMessages.push({
        id: `temp-${Date.now()}`,
        conversationId: conversation.id,
        senderId: user.id,
        senderName: senderLabel,
        content: currentMessage,
        type: 'text',
        timestamp: new Date(),
        read: false,
        status: 'sent'
      });
    }
    
    // Atualizar UI IMEDIATAMENTE com mensagens temporárias
    if (tempMessages.length > 0) {
      setConversations(prev => prev.map(c => 
        c.id === conversation.id 
          ? { ...c, messages: [...c.messages, ...tempMessages], updatedAt: new Date() }
          : c
      ));
      setSelectedConversation(prev => 
        prev ? { ...prev, messages: [...prev.messages, ...tempMessages], updatedAt: new Date() } : null
      );
    }
    
    // 2. ENVIAR EM BACKGROUND (sem bloquear UI)
    (async () => {
      try {
        // Enviar arquivos em paralelo
        const filePromises = currentFiles.map(async (file) => {
          const fileType = file.type.startsWith('image/') ? 'image' : 
                           file.type.startsWith('audio/') ? 'audio' : 
                           file.type.startsWith('video/') ? 'video' : 'document';
          
          // Enviar ao WhatsApp primeiro para obter o messageId
          const whatsappFileResult = await sendWhatsAppMessage(
            sendTo, 
            file.url, 
            fileType, 
            conversation.contact.id, 
            conversation.departmentId,
            file.name,
            file.type,
            conversation.channel || undefined,
            undefined,
            conversation.whatsappInstanceId
          );
          
          console.log('[ChatPanel] whatsappFileResult.data:', JSON.stringify(whatsappFileResult.data));
          const externalId = whatsappFileResult.data?.messageId || whatsappFileResult.data?.wamid || null;
          console.log('[ChatPanel] file externalId:', externalId);
          
          const fileDeliveryStatus = whatsappFileResult.error 
            ? 'error' 
            : getDeliveryStatus(true, conversation.channel || undefined);
          
          if (whatsappFileResult.error) {
            console.error('[ChatPanel] Erro ao enviar arquivo:', whatsappFileResult.error);
          }
          
          return { 
            result: await supabase.from('messages').insert({
              conversation_id: conversation.id,
              content: JSON.stringify([{ name: file.name, url: file.url, type: file.type, size: file.size }]),
              sender_id: user.id,
              sender_name: senderLabel,
              message_type: fileType,
              status: 'sent',
              delivery_status: fileDeliveryStatus,
              external_id: externalId
            }),
            hadError: !!whatsappFileResult.error
          };
        });

        // Enviar texto
        if (currentMessage) {
          // Para Machine, não formatar com prefixo de atendente (o webhook já cuida disso)
          const formattedMessage = isMachine 
            ? currentMessage 
            : `*${senderLabel}*: ${currentMessage}`;
          
          // Enviar ao WhatsApp primeiro para obter messageId, salvar no banco com external_id
          const [whatsappResult] = await Promise.all([
            sendWhatsAppMessage(sendTo, formattedMessage, 'text', conversation.contact.id, conversation.departmentId, undefined, undefined, conversation.channel || undefined, isMachine ? senderLabel : undefined, conversation.whatsappInstanceId),
            supabase.from('conversations').update({
              last_message_preview: currentMessage.substring(0, 100),
              updated_at: new Date().toISOString()
            }).eq('id', conversation.id)
          ]);
          
          console.log('[ChatPanel] whatsappResult.data:', JSON.stringify(whatsappResult.data));
          console.log('[ChatPanel] whatsappResult.error:', whatsappResult.error);
          const textExternalId = whatsappResult.data?.messageId || whatsappResult.data?.wamid || null;
          console.log('[ChatPanel] textExternalId extraído:', textExternalId);
          
          const textDeliveryStatus = whatsappResult.error 
            ? 'error' 
            : getDeliveryStatus(true, conversation.channel || undefined);
          
          const { data: insertedMsg } = await supabase.from('messages').insert({
            conversation_id: conversation.id,
            content: currentMessage,
            sender_id: user.id,
            sender_name: senderLabel,
            message_type: 'text',
            status: 'sent',
            delivery_status: textDeliveryStatus,
            external_id: textExternalId
          }).select('id').single();
          
          // Fallback: se o external_id não foi salvo no insert, fazer update explícito
          if (textExternalId && insertedMsg?.id) {
            console.log('[ChatPanel] Confirmando external_id via update para msg:', insertedMsg.id);
            await supabase.from('messages')
              .update({ external_id: textExternalId, delivery_status: 'sent' })
              .eq('id', insertedMsg.id);
          }
          
          if (whatsappResult.error) {
            console.error('[ChatPanel] Erro ao enviar:', whatsappResult.error);
            const errCode = (whatsappResult.error as any)?.code;
            const errMsg = whatsappResult.error.message || '';
            const errMsgLower = errMsg.toLowerCase();
            
            // Detectar desconexão real (código explícito ou palavras-chave)
            const isDisconnectionError = errCode === 'DISCONNECTED' || 
              errMsgLower.includes('não está conectado') || 
              errMsgLower.includes('not connected') || 
              errMsgLower.includes('desconectado') ||
              errMsgLower.includes('nenhuma conexão');
            
            if (isDisconnectionError) {
              setIsDisconnected(true);
              toast.error('WhatsApp desconectado. Reconecte para enviar mensagens.');
            } else if (isMachine) {
              if (errMsgLower.includes('requisições') || errMsgLower.includes('rate') || errMsgLower.includes('máximo')) {
                toast.error('Muitas requisições. Tentamos novamente mas não foi possível enviar.');
              } else {
                toast.error(errMsg || 'Erro ao enviar mensagem');
              }
            } else {
              // Mostrar a mensagem real do erro em vez do genérico
              toast.error(errMsg || 'Erro ao enviar mensagem');
            }
            
            // Marcar como failed para QUALQUER erro (não só desconexão)
            const tempIds = tempMessages.filter(m => m.type === 'text').map(m => m.id);
            if (tempIds.length > 0) {
              setConversations(prev => prev.map(c => 
                c.id === conversation.id 
                  ? { ...c, messages: c.messages.map(m => tempIds.includes(m.id) ? { ...m, status: 'failed' as const } : m) }
                  : c
              ));
              setSelectedConversation(prev => 
                prev ? { ...prev, messages: prev.messages.map(m => tempIds.includes(m.id) ? { ...m, status: 'failed' as const } : m) } : null
              );
            }
          }
        }

        const fileResults = await Promise.allSettled(filePromises);
        
        // Marcar msgs de arquivo que falharam (rejected OU com erro de envio WhatsApp)
        const fileTempIds = tempMessages
          .filter(m => m.type !== 'text')
          .map((m, i) => ({ 
            id: m.id, 
            failed: fileResults[i]?.status === 'rejected' || 
                    (fileResults[i]?.status === 'fulfilled' && (fileResults[i] as PromiseFulfilledResult<any>).value?.hadError)
          }));
        
        const failedFileIds = fileTempIds.filter(f => f.failed).map(f => f.id);
        if (failedFileIds.length > 0) {
          setConversations(prev => prev.map(c => 
            c.id === conversation.id 
              ? { ...c, messages: c.messages.map(m => failedFileIds.includes(m.id) ? { ...m, status: 'failed' as const } : m) }
              : c
          ));
          setSelectedConversation(prev => 
            prev ? { ...prev, messages: prev.messages.map(m => failedFileIds.includes(m.id) ? { ...m, status: 'failed' as const } : m) } : null
          );
          toast.error('Falha ao enviar arquivo(s)');
        }
      } catch (err) {
        console.error('[ChatPanel] Erro ao enviar:', err);
      } finally {
        setSending(false);
      }
    })();
  };

  const handleSendAudio = async () => {
    if (!conversation || !user || sending) return;
    
    // Bloquear envio se WhatsApp desconectado
    const isWhatsApp = !conversation.channel || conversation.channel === 'whatsapp';
    if (isDisconnected && isWhatsApp) {
      toast.error('WhatsApp desconectado. Reconecte para enviar mensagens.');
      return;
    }
    
    setSending(true);
    
    // Para Machine, o identificador é o próprio conversation.id
    // Detecção robusta: verifica conversation.channel, contact.channel e contact.notes
    const isMachine = conversation.channel === 'machine' 
      || conversation.contact.channel === 'machine'
      || conversation.contact.notes?.startsWith('machine:');
    const notes = conversation.contact.notes;
    const targetJid = extractJid(notes);
    const realPhone = extractRealPhone(conversation.contact.phone, notes);
    const sendTo = isMachine ? conversation.id : (realPhone || targetJid);
    
    if (!sendTo) {
      toast.error('Contato sem número de telefone ou identificador');
      return;
    }

    const department = departments.find(d => d.id === conversation.departmentId);
    const firstName = user.name.split(' ')[0];
    const senderLabel = user.role === 'franqueado' ? `${firstName} - Franqueado` : `${firstName} - ${department?.name || 'Atendimento'}`;

    try {
      const audioBlob = await stopRecording();
      if (!audioBlob) return;

      // Determinar tipo de mídia - preferir ogg para melhor compatibilidade com WhatsApp
      const mimeType = audioBlob.type || 'audio/ogg; codecs=opus';
      const extension = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'webm';
      const fileName = `audio_${Date.now()}.${extension}`;
      
      // Converter blob para base64 (para envio confiável ao Baileys)
      const base64Promise = new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(audioBlob);
      });
      const base64Audio = await base64Promise;
      
      // Upload audio para storage (para exibição local e persistência)
      const file = new File([audioBlob], fileName, { type: mimeType });
      const uploaded = await uploadFile(file, user.id);
      
      if (!uploaded) {
        toast.error('Erro ao fazer upload do áudio');
        return;
      }

      // OPTIMISTIC UPDATE: Mostrar mensagem imediatamente
      const tempMessage: Message = {
        id: `temp-audio-${Date.now()}`,
        conversationId: conversation.id,
        senderId: user.id,
        senderName: senderLabel,
        content: JSON.stringify([{ name: fileName, url: uploaded.url, type: mimeType }]),
        type: 'audio',
        timestamp: new Date(),
        read: false,
        status: 'sent'
      };

      setConversations(prev => prev.map(c => 
        c.id === conversation.id 
          ? { ...c, messages: [...c.messages, tempMessage], updatedAt: new Date() }
          : c
      ));
      setSelectedConversation(prev => 
        prev ? { ...prev, messages: [...prev.messages, tempMessage], updatedAt: new Date() } : null
      );

      // Enviar em BACKGROUND - usar base64 para envio mais confiável
      // O base64 vai diretamente ao servidor sem precisar de download
      try {
        const [whatsappResult] = await Promise.all([
          sendWhatsAppMessage(sendTo, base64Audio, 'audio', conversation.contact.id, conversation.departmentId, fileName, mimeType, conversation.channel || undefined, undefined, conversation.whatsappInstanceId),
          supabase.from('conversations').update({
            last_message_preview: '🎤 Mensagem de voz',
            updated_at: new Date().toISOString()
          }).eq('id', conversation.id)
        ]);
        
        console.log('[ChatPanel] audio whatsappResult.data:', JSON.stringify(whatsappResult?.data));
        const audioExternalId = whatsappResult?.data?.messageId || whatsappResult?.data?.wamid || null;
        console.log('[ChatPanel] audioExternalId:', audioExternalId);
        
        const audioDeliveryStatus = getDeliveryStatus(!whatsappResult?.error, conversation.channel || undefined);
        
        const { data: insertedAudioMsg } = await supabase.from('messages').insert({
          conversation_id: conversation.id,
          content: JSON.stringify([{ name: fileName, url: uploaded.url, type: mimeType }]),
          sender_id: user.id,
          sender_name: senderLabel,
          message_type: 'audio',
          status: 'sent',
          delivery_status: audioDeliveryStatus,
          external_id: audioExternalId
        }).select('id').single();
        
        // Fallback: update explícito
        if (audioExternalId && insertedAudioMsg?.id) {
          console.log('[ChatPanel] Confirmando audio external_id via update:', insertedAudioMsg.id);
          await supabase.from('messages')
            .update({ external_id: audioExternalId, delivery_status: 'sent' })
            .eq('id', insertedAudioMsg.id);
        }

        if (whatsappResult?.error) {
          console.error('[ChatPanel] Erro ao enviar áudio no WhatsApp:', whatsappResult.error);
          toast.error('Erro ao enviar áudio para o WhatsApp');
        }
      } catch (err) {
        console.error('[ChatPanel] Erro ao enviar áudio:', err);
        toast.error('Erro ao enviar áudio para o WhatsApp');
      }
    } catch (err) {
      console.error('[ChatPanel] Erro ao enviar áudio:', err);
      toast.error('Erro ao enviar áudio');
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!showQuickMessages) {
        handleSend();
      }
    }
    if (e.key === 'Escape' && showQuickMessages) {
      setShowQuickMessages(false);
      setQuickSearchTerm('');
      setMessage('');
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

  const handleEmojiClick = (emojiData: { emoji: string }) => {
    setMessage(prev => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  const parseAttachments = (msg: Message) => {
    const content = msg.content?.trim() || '';
    const msgType = msg.type as string; // Cast para string pois o banco pode ter tipos extras
    
    // Contatos (vCards) - renderizar inline
    if (msgType === 'contact') {
      return null; // Tratado separadamente na renderização
    }
    
    // Mapeamentos de tipos
    const mediaTypes = ['audio', 'image', 'video', 'document', 'file', 'story_mention'];
    const typeToMime: Record<string, string> = {
      audio: 'audio/ogg',
      image: 'image/jpeg',
      video: 'video/mp4',
      document: 'application/octet-stream',
      file: 'application/octet-stream',
      story_mention: 'image/jpeg'
    };
    const typeToName: Record<string, string> = {
      audio: 'Mensagem de voz',
      image: 'Imagem',
      video: 'Vídeo',
      document: 'Documento',
      file: 'Documento',
      story_mention: 'Menção no Story'
    };
    
    // 1. Tentar parsear JSON - array ou objeto único
    if (content.startsWith('[{"') || content.startsWith('{"')) {
      try {
        const parsed = JSON.parse(content);
        // Se for array, retornar diretamente; se objeto, transformar em array
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        // JSON inválido, continuar para outros métodos
      }
    }
    
    // 2. Verificar se é URL direta para tipos de mídia
    if (mediaTypes.includes(msgType)) {
      const isValidUrl = content.startsWith('http://') || 
                         content.startsWith('https://') || 
                         content.startsWith('blob:');
      
      if (isValidUrl) {
        // Detectar MIME type pela URL
        let mimeType = typeToMime[msgType] || 'application/octet-stream';
        const lowerContent = content.toLowerCase();
        
        if (msgType === 'audio') {
          if (lowerContent.includes('.ogg') || lowerContent.includes('ogg') || lowerContent.includes('opus')) {
            mimeType = 'audio/ogg';
          } else if (lowerContent.includes('.mp3')) {
            mimeType = 'audio/mpeg';
          } else if (lowerContent.includes('.m4a') || lowerContent.includes('.mp4')) {
            mimeType = 'audio/mp4';
          } else if (lowerContent.includes('.webm')) {
            mimeType = 'audio/webm';
          } else if (lowerContent.includes('.wav')) {
            mimeType = 'audio/wav';
          }
        } else if (msgType === 'image') {
          if (lowerContent.includes('.png')) mimeType = 'image/png';
          else if (lowerContent.includes('.webp')) mimeType = 'image/webp';
          else if (lowerContent.includes('.gif')) mimeType = 'image/gif';
        } else if (msgType === 'video') {
          if (lowerContent.includes('.webm')) mimeType = 'video/webm';
          else if (lowerContent.includes('.mov')) mimeType = 'video/quicktime';
        }
        
        return [{
          name: typeToName[msgType] || 'Mídia',
          url: content,
          type: mimeType
        }];
      }
      
      // 3. Mídia sem URL válida - placeholder
      if (!content || content === '[Mídia não disponível]') {
        return [{
          name: typeToName[msgType] || 'Mídia',
          url: '',
          type: typeToMime[msgType] || 'application/octet-stream'
        }];
      }
    }
    
    return null;
  };

  const renderContactCard = (msg: Message) => {
    try {
      const parsed = JSON.parse(msg.content);
      const contacts = Array.isArray(parsed) ? parsed : [parsed];
      return (
        <div className="space-y-2">
          {contacts.map((contact: { displayName?: string; phoneNumber?: string }, idx: number) => (
            <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-background/50">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm">
                👤
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{contact.displayName || 'Contato'}</p>
                {contact.phoneNumber && (
                  <p className="text-xs text-muted-foreground">{formatPhoneForDisplay(contact.phoneNumber)}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      );
    } catch {
      return <p className="text-sm">👤 Contato compartilhado</p>;
    }
  };

  const openDeleteDialog = (messageId: string) => {
    setDeleteMessageId(messageId);
    setDeleteReason('');
    setDeleteDialogOpen(true);
  };

  const handleDeleteMessage = async () => {
    if (!deleteMessageId || !user || !conversation || deleteReason.trim().length < 5) return;
    
    setDeleting(true);
    
    // Encontrar a mensagem original para salvar no log
    const originalMessage = conversation.messages.find(m => m.id === deleteMessageId);
    
    try {
      // 1. Salvar log de exclusão
      await supabase.from('message_deletion_logs' as any).insert({
        message_id: deleteMessageId,
        conversation_id: conversation.id,
        deleted_by: user.id,
        deleted_by_name: user.name,
        reason: deleteReason.trim(),
        message_content: originalMessage?.content || null,
        message_sender_name: originalMessage?.senderName || null,
        message_created_at: originalMessage?.timestamp?.toISOString() || null,
        contact_name: conversation.contact.name,
        contact_phone: conversation.contact.phone || null,
      });

      // 2. Optimistic update
      setConversations(prev => prev.map(c => ({
        ...c,
        messages: c.messages.map(m => m.id === deleteMessageId ? { ...m, deleted: true } : m)
      })));
      setSelectedConversation(prev => prev ? {
        ...prev,
        messages: prev.messages.map(m => m.id === deleteMessageId ? { ...m, deleted: true } : m)
      } : null);

      // 3. Persistir no banco
      const { error } = await supabase.from('messages').update({ deleted: true }).eq('id', deleteMessageId);
      if (error) {
        console.error('Erro ao apagar mensagem:', error);
        toast.error('Erro ao apagar mensagem');
        refetchConversations();
      } else {
        toast.success('Mensagem apagada com sucesso');
      }
    } catch (err) {
      console.error('Erro ao registrar exclusão:', err);
      toast.error('Erro ao apagar mensagem');
      refetchConversations();
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setDeleteMessageId(null);
      setDeleteReason('');
    }
  };

  const hasContent = message.trim() || pendingFiles.length > 0;
  const isWhatsAppChannel = !conversation?.channel || conversation.channel === 'whatsapp';

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
      <div className="px-4 py-3 flex flex-col gap-2 border-b border-border bg-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={conversation.contact.avatar} />
              <AvatarFallback className="bg-muted text-muted-foreground">
                {getInitials(getContactDisplayName(conversation.contact.name, conversation.contact.phone, conversation.contact.notes))}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <EditableName
                  value={getContactDisplayName(conversation.contact.name, conversation.contact.phone, conversation.contact.notes)}
                  onSave={handleUpdateContactName}
                  className="font-medium text-foreground"
                  inputClassName="w-32 sm:w-48"
                />
              </div>
              {isContactTyping ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-primary font-medium">
                    {typingStatus === 'recording' ? 'Gravando áudio' : 'Digitando'}
                  </span>
                  <span className="flex gap-0.5">
                    <span className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground">
                    {(() => {
                      const channel = conversation.channel || conversation.contact.channel;
                      if (channel === 'instagram') {
                        return getInstagramDisplayHandle(conversation.contact.phone, conversation.contact.notes) || 'Instagram';
                      }
                      return formatPhoneForDisplay(extractRealPhone(conversation.contact.phone, conversation.contact.notes));
                    })()}
                  </p>
                  {(conversation as any).protocol && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      📋 {(conversation as any).protocol}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleFinalize}
              disabled={loading || finalizing}
              className="text-primary border-primary hover:bg-primary hover:text-primary-foreground"
            >
              <CheckCircle className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Finalizar Conversa</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="cursor-pointer"
                  onSelect={(e) => {
                    e.preventDefault();
                    setTransferOpen(true);
                  }}
                >
                  <ArrowRightLeft className="w-4 h-4 mr-2" />
                  Transferir
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className="cursor-pointer"
                  onSelect={handlePending}
                  disabled={loading}
                >
                  <Clock className="w-4 h-4 mr-2" />
                  Marcar como Pendente
                </DropdownMenuItem>
                {conversation.assignedToRobot ? (
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onSelect={handleAssumeFromRobot}
                  >
                    <UserCheck className="w-4 h-4 mr-2" />
                    Assumir Atendimento
                  </DropdownMenuItem>
                ) : needsAssume ? (
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onSelect={handleAssumeFromOtherAgent}
                  >
                    <UserCheck className="w-4 h-4 mr-2" />
                    Assumir Atendimento
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  className="cursor-pointer"
                  onSelect={() => {
                    if (conversation) {
                      loadConversationMessages(conversation.id);
                      toast.success('Histórico recarregado');
                    }
                  }}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Recarregar histórico
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {onToggleContactDetails && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onToggleContactDetails}
                title={showContactDetails ? "Ocultar detalhes" : "Mostrar detalhes"}
                className="text-muted-foreground hidden xl:flex"
              >
                <PanelRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Banner: Conversa atendida por robô */}
        {conversation.assignedToRobot && (() => {
          const robotName = conversation.messages
            .filter(m => m.senderId === 'robot' || m.senderName?.includes('[ROBOT]'))
            .map(m => m.senderName?.replace('[ROBOT]', '').replace('(IA)', '').trim())
            .filter(Boolean)
            .pop() || 'Robô';
          return (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-accent/50 border border-accent rounded-lg">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-accent-foreground shrink-0" />
                <span className="text-sm text-accent-foreground">
                  Atendente atual: <strong>{robotName}</strong>
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAssumeFromRobot}
                className="h-7 text-xs border-accent-foreground/30 hover:bg-accent"
              >
                <UserCheck className="w-3 h-3 mr-1" />
                <span className="hidden sm:inline">Assumir Atendimento</span>
                <span className="sm:hidden">Assumir</span>
              </Button>
            </div>
          );
        })()}

        {/* Banner: Conversa de outro atendente */}
        {isAssignedToOther && currentAttendant && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-accent/50 border border-accent rounded-lg">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-accent-foreground shrink-0" />
              <span className="text-sm text-accent-foreground">
                Atendente atual: <strong>{currentAttendant.name}</strong>
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAssumeFromOtherAgent}
              className="h-7 text-xs border-accent-foreground/30 hover:bg-accent"
            >
              <UserCheck className="w-3 h-3 mr-1" />
              <span className="hidden sm:inline">Assumir Atendimento</span>
              <span className="sm:hidden">Assumir</span>
            </Button>
          </div>
        )}

        {/* Banner: WhatsApp desconectado */}
        {isDisconnected && (!conversation.channel || conversation.channel === 'whatsapp') && (
          <div className="flex items-center gap-3 px-4 py-3 bg-destructive/15 border border-destructive/40 rounded-lg shadow-sm">
            <div className="relative shrink-0">
              <WifiOff className="w-5 h-5 text-destructive" />
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-destructive rounded-full animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-destructive">
                WhatsApp desconectado
              </p>
              <p className="text-xs text-destructive/70">
                Reconecte na página de integrações para enviar mensagens.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 h-7 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => window.open('/admin/integrations', '_blank')}
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Reconectar
            </Button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
        {conversation.messages.map((msg, msgIndex, msgArr) => {
          // Date separator logic
          const msgDate = new Date(msg.timestamp);
          const prevMsg = msgIndex > 0 ? msgArr[msgIndex - 1] : null;
          const prevDate = prevMsg ? new Date(prevMsg.timestamp) : null;
          const showDateSeparator = !prevDate || msgDate.toDateString() !== prevDate.toDateString();
          const formatDateSep = (d: Date) => {
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            if (d.toDateString() === today.toDateString()) return 'Hoje';
            if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
            return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
          };

          const dateSeparatorEl = showDateSeparator ? (
            <div className="flex justify-center my-2" key={`date-sep-${msg.id}`}>
              <span className="text-xs text-muted-foreground bg-muted/60 rounded-full px-4 py-1.5 border border-border/50">
                {formatDateSep(msgDate)}
              </span>
            </div>
          ) : null;
          // Mensagens do agente: qualquer atendente do sistema, ID '1', ou robô (identificado por [ROBOT] ou (IA))
          const isRobotMessage = msg.senderName?.includes('[ROBOT]') || msg.senderName?.includes('(IA)') || msg.senderId === 'robot';
          // Verificar se o remetente é um atendente registrado no sistema
          const isFromSystemAgent = users.some(u => u.id === msg.senderId);
          const isOwn = isFromSystemAgent || msg.senderId === '1' || isRobotMessage;
          // Remover marcadores internos do nome exibido
          const cleanSenderName = msg.senderName?.replace(' [ROBOT]', '').replace(' (IA)', '') || '';
          
          // Determinar nome do remetente com "Nome - Departamento" para atendentes
          let senderName: string;
          if (!isOwn) {
            // Mensagem do contato
            senderName = getContactDisplayName(
              conversation.contact.name,
              conversation.contact.phone,
              conversation.contact.notes
            );
          } else if (isRobotMessage) {
            // Mensagem do robô - usar nome limpo
            senderName = cleanSenderName || 'Robô';
          } else {
            // Mensagem de atendente - buscar usuário e departamento
            const senderUser = users.find(u => u.id === msg.senderId);
            const senderDept = departments.find(d => senderUser?.departments?.includes(d.id));
            
            if (senderUser) {
              const firstName = senderUser.name.split(' ')[0];
              senderName = senderDept 
                ? `${firstName} - ${senderDept.name}` 
                : firstName;
            } else {
              // Fallback: usar nome do usuário logado se for a própria mensagem
              const currentUserDept = departments.find(d => user?.departments?.includes(d.id));
              const firstName = user?.name?.split(' ')[0] || 'Atendente';
              senderName = currentUserDept 
                ? `${firstName} - ${currentUserDept.name}` 
                : firstName;
            }
          }
          
          const senderAvatar = isOwn && !isRobotMessage ? (user?.avatar || undefined) : (!isOwn ? conversation.contact.avatar : undefined);
          const attachments = parseAttachments(msg);

          // Renderizar mensagem de sistema centralizada
          if ((msg.type as string) === 'system' || msg.senderName === 'SYSTEM') {
            return (
              <React.Fragment key={msg.id}>
                {dateSeparatorEl}
                <div className="flex justify-center my-2">
                  <span className="text-xs text-muted-foreground bg-muted/60 rounded-full px-4 py-1.5 border border-border/50">
                    {formatTime(msg.timestamp)} · {msg.content}
                  </span>
                </div>
              </React.Fragment>
            );
          }

          return (
            <React.Fragment key={msg.id}>
              {dateSeparatorEl}
              <div
              className={cn(
                "flex gap-3 animate-fade-in group",
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
                    msg.deleted
                      ? "bg-destructive/20 border border-destructive/40"
                      : isOwn
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-secondary text-foreground rounded-bl-md"
                  )}
                >
                  {msg.deleted ? (
                    <p className="text-sm italic text-destructive line-through">
                      🚫 Esta mensagem foi apagada
                    </p>
                  ) : (msg.type as string) === 'contact' ? (
                    renderContactCard(msg)
                  ) : attachments ? (
                    <MessageAttachment attachments={attachments} messageId={msg.id} />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                  )}
                </div>

                {/* Reactions */}
                {msg.reactions && msg.reactions.length > 0 && (
                  <div className={cn(
                    "flex flex-wrap gap-1 mt-1",
                    isOwn && "justify-end"
                  )}>
                    {msg.reactions.map((reaction, idx) => (
                      <span 
                        key={idx} 
                        className="text-sm bg-muted/50 rounded-full px-2 py-0.5 border border-border"
                        title={reaction.senderPhone || 'Contato'}
                      >
                        {reaction.emoji}
                      </span>
                    ))}
                  </div>
                )}

                <div className={cn(
                  "flex items-center gap-1 mt-1 text-[10px] text-muted-foreground",
                  isOwn && "justify-end"
                )}>
                  <span>{formatTime(msg.timestamp)}</span>
                  {isOwn && !msg.deleted && (
                    <>
                      {msg.status === 'failed' ? (
                        <span className="inline-flex items-center gap-1 text-destructive" title="Mensagem não enviada – clique para reenviar">
                          <AlertCircle className="w-3.5 h-3.5" strokeWidth={2.5} />
                          <button
                            onClick={() => handleResendMessage(msg)}
                            className="text-[10px] font-medium underline underline-offset-2 hover:text-destructive/80 transition-colors cursor-pointer"
                          >
                            Reenviar
                          </button>
                        </span>
                      ) : msg.id.startsWith('temp-') ? (
                        <span className="inline-flex items-center text-muted-foreground" title="Enviando...">
                          <Clock className="w-3.5 h-3.5" strokeWidth={2.5} />
                        </span>
                      ) : (
                        <span className={cn(
                          "inline-flex items-center",
                          msg.status === 'read' ? "text-blue-500" : "text-muted-foreground"
                        )}>
                          {msg.status === 'delivered' || msg.status === 'read' ? (
                            <CheckCheck className="w-4 h-4" strokeWidth={3} />
                          ) : (
                            <Check className="w-4 h-4" strokeWidth={3} />
                          )}
                        </span>
                      )}
                    </>
                  )}
                  {isOwn && !msg.deleted && !msg.id.startsWith('temp-') && conversation.channel !== 'machine' && conversation.channel !== 'instagram' && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="ml-1 opacity-0 group-hover:opacity-100 hover:opacity-100 focus:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-[160px]">
                        <DropdownMenuItem
                          className="text-destructive cursor-pointer"
                          onSelect={() => openDeleteDialog(msg.id)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Apagar mensagem
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>

              {isOwn && (
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarImage src={senderAvatar} />
                  <AvatarFallback className={cn(
                    "text-xs",
                    isRobotMessage 
                      ? "bg-green-600 text-white" 
                      : "bg-primary text-primary-foreground"
                  )}>
                    {getInitials(senderName)}
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
            </React.Fragment>
          );
        })}
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
        {needsAssume ? (
          <div className="flex items-center justify-center gap-3 py-2">
            <span className="text-sm text-muted-foreground">Assuma o atendimento para enviar mensagens</span>
            <Button 
              size="sm"
              onClick={isAssignedToOther ? handleAssumeFromOtherAgent : handleAssumeFromRobot}
            >
              <UserCheck className="w-4 h-4 mr-2" />
              Assumir Atendimento
            </Button>
          </div>
        ) : isRecording ? (
          // Recording UI
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-destructive shrink-0"
              onClick={cancelRecording}
            >
              <X className="w-5 h-5" />
            </Button>
            
            <div className="flex-1 flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-destructive rounded-full animate-pulse" />
                <span className="text-sm font-medium text-foreground">{formattedTime}</span>
              </div>
              <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-destructive rounded-full animate-pulse" style={{ width: '100%' }} />
              </div>
            </div>
            
            <Button 
              size="icon" 
              onClick={handleSendAudio}
              disabled={sending}
              className="shrink-0 bg-destructive hover:bg-destructive/90"
            >
              {sending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </Button>
          </div>
        ) : (
          // Normal input UI
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-muted-foreground shrink-0"
                  disabled={uploading}
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
            
            <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="text-muted-foreground shrink-0">
                  <Smile className="w-5 h-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 border-0" align="start" side="top">
                <EmojiPicker 
                  onEmojiClick={handleEmojiClick}
                  theme={Theme.DARK}
                  width={320}
                  height={400}
                />
              </PopoverContent>
            </Popover>

            <Button 
              variant="ghost" 
              size="icon" 
              className={cn(
                "text-muted-foreground shrink-0",
                showQuickMessages && "text-primary"
              )}
              onClick={() => setShowQuickMessages(!showQuickMessages)}
            >
              <Zap className="w-5 h-5" />
            </Button>
            
            <Textarea
              value={message}
              onChange={handleMessageChange}
              onKeyDown={handleKeyPress}
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
              disabled={uploading}
              rows={1}
            />
            
            {hasContent ? (
              <Button 
                size="icon" 
                onClick={handleSend}
                disabled={uploading || sending}
                className="shrink-0"
              >
                {sending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </Button>
            ) : (
              isWhatsAppChannel ? (
                <Button 
                  size="icon" 
                  variant="ghost"
                  onClick={startRecording}
                  disabled={uploading}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <Mic className="w-5 h-5" />
                </Button>
              ) : (
                <Button 
                  size="icon" 
                  onClick={handleSend}
                  disabled={uploading || sending}
                  className="shrink-0"
                >
                  <Send className="w-5 h-5" />
                </Button>
              )
            )}
          </div>
        )}
      </div>

      <TransferDialog open={transferOpen} onOpenChange={setTransferOpen} conversation={conversation} />

      {/* Delete Reason Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setDeleteDialogOpen(false);
          setDeleteMessageId(null);
          setDeleteReason('');
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar mensagem</AlertDialogTitle>
            <AlertDialogDescription>
              Informe o motivo da exclusão desta mensagem. Este registro será salvo para auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Motivo da exclusão (mínimo 5 caracteres)..."
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
            className="min-h-[80px]"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleDeleteMessage}
              disabled={deleteReason.trim().length < 5 || deleting}
            >
              {deleting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Apagando...</>
              ) : (
                <><Trash2 className="w-4 h-4 mr-2" /> Confirmar exclusão</>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
