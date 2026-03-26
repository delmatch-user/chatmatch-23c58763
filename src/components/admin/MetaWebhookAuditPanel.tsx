import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, Search, Activity, CheckCircle2, XCircle, AlertTriangle, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AuditEntry {
  id: string;
  received_at: string;
  from_phone: string | null;
  phone_number_id_payload: string | null;
  wamid: string | null;
  event_kind: string;
  decision: string;
  reason: string | null;
  connection_id: string | null;
  conversation_id: string | null;
  contact_id: string | null;
}

const decisionLabels: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  processed_queue: { label: 'Fila', color: 'bg-green-500/10 text-green-600 border-green-500/30', icon: <CheckCircle2 className="w-3 h-3" /> },
  processed_robot: { label: 'Robô', color: 'bg-blue-500/10 text-blue-600 border-blue-500/30', icon: <CheckCircle2 className="w-3 h-3" /> },
  processed_existing: { label: 'Existente', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30', icon: <CheckCircle2 className="w-3 h-3" /> },
  skipped_duplicate: { label: 'Duplicada', color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30', icon: <AlertTriangle className="w-3 h-3" /> },
  skipped_no_connection: { label: 'Sem conexão', color: 'bg-red-500/10 text-red-600 border-red-500/30', icon: <XCircle className="w-3 h-3" /> },
  skipped_no_department: { label: 'Sem dept', color: 'bg-red-500/10 text-red-600 border-red-500/30', icon: <XCircle className="w-3 h-3" /> },
  skipped_empty: { label: 'Vazio', color: 'bg-muted text-muted-foreground', icon: <Clock className="w-3 h-3" /> },
  error_contact: { label: 'Erro contato', color: 'bg-destructive/10 text-destructive border-destructive/30', icon: <XCircle className="w-3 h-3" /> },
  error_conversation: { label: 'Erro conversa', color: 'bg-destructive/10 text-destructive border-destructive/30', icon: <XCircle className="w-3 h-3" /> },
  error_message_insert: { label: 'Erro msg', color: 'bg-destructive/10 text-destructive border-destructive/30', icon: <XCircle className="w-3 h-3" /> },
};

export default function MetaWebhookAuditPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [phoneFilter, setPhoneFilter] = useState('');
  const [decisionFilter, setDecisionFilter] = useState<string>('all');

  const fetchAudit = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('meta_webhook_audit')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(50);

      if (phoneFilter.trim()) {
        query = query.ilike('from_phone', `%${phoneFilter.trim()}%`);
      }
      if (decisionFilter && decisionFilter !== 'all') {
        query = query.eq('decision', decisionFilter);
      }

      const { data, error } = await query;
      if (!error && data) {
        setEntries(data as AuditEntry[]);
      }
    } catch (e) {
      console.error('Erro ao buscar auditoria:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAudit();
  }, []);

  const handleSearch = () => {
    fetchAudit();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Diagnóstico API Oficial
          </CardTitle>
          <Button variant="outline" size="sm" onClick={fetchAudit} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Últimos eventos recebidos pelo webhook da Meta — mostra por que cada mensagem caiu ou não na fila.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <div className="flex-1 min-w-[140px]">
            <Input
              placeholder="Filtrar por telefone..."
              value={phoneFilter}
              onChange={(e) => setPhoneFilter(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <Select value={decisionFilter} onValueChange={setDecisionFilter}>
            <SelectTrigger className="w-[160px] h-8 text-sm">
              <SelectValue placeholder="Decisão" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="processed_queue">✅ Fila</SelectItem>
              <SelectItem value="processed_robot">🤖 Robô</SelectItem>
              <SelectItem value="processed_existing">📋 Existente</SelectItem>
              <SelectItem value="skipped_duplicate">⚠️ Duplicada</SelectItem>
              <SelectItem value="skipped_no_connection">❌ Sem conexão</SelectItem>
              <SelectItem value="error_contact">❌ Erro contato</SelectItem>
              <SelectItem value="error_conversation">❌ Erro conversa</SelectItem>
              <SelectItem value="error_message_insert">❌ Erro msg</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="secondary" size="sm" onClick={handleSearch} className="h-8">
            <Search className="w-4 h-4" />
          </Button>
        </div>

        {/* Entries */}
        {entries.length === 0 && !loading && (
          <div className="text-center py-6 text-muted-foreground text-sm">
            Nenhum evento registrado ainda. Envie uma mensagem para o número da API Oficial para ver o diagnóstico aqui.
          </div>
        )}

        <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
          {entries.map((entry) => {
            const decInfo = decisionLabels[entry.decision] || {
              label: entry.decision,
              color: 'bg-muted text-muted-foreground',
              icon: <Clock className="w-3 h-3" />,
            };

            return (
              <div
                key={entry.id}
                className="flex items-start gap-2 p-2 rounded-md bg-secondary/30 hover:bg-secondary/50 transition-colors text-sm"
              >
                <div className="shrink-0 mt-0.5">
                  <Badge variant="outline" className={`gap-1 text-[10px] px-1.5 py-0 ${decInfo.color}`}>
                    {decInfo.icon}
                    {decInfo.label}
                  </Badge>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-foreground">
                      {entry.from_phone || '—'}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(entry.received_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                    </span>
                  </div>
                  {entry.reason && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {entry.reason}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
