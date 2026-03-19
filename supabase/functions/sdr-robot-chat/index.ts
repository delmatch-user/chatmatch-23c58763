import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function extractMediaUrl(content: string, expectedType?: string): string | null {
  if (!content) return null;
  if (content.startsWith('http')) return content;
  if (content.startsWith('meta_media:')) return content;
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const item = expectedType
        ? parsed.find((p: any) => p.url && p.type?.startsWith(expectedType))
        : parsed[0];
      return item?.url || null;
    }
  } catch { /* not JSON */ }
  return null;
}

async function resolveImageToDataUrl(url: string): Promise<string | null> {
  try {
    let fetchUrl = url;

    if (url.startsWith('meta_media:')) {
      const mediaId = url.replace('meta_media:', '');
      console.log('[SDR-Robot-Chat] Resolvendo meta_media:', mediaId);
      const proxyRes = await fetch(`${supabaseUrl}/functions/v1/meta-media-proxy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ mediaId })
      });
      if (!proxyRes.ok) {
        console.error('[SDR-Robot-Chat] meta-media-proxy falhou:', proxyRes.status);
        return null;
      }
      const proxyData = await proxyRes.json();
      fetchUrl = proxyData?.url;
      if (!fetchUrl) return null;
    }

    console.log('[SDR-Robot-Chat] Baixando imagem para base64:', fetchUrl.substring(0, 80));
    const imgRes = await fetch(fetchUrl);
    if (!imgRes.ok) {
      console.error('[SDR-Robot-Chat] Erro ao baixar imagem:', imgRes.status);
      return null;
    }
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const buffer = await imgRes.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    const mimeType = contentType.split(';')[0];
    return `data:${mimeType};base64,${base64}`;
  } catch (err) {
    console.error('[SDR-Robot-Chat] Erro ao resolver imagem para base64:', err);
    return null;
  }
}

async function transcribeAudioUrl(audioUrl: string): Promise<string | null> {
  try {
    console.log('[SDR-Robot-Chat] Transcrevendo áudio:', audioUrl.substring(0, 80));
    const response = await fetch(`${supabaseUrl}/functions/v1/transcribe-audio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({ audioUrl })
    });
    if (!response.ok) {
      console.error('[SDR-Robot-Chat] Erro na transcrição:', response.status);
      return null;
    }
    const data = await response.json();
    return data?.transcription || null;
  } catch (err) {
    console.error('[SDR-Robot-Chat] Erro ao transcrever:', err);
    return null;
  }
}

function getModelFromIntelligence(intelligence: string): string {
  switch (intelligence) {
    case 'novato': return 'gemini-2.5-flash-lite';
    case 'flash': return 'gemini-2.5-flash';
    case 'pro': return 'gemini-2.5-pro';
    case 'maestro': return 'gpt-4o';
    default: return 'gemini-2.5-flash-lite';
  }
}

function isGeminiModel(intelligence: string): boolean {
  return ['novato', 'flash', 'pro'].includes(intelligence);
}

function getApiConfig(intelligence: string) {
  if (isGeminiModel(intelligence)) {
    return {
      apiUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      apiKey: Deno.env.get("GOOGLE_GEMINI_API_KEY") || '',
      providerName: 'Google Gemini'
    };
  }
  return {
    apiUrl: "https://api.openai.com/v1/chat/completions",
    apiKey: Deno.env.get("OPENAI_API_KEY") || '',
    providerName: 'OpenAI'
  };
}

async function buildMessageHistory(messages: any[], readImages: boolean, logPrefix = '[SDR-Robot-Chat]'): Promise<any[]> {
  const history: any[] = [];
  for (const msg of messages) {
    const isRobotMessage = msg.sender_name?.includes('[ROBOT]') || msg.sender_name?.includes('(IA)');
    const isAgentMessage = msg.sender_id !== null;
    const role = (isRobotMessage || isAgentMessage) ? 'assistant' as const : 'user' as const;

    if (readImages && msg.message_type === 'image' && msg.content) {
      const imageUrl = extractMediaUrl(msg.content, 'image');
      if (imageUrl) {
        history.push({
          role,
          content: [
            { type: "image_url" as const, image_url: { url: imageUrl } },
            { type: "text" as const, text: "O cliente enviou esta imagem. Analise e responda." }
          ]
        });
        continue;
      }
    }

    if (msg.message_type === 'audio') {
      const audioUrl = extractMediaUrl(msg.content, 'audio');
      if (audioUrl) {
        const transcription = await transcribeAudioUrl(audioUrl);
        history.push({ role, content: transcription ? `[Áudio transcrito]: ${transcription}` : '[Áudio recebido - não foi possível transcrever]' });
      } else if (msg.content && !msg.content.startsWith('[') && !msg.content.startsWith('{')) {
        history.push({ role, content: `[Áudio transcrito]: ${msg.content}` });
      } else {
        history.push({ role, content: '[Áudio recebido - sem transcrição]' });
      }
      continue;
    }

    if (msg.message_type === 'video' && msg.content) {
      const videoUrl = extractMediaUrl(msg.content, 'video');
      history.push({ role, content: videoUrl ? `[Vídeo recebido: ${videoUrl}]` : '[Vídeo recebido]' });
      continue;
    }

    history.push({
      role,
      content: msg.message_type === 'text' || msg.message_type === 'system' ? msg.content : `[Mídia recebida: ${msg.message_type}]`
    });
  }
  return history;
}

function getTemperatureFromTone(tone: string): number {
  switch (tone) {
    case 'muito_criativo': return 1.0;
    case 'criativo': return 0.8;
    case 'equilibrado': return 0.5;
    case 'preciso': return 0.3;
    case 'muito_preciso': return 0.1;
    default: return 0.5;
  }
}

