import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Sparkles, Bot, CheckCircle2, XCircle, Loader2, Key, RefreshCw, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { useAIProviders } from '@/hooks/useAIProviders';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import GoogleOAuthCard from '@/components/admin/GoogleOAuthCard';

// Ícones específicos para cada provedor
const providerIcons: Record<string, React.ReactNode> = {
  openai: (
    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-[#10a37f]/10 flex items-center justify-center shrink-0">
      <Bot className="w-5 h-5 sm:w-6 sm:h-6 text-[#10a37f]" />
    </div>
  ),
  google: (
    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-[#4285f4]/10 flex items-center justify-center shrink-0">
      <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-[#4285f4]" />
    </div>
  )
};

// Map provider to secret name
const providerSecretNames: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GEMINI_API_KEY'
};

export default function AdminAIIntegrations() {
  const { providers, loading, toggleProvider, setDefaultModel, fetchProviders } = useAIProviders();
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [configuredKeys, setConfiguredKeys] = useState<Record<string, boolean>>({});
  const [checkingKeys, setCheckingKeys] = useState(true);
  const isMobile = useIsMobile();

  // Check which API keys are configured
  const checkConfiguredKeys = async () => {
    try {
      setCheckingKeys(true);
      const { data, error } = await supabase.functions.invoke('manage-ai-keys', {
        body: { action: 'check' }
      });
      if (!error && data?.keys) {
        setConfiguredKeys(data.keys);
      }
    } catch (e) {
      console.error('Error checking keys:', e);
    } finally {
      setCheckingKeys(false);
    }
  };

  useEffect(() => {
    checkConfiguredKeys();
  }, []);

  const handleTestConnection = async (provider: string) => {
    setTestingProvider(provider);
    
    try {
      const { data, error } = await supabase.functions.invoke('manage-ai-keys', {
        body: { action: 'test', provider }
      });

      if (error) {
        toast.error('Erro ao testar conexão');
      } else if (data?.success) {
        toast.success(data.message || 'Conexão verificada com sucesso!');
      } else {
        toast.error(data?.message || 'Falha ao testar conexão');
      }
    } catch (e) {
      toast.error('Erro ao testar conexão');
    }
    
    setTestingProvider(null);
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="h-full overflow-y-auto scrollbar-thin">
        <div className="p-4 sm:p-6 space-y-6">
          {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
              Integrações de IA
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">
              Gerencie suas integrações com provedores de IA
            </p>
          </div>
          <Button 
            variant="outline" 
            size={isMobile ? "sm" : "default"}
            onClick={() => { fetchProviders(); checkConfiguredKeys(); }}
            className="self-start sm:self-auto"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
        </div>

        {/* Providers Grid */}
        <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
          {providers.map((provider) => {
            const isKeyConfigured = configuredKeys[provider.provider];
            const secretName = providerSecretNames[provider.provider];
            
            return (
              <Card key={provider.id} className="relative overflow-hidden">
                {/* Status indicator */}
                <div className={`absolute top-0 left-0 right-0 h-1 ${provider.is_active ? 'bg-green-500' : 'bg-muted'}`} />
                
                <CardHeader className="pb-3 sm:pb-4 px-4 sm:px-6">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {providerIcons[provider.provider] || (
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Bot className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <CardTitle className="text-base sm:text-lg truncate">{provider.display_name}</CardTitle>
                        <CardDescription className="text-xs sm:text-sm">
                          Provedor: {provider.provider}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge 
                      variant={provider.is_active ? 'default' : 'secondary'} 
                      className="gap-1 self-start sm:self-auto shrink-0"
                    >
                      {provider.is_active ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          Ativo
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3 h-3" />
                          Inativo
                        </>
                      )}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 sm:space-y-4 px-4 sm:px-6">
                  {/* API Key Status */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-secondary/50">
                    <div className="flex items-center gap-2">
                      <Key className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium">API Key ({secretName})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {checkingKeys ? (
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      ) : isKeyConfigured ? (
                        <Badge variant="outline" className="bg-success/10 text-success border-success/30 gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Configurada
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Não configurada
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Info about configuring key */}
                  {!isKeyConfigured && !checkingKeys && (
                    <div className="p-3 rounded-lg bg-warning/5 border border-warning/20 text-sm text-muted-foreground">
                      <p>
                        Para usar o {provider.display_name}, configure o secret <code className="px-1 py-0.5 rounded bg-muted font-mono text-xs">{secretName}</code> nas configurações do backend.
                      </p>
                      {provider.provider === 'google' && (
                        <p className="mt-1">
                          Obtenha sua chave em{' '}
                          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                            Google AI Studio
                          </a>
                        </p>
                      )}
                      {provider.provider === 'openai' && (
                        <p className="mt-1">
                          Obtenha sua chave em{' '}
                          <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                            OpenAI Platform
                          </a>
                        </p>
                      )}
                    </div>
                  )}

                  {/* Default Model Selection */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Modelo Padrão</label>
                    <Select
                      value={provider.default_model || ''}
                      onValueChange={(value) => setDefaultModel(provider.id, value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione um modelo" />
                      </SelectTrigger>
                      <SelectContent>
                        {provider.models.map((model) => (
                          <SelectItem key={model} value={model}>
                            {model}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Toggle and Test */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-border/50">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={provider.is_active}
                        onCheckedChange={(checked) => toggleProvider(provider.id, checked)}
                      />
                      <span className="text-sm text-muted-foreground">
                        {provider.is_active ? 'Habilitado' : 'Desabilitado'}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTestConnection(provider.provider)}
                      disabled={testingProvider === provider.provider}
                      className="w-full sm:w-auto"
                    >
                      {testingProvider === provider.provider ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Testando...
                        </>
                      ) : (
                        'Testar Conexão'
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Empty State */}
        {providers.length === 0 && !loading && (
          <Card className="p-8 sm:p-12">
            <div className="flex flex-col items-center justify-center text-center">
              <Sparkles className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground mb-4" />
              <h3 className="text-base sm:text-lg font-semibold mb-2">Nenhum provedor configurado</h3>
              <p className="text-sm text-muted-foreground">
                Os provedores de IA serão exibidos aqui após a configuração.
              </p>
            </div>
          </Card>
        )}

        {/* Google OAuth Card */}
        <GoogleOAuthCard />

        {/* Info Card */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-4 sm:pt-6 px-4 sm:px-6">
            <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1 text-sm sm:text-base">Como funciona a sincronização</h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Os robôs utilizam automaticamente o provedor correto com base na inteligência selecionada.
                  Modelos Gemini (Novato, Flash, Pro) usam a API Key do Google, 
                  e o modelo Maestro usa a API Key da OpenAI. 
                  Configure as chaves aqui e ative os provedores para sincronizar com seus agentes IA.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    </MainLayout>
  );
}
