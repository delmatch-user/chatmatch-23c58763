import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ===== Shared helpers =====

function looksLikeAccessToken(value: string): boolean {
  return value.startsWith('EAA') || value.length > 80;
}

function getAppSecrets(): string[] {
  const igSecret = (Deno.env.get('META_INSTAGRAM_APP_SECRET') || '').trim();
  const waSecret = (Deno.env.get('META_WHATSAPP_APP_SECRET') || '').trim();

  return [igSecret, waSecret]
    .filter((secret) => !!secret && !looksLikeAccessToken(secret))
    .filter((secret, index, arr) => arr.indexOf(secret) === index);
}

async function generateAppSecretProof(token: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(token));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getAccessTokens(connectionAccessToken?: string): { token: string; source: string }[] {
  const candidates: { token: string; source: string }[] = [];
  const dbToken = (connectionAccessToken || '').trim();
  if (dbToken) candidates.push({ token: dbToken, source: 'db' });
  const envToken = (Deno.env.get('META_INSTAGRAM_ACCESS_TOKEN') || '').trim();
  if (envToken && envToken !== dbToken) candidates.push({ token: envToken, source: 'env' });
  return candidates;
}

function parseGraphError(result: any): { code: number | null; message: string } {
  return {
    code: typeof result?.error?.code === 'number' ? result.error.code : null,
    message: result?.error?.message || 'Erro desconhecido',
  };
}

/** Generic fetch with appsecret_proof fallback on code 100 */
async function fetchWithProofFallback(
  baseUrl: string,
  token: string,
  appSecrets: string[],
  method: string,
  body?: string
): Promise<Response> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const fetchOpts: RequestInit = { method, headers, ...(body ? { body } : {}) };

  if (appSecrets.length === 0) {
    return await fetch(baseUrl, fetchOpts);
  }

  let hadProofError = false;

  for (let i = 0; i < appSecrets.length; i++) {
    const secret = appSecrets[i];
    const secretLabel = i === 0 ? 'secret[0]' : 'secret[fallback]';
    const proof = await generateAppSecretProof(token, secret);
    const separator = baseUrl.includes('?') ? '&' : '?';
    const urlWithProof = `${baseUrl}${separator}appsecret_proof=${proof}`;
    const res = await fetch(urlWithProof, fetchOpts);

    if (res.ok) return res;

    const cloned = res.clone();
    const result = await cloned.json().catch(() => ({}));
    const errMsg = result?.error?.message || '';
    const errCode = result?.error?.code;
    const isProofError = String(errMsg).includes('appsecret_proof') || errCode === 100;

    if (isProofError) {
      hadProofError = true;
      console.warn(`[IG] appsecret_proof inválido com ${secretLabel}. Tentando próximo secret...`);
      continue;
    }

    return res;
  }

  // Fallback final sem proof (apenas para apps/configs que não exigem)
  const retryRes = await fetch(baseUrl, fetchOpts);
  if (retryRes.ok && hadProofError) {
    console.warn('[IG] ⚠️ Funcionou SEM proof — revisar META_INSTAGRAM_APP_SECRET / META_WHATSAPP_APP_SECRET.');
  }
  return retryRes;
}

// ===== Derive Page Access Token (same strategy as instagram-send) =====