async function sendViaMachine(conversationId: string, message: string, senderName: string): Promise<boolean> {
  try {
    console.log(`[SDR-Robot-Chat] Enviando via Machine: conv=${conversationId}`);
    const response = await fetch(`${supabaseUrl}/functions/v1/machine-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({ conversationId, message, senderName })
    });
    const ok = response.ok;
    if (!ok) console.error(`[SDR-Robot-Chat] Machine send failed: ${response.status}`);
    else console.log(`[SDR-Robot-Chat] Machine send OK`);
    return ok;
  } catch (err) { console.error('[SDR-Robot-Chat] Machine send error:', err); return false; }
}

async function sendViaMetaApi(phoneNumberId: string, toPhone: string, message: string): Promise<boolean> {
  try {
    console.log(`[SDR-Robot-Chat] Enviando via Meta API: to=${toPhone}, phoneNumberId=${phoneNumberId}`);
    const response = await fetch(`${supabaseUrl}/functions/v1/meta-whatsapp-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({ phone_number_id: phoneNumberId, to: toPhone, message, type: 'text' })
    });
    const ok = response.ok;
    if (!ok) {
      const text = await response.text().catch(() => '');
      console.error(`[SDR-Robot-Chat] Meta send failed: ${response.status} ${text}`);
    } else console.log(`[SDR-Robot-Chat] Meta send OK`);
    return ok;
  } catch (err) { console.error('[SDR-Robot-Chat] Meta send error:', err); return false; }
}

