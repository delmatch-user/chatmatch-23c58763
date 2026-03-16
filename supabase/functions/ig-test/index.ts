import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Fetch Instagram user profile (name + profile_pic) via Graph API
 */
async function generateAppSecretProof(token: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(token));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getInstagramAppSecrets(): string[] {
  const instagramSecret = (Deno.env.get('META_INSTAGRAM_APP_SECRET') || '').trim();
  const whatsappSecret = (Deno.env.get('META_WHATSAPP_APP_SECRET') || '').trim();
  return Array.from(new Set([instagramSecret, whatsappSecret].filter(Boolean)));
}

async function fetchIGProfile(senderId: string, accessToken: string): Promise<{ name?: string; profilePic?: string }> {
  try {
    const token = accessToken.trim();
    const secrets = getInstagramAppSecrets();
    const attempts = secrets.length > 0 ? secrets : [''];

    for (const secret of attempts) {
      let url = `https://graph.facebook.com/v25.0/${senderId}?fields=name,profile_pic&access_token=${token}`;
      if (secret) {
        const proof = await generateAppSecretProof(token, secret);
        url += `&appsecret_proof=${proof}`;
      }

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        return { name: data.name || undefined, profilePic: data.profile_pic || undefined };
      }

      const errorText = await res.text();
      const isProofError = errorText.includes('appsecret_proof');
      console.warn('[IG] Erro ao buscar perfil:', errorText);
      if (!isProofError) {
        break;
      }
    }

    return {};
  } catch (e) {
    console.warn('[IG] Erro fetch perfil:', e);
    return {};
  }
}

/**
 * Download media from URL and upload to Supabase Storage (chat-uploads)
 */
