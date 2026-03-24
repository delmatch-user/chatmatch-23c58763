import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const appSecret = Deno.env.get('META_WHATSAPP_APP_SECRET');

function formatBrazilianPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) return null;
  let normalized = digits;
  if (!normalized.startsWith('55') && (normalized.length === 10 || normalized.length === 11)) {
    normalized = '55' + normalized;
  }
  if (normalized.length === 12) {
    return `+${normalized.slice(0, 2)} ${normalized.slice(2, 4)} ${normalized.slice(4, 8)}-${normalized.slice(8, 12)}`;
  }
  if (normalized.length === 13) {
    return `+${normalized.slice(0, 2)} ${normalized.slice(2, 4)} ${normalized.slice(4, 9)}-${normalized.slice(9, 13)}`;
  }
  if (normalized.startsWith('55')) return `+${normalized}`;
  return null;
}

// Verificar assinatura usando Web Crypto API nativa do Deno
async function verifySignature(payload: string, signature: string): Promise<boolean> {
  if (!appSecret) {
    console.warn('[Meta Webhook] APP_SECRET não configurado, pulando verificação');
    return true;
  }

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(appSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    const expectedSignature = 'sha256=' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const isValid = signature === expectedSignature;

    if (!isValid) {
      console.warn('[Meta Webhook] Assinatura não confere');
      console.warn('[Meta Webhook] Recebida :', signature.substring(0, 30) + '...');
      console.warn('[Meta Webhook] Esperada :', expectedSignature.substring(0, 30) + '...');
      console.warn('[Meta Webhook] Secret (3 primeiros chars):', appSecret.substring(0, 3) + '...');
    } else {
      console.log('[Meta Webhook] ✅ Assinatura verificada com sucesso');
    }

    return isValid;
  } catch (error) {
    console.error('[Meta Webhook] Erro ao verificar assinatura:', error);
    return false;
  }
}

