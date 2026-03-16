import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface BaileysInstance {
  instanceId: string;
  status: 'disconnected' | 'connecting' | 'waiting_qr' | 'connected' | 'error' | 'not_created';
  phone: string | null;
  hasQR: boolean;
  qrCode?: string | null;
  lastEventAt: string | null;
  lastError: string | null;
  departmentId?: string | null;
  connectionId?: string | null;
}

interface ServerInstancesResponse {
  success: boolean;
  instances: Array<{
    instanceId: string;
    status: string;
    phone: string | null;
    hasQR: boolean;
    lastEventAt: string | null;
    lastError: string | null;
  }>;
  total: number;
  maxInstances: number;
}

// Helper para chamar a Edge Function proxy com autenticação
async function callBaileysProxy(action: string, options?: { 
  method?: 'GET' | 'POST' | 'DELETE';
  body?: object;
  instanceId?: string;
  phone?: string;
  timeout?: number;
  throwOnError?: boolean; // Se false, retorna o erro em vez de lançar
}): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options?.timeout || 15000);

  try {
    const bodyData: Record<string, unknown> = { action };
    if (options?.body) {
      Object.assign(bodyData, options.body);
    }
    if (options?.instanceId) {
      bodyData.instanceId = options.instanceId;
    }

    const { data, error } = await supabase.functions.invoke('baileys-proxy', {
      body: bodyData,
    });

    clearTimeout(timeoutId);

    if (error) {
      // Se não deve lançar erro, retorna objeto com erro
      if (options?.throwOnError === false) {
        return { success: false, error: error.message || 'Erro na requisição', isError: true };
      }
      throw new Error(error.message || 'Erro na requisição');
    }

    // Verificar se a resposta indica erro (502, 404, etc)
    if (data && data.success === false) {
      if (options?.throwOnError === false) {
        return { ...data, isError: true };
      }
      throw new Error(data.error || data.details || 'Erro na requisição');
    }

    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error?.name === 'AbortError') {
      if (options?.throwOnError === false) {
        return { success: false, error: 'Timeout: servidor não respondeu', isError: true };
      }
      throw new Error('Timeout: servidor não respondeu');
    }
    
    // Capturar erros do Supabase SDK (FunctionsFetchError para 409, 502, etc)
    if (options?.throwOnError === false) {
      // Tentar extrair a mensagem real do body da resposta (ex: 409 com JSON)
      let errorMessage = error?.message || error?.context?.message || 'Erro desconhecido';
      try {
        if (error?.context) {
          const bodyText = typeof error.context === 'string' 
            ? error.context 
            : await error.context?.text?.() || JSON.stringify(error.context);
          const parsed = JSON.parse(bodyText);
          if (parsed?.error) errorMessage = parsed.error;
        }
      } catch { /* ignorar erros de parse */ }
      return { success: false, error: errorMessage, isError: true };
    }
    throw error;
  }
}

// Cache persistente para evitar chamadas ao endpoint que não existe
// Usa sessionStorage para sobreviver ao hot reload
const MULTI_INSTANCE_CACHE_KEY = 'baileys_multi_instance_supported';

function getMultiInstanceSupported(): boolean | null {
  const cached = sessionStorage.getItem(MULTI_INSTANCE_CACHE_KEY);
  if (cached === 'true') return true;
  if (cached === 'false') return false;
  return null;
}

function setMultiInstanceSupported(value: boolean) {
  sessionStorage.setItem(MULTI_INSTANCE_CACHE_KEY, value ? 'true' : 'false');
}

