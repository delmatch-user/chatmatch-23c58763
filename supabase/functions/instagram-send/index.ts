import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface SendRequest {
  page_id: string;
  recipient_id: string;
  message: string;
  type?: 'text' | 'image' | 'video' | 'file';
  media_url?: string;
}

async function getAccessTokenCandidates(pageId: string): Promise<string[]> {
  const tokens: string[] = [];

  const envToken = (Deno.env.get('META_INSTAGRAM_ACCESS_TOKEN') || '').trim();
  if (envToken) {
    tokens.push(envToken);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: connection } = await supabase
    .from('whatsapp_connections')
    .select('access_token')
    .eq('connection_type', 'instagram')
    .eq('waba_id', pageId)
    .maybeSingle();

  const dbToken = (connection?.access_token || '').trim();
  if (dbToken && !tokens.includes(dbToken)) {
    tokens.push(dbToken);
  }

  return tokens;
}

async function generateAppSecretProof(accessToken: string, appSecret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(accessToken));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function getInstagramAppSecretCandidates(): string[] {
  const instagramSecret = (Deno.env.get('META_INSTAGRAM_APP_SECRET') || '').trim();
  const whatsappSecret = (Deno.env.get('META_WHATSAPP_APP_SECRET') || '').trim();

  return Array.from(new Set([instagramSecret, whatsappSecret].filter(Boolean)));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const body: SendRequest = await req.json();
    const { page_id, recipient_id, message, type = 'text', media_url } = body;

    console.log('[Instagram Send] Enviando mensagem:', { page_id, recipient_id, type });

    const tokenCandidates = await getAccessTokenCandidates(page_id);

    if (tokenCandidates.length === 0) {
      console.error('[Instagram Send] Access token não encontrado');
      return new Response(
        JSON.stringify({ success: false, error: 'Access token não configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const appSecrets = getInstagramAppSecretCandidates();
    const attempts = appSecrets.length > 0
      ? tokenCandidates.flatMap((token) => appSecrets.map((secret) => ({ token, secret })))
      : tokenCandidates.map((token) => ({ token, secret: '' }));

    // Build message payload
    let messagePayload: any;

    if (type === 'text') {
      messagePayload = {
        recipient: { id: recipient_id },
        message: { text: message },
        messaging_type: 'RESPONSE'
      };
    } else {
      messagePayload = {
        recipient: { id: recipient_id },
        message: {
          attachment: {
            type: type === 'file' ? 'file' : type,
            payload: { url: media_url, is_reusable: true }
          }
        },
        messaging_type: 'RESPONSE'
      };
    }

    let successResult: any = null;
    let lastStatus = 400;
    let lastError = 'Erro ao enviar mensagem';
    let expiredTokenError = '';

    for (const attempt of attempts) {
      let url = `https://graph.facebook.com/v25.0/${page_id}/messages`;
      if (attempt.secret) {
        const proof = await generateAppSecretProof(attempt.token, attempt.secret);
        url += `?appsecret_proof=${proof}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${attempt.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(messagePayload)
      });

      const result = await response.json();
      console.log('[Instagram Send] Resposta da API:', result);

      if (response.ok) {
        successResult = result;
        break;
      }

      lastStatus = response.status;
      lastError = result.error?.message || 'Erro ao enviar mensagem';
      const isProofError = String(lastError).includes('appsecret_proof');
      const isExpiredToken = String(lastError).includes('Session has expired') || result?.error?.code === 190;
      console.warn('[Instagram Send] Tentativa falhou:', {
        status: response.status,
        isProofError,
        isExpiredToken,
        tokenPrefix: attempt.token.substring(0, 10),
        secretPrefix: attempt.secret ? attempt.secret.substring(0, 4) : 'none'
      });

      if (!isProofError && !isExpiredToken) {
        break;
      }
    }

    if (!successResult) {
      console.error('[Instagram Send] Erro da API Meta:', lastError);
      return new Response(
        JSON.stringify({ success: false, error: lastError }),
        { status: lastStatus, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: successResult.message_id,
        recipientId: successResult.recipient_id
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[Instagram Send] Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
