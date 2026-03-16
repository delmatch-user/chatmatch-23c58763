import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Clock, Users, AlertTriangle, MessageSquare, Timer, Bike } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { QueueCard } from '@/components/queue/QueueCard';
import { Button } from '@/components/ui/button';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
// Ícone do Instagram como SVG
const InstagramIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
  </svg>
);

export default function Queue() {
  const navigate = useNavigate();
  const { conversations, setConversations, setSelectedConversation, departments, user, refetchConversations } = useApp();
  const { user: authUser } = useAuth();
  const { playSound } = useNotificationSound();
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [selectedChannel, setSelectedChannel] = useState<string>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [avgWaitTime, setAvgWaitTime] = useState(0);
  const [avgServiceTime, setAvgServiceTime] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  // Tick para atualizar urgência/ordenação em tempo real (sem depender de refetch)
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Polling de 5s para buscar última mensagem das conversas na fila (fallback do realtime)
  useEffect(() => {
    const pollQueuePreviews = async () => {
      const queueIds = conversations
        .filter(c => c.status === 'em_fila')
        .map(c => c.id);
      
      if (queueIds.length === 0) return;

      // Buscar última mensagem de cada conversa na fila
      const { data, error } = await supabase
        .from('messages')
        .select('id, conversation_id, content, message_type, sender_name, sender_id, created_at, status, deleted')
        .in('conversation_id', queueIds)
        .order('created_at', { ascending: false });

      if (error || !data) return;

      // Agrupar: pegar apenas a última mensagem por conversa
      const latestByConv = new Map<string, typeof data[0]>();
      for (const msg of data) {
        if (!latestByConv.has(msg.conversation_id)) {
          latestByConv.set(msg.conversation_id, msg);
        }
      }

      if (latestByConv.size === 0) return;

      setConversations(prev => prev.map(conv => {
        const latestMsg = latestByConv.get(conv.id);
        if (!latestMsg) return conv;
        
        // Só atualizar se a mensagem é diferente da atual
        const currentLastMsg = conv.messages[conv.messages.length - 1];
        if (currentLastMsg && currentLastMsg.id === latestMsg.id) return conv;

        const isRobotMessage = latestMsg.sender_name?.includes('[ROBOT]') || latestMsg.sender_name?.includes('(IA)');
        const newMessage = {
          id: latestMsg.id,
          conversationId: latestMsg.conversation_id,
          senderId: latestMsg.sender_id || (isRobotMessage ? 'robot' : 'contact'),
          senderName: latestMsg.sender_name,
          content: latestMsg.content,
          type: latestMsg.message_type as 'text' | 'image' | 'audio' | 'file',
          timestamp: new Date(latestMsg.created_at),
          read: latestMsg.status === 'read',
          status: latestMsg.status as 'sent' | 'delivered' | 'read',
          deleted: latestMsg.deleted || false,
        };

        // Se só temos preview sintético, substituir; senão, adicionar/atualizar
        const hasOnlySynthetic = conv.messages.every(m => m.id.startsWith('preview-'));
        return {
          ...conv,
          messages: hasOnlySynthetic ? [newMessage] : [...conv.messages.filter(m => m.id !== latestMsg.id), newMessage],
        };
      }));
    };

    const interval = setInterval(pollQueuePreviews, 5000);
    // Primeira execução imediata
    pollQueuePreviews();
    return () => clearInterval(interval);
  }, [conversations.filter(c => c.status === 'em_fila').map(c => c.id).join(',')]);

  // Atualizar timestamp quando conversations mudar
  useEffect(() => {
    setLastUpdate(new Date());
  }, [conversations]);

  // Buscar métricas de tempo do usuário logado
  useEffect(() => {
    if (!authUser?.id) return;

    const fetchMetrics = async () => {
      const { data, error } = await supabase
        .from('conversation_logs')
        .select('wait_time, started_at, finalized_at')
        .eq('finalized_by', authUser.id)
        .eq('agent_status_at_finalization', 'online');

      if (!error && data && data.length > 0) {
        // Tempo Médio de Espera (wait_time - tempo na fila antes de assumir)
        // Excluir tempos > 1 hora (3600s) que indicam acúmulo noturno/offline
        const logsWithWaitTime = data.filter(log => log.wait_time !== null && log.wait_time > 0 && log.wait_time < 3600);
        if (logsWithWaitTime.length > 0) {
          const totalWaitTime = logsWithWaitTime.reduce((acc, log) => acc + (log.wait_time || 0), 0);
          setAvgWaitTime(Math.round(totalWaitTime / logsWithWaitTime.length));
        } else {
          setAvgWaitTime(0);
        }

        // Tempo Médio de Atendimento (finalized_at - started_at)
        // Excluir tempos > 1 hora (3600s) que indicam acúmulo noturno/offline
        const logsWithDates = data.filter(log => {
          if (!log.started_at || !log.finalized_at) return false;
          const serviceSeconds = (new Date(log.finalized_at).getTime() - new Date(log.started_at).getTime()) / 1000;
          return serviceSeconds > 0 && serviceSeconds < 3600;
        });
        if (logsWithDates.length > 0) {
          const totalServiceTime = logsWithDates.reduce((acc, log) => {
            const start = new Date(log.started_at!).getTime();
            const end = new Date(log.finalized_at!).getTime();
            return acc + (end - start) / 1000;
          }, 0);
          setAvgServiceTime(Math.round(totalServiceTime / logsWithDates.length));
        } else {
          setAvgServiceTime(0);
        }
      } else {
        setAvgWaitTime(0);
        setAvgServiceTime(0);
      }
    };

    fetchMetrics();
  }, [authUser?.id]);

  // Atualizar timestamp quando conversations mudar (via AppContext realtime)
  // O AppContext já gerencia realtime + polling de fallback global

  // Departamentos do usuário
  const userDepartments = user?.departments || [];
  
  // Apenas admins têm acesso global na fila
  // Supervisores veem apenas conversas dos departamentos deles
  // Atendentes veem apenas conversas dos departamentos deles (e assumem individualmente)
  const userHasGlobalAccess = user?.role === 'admin';

  // Todos os atendentes autenticados podem ver preview
  const userCanPreview = true;

  const getQueueWaitTimeSeconds = (conv: any) => {
    const createdAt =
      conv?.createdAt instanceof Date ? conv.createdAt : new Date(conv?.createdAt);
    const diff = Math.floor((now - createdAt.getTime()) / 1000);
    return Number.isFinite(diff) ? Math.max(0, diff) : 0;
  };

  // Filter conversations in queue that user has access to
  const queueConversations = conversations
    .filter(
      conv => conv.status === 'em_fila' && 
      (selectedDepartment === 'all' || conv.departmentId === selectedDepartment) &&
      (selectedChannel === 'all' || conv.channel === selectedChannel || conv.contact.channel === selectedChannel) &&
      (conv.assignedTo
        ? (conv.assignedTo === user?.id || userHasGlobalAccess)
        : (userHasGlobalAccess || userDepartments.includes(conv.departmentId))
      )
    )
    .map((conv) => ({ ...conv, waitTime: getQueueWaitTimeSeconds(conv) }))
    // Ordenar por tempo de espera (maior primeiro)
    .sort((a, b) => (b.waitTime || 0) - (a.waitTime || 0));

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetchConversations();
    setIsRefreshing(false);
    toast.success('Fila atualizada!');
  };

  const handleAssume = async (conversationId: string) => {
    if (!user) return;

    try {
      // Encontrar a conversa para determinar o departamento
      const conversation = conversations.find(c => c.id === conversationId);
      
      // Determinar qual departamento usar:
      // Se o atendente não pertence ao departamento atual da conversa,
      // usar o primeiro departamento do atendente
      let departmentToUse = conversation?.departmentId;
      if (departmentToUse && !userDepartments.includes(departmentToUse)) {
        departmentToUse = userDepartments[0];
      }

      // Calcular o tempo de espera (em segundos) desde a criação da conversa
      const waitTimeSeconds = conversation?.createdAt 
        ? Math.floor((Date.now() - new Date(conversation.createdAt).getTime()) / 1000)
        : 0;

      // 1. Atualizar no banco de dados (incluindo departamento e wait_time)
      const updateData: Record<string, unknown> = {
        status: 'em_atendimento',
        assigned_to: user.id,
        updated_at: new Date().toISOString(),
        wait_time: waitTimeSeconds,
        robot_lock_until: null,
      };
      
      if (departmentToUse) {
        updateData.department_id = departmentToUse;
      }

      const { error } = await supabase
        .from('conversations')
        .update(updateData)
        .eq('id', conversationId);

      if (error) throw error;

      // Inserir mensagem de sistema
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        content: `${user.name} assumiu a conversa`,
        sender_name: 'SYSTEM',
        sender_id: null,
        message_type: 'system',
        status: 'sent',
      });

      // 2. Buscar a conversa atualizada diretamente do banco
      const { data: convData } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .single();

      if (convData) {
        // 3. Buscar o contato
        const { data: contactData } = await supabase
          .from('contacts')
          .select('*')
          .eq('id', convData.contact_id)
          .single();

        // 4. Buscar mensagens
        const { data: messagesData } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true });

        // 5. Mapear para o tipo Conversation
        const mappedConversation = {
          id: convData.id,
          type: 'externa' as const,
          status: convData.status as 'em_atendimento',
          contact: {
            id: contactData?.id || convData.contact_id,
            name: contactData?.name || 'Contato',
            phone: contactData?.phone || '',
            email: contactData?.email || undefined,
            avatar: contactData?.avatar_url || undefined,
            tags: convData.tags || [],
            notes: contactData?.notes || undefined,
            channel: (contactData?.channel || 'whatsapp') as 'whatsapp' | 'instagram' | 'web',
          },
          departmentId: convData.department_id,
          assignedTo: convData.assigned_to || undefined,
          messages: (messagesData || []).map(m => {
            // Identificar mensagens de robô pelo sender_name contendo "[ROBOT]" ou "(IA)"
            const isRobotMessage = m.sender_name?.includes('[ROBOT]') || m.sender_name?.includes('(IA)');
            return {
              id: m.id,
              conversationId: m.conversation_id,
              senderId: m.sender_id || (isRobotMessage ? 'robot' : 'contact'),
              senderName: m.sender_name,
              content: m.content,
              type: m.message_type as 'text' | 'image' | 'audio' | 'file',
              timestamp: new Date(m.created_at),
              read: m.status === 'read',
              status: m.status as 'sent' | 'delivered' | 'read',
            };
          }),
          tags: convData.tags || [],
          priority: convData.priority as 'low' | 'normal' | 'high' | 'urgent',
          createdAt: new Date(convData.created_at),
          updatedAt: new Date(convData.updated_at),
          waitTime: convData.wait_time || 0,
          channel: (convData.channel || 'whatsapp') as 'whatsapp' | 'instagram' | 'web',
        };

        // 6. Definir como conversa selecionada
        setSelectedConversation(mappedConversation);
        
        // 7. Atualizar estado local (sem refetch para evitar race condition que apaga mensagens)
        setConversations(prev => prev.filter(c => c.id !== conversationId));
      }
      toast.success('Você assumiu o atendimento!');
      playSound('takeover');
      navigate('/conversas');
    } catch (error) {
      console.error('Error assuming conversation:', error);
      toast.error('Erro ao assumir atendimento');
    }
  };

  // Stats
  const totalInQueue = queueConversations.length;
  const urgentCount = queueConversations.filter(c => (c.waitTime || 0) >= 300).length; // A partir de 5 minutos (300 segundos)
  const formatWaitTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (seconds < 3600) {
      return secs > 0 ? `${mins}m ${secs}s` : `${mins} min`;
    }
    const hours = Math.floor(seconds / 3600);
    const remainingMins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${remainingMins}min`;
  };

  return (
    <MainLayout title="Fila de Atendimento">
      <div className="h-full flex flex-col p-4 sm:p-6 overflow-hidden">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
          {/* Na Fila */}
          <div className="p-3 sm:p-4 rounded-xl bg-card border border-border">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-bold text-foreground">{totalInQueue}</p>
                <p className="text-xs sm:text-sm text-muted-foreground truncate">Na Fila</p>
              </div>
            </div>
          </div>

          {/* Urgentes */}
          <div className="p-3 sm:p-4 rounded-xl bg-card border border-border">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-destructive" />
              </div>
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-bold text-foreground">{urgentCount}</p>
                <p className="text-xs sm:text-sm text-muted-foreground truncate">Urgentes</p>
              </div>
            </div>
          </div>

          {/* Tempo Médio de Espera */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="p-3 sm:p-4 rounded-xl bg-card border border-border cursor-help">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
                      <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-warning" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xl sm:text-2xl font-bold text-foreground">{formatWaitTime(avgWaitTime)}</p>
                      <p className="text-xs sm:text-sm text-muted-foreground truncate">Tempo Médio Espera</p>
                    </div>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p>Tempo médio que seus clientes esperaram <strong>na fila</strong> antes de você assumir o atendimento</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Tempo Médio de Atendimento */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="p-3 sm:p-4 rounded-xl bg-card border border-border cursor-help">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
                      <Timer className="w-4 h-4 sm:w-5 sm:h-5 text-success" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xl sm:text-2xl font-bold text-foreground">{formatWaitTime(avgServiceTime)}</p>
                      <p className="text-xs sm:text-sm text-muted-foreground truncate">Tempo Médio Atendimento</p>
                    </div>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p>Duração média dos seus atendimentos, desde <strong>assumir</strong> até <strong>finalizar</strong></p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Todos os departamentos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os departamentos</SelectItem>
                {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      <div className="flex items-center gap-2">
                        <span 
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: dept.color }}
                        />
                        {dept.name}
                      </div>
                    </SelectItem>
                  ))
                }
              </SelectContent>
            </Select>

            {/* Filtro por canal */}
            <Select value={selectedChannel} onValueChange={setSelectedChannel}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Todos os canais" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os canais</SelectItem>
                <SelectItem value="whatsapp">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-[#25D366] flex items-center justify-center">
                      <MessageSquare className="w-2.5 h-2.5 text-white" />
                    </div>
                    WhatsApp
                  </div>
                </SelectItem>
                <SelectItem value="instagram">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
                      <InstagramIcon className="w-2.5 h-2.5 text-white" />
                    </div>
                    Instagram
                  </div>
                </SelectItem>
                <SelectItem value="machine">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-orange-500 flex items-center justify-center">
                      <Bike className="w-2.5 h-2.5 text-white" />
                    </div>
                    Machine
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 self-end sm:self-auto">
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Última atualização: {formatDistanceToNow(lastUpdate, { addSuffix: true, locale: ptBR })}
            </span>
            <Button 
              variant="secondary" 
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="sm:size-default"
            >
              <RefreshCw className={`w-4 h-4 sm:mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
          </div>
        </div>

        {/* Queue Grid */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {queueConversations.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground px-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-secondary flex items-center justify-center mb-4">
                <Users className="w-8 h-8 sm:w-10 sm:h-10" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">Fila vazia</h3>
              <p className="text-sm text-center">Nenhum cliente aguardando atendimento</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 sm:gap-4">
              {queueConversations.map((conversation) => (
                <QueueCard
                  key={conversation.id}
                  conversation={conversation}
                  onAssume={() => handleAssume(conversation.id)}
                  canPreview={userCanPreview}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
