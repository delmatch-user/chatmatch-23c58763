import { useState } from 'react';
import { Brain, TrendingUp, TrendingDown, Clock, Users, Bot, AlertTriangle, Sparkles, RefreshCw, MessageSquare } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AgentStat {
  name: string;
  count: number;
  avgTime: number;
}

interface ErrorLog {
  id: string;
  contact_name: string;
  contact_phone: string | null;
  priority: string;
  tags: string[];
  channel: string | null;
  assigned_to_name: string | null;
  finalized_at: string;
  started_at: string;
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
}

const AdminBrain = () => {
  const [period, setPeriod] = useState('7');
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<BrainMetrics | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [activeTab, setActiveTab] = useState('overview');

  const fetchAnalysis = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('brain-analysis', {
        body: { period: parseInt(period) },
      });
      if (error) throw error;
      setMetrics(data.metrics);
      setAiAnalysis(data.aiAnalysis);
      toast.success('Análise gerada com sucesso!');
    } catch (e: any) {
      console.error(e);
      toast.error('Erro ao gerar análise: ' + (e.message || 'Erro desconhecido'));
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <MainLayout>
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg">
              <Brain className="w-7 h-7 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Cérebro</h1>
              <p className="text-sm text-muted-foreground">Delma — Gerente Inteligente do Suporte</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
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
            <Button onClick={fetchAnalysis} disabled={loading} className="gap-2">
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loading ? 'Analisando...' : 'Gerar Análise'}
            </Button>
          </div>
        </div>

        {!metrics && !loading && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Brain className="w-16 h-16 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Nenhuma análise gerada</h3>
              <p className="text-sm text-muted-foreground max-w-md mb-6">
                Selecione o período desejado e clique em "Gerar Análise" para que a Delma analise o desempenho do suporte com inteligência artificial.
              </p>
              <Button onClick={fetchAnalysis} disabled={loading} className="gap-2">
                <Sparkles className="w-4 h-4" />
                Gerar primeira análise
              </Button>
            </CardContent>
          </Card>
        )}

        {metrics && (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="overview">Visão Geral</TabsTrigger>
              <TabsTrigger value="ai-analysis">Análise IA</TabsTrigger>
              <TabsTrigger value="errors">Erros & Gaps</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              {/* KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                  title="Total Conversas"
                  value={metrics.totalConversas}
                  icon={MessageSquare}
                  trend={getTrend(metrics.totalConversas, metrics.prevTotalConversas)}
                />
                <KPICard
                  title="TMA"
                  value={formatTime(metrics.tma)}
                  icon={Clock}
                  trend={getTrend(metrics.tma, metrics.prevTma, true)}
                  subtitle="Tempo médio de atendimento"
                />
                <KPICard
                  title="TME"
                  value={formatTime(metrics.tme)}
                  icon={Clock}
                  trend={getTrend(metrics.tme, metrics.prevTme, true)}
                  subtitle="Tempo médio de espera"
                />
                <KPICard
                  title="Resolução IA"
                  value={metrics.aiResolved + metrics.humanResolved > 0
                    ? `${Math.round((metrics.aiResolved / (metrics.aiResolved + metrics.humanResolved)) * 100)}%`
                    : '0%'}
                  icon={Bot}
                  subtitle={`${metrics.aiResolved} IA / ${metrics.humanResolved} humano`}
                />
              </div>

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
                                <div
                                  className="h-full rounded-full bg-primary transition-all"
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Channel & Priority breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Por Canal</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(metrics.channelCounts).map(([channel, count]) => (
                        <Badge key={channel} variant="secondary" className="text-sm">
                          {channel}: {count}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Por Prioridade</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(metrics.priorityCounts).map(([priority, count]) => (
                        <Badge key={priority} className={cn("text-sm", priorityColors[priority] || 'bg-muted text-muted-foreground')}>
                          {priority}: {count}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* AI Analysis Tab */}
            <TabsContent value="ai-analysis">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-primary" />
                        Análise da Delma
                      </CardTitle>
                      <CardDescription>Relatório inteligente gerado por IA com base nos dados do período</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={fetchAnalysis} disabled={loading} className="gap-2">
                      <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                      Regenerar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {aiAnalysis ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <div dangerouslySetInnerHTML={{ __html: renderMarkdown(aiAnalysis) }} />
                    </div>
                  ) : (
                    <p className="text-muted-foreground">Nenhuma análise disponível. Clique em "Gerar Análise".</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Errors Tab */}
            <TabsContent value="errors">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-destructive" />
                    Conversas Problemáticas
                  </CardTitle>
                  <CardDescription>Conversas com alta prioridade, erros ou reclamações identificadas no período</CardDescription>
                </CardHeader>
                <CardContent>
                  {metrics.errorLogs.length === 0 ? (
                    <div className="text-center py-8">
                      <AlertTriangle className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">Nenhuma conversa problemática encontrada no período. 🎉</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {metrics.errorLogs.map((log) => (
                        <div key={log.id} className="p-3 rounded-lg border bg-card hover:bg-secondary/30 transition-colors">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-sm truncate">{log.contact_name}</p>
                              {log.contact_phone && (
                                <p className="text-xs text-muted-foreground">{log.contact_phone}</p>
                              )}
                            </div>
                            <Badge className={cn("shrink-0", priorityColors[log.priority] || '')}>
                              {log.priority}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {log.channel && (
                              <Badge variant="outline" className="text-xs">{log.channel}</Badge>
                            )}
                            {log.assigned_to_name && (
                              <span className="text-xs text-muted-foreground">Agente: {log.assigned_to_name}</span>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {new Date(log.finalized_at).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                          {log.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {log.tags.map((tag) => (
                                <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
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