// Chamar robot-chat para processar mensagem
async function callRobotChat(
  robotId: string,
  conversationId: string,
  message: string,
  contactPhone: string,
  phoneNumberId: string
): Promise<void> {
  try {
    console.log(`[Meta Webhook] Chamando robot-chat para robô ${robotId}`);

    const robotResponse = await fetch(`${supabaseUrl}/functions/v1/robot-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({
        robotId,
        conversationId,
        message,
        contactPhone,
        connectionType: 'meta_api',
        phoneNumberId
      })
    });

    if (!robotResponse.ok) {
      const errorText = await robotResponse.text();
      console.error('[Meta Webhook] Erro ao chamar robot-chat:', errorText);
    } else {
      await robotResponse.text(); // consume body
      console.log('[Meta Webhook] robot-chat chamado com sucesso');
    }
  } catch (error) {
    console.error('[Meta Webhook] Erro ao chamar robot-chat:', error);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);

  try {
    // ====== GET - Verificação do Webhook ======
    if (req.method === 'GET') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      console.log('[Meta Webhook] Verificação recebida:', { mode, token });

      if (mode === 'subscribe') {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { data: connection } = await supabase
          .from('whatsapp_connections')
          .select('id, verify_token')
          .eq('connection_type', 'meta_api')
          .eq('verify_token', token)
          .maybeSingle();

        if (connection) {
          console.log('[Meta Webhook] Token verificado com sucesso');
          return new Response(challenge, {
            status: 200,
            headers: { 'Content-Type': 'text/plain' }
          });
        }

        console.warn('[Meta Webhook] Token inválido:', token);
        return new Response('Forbidden', { status: 403 });
      }

      return new Response('Bad Request', { status: 400 });
    }

    // ====== POST - Eventos do Webhook ======
    if (req.method === 'POST') {
      const rawBody = await req.text();

      // Verificar assinatura
      const signature = req.headers.get('x-hub-signature-256') || '';
      const isValid = await verifySignature(rawBody, signature);

      if (!isValid) {
        console.warn('[Meta Webhook] ⚠️ Assinatura não confere — processando mesmo assim');
        console.warn('[Meta Webhook] Atualize META_WHATSAPP_APP_SECRET para restaurar verificação');
      }

      const body = JSON.parse(rawBody);
      console.log('[Meta Webhook] Evento recebido:', JSON.stringify(body).substring(0, 500));

      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Processar cada entry
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field !== 'messages') continue;

          const value = change.value;
          const phoneNumberId = value.metadata?.phone_number_id;

          // Buscar conexão pelo phone_number_id
          const { data: connection } = await supabase
            .from('whatsapp_connections')
            .select('id, department_id, name, access_token')
            .eq('phone_number_id', phoneNumberId)
            .eq('connection_type', 'meta_api')
            .maybeSingle();

          if (!connection) {
            console.warn('[Meta Webhook] Conexão não encontrada para phone_number_id:', phoneNumberId);
            continue;
          }

          const departmentId = connection.department_id;
          console.log('[Meta Webhook] Conexão encontrada:', connection.name, 'Dept:', departmentId);

          // Processar mensagens recebidas
          for (const message of value.messages || []) {
            console.log('[Meta Webhook] Processando mensagem:', message.id);

            // Verificar duplicação
            const { data: existingMsg } = await supabase
              .from('messages')
              .select('id')
              .eq('external_id', message.id)
              .maybeSingle();

            if (existingMsg) {
              console.log('[Meta Webhook] Mensagem duplicada ignorada:', message.id);
              continue;
            }

            // Dados do contato
            const contact = value.contacts?.[0];
            const senderPhone = message.from;
            const senderName = contact?.profile?.name || `WhatsApp ${senderPhone}`;

            // Buscar ou criar contato
            let contactId: string | null = null;

            const { data: phoneVariants } = await supabase
              .rpc('find_contact_by_phone', { phone_input: senderPhone });

            const existingContact = phoneVariants && phoneVariants.length > 0 ? phoneVariants[0] : null;

            if (existingContact) {
              contactId = existingContact.id;
              if (!existingContact.name_edited && senderName && !senderName.startsWith('WhatsApp ')) {
                supabase
                  .from('contacts')
                  .update({ name: senderName })
                  .eq('id', existingContact.id)
                  .then(() => console.log('[Meta Webhook] Nome do contato atualizado'));
              }
              if (existingContact.phone !== senderPhone && !existingContact.phone?.startsWith('55')) {
                supabase
                  .from('contacts')
                  .update({ phone: formatBrazilianPhone(senderPhone) || senderPhone })
                  .eq('id', existingContact.id)
                  .then(() => console.log('[Meta Webhook] Telefone normalizado salvo'));
              }
            } else {
              const jidNote = `meta_api:${phoneNumberId}`;
              const { data: newContact, error: createError } = await supabase
                .from('contacts')
                .insert({
                  name: senderName,
                  phone: formatBrazilianPhone(senderPhone) || senderPhone,
                  channel: 'whatsapp',
                  notes: jidNote
                })
                .select('id')
                .single();

              if (createError) {
                // Race condition: buscar contato que ganhou a corrida
                if (createError.code === '23505') {
                  console.log(`[Meta Webhook] ⚡ Race condition - buscando contato existente para phone ${senderPhone}`);
                  const { data: raceResults } = await supabase
                    .rpc('find_contact_by_phone', { phone_input: senderPhone });
                  if (raceResults && raceResults.length > 0) {
                    contactId = raceResults[0].id;
                  } else {
                    console.error('[Meta Webhook] Erro ao criar contato:', createError);
                    continue;
                  }
                } else {
                  console.error('[Meta Webhook] Erro ao criar contato:', createError);
                  continue;
                }
              } else {
                contactId = newContact.id;
              }
            }

            // Determinar departamento
            let targetDepartmentId = departmentId;
            if (!targetDepartmentId) {
              const { data: defaultDept } = await supabase
                .from('departments')
                .select('id')
                .limit(1)
                .single();

              targetDepartmentId = defaultDept?.id;
            }

            if (!targetDepartmentId) {
              console.error('[Meta Webhook] Nenhum departamento disponível');
              continue;
            }

            // Verificar se existe robô ativo para o departamento
            const { data: activeRobots } = await supabase
              .from('robots')
              .select('id, name, channels')
              .eq('status', 'active')
              .eq('auto_assign', true)
              .contains('departments', [targetDepartmentId]);

            // Buscar config SDR para guarda
            const { data: metaSdrConfig } = await supabase
              .from('sdr_robot_config')
              .select('robot_id')
              .eq('is_active', true)
              .maybeSingle();
            const metaSdrRobotId = metaSdrConfig?.robot_id || null;

            let metaSdrKeywords: string[] = [];
            let metaComercialDeptId: string | null = null;
            if (metaSdrRobotId) {
              const { data: autoConf } = await supabase
                .from('sdr_auto_config')
                .select('keywords')
                .eq('is_active', true)
                .maybeSingle();
              metaSdrKeywords = autoConf?.keywords || [];

              const { data: comercialDept } = await supabase
                .from('departments')
                .select('id')
                .ilike('name', 'comercial')
                .maybeSingle();
              metaComercialDeptId = comercialDept?.id || null;
            }

            // Filtrar por canal e guarda SDR
            let filteredRobot = null;
            const firstMsgContent = message.text?.body || '';
            for (const r of (activeRobots || [])) {
              if (!(r.channels || ['whatsapp', 'instagram', 'machine']).includes('whatsapp')) continue;

              // Guarda SDR
              if (metaSdrRobotId && r.id === metaSdrRobotId) {
                if (metaComercialDeptId && targetDepartmentId !== metaComercialDeptId) {
                  console.log(`[Meta Webhook] Robô SDR pulado (dept não é Comercial)`);
                  continue;
                }
                const msgLower = firstMsgContent.toLowerCase();
                const hasKw = metaSdrKeywords.length > 0 && metaSdrKeywords.some((kw: string) => msgLower.includes(kw.toLowerCase()));
                if (!hasKw) {
                  console.log(`[Meta Webhook] Robô SDR pulado (sem keyword match)`);
                  continue;
                }
              }

              filteredRobot = r;
              break;
            }

            if (filteredRobot) {
              console.log(`[Meta Webhook] Robô ativo encontrado: ${filteredRobot.name}`);
            }

            // Buscar conversa ativa ou criar nova
            let conversationId: string | null = null;
            let isNewConversation = false;
            let assignedRobotId: string | null = null;

            const { data: existingConv } = await supabase
              .from('conversations')
              .select('id, assigned_to_robot, assigned_to, robot_transferred, whatsapp_instance_id')
              .eq('contact_id', contactId)
              .in('status', ['em_fila', 'em_atendimento', 'pendente'])
              .maybeSingle();

            if (existingConv) {
              conversationId = existingConv.id;
              assignedRobotId = existingConv.assigned_to_robot;

              // Auto-correção: preencher whatsapp_instance_id se estiver vazio
              if (!existingConv.whatsapp_instance_id && phoneNumberId) {
                console.log(`[Meta Webhook] Auto-corrigindo whatsapp_instance_id da conversa ${conversationId} → ${phoneNumberId}`);
                await supabase
                  .from('conversations')
                  .update({ whatsapp_instance_id: phoneNumberId })
                  .eq('id', conversationId);
              }
            } else {
              const { data: newConv, error: convError } = await supabase
                .from('conversations')
                .insert({
                  contact_id: contactId,
                  department_id: targetDepartmentId,
                  channel: 'whatsapp',
                  status: filteredRobot ? 'em_atendimento' : 'em_fila',
                  assigned_to_robot: filteredRobot?.id || null,
                  priority: 'normal',
                  tags: [],
                  last_message_preview: '[Nova mensagem]',
                  whatsapp_instance_id: phoneNumberId || null
                })
                .select('id')
                .single();

              if (convError) {
                console.error('[Meta Webhook] Erro ao criar conversa:', convError);
                continue;
              }
              conversationId = newConv.id;
              isNewConversation = true;
              assignedRobotId = filteredRobot?.id || null;

              if (filteredRobot) {
                console.log(`[Meta Webhook] Nova conversa atribuída ao robô: ${filteredRobot.name}`);
              }
            }

            // Processar conteúdo da mensagem
            let content = '';
            let messageType = 'text';

            switch (message.type) {
              case 'text':
                content = message.text?.body || '';
                break;

              case 'image':
              case 'video':
              case 'audio':
              case 'document':
                messageType = message.type;
                const mediaId = message[message.type]?.id;
                const mimeType = message[message.type]?.mime_type;
                const fileName = message[message.type]?.filename || `${message.type}_${Date.now()}`;

                // Tentar baixar mídia da Meta API e fazer upload para Storage
                let mediaUrl = `meta_media:${mediaId}`;
                // Priorizar token do banco (mais atualizado), fallback para env
                const metaAccessToken = connection.access_token || Deno.env.get('META_WHATSAPP_ACCESS_TOKEN');
                console.log(`[Meta Webhook] Token source: ${connection.access_token ? 'database' : 'env'}`);
                
                if (mediaId && metaAccessToken) {
                  try {
                    // 1. Obter URL do media
                    const mediaInfoRes = await fetch(
                      `https://graph.facebook.com/v21.0/${mediaId}`,
                      { headers: { 'Authorization': `Bearer ${metaAccessToken}` } }
                    );
                    
                    if (mediaInfoRes.ok) {
                      const mediaInfo = await mediaInfoRes.json();
                      const downloadUrl = mediaInfo.url;
                      
                      if (downloadUrl) {
                        // 2. Baixar o arquivo
                        const mediaRes = await fetch(downloadUrl, {
                          headers: { 'Authorization': `Bearer ${metaAccessToken}` }
                        });
                        
                        if (mediaRes.ok) {
                          const mediaBytes = new Uint8Array(await mediaRes.arrayBuffer());
                          const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
                          const uniqueFileName = `${Date.now()}_meta_${safeName}`;
                          
                          // 3. Upload para Storage
                          const { error: uploadError } = await supabase
                            .storage
                            .from('chat-uploads')
                            .upload(uniqueFileName, mediaBytes, {
                              contentType: mimeType || 'application/octet-stream',
                              upsert: false
                            });
                          
                          if (!uploadError) {
                            const { data: { publicUrl } } = supabase
                              .storage
                              .from('chat-uploads')
                              .getPublicUrl(uniqueFileName);
                            
                            mediaUrl = publicUrl;
                            console.log(`[Meta Webhook] Mídia salva no Storage: ${publicUrl}`);
                          } else {
                            console.error('[Meta Webhook] Erro no upload da mídia:', uploadError);
                          }
                        } else {
                          const errBody = await mediaRes.text();
                          console.error('[Meta Webhook] Erro ao baixar mídia:', mediaRes.status, errBody);
                        }
                      }
                    } else {
                      const errBody = await mediaInfoRes.text();
                      console.error('[Meta Webhook] Erro ao obter info da mídia:', mediaInfoRes.status, errBody);
                    }
                  } catch (mediaError) {
                    console.error('[Meta Webhook] Erro ao processar mídia Meta:', mediaError);
                  }
                }

                content = JSON.stringify([{
                  name: fileName,
                  url: mediaUrl,
                  type: mimeType || message.type,
                  mediaId: mediaId
                }]);
                break;

              case 'location':
                messageType = 'location';
                content = JSON.stringify({
                  latitude: message.location?.latitude,
                  longitude: message.location?.longitude,
                  name: message.location?.name,
                  address: message.location?.address
                });
                break;

              case 'contacts':
                messageType = 'contact';
                content = JSON.stringify(message.contacts);
                break;

              case 'sticker': {
                messageType = 'image';
                const stickerId = message.sticker?.id;
                const stickerMime = message.sticker?.mime_type || 'image/webp';

                let stickerUrl = `meta_media:${stickerId}`;
                const stickerToken = connection.access_token || Deno.env.get('META_WHATSAPP_ACCESS_TOKEN');

                if (stickerId && stickerToken) {
                  try {
                    const stickerInfoRes = await fetch(
                      `https://graph.facebook.com/v21.0/${stickerId}`,
                      { headers: { 'Authorization': `Bearer ${stickerToken}` } }
                    );
                    if (stickerInfoRes.ok) {
                      const stickerInfo = await stickerInfoRes.json();
                      if (stickerInfo.url) {
                        const stickerRes = await fetch(stickerInfo.url, {
                          headers: { 'Authorization': `Bearer ${stickerToken}` }
                        });
                        if (stickerRes.ok) {
                          const stickerBytes = new Uint8Array(await stickerRes.arrayBuffer());
                          const stickerFileName = `${Date.now()}_meta_sticker_${stickerId}.webp`;
                          const { error: stickerUploadErr } = await supabase
                            .storage.from('chat-uploads')
                            .upload(stickerFileName, stickerBytes, { contentType: stickerMime, upsert: false });
                          if (!stickerUploadErr) {
                            const { data: { publicUrl: stickerPubUrl } } = supabase.storage.from('chat-uploads').getPublicUrl(stickerFileName);
                            stickerUrl = stickerPubUrl;
                            console.log(`[Meta Webhook] Sticker salvo: ${stickerPubUrl}`);
                          }
                        }
                      }
                    }
                  } catch (stickerErr) {
                    console.error('[Meta Webhook] Erro ao processar sticker:', stickerErr);
                  }
                }

                content = JSON.stringify([{
                  name: 'Sticker',
                  url: stickerUrl,
                  type: stickerMime,
                  mediaId: stickerId
                }]);
                break;
              }

              default:
                content = `[Mensagem do tipo: ${message.type}]`;
            }

            // Salvar mensagem
            const { error: msgError } = await supabase
              .from('messages')
              .insert({
                conversation_id: conversationId,
                content: content,
                sender_name: senderName,
                sender_id: null,
                message_type: messageType,
                status: 'sent',
                delivery_status: 'delivered',
                external_id: message.id
              });

            if (msgError) {
              console.error('[Meta Webhook] Erro ao salvar mensagem:', msgError);
              continue;
            }

            // Atualizar preview da conversa
            let preview = content.substring(0, 100);
            if (messageType !== 'text') {
              const typeEmojis: Record<string, string> = {
                image: '📷 Imagem',
                video: '🎬 Vídeo',
                audio: '🎵 Áudio',
                document: '📎 Documento',
                location: '📍 Localização',
                contact: '👤 Contato'
              };
              preview = typeEmojis[messageType] || preview;
            }

            await supabase
              .from('conversations')
              .update({
                updated_at: new Date().toISOString(),
                last_message_preview: preview
              })
              .eq('id', conversationId);

            console.log('[Meta Webhook] ✅ Mensagem salva com sucesso:', message.id);

            // Chamar robot-chat se houver robô atribuído E não houver atendente humano E não foi transferida por robô
            const hasHumanAgent = existingConv?.assigned_to;
            const wasRobotTransferred = existingConv?.robot_transferred === true;
            if (assignedRobotId && conversationId && !hasHumanAgent && !wasRobotTransferred) {
              await callRobotChat(
                assignedRobotId,
                conversationId,
                content,
                senderPhone,
                phoneNumberId
              );
            }
          }

          // Processar status updates
          for (const status of value.statuses || []) {
            console.log('[Meta Webhook] Status update:', status.id, status.status);

            await supabase
              .from('messages')
              .update({ delivery_status: status.status })
              .eq('external_id', status.id);
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response('Method not allowed', { status: 405 });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Meta Webhook] Erro:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