async function sendViaBaileys(contactPhone: string, contactJid: string | undefined, message: string, instanceId?: string): Promise<boolean> {
  try {
    // Priorizar contactJid quando é LID, pois o servidor Baileys resolve melhor LIDs com @lid
    // Para phones reais, usar contactPhone diretamente
    const to = (contactJid && contactJid.includes('@lid')) ? contactJid : (contactPhone || contactJid);
    console.log(`[SDR-Robot-Chat] Enviando via Baileys: to=${to}, phone=${contactPhone}, jid=${contactJid}, instanceId=${instanceId}`);
    const response = await fetch(`${supabaseUrl}/functions/v1/baileys-proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({ action: 'send', to, jid: contactJid, message, type: 'text', instanceId })
    });
    const respBody = await response.json().catch(() => ({}));
    if (!response.ok || !respBody.success) {
      console.error(`[SDR-Robot-Chat] Baileys send failed: status=${response.status}`, respBody.error || respBody);
      return false;
    }
    console.log(`[SDR-Robot-Chat] Baileys send OK:`, respBody.usedJid || 'no usedJid');
    return true;
  } catch (err) { console.error('[SDR-Robot-Chat] Baileys send error:', err); return false; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { conversationId, dealId, message, contactPhone, contactJid, connectionType: inputConnectionType, phoneNumberId: inputPhoneNumberId, isTransfer } = body;

    if (!conversationId || !dealId) {
      return new Response(JSON.stringify({ error: 'conversationId and dealId are required' }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[SDR-Robot-Chat] Conv: ${conversationId}, Deal: ${dealId}`);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // === UPDATE last_customer_message_at on every incoming message ===
    await supabase.from('sdr_deals').update({
      last_customer_message_at: new Date().toISOString(),
      remarketing_attempts: 0,
    }).eq('id', dealId);

    // === SAVE PHONE ON CONTACT if missing ===
    if (contactPhone && /^\d{8,}$/.test(contactPhone)) {
      const { data: deal } = await supabase.from('sdr_deals').select('contact_id').eq('id', dealId).single();
      if (deal?.contact_id) {
        const { data: contact } = await supabase.from('contacts').select('phone').eq('id', deal.contact_id).single();
        if (contact && !contact.phone) {
          await supabase.from('contacts').update({ phone: contactPhone }).eq('id', deal.contact_id);
          console.log(`[SDR-Robot-Chat] Phone ${contactPhone} saved on contact ${deal.contact_id}`);
        }
      }
    }

    // === DISINTEREST DETECTION ===
    const disinterestKeywords = [
      'não tenho interesse', 'nao tenho interesse',
      'não quero', 'nao quero',
      'pode encerrar', 'sem interesse',
      'não preciso', 'nao preciso',
      'não quero mais', 'nao quero mais',
      'para de me mandar', 'pare de me mandar',
      'não me mande mais', 'nao me mande mais',
    ];

    const incomingMessage = (message || '').toLowerCase().trim();
    const isDisinterest = disinterestKeywords.some(kw => incomingMessage.includes(kw));

    if (isDisinterest) {
      console.log(`[SDR-Robot-Chat] Disinterest detected for deal ${dealId}: "${message}"`);

      // Get "Perdido" stage
      const { data: perdidoStage } = await supabase
        .from('sdr_pipeline_stages')
        .select('id')
        .eq('is_system', true)
        .ilike('title', 'perdido')
        .maybeSingle();

      if (perdidoStage) {
        await supabase.from('sdr_deals').update({
          stage_id: perdidoStage.id,
          lost_at: new Date().toISOString(),
          lost_reason: 'Sem interesse',
          remarketing_stopped: true,
        }).eq('id', dealId);

        await supabase.from('sdr_deal_activities').insert({
          deal_id: dealId,
          type: 'disinterest',
          title: 'Lead demonstrou desinteresse',
          description: `O lead respondeu: "${message}". Movido automaticamente para Perdido.`,
        });

        // Stop robot and transfer
        await supabase.from('conversations').update({
          assigned_to_robot: null,
          status: 'em_fila',
          robot_transferred: true,
          updated_at: new Date().toISOString(),
        }).eq('id', conversationId);

        console.log(`[SDR-Robot-Chat] Deal ${dealId} marked as lost due to disinterest.`);
        return new Response(JSON.stringify({ success: true, action: 'disinterest_detected', dealLost: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fetch deal with stage info
    const { data: deal, error: dealError } = await supabase
      .from('sdr_deals')
      .select('*, stage:sdr_pipeline_stages(*)')
      .eq('id', dealId)
      .single();

    if (dealError || !deal) {
      console.error('[SDR-Robot-Chat] Deal not found:', dealError);
      return new Response(JSON.stringify({ error: 'Deal not found' }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stage = deal.stage;
    if (!stage) {
      console.error('[SDR-Robot-Chat] Stage not found for deal');
      return new Response(JSON.stringify({ error: 'Stage not found' }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If stage is not AI-managed, skip
    if (!stage.is_ai_managed) {
      console.log(`[SDR-Robot-Chat] Stage "${stage.title}" is not AI-managed. Skipping.`);
      return new Response(JSON.stringify({ skipped: true, reason: 'stage_not_ai_managed' }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch SDR robot config
    const { data: robotConfig } = await supabase
      .from('sdr_robot_config')
      .select('robot_id')
      .eq('is_active', true)
      .maybeSingle();

    if (!robotConfig?.robot_id) {
      console.error('[SDR-Robot-Chat] No active SDR robot config');
      return new Response(JSON.stringify({ error: 'No SDR robot configured' }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch robot
    const { data: robot, error: robotError } = await supabase
      .from('robots')
      .select('*')
      .eq('id', robotConfig.robot_id)
      .single();

    if (robotError || !robot) {
      console.error('[SDR-Robot-Chat] Robot not found:', robotError);
      return new Response(JSON.stringify({ error: 'Robot not found' }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch conversation with lock check + whatsapp_instance_id
    const { data: convData } = await supabase
      .from('conversations')
      .select('department_id, channel, contact_id, robot_lock_until, assigned_to, robot_transferred, whatsapp_instance_id')
      .eq('id', conversationId)
      .single();

    // === ROBOT_TRANSFERRED GUARD (pular se transferência manual) ===
    if (convData?.robot_transferred === true && !isTransfer) {
      console.log(`[SDR-Robot-Chat] Conversa ${conversationId} já foi transferida por robô. Ignorando.`);
      return new Response(JSON.stringify({ skipped: true, reason: 'robot_already_transferred' }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === HUMAN AGENT GUARD: Não responder se já tem atendente humano ===
    if (convData?.assigned_to) {
      console.log(`[SDR-Robot-Chat] Conversa ${conversationId} já tem atendente humano (${convData.assigned_to}). Ignorando.`);
      return new Response(JSON.stringify({ skipped: true, reason: 'human_agent_assigned' }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === CONCURRENCY LOCK: Evitar respostas duplicadas ===
    if (convData?.robot_lock_until && new Date(convData.robot_lock_until) > new Date()) {
      console.log(`[SDR-Robot-Chat] Lock ativo até ${convData.robot_lock_until}. Ignorando mensagem duplicada.`);
      return new Response(JSON.stringify({ skipped: true, reason: 'already_processing' }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === LOCK IMEDIATO: Setar lock de 3s para evitar race condition ===
    const immediateLockUntil = new Date(Date.now() + 120000).toISOString();
    await supabase.from('conversations').update({ robot_lock_until: immediateLockUntil }).eq('id', conversationId);
    console.log(`[SDR-Robot-Chat] Lock imediato de 120s setado para evitar duplicação.`);
    
    // Delay de 3s para garantir que chamadas concorrentes vejam o lock
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Re-verificar se a conversa ainda está atribuída ao robô SDR após o delay
    const { data: convRecheck } = await supabase
      .from('conversations')
      .select('assigned_to_robot, assigned_to, status')
      .eq('id', conversationId)
      .single();
    
    if (!convRecheck || convRecheck.assigned_to_robot !== robotConfig.robot_id || convRecheck.status === 'finalizada' || convRecheck.assigned_to) {
      console.log(`[SDR-Robot-Chat] Conversa mudou durante delay inicial. Abortando.`);
      await supabase.from('conversations').update({ robot_lock_until: null }).eq('id', conversationId);
      return new Response(JSON.stringify({ skipped: true, reason: 'conversation_changed_during_delay' }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === DETECTAR TRANSFERÊNCIA RECENTE ===
    const { data: recentTransfer } = await supabase
      .from('transfer_logs')
      .select('id, created_at')
      .eq('conversation_id', conversationId)
      .eq('to_robot_id', robotConfig.robot_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    const isFromTransfer = recentTransfer && (Date.now() - new Date(recentTransfer.created_at).getTime()) < 60000;
    const transferDelay = 30;

    // Set lock definitivo
    const groupMessages = robot.tools?.groupMessages ?? true;
    const groupMessagesTime = robot.tools?.groupMessagesTime ?? 40;
    const effectiveDelay = isFromTransfer ? Math.max(transferDelay, groupMessages ? groupMessagesTime : 0) : (groupMessages ? groupMessagesTime : 30);
    const lockUntil = new Date(Date.now() + effectiveDelay * 1000).toISOString();
    await supabase.from('conversations').update({ robot_lock_until: lockUntil }).eq('id', conversationId);
    console.log(`[SDR-Robot-Chat] Lock definitivo setado por ${effectiveDelay}s${isFromTransfer ? ' (transferência detectada)' : ''}`);

    // Aguardar delay (transferência ou agrupamento)
    if (isFromTransfer || groupMessages) {
      const waitTime = isFromTransfer ? transferDelay : groupMessagesTime;
      console.log(`[SDR-Robot-Chat] ${isFromTransfer ? 'Delay de transferência' : 'Agrupando mensagens'} por ${waitTime}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
      
      const { data: convCheck } = await supabase
        .from('conversations')
        .select('assigned_to_robot, assigned_to, status')
        .eq('id', conversationId)
        .single();
      
      if (!convCheck || convCheck.assigned_to_robot !== robotConfig.robot_id || convCheck.status === 'finalizada' || convCheck.assigned_to) {
        console.log(`[SDR-Robot-Chat] Conversa mudou durante agrupamento. Abortando.`);
        await supabase.from('conversations').update({ robot_lock_until: null }).eq('id', conversationId);
        return new Response(JSON.stringify({ skipped: true, reason: 'conversation_changed' }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    let conversationChannel = convData?.channel || 'whatsapp';
    let connectionType = inputConnectionType;
    let phoneNumberId = inputPhoneNumberId;

    // === READ CONTACT JID AND PHONE FROM NOTES/DB if not passed ===
    let effectiveContactJid = contactJid;
    let effectiveContactPhone = contactPhone;
    if (convData?.contact_id) {
      const { data: contactData } = await supabase
        .from('contacts')
        .select('notes, phone')
        .eq('id', convData.contact_id)
        .single();
      
      // Resolver JID
      if (!effectiveContactJid && contactData?.notes) {
        const jidMatch = contactData.notes.match(/jid:([^@\s]+@(?:s\.whatsapp\.net|lid))/);
        if (jidMatch) {
          effectiveContactJid = jidMatch[1];
          console.log(`[SDR-Robot-Chat] JID lido do contato: ${effectiveContactJid}`);
        }
      }
      
      // Resolver Phone quando ausente
      if (!effectiveContactPhone && conversationChannel !== 'machine') {
        // 1. Do contact.phone
        if (contactData?.phone) {
          const phoneDigits = contactData.phone.replace(/\D/g, '');
          if (phoneDigits.length >= 10 && phoneDigits.length <= 13) {
            effectiveContactPhone = phoneDigits;
            console.log(`[SDR-Robot-Chat] contactPhone resolvido via contact.phone: ${effectiveContactPhone}`);
          }
        }
        // 2. From JID @s.whatsapp.net
        if (!effectiveContactPhone && contactData?.notes) {
          const phoneJidMatch = contactData.notes.match(/jid:(\d+)@s\.whatsapp\.net/);
          if (phoneJidMatch) {
            effectiveContactPhone = phoneJidMatch[1];
            console.log(`[SDR-Robot-Chat] contactPhone resolvido via JID: ${effectiveContactPhone}`);
          }
        }
        // 3. Via whatsapp_lid_map
        if (!effectiveContactPhone && effectiveContactJid?.endsWith('@lid')) {
          const { data: lidMap } = await supabase
            .from('whatsapp_lid_map')
            .select('phone_digits')
            .eq('lid_jid', effectiveContactJid)
            .maybeSingle();
          if (lidMap) {
            effectiveContactPhone = lidMap.phone_digits;
            console.log(`[SDR-Robot-Chat] contactPhone resolvido via LID map: ${effectiveContactJid} → ${effectiveContactPhone}`);
          } else {
            const lidBase = effectiveContactJid.split(':')[0];
            const { data: lidMapBase } = await supabase
              .from('whatsapp_lid_map')
              .select('phone_digits')
              .like('lid_jid', `${lidBase}:%`)
              .limit(1);
            if (lidMapBase && lidMapBase.length > 0) {
              effectiveContactPhone = lidMapBase[0].phone_digits;
              console.log(`[SDR-Robot-Chat] contactPhone resolvido via LID map canônico: ${effectiveContactPhone}`);
            }
          }
        }
        // 4. Fallback: JID completo (Baileys resolve LIDs diretamente)
        if (!effectiveContactPhone && effectiveContactJid) {
          effectiveContactPhone = effectiveContactJid;
          console.log(`[SDR-Robot-Chat] contactPhone fallback JID completo: ${effectiveContactPhone}`);
        }
      }
    }

    // === PRIORITIZE conversation's whatsapp_instance_id ===
    if (!connectionType && convData?.whatsapp_instance_id && conversationChannel !== 'machine') {
      const { data: instanceConn } = await supabase
        .from('whatsapp_connections')
        .select('connection_type, phone_number_id')
        .eq('phone_number_id', convData.whatsapp_instance_id)
        .in('status', ['connected', 'active'])
        .in('connection_type', ['baileys', 'meta_api'])
        .limit(1)
        .maybeSingle();
      if (instanceConn) {
        connectionType = instanceConn.connection_type;
        phoneNumberId = instanceConn.phone_number_id;
        console.log(`[SDR-Robot-Chat] Conexão via whatsapp_instance_id: ${phoneNumberId} (${connectionType})`);
      }
    }

    // Auto-detect connection type by department
    if (!connectionType && conversationChannel !== 'machine' && convData?.department_id) {
      const { data: metaConn } = await supabase
        .from('whatsapp_connections')
        .select('connection_type, phone_number_id')
        .eq('department_id', convData.department_id)
        .eq('connection_type', 'meta_api')
        .in('status', ['connected', 'active'])
        .maybeSingle();

      if (metaConn) {
        connectionType = 'meta_api';
        phoneNumberId = metaConn.phone_number_id;
      } else {
        const { data: baileysConn } = await supabase
          .from('whatsapp_connections')
          .select('connection_type, phone_number_id')
          .eq('department_id', convData.department_id)
          .eq('connection_type', 'baileys')
          .in('status', ['connected', 'active'])
          .maybeSingle();
        if (baileysConn) {
          connectionType = 'baileys';
          phoneNumberId = baileysConn.phone_number_id;
        }
      }
    }

    if (!connectionType) {
      const { data: anyConn } = await supabase
        .from('whatsapp_connections')
        .select('connection_type, phone_number_id')
        .in('status', ['connected', 'active'])
        .limit(1)
        .maybeSingle();
      if (anyConn) {
        connectionType = anyConn.connection_type;
        phoneNumberId = anyConn.phone_number_id;
      }
    }

    console.log(`[SDR-Robot-Chat] Conexão final: type=${connectionType}, phoneNumberId=${phoneNumberId}, channel=${conversationChannel}`);

    // Fetch conversation history
    const { data: messagesData } = await supabase
      .from('messages')
      .select('content, sender_id, sender_name, message_type, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(20);

    // === FETCH SDR AUTO CONFIG (single query for all transfer points) ===
    const { data: autoTransferCfg } = await supabase
      .from('sdr_auto_config')
      .select('transfer_to_user_id, keywords, is_active')
      .eq('is_active', true)
      .maybeSingle();

    // Helper: only assign transfer_to_user_id if keywords were detected in client messages
    function getTransferUserId(messages: any[], config: any): string | null {
      if (!config?.transfer_to_user_id || !config?.keywords?.length) return null;
      const clientMessages = messages.filter(m => !m.sender_name?.includes('[ROBOT]') && !m.sender_name?.includes('(IA)') && m.sender_id === null && m.message_type !== 'system');
      const allContent = clientMessages.map(m => (m.content || '').toLowerCase()).join(' ');
      const matched = config.keywords.some((kw: string) => allContent.includes(kw.toLowerCase()));
      console.log(`[SDR-Robot-Chat] Keyword check: matched=${matched}, keywords=${config.keywords.join(',')}`);
      return matched ? config.transfer_to_user_id : null;
    }

    const readImages = robot.tools?.readImages ?? true;
    const conversationHistory = await buildMessageHistory(messagesData || [], readImages, '[SDR-Robot-Chat]');

    // Re-fetch messages after grouping if needed
    if (groupMessages) {
      const { data: freshMessages } = await supabase
        .from('messages')
        .select('content, sender_id, sender_name, message_type, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(30);
      
      const freshHistory = await buildMessageHistory(freshMessages || [], readImages, '[SDR-Robot-Chat]');
      conversationHistory.length = 0;
      freshHistory.forEach(h => conversationHistory.push(h));
      console.log(`[SDR-Robot-Chat] Histórico re-carregado com ${conversationHistory.length} mensagens`);
    }

    // Fetch last transfer reason for this conversation
    const { data: lastTransfer } = await supabase
      .from('transfer_logs')
      .select('reason, from_user_name')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastTransfer?.reason) {
      console.log(`[SDR-Robot-Chat] Transfer context found from "${lastTransfer.from_user_name}": "${lastTransfer.reason}"`);
    }

    // Fetch all pipeline stages for advance tool
    const { data: allStages } = await supabase
      .from('sdr_pipeline_stages')
      .select('id, title, position, is_ai_managed, is_system')
      .eq('is_active', true)
      .order('position');

    // Build system prompt with stage-specific instructions
    const stagePrompt = stage.ai_trigger_criteria || '';
    const contactInfo = deal.company ? `Empresa: ${deal.company}` : '';
    const dealValue = deal.value ? `Valor: R$ ${Number(deal.value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';

    let systemPrompt = `Você é ${robot.name}, um assistente de vendas inteligente.\n\n`;
    
    if (robot.instructions) {
      systemPrompt += `## Instruções Base do Agente\n${robot.instructions}\n\n`;
    }

    systemPrompt += `## Contexto do Lead\n`;
    systemPrompt += `- Lead: ${deal.title}\n`;
    if (contactInfo) systemPrompt += `- ${contactInfo}\n`;
    if (dealValue) systemPrompt += `- ${dealValue}\n`;
    systemPrompt += `- Etapa atual no pipeline: ${stage.title}\n\n`;

    if (stagePrompt) {
      systemPrompt += `## Instruções Específicas da Etapa "${stage.title}"\n${stagePrompt}\n\n`;
    }

    // Q&A pairs from robot
    const qaPairs = (robot.qa_pairs as any[]) || [];
    if (qaPairs.length > 0) {
      systemPrompt += `## Base de Conhecimento\n`;
      qaPairs.forEach((qa, i) => {
        if (qa.question && qa.answer) {
          systemPrompt += `**P${i + 1}:** ${qa.question}\n**R:** ${qa.answer}\n\n`;
        }
      });
    }

    // Reference links
    const referenceLinks = (robot.reference_links as any[]) || [];
    const linkRefs = referenceLinks.filter(l => !l.type || l.type === 'link');
    const fileRefs = referenceLinks.filter(l => l.type === 'file');

    if (linkRefs.length > 0) {
      systemPrompt += `## Links de Referência\n`;
      linkRefs.forEach(link => {
        if (link.title && link.url) {
          systemPrompt += `- **${link.title}**: ${link.url}\n`;
          if (link.content) systemPrompt += `  Conteúdo: ${link.content}\n`;
        }
      });
      systemPrompt += `\n`;
    }

    if (fileRefs.length > 0) {
      systemPrompt += `## Base de Consulta - Documentos\n`;
      fileRefs.forEach(link => {
        if (link.fileContent) {
          systemPrompt += `### Documento: ${link.fileName || link.title}\n${link.fileContent}\n\n`;
        }
      });
    }

    // Calculate next stage BEFORE building prompt
    const nextStages = (allStages || []).filter(s => s.position > stage.position).sort((a, b) => a.position - b.position);
    const nextStage = nextStages[0];

    // Build pipeline map for the prompt
    const pipelineMap = (allStages || []).map(s => `${s.position}. ${s.title}${s.is_ai_managed ? ' (IA)' : ' (Humano)'}${s.id === stage.id ? ' ← VOCÊ ESTÁ AQUI' : ''}`).join('\n');

    systemPrompt += `## Fluxo Completo do Pipeline\n${pipelineMap}\n\n`;

    // Stage-specific AI criteria (from pipeline settings)
    const stageCriteria = stage.ai_trigger_criteria;
    if (stageCriteria) {
      systemPrompt += `## Instruções Específicas desta Etapa ("${stage.title}")\n`;
      systemPrompt += `${stageCriteria}\n\n`;
    }

    systemPrompt += `## Ferramentas Disponíveis e QUANDO USAR\n`;
    systemPrompt += `### advance_lead_stage (IMPORTANTE!)\n`;
    systemPrompt += `Você DEVE chamar esta ferramenta imediatamente quando detectar sinais de progresso do lead. NÃO espere o lead pedir para avançar.\n`;
    if (stageCriteria) {
      systemPrompt += `CRITÉRIO PRINCIPAL PARA AVANÇAR (definido nas configurações do pipeline):\n${stageCriteria}\n`;
    } else {
      systemPrompt += `Exemplos de quando avançar:\n`;
      systemPrompt += `- O lead demonstrou interesse real (respondeu positivamente, fez perguntas sobre o produto/serviço)\n`;
      systemPrompt += `- O lead confirmou que quer saber mais, pediu detalhes, condições ou proposta\n`;
      systemPrompt += `- O lead forneceu informações solicitadas (nome, empresa, necessidade)\n`;
      systemPrompt += `- O lead reagiu positivamente à apresentação do produto\n`;
    }
    if (nextStage) {
      systemPrompt += `➡️ Próxima etapa: "${nextStage.title}". Chame advance_lead_stage assim que o lead cumprir os critérios acima.\n`;
    }
    systemPrompt += `\n### transfer_to_human\n`;
    systemPrompt += `Use quando o lead precisar de atendimento humano (negociação, proposta personalizada, dúvidas complexas).\n`;
    systemPrompt += `\n### edit_contact\n`;
    systemPrompt += `Use para atualizar informações do contato (nome, email, etc.).\n`;
    systemPrompt += `\n### manage_labels\n`;
    systemPrompt += `Use para gerenciar tags da conversa.\n`;

    systemPrompt += `\n## Diretrizes\n`;
    systemPrompt += `- Seja cordial, profissional e focado em vendas.\n`;
    systemPrompt += `- Responda de forma concisa e direta.\n`;
    systemPrompt += `- FORMATAÇÃO NUMÉRICA: Sempre use o padrão brasileiro para números e valores monetários. Use ponto como separador de milhar e vírgula como separador decimal. Exemplos: 700.000 (setecentos mil), R$ 7.000,00 (sete mil reais), 1,5% (um e meio por cento). NUNCA use o formato americano (ex: 700,000 ou R$ 7,000.00).\n`;
    systemPrompt += `- REGRA CRÍTICA: Avance o lead proativamente! Não fique preso na mesma etapa. Ao perceber interesse, chame advance_lead_stage IMEDIATAMENTE junto com sua resposta.\n`;
    systemPrompt += `- **REGRA CRÍTICA**: Responda SOMENTE com base nas informações presentes na sua Base de Conhecimento (Instruções, Perguntas e Respostas, Links de Referência e Documentos). Se a pergunta do cliente não puder ser respondida com as informações disponíveis, informe educadamente que não possui essa informação e ofereça transferir para um atendente. NUNCA invente ou alucine informações que não estejam na sua base de conhecimento.\n`;
    if (robot.tools?.sendAgentName) {
      systemPrompt += `- Identifique-se como ${robot.name}. Nunca mencione que é uma IA.\n`;
    }
    if (robot.finalization_message) {
      systemPrompt += `\n## Mensagem de Finalização\n"${robot.finalization_message}"\n`;
    }

    const tools: any[] = [
      {
        type: "function",
        function: {
          name: "advance_lead_stage",
          description: `Avançar o lead para a próxima etapa do pipeline. Etapa atual: "${stage.title}". ${nextStage ? `Próxima etapa: "${nextStage.title}"` : 'Não há próxima etapa.'}`,
          parameters: {
            type: "object",
            properties: {
              reason: { type: "string", description: "Motivo do avanço" },
              message_to_client: { type: "string", description: "Mensagem para o cliente sobre o progresso" }
            },
            required: ["reason", "message_to_client"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "transfer_to_human",
          description: "Transferir para atendente humano quando necessário",
          parameters: {
            type: "object",
            properties: {
              reason: { type: "string", description: "Motivo da transferência" },
              message_to_client: { type: "string", description: "Mensagem para o cliente" }
            },
            required: ["reason", "message_to_client"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "edit_contact",
          description: "Atualizar informações do contato",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", description: "Novo nome (opcional)" },
              email: { type: "string", description: "Email (opcional)" },
              notes: { type: "string", description: "Observações (opcional)" }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "manage_labels",
          description: "Adicionar ou remover tags na conversa",
          parameters: {
            type: "object",
            properties: {
              action: { type: "string", enum: ["add", "remove"], description: "Ação" },
              label: { type: "string", description: "Nome da tag" }
            },
            required: ["action", "label"]
          }
        }
      }
    ];

    const { apiUrl, apiKey, providerName } = getApiConfig(robot.intelligence);
    if (!apiKey) {
      return new Response(JSON.stringify({ error: `API Key not configured for ${providerName}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const model = getModelFromIntelligence(robot.intelligence);
    const temperature = getTemperatureFromTone(robot.tone);

    const openaiBody: any = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...conversationHistory,
        ...(lastTransfer?.reason ? [{
          role: "system" as const,
          content: `## Contexto da Transferência — PRIORIDADE MÁXIMA\nO atendente "${lastTransfer.from_user_name || 'Atendente'}" transferiu esta conversa para você com a seguinte instrução:\n"${lastTransfer.reason}"\nIMPORTANTE: NÃO se apresente novamente. Continue a conversa naturalmente, usando o motivo acima como guia principal para sua próxima resposta.`
        }] : []),
      ],
      max_tokens: robot.max_tokens || 500,
      temperature,
      tools,
      tool_choice: "auto",
    };

    console.log(`[SDR-Robot-Chat] Provider: ${providerName}, Model: ${model}, Stage: ${stage.title}`);

    // Call AI with retry
    async function callAIWithRetry(): Promise<Response> {
      const resp1 = await fetch(apiUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(openaiBody),
      });
      if (resp1.ok) return resp1;

      if (resp1.status === 429) {
        console.warn(`[SDR-Robot-Chat] 429 rate limit, retrying in 25s...`);
        await new Promise(r => setTimeout(r, 25000));
        const resp2 = await fetch(apiUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(openaiBody),
        });
        if (resp2.ok) return resp2;

        // Fallback to Lovable AI
        const lovableKey = Deno.env.get("LOVABLE_API_KEY");
        if (lovableKey) {
          const fallbackBody = { ...openaiBody, model: "google/gemini-2.5-flash" };
          const resp3 = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(fallbackBody),
          });
          if (resp3.ok) return resp3;
        }
        throw new Error('AI API unavailable after retry');
      }

      const errorText = await resp1.text();
      throw new Error(`${providerName} API error: ${resp1.status} ${errorText}`);
    }

    let aiResponse: Response;
    try {
      aiResponse = await callAIWithRetry();
    } catch (err) {
      console.error('[SDR-Robot-Chat] AI error:', err);
      await supabase.from('conversations').update({ robot_lock_until: null }).eq('id', conversationId);
      return new Response(JSON.stringify({ error: 'AI API error' }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const choice = aiData.choices?.[0];
    const toolCalls = choice?.message?.tool_calls;
    let responseText = choice?.message?.content || '';
    let actionTaken = false;

    // Process tool calls
    if (toolCalls?.length > 0) {
    // Limpar content da IA quando há tool calls de transferência para evitar duplicação
    const hasTransferTool = toolCalls.some((tc: any) => 
      ['transfer_to_human', 'advance_lead_stage'].includes(tc.function.name)
    );
    if (hasTransferTool) {
      responseText = '';
    }
    
    for (const toolCall of toolCalls) {
        const fnName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);
        console.log(`[SDR-Robot-Chat] Tool: ${fnName}`, args);

        if (fnName === 'advance_lead_stage') {
          if (!nextStage) {
            console.log('[SDR-Robot-Chat] No next stage available');
            continue;
          }

          // Move deal to next stage
          await supabase.from('sdr_deals').update({ stage_id: nextStage.id, updated_at: new Date().toISOString() }).eq('id', dealId);
          console.log(`[SDR-Robot-Chat] Deal advanced to "${nextStage.title}"`);

          // Log activity
          await supabase.from('sdr_deal_activities').insert({
            deal_id: dealId,
            type: 'stage_change',
            title: `Avançou de "${stage.title}" para "${nextStage.title}"`,
            description: args.reason,
          });

          // If next stage is NOT ai-managed, transfer to human
          if (!nextStage.is_ai_managed) {
            console.log(`[SDR-Robot-Chat] Next stage "${nextStage.title}" is not AI-managed. Transferring to human.`);
            
            // Use pre-fetched autoTransferCfg + keyword check
            const latestMsgs = (await supabase.from('messages').select('content, sender_id, sender_name, message_type').eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(30)).data || [];
            const transferUserId = getTransferUserId(latestMsgs, autoTransferCfg);
            
            await supabase.from('conversations').update({
              status: transferUserId ? 'em_atendimento' : 'em_fila',
              assigned_to_robot: null,
              assigned_to: transferUserId,
              wait_time: 0,
              robot_transferred: true,
              updated_at: new Date().toISOString()
            }).eq('id', conversationId);
            
            if (transferUserId) {
              // Fetch user name for system message
              const { data: transferUser } = await supabase
                .from('profiles')
                .select('name')
                .eq('id', transferUserId)
                .single();
              console.log(`[SDR-Robot-Chat] Transferido diretamente para: ${transferUser?.name || transferUserId}`);
            }

            await supabase.from('messages').insert({
              conversation_id: conversationId,
              content: `${robot.name} transferiu para atendimento humano (Lead avançou para "${nextStage.title}")`,
              sender_name: 'SYSTEM',
              sender_id: null,
              message_type: 'system',
              status: 'sent',
            });

            responseText = args.message_to_client || `Seu atendimento será continuado por um de nossos especialistas. Aguarde um momento!`;
          } else {
            // Stage is AI-managed — check for double-advance
            // If the robot's message mentions transfer/handoff and there's a next human stage, auto-advance
            const msgText = (args.message_to_client || '').toLowerCase();
            const transferKeywords = ['encaminhar', 'transferir', 'passar para', 'falar com', 'especialista', 'consultor'];
            const mentionsTransfer = transferKeywords.some(kw => msgText.includes(kw));

            const nextNextStages = (allStages || []).filter(s => s.position > nextStage.position).sort((a, b) => a.position - b.position);
            const nextNextStage = nextNextStages[0];

            if (mentionsTransfer && nextNextStage && !nextNextStage.is_ai_managed) {
              console.log(`[SDR-Robot-Chat] Double-advance: "${nextStage.title}" (AI) → "${nextNextStage.title}" (Human)`);
              
              // Advance deal again to human stage
              await supabase.from('sdr_deals').update({ stage_id: nextNextStage.id, updated_at: new Date().toISOString() }).eq('id', dealId);
              
              await supabase.from('sdr_deal_activities').insert({
                deal_id: dealId,
                type: 'stage_change',
                title: `Avançou de "${nextStage.title}" para "${nextNextStage.title}"`,
                description: 'Avanço automático — lead qualificado com transferência detectada',
              });

              // Transfer to human — use keyword check
              const latestMsgsDA = (await supabase.from('messages').select('content, sender_id, sender_name, message_type').eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(30)).data || [];
              const transferUserIdDA = getTransferUserId(latestMsgsDA, autoTransferCfg);

              await supabase.from('conversations').update({
                status: transferUserIdDA ? 'em_atendimento' : 'em_fila',
                assigned_to_robot: null,
                assigned_to: transferUserIdDA,
                wait_time: 0,
                robot_transferred: true,
                updated_at: new Date().toISOString()
              }).eq('id', conversationId);

              if (transferUserIdDA) {
                const { data: transferUserDA } = await supabase
                  .from('profiles')
                  .select('name')
                  .eq('id', transferUserIdDA)
                  .single();
                console.log(`[SDR-Robot-Chat] Double-advance transfer to: ${transferUserDA?.name || transferUserIdDA}`);
              }

              await supabase.from('messages').insert({
                conversation_id: conversationId,
                content: `${robot.name} transferiu para atendimento humano (Lead avançou para "${nextNextStage.title}")`,
                sender_name: 'SYSTEM',
                sender_id: null,
                message_type: 'system',
                status: 'sent',
              });

              responseText = args.message_to_client || `Seu atendimento será continuado por um de nossos especialistas. Aguarde um momento!`;
            } else {
              responseText = args.message_to_client || `Ótimo progresso! Vamos continuar.`;
            }
          }

          actionTaken = true;
          break; // Evitar duplicação de transferências
        }

        else if (fnName === 'transfer_to_human') {
          // Transfer to human — use keyword check
          const latestMsgsTH = (await supabase.from('messages').select('content, sender_id, sender_name, message_type').eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(30)).data || [];
          const transferUserId2 = getTransferUserId(latestMsgsTH, autoTransferCfg);

          await supabase.from('conversations').update({
            status: transferUserId2 ? 'em_atendimento' : 'em_fila',
            assigned_to_robot: null,
            assigned_to: transferUserId2,
            wait_time: 0,
            robot_transferred: true,
            updated_at: new Date().toISOString()
          }).eq('id', conversationId);

          await supabase.from('messages').insert({
            conversation_id: conversationId,
            content: `${robot.name} transferiu para atendimento humano`,
            sender_name: 'SYSTEM',
            sender_id: null,
            message_type: 'system',
            status: 'sent',
          });

          responseText = args.message_to_client || 'Vou transferir você para um especialista. Aguarde!';
          actionTaken = true;
          break; // Evitar duplicação de transferências
        }

        else if (fnName === 'edit_contact') {
          if (convData?.contact_id) {
            const updateData: any = {};
            if (args.name) { updateData.name = args.name; updateData.name_edited = true; }
            if (args.email) updateData.email = args.email;
            if (args.notes) updateData.notes = args.notes;
            if (Object.keys(updateData).length > 0) {
              await supabase.from('contacts').update(updateData).eq('id', convData.contact_id);
            }
          }
        }

        else if (fnName === 'manage_labels') {
          const { data: convTags } = await supabase.from('conversations').select('tags').eq('id', conversationId).single();
          let currentTags: string[] = convTags?.tags || [];
          if (args.action === 'add' && !currentTags.includes(args.label)) currentTags.push(args.label);
          else if (args.action === 'remove') currentTags = currentTags.filter(t => t !== args.label);
          await supabase.from('conversations').update({ tags: currentTags, updated_at: new Date().toISOString() }).eq('id', conversationId);
        }
      }
    }

    if (!responseText && !actionTaken) {
      console.error('[SDR-Robot-Chat] Empty response');
      return new Response(JSON.stringify({ error: 'Empty AI response' }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Split messages if configured
    const shouldSplit = robot.tools?.splitByLineBreak && responseText.includes('\n');
    const parts = shouldSplit
      ? responseText.split('\n').map((p: string) => p.trim()).filter((p: string) => p.length > 0)
      : [responseText];

    // Delay for client message to load
    await new Promise(r => setTimeout(r, 3000));

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      await supabase.from('messages').insert({
        conversation_id: conversationId,
        content: part,
        sender_name: `${robot.name} [ROBOT]`,
        sender_id: null,
        message_type: 'text',
        status: 'sent'
      });

      // Send via appropriate channel
      let sendOk = false;
      if (conversationChannel === 'machine') {
        sendOk = await sendViaMachine(conversationId, part, robot.tools?.sendAgentName ? robot.name : 'Atendente');
      } else if (effectiveContactPhone || effectiveContactJid) {
        const formatted = robot.tools?.sendAgentName ? `*${robot.name}*: ${part}` : part;
        if (connectionType === 'meta_api' && phoneNumberId) {
          sendOk = await sendViaMetaApi(phoneNumberId, effectiveContactPhone, formatted);
        } else {
          sendOk = await sendViaBaileys(effectiveContactPhone, effectiveContactJid, formatted, phoneNumberId);
        }
      } else {
        console.error(`[SDR-Robot-Chat] Sem contactPhone nem JID para enviar mensagem!`);
      }
      console.log(`[SDR-Robot-Chat] Parte ${i + 1}/${parts.length} enviada: ${sendOk}`);

      if (i < parts.length - 1) await new Promise(r => setTimeout(r, 1500));
    }

    // Update conversation preview and clear lock
    await supabase.from('conversations').update({
      last_message_preview: parts[parts.length - 1].substring(0, 80),
      updated_at: new Date().toISOString(),
      robot_lock_until: null
    }).eq('id', conversationId);

    // Increment robot counter
    await supabase.from('robots').update({
      messages_count: (robot.messages_count || 0) + 1,
      last_triggered: new Date().toISOString()
    }).eq('id', robotConfig.robot_id);

    return new Response(JSON.stringify({ success: true, response: responseText }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[SDR-Robot-Chat] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
