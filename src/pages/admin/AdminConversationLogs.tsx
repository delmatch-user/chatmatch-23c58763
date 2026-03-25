import { useState, useEffect, useRef, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { supabase } from '@/integrations/supabase/client';
import { MessageAttachment } from '@/components/chat/MessageAttachment';
import { Search, MessageSquare, User, Building2, Clock, Calendar, ChevronDown, ChevronUp, Bike, Instagram, MessageCircle, MapPin, Bot, Phone, X, Smartphone, Loader2, Copy, Check, FileDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { getTagColorClasses } from '@/lib/tagColors';
import { extractCidade } from '@/lib/phoneUtils';
import { toast } from 'sonner';

function renderMarkdown(text: string): string {
  let html = text
    // Escape HTML
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Horizontal rules
    .replace(/^---$/gm, '<hr />')
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold + Italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Table rows
    .replace(/^\|(.+)\|$/gm, (match, content) => {
      const cells = content.split('|').map((c: string) => c.trim());
      if (cells.every((c: string) => /^[-:]+$/.test(c))) return '<!--table-sep-->';
      const tag = 'td';
      return '<tr>' + cells.map((c: string) => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
    });
  
  // Wrap table rows
  html = html.replace(/((<tr>.*<\/tr>\n?)+)/g, (block) => {
    const clean = block.replace(/<!--table-sep-->\n?/g, '');
    // Make first row th
    const withTh = clean.replace(/<tr>(.*?)<\/tr>/, (_, inner) => 
      '<thead><tr>' + inner.replace(/<td>/g, '<th>').replace(/<\/td>/g, '</th>') + '</tr></thead>'
    );
    return '<table>' + withTh + '</table>';
  });

  // Ordered lists
  html = html.replace(/^(\d+)\.\s+(.+)$/gm, '<oli>$2</oli>');
  html = html.replace(/((<oli>.*<\/oli>\n?)+)/g, (block) => 
    '<ol>' + block.replace(/<\/?oli>/g, (t) => t.replace('oli', 'li')) + '</ol>'
  );

  // Unordered lists  
  html = html.replace(/^[\-\*]\s+(.+)$/gm, '<uli>$1</uli>');
  html = html.replace(/((<uli>.*<\/uli>\n?)+)/g, (block) => 
    '<ul>' + block.replace(/<\/?uli>/g, (t) => t.replace('uli', 'li')) + '</ul>'
  );

  // Paragraphs for remaining lines
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
  contact_notes: string | null;
  channel: string | null;
  department_id: string | null;
  department_name: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  finalized_by: string | null;
  finalized_by_name: string | null;
  messages: any[];
  tags: string[];
  priority: string;
  started_at: string;
  finalized_at: string;
  total_messages: number;
  wait_time: number | null;
  protocol?: string | null;
}

export default function AdminConversationLogs() {
  const [logs, setLogs] = useState<ConversationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [phoneSearch, setPhoneSearch] = useState('');
  const [messageSearch, setMessageSearch] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterAgent, setFilterAgent] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterInstance, setFilterInstance] = useState('');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [allDepartments, setAllDepartments] = useState<string[]>([]);
  const [allAgents, setAllAgents] = useState<string[]>([]);
  const [allCities, setAllCities] = useState<string[]>([]);
  const [allInstances, setAllInstances] = useState<{ id: string; name: string }[]>([]);
  const [aiReportOpen, setAiReportOpen] = useState(false);
  const [aiReportPeriod, setAiReportPeriod] = useState<string>('30');
  const [aiReportLoading, setAiReportLoading] = useState(false);
  const [aiReport, setAiReport] = useState('');
  const [aiReportCopied, setAiReportCopied] = useState(false);
  const PAGE_SIZE = 100;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch distinct departments and agents from DB on mount
  useEffect(() => {
    const fetchMeta = async () => {
      const [deptRes, agentRes, cityRes, instanceRes] = await Promise.all([
        supabase
          .from('conversation_logs')
          .select('department_name')
          .not('department_name', 'is', null)
          .order('department_name'),
        supabase
          .from('conversation_logs')
          .select('assigned_to_name, finalized_by_name'),
        supabase
          .from('conversation_logs')
          .select('contact_notes')
          .ilike('contact_notes', '%franqueado:%'),
        supabase
          .from('conversation_logs')
          .select('whatsapp_instance_id')
          .not('whatsapp_instance_id', 'is', null)
      ]);

      if (deptRes.data) {
        const unique = [...new Set(deptRes.data.map(d => d.department_name).filter(Boolean))] as string[];
        setAllDepartments(unique);
      }
      if (agentRes.data) {
        const names = agentRes.data.flatMap(r => [r.assigned_to_name, r.finalized_by_name]).filter(Boolean);
        const unique = [...new Set(names)] as string[];
        setAllAgents(unique.sort());
      }
      if (cityRes.data) {
        const cities = cityRes.data
          .map(r => extractCidade(r.contact_notes || undefined))
          .filter(Boolean) as string[];
        const unique = [...new Set(cities)].sort();
        setAllCities(unique);
      }
      if (instanceRes.data) {
        const uniqueInstanceIds = [...new Set(
          instanceRes.data.map(r => r.whatsapp_instance_id).filter(Boolean)
        )] as string[];

        let instanceNames: Record<string, string> = {};
        if (uniqueInstanceIds.length > 0) {
          const { data: connections } = await supabase
            .from('whatsapp_connections')
            .select('phone_number_id, name')
            .in('phone_number_id', uniqueInstanceIds);
          connections?.forEach(c => {
            instanceNames[c.phone_number_id] = c.name || c.phone_number_id;
          });
        }

        setAllInstances(uniqueInstanceIds.map(id => ({
          id,
          name: instanceNames[id] || id
        })));
      }
    };
    fetchMeta();
  }, []);

  // Build a filtered query (reusable for count + data)
  const buildQuery = useCallback((selectStr: string, opts?: { count?: 'exact'; head?: boolean }) => {
    let query = supabase
      .from('conversation_logs')
      .select(selectStr, opts as any);

    if (searchTerm) {
      query = query.or(`contact_name.ilike.%${searchTerm}%,protocol.ilike.%${searchTerm}%`);
    }
    if (phoneSearch) {
      query = query.ilike('contact_phone', `%${phoneSearch}%`);
    }
    if (filterDepartment) {
      query = query.eq('department_name', filterDepartment);
    }
    if (filterAgent) {
      query = query.or(`assigned_to_name.eq.${filterAgent},finalized_by_name.eq.${filterAgent}`);
    }
    if (filterInstance) {
      query = query.eq('whatsapp_instance_id', filterInstance);
    }
    if (dateFrom) {
      query = query.gte('finalized_at', dateFrom.toISOString());
    }
    if (dateTo) {
      const endOfDay = new Date(dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      query = query.lte('finalized_at', endOfDay.toISOString());
    }

    return query;
  }, [searchTerm, phoneSearch, filterDepartment, filterAgent, filterInstance, dateFrom, dateTo]);

  const fetchLogs = useCallback(async (reset = false) => {
    if (reset) {
      setLoading(true);
      setLogs([]);
    } else {
      setLoadingMore(true);
    }
    try {
      // Get filtered count
      if (reset) {
        const { count } = await buildQuery('id', { count: 'exact', head: true });
        setTotalCount(count || 0);
      }

      const currentOffset = reset ? 0 : logs.length;
      let query = buildQuery('*')
        .order('finalized_at', { ascending: false })
        .range(currentOffset, currentOffset + PAGE_SIZE - 1);

      const { data, error } = await query;
      if (error) throw error;

      const parsedLogs = (data || []).map((log: any) => ({
        ...log,
        messages: Array.isArray(log.messages) ? log.messages : []
      }));

      if (reset) {
        setLogs(parsedLogs);
      } else {
        setLogs(prev => [...prev, ...parsedLogs]);
      }
      setHasMore((data || []).length === PAGE_SIZE);
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [buildQuery, logs.length]);

  // Initial fetch
  useEffect(() => {
    fetchLogs(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch with debounce when server-side filters change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchLogs(true);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, phoneSearch, filterDepartment, filterAgent, filterInstance, dateFrom, dateTo]);

  // Message search is client-side (JSONB can't be easily filtered server-side via SDK)
  const displayLogs = logs.filter(log => {
    if (messageSearch && !log.messages.some((m: any) =>
      m.content?.toLowerCase().includes(messageSearch.toLowerCase())
    )) return false;
    if (filterCity) {
      const cidade = extractCidade(log.contact_notes || undefined);
      if (cidade !== filterCity) return false;
    }
    return true;
  });

  const hasActiveFilters = searchTerm || phoneSearch || messageSearch || filterDepartment || filterAgent || filterCity || filterInstance || dateFrom || dateTo;

  const clearFilters = () => {
    setSearchTerm('');
    setPhoneSearch('');
    setMessageSearch('');
    setFilterDepartment('');
    setFilterAgent('');
    setFilterCity('');
    setFilterInstance('');
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleGenerateAiReport = async () => {
    setAiReportLoading(true);
    setAiReport('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Sessão expirada. Faça login novamente.');
        return;
      }

      const response = await supabase.functions.invoke('ai-report-analysis', {
        body: { period: parseInt(aiReportPeriod) }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Erro ao gerar relatório');
      }

      const data = response.data;
      if (data?.error) {
        if (data.error.includes('Limite de requisições')) {
          toast.error('Limite de requisições excedido. Aguarde e tente novamente.');
        } else if (data.error.includes('Créditos')) {
          toast.error('Créditos insuficientes.');
        } else {
          toast.error(data.error);
        }
        return;
      }

      setAiReport(data.report || 'Nenhum relatório gerado.');
    } catch (err: any) {
      console.error('AI Report error:', err);
      toast.error(err.message || 'Erro ao gerar relatório');
    } finally {
      setAiReportLoading(false);
    }
  };

  const handleCopyReport = () => {
    navigator.clipboard.writeText(aiReport);
    setAiReportCopied(true);
    toast.success('Relatório copiado!');
    setTimeout(() => setAiReportCopied(false), 2000);
  };

  return (
    <MainLayout title="Histórico de Conversas">
      <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Histórico de Conversas</h1>
            <p className="text-muted-foreground">Registro de todas as conversas finalizadas</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => { setAiReportOpen(true); setAiReport(''); }}
              className="gap-2"
            >
              <Bot className="h-4 w-4" />
              IA de Relatórios
            </Button>
            <Badge variant="secondary" className="text-lg px-4 py-2">
              {totalCount} registros
            </Badge>
          </div>
        </div>

        {/* AI Report Dialog */}
        <Dialog open={aiReportOpen} onOpenChange={setAiReportOpen}>
          <DialogContent className="max-w-3xl h-[85vh] flex flex-col overflow-hidden">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                Relatório IA - Motivos de Contato (Suporte)
              </DialogTitle>
            </DialogHeader>
            
            <div className="flex items-center gap-3 py-3 flex-shrink-0">
              <Select value={aiReportPeriod} onValueChange={setAiReportPeriod}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Últimos 7 dias</SelectItem>
                  <SelectItem value="15">Últimos 15 dias</SelectItem>
                  <SelectItem value="30">Últimos 30 dias</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleGenerateAiReport} disabled={aiReportLoading} className="gap-2">
                {aiReportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                {aiReportLoading ? 'Analisando...' : 'Gerar Relatório'}
              </Button>
              {aiReport && (
                <div className="flex gap-2 ml-auto">
                  <Button variant="outline" size="sm" onClick={handleCopyReport} className="gap-1">
                    {aiReportCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {aiReportCopied ? 'Copiado' : 'Copiar'}
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1" onClick={async () => {
                    const html2pdf = (await import('html2pdf.js')).default;
                    const container = document.createElement('div');
                    container.style.cssText = 'position:absolute;left:0;top:0;width:800px;background:#fff;z-index:-1;opacity:0;pointer-events:none;';
                    container.innerHTML = `
                      <div style="font-family: Arial, Helvetica, sans-serif; padding: 30px; color: #000; line-height: 1.7; font-size: 13px; word-break: break-word;">
                        <style>
                          h1 { font-size: 20px; font-weight: bold; margin: 16px 0 8px; color: #000; }
                          h2 { font-size: 17px; font-weight: bold; margin: 14px 0 6px; color: #000; }
                          h3 { font-size: 15px; font-weight: 600; margin: 12px 0 4px; color: #000; }
                          strong { font-weight: 700; color: #000; }
                          ul, ol { padding-left: 24px; margin: 6px 0; }
                          li { margin-bottom: 4px; color: #222; }
                          table { width: 100%; border-collapse: collapse; margin: 10px 0; }
                          th, td { border: 1px solid #999; padding: 6px 10px; text-align: left; font-size: 12px; color: #000; }
                          th { background: #e8e8e8; font-weight: 600; }
                          hr { border: none; border-top: 1px solid #ccc; margin: 14px 0; }
                          p { margin: 0 0 6px; color: #111; }
                        </style>
                        ${renderMarkdown(aiReport)}
                      </div>`;
                    document.body.appendChild(container);
                    // Wait for browser to layout
                    await new Promise(r => setTimeout(r, 300));
                    try {
                      await html2pdf().set({
                        margin: [10, 10, 10, 10],
                        filename: `relatorio-ia-suporte-${format(new Date(), 'dd-MM-yyyy')}.pdf`,
                        image: { type: 'jpeg', quality: 0.98 },
                        html2canvas: { scale: 2, useCORS: true, scrollY: 0, scrollX: 0 },
                        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
                      }).from(container.firstElementChild).save();
                    } finally {
                      document.body.removeChild(container);
                    }
                  }}>
                    <FileDown className="h-4 w-4" />
                    Exportar PDF
                  </Button>
                </div>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-auto">
              {aiReportLoading && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-muted-foreground text-sm">Analisando conversas do Suporte...</p>
                  <p className="text-muted-foreground text-xs">Isso pode levar alguns segundos</p>
                </div>
              )}
              {aiReport && !aiReportLoading && (
                <div 
                  className="p-4 bg-muted/30 rounded-lg text-sm text-foreground leading-relaxed prose prose-sm prose-invert max-w-none
                    [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-3 [&_h1]:mt-4
                    [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-foreground
                    [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-3
                    [&_strong]:font-bold [&_strong]:text-foreground
                    [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1
                    [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1
                    [&_li]:text-foreground/90
                    [&_table]:w-full [&_table]:border-collapse [&_table]:my-3
                    [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:bg-muted [&_th]:text-left [&_th]:font-semibold
                    [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2
                    [&_hr]:border-border [&_hr]:my-4
                    [&_p]:mb-2"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(aiReport) }}
                />
              )}
              {!aiReport && !aiReportLoading && (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                  <Bot className="h-12 w-12 opacity-30" />
                  <p>Selecione o período e clique em "Gerar Relatório"</p>
                  <p className="text-xs">A IA analisará todas as conversas do Suporte no período selecionado</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Filters */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {/* Date From */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                  <Calendar className="mr-2 h-4 w-4" />
                  {dateFrom ? format(dateFrom, "dd/MM/yyyy", { locale: ptBR }) : "Data início"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={dateFrom}
                  onSelect={setDateFrom}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            {/* Date To */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                  <Calendar className="mr-2 h-4 w-4" />
                  {dateTo ? format(dateTo, "dd/MM/yyyy", { locale: ptBR }) : "Data fim"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={dateTo}
                  onSelect={setDateTo}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            {/* Instance (QR Code) */}
            <Select value={filterInstance} onValueChange={(v) => setFilterInstance(v === '_all' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Número (QR Code)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos números</SelectItem>
                {allInstances.map(i => (
                  <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Clear */}
            {hasActiveFilters && (
              <Button variant="ghost" size="icon" onClick={clearFilters} className="shrink-0 h-10 w-10">
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar contato..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Telefone..."
                value={phoneSearch}
                onChange={(e) => setPhoneSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="relative">
              <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar nas mensagens..."
                value={messageSearch}
                onChange={(e) => setMessageSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterDepartment} onValueChange={(v) => setFilterDepartment(v === '_all' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Departamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos departamentos</SelectItem>
                {allDepartments.map(d => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterAgent} onValueChange={(v) => setFilterAgent(v === '_all' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Atendente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos atendentes</SelectItem>
                {allAgents.map(a => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterCity} onValueChange={(v) => setFilterCity(v === '_all' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Cidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todas cidades</SelectItem>
                {allCities.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Logs List */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : displayLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <MessageSquare className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg">Nenhum registro encontrado</p>
          </div>
        ) : (
          <div className="space-y-4">
            {displayLogs.map((log) => {
              const realChannel = log.contact_notes?.includes('franqueado:') 
                ? 'machine' : (log.channel || 'whatsapp');
              const cidade = extractCidade(log.contact_notes || undefined);

              const channelConfig = {
                whatsapp: { icon: MessageCircle, color: 'bg-green-500', label: 'WhatsApp', badgeClass: 'bg-green-100 text-green-700 border-green-200' },
                instagram: { icon: Instagram, color: 'bg-pink-500', label: 'Instagram', badgeClass: 'bg-pink-100 text-pink-700 border-pink-200' },
                machine: { icon: Bike, color: 'bg-orange-500', label: 'Machine', badgeClass: 'bg-orange-100 text-orange-700 border-orange-200' },
              }[realChannel] || { icon: MessageCircle, color: 'bg-green-500', label: 'WhatsApp', badgeClass: 'bg-green-100 text-green-700 border-green-200' };

              const ChannelIcon = channelConfig.icon;

              return (
              <div
                key={log.id}
                className="bg-card border border-border rounded-xl overflow-hidden"
              >
                {/* Log Header */}
                <div
                  className="p-3 cursor-pointer hover:bg-secondary/50 transition-colors"
                  onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                          {getInitials(log.contact_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className={cn(
                        'absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center border-2 border-card',
                        channelConfig.color
                      )}>
                        <ChannelIcon className="w-2.5 h-2.5 text-white" />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0 space-y-1">
                      {/* Line 1: Name + Protocol + Priority */}
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground text-sm truncate">
                          {log.contact_name}
                        </h3>
                        {log.protocol && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                            📋 {log.protocol}
                          </span>
                        )}
                        <span className={cn(
                          'text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0',
                          log.priority === 'urgent' ? 'bg-red-500/20 text-red-400' :
                          log.priority === 'high' ? 'bg-orange-500/20 text-orange-400' :
                          'bg-orange-500/20 text-orange-400'
                        )}>
                          {log.priority}
                        </span>
                      </div>

                      {/* Line 2: Channel + City pills */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={cn(
                          'inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full',
                          realChannel === 'whatsapp' ? 'bg-[#25D366]/20 text-[#25D366]' :
                          realChannel === 'instagram' ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-pink-400' :
                          'bg-orange-500/20 text-orange-400'
                        )}>
                          <ChannelIcon className="w-3 h-3" />
                          {channelConfig.label}
                        </span>
                        {realChannel === 'machine' && cidade && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                            <MapPin className="w-3 h-3" />
                            {cidade}
                          </span>
                        )}
                      </div>

                      {/* Line 3: Metadata */}
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                        {log.department_name && (
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {log.department_name}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          {log.total_messages}
                        </span>
                      </div>
                    </div>

                    {/* Right side: date + finalized by */}
                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(log.finalized_at)}
                      </div>
                      {log.finalized_by_name && (
                        <p className="text-[11px] text-muted-foreground">
                          Finalizado por: {log.finalized_by_name}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Messages */}
                {expandedLog === log.id && (
                  <div className="border-t border-border bg-secondary/30">
                    <div className="p-4">
                      <div className="flex items-center gap-4 mb-4 text-sm flex-wrap">
                        <span className="text-muted-foreground">
                          Início: {formatDate(log.started_at)}
                        </span>
                        <span className="text-muted-foreground">
                          Fim: {formatDate(log.finalized_at)}
                        </span>
                        {log.assigned_to_name && (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <User className="w-3 h-3" />
                            Atendente: {log.assigned_to_name}
                          </span>
                        )}
                        {log.finalized_by_name && (
                          <span className="text-muted-foreground">
                            Finalizado por: {log.finalized_by_name}
                          </span>
                        )}
                        {log.tags.length > 0 && (
                          <div className="flex gap-1">
                            {log.tags.map(tag => (
                              <Badge key={tag} variant="outline" className={`text-xs ${getTagColorClasses(tag)}`}>
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      <ScrollArea className="h-[400px]">
                        <div className="space-y-3 pr-4">
                          {log.messages.map((msg: any, index: number) => {
                            const senderId = msg.senderId || msg.sender_id || null;
                            const senderName = msg.senderName || msg.sender_name || '';
                            const msgType = msg.type || msg.message_type || 'text';
                            const msgTimestamp = msg.timestamp || msg.created_at;

                            const isSystem = msgType === 'system' || senderName === 'SYSTEM' || senderName === '[SISTEMA]';
                            const isContact = !isSystem && (senderId === 'contact' || !senderId);

                            if (isSystem) {
                              return (
                                <div key={msg.id || index} className="flex justify-center">
                                  <p className="text-xs text-muted-foreground italic px-3 py-1">
                                    {msg.content}
                                  </p>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={msg.id || index}
                                className={cn(
                                  'flex gap-3',
                                  isContact ? 'justify-start' : 'justify-end'
                                )}
                              >
                                {isContact && (
                                  <Avatar className="h-8 w-8 shrink-0">
                                    <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                                      {getInitials(log.contact_name)}
                                    </AvatarFallback>
                                  </Avatar>
                                )}

                                <div className={cn('max-w-[70%]', !isContact && 'order-1')}>
                                  <p className={cn(
                                    'text-xs font-medium text-muted-foreground mb-1',
                                    isContact ? 'text-left' : 'text-right'
                                  )}>
                                    {isContact ? log.contact_name : senderName}
                                  </p>
                                  <div
                                    className={cn(
                                      'px-4 py-2 rounded-2xl',
                                      isContact
                                        ? 'bg-secondary text-foreground rounded-bl-md'
                                        : 'bg-primary text-primary-foreground rounded-br-md'
                                    )}
                                  >
                                    {(() => {
                                      try {
                                        const parsed = JSON.parse(msg.content);
                                        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].url) {
                                          return <MessageAttachment attachments={parsed} />;
                                        }
                                      } catch {}
                                      return <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>;
                                    })()}
                                  </div>
                                  <p className={cn(
                                    'mt-1 text-[10px] text-muted-foreground',
                                    isContact ? 'text-left' : 'text-right'
                                  )}>
                                    {formatTime(msgTimestamp)}
                                  </p>
                                </div>

                                {!isContact && (
                                  <Avatar className="h-8 w-8 shrink-0">
                                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                                      {getInitials(senderName || 'U')}
                                    </AvatarFallback>
                                  </Avatar>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                )}
              </div>
              );
            })}
            {hasMore && !messageSearch && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  onClick={() => fetchLogs(false)}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full mr-2" />
                  ) : null}
                  Carregar mais registros
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