async function derivePageAccessToken(
  pageId: string,
  token: string,
  appSecrets: string[]
): Promise<{ token: string; strategy: string } | null> {
  // Strategy 1: read page access_token directly
  try {
    const pageUrl = `https://graph.facebook.com/v25.0/${pageId}?fields=access_token`;
    const pageRes = await fetchWithProofFallback(pageUrl, token, appSecrets, 'GET');
    const pageData = await pageRes.json().catch(() => ({}));
    if (pageRes.ok && typeof pageData?.access_token === 'string' && pageData.access_token.trim()) {
      console.log('[IG] Page token derivado via page_fields');
      return { token: pageData.access_token.trim(), strategy: 'page_fields' };
    }
  } catch (e) {
    console.warn('[IG] Erro derivando page token (strategy 1):', e);
  }

  // Strategy 2: list accounts
  try {
    const accountsUrl = 'https://graph.facebook.com/v25.0/me/accounts?fields=id,access_token';
    const accountsRes = await fetchWithProofFallback(accountsUrl, token, appSecrets, 'GET');
    const accountsData = await accountsRes.json().catch(() => ({}));
    if (accountsRes.ok && Array.isArray(accountsData?.data)) {
      const match = accountsData.data.find((item: any) => String(item?.id) === String(pageId));
      const derivedToken = (match?.access_token || '').trim();
      if (derivedToken) {
        console.log('[IG] Page token derivado via me_accounts');
        return { token: derivedToken, strategy: 'me_accounts' };
      }
    }
  } catch (e) {
    console.warn('[IG] Erro derivando page token (strategy 2):', e);
  }

  return null;
}

async function persistDerivedToken(igAccountId: string, oldToken: string, newToken: string): Promise<void> {
  if (!oldToken || !newToken || oldToken === newToken) return;
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { error } = await supabase
    .from('whatsapp_connections')
    .update({ access_token: newToken, updated_at: new Date().toISOString() })
    .eq('connection_type', 'instagram')
    .eq('phone_number_id', igAccountId)
    .eq('access_token', oldToken);
  if (error) {
    console.warn('[IG] Não foi possível persistir token derivado:', error.message);
  } else {
    console.log('[IG] Token de página persistido no banco');
  }
}

// ===== Fetch IG profile (with token derivation fallback) =====

async function fetchIGProfile(
  senderId: string,
  tokenCandidates: { token: string; source: string }[],
  igAccountId: string
): Promise<{ name?: string; username?: string; profilePic?: string }> {
  const appSecrets = getAppSecrets();

  for (const { token, source } of tokenCandidates) {
    let activeToken = token;
    let triedDerive = false;

    while (true) {
      try {
        const baseUrl = `https://graph.facebook.com/v25.0/${senderId}?fields=name,username,profile_pic&access_token=${activeToken}`;
        const res = await fetchWithProofFallback(baseUrl, activeToken, appSecrets, 'GET');

        if (res.ok) {
          const data = await res.json();
          console.log(`[IG] Perfil obtido via ${source}${triedDerive ? ' (derived)' : ''}:`, data.name, data.username);

          // Persist derived token if it worked
          if (triedDerive && activeToken !== token) {
            await persistDerivedToken(igAccountId, token, activeToken);
          }

          return { name: data.name || undefined, username: data.username || undefined, profilePic: data.profile_pic || undefined };
        }

        const errText = await res.text();
        let errCode: number | null = null;
        let errMsg = '';
        try {
          const errJson = JSON.parse(errText);
          const parsed = parseGraphError(errJson);
          errCode = parsed.code;
          errMsg = parsed.message;
        } catch { errMsg = errText.substring(0, 200); }

        const isExpired = errMsg.includes('Session has expired') || errCode === 190;
        const isPermissionError = res.status === 403 || errCode === 10 || errCode === 200 || errCode === 100;
        const needsPageToken = errCode === 190 && errMsg.includes('Page Access Token');

        console.warn(`[IG] Perfil falhou (${source}${triedDerive ? '/derived' : ''}): status=${res.status}, code=${errCode}, msg=${errMsg.substring(0, 100)}`);

        // Try deriving page token if we haven't yet
        if (!triedDerive && (needsPageToken || isPermissionError || res.status === 403)) {
          triedDerive = true;
          console.log(`[IG] Tentando derivar Page Access Token para ${igAccountId}...`);
          const derived = await derivePageAccessToken(igAccountId, token, appSecrets);
          if (derived) {
            activeToken = derived.token;
            continue; // retry with derived token
          }
          console.warn('[IG] Não foi possível derivar Page Access Token');
        }

        // If expired, try next candidate
        if (isExpired) break;
        // Other error, stop trying this candidate
        break;
      } catch (e) {
        console.warn(`[IG] Erro fetch perfil (${source}):`, e);
        break;
      }
    }
  }

  return {};
}