async function persistMedia(
  mediaUrl: string,
  mimeType: string,
  accessToken: string,
  supabase: any
): Promise<{ publicUrl: string; size: number } | null> {
  try {
    const res = await fetch(mediaUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!res.ok) {
      // Instagram public URLs don't need auth, try without
      const res2 = await fetch(mediaUrl);
      if (!res2.ok) {
        console.error('[IG Media] Download falhou:', res2.status);
        return null;
      }
      const bytes = new Uint8Array(await res2.arrayBuffer());
      return await uploadToStorage(bytes, mimeType, supabase);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    return await uploadToStorage(bytes, mimeType, supabase);
  } catch (e) {
    console.error('[IG Media] Erro download:', e);
    return null;
  }
}

async function uploadToStorage(
  bytes: Uint8Array,
  mimeType: string,
  supabase: any
): Promise<{ publicUrl: string; size: number } | null> {
  const ext = mimeType.split('/')[1]?.split(';')[0] || 'bin';
  const fileName = `${Date.now()}_ig_${Math.random().toString(36).substring(7)}.${ext}`;

  const { error } = await supabase.storage
    .from('chat-uploads')
    .upload(fileName, bytes, { contentType: mimeType, upsert: false });

  if (error) {
    console.error('[IG Media] Upload erro:', error);
    return null;
  }

  const { data: { publicUrl } } = supabase.storage.from('chat-uploads').getPublicUrl(fileName);
  return { publicUrl, size: bytes.length };
}

/**
 * Map Instagram attachment type to MIME-like type and friendly label
 */
function mapAttachmentType(attType: string): { mimePrefix: string; messageType: string; label: string } {
  switch (attType) {
    case 'image': return { mimePrefix: 'image/jpeg', messageType: 'image', label: '📷 Imagem' };
    case 'video': return { mimePrefix: 'video/mp4', messageType: 'video', label: '🎬 Vídeo' };
    case 'audio': return { mimePrefix: 'audio/mpeg', messageType: 'audio', label: '🎤 Áudio' };
    default: return { mimePrefix: 'application/octet-stream', messageType: 'file', label: '📎 Arquivo' };
  }
}

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
    console.log('[IG Webhook] Verificação:', { mode, token, challenge });

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
      console.log('[IG Webhook] Payload:', JSON.stringify(payload));

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

        const accessToken = (Deno.env.get('META_INSTAGRAM_ACCESS_TOKEN') || connection.access_token || '').trim();

        for (const messaging of entry.messaging || []) {
          const senderId = messaging.sender?.id;
          const message = messaging.message;

          // ===== Handle reactions =====
          if (messaging.reaction && senderId) {
            const reaction = messaging.reaction;
            console.log('[IG Webhook] Reação:', reaction);
            // reaction.mid = message being reacted to, reaction.emoji = the emoji
            if (reaction.mid && reaction.action !== 'unreact') {
              // Find message by external_id
              const { data: msg } = await supabase
                .from('messages')
                .select('id')
                .eq('external_id', reaction.mid)
                .maybeSingle();

              if (msg) {
                await supabase.from('message_reactions').insert({
                  message_id: msg.id,
                  external_message_id: reaction.mid,
                  emoji: reaction.emoji || '❤️',
                  sender_phone: `ig:${senderId}`
                });
                console.log('[IG Webhook] Reação salva');
              }
            }
            continue;
          }

          if (!message || !senderId || message.is_echo) continue;

          console.log('[IG Webhook] Mensagem de:', senderId);

          // ===== Fetch IG profile for name + avatar =====
          const profile = await fetchIGProfile(senderId, accessToken);

          // ===== Process message content =====
          let messageType = 'text';
          let content = '';
          let previewLabel = '';

          if (message.text && (!message.attachments || message.attachments.length === 0)) {
            // Pure text message
            content = message.text;
            previewLabel = content;
          } else if (message.attachments?.length > 0) {
            // Media message — download and persist
            const attachments: any[] = [];

            for (const att of message.attachments) {
              const attType = att.type || 'file';
              const mediaUrl = att.payload?.url;
              const mapped = mapAttachmentType(attType);
              messageType = mapped.messageType;
              previewLabel = mapped.label;

              if (mediaUrl) {
                const persisted = await persistMedia(mediaUrl, mapped.mimePrefix, accessToken, supabase);
                if (persisted) {
                  attachments.push({
                    name: `instagram_${attType}_${Date.now()}`,
                    url: persisted.publicUrl,
                    type: mapped.mimePrefix,
                    size: persisted.size
                  });
                } else {
                  // Fallback: store raw URL (will expire)
                  attachments.push({
                    name: `instagram_${attType}`,
                    url: mediaUrl,
                    type: mapped.mimePrefix
                  });
                }
              }
            }

            if (attachments.length > 0) {
              content = JSON.stringify(attachments);
            } else {
              content = '[Mídia]';
              previewLabel = '📎 Mídia';
            }

            // If there's also text with the attachment
            if (message.text) {
              previewLabel = message.text;
            }
          } else {
            content = '[Mídia]';
            previewLabel = '📎 Mídia';
          }

          // ===== Contact handling =====
          const contactPhone = `ig:${senderId}`;
          let { data: contact } = await supabase.from('contacts').select('*').eq('phone', contactPhone).maybeSingle();

          const displayName = profile.name || `Instagram ${senderId.slice(-6)}`;

          if (!contact) {
            const { data: nc, error: ce } = await supabase
              .from('contacts')
              .insert({
                name: displayName,
                phone: contactPhone,
                channel: 'instagram',
                avatar_url: profile.profilePic || null
              })
              .select().single();
            if (ce) { console.error('[IG] Erro contato:', ce); continue; }
            contact = nc;
          } else {
            // Update name if still generic and not manually edited
            const updates: any = {};
            if (!contact.name_edited && contact.name.startsWith('Instagram ') && profile.name) {
              updates.name = profile.name;
            }
            if (profile.profilePic && !contact.avatar_url) {
              updates.avatar_url = profile.profilePic;
            }
            if (Object.keys(updates).length > 0) {
              await supabase.from('contacts').update(updates).eq('id', contact.id);
              console.log('[IG] Contato atualizado:', updates);
            }
          }

          // ===== Conversation handling =====
          let { data: conv } = await supabase
            .from('conversations')
            .select('*')
            .eq('contact_id', contact.id)
            .in('status', ['em_fila', 'em_atendimento', 'pendente'])
            .maybeSingle();

          const finalPreview = (previewLabel || content).slice(0, 100);

          if (!conv) {
            const { data: nc, error: ce } = await supabase
              .from('conversations')
              .insert({
                contact_id: contact.id,
                department_id: connection.department_id,
                status: 'em_fila',
                channel: 'instagram',
                external_id: senderId,
                last_message_preview: finalPreview
              })
              .select().single();
            if (ce) { console.error('[IG] Erro conversa:', ce); continue; }
            conv = nc;
          }

          // ===== Save message =====
          await supabase.from('messages').insert({
            conversation_id: conv.id,
            sender_name: contact.name_edited ? contact.name : (profile.name || contact.name),
            content,
            message_type: messageType,
            external_id: message.mid,
            status: 'sent'
          });

          await supabase.from('conversations').update({
            last_message_preview: finalPreview,
            updated_at: new Date().toISOString()
          }).eq('id', conv.id);

          console.log('[IG Webhook] Mensagem salva, tipo:', messageType);

          // ===== Robot handling (unchanged logic) =====
          if (conv.status === 'em_fila' && !conv.assigned_to && connection.department_id) {
            const { data: robots } = await supabase
              .from('robots').select('*').eq('status', 'active')
              .contains('departments', [connection.department_id]);

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
                if (rd.response) {
                  if (accessToken) {
                    // Generate appsecret_proof for robot reply
                    const appSecrets = getInstagramAppSecrets();
                    const sendAttempts = appSecrets.length > 0 ? appSecrets : [''];
                    let result: any = null;

                    for (const appSecret of sendAttempts) {
                      let sendUrl = `https://graph.facebook.com/v25.0/${connection.waba_id}/messages`;
                      if (appSecret) {
                        const proof = await generateAppSecretProof(accessToken.trim(), appSecret);
                        sendUrl += `?appsecret_proof=${proof}`;
                      }

                      const sr = await fetch(sendUrl, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ recipient: { id: senderId }, message: { text: rd.response }, messaging_type: 'RESPONSE' })
                      });

                      result = await sr.json();
                      if (sr.ok) {
                        break;
                      }

                      const errMsg = result?.error?.message || '';
                      if (!String(errMsg).includes('appsecret_proof')) {
                        break;
                      }
                    }
                    await supabase.from('messages').insert({
                      conversation_id: conv.id, sender_name: robot.name, content: rd.response,
                      message_type: 'text', external_id: result.message_id, status: 'sent'
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
