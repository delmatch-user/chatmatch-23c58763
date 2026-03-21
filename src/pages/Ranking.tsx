import { useState, useEffect, useCallback, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Trophy, Medal, Award, Clock, Timer, MessageSquare, Target, TrendingUp, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/contexts/AppContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

interface RankingConfig {
  is_active: boolean;
  conversations_goal_daily: number;
  conversations_goal_weekly: number;
  conversations_goal_monthly: number;
  tma_green_limit: number;
  tma_yellow_limit: number;
  tme_green_limit: number;
  tme_yellow_limit: number;
  weight_conversations: number;
  weight_tma: number;
  weight_tme: number;
}

interface AgentRanking {
  id: string;
  name: string;
  avatar_url?: string;
  totalConversations: number;
  avgServiceTime: number;
  avgWaitTime: number;
  totalServiceTime: number;
  serviceCount: number;
  totalWaitTime: number;
  waitCount: number;
  score: number;
  goalPercentage: number;
}

const defaultConfig: RankingConfig = {
  is_active: true,
  conversations_goal_daily: 15,
  conversations_goal_weekly: 75,
  conversations_goal_monthly: 300,
  tma_green_limit: 10,
  tma_yellow_limit: 30,
  tme_green_limit: 10,
  tme_yellow_limit: 30,
  weight_conversations: 50,
  weight_tma: 30,
  weight_tme: 20,
};

const formatTime = (minutes: number) => {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
};

const getPositionIcon = (position: number) => {
  switch (position) {
    case 1:
      return <Trophy className="w-6 h-6 text-yellow-500" />;
    case 2:
      return <Medal className="w-6 h-6 text-gray-400" />;
    case 3:
      return <Award className="w-6 h-6 text-amber-600" />;
    default:
      return (
        <span className="w-6 h-6 flex items-center justify-center text-sm font-bold text-muted-foreground">
          {position}º
        </span>
      );
  }
};

export default function Ranking() {
  const { user, departments } = useApp();
  const [ranking, setRanking] = useState<AgentRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<RankingConfig>(defaultConfig);

  // Encontrar o departamento "Suporte" do usuário
  const suporteDeptId = departments.find(d => d.name.toLowerCase() === 'suporte')?.id;

  const getTimeColor = useCallback((minutes: number, type: 'tma' | 'tme') => {
    const greenLimit = type === 'tma' ? config.tma_green_limit : config.tme_green_limit;
    const yellowLimit = type === 'tma' ? config.tma_yellow_limit : config.tme_yellow_limit;
    
    if (minutes <= greenLimit) return 'text-green-500';
    if (minutes <= yellowLimit) return 'text-yellow-500';
    return 'text-red-500';
  }, [config]);

  const getTimeScore = useCallback((minutes: number, type: 'tma' | 'tme') => {
    const greenLimit = type === 'tma' ? config.tma_green_limit : config.tme_green_limit;
    const yellowLimit = type === 'tma' ? config.tma_yellow_limit : config.tme_yellow_limit;
    
    if (minutes <= greenLimit) return 100;
    if (minutes <= yellowLimit) return 70;
    return 40;
  }, [config]);

  const calculateScore = useCallback((agent: Omit<AgentRanking, 'score' | 'goalPercentage'>) => {
    // Agentes sem conversas recebem score 0
    if (agent.totalConversations === 0) {
      return { score: 0, goalPercentage: 0 };
    }

    // Score de conversas (baseado na meta diária)
    const convGoal = config.conversations_goal_daily;
    const convPercentage = (agent.totalConversations / convGoal) * 100;
    const convScore = Math.min(convPercentage, 100); // Cap at 100%
    
    // Score de TMA (quanto menor, melhor)
    const tmaScore = getTimeScore(agent.avgServiceTime, 'tma');
    
    // Score de TME (quanto menor, melhor)
    const tmeScore = agent.avgWaitTime > 0 ? getTimeScore(agent.avgWaitTime, 'tme') : 100;
    
    // Pontuação combinada com pesos
    const finalScore = 
      (convScore * config.weight_conversations / 100) +
      (tmaScore * config.weight_tma / 100) +
      (tmeScore * config.weight_tme / 100);
    
    return {
      score: Math.round(finalScore),
      goalPercentage: Math.round(convPercentage),
    };
  }, [config, getTimeScore]);

  const fetchConfig = useCallback(async () => {
    if (!suporteDeptId) return;
    
    try {
      const { data, error } = await supabase
        .from('ranking_config')
        .select('*')
        .eq('department_id', suporteDeptId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setConfig(data as RankingConfig);
      }
    } catch (error) {
      console.error('Erro ao buscar configurações:', error);
    }
  }, [suporteDeptId]);

  const fetchTeamRanking = useCallback(async () => {
    if (!suporteDeptId) return;

    try {
      // 1. Buscar perfis via RPC (SECURITY DEFINER - retorna todos os membros)
      const { data: profiles, error: profilesError } = await supabase
        .rpc('get_ranking_team_members', { _department_id: suporteDeptId });

      if (profilesError) throw profilesError;

      if (!profiles || profiles.length === 0) {
        setRanking([]);
        setLoading(false);
        return;
      }

      // 2. Derivar IDs dos membros do resultado do RPC
      const teamMemberIds = profiles.map(p => p.id);

      // 3. Buscar logs de conversas dos membros da equipe (apenas do dia atual e do departamento Suporte)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data: logs, error: logsError } = await supabase
        .from('conversation_logs')
        .select('*')
        .not('finalized_by', 'is', null)
        .eq('department_id', suporteDeptId)
        .in('finalized_by', teamMemberIds)
        .is('reset_at', null)
        .gte('finalized_at', today.toISOString());

      if (logsError) throw logsError;

      // Agregar métricas por atendente
      const agentStats: Record<string, {
        id: string;
        name: string;
        avatar_url?: string;
        totalConversations: number;
        totalServiceTime: number;
        serviceCount: number;
        totalWaitTime: number;
        waitCount: number;
      }> = {};

      // Inicializar todos os membros
      profiles?.forEach(profile => {
        agentStats[profile.id] = {
          id: profile.id,
          name: profile.name,
          avatar_url: profile.avatar_url || undefined,
          totalConversations: 0,
          totalServiceTime: 0,
          serviceCount: 0,
          totalWaitTime: 0,
          waitCount: 0,
        };
      });

      // Processar logs
      logs?.forEach(log => {
        const agentId = log.finalized_by;
        if (agentId && agentStats[agentId]) {
          agentStats[agentId].totalConversations++;

          // Tempo de atendimento
          // Excluir tempos > 1 hora (3600s) que indicam acúmulo noturno/offline
          if (log.started_at && log.finalized_at) {
            const serviceTime = (new Date(log.finalized_at).getTime() - new Date(log.started_at).getTime()) / 1000;
            if (serviceTime > 0 && serviceTime < 3600) {
              agentStats[agentId].totalServiceTime += serviceTime;
              agentStats[agentId].serviceCount++;
            }
          }

          // Tempo de espera
          // Excluir tempos > 1 hora (3600s) que indicam acúmulo noturno/offline
          if (log.wait_time && log.wait_time > 0 && log.wait_time < 3600) {
            agentStats[agentId].totalWaitTime += log.wait_time;
            agentStats[agentId].waitCount++;
          }
        }
      });

      // Converter para array, calcular scores e ordenar
      const rankingData = Object.values(agentStats)
        .map(agent => {
          const baseData = {
            id: agent.id,
            name: agent.name,
            avatar_url: agent.avatar_url,
            totalConversations: agent.totalConversations,
            avgServiceTime: agent.serviceCount > 0 
              ? Math.round(agent.totalServiceTime / agent.serviceCount / 60) 
              : 0,
            avgWaitTime: agent.waitCount > 0 
              ? Math.round(agent.totalWaitTime / agent.waitCount / 60) 
              : 0,
            totalServiceTime: agent.totalServiceTime,
            serviceCount: agent.serviceCount,
            totalWaitTime: agent.totalWaitTime,
            waitCount: agent.waitCount,
          };
          
          const scores = calculateScore(baseData);
          
          return {
            ...baseData,
            ...scores,
          };
        })
        .sort((a, b) => b.score - a.score);

      setRanking(rankingData);
    } catch (error) {
      console.error('Erro ao buscar ranking:', error);
    } finally {
      setLoading(false);
    }
  }, [suporteDeptId, calculateScore]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    fetchTeamRanking();

    // Realtime subscription
    const channel = supabase
      .channel('ranking-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_logs' },
        () => fetchTeamRanking()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ranking_config' },
        () => {
          fetchConfig();
          fetchTeamRanking();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTeamRanking, fetchConfig]);

  const maxScore = Math.max(...ranking.map(a => a.score), 1);

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  // Calcular métricas médias da equipe
  const teamMetrics = useMemo(() => {
    const totalConversations = ranking.reduce((sum, a) => sum + a.totalConversations, 0);
    
    // Média ponderada real: soma total dos tempos / total de atendimentos
    const totalServiceTime = ranking.reduce((sum, a) => sum + a.totalServiceTime, 0);
    const totalServiceCount = ranking.reduce((sum, a) => sum + a.serviceCount, 0);
    const avgTMA = totalServiceCount > 0
      ? Math.round(totalServiceTime / totalServiceCount / 60)
      : 0;
    
    const totalWaitTime = ranking.reduce((sum, a) => sum + a.totalWaitTime, 0);
    const totalWaitCount = ranking.reduce((sum, a) => sum + a.waitCount, 0);
    const avgTME = totalWaitCount > 0
      ? Math.round(totalWaitTime / totalWaitCount / 60)
      : 0;
    
    const avgScore = ranking.length > 0
      ? Math.round(ranking.reduce((sum, a) => sum + a.score, 0) / ranking.length)
      : 0;
    
    const activeAgents = ranking.filter(a => a.totalConversations > 0).length;
    
    return { totalConversations, avgTMA, avgTME, avgScore, activeAgents };
  }, [ranking]);

  if (!config.is_active) {
    return (
      <MainLayout>
        <div className="p-4 sm:p-6 flex flex-col items-center justify-center min-h-[60vh]">
          <Trophy className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">Ranking Desativado</h2>
          <p className="text-muted-foreground text-center">
            O ranking está temporariamente desativado pelo administrador.
          </p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Trophy className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Ranking da Equipe</h1>
            <p className="text-sm text-muted-foreground">
              Acompanhe o desempenho dos atendentes do departamento Suporte
            </p>
          </div>
        </div>


        {/* Média da Equipe */}
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="w-5 h-5 text-primary" />
              Média da Equipe Suporte
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Total Conversas */}
              <div className="text-center p-4 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center mb-2">
                  <MessageSquare className="w-5 h-5 text-primary" />
                </div>
                <p className="text-2xl font-bold text-foreground">{teamMetrics.totalConversations}</p>
                <p className="text-xs text-muted-foreground">Total Conversas</p>
              </div>

              {/* TMA Médio */}
              <div className="text-center p-4 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center mb-2">
                  <Clock className={`w-5 h-5 ${getTimeColor(teamMetrics.avgTMA, 'tma')}`} />
                </div>
                <p className={`text-2xl font-bold ${getTimeColor(teamMetrics.avgTMA, 'tma')}`}>
                  {formatTime(teamMetrics.avgTMA)}
                </p>
                <p className="text-xs text-muted-foreground">TMA Médio</p>
              </div>

              {/* TME Médio */}
              <div className="text-center p-4 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center mb-2">
                  <Timer className={`w-5 h-5 ${getTimeColor(teamMetrics.avgTME, 'tme')}`} />
                </div>
                <p className={`text-2xl font-bold ${getTimeColor(teamMetrics.avgTME, 'tme')}`}>
                  {formatTime(teamMetrics.avgTME)}
                </p>
                <p className="text-xs text-muted-foreground">TME Médio</p>
              </div>

              {/* Score Médio */}
              <div className="text-center p-4 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center mb-2">
                  <Target className="w-5 h-5 text-primary" />
                </div>
                <p className="text-2xl font-bold text-primary">{teamMetrics.avgScore} pts</p>
                <p className="text-xs text-muted-foreground">Score Médio</p>
              </div>
            </div>
            
            <div className="mt-4 text-center text-sm text-muted-foreground">
              <Users className="w-4 h-4 inline-block mr-1" />
              {teamMetrics.activeAgents} atendente{teamMetrics.activeAgents !== 1 ? 's' : ''} ativo{teamMetrics.activeAgents !== 1 ? 's' : ''} hoje
            </div>
          </CardContent>
        </Card>

        {/* Ranking Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="w-5 h-5 text-primary" />
              Ranking por Pontuação
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="w-6 h-6" />
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-2 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : ranking.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Trophy className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Nenhum dado de ranking disponível</p>
                <p className="text-sm">As métricas aparecerão conforme as conversas forem finalizadas</p>
              </div>
            ) : (
              <div className="space-y-4">
                {ranking.map((agent, index) => (
                  <div
                    key={agent.id}
                    className={`flex items-center gap-4 p-4 rounded-lg transition-colors ${
                      index < 3 ? 'bg-muted/50' : 'hover:bg-muted/30'
                    }`}
                  >
                    {/* Position */}
                    <div className="flex-shrink-0">
                      {getPositionIcon(index + 1)}
                    </div>

                    {/* Avatar */}
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={agent.avatar_url} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {getInitials(agent.name)}
                      </AvatarFallback>
                    </Avatar>

                    {/* Name, Score and Progress */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-1 gap-1">
                        <span className="font-medium text-sm truncate">{agent.name}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {agent.goalPercentage}% da meta
                          </Badge>
                          <span className="text-lg font-bold text-primary">
                            {agent.score} pts
                          </span>
                        </div>
                      </div>
                      <Progress 
                        value={(agent.score / maxScore) * 100} 
                        className="h-2"
                      />
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-2 text-xs text-muted-foreground gap-1">
                        <div className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          <span>{agent.totalConversations} conversas</span>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-1 sm:gap-3">
                          <div className="flex items-center gap-1" title="Tempo Médio de Atendimento">
                            <Clock className={`w-3.5 h-3.5 ${getTimeColor(agent.avgServiceTime, 'tma')}`} />
                            <span className={getTimeColor(agent.avgServiceTime, 'tma')}>
                              TMA: {formatTime(agent.avgServiceTime)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1" title="Tempo Médio de Espera">
                            <Timer className={`w-3.5 h-3.5 ${getTimeColor(agent.avgWaitTime, 'tme')}`} />
                            <span className={getTimeColor(agent.avgWaitTime, 'tme')}>
                              TME: {formatTime(agent.avgWaitTime)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Legend */}
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-wrap gap-6 text-sm">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">TMA = Tempo Médio de Atendimento</span>
              </div>
              <div className="flex items-center gap-2">
                <Timer className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">TME = Tempo Médio de Espera</span>
              </div>
              <div className="flex items-center gap-4 sm:ml-auto">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-muted-foreground">≤{config.tma_green_limit}m</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-yellow-500" />
                  <span className="text-muted-foreground">{config.tma_green_limit}-{config.tma_yellow_limit}m</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-muted-foreground">&gt;{config.tma_yellow_limit}m</span>
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}