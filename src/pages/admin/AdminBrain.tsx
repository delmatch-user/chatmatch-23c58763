import { useState, useEffect, useCallback, useRef } from 'react';
import { Brain, TrendingUp, TrendingDown, Clock, Users, Bot, AlertTriangle, Sparkles, RefreshCw, MessageSquare, Lightbulb, Activity, Store, Bike, BookOpen, Link2, FileText, CheckCircle2, XCircle, Zap } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn, priorityLabel } from '@/lib/utils';

interface AgentStat {
  name: string;
  count: number;
  avgTime: number;
  avgWaitTime: number;
  topTags: [string, number][];
  prevCount: number;
  prevAvgTime: number;
}

interface ErrorLog {
  id: string;
  contact_name: string;
  contact_phone: string | null;
  contact_notes: string | null;
  priority: string;
  tags: string[];
  channel: string | null;
  assigned_to_name: string | null;
  finalized_at: string;
  started_at: string;
}

interface ErrorTypeGroup {
  total: number;
  motivos: Record<string, number>;
  logs: ErrorLog[];
}

interface BrainMetrics {
  period: number;
  totalConversas: number;
  prevTotalConversas: number;
  tma: number;
  prevTma: number;
  tme: number;
  prevTme: number;
  aiResolved: number;
  humanResolved: number;
  topTags: [string, number][];
  channelCounts: Record<string, number>;
  priorityCounts: Record<string, number>;
  agentStats: AgentStat[];
  errorLogs: ErrorLog[];
  errorsByType?: {
    estabelecimento: ErrorTypeGroup;
    motoboy: ErrorTypeGroup;
    outros: ErrorTypeGroup;
  };
}

const TAG_NORMALIZATION: Record<string, string> = {
  'OPERACIONAL_PENDENTE': 'Operacional - Pendente',
  'ACIDENTE_URGENTE': 'Acidente - Urgente',
  'FINANCEIRO_NORMAL': 'Financeiro - Normal',
  'DUVIDA_GERAL': 'Duvida - Geral',
  'COMERCIAL_B2B': 'Comercial - B2B',
};

const normalizeTag = (tag: string): string => {
  const clean = tag.replace(/^[🔴🟡🟢🔵⚪◆◇●○■□▪▫✦✧⬥⬦♦️◈]\s*/, '').trim();
  return TAG_NORMALIZATION[clean] || clean;
};

const normalizeTopTags = (tags: [string, number][]): [string, number][] => {
  const merged: Record<string, number> = {};
  tags.forEach(([tag, count]) => {
    const normalized = normalizeTag(tag);
    merged[normalized] = (merged[normalized] || 0) + count;
  });
  return Object.entries(merged).sort((a, b) => b[1] - a[1]) as [string, number][];
};

const normalizeMotivos = (motivos: Record<string, number>): Record<string, number> => {
  const merged: Record<string, number> = {};
  Object.entries(motivos).forEach(([tag, count]) => {
    const normalized = normalizeTag(tag);
    merged[normalized] = (merged[normalized] || 0) + count;
  });
  return merged;
};

const normalizeErrorTypeGroup = (group: ErrorTypeGroup): ErrorTypeGroup => ({
  ...group,
  motivos: normalizeMotivos(group.motivos),
  logs: group.logs.map(l => ({ ...l, tags: l.tags.map(normalizeTag) })),
});

const filterMetrics = (raw: any): BrainMetrics => ({
  ...raw,
  agentStats: (raw.agentStats || []).filter((a: AgentStat) =>
    !a.name.toLowerCase().includes('fábio') && !a.name.toLowerCase().includes('fabio') && !a.name.toLowerCase().includes('arthur')
  ),
  topTags: normalizeTopTags(raw.topTags || []),
  errorLogs: (raw.errorLogs || []).map((l: ErrorLog) => ({ ...l, tags: l.tags.map(normalizeTag) })),
  errorsByType: raw.errorsByType ? {
    estabelecimento: normalizeErrorTypeGroup(raw.errorsByType.estabelecimento),
    motoboy: normalizeErrorTypeGroup(raw.errorsByType.motoboy),
    outros: normalizeErrorTypeGroup(raw.errorsByType.outros),
  } : undefined,
});