export function useBaileysInstances() {
  const [instances, setInstances] = useState<BaileysInstance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [maxInstances, setMaxInstances] = useState(5);
  const [serverOnline, setServerOnline] = useState(false);
  const isMountedRef = useRef(true);

  // Track mount state with ref (more reliable than state)
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Buscar usando modo legado (apenas /status)
  const fetchLegacyStatus = useCallback(async (): Promise<void> => {
    try {
      // Buscar registro no banco PRIMEIRO — se não existir, não mostrar instância
      const { data: connection } = await supabase
        .from('whatsapp_connections')
        .select('id, department_id')
        .eq('connection_type', 'baileys')
        .limit(1)
        .maybeSingle();

      if (!isMountedRef.current) return;

      // Se não há registro no banco, limpar instâncias (foi deletado)
      if (!connection) {
        setInstances([]);
        setServerOnline(false);
        return;
      }

      const statusResult = await callBaileysProxy('status', { throwOnError: false });

      if (!isMountedRef.current) return;

      const statusOk = statusResult &&
        statusResult.success !== false &&
        !statusResult.isError &&
        (statusResult.status !== undefined || statusResult.phone !== undefined);

      if (statusOk) {
        setServerOnline(true);
        setInstances([{
          instanceId: 'default',
          status: (statusResult?.status || 'disconnected') as BaileysInstance['status'],
          phone: statusResult?.phone || null,
          hasQR: statusResult?.hasQR || false,
          lastEventAt: statusResult?.lastEventAt || null,
          lastError: (statusResult?.status === 'connected') ? null : (statusResult?.lastError || null),
          departmentId: connection.department_id || null,
          connectionId: connection.id,
        }]);
      } else {
        setServerOnline(false);
        setInstances([{
          instanceId: 'default',
          status: 'error',
          phone: null,
          hasQR: false,
          lastEventAt: null,
          lastError: statusResult?.error || 'Servidor inacessível',
          departmentId: connection.department_id || null,
          connectionId: connection.id,
        }]);
      }
    } catch (err) {
      console.error('Erro ao buscar status legado:', err);
      if (!isMountedRef.current) return;

      const { data: connection } = await supabase
        .from('whatsapp_connections')
        .select('id, department_id')
        .eq('connection_type', 'baileys')
        .limit(1)
        .maybeSingle();

      if (!isMountedRef.current) return;

      if (!connection) {
        setInstances([]);
        setServerOnline(false);
        return;
      }

      setServerOnline(false);
      setInstances([{
        instanceId: 'default',
        status: 'error',
        phone: null,
        hasQR: false,
        lastEventAt: null,
        lastError: 'Erro ao buscar status',
        departmentId: connection.department_id || null,
        connectionId: connection.id,
      }]);
    }
  }, []);

  // Buscar instâncias do servidor
  // Tenta modo multi-instância primeiro; cai para legado se não suportado
  const fetchInstances = useCallback(async () => {
    if (!isMountedRef.current) return;
    setIsLoading(true);
    
    try {
      // Tentar endpoint multi-instância
      const result = await callBaileysProxy('list-instances', { throwOnError: false });

      if (!isMountedRef.current) return;

      if (!result?.isError && result?.success !== false && Array.isArray(result?.instances)) {
        // Servidor suporta multi-instância — enriquecer com dados do banco
        const { data: dbConnections } = await supabase
          .from('whatsapp_connections')
          .select('id, phone_number_id, department_id')
          .eq('connection_type', 'baileys');

        if (!isMountedRef.current) return;

        // Filtrar: só mostrar instâncias que existam no banco (evita reaparecer após delete)
        const mapped: BaileysInstance[] = result.instances
          .filter((inst: any) => dbConnections?.some((c: any) => c.phone_number_id === inst.instanceId))
          .map((inst: any) => {
            const dbConn = dbConnections?.find((c: any) => c.phone_number_id === inst.instanceId);
            return {
              instanceId: inst.instanceId,
              status: (inst.status || 'disconnected') as BaileysInstance['status'],
              phone: inst.phone || null,
              hasQR: inst.hasQR || false,
              lastEventAt: inst.lastEventAt || null,
              lastError: (inst.status === 'connected') ? null : (inst.lastError || null),
              departmentId: dbConn?.department_id || null,
              connectionId: dbConn?.id || null,
            };
          });

        setInstances(mapped);
        setMaxInstances(result.maxInstances || 5);
        setServerOnline(true);

        // Sync DB statuses with server reality
        // Only update connections that are marked as connected/active in DB but NOT on the server
        // AND only for connections whose instanceId actually appeared on the server at some point
        if (dbConnections && dbConnections.length > 0 && result.instances.length > 0) {
          const serverInstanceIds = new Set(result.instances.map((inst: any) => inst.instanceId));
          const staleConnections = dbConnections.filter(
            (c: any) => !serverInstanceIds.has(c.phone_number_id)
          );
          // Only update if there are stale connections - use individual updates to avoid race conditions
          for (const stale of staleConnections) {
            // Double-check: only mark as disconnected if currently connected/active
            const { data: current } = await supabase
              .from('whatsapp_connections')
              .select('status')
              .eq('id', stale.id)
              .eq('connection_type', 'baileys')
              .in('status', ['connected', 'active'])
              .maybeSingle();
            
            if (current) {
              console.log('[BaileysInstances] Marcando conexão stale como disconnected:', stale.id, stale.phone_number_id);
              await supabase
                .from('whatsapp_connections')
                .update({ status: 'disconnected', updated_at: new Date().toISOString() })
                .eq('id', stale.id);
            }
          }
        }
      } else {
        // Fallback para modo legado (servidor sem multi-instância)
        await fetchLegacyStatus();
      }
    } catch (err) {
      console.error('Erro ao buscar instâncias, usando modo legado:', err);
      if (!isMountedRef.current) return;
      await fetchLegacyStatus();
    }
    
    if (isMountedRef.current) setIsLoading(false);
  }, [fetchLegacyStatus]);

  // Criar nova instância
  const createInstance = useCallback(async (instanceId: string, departmentId?: string) => {
    try {
      // Criar no servidor Baileys — capturar resposta sem lançar erro
      let result: any = null;
      try {
        result = await callBaileysProxy('create-instance', {
          body: { instanceId },
          throwOnError: false
        });
      } catch (proxyErr: any) {
        // supabase.functions.invoke pode lançar FunctionsHttpError para 4xx
        // Verificar se é 409 (instância já existe) — tratar como sucesso
        const errMsg = proxyErr?.message || proxyErr?.context?.message || '';
        const is409 = errMsg.includes('409') || errMsg.toLowerCase().includes('já existe') || errMsg.toLowerCase().includes('already exists');
        if (is409) {
          result = { success: false, error: 'Instância já existe' };
        } else {
          throw proxyErr;
        }
      }

      // 409 = instância já existe no servidor — tratar como sucesso e continuar
      const alreadyExists = !result?.success && (
        result?.error?.toLowerCase().includes('já existe') || 
        result?.error?.toLowerCase().includes('already exists') ||
        result?.error?.toLowerCase().includes('conflict') ||
        result?.isError === true
      );

      if (!result?.success && !alreadyExists) {
        throw new Error(result?.error || 'Erro ao criar instância');
      }

      // Criar registro no banco
      const { error: dbError } = await supabase
        .from('whatsapp_connections')
        .insert({
          connection_type: 'baileys',
          phone_number_id: instanceId,
          waba_id: instanceId,
          department_id: departmentId || null,
          status: 'disconnected',
          name: `WhatsApp ${instanceId}`
        });

      if (dbError) {
        console.error('Erro ao criar conexão no banco:', dbError);
      }

      await fetchInstances();
      toast.success('Instância criada com sucesso');
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error(message);
      return { success: false, error: message };
    }
  }, [fetchInstances]);

  // Remover instância
  // NOTA: Para servidores legados (sem multi-instância), usamos clear-session em vez de delete-instance
  // A instância "default" não pode ser deletada, apenas limpa
  const deleteInstance = useCallback(async (instanceId: string) => {
    try {
      // Para instância default/legado, limpar sessão E remover do banco
      if (instanceId === 'default') {
        // Tentar limpar sessão no servidor (ignorar erros — servidor pode estar offline)
        await callBaileysProxy('clear-session', { throwOnError: false });
        
        // Buscar connectionId do estado atual
        const defaultInstance = instances.find(i => i.instanceId === 'default');
        
        if (defaultInstance?.connectionId) {
          // Deletar pelo ID real do banco (mais preciso)
          await supabase
            .from('whatsapp_connections')
            .delete()
            .eq('id', defaultInstance.connectionId);
        } else {
          // Fallback: buscar no banco e deletar pelo ID real
          const { data: connection } = await supabase
            .from('whatsapp_connections')
            .select('id')
            .eq('connection_type', 'baileys')
            .limit(1)
            .maybeSingle();
          
          if (connection?.id) {
            await supabase
              .from('whatsapp_connections')
              .delete()
              .eq('id', connection.id);
          }
        }

        await fetchInstances();
        toast.success('Instância removida com sucesso.');
        return { success: true };
      }

      // Para instâncias multi (não-default), tentar deletar do servidor
      const result = await callBaileysProxy('delete-instance', {
        instanceId,
        throwOnError: false
      });

      // Se o endpoint não existe (404), usar clear-session como fallback
      if (result?.isError || (result?.success === false && result?.error?.includes('404'))) {
        console.log('Endpoint delete-instance não existe, usando clear-session');
        await callBaileysProxy('clear-session', { instanceId, throwOnError: false });
      } else if (result && result.success === false) {
        throw new Error(result.error || 'Erro ao remover instância');
      }

      // Remover do banco
      await supabase
        .from('whatsapp_connections')
        .delete()
        .eq('phone_number_id', instanceId)
        .eq('connection_type', 'baileys');

      await fetchInstances();
      toast.success('Instância removida com sucesso');
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error(message);
      return { success: false, error: message };
    }
  }, [fetchInstances]);

  // Conectar instância
  const connectInstance = useCallback(async (instanceId: string) => {
    try {
      const result = await callBaileysProxy('connect', {
        instanceId
      });

      if (!result.success && result.message !== 'Já conectado') {
        throw new Error(result.error || result.message || 'Erro ao conectar');
      }

      toast.info('Gerando QR Code... Aguarde!');
      
      // Atualizar após um delay para pegar o QR
      setTimeout(fetchInstances, 2000);
      
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error(message);
      return { success: false, error: message };
    }
  }, [fetchInstances]);

  // Desconectar instância
  const disconnectInstance = useCallback(async (instanceId: string) => {
    try {
      const result = await callBaileysProxy('disconnect', {
        instanceId
      });

      if (!result.success) {
        throw new Error(result.error || 'Erro ao desconectar');
      }

      // Atualizar status no banco
      await supabase
        .from('whatsapp_connections')
        .update({ status: 'disconnected', updated_at: new Date().toISOString() })
        .eq('phone_number_id', instanceId)
        .eq('connection_type', 'baileys');

      await fetchInstances();
      toast.success('Instância desconectada');
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error(message);
      return { success: false, error: message };
    }
  }, [fetchInstances]);

  // Buscar QR Code de uma instância
  const getQRCode = useCallback(async (instanceId: string) => {
    try {
      const result = await callBaileysProxy('qr', {
        instanceId
      });

      if (result.success && result.qr) {
        return { success: true, qr: result.qr };
      }

      return { success: false, message: result.message };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erro' };
    }
  }, []);

  // Buscar status de uma instância específica
  const getInstanceStatus = useCallback(async (instanceId: string) => {
    try {
      const result = await callBaileysProxy('status', {
        instanceId
      });

      return result;
    } catch (error) {
      return { status: 'error', error: error instanceof Error ? error.message : 'Erro' };
    }
  }, []);

  // Limpar sessão de uma instância
  const clearSession = useCallback(async (instanceId: string) => {
    try {
      const result = await callBaileysProxy('clear-session', {
        instanceId
      });

      if (result.success) {
        toast.success('Sessão limpa com sucesso');
        await fetchInstances();
      } else {
        throw new Error(result.error || 'Erro ao limpar sessão');
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error(message);
      return { success: false, error: message };
    }
  }, [fetchInstances]);

  // Forçar reconexão
  const forceConnect = useCallback(async (instanceId: string) => {
    try {
      const result = await callBaileysProxy('force-connect', {
        instanceId
      });

      if (result.success) {
        toast.info('Iniciando conexão limpa...');
        setTimeout(fetchInstances, 2000);
      } else {
        throw new Error(result.error || 'Erro ao forçar conexão');
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error(message);
      return { success: false, error: message };
    }
  }, [fetchInstances]);

  // Atualizar departamento de uma instância
  const updateInstanceDepartment = useCallback(async (instanceId: string, departmentId: string | null) => {
    try {
      const instance = instances.find(i => i.instanceId === instanceId);
      
      if (instance?.connectionId) {
        const { error } = await supabase
          .from('whatsapp_connections')
          .update({ department_id: departmentId, updated_at: new Date().toISOString() })
          .eq('id', instance.connectionId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('whatsapp_connections')
          .update({ department_id: departmentId, updated_at: new Date().toISOString() })
          .eq('connection_type', 'baileys');
        if (error) throw error;
      }

      await fetchInstances();
      toast.success('Departamento atualizado');
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error(message);
      return { success: false, error: message };
    }
  }, [fetchInstances, instances]);

  // Buscar instâncias ao montar
  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  // Polling para atualizar status
  useEffect(() => {
    const interval = setInterval(fetchInstances, 5000);
    return () => clearInterval(interval);
  }, [fetchInstances]);

  return {
    instances,
    isLoading,
    maxInstances,
    serverOnline,
    canAddMore: instances.length < maxInstances,
    refresh: fetchInstances,
    createInstance,
    deleteInstance,
    connectInstance,
    disconnectInstance,
    getQRCode,
    getInstanceStatus,
    clearSession,
    forceConnect,
    updateInstanceDepartment,
  };
}
