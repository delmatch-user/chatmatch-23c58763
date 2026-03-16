import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { CheckCircle2, AlertTriangle, Loader2, Link2, Unlink, ExternalLink, Key, Save, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function GoogleOAuthCard() {
  const [oauthStatus, setOauthStatus] = useState<{ google_client_id: boolean; google_client_secret: boolean } | null>(null);
  const [googleAccount, setGoogleAccount] = useState<{ connected: boolean; email?: string; expired?: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [existingValues, setExistingValues] = useState<{ clientId: string; clientSecret: string }>({ clientId: '', clientSecret: '' });

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const [oauthRes, accountRes, valuesRes] = await Promise.all([
        supabase.functions.invoke('manage-ai-keys', { body: { action: 'check_google_oauth' } }),
        supabase.functions.invoke('sdr-google-calendar-oauth', { body: { action: 'status' } }),
        supabase.functions.invoke('manage-ai-keys', { body: { action: 'get_google_oauth' } }),
      ]);
      if (!oauthRes.error && oauthRes.data) setOauthStatus(oauthRes.data);
      if (!accountRes.error && accountRes.data) setGoogleAccount(accountRes.data);
      if (!valuesRes.error && valuesRes.data) {
        const masked = valuesRes.data;
        setExistingValues({ clientId: masked.google_client_id || '', clientSecret: masked.google_client_secret || '' });
        if (masked.google_client_id) setClientId(masked.google_client_id);
        if (masked.google_client_secret) setClientSecret(masked.google_client_secret);
      }
    } catch (e) {
      console.error('Error fetching Google OAuth status:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStatus(); }, []);

  // Listen for OAuth callback
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'google-oauth-callback' && event.data.code) {
        try {
          const { data, error } = await supabase.functions.invoke('sdr-google-calendar-oauth', {
            body: {
              action: 'callback',
              code: event.data.code,
              state: event.data.state,
              redirect_uri: `${window.location.origin}/comercial/google-callback`,
            },
          });
          if (error) throw error;
          if (data?.success) {
            toast.success(`Conta Google conectada: ${data.email}`);
            fetchStatus();
          }
        } catch (e) {
          toast.error('Erro ao conectar conta Google');
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleSaveCredentials = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      toast.error('Preencha ambos os campos');
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-ai-keys', {
        body: {
          action: 'save_google_oauth',
          google_client_id: clientId.trim(),
          google_client_secret: clientSecret.trim(),
        },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success('Credenciais Google salvas com sucesso!');
        fetchStatus();
      } else {
        toast.error(data?.message || 'Erro ao salvar credenciais');
      }
    } catch (e) {
      toast.error('Erro ao salvar credenciais');
    } finally {
      setSaving(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const redirectUri = `${window.location.origin}/comercial/google-callback`;
      const { data, error } = await supabase.functions.invoke('sdr-google-calendar-oauth', {
        body: { action: 'authorize', redirect_uri: redirectUri },
      });
      if (error) throw error;
      if (data?.auth_url) {
        const popup = window.open(data.auth_url, 'google-oauth', 'width=600,height=700');
        if (!popup) {
          toast.error('Popup bloqueado pelo navegador. Permita popups para este site.');
        }
      }
    } catch (e) {
      toast.error('Erro ao iniciar conexão com Google');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const { error } = await supabase.functions.invoke('sdr-google-calendar-oauth', {
        body: { action: 'disconnect' },
      });
      if (error) throw error;
      toast.success('Conta Google desconectada');
      fetchStatus();
    } catch (e) {
      toast.error('Erro ao desconectar conta Google');
    } finally {
      setDisconnecting(false);
    }
  };

  const bothConfigured = oauthStatus?.google_client_id && oauthStatus?.google_client_secret;
  const hasChanges = clientId !== existingValues.clientId || clientSecret !== existingValues.clientSecret;

  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-1 ${bothConfigured && googleAccount?.connected ? 'bg-green-500' : 'bg-muted'}`} />

      <CardHeader className="pb-3 sm:pb-4 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-[#4285f4]/10 flex items-center justify-center shrink-0">
            <Link2 className="w-5 h-5 sm:w-6 sm:h-6 text-[#4285f4]" />
          </div>
          <div>
            <CardTitle className="text-base sm:text-lg">Google OAuth — Reuniões & Calendar</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Credenciais para integração com Google Meet e Calendar
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 sm:space-y-4 px-4 sm:px-6">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Credential form */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Key className="w-3.5 h-3.5 text-muted-foreground" />
                  Google Client ID
                </label>
                <Input
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="000000000000-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com"
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Key className="w-3.5 h-3.5 text-muted-foreground" />
                  Google Client Secret
                </label>
                <div className="relative">
                  <Input
                    type={showSecret ? 'text' : 'password'}
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    placeholder="GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="font-mono text-xs pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                onClick={handleSaveCredentials}
                disabled={saving || !clientId.trim() || !clientSecret.trim() || !hasChanges}
                size="sm"
                className="w-full sm:w-auto"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Salvar Credenciais
              </Button>
            </div>

            {/* Status badges */}
            <div className="space-y-2">
              <SecretStatusRow label="GOOGLE_CLIENT_ID" configured={oauthStatus?.google_client_id ?? false} />
              <SecretStatusRow label="GOOGLE_CLIENT_SECRET" configured={oauthStatus?.google_client_secret ?? false} />
            </div>

            {/* Info if secrets not configured */}
            {!bothConfigured && (
              <div className="p-3 rounded-lg bg-warning/5 border border-warning/20 text-sm text-muted-foreground">
                <p>
                  Preencha os campos acima com as credenciais do Google OAuth para habilitar a integração.
                </p>
                <p className="mt-1">
                  Obtenha as credenciais em{' '}
                  <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
                    Google Cloud Console <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
              </div>
            )}

            {/* Connected account */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-secondary/50">
              <div>
                <span className="text-sm font-medium">Conta Google</span>
                {googleAccount?.connected ? (
                  <p className="text-sm text-muted-foreground">{googleAccount.email}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Não conectada</p>
                )}
              </div>
              <div>
                {googleAccount?.connected ? (
                  <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={disconnecting}>
                    {disconnecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Unlink className="w-4 h-4 mr-2" />}
                    Desconectar
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={handleConnect} disabled={connecting || !bothConfigured}>
                    {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link2 className="w-4 h-4 mr-2" />}
                    Conectar Conta Google
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SecretStatusRow({ label, configured }: { label: string; configured: boolean }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
      <div className="flex items-center gap-2">
        <Key className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium font-mono">{label}</span>
      </div>
      {configured ? (
        <Badge variant="outline" className="bg-success/10 text-success border-success/30 gap-1">
          <CheckCircle2 className="w-3 h-3" />
          Configurado
        </Badge>
      ) : (
        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 gap-1">
          <AlertTriangle className="w-3 h-3" />
          Pendente
        </Badge>
      )}
    </div>
  );
}
