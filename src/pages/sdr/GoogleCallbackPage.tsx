import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function GoogleCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code || !state) {
      setStatus('error');
      setErrorMsg('Parâmetros de autorização ausentes.');
      return;
    }

    // Notify opener (popup flow from admin)
    if (window.opener) {
      window.opener.postMessage({ type: 'google-oauth-callback', code, state }, '*');
      window.close();
      return;
    }

    // Direct navigation flow — exchange code for tokens
    const redirectUri = window.location.origin + '/comercial/google-callback';
    supabase.functions.invoke('sdr-google-calendar-oauth', {
      body: { action: 'callback', code, state, redirect_uri: redirectUri },
    }).then(({ data, error }) => {
      if (error || !data?.success) {
        setStatus('error');
        setErrorMsg(data?.error || error?.message || 'Erro ao trocar código de autorização.');
        return;
      }
      setStatus('success');
      setTimeout(() => navigate('/comercial/agenda', { replace: true }), 1500);
    });
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 text-center p-6">
        {status === 'processing' && (
          <>
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="text-muted-foreground">Conectando conta Google...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle2 className="w-12 h-12 text-green-500" />
            <p className="text-foreground font-medium">Conta Google conectada com sucesso!</p>
            <p className="text-sm text-muted-foreground">Redirecionando para a agenda...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="w-12 h-12 text-destructive" />
            <p className="text-foreground font-medium">Erro na conexão</p>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <Button variant="outline" onClick={() => navigate('/comercial/agenda', { replace: true })}>
              Voltar para Agenda
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
