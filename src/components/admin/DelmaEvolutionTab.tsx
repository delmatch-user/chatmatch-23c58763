import { useState, useEffect, useRef } from 'react';
import { DelmaMemoryDrawer } from './DelmaMemoryDrawer';
import { TrendingUp, Brain, Target, CalendarClock, CheckCircle2, XCircle, Activity, BarChart3, Filter } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface WeeklyApprovalRate {
  week: string;
  approved: number;
  rejected: number;
  rate: number;
}

const categoryConfig: Record<string, { label: string; color: string }> = {
  robot_training: { label: 'Treinamento', color: 'text-primary' },
  agent_goals: { label: 'Metas', color: 'text-warning' },
  report_schedule: { label: 'Relatórios', color: 'text-success' },
};

export function DelmaEvolutionTab() {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [memories, setMemories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterPeriod, setFilterPeriod] = useState('30');

  const autoTriggered = useRef(false);
  const [memoryDrawerOpen, setMemoryDrawerOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [suggestionsRes, memoriesRes] = await Promise.all([
        supabase.from('delma_suggestions' as any).select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('delma_memory' as any).select('*').gte('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(500),
      ]);
      setSuggestions((suggestionsRes.data as any[]) || []);
      setMemories((memoriesRes.data as any[]) || []);
    } catch (e) {
      console.error('Error loading evolution data:', e);
    } finally {
      setLoading(false);
    }
  };

  // Auto-trigger analysis if no data exists
  useEffect(() => {
    if (!loading && suggestions.length === 0 && memories.length === 0 && !autoTriggered.current) {
      autoTriggered.current = true;
      (async () => {
        try {
          await supabase.functions.invoke('delma-autonomous-analysis');
          loadData();
        } catch (e) {
          console.error('Auto evolution trigger error:', e);
        }
      })();
    }
  }, [loading, suggestions.length, memories.length]);

  // Calculate weekly approval rates
  const weeklyRates: WeeklyApprovalRate[] = (() => {
    const processed = suggestions.filter(s => s.status !== 'pending' && s.decided_at);
    if (processed.length === 0) return [];

    const weeks: Record<string, { approved: number; rejected: number }> = {};
    processed.forEach(s => {
      const d = new Date(s.decided_at);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const key = weekStart.toISOString().substring(0, 10);
      if (!weeks[key]) weeks[key] = { approved: 0, rejected: 0 };
      if (s.status === 'approved' || s.status === 'edited') weeks[key].approved++;
      else weeks[key].rejected++;
    });

    return Object.entries(weeks)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([week, counts]) => ({
        week: week.substring(5),
        approved: counts.approved,
        rejected: counts.rejected,
        rate: Math.round((counts.approved / (counts.approved + counts.rejected)) * 100),
      }));
  })();

  // Areas with most approvals/rejections
  const categoryCounts = (() => {
    const processed = suggestions.filter(s => s.status !== 'pending');
    const counts: Record<string, { approved: number; rejected: number }> = {};
    processed.forEach(s => {
      if (!counts[s.category]) counts[s.category] = { approved: 0, rejected: 0 };
      if (s.status === 'approved' || s.status === 'edited') counts[s.category].approved++;
      else counts[s.category].rejected++;
    });
    return counts;
  })();

  // Active memories count
  const activeMemoriesCount = memories.length;
  const dataSignals = memories.filter(m => m.type === 'data_signal').length;
  const feedbackSignals = memories.filter(m => m.type === 'manager_feedback').length;

  // Timeline - filtered
  const cutoffDate = new Date(Date.now() - parseInt(filterPeriod) * 24 * 60 * 60 * 1000);
  const timeline = suggestions
    .filter(s => s.status !== 'pending')
    .filter(s => filterCategory === 'all' || s.category === filterCategory)
    .filter(s => new Date(s.created_at) >= cutoffDate)
    .slice(0, 50);

  // Overall approval rate
  const totalApproved = suggestions.filter(s => s.status === 'approved' || s.status === 'edited').length;
  const totalRejected = suggestions.filter(s => s.status === 'rejected').length;
  const overallRate = totalApproved + totalRejected > 0 ? Math.round((totalApproved / (totalApproved + totalRejected)) * 100) : 0;

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-32 rounded-lg animate-pulse bg-muted/30" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{overallRate}%</p>
                <p className="text-xs text-muted-foreground">Taxa de Aprovação</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalApproved}</p>
                <p className="text-xs text-muted-foreground">Aprovadas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalRejected}</p>
                <p className="text-xs text-muted-foreground">Rejeitadas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-warning/30 transition-colors" onClick={() => setMemoryDrawerOpen(true)}>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                <Brain className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeMemoriesCount}</p>
                <p className="text-xs text-muted-foreground">Memórias Ativas</p>
                <p className="text-[10px] text-muted-foreground/70">{dataSignals} dados • {feedbackSignals} feedbacks</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Approval Rate Chart */}
      {weeklyRates.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Taxa de Aprovação por Semana
            </CardTitle>
            <CardDescription>Evolução da confiança nas sugestões da Delma</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weeklyRates}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="week" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} unit="%" domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                    formatter={(value: number, name: string) => [
                      name === 'rate' ? `${value}%` : value,
                      name === 'rate' ? 'Taxa' : name === 'approved' ? 'Aprovadas' : 'Rejeitadas'
                    ]}
                  />
                  <Line type="monotone" dataKey="rate" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} name="rate" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Areas breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              Onde a Delma mais acerta
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Object.entries(categoryCounts)
              .sort((a, b) => b[1].approved - a[1].approved)
              .map(([cat, counts]) => {
                const config = categoryConfig[cat] || { label: cat, color: 'text-muted-foreground' };
                const rate = counts.approved + counts.rejected > 0 ? Math.round((counts.approved / (counts.approved + counts.rejected)) * 100) : 0;
                return (
                  <div key={cat} className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/30 mb-2">
                    <span className={cn("text-sm font-medium", config.color)}>{config.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{counts.approved} aprovadas</span>
                      <Badge variant="outline" className={cn("text-[10px]", rate >= 70 ? "border-success/30 text-success" : rate >= 40 ? "border-warning/30 text-warning" : "border-destructive/30 text-destructive")}>
                        {rate}%
                      </Badge>
                    </div>
                  </div>
                );
              })}
            {Object.keys(categoryCounts).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">Sem dados suficientes.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <XCircle className="w-4 h-4 text-destructive" />
              Onde a Delma ainda erra
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Object.entries(categoryCounts)
              .filter(([, counts]) => counts.rejected > 0)
              .sort((a, b) => b[1].rejected - a[1].rejected)
              .map(([cat, counts]) => {
                const config = categoryConfig[cat] || { label: cat, color: 'text-muted-foreground' };
                const rejectionReasons = suggestions
                  .filter(s => s.category === cat && s.status === 'rejected' && s.reject_reason)
                  .map(s => s.reject_reason)
                  .slice(0, 3);
                return (
                  <div key={cat} className="p-2.5 rounded-lg bg-secondary/30 mb-2">
                    <div className="flex items-center justify-between">
                      <span className={cn("text-sm font-medium", config.color)}>{config.label}</span>
                      <span className="text-xs text-destructive">{counts.rejected} rejeições</span>
                    </div>
                    {rejectionReasons.length > 0 && (
                      <div className="mt-1.5 space-y-1">
                        {rejectionReasons.map((reason, i) => (
                          <p key={i} className="text-xs text-muted-foreground italic">"{reason}"</p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            {Object.values(categoryCounts).every(c => c.rejected === 0) && (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhuma rejeição registrada. 🎉</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Linha do Tempo de Decisões
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <Filter className="w-3 h-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as áreas</SelectItem>
                  <SelectItem value="robot_training">Treinamento</SelectItem>
                  <SelectItem value="agent_goals">Metas</SelectItem>
                  <SelectItem value="report_schedule">Relatórios</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterPeriod} onValueChange={setFilterPeriod}>
                <SelectTrigger className="w-[100px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 dias</SelectItem>
                  <SelectItem value="30">30 dias</SelectItem>
                  <SelectItem value="90">90 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Sem decisões no período selecionado.</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {timeline.map(s => {
                const config = categoryConfig[s.category] || { label: s.category, color: 'text-muted-foreground' };
                const isApproved = s.status === 'approved' || s.status === 'edited';
                return (
                  <div key={s.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/20 hover:bg-secondary/40 transition-colors">
                    <div className={cn("w-2 h-2 rounded-full shrink-0", isApproved ? "bg-success" : "bg-destructive")} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm truncate">{s.title}</span>
                        <Badge variant="outline" className="text-[10px]">{config.label}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={isApproved ? 'default' : 'secondary'} className="text-[10px]">
                        {isApproved ? '✅' : '❌'}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {s.decided_at ? new Date(s.decided_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <DelmaMemoryDrawer
        open={memoryDrawerOpen}
        onOpenChange={setMemoryDrawerOpen}
        memories={memories}
        onMemoriesUpdate={loadData}
      />
    </div>
  );
}
