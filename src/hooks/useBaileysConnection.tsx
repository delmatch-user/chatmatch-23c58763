import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'waiting_qr' | 'connected' | 'error';
  phone: string | null;
  qrCode: string | null;
  error: string | null;
}

export interface ServerHealth {
  isOnline: boolean;
  responseTime: number | null;
  lastCheck: Date | null;
  serverStatus: string | null;
  hasQR: boolean;
  uptime?: string;
  error?: string;
}

interface UseBaileysConnectionOptions {
  pollingInterval?: number;
  instanceId?: string; // Support for multi-instance
}

// Helper para chamar a Edge Function proxy com autenticação
async function callBaileysProxy(action: string, options?: { 
  method?: 'GET' | 'POST';
  body?: object;
  phone?: string;
  instanceId?: string;
  timeout?: number;
}) {
  const params = new URLSearchParams({ action });
  if (options?.phone) {
    params.append('phone', options.phone);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options?.timeout || 10000);

  try {
    // Use supabase.functions.invoke for proper authentication
    const bodyData: Record<string, unknown> = { action };
    if (options?.body) Object.assign(bodyData, options.body);
    if (options?.instanceId) bodyData.instanceId = options.instanceId;
    
    const { data, error } = await supabase.functions.invoke('baileys-proxy', {
      body: bodyData,
    });

    clearTimeout(timeoutId);

    if (error) {
      throw new Error(error.message || 'Erro na requisição');
    }

    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Timeout: servidor não respondeu');
    }
    throw error;
  }
}

