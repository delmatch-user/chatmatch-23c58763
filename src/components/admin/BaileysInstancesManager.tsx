import { 
  Server, RefreshCw, Loader2, AlertCircle, Smartphone, 
  Wifi, WifiOff, Activity, Clock, Zap
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useBaileysInstances } from '@/hooks/useBaileysInstances';
import { BaileysInstanceCard } from './BaileysInstanceCard';
import { CreateInstanceDialog } from './CreateInstanceDialog';

interface Department {
  id: string;
  name: string;
  color: string;
}

interface BaileysInstancesManagerProps {
  departments: Department[];
}

export function BaileysInstancesManager({ departments }: BaileysInstancesManagerProps) {
  const {
    instances,
    isLoading,
    maxInstances,
    serverOnline,
    canAddMore,
    refresh,
    createInstance,
    deleteInstance,
    connectInstance,
    disconnectInstance,
    getQRCode,
    clearSession,
    forceConnect,
    updateInstanceDepartment
  } = useBaileysInstances();

  const connectedCount = instances.filter(i => i.status === 'connected').length;
  const totalCount = instances.length;

  return (
    <div className="space-y-6">
      {/* Overview Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="w-5 h-5" />
                Números WhatsApp (QR Code)
              </CardTitle>
              <CardDescription>
                Gerencie múltiplos números WhatsApp conectados via QR Code
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={serverOnline ? 'default' : 'destructive'} className="gap-1">
                {serverOnline ? (
                  <>
                    <Zap className="w-3 h-3" />
                    Servidor Online
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3" />
                    Servidor Offline
                  </>
                )}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-4 rounded-lg bg-muted/50 border">
              <div className="flex items-center gap-2 mb-1">
                <Smartphone className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Total</span>
              </div>
              <p className="text-2xl font-semibold">{totalCount}</p>
            </div>
            <div className="p-4 rounded-lg bg-success/10 border border-success/30">
              <div className="flex items-center gap-2 mb-1">
                <Wifi className="w-4 h-4 text-success" />
                <span className="text-xs text-muted-foreground">Conectados</span>
              </div>
              <p className="text-2xl font-semibold text-success">{connectedCount}</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50 border">
              <div className="flex items-center gap-2 mb-1">
                <WifiOff className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Desconectados</span>
              </div>
              <p className="text-2xl font-semibold">{totalCount - connectedCount}</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50 border">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Limite</span>
              </div>
              <p className="text-2xl font-semibold">{totalCount}/{maxInstances}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between mb-6">
            <CreateInstanceDialog 
              departments={departments}
              onCreateInstance={createInstance}
              disabled={!serverOnline || !canAddMore}
              maxInstances={maxInstances}
              currentCount={totalCount}
            />
            <Button variant="outline" size="sm" onClick={refresh} disabled={isLoading}>
              <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
              Atualizar
            </Button>
          </div>

          {/* Loading State */}
          {isLoading && instances.length === 0 && (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Carregando instâncias...</p>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && instances.length === 0 && (
            <div className="text-center py-12 border-2 border-dashed border-border rounded-lg">
              <Smartphone className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">Nenhum número conectado</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Adicione seu primeiro número WhatsApp para começar a receber mensagens
              </p>
              {!serverOnline && (
                <p className="text-sm text-destructive">
                  O servidor Baileys está offline. Verifique a conexão.
                </p>
              )}
            </div>
          )}

          {/* Server Offline Warning */}
          {!serverOnline && instances.length > 0 && (
            <div className="mb-4 p-4 rounded-lg bg-destructive/10 border border-destructive/30">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-destructive">Servidor Baileys Offline</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Não foi possível conectar ao servidor. Verifique se ele está rodando corretamente.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Instance List */}
          {instances.length > 0 && (
            <div className="grid gap-4">
              {instances.map(instance => (
                <BaileysInstanceCard
                  key={instance.instanceId}
                  instance={instance}
                  departments={departments}
                  onConnect={connectInstance}
                  onDisconnect={disconnectInstance}
                  onDelete={deleteInstance}
                  onGetQR={getQRCode}
                  onClearSession={clearSession}
                  onForceConnect={forceConnect}
                  onUpdateDepartment={updateInstanceDepartment}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Instructions Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Como funciona</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm text-muted-foreground">
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 text-xs font-medium">1</span>
              <span>Clique em "Adicionar Número" e escolha um identificador único</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 text-xs font-medium">2</span>
              <span>Vincule a instância a um departamento (opcional)</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 text-xs font-medium">3</span>
              <span>Clique em "Conectar" e escaneie o QR Code com o WhatsApp</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 text-xs font-medium">4</span>
              <span>Mensagens recebidas serão direcionadas ao departamento vinculado</span>
            </li>
          </ol>
          <div className="mt-4 p-3 rounded-lg bg-warning/10 border border-warning/30">
            <p className="text-xs text-warning">
              <strong>Importante:</strong> Recomendamos no máximo 3-5 números por servidor para evitar bloqueios do WhatsApp.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
