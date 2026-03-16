import { useState, useEffect, forwardRef } from 'react';
import { 
  Wifi, WifiOff, QrCode, Loader2, Trash2, RefreshCw, 
  RotateCcw, Zap, Smartphone, Building2, AlertCircle 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { BaileysInstance } from '@/hooks/useBaileysInstances';

interface Department {
  id: string;
  name: string;
  color: string;
}

interface BaileysInstanceCardProps {
  instance: BaileysInstance;
  departments: Department[];
  onConnect: (instanceId: string) => Promise<{ success: boolean; error?: string }>;
  onDisconnect: (instanceId: string) => Promise<{ success: boolean; error?: string }>;
  onDelete: (instanceId: string) => Promise<{ success: boolean; error?: string }>;
  onGetQR: (instanceId: string) => Promise<{ success: boolean; qr?: string; error?: string }>;
  onClearSession: (instanceId: string) => Promise<{ success: boolean; error?: string }>;
  onForceConnect: (instanceId: string) => Promise<{ success: boolean; error?: string }>;
  onUpdateDepartment: (instanceId: string, departmentId: string | null) => Promise<{ success: boolean; error?: string }>;
}

export function BaileysInstanceCard({
  instance,
  departments,
  onConnect,
  onDisconnect,
  onDelete,
  onGetQR,
  onClearSession,
  onForceConnect,
  onUpdateDepartment
}: BaileysInstanceCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(instance.qrCode || null);
  const [showQR, setShowQR] = useState(false);
  const [isUpdatingDept, setIsUpdatingDept] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Auto-mostrar QR quando status muda para waiting_qr
  useEffect(() => {
    if (instance.status === 'waiting_qr') {
      setShowQR(true);
    }
  }, [instance.status]);

  // Polling de QR Code enquanto aguardando (a cada 3s)
  useEffect(() => {
    if (instance.status !== 'waiting_qr' || !showQR) return;

    // Buscar QR imediatamente
    onGetQR(instance.instanceId).then(r => {
      if (r.success && r.qr) setQrCode(r.qr);
    });

    // Continuar buscando a cada 3s (QR expira em ~60s)
    const interval = setInterval(async () => {
      const r = await onGetQR(instance.instanceId);
      if (r.success && r.qr) setQrCode(r.qr);
    }, 3000);

    return () => clearInterval(interval);
  }, [instance.status, showQR, instance.instanceId, onGetQR]);

  const handleConnect = async () => {
    setIsLoading(true);
    const result = await onConnect(instance.instanceId);
    if (result.success) {
      setShowQR(true);
      // Buscar QR após 2s
      setTimeout(async () => {
        const qrResult = await onGetQR(instance.instanceId);
        if (qrResult.success && qrResult.qr) {
          setQrCode(qrResult.qr);
        }
        setIsLoading(false);
      }, 2000);
    } else {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    await onDisconnect(instance.instanceId);
    setIsLoading(false);
    setShowQR(false);
    setQrCode(null);
  };

  const handleDelete = async () => {
    if (!confirm(`Deseja realmente remover a instância "${instance.instanceId}"?`)) return;
    setIsDeleting(true);
    await onDelete(instance.instanceId);
    setIsDeleting(false);
  };

  const handleClearSession = async () => {
    setIsLoading(true);
    const result = await onClearSession(instance.instanceId);
    if (result.success) {
      setQrCode(null);
      setShowQR(false);
    }
    setIsLoading(false);
  };

  const handleForceConnect = async () => {
    setIsLoading(true);
    const result = await onForceConnect(instance.instanceId);
    if (result.success) {
      setShowQR(true);
      setTimeout(async () => {
        const qrResult = await onGetQR(instance.instanceId);
        if (qrResult.success && qrResult.qr) {
          setQrCode(qrResult.qr);
        }
        setIsLoading(false);
      }, 2000);
    } else {
      setIsLoading(false);
    }
  };

  const handleDepartmentChange = async (deptId: string) => {
    setIsUpdatingDept(true);
    await onUpdateDepartment(instance.instanceId, deptId === 'none' ? null : deptId);
    setIsUpdatingDept(false);
  };

  const getStatusBadge = () => {
    switch (instance.status) {
      case 'connected':
        return <Badge className="bg-success/20 text-success border-success/30">Conectado</Badge>;
      case 'connecting':
      case 'waiting_qr':
        return <Badge className="bg-warning/20 text-warning border-warning/30">Aguardando QR</Badge>;
      case 'error':
        return <Badge className="bg-destructive/20 text-destructive border-destructive/30">Erro</Badge>;
      default:
        return <Badge variant="secondary">Desconectado</Badge>;
    }
  };

  const department = departments.find(d => d.id === instance.departmentId);

  return (
    <Card className={cn(
      "border transition-all",
      instance.status === 'connected' && "border-success/30 bg-success/5",
      instance.status === 'error' && "border-destructive/30 bg-destructive/5"
    )}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Instance Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                instance.status === 'connected' ? "bg-success/20" : "bg-muted"
              )}>
                {instance.status === 'connected' ? (
                  <Wifi className="w-5 h-5 text-success" />
                ) : (
                  <WifiOff className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-sm truncate">{instance.instanceId}</h4>
                  {getStatusBadge()}
                </div>
                {instance.phone && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Smartphone className="w-3 h-3" />
                    +{instance.phone}
                  </p>
                )}
              </div>
            </div>

            {/* Department Selector */}
            <div className="flex items-center gap-2 mt-3">
              <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
              <Select 
                value={instance.departmentId || 'none'} 
                onValueChange={handleDepartmentChange}
                disabled={isUpdatingDept}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Selecionar departamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem departamento</SelectItem>
                  {departments.map(dept => (
                    <SelectItem key={dept.id} value={dept.id}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-2 h-2 rounded-full" 
                          style={{ backgroundColor: dept.color }}
                        />
                        {dept.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isUpdatingDept && <Loader2 className="w-3 h-3 animate-spin" />}
            </div>

            {/* Error message — hide when connected (stale errors like "Restart requested") */}
            {instance.lastError && instance.status !== 'connected' && (
              <div className="mt-3 p-2 rounded bg-destructive/10 text-xs text-destructive flex items-start gap-2">
                <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                <span className="line-clamp-2">{instance.lastError}</span>
              </div>
            )}
          </div>

          {/* QR Code Area */}
          <div className="shrink-0">
            {(showQR || instance.hasQR) && instance.status === 'waiting_qr' && (
              <div className="w-32 h-32 rounded-lg bg-white p-2 flex items-center justify-center">
                {qrCode ? (
                  <img src={qrCode} alt="QR Code" className="w-full h-full object-contain" />
                ) : (
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
          {instance.status === 'disconnected' && (
            <Button size="sm" onClick={handleConnect} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <QrCode className="w-4 h-4 mr-1" />
                  Conectar
                </>
              )}
            </Button>
          )}
          
          {instance.status === 'connected' && (
            <Button size="sm" variant="destructive" onClick={handleDisconnect} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <WifiOff className="w-4 h-4 mr-1" />
                  Desconectar
                </>
              )}
            </Button>
          )}
          
          {(instance.status === 'waiting_qr' || instance.status === 'connecting') && (
            <>
              <Button size="sm" variant="secondary" onClick={async () => {
                const result = await onGetQR(instance.instanceId);
                if (result.success && result.qr) {
                  setQrCode(result.qr);
                }
              }}>
                <RefreshCw className="w-4 h-4 mr-1" />
                Atualizar QR
              </Button>
              <Button size="sm" variant="outline" onClick={handleDisconnect}>
                Cancelar
              </Button>
            </>
          )}

          {instance.status === 'error' && (
            <>
              <Button size="sm" onClick={handleForceConnect} disabled={isLoading}>
                <Zap className="w-4 h-4 mr-1" />
                Reconectar
              </Button>
              <Button size="sm" variant="outline" onClick={handleClearSession} disabled={isLoading}>
                <RotateCcw className="w-4 h-4 mr-1" />
                Limpar Sessão
              </Button>
            </>
          )}

          <Button 
            size="sm" 
            variant="ghost" 
            className="ml-auto text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
