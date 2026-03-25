import { useState, useEffect, useCallback, useRef } from 'react';
import { Brain, TrendingUp, TrendingDown, Clock, Users, Bot, AlertTriangle, Sparkles, RefreshCw, MessageSquare, Lightbulb, Activity, Store, Bike, BookOpen, Link2, FileText, CheckCircle2, XCircle, Zap, BarChart3, Target, ShieldAlert, Gauge, ArrowUpRight, ArrowDownRight, Minus, GraduationCap, Trophy, AlertCircle, Rocket, CheckSquare, CircleDot, UserX, Star, Wifi, WifiOff, CalendarDays, ChevronDown, ChevronRight, Flame, Repeat2, Filter, Medal, Crown, Eye, Download, CalendarClock, FileDown, History, Info, Bell, Wand2, ThumbsUp, ThumbsDown, Loader2, EyeOff } from 'lucide-react';
import { DelmaSuggestionsTab } from '@/components/admin/DelmaSuggestionsTab';
import { DelmaEvolutionTab } from '@/components/admin/DelmaEvolutionTab';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, PieChart, Pie, Legend } from 'recharts';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn, priorityLabel } from '@/lib/utils';
import { normalizeTag } from '@/lib/tagColors';
import { format, subDays, startOfDay, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AgentStat {
  name: string;
  count: number;
  avgTime: number;
  avgWaitTime: number;
  topTags: [string, number][];
  channels?: Record<string, number>;
  resolutionRate?: number;
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
  hourly?: Record<number, number>;
}

interface DailyTrend {
  date: string;
  tma: number;
  tme: number;
  urgent: number;
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
  prevTopTags?: [string, number][];
  channelCounts: Record<string, number>;
  priorityCounts: Record<string, number>;
  agentStats: AgentStat[];
  errorLogs: ErrorLog[];
  dailyTrends?: DailyTrend[];
  abandonRate?: number;
  abandonedCount?: number;
  prevErrorTags?: Record<string, number>;
  errorsByType?: {
    estabelecimento: ErrorTypeGroup;
    motoboy: ErrorTypeGroup;
    outros: ErrorTypeGroup;
  };
}

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
  agentStats: (raw.agentStats || []
  ),
  topTags: normalizeTopTags(raw.topTags || []),
  prevTopTags: raw.prevTopTags ? normalizeTopTags(raw.prevTopTags) : undefined,
  errorLogs: (raw.errorLogs || []).map((l: ErrorLog) => ({ ...l, tags: l.tags.map(normalizeTag) })),
  errorsByType: raw.errorsByType ? {
    estabelecimento: normalizeErrorTypeGroup(raw.errorsByType.estabelecimento),
    motoboy: normalizeErrorTypeGroup(raw.errorsByType.motoboy),
    outros: normalizeErrorTypeGroup(raw.errorsByType.outros),
  } : undefined,
});

// Channel colors for donut chart
const CHANNEL_COLORS: Record<string, string> = {
  whatsapp: 'hsl(142, 70%, 45%)',
  instagram: 'hsl(330, 80%, 55%)',
  machine: 'hsl(217, 91%, 60%)',
};

// Maturity Gauge SVG component
function MaturityGauge({ score }: { score: number }) {
  const radius = 70;
  const cx = 90;
  const cy = 85;
  const startAngle = Math.PI;
  const endAngle = 0;
  const totalAngle = Math.PI;
  const scoreAngle = startAngle - (score / 100) * totalAngle;

  const describeArc = (start: number, end: number, r: number) => {
    const x1 = cx + r * Math.cos(start);
    const y1 = cy - r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy - r * Math.sin(end);
    const largeArc = start - end > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
  };

  const needleX = cx + (radius - 10) * Math.cos(scoreAngle);
  const needleY = cy - (radius - 10) * Math.sin(scoreAngle);

  const scoreColor = score >= 70 ? 'hsl(var(--success))' : score >= 40 ? 'hsl(48, 96%, 53%)' : 'hsl(var(--destructive))';

  return (
    <svg viewBox="0 0 180 110" className="w-full max-w-[220px] mx-auto">
      {/* Red zone 0-40 */}
      <path d={describeArc(Math.PI, Math.PI - 0.4 * Math.PI, radius)} fill="none" stroke="hsl(var(--destructive))" strokeWidth="12" strokeLinecap="round" opacity="0.3" />
      {/* Yellow zone 40-70 */}
      <path d={describeArc(Math.PI - 0.4 * Math.PI, Math.PI - 0.7 * Math.PI, radius)} fill="none" stroke="hsl(48, 96%, 53%)" strokeWidth="12" strokeLinecap="round" opacity="0.3" />
      {/* Green zone 70-100 */}
      <path d={describeArc(Math.PI - 0.7 * Math.PI, 0, radius)} fill="none" stroke="hsl(var(--success))" strokeWidth="12" strokeLinecap="round" opacity="0.3" />
      {/* Score arc */}
      <path
        d={describeArc(Math.PI, scoreAngle, radius)}
        fill="none"
        stroke={scoreColor}
        strokeWidth="12"
        strokeLinecap="round"
        className="transition-all duration-1000"
      />
      {/* Needle */}
      <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke={scoreColor} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="4" fill={scoreColor} />
      {/* Score text */}
      <text x={cx} y={cy + 2} textAnchor="middle" className="text-2xl font-bold" fill="currentColor" fontSize="22">{score}</text>
      <text x={cx} y={cy + 16} textAnchor="middle" className="text-xs" fill="hsl(var(--muted-foreground))" fontSize="10">/100</text>
    </svg>
  );
}

