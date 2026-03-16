import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ===== Shared helpers =====

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

/** Generic fetch with appsecret_proof fallback on code 100 */
async function fetchWithProofFallback(
  baseUrl: string,
  token: string,
  appSecret: string | null,
  method: string,
  body?: string
): Promise<Response> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const fetchOpts: RequestInit = { method, headers, ...(body ? { body } : {}) };

  if (appSecret) {
    const proof = await generateAppSecretProof(token, appSecret);
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
      console.warn('[IG] appsecret_proof inválido. Retentando SEM proof...');
      const retryRes = await fetch(baseUrl, fetchOpts);
      if (retryRes.ok) {
        console.warn('[IG] ⚠️ Funcionou SEM proof — App Secret incorreto. Corrija META_INSTAGRAM_APP_SECRET.');
      }
      return retryRes;
    }

    return res;
  }

  return await fetch(baseUrl, fetchOpts);
}

// ===== Fetch IG profile =====

async function fetchIGProfile(senderId: string, tokenCandidates: { token: string; source: string }[]): Promise<{ name?: string; profilePic?: string }> {
  const appSecret = getAppSecret();

  for (const { token, source } of tokenCandidates) {
    try {
      const baseUrl = `https://graph.facebook.com/v25.0/${senderId}?fields=name,profile_pic&access_token=${token}`;
      const res = await fetchWithProofFallback(baseUrl, token, appSecret, 'GET');

      if (res.ok) {
        const data = await res.json();
        console.log(`[IG] Perfil obtido via ${source}:`, data.name);
        return { name: data.name || undefined, profilePic: data.profile_pic || undefined };
      }

      const errText = await res.text();
      const isExpired = errText.includes('Session has expired') || errText.includes('"code":190');
      console.warn(`[IG] Perfil falhou (${source}): ${res.status}, expired=${isExpired}`);
      if (!isExpired) break;
    } catch (e) {
      console.warn(`[IG] Erro fetch perfil (${source}):`, e);
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
  const appSecret = getAppSecret();
  const payload = { recipient: { id: recipientId }, message: { text }, messaging_type: 'RESPONSE' };

  for (const { token, source } of tokenCandidates) {
    const url = `https://graph.facebook.com/v25.0/${pageId}/messages`;
    const res = await fetchWithProofFallback(url, token, appSecret, 'POST', JSON.stringify(payload));
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

          // Fetch IG profile
          const profile = await fetchIGProfile(senderId, tokenCandidates);

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
              if (mediaUrl) {
                const persisted = await persistMedia(mediaUrl, mapped.mimePrefix, primaryToken, supabase);
                if (persisted) {
                  attachments.push({ name: `instagram_${attType}_${Date.now()}`, url: persisted.publicUrl, type: mapped.mimePrefix, size: persisted.size });
                } else {
                  attachments.push({ name: `instagram_${attType}`, url: mediaUrl, type: mapped.mimePrefix });
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
          const displayName = profile.name || `Instagram ${senderId.slice(-6)}`;

          if (!contact) {
            const { data: nc, error: ce } = await supabase.from('contacts')
              .insert({ name: displayName, phone: contactPhone, channel: 'instagram', avatar_url: profile.profilePic || null })
              .select().single();
            if (ce) { console.error('[IG] Erro contato:', ce); continue; }
            contact = nc;
          } else {
            const updates: any = {};
            if (!contact.name_edited && contact.name.startsWith('Instagram ') && profile.name) updates.name = profile.name;
            if (profile.profilePic && !contact.avatar_url) updates.avatar_url = profile.profilePic;
            if (Object.keys(updates).length > 0) {
              await supabase.from('contacts').update(updates).eq('id', contact.id);
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
            sender_name: contact.name_edited ? contact.name : (profile.name || contact.name),
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
              if (ok !== false) { robot = r; break; }
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
                  if (sent && messageId) {
                    await supabase.from('messages').insert({
                      conversation_id: conv.id, sender_name: robot.name, content: rd.response,
                      message_type: 'text', external_id: messageId, status: 'sent'
                    });
                  }
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
