import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, DollarSign, Loader2, CalendarClock, Tag, Settings, MoreHorizontal, X, FileText, Phone, CheckCircle2, Circle, Trash2, Clock, MessageSquare, RotateCcw, MapPin, Eye } from 'lucide-react';
import { sdrApi, SDRDeal, SDRPipelineStage, SDRDealActivity } from '@/services/sdrApi';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { MainLayout } from '@/components/layout/MainLayout';
import { SDRCreateDealModal } from '@/components/sdr/SDRCreateDealModal';
import { SDRLostReasonModal } from '@/components/sdr/SDRLostReasonModal';
import { SDRPipelineSettingsModal } from '@/components/sdr/SDRPipelineSettingsModal';
import { getTagColorClasses } from '@/lib/tagColors';
import { useApp } from '@/contexts/AppContext';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ConversationPreviewDialog } from '@/components/queue/ConversationPreviewDialog';

export default function SDRPipelinePage() {
  const navigate = useNavigate();
  const { conversations, setSelectedConversation } = useApp();
  const [deals, setDeals] = useState<SDRDeal[]>([]);
  const [stages, setStages] = useState<SDRPipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeal, setSelectedDeal] = useState<SDRDeal | null>(null);
  const [activities, setActivities] = useState<SDRDealActivity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [remarketingLogs, setRemarketingLogs] = useState<any[]>([]);
  const [loadingRemarketing, setLoadingRemarketing] = useState(false);
  const [newActivityTitle, setNewActivityTitle] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLostModalOpen, setIsLostModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [linkedConversationId, setLinkedConversationId] = useState<string | null>(null);
  const dragItem = useRef<string | null>(null);

  const reload = async () => {
    const [s, d] = await Promise.all([sdrApi.fetchPipelineStages(), sdrApi.fetchPipeline()]);
    setStages(s); setDeals(d);
  };

  useEffect(() => {
    reload().finally(() => setLoading(false));
    const ch1 = supabase.channel('sdr-deals').on('postgres_changes', { event: '*', schema: 'public', table: 'sdr_deals' }, reload).subscribe();
    const ch2 = supabase.channel('sdr-stages').on('postgres_changes', { event: '*', schema: 'public', table: 'sdr_pipeline_stages' }, () => sdrApi.fetchPipelineStages().then(setStages)).subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, []);

  useEffect(() => {
    if (!selectedDeal) { setLinkedConversationId(null); return; }
    supabase.from('conversations').select('id').eq('sdr_deal_id', selectedDeal.id).maybeSingle()
      .then(({ data }) => setLinkedConversationId(data?.id || null));
  }, [selectedDeal?.id]);

  const handleGoToConversation = () => {
    if (!linkedConversationId) return;
    const conv = conversations.find(c => c.id === linkedConversationId);
    if (conv) {
      setSelectedConversation(conv);
      navigate('/conversas');
    } else {
      toast.error('Conversa não encontrada na fila atual.');
    }
  };
  useEffect(() => { if (selectedDeal) { loadActivities(); loadRemarketingLogs(); } }, [selectedDeal?.id]);

  const loadActivities = async () => {
    if (!selectedDeal) return;
    setLoadingActivities(true);
    try { setActivities(await sdrApi.fetchDealActivities(selectedDeal.id)); } catch {} finally { setLoadingActivities(false); }
  };

  const loadRemarketingLogs = async () => {
    if (!selectedDeal) return;
    setLoadingRemarketing(true);
    try { setRemarketingLogs(await sdrApi.fetchRemarketingLog(selectedDeal.id)); } catch {} finally { setLoadingRemarketing(false); }
  };

  const handleMarkWon = async () => {
    if (!selectedDeal) return;
    try { await sdrApi.markDealWon(selectedDeal.id); toast.success('Lead marcado como ganho!'); setSelectedDeal(null); } catch { toast.error('Erro ao marcar como ganho'); }
  };

  const handleMarkLost = async (reason: string) => {
    if (!selectedDeal) return;
    try { await sdrApi.markDealLost(selectedDeal.id, reason); toast.success('Lead marcado como perdido.'); setSelectedDeal(null); } catch { toast.error('Erro ao marcar como perdido'); }
  };

  const handleDeleteDeal = async () => {
    if (!selectedDeal) return;
    try { await sdrApi.deleteDeal(selectedDeal.id); toast.success('Lead excluído com sucesso!'); setSelectedDeal(null); setIsDeleteDialogOpen(false); } catch { toast.error('Erro ao excluir lead'); }
  };

  const handleCreateActivity = async () => {
    if (!selectedDeal || !newActivityTitle.trim()) return;
    try { await sdrApi.createDealActivity({ dealId: selectedDeal.id, type: 'note', title: newActivityTitle }); setNewActivityTitle(''); loadActivities(); toast.success('Atividade criada'); } catch { toast.error('Erro ao criar atividade'); }
  };

  const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const onDragStart = (e: React.DragEvent, dealId: string) => { dragItem.current = dealId; e.dataTransfer.effectAllowed = 'move'; (e.target as HTMLElement).style.opacity = '0.5'; };
  const onDragEnd = (e: React.DragEvent) => { dragItem.current = null; (e.target as HTMLElement).style.opacity = '1'; };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const onDrop = async (e: React.DragEvent, targetStageId: string) => {
    e.preventDefault();
    const dealId = dragItem.current;
    if (!dealId) return;
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, stageId: targetStageId } : d));
    try { await sdrApi.moveDealStage(dealId, targetStageId); } catch { reload(); }
  };

  const filteredDeals = deals.filter(d => d.title.toLowerCase().includes(searchQuery.toLowerCase()) || d.company.toLowerCase().includes(searchQuery.toLowerCase()));

  const getPriorityColor = (p: string) => {
    if (p === 'high') return 'bg-destructive/10 text-destructive border-destructive/20';
    if (p === 'medium') return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
  };

  if (loading) return <MainLayout><div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></MainLayout>;

  return (
    <MainLayout>
      <div className="h-full flex flex-col p-3 sm:p-6 overflow-hidden relative">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4 flex-shrink-0">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Pipeline de Leads</h2>
            <p className="text-sm text-muted-foreground mt-1">Gerencie leads e acompanhe o fluxo.</p>
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input type="text" placeholder="Buscar oportunidade..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-secondary border border-border rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none placeholder:text-muted-foreground" />
            </div>
            <Button variant="outline" onClick={() => setIsSettingsOpen(true)}><Settings className="w-4 h-4 mr-2" />Configurar</Button>
            <Button onClick={() => setIsCreateModalOpen(true)}><Plus className="w-4 h-4 mr-2" />Novo Lead</Button>
          </div>
        </div>

        {/* Board */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4">
          <div className="flex h-full gap-4 min-w-max">
            {stages.map(col => {
              const colDeals = filteredDeals.filter(d => d.stageId === col.id).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
              const total = colDeals.reduce((a, c) => a + c.value, 0);
              const isWon = col.title === 'Ganho', isLost = col.title === 'Perdido';
              return (
                <div key={col.id} className={`w-72 flex flex-col h-full rounded-xl border backdrop-blur-sm ${isWon ? 'bg-emerald-500/5 border-emerald-500/30' : isLost ? 'bg-destructive/5 border-destructive/30' : 'bg-card/30 border-border'}`}
                  onDragOver={onDragOver} onDrop={e => onDrop(e, col.id)}>
                  <div className={`p-3 border-b flex flex-col gap-1 rounded-t-xl ${isWon ? 'border-emerald-500/30 border-t-4 border-t-emerald-500' : isLost ? 'border-destructive/30 border-t-4 border-t-destructive' : 'border-border border-t-2 ' + col.color}`}>
                    <div className="flex justify-between items-center">
                      <h3 className="font-bold text-xs uppercase tracking-wide">{col.title}</h3>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-secondary text-muted-foreground">{colDeals.length}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">Total: <span className="font-medium text-foreground">{formatCurrency(total)}</span></div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {colDeals.map(deal => (
                      <div key={deal.id} draggable onDragStart={e => onDragStart(e, deal.id)} onDragEnd={onDragEnd} onClick={() => setSelectedDeal(deal)}
                        className="bg-card border border-border rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing hover:border-primary/50 transition-all group">
                        <div className="flex justify-between items-start mb-1.5">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${getPriorityColor(deal.priority)}`}>
                            {deal.priority === 'high' ? 'Alta' : deal.priority === 'medium' ? 'Média' : 'Baixa'}
                          </span>
                          {deal.createdAt && (
                            <span className="text-[9px] text-muted-foreground">
                              {new Date(deal.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                            </span>
                          )}
                        </div>
                        <h4 className="font-semibold text-sm mb-0.5 leading-tight">{deal.title}</h4>
                        <p className="text-[10px] text-muted-foreground mb-1">{deal.company}</p>
                        {deal.contactCity && (
                          <p className="text-[10px] text-muted-foreground mb-2 flex items-center gap-1"><MapPin className="w-2.5 h-2.5 text-primary" />{deal.contactCity}</p>
                        )}
                        {deal.tags.length > 0 && (
                          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                            {deal.tags.map(tag => (<span key={tag} className={`text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 border ${getTagColorClasses(tag)}`}><Tag className="w-2.5 h-2.5" />{tag}</span>))}
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-2 border-t border-border">
                          <div className="flex items-center gap-1.5 text-xs font-bold"><DollarSign className="w-3 h-3 text-emerald-500" />{formatCurrency(deal.value)}</div>
                          <div className="flex items-center gap-2">
                            {deal.dueDate && (<div className="text-[9px] text-muted-foreground flex items-center gap-1"><CalendarClock className="w-3 h-3" />{new Date(deal.dueDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</div>)}
                            <img src={deal.ownerAvatar} alt="" className="w-5 h-5 rounded-full border border-border" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Deal Drawer */}
        {selectedDeal && <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={() => setSelectedDeal(null)} />}
        <div className={`fixed top-0 right-0 h-full w-full max-w-xl bg-background border-l border-border shadow-2xl z-50 transform transition-transform duration-300 flex flex-col ${selectedDeal ? 'translate-x-0' : 'translate-x-full'}`}>
          {selectedDeal && (
            <>
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h3 className="text-lg font-bold">{selectedDeal.title}</h3>
                <Button variant="ghost" size="icon" onClick={() => setSelectedDeal(null)}><X className="w-5 h-5" /></Button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <p className="text-xs text-muted-foreground mb-1">Valor</p>
                    <p className="text-lg font-bold text-emerald-500">{formatCurrency(selectedDeal.value)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <p className="text-xs text-muted-foreground mb-1">Empresa</p>
                    <p className="text-sm font-medium">{selectedDeal.company}</p>
                  </div>
                </div>
                {selectedDeal.contactName && (
                  <div className="p-3 rounded-lg bg-secondary/50 flex items-center gap-3">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{selectedDeal.contactName}</p>
                      <p className="text-xs text-muted-foreground">{selectedDeal.contactPhone}</p>
                    </div>
                  </div>
                )}
                {selectedDeal.contactCity && (
                  <div className="p-3 rounded-lg bg-secondary/50 flex items-center gap-3">
                    <MapPin className="w-4 h-4 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Cidade</p>
                      <p className="text-sm font-medium">{selectedDeal.contactCity}</p>
                    </div>
                  </div>
                )}
                {linkedConversationId && (
                  <Button variant="outline" className="w-full" onClick={handleGoToConversation}>
                    <MessageSquare className="w-4 h-4 mr-2" />Ir para Conversa
                  </Button>
                )}
                <div className="flex gap-2">
                  <Button className="flex-1" variant="outline" onClick={handleMarkWon}><CheckCircle2 className="w-4 h-4 mr-2 text-emerald-500" />Ganho</Button>
                  <Button className="flex-1" variant="outline" onClick={() => setIsLostModalOpen(true)}><X className="w-4 h-4 mr-2 text-destructive" />Perdido</Button>
                </div>
                <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="w-full text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10">
                      <Trash2 className="w-4 h-4 mr-2" />Excluir Lead
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir Lead</AlertDialogTitle>
                      <AlertDialogDescription>
                        Tem certeza que deseja excluir o lead <strong>{selectedDeal.title}</strong>? Esta ação não pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteDeal} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                {/* Remarketing History */}
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2"><RotateCcw className="w-4 h-4 text-primary" />Histórico de Repescagem</h4>
                  {loadingRemarketing ? <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" /> : remarketingLogs.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">Nenhuma tentativa de repescagem enviada.</p>
                  ) : (
                    <div className="space-y-2">
                      {remarketingLogs.map(log => (
                        <div key={log.id} className="p-2.5 rounded-lg bg-secondary/30 border border-border">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-bold">#{log.attempt_number}</span>
                              Tentativa
                            </span>
                            <span className="text-[10px] text-muted-foreground">{new Date(log.sent_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          {log.config?.message_template && (
                            <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{log.config.message_template}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* Activities */}
                <div>
                  <h4 className="font-semibold mb-3">Atividades</h4>
                  <div className="flex gap-2 mb-3">
                    <input type="text" placeholder="Nova atividade..." value={newActivityTitle} onChange={e => setNewActivityTitle(e.target.value)}
                      className="flex-1 px-3 py-2 text-sm bg-secondary border border-border rounded-lg" onKeyDown={e => e.key === 'Enter' && handleCreateActivity()} />
                    <Button size="sm" onClick={handleCreateActivity}>Adicionar</Button>
                  </div>
                  {loadingActivities ? <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" /> : (
                    <div className="space-y-2">
                      {activities.map(a => (
                        <div key={a.id} className="flex items-start gap-3 p-2 rounded-lg bg-secondary/30">
                          <button onClick={() => sdrApi.updateDealActivity(a.id, { isCompleted: !a.isCompleted }).then(loadActivities)}>
                            {a.isCompleted ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5" /> : <Circle className="w-4 h-4 text-muted-foreground mt-0.5" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm ${a.isCompleted ? 'line-through text-muted-foreground' : ''}`}>{a.title}</p>
                            <p className="text-[10px] text-muted-foreground">{new Date(a.createdAt).toLocaleDateString('pt-BR')}</p>
                          </div>
                          <button onClick={() => sdrApi.deleteDealActivity(a.id).then(loadActivities)}><Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <SDRCreateDealModal open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen} onDealCreated={reload} />
        <SDRLostReasonModal open={isLostModalOpen} onOpenChange={setIsLostModalOpen} onConfirm={handleMarkLost} dealTitle={selectedDeal?.title || ''} />
        <SDRPipelineSettingsModal open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} onSave={reload} />
      </div>
    </MainLayout>
  );
}
