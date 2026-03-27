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
import { Search, MessageSquare, Clock, Bot, Instagram, CalendarIcon, Bike, AlertTriangle, FileText, Loader2, Copy, Download, Check, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { useDepartments } from '@/hooks/useDepartments';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getTagColorClasses, getTagDotColor, normalizeTag, SUPORTE_TAXONOMY_TAGS } from '@/lib/tagColors';
import { extractCidade } from '@/lib/phoneUtils';
import { cn, priorityLabel } from '@/lib/utils';
import { toast } from 'sonner';

function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^---$/gm, '<hr />')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^\|(.+)\|$/gm, (match, content) => {
      const cells = content.split('|').map((c: string) => c.trim());
      if (cells.every((c: string) => /^[-:]+$/.test(c))) return '<!--table-sep-->';
      const tag = 'td';
      return '<tr>' + cells.map((c: string) => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
    });

  html = html.replace(/((<tr>.*<\/tr>\n?)+)/g, (block) => {
    const clean = block.replace(/<!--table-sep-->\n?/g, '');
    const withTh = clean.replace(/<tr>(.*?)<\/tr>/, (_, inner) =>
      '<thead><tr>' + inner.replace(/<td>/g, '<th>').replace(/<\/td>/g, '</th>') + '</tr></thead>'
    );
    return '<table>' + withTh + '</table>';
  });

  html = html.replace(/^(\d+)\.\s+(.+)$/gm, '<oli>$2</oli>');
  html = html.replace(/((<oli>.*<\/oli>\n?)+)/g, (block) =>
    '<ol>' + block.replace(/<\/?oli>/g, (t) => t.replace('oli', 'li')) + '</ol>'
  );

  html = html.replace(/^[\-\*]\s+(.+)$/gm, '<uli>$1</uli>');
  html = html.replace(/((<uli>.*<\/uli>\n?)+)/g, (block) =>
    '<ul>' + block.replace(/<\/?uli>/g, (t) => t.replace('uli', 'li')) + '</ul>'
  );

  html = html.split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    if (/^<(h[1-6]|ul|ol|li|table|thead|tr|th|td|hr|p|div|blockquote)/.test(trimmed)) return trimmed;
    return `<p>${trimmed}</p>`;
  }).join('\n');

  return html;
}

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

type PeriodFilter = 'all' | 'today' | 'yesterday' | 'custom';
type ChannelFilter = 'all' | 'whatsapp' | 'instagram' | 'machine';

