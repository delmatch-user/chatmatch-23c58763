import { useEffect, useState } from 'react';
import { Activity, DollarSign, Users, Loader2, TrendingUp, TrendingDown, Calendar, XCircle } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart, Bar } from 'recharts';
import { sdrApi, SDRStatMetric, SDRLostReason } from '@/services/sdrApi';
import { MainLayout } from '@/components/layout/MainLayout';

type PeriodFilter = 'today' | '7days' | '30days';
const periodLabels: Record<PeriodFilter, string> = { today: 'Hoje', '7days': '7 Dias', '30days': '30 Dias' };
const periodDays: Record<PeriodFilter, number> = { today: 1, '7days': 7, '30days': 30 };

export default function SDRDashboardPage() {
  const [metrics, setMetrics] = useState<SDRStatMetric[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [lostReasons, setLostReasons] = useState<SDRLostReason[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodFilter>('today');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const days = periodDays[period];
        const [m, c, lr] = await Promise.all([
          sdrApi.fetchDashboardMetrics(days),
          sdrApi.fetchChartData(days),
          sdrApi.fetchLostReasons(days),
        ]);
        setMetrics(m);
        setChartData(c);
        setLostReasons(lr);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, [period]);

  const getIcon = (label: string) => {
    if (label.includes('Conversões')) return <DollarSign className="h-5 w-5 text-emerald-400" />;
    if (label.includes('Novos Leads')) return <Activity className="h-5 w-5 text-cyan-400" />;
    if (label.includes('Perdidos')) return <XCircle className="h-5 w-5 text-red-400" />;
    if (label.includes('Agendamentos')) return <Calendar className="h-5 w-5 text-violet-400" />;
    return <Users className="h-5 w-5 text-orange-400" />;
  };

  const getGradient = (label: string) => {
    if (label.includes('Conversões')) return 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/20';
    if (label.includes('Novos Leads')) return 'from-cyan-500/20 to-cyan-500/5 border-cyan-500/20';
    if (label.includes('Perdidos')) return 'from-red-500/20 to-red-500/5 border-red-500/20';
    if (label.includes('Agendamentos')) return 'from-violet-500/20 to-violet-500/5 border-violet-500/20';
    return 'from-orange-500/20 to-orange-500/5 border-orange-500/20';
  };

  const totalLost = lostReasons.reduce((s, r) => s + r.count, 0);

  return (
    <MainLayout>
      <div className="p-6 space-y-8 overflow-y-auto h-full">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-bold tracking-tight">Dashboard Comercial</h2>
                <p className="text-muted-foreground mt-1">Visão geral do pipeline de vendas.</p>
              </div>
              <div className="flex items-center gap-2 bg-secondary p-1 rounded-lg border border-border">
                {(['today', '7days', '30days'] as PeriodFilter[]).map(p => (
                  <button key={p} onClick={() => setPeriod(p)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${period === p ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                    {periodLabels[p]}
                  </button>
                ))}
              </div>
            </div>

            {/* Metric Cards */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {metrics.map((stat, i) => (
                <div key={i} className={`relative overflow-hidden rounded-2xl border bg-card p-6 shadow-lg transition-all hover:translate-y-[-2px] group bg-gradient-to-br ${getGradient(stat.label)}`}>
                  <div className="flex items-center justify-between pb-4">
                    <span className="text-sm font-medium text-muted-foreground">{stat.label}</span>
                    <div className="p-2 rounded-lg bg-secondary/50 border border-border">{getIcon(stat.label)}</div>
                  </div>
                  <div className="flex items-end justify-between">
                    <span className="text-3xl font-bold">{stat.value}</span>
                    {stat.trend !== '—' && (
                      <div className={`flex items-center text-xs font-medium px-2 py-1 rounded-full ${stat.trendUp ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-destructive/10 text-destructive border border-destructive/20'}`}>
                        {stat.trendUp ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                        {stat.trend}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Chart */}
            <div className="grid gap-6 md:grid-cols-7">
              <div className="col-span-4 rounded-2xl border bg-card p-6 shadow-lg">
                <h3 className="text-lg font-semibold mb-1">Volume de Leads</h3>
                <p className="text-sm text-muted-foreground mb-6">Novos leads no período</p>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorDeals" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tickMargin={10} fontSize={12} stroke="hsl(var(--muted-foreground))" />
                      <YAxis axisLine={false} tickLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                      <Area type="monotone" dataKey="deals" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorDeals)" activeDot={{ r: 6, strokeWidth: 0, fill: 'hsl(var(--primary))' }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="col-span-3 rounded-2xl border bg-card p-6 shadow-lg flex flex-col">
                <h3 className="text-lg font-semibold">Conversões</h3>
                <p className="text-sm text-muted-foreground mb-6">Leads ganhos por dia</p>
                <div className="flex-1 flex flex-col justify-center space-y-5">
                  {chartData.slice(0, 5).map((day, i) => (
                    <div key={i} className="group">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">{day.name}</span>
                        <span className="text-sm font-bold">{day.won} conv.</span>
                      </div>
                      <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all duration-1000"
                          style={{ width: `${Math.min((day.won / Math.max(...chartData.map((d: any) => d.won), 1)) * 100, 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 pt-4 border-t">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total no período</span>
                    <span className="text-primary font-bold">{chartData.reduce((s, d) => s + d.won, 0)} conversões</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Lost Reasons Section */}
            {lostReasons.length > 0 && (
              <div className="grid gap-6 md:grid-cols-7">
                <div className="col-span-4 rounded-2xl border bg-card p-6 shadow-lg">
                  <h3 className="text-lg font-semibold mb-1">Motivos de Perda</h3>
                  <p className="text-sm text-muted-foreground mb-6">Distribuição dos motivos no período</p>
                  <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={lostReasons.slice(0, 8)} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                        <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" axisLine={false} tickLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
                        <YAxis type="category" dataKey="reason" axisLine={false} tickLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" width={140} tick={{ fill: 'hsl(var(--foreground))' }} />
                        <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                        <Bar dataKey="count" fill="hsl(var(--destructive))" radius={[0, 6, 6, 0]} name="Quantidade" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="col-span-3 rounded-2xl border bg-card p-6 shadow-lg flex flex-col">
                  <h3 className="text-lg font-semibold">Detalhamento</h3>
                  <p className="text-sm text-muted-foreground mb-6">Leads perdidos por motivo</p>
                  <div className="flex-1 flex flex-col justify-center space-y-4">
                    {lostReasons.slice(0, 6).map((r, i) => (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-medium truncate max-w-[200px]">{r.reason}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{totalLost > 0 ? Math.round((r.count / totalLost) * 100) : 0}%</span>
                            <span className="text-sm font-bold text-destructive">{r.count}</span>
                          </div>
                        </div>
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-destructive/70 rounded-full transition-all duration-1000"
                            style={{ width: `${totalLost > 0 ? (r.count / totalLost) * 100 : 0}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 pt-4 border-t">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Total perdidos</span>
                      <span className="text-destructive font-bold">{totalLost} leads</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}
