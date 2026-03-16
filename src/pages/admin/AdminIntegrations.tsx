import { useState, useEffect } from 'react';
import { 
  Smartphone, QrCode, RefreshCw, Wifi, WifiOff, Loader2, 
  MessageSquare, Webhook, Settings, Instagram, ExternalLink,
  CheckCircle2, XCircle, AlertCircle, Copy, Eye, EyeOff, Server,
  Activity, Clock, Zap, AlertTriangle, RotateCcw, Building2
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useDepartments } from '@/hooks/useDepartments';
import { useBaileysInstances } from '@/hooks/useBaileysInstances';
import { BaileysInstancesManager } from '@/components/admin/BaileysInstancesManager';
import { supabase } from '@/integrations/supabase/client';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

interface IntegrationStatus {
  qrCode: ConnectionStatus;
  api: ConnectionStatus;
  webhook: { enabled: boolean; url: string };
  instagram: ConnectionStatus;
  machine: { active: boolean };
}

interface WhatsAppConnectionData {
  id?: string;
  connection_type: string;
  phone_number_id: string;
  waba_id: string;
  department_id: string | null;
  verify_token: string | null;
  name: string | null;
  status: string;
  access_token?: string | null;
}

export default function AdminIntegrations() {
  const { departments, isLoading: isLoadingDepts } = useDepartments();
  
  // Hook para gerenciar múltiplas instâncias Baileys
  const baileysInstances = useBaileysInstances();
  
  const [status, setStatus] = useState<IntegrationStatus>({
    qrCode: 'disconnected',
    api: 'disconnected',
    webhook: { enabled: false, url: '' },
    instagram: 'disconnected',
    machine: { active: false }
  });
  const [showApiToken, setShowApiToken] = useState(false);
  const [apiCredentials, setApiCredentials] = useState({
    phoneNumberId: '',
    accessToken: '',
    wabaId: '',
    verifyToken: '',
    departmentId: '',
    name: ''
  });
  const [metaConnectionId, setMetaConnectionId] = useState<string | null>(null);
  const [instagramCredentials, setInstagramCredentials] = useState({
    pageId: '',
    instagramAccountId: '',
    verifyToken: '',
    departmentId: '',
    name: '',
    pageName: ''
  });
  const [instagramConnectionId, setInstagramConnectionId] = useState<string | null>(null);
  const [facebookAppId, setFacebookAppId] = useState('');
  const [fbSdkLoaded, setFbSdkLoaded] = useState(false);
  const [fbLoginLoading, setFbLoginLoading] = useState(false);
  const [fbPages, setFbPages] = useState<Array<{ pageId: string; pageName: string; igAccountId: string }>>([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isSavingConnection, setIsSavingConnection] = useState(false);
  const [isSavingInstagram, setIsSavingInstagram] = useState(false);
  
  // Machine state
  const [machineConfig, setMachineConfig] = useState({
    webhookUrl: '',
    franqueado: '',
    isActive: false,
    departmentId: '',
  });
  const [isSavingMachine, setIsSavingMachine] = useState(false);

  // Carregar conexões existentes (Meta API e Instagram)
  useEffect(() => {
    const loadConnections = async () => {
      const { data: connections } = await supabase
        .from('whatsapp_connections')
        .select('*')
        .in('connection_type', ['meta_api', 'instagram']);
      
      if (connections) {
        // Meta API
        const metaConn = connections.find(c => c.connection_type === 'meta_api');
        if (metaConn) {
          setMetaConnectionId(metaConn.id);
          setApiCredentials(prev => ({
            phoneNumberId: metaConn.phone_number_id,
            // Não sobrescrever valor digitado no form com vazio vindo do banco
            accessToken: metaConn.access_token ?? prev.accessToken,
            wabaId: metaConn.waba_id,
            verifyToken: metaConn.verify_token || '',
            departmentId: metaConn.department_id || '',
            name: metaConn.name || ''
          }));
          if (metaConn.status === 'active' || metaConn.status === 'connected') {
            setStatus(prev => ({ ...prev, api: 'connected' }));
          }
        }
        
        // Instagram
        const igConn = connections.find(c => c.connection_type === 'instagram');
        if (igConn) {
          setInstagramConnectionId(igConn.id);
          setInstagramCredentials({
            pageId: igConn.waba_id,
            instagramAccountId: igConn.phone_number_id,
            verifyToken: igConn.verify_token || '',
            departmentId: igConn.department_id || '',
            name: igConn.name || '',
            pageName: ''
          });
          if (igConn.status === 'active' || igConn.status === 'connected') {
            setStatus(prev => ({ ...prev, instagram: 'connected' }));
          }
        }
      }

      // Machine config
      const { data: wConfig } = await supabase
        .from('webhook_config')
        .select('*')
        .maybeSingle();
      
      if (wConfig) {
        setMachineConfig({
          webhookUrl: wConfig.webhook_url || '',
          franqueado: wConfig.franqueado || '',
          isActive: wConfig.is_active,
          departmentId: (wConfig as any).department_id || '',
        });
        setStatus(prev => ({ ...prev, machine: { active: wConfig.is_active } }));
      }
    };
    
    loadConnections();
  }, []);

  // Sincronizar status do Baileys (múltiplas instâncias) com overview
  useEffect(() => {
    const connectedCount = baileysInstances.instances.filter(i => i.status === 'connected').length;
    if (connectedCount > 0) {
      setStatus(prev => ({ ...prev, qrCode: 'connected' }));
    } else if (baileysInstances.instances.some(i => i.status === 'connecting' || i.status === 'waiting_qr')) {
      setStatus(prev => ({ ...prev, qrCode: 'connecting' }));
    } else {
      setStatus(prev => ({ ...prev, qrCode: 'disconnected' }));
    }
  }, [baileysInstances.instances]);

  // API handlers
  const handleConnectAPI = async () => {
    if (!apiCredentials.phoneNumberId || !apiCredentials.wabaId) {
      toast.error('Preencha Phone Number ID e WABA ID');
      return;
    }

    setStatus(prev => ({ ...prev, api: 'connecting' }));
    setIsSavingConnection(true);
    
    try {
      const connectionData: Partial<WhatsAppConnectionData> = {
        connection_type: 'meta_api',
        phone_number_id: apiCredentials.phoneNumberId,
        waba_id: apiCredentials.wabaId,
        department_id: apiCredentials.departmentId || null,
        verify_token: apiCredentials.verifyToken || null,
        name: apiCredentials.name || 'WhatsApp API Oficial',
        status: 'active',
      };
      
      // Só incluir access_token no update se o usuário preencheu algo
      // Isso evita sobrescrever o token existente com null quando o campo está vazio
      if (apiCredentials.accessToken && apiCredentials.accessToken.trim().length > 0) {
        connectionData.access_token = apiCredentials.accessToken.trim();
      }
      
      if (metaConnectionId) {
        // Atualizar conexão existente
        const { data: updated, error } = await supabase
          .from('whatsapp_connections')
          .update(connectionData)
          .eq('id', metaConnectionId)
          .select('id, access_token')
          .maybeSingle();
        
        if (error) throw error;
        if (!updated) throw new Error('Falha ao salvar: permissão negada. Verifique se você é administrador.');
        
        // Verificar se o token foi realmente salvo
        if (apiCredentials.accessToken && !updated.access_token) {
          throw new Error('Token não foi salvo. Verifique suas permissões de administrador.');
        }
      } else {
        // Criar nova conexão
        const { data, error } = await supabase
          .from('whatsapp_connections')
          .insert(connectionData as WhatsAppConnectionData)
          .select('id, access_token')
          .single();
        
        if (error) throw error;
        if (apiCredentials.accessToken && !data.access_token) {
          throw new Error('Token não foi salvo. Verifique suas permissões de administrador.');
        }
        setMetaConnectionId(data.id);
      }
      
      setStatus(prev => ({ ...prev, api: 'connected' }));
      toast.success('WhatsApp API conectada com sucesso!');
    } catch (error: any) {
      console.error('Erro ao salvar conexão:', error);
      toast.error('Erro ao salvar: ' + error.message);
      setStatus(prev => ({ ...prev, api: 'disconnected' }));
    } finally {
      setIsSavingConnection(false);
    }
  };

  const handleDisconnectAPI = () => {
    setStatus(prev => ({ ...prev, api: 'disconnected' }));
    toast.info('WhatsApp API desconectada');
  };

  // Webhook handlers
  const handleToggleWebhook = async (enabled: boolean) => {
    if (enabled && !webhookUrl) {
      toast.error('Configure a URL do webhook primeiro');
      return;
    }
    setStatus(prev => ({ 
      ...prev, 
      webhook: { ...prev.webhook, enabled, url: webhookUrl } 
    }));
    toast.success(enabled ? 'Webhook ativado!' : 'Webhook desativado');
  };

  const handleCopyWebhookUrl = () => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;
    navigator.clipboard.writeText(url);
    toast.success('URL copiada!');
  };

  // Load Facebook SDK
  const loadFacebookSDK = (appId: string) => {
    return new Promise<void>((resolve, reject) => {
      if ((window as any).FB) {
        (window as any).FB.init({ appId, cookie: true, xfbml: true, version: 'v18.0' });
        setFbSdkLoaded(true);
        resolve();
        return;
      }

      // Check if script already exists but hasn't loaded yet
      const existingScript = document.querySelector('script[src*="connect.facebook.net"]');
      if (existingScript) {
        existingScript.remove();
      }

      (window as any).fbAsyncInit = function () {
        (window as any).FB.init({ appId, cookie: true, xfbml: true, version: 'v18.0' });
        setFbSdkLoaded(true);
        resolve();
      };

      const script = document.createElement('script');
      script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
      script.async = true;
      script.defer = true;
      script.crossOrigin = 'anonymous';
      script.onerror = () => {
        reject(new Error('Não foi possível carregar o Facebook SDK. Verifique se extensões de bloqueio (AdBlock) estão desabilitadas e tente novamente.'));
      };
      // Timeout fallback in case fbAsyncInit never fires
      const timeout = setTimeout(() => {
        if (!(window as any).FB) {
          reject(new Error('Timeout ao carregar Facebook SDK. Verifique sua conexão e se extensões de bloqueio estão desabilitadas.'));
        }
      }, 15000);
      const origResolve = resolve;
      const wrappedResolve = () => { clearTimeout(timeout); origResolve(); };
      (window as any).fbAsyncInit = function () {
        (window as any).FB.init({ appId, cookie: true, xfbml: true, version: 'v18.0' });
        setFbSdkLoaded(true);
        wrappedResolve();
      };
      document.body.appendChild(script);
    });
  };

  // Facebook Login handler
  const handleFacebookLogin = async () => {
    if (!facebookAppId) {
      toast.error('Preencha o Facebook App ID primeiro');
      return;
    }

    setFbLoginLoading(true);

    try {
      await loadFacebookSDK(facebookAppId);

      (window as any).FB.login(
        async (response: any) => {
          if (response.authResponse) {
            const userAccessToken = response.authResponse.accessToken;
            console.log('[Facebook Login] Token obtido, chamando edge function...');

            try {
              const res = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-oauth`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    userAccessToken,
                    verifyToken: instagramCredentials.verifyToken || null,
                    departmentId: instagramCredentials.departmentId || null,
                    name: instagramCredentials.name || null,
                  }),
                }
              );

              const data = await res.json();

              if (!data.success) {
                toast.error(data.error || 'Erro ao conectar Instagram');
                setFbLoginLoading(false);
                return;
              }

              if (data.needsSelection) {
                // Multiple pages — show selector
                setFbPages(data.pages);
                toast.info('Selecione a página do Facebook abaixo');
                setFbLoginLoading(false);
                return;
              }

              // Success
              setInstagramCredentials(prev => ({
                ...prev,
                pageId: data.pageId,
                instagramAccountId: data.igAccountId,
                pageName: data.pageName,
                name: prev.name || `Instagram - ${data.pageName}`,
              }));
              setInstagramConnectionId(data.connectionId);
              setStatus(prev => ({ ...prev, instagram: 'connected' }));
              setFbPages([]);
              toast.success(`Instagram conectado via ${data.pageName}!`);
            } catch (err: any) {
              console.error('[Facebook Login] Erro na edge function:', err);
              toast.error('Erro ao processar login: ' + err.message);
            }
          } else {
            toast.error('Login cancelado ou não autorizado');
          }
          setFbLoginLoading(false);
        },
        {
          scope: 'instagram_manage_messages,instagram_basic,pages_manage_metadata,pages_messaging,pages_read_engagement',
        }
      );
    } catch (err: any) {
      console.error('[Facebook Login] Erro ao carregar SDK:', err);
      toast.error('Erro ao carregar Facebook SDK');
      setFbLoginLoading(false);
    }
  };

  // Select a specific page when multiple exist
  const handleSelectPage = async (page: { pageId: string; pageName: string; igAccountId: string }) => {
    setFbLoginLoading(true);
    try {
      // We need the user token again — re-trigger or use stored. For simplicity, save directly.
      const res = await supabase
        .from('whatsapp_connections')
        .upsert({
          connection_type: 'instagram',
          phone_number_id: page.igAccountId,
          waba_id: page.pageId,
          department_id: instagramCredentials.departmentId || null,
          verify_token: instagramCredentials.verifyToken || null,
          name: instagramCredentials.name || `Instagram - ${page.pageName}`,
          status: 'active',
        }, { onConflict: 'phone_number_id,connection_type' })
        .select()
        .single();

      if (res.error) throw res.error;

      setInstagramCredentials(prev => ({
        ...prev,
        pageId: page.pageId,
        instagramAccountId: page.igAccountId,
        pageName: page.pageName,
        name: prev.name || `Instagram - ${page.pageName}`,
      }));
      setInstagramConnectionId(res.data.id);
      setStatus(prev => ({ ...prev, instagram: 'connected' }));
      setFbPages([]);
      toast.success(`Instagram conectado via ${page.pageName}!`);
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + err.message);
    } finally {
      setFbLoginLoading(false);
    }
  };

  const handleConnectInstagram = async () => {
    if (!instagramCredentials.pageId || !instagramCredentials.instagramAccountId) {
      toast.error('Use o botão "Conectar com Facebook" ou preencha os campos manualmente');
      return;
    }

    setStatus(prev => ({ ...prev, instagram: 'connecting' }));
    setIsSavingInstagram(true);
    
    try {
      const connectionData = {
        connection_type: 'instagram',
        phone_number_id: instagramCredentials.instagramAccountId,
        waba_id: instagramCredentials.pageId,
        department_id: instagramCredentials.departmentId || null,
        verify_token: instagramCredentials.verifyToken || null,
        name: instagramCredentials.name || 'Instagram Direct',
        status: 'active'
      };
      
      if (instagramConnectionId) {
        const { error } = await supabase
          .from('whatsapp_connections')
          .update(connectionData)
          .eq('id', instagramConnectionId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('whatsapp_connections')
          .insert(connectionData)
          .select()
          .single();
        if (error) throw error;
        setInstagramConnectionId(data.id);
      }
      
      setStatus(prev => ({ ...prev, instagram: 'connected' }));
      toast.success('Instagram conectado com sucesso!');
    } catch (error: any) {
      console.error('Erro ao salvar conexão Instagram:', error);
      toast.error('Erro ao salvar: ' + error.message);
      setStatus(prev => ({ ...prev, instagram: 'disconnected' }));
    } finally {
      setIsSavingInstagram(false);
    }
  };

  const handleDisconnectInstagram = async () => {
    if (instagramConnectionId) {
      try {
        await supabase
          .from('whatsapp_connections')
          .update({ status: 'disconnected' })
          .eq('id', instagramConnectionId);
      } catch (error) {
        console.error('Erro ao desconectar Instagram:', error);
      }
    }
    setStatus(prev => ({ ...prev, instagram: 'disconnected' }));
    toast.info('Instagram desconectado');
  };

  const getStatusBadge = (connectionStatus: ConnectionStatus) => {
    switch (connectionStatus) {
      case 'connected':
        return <Badge className="bg-success/20 text-success border-success/30">Conectado</Badge>;
      case 'connecting':
        return <Badge className="bg-warning/20 text-warning border-warning/30">Conectando...</Badge>;
      default:
        return <Badge variant="secondary">Desconectado</Badge>;
    }
  };

  // Machine handlers
  const handleSaveMachine = async () => {
    setIsSavingMachine(true);
    try {
      // Check if config exists
      const { data: existing } = await supabase
        .from('webhook_config')
        .select('id')
        .maybeSingle();

      const configData: Record<string, any> = {
        webhook_url: machineConfig.webhookUrl || null,
        franqueado: machineConfig.franqueado || null,
        is_active: machineConfig.isActive,
        department_id: machineConfig.departmentId || null,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        const { error } = await supabase
          .from('webhook_config')
          .update(configData)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('webhook_config')
          .insert(configData);
        if (error) throw error;
      }

      setStatus(prev => ({ ...prev, machine: { active: machineConfig.isActive } }));
      toast.success('Configuração Machine salva!');
    } catch (error: any) {
      console.error('Erro ao salvar config Machine:', error);
      toast.error('Erro ao salvar: ' + error.message);
    } finally {
      setIsSavingMachine(false);
    }
  };
  return (
    <MainLayout title="Integrações">
      <div className="h-full p-6 overflow-y-auto scrollbar-thin">
        <div className="max-w-4xl mx-auto">
          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      status.qrCode === 'connected' ? "bg-success/20" : "bg-muted"
                    )}>
                      <QrCode className={cn(
                        "w-5 h-5",
                        status.qrCode === 'connected' ? "text-success" : "text-muted-foreground"
                      )} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">QR Code</p>
                      <p className="text-xs text-muted-foreground">WhatsApp Web</p>
                    </div>
                  </div>
                  {status.qrCode === 'connected' ? (
                    <CheckCircle2 className="w-5 h-5 text-success" />
                  ) : (
                    <XCircle className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      status.api === 'connected' ? "bg-success/20" : "bg-muted"
                    )}>
                      <MessageSquare className={cn(
                        "w-5 h-5",
                        status.api === 'connected' ? "text-success" : "text-muted-foreground"
                      )} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">API Oficial</p>
                      <p className="text-xs text-muted-foreground">Meta Business</p>
                    </div>
                  </div>
                  {status.api === 'connected' ? (
                    <CheckCircle2 className="w-5 h-5 text-success" />
                  ) : (
                    <XCircle className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      status.webhook.enabled ? "bg-success/20" : "bg-muted"
                    )}>
                      <Webhook className={cn(
                        "w-5 h-5",
                        status.webhook.enabled ? "text-success" : "text-muted-foreground"
                      )} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Webhook</p>
                      <p className="text-xs text-muted-foreground">Eventos</p>
                    </div>
                  </div>
                  {status.webhook.enabled ? (
                    <CheckCircle2 className="w-5 h-5 text-success" />
                  ) : (
                    <XCircle className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      status.instagram === 'connected' ? "bg-success/20" : "bg-muted"
                    )}>
                      <Instagram className={cn(
                        "w-5 h-5",
                        status.instagram === 'connected' ? "text-success" : "text-muted-foreground"
                      )} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Instagram</p>
                      <p className="text-xs text-muted-foreground">Direct</p>
                    </div>
                  </div>
                  {status.instagram === 'connected' ? (
                    <CheckCircle2 className="w-5 h-5 text-success" />
                  ) : (
                    <XCircle className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Machine Overview Card */}
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      status.machine.active ? "bg-success/20" : "bg-muted"
                    )}>
                      <Zap className={cn(
                        "w-5 h-5",
                        status.machine.active ? "text-success" : "text-muted-foreground"
                      )} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Machine</p>
                      <p className="text-xs text-muted-foreground">Webhook</p>
                    </div>
                  </div>
                  {status.machine.active ? (
                    <CheckCircle2 className="w-5 h-5 text-success" />
                  ) : (
                    <XCircle className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Integration Tabs */}
          <Tabs defaultValue="qrcode" className="space-y-6">
            <TabsList className="grid grid-cols-5 w-full">
              <TabsTrigger value="qrcode" className="gap-2">
                <QrCode className="w-4 h-4" />
                <span className="hidden sm:inline">QR Code</span>
              </TabsTrigger>
              <TabsTrigger value="api" className="gap-2">
                <MessageSquare className="w-4 h-4" />
                <span className="hidden sm:inline">API Oficial</span>
              </TabsTrigger>
              <TabsTrigger value="webhook" className="gap-2">
                <Webhook className="w-4 h-4" />
                <span className="hidden sm:inline">Webhook</span>
              </TabsTrigger>
              <TabsTrigger value="instagram" className="gap-2">
                <Instagram className="w-4 h-4" />
                <span className="hidden sm:inline">Instagram</span>
              </TabsTrigger>
              <TabsTrigger value="machine" className="gap-2">
                <Zap className="w-4 h-4" />
                <span className="hidden sm:inline">Machine</span>
              </TabsTrigger>
            </TabsList>

            {/* QR Code Tab - Gerenciador de Múltiplas Instâncias */}
            <TabsContent value="qrcode">
              <BaileysInstancesManager departments={departments} />
            </TabsContent>

            {/* API Tab */}
            <TabsContent value="api">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <MessageSquare className="w-5 h-5" />
                        WhatsApp Business API
                      </CardTitle>
                      <CardDescription>
                        Configure o webhook para receber mensagens
                      </CardDescription>
                    </div>
                    {getStatusBadge(status.api)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Webhook URL */}
                  <div className="space-y-2">
                    <Label>URL do Webhook</Label>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-whatsapp-webhook`}
                        className="font-mono text-sm"
                      />
                      <Button 
                        variant="secondary" 
                        size="icon"
                        onClick={() => {
                          navigator.clipboard.writeText(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-whatsapp-webhook`);
                          toast.success('URL copiada!');
                        }}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Cole esta URL no painel da Meta Business Suite</p>
                  </div>

                  {/* Verify Token */}
                  <div className="space-y-2">
                    <Label>Verify Token</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Digite ou gere um token"
                        value={apiCredentials.verifyToken}
                        onChange={(e) => setApiCredentials(prev => ({ ...prev, verifyToken: e.target.value }))}
                        className="font-mono"
                      />
                      <Button 
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          const token = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
                          setApiCredentials(prev => ({ ...prev, verifyToken: token }));
                          toast.success('Token gerado!');
                        }}
                      >
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                      {apiCredentials.verifyToken && (
                        <Button 
                          variant="secondary"
                          size="icon"
                          onClick={() => {
                            navigator.clipboard.writeText(apiCredentials.verifyToken);
                            toast.success('Token copiado!');
                          }}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Phone Number ID */}
                  <div className="space-y-2">
                    <Label htmlFor="phoneNumberId">Phone Number ID *</Label>
                    <Input
                      id="phoneNumberId"
                      placeholder="Ex: 123456789012345"
                      value={apiCredentials.phoneNumberId}
                      onChange={(e) => setApiCredentials(prev => ({ ...prev, phoneNumberId: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      Meta Business Suite → WhatsApp → Configurações da API
                    </p>
                  </div>

                  {/* WABA ID */}
                  <div className="space-y-2">
                    <Label htmlFor="wabaId">WABA ID</Label>
                    <Input
                      id="wabaId"
                      placeholder="Ex: 123456789012345"
                      value={apiCredentials.wabaId}
                      onChange={(e) => setApiCredentials(prev => ({ ...prev, wabaId: e.target.value }))}
                    />
                  </div>

                  {/* Access Token */}
                  <div className="space-y-2">
                    <Label htmlFor="accessToken">Access Token</Label>
                    <div className="relative">
                      <Input
                        id="accessToken"
                        type={showApiToken ? 'text' : 'password'}
                        placeholder="EAAxxxxxxx..."
                        value={apiCredentials.accessToken}
                        onChange={(e) => setApiCredentials(prev => ({ ...prev, accessToken: e.target.value }))}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full"
                        onClick={() => setShowApiToken(!showApiToken)}
                      >
                        {showApiToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Ou configure via Secrets no backend</p>
                  </div>

                  {/* Department */}
                  <div className="space-y-2">
                    <Label htmlFor="apiDepartment">Departamento</Label>
                    <Select 
                      value={apiCredentials.departmentId} 
                      onValueChange={(value) => setApiCredentials(prev => ({ ...prev, departmentId: value }))}
                    >
                      <SelectTrigger id="apiDepartment">
                        <SelectValue placeholder="Selecione um departamento" />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map(dept => (
                          <SelectItem key={dept.id} value={dept.id}>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: dept.color }} />
                              {dept.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Connection Name */}
                  <div className="space-y-2">
                    <Label htmlFor="apiName">Nome da Conexão</Label>
                    <Input
                      id="apiName"
                      placeholder="Ex: WhatsApp Vendas"
                      value={apiCredentials.name}
                      onChange={(e) => setApiCredentials(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-2">
                    <Button 
                      onClick={handleConnectAPI} 
                      className="flex-1"
                      disabled={status.api === 'connecting' || isSavingConnection || !apiCredentials.phoneNumberId}
                    >
                      {status.api === 'connecting' || isSavingConnection ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Salvando...
                        </>
                      ) : status.api === 'connected' ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Atualizar Configuração
                        </>
                      ) : (
                        'Salvar Configuração'
                      )}
                    </Button>
                    {status.api === 'connected' && (
                      <Button variant="destructive" onClick={handleDisconnectAPI}>
                        Desconectar
                      </Button>
                    )}
                  </div>

                  {status.api === 'connected' && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/30">
                      <CheckCircle2 className="w-5 h-5 text-success" />
                      <span className="text-sm text-success font-medium">Integração ativa e funcionando</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Webhook Tab */}
            <TabsContent value="webhook">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Webhook className="w-5 h-5" />
                        Configuração de Webhook
                      </CardTitle>
                      <CardDescription>
                        Receba eventos em tempo real via webhook
                      </CardDescription>
                    </div>
                    <Badge className={status.webhook.enabled ? "bg-success/20 text-success border-success/30" : ""}>
                      {status.webhook.enabled ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between p-4 rounded-lg bg-secondary">
                    <div>
                      <p className="font-medium">Webhook Ativo</p>
                      <p className="text-sm text-muted-foreground">Receber eventos em tempo real</p>
                    </div>
                    <Switch
                      checked={status.webhook.enabled}
                      onCheckedChange={handleToggleWebhook}
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>URL do Webhook (seu servidor)</Label>
                      <Input
                        placeholder="https://seu-servidor.com/webhook"
                        value={webhookUrl}
                        onChange={(e) => setWebhookUrl(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        URL externa para onde os eventos serão enviados
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>URL do Webhook (Backend)</Label>
                      <div className="flex gap-2">
                        <Input
                          readOnly
                          value={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`}
                          className="font-mono text-sm"
                        />
                        <Button variant="secondary" size="icon" onClick={handleCopyWebhookUrl}>
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Configure esta URL no servidor Baileys como WEBHOOK_URL
                      </p>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg border border-border">
                    <h4 className="font-medium mb-3">Eventos suportados</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {['connection.open', 'connection.closed', 'message.received', 'message.status'].map((event) => (
                        <div key={event} className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-success" />
                          <span className="font-mono">{event}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Instagram Tab */}
            <TabsContent value="instagram">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Instagram className="w-5 h-5" />
                        Instagram Direct
                      </CardTitle>
                      <CardDescription>
                        Conecte sua conta do Instagram para receber mensagens
                      </CardDescription>
                    </div>
                    {getStatusBadge(status.instagram)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {status.instagram === 'connected' ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-success/10 border border-success/30">
                        <CheckCircle2 className="w-5 h-5 text-success" />
                        <div>
                          <p className="text-sm font-medium text-success">Instagram Conectado</p>
                          <p className="text-xs text-muted-foreground">{instagramCredentials.name || 'Instagram Direct'}</p>
                        </div>
                      </div>

                      {/* Webhook URL - always visible when connected */}
                      <div className="space-y-2 p-3 rounded-lg bg-muted/50 border border-border">
                        <Label className="text-xs font-semibold">⚠️ Webhook URL (configure no Meta for Developers)</Label>
                        <div className="flex gap-2">
                          <Input
                            readOnly
                            value={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ig-test`}
                            className="font-mono text-xs"
                          />
                          <Button 
                            variant="secondary" 
                            size="icon"
                            onClick={() => {
                              navigator.clipboard.writeText(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ig-test`);
                              toast.success('URL copiada!');
                            }}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Cole no Meta for Developers → Instagram → Webhooks → Campo <strong>messages</strong>. Verify Token: <code className="bg-muted px-1 rounded">{instagramCredentials.verifyToken || 'não definido'}</code>
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setStatus(prev => ({ ...prev, instagram: 'disconnected' }))}>
                          <Settings className="w-4 h-4 mr-2" />
                          Editar
                        </Button>
                        <Button variant="destructive" size="sm" onClick={handleDisconnectInstagram}>
                          Desconectar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Callback URL */}
                      <div className="space-y-2">
                        <Label>Callback URL</Label>
                        <div className="flex gap-2">
                          <Input
                            readOnly
                            value={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ig-test`}
                            className="font-mono text-sm"
                          />
                          <Button 
                            variant="secondary" 
                            size="icon"
                            onClick={() => {
                              navigator.clipboard.writeText(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-webhook`);
                              toast.success('URL copiada!');
                            }}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">Cole no Meta for Developers → Instagram → Webhooks. Inscreva-se no campo <strong>messages</strong>.</p>
                      </div>

                      {/* Verify Token */}
                      <div className="space-y-2">
                        <Label>Verify Token</Label>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Gere um token"
                            value={instagramCredentials.verifyToken}
                            onChange={(e) => setInstagramCredentials(prev => ({ ...prev, verifyToken: e.target.value }))}
                            className="font-mono"
                          />
                          <Button 
                            variant="outline"
                            size="icon"
                            onClick={() => {
                              const token = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
                              setInstagramCredentials(prev => ({ ...prev, verifyToken: token }));
                              navigator.clipboard.writeText(token);
                              toast.success('Token gerado e copiado!');
                            }}
                          >
                            <RefreshCw className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Facebook App ID */}
                      <div className="space-y-2">
                        <Label htmlFor="fbAppId">Facebook App ID *</Label>
                        <Input
                          id="fbAppId"
                          placeholder="Ex: 123456789012345"
                          value={facebookAppId}
                          onChange={(e) => setFacebookAppId(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Meta for Developers → seu App → Configurações → Básico
                        </p>
                      </div>

                      {/* Name + Department */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="igName">Nome</Label>
                          <Input
                            id="igName"
                            placeholder="Ex: @suaempresa"
                            value={instagramCredentials.name}
                            onChange={(e) => setInstagramCredentials(prev => ({ ...prev, name: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Departamento</Label>
                          <Select
                            value={instagramCredentials.departmentId}
                            onValueChange={(value) => setInstagramCredentials(prev => ({ ...prev, departmentId: value }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              {departments.map((dept) => (
                                <SelectItem key={dept.id} value={dept.id}>
                                  <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: dept.color }} />
                                    {dept.name}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Facebook Login Button */}
                      <Button 
                        onClick={handleFacebookLogin} 
                        className="w-full bg-[#1877F2] hover:bg-[#166FE5] text-white"
                        disabled={fbLoginLoading || !facebookAppId}
                      >
                        {fbLoginLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Conectando...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                            </svg>
                            Conectar com Facebook
                          </>
                        )}
                      </Button>

                      {/* Page selector */}
                      {fbPages.length > 1 && (
                        <div className="space-y-2">
                          <Label>Selecione a Página</Label>
                          <p className="text-xs text-muted-foreground">Múltiplas páginas encontradas:</p>
                          {fbPages.map((page) => (
                            <Button
                              key={page.pageId}
                              variant="outline"
                              className="w-full justify-start"
                              onClick={() => handleSelectPage(page)}
                              disabled={fbLoginLoading}
                            >
                              <Instagram className="w-4 h-4 mr-2" />
                              {page.pageName}
                              <span className="ml-auto text-xs text-muted-foreground">IG: {page.igAccountId}</span>
                            </Button>
                          ))}
                        </div>
                      )}

                      {/* Manual config */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="igPageId">Page ID (manual)</Label>
                          <Input
                            id="igPageId"
                            placeholder="Ex: 123456789012345"
                            value={instagramCredentials.pageId}
                            onChange={(e) => setInstagramCredentials(prev => ({ ...prev, pageId: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="igAccountId">Instagram Account ID</Label>
                          <Input
                            id="igAccountId"
                            placeholder="Ex: 17841400000000000"
                            value={instagramCredentials.instagramAccountId}
                            onChange={(e) => setInstagramCredentials(prev => ({ ...prev, instagramAccountId: e.target.value }))}
                          />
                        </div>
                      </div>

                      <Button 
                        onClick={handleConnectInstagram} 
                        className="w-full"
                        disabled={status.instagram === 'connecting' || isSavingInstagram}
                      >
                        {status.instagram === 'connecting' || isSavingInstagram ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Salvando...
                          </>
                        ) : (
                          'Salvar Configuração'
                        )}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Machine Tab */}
            <TabsContent value="machine">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Zap className="w-5 h-5" />
                        Integração Machine
                      </CardTitle>
                      <CardDescription>
                        Receba e responda mensagens pela plataforma Machine
                      </CardDescription>
                    </div>
                    <Badge className={status.machine.active ? "bg-success/20 text-success border-success/30" : ""}>
                      {status.machine.active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* URL de Recebimento */}
                  <div className="space-y-2">
                    <Label>URL de Recebimento (Backend)</Label>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-machine`}
                        className="font-mono text-sm"
                      />
                      <Button
                        variant="secondary"
                        size="icon"
                        onClick={() => {
                          navigator.clipboard.writeText(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-machine`);
                          toast.success('URL copiada!');
                        }}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Configure esta URL na plataforma Machine</p>
                    <pre className="p-3 rounded-lg bg-secondary font-mono text-xs text-muted-foreground">{`POST { "id_conversa": "00000", "franqueado": "Nome", "mensagem": "Texto" }`}</pre>
                  </div>

                  {/* URL do Servidor Machine */}
                  <div className="space-y-2">
                    <Label>URL do Servidor Machine</Label>
                    <Input
                      placeholder="https://homl.delmatchapp.com/api/webhook/chat/"
                      value={machineConfig.webhookUrl}
                      onChange={(e) => setMachineConfig(prev => ({ ...prev, webhookUrl: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">URL para onde as respostas serão enviadas</p>
                  </div>

                  {/* Franqueado */}
                  <div className="space-y-2">
                    <Label htmlFor="machineFranqueado">Nome do Franqueado</Label>
                    <Input
                      id="machineFranqueado"
                      placeholder="Ex: Franquia São Paulo"
                      value={machineConfig.franqueado}
                      onChange={(e) => setMachineConfig(prev => ({ ...prev, franqueado: e.target.value }))}
                    />
                  </div>

                  {/* Departamento */}
                  <div className="space-y-2">
                    <Label>Departamento</Label>
                    <Select
                      value={machineConfig.departmentId}
                      onValueChange={(value) => setMachineConfig(prev => ({ ...prev, departmentId: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um departamento" />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map((dept) => (
                          <SelectItem key={dept.id} value={dept.id}>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: dept.color }} />
                              {dept.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Toggle */}
                  <div className="flex items-center justify-between p-4 rounded-lg bg-secondary">
                    <div>
                      <p className="font-medium">Integração Ativa</p>
                      <p className="text-sm text-muted-foreground">Ativar envio de respostas para Machine</p>
                    </div>
                    <Switch
                      checked={machineConfig.isActive}
                      onCheckedChange={(checked) => setMachineConfig(prev => ({ ...prev, isActive: checked }))}
                    />
                  </div>

                  <Button 
                    onClick={handleSaveMachine} 
                    className="w-full"
                    disabled={isSavingMachine}
                  >
                    {isSavingMachine ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      'Salvar Configuração'
                    )}
                  </Button>

                  {status.machine.active && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/30">
                      <CheckCircle2 className="w-5 h-5 text-success" />
                      <span className="text-sm text-success font-medium">Integração Machine ativa</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </MainLayout>
  );
}
