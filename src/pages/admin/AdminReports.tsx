// Admin Reports Page - Performance metrics for support agents
import { useState, useEffect, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { WorkScheduleManager } from '@/components/schedule/WorkScheduleManager';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Download, 
  Calendar as CalendarIcon, 
  Clock, 
  Users, 
  MessageSquare, 
  TrendingUp,
  Loader2,
  FileSpreadsheet,
  BarChart3,
  User,
  Building2,
  ChevronDown,
  Trash2,
  Settings,
  History,
  Timer,
  Save
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, differenceInMinutes, startOfDay, endOfDay, eachDayOfInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
  Area,
  AreaChart
} from 'recharts';
import { useApp } from '@/contexts/AppContext';

interface UserReport {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  totalConversations: number;
  totalEvaluations: number; // avaliações do departamento Suporte
  avgHandlingTime: number; // em minutos - tempo para finalizar (finalized_at - started_at)
  avgWaitTime: number; // em minutos - tempo de espera na fila (wait_time)
  conversationsFinalized: number;
}

// ID do departamento Suporte
const SUPORTE_DEPARTMENT_ID = 'dea51138-49e4-45b0-a491-fb07a5fad479';

interface DailyMetrics {
  date: string;
  dateLabel: string;
  conversations: number;
  messages: number;
  avgResponseTime: number;
}

interface DateRange {
  from: Date;
  to: Date;
}

interface ReportSnapshot {
  id: string;
  created_at: string;
  period_start: string;
  period_end: string;
  reset_type: string;
  department_name: string | null;
  data: UserReport[];
  totals: {
    conversations: number;
    evaluations: number;
    avgHandlingTime: number;
    avgWaitTime: number;
    activeUsers: number;
  };
}

interface ScheduleConfig {
  id: string;
  schedule_type: 'manual' | 'daily' | 'weekly' | 'monthly';
  day_of_week: number | null;
  day_of_month: number | null;
  hour_of_day: number;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
}

type PeriodPreset = 'yesterday' | '7days' | '15days' | '30days' | 'custom';