export function useBaileysConnection({ pollingInterval = 3000 }: UseBaileysConnectionOptions = {}) {
  const [state, setState] = useState<ConnectionState>({
    status: 'disconnected',
    phone: null,
    qrCode: null,
    error: null
  });
  const [isPolling, setIsPolling] = useState(false);
  const [serverHealth, setServerHealth] = useState<ServerHealth>({
    isOnline: false,
    responseTime: null,
    lastCheck: null,
    serverStatus: null,
    hasQR: false,
  });

  // Verificar saúde do servidor
  const checkServerHealth = useCallback(async (): Promise<ServerHealth> => {
    const startTime = Date.now();
    
    try {
      const data = await callBaileysProxy('status', { timeout: 5000 });
      const responseTime = Date.now() - startTime;
      
      const health: ServerHealth = {
        isOnline: true,
        responseTime,
        lastCheck: new Date(),
        serverStatus: data.status || 'unknown',
        hasQR: data.hasQR || false,
        uptime: data.uptime,
      };
      
      setServerHealth(health);
      return health;
    } catch (error) {
      const health: ServerHealth = {
        isOnline: false,
        responseTime: null,
        lastCheck: new Date(),
        serverStatus: null,
        hasQR: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
      
      setServerHealth(health);
      return health;
    }
  }, []);

  // Buscar status do servidor
  const fetchStatus = useCallback(async () => {
    const startTime = Date.now();
    
    try {
      const data = await callBaileysProxy('status');
      const responseTime = Date.now() - startTime;
      
      // Capturar erro do servidor quando status é 'error'
      const serverError = data.status === 'error' ? data.lastError : null;
      
      setState(prev => ({
        ...prev,
        status: data.status,
        phone: data.phone,
        error: serverError
      }));

      // Atualizar saúde do servidor
      setServerHealth({
        isOnline: true,
        responseTime,
        lastCheck: new Date(),
        serverStatus: data.status,
        hasQR: data.hasQR || false,
        error: serverError || undefined,
      });

      // Se aguardando QR, buscar QR code
      if (data.status === 'waiting_qr' || data.hasQR) {
        await fetchQRCode();
      }

      return data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro de conexão';
      
      setState(prev => ({
        ...prev,
        status: 'error',
        error: errorMessage
      }));
      
      setServerHealth({
        isOnline: false,
        responseTime: null,
        lastCheck: new Date(),
        serverStatus: null,
        hasQR: false,
        error: errorMessage,
      });
      
      return null;
    }
  }, []);

  // Buscar QR Code
  const fetchQRCode = useCallback(async () => {
    try {
      const data = await callBaileysProxy('qr');
      
      if (data.success && data.qr) {
        setState(prev => ({
          ...prev,
          qrCode: data.qr,
          status: 'waiting_qr'
        }));
      }
    } catch (error) {
      console.error('Erro ao buscar QR Code:', error);
    }
  }, []);

  // Iniciar conexão
  const connect = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, status: 'connecting', error: null, qrCode: null }));
      
      const data = await callBaileysProxy('connect', { method: 'POST' });
      
      if (data.success) {
        setIsPolling(true);
      } else {
        throw new Error(data.message || 'Erro desconhecido');
      }

      return data;
    } catch (error) {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: error instanceof Error ? error.message : 'Erro ao conectar'
      }));
      return null;
    }
  }, []);

  // Desconectar
  const disconnect = useCallback(async () => {
    try {
      const data = await callBaileysProxy('disconnect', { method: 'POST' });

      setState({
        status: 'disconnected',
        phone: null,
        qrCode: null,
        error: null
      });
      setIsPolling(false);

      return data;
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Erro ao desconectar'
      }));
      return null;
    }
  }, []);

  // Enviar mensagem
  const sendMessage = useCallback(async (to: string, message: string, type: 'text' | 'image' | 'document' = 'text') => {
    try {
      const data = await callBaileysProxy('send', {
        method: 'POST',
        body: { to, message, type }
      });
      
      if (!data.success) {
        throw new Error(data.error || 'Erro ao enviar mensagem');
      }

      return data;
    } catch (error) {
      throw error;
    }
  }, []);

  // Verificar número
  const checkNumber = useCallback(async (phone: string) => {
    try {
      const data = await callBaileysProxy('check', { phone });
      return data;
    } catch (error) {
      return { success: false, error: 'Erro ao verificar número' };
    }
  }, []);

  // Limpar sessão (força novo QR)
  const clearSession = useCallback(async () => {
    try {
      const data = await callBaileysProxy('clear-session', { method: 'POST' });
      
      if (data.success) {
        setState({
          status: 'disconnected',
          phone: null,
          qrCode: null,
          error: null
        });
        setIsPolling(false);
      }

      return data;
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Erro ao limpar sessão' 
      };
    }
  }, []);

  // Forçar conexão limpa (limpa sessão e reconecta automaticamente)
  const forceConnect = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, status: 'connecting', error: null, qrCode: null }));
      
      const data = await callBaileysProxy('force-connect', { method: 'POST' });
      
      if (data.success) {
        setIsPolling(true);
      } else {
        throw new Error(data.error || 'Erro ao forçar conexão');
      }

      return data;
    } catch (error) {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: error instanceof Error ? error.message : 'Erro ao forçar conexão'
      }));
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Erro ao forçar conexão' 
      };
    }
  }, []);

  // Polling para atualizar status
  useEffect(() => {
    if (!isPolling) return;

    const interval = setInterval(async () => {
      const data = await fetchStatus();
      
      // Parar polling se conectado ou erro
      if (data?.status === 'connected' || data?.status === 'error') {
        setIsPolling(false);
      }
    }, pollingInterval);

    // Buscar status imediatamente
    fetchStatus();

    return () => clearInterval(interval);
  }, [isPolling, fetchStatus, pollingInterval]);

  // Verificar status inicial
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return {
    ...state,
    serverHealth,
    isConnected: state.status === 'connected',
    isConnecting: state.status === 'connecting' || state.status === 'waiting_qr',
    connect,
    disconnect,
    sendMessage,
    checkNumber,
    clearSession,
    forceConnect,
    refresh: fetchStatus,
    checkServerHealth,
  };
}
