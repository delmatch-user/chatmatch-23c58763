import { useState, useEffect, useCallback } from 'react';
import { CalendarClock, CheckCircle2, XCircle, Loader2, ThumbsUp, ThumbsDown, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';

export function DelmaReportScheduleSuggestions() {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingSuggestion, setRejectingSuggestion] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('delma_suggestions' as any)
        .select('*')
        .eq('category', 'report_schedule')
        .order('created_at', { ascending: false })
        .limit(20);
      setSuggestions((data as any[]) || []);
    } catch (e) {
      console.error('Error loading report schedule suggestions:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pending = suggestions.filter(s => s.status === 'pending');
  const processed = suggestions.filter(s => s.status !== 'pending');

  if (loading) return null;
  if (suggestions.length === 0) return null;

  const handleApprove = async (s: any) => {
    setApplyingId(s.id);
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) throw new Error('Não autenticado');

      await supabase.from('report_schedule').insert({
        schedule_type: 'brain_report',
        day_of_week: s.content.day_of_week,
        hour_of_day: s.content.hour_of_day,
        is_active: true,
      });

      await supabase.from('delma_suggestions' as any).update({
        status: 'approved', decided_by: authData.user.id, decided_at: new Date().toISOString(),
      }).eq('id', s.id);

      await supabase.from('delma_memory' as any).insert({
        type: 'manager_feedback',
        source: 'report_schedule',
        content: { suggestion_id: s.id, action: 'approved', title: s.title, ...s.content },
        weight: 1.0,
        related_suggestion_id: s.id,
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      });

      toast.success('Agendamento aprovado!');
      load();
    } catch (e: any) {
      toast.error('Erro: ' + (e.message || 'Erro desconhecido'));
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

      await supabase.from('delma_memory' as any).insert({
        type: 'manager_feedback',
        source: 'report_schedule',
        content: { suggestion_id: rejectingSuggestion.id, action: 'rejected', reason: rejectReason || null },
        weight: 0.3,
        related_suggestion_id: rejectingSuggestion.id,
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      });

      toast.success('Sugestão rejeitada.');
      setRejectDialogOpen(false);
      setRejectReason('');
      setRejectingSuggestion(null);
      load();
    } catch (e: any) {
      toast.error('Erro: ' + (e.message || 'Erro desconhecido'));
    } finally {
      setApplyingId(null);
    }
  };

  const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Agendamentos Sugeridos pela Delma
          </CardTitle>
          <CardDescription>Sugestões de relatórios automáticos baseadas em padrões de uso</CardDescription>
        </CardHeader>
        <CardContent>
          {pending.length > 0 && (
            <div className="space-y-2 mb-4">
              {pending.map(s => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-warning/5 border border-warning/20">
                  <div className="flex items-center gap-3 min-w-0">
                    <CalendarClock className="w-5 h-5 text-warning shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{s.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.content?.day_of_week !== undefined ? dayNames[s.content.day_of_week] : ''} às {String(s.content?.hour_of_day || 0).padStart(2, '0')}:00
                      </p>
                      {s.justification && <p className="text-xs text-muted-foreground/70 mt-0.5">{s.justification}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" onClick={() => handleApprove(s)} disabled={applyingId === s.id} className="gap-1">
                      {applyingId === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsUp className="w-3 h-3" />}
                      Aprovar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setRejectingSuggestion(s); setRejectReason(''); setRejectDialogOpen(true); }} disabled={applyingId === s.id} className="gap-1 text-destructive hover:text-destructive">
                      <ThumbsDown className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {processed.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ChevronRight className="w-4 h-4" />
                Histórico ({processed.length})
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 mt-2">
                {processed.map(s => (
                  <div key={s.id} className={cn("flex items-center gap-2 p-2 rounded-lg", s.status === 'approved' || s.status === 'edited' ? 'bg-success/5' : 'bg-destructive/5')}>
                    {s.status === 'approved' || s.status === 'edited' ? <CheckCircle2 className="w-4 h-4 text-success" /> : <XCircle className="w-4 h-4 text-destructive" />}
                    <span className="text-sm">{s.title}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {s.status === 'approved' ? 'Aprovado' : s.status === 'edited' ? 'Editado' : 'Rejeitado'}
                    </Badge>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {pending.length === 0 && processed.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Sem sugestões de agendamento.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar Sugestão de Agendamento</DialogTitle>
            <DialogDescription>{rejectingSuggestion?.title}</DialogDescription>
          </DialogHeader>
          <Textarea placeholder="Motivo da rejeição (opcional)..." value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectDialogOpen(false); setRejectingSuggestion(null); }}>Cancelar</Button>
            <Button variant="destructive" onClick={handleReject} disabled={!!applyingId} className="gap-1">
              {applyingId ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsDown className="w-3 h-3" />}
              Rejeitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