export default function AdminReports() {
  const { user } = useApp();
  const [isLoading, setIsLoading] = useState(true);
  const [reports, setReports] = useState<UserReport[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date()
  });
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('30days');
  const [customDateOpen, setCustomDateOpen] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isResettingTime, setIsResettingTime] = useState(false);
  const [rawLogs, setRawLogs] = useState<any[]>([]);
  const [chartDepartment, setChartDepartment] = useState<string>('all');
  const [chartUser, setChartUser] = useState<string>('all');
  
  // Histórico e agendamento
  const [snapshots, setSnapshots] = useState<ReportSnapshot[]>([]);
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig | null>(null);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(false);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [activeTab, setActiveTab] = useState('current');

  // Auto-finalização
  const [afEnabled, setAfEnabled] = useState(false);
  const [afMinutes, setAfMinutes] = useState(10);
  const [afDepartment, setAfDepartment] = useState('');
  const [afProtocolMessage, setAfProtocolMessage] = useState('📋 *Protocolo de Atendimento*\nSeu número de protocolo é: *{protocolo}*\nGuarde este número para futuras referências.\nAgradecemos pelo contato! 😊');
  const [afLoading, setAfLoading] = useState(true);
  const [afSaving, setAfSaving] = useState(false);

  const handlePeriodChange = (preset: PeriodPreset) => {
    setPeriodPreset(preset);
    const today = new Date();
    
    switch (preset) {
      case 'yesterday':
        const yesterday = subDays(today, 1);
        setDateRange({ from: yesterday, to: yesterday });
        break;
      case '7days':
        setDateRange({ from: subDays(today, 7), to: today });
        break;
      case '15days':
        setDateRange({ from: subDays(today, 15), to: today });
        break;
      case '30days':
        setDateRange({ from: subDays(today, 30), to: today });
        break;
      case 'custom':
        setCustomDateOpen(true);
        break;
    }
  };

  const getPeriodLabel = () => {
    switch (periodPreset) {
      case 'yesterday': return 'Ontem';
      case '7days': return '7 dias';
      case '15days': return '15 dias';
      case '30days': return '30 dias';
      case 'custom': 
        return `${format(dateRange.from, 'dd/MM/yyyy', { locale: ptBR })} - ${format(dateRange.to, 'dd/MM/yyyy', { locale: ptBR })}`;
    }
  };
  
  // Formulário de agendamento
  const [scheduleType, setScheduleType] = useState<'manual' | 'daily' | 'weekly' | 'monthly'>('manual');
  const [dayOfWeek, setDayOfWeek] = useState<number>(0);
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);
  const [hourOfDay, setHourOfDay] = useState<number>(0);
  const [isScheduleActive, setIsScheduleActive] = useState(false);

  const fetchAutoFinalizeSettings = async () => {
    setAfLoading(true);
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['auto_finalize_enabled', 'auto_finalize_minutes', 'auto_finalize_department', 'auto_finalize_protocol_message']);
      if (data) {
        for (const row of data) {
          if (row.key === 'auto_finalize_enabled') setAfEnabled(row.value === 'true');
          if (row.key === 'auto_finalize_minutes') setAfMinutes(Number(row.value) || 10);
          if (row.key === 'auto_finalize_department') setAfDepartment(row.value);
          if (row.key === 'auto_finalize_protocol_message') setAfProtocolMessage(row.value);
        }
      }
    } catch (e) {
      console.error('Error fetching auto-finalize settings:', e);
    } finally {
      setAfLoading(false);
    }
  };

  const saveAutoFinalizeSettings = async () => {
    setAfSaving(true);
    try {
      const settings = [
        { key: 'auto_finalize_enabled', value: String(afEnabled) },
        { key: 'auto_finalize_minutes', value: String(afMinutes) },
        { key: 'auto_finalize_department', value: afDepartment },
        { key: 'auto_finalize_protocol_message', value: afProtocolMessage },
      ];
      for (const s of settings) {
        const { error } = await supabase
          .from('app_settings')
          .upsert({ key: s.key, value: s.value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
        if (error) throw error;
      }
      toast.success('Configurações de auto-finalização salvas!');
    } catch (e: any) {
      console.error('Error saving auto-finalize settings:', e);
      toast.error('Erro ao salvar configurações: ' + e.message);
    } finally {
      setAfSaving(false);
    }
  };

  useEffect(() => {
    fetchDepartments();
    fetchSnapshots();
    fetchScheduleConfig();
    fetchAutoFinalizeSettings();
  }, []);

  useEffect(() => {
    fetchReports();
  }, [dateRange, selectedDepartment]);

  const fetchDepartments = async () => {
    const { data, error } = await supabase
      .from('departments')
      .select('id, name')
      .order('name');
    
    if (!error && data) {
      setDepartments(data);
    }
  };

  const fetchReports = async () => {
    setIsLoading(true);
    try {
      // Buscar todos os perfis com suas roles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name, email, avatar_url');

      if (profilesError) throw profilesError;

      // Buscar roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Buscar logs de conversas finalizadas no período
      let logsQuery = supabase
        .from('conversation_logs')
        .select('*')
        .gte('finalized_at', startOfDay(dateRange.from).toISOString())
        .lte('finalized_at', endOfDay(dateRange.to).toISOString());

      // Para períodos não-custom, excluir logs resetados (mantém comportamento de "zerar")
      // Para período custom, mostrar todos os dados históricos com tempos reais
      if (periodPreset !== 'custom') {
        logsQuery = logsQuery.is('reset_at', null);
      }

      const { data: logs, error: logsError } = await logsQuery;

      if (logsError) throw logsError;

      // Filtrar por departamento se selecionado
      let filteredLogs = logs || [];
      if (selectedDepartment !== 'all') {
        filteredLogs = filteredLogs.filter(log => log.department_id === selectedDepartment);
      }

      // Agregar dados por usuário
      const userReports: UserReport[] = (profiles || []).map(profile => {
        const userRole = roles?.find(r => r.user_id === profile.id)?.role || 'atendente';
        const userLogs = filteredLogs.filter(log => log.assigned_to === profile.id || log.finalized_by === profile.id);
        
        // Calcular métricas
        const totalConversations = userLogs.length;
        
        // Avaliações: apenas conversas do departamento Suporte
        const suporteLogs = userLogs.filter(log => log.department_id === SUPORTE_DEPARTMENT_ID);
        const totalEvaluations = suporteLogs.length;
        
        const conversationsFinalized = userLogs.filter(log => log.finalized_by === profile.id).length;
        
        // Calcular tempo médio de atendimento (sincronizado com Queue.tsx)
        // Filtra apenas: finalizadas pelo usuário, quando online, com started_at e finalized_at
        // Excluir tempos > 1 hora (3600s) que indicam acúmulo noturno/offline
        const logsWithHandlingTime = userLogs.filter(log => {
          if (log.finalized_by !== profile.id || log.agent_status_at_finalization !== 'online' || !log.started_at || !log.finalized_at) return false;
          const serviceSeconds = (new Date(log.finalized_at).getTime() - new Date(log.started_at).getTime()) / 1000;
          return serviceSeconds > 0 && serviceSeconds < 3600;
        });
        const avgHandlingTime = logsWithHandlingTime.length > 0
          ? logsWithHandlingTime.reduce((sum, log) => {
              const start = new Date(log.started_at).getTime();
              const end = new Date(log.finalized_at).getTime();
              return sum + (end - start) / 1000 / 60;
            }, 0) / logsWithHandlingTime.length
          : 0;
        
        // Calcular tempo médio de espera (wait_time já está em segundos no banco)
        // Excluir tempos > 1 hora (3600s) que indicam acúmulo noturno/offline
        const logsWithWaitTime = userLogs.filter(log => log.wait_time !== null && log.wait_time > 0 && log.wait_time < 3600);
        const avgWaitTime = logsWithWaitTime.length > 0
          ? (logsWithWaitTime.reduce((sum, log) => sum + (log.wait_time || 0), 0) / logsWithWaitTime.length) / 60
          : 0;

        return {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          avatarUrl: profile.avatar_url,
          role: userRole,
          totalConversations,
          totalEvaluations,
          avgHandlingTime: Math.round(avgHandlingTime),
          avgWaitTime: Math.round(avgWaitTime),
          conversationsFinalized
        };
      });

      // Ordenar por total de conversas (maior primeiro)
      userReports.sort((a, b) => b.totalConversations - a.totalConversations);
      
      setReports(userReports);
      setRawLogs(filteredLogs);
    } catch (error) {
      console.error('Erro ao buscar relatórios:', error);
      toast.error('Erro ao carregar relatórios');
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (minutes: number): string => {
    if (minutes < 60) {
      return `${minutes}min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}min`;
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <Badge variant="default">Admin</Badge>;
      case 'supervisor':
        return <Badge variant="secondary">Supervisor</Badge>;
      default:
        return <Badge variant="outline">Atendente</Badge>;
    }
  };

  const generateCSV = (data: UserReport[], title: string): string => {
    const headers = [
      'Nome',
      'Email',
      'Cargo',
      'Total Conversas',
      'Conversas Finalizadas',
      'Avaliações (Suporte)',
      'Tempo Médio de Atendimento (min)',
      'Tempo de Espera (min)'
    ];

    const rows = data.map(report => [
      report.name,
      report.email,
      report.role === 'admin' ? 'Admin' : report.role === 'supervisor' ? 'Supervisor' : 'Atendente',
      report.totalConversations,
      report.conversationsFinalized,
      report.totalEvaluations,
      report.avgHandlingTime,
      report.avgWaitTime
    ]);

    return [
      headers.join(';'),
      ...rows.map(row => row.join(';'))
    ].join('\n');
  };

  const downloadCSV = (content: string, filename: string) => {
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + content], { type: 'text/csv;charset=utf-8' });
    
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const exportAllUsers = () => {
    setIsExporting(true);
    try {
      const csvContent = generateCSV(reports, 'Relatório Geral');
      const deptName = selectedDepartment !== 'all' 
        ? departments.find(d => d.id === selectedDepartment)?.name || 'departamento'
        : 'todos';
      downloadCSV(
        csvContent, 
        `relatorio-geral-${deptName}-${format(dateRange.from, 'dd-MM-yyyy')}-a-${format(dateRange.to, 'dd-MM-yyyy')}.csv`
      );
      toast.success('Relatório geral exportado com sucesso!');
    } catch (error) {
      console.error('Erro ao exportar:', error);
      toast.error('Erro ao exportar relatório');
    } finally {
      setIsExporting(false);
    }
  };

  const exportByDepartment = async (departmentId: string) => {
    setIsExporting(true);
    try {
      const dept = departments.find(d => d.id === departmentId);
      if (!dept) {
        toast.error('Departamento não encontrado');
        return;
      }

      // Buscar logs específicos do departamento
      let exportQuery = supabase
        .from('conversation_logs')
        .select('*')
        .eq('department_id', departmentId)
        .gte('finalized_at', startOfDay(dateRange.from).toISOString())
        .lte('finalized_at', endOfDay(dateRange.to).toISOString());

      if (periodPreset !== 'custom') {
        exportQuery = exportQuery.is('reset_at', null);
      }

      const { data: logs, error: logsError } = await exportQuery;

      if (logsError) throw logsError;

      // Buscar perfis e roles
      const { data: profiles } = await supabase.from('profiles').select('id, name, email, avatar_url');
      const { data: roles } = await supabase.from('user_roles').select('user_id, role');

      const deptReports: UserReport[] = (profiles || [])
        .map(profile => {
          const userRole = roles?.find(r => r.user_id === profile.id)?.role || 'atendente';
          const userLogs = (logs || []).filter(log => log.assigned_to === profile.id || log.finalized_by === profile.id);
          
          const totalConversations = userLogs.length;
          // Avaliações: apenas do departamento Suporte
          const suporteLogs = userLogs.filter(log => log.department_id === SUPORTE_DEPARTMENT_ID);
          const totalEvaluations = suporteLogs.length;
          
          const conversationsFinalized = userLogs.filter(log => log.finalized_by === profile.id).length;
          
          // Tempo médio de atendimento (sincronizado com Queue.tsx)
          // Excluir tempos > 1 hora (3600s) que indicam acúmulo noturno/offline
          const logsWithHandlingTime = userLogs.filter(log => {
            if (log.finalized_by !== profile.id || log.agent_status_at_finalization !== 'online' || !log.started_at || !log.finalized_at) return false;
            const serviceSeconds = (new Date(log.finalized_at).getTime() - new Date(log.started_at).getTime()) / 1000;
            return serviceSeconds > 0 && serviceSeconds < 3600;
          });
          const avgHandlingTime = logsWithHandlingTime.length > 0
            ? logsWithHandlingTime.reduce((sum, log) => {
                const start = new Date(log.started_at).getTime();
                const end = new Date(log.finalized_at).getTime();
                return sum + (end - start) / 1000 / 60;
              }, 0) / logsWithHandlingTime.length
            : 0;
          
          // Tempo de espera
          // Excluir tempos > 1 hora (3600s) que indicam acúmulo noturno/offline
          const logsWithWaitTime = userLogs.filter(log => log.wait_time !== null && log.wait_time > 0 && log.wait_time < 3600);
          const avgWaitTime = logsWithWaitTime.length > 0
            ? (logsWithWaitTime.reduce((sum, log) => sum + (log.wait_time || 0), 0) / logsWithWaitTime.length) / 60
            : 0;

          return {
            id: profile.id,
            name: profile.name,
            email: profile.email,
            avatarUrl: profile.avatar_url,
            role: userRole,
            totalConversations,
            totalEvaluations,
            avgHandlingTime: Math.round(avgHandlingTime),
            avgWaitTime: Math.round(avgWaitTime),
            conversationsFinalized
          };
        })
        .filter(r => r.totalConversations > 0)
        .sort((a, b) => b.totalConversations - a.totalConversations);

      const csvContent = generateCSV(deptReports, `Relatório - ${dept.name}`);
      downloadCSV(
        csvContent,
        `relatorio-${dept.name.toLowerCase().replace(/\s+/g, '-')}-${format(dateRange.from, 'dd-MM-yyyy')}-a-${format(dateRange.to, 'dd-MM-yyyy')}.csv`
      );
      toast.success(`Relatório do departamento ${dept.name} exportado!`);
    } catch (error) {
      console.error('Erro ao exportar:', error);
      toast.error('Erro ao exportar relatório');
    } finally {
      setIsExporting(false);
    }
  };

  const exportIndividual = (user: UserReport) => {
    setIsExporting(true);
    try {
      const csvContent = generateCSV([user], `Relatório Individual - ${user.name}`);
      downloadCSV(
        csvContent,
        `relatorio-${user.name.toLowerCase().replace(/\s+/g, '-')}-${format(dateRange.from, 'dd-MM-yyyy')}-a-${format(dateRange.to, 'dd-MM-yyyy')}.csv`
      );
      toast.success(`Relatório de ${user.name} exportado!`);
    } catch (error) {
      console.error('Erro ao exportar:', error);
      toast.error('Erro ao exportar relatório');
    } finally {
      setIsExporting(false);
    }
  };

  const resetEvaluations = async () => {
    setIsResetting(true);
    try {
      const { error } = await supabase
        .from('conversation_logs')
        .delete()
        .eq('department_id', SUPORTE_DEPARTMENT_ID);

      if (error) throw error;

      toast.success('Avaliações zeradas com sucesso!');
      fetchReports(); // Recarregar dados
    } catch (error) {
      console.error('Erro ao zerar avaliações:', error);
      toast.error('Erro ao zerar avaliações');
    } finally {
      setIsResetting(false);
    }
  };

  const resetAverageTime = async () => {
    setIsResettingTime(true);
    try {
      // Marcar logs com reset_at (preserva dados originais para consultas históricas)
      const { error } = await supabase
        .from('conversation_logs')
        .update({ reset_at: new Date().toISOString() } as any)
        .is('reset_at', null);

      if (error) throw error;

      toast.success('Tempos zerados com sucesso!');
      fetchReports();
    } catch (error) {
      console.error('Erro ao zerar tempos:', error);
      toast.error('Erro ao zerar tempos');
    } finally {
      setIsResettingTime(false);
    }
  };

  // ==================== FUNÇÕES DE HISTÓRICO E AGENDAMENTO ====================

  const fetchSnapshots = async () => {
    setIsLoadingSnapshots(true);
    try {
      const { data, error } = await supabase
        .from('report_snapshots')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      
      // Map data to proper types
      const mappedSnapshots: ReportSnapshot[] = (data || []).map((item: any) => ({
        id: item.id,
        created_at: item.created_at,
        period_start: item.period_start,
        period_end: item.period_end,
        reset_type: item.reset_type,
        department_name: item.department_name,
        data: item.data as UserReport[],
        totals: item.totals as ReportSnapshot['totals']
      }));
      
      setSnapshots(mappedSnapshots);
    } catch (error) {
      console.error('Erro ao buscar histórico:', error);
    } finally {
      setIsLoadingSnapshots(false);
    }
  };

  const fetchScheduleConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('report_schedule')
        .select('*')
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (data) {
        setScheduleConfig(data as ScheduleConfig);
        setScheduleType(data.schedule_type as 'manual' | 'daily' | 'weekly' | 'monthly');
        setDayOfWeek(data.day_of_week || 0);
        setDayOfMonth(data.day_of_month || 1);
        setHourOfDay(data.hour_of_day || 0);
        setIsScheduleActive(data.is_active);
      }
    } catch (error) {
      console.error('Erro ao buscar configuração de agendamento:', error);
    }
  };

  const saveSnapshot = async (resetType: 'manual' | 'scheduled' = 'manual') => {
    if (!user) return false;
    
    try {
      const deptName = selectedDepartment !== 'all' 
        ? departments.find(d => d.id === selectedDepartment)?.name || null
        : null;

      const snapshotData = {
        created_by: user.id,
        period_start: dateRange.from.toISOString(),
        period_end: dateRange.to.toISOString(),
        reset_type: resetType,
        department_id: selectedDepartment !== 'all' ? selectedDepartment : null,
        department_name: deptName,
        data: reports,
        totals: totals
      };

      const { error } = await supabase
        .from('report_snapshots')
        .insert([snapshotData] as any);

      if (error) throw error;

      toast.success('Snapshot salvo no histórico!');
      fetchSnapshots();
      return true;
    } catch (error) {
      console.error('Erro ao salvar snapshot:', error);
      toast.error('Erro ao salvar snapshot');
      return false;
    }
  };

  const resetWithSnapshot = async () => {
    setIsResettingTime(true);
    try {
      // Primeiro salvar o snapshot
      const saved = await saveSnapshot('manual');
      if (!saved) {
        setIsResettingTime(false);
        return;
      }

      // Marcar logs como resetados (preserva dados originais para consultas históricas)
      const { error: errUpdateLogs } = await supabase
        .from('conversation_logs')
        .update({ reset_at: new Date().toISOString() } as any)
        .is('reset_at', null);

      if (errUpdateLogs) throw errUpdateLogs;

      // Deletar todas as conversas finalizadas
      const { error: errConvFinalized } = await supabase
        .from('conversations')
        .delete()
        .eq('status', 'finalizada');

      if (errConvFinalized) throw errConvFinalized;

      // Resetar wait_time das conversas ativas
      const { error: errConvReset } = await supabase
        .from('conversations')
        .update({ wait_time: 0, created_at: new Date().toISOString() })
        .neq('status', 'finalizada');

      if (errConvReset) throw errConvReset;

      toast.success('Métricas zeradas! Logs preservados no histórico.');
      fetchReports();
    } catch (error) {
      console.error('Erro ao zerar métricas:', error);
      toast.error('Erro ao zerar métricas');
    } finally {
      setIsResettingTime(false);
    }
  };

  const saveScheduleConfig = async () => {
    if (!user) return;
    setIsSavingSchedule(true);
    
    try {
      const updateData = {
        schedule_type: scheduleType,
        day_of_week: scheduleType === 'weekly' ? dayOfWeek : null,
        day_of_month: scheduleType === 'monthly' ? dayOfMonth : null,
        hour_of_day: hourOfDay,
        is_active: isScheduleActive && scheduleType !== 'manual',
        updated_at: new Date().toISOString()
      };

      if (scheduleConfig?.id) {
        const { error } = await supabase
          .from('report_schedule')
          .update(updateData)
          .eq('id', scheduleConfig.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('report_schedule')
          .insert({ ...updateData, created_by: user.id });

        if (error) throw error;
      }

      toast.success('Configuração de agendamento salva!');
      setIsScheduleDialogOpen(false);
      fetchScheduleConfig();
    } catch (error) {
      console.error('Erro ao salvar agendamento:', error);
      toast.error('Erro ao salvar configuração');
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const downloadSnapshot = (snapshot: ReportSnapshot) => {
    try {
      const csvContent = generateCSV(snapshot.data, 'Relatório Histórico');
      const periodStart = format(parseISO(snapshot.period_start), 'dd-MM-yyyy');
      const periodEnd = format(parseISO(snapshot.period_end), 'dd-MM-yyyy');
      const createdAt = format(parseISO(snapshot.created_at), 'dd-MM-yyyy_HH-mm');
      
      downloadCSV(
        csvContent,
        `relatorio-historico-${periodStart}-a-${periodEnd}-gerado-${createdAt}.csv`
      );
      toast.success('Relatório baixado!');
    } catch (error) {
      console.error('Erro ao baixar relatório:', error);
      toast.error('Erro ao baixar relatório');
    }
  };

  const deleteSnapshot = async (snapshotId: string) => {
    try {
      const { error } = await supabase
        .from('report_snapshots')
        .delete()
        .eq('id', snapshotId);

      if (error) throw error;
      
      toast.success('Snapshot excluído!');
      fetchSnapshots();
    } catch (error) {
      console.error('Erro ao excluir snapshot:', error);
      toast.error('Erro ao excluir snapshot');
    }
  };

  const getDayOfWeekName = (day: number) => {
    const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    return days[day] || '';
  };

  const getScheduleDescription = () => {
    if (!scheduleConfig || scheduleConfig.schedule_type === 'manual') {
      return 'Reset manual';
    }
    
    const hour = String(scheduleConfig.hour_of_day).padStart(2, '0');
    
    switch (scheduleConfig.schedule_type) {
      case 'daily':
        return `Diário às ${hour}:00`;
      case 'weekly':
        return `${getDayOfWeekName(scheduleConfig.day_of_week || 0)} às ${hour}:00`;
      case 'monthly':
        return `Dia ${scheduleConfig.day_of_month} às ${hour}:00`;
      default:
        return 'Manual';
    }
  };

  // Calcular totais
  const totals = {
    conversations: reports.reduce((sum, r) => sum + r.totalConversations, 0),
    evaluations: reports.reduce((sum, r) => sum + r.totalEvaluations, 0),
    avgHandlingTime: reports.length > 0 
      ? Math.round(reports.reduce((sum, r) => sum + r.avgHandlingTime, 0) / reports.filter(r => r.avgHandlingTime > 0).length) || 0
      : 0,
    avgWaitTime: reports.length > 0
      ? Math.round(reports.reduce((sum, r) => sum + r.avgWaitTime, 0) / reports.filter(r => r.avgWaitTime > 0).length) || 0
      : 0,
    activeUsers: reports.filter(r => r.totalConversations > 0).length
  };

  // Calcular métricas diárias para o gráfico (com filtros específicos)
  const dailyMetrics: DailyMetrics[] = useMemo(() => {
    if (!rawLogs.length) return [];
    
    // Aplicar filtros específicos dos gráficos
    let filteredChartLogs = rawLogs;
    
    if (chartDepartment !== 'all') {
      filteredChartLogs = filteredChartLogs.filter(log => log.department_id === chartDepartment);
    }
    
    if (chartUser !== 'all') {
      filteredChartLogs = filteredChartLogs.filter(log => 
        log.assigned_to === chartUser || log.finalized_by === chartUser
      );
    }
    
    // Gerar todos os dias no intervalo
    const days = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
    
    return days.map(day => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const dayLogs = filteredChartLogs.filter(log => {
        const logDate = format(parseISO(log.finalized_at), 'yyyy-MM-dd');
        return logDate === dayStr;
      });
      
      const conversations = dayLogs.length;
      const messages = dayLogs.reduce((sum, log) => sum + (log.total_messages || 0), 0);
      const avgResponseTime = dayLogs.length > 0
        ? Math.round((dayLogs.reduce((sum, log) => sum + (log.wait_time || 0), 0) / dayLogs.length) / 60)
        : 0;
      
      return {
        date: dayStr,
        dateLabel: format(day, 'dd/MM', { locale: ptBR }),
        conversations,
        messages,
        avgResponseTime
      };
    });
  }, [rawLogs, dateRange, chartDepartment, chartUser]);

  return (
    <MainLayout title="Geral">
      <div className="h-full overflow-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
        <Tabs defaultValue="atual" className="w-full">
          <TabsList className="grid w-full max-w-lg grid-cols-4">
            <TabsTrigger value="atual">Relatórios</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
            <TabsTrigger value="escalas">Escalas</TabsTrigger>
            <TabsTrigger value="configuracoes">Configurações</TabsTrigger>
          </TabsList>
          
          <TabsContent value="atual" className="space-y-6 mt-6">
        {/* Filtros */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Filtros do Relatório
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 items-end">
              {/* Período */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Período</label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-[220px] justify-between text-left font-normal">
                      <div className="flex items-center">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {getPeriodLabel()}
                      </div>
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[220px] bg-popover">
                    <DropdownMenuItem onClick={() => handlePeriodChange('yesterday')}>
                      Ontem
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handlePeriodChange('7days')}>
                      7 dias
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handlePeriodChange('15days')}>
                      15 dias
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handlePeriodChange('30days')}>
                      30 dias
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handlePeriodChange('custom')}>
                      Personalizado...
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                
                {/* Dialog para período personalizado */}
                <Dialog open={customDateOpen} onOpenChange={setCustomDateOpen}>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Período Personalizado</DialogTitle>
                      <DialogDescription>
                        Selecione o intervalo de datas para o relatório.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="space-y-2">
                        <Label>Data inicial</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left font-normal">
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {format(dateRange.from, 'dd/MM/yyyy', { locale: ptBR })}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={dateRange.from}
                              onSelect={(date) => date && setDateRange(prev => ({ ...prev, from: date }))}
                              locale={ptBR}
                              className="pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-2">
                        <Label>Data final</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left font-normal">
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {format(dateRange.to, 'dd/MM/yyyy', { locale: ptBR })}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={dateRange.to}
                              onSelect={(date) => date && setDateRange(prev => ({ ...prev, to: date }))}
                              locale={ptBR}
                              className="pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setCustomDateOpen(false)}>
                        Cancelar
                      </Button>
                      <Button onClick={() => setCustomDateOpen(false)}>
                        Aplicar
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Departamento */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Departamento</label>
                <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os departamentos</SelectItem>
                    {departments.map(dept => (
                      <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Botão Salvar Snapshot */}
              <Button 
                variant="outline"
                onClick={() => saveSnapshot('manual')}
                disabled={reports.length === 0}
              >
                <Save className="w-4 h-4 mr-2" />
                Salvar Histórico
              </Button>

              {/* Botão Zerar com Histórico */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="destructive"
                    disabled={isResettingTime || totals.conversations === 0}
                  >
                    {isResettingTime ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Clock className="w-4 h-4 mr-2" />
                    )}
                    Zerar Tempo
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Zerar todos os tempos?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Os dados atuais serão salvos no histórico antes de zerar.
                      Você poderá baixar o relatório posteriormente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={resetWithSnapshot} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Salvar e Zerar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Botão Configurar Agendamento */}
              <Dialog open={isScheduleDialogOpen} onOpenChange={setIsScheduleDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Timer className="w-4 h-4 mr-2" />
                    Agendar Reset
                    {scheduleConfig?.is_active && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        Ativo
                      </Badge>
                    )}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Timer className="w-5 h-5" />
                      Agendar Reset Automático
                    </DialogTitle>
                    <DialogDescription>
                      Configure quando o sistema deve salvar o histórico e zerar os tempos automaticamente.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="schedule-active">Ativar agendamento</Label>
                      <Switch
                        id="schedule-active"
                        checked={isScheduleActive}
                        onCheckedChange={setIsScheduleActive}
                        disabled={scheduleType === 'manual'}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Frequência</Label>
                      <Select 
                        value={scheduleType} 
                        onValueChange={(v) => setScheduleType(v as any)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manual">Manual (sem agendamento)</SelectItem>
                          <SelectItem value="daily">Diário</SelectItem>
                          <SelectItem value="weekly">Semanal</SelectItem>
                          <SelectItem value="monthly">Mensal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {scheduleType === 'weekly' && (
                      <div className="space-y-2">
                        <Label>Dia da semana</Label>
                        <Select 
                          value={String(dayOfWeek)} 
                          onValueChange={(v) => setDayOfWeek(Number(v))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">Domingo</SelectItem>
                            <SelectItem value="1">Segunda-feira</SelectItem>
                            <SelectItem value="2">Terça-feira</SelectItem>
                            <SelectItem value="3">Quarta-feira</SelectItem>
                            <SelectItem value="4">Quinta-feira</SelectItem>
                            <SelectItem value="5">Sexta-feira</SelectItem>
                            <SelectItem value="6">Sábado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {scheduleType === 'monthly' && (
                      <div className="space-y-2">
                        <Label>Dia do mês</Label>
                        <Select 
                          value={String(dayOfMonth)} 
                          onValueChange={(v) => setDayOfMonth(Number(v))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                              <SelectItem key={day} value={String(day)}>
                                Dia {day}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {scheduleType !== 'manual' && (
                      <div className="space-y-2">
                        <Label>Horário</Label>
                        <Select 
                          value={String(hourOfDay)} 
                          onValueChange={(v) => setHourOfDay(Number(v))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 24 }, (_, i) => i).map(hour => (
                              <SelectItem key={hour} value={String(hour)}>
                                {String(hour).padStart(2, '0')}:00
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {scheduleConfig && scheduleConfig.schedule_type !== 'manual' && (
                      <div className="p-3 bg-muted rounded-lg text-sm">
                        <p className="font-medium">Configuração atual:</p>
                        <p className="text-muted-foreground">{getScheduleDescription()}</p>
                        {scheduleConfig.last_run_at && (
                          <p className="text-muted-foreground text-xs mt-1">
                            Último reset: {format(parseISO(scheduleConfig.last_run_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsScheduleDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={saveScheduleConfig} disabled={isSavingSchedule}>
                      {isSavingSchedule && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Salvar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Dropdown Exportar */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    disabled={isExporting || reports.length === 0}
                    className="ml-auto"
                  >
                    {isExporting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="w-4 h-4 mr-2" />
                    )}
                    Exportar
                    <ChevronDown className="w-4 h-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Tipo de Exportação</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  
                  {/* Exportar Geral */}
                  <DropdownMenuItem onClick={exportAllUsers}>
                    <Users className="w-4 h-4 mr-2" />
                    Relatório Geral
                  </DropdownMenuItem>
                  
                  {/* Exportar por Departamento */}
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Building2 className="w-4 h-4 mr-2" />
                      Por Departamento
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {departments.map(dept => (
                        <DropdownMenuItem 
                          key={dept.id} 
                          onClick={() => exportByDepartment(dept.id)}
                        >
                          {dept.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  
                  {/* Exportar Individual */}
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <User className="w-4 h-4 mr-2" />
                      Por Usuário
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-60 overflow-y-auto">
                      {reports.filter(r => r.totalConversations > 0).map(user => (
                        <DropdownMenuItem 
                          key={user.id} 
                          onClick={() => exportIndividual(user)}
                        >
                          {user.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardContent>
        </Card>

        {/* Cards de Resumo */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <MessageSquare className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totals.conversations}</p>
                  <p className="text-sm text-muted-foreground">Total de Conversas</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totals.evaluations}</p>
                  <p className="text-sm text-muted-foreground">Total de Avaliações</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-warning/10 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-warning" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{formatTime(totals.avgHandlingTime)}</p>
                  <p className="text-sm text-muted-foreground">Tempo Médio Atendimento</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-info/10 flex items-center justify-center">
                  <Users className="w-6 h-6 text-info" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totals.activeUsers}</p>
                  <p className="text-sm text-muted-foreground">Usuários Ativos</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Gráficos de Evolução Temporal */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  Evolução Temporal
                </CardTitle>
                <CardDescription>
                  Métricas de desempenho ao longo do período selecionado
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-3">
                <Select value={chartDepartment} onValueChange={setChartDepartment}>
                  <SelectTrigger className="w-[180px]">
                    <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
                    <SelectValue placeholder="Departamento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos departamentos</SelectItem>
                    {departments.map(dept => (
                      <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={chartUser} onValueChange={setChartUser}>
                  <SelectTrigger className="w-[180px]">
                    <User className="w-4 h-4 mr-2 text-muted-foreground" />
                    <SelectValue placeholder="Atendente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos atendentes</SelectItem>
                    {reports.filter(r => r.totalConversations > 0).map(user => (
                      <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Gráfico de Conversas e Mensagens */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Conversas e Mensagens</CardTitle>
              <CardDescription className="text-xs">
                Quantidade por dia
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : dailyMetrics.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  Sem dados para exibir
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={dailyMetrics}>
                    <defs>
                      <linearGradient id="colorConversations" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorMessages" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="dateLabel" 
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      tickLine={{ stroke: 'hsl(var(--border))' }}
                      axisLine={{ stroke: 'hsl(var(--border))' }}
                    />
                    <YAxis 
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      tickLine={{ stroke: 'hsl(var(--border))' }}
                      axisLine={{ stroke: 'hsl(var(--border))' }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        color: 'hsl(var(--foreground))'
                      }}
                      labelFormatter={(label) => `Data: ${label}`}
                    />
                    <Legend />
                    <Area 
                      type="monotone" 
                      dataKey="conversations" 
                      name="Conversas"
                      stroke="hsl(var(--primary))" 
                      fillOpacity={1}
                      fill="url(#colorConversations)"
                      strokeWidth={2}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="messages" 
                      name="Mensagens"
                      stroke="hsl(var(--success))" 
                      fillOpacity={1}
                      fill="url(#colorMessages)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Gráfico de Tempo Médio de Resposta */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-warning" />
                Tempo Médio de Resposta
              </CardTitle>
              <CardDescription className="text-xs">
                Em minutos por dia
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : dailyMetrics.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  Sem dados para exibir
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={dailyMetrics}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="dateLabel" 
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      tickLine={{ stroke: 'hsl(var(--border))' }}
                      axisLine={{ stroke: 'hsl(var(--border))' }}
                    />
                    <YAxis 
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      tickLine={{ stroke: 'hsl(var(--border))' }}
                      axisLine={{ stroke: 'hsl(var(--border))' }}
                      unit="min"
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        color: 'hsl(var(--foreground))'
                      }}
                      labelFormatter={(label) => `Data: ${label}`}
                      formatter={(value: number) => [`${value}min`, 'Tempo Médio']}
                    />
                    <Bar 
                      dataKey="avgResponseTime" 
                      name="Tempo Médio (min)"
                      fill="hsl(var(--warning))"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tabela de Relatórios */}
        <Card>
          <CardHeader>
            <CardTitle>Desempenho por Atendente</CardTitle>
            <CardDescription>
              Métricas de atendimento no período de {format(dateRange.from, 'dd/MM/yyyy')} a {format(dateRange.to, 'dd/MM/yyyy')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : reports.length === 0 ? (
              <div className="text-center py-12">
                <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhum dado encontrado para o período selecionado</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Atendente</TableHead>
                      <TableHead>Cargo</TableHead>
                      <TableHead className="text-center">Conversas</TableHead>
                      <TableHead className="text-center">Finalizadas</TableHead>
                      <TableHead className="text-center">Avaliações</TableHead>
                      <TableHead className="text-center">Tempo Médio de Atendimento</TableHead>
                      <TableHead className="text-center">Tempo de Espera</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reports.map((report) => (
                      <TableRow key={report.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarImage src={report.avatarUrl || undefined} />
                              <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                                {getInitials(report.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{report.name}</p>
                              <p className="text-xs text-muted-foreground">{report.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{getRoleBadge(report.role)}</TableCell>
                        <TableCell className="text-center font-medium">{report.totalConversations}</TableCell>
                        <TableCell className="text-center">{report.conversationsFinalized}</TableCell>
                        <TableCell className="text-center">{report.totalEvaluations}</TableCell>
                        <TableCell className="text-center">
                          <span className={cn(
                            "font-medium",
                            report.avgHandlingTime > 30 ? "text-destructive" : 
                            report.avgHandlingTime > 15 ? "text-warning" : "text-success"
                          )}>
                            {formatTime(report.avgHandlingTime)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={cn(
                            "font-medium",
                            report.avgWaitTime > 10 ? "text-destructive" : 
                            report.avgWaitTime > 5 ? "text-warning" : "text-success"
                          )}>
                            {formatTime(report.avgWaitTime)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="historico" className="space-y-6 mt-6">
        {/* Histórico de Relatórios */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Histórico de Relatórios
            </CardTitle>
            <CardDescription>
              Snapshots salvos antes de cada reset de métricas
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingSnapshots ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : snapshots.length === 0 ? (
              <div className="text-center py-12">
                <History className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhum histórico de relatório salvo</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Use o botão "Salvar Histórico" ou "Zerar Tempo" para criar snapshots
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data do Snapshot</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead>Departamento</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-center">Conversas</TableHead>
                      <TableHead className="text-center">Usuários</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {snapshots.map((snapshot) => (
                      <TableRow key={snapshot.id}>
                        <TableCell className="font-medium">
                          {format(parseISO(snapshot.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          {format(parseISO(snapshot.period_start), 'dd/MM', { locale: ptBR })} - {format(parseISO(snapshot.period_end), 'dd/MM', { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {snapshot.department_name || 'Todos'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={snapshot.reset_type === 'scheduled' ? 'default' : 'outline'}>
                            {snapshot.reset_type === 'scheduled' ? 'Agendado' : 
                             snapshot.reset_type === 'reset' ? 'Reset' : 'Manual'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {(snapshot.totals as any)?.totalConversations || 0}
                        </TableCell>
                        <TableCell className="text-center">
                          {snapshot.data.length}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => downloadSnapshot(snapshot)}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir snapshot?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Esta ação irá remover permanentemente este snapshot do histórico.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteSnapshot(snapshot.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Excluir
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="escalas" className="space-y-6 mt-6">
            {/* Cards de Resumo - mesmos da aba Relatórios */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                      <MessageSquare className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{totals.conversations}</p>
                      <p className="text-sm text-muted-foreground">Total de Conversas</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center">
                      <TrendingUp className="w-6 h-6 text-success" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{totals.evaluations}</p>
                      <p className="text-sm text-muted-foreground">Total de Avaliações</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-warning/10 flex items-center justify-center">
                      <Clock className="w-6 h-6 text-warning" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{formatTime(totals.avgHandlingTime)}</p>
                      <p className="text-sm text-muted-foreground">Tempo Médio Atendimento</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-info/10 flex items-center justify-center">
                      <Users className="w-6 h-6 text-info" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{totals.activeUsers}</p>
                      <p className="text-sm text-muted-foreground">Usuários Ativos</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <WorkScheduleManager />
          </TabsContent>

          <TabsContent value="configuracoes" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Timer className="w-5 h-5" />
                  Auto-finalização por inatividade
                </CardTitle>
                <CardDescription>
                  Finaliza automaticamente conversas quando o cliente não responde dentro do tempo configurado.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {afLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="af-switch">Ativar auto-finalização</Label>
                        <p className="text-sm text-muted-foreground">
                          Quando ativado, conversas sem resposta do cliente serão finalizadas automaticamente.
                        </p>
                      </div>
                      <Switch
                        id="af-switch"
                        checked={afEnabled}
                        onCheckedChange={setAfEnabled}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Departamento</Label>
                        <Select value={afDepartment} onValueChange={setAfDepartment}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o departamento" />
                          </SelectTrigger>
                          <SelectContent>
                            {departments.map(dept => (
                              <SelectItem key={dept.id} value={dept.id}>
                                {dept.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          A auto-finalização será aplicada apenas neste departamento.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label>Tempo de inatividade (minutos)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={120}
                          value={afMinutes}
                          onChange={e => setAfMinutes(Number(e.target.value) || 1)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Tempo sem resposta do cliente antes de finalizar automaticamente.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Mensagem de protocolo</Label>
                      <textarea
                        className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        value={afProtocolMessage}
                        onChange={e => setAfProtocolMessage(e.target.value)}
                        placeholder="📋 *Protocolo de Atendimento*\nSeu número de protocolo é: *{protocolo}*"
                      />
                      <p className="text-xs text-muted-foreground">
                        Use <code className="bg-muted px-1 rounded">{'{protocolo}'}</code> para inserir o número do protocolo automaticamente. Use <code className="bg-muted px-1 rounded">\n</code> para quebras de linha.
                      </p>
                      {afProtocolMessage && (
                        <div className="mt-2 p-3 rounded-md bg-muted/50 border">
                          <p className="text-xs font-medium text-muted-foreground mb-1">Preview:</p>
                          <p className="text-sm whitespace-pre-wrap">
                            {afProtocolMessage.replace(/\\n/g, '\n').replace('{protocolo}', '20260310-00001')}
                          </p>
                        </div>
                      )}
                    </div>

                    <Button onClick={saveAutoFinalizeSettings} disabled={afSaving}>
                      {afSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      Salvar configurações
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
