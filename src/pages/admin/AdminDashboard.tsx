import { useEffect, useState, useMemo, useCallback } from 'react';
import { 
  MessageSquare, 
  Users, 
  Clock, 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownRight,
  Building2,
  Zap,
  Timer,
  Activity,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  Sparkles,
  Trophy,
  Medal
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApp } from '@/contexts/AppContext';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  CartesianGrid,
  Legend,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ElementType;
  iconColor?: string;
  trend?: 'up' | 'down' | 'neutral';
  subtitle?: string;
  pulse?: boolean;
}

function StatCard({ title, value, change, icon: Icon, iconColor = 'text-primary', trend, subtitle, pulse }: StatCardProps) {
  const isPositive = trend === 'up' || (change && change > 0);
  const isNegative = trend === 'down' || (change && change < 0);

  return (
    <Card className="relative overflow-hidden group hover:shadow-lg transition-all duration-300 border-border/50 bg-gradient-to-br from-card to-card/80">
      {pulse && (
        <span className="absolute top-3 right-3 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
        </span>
      )}
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-xs sm:text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl sm:text-3xl font-bold tracking-tight">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
            {change !== undefined && (
              <div className={cn(
                "flex items-center gap-1 text-xs font-medium",
                isPositive && "text-success",
                isNegative && "text-destructive",
                !isPositive && !isNegative && "text-muted-foreground"
              )}>
                {isPositive && <ArrowUpRight className="w-3 h-3" />}
                {isNegative && <ArrowDownRight className="w-3 h-3" />}
                <span>{Math.abs(change)}% vs período anterior</span>
              </div>
            )}
          </div>
          <div className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110",
            "bg-gradient-to-br",
            iconColor === 'text-primary' && "from-primary/20 to-primary/10",
            iconColor === 'text-success' && "from-success/20 to-success/10",
            iconColor === 'text-warning' && "from-warning/20 to-warning/10",
            iconColor === 'text-destructive' && "from-destructive/20 to-destructive/10",
            iconColor === 'text-blue-400' && "from-blue-400/20 to-blue-400/10"
          )}>
            <Icon className={cn("w-6 h-6", iconColor)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Mini stat component for secondary metrics
function MiniStat({ icon: Icon, value, label, color }: { icon: React.ElementType; value: string | number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", `bg-${color}/10`)}>
        <Icon className={cn("w-4 h-4", `text-${color}`)} />
      </div>
      <div>
        <p className="text-lg font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

interface AgentRanking {
  id: string;
  name: string;
  avatar?: string;
  totalConversations: number;
  avgServiceTime: number; // in minutes
  avgWaitTime: number; // in minutes
  score: number;
}

export default function AdminDashboard() {
  const { conversations, departments, users, loading, refetchConversations } = useApp();
  const [avgServiceTime, setAvgServiceTime] = useState<number>(0);
  const [avgWaitTime, setAvgWaitTime] = useState<number>(0);
  const [hourlyData, setHourlyData] = useState<any[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [agentRanking, setAgentRanking] = useState<AgentRanking[]>([]);

  // Buscar métricas de tempo dos logs
  const fetchTimeMetrics = async () => {
    try {
      // Buscar logs com status 'online' para métricas de tempo (excluir resetados)
      const { data: onlineLogs, error: onlineError } = await supabase
        .from('conversation_logs')
        .select('started_at, finalized_at, wait_time, agent_status_at_finalization')
        .eq('agent_status_at_finalization', 'online')
        .is('reset_at', null);

      // Buscar TODOS os logs para o gráfico de atividade
      const { data: allLogs, error: allError } = await supabase
        .from('conversation_logs')
        .select('started_at, finalized_at');

      if (onlineError) console.error('Erro logs online:', onlineError);
      if (allError) console.error('Erro todos logs:', allError);

      // Calcular métricas de tempo apenas com logs 'online'
      if (onlineLogs && onlineLogs.length > 0) {
        let totalServiceTime = 0;
        let serviceCount = 0;

        // Excluir tempos > 1 hora (3600s) que indicam acúmulo noturno/offline
        onlineLogs.forEach(log => {
          if (log.started_at && log.finalized_at) {
            const serviceTime = (new Date(log.finalized_at).getTime() - new Date(log.started_at).getTime()) / 1000;
            if (serviceTime > 0 && serviceTime < 3600) {
              totalServiceTime += serviceTime;
              serviceCount++;
            }
          }
        });

        const avgService = serviceCount > 0 ? Math.round(totalServiceTime / serviceCount / 60) : 0;
        setAvgServiceTime(avgService);

        const logsWithWait = onlineLogs.filter(log => log.wait_time !== null && log.wait_time !== undefined && log.wait_time > 0 && log.wait_time < 3600);
        if (logsWithWait.length > 0) {
          const totalWait = logsWithWait.reduce((acc, log) => acc + (log.wait_time || 0), 0);
          const avgWait = Math.round(totalWait / logsWithWait.length / 60);
          setAvgWaitTime(avgWait);
        } else {
          setAvgWaitTime(0);
        }
      } else {
        setAvgServiceTime(0);
        setAvgWaitTime(0);
      }

      // Gerar dados por hora para o gráfico (TODOS os logs)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const hourlyStats: Record<number, { conversations: number; resolved: number }> = {};
      for (let i = 0; i < 24; i++) {
        hourlyStats[i] = { conversations: 0, resolved: 0 };
      }

      if (allLogs && allLogs.length > 0) {
        allLogs.forEach(log => {
          if (log.started_at) {
            const logDate = new Date(log.started_at);
            if (logDate >= today) {
              const hour = logDate.getHours();
              hourlyStats[hour].conversations++;
              if (log.finalized_at) {
                hourlyStats[hour].resolved++;
              }
            }
          }
        });
      }

      const chartData = Object.entries(hourlyStats).map(([hour, data]) => ({
        hour: `${hour}h`,
        conversas: data.conversations,
        resolvidas: data.resolved,
      }));

      setHourlyData(chartData);
    } catch (error) {
      console.error('Erro ao buscar métricas de tempo:', error);
    }
  };

  // Buscar ranking de atendentes (apenas do departamento Suporte)
  const fetchAgentRanking = useCallback(async () => {
    try {
      // Primeiro, buscar o ID do departamento Suporte
      const { data: suporteDept, error: deptError } = await supabase
        .from('departments')
        .select('id')
        .ilike('name', '%suporte%')
        .maybeSingle();

      if (deptError) {
        console.error('Erro ao buscar departamento Suporte:', deptError);
        return;
      }

      const suporteDeptId = suporteDept?.id;
      
      if (!suporteDeptId) {
        console.log('Departamento Suporte não encontrado');
        setAgentRanking([]);
        return;
      }

      // Buscar membros do departamento Suporte
      const { data: suporteMembers, error: membersError } = await supabase
        .from('profile_departments')
        .select('profile_id')
        .eq('department_id', suporteDeptId);

      if (membersError) {
        console.error('Erro ao buscar membros do Suporte:', membersError);
        return;
      }

      const suporteMemberIds = suporteMembers?.map(m => m.profile_id) || [];

      if (suporteMemberIds.length === 0) {
        setAgentRanking([]);
        return;
      }

      // Buscar logs apenas do departamento Suporte
      const { data, error } = await supabase
        .from('conversation_logs')
        .select('finalized_by, finalized_by_name, started_at, finalized_at, wait_time')
        .not('finalized_by', 'is', null)
        .eq('department_id', suporteDeptId)
        .in('finalized_by', suporteMemberIds);

      if (error) {
        console.error('Erro ao buscar ranking:', error);
        return;
      }

      if (!data || data.length === 0) {
        setAgentRanking([]);
        return;
      }

      // Agrupar por atendente
      const agentStats: Record<string, {
        id: string;
        name: string;
        totalConversations: number;
        totalServiceTime: number;
        serviceCount: number;
        totalWaitTime: number;
        waitCount: number;
      }> = {};

      data.forEach(log => {
        const agentId = log.finalized_by;
        const agentName = log.finalized_by_name || 'Desconhecido';

        if (!agentStats[agentId]) {
          agentStats[agentId] = {
            id: agentId,
            name: agentName,
            totalConversations: 0,
            totalServiceTime: 0,
            serviceCount: 0,
            totalWaitTime: 0,
            waitCount: 0,
          };
        }

        agentStats[agentId].totalConversations++;

        // Excluir tempos > 1 hora (3600s) que indicam acúmulo noturno/offline
        if (log.started_at && log.finalized_at) {
          const serviceTime = (new Date(log.finalized_at).getTime() - new Date(log.started_at).getTime()) / 1000;
          if (serviceTime > 0 && serviceTime < 3600) {
            agentStats[agentId].totalServiceTime += serviceTime;
            agentStats[agentId].serviceCount++;
          }
        }

        if (log.wait_time !== null && log.wait_time !== undefined && log.wait_time > 0 && log.wait_time < 3600) {
          agentStats[agentId].totalWaitTime += log.wait_time;
          agentStats[agentId].waitCount++;
        }
      });

      // Calcular médias e ordenar por total de conversas
      const ranking: AgentRanking[] = Object.values(agentStats)
        .map(agent => {
          const user = users.find(u => u.id === agent.id);
          return {
            id: agent.id,
            name: agent.name,
            avatar: user?.avatar,
            totalConversations: agent.totalConversations,
            avgServiceTime: agent.serviceCount > 0 
              ? Math.round(agent.totalServiceTime / agent.serviceCount / 60) 
              : 0,
            avgWaitTime: agent.waitCount > 0 
              ? Math.round(agent.totalWaitTime / agent.waitCount / 60) 
              : 0,
          };
        })
        .sort((a, b) => b.totalConversations - a.totalConversations);

      setAgentRanking(ranking);
    } catch (error) {
      console.error('Erro ao buscar ranking de atendentes:', error);
    }
  }, [users]);

  // Listener para atualização em tempo real
  useEffect(() => {
    fetchTimeMetrics();
    fetchAgentRanking();

    const channel = supabase
      .channel('dashboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => {
          refetchConversations();
          setLastUpdate(new Date());
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => {
          refetchConversations();
          setLastUpdate(new Date());
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_logs' },
        () => {
          fetchTimeMetrics();
          fetchAgentRanking();
          setLastUpdate(new Date());
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetchConversations, fetchAgentRanking]);

  // Computed values
  const totalConversations = conversations.length;
  const inQueue = conversations.filter(c => c.status === 'em_fila').length;
  const inProgress = conversations.filter(c => c.status === 'em_atendimento').length;
  const completed = conversations.filter(c => c.status === 'finalizada').length;
  const onlineUsers = users.filter(u => u.status === 'online').length;
  const awayUsers = users.filter(u => u.status === 'away').length;

  // Status distribution for pie chart
  const statusData = useMemo(() => [
    { name: 'Na Fila', value: inQueue, color: 'hsl(var(--warning))' },
    { name: 'Em Atendimento', value: inProgress, color: 'hsl(var(--primary))' },
    { name: 'Finalizadas', value: completed, color: 'hsl(var(--success))' },
  ].filter(item => item.value > 0), [inQueue, inProgress, completed]);

  // Department performance data
  const deptPerformance = useMemo(() => 
    departments.map(dept => ({
      name: dept.name.length > 10 ? dept.name.slice(0, 10) + '...' : dept.name,
      fila: dept.queueCount || 0,
      atendimento: conversations.filter(c => c.departmentId === dept.id && c.status === 'em_atendimento').length,
      color: dept.color,
    }))
  , [departments, conversations]);

  // Urgency metrics
  const urgentCount = conversations.filter(c => {
    if (c.status !== 'em_fila') return false;
    const waitSeconds = (Date.now() - new Date(c.createdAt).getTime()) / 1000;
    return waitSeconds > 300; // > 5 min
  }).length;

  // Chart configs
  const areaChartConfig = {
    conversas: { label: 'Conversas', color: 'hsl(var(--primary))' },
    resolvidas: { label: 'Resolvidas', color: 'hsl(var(--success))' },
  };

  const barChartConfig = {
    fila: { label: 'Na Fila', color: 'hsl(var(--warning))' },
    atendimento: { label: 'Em Atendimento', color: 'hsl(var(--primary))' },
  };

  if (loading && departments.length === 0 && users.length === 0) {
    return (
      <MainLayout title="Dashboard">
        <div className="h-full p-6 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Activity className="w-8 h-8 animate-pulse text-primary" />
            <p className="text-muted-foreground">Carregando dashboard...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Dashboard">
      <div className="h-full overflow-y-auto scrollbar-thin">
        <div className="p-4 sm:p-6 space-y-6">
          {/* Header with real-time indicator */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-primary" />
                Visão Geral
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Atualizado às {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-success opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
              </span>
              <span className="text-xs text-muted-foreground">Tempo real</span>
            </div>
          </div>

          {/* Primary Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total de Conversas"
              value={totalConversations}
              icon={MessageSquare}
              iconColor="text-primary"
              subtitle="Conversas ativas no sistema"
            />
            <StatCard
              title="Na Fila"
              value={inQueue}
              icon={Clock}
              iconColor="text-warning"
              pulse={inQueue > 0}
              subtitle={urgentCount > 0 ? `${urgentCount} urgente(s)` : 'Aguardando atendimento'}
            />
            <StatCard
              title="Em Atendimento"
              value={inProgress}
              icon={TrendingUp}
              iconColor="text-success"
              pulse={inProgress > 0}
              subtitle="Conversas em andamento"
            />
            <StatCard
              title="Tempo Médio"
              value={`${avgServiceTime}m`}
              icon={Zap}
              iconColor="text-blue-400"
              subtitle="Média de atendimento"
            />
          </div>

          {/* Secondary Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MiniStat icon={Users} value={`${onlineUsers}/${users.length}`} label="Equipe Online" color="success" />
            <MiniStat icon={Building2} value={departments.length} label="Departamentos" color="primary" />
            <MiniStat icon={CheckCircle2} value={completed} label="Finalizadas" color="muted-foreground" />
            <MiniStat icon={Timer} value={`${avgWaitTime}m`} label="Tempo de Espera" color="warning" />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Area Chart - Conversations over time */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  Atividade por Hora
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={areaChartConfig} className="h-[200px] w-full">
                  <AreaChart data={hourlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorConversas" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorResolvidas" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                    <XAxis dataKey="hour" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      type="monotone"
                      dataKey="conversas"
                      stroke="hsl(var(--primary))"
                      fillOpacity={1}
                      fill="url(#colorConversas)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="resolvidas"
                      stroke="hsl(var(--success))"
                      fillOpacity={1}
                      fill="url(#colorResolvidas)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Pie Chart - Status distribution */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Distribuição de Status</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-center">
                {statusData.length > 0 ? (
                  <div className="w-full">
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie
                          data={statusData}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={65}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {statusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <ChartTooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap justify-center gap-3 mt-2">
                      {statusData.map((item, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-muted-foreground">{item.name}</span>
                          <span className="font-medium">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Sem dados</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Department & Team Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Department Performance Bar Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-primary" />
                  Performance por Departamento
                </CardTitle>
              </CardHeader>
              <CardContent>
                {deptPerformance.length > 0 ? (
                  <ChartContainer config={barChartConfig} className="h-[200px] w-full">
                    <BarChart data={deptPerformance} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={70} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="fila" fill="hsl(var(--warning))" radius={[0, 4, 4, 0]} barSize={12} />
                      <Bar dataKey="atendimento" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={12} />
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">Sem dados de departamentos</p>
                )}
              </CardContent>
            </Card>

            {/* Agent Ranking */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-warning" />
                    Ranking do Suporte
                  </CardTitle>
                  <Badge variant="outline" className="text-xs">
                    {agentRanking.length} atendente{agentRanking.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[280px] overflow-y-auto scrollbar-thin pr-1">
                  {agentRanking.length > 0 ? (
                    agentRanking.map((agent, index) => {
                      const maxConversations = agentRanking[0]?.totalConversations || 1;
                      const progressPercent = Math.round((agent.totalConversations / maxConversations) * 100);
                      
                      // Time color helpers
                      const getServiceTimeColor = (time: number) => {
                        if (time <= 10) return 'text-success';
                        if (time <= 30) return 'text-warning';
                        return 'text-destructive';
                      };
                      
                      const getWaitTimeColor = (time: number) => {
                        if (time <= 5) return 'text-success';
                        if (time <= 10) return 'text-warning';
                        return 'text-destructive';
                      };

                      return (
                        <div 
                          key={agent.id}
                          className={cn(
                            "p-3 rounded-lg transition-colors",
                            index === 0 ? "bg-warning/10 border border-warning/30" :
                            index === 1 ? "bg-secondary/50 border border-border/50" :
                            index === 2 ? "bg-orange-500/10 border border-orange-500/30" :
                            "bg-secondary/30 hover:bg-secondary/50"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            {/* Position */}
                            <div className="shrink-0 w-7 text-center">
                              {index === 0 ? (
                                <span className="text-lg">🥇</span>
                              ) : index === 1 ? (
                                <span className="text-lg">🥈</span>
                              ) : index === 2 ? (
                                <span className="text-lg">🥉</span>
                              ) : (
                                <span className="text-sm font-bold text-muted-foreground">#{index + 1}</span>
                              )}
                            </div>
                            
                            {/* Avatar */}
                            <div className="shrink-0">
                              {agent.avatar ? (
                                <img src={agent.avatar} alt={agent.name} className="w-9 h-9 rounded-full object-cover" />
                              ) : (
                                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                                  {agent.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                </div>
                              )}
                            </div>
                            
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{agent.name}</p>
                              <div className="flex items-center gap-3 text-xs mt-1">
                                <span className="flex items-center gap-1">
                                  <MessageSquare className="w-3 h-3 text-muted-foreground" />
                                  <span className="font-medium">{agent.totalConversations}</span>
                                </span>
                                <span className={cn("flex items-center gap-1", getServiceTimeColor(agent.avgServiceTime))}>
                                  <Clock className="w-3 h-3" />
                                  <span className="font-medium">{agent.avgServiceTime}m</span>
                                </span>
                                {agent.avgWaitTime > 0 && (
                                  <span className={cn("flex items-center gap-1", getWaitTimeColor(agent.avgWaitTime))}>
                                    <Timer className="w-3 h-3" />
                                    <span className="font-medium">{agent.avgWaitTime}m</span>
                                  </span>
                                )}
                              </div>
                              <Progress 
                                value={progressPercent} 
                                className="h-1.5 mt-2" 
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Medal className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Sem dados de atendimento</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Urgency Alert */}
          {urgentCount > 0 && (
            <Card className="border-warning/50 bg-warning/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-warning/20 flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <p className="font-medium text-warning">Atenção: {urgentCount} conversa{urgentCount > 1 ? 's' : ''} aguardando há mais de 5 minutos</p>
                    <p className="text-sm text-muted-foreground">Considere redistribuir a carga de trabalho ou escalar mais atendentes.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
