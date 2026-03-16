import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Search, Calendar, MessageSquare, Clock, Building2, Sparkles, Copy, Check, ArrowLeft, FileText, DollarSign, BookOpen, Bike, Instagram, MessageCircle, MapPin, CalendarIcon, Bot } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { MessageAttachment } from '@/components/chat/MessageAttachment';
import { useApp } from '@/contexts/AppContext';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { getTagColorClasses } from '@/lib/tagColors';
import { extractCidade } from '@/lib/phoneUtils';
import { cn } from '@/lib/utils';

interface ConversationLog {
  id: string;
  conversation_id: string;
  contact_name: string;
  contact_phone: string | null;
  department_name: string | null;
  department_id: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  finalized_by: string | null;
  finalized_by_name: string | null;
  started_at: string;
  finalized_at: string;
  total_messages: number;
  priority: string;
  tags: string[];
  wait_time: number | null;
  messages: any[];
  channel?: string | null;
  contact_notes?: string | null;
  protocol?: string | null;
}

const SUPORTE_DEPARTMENT_ID = 'dea51138-49e4-45b0-a491-fb07a5fad479';

type PeriodFilter = 'all' | 'today' | 'yesterday' | 'custom';
type ChannelFilter = 'all' | 'whatsapp' | 'instagram' | 'machine';

const channelIcon = (channel: string | null | undefined) => {
  switch (channel) {
    case 'instagram':
      return <Instagram className="w-3.5 h-3.5 text-pink-500" />;
    case 'machine':
      return <Bike className="w-3.5 h-3.5 text-orange-500" />;
    default:
      return <MessageCircle className="w-3.5 h-3.5 text-green-500" />;
  }
};

const channelLabel = (channel: string | null | undefined) => {
  switch (channel) {
    case 'instagram': return 'Instagram';
    case 'machine': return 'Machine';
    default: return 'WhatsApp';
  }
};