// ===== Send message via Graph API =====

async function sendInstagramMessage(
  pageId: string,
  recipientId: string,
  text: string,
  tokenCandidates: { token: string; source: string }[]
): Promise<{ sent: boolean; messageId?: string }> {
  const appSecrets = getAppSecrets();
  const payload = { recipient: { id: recipientId }, message: { text }, messaging_type: 'RESPONSE' };

  for (const { token, source } of tokenCandidates) {
    const url = `https://graph.facebook.com/v25.0/${pageId}/messages`;
    const res = await fetchWithProofFallback(url, token, appSecrets, 'POST', JSON.stringify(payload));
    const result = await res.json();

    if (res.ok) {
      console.log(`[IG] Robot reply sent via ${source}`);
      return { sent: true, messageId: result.message_id };
    }

    const errMsg = result?.error?.message || '';
    const isExpired = String(errMsg).includes('Session has expired') || result?.error?.code === 190;
    console.warn(`[IG] Send falhou (${source}): ${res.status}, expired=${isExpired}`);

    if (isExpired) continue;
    break;
  }

  return { sent: false };
}

// ===== Media persistence =====

async function persistMedia(
  mediaUrl: string, mimeType: string, accessToken: string, supabase: any
): Promise<{ publicUrl: string; size: number } | null> {
  try {
    let res = await fetch(mediaUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    if (!res.ok) {
      res = await fetch(mediaUrl);
      if (!res.ok) return null;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const ext = mimeType.split('/')[1]?.split(';')[0] || 'bin';
    const fileName = `${Date.now()}_ig_${Math.random().toString(36).substring(7)}.${ext}`;
    const { error } = await supabase.storage.from('chat-uploads').upload(fileName, bytes, { contentType: mimeType, upsert: false });
    if (error) return null;
    const { data: { publicUrl } } = supabase.storage.from('chat-uploads').getPublicUrl(fileName);
    return { publicUrl, size: bytes.length };
  } catch (e) {
    console.error('[IG Media] Erro:', e);
    return null;
  }
}

function mapAttachmentType(attType: string): { mimePrefix: string; messageType: string; label: string } {
  switch (attType) {
    case 'image': return { mimePrefix: 'image/jpeg', messageType: 'image', label: '📷 Imagem' };
    case 'video': return { mimePrefix: 'video/mp4', messageType: 'video', label: '🎬 Vídeo' };
    case 'audio': return { mimePrefix: 'audio/mpeg', messageType: 'audio', label: '🎤 Áudio' };
    case 'story_mention': return { mimePrefix: 'image/jpeg', messageType: 'story_mention', label: '📸 Menção no Story' };
    default: return { mimePrefix: 'application/octet-stream', messageType: 'file', label: '📎 Arquivo' };
  }
}

// ===== Main handler =====

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // ===== GET: Webhook verification =====
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe') {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const { data: conn } = await supabase
        .from('whatsapp_connections')
        .select('verify_token')
        .eq('connection_type', 'instagram')
        .maybeSingle();

      if (conn?.verify_token === token) {
        return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
      }
    }
    return new Response('Forbidden', { status: 403 });
  }

  // ===== POST: Incoming messages =====
  if (req.method === 'POST') {
    try {
      const bodyText = await req.text();
      const payload = JSON.parse(bodyText);

      if (payload.object !== 'instagram') {
        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

      for (const entry of payload.entry || []) {
        const igAccountId = entry.id;
        const { data: connection } = await supabase
          .from('whatsapp_connections')
          .select('*')
          .eq('connection_type', 'instagram')
          .eq('phone_number_id', igAccountId)
          .maybeSingle();

        if (!connection) {
          console.warn('[IG Webhook] Conexão não encontrada:', igAccountId);
          continue;
        }

        const tokenCandidates = getAccessTokens(connection.access_token);
        const primaryToken = tokenCandidates[0]?.token || '';

        for (const messaging of entry.messaging || []) {
          const senderId = messaging.sender?.id;
          const message = messaging.message;

          // Handle reactions
          if (messaging.reaction && senderId) {
            const reaction = messaging.reaction;
            if (reaction.mid && reaction.action !== 'unreact') {
              const { data: msg } = await supabase.from('messages').select('id').eq('external_id', reaction.mid).maybeSingle();
              if (msg) {
                await supabase.from('message_reactions').insert({
                  message_id: msg.id, external_message_id: reaction.mid,
                  emoji: reaction.emoji || '❤️', sender_phone: `ig:${senderId}`
                });
              }
            }
            continue;
          }

          if (!message || !senderId || message.is_echo) continue;

          // Fetch IG profile (now with token derivation fallback)
          const profile = await fetchIGProfile(senderId, tokenCandidates, igAccountId);

          // Process message content
          let messageType = 'text';
          let content = '';
          let previewLabel = '';

          if (message.text && (!message.attachments || message.attachments.length === 0)) {
            content = message.text;
            previewLabel = content;
          } else if (message.attachments?.length > 0) {
            const attachments: any[] = [];
            for (const att of message.attachments) {
              const attType = att.type || 'file';
              const mediaUrl = att.payload?.url;
              const mapped = mapAttachmentType(attType);
              messageType = mapped.messageType;
              previewLabel = mapped.label;
              const isStoryMention = attType === 'story_mention';
              if (mediaUrl) {
                // Story mention URLs are CDN temporary - try to persist
                const mimeToUse = isStoryMention ? (mediaUrl.includes('.mp4') ? 'video/mp4' : 'image/jpeg') : mapped.mimePrefix;
                const persisted = await persistMedia(mediaUrl, mimeToUse, primaryToken, supabase);
                if (persisted) {
                  attachments.push({ name: `instagram_${attType}_${Date.now()}`, url: persisted.publicUrl, type: mimeToUse, size: persisted.size, ...(isStoryMention && { isStoryMention: true }) });
                } else {
                  attachments.push({ name: `instagram_${attType}`, url: mediaUrl, type: mimeToUse, ...(isStoryMention && { isStoryMention: true }) });
                }
              }
            }
            content = attachments.length > 0 ? JSON.stringify(attachments) : '[Mídia]';
            if (!attachments.length) previewLabel = '📎 Mídia';
            if (message.text) previewLabel = message.text;
          } else {
            content = '[Mídia]';
            previewLabel = '📎 Mídia';
          }

          // Contact handling
          const contactPhone = `ig:${senderId}`;
          let { data: contact } = await supabase.from('contacts').select('*').eq('phone', contactPhone).maybeSingle();
          const displayName = profile.name || (profile.username ? `@${profile.username}` : `Instagram ${senderId.slice(-6)}`);

          // Build notes with ig_username if available
          const buildNotes = (existingNotes?: string | null): string | null => {
            if (!profile.username) return existingNotes || null;
            const tag = `ig_username:${profile.username}`;
            if (existingNotes && existingNotes.includes('ig_username:')) {
              return existingNotes.replace(/ig_username:[^\s|]+/, tag);
            }
            return existingNotes ? `${existingNotes}|${tag}` : tag;
          };

          if (!contact) {
            const { data: nc, error: ce } = await supabase.from('contacts')
              .insert({ name: displayName, phone: contactPhone, channel: 'instagram', avatar_url: profile.profilePic || null, notes: buildNotes(null) })
              .select().single();
            if (ce) { console.error('[IG] Erro contato:', ce); continue; }
            contact = nc;
          } else {
            const updates: any = {};
            // Update name if current name is a placeholder (Instagram XXXX, @handle, ig:ID, desconhecido)
            const isPlaceholderName =
              contact.name.startsWith('Instagram ') ||
              contact.name.startsWith('@') ||
              contact.name.startsWith('ig:') ||
              contact.name === 'Desconhecido';

            if (!contact.name_edited && isPlaceholderName && profile.name) {
              updates.name = profile.name;
            } else if (!contact.name_edited && isPlaceholderName && !profile.name && profile.username) {
              updates.name = `@${profile.username}`;
            } else if (!contact.name_edited && contact.name.startsWith('ig:')) {
              updates.name = `Instagram ${senderId.slice(-6)}`;
            }

            if (profile.profilePic && !contact.avatar_url) updates.avatar_url = profile.profilePic;
            // Update username in notes if changed or missing
            const newNotes = buildNotes(contact.notes);
            if (newNotes && newNotes !== contact.notes) updates.notes = newNotes;
            if (Object.keys(updates).length > 0) {
              await supabase.from('contacts').update(updates).eq('id', contact.id);
              // Update local reference
              if (updates.name) contact.name = updates.name;
              if (updates.notes) contact.notes = updates.notes;
            }
          }

          // Conversation handling
          let { data: conv } = await supabase.from('conversations').select('*')
            .eq('contact_id', contact.id).in('status', ['em_fila', 'em_atendimento', 'pendente']).maybeSingle();

          const finalPreview = (previewLabel || content).slice(0, 100);

          if (!conv) {
            const { data: nc, error: ce } = await supabase.from('conversations')
              .insert({ contact_id: contact.id, department_id: connection.department_id, status: 'em_fila', channel: 'instagram', external_id: senderId, last_message_preview: finalPreview })
              .select().single();
            if (ce) { console.error('[IG] Erro conversa:', ce); continue; }
            conv = nc;
          }

          // Save message
          await supabase.from('messages').insert({
            conversation_id: conv.id,
            sender_name: contact.name_edited ? contact.name : (profile.name || (profile.username ? `@${profile.username}` : contact.name)),
            content, message_type: messageType, external_id: message.mid, status: 'sent'
          });

          await supabase.from('conversations').update({
            last_message_preview: finalPreview, updated_at: new Date().toISOString()
          }).eq('id', conv.id);

          // Robot handling
          if (conv.status === 'em_fila' && !conv.assigned_to && connection.department_id) {
            const { data: robots } = await supabase.from('robots').select('*')
              .eq('status', 'active').contains('departments', [connection.department_id]);

            let robot = null;
            for (const r of (robots || [])) {
              if (!(r.channels || ['whatsapp', 'instagram', 'machine']).includes('instagram')) continue;
              const { data: ok } = await supabase.rpc('is_robot_within_schedule', { robot_uuid: r.id });
              if (ok === true) { robot = r; break; }
            }

            if (robot) {
              await supabase.from('conversations').update({
                assigned_to_robot: robot.id, status: 'em_atendimento'
              }).eq('id', conv.id);

              try {
                const resp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/robot-chat`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
                  body: JSON.stringify({ conversationId: conv.id, message: message.text || content, robotId: robot.id })
                });
                const rd = await resp.json();
                if (rd.response && tokenCandidates.length > 0) {
                  const { sent, messageId } = await sendInstagramMessage(connection.waba_id, senderId, rd.response, tokenCandidates);
                  await supabase.from('messages').insert({
                    conversation_id: conv.id, sender_name: robot.name, content: rd.response,
                    message_type: 'text', external_id: messageId || null, status: sent ? 'sent' : 'error'
                  });
                }
              } catch (e) { console.error('[IG] Erro robô:', e); }
            }
          }
        }
      }

      return new Response('OK', { status: 200, headers: corsHeaders });
    } catch (error) {
      console.error('[IG Webhook] Erro:', error);
      return new Response('Error', { status: 500, headers: corsHeaders });
    }
  }

  return new Response('Method not allowed', { status: 405, headers: corsHeaders });
});