export default function AILogs() {
  const { isAdmin, isSupervisor } = useAuth();
  const { user } = useApp();
  const { departments } = useDepartments();
  const [logs, setLogs] = useState<ConversationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState<ConversationLog | null>(null);
  const [showMessages, setShowMessages] = useState(false);

  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');

  // Get user's departments for filtering
  const userDepartmentIds = (user as any)?.departments?.map((d: any) => typeof d === 'string' ? d : d.id) || [];
  const accessibleDepartments = isAdmin
    ? departments
    : departments.filter(d => userDepartmentIds.includes(d.id));
  const [customDateRange, setCustomDateRange] = useState<{ from?: Date; to?: Date }>({});

  // Report state
  const [showReport, setShowReport] = useState(false);
  const [reportPeriod, setReportPeriod] = useState<string>('30');
  const [reportAgent, setReportAgent] = useState<string>('all');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportResult, setReportResult] = useState<string>('');

  const canSeeReport = isAdmin || isSupervisor;

  const generateReport = async () => {
    setReportLoading(true);
    setReportResult('');
    try {
      const { data, error } = await supabase.functions.invoke('ai-logs-report', {
        body: { period: parseInt(reportPeriod), agentName: reportAgent, departmentId: selectedDepartment !== 'all' ? selectedDepartment : undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setReportResult(data.report || 'Erro ao gerar relatório.');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao gerar relatório');
    } finally {
      setReportLoading(false);
    }
  };

  const [reportCopied, setReportCopied] = useState(false);

  const copyReport = () => {
    navigator.clipboard.writeText(reportResult);
    setReportCopied(true);
    toast.success('Relatório copiado!');
    setTimeout(() => setReportCopied(false), 2000);
  };

  const downloadReportPdf = async () => {
    const html2pdf = (await import('html2pdf.js')).default;
    const container = document.createElement('div');
    container.innerHTML = `
      <div style="font-family: Arial, sans-serif; padding: 32px; color: #1a1a1a; font-size: 13px; line-height: 1.7;">
        <h1 style="font-size: 20px; margin-bottom: 4px;">Relatório IA - Motivos de Contato (Suporte)</h1>
        <p style="color: #666; font-size: 12px; margin-bottom: 16px;">Período: ${reportPeriod} dias | IA: ${reportAgent === 'all' ? 'Todas' : reportAgent} | Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
        <hr style="margin-bottom: 16px; border-color: #e5e5e5;" />
        <style>
          h1 { font-size: 20px; font-weight: bold; margin-top: 20px; margin-bottom: 8px; }
          h2 { font-size: 16px; font-weight: bold; margin-top: 18px; margin-bottom: 6px; }
          h3 { font-size: 14px; font-weight: bold; margin-top: 14px; margin-bottom: 4px; }
          p { margin-bottom: 4px; }
          ul, ol { margin-left: 20px; margin-bottom: 8px; }
          li { margin-bottom: 2px; }
          table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 12px; }
          th, td { border: 1px solid #d1d5db; padding: 6px 10px; text-align: left; }
          th { background: #f3f4f6; font-weight: 600; }
          hr { border: none; border-top: 1px solid #e5e5e5; margin: 12px 0; }
        </style>
        ${renderMarkdown(reportResult)}
      </div>`;
    document.body.appendChild(container);
    await html2pdf().set({
      margin: [10, 10],
      filename: `relatorio-ia-${reportPeriod}d-${format(new Date(), 'yyyyMMdd')}.pdf`,
      html2canvas: { scale: 2, width: 800 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    }).from(container).save();
    document.body.removeChild(container);
  };

  useEffect(() => {
    const fetchLogs = async () => {
      if (!user) return;
      setLoading(true);
      try {
        // Fetch logs from Suporte department where finalized_by is null (robot) or assigned_to_name matches robot names
        const { data, error } = await supabase
          .from('conversation_logs')
          .select('*')
          .eq('department_id', SUPORTE_DEPARTMENT_ID)
          .order('finalized_at', { ascending: false });

        if (error) throw error;
        
        // Filter to only robot-handled conversations (finalized_by is null = robot finalized)
        const robotLogs = (data || []).filter(log => {
          // Robot-finalized: finalized_by is null, or assigned_to_name suggests a robot
          return !log.finalized_by || !log.finalized_by_name;
        });

        const parsedLogs = robotLogs.map(log => ({
          ...log,
          messages: Array.isArray(log.messages) ? log.messages : []
        })) as ConversationLog[];
        
        setLogs(parsedLogs);
      } catch (error) {
        console.error('Error fetching AI logs:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [user]);

  const filteredLogs = logs.filter(log => {
    const matchesSearch =
      log.contact_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.contact_phone?.includes(searchTerm) ||
      log.protocol?.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    if (periodFilter !== 'all') {
      const finalizedDate = new Date(log.finalized_at);
      const now = new Date();
      if (periodFilter === 'today') {
        if (finalizedDate < startOfDay(now) || finalizedDate > endOfDay(now)) return false;
      } else if (periodFilter === 'yesterday') {
        const yesterday = subDays(now, 1);
        if (finalizedDate < startOfDay(yesterday) || finalizedDate > endOfDay(yesterday)) return false;
      } else if (periodFilter === 'custom') {
        if (customDateRange.from && finalizedDate < startOfDay(customDateRange.from)) return false;
        if (customDateRange.to && finalizedDate > endOfDay(customDateRange.to)) return false;
      }
    }

    if (channelFilter !== 'all') {
      const logChannel = log.contact_notes?.includes('franqueado:') ? 'machine' : (log.channel || 'whatsapp');
      if (logChannel !== channelFilter) return false;
    }

    if (tagFilter !== 'all') {
      if (!log.tags?.some(t => normalizeTag(t) === tagFilter)) return false;
    }

    return true;
  });

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const formatDuration = (startedAt: string, finalizedAt: string) => {
    const diffMs = new Date(finalizedAt).getTime() - new Date(startedAt).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}min`;
    return `${Math.floor(diffMins / 60)}h ${diffMins % 60}min`;
  };

  const priorityColors: Record<string, string> = {
    low: 'bg-muted text-muted-foreground',
    normal: 'bg-primary/20 text-primary',
    high: 'bg-warning/20 text-warning',
    urgent: 'bg-destructive/20 text-destructive',
  };

  // Extract handoff summary from messages (look for the invisible summary pattern)
  const getHandoffSummary = (log: ConversationLog): string | null => {
    // Check tags for taxonomy
    const taxonomyTag = log.tags?.find(t => SUPORTE_TAXONOMY_TAGS.some(st => t === st));
    
    // Look for system messages that might contain handoff info
    const systemMsg = log.messages?.find((m: any) => 
      m.content?.includes('[NOVO_CONHECIMENTO_NECESSARIO]') || 
      m.sender_name === 'Sistema' ||
      m.message_type === 'system'
    );

    if (systemMsg) return systemMsg.content;
    return null;
  };

  return (
    <MainLayout title="Logs IA">
      <div className="h-full flex flex-col gap-3 sm:gap-4 p-4 sm:p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Logs de Conversas IA</h2>
          </div>
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, telefone, protocolo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Badge variant="secondary" className="text-sm shrink-0 self-start sm:self-auto">
            {filteredLogs.length} conversas IA
          </Badge>
          {canSeeReport && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowReport(true)}>
              <FileText className="w-4 h-4" />
              Relatório
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
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
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          )}

          <Select value={channelFilter} onValueChange={(v) => setChannelFilter(v as ChannelFilter)}>
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

          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger className="w-[200px] h-9 text-sm">
              <SelectValue placeholder="Tag taxonomia" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as tags</SelectItem>
              {SUPORTE_TAXONOMY_TAGS.map(tag => (
                <SelectItem key={tag} value={tag}>
                  <span className="flex items-center gap-2">
                    <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", getTagDotColor(tag))} />
                    {tag}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Logs list */}
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <Bot className="w-12 h-12 mb-2 opacity-50" />
              <p>Nenhum log de IA encontrado</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredLogs.map((log) => {
                const realChannel = log.contact_notes?.includes('franqueado:') ? 'machine' : (log.channel || 'whatsapp');
                const taxonomyTag = log.tags?.find(t => SUPORTE_TAXONOMY_TAGS.some(st => t === st));
                const hasNewKnowledge = log.messages?.some((m: any) => m.content?.includes('[NOVO_CONHECIMENTO_NECESSARIO]'));

                return (
                  <Card
                    key={log.id}
                    className={cn(
                      "cursor-pointer hover:bg-accent/50 transition-colors",
                      log.priority === 'urgent' && "border-destructive/50"
                    )}
                    onClick={() => { setSelectedLog(log); setShowMessages(true); }}
                  >
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="relative shrink-0">
                            <Avatar className="h-10 w-10">
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
                                  <Bike className="w-3 h-3 text-white" />
                                </div>
                              ) : (
                                <div className="w-5 h-5 rounded-full bg-[#25D366] flex items-center justify-center">
                                  <MessageSquare className="w-3 h-3 text-white" />
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h3 className="font-medium truncate">{log.contact_name}</h3>
                              {log.protocol && (
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                                  📋 {log.protocol}
                                </span>
                              )}
                              {hasNewKnowledge && (
                                <Badge variant="outline" className="text-warning border-warning/50 gap-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  Novo conhecimento
                                </Badge>
                              )}
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
                                {realChannel === 'instagram' ? 'Instagram' : realChannel === 'machine' ? 'Machine' : 'WhatsApp'}
                              </span>
                              {(() => {
                                const cidade = extractCidade(log.contact_notes || undefined);
                                return cidade ? (
                                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-500/20 text-blue-400">
                                    📍 {cidade}
                                  </span>
                                ) : null;
                              })()}
                              {taxonomyTag ? (
                                <Badge className={`${getTagColorClasses(taxonomyTag)} border text-xs`}>
                                  {taxonomyTag}
                                </Badge>
                              ) : (
                                <Badge className={priorityColors[log.priority] || priorityColors.normal}>
                                  {priorityLabel(log.priority)}
                                </Badge>
                              )}
                              {log.tags?.filter(t => !SUPORTE_TAXONOMY_TAGS.some(st => t === st)).map(tag => (
                                <Badge key={tag} variant="outline" className={cn("text-xs", getTagColorClasses(tag))}>
                                  {tag}
                                </Badge>
                              ))}
                            </div>

                            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {format(new Date(log.finalized_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                              </span>
                              <span>{formatDuration(log.started_at, log.finalized_at)}</span>
                              <span className="flex items-center gap-1">
                                <MessageSquare className="w-3 h-3" />
                                {log.total_messages} msgs
                              </span>
                              {log.assigned_to_name && (
                                <span className="flex items-center gap-1">
                                  <Bot className="w-3 h-3" />
                                  {log.assigned_to_name}
                                </span>
                              )}
                            </div>
                          </div>
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
          <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-primary" />
                {selectedLog?.contact_name}
                {selectedLog?.protocol && (
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {selectedLog.protocol}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>

            {selectedLog && (
              <div className="flex-1 overflow-hidden flex flex-col gap-3">
                {/* Taxonomy tag and summary */}
                {selectedLog.tags?.find(t => SUPORTE_TAXONOMY_TAGS.some(st => t === st)) && (
                  <div className="flex items-center gap-2">
                    <Badge className={cn("text-sm", getTagColorClasses(selectedLog.tags.find(t => SUPORTE_TAXONOMY_TAGS.some(st => t === st))!))}>
                      {selectedLog.tags.find(t => SUPORTE_TAXONOMY_TAGS.some(st => t === st))}
                    </Badge>
                  </div>
                )}

                {/* Messages */}
                <ScrollArea className="flex-1 max-h-[60vh]">
                  <div className="space-y-3 pr-4 py-2">
                    {selectedLog.messages.map((msg: any, idx: number) => {
                      const senderId = msg.sender_id || msg.senderId;
                      const senderName = msg.sender_name || msg.senderName || '';
                      const msgType = msg.message_type || msg.type;
                      const msgTime = msg.created_at || msg.timestamp;
                      
                      const isSystemMessage = msgType === 'system' || senderName === 'SYSTEM' || senderName === '[SISTEMA]';
                      const isRobot = senderId === 'robot' || senderName.includes('[ROBOT]') || senderName.includes('(IA)');
                      const isUUID = senderId && /^[0-9a-f]{8}-/.test(senderId);
                      const isFromContact = senderId === 'contact' || (!senderId && !isRobot && !isUUID && !isSystemMessage);

                      if (isSystemMessage) {
                        return (
                          <div key={idx} className="flex justify-center my-2">
                            <span className="text-xs text-muted-foreground bg-muted/60 rounded-full px-4 py-1.5 border border-border/50">
                              {msgTime && format(new Date(msgTime), 'HH:mm', { locale: ptBR })} · {msg.content}
                            </span>
                          </div>
                        );
                      }

                      return (
                        <div key={idx} className={cn("flex", isFromContact ? "justify-start" : "justify-end")}>
                          <div
                            className={cn(
                              "max-w-[80%] px-4 py-2 rounded-2xl text-sm",
                              isFromContact
                                ? "bg-muted text-foreground rounded-bl-md"
                                : "bg-primary text-primary-foreground rounded-br-md"
                            )}
                          >
                            <p className={cn(
                              "text-xs font-medium mb-1",
                              isFromContact ? "text-muted-foreground" : "opacity-80"
                            )}>
                              {senderName}
                            </p>
                            {msgType === 'image' || msgType === 'file' || msgType === 'audio' || msgType === 'video' || msgType === 'document' ? (
                              <p className="text-xs italic opacity-70">[{msgType}]</p>
                            ) : (
                              <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                            )}
                            <p className={cn(
                              "text-[10px] mt-1",
                              isFromContact ? "text-muted-foreground" : "opacity-70"
                            )}>
                              {msgTime && format(new Date(msgTime), 'HH:mm', { locale: ptBR })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Report Dialog */}
        <Dialog open={showReport} onOpenChange={setShowReport}>
          <DialogContent className="max-w-3xl h-[85vh] flex flex-col overflow-hidden">
            <DialogHeader className="pb-3 border-b">
              <div className="flex items-center justify-between">
                <DialogTitle className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-primary" />
                  Relatório IA - Motivos de Contato (Suporte)
                </DialogTitle>
                {reportResult && (
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" onClick={copyReport} className="gap-1.5 h-8 text-xs">
                      {reportCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {reportCopied ? 'Copiado' : 'Copiar'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={downloadReportPdf} className="gap-1.5 h-8 text-xs">
                      <Download className="w-3.5 h-3.5" />
                      Exportar PDF
                    </Button>
                  </div>
                )}
              </div>
            </DialogHeader>

            <div className="flex items-center gap-3 py-3 border-b">
              <Select value={reportPeriod} onValueChange={setReportPeriod}>
                <SelectTrigger className="w-[130px] h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 dias</SelectItem>
                  <SelectItem value="15">15 dias</SelectItem>
                  <SelectItem value="30">30 dias</SelectItem>
                </SelectContent>
              </Select>

              <Select value={reportAgent} onValueChange={setReportAgent}>
                <SelectTrigger className="w-[150px] h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as IAs</SelectItem>
                  <SelectItem value="Delma">Delma</SelectItem>
                  <SelectItem value="Sebastião">Sebastião</SelectItem>
                  <SelectItem value="Julia">Julia</SelectItem>
                </SelectContent>
              </Select>

              <Button size="sm" onClick={generateReport} disabled={reportLoading} className="gap-1.5">
                {reportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                {reportLoading ? 'Gerando...' : 'Gerar Relatório'}
              </Button>
            </div>

            <ScrollArea className="flex-1 min-h-0">
              {reportLoading ? (
                <div className="flex flex-col items-center justify-center h-40 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Analisando conversas com IA...</p>
                </div>
              ) : reportResult ? (
                <div
                  className="prose prose-sm dark:prose-invert max-w-none pr-4 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-1.5 [&_th]:bg-muted [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1.5 [&_td]:text-xs"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(reportResult) }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                  <Bot className="w-12 h-12 mb-2 opacity-50" />
                  <p className="text-sm">Selecione os filtros e clique em "Gerar Relatório"</p>
                </div>
              )}
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
