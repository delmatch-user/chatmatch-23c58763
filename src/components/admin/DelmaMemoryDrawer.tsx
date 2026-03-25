import { useState, useMemo } from 'react';
import { Brain, Search, Database, MessageSquare, Trash2, RefreshCw, ChevronDown, ChevronRight, Ban, Clock, AlertTriangle } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface DelmaMemoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memories: any[];
  onMemoriesUpdate: () => void;
}

const keyTranslations: Record<string, string> = {
  total_conversations: 'Total de Conversas',
  avg_response_time: 'Tempo Médio de Resposta',
  satisfaction_rate: 'Taxa de Satisfação',
  resolution_rate: 'Taxa de Resolução',
  period_days: 'Período (dias)',
  robot_name: 'Nome do Robô',
  robot_id: 'ID do Robô',
  department: 'Departamento',
  agent_name: 'Nome do Atendente',
  agent_id: 'ID do Atendente',
  metric: 'Métrica',
  current_value: 'Valor Atual',
  suggested_value: 'Valor Sugerido',
  suggestion_id: 'ID da Sugestão',
  decision: 'Decisão',
  reason: 'Motivo',
  reject_reason: 'Motivo da Rejeição',
  category: 'Categoria',
  title: 'Título',
  summary: 'Resumo',
  status: 'Status',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  confidence_score: 'Pontuação de Confiança',
  created_at: 'Criado em',
  total_messages: 'Total de Mensagens',
  avg_wait_time: 'Tempo Médio de Espera',
  conversations_finalized: 'Conversas Finalizadas',
  top_tags: 'Tags Principais',
  avg_tma: 'TMA Médio',
  avg_tme: 'TME Médio',
};

const sourceAreaMap: Record<string, string> = {
  robot_training: 'Treinamento',
  agent_goals: 'Metas',
  report_schedule: 'Relatórios',
  brain_analysis: 'Relatórios',
  training_feedback: 'Treinamento',
  goal_feedback: 'Metas',
  error: 'Erros',
};

