import { useState, useEffect, useCallback } from 'react';
import { Sparkles, MessageSquare, Users, FileText, Target, CalendarClock, ChevronRight, ChevronDown, CheckCircle2, XCircle, Loader2, Brain, Info, AlertCircle, ThumbsUp, ThumbsDown, Edit3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
};

export function DelmaSuggestionsTab({ onSuggestionsCountChange }: DelmaSuggestionsTabProps) {
  const [suggestions, setSuggestions] = useState<DelmaSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingSuggestion, setRejectingSuggestion] = useState<DelmaSuggestion | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingSuggestion, setEditingSuggestion] = useState<DelmaSuggestion | null>(null);
  const [editedContent, setEditedContent] = useState('');

  const loadSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('delma_suggestions' as any)
        .select('*')
        .order('confidence_score', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      const typed = (data as any[]) || [];
      setSuggestions(typed);
      onSuggestionsCountChange?.(typed.filter(s => s.status === 'pending').length);
    } catch (e) {
      console.error('Error loading suggestions:', e);
    } finally {
      setLoading(false);
    }
  }, [onSuggestionsCountChange]);

  useEffect(() => { loadSuggestions(); }, [loadSuggestions]);

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

  const handleApprove = async (suggestion: DelmaSuggestion) => {
    setApplyingId(suggestion.id);
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) throw new Error('Não autenticado');

      // Execute the action based on category
      if (suggestion.category === 'robot_training' && suggestion.content?.training_suggestion_id) {
        // Approve the linked robot_training_suggestion
        const { data: trainingSuggestion } = await supabase
          .from('robot_training_suggestions' as any)
          .select('*')
          .eq('id', suggestion.content.training_suggestion_id)
          .maybeSingle();
        
        if (trainingSuggestion && trainingSuggestion.suggestion_type === 'qa') {
          const { data: robot } = await supabase.from('robots').select('qa_pairs').eq('id', suggestion.content.robot_id).single();
          if (robot) {
            const existingQA = Array.isArray(robot.qa_pairs) ? robot.qa_pairs : [];
            const parts = trainingSuggestion.content.split('|').map((s: string) => s.trim());
            const question = parts[0]?.replace(/^Pergunta:\s*/i, '') || trainingSuggestion.title;
            const answer = parts[1]?.replace(/^Resposta:\s*/i, '') || trainingSuggestion.content;
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
      }

      // Update suggestion status
      await supabase.from('delma_suggestions' as any).update({
        status: 'approved', decided_by: authData.user.id, decided_at: new Date().toISOString(),
      }).eq('id', suggestion.id);

      // Store approval in memory
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

      // Check consecutive rejections for this category/source
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

      // Update content and approve
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

  const pending = suggestions.filter(s => s.status === 'pending');
  const processed = suggestions.filter(s => s.status !== 'pending');

  const getConfidenceColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-warning';
    return 'text-muted-foreground';
  };

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
            <Button onClick={triggerAnalysis} disabled={generating} className="gap-2">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
              {generating ? 'Analisando...' : 'Executar Análise'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 mb-4">
            <Info className="w-4 h-4 text-primary shrink-0" />
            <p className="text-xs text-muted-foreground">
              A Delma analisa padrões de 3 semanas, detecta oportunidades de metas, relatórios e treinamento, e 
              cita as memórias que embasam cada sugestão. Execução automática: <strong>toda segunda às 7h</strong>.
            </p>
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
              <p className="text-sm text-muted-foreground/70 mt-1">Clique em "Executar Análise" para a Delma identificar oportunidades.</p>
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
                              </div>
                              <p className="text-sm text-muted-foreground mt-2">{s.justification}</p>
                              
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
            <p className="text-sm text-muted-foreground mb-2">Por que você está rejeitando? (opcional)</p>
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