// Heatmap component for error hours
function HourlyHeatmap({ data, label }: { data: Record<number, number>; label: string }) {
  const maxVal = Math.max(1, ...Object.values(data));
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2">{label}</p>
      <div className="flex gap-0.5 flex-wrap">
        {hours.map(h => {
          const count = data[h] || 0;
          const intensity = count / maxVal;
          return (
            <div
              key={h}
              className="w-6 h-6 rounded-sm flex items-center justify-center text-[9px] border border-border/30 cursor-default"
              style={{ backgroundColor: count > 0 ? `hsla(var(--destructive) / ${0.15 + intensity * 0.7})` : 'transparent' }}
              title={`${h}h: ${count} erros`}
            >
              {h}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const AdminBrain = () => {
  const [period, setPeriod] = useState('7');
  const [customDateRange, setCustomDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [metrics, setMetrics] = useState<BrainMetrics | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [activeTab, setActiveTab] = useState('overview');
  const [errorsSubTab, setErrorsSubTab] = useState('todos');
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Phase 2 state
  const [completedSteps, setCompletedSteps] = useState<Record<number, string>>({});
  const [trainModalOpen, setTrainModalOpen] = useState(false);
  const [trainModalTag, setTrainModalTag] = useState('');
  const [trainNote, setTrainNote] = useState('');
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const [topTagsChannelFilter, setTopTagsChannelFilter] = useState('all');
  const [groupSimilarTags, setGroupSimilarTags] = useState(false);

  // Phase 3 state
  const [agentSheetOpen, setAgentSheetOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentStat | null>(null);
  const [reportHistory, setReportHistory] = useState<Array<{ id: string; created_at: string; period: number; provider: string; content: string; context: string | null }>>([]);
  const [selectedHistoryReport, setSelectedHistoryReport] = useState<string | null>(null);
  const [reportContext, setReportContext] = useState('');
  const [reportFallbackError, setReportFallbackError] = useState('');

  // Maturity score history
  const [maturityHistory, setMaturityHistory] = useState<Array<{ date: string; score: number }>>([]);

  // Agent live status
  const [agentLiveStatus, setAgentLiveStatus] = useState<Record<string, { status: string; openConversations: number; profileId: string }>>({});

  // Report scheduling
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleConfig, setScheduleConfig] = useState<{ type: string; dayOfWeek: number; hourOfDay: number; isActive: boolean }>({ type: 'weekly', dayOfWeek: 1, hourOfDay: 8, isActive: false });

  // Agent notification state
  const [notifyModalOpen, setNotifyModalOpen] = useState(false);
  const [notifyAgent, setNotifyAgent] = useState<AgentStat | null>(null);
  const [notifyMessage, setNotifyMessage] = useState('');
  const [notifyGenerating, setNotifyGenerating] = useState(false);
  const [notifySending, setNotifySending] = useState(false);
  const [agentNotifications, setAgentNotifications] = useState<Record<string, boolean>>({});

  // Delma autonomous state
  const [delmaSuggestionsCount, setDelmaSuggestionsCount] = useState(0);
  const [observationMode, setObservationMode] = useState(false);

  // Training suggestions state
  interface TrainingSuggestion {
    id: string;
    robot_id: string;
    robot_name: string;
    suggestion_type: string;
    title: string;
    content: string;
    reasoning: string | null;
    status: string;
    created_at: string;
  }
  const [trainingSuggestions, setTrainingSuggestions] = useState<TrainingSuggestion[]>([]);
  const [loadingTraining, setLoadingTraining] = useState(false);
  const [generatingTraining, setGeneratingTraining] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const autoTriggeredTraining = useRef(false);

  const getEffectivePeriod = useCallback(() => {
    if (period === 'custom' && customDateRange.from && customDateRange.to) {
      return Math.max(1, differenceInDays(customDateRange.to, customDateRange.from) + 1);
    }
    if (period === 'today') return 1;
    if (period === 'yesterday') return 1;
    return parseInt(period);
  }, [period, customDateRange]);

  const getEffectiveDateRange = useCallback(() => {
    const now = new Date();
    // Calcular a data atual em São Paulo corretamente
    const spFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const spDateStr = spFormatter.format(now); // "2026-03-24"
    // Meia-noite de SP = T03:00:00.000Z (UTC-3)
    const todayMidnightUTC = new Date(spDateStr + 'T03:00:00.000Z');

    if (period === 'today') {
      return { start: todayMidnightUTC.toISOString(), end: now.toISOString(), days: 1 };
    }
    if (period === 'yesterday') {
      const yesterdayMidnight = new Date(todayMidnightUTC.getTime() - 24 * 60 * 60 * 1000);
      return { start: yesterdayMidnight.toISOString(), end: todayMidnightUTC.toISOString(), days: 1 };
    }
    if (period === 'custom' && customDateRange.from && customDateRange.to) {
      const fromStr = customDateRange.from.toISOString().substring(0, 10);
      const toStr = customDateRange.to.toISOString().substring(0, 10);
      const fromUTC = new Date(fromStr + 'T03:00:00.000Z');
      const toUTC = new Date(new Date(toStr + 'T03:00:00.000Z').getTime() + 24 * 60 * 60 * 1000);
      const days = Math.max(1, differenceInDays(customDateRange.to, customDateRange.from) + 1);
      return { start: fromUTC.toISOString(), end: toUTC.toISOString(), days };
    }
    const days = parseInt(period);
    const startDate = new Date(todayMidnightUTC.getTime() - days * 24 * 60 * 60 * 1000);
    return { start: startDate.toISOString(), end: now.toISOString(), days };
  }, [period, customDateRange]);

  const fetchMetrics = useCallback(async (showToast = false) => {
    setLoadingMetrics(true);
    setFetchError(false);
    try {
      const effectivePeriod = getEffectivePeriod();
      const dateRange = getEffectiveDateRange();
      const { data, error } = await supabase.functions.invoke('brain-analysis', {
        body: { period: effectivePeriod, metricsOnly: true, periodStart: dateRange.start, periodEnd: dateRange.end },
      });
      if (error) throw error;
      setMetrics(filterMetrics(data.metrics));
      setLastUpdated(new Date());
      if (showToast) toast.success('Métricas atualizadas!');
    } catch (e: any) {
      console.error(e);
      setFetchError(true);
      if (showToast) toast.error('Erro ao carregar métricas');
    } finally {
      setLoadingMetrics(false);
    }
  }, [getEffectivePeriod, getEffectiveDateRange]);

  const [reportProvider, setReportProvider] = useState<string>('');
  const [reportFallback, setReportFallback] = useState(false);

  const fetchReport = async () => {
    setLoadingReport(true);
    try {
      const effectivePeriod = getEffectivePeriod();
      const dateRange = getEffectiveDateRange();
      const { data, error } = await supabase.functions.invoke('brain-analysis', {
        body: { period: effectivePeriod, userContext: reportContext || undefined, periodStart: dateRange.start, periodEnd: dateRange.end },
      });
      if (error) throw error;
      setMetrics(filterMetrics(data.metrics));
      setAiAnalysis(data.aiAnalysis);
      setReportProvider(data.providerUsed || '');
      setReportFallback(data.fallbackUsed || false);
      setReportFallbackError(data.fallbackError || '');
      setLastUpdated(new Date());

      // Save to brain_reports
      if (data.aiAnalysis) {
        try {
          await supabase.from('brain_reports' as any).insert({
            period: effectivePeriod,
            provider: data.providerUsed || 'unknown',
            content: data.aiAnalysis,
            context: reportContext || null,
          });
          loadReportHistory();
        } catch (saveErr) {
          console.warn('Could not save report:', saveErr);
        }
      }

      if (data.fallbackUsed) {
        toast.info(`Relatório gerado via ${data.providerUsed || 'fallback'} (provedor principal indisponível)`);
      } else {
        toast.success(`Relatório da Delma gerado! (${data.providerUsed || 'IA'})`);
      }
    } catch (e: any) {
      console.error(e);
      toast.error('Erro ao gerar relatório: ' + (e.message || 'Erro desconhecido'));
    } finally {
      setLoadingReport(false);
    }
  };

  const loadReportHistory = async () => {
    try {
      const { data } = await supabase
        .from('brain_reports' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      setReportHistory((data as any[]) || []);
    } catch {
      // silently fail
    }
  };

  const exportPdf = async () => {
    const element = document.getElementById('brain-report-content');
    if (!element) return;
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      html2pdf().set({
        margin: [10, 10],
        filename: `relatorio-delma-${format(new Date(), 'yyyy-MM-dd')}.pdf`,
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }).from(element).save();
      toast.success('PDF exportado!');
    } catch {
      toast.error('Erro ao exportar PDF');
    }
  };

  // Save maturity score to history
  const saveMaturityScore = useCallback(async (score: number) => {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const { data: existing } = await supabase.from('app_settings').select('*').eq('key', 'brain_maturity_history').maybeSingle();
      let history: Array<{ date: string; score: number }> = existing ? JSON.parse(existing.value) : [];
      // Only save once per day
      if (history.length > 0 && history[history.length - 1].date === today) {
        history[history.length - 1].score = score;
      } else {
        history.push({ date: today, score });
      }
      // Keep last 30 entries
      history = history.slice(-30);
      if (existing) {
        await supabase.from('app_settings').update({ value: JSON.stringify(history) }).eq('key', 'brain_maturity_history');
      } else {
        await supabase.from('app_settings').insert({ key: 'brain_maturity_history', value: JSON.stringify(history) });
      }
      setMaturityHistory(history);
    } catch {
      // silently fail
    }
  }, []);

  const loadMaturityHistory = async () => {
    try {
      const { data } = await supabase.from('app_settings').select('*').eq('key', 'brain_maturity_history').maybeSingle();
      if (data) setMaturityHistory(JSON.parse(data.value));
    } catch {}
  };

  // Load agent live status — only Suporte department members
  const loadAgentLiveStatus = useCallback(async () => {
    try {
      // Find Suporte department
      const { data: suporteDept } = await supabase
        .from('departments')
        .select('id')
        .ilike('name', '%suporte%')
        .limit(1)
        .maybeSingle();

      let suporteMemberIds = new Set<string>();
      if (suporteDept) {
        const { data: memberLinks } = await supabase
          .from('profile_departments')
          .select('profile_id')
          .eq('department_id', suporteDept.id);
        if (memberLinks) {
          suporteMemberIds = new Set(memberLinks.map((m: any) => m.profile_id));
        }
      }

      const { data: profiles } = await supabase.from('profiles').select('id, name, status');
      const { data: conversations } = await supabase.from('conversations').select('assigned_to').neq('status', 'finalizada');
      if (profiles && conversations) {
        const openCounts: Record<string, number> = {};
        conversations.forEach((c: any) => {
          if (c.assigned_to) openCounts[c.assigned_to] = (openCounts[c.assigned_to] || 0) + 1;
        });
        const statusMap: Record<string, { status: string; openConversations: number; profileId: string }> = {};
        // Only include Suporte members
        const filteredProfiles = suporteMemberIds.size > 0
          ? profiles.filter((p: any) => suporteMemberIds.has(p.id))
          : profiles;
        filteredProfiles.forEach((p: any) => {
          statusMap[p.name] = { status: p.status, openConversations: openCounts[p.id] || 0, profileId: p.id };
        });
        setAgentLiveStatus(statusMap);
      }
    } catch {}
  }, []);

  // Load/save report schedule
  const loadScheduleConfig = async () => {
    try {
      const { data } = await supabase.from('report_schedule').select('*').eq('schedule_type', 'brain_report').maybeSingle();
      if (data) {
        setScheduleConfig({
          type: 'weekly',
          dayOfWeek: data.day_of_week ?? 1,
          hourOfDay: data.hour_of_day ?? 8,
          isActive: data.is_active ?? false,
        });
      }
    } catch {}
  };

  const saveScheduleConfig = async () => {
    try {
      const { data: existing } = await supabase.from('report_schedule').select('id').eq('schedule_type', 'brain_report').maybeSingle();
      const payload = {
        schedule_type: 'brain_report',
        day_of_week: scheduleConfig.dayOfWeek,
        hour_of_day: scheduleConfig.hourOfDay,
        is_active: scheduleConfig.isActive,
      };
      if (existing) {
        await supabase.from('report_schedule').update(payload).eq('id', existing.id);
      } else {
        await supabase.from('report_schedule').insert(payload);
      }
      toast.success('Agendamento salvo!');
      setScheduleDialogOpen(false);
    } catch {
      toast.error('Erro ao salvar agendamento');
    }
  };

  // Load which agents have been notified in current period
  const loadAgentNotifications = useCallback(async () => {
    try {
      const effectivePeriod = getEffectivePeriod();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - effectivePeriod);
      const { data } = await supabase
        .from('agent_notifications' as any)
        .select('agent_id, created_at')
        .gte('created_at', cutoff.toISOString());
      const notifiedMap: Record<string, boolean> = {};
      (data || []).forEach((n: any) => { notifiedMap[n.agent_id] = true; });
      setAgentNotifications(notifiedMap);
    } catch {}
  }, [getEffectivePeriod]);

  // Generate feedback via edge function
  const generateFeedback = async () => {
    if (!notifyAgent || !metrics) return;
    setNotifyGenerating(true);
    try {
      const teamAvgTma = metrics.agentStats.reduce((s, a) => s + a.avgTime, 0) / metrics.agentStats.length;
      const teamAvgTme = metrics.agentStats.reduce((s, a) => s + a.avgWaitTime, 0) / metrics.agentStats.length;
      const { data, error } = await supabase.functions.invoke('brain-agent-feedback', {
        body: {
          agentName: notifyAgent.name,
          agentStats: notifyAgent,
          teamAvgTma,
          teamAvgTme,
          periodLabel: `últimos ${getEffectivePeriod()} dias`,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setNotifyMessage(data.message || '');
      toast.success('Feedback gerado pela Delma!');
    } catch (e: any) {
      toast.error('Erro ao gerar feedback: ' + (e.message || 'Erro desconhecido'));
    } finally {
      setNotifyGenerating(false);
    }
  };

  // Send notification
  const sendNotification = async () => {
    if (!notifyAgent || !notifyMessage.trim() || !metrics) return;
    setNotifySending(true);
    try {
      // Find agent_id by name from profiles
      const { data: profileData } = await supabase.from('profiles').select('id').ilike('name', notifyAgent.name).maybeSingle();
      if (!profileData) throw new Error('Perfil do atendente não encontrado');
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) throw new Error('Usuário não autenticado');

      const teamAvgTma = metrics.agentStats.reduce((s, a) => s + a.avgTime, 0) / metrics.agentStats.length;
      const teamAvgTme = metrics.agentStats.reduce((s, a) => s + a.avgWaitTime, 0) / metrics.agentStats.length;

      const { error } = await supabase.from('agent_notifications' as any).insert({
        agent_id: profileData.id,
        sent_by: authData.user.id,
        period_days: getEffectivePeriod(),
        metrics: {
          count: notifyAgent.count,
          avgTime: notifyAgent.avgTime,
          avgWaitTime: notifyAgent.avgWaitTime,
          topTags: notifyAgent.topTags.slice(0, 3),
          resolutionRate: notifyAgent.resolutionRate,
          teamAvgTma,
          teamAvgTme,
        },
        message: notifyMessage,
      });
      if (error) throw error;
      toast.success(`Notificação enviada para ${notifyAgent.name}!`);
      setNotifyModalOpen(false);
      setNotifyMessage('');
      setNotifyAgent(null);
      loadAgentNotifications();
    } catch (e: any) {
      toast.error('Erro ao enviar: ' + (e.message || 'Erro desconhecido'));
    } finally {
      setNotifySending(false);
    }
  };

  // Training suggestions functions
  const loadTrainingSuggestions = async () => {
    setLoadingTraining(true);
    try {
      const { data, error } = await supabase
        .from('robot_training_suggestions' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTrainingSuggestions((data as any[]) || []);
    } catch (e) {
      console.error('Error loading training suggestions:', e);
    } finally {
      setLoadingTraining(false);
    }
  };

  const generateTrainingSuggestions = async () => {
    setGeneratingTraining(true);
    try {
      const { data, error } = await supabase.functions.invoke('brain-train-robots');
      if (error) throw error;
      toast.success(data.message || `${data.suggestions} sugestões geradas!`);
      loadTrainingSuggestions();
    } catch (e: any) {
      toast.error('Erro ao gerar treinamento: ' + (e.message || 'Erro desconhecido'));
    } finally {
      setGeneratingTraining(false);
    }
  };

  const handleSuggestionAction = async (id: string, action: 'approved' | 'rejected') => {
    setApplyingId(id);
    try {
      const suggestion = trainingSuggestions.find(s => s.id === id);
      if (!suggestion) throw new Error('Sugestão não encontrada');

      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) throw new Error('Não autenticado');

      // If approving a Q&A suggestion, add it to the robot's qa_pairs
      if (action === 'approved' && suggestion.suggestion_type === 'qa') {
        const { data: robot } = await supabase.from('robots').select('qa_pairs').eq('id', suggestion.robot_id).single();
        if (robot) {
          const existingQA = Array.isArray(robot.qa_pairs) ? robot.qa_pairs : [];
          // Parse Q&A from content (format: "Pergunta: ... | Resposta: ...")
          const parts = suggestion.content.split('|').map((s: string) => s.trim());
          const question = parts[0]?.replace(/^Pergunta:\s*/i, '') || suggestion.title;
          const answer = parts[1]?.replace(/^Resposta:\s*/i, '') || suggestion.content;
          const newQA = [...existingQA, { question, answer }];
          await supabase.from('robots').update({ qa_pairs: newQA }).eq('id', suggestion.robot_id);
        }
      }

      // If approving a tone/instruction suggestion, append to instructions
      if (action === 'approved' && (suggestion.suggestion_type === 'tone' || suggestion.suggestion_type === 'instruction')) {
        const { data: robot } = await supabase.from('robots').select('instructions').eq('id', suggestion.robot_id).single();
        if (robot) {
          const currentInstructions = robot.instructions || '';
          const newInstructions = currentInstructions + '\n\n' + suggestion.content;
          await supabase.from('robots').update({ instructions: newInstructions }).eq('id', suggestion.robot_id);
        }
      }

      // Update suggestion status
      await supabase
        .from('robot_training_suggestions' as any)
        .update({
          status: action,
          reviewed_by: authData.user.id,
          reviewed_at: new Date().toISOString(),
          ...(action === 'approved' ? { applied_at: new Date().toISOString() } : {}),
        })
        .eq('id', id);

      toast.success(action === 'approved' ? `Sugestão aplicada no robô ${suggestion.robot_name}!` : 'Sugestão rejeitada.');
      loadTrainingSuggestions();
    } catch (e: any) {
      toast.error('Erro: ' + (e.message || 'Erro desconhecido'));
    } finally {
      setApplyingId(null);
    }
  };



  useEffect(() => {
    intervalRef.current = setInterval(() => fetchMetrics(), 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchMetrics]);

  useEffect(() => {
    const channel = supabase
      .channel('brain-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_logs' }, () => {
        fetchMetrics();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchMetrics]);

  // Load observation mode
  const loadObservationMode = async () => {
    try {
      const { data } = await supabase.from('app_settings').select('value').eq('key', 'delma_observation_mode').maybeSingle();
      setObservationMode(data?.value === 'true');
    } catch {}
  };

  const toggleObservationMode = async () => {
    const newVal = !observationMode;
    setObservationMode(newVal);
    try {
      const { data: existing } = await supabase.from('app_settings').select('id').eq('key', 'delma_observation_mode').maybeSingle();
      if (existing) {
        await supabase.from('app_settings').update({ value: String(newVal) }).eq('key', 'delma_observation_mode');
      } else {
        await supabase.from('app_settings').insert({ key: 'delma_observation_mode', value: String(newVal) });
      }
      toast.success(newVal ? 'Delma em modo observação' : 'Delma ativa — sugestões visíveis');
    } catch {
      setObservationMode(!newVal);
      toast.error('Erro ao alterar modo');
    }
  };

  useEffect(() => {
    loadReportHistory();
    loadMaturityHistory();
    loadScheduleConfig();
    loadAgentLiveStatus();
    loadAgentNotifications();
    loadTrainingSuggestions();
    loadObservationMode();
  }, [getEffectivePeriod, loadAgentLiveStatus, loadAgentNotifications]);

  // Save maturity score when metrics update
  useEffect(() => {
    if (metrics) {
      const knowledgeData = computeKnowledgeData(metrics);
      saveMaturityScore(knowledgeData.maturityScore);
    }
  }, [metrics, saveMaturityScore]);

  // Auto-trigger training generation on first visit if empty
  useEffect(() => {
    if (!loadingTraining && trainingSuggestions.length === 0 && !autoTriggeredTraining.current && !generatingTraining) {
      autoTriggeredTraining.current = true;
      generateTrainingSuggestions();
    }
  }, [loadingTraining, trainingSuggestions.length]);

  // Refresh agent live status every 30s
  useEffect(() => {
    const interval = setInterval(loadAgentLiveStatus, 30000);
    return () => clearInterval(interval);
  }, [loadAgentLiveStatus]);

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

  const learnings = metrics ? computeLearnings(metrics) : [];

  // System status
  const systemStatus = fetchError ? 'offline' : (reportFallback ? 'degraded' : 'online');
  const systemStatusConfig = {
    online: { label: 'Online', color: 'bg-success', textColor: 'text-success', icon: Wifi },
    degraded: { label: 'Degradado', color: 'bg-warning', textColor: 'text-warning', icon: WifiOff },
    offline: { label: 'Offline', color: 'bg-destructive', textColor: 'text-destructive', icon: WifiOff },
  };
  const statusCfg = systemStatusConfig[systemStatus];

  const periodLabel = period === 'today' ? 'Hoje' : period === 'yesterday' ? 'Ontem' : period === 'custom' ? 'Personalizado' : `${period} dias`;

  // Channel donut data
  const channelDonutData = metrics ? Object.entries(metrics.channelCounts).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value,
    fill: CHANNEL_COLORS[name] || 'hsl(var(--primary))',
  })) : [];

  // Urgent sparkline data
  const urgentSparkData = metrics?.dailyTrends?.slice(-7).map(d => ({ date: d.date.substring(5), urgent: d.urgent })) || [];

  // Toggle step completion
  const toggleStep = (idx: number) => {
    setCompletedSteps(prev => {
      const next = { ...prev };
      if (next[idx]) {
        delete next[idx];
      } else {
        next[idx] = new Date().toISOString();
      }
      return next;
    });
  };

  // Save training note to app_settings
  const saveTrainNote = async () => {
    if (!trainNote.trim()) return;
    try {
      const entry = { tag: trainModalTag, note: trainNote, date: new Date().toISOString() };
      const { data: existing } = await supabase.from('app_settings').select('*').eq('key', 'brain_training_log').maybeSingle();
      const log = existing ? [...JSON.parse(existing.value), entry] : [entry];
      if (existing) {
        await supabase.from('app_settings').update({ value: JSON.stringify(log) }).eq('key', 'brain_training_log');
      } else {
        await supabase.from('app_settings').insert({ key: 'brain_training_log', value: JSON.stringify(log) });
      }
      toast.success(`Treinamento registrado para "${trainModalTag}"`);
      setTrainModalOpen(false);
      setTrainNote('');
    } catch {
      toast.error('Erro ao salvar treinamento');
    }
  };

  // Toggle error card expand
  const toggleErrorExpand = (id: string) => {
    setExpandedErrors(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <MainLayout>
      <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg relative">
              <Brain className="w-7 h-7 text-primary-foreground" />
              <span className={cn("absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background", statusCfg.color, systemStatus === 'online' && 'animate-pulse')} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Delma</h1>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <statusCfg.icon className={cn("w-3 h-3", statusCfg.textColor)} />
                {statusCfg.label} — Monitorando o suporte em tempo real
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-2">
            <Switch checked={!observationMode} onCheckedChange={() => toggleObservationMode()} />
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              {observationMode ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {observationMode ? 'Observação' : 'Ativa'}
            </span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/50 px-2.5 py-1.5 rounded-md">
              <div className={cn("w-2 h-2 rounded-full", statusCfg.color)} />
              <span>{statusCfg.label}</span>
              {lastUpdated && (
                <span className="ml-1 opacity-70">
                  • {lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
            </div>

            <Select value={period} onValueChange={(val) => {
              setPeriod(val);
              if (val !== 'custom') setCustomDateRange({});
            }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="yesterday">Ontem</SelectItem>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="15">15 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>

            {period === 'custom' && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <CalendarDays className="w-4 h-4" />
                    {customDateRange.from && customDateRange.to
                      ? `${format(customDateRange.from, 'dd/MM')} - ${format(customDateRange.to, 'dd/MM')}`
                      : 'Selecionar datas'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={customDateRange.from && customDateRange.to ? { from: customDateRange.from, to: customDateRange.to } : undefined}
                    onSelect={(range: any) => {
                      if (range?.from && range?.to) {
                        setCustomDateRange({ from: range.from, to: range.to });
                      } else if (range?.from) {
                        setCustomDateRange({ from: range.from });
                      }
                    }}
                    numberOfMonths={1}
                    disabled={(date) => date > new Date()}
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            )}

            <Button variant="outline" size="icon" onClick={() => { fetchMetrics(true); loadAgentLiveStatus(); loadMaturityHistory(); loadReportHistory(); loadAgentNotifications(); }} disabled={loadingMetrics}>
              <RefreshCw className={cn("w-4 h-4", loadingMetrics && "animate-spin")} />
            </Button>
          </div>
        </div>

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
              <TabsTrigger value="knowledge">Conhecimento</TabsTrigger>
              <TabsTrigger value="top-tags">Top Tags</TabsTrigger>
              <TabsTrigger value="ai-report">Relatório IA</TabsTrigger>
              <TabsTrigger value="training" className="gap-1">
                <Wand2 className="w-3.5 h-3.5" />
                Treinamento
                {trainingSuggestions.filter(s => s.status === 'pending').length > 0 && (
                  <Badge className="ml-1 text-[10px] bg-primary text-primary-foreground h-4 min-w-4 px-1">
                    {trainingSuggestions.filter(s => s.status === 'pending').length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="delma-suggestions" className="gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                Sugestões
                {delmaSuggestionsCount > 0 && (
                  <Badge className="ml-1 text-[10px] bg-primary text-primary-foreground h-4 min-w-4 px-1">
                    {delmaSuggestionsCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="delma-evolution" className="gap-1">
                <Activity className="w-3.5 h-3.5" />
                Evolução
              </TabsTrigger>
            </TabsList>

            {/* ======================== PAINEL TAB ======================== */}
            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                <KPICard title="Total Conversas" value={metrics.totalConversas} icon={MessageSquare} trend={getTrend(metrics.totalConversas, metrics.prevTotalConversas)} />
                <KPICard title="TMA" value={formatTime(metrics.tma)} icon={Clock} trend={getTrend(metrics.tma, metrics.prevTma, true)} subtitle="Tempo médio de atendimento" />
                <KPICard title="TME" value={formatTime(metrics.tme)} icon={Clock} trend={getTrend(metrics.tme, metrics.prevTme, true)} subtitle="Tempo médio de espera" />
                <KPICard
                  title="Resolução IA"
                  value={metrics.aiResolved + metrics.humanResolved > 0 ? `${Math.round((metrics.aiResolved / (metrics.aiResolved + metrics.humanResolved)) * 100)}%` : '0%'}
                  icon={Bot}
                  subtitle={`${metrics.aiResolved} IA / ${metrics.humanResolved} humano`}
                />
                <KPICard
                  title="Taxa de Abandono"
                  value={metrics.abandonRate != null ? `${metrics.abandonRate}%` : 'N/A'}
                  icon={UserX}
                  subtitle={metrics.abandonedCount != null ? `${metrics.abandonedCount} abandonadas` : undefined}
                />
                <KPICard title="CSAT" value="—" icon={Star} subtitle="Sem dados de avaliação" />
              </div>

              {metrics.dailyTrends && metrics.dailyTrends.length > 1 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Activity className="w-4 h-4" />
                      Tendência TMA / TME
                    </CardTitle>
                    <CardDescription>Evolução diária no período ({periodLabel})</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={metrics.dailyTrends} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                          <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(val) => val.substring(5)} />
                          <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} unit="min" />
                          <Tooltip
                            contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                            labelStyle={{ color: 'hsl(var(--foreground))' }}
                            formatter={(value: number, name: string) => [`${value} min`, name]}
                            labelFormatter={(label) => `Dia ${label}`}
                          />
                          <Line type="monotone" dataKey="tma" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} name="TMA" />
                          <Line type="monotone" dataKey="tme" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3 }} name="TME" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

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
                        {metrics.topTags.slice(0, 8).map(([tag, count]) => {
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

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader><CardTitle className="text-base">Por Canal</CardTitle></CardHeader>
                  <CardContent>
                    {channelDonutData.length > 0 ? (
                      <div className="h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={channelDonutData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value"
                              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                              {channelDonutData.map((entry, idx) => (<Cell key={idx} fill={entry.fill} />))}
                            </Pie>
                            <Tooltip contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} formatter={(value: number, name: string) => [value, name]} />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-6">Sem dados de canal.</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base">Por Prioridade</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(metrics.priorityCounts).map(([priority, count]) => (
                        <Badge key={priority} className={cn("text-sm", priorityColors[priority] || 'bg-muted text-muted-foreground')}>{priorityLabel(priority)}: {count}</Badge>
                      ))}
                    </div>
                    {urgentSparkData.length > 1 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Urgentes (últimos 7 dias)</p>
                        <div className="h-[60px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={urgentSparkData}>
                              <Line type="monotone" dataKey="urgent" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
                              <Tooltip contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '12px' }} formatter={(v: number) => [v, 'Urgentes']} labelFormatter={(l) => l} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ======================== ERRORS TAB ======================== */}
            <TabsContent value="errors" className="space-y-6">
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { key: 'todos', label: 'Todos', icon: AlertTriangle, count: metrics.errorLogs.length },
                  { key: 'estabelecimento', label: 'Estabelecimento', icon: Store, count: metrics.errorsByType?.estabelecimento.total || 0 },
                  { key: 'motoboy', label: 'Motoboy', icon: Bike, count: metrics.errorsByType?.motoboy.total || 0 },
                  { key: 'outros', label: 'Outros', icon: AlertCircle, count: metrics.errorsByType?.outros.total || 0 },
                ].map(tab => (
                  <Button key={tab.key} variant={errorsSubTab === tab.key ? 'default' : 'outline'} size="sm" onClick={() => setErrorsSubTab(tab.key)} className="gap-2">
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                    <Badge variant="secondary" className="text-xs ml-1">{tab.count}</Badge>
                  </Button>
                ))}
              </div>

              {/* Top 10 horizontal bars */}
              {(() => {
                const motivos = errorsSubTab === 'todos'
                  ? mergeMotivos(metrics.errorsByType)
                  : (metrics.errorsByType?.[errorsSubTab as 'estabelecimento' | 'motoboy' | 'outros']?.motivos || {});
                const chartData = Object.entries(motivos)
                  .map(([name, value]) => ({
                    name,
                    value: value as number,
                    recurrent: !!(metrics.prevErrorTags && metrics.prevErrorTags[name]),
                  }))
                  .sort((a, b) => b.value - a.value)
                  .slice(0, 10);
                const barColors: Record<string, string> = {
                  'Acidente - Urgente': 'hsl(0, 72%, 51%)',
                  'Operacional - Geral': 'hsl(25, 95%, 53%)',
                  'Financeiro - Normal': 'hsl(217, 91%, 60%)',
                  'Duvida - Geral': 'hsl(160, 84%, 39%)',
                  'Comercial - B2B': 'hsl(48, 96%, 53%)',
                };
                return chartData.length > 0 ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Top 10 Motivos de Erro</CardTitle>
                      <CardDescription>
                        Distribuição das tags nas conversas problemáticas
                        {errorsSubTab !== 'todos' && ` — ${errorsSubTab.charAt(0).toUpperCase() + errorsSubTab.slice(1)}`}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div style={{ height: `${Math.max(120, chartData.length * 45 + 40)}px` }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20 }} barSize={24}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} />
                            <XAxis type="number" className="text-xs" allowDecimals={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                            <YAxis dataKey="name" type="category" width={150} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                            <Tooltip
                              contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                              labelStyle={{ color: 'hsl(var(--foreground))' }}
                              formatter={(value: number, name: string, props: any) => {
                                const item = chartData.find(d => d.name === props.payload.name);
                                return [`${value} conversas`, item?.recurrent ? `${props.payload.name} 🔁 Reincidente` : props.payload.name];
                              }}
                            />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                              {chartData.map((entry, idx) => (
                                <Cell key={idx} fill={barColors[entry.name] || 'hsl(var(--primary))'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      {/* Recurrence badges */}
                      {chartData.some(d => d.recurrent) && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {chartData.filter(d => d.recurrent).map(d => (
                            <Badge key={d.name} variant="outline" className="text-xs gap-1 border-warning/30 text-warning">
                              <Repeat2 className="w-3 h-3" />
                              {d.name} — Reincidente
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ) : null;
              })()}

              {/* Expandable error cards */}
              {(() => {
                const filteredLogs = errorsSubTab === 'todos'
                  ? metrics.errorLogs
                  : (metrics.errorsByType?.[errorsSubTab as 'estabelecimento' | 'motoboy' | 'outros']?.logs || []);

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

                // Group by primary tag
                const byMotivo: Record<string, ErrorLog[]> = {};
                filteredLogs.forEach(l => {
                  const motivo = l.tags[0] || 'Sem tag';
                  if (!byMotivo[motivo]) byMotivo[motivo] = [];
                  byMotivo[motivo].push(l);
                });
                const sortedMotivos = Object.entries(byMotivo).sort((a, b) => b[1].length - a[1].length);

                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-muted-foreground">
                        {filteredLogs.length} conversa{filteredLogs.length !== 1 ? 's' : ''} problemática{filteredLogs.length !== 1 ? 's' : ''}
                      </h3>
                    </div>
                    {sortedMotivos.map(([motivo, logs]) => {
                      const isExpanded = expandedErrors.has(motivo);
                      const isRecurrent = !!(metrics.prevErrorTags && metrics.prevErrorTags[motivo]);
                      const priorities = logs.reduce((acc, l) => { acc[l.priority] = (acc[l.priority] || 0) + 1; return acc; }, {} as Record<string, number>);
                      return (
                        <Card key={motivo} className="overflow-hidden">
                          <Collapsible open={isExpanded} onOpenChange={() => toggleErrorExpand(motivo)}>
                            <CollapsibleTrigger asChild>
                              <CardHeader className="cursor-pointer hover:bg-secondary/30 transition-colors py-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-semibold text-sm">{motivo}</span>
                                        {isRecurrent && (
                                          <Badge variant="outline" className="text-[10px] border-warning/30 text-warning gap-1">
                                            <Repeat2 className="w-2.5 h-2.5" /> Reincidente
                                          </Badge>
                                        )}
                                      </div>
                                      <p className="text-xs text-muted-foreground mt-0.5">
                                        {logs.length} conversa{logs.length !== 1 ? 's' : ''} •{' '}
                                        {Object.entries(priorities).map(([p, c]) => `${priorityLabel(p)}: ${c}`).join(' • ')}
                                      </p>
                                    </div>
                                  </div>
                                  <Badge className={cn("text-xs", logs.length > 5 ? 'bg-destructive/20 text-destructive' : logs.length > 2 ? 'bg-warning/20 text-warning' : 'bg-muted text-muted-foreground')}>
                                    {logs.length}
                                  </Badge>
                                </div>
                              </CardHeader>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <CardContent className="pt-0 pb-4">
                                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                  {logs.slice(0, 20).map(log => (
                                    <div key={log.id} className="text-xs p-2.5 rounded bg-secondary/30 flex items-center justify-between gap-2">
                                      <div className="min-w-0">
                                        <span className="font-medium">{log.contact_name}</span>
                                        {log.contact_phone && <span className="text-muted-foreground ml-2">{log.contact_phone}</span>}
                                        {log.assigned_to_name && <span className="text-muted-foreground ml-2">→ {log.assigned_to_name}</span>}
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <Badge className={cn("text-[10px]", priorityColors[log.priority])}>{priorityLabel(log.priority)}</Badge>
                                        <span className="text-muted-foreground">{log.channel || 'whatsapp'}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </CardContent>
                            </CollapsibleContent>
                          </Collapsible>
                        </Card>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Hourly Heatmap */}
              {metrics.errorsByType && (errorsSubTab === 'todos' || errorsSubTab !== 'todos') && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Flame className="w-4 h-4 text-destructive" />
                      Mapa de Calor — Erros por Hora
                    </CardTitle>
                    <CardDescription>Concentração de conversas problemáticas ao longo do dia</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {errorsSubTab === 'todos' ? (
                      <>
                        <HourlyHeatmap data={metrics.errorsByType.estabelecimento.hourly || {}} label="Estabelecimento" />
                        <HourlyHeatmap data={metrics.errorsByType.motoboy.hourly || {}} label="Motoboy" />
                        <HourlyHeatmap data={metrics.errorsByType.outros.hourly || {}} label="Outros" />
                      </>
                    ) : (
                      <HourlyHeatmap
                        data={(metrics.errorsByType[errorsSubTab as 'estabelecimento' | 'motoboy' | 'outros']?.hourly || {})}
                        label={errorsSubTab.charAt(0).toUpperCase() + errorsSubTab.slice(1)}
                      />
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ======================== AGENTS TAB ======================== */}
            <TabsContent value="agents" className="space-y-6">
              {/* Podium - Top 3 */}
              {metrics.agentStats.length >= 3 && (
                <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><Trophy className="w-4 h-4 text-primary" />Ranking de Produtividade</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex justify-center items-end gap-6">
                      {[1, 0, 2].map(pos => {
                        const agent = metrics.agentStats[pos];
                        if (!agent) return null;
                        const medals = ['🥇', '🥈', '🥉'];
                        const heights = ['h-24', 'h-32', 'h-20'];
                        const bgColors = ['bg-warning/20', 'bg-primary/20', 'bg-muted'];
                        return (
                          <div key={pos} className="flex flex-col items-center gap-2">
                            <span className="text-2xl">{medals[pos]}</span>
                            <span className="text-sm font-semibold truncate max-w-[100px]">{agent.name}</span>
                            <span className="text-xs text-muted-foreground">{agent.count} conv.</span>
                            <div className={cn("w-20 rounded-t-lg flex items-end justify-center pb-2", heights[pos], bgColors[pos])}>
                              <span className="text-xs font-bold">{pos + 1}º</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {metrics.agentStats.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2"><Users className="w-4 h-4" />Comparativo de TMA por Atendente</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={metrics.agentStats.slice(0, 10)} layout="vertical" margin={{ left: 20, right: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                          <XAxis type="number" className="text-xs" />
                          <YAxis dataKey="name" type="category" width={120} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                          <Tooltip contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} formatter={(value: number) => [`${value} min`, 'TMA']} />
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

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {metrics.agentStats.map((agent) => {
                  const avgAll = metrics.agentStats.reduce((s, a) => s + a.avgTime, 0) / metrics.agentStats.length;
                  const status = agent.avgTime <= avgAll * 0.8 ? 'green' : agent.avgTime <= avgAll * 1.2 ? 'yellow' : 'red';
                  const statusColors = { green: 'bg-success/20 text-success', yellow: 'bg-warning/20 text-warning', red: 'bg-destructive/20 text-destructive' };
                  const statusLabels = { green: 'Abaixo da média', yellow: 'Na média', red: 'Acima da média' };
                  const tmaTrend = agent.prevAvgTime > 0 ? Math.round(((agent.avgTime - agent.prevAvgTime) / agent.prevAvgTime) * 100) : null;
                  const countTrend = agent.prevCount > 0 ? Math.round(((agent.count - agent.prevCount) / agent.prevCount) * 100) : null;
                  const channelData = agent.channels ? Object.entries(agent.channels).map(([ch, v]) => ({ name: ch, value: v, fill: CHANNEL_COLORS[ch] || 'hsl(var(--primary))' })) : [];

                  const agentProfileId = agentLiveStatus[agent.name]?.profileId;
                  const isNotified = agentProfileId ? !!agentNotifications[agentProfileId] : false;

                  return (
                    <Card key={agent.name} className={cn("relative overflow-hidden hover:border-primary/30 transition-colors", status === 'red' && "border-destructive/20")}>
                      {status === 'red' && (
                        <div className="absolute top-2 right-10">
                          <AlertTriangle className="w-4 h-4 text-destructive animate-pulse" />
                        </div>
                      )}
                      {/* Notification status indicator */}
                      <div className="absolute top-2 right-2" title={isNotified ? 'Notificado neste período' : 'Pendente de notificação'}>
                        {isNotified ? (
                          <CheckCircle2 className="w-4 h-4 text-success" />
                        ) : (
                          <Clock className="w-4 h-4 text-warning" />
                        )}
                      </div>
                      <CardContent className="pt-6 space-y-3 cursor-pointer" onClick={() => { setSelectedAgent(agent); setAgentSheetOpen(true); }}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            {agentLiveStatus[agent.name] && (
                              <span className={cn("w-2.5 h-2.5 rounded-full shrink-0",
                                agentLiveStatus[agent.name].status === 'online' ? 'bg-success animate-pulse' :
                                agentLiveStatus[agent.name].status === 'pausa' ? 'bg-warning' : 'bg-muted-foreground/40'
                              )} title={agentLiveStatus[agent.name].status} />
                            )}
                            <span className="font-semibold text-sm truncate">{agent.name}</span>
                            {agentLiveStatus[agent.name]?.openConversations > 0 && (
                              <Badge variant="outline" className="text-[10px] shrink-0 gap-1 border-primary/30 text-primary">
                                <MessageSquare className="w-2.5 h-2.5" />
                                {agentLiveStatus[agent.name].openConversations}
                              </Badge>
                            )}
                          </div>
                          <Badge className={cn("text-xs mr-6", statusColors[status])}>{statusLabels[status]}</Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Conversas</p>
                            <p className="font-bold">{agent.count}
                              {countTrend !== null && <span className={cn("text-xs ml-1", countTrend >= 0 ? "text-success" : "text-destructive")}>{countTrend >= 0 ? '↑' : '↓'}{Math.abs(countTrend)}%</span>}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">TMA</p>
                            <p className="font-bold">{formatTime(agent.avgTime)}
                              {tmaTrend !== null && <span className={cn("text-xs ml-1", tmaTrend <= 0 ? "text-success" : "text-destructive")}>{tmaTrend <= 0 ? '↓' : '↑'}{Math.abs(tmaTrend)}%</span>}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Resolução</p>
                            <p className="font-bold">{agent.resolutionRate != null ? `${agent.resolutionRate}%` : '—'}</p>
                          </div>
                        </div>
                        {/* Channel mini bar */}
                        {channelData.length > 0 && (
                          <div>
                            <p className="text-[10px] text-muted-foreground mb-1">Por canal</p>
                            <div className="flex h-3 rounded-full overflow-hidden">
                              {channelData.map(cd => (
                                <div key={cd.name} style={{ width: `${(cd.value / agent.count) * 100}%`, backgroundColor: cd.fill }} title={`${cd.name}: ${cd.value}`} />
                              ))}
                            </div>
                            <div className="flex gap-2 mt-1">
                              {channelData.map(cd => (
                                <span key={cd.name} className="text-[10px] text-muted-foreground flex items-center gap-1">
                                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: cd.fill }} />
                                  {cd.name} ({cd.value})
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {agent.topTags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {agent.topTags.map(([tag, count]) => (
                              <Badge key={tag} variant="outline" className="text-xs">{tag} ({count})</Badge>
                            ))}
                          </div>
                        )}
                      </CardContent>
                      {/* Notify button */}
                      <div className="px-6 pb-4">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-2 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setNotifyAgent(agent);
                            setNotifyMessage('');
                            setNotifyModalOpen(true);
                          }}
                        >
                          <Bell className="w-3.5 h-3.5" />
                          {isNotified ? 'Reenviar Notificação' : 'Notificar Atendente'}
                        </Button>
                      </div>
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

              {/* Agent History Sheet */}
              <Sheet open={agentSheetOpen} onOpenChange={setAgentSheetOpen}>
                <SheetContent side="right" className="sm:max-w-md overflow-auto">
                  <SheetHeader>
                    <SheetTitle className="flex items-center gap-2"><Users className="w-5 h-5" />{selectedAgent?.name}</SheetTitle>
                    <SheetDescription>Desempenho no período selecionado</SheetDescription>
                  </SheetHeader>
                  {selectedAgent && (
                    <div className="space-y-4 mt-6">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg bg-secondary/30">
                          <p className="text-xs text-muted-foreground">Conversas</p>
                          <p className="text-xl font-bold">{selectedAgent.count}</p>
                          <p className="text-xs text-muted-foreground">Anterior: {selectedAgent.prevCount}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-secondary/30">
                          <p className="text-xs text-muted-foreground">TMA</p>
                          <p className="text-xl font-bold">{formatTime(selectedAgent.avgTime)}</p>
                          <p className="text-xs text-muted-foreground">Anterior: {selectedAgent.prevAvgTime > 0 ? formatTime(selectedAgent.prevAvgTime) : '—'}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-secondary/30">
                          <p className="text-xs text-muted-foreground">TME</p>
                          <p className="text-xl font-bold">{formatTime(selectedAgent.avgWaitTime)}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-secondary/30">
                          <p className="text-xs text-muted-foreground">Taxa Resolução</p>
                          <p className="text-xl font-bold">{selectedAgent.resolutionRate != null ? `${selectedAgent.resolutionRate}%` : '—'}</p>
                        </div>
                      </div>
                      {selectedAgent.channels && (
                        <div>
                          <p className="text-sm font-medium mb-2">Distribuição por Canal</p>
                          <div className="space-y-2">
                            {Object.entries(selectedAgent.channels).map(([ch, count]) => (
                              <div key={ch} className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[ch] || 'hsl(var(--primary))' }} />
                                  <span>{ch}</span>
                                </div>
                                <span className="font-medium">{count} ({Math.round((count / selectedAgent.count) * 100)}%)</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedAgent.topTags.length > 0 && (
                        <div>
                          <p className="text-sm font-medium mb-2">Tags mais frequentes</p>
                          <div className="flex flex-wrap gap-1">
                            {selectedAgent.topTags.map(([tag, count]) => (
                              <Badge key={tag} variant="outline" className="text-xs">{tag} ({count})</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </SheetContent>
              </Sheet>

              {/* Agent Notification Modal */}
              <Dialog open={notifyModalOpen} onOpenChange={(open) => { if (!open) { setNotifyModalOpen(false); setNotifyMessage(''); setNotifyAgent(null); } }}>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Bell className="w-5 h-5 text-primary" />
                      Notificar {notifyAgent?.name}
                    </DialogTitle>
                    <DialogDescription>Gere um feedback de desempenho com a Delma e envie ao atendente.</DialogDescription>
                  </DialogHeader>

                  {notifyAgent && metrics && (
                    <div className="space-y-4">
                      {/* Metrics summary */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg bg-secondary/30">
                          <p className="text-xs text-muted-foreground">Conversas</p>
                          <p className="text-lg font-bold">{notifyAgent.count}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-secondary/30">
                          <p className="text-xs text-muted-foreground">TMA</p>
                          <p className="text-lg font-bold">{formatTime(notifyAgent.avgTime)}</p>
                          <p className="text-[10px] text-muted-foreground">Média do time: {formatTime(metrics.agentStats.reduce((s, a) => s + a.avgTime, 0) / metrics.agentStats.length)}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-secondary/30">
                          <p className="text-xs text-muted-foreground">TME</p>
                          <p className="text-lg font-bold">{formatTime(notifyAgent.avgWaitTime)}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-secondary/30">
                          <p className="text-xs text-muted-foreground">Resolução</p>
                          <p className="text-lg font-bold">{notifyAgent.resolutionRate != null ? `${notifyAgent.resolutionRate}%` : '—'}</p>
                        </div>
                      </div>
                      {notifyAgent.topTags.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Top Tags</p>
                          <div className="flex flex-wrap gap-1">
                            {notifyAgent.topTags.slice(0, 3).map(([tag, count]) => (
                              <Badge key={tag} variant="outline" className="text-xs">{tag} ({count})</Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Generate button */}
                      {!notifyMessage && (
                        <Button onClick={generateFeedback} disabled={notifyGenerating} className="w-full gap-2">
                          {notifyGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                          {notifyGenerating ? 'Gerando feedback...' : 'Gerar Feedback com IA'}
                        </Button>
                      )}

                      {/* Editable message */}
                      {notifyMessage && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1.5">Mensagem (editável)</p>
                          <Textarea
                            value={notifyMessage}
                            onChange={(e) => setNotifyMessage(e.target.value)}
                            rows={10}
                            className="text-sm"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => { setNotifyModalOpen(false); setNotifyMessage(''); setNotifyAgent(null); }}>
                      Cancelar
                    </Button>
                    <Button
                      onClick={sendNotification}
                      disabled={!notifyMessage.trim() || notifySending}
                      className="gap-2"
                    >
                      {notifySending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                      {notifySending ? 'Enviando...' : 'Enviar Notificação'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </TabsContent>

            {/* ======================== KNOWLEDGE TAB ======================== */}
            <TabsContent value="knowledge" className="space-y-6">
              {(() => {
                const knowledgeData = computeKnowledgeData(metrics);
                return (
                  <>
                    {/* Maturity Gauge + KPIs */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <Card className={cn("lg:col-span-1", knowledgeData.maturityScore >= 70 ? "border-success/20" : knowledgeData.maturityScore >= 40 ? "border-warning/20" : "border-destructive/20")}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Gauge className="w-4 h-4" />
                            Score de Maturidade
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col items-center">
                          <MaturityGauge score={knowledgeData.maturityScore} />
                          <p className="text-xs text-muted-foreground mt-2 text-center">
                            {knowledgeData.maturityScore >= 70 ? 'Operação madura' : knowledgeData.maturityScore >= 40 ? 'Em evolução' : 'Precisa de atenção'}
                          </p>
                          {/* Score History */}
                          {maturityHistory.length > 1 && (
                            <div className="mt-3">
                              <p className="text-[10px] text-muted-foreground mb-1">Histórico (30 dias)</p>
                              <div className="h-[50px]">
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart data={maturityHistory}>
                                    <Line type="monotone" dataKey="score" stroke={knowledgeData.maturityScore >= 70 ? 'hsl(var(--success))' : knowledgeData.maturityScore >= 40 ? 'hsl(48, 96%, 53%)' : 'hsl(var(--destructive))'} strokeWidth={2} dot={false} />
                                    <Tooltip contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '11px' }} formatter={(v: number) => [v, 'Score']} labelFormatter={(l) => l} />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <Card className="border-primary/20">
                          <CardContent className="pt-5 pb-4">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                                <GraduationCap className="w-5 h-5 text-primary" />
                              </div>
                              <div>
                                <p className="text-2xl font-bold">{knowledgeData.masteredCount}</p>
                                <p className="text-xs text-muted-foreground">Temas Dominados</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        <Card className={knowledgeData.improvementPct > 0 ? "border-success/20" : "border-warning/20"}>
                          <CardContent className="pt-5 pb-4">
                            <div className="flex items-center gap-3 mb-2">
                              <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", knowledgeData.improvementPct >= 0 ? "bg-success/10" : "bg-warning/10")}>
                                {knowledgeData.improvementPct >= 0 ? <TrendingUp className="w-5 h-5 text-success" /> : <TrendingDown className="w-5 h-5 text-warning" />}
                              </div>
                              <div>
                                <p className="text-2xl font-bold">{knowledgeData.improvementPct >= 0 ? '+' : ''}{knowledgeData.improvementPct}%</p>
                                <p className="text-xs text-muted-foreground">Melhoria TMA</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        <Card className="border-warning/20">
                          <CardContent className="pt-5 pb-4">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="w-9 h-9 rounded-lg bg-warning/10 flex items-center justify-center">
                                <AlertCircle className="w-5 h-5 text-warning" />
                              </div>
                              <div>
                                <p className="text-2xl font-bold">{knowledgeData.gapCount}</p>
                                <p className="text-xs text-muted-foreground">Gaps Identificados</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Mastered Topics with volume + trend */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-success" />
                            O que a Delma já Sabe
                          </CardTitle>
                          <CardDescription>Temas com boa taxa de resolução — Volume e tendência</CardDescription>
                        </CardHeader>
                        <CardContent>
                          {knowledgeData.masteredTopics.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-6">Dados insuficientes.</p>
                          ) : (
                            <div className="space-y-2">
                              {knowledgeData.masteredTopics.map((topic, i) => {
                                const prevCount = metrics.prevTopTags?.find(([t]) => t === topic.tag)?.[1] || 0;
                                const trendDir = prevCount > 0 ? (topic.count > prevCount ? 'up' : topic.count < prevCount ? 'down' : 'stable') : 'stable';
                                return (
                                  <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/30">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <CircleDot className={cn("w-3.5 h-3.5 shrink-0", topic.mastered ? "text-success" : "text-warning")} />
                                      <span className="text-sm font-medium truncate">{topic.tag}</span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className="text-xs text-muted-foreground font-mono">{topic.count}x</span>
                                      {trendDir === 'up' && <ArrowUpRight className="w-3.5 h-3.5 text-success" />}
                                      {trendDir === 'down' && <ArrowDownRight className="w-3.5 h-3.5 text-destructive" />}
                                      {trendDir === 'stable' && <Minus className="w-3.5 h-3.5 text-muted-foreground" />}
                                      <Badge className={cn("text-[10px]", topic.mastered ? "bg-success/15 text-success border-success/20" : "bg-warning/15 text-warning border-warning/20")}>
                                        {topic.mastered ? 'Dominado' : 'Aprendendo'}
                                      </Badge>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      {/* Improvements */}
                      <Card className="border-primary/20 bg-primary/5">
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2">
                            <Trophy className="w-4 h-4 text-primary" />
                            O que a Delma Aprendeu
                          </CardTitle>
                          <CardDescription>Evoluções vs período anterior</CardDescription>
                        </CardHeader>
                        <CardContent>
                          {knowledgeData.improvements.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-6">Sem melhorias detectadas no período.</p>
                          ) : (
                            <div className="space-y-2.5">
                              {knowledgeData.improvements.map((item, i) => (
                                <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-background/60 border border-border/50">
                                  <div className={cn("w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5",
                                    item.positive ? "bg-success/15" : "bg-destructive/15"
                                  )}>
                                    {item.positive ? <TrendingUp className="w-3.5 h-3.5 text-success" /> : <TrendingDown className="w-3.5 h-3.5 text-destructive" />}
                                  </div>
                                  <span className="text-sm text-foreground">{item.text}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>

                    {/* Gaps with Train button + volume */}
                    <Card className="border-warning/20">
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-warning" />
                          Onde a Delma Precisa Melhorar
                        </CardTitle>
                        <CardDescription>Gaps com volume e ação de treinamento</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {knowledgeData.gaps.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-6">Nenhum gap significativo. 🎉</p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {knowledgeData.gaps.map((gap, i) => {
                              const Icon = gap.icon;
                              const priorityStyle = gap.priority === 'high'
                                ? 'bg-destructive/10 text-destructive border-destructive/20'
                                : gap.priority === 'medium'
                                  ? 'bg-warning/10 text-warning border-warning/20'
                                  : 'bg-muted text-muted-foreground border-border';
                              return (
                                <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-background">
                                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", priorityStyle)}>
                                    <Icon className="w-4 h-4" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-foreground">{gap.title}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">{gap.description}</p>
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="shrink-0 text-xs gap-1"
                                    onClick={() => {
                                      const tagMatch = gap.title.match(/"([^"]+)"/);
                                      setTrainModalTag(tagMatch ? tagMatch[1] : gap.title);
                                      setTrainModalOpen(true);
                                    }}
                                  >
                                    <BookOpen className="w-3 h-3" />
                                    Treinar
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Next Steps - Interactive Checklist */}
                    <Card className="border-primary/20">
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Rocket className="w-4 h-4 text-primary" />
                          Próximo Passo — O que Aprender
                        </CardTitle>
                        <CardDescription>Marque itens como concluídos</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {knowledgeData.nextSteps.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-6">Nenhuma ação prioritária identificada.</p>
                        ) : (
                          <div className="space-y-2">
                            {knowledgeData.nextSteps.map((step, i) => {
                              const isDone = !!completedSteps[i];
                              return (
                                <div key={i} className={cn("flex items-start gap-3 p-3 rounded-lg transition-colors", isDone ? "bg-success/5 opacity-60" : "bg-secondary/30 hover:bg-secondary/50")}>
                                  <Checkbox
                                    checked={isDone}
                                    onCheckedChange={() => toggleStep(i)}
                                    className="mt-0.5"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <p className={cn("text-sm text-foreground", isDone && "line-through")}>{step.action}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">{step.reason}</p>
                                    {isDone && completedSteps[i] && (
                                      <p className="text-[10px] text-success mt-1">
                                        ✓ Concluído em {new Date(completedSteps[i]).toLocaleDateString('pt-BR')}
                                      </p>
                                    )}
                                  </div>
                                  <Badge variant="outline" className={cn("text-[10px] shrink-0",
                                    step.impact === 'alto' ? 'border-destructive/30 text-destructive' : step.impact === 'médio' ? 'border-warning/30 text-warning' : 'border-muted-foreground/30'
                                  )}>
                                    Impacto {step.impact}
                                  </Badge>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </>
                );
              })()}
            </TabsContent>

            {/* ======================== TOP TAGS TAB ======================== */}
            <TabsContent value="top-tags" className="space-y-6">
              {/* Filters */}
              <div className="flex items-center gap-3 flex-wrap">
                <Select value={topTagsChannelFilter} onValueChange={setTopTagsChannelFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Canal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os canais</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="machine">Machine</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Switch checked={groupSimilarTags} onCheckedChange={setGroupSimilarTags} />
                  <span className="text-sm text-muted-foreground">Agrupar similares</span>
                </div>
              </div>

              {(() => {
                // Build tag data with filtering
                const prevTagMap = new Map<string, number>(metrics.prevTopTags || []);
                const allPrevTagNames = new Set(prevTagMap.keys());

                // Filter by channel if needed (we don't have per-tag-per-channel data in current metrics, so this is a placeholder label)
                const tags = metrics.topTags;

                // Apply grouping if enabled (normalize already merges similar)
                const displayTags = groupSimilarTags
                  ? tags // already normalized
                  : tags;

                const maxVal = displayTags.length > 0 ? displayTags[0][1] : 1;

                return (
                  <>
                    {/* Interactive horizontal bar chart */}
                    {displayTags.length > 0 ? (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2">
                            <BarChart3 className="w-4 h-4" />
                            Tags mais frequentes
                          </CardTitle>
                          <CardDescription>Top {displayTags.length} tags no período ({periodLabel})</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="h-[400px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={displayTags.map(([tag, count]) => {
                                const prev = prevTagMap.get(tag) || 0;
                                const variation = prev > 0 ? Math.round(((count - prev) / prev) * 100) : null;
                                const isNew = !allPrevTagNames.has(tag);
                                return { name: tag, value: count, prev, variation, isNew };
                              })} layout="vertical" margin={{ left: 10, right: 30 }}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                                <XAxis type="number" className="text-xs" />
                                <YAxis dataKey="name" type="category" width={160} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                                <Tooltip
                                  contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                                  formatter={(value: number, name: string, props: any) => {
                                    const item = props.payload;
                                    const parts = [`${value} conversas`];
                                    if (item.variation !== null) parts.push(`${item.variation >= 0 ? '+' : ''}${item.variation}% vs anterior`);
                                    if (item.isNew) parts.push('🆕 Novo');
                                    return [parts.join(' • '), 'Volume'];
                                  }}
                                />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]} fill="hsl(var(--primary))">
                                  {displayTags.map(([tag], idx) => {
                                    const isNew = !allPrevTagNames.has(tag);
                                    return <Cell key={idx} fill={isNew ? 'hsl(var(--success))' : 'hsl(var(--primary))'} />;
                                  })}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <Card>
                        <CardContent className="py-12 text-center">
                          <BarChart3 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                          <p className="text-sm text-muted-foreground">Sem tags no período.</p>
                        </CardContent>
                      </Card>
                    )}

                    {/* Detail table with variation and badges */}
                    {displayTags.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Detalhamento</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {displayTags.map(([tag, count], idx) => {
                              const prev = prevTagMap.get(tag) || 0;
                              const variation = prev > 0 ? Math.round(((count - prev) / prev) * 100) : null;
                              const isNew = !allPrevTagNames.has(tag);
                              const pct = (count / maxVal) * 100;

                              return (
                                <div key={tag} className="space-y-1">
                                  <div className="flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="text-xs text-muted-foreground w-5 text-right">{idx + 1}.</span>
                                      <span className="truncate font-medium">{tag}</span>
                                      {isNew && (
                                        <Badge className="text-[10px] bg-success/15 text-success border-success/20">Novo</Badge>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className="text-muted-foreground font-mono text-xs">{count}</span>
                                      {variation !== null && (
                                        <span className={cn("text-xs font-medium", variation > 0 ? "text-destructive" : variation < 0 ? "text-success" : "text-muted-foreground")}>
                                          {variation > 0 ? '+' : ''}{variation}%
                                          {variation > 0 ? ' ⬆️' : variation < 0 ? ' ⬇️' : ''}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="h-1.5 rounded-full bg-secondary">
                                    <div className={cn("h-full rounded-full transition-all", isNew ? "bg-success" : "bg-primary")} style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </>
                );
              })()}
            </TabsContent>

            {/* ======================== AI REPORT TAB ======================== */}
            <TabsContent value="ai-report" className="space-y-6">
              {/* Context field */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-primary" />
                        Relatório da Delma
                      </CardTitle>
                      <CardDescription>Análise profunda gerada por IA sob demanda</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setScheduleDialogOpen(true)} className="gap-2">
                        <CalendarClock className="w-4 h-4" />
                        Agendar
                      </Button>
                      {aiAnalysis && (
                        <Button variant="outline" size="sm" onClick={exportPdf} className="gap-2">
                          <FileDown className="w-4 h-4" />
                          Exportar PDF
                        </Button>
                      )}
                      <Button onClick={fetchReport} disabled={loadingReport} className="gap-2">
                        {loadingReport ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        {loadingReport ? 'Gerando...' : aiAnalysis ? 'Regenerar' : 'Gerar Relatório'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Context input */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">Observações manuais (opcional) — a IA considerará na análise</p>
                    <Textarea
                      placeholder="Ex: Houve uma promoção esta semana, tivemos problema no sistema na terça-feira..."
                      value={reportContext}
                      onChange={(e) => setReportContext(e.target.value)}
                      rows={2}
                      className="text-sm"
                    />
                  </div>

                  {/* Fallback indicator with error detail */}
                  {reportFallback && reportProvider && (
                    <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 space-y-1">
                      <div className="flex items-center gap-2 text-sm">
                        <AlertCircle className="w-4 h-4 text-warning flex-shrink-0" />
                        <span className="text-warning">
                          Relatório gerado via <strong>{reportProvider}</strong> — provedor principal indisponível.
                        </span>
                      </div>
                      {reportFallbackError && (
                        <p className="text-xs text-muted-foreground ml-6">{reportFallbackError}</p>
                      )}
                    </div>
                  )}

                  {/* Comparison table */}
                  {aiAnalysis && metrics && (
                    <Card className="border-border/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2"><Target className="w-4 h-4" />Comparativo de Períodos</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left py-2 text-muted-foreground font-medium">Métrica</th>
                                <th className="text-right py-2 text-muted-foreground font-medium">Atual</th>
                                <th className="text-right py-2 text-muted-foreground font-medium">Anterior</th>
                                <th className="text-right py-2 text-muted-foreground font-medium">Variação</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[
                                { label: 'Total Conversas', curr: metrics.totalConversas, prev: metrics.prevTotalConversas, inv: false, fmt: (v: number) => String(v) },
                                { label: 'TMA', curr: metrics.tma, prev: metrics.prevTma, inv: true, fmt: (v: number) => `${v} min` },
                                { label: 'TME', curr: metrics.tme, prev: metrics.prevTme, inv: true, fmt: (v: number) => `${v} min` },
                              ].map(row => {
                                const diff = row.prev > 0 ? Math.round(((row.curr - row.prev) / row.prev) * 100) : null;
                                const isGood = diff !== null ? (row.inv ? diff < 0 : diff > 0) : null;
                                return (
                                  <tr key={row.label} className="border-b border-border/30">
                                    <td className="py-2 font-medium">{row.label}</td>
                                    <td className="py-2 text-right">{row.fmt(row.curr)}</td>
                                    <td className="py-2 text-right text-muted-foreground">{row.fmt(row.prev)}</td>
                                    <td className={cn("py-2 text-right font-medium", isGood === true ? "text-success" : isGood === false ? "text-destructive" : "")}>
                                      {diff !== null ? `${diff > 0 ? '+' : ''}${diff}%` : '—'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Report content */}
                  {aiAnalysis ? (
                    <div id="brain-report-content" className="prose prose-sm dark:prose-invert max-w-none">
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

              {/* Report History */}
              {reportHistory.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <History className="w-4 h-4" />
                      Histórico de Relatórios
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {reportHistory.map(report => (
                        <div key={report.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
                          <div className="flex items-center gap-3 min-w-0">
                            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium">
                                {new Date(report.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {report.provider} • {report.period} dias
                                {report.context && ' • Com contexto'}
                              </p>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" className="gap-1" onClick={() => {
                            if (selectedHistoryReport === report.id) {
                              setSelectedHistoryReport(null);
                            } else {
                              setSelectedHistoryReport(report.id);
                              setAiAnalysis(report.content);
                              setReportProvider(report.provider);
                            }
                          }}>
                            <Eye className="w-4 h-4" />
                            {selectedHistoryReport === report.id ? 'Ativo' : 'Abrir'}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ======================== TRAINING TAB ======================== */}
            <TabsContent value="training" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Wand2 className="w-5 h-5 text-primary" />
                        Treinamento Inteligente
                      </CardTitle>
                      <CardDescription>
                        A Delma analisa gaps e sugere melhorias para os robôs parecerem mais humanos
                      </CardDescription>
                    </div>
                    <Button onClick={generateTrainingSuggestions} disabled={generatingTraining} className="gap-2">
                      {generatingTraining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      {generatingTraining ? 'Analisando...' : 'Gerar Sugestões'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 mb-4">
                    <Info className="w-4 h-4 text-primary shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      A Delma analisa conversas recentes, identifica gaps de conhecimento e sugere Q&A e ajustes de tom. 
                      Você aprova antes de aplicar. Execução automática: <strong>semanal</strong>.
                    </p>
                  </div>

                  {loadingTraining ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="h-24 rounded-lg animate-pulse bg-muted/30" />
                      ))}
                    </div>
                  ) : trainingSuggestions.length === 0 ? (
                    <div className="text-center py-12">
                      <GraduationCap className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                      <p className="text-muted-foreground">Nenhuma sugestão ainda.</p>
                      <p className="text-sm text-muted-foreground/70 mt-1">Clique em "Gerar Sugestões" para a Delma analisar os gaps.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Pending first */}
                      {trainingSuggestions.filter(s => s.status === 'pending').length > 0 && (
                        <div className="space-y-3">
                          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-warning" />
                            Aguardando Aprovação ({trainingSuggestions.filter(s => s.status === 'pending').length})
                          </h3>
                          {trainingSuggestions.filter(s => s.status === 'pending').map(s => (
                            <Card key={s.id} className="border-warning/30 bg-warning/5">
                              <CardContent className="pt-4 pb-4">
                                <div className="flex items-start gap-3">
                                  <div className="w-8 h-8 rounded-lg bg-warning/15 flex items-center justify-center shrink-0 mt-0.5">
                                    {s.suggestion_type === 'qa' ? <MessageSquare className="w-4 h-4 text-warning" /> : 
                                     s.suggestion_type === 'tone' ? <Users className="w-4 h-4 text-warning" /> :
                                     <FileText className="w-4 h-4 text-warning" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-sm font-medium">{s.title}</span>
                                      <Badge variant="outline" className="text-[10px]">{s.robot_name}</Badge>
                                      <Badge variant="secondary" className="text-[10px]">
                                        {s.suggestion_type === 'qa' ? 'Q&A' : s.suggestion_type === 'tone' ? 'Tom' : 'Instrução'}
                                      </Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{s.content}</p>
                                    {s.reasoning && (
                                      <p className="text-xs text-muted-foreground/70 mt-2 italic">💡 {s.reasoning}</p>
                                    )}
                                    <div className="flex items-center gap-2 mt-3">
                                      <Button
                                        size="sm"
                                        onClick={() => handleSuggestionAction(s.id, 'approved')}
                                        disabled={applyingId === s.id}
                                        className="gap-1"
                                      >
                                        {applyingId === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsUp className="w-3 h-3" />}
                                        Aprovar e Aplicar
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleSuggestionAction(s.id, 'rejected')}
                                        disabled={applyingId === s.id}
                                        className="gap-1"
                                      >
                                        <ThumbsDown className="w-3 h-3" />
                                        Rejeitar
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      )}

                      {/* Approved/Rejected history */}
                      {trainingSuggestions.filter(s => s.status !== 'pending').length > 0 && (
                        <Collapsible>
                          <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full py-2">
                            <ChevronRight className="w-4 h-4" />
                            Histórico ({trainingSuggestions.filter(s => s.status !== 'pending').length} sugestões processadas)
                          </CollapsibleTrigger>
                          <CollapsibleContent className="space-y-2 mt-2">
                            {trainingSuggestions.filter(s => s.status !== 'pending').map(s => (
                              <Card key={s.id} className={cn("opacity-70", s.status === 'approved' ? 'border-success/20' : 'border-destructive/20')}>
                                <CardContent className="pt-3 pb-3">
                                  <div className="flex items-center gap-2">
                                    {s.status === 'approved' ? <CheckCircle2 className="w-4 h-4 text-success" /> : <XCircle className="w-4 h-4 text-destructive" />}
                                    <span className="text-sm">{s.title}</span>
                                    <Badge variant="outline" className="text-[10px]">{s.robot_name}</Badge>
                                    <Badge variant={s.status === 'approved' ? 'default' : 'secondary'} className="text-[10px]">
                                      {s.status === 'approved' ? 'Aplicado' : 'Rejeitado'}
                                    </Badge>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ======================== DELMA SUGGESTIONS TAB ======================== */}
            <TabsContent value="delma-suggestions">
              <DelmaSuggestionsTab onSuggestionsCountChange={setDelmaSuggestionsCount} />
            </TabsContent>

            {/* ======================== DELMA EVOLUTION TAB ======================== */}
            <TabsContent value="delma-evolution">
              <DelmaEvolutionTab />
            </TabsContent>
          </Tabs>
        )}

        {/* Schedule Dialog */}
        <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarClock className="w-5 h-5 text-primary" />
                Agendamento Automático
              </DialogTitle>
              <DialogDescription>Configure a geração automática de relatórios da Delma.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Ativar agendamento</span>
                <Switch checked={scheduleConfig.isActive} onCheckedChange={(v) => setScheduleConfig(prev => ({ ...prev, isActive: v }))} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Dia da semana</label>
                <Select value={String(scheduleConfig.dayOfWeek)} onValueChange={(v) => setScheduleConfig(prev => ({ ...prev, dayOfWeek: parseInt(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map((d, i) => (
                      <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Horário</label>
                <Select value={String(scheduleConfig.hourOfDay)} onValueChange={(v) => setScheduleConfig(prev => ({ ...prev, hourOfDay: parseInt(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => (
                      <SelectItem key={i} value={String(i)}>{String(i).padStart(2, '0')}:00</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>Cancelar</Button>
              <Button onClick={saveScheduleConfig} className="gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Train Theme Modal */}
        <Dialog open={trainModalOpen} onOpenChange={setTrainModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                Treinar Tema: {trainModalTag}
              </DialogTitle>
              <DialogDescription>
                Registre a ação de treinamento tomada para este tema.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              placeholder="Descreva o que foi feito para cobrir este gap (ex: adicionei Q&A sobre cancelamentos, ajustei instruções do robô...)"
              value={trainNote}
              onChange={(e) => setTrainNote(e.target.value)}
              rows={4}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setTrainModalOpen(false)}>Cancelar</Button>
              <Button onClick={saveTrainNote} disabled={!trainNote.trim()} className="gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Salvar Treinamento
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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

// Knowledge tab data computation
interface KnowledgeTopic { tag: string; count: number; mastered: boolean }
interface Improvement { text: string; positive: boolean }
interface Gap { icon: React.ElementType; title: string; description: string; priority: 'high' | 'medium' | 'low' }
interface NextStep { action: string; reason: string; impact: 'alto' | 'médio' | 'baixo' }
interface KnowledgeData {
  masteredCount: number;
  improvementPct: number;
  gapCount: number;
  maturityScore: number;
  masteredTopics: KnowledgeTopic[];
  improvements: Improvement[];
  gaps: Gap[];
  nextSteps: NextStep[];
}

function computeKnowledgeData(m: BrainMetrics): KnowledgeData {
  const total = m.aiResolved + m.humanResolved;
  const aiPct = total > 0 ? (m.aiResolved / total) * 100 : 0;

  const errorTagCounts: Record<string, number> = {};
  m.errorLogs.forEach(l => l.tags.forEach(t => { errorTagCounts[t] = (errorTagCounts[t] || 0) + 1; }));

  const masteredTopics: KnowledgeTopic[] = m.topTags.slice(0, 10).map(([tag, count]) => {
    const errorCount = errorTagCounts[tag] || 0;
    const errorRatio = count > 0 ? errorCount / count : 0;
    return { tag, count, mastered: errorRatio < 0.15 && count >= 3 };
  });
  const masteredCount = masteredTopics.filter(t => t.mastered).length;

  const improvementPct = m.prevTma > 0 ? Math.round(((m.prevTma - m.tma) / m.prevTma) * 100) : 0;

  const gapTags = Object.entries(errorTagCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const gapCount = gapTags.length;

  const errorPct = m.totalConversas > 0 ? (m.errorLogs.length / m.totalConversas) * 100 : 0;
  const tmaBonusPct = Math.max(0, Math.min(100, improvementPct > 0 ? improvementPct * 2 : 0));
  const maturityScore = Math.round(
    Math.min(100, Math.max(0, (aiPct * 0.4) + (tmaBonusPct * 0.3) + (Math.max(0, 100 - errorPct * 5) * 0.3)))
  );

  const improvements: Improvement[] = [];
  if (m.prevTma > 0) {
    const tmaDiff = ((m.tma - m.prevTma) / m.prevTma) * 100;
    if (Math.abs(tmaDiff) > 5) {
      improvements.push({
        text: tmaDiff < 0 ? `TMA reduziu ${Math.round(Math.abs(tmaDiff))}% — atendimentos mais rápidos!` : `TMA subiu ${Math.round(tmaDiff)}% — atendimentos ficaram mais lentos.`,
        positive: tmaDiff < 0,
      });
    }
  }
  if (m.prevTme > 0) {
    const tmeDiff = ((m.tme - m.prevTme) / m.prevTme) * 100;
    if (Math.abs(tmeDiff) > 10) {
      improvements.push({
        text: tmeDiff < 0 ? `Tempo de espera caiu ${Math.round(Math.abs(tmeDiff))}% — fila mais ágil!` : `Tempo de espera subiu ${Math.round(tmeDiff)}% — clientes esperando mais.`,
        positive: tmeDiff < 0,
      });
    }
  }
  m.agentStats
    .filter(a => a.prevAvgTime > 0 && a.count > 3)
    .map(a => ({ name: a.name, imp: ((a.prevAvgTime - a.avgTime) / a.prevAvgTime) * 100 }))
    .filter(a => Math.abs(a.imp) > 10)
    .sort((a, b) => b.imp - a.imp)
    .slice(0, 3)
    .forEach(a => {
      improvements.push({
        text: a.imp > 0 ? `${a.name} melhorou TMA em ${Math.round(a.imp)}% 🏆` : `${a.name} piorou TMA em ${Math.round(Math.abs(a.imp))}%`,
        positive: a.imp > 0,
      });
    });
  if (m.prevTotalConversas > 0) {
    const volDiff = ((m.totalConversas - m.prevTotalConversas) / m.prevTotalConversas) * 100;
    if (Math.abs(volDiff) > 10) {
      improvements.push({
        text: volDiff > 0 ? `Volume cresceu ${Math.round(volDiff)}% — mais demanda sendo atendida.` : `Volume caiu ${Math.round(Math.abs(volDiff))}% — menos conversas no período.`,
        positive: volDiff > 0,
      });
    }
  }
  if (total > 5) {
    improvements.push({ text: `IA resolvendo ${Math.round(aiPct)}% das conversas (${m.aiResolved} de ${total})`, positive: aiPct > 30 });
  }

  const gaps: Gap[] = [];
  gapTags.forEach(([tag, count]) => {
    const pct = m.totalConversas > 0 ? Math.round((count / m.totalConversas) * 100) : 0;
    gaps.push({
      icon: AlertTriangle,
      title: `"${tag}" com ${count} erros`,
      description: `Aparece em ${pct}% das conversas problemáticas — revisar Q&A e instruções sobre este tema.`,
      priority: count > 5 ? 'high' : count > 2 ? 'medium' : 'low',
    });
  });
  Object.entries(m.channelCounts).forEach(([ch, count]) => {
    if (ch !== 'whatsapp' && count > 3) {
      gaps.push({
        icon: MessageSquare,
        title: `Canal "${ch}" com baixa cobertura`,
        description: `${count} conversas — verificar se os robôs estão configurados para este canal.`,
        priority: count > 10 ? 'high' : 'medium',
      });
    }
  });
  if (m.agentStats.length > 2 && m.totalConversas > 10) {
    m.agentStats.filter(a => a.count / m.totalConversas > 0.35).forEach(a => {
      gaps.push({
        icon: Users,
        title: `${a.name} sobrecarregado`,
        description: `Concentra ${Math.round((a.count / m.totalConversas) * 100)}% do volume — IA não está capturando esses temas.`,
        priority: 'high',
      });
    });
  }

  const nextSteps: NextStep[] = [];
  gapTags.slice(0, 3).forEach(([tag, count]) => {
    nextSteps.push({
      action: `Criar Q&A sobre "${tag}"`,
      reason: `Aparece em ${count} conversas problemáticas — cobrir com automação reduzirá erros.`,
      impact: count > 5 ? 'alto' : count > 2 ? 'médio' : 'baixo',
    });
  });
  if (total > 5 && aiPct < 30) {
    nextSteps.push({
      action: 'Revisar instruções dos robôs',
      reason: `Apenas ${Math.round(aiPct)}% resolvido por IA — melhorar cobertura das respostas automáticas.`,
      impact: 'alto',
    });
  }
  const avgTma = m.agentStats.length > 0 ? m.agentStats.reduce((s, a) => s + a.avgTime * a.count, 0) / Math.max(1, m.agentStats.reduce((s, a) => s + a.count, 0)) : 0;
  m.agentStats
    .filter(a => a.avgTime > avgTma * 1.5 && a.count > 3)
    .slice(0, 2)
    .forEach(a => {
      const topTag = a.topTags[0];
      nextSteps.push({
        action: `Treinar ${a.name}${topTag ? ` em "${topTag[0]}"` : ''}`,
        reason: `TMA de ${Math.round(a.avgTime)}min — ${Math.round(a.avgTime / avgTma)}x acima da média da equipe.`,
        impact: 'médio',
      });
    });
  if (m.tme > 10) {
    nextSteps.push({
      action: 'Ativar mais robôs nos horários de pico',
      reason: `TME em ${Math.round(m.tme)}min — clientes esperam demais na fila.`,
      impact: 'alto',
    });
  }

  return { masteredCount, improvementPct, gapCount, maturityScore, masteredTopics, improvements, gaps, nextSteps };
}

// Compute learnings from metrics client-side
function computeLearnings(m: BrainMetrics): string[] {
  const insights: string[] = [];

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

  if (m.prevTma > 0) {
    const tmaDiff = ((m.tma - m.prevTma) / m.prevTma) * 100;
    if (tmaDiff > 15) {
      insights.push(`⚠️ O TMA aumentou ${Math.round(tmaDiff)}% — os atendimentos estão demorando mais que o usual.`);
    } else if (tmaDiff < -15) {
      insights.push(`✅ O TMA caiu ${Math.round(Math.abs(tmaDiff))}% — os atendimentos estão mais rápidos!`);
    }
  }

  if (m.prevTme > 0) {
    const tmeDiff = ((m.tme - m.prevTme) / m.prevTme) * 100;
    if (tmeDiff > 20) {
      insights.push(`⚠️ O tempo de espera subiu ${Math.round(tmeDiff)}% — clientes estão esperando mais na fila.`);
    }
  }

  const total = m.aiResolved + m.humanResolved;
  if (total > 0) {
    const aiPct = Math.round((m.aiResolved / total) * 100);
    if (aiPct > 60) {
      insights.push(`🤖 A IA está resolvendo ${aiPct}% das conversas — boa taxa de automação!`);
    } else if (aiPct < 20 && total > 10) {
      insights.push(`A Delma sugere revisar os robôs — apenas ${aiPct}% das conversas são resolvidas por IA.`);
    }
  }

  if (m.topTags.length > 0) {
    const topTag = m.topTags[0];
    if (m.totalConversas > 0 && topTag[1] / m.totalConversas > 0.3) {
      insights.push(`A tag "${topTag[0]}" aparece em ${Math.round((topTag[1] / m.totalConversas) * 100)}% das conversas — pode ser um padrão a investigar.`);
    }
  }

  if (m.agentStats.length > 2) {
    const sorted = [...m.agentStats].sort((a, b) => b.avgTime - a.avgTime);
    const slowest = sorted[0];
    const fastest = sorted[sorted.length - 1];
    if (slowest.avgTime > fastest.avgTime * 2 && slowest.count > 3) {
      insights.push(`${slowest.name} tem TMA ${Math.round(slowest.avgTime)}min — ${Math.round(slowest.avgTime / fastest.avgTime)}x mais que ${fastest.name}.`);
    }
  }

  if (m.agentStats.length > 2 && m.totalConversas > 10) {
    const overloaded = m.agentStats.find(a => a.count / m.totalConversas > 0.3);
    if (overloaded) {
      insights.push(`⚠️ ${overloaded.name} está concentrando ${Math.round((overloaded.count / m.totalConversas) * 100)}% do volume — considere redistribuir a carga.`);
    }
  }

  if (m.agentStats.length > 1) {
    const improved = m.agentStats
      .filter(a => a.prevAvgTime > 0 && a.count > 3)
      .map(a => ({ ...a, improvement: ((a.prevAvgTime - a.avgTime) / a.prevAvgTime) * 100 }))
      .sort((a, b) => b.improvement - a.improvement);
    if (improved.length > 0 && improved[0].improvement > 10) {
      insights.push(`🏆 ${improved[0].name} melhorou o TMA em ${Math.round(improved[0].improvement)}% comparado ao período anterior!`);
    }
  }

  if (m.agentStats.length > 2) {
    const avgWait = m.agentStats.reduce((s, a) => s + a.avgWaitTime, 0) / m.agentStats.length;
    const slowWait = m.agentStats.find(a => a.avgWaitTime > avgWait * 2 && a.count > 3);
    if (slowWait && avgWait > 0) {
      insights.push(`⚠️ Clientes de ${slowWait.name} esperam ${Math.round(slowWait.avgWaitTime)}min na fila — ${Math.round(slowWait.avgWaitTime / avgWait)}x acima da média.`);
    }
  }

  if (m.errorLogs.length > 5) {
    insights.push(`🔴 ${m.errorLogs.length} conversas problemáticas detectadas no período — confira a aba "Erros & Gaps".`);
  }

  if (m.abandonRate != null && m.abandonRate > 5) {
    insights.push(`⚠️ Taxa de abandono em ${m.abandonRate}% — ${m.abandonedCount} conversas saíram sem atendimento.`);
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
