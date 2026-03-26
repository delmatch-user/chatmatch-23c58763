import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, Search, Activity, CheckCircle2, XCircle, AlertTriangle, Clock, Stethoscope, Wrench, ShieldCheck, ShieldAlert, Wifi, WifiOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

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
  field: string | null;
  entry_id: string | null;
  signature_valid: boolean | null;
  is_test: boolean;
}

interface DiagnosisResult {
  connection_found: boolean;
  connection_name?: string;
  connection_status?: string;
  phone_number_id?: string;
  waba_id?: string;
  has_token?: boolean;
  token_source?: string;
  token_valid?: boolean;
  token_error?: string;
  phone_number_info?: any;
  waba_subscribed_apps?: any;
  waba_subscription_ok?: boolean;
  last_real_event?: any;
  last_webhook_received?: any;
  app_secret_configured?: boolean;
  app_secret_prefix?: string;
  repair_result?: any;
}

const decisionLabels: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  webhook_received: { label: 'Recebido', color: 'bg-blue-500/10 text-blue-600 border-blue-500/30', icon: <Wifi className="w-3 h-3" /> },
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
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [repairing, setRepairing] = useState(false);

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

  const runDiagnosis = async (repair = false) => {
    if (repair) setRepairing(true);
    else setDiagnosing(true);

    try {
      const { data, error } = await supabase.functions.invoke('meta-webhook-diagnose', {
        body: { repair },
      });

      if (error) throw error;
      if (data?.diagnosis) {
        setDiagnosis(data.diagnosis);
        if (repair && data.diagnosis.repair_result?.success) {
          toast.success('Inscrição reparada com sucesso!');
        } else if (repair) {
          toast.error('Falha ao reparar inscrição');
        }
      }
    } catch (e: any) {
      console.error('Erro no diagnóstico:', e);
      toast.error('Erro ao executar diagnóstico: ' + (e.message || ''));
    } finally {
      setDiagnosing(false);
      setRepairing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Health Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-primary" />
              Saúde do Webhook
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => runDiagnosis(false)} disabled={diagnosing}>
                <Stethoscope className={`w-4 h-4 mr-1 ${diagnosing ? 'animate-spin' : ''}`} />
                Diagnosticar
              </Button>
              <Button variant="outline" size="sm" onClick={() => runDiagnosis(true)} disabled={repairing}>
                <Wrench className={`w-4 h-4 mr-1 ${repairing ? 'animate-spin' : ''}`} />
                Reparar Inscrição
              </Button>
            </div>
          </div>
        </CardHeader>
        {diagnosis && (
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Connection */}
              <div className="p-3 rounded-lg bg-secondary/30 space-y-1">
                <div className="text-[10px] text-muted-foreground uppercase font-medium">Conexão</div>
                <div className="flex items-center gap-1.5">
                  {diagnosis.connection_found ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                  <span className="text-sm font-medium">{diagnosis.connection_name || 'Não encontrada'}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">{diagnosis.connection_status}</div>
              </div>

              {/* Token */}
              <div className="p-3 rounded-lg bg-secondary/30 space-y-1">
                <div className="text-[10px] text-muted-foreground uppercase font-medium">Token</div>
                <div className="flex items-center gap-1.5">
                  {diagnosis.token_valid ? (
                    <ShieldCheck className="w-4 h-4 text-green-500" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 text-red-500" />
                  )}
                  <span className="text-sm font-medium">{diagnosis.token_valid ? 'Válido' : 'Inválido'}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">Fonte: {diagnosis.token_source}</div>
              </div>

              {/* WABA Subscription */}
              <div className="p-3 rounded-lg bg-secondary/30 space-y-1">
                <div className="text-[10px] text-muted-foreground uppercase font-medium">Inscrição WABA</div>
                <div className="flex items-center gap-1.5">
                  {diagnosis.waba_subscription_ok ? (
                    <Wifi className="w-4 h-4 text-green-500" />
                  ) : (
                    <WifiOff className="w-4 h-4 text-red-500" />
                  )}
                  <span className="text-sm font-medium">{diagnosis.waba_subscription_ok ? 'Ativa' : 'Inativa'}</span>
                </div>
                {diagnosis.repair_result && (
                  <div className="text-[10px] text-muted-foreground">
                    Reparo: {diagnosis.repair_result.success ? '✅' : '❌'}
                  </div>
                )}
              </div>

              {/* Last Real Event */}
              <div className="p-3 rounded-lg bg-secondary/30 space-y-1">
                <div className="text-[10px] text-muted-foreground uppercase font-medium">Último evento real</div>
                <div className="flex items-center gap-1.5">
                  {diagnosis.last_webhook_received ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : (
                    <Clock className="w-4 h-4 text-yellow-500" />
                  )}
                  <span className="text-sm font-medium">
                    {diagnosis.last_webhook_received
                      ? formatDistanceToNow(new Date(diagnosis.last_webhook_received.received_at), { addSuffix: true, locale: ptBR })
                      : 'Nenhum'}
                  </span>
                </div>
                {diagnosis.last_webhook_received?.signature_valid === false && (
                  <div className="text-[10px] text-red-500">⚠️ Assinatura inválida</div>
                )}
              </div>
            </div>

            {/* Phone number info */}
            {diagnosis.phone_number_info && !diagnosis.phone_number_info.error && (
              <div className="p-2 rounded bg-secondary/20 text-xs flex gap-4">
                <span>📱 {diagnosis.phone_number_info.display_phone_number}</span>
                <span>✅ {diagnosis.phone_number_info.verified_name}</span>
                <span>⭐ {diagnosis.phone_number_info.quality_rating}</span>
              </div>
            )}
            {diagnosis.phone_number_info?.error && (
              <div className="p-2 rounded bg-destructive/10 text-xs text-destructive">
                ❌ Token error: {diagnosis.phone_number_info.error}
              </div>
            )}
            {diagnosis.app_secret_configured === false && (
              <div className="p-2 rounded bg-yellow-500/10 text-xs text-yellow-600">
                ⚠️ META_WHATSAPP_APP_SECRET não está configurado — assinaturas não serão verificadas
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Audit Log */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Log de Eventos
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
                <SelectItem value="webhook_received">📡 Recebido</SelectItem>
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
                      {entry.signature_valid === false && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 bg-red-500/10 text-red-500 border-red-500/30">
                          sig ✗
                        </Badge>
                      )}
                      {entry.is_test && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 bg-purple-500/10 text-purple-500 border-purple-500/30">
                          test
                        </Badge>
                      )}
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
    </div>
  );
}
