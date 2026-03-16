import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2, GripVertical, Plus, Lock, Bot, Brain, Tag, X, UserCheck, RefreshCw, Clock, MessageSquare } from 'lucide-react';
import { sdrApi, SDRPipelineStage, SDRRemarketingRule } from '@/services/sdrApi';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const COLORS = [
  { value: 'border-slate-500', label: 'Cinza', preview: 'bg-slate-500' },
  { value: 'border-cyan-500', label: 'Ciano', preview: 'bg-cyan-500' },
  { value: 'border-violet-500', label: 'Violeta', preview: 'bg-violet-500' },
  { value: 'border-orange-500', label: 'Laranja', preview: 'bg-orange-500' },
  { value: 'border-emerald-500', label: 'Verde', preview: 'bg-emerald-500' },
  { value: 'border-red-500', label: 'Vermelho', preview: 'bg-red-500' },
  { value: 'border-blue-500', label: 'Azul', preview: 'bg-blue-500' },
];

interface Robot { id: string; name: string; intelligence: string; }
interface ComercialUser { id: string; name: string; }

interface Props { open: boolean; onClose: () => void; onSave?: () => void; }

export function SDRPipelineSettingsModal({ open, onClose, onSave }: Props) {
  const [stages, setStages] = useState<SDRPipelineStage[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editColor, setEditColor] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newColor, setNewColor] = useState('border-slate-500');
  const [deleteConfirm, setDeleteConfirm] = useState<{ stageId: string; stageName: string } | null>(null);
  const [availableStages, setAvailableStages] = useState<SDRPipelineStage[]>([]);
  const [moveToStageId, setMoveToStageId] = useState('');

  const [robots, setRobots] = useState<Robot[]>([]);
  const [selectedRobotId, setSelectedRobotId] = useState<string>('');
  const [sdrRobotConfigId, setSdrRobotConfigId] = useState<string | null>(null);

  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [editPromptText, setEditPromptText] = useState('');
  const [editAiManaged, setEditAiManaged] = useState(false);

  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [transferToUserId, setTransferToUserId] = useState<string>('');
  const [autoConfigId, setAutoConfigId] = useState<string | null>(null);
  const [autoConfigActive, setAutoConfigActive] = useState(true);
  const [comercialUsers, setComercialUsers] = useState<ComercialUser[]>([]);
  const [savingAutoConfig, setSavingAutoConfig] = useState(false);

  const [remarketingRules, setRemarketingRules] = useState<SDRRemarketingRule[]>([]);
  const [remarketingActive, setRemarketingActive] = useState(true);
  const [savingRemarketing, setSavingRemarketing] = useState(false);

  useEffect(() => { if (open) { loadStages(); loadRobots(); loadSdrRobotConfig(); loadAutoConfig(); loadComercialUsers(); loadRemarketingConfig(); } }, [open]);

  const loadStages = async () => {
    setLoading(true);
    try { setStages(await sdrApi.fetchPipelineStages()); } catch { toast.error('Erro ao carregar'); }
    finally { setLoading(false); }
  };

  const loadRobots = async () => {
    const { data } = await supabase.from('robots').select('id, name, intelligence').order('name');
    setRobots((data || []) as Robot[]);
  };

  const loadSdrRobotConfig = async () => {
    const { data } = await supabase.from('sdr_robot_config').select('id, robot_id').eq('is_active', true).maybeSingle();
    if (data) { setSdrRobotConfigId(data.id); setSelectedRobotId(data.robot_id); }
    else { setSdrRobotConfigId(null); setSelectedRobotId(''); }
  };

  const loadAutoConfig = async () => {
    const { data } = await supabase.from('sdr_auto_config' as any).select('*').eq('is_active', true).maybeSingle();
    if (data) {
      setAutoConfigId((data as any).id); setKeywords((data as any).keywords || []);
      setTransferToUserId((data as any).transfer_to_user_id || ''); setAutoConfigActive((data as any).is_active);
    } else { setAutoConfigId(null); setKeywords([]); setTransferToUserId(''); setAutoConfigActive(true); }
  };

  const loadComercialUsers = async () => {
    const { data: dept } = await supabase.from('departments').select('id').ilike('name', '%comercial%').maybeSingle();
    if (dept) {
      const { data: members } = await supabase.from('profile_departments').select('profile_id, profiles:profile_id(id, name)').eq('department_id', dept.id);
      if (members) {
        setComercialUsers(members.map((m: any) => m.profiles).filter(Boolean).map((p: any) => ({ id: p.id, name: p.name })));
      }
    }
  };

  const loadRemarketingConfig = async () => {
    try {
      const rules = await sdrApi.fetchRemarketingConfig();
      setRemarketingRules(rules);
      setRemarketingActive(rules.length > 0 ? rules.some(r => r.is_active) : true);
    } catch { setRemarketingRules([]); }
  };

  const handleSaveRobotConfig = async () => {
    if (!selectedRobotId) return;
    try {
      if (sdrRobotConfigId) { await supabase.from('sdr_robot_config').update({ robot_id: selectedRobotId }).eq('id', sdrRobotConfigId); }
      else { const { data } = await supabase.from('sdr_robot_config').insert({ robot_id: selectedRobotId, is_active: true }).select('id').single(); if (data) setSdrRobotConfigId(data.id); }
      toast.success('Robô SDR configurado!');
    } catch { toast.error('Erro ao salvar configuração'); }
  };

  const handleAddKeyword = () => {
    const trimmed = keywordInput.trim().toLowerCase();
    if (!trimmed || keywords.includes(trimmed)) return;
    setKeywords(prev => [...prev, trimmed]); setKeywordInput('');
  };

  const handleKeywordKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); handleAddKeyword(); }
  };

  const handleSaveAutoConfig = async () => {
    setSavingAutoConfig(true);
    try {
      const payload = { keywords, transfer_to_user_id: transferToUserId || null, is_active: autoConfigActive, updated_at: new Date().toISOString() };
      if (autoConfigId) { await supabase.from('sdr_auto_config' as any).update(payload).eq('id', autoConfigId); }
      else { const { data } = await supabase.from('sdr_auto_config' as any).insert(payload).select('id').single(); if (data) setAutoConfigId((data as any).id); }
      toast.success('Configuração automática salva!');
    } catch { toast.error('Erro ao salvar configuração'); }
    finally { setSavingAutoConfig(false); }
  };

  const handleAddRemarketingRule = () => {
    const lastDays = remarketingRules.length > 0 ? remarketingRules[remarketingRules.length - 1].days_inactive + 3 : 2;
    setRemarketingRules(prev => [...prev, { position: prev.length + 1, days_inactive: lastDays, message_template: '', is_active: true }]);
  };

  const handleUpdateRemarketingRule = (index: number, field: keyof SDRRemarketingRule, value: any) => {
    setRemarketingRules(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  const handleSaveRemarketing = async () => {
    setSavingRemarketing(true);
    try {
      await sdrApi.upsertRemarketingConfig(remarketingRules.map(r => ({ ...r, is_active: remarketingActive })));
      toast.success('Repescagem inteligente salva!');
      loadRemarketingConfig();
    } catch { toast.error('Erro ao salvar configuração de remarketing'); }
    finally { setSavingRemarketing(false); }
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    try { await sdrApi.updatePipelineStage(editingId, { title: editTitle, color: editColor }); toast.success('Atualizado'); setEditingId(null); loadStages(); onSave?.(); } catch { toast.error('Erro'); }
  };

  const handleSavePrompt = async () => {
    if (!editingPromptId) return;
    try {
      await sdrApi.updatePipelineStage(editingPromptId, { isAiManaged: editAiManaged, aiTriggerCriteria: editPromptText });
      toast.success('Prompt da etapa salvo!'); setEditingPromptId(null); loadStages(); onSave?.();
    } catch { toast.error('Erro ao salvar prompt'); }
  };

  const handleDeleteClick = async (stage: SDRPipelineStage) => {
    const deals = await sdrApi.fetchPipeline();
    const inStage = deals.filter(d => d.stageId === stage.id);
    if (inStage.length > 0) {
      setAvailableStages(stages.filter(s => s.id !== stage.id));
      setMoveToStageId(stages.find(s => s.id !== stage.id)?.id || '');
      setDeleteConfirm({ stageId: stage.id, stageName: stage.title });
    } else { await sdrApi.deletePipelineStage(stage.id); toast.success('Removida'); loadStages(); onSave?.(); }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    try { await sdrApi.deletePipelineStage(deleteConfirm.stageId, moveToStageId); toast.success('Removida e leads movidos'); setDeleteConfirm(null); loadStages(); onSave?.(); } catch { toast.error('Erro'); }
  };

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    try { await sdrApi.createPipelineStage({ title: newTitle, color: newColor }); toast.success('Criada'); setNewTitle(''); loadStages(); onSave?.(); } catch { toast.error('Erro'); }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>⚙️ Configurar Pipeline</DialogTitle></DialogHeader>
          <div className="space-y-6">
            {/* Robot Selector */}
            <div className="p-4 border rounded-lg bg-secondary/30 space-y-3">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-primary" />
                <Label className="text-base font-semibold">Robô SDR do Pipeline</Label>
              </div>
              <p className="text-xs text-muted-foreground">Selecione o robô que irá conversar com os leads pelo WhatsApp nas etapas com IA ativa.</p>
              <div className="flex gap-2">
                <Select value={selectedRobotId} onValueChange={setSelectedRobotId}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione um robô..." /></SelectTrigger>
                  <SelectContent>
                    {robots.map(r => (
                      <SelectItem key={r.id} value={r.id}>
                        <div className="flex items-center gap-2"><Bot className="w-3 h-3" />{r.name}<span className="text-muted-foreground text-xs">({r.intelligence})</span></div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={handleSaveRobotConfig} disabled={!selectedRobotId}>Salvar</Button>
              </div>
            </div>

            {/* Auto Config */}
            <div className="p-4 border rounded-lg bg-secondary/30 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><Tag className="w-5 h-5 text-primary" /><Label className="text-base font-semibold">Detecção Automática de Leads</Label></div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="auto-config-active" className="text-xs text-muted-foreground">Ativo</Label>
                  <Switch id="auto-config-active" checked={autoConfigActive} onCheckedChange={setAutoConfigActive} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Quando um cliente enviar uma mensagem contendo uma dessas palavras-chave, um lead será criado automaticamente e o robô SDR será acionado.</p>
              <div className="space-y-2">
                <Label className="text-sm">Palavras-Chave</Label>
                <div className="flex gap-2">
                  <Input value={keywordInput} onChange={e => setKeywordInput(e.target.value)} onKeyDown={handleKeywordKeyDown} placeholder="Digite e pressione Enter..." className="flex-1" />
                  <Button size="sm" variant="outline" onClick={handleAddKeyword} disabled={!keywordInput.trim()}><Plus className="w-4 h-4" /></Button>
                </div>
                {keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {keywords.map(kw => (
                      <Badge key={kw} variant="secondary" className="flex items-center gap-1 px-2 py-1">
                        {kw}
                        <button onClick={() => setKeywords(prev => prev.filter(k => k !== kw))} className="ml-1 hover:text-destructive"><X className="w-3 h-3" /></button>
                      </Badge>
                    ))}
                  </div>
                )}
                {keywords.length === 0 && <p className="text-xs text-muted-foreground italic">Nenhuma palavra-chave configurada.</p>}
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2"><UserCheck className="w-4 h-4 text-muted-foreground" /><Label className="text-sm">Responsável pela etapa "Proposta"</Label></div>
                <p className="text-xs text-muted-foreground">Quando o lead chegar na etapa de proposta, a conversa será atribuída a este usuário.</p>
                <Select value={transferToUserId} onValueChange={setTransferToUserId}>
                  <SelectTrigger><SelectValue placeholder="Selecione um responsável..." /></SelectTrigger>
                  <SelectContent>{comercialUsers.map(u => (<SelectItem key={u.id} value={u.id}><div className="flex items-center gap-2"><UserCheck className="w-3 h-3" />{u.name}</div></SelectItem>))}</SelectContent>
                </Select>
              </div>
              <Button size="sm" onClick={handleSaveAutoConfig} disabled={savingAutoConfig} className="w-full">{savingAutoConfig ? 'Salvando...' : 'Salvar Configuração Automática'}</Button>
            </div>

            {/* Remarketing / Repescagem Inteligente */}
            <div className="p-4 border rounded-lg bg-secondary/30 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><RefreshCw className="w-5 h-5 text-primary" /><Label className="text-base font-semibold">Repescagem Inteligente</Label></div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="remarketing-active" className="text-xs text-muted-foreground">Ativo</Label>
                  <Switch id="remarketing-active" checked={remarketingActive} onCheckedChange={setRemarketingActive} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Envia mensagens automáticas de follow-up para leads que ficaram sem resposta. O sistema detecta desinteresse automaticamente.</p>

              <div className="space-y-3">
                {remarketingRules.map((rule, index) => (
                  <div key={index} className="border rounded-lg p-3 bg-card space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">{index + 1}</div>
                        <span className="text-sm font-medium">Tentativa {index + 1}</span>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => setRemarketingRules(prev => prev.filter((_, i) => i !== index))}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">Dias sem resposta:</Label>
                      <Input type="number" min={1} max={90} value={rule.days_inactive} onChange={e => handleUpdateRemarketingRule(index, 'days_inactive', parseInt(e.target.value) || 1)} className="w-20 h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1"><MessageSquare className="w-3 h-3 text-muted-foreground" /><Label className="text-xs text-muted-foreground">Mensagem</Label></div>
                      <Textarea value={rule.message_template} onChange={e => handleUpdateRemarketingRule(index, 'message_template', e.target.value)} placeholder="Mensagem de follow-up para o lead..." className="min-h-[60px] text-sm" />
                    </div>
                  </div>
                ))}
              </div>

              <Button size="sm" variant="outline" onClick={handleAddRemarketingRule} className="w-full"><Plus className="w-4 h-4 mr-1" />Adicionar Tentativa</Button>

              {remarketingRules.length > 0 && (
                <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded space-y-1">
                  <p>📋 <strong>Fluxo:</strong> Após a última tentativa sem resposta, o lead será marcado como <strong>Perdido</strong> com motivo "Não respondeu".</p>
                  <p>🛑 <strong>Detecção de desinteresse:</strong> Se o lead responder "não tenho interesse", "pode encerrar", etc., o remarketing para automaticamente.</p>
                </div>
              )}

              <Button size="sm" onClick={handleSaveRemarketing} disabled={savingRemarketing} className="w-full">{savingRemarketing ? 'Salvando...' : 'Salvar Repescagem'}</Button>
            </div>

            {/* Stages List */}
            {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> : stages.map(stage => (
              <div key={stage.id} className="border rounded-lg bg-card overflow-hidden">
                <div className="flex items-center gap-3 p-3">
                  <GripVertical className="w-5 h-5 text-muted-foreground" />
                  <div className={`w-3 h-3 rounded-full ${stage.color.replace('border-', 'bg-')}`} />
                  {editingId === stage.id ? (
                    <div className="flex-1 flex gap-2">
                      <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="flex-1" />
                      <Select value={editColor} onValueChange={setEditColor}>
                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>{COLORS.map(c => (<SelectItem key={c.value} value={c.value}><div className="flex items-center gap-2"><div className={`w-3 h-3 rounded-full ${c.preview}`} />{c.label}</div></SelectItem>))}</SelectContent>
                      </Select>
                      <Button size="sm" onClick={handleSaveEdit}>Salvar</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancelar</Button>
                    </div>
                  ) : (
                    <>
                      <span className="font-medium flex-1">{stage.title}</span>
                      {stage.isAiManaged && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center gap-1"><Brain className="w-3 h-3" />IA Ativa</span>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => { setEditingPromptId(stage.id); setEditPromptText(stage.aiTriggerCriteria || ''); setEditAiManaged(stage.isAiManaged); }}><Brain className="w-4 h-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditingId(stage.id); setEditTitle(stage.title); setEditColor(stage.color); }}><Pencil className="w-4 h-4" /></Button>
                      {stage.isSystem ? <Button size="sm" variant="ghost" disabled><Lock className="w-4 h-4 text-muted-foreground" /></Button> : <Button size="sm" variant="ghost" onClick={() => handleDeleteClick(stage)}><Trash2 className="w-4 h-4 text-destructive" /></Button>}
                    </>
                  )}
                </div>
                {editingPromptId === stage.id && (
                  <div className="border-t p-3 bg-secondary/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Configuração de IA — {stage.title}</Label>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`ai-switch-${stage.id}`} className="text-xs text-muted-foreground">IA Ativa</Label>
                        <Switch id={`ai-switch-${stage.id}`} checked={editAiManaged} onCheckedChange={setEditAiManaged} />
                      </div>
                    </div>
                    {editAiManaged && (
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Prompt específico para esta etapa</Label>
                        <Textarea value={editPromptText} onChange={e => setEditPromptText(e.target.value)} placeholder="Ex: Você está atendendo um novo lead..." className="min-h-[120px] text-sm" />
                      </div>
                    )}
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => setEditingPromptId(null)}>Cancelar</Button>
                      <Button size="sm" onClick={handleSavePrompt}>Salvar Prompt</Button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Add new stage */}
            <div className="border-t pt-4 space-y-3">
              <Label>Nova Etapa</Label>
              <div className="flex gap-2">
                <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Nome da etapa" className="flex-1" />
                <Select value={newColor} onValueChange={setNewColor}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>{COLORS.map(c => (<SelectItem key={c.value} value={c.value}><div className="flex items-center gap-2"><div className={`w-3 h-3 rounded-full ${c.preview}`} />{c.label}</div></SelectItem>))}</SelectContent>
                </Select>
              </div>
              <Button onClick={handleAdd} className="w-full"><Plus className="w-4 h-4 mr-1" />Adicionar Etapa</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover "{deleteConfirm?.stageName}"?</AlertDialogTitle>
            <AlertDialogDescription>Existem leads nesta etapa. Escolha para onde mover:</AlertDialogDescription>
          </AlertDialogHeader>
          <Select value={moveToStageId} onValueChange={setMoveToStageId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{availableStages.map(s => (<SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>))}</SelectContent>
          </Select>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