export default function History() {
  const { user } = useApp();
  const [logs, setLogs] = useState<ConversationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState<ConversationLog | null>(null);
  const [showMessages, setShowMessages] = useState(false);

  // Filtros
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [cidadeFilter, setCidadeFilter] = useState('');
  const [customDateRange, setCustomDateRange] = useState<{ from?: Date; to?: Date }>({});
  
  // Estados para resumo
  type SummaryType = 'advanced' | 'basic' | 'financial';
  const [showSummary, setShowSummary] = useState(false);
  const [summaries, setSummaries] = useState<Record<SummaryType, string | null>>({ advanced: null, basic: null, financial: null });
  const [loadingTab, setLoadingTab] = useState<Record<SummaryType, boolean>>({ advanced: false, basic: false, financial: false });
  const [summaryLog, setSummaryLog] = useState<ConversationLog | null>(null);
  const [selectedType, setSelectedType] = useState<SummaryType | null>(null);
  const [copied, setCopied] = useState(false);

  // Verifica se usuário está no departamento Suporte
  const isSuporteDepartment = user?.departments?.some(
    (dept: any) => dept.id === SUPORTE_DEPARTMENT_ID || dept === SUPORTE_DEPARTMENT_ID
  );

  useEffect(() => {
    const fetchLogs = async () => {
      if (!user) return;

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('conversation_logs')
          .select('*')
          .eq('finalized_by', user.id)
          .order('finalized_at', { ascending: false });

        if (error) throw error;
        const parsedLogs = (data || []).map(log => ({
          ...log,
          messages: Array.isArray(log.messages) ? log.messages : []
        })) as ConversationLog[];
        setLogs(parsedLogs);
      } catch (error) {
        console.error('Error fetching conversation logs:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [user]);

  const filteredLogs = logs.filter(log => {
    // Busca por texto (nome, telefone, departamento, protocolo)
    const matchesSearch = 
      log.contact_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.contact_phone?.includes(searchTerm) ||
      log.department_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.protocol?.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    // Filtro de período
    if (periodFilter !== 'all') {
      const finalizedDate = new Date(log.finalized_at);
      const now = new Date();
      if (periodFilter === 'today') {
        const start = startOfDay(now);
        const end = endOfDay(now);
        if (finalizedDate < start || finalizedDate > end) return false;
      } else if (periodFilter === 'yesterday') {
        const yesterday = subDays(now, 1);
        const start = startOfDay(yesterday);
        const end = endOfDay(yesterday);
        if (finalizedDate < start || finalizedDate > end) return false;
      } else if (periodFilter === 'custom') {
        if (customDateRange.from && finalizedDate < startOfDay(customDateRange.from)) return false;
        if (customDateRange.to && finalizedDate > endOfDay(customDateRange.to)) return false;
      }
    }

    // Filtro de canal - usa contact_notes como fonte de verdade para Machine
    if (channelFilter !== 'all') {
      const logChannel = log.contact_notes?.includes('franqueado:') 
        ? 'machine' 
        : (log.channel || 'whatsapp');
      if (logChannel !== channelFilter) return false;
    }

    // Filtro de cidade (apenas para machine)
    if (channelFilter === 'machine' && cidadeFilter.trim()) {
      const cidade = extractCidade(log.contact_notes || undefined);
      if (!cidade || !cidade.toLowerCase().includes(cidadeFilter.toLowerCase())) return false;
    }

    return true;
  });

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatDuration = (startedAt: string, finalizedAt: string) => {
    const start = new Date(startedAt);
    const end = new Date(finalizedAt);
    const diffMs = end.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 60) return `${diffMins}min`;
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hours}h ${mins}min`;
  };

  const priorityColors: Record<string, string> = {
    low: 'bg-muted text-muted-foreground',
    normal: 'bg-primary/20 text-primary',
    high: 'bg-warning/20 text-warning',
    urgent: 'bg-destructive/20 text-destructive',
  };

  const fetchSummary = async (log: ConversationLog, type: SummaryType) => {
    if (summaries[type] || loadingTab[type]) return;
    
    setLoadingTab(prev => ({ ...prev, [type]: true }));

    try {
      const { data, error } = await supabase.functions.invoke('conversation-summary', {
        body: { messages: log.messages, contactName: log.contact_name, summaryType: type }
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        throw new Error(data.error);
      }

      setSummaries(prev => ({ ...prev, [type]: data.summary }));
    } catch (error) {
      console.error('Error generating summary:', error);
      if (!(error instanceof Error && error.message)) {
        toast.error('Erro ao gerar resumo. Tente novamente.');
      }
    } finally {
      setLoadingTab(prev => ({ ...prev, [type]: false }));
    }
  };

  const handleGenerateSummary = (log: ConversationLog, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!log.messages || log.messages.length === 0) {
      toast.error('Esta conversa não possui mensagens salvas');
      return;
    }

    setSummaryLog(log);
    setSummaries({ advanced: null, basic: null, financial: null });
    setSelectedType(null);
    setShowSummary(true);
  };

  const handleSelectType = (type: SummaryType) => {
    setSelectedType(type);
    if (summaryLog) {
      fetchSummary(summaryLog, type);
    }
  };

  const handleCopySummary = async () => {
    const text = selectedType ? summaries[selectedType] : null;
    if (!text) return;
    
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Resumo copiado!');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Erro ao copiar');
    }
  };

  const typeLabels: Record<SummaryType, { label: string; description: string; icon: React.ReactNode }> = {
    advanced: { label: 'Resumo Avançado', description: 'Detalha tudo que ocorreu na conversa', icon: <BookOpen className="w-5 h-5" /> },
    basic: { label: 'Resumo Básico', description: 'Direto ao ponto, sem enrolação', icon: <FileText className="w-5 h-5" /> },
    financial: { label: 'Resumo Financeiro', description: 'Nome, CPF e assunto financeiro', icon: <DollarSign className="w-5 h-5" /> },
  };

  return (
    <MainLayout title="Histórico">
      <div className="h-full flex flex-col gap-3 sm:gap-4 p-4 sm:p-6">
        {/* Header with search */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, telefone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Badge variant="secondary" className="text-sm shrink-0 self-start sm:self-auto">
            {filteredLogs.length} conversas
          </Badge>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Período */}
          <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v as PeriodFilter)}>
            <SelectTrigger className="w-[150px] h-9 text-sm">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="yesterday">Ontem</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>

          {/* Date picker para período personalizado */}
          {periodFilter === 'custom' && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-9 gap-1 text-sm", !customDateRange.from && "text-muted-foreground")}>
                  <CalendarIcon className="w-3.5 h-3.5" />
                  {customDateRange.from
                    ? customDateRange.to
                      ? `${format(customDateRange.from, 'dd/MM')} - ${format(customDateRange.to, 'dd/MM')}`
                      : format(customDateRange.from, 'dd/MM/yyyy')
                    : 'Selecionar datas'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="range"
                  selected={customDateRange.from ? { from: customDateRange.from, to: customDateRange.to } : undefined}
                  onSelect={(range: any) => setCustomDateRange({ from: range?.from, to: range?.to })}
                  numberOfMonths={1}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          )}

          {/* Canal */}
          <Select value={channelFilter} onValueChange={(v) => { setChannelFilter(v as ChannelFilter); if (v !== 'machine') setCidadeFilter(''); }}>
            <SelectTrigger className="w-[140px] h-9 text-sm">
              <SelectValue placeholder="Canal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os canais</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="instagram">Instagram</SelectItem>
              <SelectItem value="machine">Machine</SelectItem>
            </SelectContent>
          </Select>

          {/* Cidade (apenas Machine) */}
          {channelFilter === 'machine' && (
            <div className="relative">
              <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Filtrar cidade..."
                value={cidadeFilter}
                onChange={(e) => setCidadeFilter(e.target.value)}
                className="h-9 w-[160px] pl-8 text-sm"
              />
            </div>
          )}
        </div>

        {/* Logs list */}
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <MessageSquare className="w-12 h-12 mb-2 opacity-50" />
              <p>Nenhuma conversa finalizada encontrada</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredLogs.map((log) => {
                const realChannel = log.contact_notes?.includes('franqueado:') ? 'machine' : (log.channel || 'whatsapp');
                const cidade = extractCidade(log.contact_notes || undefined);
                return (
                  <Card 
                    key={log.id} 
                    className="cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => {
                      setSelectedLog(log);
                      setShowMessages(true);
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                        <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
                          <div className="relative shrink-0">
                            <Avatar className="h-10 w-10 sm:h-12 sm:w-12">
                              <AvatarFallback className="bg-primary/10 text-primary">
                                {getInitials(log.contact_name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="absolute -bottom-1 -right-1">
                              {realChannel === 'instagram' ? (
                                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
                                  <Instagram className="w-3 h-3 text-white" />
                                </div>
                              ) : realChannel === 'machine' ? (
                                <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center">
                                  <Bot className="w-3 h-3 text-white" />
                                </div>
                              ) : (
                                <div className="w-5 h-5 rounded-full bg-[#25D366] flex items-center justify-center">
                                  <MessageSquare className="w-3 h-3 text-white" />
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium truncate">{log.contact_name}</h3>
                              {log.protocol && (
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                                  📋 {log.protocol}
                                </span>
                              )}
                              <Badge className={priorityColors[log.priority] || priorityColors.normal}>
                                {log.priority}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                              <span className={cn(
                                "text-xs px-2 py-0.5 rounded-full font-medium",
                                realChannel === 'instagram'
                                  ? "bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-pink-400"
                                  : realChannel === 'machine'
                                  ? "bg-orange-500/20 text-orange-400"
                                  : "bg-[#25D366]/20 text-[#25D366]"
                              )}>
                                {channelLabel(realChannel)}
                              </span>
                              {cidade && (
                                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-500/20 text-blue-400">
                                  📍 {cidade}
                                </span>
                              )}
                            </div>
                            
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                              {log.contact_phone && (
                                <span>{log.contact_phone}</span>
                              )}
                              {log.department_name && (
                                <span className="flex items-center gap-1">
                                  <Building2 className="w-3 h-3" />
                                  {log.department_name}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <MessageSquare className="w-3 h-3" />
                                {log.total_messages} mensagens
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatDuration(log.started_at, log.finalized_at)}
                              </span>
                            </div>

                            {log.tags && log.tags.length > 0 && (
                              <div className="flex gap-1 mt-2">
                                {log.tags.map((tag, idx) => (
                                  <Badge key={idx} variant="outline" className={`text-xs ${getTagColorClasses(tag)}`}>
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center sm:items-end sm:flex-col gap-3 sm:gap-2 shrink-0 pl-13 sm:pl-0">
                          <div className="text-sm text-muted-foreground sm:text-right">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {format(new Date(log.finalized_at), "dd/MM/yyyy", { locale: ptBR })}
                            </div>
                            <div className="text-xs">
                              {format(new Date(log.finalized_at), "HH:mm", { locale: ptBR })}
                            </div>
                          </div>
                          
                          {/* Botão de Resumo - apenas para departamento Suporte */}
                          {isSuporteDepartment && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => handleGenerateSummary(log, e)}
                              className="gap-1"
                            >
                              <Sparkles className="w-3 h-3" />
                              Resumo
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Messages Dialog */}
        <Dialog open={showMessages} onOpenChange={setShowMessages}>
          <DialogContent className="max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                    {selectedLog ? getInitials(selectedLog.contact_name) : ''}
                  </AvatarFallback>
                </Avatar>
                <span>{selectedLog?.contact_name}</span>
              </DialogTitle>
            </DialogHeader>
            
            <ScrollArea className="max-h-[60vh] pr-4">
              {selectedLog?.messages && selectedLog.messages.length > 0 ? (
                <div className="space-y-3">
                  {selectedLog.messages.map((msg: any, idx: number) => {
                    const senderId = msg.senderId || msg.sender_id || null;
                    const senderName = msg.senderName || msg.sender_name || '';
                    const msgType = msg.type || msg.message_type || 'text';
                    const msgTimestamp = msg.timestamp || msg.created_at;

                    const isSystem = msgType === 'system' || senderName === 'SYSTEM' || senderName === '[SISTEMA]';
                    const isContact = !isSystem && (senderId === 'contact' || !senderId);

                    if (isSystem) {
                      return (
                        <div key={idx} className="flex justify-center">
                          <p className="text-xs text-muted-foreground italic px-3 py-1">
                            {msg.content}
                          </p>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={idx}
                        className={`flex ${isContact ? 'justify-start' : 'justify-end'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                            isContact
                              ? 'bg-muted text-foreground rounded-bl-md'
                              : 'bg-primary text-primary-foreground rounded-br-md'
                          }`}
                        >
                          <p className={`text-xs font-medium mb-1 ${isContact ? 'text-muted-foreground' : 'text-primary-foreground/70'}`}>
                            {senderName}
                          </p>
                          {(() => {
                            try {
                              const parsed = JSON.parse(msg.content);
                              if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].url) {
                                return <MessageAttachment attachments={parsed} />;
                              }
                            } catch {}
                            return <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>;
                          })()}
                          <p className={`text-[10px] mt-1 ${isContact ? 'text-muted-foreground' : 'text-primary-foreground/60'}`}>
                            {msgTimestamp ? format(new Date(msgTimestamp), "HH:mm", { locale: ptBR }) : ''}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  Nenhuma mensagem salva neste log
                </div>
              )}
            </ScrollArea>
          </DialogContent>
        </Dialog>

        <Dialog open={showSummary} onOpenChange={(open) => { setShowSummary(open); if (!open) setSelectedType(null); }}>
          <DialogContent className="max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedType ? (
                  <>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedType(null)}>
                      <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <span>{typeLabels[selectedType].label}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 text-primary" />
                    <span>Resumo da Conversa</span>
                  </>
                )}
              </DialogTitle>
            </DialogHeader>
            
            {summaryLog && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground border-b pb-3">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {getInitials(summaryLog.contact_name)}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium">{summaryLog.contact_name}</span>
                <span>•</span>
                <span>{format(new Date(summaryLog.finalized_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
              </div>
            )}

            {!selectedType ? (
              <div className="grid gap-3 py-2">
                {(['advanced', 'basic', 'financial'] as const).map((type) => (
                  <Card
                    key={type}
                    className="cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => handleSelectType(type)}
                  >
                    <CardContent className="flex items-center gap-4 p-4">
                      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary shrink-0">
                        {typeLabels[type].icon}
                      </div>
                      <div>
                        <p className="font-medium">{typeLabels[type].label}</p>
                        <p className="text-sm text-muted-foreground">{typeLabels[type].description}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <>
                <ScrollArea className="max-h-[45vh] pr-4">
                  {loadingTab[selectedType] ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                      <p className="text-sm text-muted-foreground">Gerando resumo com IA...</p>
                    </div>
                  ) : summaries[selectedType] ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <div 
                        className="whitespace-pre-wrap text-sm leading-relaxed"
                        dangerouslySetInnerHTML={{ 
                          __html: summaries[selectedType]!
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            .replace(/\n/g, '<br />') 
                        }}
                      />
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground py-8">
                      Erro ao gerar resumo. Tente novamente.
                    </div>
                  )}
                </ScrollArea>

                {summaries[selectedType] && (
                  <div className="flex justify-end pt-3 border-t mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopySummary}
                      className="gap-2"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4" />
                          Copiado!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copiar resumo
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
