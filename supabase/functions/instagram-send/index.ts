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

function looksLikeAccessToken(value: string): boolean {
  return value.startsWith('EAA') || value.length > 80;
}

function getAppSecret(): string | null {
  const igSecret = (Deno.env.get('META_INSTAGRAM_APP_SECRET') || '').trim();
  if (igSecret && !looksLikeAccessToken(igSecret)) return igSecret;
  const waSecret = (Deno.env.get('META_WHATSAPP_APP_SECRET') || '').trim();
  if (waSecret && !looksLikeAccessToken(waSecret)) return waSecret;
  return null;
}

async function getAccessTokenCandidates(pageId: string): Promise<{ token: string; source: string }[]> {
  const candidates: { token: string; source: string }[] = [];
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: connection } = await supabase
    .from('whatsapp_connections')
    .select('access_token')
    .eq('connection_type', 'instagram')
    .eq('waba_id', pageId)
    .maybeSingle();

  const dbToken = (connection?.access_token || '').trim();
  if (dbToken) candidates.push({ token: dbToken, source: 'db' });

  const envToken = (Deno.env.get('META_INSTAGRAM_ACCESS_TOKEN') || '').trim();
  if (envToken && envToken !== dbToken) candidates.push({ token: envToken, source: 'env' });

  return candidates;
}

async function generateAppSecretProof(accessToken: string, appSecret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(accessToken));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function fetchWithProofFallback(
  baseUrl: string,
  token: string,
  appSecret: string | null,
  method: string,
  body?: string
): Promise<{ response: Response; usedProof: boolean }> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const fetchOpts: RequestInit = { method, headers, ...(body ? { body } : {}) };

  // Try WITH proof first
  if (appSecret) {
    const proof = await generateAppSecretProof(token, appSecret);
    const separator = baseUrl.includes('?') ? '&' : '?';
    const urlWithProof = `${baseUrl}${separator}appsecret_proof=${proof}`;
    const res = await fetch(urlWithProof, fetchOpts);

    if (res.ok) return { response: res, usedProof: true };

    const cloned = res.clone();
    const result = await cloned.json().catch(() => ({}));
    const errMsg = result?.error?.message || '';
    const errCode = result?.error?.code;
    const isProofError = String(errMsg).includes('appsecret_proof') || errCode === 100;

    if (isProofError) {
      console.warn('[Instagram Send] appsecret_proof inválido (code 100). Tentando SEM proof...');
      const retryRes = await fetch(baseUrl, fetchOpts);
      if (retryRes.ok) {
        console.warn('[Instagram Send] ⚠️ Funcionou SEM proof — META_INSTAGRAM_APP_SECRET está INCORRETO. Corrija para maior segurança.');
      }
      return { response: retryRes, usedProof: false };
    }

    // Other error (expired token, permissions, etc.) — return as-is
    return { response: res, usedProof: true };
  }

  // No secret — call without proof
  const res = await fetch(baseUrl, fetchOpts);
  return { response: res, usedProof: false };
}

async function callGraphAPI(
  pageId: string,
  payload: any,
  tokenCandidates: { token: string; source: string }[],
  appSecret: string | null
): Promise<{ ok: boolean; result: any; status: number; error: string }> {
  let lastError = 'Nenhum token disponível';
  let lastStatus = 500;

  for (const { token, source } of tokenCandidates) {
    const url = `https://graph.facebook.com/v25.0/${pageId}/messages`;
    console.log(`[Instagram Send] Tentando com token ${source} (${token.substring(0, 8)}...), secret: ${appSecret ? 'yes' : 'none'}`);

    const { response } = await fetchWithProofFallback(url, token, appSecret, 'POST', JSON.stringify(payload));
    const result = await response.json();

    if (response.ok) {
      console.log('[Instagram Send] Sucesso:', { source, messageId: result.message_id });
      return { ok: true, result, status: 200, error: '' };
    }

    const errMsg = result?.error?.message || 'Erro desconhecido';
    const errCode = result?.error?.code;
    lastStatus = response.status;
    lastError = errMsg;

    const isExpiredToken = String(errMsg).includes('Session has expired') || errCode === 190;
    console.warn(`[Instagram Send] Falha: source=${source}, status=${response.status}, code=${errCode}, expired=${isExpiredToken}, msg=${errMsg}`);

    if (isExpiredToken) {
      lastStatus = 401;
      lastError = `Token expirado (${source}): ${errMsg}`;
      continue;
    }

    break;
  }

  return { ok: false, result: null, status: lastStatus, error: lastError };
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
      return new Response(
        JSON.stringify({ success: false, error: 'Access token não configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const appSecret = getAppSecret();
    if (!appSecret) console.warn('[Instagram Send] Nenhum App Secret válido encontrado');

    let messagePayload: any;
    if (type === 'text') {
      messagePayload = { recipient: { id: recipient_id }, message: { text: message }, messaging_type: 'RESPONSE' };
    } else {
      messagePayload = {
        recipient: { id: recipient_id },
        message: { attachment: { type: type === 'file' ? 'file' : type, payload: { url: media_url, is_reusable: true } } },
        messaging_type: 'RESPONSE'
      };
    }

    const { ok, result, status, error } = await callGraphAPI(page_id, messagePayload, tokenCandidates, appSecret);

    if (!ok) {
      return new Response(
        JSON.stringify({ success: false, error }),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, messageId: result.message_id, recipientId: result.recipient_id }),
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