function getAreaFromSource(source: string): string {
  for (const [key, val] of Object.entries(sourceAreaMap)) {
    if (source.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return 'Outros';
}

function getMemoryTitle(memory: any): string {
  if (memory.source && memory.source.length > 0 && memory.source !== '') {
    const area = getAreaFromSource(memory.source);
    if (area !== 'Outros') return `${area} — ${memory.source.replace(/_/g, ' ')}`;
    return memory.source.replace(/_/g, ' ');
  }
  const content = memory.content;
  if (typeof content === 'object' && content !== null) {
    if (content.summary) return String(content.summary).substring(0, 80);
    if (content.title) return String(content.title).substring(0, 80);
    if (content.category) return String(content.category).replace(/_/g, ' ');
  }
  return 'Memória sem título';
}

function renderContentReadable(content: any, depth = 0): JSX.Element {
  if (content === null || content === undefined) return <span className="text-muted-foreground italic">vazio</span>;
  if (typeof content === 'boolean') return <span className="text-primary">{content ? 'Sim' : 'Não'}</span>;
  if (typeof content === 'number') return <span className="text-primary font-medium">{content}</span>;
  if (typeof content === 'string') return <span className="text-foreground">{content}</span>;
  if (Array.isArray(content)) {
    if (content.length === 0) return <span className="text-muted-foreground italic">lista vazia</span>;
    return (
      <div className={cn("space-y-1", depth > 0 && "ml-3")}>
        {content.map((item, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-muted-foreground">•</span>
            {renderContentReadable(item, depth + 1)}
          </div>
        ))}
      </div>
    );
  }
  if (typeof content === 'object') {
    const entries = Object.entries(content);
    if (entries.length === 0) return <span className="text-muted-foreground italic">vazio</span>;
    return (
      <div className={cn("space-y-1.5", depth > 0 && "ml-3 border-l border-border/50 pl-3")}>
        {entries.map(([key, value]) => {
          const translatedKey = keyTranslations[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          return (
            <div key={key}>
              <span className="text-xs font-medium text-muted-foreground">{translatedKey}: </span>
              {renderContentReadable(value, depth + 1)}
            </div>
          );
        })}
      </div>
    );
  }
  return <span>{String(content)}</span>;
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function DelmaMemoryDrawer({ open, onOpenChange, memories, onMemoriesUpdate }: DelmaMemoryDrawerProps) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterArea, setFilterArea] = useState('all');
  const [filterWeight, setFilterWeight] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
  const [visibleCount, setVisibleCount] = useState(20);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const dataSignals = memories.filter(m => m.type === 'data_signal').length;
  const feedbackSignals = memories.filter(m => m.type === 'manager_feedback').length;
  const latestTimestamp = memories.length > 0 ? new Date(memories[0].created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

  const filtered = useMemo(() => {
    let result = [...memories];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(m => JSON.stringify(m.content).toLowerCase().includes(q) || (m.source || '').toLowerCase().includes(q));
    }
    if (filterType !== 'all') result = result.filter(m => m.type === filterType);
    if (filterArea !== 'all') result = result.filter(m => getAreaFromSource(m.source || '') === filterArea);
    if (filterWeight === 'high') result = result.filter(m => m.weight >= 0.8);
    else if (filterWeight === 'medium') result = result.filter(m => m.weight >= 0.4 && m.weight < 0.8);
    else if (filterWeight === 'low') result = result.filter(m => m.weight < 0.4);

    // Exclude "learned to avoid" from main list
    result = result.filter(m => m.weight > 0.1);

    if (sortBy === 'recent') result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    else if (sortBy === 'weight_high') result.sort((a, b) => b.weight - a.weight);
    else if (sortBy === 'weight_low') result.sort((a, b) => a.weight - b.weight);
    else if (sortBy === 'expiring') result.sort((a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime());

    return result;
  }, [memories, search, filterType, filterArea, filterWeight, sortBy]);

  const learnedToAvoid = memories.filter(m => m.weight <= 0.1);
  const expiringMemories = memories.filter(m => daysUntil(m.expires_at) <= 7 && daysUntil(m.expires_at) > 0 && m.weight > 0.1);

  const visibleMemories = filtered.slice(0, visibleCount);

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const forgetMemory = async (id: string) => {
    const { error } = await supabase.from('delma_memory' as any).update({ expires_at: new Date().toISOString() } as any).eq('id', id);
    if (error) { toast.error('Erro ao esquecer memória'); return; }
    toast.success('Memória esquecida');
    onMemoriesUpdate();
  };

  const renewMemory = async (id: string) => {
    const newDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from('delma_memory' as any).update({ expires_at: newDate } as any).eq('id', id);
    if (error) { toast.error('Erro ao renovar'); return; }
    toast.success('Memória renovada por +90 dias');
    onMemoriesUpdate();
  };

  const rehabilitateMemory = async (id: string) => {
    const { error } = await supabase.from('delma_memory' as any).update({ weight: 0.5 } as any).eq('id', id);
    if (error) { toast.error('Erro ao reabilitar'); return; }
    toast.success('Memória reabilitada');
    onMemoriesUpdate();
  };

  const WeightBar = ({ weight }: { weight: number }) => {
    const color = weight >= 0.8 ? 'bg-success' : weight >= 0.4 ? 'bg-warning' : 'bg-destructive';
    return (
      <div className="w-16 h-1.5 rounded-full bg-secondary">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.max(weight * 100, 5)}%` }} />
      </div>
    );
  };

  const MemoryCard = ({ memory }: { memory: any }) => {
    const isExpanded = expandedIds.has(memory.id);
    const isDataSignal = memory.type === 'data_signal';
    const area = getAreaFromSource(memory.source || '');
    const days = daysUntil(memory.expires_at);

    return (
      <Collapsible open={isExpanded} onOpenChange={() => toggleExpanded(memory.id)}>
        <div className="rounded-lg border border-border/50 bg-secondary/20 hover:bg-secondary/40 transition-colors">
          <CollapsibleTrigger className="w-full p-3 flex items-center gap-3 text-left">
            <span className="text-lg shrink-0">{isDataSignal ? '📊' : '💬'}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium truncate">{getMemoryTitle(memory)}</span>
                <Badge variant="outline" className="text-[10px]">{area}</Badge>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <WeightBar weight={memory.weight} />
                <span className="text-[10px] text-muted-foreground">
                  {new Date(memory.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                </span>
                <span className={cn("text-[10px]", days <= 7 ? "text-warning" : "text-muted-foreground")}>
                  Expira em {days}d
                </span>
              </div>
            </div>
            {isExpanded ? <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-3 pb-3 space-y-3 border-t border-border/30 pt-3">
              <div className="text-sm">{renderContentReadable(memory.content)}</div>

              {memory.type === 'manager_feedback' && memory.content && (
                <div className="p-2 rounded bg-secondary/40 space-y-1">
                  {memory.content.decision && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">Decisão:</span>
                      <Badge variant={memory.content.decision === 'approved' ? 'default' : 'secondary'} className="text-[10px]">
                        {memory.content.decision === 'approved' ? '✅ Aprovado' : '❌ Rejeitado'}
                      </Badge>
                    </div>
                  )}
                  {memory.content.reason && <p className="text-xs text-muted-foreground italic">"{memory.content.reason}"</p>}
                </div>
              )}

              <div className="flex justify-end">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive text-xs gap-1.5">
                      <Trash2 className="w-3 h-3" /> Esquecer esta memória
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Esquecer memória?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Tem certeza? A Delma perderá este aprendizado e pode sugerir esse tipo de ação novamente.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => forgetMemory(memory.id)}>Confirmar</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[600px] overflow-y-auto p-0">
        <div className="p-6 space-y-5">
          <SheetHeader className="space-y-1">
            <SheetTitle className="text-lg flex items-center gap-2">🧠 O que a Delma sabe</SheetTitle>
            <SheetDescription className="text-xs">
              {memories.length} memórias ativas · Última atualização: {latestTimestamp}
            </SheetDescription>
          </SheetHeader>

          {/* Mini cards */}
          <div className="grid grid-cols-3 gap-2">
            <Card><CardContent className="p-3 text-center">
              <p className="text-xl font-bold">{memories.length}</p>
              <p className="text-[10px] text-muted-foreground">Total</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <p className="text-xl font-bold">{dataSignals}</p>
              <p className="text-[10px] text-muted-foreground">📊 Dados</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <p className="text-xl font-bold">{feedbackSignals}</p>
              <p className="text-[10px] text-muted-foreground">💬 Feedbacks</p>
            </CardContent></Card>
          </div>

          {/* Search + Filters */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <Input placeholder="Buscar nas memórias..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="data_signal">Sinais de Dados</SelectItem>
                  <SelectItem value="manager_feedback">Feedbacks</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterArea} onValueChange={setFilterArea}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as áreas</SelectItem>
                  <SelectItem value="Treinamento">Treinamento</SelectItem>
                  <SelectItem value="Metas">Metas</SelectItem>
                  <SelectItem value="Relatórios">Relatórios</SelectItem>
                  <SelectItem value="Erros">Erros</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterWeight} onValueChange={setFilterWeight}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os pesos</SelectItem>
                  <SelectItem value="high">Alta (≥0.8)</SelectItem>
                  <SelectItem value="medium">Média (0.4–0.79)</SelectItem>
                  <SelectItem value="low">Baixa (&lt;0.4)</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Mais recentes</SelectItem>
                  <SelectItem value="weight_high">Maior peso</SelectItem>
                  <SelectItem value="weight_low">Menor peso</SelectItem>
                  <SelectItem value="expiring">Próximas a expirar</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Main list */}
          {memories.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <Brain className="w-12 h-12 mx-auto text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">A Delma ainda não acumulou memórias.</p>
              <p className="text-xs text-muted-foreground/70">Comece aprovando ou rejeitando sugestões na aba Sugestões.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleMemories.map(m => <MemoryCard key={m.id} memory={m} />)}
              {filtered.length > visibleCount && (
                <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => setVisibleCount(prev => prev + 20)}>
                  Carregar mais ({filtered.length - visibleCount} restantes)
                </Button>
              )}
              {filtered.length === 0 && memories.length > 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhuma memória corresponde aos filtros.</p>
              )}
            </div>
          )}

          {/* Learned to avoid */}
          {learnedToAvoid.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border/50">
              <h3 className="text-sm font-medium flex items-center gap-2"><Ban className="w-4 h-4 text-destructive" /> O que a Delma aprendeu a evitar</h3>
              {learnedToAvoid.map(m => (
                <div key={m.id} className="p-2.5 rounded-lg bg-destructive/5 border border-destructive/10 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{getMemoryTitle(m)}</p>
                    {m.content?.reason && <p className="text-xs text-muted-foreground italic mt-0.5">"{m.content.reason}"</p>}
                  </div>
                  <Button variant="outline" size="sm" className="text-xs shrink-0" onClick={() => rehabilitateMemory(m.id)}>
                    <RefreshCw className="w-3 h-3 mr-1" /> Reabilitar
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Expiring soon */}
          {expiringMemories.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border/50">
              <h3 className="text-sm font-medium flex items-center gap-2"><Clock className="w-4 h-4 text-warning" /> Memórias próximas de expirar</h3>
              {expiringMemories.map(m => (
                <div key={m.id} className="p-2.5 rounded-lg bg-warning/5 border border-warning/10 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{getMemoryTitle(m)}</p>
                    <Badge variant="outline" className="text-[10px] border-warning/30 text-warning mt-1">
                      <AlertTriangle className="w-2.5 h-2.5 mr-1" /> Expira em {daysUntil(m.expires_at)}d
                    </Badge>
                  </div>
                  <Button variant="outline" size="sm" className="text-xs shrink-0" onClick={() => renewMemory(m.id)}>
                    <RefreshCw className="w-3 h-3 mr-1" /> Renovar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
