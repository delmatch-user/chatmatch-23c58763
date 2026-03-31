import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Loader2, Clock, X, Video, FileText, AlertCircle, CheckCircle2, ExternalLink, Users, Circle } from 'lucide-react';
import { sdrApi, SDRAppointment } from '@/services/sdrApi';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { MainLayout } from '@/components/layout/MainLayout';
import { Badge } from '@/components/ui/badge';

type ViewMode = 'month' | 'week';

interface DeptMember {
  id: string;
  name: string;
}

const getEffectiveStatus = (apt: SDRAppointment): 'pending' | 'completed' | 'overdue' => {
  if (apt.taskStatus === 'completed') return 'completed';
  const now = new Date();
  const aptDateTime = new Date(`${apt.date}T${apt.time}`);
  if (apt.taskStatus === 'pending' && aptDateTime < now) return 'overdue';
  return 'pending';
};

const statusConfig = {
  pending: { label: 'Pendente', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20', dot: 'bg-amber-500' },
  completed: { label: 'Concluído', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', dot: 'bg-emerald-500' },
  overdue: { label: 'Atrasado', color: 'bg-destructive/10 text-destructive border-destructive/20', dot: 'bg-destructive' },
};

export default function SDRSchedulingPage() {
  const { isAdmin, isSupervisor } = useAuth();
  const { user } = useApp();
  const canAssign = isAdmin || isSupervisor;
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [appointments, setAppointments] = useState<SDRAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDayModal, setShowDayModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [formData, setFormData] = useState({ title: '', time: '09:00', type: 'meeting', description: '', duration: 60, assignedTo: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<SDRAppointment | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportData, setReportData] = useState<{ transcription_summary?: string; processing_status?: string } | null>(null);
  const [googleStatus, setGoogleStatus] = useState<{ connected: boolean; email?: string; expired?: boolean } | null>(null);
  const [deptMembers, setDeptMembers] = useState<DeptMember[]>([]);

  const loadData = async () => {
    try {
      const [apts, gStatus] = await Promise.all([
        sdrApi.fetchAppointments(),
        sdrApi.getGoogleStatus().catch((err) => { console.error('Google status error:', err); return { connected: false }; }),
      ]);
      setAppointments(apts);
      setGoogleStatus(gStatus);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => {
    loadData();
    const ch = supabase.channel('sdr-appointments').on('postgres_changes', { event: '*', schema: 'public', table: 'sdr_appointments' }, loadData).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    if (!canAssign || !user?.departments?.length) return;
    const loadMembers = async () => {
      const { data } = await supabase
        .from('profile_departments')
        .select('profile_id, profiles!inner(id, name)')
        .in('department_id', user.departments);
      if (data) {
        const members = data.map((d: any) => ({ id: d.profiles.id, name: d.profiles.name }));
        const unique = Array.from(new Map(members.map((m: DeptMember) => [m.id, m])).values());
        setDeptMembers(unique);
      }
    };
    loadMembers();
  }, [canAssign, user?.departments]);

  const navigateDate = (dir: number) => {
    const d = new Date(currentDate);
    if (viewMode === 'month') d.setMonth(d.getMonth() + dir); else d.setDate(d.getDate() + dir * 7);
    setCurrentDate(d);
  };

  const goToToday = () => setCurrentDate(new Date());
  const getMonthLabel = () => currentDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
  const formatDateStr = (d: Date) => d.toISOString().split('T')[0];
  const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const firstDayOfMonth = (y: number, m: number) => new Date(y, m, 1).getDay();

  const handleDateClick = (day: number) => {
    const y = currentDate.getFullYear(), m = currentDate.getMonth();
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDate(dateStr);
    setShowDayModal(true);
  };

  const openCreateModal = () => {
    setShowDayModal(false);
    setShowCreateModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || !formData.title.trim()) return;
    setIsSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sdr-meeting-create-with-meet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          title: formData.title, description: formData.description, date: selectedDate,
          time: formData.time, duration: formData.duration, type: formData.type,
          ...(formData.assignedTo ? { assigned_to: formData.assignedTo } : {}),
        }),
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      if (formData.assignedTo && result.appointment) {
        await supabase.from('appointment_alerts' as any).insert({
          appointment_id: result.appointment.id || result.appointment,
          user_id: formData.assignedTo, alert_type: 'assigned',
          title: `📋 Nova tarefa atribuída: ${formData.title}`,
          body: `Você recebeu "${formData.title}" para ${selectedDate} às ${formData.time}.`,
          scheduled_for: new Date().toISOString(),
        });
      }
      toast.success(result.google_meet_url ? 'Agendamento criado com Google Meet!' : 'Agendamento criado!');
      setShowCreateModal(false);
      setFormData({ title: '', time: '09:00', type: 'meeting', description: '', duration: 60, assignedTo: '' });
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar');
    } finally { setIsSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir agendamento?')) return;
    try { await sdrApi.deleteAppointment(id); toast.success('Excluído'); } catch { toast.error('Erro'); }
  };

  const handleToggleStatus = async (apt: SDRAppointment) => {
    const effective = getEffectiveStatus(apt);
    const newStatus = effective === 'completed' ? 'pending' : 'completed';
    try {
      await sdrApi.updateTaskStatus(apt.id, newStatus);
      toast.success(newStatus === 'completed' ? 'Marcado como concluído!' : 'Marcado como pendente');
    } catch { toast.error('Erro ao atualizar status'); }
  };

  const handleEndMeeting = async (apt: SDRAppointment) => {
    try {
      await sdrApi.endMeeting(apt.id);
      toast.success(apt.googleMeetUrl ? 'Reunião finalizada! Transcrição será importada automaticamente.' : 'Reunião finalizada!');
    } catch { toast.error('Erro ao finalizar'); }
  };

  const handleViewReport = async (apt: SDRAppointment) => {
    setSelectedAppointment(apt);
    try { setReportData(await sdrApi.fetchMeetingReport(apt.id)); } catch { setReportData(null); }
    setShowReportModal(true);
  };

  const handleConnectGoogle = async () => {
    try {
      const redirectUri = window.location.origin + '/comercial/agenda';
      const result = await sdrApi.connectGoogle(redirectUri);
      if (result.auth_url) window.location.href = result.auth_url;
    } catch { toast.error('Erro ao conectar Google'); }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code'), state = params.get('state');
    if (code && state) {
      const redirectUri = window.location.origin + '/comercial/agenda';
      sdrApi.googleCallback(code, state, redirectUri).then(result => {
        if (result.success) { toast.success(`Google conectado: ${result.email}`); setGoogleStatus({ connected: true, email: result.email }); loadData(); }
        else toast.error('Erro na autenticação Google');
      }).catch(() => toast.error('Erro no callback'));
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const getTypeColor = (t: string) => {
    if (t === 'meeting') return 'bg-violet-500/10 text-violet-500 border-violet-500/20';
    if (t === 'franquia') return 'bg-primary/10 text-primary border-primary/20';
    if (t === 'support') return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
    if (t === 'cardapio') return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    if (t === 'implantacao') return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    return 'bg-muted text-muted-foreground border-border';
  };

  const getTypeLabel = (t: string) => {
    const map: Record<string, string> = { meeting: 'Reunião', franquia: 'Franquia', support: 'Suporte', cardapio: 'Cardápio Digital', implantacao: 'Implantação' };
    return map[t] || t;
  };

  if (loading) return <MainLayout><div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></MainLayout>;

  const year = currentDate.getFullYear(), month = currentDate.getMonth();
  const days = daysInMonth(year, month), firstDay = firstDayOfMonth(year, month);
  const dayAptsByDate = selectedDate ? appointments.filter(a => a.date === selectedDate) : [];

  return (
    <MainLayout>
      <div className="h-full flex flex-col p-3 sm:p-6 overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Agenda Comercial</h2>
            <p className="text-sm text-muted-foreground mt-1">Agendamentos, reuniões e follow-ups.</p>
          </div>
          <div className="flex items-center gap-2">
            {googleStatus?.connected && !googleStatus?.expired ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs">
                <Video className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-500 font-medium">{googleStatus.email || 'Conectado'}</span>
              </div>
            ) : googleStatus?.connected && googleStatus?.expired ? (
              <Button variant="outline" size="sm" onClick={handleConnectGoogle} className="gap-1.5 border-amber-500/30 text-amber-500 hover:bg-amber-500/10">
                <AlertCircle className="w-3.5 h-3.5" /> Token expirado - Reconectar
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={handleConnectGoogle} className="gap-1.5">
                <Video className="w-3.5 h-3.5" /> Conectar Google Meet
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={goToToday}>Hoje</Button>
            <Button variant="ghost" size="icon" onClick={() => navigateDate(-1)}><ChevronLeft className="w-4 h-4" /></Button>
            <span className="text-sm font-semibold capitalize min-w-[180px] text-center">{getMonthLabel()}</span>
            <Button variant="ghost" size="icon" onClick={() => navigateDate(1)}><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="flex-1 min-h-0 rounded-xl border bg-card flex flex-col overflow-auto">
          <div className="grid grid-cols-7 border-b bg-secondary">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
              <div key={d} className="p-2 text-center text-xs font-semibold text-muted-foreground uppercase">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 flex-1">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} className="border-b border-r border-border min-h-[80px]" />)}
            {Array.from({ length: days }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayApts = appointments.filter(a => a.date === dateStr);
              const isToday = formatDateStr(new Date()) === dateStr;
              return (
                <div key={day} onClick={() => handleDateClick(day)} className={`border-b border-r border-border p-1.5 min-h-[80px] cursor-pointer hover:bg-secondary/50 group ${isToday ? 'bg-primary/5' : ''}`}>
                  <span className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full mb-1 ${isToday ? 'bg-primary text-primary-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}>{day}</span>
                  <div className="space-y-0.5">
                    {dayApts.slice(0, 3).map(a => {
                      const effective = getEffectiveStatus(a);
                      const sc = statusConfig[effective];
                      return (
                        <div key={a.id} className={`text-[10px] px-1.5 py-0.5 rounded border truncate font-medium flex items-center gap-1 ${getTypeColor(a.type)}`}>
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sc.dot}`} />
                          <span className="truncate flex-1">{a.time.slice(0, 5)} {a.title}</span>
                          {a.googleMeetUrl && <Video className="w-2.5 h-2.5 flex-shrink-0 text-primary" />}
                        </div>
                      );
                    })}
                    {dayApts.length > 3 && <span className="text-[9px] text-muted-foreground pl-1">+{dayApts.length - 3} mais</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Day Tasks Modal */}
        <Dialog open={showDayModal} onOpenChange={setShowDayModal}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span>Tarefas - {selectedDate && new Date(selectedDate + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                <Button size="sm" onClick={openCreateModal} className="gap-1"><Plus className="w-3.5 h-3.5" />Nova</Button>
              </DialogTitle>
            </DialogHeader>
            {dayAptsByDate.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Nenhuma tarefa para este dia.
              </div>
            ) : (
              <div className="space-y-2">
                {dayAptsByDate.sort((a, b) => a.time.localeCompare(b.time)).map(apt => {
                  const effective = getEffectiveStatus(apt);
                  const sc = statusConfig[effective];
                  const canToggle = canAssign || apt.userId === user?.id;
                  return (
                    <div key={apt.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-secondary/30 transition-colors">
                      <div className="flex flex-col items-center gap-1 min-w-[50px]">
                        <span className="text-sm font-bold text-foreground">{apt.time.slice(0, 5)}</span>
                        <span className="text-[10px] text-muted-foreground">{apt.duration}min</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`font-medium text-sm ${effective === 'completed' ? 'line-through text-muted-foreground' : ''}`}>{apt.title}</span>
                          {apt.googleMeetUrl && <Video className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getTypeColor(apt.type)}`}>{getTypeLabel(apt.type)}</Badge>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${sc.color}`}>{sc.label}</Badge>
                          {apt.userName && <span className="text-[10px] text-muted-foreground">• {apt.userName}</span>}
                        </div>
                        {apt.description && <p className="text-xs text-muted-foreground mt-1 truncate">{apt.description}</p>}
                      </div>
                      <div className="flex items-center gap-1">
                        {canToggle && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleToggleStatus(apt)}
                            title={effective === 'completed' ? 'Marcar como pendente' : 'Marcar como concluído'}>
                            {effective === 'completed' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Circle className="w-4 h-4 text-muted-foreground" />}
                          </Button>
                        )}
                        {apt.processingStatus === 'completed' && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleViewReport(apt)}>
                            <FileText className="w-4 h-4 text-primary" />
                          </Button>
                        )}
                        {canAssign && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(apt.id)}>
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Create Modal */}
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Agendamento - {selectedDate}</DialogTitle></DialogHeader>
            {googleStatus?.connected && (
              <div className="flex items-center gap-2 text-xs text-emerald-500 bg-emerald-500/5 px-3 py-2 rounded-lg border border-emerald-500/10">
                <Video className="w-3.5 h-3.5" />
                Google Meet será criado automaticamente
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Título *</label>
                <Input value={formData.title} onChange={e => setFormData(p => ({ ...p, title: e.target.value }))} placeholder="Ex: Demo produto" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Horário</label>
                  <Input type="time" value={formData.time} onChange={e => setFormData(p => ({ ...p, time: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Tipo</label>
                  <Select value={formData.type} onValueChange={v => setFormData(p => ({ ...p, type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="meeting">Reunião</SelectItem>
                      <SelectItem value="franquia">Franquia</SelectItem>
                      <SelectItem value="support">Suporte</SelectItem>
                      <SelectItem value="cardapio">Cardápio Digital</SelectItem>
                      <SelectItem value="implantacao">Implantação</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Descrição</label>
                <Input value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} placeholder="Detalhes opcionais" />
              </div>
              {canAssign && deptMembers.length > 0 && (
                <div>
                  <label className="text-sm font-medium flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />Atribuir para</label>
                  <Select value={formData.assignedTo} onValueChange={v => setFormData(p => ({ ...p, assignedTo: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecionar atendente" /></SelectTrigger>
                    <SelectContent>
                      {deptMembers.map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>Cancelar</Button>
                <Button type="submit" disabled={isSaving || !formData.title.trim()}>{isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Criar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Report Modal */}
        <Dialog open={showReportModal} onOpenChange={setShowReportModal}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Relatório: {selectedAppointment?.title}
              </DialogTitle>
            </DialogHeader>
            {selectedAppointment?.googleMeetUrl && (
              <a href={selectedAppointment.googleMeetUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-primary bg-primary/5 px-3 py-2 rounded-lg border border-primary/10 hover:bg-primary/10 transition-colors">
                <Video className="w-3.5 h-3.5" />
                {selectedAppointment.googleMeetUrl}
                <ExternalLink className="w-3 h-3 ml-auto" />
              </a>
            )}
            {reportData?.processing_status === 'completed' && reportData.transcription_summary ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{reportData.transcription_summary}</div>
              </div>
            ) : reportData?.processing_status === 'transcribing' || reportData?.processing_status === 'generating_ata' ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  {reportData.processing_status === 'transcribing' ? 'Importando transcrição do Google Meet...' : 'Gerando relatório com IA...'}
                </p>
              </div>
            ) : reportData?.processing_status === 'failed' ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-destructive">
                <AlertCircle className="w-8 h-8" />
                <p className="text-sm">Falha ao processar. A transcrição pode não estar disponível.</p>
                <Button variant="outline" size="sm" onClick={() => selectedAppointment && handleEndMeeting(selectedAppointment)}>
                  Tentar novamente
                </Button>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Nenhum relatório disponível. Finalize a reunião para gerar o relatório automaticamente.
                {selectedAppointment?.status === 'scheduled' && (
                  <div className="mt-4">
                    <Button size="sm" onClick={() => { if (selectedAppointment) { handleEndMeeting(selectedAppointment); setShowReportModal(false); } }}>
                      Finalizar Reunião
                    </Button>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
