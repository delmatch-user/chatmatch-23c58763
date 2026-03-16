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

async function getAccessToken(pageId: string): Promise<string | null> {
  // 1. Try from DB (OAuth flow)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: connection } = await supabase
    .from('whatsapp_connections')
    .select('access_token')
    .eq('connection_type', 'instagram')
    .eq('waba_id', pageId)
    .maybeSingle();

  if (connection?.access_token) {
    return connection.access_token;
  }

  // 2. Fallback to env secret
  return Deno.env.get('META_INSTAGRAM_ACCESS_TOKEN') || null;
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

    const accessToken = await getAccessToken(page_id);

    if (!accessToken) {
      console.error('[Instagram Send] Access token não encontrado');
      return new Response(
        JSON.stringify({ success: false, error: 'Access token não configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    // Generate appsecret_proof
    const appSecret = Deno.env.get('META_WHATSAPP_APP_SECRET');
    let url = `https://graph.facebook.com/v25.0/${page_id}/messages`;
    if (appSecret) {
      const proof = await generateAppSecretProof(accessToken, appSecret);
      url += `?appsecret_proof=${proof}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(messagePayload)
    });

    const result = await response.json();
    console.log('[Instagram Send] Resposta da API:', result);

    if (!response.ok) {
      console.error('[Instagram Send] Erro da API Meta:', result);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: result.error?.message || 'Erro ao enviar mensagem'
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: result.message_id,
        recipientId: result.recipient_id
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
