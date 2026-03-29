import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface SendRequest {
  page_id: string;
  ig_account_id?: string; // Instagram Business Account ID (phone_number_id) — endpoint primário
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

async function getAccessTokenCandidates(pageId: string, igAccountId?: string): Promise<{ token: string; source: string }[]> {
  const candidates: { token: string; source: string }[] = [];
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Buscar token prioritariamente pelo Instagram Business Account ID (phone_number_id)
  if (igAccountId) {
    const { data: connByAccount } = await supabase
      .from('whatsapp_connections')
      .select('access_token')
      .eq('connection_type', 'instagram')
      .eq('phone_number_id', igAccountId)
      .maybeSingle();
    const dbTokenByAccount = (connByAccount?.access_token || '').trim();
    if (dbTokenByAccount) candidates.push({ token: dbTokenByAccount, source: 'db_account' });
  }

  // Fallback: buscar pelo Facebook Page ID (waba_id)
  if (pageId) {
    const { data: connByPage } = await supabase
      .from('whatsapp_connections')
      .select('access_token')
      .eq('connection_type', 'instagram')
      .eq('waba_id', pageId)
      .maybeSingle();
    const dbTokenByPage = (connByPage?.access_token || '').trim();
    if (dbTokenByPage && !candidates.some(c => c.token === dbTokenByPage)) {
      candidates.push({ token: dbTokenByPage, source: 'db_page' });
    }
  }

  const envToken = (Deno.env.get('META_INSTAGRAM_ACCESS_TOKEN') || '').trim();
  if (envToken && !candidates.some(c => c.token === envToken)) {
    candidates.push({ token: envToken, source: 'env' });
  }

  return candidates;
}

async function generateAppSecretProof(accessToken: string, appSecret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(accessToken));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function parseGraphError(result: any): { code: number | null; message: string } {
  return {
    code: typeof result?.error?.code === 'number' ? result.error.code : null,
    message: result?.error?.message || 'Erro desconhecido',
  };
}

function isPageAccessTokenRequired(code: number | null, message: string): boolean {
  return code === 190 && message.includes('Page Access Token');
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

async function derivePageAccessToken(
  pageId: string,
  token: string,
  appSecret: string | null
): Promise<{ token: string; strategy: 'page_fields' | 'me_accounts' } | null> {
  // Strategy 1: read page access_token directly from page object
  const pageUrl = `https://graph.facebook.com/v25.0/${pageId}?fields=access_token`;
  const pageRes = await fetchWithProofFallback(pageUrl, token, appSecret, 'GET');
  const pageData = await pageRes.response.json().catch(() => ({}));
  console.log(`[Instagram Send] derivePageAccessToken strategy1 (page_fields): ok=${pageRes.response.ok}, hasToken=${!!pageData?.access_token}, error=${pageData?.error?.message || 'none'}`);
  if (pageRes.response.ok && typeof pageData?.access_token === 'string' && pageData.access_token.trim()) {
    return { token: pageData.access_token.trim(), strategy: 'page_fields' };
  }

  // Strategy 2: list accounts and pick matching page token
  const accountsUrl = 'https://graph.facebook.com/v25.0/me/accounts?fields=id,access_token';
  const accountsRes = await fetchWithProofFallback(accountsUrl, token, appSecret, 'GET');
  const accountsData = await accountsRes.response.json().catch(() => ({}));
  const accountIds = Array.isArray(accountsData?.data) ? accountsData.data.map((a: any) => a?.id) : [];
  console.log(`[Instagram Send] derivePageAccessToken strategy2 (me_accounts): ok=${accountsRes.response.ok}, accounts=${JSON.stringify(accountIds)}, lookingFor=${pageId}`);

  if (accountsRes.response.ok && Array.isArray(accountsData?.data)) {
    const match = accountsData.data.find((item: any) => String(item?.id) === String(pageId));
    const derivedToken = (match?.access_token || '').trim();
    if (derivedToken) {
      return { token: derivedToken, strategy: 'me_accounts' };
    }
  }

  console.warn(`[Instagram Send] derivePageAccessToken: nenhuma estratégia funcionou para pageId=${pageId}`);
  return null;
}

async function persistDerivedDbToken(pageId: string, igAccountId: string | undefined, oldToken: string, newToken: string): Promise<void> {
  if (!oldToken || !newToken || oldToken === newToken) return;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Try updating by ig_account_id (phone_number_id) first, then by page_id (waba_id)
  let updated = false;

  if (igAccountId) {
    const { error, count } = await supabase
      .from('whatsapp_connections')
      .update({ access_token: newToken, updated_at: new Date().toISOString() })
      .eq('connection_type', 'instagram')
      .eq('phone_number_id', igAccountId)
      .eq('access_token', oldToken);

    if (!error && (count ?? 0) > 0) {
      updated = true;
      console.log('[Instagram Send] Token de página persistido (via ig_account_id)');
    }
  }

  if (!updated && pageId) {
    const { error } = await supabase
      .from('whatsapp_connections')
      .update({ access_token: newToken, updated_at: new Date().toISOString() })
      .eq('connection_type', 'instagram')
      .eq('waba_id', pageId)
      .eq('access_token', oldToken);

    if (error) {
      console.warn('[Instagram Send] Não foi possível persistir token derivado:', error.message);
    } else {
      console.log('[Instagram Send] Token de página persistido (via waba_id)');
    }
  }
}

async function callGraphAPI(
  pageId: string,
  payload: any,
  tokenCandidates: { token: string; source: string }[],
  appSecret: string | null,
  igAccountId?: string
): Promise<{ ok: boolean; result: any; status: number; error: string }> {
  let lastError = 'Nenhum token disponível';
  let lastStatus = 500;

  for (const candidate of tokenCandidates) {
    // Endpoint primário: Instagram Business Account ID (ig-user-id/messages)
    // Endpoint fallback: Facebook Page ID (page-id/messages)
    const primaryEndpointId = igAccountId || pageId;
    const url = `https://graph.facebook.com/v25.0/${primaryEndpointId}/messages`;
    const originalToken = candidate.token;
    let activeToken = candidate.token;
    let triedDerive = false;

    while (true) {
      console.log(`[Instagram Send] Tentando com token ${candidate.source} (${activeToken.substring(0, 8)}...), secret: ${appSecret ? 'yes' : 'none'}`);

      const { response } = await fetchWithProofFallback(url, activeToken, appSecret, 'POST', JSON.stringify(payload));
      const result = await response.json().catch(() => ({}));

      if (response.ok) {
        console.log('[Instagram Send] Sucesso:', { source: candidate.source, messageId: result.message_id });
        return { ok: true, result, status: 200, error: '' };
      }

      const { code, message } = parseGraphError(result);
      const isExpiredToken = message.includes('Session has expired');
      const needsPageToken = isPageAccessTokenRequired(code, message);

      lastStatus = response.status;
      lastError = message;

      console.warn(`[Instagram Send] Falha: source=${candidate.source}, status=${response.status}, code=${code}, expired=${isExpiredToken}, pageTokenRequired=${needsPageToken}, msg=${message}`);

      if (needsPageToken && !triedDerive) {
        triedDerive = true;
        console.log(`[Instagram Send] Token requer Page Access Token. Tentando derivar para pageId=${pageId}...`);
        const derived = await derivePageAccessToken(pageId, activeToken, appSecret);

        if (derived && derived.token !== activeToken) {
          console.log(`[Instagram Send] Token de página derivado via ${derived.strategy} para source=${candidate.source}`);
          activeToken = derived.token;

          if (candidate.source.startsWith('db')) {
            await persistDerivedDbToken(pageId, igAccountId, originalToken, derived.token);
          }

          continue;
        }

        lastStatus = 401;
        lastError = `Token inválido (${candidate.source}): a Meta exige Page Access Token para esta página`;
        break;
      }

      if (isExpiredToken || code === 190) {
        lastStatus = 401;
        lastError = `Token inválido (${candidate.source}): ${message}`;
        break;
      }

      // Se o endpoint primário falhou com erro não-auth e existe um endpoint alternativo, tentar ele
      if (igAccountId && primaryEndpointId === igAccountId && pageId && pageId !== igAccountId) {
        console.warn(`[Instagram Send] Endpoint ig_account_id falhou (code=${code}). Tentando page_id...`);
        const fallbackUrl = `https://graph.facebook.com/v25.0/${pageId}/messages`;
        const { response: fbRes } = await fetchWithProofFallback(fallbackUrl, activeToken, appSecret, 'POST', JSON.stringify(payload));
        const fbResult = await fbRes.json().catch(() => ({}));
        if (fbRes.ok) {
          console.log('[Instagram Send] Sucesso via page_id fallback:', { source: candidate.source, messageId: fbResult.message_id });
          return { ok: true, result: fbResult, status: 200, error: '' };
        }
        const fallbackErr = parseGraphError(fbResult);
        lastStatus = fbRes.status;
        lastError = fallbackErr.message;
        console.warn(`[Instagram Send] Fallback page_id também falhou: code=${fallbackErr.code}, msg=${fallbackErr.message}`);

        // Se fallback falhou com "Page Access Token", tentar derivar token de página
        if (isPageAccessTokenRequired(fallbackErr.code, fallbackErr.message) && !triedDerive) {
          triedDerive = true;
          console.log(`[Instagram Send] Fallback requer Page Access Token. Derivando para pageId=${pageId}...`);
          const derived = await derivePageAccessToken(pageId, activeToken, appSecret);
          if (derived && derived.token !== activeToken) {
            console.log(`[Instagram Send] Token de página derivado via ${derived.strategy}. Retentando fallback...`);
            const derivedToken = derived.token;

            // Persistir token derivado
            if (candidate.source.startsWith('db')) {
              await persistDerivedDbToken(pageId, igAccountId, originalToken, derivedToken);
            }

            // Retentar com token derivado no endpoint page_id
            const { response: retryRes } = await fetchWithProofFallback(fallbackUrl, derivedToken, appSecret, 'POST', JSON.stringify(payload));
            const retryResult = await retryRes.json().catch(() => ({}));
            if (retryRes.ok) {
              console.log('[Instagram Send] Sucesso via page_id + token derivado:', { source: candidate.source, messageId: retryResult.message_id });
              return { ok: true, result: retryResult, status: 200, error: '' };
            }
            const retryErr = parseGraphError(retryResult);
            lastStatus = retryRes.status;
            lastError = retryErr.message;
            console.warn(`[Instagram Send] Retry com token derivado falhou: code=${retryErr.code}, msg=${retryErr.message}`);
          }
        }
      }

      // non-auth error: stop trying this and next candidates
      return { ok: false, result: null, status: lastStatus, error: lastError };
    }
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
    const { page_id, ig_account_id, recipient_id, message, type = 'text', media_url } = body;
    console.log('[Instagram Send] Enviando mensagem:', { page_id, ig_account_id, recipient_id, type });

    const tokenCandidates = await getAccessTokenCandidates(page_id, ig_account_id);
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

    const { ok, result, status, error } = await callGraphAPI(page_id, messagePayload, tokenCandidates, appSecret, ig_account_id);

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