const AdminBrain = () => {
  const [period, setPeriod] = useState('7');
  const [metrics, setMetrics] = useState<BrainMetrics | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [activeTab, setActiveTab] = useState('overview');
  const [errorsSubTab, setErrorsSubTab] = useState('todos');
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMetrics = useCallback(async (showToast = false) => {
    setLoadingMetrics(true);
    try {
      const { data, error } = await supabase.functions.invoke('brain-analysis', {
        body: { period: parseInt(period), metricsOnly: true },
      });
      if (error) throw error;
      setMetrics(filterMetrics(data.metrics));
      setLastUpdated(new Date());
      if (showToast) toast.success('Métricas atualizadas!');
    } catch (e: any) {
      console.error(e);
      if (showToast) toast.error('Erro ao carregar métricas');
    } finally {
      setLoadingMetrics(false);
    }
  }, [period]);

  const fetchReport = async () => {
    setLoadingReport(true);
    try {
      const { data, error } = await supabase.functions.invoke('brain-analysis', {
        body: { period: parseInt(period) },
      });
      if (error) throw error;
      setMetrics(filterMetrics(data.metrics));
      setAiAnalysis(data.aiAnalysis);
      setLastUpdated(new Date());
      toast.success('Relatório da Delma gerado!');
    } catch (e: any) {
      console.error(e);
      toast.error('Erro ao gerar relatório: ' + (e.message || 'Erro desconhecido'));
    } finally {
      setLoadingReport(false);
    }
  };

  // Auto-fetch on mount and period change
  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  // Polling every 30s
  useEffect(() => {
    intervalRef.current = setInterval(() => fetchMetrics(), 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchMetrics]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('brain-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_logs' }, () => {
        fetchMetrics();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchMetrics]);

  const getTrend = (current: number, previous: number, inverted = false) => {
    if (previous === 0) return null;
    const diff = ((current - previous) / previous) * 100;
    const isPositive = inverted ? diff < 0 : diff > 0;
    return { diff: Math.abs(Math.round(diff)), isPositive };
  };

  const formatTime = (minutes: number) => {
    if (minutes < 1) return `${Math.round(minutes * 60)}s`;
    if (minutes < 60) return `${Math.round(minutes)}min`;
    return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}min`;
  };

  const priorityColors: Record<string, string> = {
    low: 'bg-muted text-muted-foreground',
    normal: 'bg-primary/20 text-primary',
    high: 'bg-warning/20 text-warning',
    urgent: 'bg-destructive/20 text-destructive',
  };

  // Compute Delma's learnings from metrics
  const learnings = metrics ? computeLearnings(metrics) : [];

  return (
    <MainLayout>
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Header — Delma Persona */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg relative">
              <Brain className="w-7 h-7 text-primary-foreground" />
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success rounded-full border-2 border-background animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Delma</h1>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Activity className="w-3 h-3 text-success" />
                Online — Monitorando o suporte em tempo real
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-muted-foreground">
                Atualizado: {lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="15">15 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => fetchMetrics(true)} disabled={loadingMetrics}>
              <RefreshCw className={cn("w-4 h-4", loadingMetrics && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* Loading skeleton */}
        {!metrics && loadingMetrics && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Card key={i}><CardContent className="pt-6 h-28 animate-pulse bg-muted/30 rounded-lg" /></Card>
            ))}
          </div>
        )}

        {metrics && (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
             <TabsList className="mb-4">
              <TabsTrigger value="overview">Painel</TabsTrigger>
              <TabsTrigger value="errors">Erros & Gaps</TabsTrigger>
              <TabsTrigger value="agents">Atendentes</TabsTrigger>
              <TabsTrigger value="ai-report">Relatório IA</TabsTrigger>
            </TabsList>

            {/* Painel Tab */}
            <TabsContent value="overview" className="space-y-6">
              {/* KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard title="Total Conversas" value={metrics.totalConversas} icon={MessageSquare} trend={getTrend(metrics.totalConversas, metrics.prevTotalConversas)} />
                <KPICard title="TMA" value={formatTime(metrics.tma)} icon={Clock} trend={getTrend(metrics.tma, metrics.prevTma, true)} subtitle="Tempo médio de atendimento" />
                <KPICard title="TME" value={formatTime(metrics.tme)} icon={Clock} trend={getTrend(metrics.tme, metrics.prevTme, true)} subtitle="Tempo médio de espera" />
                <KPICard
                  title="Resolução IA"
                  value={metrics.aiResolved + metrics.humanResolved > 0 ? `${Math.round((metrics.aiResolved / (metrics.aiResolved + metrics.humanResolved)) * 100)}%` : '0%'}
                  icon={Bot}
                  subtitle={`${metrics.aiResolved} IA / ${metrics.humanResolved} humano`}
                />
              </div>

              {/* Delma's Learnings */}
              {learnings.length > 0 && (
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Lightbulb className="w-4 h-4 text-primary" />
                      O que a Delma anda aprendendo
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {learnings.map((insight, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-primary mt-0.5">•</span>
                          <span className="text-muted-foreground">{insight}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Agent Performance + Top Tags */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Performance dos Agentes
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {metrics.agentStats.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sem dados de agentes no período.</p>
                    ) : (
                      <div className="space-y-3">
                        {metrics.agentStats.slice(0, 8).map((agent) => (
                          <div key={agent.name} className="flex items-center justify-between p-2 rounded-lg bg-secondary/30">
                            <span className="text-sm font-medium truncate">{agent.name}</span>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span>{agent.count} conversas</span>
                              <span>TMA: {formatTime(agent.avgTime)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Top Classificações</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {metrics.topTags.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sem tags no período.</p>
                    ) : (
                      <div className="space-y-2">
                        {metrics.topTags.map(([tag, count]) => {
                          const maxCount = metrics.topTags[0][1];
                          const percentage = (count / maxCount) * 100;
                          return (
                            <div key={tag} className="space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <span className="truncate">{tag}</span>
                                <span className="text-muted-foreground ml-2">{count}</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-secondary">
                                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percentage}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Channel & Priority */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader><CardTitle className="text-base">Por Canal</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(metrics.channelCounts).map(([channel, count]) => (
                        <Badge key={channel} variant="secondary" className="text-sm">{channel}: {count}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">Por Prioridade</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(metrics.priorityCounts).map(([priority, count]) => (
                        <Badge key={priority} className={cn("text-sm", priorityColors[priority] || 'bg-muted text-muted-foreground')}>{priorityLabel(priority)}: {count}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Errors Tab */}
            <TabsContent value="errors" className="space-y-6">
              {/* Sub-tabs */}
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { key: 'todos', label: 'Todos', icon: AlertTriangle, count: metrics.errorLogs.length },
                  { key: 'estabelecimento', label: 'Estabelecimento', icon: Store, count: metrics.errorsByType?.estabelecimento.total || 0 },
                  { key: 'motoboy', label: 'Motoboy', icon: Bike, count: metrics.errorsByType?.motoboy.total || 0 },
                ].map(tab => (
                  <Button
                    key={tab.key}
                    variant={errorsSubTab === tab.key ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setErrorsSubTab(tab.key)}
                    className="gap-2"
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                    <Badge variant="secondary" className="text-xs ml-1">{tab.count}</Badge>
                  </Button>
                ))}
              </div>

              {/* Motivos Chart */}
              {(() => {
                const motivos = errorsSubTab === 'todos'
                  ? mergeMotivos(metrics.errorsByType)
                  : (metrics.errorsByType?.[errorsSubTab as 'estabelecimento' | 'motoboy']?.motivos || {});
                const chartData = Object.entries(motivos)
                  .map(([name, value]) => ({ name, value: value as number }))
                  .sort((a, b) => b.value - a.value);
                const barColors: Record<string, string> = {
                  'Acidente - Urgente': 'hsl(0, 72%, 51%)',
                  'Operacional - Pendente': 'hsl(25, 95%, 53%)',
                  'Financeiro - Normal': 'hsl(217, 91%, 60%)',
                  'Duvida - Geral': 'hsl(160, 84%, 39%)',
                  'Comercial - B2B': 'hsl(48, 96%, 53%)',
                };
                return chartData.length > 0 ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Principais Motivos</CardTitle>
                      <CardDescription>
                        Distribuição das tags de taxonomia nas conversas problemáticas
                        {errorsSubTab !== 'todos' && ` — ${errorsSubTab === 'estabelecimento' ? 'Estabelecimento' : 'Motoboy'}`}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                            <XAxis type="number" className="text-xs" />
                            <YAxis dataKey="name" type="category" width={150} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                            <Tooltip
                              contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                              labelStyle={{ color: 'hsl(var(--foreground))' }}
                            />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                              {chartData.map((entry, idx) => (
                                <Cell key={idx} fill={barColors[entry.name] || 'hsl(var(--primary))'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                ) : null;
              })()}

              {/* Error Logs Summary */}
              {(() => {
                const filteredLogs = errorsSubTab === 'todos'
                  ? metrics.errorLogs
                  : (metrics.errorsByType?.[errorsSubTab as 'estabelecimento' | 'motoboy']?.logs || []);

                if (filteredLogs.length === 0) {
                  return (
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-center py-8">
                          <AlertTriangle className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                          <p className="text-sm text-muted-foreground">Nenhuma conversa problemática encontrada. 🎉</p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                }

                // Summarize by priority
                const byPriority: Record<string, number> = {};
                filteredLogs.forEach(l => { byPriority[l.priority] = (byPriority[l.priority] || 0) + 1; });

                // Summarize by tag
                const byTag: Record<string, number> = {};
                filteredLogs.forEach(l => l.tags.forEach(t => { byTag[t] = (byTag[t] || 0) + 1; }));
                const topErrorTags = Object.entries(byTag).sort((a, b) => b[1] - a[1]).slice(0, 5);

                // Summarize by agent
                const byAgent: Record<string, number> = {};
                filteredLogs.filter(l => l.assigned_to_name).forEach(l => {
                  byAgent[l.assigned_to_name!] = (byAgent[l.assigned_to_name!] || 0) + 1;
                });
                const topErrorAgents = Object.entries(byAgent).sort((a, b) => b[1] - a[1]).slice(0, 5);

                // Summarize by channel
                const byChannel: Record<string, number> = {};
                filteredLogs.forEach(l => { const ch = l.channel || 'whatsapp'; byChannel[ch] = (byChannel[ch] || 0) + 1; });

                return (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-destructive" />
                        Resumo — Conversas Problemáticas
                      </CardTitle>
                      <CardDescription>
                        {filteredLogs.length} conversa{filteredLogs.length !== 1 ? 's' : ''} com alta prioridade, erros ou reclamações
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      {/* Priority breakdown */}
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Por Prioridade</p>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(byPriority).sort((a, b) => b[1] - a[1]).map(([priority, count]) => (
                            <Badge key={priority} className={cn("text-sm gap-1", priorityColors[priority] || 'bg-muted text-muted-foreground')}>
                              {priorityLabel(priority)} <span className="font-bold">{count}</span>
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {/* Tags breakdown */}
                      {topErrorTags.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Principais Tags</p>
                          <div className="space-y-1.5">
                            {topErrorTags.map(([tag, count]) => {
                              const pct = (count / filteredLogs.length) * 100;
                              return (
                                <div key={tag} className="flex items-center gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between text-sm mb-0.5">
                                      <span className="truncate">{tag}</span>
                                      <span className="text-muted-foreground text-xs ml-2">{count} ({Math.round(pct)}%)</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-secondary">
                                      <div className="h-full rounded-full bg-destructive/70 transition-all" style={{ width: `${pct}%` }} />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Agent + Channel row */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {topErrorAgents.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Agentes mais envolvidos</p>
                            <div className="space-y-1">
                              {topErrorAgents.map(([name, count]) => (
                                <div key={name} className="flex items-center justify-between text-sm p-1.5 rounded bg-secondary/30">
                                  <span className="truncate">{name}</span>
                                  <span className="text-muted-foreground font-medium">{count}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Por Canal</p>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(byChannel).map(([ch, count]) => (
                              <Badge key={ch} variant="outline" className="text-sm">{ch}: {count}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}
            </TabsContent>

            {/* Agents Tab */}
            <TabsContent value="agents" className="space-y-6">
              {/* TMA Comparison Chart */}
              {metrics.agentStats.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Comparativo de TMA por Atendente
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={metrics.agentStats.slice(0, 10)} layout="vertical" margin={{ left: 20, right: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                          <XAxis type="number" className="text-xs" />
                          <YAxis dataKey="name" type="category" width={120} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                          <Tooltip
                            contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                            formatter={(value: number) => [`${value} min`, 'TMA']}
                          />
                          <Bar dataKey="avgTime" radius={[0, 4, 4, 0]}>
                            {metrics.agentStats.slice(0, 10).map((agent, idx) => {
                              const avgAll = metrics.agentStats.reduce((s, a) => s + a.avgTime, 0) / metrics.agentStats.length;
                              const color = agent.avgTime <= avgAll * 0.8 ? 'hsl(var(--success))' : agent.avgTime <= avgAll * 1.2 ? 'hsl(var(--warning, 48 96% 53%))' : 'hsl(var(--destructive))';
                              return <Cell key={idx} fill={color} />;
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Agent Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {metrics.agentStats.map((agent) => {
                  const avgAll = metrics.agentStats.reduce((s, a) => s + a.avgTime, 0) / metrics.agentStats.length;
                  const status = agent.avgTime <= avgAll * 0.8 ? 'green' : agent.avgTime <= avgAll * 1.2 ? 'yellow' : 'red';
                  const statusColors = { green: 'bg-success/20 text-success', yellow: 'bg-warning/20 text-warning', red: 'bg-destructive/20 text-destructive' };
                  const statusLabels = { green: 'Abaixo da média', yellow: 'Na média', red: 'Acima da média' };
                  const tmaTrend = agent.prevAvgTime > 0 ? Math.round(((agent.avgTime - agent.prevAvgTime) / agent.prevAvgTime) * 100) : null;
                  const countTrend = agent.prevCount > 0 ? Math.round(((agent.count - agent.prevCount) / agent.prevCount) * 100) : null;

                  return (
                    <Card key={agent.name} className="relative overflow-hidden">
                      <CardContent className="pt-6 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm truncate">{agent.name}</span>
                          <Badge className={cn("text-xs", statusColors[status])}>{statusLabels[status]}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Conversas</p>
                            <p className="font-bold">{agent.count}
                              {countTrend !== null && (
                                <span className={cn("text-xs ml-1", countTrend >= 0 ? "text-success" : "text-destructive")}>
                                  {countTrend >= 0 ? '↑' : '↓'}{Math.abs(countTrend)}%
                                </span>
                              )}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">TMA</p>
                            <p className="font-bold">{formatTime(agent.avgTime)}
                              {tmaTrend !== null && (
                                <span className={cn("text-xs ml-1", tmaTrend <= 0 ? "text-success" : "text-destructive")}>
                                  {tmaTrend <= 0 ? '↓' : '↑'}{Math.abs(tmaTrend)}%
                                </span>
                              )}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">TME</p>
                            <p className="font-bold">{formatTime(agent.avgWaitTime)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Período ant.</p>
                            <p className="font-bold text-muted-foreground">{agent.prevCount} conv.</p>
                          </div>
                        </div>
                        {agent.topTags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {agent.topTags.map(([tag, count]) => (
                              <Badge key={tag} variant="outline" className="text-xs">{tag} ({count})</Badge>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {metrics.agentStats.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">Sem dados de atendentes no período.</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>


            <TabsContent value="ai-report">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-primary" />
                        Relatório da Delma
                      </CardTitle>
                      <CardDescription>Análise profunda gerada por IA sob demanda</CardDescription>
                    </div>
                    <Button onClick={fetchReport} disabled={loadingReport} className="gap-2">
                      {loadingReport ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      {loadingReport ? 'Gerando...' : aiAnalysis ? 'Regenerar Relatório' : 'Gerar Relatório'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {aiAnalysis ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <div dangerouslySetInnerHTML={{ __html: renderMarkdown(aiAnalysis) }} />
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Sparkles className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-foreground mb-2">Nenhum relatório gerado</h3>
                      <p className="text-sm text-muted-foreground max-w-md mx-auto">
                        Clique em "Gerar Relatório" para que a Delma analise profundamente o desempenho do suporte com inteligência artificial.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </MainLayout>
  );
};

// Merge motivos from all error types
function mergeMotivos(errorsByType?: { estabelecimento: ErrorTypeGroup; motoboy: ErrorTypeGroup; outros: ErrorTypeGroup }): Record<string, number> {
  if (!errorsByType) return {};
  const merged: Record<string, number> = {};
  for (const group of Object.values(errorsByType)) {
    for (const [key, val] of Object.entries(group.motivos)) {
      merged[key] = (merged[key] || 0) + val;
    }
  }
  return merged;
}

// Compute learnings from metrics client-side
function computeLearnings(m: BrainMetrics): string[] {
  const insights: string[] = [];

  // Volume trend
  if (m.prevTotalConversas > 0) {
    const volDiff = ((m.totalConversas - m.prevTotalConversas) / m.prevTotalConversas) * 100;
    if (Math.abs(volDiff) > 10) {
      insights.push(
        volDiff > 0
          ? `A Delma notou um aumento de ${Math.round(volDiff)}% no volume de conversas comparado ao período anterior.`
          : `A Delma notou uma redução de ${Math.round(Math.abs(volDiff))}% no volume de conversas comparado ao período anterior.`
      );
    }
  }

  // TMA alert
  if (m.prevTma > 0) {
    const tmaDiff = ((m.tma - m.prevTma) / m.prevTma) * 100;
    if (tmaDiff > 15) {
      insights.push(`⚠️ O TMA aumentou ${Math.round(tmaDiff)}% — os atendimentos estão demorando mais que o usual.`);
    } else if (tmaDiff < -15) {
      insights.push(`✅ O TMA caiu ${Math.round(Math.abs(tmaDiff))}% — os atendimentos estão mais rápidos!`);
    }
  }

  // TME alert
  if (m.prevTme > 0) {
    const tmeDiff = ((m.tme - m.prevTme) / m.prevTme) * 100;
    if (tmeDiff > 20) {
      insights.push(`⚠️ O tempo de espera subiu ${Math.round(tmeDiff)}% — clientes estão esperando mais na fila.`);
    }
  }

  // AI resolution rate
  const total = m.aiResolved + m.humanResolved;
  if (total > 0) {
    const aiPct = Math.round((m.aiResolved / total) * 100);
    if (aiPct > 60) {
      insights.push(`🤖 A IA está resolvendo ${aiPct}% das conversas — boa taxa de automação!`);
    } else if (aiPct < 20 && total > 10) {
      insights.push(`A Delma sugere revisar os robôs — apenas ${aiPct}% das conversas são resolvidas por IA.`);
    }
  }

  // Top tag dominance
  if (m.topTags.length > 0) {
    const topTag = m.topTags[0];
    if (m.totalConversas > 0 && topTag[1] / m.totalConversas > 0.3) {
      insights.push(`A tag "${topTag[0]}" aparece em ${Math.round((topTag[1] / m.totalConversas) * 100)}% das conversas — pode ser um padrão a investigar.`);
    }
  }

  // Agent with highest TMA
  if (m.agentStats.length > 2) {
    const sorted = [...m.agentStats].sort((a, b) => b.avgTime - a.avgTime);
    const slowest = sorted[0];
    const fastest = sorted[sorted.length - 1];
    if (slowest.avgTime > fastest.avgTime * 2 && slowest.count > 3) {
      insights.push(`${slowest.name} tem TMA ${Math.round(slowest.avgTime)}min — ${Math.round(slowest.avgTime / fastest.avgTime)}x mais que ${fastest.name}.`);
    }
  }

  // Overloaded agent (>30% volume)
  if (m.agentStats.length > 2 && m.totalConversas > 10) {
    const overloaded = m.agentStats.find(a => a.count / m.totalConversas > 0.3);
    if (overloaded) {
      insights.push(`⚠️ ${overloaded.name} está concentrando ${Math.round((overloaded.count / m.totalConversas) * 100)}% do volume — considere redistribuir a carga.`);
    }
  }

  // Best improvement in TMA
  if (m.agentStats.length > 1) {
    const improved = m.agentStats
      .filter(a => a.prevAvgTime > 0 && a.count > 3)
      .map(a => ({ ...a, improvement: ((a.prevAvgTime - a.avgTime) / a.prevAvgTime) * 100 }))
      .sort((a, b) => b.improvement - a.improvement);
    if (improved.length > 0 && improved[0].improvement > 10) {
      insights.push(`🏆 ${improved[0].name} melhorou o TMA em ${Math.round(improved[0].improvement)}% comparado ao período anterior!`);
    }
  }

  // Agent with TME much above average
  if (m.agentStats.length > 2) {
    const avgWait = m.agentStats.reduce((s, a) => s + a.avgWaitTime, 0) / m.agentStats.length;
    const slowWait = m.agentStats.find(a => a.avgWaitTime > avgWait * 2 && a.count > 3);
    if (slowWait && avgWait > 0) {
      insights.push(`⚠️ Clientes de ${slowWait.name} esperam ${Math.round(slowWait.avgWaitTime)}min na fila — ${Math.round(slowWait.avgWaitTime / avgWait)}x acima da média.`);
    }
  }

  // Error count
  if (m.errorLogs.length > 5) {
    insights.push(`🔴 ${m.errorLogs.length} conversas problemáticas detectadas no período — confira a aba "Erros & Gaps".`);
  }

  return insights;
}

// Simple markdown to HTML renderer
function renderMarkdown(md: string): string {
  return md
    .replace(/^### (.*$)/gm, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
    .replace(/^## (.*$)/gm, '<h2 class="text-xl font-bold mt-6 mb-3 text-foreground">$1</h2>')
    .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold mt-6 mb-3">$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^- (.*$)/gm, '<li class="ml-4 list-disc text-sm text-muted-foreground">$1</li>')
    .replace(/^(\d+)\. (.*$)/gm, '<li class="ml-4 list-decimal text-sm text-muted-foreground">$2</li>')
    .replace(/---/g, '<hr class="my-4 border-border" />')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/⚠️/g, '⚠️');
}

// KPI Card Component
function KPICard({ title, value, icon: Icon, trend, subtitle }: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  trend?: { diff: number; isPositive: boolean } | null;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        </div>
        {trend && (
          <div className={cn("flex items-center gap-1 mt-3 text-xs font-medium", trend.isPositive ? "text-success" : "text-destructive")}>
            {trend.isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            <span>{trend.diff}% vs período anterior</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default AdminBrain;
