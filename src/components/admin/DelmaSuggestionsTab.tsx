import { useState, useEffect, useCallback, useRef } from 'react';
import { Sparkles, MessageSquare, Users, FileText, Target, CalendarClock, ChevronRight, ChevronDown, CheckCircle2, XCircle, Loader2, Brain, Info, AlertCircle, ThumbsUp, ThumbsDown, Edit3, Bot, Filter, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface DelmaSuggestion {
  id: string;
  category: string;
  title: string;
  justification: string;
  content: any;
  confidence_score: number;
  memories_used: any[];
  status: string;
  reject_reason: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

interface DelmaSuggestionsTabProps {
  onSuggestionsCountChange?: (count: number) => void;
}

const categoryConfig: Record<string, { label: string; icon: any; color: string }> = {
  robot_training: { label: 'Treinamento de Robô', icon: Brain, color: 'bg-primary/15 text-primary border-primary/20' },
  agent_goals: { label: 'Meta de Atendente', icon: Target, color: 'bg-warning/15 text-warning border-warning/20' },
  report_schedule: { label: 'Relatório Agendado', icon: CalendarClock, color: 'bg-success/15 text-success border-success/20' },
  aprendizado_humano: { label: 'Aprendizado Humano', icon: Users, color: 'bg-blue-500/15 text-blue-500 border-blue-500/20' },
  aprendizado_robo: { label: 'Aprendizado Robô', icon: Bot, color: 'bg-purple-500/15 text-purple-500 border-purple-500/20' },
  melhoria_delma: { label: 'Melhoria Delma', icon: Brain, color: 'bg-amber-500/15 text-amber-500 border-amber-500/20' },
  melhoria_instrucao: { label: 'Melhoria de Instrução', icon: FileText, color: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/20' },
  anomalia_detectada: { label: 'Anomalia Detectada', icon: AlertCircle, color: 'bg-red-500/15 text-red-500 border-red-500/20' },
};

function ImpactBar({ score }: { score: number }) {
  const color = score > 85 ? 'bg-red-500' : score > 70 ? 'bg-orange-500' : score > 40 ? 'bg-yellow-500' : 'bg-green-500';
  const label = score > 85 ? 'Crítico' : score > 70 ? 'Alto' : score > 40 ? 'Médio' : 'Baixo';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] font-medium text-muted-foreground">{label} ({score})</span>
    </div>
  );
}

export function DelmaSuggestionsTab({ onSuggestionsCountChange }: DelmaSuggestionsTabProps) {
  const [suggestions, setSuggestions] = useState<DelmaSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [analyzingConversations, setAnalyzingConversations] = useState(false);
  const [analyzingInstructions, setAnalyzingInstructions] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingSuggestion, setRejectingSuggestion] = useState<DelmaSuggestion | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingSuggestion, setEditingSuggestion] = useState<DelmaSuggestion | null>(null);
  const [editedContent, setEditedContent] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [lastDiagnostics, setLastDiagnostics] = useState<any>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [flowHealth, setFlowHealth] = useState<'green' | 'yellow' | 'red'>('green');

  const loadSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('delma_suggestions' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const typed = (data as any[]) || [];
      // Sort by impact_score (from content.impact_score) descending, then confidence_score
      typed.sort((a, b) => {
        const aImpact = a.content?.impact_score || 0;
        const bImpact = b.content?.impact_score || 0;
        if (bImpact !== aImpact) return bImpact - aImpact;
        return (b.confidence_score || 0) - (a.confidence_score || 0);
      });
      setSuggestions(typed);
      onSuggestionsCountChange?.(typed.filter(s => s.status === 'pending' && s.category !== 'report_schedule').length);
    } catch (e) {
      console.error('Error loading suggestions:', e);
    } finally {
      setLoading(false);
    }
  }, [onSuggestionsCountChange]);

  useEffect(() => { loadSuggestions(); }, [loadSuggestions]);

  const autoTriggered = useRef(false);

  useEffect(() => {
    if (!loading && suggestions.length === 0 && !autoTriggered.current && !generating) {
      autoTriggered.current = true;
      triggerAnalysisAuto();
    }
  }, [loading, suggestions.length]);

  const triggerAnalysisAuto = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('delma-autonomous-analysis');
      if (error) throw error;
      toast.success(data.message || 'Análise inicial concluída!');
      loadSuggestions();
    } catch (e: any) {
      console.error('Auto analysis error:', e);
    } finally {
      setGenerating(false);
    }
  };

  const triggerAnalysis = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('delma-autonomous-analysis');
      if (error) throw error;
      toast.success(data.message || 'Análise concluída!');
      loadSuggestions();
    } catch (e: any) {
      toast.error('Erro ao executar análise: ' + (e.message || 'Erro desconhecido'));
    } finally {
      setGenerating(false);
    }
  };

  const triggerConversationAnalysis = async () => {
    setAnalyzingConversations(true);
    try {
      const { data, error } = await supabase.functions.invoke('brain-learn-from-conversations');
      if (error) throw error;
      const msg = data.message || 'Análise de conversas concluída!';
      if (data.diagnostics) {
        setLastDiagnostics(data.diagnostics);
        setLastRunAt(new Date().toISOString());
        setFlowHealth(data.suggestions_generated > 0 ? 'green' : data.diagnostics?.total_processable > 0 ? 'yellow' : 'red');
      }
      toast.success(msg);
      loadSuggestions();
    } catch (e: any) {
      setFlowHealth('red');
      toast.error('Erro ao analisar conversas: ' + (e.message || 'Erro desconhecido'));
    } finally {
      setAnalyzingConversations(false);
    }
  };

  const triggerInstructionAnalysis = async () => {
    setAnalyzingInstructions(true);
    try {
      const { data, error } = await supabase.functions.invoke('brain-learn-instruction-patterns');
      if (error) throw error;
      const msg = data.message || 'Análise de instruções concluída!';
      if (data.diagnostics) {
        setLastDiagnostics(prev => ({ ...prev, ...data.diagnostics, instruction_suggestions: data.suggestions }));
        setLastRunAt(new Date().toISOString());
      }
      toast.success(msg);
      loadSuggestions();
    } catch (e: any) {
      setFlowHealth('red');
      toast.error('Erro ao analisar instruções: ' + (e.message || 'Erro desconhecido'));
    } finally {
      setAnalyzingInstructions(false);
    }
  };

  const handleApprove = async (suggestion: DelmaSuggestion) => {
    setApplyingId(suggestion.id);
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) throw new Error('Não autenticado');

      if (suggestion.category === 'robot_training' && suggestion.content?.training_suggestion_id) {
        const { data: trainingSuggestion } = await supabase
          .from('robot_training_suggestions' as any)
          .select('*')
          .eq('id', suggestion.content.training_suggestion_id)
          .maybeSingle();
        
        const tsData = trainingSuggestion as any;
        if (tsData && tsData.suggestion_type === 'qa') {
          const { data: robot } = await supabase.from('robots').select('qa_pairs').eq('id', suggestion.content.robot_id).single();
          if (robot) {
            const existingQA = Array.isArray(robot.qa_pairs) ? robot.qa_pairs : [];
            const parts = (tsData.content as string).split('|').map((s: string) => s.trim());
            const question = parts[0]?.replace(/^Pergunta:\s*/i, '') || tsData.title;
            const answer = parts[1]?.replace(/^Resposta:\s*/i, '') || tsData.content;
            await supabase.from('robots').update({ qa_pairs: [...existingQA, { question, answer }] }).eq('id', suggestion.content.robot_id);
          }
        }
        await supabase.from('robot_training_suggestions' as any).update({
          status: 'approved', reviewed_by: authData.user.id, reviewed_at: new Date().toISOString(), applied_at: new Date().toISOString(),
        }).eq('id', suggestion.content.training_suggestion_id);
      } else if (suggestion.category === 'agent_goals') {
        await supabase.from('agent_goals' as any).insert({
          agent_id: suggestion.content.agent_id,
          agent_name: suggestion.content.agent_name,
          metric: suggestion.content.metric,
          current_value: suggestion.content.current_value,
          suggested_value: suggestion.content.suggested_value,
          status: 'approved',
          decided_at: new Date().toISOString(),
          decided_by: authData.user.id,
          suggestion_id: suggestion.id,
        });
      } else if (suggestion.category === 'report_schedule') {
        await supabase.from('report_schedule').insert({
          schedule_type: 'brain_report',
          day_of_week: suggestion.content.day_of_week,
          hour_of_day: suggestion.content.hour_of_day,
          is_active: true,
        });
      } else if ((suggestion.category === 'aprendizado_humano' || suggestion.category === 'aprendizado_robo') && suggestion.content?.robot_id) {
        // If there's a robot_id and proposed Q&A, apply it
        if (suggestion.content.proposed_action?.toLowerCase().includes('q&a') || suggestion.content.proposed_action?.toLowerCase().includes('qa')) {
          const { data: robot } = await supabase.from('robots').select('qa_pairs').eq('id', suggestion.content.robot_id).single();
          if (robot && suggestion.content.examples?.length > 0) {
            const existingQA = Array.isArray(robot.qa_pairs) ? robot.qa_pairs : [];
            // The proposed action describes what to add
            await supabase.from('robots').update({
              qa_pairs: [...existingQA, { id: crypto.randomUUID(), question: suggestion.title, answer: suggestion.content.proposed_action }]
            }).eq('id', suggestion.content.robot_id);
          }
        }
      } else if (suggestion.category === 'melhoria_instrucao' && suggestion.content?.robot_id) {
        // Schedule instruction change for 04:00 UTC (01h BRT)
        const now = new Date();
        const scheduledFor = new Date(now);
        scheduledFor.setUTCHours(4, 0, 0, 0);
        if (scheduledFor <= now) scheduledFor.setDate(scheduledFor.getDate() + 1);

        await supabase.from('robot_change_schedule' as any).insert({
          robot_id: suggestion.content.robot_id,
          suggestion_id: suggestion.id,
          current_instruction: suggestion.content.current_instruction || '',
          new_instruction: suggestion.content.proposed_instruction || '',
          affected_section: suggestion.content.affected_section || 'Geral',
          scheduled_for: scheduledFor.toISOString(),
          status: 'pending',
        });
        toast.info(`Alteração agendada para ${scheduledFor.toLocaleString('pt-BR')} (fora do pico de atendimento)`);
      }

      await supabase.from('delma_suggestions' as any).update({
        status: 'approved', decided_by: authData.user.id, decided_at: new Date().toISOString(),
      }).eq('id', suggestion.id);

      await supabase.from('delma_memory' as any).insert({
        type: 'manager_feedback',
        source: suggestion.category,
        content: { suggestion_id: suggestion.id, action: 'approved', title: suggestion.title, category: suggestion.category, ...suggestion.content },
        weight: 1.0,
        related_suggestion_id: suggestion.id,
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      });

      toast.success('Sugestão aprovada e aplicada!');
      loadSuggestions();
    } catch (e: any) {
      toast.error('Erro ao aprovar: ' + (e.message || 'Erro desconhecido'));
    } finally {
      setApplyingId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectingSuggestion) return;
    setApplyingId(rejectingSuggestion.id);
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) throw new Error('Não autenticado');

      await supabase.from('delma_suggestions' as any).update({
        status: 'rejected', reject_reason: rejectReason || null, decided_by: authData.user.id, decided_at: new Date().toISOString(),
      }).eq('id', rejectingSuggestion.id);

      const { data: prevRejections } = await supabase
        .from('delma_memory' as any)
        .select('id, weight')
        .eq('type', 'manager_feedback')
        .eq('source', rejectingSuggestion.category)
        .order('created_at', { ascending: false })
        .limit(2);

      const consecutiveRejections = (prevRejections || []).filter((m: any) => m.weight <= 0.3).length;
      const newWeight = consecutiveRejections >= 1 ? 0.1 : 0.3;

      await supabase.from('delma_memory' as any).insert({
        type: 'manager_feedback',
        source: rejectingSuggestion.category,
        content: {
          suggestion_id: rejectingSuggestion.id,
          action: 'rejected',
          title: rejectingSuggestion.title,
          reason: rejectReason || null,
          category: rejectingSuggestion.category,
          ...rejectingSuggestion.content,
        },
        weight: newWeight,
        related_suggestion_id: rejectingSuggestion.id,
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      });

      toast.success('Sugestão rejeitada. Feedback registrado.');
      setRejectDialogOpen(false);
      setRejectReason('');
      setRejectingSuggestion(null);
      loadSuggestions();
    } catch (e: any) {
      toast.error('Erro ao rejeitar: ' + (e.message || 'Erro desconhecido'));
    } finally {
      setApplyingId(null);
    }
  };

  const handleEditAndApprove = async () => {
    if (!editingSuggestion) return;
    setApplyingId(editingSuggestion.id);
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) throw new Error('Não autenticado');

      await supabase.from('delma_suggestions' as any).update({
        status: 'edited',
        content: { ...editingSuggestion.content, edited_content: editedContent },
        decided_by: authData.user.id,
        decided_at: new Date().toISOString(),
      }).eq('id', editingSuggestion.id);

      await supabase.from('delma_memory' as any).insert({
        type: 'manager_feedback',
        source: editingSuggestion.category,
        content: { suggestion_id: editingSuggestion.id, action: 'edited', title: editingSuggestion.title, edited_content: editedContent },
        weight: 0.8,
        related_suggestion_id: editingSuggestion.id,
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      });

      toast.success('Sugestão editada e aprovada!');
      setEditDialogOpen(false);
      setEditedContent('');
      setEditingSuggestion(null);
      loadSuggestions();
    } catch (e: any) {
      toast.error('Erro: ' + (e.message || 'Erro desconhecido'));
    } finally {
      setApplyingId(null);
    }
  };

  // Filter out report_schedule — those go to the AI Report tab
  const visibleSuggestions = suggestions.filter(s => s.category !== 'report_schedule');
  const filteredSuggestions = filterCategory === 'all' ? visibleSuggestions : visibleSuggestions.filter(s => s.category === filterCategory);
  const pending = filteredSuggestions.filter(s => s.status === 'pending');
  const processed = filteredSuggestions.filter(s => s.status !== 'pending');

  // Mini-card counts (from all suggestions, not filtered)
  const humanPatterns = suggestions.filter(s => s.category === 'aprendizado_humano').length;
  const robotPatterns = suggestions.filter(s => s.category === 'aprendizado_robo').length;
  const appliedImprovements = suggestions.filter(s => s.status === 'approved' || s.status === 'edited').length;

  const getConfidenceColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-warning';
    return 'text-muted-foreground';
  };

  const isLearningType = (category: string) => ['aprendizado_humano', 'aprendizado_robo', 'melhoria_delma', 'melhoria_instrucao'].includes(category);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Central de Sugestões da Delma
              </CardTitle>
              <CardDescription>
                Sugestões fundamentadas em dados — nenhuma ação é executada sem sua aprovação
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" onClick={triggerConversationAnalysis} disabled={analyzingConversations} className="gap-2" size="sm">
                {analyzingConversations ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                {analyzingConversations ? 'Analisando...' : 'Analisar Conversas'}
              </Button>
              <Button variant="outline" onClick={triggerInstructionAnalysis} disabled={analyzingInstructions} className="gap-2" size="sm">
                {analyzingInstructions ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                {analyzingInstructions ? 'Analisando...' : 'Analisar Instruções'}
              </Button>
              <Button onClick={triggerAnalysis} disabled={generating} className="gap-2" size="sm">
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                {generating ? 'Analisando...' : 'Executar Análise'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Flow Health Indicator + Diagnostics */}
          {lastRunAt && (
            <div className={cn("mb-4 p-3 rounded-lg border text-sm", 
              flowHealth === 'green' ? 'bg-success/5 border-success/20' :
              flowHealth === 'yellow' ? 'bg-warning/5 border-warning/20' :
              'bg-destructive/5 border-destructive/20'
            )}>
              <div className="flex items-center gap-2 mb-1">
                <Activity className={cn("w-4 h-4", 
                  flowHealth === 'green' ? 'text-success' : flowHealth === 'yellow' ? 'text-warning' : 'text-destructive'
                )} />
                <span className="font-medium">
                  {flowHealth === 'green' ? '🟢 Fluxo saudável' : flowHealth === 'yellow' ? '🟡 Fluxo em alerta' : '🔴 Fluxo com erro'}
                </span>
                <span className="text-xs text-muted-foreground ml-auto">
                  Última execução: {new Date(lastRunAt).toLocaleString('pt-BR')}
                </span>
              </div>
              {lastDiagnostics && (
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors">
                    <ChevronRight className="w-3 h-3" /> Ver diagnóstico detalhado
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 p-2 rounded bg-secondary/30 text-xs text-muted-foreground space-y-0.5 font-mono">
                    {lastDiagnostics.total_finalizadas_7d !== undefined && <p>📋 Conversas finalizadas (7 dias): {lastDiagnostics.total_finalizadas_7d}</p>}
                    {lastDiagnostics.do_suporte !== undefined && <p>✅ Conversas do Suporte: {lastDiagnostics.do_suporte}</p>}
                    {lastDiagnostics.excluidas_comercial !== undefined && <p>🔒 Excluídas (Comercial/SDR): {lastDiagnostics.excluidas_comercial}</p>}
                    {lastDiagnostics.human_logs_found !== undefined && <p>👤 Logs humanos: {lastDiagnostics.human_logs_found}</p>}
                    {lastDiagnostics.robot_logs_found !== undefined && <p>🤖 Logs robôs: {lastDiagnostics.robot_logs_found}</p>}
                    {lastDiagnostics.total_processable !== undefined && <p>⚙️ Processáveis (≥2 msgs): {lastDiagnostics.total_processable}</p>}
                    {lastDiagnostics.attempts_used !== undefined && <p>🔄 Tentativas usadas: {lastDiagnostics.attempts_used}</p>}
                    {lastDiagnostics.raw_suggestions !== undefined && <p>💡 Sugestões brutas: {lastDiagnostics.raw_suggestions}</p>}
                    {lastDiagnostics.filtered !== undefined && <p>✂️ Após deduplicação: {lastDiagnostics.filtered}</p>}
                    {lastDiagnostics.inserted !== undefined && <p>✅ Inseridas: {lastDiagnostics.inserted}</p>}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          )}
          {/* Mini-cards: learning origin indicators */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/15">
              <Users className="w-5 h-5 text-blue-500 shrink-0" />
              <div>
                <p className="text-lg font-bold">{humanPatterns}</p>
                <p className="text-[10px] text-muted-foreground">Padrões humanos</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-purple-500/5 border border-purple-500/15">
              <Bot className="w-5 h-5 text-purple-500 shrink-0" />
              <div>
                <p className="text-lg font-bold">{robotPatterns}</p>
                <p className="text-[10px] text-muted-foreground">Padrões robôs</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-success/5 border border-success/15">
              <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
              <div>
                <p className="text-lg font-bold">{appliedImprovements}</p>
                <p className="text-[10px] text-muted-foreground">Melhorias aplicadas</p>
              </div>
            </div>
          </div>

          {/* Filter by category */}
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[200px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                <SelectItem value="robot_training">Treinamento de Robô</SelectItem>
                <SelectItem value="agent_goals">Meta de Atendente</SelectItem>
                <SelectItem value="aprendizado_humano">Aprendizado Humano</SelectItem>
                <SelectItem value="aprendizado_robo">Aprendizado Robô</SelectItem>
                <SelectItem value="melhoria_delma">Melhoria Delma</SelectItem>
                <SelectItem value="melhoria_instrucao">Melhoria de Instrução</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-28 rounded-lg animate-pulse bg-muted/30" />
              ))}
            </div>
          ) : pending.length === 0 && processed.length === 0 ? (
            <div className="text-center py-12">
              <Sparkles className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">Nenhuma sugestão ainda.</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Clique em "Analisar Conversas" para a Delma aprender com atendentes e robôs.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Pending suggestions */}
              {pending.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-warning" />
                    Aguardando Aprovação ({pending.length})
                  </h3>
                  {pending.map(s => {
                    const config = categoryConfig[s.category] || categoryConfig.robot_training;
                    const CategoryIcon = config.icon;
                    const isLearning = isLearningType(s.category);
                    return (
                      <Card key={s.id} className="border-border/60">
                        <CardContent className="pt-4 pb-4">
                          <div className="flex items-start gap-3">
                            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border", config.color)}>
                              <CategoryIcon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium">{s.title}</span>
                                <Badge variant="outline" className={cn("text-[10px] border", config.color)}>{config.label}</Badge>
                                <span className={cn("text-xs font-mono font-bold", getConfidenceColor(s.confidence_score))}>
                                  {s.confidence_score}%
                                 </span>
                                {s.content?.awaiting_attention && (
                                  <Badge className="text-[10px] bg-orange-500/15 text-orange-500 border-orange-500/20">⏳ Aguardando atenção</Badge>
                                )}
                                {isLearning && s.content?.agent_alias && (
                                  <Badge variant="secondary" className="text-[10px]">👤 {s.content.agent_alias}</Badge>
                                )}
                                {isLearning && s.content?.robot_name && (
                                  <Badge variant="secondary" className="text-[10px]">🤖 {s.content.robot_name}</Badge>
                                )}
                              </div>

                              {/* Impact Score Bar */}
                              {s.content?.impact_score > 0 && (
                                <div className="mt-2">
                                  <ImpactBar score={s.content.impact_score} />
                                  {s.content?.estimated_impact && (
                                    <p className="text-[10px] text-muted-foreground mt-0.5 italic">{s.content.estimated_impact}</p>
                                  )}
                                  <Collapsible>
                                    <CollapsibleTrigger className="flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary mt-1 transition-colors">
                                      <Info className="w-2.5 h-2.5" />
                                      Por que este score?
                                    </CollapsibleTrigger>
                                    <CollapsibleContent className="mt-1 p-2 rounded bg-secondary/30 text-[10px] text-muted-foreground space-y-0.5">
                                      <p>📊 Volume: {s.content?.impact_breakdown?.volume_weight || 0}/100 (peso 35%)</p>
                                      <p>⏱️ Redução TMA: {s.content?.impact_breakdown?.tma_reduction || 0}/100 (peso 25%)</p>
                                      <p>🔁 Recorrência: {s.content?.impact_breakdown?.recurrence || 0}/100 (peso 20%)</p>
                                      <p>🔥 Urgência: {s.content?.impact_breakdown?.urgency || 0}/100 (peso 20%)</p>
                                      {s.content?.data_window && <p>📅 Janela: {s.content.data_window}</p>}
                                      {s.content?.conversation_count > 0 && <p>💬 {s.content.conversation_count} conversas analisadas</p>}
                                      {s.content?.recurrence_pattern && <p>📈 Padrão: {s.content.recurrence_pattern}</p>}
                                    </CollapsibleContent>
                                  </Collapsible>
                                </div>
                              )}

                              {/* Justification */}
                              <p className="text-sm text-muted-foreground mt-2">{s.justification}</p>
                              
                              {/* Expanded details for learning types */}
                              {isLearning && s.category !== 'melhoria_instrucao' && (
                                <Collapsible>
                                  <CollapsibleTrigger className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary mt-2 transition-colors">
                                    <ChevronRight className="w-3 h-3" />
                                    Ver detalhes da sugestão
                                  </CollapsibleTrigger>
                                  <CollapsibleContent className="mt-2 space-y-3 pl-2 border-l-2 border-primary/20">
                                    {/* Pattern */}
                                    {s.content?.pattern && (
                                      <div>
                                        <p className="text-xs font-semibold text-foreground mb-1">📊 Padrão identificado</p>
                                        <p className="text-xs text-muted-foreground">{s.content.pattern}</p>
                                      </div>
                                    )}
                                    {/* Examples */}
                                    {s.content?.examples?.length > 0 && (
                                      <div>
                                        <p className="text-xs font-semibold text-foreground mb-1">💬 Exemplos de conversas</p>
                                        <div className="space-y-1">
                                          {s.content.examples.slice(0, 3).map((ex: string, i: number) => (
                                            <p key={i} className="text-xs text-muted-foreground italic bg-secondary/30 p-2 rounded">"{ex}"</p>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {/* Proposed action */}
                                    {s.content?.proposed_action && (
                                      <div>
                                        <p className="text-xs font-semibold text-foreground mb-1">✅ O que muda se aprovado</p>
                                        <p className="text-xs text-muted-foreground">{s.content.proposed_action}</p>
                                      </div>
                                    )}
                                  </CollapsibleContent>
                                </Collapsible>
                              )}

                              {/* Instruction diff for melhoria_instrucao */}
                              {s.category === 'melhoria_instrucao' && (
                                <div className="mt-3 space-y-2">
                                  {s.content?.affected_section && (
                                    <Badge variant="outline" className="text-[10px]">📌 Seção: {s.content.affected_section}</Badge>
                                  )}
                                  {s.content?.compliance_status && (
                                    <Badge variant="outline" className={cn("text-[10px] ml-1",
                                      s.content.compliance_status === 'aligned' ? 'border-success/30 text-success' :
                                      s.content.compliance_status === 'review' ? 'border-warning/30 text-warning' :
                                      'border-destructive/30 text-destructive'
                                    )}>
                                      {s.content.compliance_status === 'aligned' ? '✅ Alinhado' :
                                       s.content.compliance_status === 'review' ? '⚠️ Revisar' : '❌ Conflito'}
                                    </Badge>
                                  )}
                                  {s.content?.compliance_notes && (
                                    <p className="text-xs text-warning italic mt-1">⚠️ {s.content.compliance_notes}</p>
                                  )}
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                                    <div className="rounded-lg border border-border/50 p-3 bg-secondary/20">
                                      <p className="text-[10px] font-semibold text-muted-foreground mb-1">📄 INSTRUÇÃO ATUAL</p>
                                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">{s.content?.current_instruction || '(sem instrução atual)'}</p>
                                    </div>
                                    <div className="rounded-lg border border-success/30 p-3 bg-success/5">
                                      <p className="text-[10px] font-semibold text-success mb-1">✨ INSTRUÇÃO PROPOSTA</p>
                                      <p className="text-xs text-foreground whitespace-pre-wrap">{s.content?.proposed_instruction || '(sem proposta)'}</p>
                                    </div>
                                  </div>
                                  {s.content?.examples?.length > 0 && (
                                    <Collapsible>
                                      <CollapsibleTrigger className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary mt-1 transition-colors">
                                        <ChevronRight className="w-3 h-3" />
                                        Ver conversas que embasam
                                      </CollapsibleTrigger>
                                      <CollapsibleContent className="mt-1 space-y-1">
                                        {s.content.examples.slice(0, 3).map((ex: string, i: number) => (
                                          <p key={i} className="text-xs text-muted-foreground italic bg-secondary/30 p-2 rounded">"{ex}"</p>
                                        ))}
                                      </CollapsibleContent>
                                    </Collapsible>
                                  )}
                                </div>
                              )}

                              {/* Memories used */}
                              {s.memories_used && s.memories_used.length > 0 && (
                                <Collapsible>
                                  <CollapsibleTrigger className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary mt-2 transition-colors">
                                    <ChevronRight className="w-3 h-3" />
                                    {s.memories_used.length} memória{s.memories_used.length !== 1 ? 's' : ''} utilizada{s.memories_used.length !== 1 ? 's' : ''}
                                  </CollapsibleTrigger>
                                  <CollapsibleContent className="mt-1.5">
                                    <div className="space-y-1 pl-4 border-l-2 border-primary/20">
                                      {s.memories_used.map((m: any, idx: number) => (
                                        <div key={idx} className="text-xs text-muted-foreground">
                                          <span className="font-mono">peso: {m.weight}</span> — {m.source}
                                        </div>
                                      ))}
                                    </div>
                                  </CollapsibleContent>
                                </Collapsible>
                              )}

                              <div className="flex items-center gap-2 mt-3">
                                {s.category === 'melhoria_instrucao' ? (
                                  <>
                                    <Button
                                      size="sm"
                                      onClick={() => handleApprove(s)}
                                      disabled={applyingId === s.id}
                                      className="gap-1"
                                    >
                                      {applyingId === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarClock className="w-3 h-3" />}
                                      Aprovar e Agendar
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setEditingSuggestion(s);
                                        setEditedContent(s.content?.proposed_instruction || '');
                                        setEditDialogOpen(true);
                                      }}
                                      disabled={applyingId === s.id}
                                      className="gap-1"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                      Editar e Agendar
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setRejectingSuggestion(s);
                                        setRejectReason('');
                                        setRejectDialogOpen(true);
                                      }}
                                      disabled={applyingId === s.id}
                                      className="gap-1 text-destructive hover:text-destructive"
                                    >
                                      <ThumbsDown className="w-3 h-3" />
                                      Rejeitar
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      size="sm"
                                      onClick={() => handleApprove(s)}
                                      disabled={applyingId === s.id}
                                      className="gap-1"
                                    >
                                      {applyingId === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsUp className="w-3 h-3" />}
                                      Aprovar
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setEditingSuggestion(s);
                                        setEditedContent(JSON.stringify(s.content, null, 2));
                                        setEditDialogOpen(true);
                                      }}
                                      disabled={applyingId === s.id}
                                      className="gap-1"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                      Editar e Aprovar
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setRejectingSuggestion(s);
                                        setRejectReason('');
                                        setRejectDialogOpen(true);
                                      }}
                                      disabled={applyingId === s.id}
                                      className="gap-1 text-destructive hover:text-destructive"
                                    >
                                      <ThumbsDown className="w-3 h-3" />
                                      Rejeitar
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              {/* Processed history */}
              {processed.length > 0 && (
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full py-2">
                    <ChevronRight className="w-4 h-4" />
                    Histórico ({processed.length} sugestões processadas)
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-2 mt-2">
                    {processed.map(s => {
                      const config = categoryConfig[s.category] || categoryConfig.robot_training;
                      return (
                        <Card key={s.id} className={cn("opacity-70", s.status === 'approved' || s.status === 'edited' ? 'border-success/20' : 'border-destructive/20')}>
                          <CardContent className="pt-3 pb-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              {s.status === 'approved' || s.status === 'edited' ? (
                                <CheckCircle2 className="w-4 h-4 text-success" />
                              ) : (
                                <XCircle className="w-4 h-4 text-destructive" />
                              )}
                              <span className="text-sm">{s.title}</span>
                              <Badge variant="outline" className="text-[10px]">{config.label}</Badge>
                              <Badge variant={s.status === 'rejected' ? 'secondary' : 'default'} className="text-[10px]">
                                {s.status === 'approved' ? 'Aprovado' : s.status === 'edited' ? 'Editado' : 'Rejeitado'}
                              </Badge>
                              {s.reject_reason && (
                                <span className="text-xs text-muted-foreground italic">— {s.reject_reason}</span>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar Sugestão</DialogTitle>
            <DialogDescription>
              {rejectingSuggestion?.title}
            </DialogDescription>
          </DialogHeader>
          <div>
            <p className="text-sm text-muted-foreground mb-2">Por que você está rejeitando? (opcional, mas ajuda a Delma a melhorar)</p>
            <Textarea
              placeholder="Motivo da rejeição..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
            <p className="text-xs text-muted-foreground mt-2">
              Esse feedback ajuda a Delma a calibrar futuras sugestões. Se um tema for rejeitado 2x seguidas, a Delma para de sugerir.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectDialogOpen(false); setRejectingSuggestion(null); }}>Cancelar</Button>
            <Button variant="destructive" onClick={handleReject} disabled={!!applyingId} className="gap-1">
              {applyingId ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsDown className="w-3 h-3" />}
              Confirmar Rejeição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar e Aprovar</DialogTitle>
            <DialogDescription>
              {editingSuggestion?.title}
            </DialogDescription>
          </DialogHeader>
          <div>
            <p className="text-sm text-muted-foreground mb-2">Edite o conteúdo antes de aprovar:</p>
            <Textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              rows={6}
              className="font-mono text-xs"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditDialogOpen(false); setEditingSuggestion(null); }}>Cancelar</Button>
            <Button onClick={handleEditAndApprove} disabled={!!applyingId} className="gap-1">
              {applyingId ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              Salvar e Aprovar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
