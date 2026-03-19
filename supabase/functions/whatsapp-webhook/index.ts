import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-baileys-secret',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Normalize: ensure protocol exists and remove trailing slash
const _rawBaileysUrl = Deno.env.get('BAILEYS_SERVER_URL');
const BAILEYS_SERVER_URL = (() => {
  if (!_rawBaileysUrl) return undefined;
  let url = _rawBaileysUrl.trim().replace(/\/+$/, '');
  if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'http://' + url;
  }
  return url;
})();

// Secret for validating requests from Baileys server
const BAILEYS_WEBHOOK_SECRET = Deno.env.get('BAILEYS_WEBHOOK_SECRET') || '';

/**
 * Formata um número de telefone brasileiro no padrão +55 XX XXXXX-XXXX
 * Aceita apenas dígitos puros. Retorna null se não for um telefone válido.
 */
function formatBrazilianPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  
  // Rejeitar LIDs e números claramente inválidos
  if (digits.length < 10 || digits.length > 13) return null;
  
  let normalized = digits;
  
  // Adicionar DDI 55 se não tiver
  if (!normalized.startsWith('55') && (normalized.length === 10 || normalized.length === 11)) {
    normalized = '55' + normalized;
  }
  
  // Agora deve ter 12 (fixo) ou 13 (celular) dígitos
  if (normalized.length === 12) {
    // +55 XX XXXX-XXXX (fixo)
    const ddi = normalized.slice(0, 2);
    const ddd = normalized.slice(2, 4);
    const part1 = normalized.slice(4, 8);
    const part2 = normalized.slice(8, 12);
    return `+${ddi} ${ddd} ${part1}-${part2}`;
  }
  
  if (normalized.length === 13) {
    // +55 XX XXXXX-XXXX (celular)
    const ddi = normalized.slice(0, 2);
    const ddd = normalized.slice(2, 4);
    const part1 = normalized.slice(4, 9);
    const part2 = normalized.slice(9, 13);
    return `+${ddi} ${ddd} ${part1}-${part2}`;
  }
  
  // Fallback: retorna com + na frente se tiver DDI
  if (normalized.startsWith('55')) {
    return `+${normalized}`;
  }
  
  return null;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ====== ORIGIN VALIDATION ======
    const baileysSecret = req.headers.get('x-baileys-secret');
    
    if (BAILEYS_WEBHOOK_SECRET && baileysSecret !== BAILEYS_WEBHOOK_SECRET) {
      console.error('[WhatsApp Webhook] Assinatura inválida — request rejeitado');
      return new Response('Unauthorized', { status: 401 });
    }
    
    const body = await req.json();
    const { event, instanceId, data, timestamp } = body;

    console.log(`[WhatsApp Webhook] Evento recebido: ${event}, instanceId: ${instanceId || 'default'}`);

    // Use instanceId to find the correct connection (multi-instance support)
    const effectiveInstanceId = instanceId || 'default';

    switch (event) {
      case 'connection.open': {
        console.log(`[WhatsApp] Conectado: ${data.phone}, instanceId: ${effectiveInstanceId}`);
        
        // Find connection by instanceId (phone_number_id)
        const { data: existingBaileysConn } = await supabase
          .from('whatsapp_connections')
          .select('id, department_id')
          .eq('connection_type', 'baileys')
          .eq('phone_number_id', effectiveInstanceId)
          .maybeSingle();
        
        if (!existingBaileysConn) {
          console.log('[WhatsApp] Criando registro de conexão Baileys...');
          
          const { data: robotWithDept } = await supabase
            .from('robots')
            .select('departments')
            .eq('status', 'active')
            .limit(1)
            .maybeSingle();
          
          let deptIdForConnection = robotWithDept?.departments?.[0];
          
          if (!deptIdForConnection) {
            const { data: firstDept } = await supabase
              .from('departments')
              .select('id')
              .limit(1)
              .maybeSingle();
            deptIdForConnection = firstDept?.id;
          }
          
          if (deptIdForConnection) {
            const phoneAsId = data.phone || `baileys_${Date.now()}`;
            
            const { error: insertError } = await supabase
              .from('whatsapp_connections')
              .insert({
                connection_type: 'baileys',
                status: 'connected',
                department_id: deptIdForConnection,
                phone_display: data.phone,
                phone_number_id: phoneAsId,
                waba_id: phoneAsId
              });
            
            if (insertError) {
              console.error('[WhatsApp] Erro ao criar conexão Baileys:', insertError);
            } else {
              console.log(`[WhatsApp] Conexão Baileys criada com departamento: ${deptIdForConnection}`);
            }
          }
        } else {
          const { error: updateError } = await supabase
            .from('whatsapp_connections')
            .update({
              status: 'connected',
              phone_display: data.phone,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingBaileysConn.id);

          if (updateError) {
            console.error('[WhatsApp] Erro ao atualizar conexão:', updateError);
          }
        }
        break;
      }

      case 'connection.closed': {
        console.log(`[WhatsApp] Desconectado: ${data.reason}, instanceId: ${effectiveInstanceId}`);
        
        // Update specific instance by instanceId
        await supabase
          .from('whatsapp_connections')
          .update({
            status: 'disconnected',
            updated_at: new Date().toISOString()
          })
          .eq('connection_type', 'baileys')
          .eq('phone_number_id', effectiveInstanceId);
        break;
      }

      case 'contacts.sync': {
        // ====== PROCESSAR MAPEAMENTO LID → TELEFONE REAL ======
        const syncContacts = data.contacts || [];
        console.log(`[WhatsApp] contacts.sync recebido: ${syncContacts.length} contatos`);
        
        for (const c of syncContacts) {
          if (!c.phone || !c.jid) continue;
          
          // PROTEÇÃO: Validar que c.phone é um telefone real (não LID)
          const phoneDigits = c.phone.replace(/\D/g, '');
          if (phoneDigits.length > 13 || phoneDigits.length < 10) {
            console.log(`[WhatsApp] contacts.sync: Phone inválido ignorado: ${c.phone}`);
            continue;
          }
          
          // ====== PERSISTIR MAPEAMENTO LID → PHONE NO BANCO ======
          if (c.lid && c.lid.endsWith('@lid')) {
            // Extrair base canônica do LID (remover sufixo :NN@lid → usar tudo antes de @lid)
            const lidCanonical = c.lid;
            await supabase
              .from('whatsapp_lid_map')
              .upsert({
                lid_jid: lidCanonical,
                phone_digits: phoneDigits,
                instance_id: effectiveInstanceId,
                updated_at: new Date().toISOString()
              }, { onConflict: 'lid_jid,instance_id' });
            console.log(`[WhatsApp] contacts.sync: LID map persistido: ${lidCanonical} → ${phoneDigits}`);
          }
          
          // Buscar contatos LID que tenham este JID mapeado via lid field
          // ou que tenham o LID no notes
          if (c.lid) {
            const { data: lidContacts } = await supabase
              .from('contacts')
              .select('id, phone, name, name_edited')
              .ilike('notes', `%jid:${c.lid}%`)
              .is('phone', null)
              .limit(5);
            
            if (lidContacts && lidContacts.length > 0) {
              for (const lc of lidContacts) {
                const formattedPhone = formatBrazilianPhone(c.phone);
                const updates: Record<string, string> = { phone: formattedPhone || c.phone };
                // Atualizar nome se temos um nome melhor e não foi editado
                if (c.name && !lc.name_edited && (lc.name === 'Desconhecido' || lc.name?.startsWith('WhatsApp LID') || lc.name?.startsWith('Contato WhatsApp'))) {
                  updates.name = c.name;
                }
                await supabase.from('contacts').update(updates).eq('id', lc.id);
                console.log(`[WhatsApp] contacts.sync: Contato ${lc.id} atualizado com phone=${c.phone}`);
                
                // ====== AUTO-MERGE: Verificar se já existe outro contato com esse phone ======
                const phoneToCheck = formattedPhone || c.phone;
                const phoneDigitsToCheck = phoneToCheck.replace(/\D/g, '');
                if (phoneDigitsToCheck.length >= 10 && phoneDigitsToCheck.length <= 13) {
                  const { data: existingByPhone } = await supabase
                    .rpc('find_contact_by_phone', { phone_input: phoneDigitsToCheck });
                  
                  if (existingByPhone && existingByPhone.length > 0 && existingByPhone[0].id !== lc.id) {
                    const primaryId = existingByPhone[0].id;
                    console.log(`[WhatsApp] contacts.sync: 🔄 MERGE: ${lc.id} duplica ${primaryId} (${existingByPhone[0].name}) — merging`);
                    const { data: mergeResult } = await supabase.rpc('merge_duplicate_contacts', {
                      primary_id: primaryId,
                      duplicate_id: lc.id
                    });
                    if (mergeResult?.success) {
                      console.log(`[WhatsApp] contacts.sync: ✅ MERGE via RPC: ${JSON.stringify(mergeResult)}`);
                    } else {
                      console.warn(`[WhatsApp] contacts.sync: ⚠️ MERGE falhou: ${JSON.stringify(mergeResult)}`);
                    }
                  }
                }
              }
            }
          }
          
          // Também tentar pelo JID normal (phone@s.whatsapp.net)
          if (c.jid.endsWith('@s.whatsapp.net') && c.name) {
            const { data: phonelessContacts } = await supabase
              .from('contacts')
              .select('id, name, name_edited')
              .ilike('notes', `%jid:${c.jid}%`)
              .is('phone', null)
              .limit(3);
            
            if (phonelessContacts && phonelessContacts.length > 0) {
              for (const pc of phonelessContacts) {
                const phoneForUpdate = formatBrazilianPhone(c.phone) || c.phone;
                await supabase.from('contacts').update({ phone: phoneForUpdate }).eq('id', pc.id);
                console.log(`[WhatsApp] contacts.sync: Contato ${pc.id} recebeu phone=${c.phone} via JID`);
                
                // ====== AUTO-MERGE: Verificar duplicata após atribuir phone ======
                const digitsCheck = phoneForUpdate.replace(/\D/g, '');
                if (digitsCheck.length >= 10 && digitsCheck.length <= 13) {
                  const { data: existingByPhone2 } = await supabase
                    .rpc('find_contact_by_phone', { phone_input: digitsCheck });
                  if (existingByPhone2 && existingByPhone2.length > 0 && existingByPhone2[0].id !== pc.id) {
                    console.log(`[WhatsApp] contacts.sync JID: 🔄 MERGE: ${pc.id} → ${existingByPhone2[0].id}`);
                    await supabase.rpc('merge_duplicate_contacts', {
                      primary_id: existingByPhone2[0].id,
                      duplicate_id: pc.id
                    });
                  }
                }
              }
            }
          }
        }
        break;
      }

      case 'message.received': {
        const {
          messageId,
          sender,
          senderJid,
          senderName,
          isGroup,
          content: originalContent,
          messageType,
          mediaBase64,
          mediaUrl,
          mimeType,
          fileName,
          participant,
          resolvedPhone,
          timestamp: msgTimestamp
        } = data;

        if (isGroup) {
          console.log('[WhatsApp] Mensagem de grupo ignorada');
          break;
        }

        // ====== DEDUPLICAÇÃO RÁPIDA ======
        if (messageId) {
          const { data: existingMsg } = await supabase
            .from('messages')
            .select('id')
            .eq('external_id', messageId)
            .maybeSingle();
          
          if (existingMsg) {
            console.log(`[WhatsApp] Mensagem duplicada ignorada: ${messageId}`);
            break;
          }
        }

        // ====== DETECÇÃO DE LID vs TELEFONE REAL ======
        const isLid = senderJid?.endsWith('@lid') || 
                      (sender && sender.length >= 13 && !sender.startsWith('55'));
        
        // ====== CONSULTAR MAPA PERSISTENTE LID → PHONE ======
        // Validar resolvedPhone: só aceitar 10-13 dígitos (telefone real)
        let effectiveResolvedPhone: string | null = null;
        if (resolvedPhone) {
          const rpDigits = resolvedPhone.replace(/\D/g, '');
          if (rpDigits.length >= 10 && rpDigits.length <= 13) {
            effectiveResolvedPhone = resolvedPhone;
          } else {
            console.log(`[WhatsApp] resolvedPhone inválido descartado: ${resolvedPhone} (${rpDigits.length} dígitos)`);
          }
        }
        const extractPhoneFromJid = (jidValue: string | null | undefined): string | null => {
          if (!jidValue) return null;
          const normalizedJid = String(jidValue).toLowerCase();
          if (!normalizedJid.endsWith('@s.whatsapp.net')) return null;
          const digits = normalizedJid.split('@')[0].replace(/\D/g, '');
          return digits.length >= 10 && digits.length <= 13 ? digits : null;
        };

        if (isLid && !effectiveResolvedPhone && senderJid?.endsWith('@lid')) {
          console.log(`[WhatsApp] LID sem resolvedPhone - consultando mapa persistente para ${senderJid} (instance: ${effectiveInstanceId})`);
          
          // 1) Buscar pelo JID exato NA MESMA INSTÂNCIA (prioridade)
          const { data: lidMapByInstance } = await supabase
            .from('whatsapp_lid_map')
            .select('phone_digits')
            .eq('lid_jid', senderJid)
            .eq('instance_id', effectiveInstanceId)
            .maybeSingle();
          
          if (lidMapByInstance) {
            effectiveResolvedPhone = lidMapByInstance.phone_digits;
            console.log(`[WhatsApp] ✅ LID resolvido via mapa (mesma instância): ${senderJid} → ${effectiveResolvedPhone}`);
          } else {
            // 2) Busca canônica na mesma instância
            const lidBase = senderJid.split(':')[0];
            if (lidBase) {
              const { data: lidMapByBase } = await supabase
                .from('whatsapp_lid_map')
                .select('phone_digits, lid_jid')
                .like('lid_jid', `${lidBase}:%`)
                .eq('instance_id', effectiveInstanceId)
                .limit(1);
              
              if (lidMapByBase && lidMapByBase.length > 0) {
                effectiveResolvedPhone = lidMapByBase[0].phone_digits;
                console.log(`[WhatsApp] ✅ LID resolvido via base canônica (mesma instância): ${lidBase} → ${effectiveResolvedPhone}`);
              }
            }
            
            // 3) Fallback global SOMENTE para leitura (não persiste cruzado)
            if (!effectiveResolvedPhone) {
              const { data: lidMapGlobal } = await supabase
                .from('whatsapp_lid_map')
                .select('phone_digits, instance_id')
                .eq('lid_jid', senderJid)
                .limit(1)
                .maybeSingle();
              
              if (lidMapGlobal) {
                effectiveResolvedPhone = lidMapGlobal.phone_digits;
                console.log(`[WhatsApp] ⚠️ LID resolvido via mapa GLOBAL (instance ${lidMapGlobal.instance_id}): ${senderJid} → ${effectiveResolvedPhone}`);
              }
            }
          }
        }

        // 4) Fallback ativo: perguntar ao Baileys se o próprio LID resolve para @s.whatsapp.net
        if (isLid && !effectiveResolvedPhone && senderJid?.endsWith('@lid')) {
          // Expandir candidatos: JID completo, sem sufixo :NN, e apenas dígitos
          const senderDigitsOnly = senderJid.split(':')[0].split('@')[0];
          const lidCandidates = Array.from(new Set([
            senderJid.toLowerCase(),
            senderJid.toLowerCase().replace(/:\d+@/, '@'),
            senderDigitsOnly, // digits only — Baileys pode resolver para @s.whatsapp.net
          ].filter(Boolean)));

          for (const lidCandidate of lidCandidates) {
            try {
              const checkUrl = `${BAILEYS_SERVER_URL}/instances/${effectiveInstanceId}/check/${encodeURIComponent(lidCandidate)}`;
              const checkResp = await fetch(checkUrl, { method: 'GET' });
              if (!checkResp.ok) continue;

              const checkData = await checkResp.json();
              const phoneFromCheck = extractPhoneFromJid(checkData?.jid);
              if (checkData?.exists && phoneFromCheck) {
                effectiveResolvedPhone = phoneFromCheck;
                console.log(`[WhatsApp] ✅ LID resolvido via check(${lidCandidate}): ${checkData?.jid} → ${effectiveResolvedPhone}`);
                break;
              }
            } catch (error) {
              console.log(`[WhatsApp] Fallback check LID falhou para ${lidCandidate}: ${error}`);
            }
          }
        }
        
        // Se temos LID + resolvedPhone agora, persistir no mapa
        if (isLid && effectiveResolvedPhone && senderJid?.endsWith('@lid')) {
          const rpDigits = effectiveResolvedPhone.replace(/\D/g, '');
          if (rpDigits.length >= 10 && rpDigits.length <= 13) {
            supabase
              .from('whatsapp_lid_map')
              .upsert({
                lid_jid: senderJid,
                phone_digits: rpDigits,
                instance_id: effectiveInstanceId,
                updated_at: new Date().toISOString()
              }, { onConflict: 'lid_jid,instance_id' })
              .then(() => console.log(`[WhatsApp] LID map persistido: ${senderJid} → ${rpDigits} (instance: ${effectiveInstanceId})`));
          }
        }
        
        if (isLid) {
          console.log(`[WhatsApp] Sender identificado como LID: ${sender}${effectiveResolvedPhone ? ` (resolved: ${effectiveResolvedPhone})` : ''}`);
        }

        if (!sender) {
          console.log(`[WhatsApp] Sender vazio ignorado`);
          break;
        }
        
        if (!isLid && !/^\d{8,}$/.test(sender)) {
          console.log(`[WhatsApp] Sender inválido ignorado: ${sender}`);
          break;
        }

        console.log(`[WhatsApp] Mensagem de ${sender} (JID: ${senderJid}): ${originalContent?.substring(0, 50)}`);

        // ====== VALIDAÇÃO DE CONTEÚDO ======
        // Ignorar mensagens vazias sem mídia (podem ser eventos de protocolo)
        if (!originalContent && !mediaBase64 && !mediaUrl && messageType === 'text') {
          console.log('[WhatsApp] Mensagem de texto vazia sem mídia - ignorada');
          break;
        }

        // Filtrar mensagens placeholder do WhatsApp (falha de descriptografia)
        const PLACEHOLDER_PATTERNS = ['Aguardando mensagem', 'Waiting for this message'];
        if (originalContent && !mediaBase64 && !mediaUrl && messageType === 'text' &&
            PLACEHOLDER_PATTERNS.some(p => originalContent.startsWith(p))) {
          console.log('[WhatsApp] Mensagem placeholder do WhatsApp ignorada');
          break;
        }

        // ====== PROCESSAMENTO PARALELO - FASE 1 ======
        // Buscar contato e conexão Baileys em paralelo
        const [contactResult, baileysConnectionResult] = await Promise.all([
          // Buscar contato por JID OU por telefone com normalização de formato
          (async () => {
            // 1. Para JIDs reais (@s.whatsapp.net): buscar pelo JID nas notas
            if (senderJid && senderJid.endsWith('@s.whatsapp.net')) {
              const { data: byJidList } = await supabase
                .from('contacts')
                .select('id, channel, phone, notes, name, name_edited')
                .ilike('notes', `%jid:${senderJid}%`)
                .limit(1);
              if (byJidList && byJidList.length > 0) return { data: byJidList[0], error: null };
              // Extrair telefone do JID real e buscar — 2 etapas: exato primeiro, variantes depois
              const phoneFromJid = senderJid.split('@')[0];
              if (phoneFromJid && /^\d{8,}$/.test(phoneFromJid)) {
                // Busca direta via RPC com normalização BR completa (sem limit+find JS)
                const { data: byJidPhone } = await supabase
                  .rpc('find_contact_by_phone', { phone_input: phoneFromJid });
                if (byJidPhone && byJidPhone.length > 0) return { data: byJidPhone[0], error: null };
              }
            }
            // 2. Buscar por telefone direto (quando sender não é LID) — 2 etapas
            if (sender && !isLid) {
              // Busca direta via RPC com normalização BR completa (sem limit+find JS)
              const { data: byPhone } = await supabase
                .rpc('find_contact_by_phone', { phone_input: sender });
              if (byPhone && byPhone.length > 0) {
                console.log(`[WhatsApp] Contato encontrado via find_contact_by_phone(sender): ${byPhone[0].id}`);
                return { data: byPhone[0], error: null };
              }
            }
            // 3. Para LIDs: PRIORIZAR effectiveResolvedPhone (mapa LID→telefone persistente) — 2 etapas
            if (effectiveResolvedPhone && /^\d{8,}$/.test(effectiveResolvedPhone)) {
              // Busca direta via RPC com normalização BR completa (sem limit+find JS)
              const { data: byResolved } = await supabase
                .rpc('find_contact_by_phone', { phone_input: effectiveResolvedPhone });
              if (byResolved && byResolved.length > 0) {
                console.log(`[WhatsApp] Contato encontrado via find_contact_by_phone(resolvedPhone): ${byResolved[0].id}`);
                return { data: byResolved[0], error: null };
              }
            }
            // 4. Para LIDs: usar participant (JID real) como fallback
            if (participant) {
              // Buscar pelo JID do participant nas notas
              const { data: byParticipantJid } = await supabase
                .from('contacts')
                .select('id, channel, phone, notes, name, name_edited')
                .ilike('notes', `%jid:${participant}%`)
                .limit(1);
              if (byParticipantJid && byParticipantJid.length > 0) {
                console.log(`[WhatsApp] Contato encontrado via participant JID: ${participant}`);
                return { data: byParticipantJid[0], error: null };
              }
              // Extrair telefone do participant e buscar
              if (participant.endsWith('@s.whatsapp.net')) {
                const phoneFromParticipant = participant.split('@')[0];
                if (phoneFromParticipant && /^\d{8,}$/.test(phoneFromParticipant)) {
                  const { data: byPartPhone } = await supabase
                    .rpc('find_contact_by_phone', { phone_input: phoneFromParticipant });
                  if (byPartPhone && byPartPhone.length > 0) {
                    console.log(`[WhatsApp] Contato encontrado via participant phone: ${phoneFromParticipant}`);
                    return { data: byPartPhone[0], error: null };
                  }
                }
              }
            }
            // 5. Último recurso: buscar pelo JID LID nas notas (contato duplicado)
            if (senderJid && senderJid.endsWith('@lid')) {
              const { data: byLidJid } = await supabase
                .from('contacts')
                .select('id, channel, phone, notes, name, name_edited')
                .ilike('notes', `%jid:${senderJid}%`)
                .limit(1);
              if (byLidJid && byLidJid.length > 0) return { data: byLidJid[0], error: null };
            }
            return { data: null, error: null };
          })(),
          
          // Buscar conexão Baileys para departamento - filtrar pela instância específica
          supabase
            .from('whatsapp_connections')
            .select('department_id')
            .eq('connection_type', 'baileys')
            .eq('phone_number_id', effectiveInstanceId)
            .maybeSingle()
        ]);

        let existingContact = contactResult.data;
        const baileysConnection = baileysConnectionResult.data;

        // Processar mídia se presente (pode ser feito em paralelo com outras operações)
        let finalContent = originalContent || '';
        let mediaUploadPromise: Promise<string> | null = null;
        
        if (mediaUrl && fileName && mimeType) {
          // ====== NOVA ESTRATÉGIA: Mídia já está no Storage (upload direto pelo Baileys server) ======
          console.log(`[WhatsApp] Mídia já no Storage: ${fileName} (${mimeType}) → ${mediaUrl}`);
          
          mediaUploadPromise = Promise.resolve(JSON.stringify([{
            name: fileName,
            url: mediaUrl,
            type: mimeType,
            size: 0
          }]));
        } else if (mediaBase64 && fileName && mimeType) {
          // ====== FALLBACK: Mídia em base64 (arquivos pequenos ou Storage não configurado) ======
          console.log(`[WhatsApp] Processando mídia base64: ${fileName} (${mimeType})`);
          
          mediaUploadPromise = (async () => {
            try {
              const binaryString = atob(mediaBase64);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              
              let normalizedMimeType = mimeType;
              const originalMimeType = mimeType;
              
              if (mimeType.includes('audio/ogg')) {
                normalizedMimeType = 'audio/ogg';
              } else if (mimeType.includes('audio/webm')) {
                normalizedMimeType = 'audio/webm';
              } else if (mimeType.includes('audio/')) {
                normalizedMimeType = mimeType.split(';')[0].trim();
              }
              
              const uniqueFileName = `${Date.now()}_${sender}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
              
              const { data: uploadData, error: uploadError } = await supabase
                .storage
                .from('chat-uploads')
                .upload(uniqueFileName, bytes, {
                  contentType: normalizedMimeType,
                  upsert: false
                });
              
              if (uploadError) {
                console.error('[WhatsApp] Erro no upload:', uploadError);
                return originalContent || '[Mídia não disponível]';
              }
              
              const { data: { publicUrl } } = supabase
                .storage
                .from('chat-uploads')
                .getPublicUrl(uniqueFileName);
              
              console.log(`[WhatsApp] Mídia salva: ${publicUrl}`);
              
              return JSON.stringify([{
                name: fileName,
                url: publicUrl,
                type: originalMimeType,
                size: bytes.length
              }]);
            } catch (mediaError) {
              console.error('[WhatsApp] Erro ao processar mídia:', mediaError);
              return originalContent || '[Mídia não disponível]';
            }
          })();
        }

        // ====== PROCESSAR CONTATO ======
        let contactId: string | null = null;

        // Se encontrou contato pelo JID, usar diretamente
        if (existingContact) {
          contactId = existingContact.id;
          console.log(`[WhatsApp] Contato encontrado: ${contactId} (${existingContact.name})`);

          // Se chegou por LID e já resolvemos para um contato com telefone,
          // unificar qualquer contato duplicado pré-existente com o mesmo JID LID.
          if (isLid && senderJid?.endsWith('@lid') && existingContact.phone) {
            const { data: lidDuplicates } = await supabase
              .from('contacts')
              .select('id, name')
              .ilike('notes', `%jid:${senderJid}%`)
              .neq('id', existingContact.id)
              .limit(1);

            if (lidDuplicates && lidDuplicates.length > 0) {
              const duplicate = lidDuplicates[0];
              console.log(`[WhatsApp] 🔄 Unificando duplicado LID ${duplicate.id} (${duplicate.name}) → ${existingContact.id} (${existingContact.name})`);
              const { data: mergeResult } = await supabase.rpc('merge_duplicate_contacts', {
                primary_id: existingContact.id,
                duplicate_id: duplicate.id,
              });

              if (mergeResult?.success) {
                console.log(`[WhatsApp] ✅ Duplicado LID unificado: ${JSON.stringify(mergeResult)}`);
              } else {
                console.warn(`[WhatsApp] ⚠️ Falha ao unificar duplicado LID: ${JSON.stringify(mergeResult)}`);
              }
            }
          }
          
          // ====== PROTEÇÃO CONTRA CROSS-CONTAMINATION ======
          // Se temos um resolvedPhone/participant que difere do phone do contato encontrado,
          // NÃO atualizar o JID nesse contato — pode ser contato errado vinculado por LID antigo
          const phoneFromParticipant = participant?.endsWith('@s.whatsapp.net') ? participant.split('@')[0] : null;
          const incomingRealPhone = effectiveResolvedPhone || ((!isLid && sender) ? sender : phoneFromParticipant);
          
          let phoneMismatch = false;
          if (existingContact.phone && incomingRealPhone && /^\d{8,}$/.test(incomingRealPhone)) {
            const existingDigits = existingContact.phone.replace(/\D/g, '');
            const incomingDigits = incomingRealPhone.replace(/\D/g, '');
            // Comparação BR completa (normalizar DDI + 9º dígito)
            const normBR = (d: string) => {
              let n = d;
              if (n.startsWith('55') && n.length >= 12) n = n.slice(2);
              if (n.length === 11 && n[2] === '9') n = n.slice(0, 2) + n.slice(3);
              return n;
            };
            if (normBR(existingDigits) !== normBR(incomingDigits)) {
              phoneMismatch = true;
              console.warn(`[WhatsApp] ⚠️ PHONE MISMATCH: contato ${contactId} tem phone ${existingContact.phone} mas incoming=${incomingRealPhone}. NÃO vinculando JID.`);
              
              // Rebind: buscar/criar o contato correto pelo phone real
              const { data: correctContact } = await supabase
                .rpc('find_contact_by_phone', { phone_input: incomingRealPhone });
              
              if (correctContact && correctContact.length > 0) {
                existingContact = correctContact[0];
                contactId = existingContact.id;
                console.log(`[WhatsApp] ✅ Rebind para contato correto: ${contactId} (${existingContact.name})`);
              } else {
                // Contato não existe, será criado adiante
                existingContact = null;
                contactId = null;
                console.log(`[WhatsApp] Contato correto não encontrado, será criado`);
              }
            }
          }
          
          if (!phoneMismatch && existingContact) {
            // Preparar atualizações do contato (SEM mismatch)
            const contactUpdates: Record<string, string | boolean> = {};
            
            // Atualizar JID se necessário
            if (senderJid && (!existingContact.notes || !existingContact.notes.includes(senderJid))) {
              contactUpdates.notes = `jid:${senderJid}`;
            }
            
            // Atualizar nome se não foi editado manualmente e temos pushName válido
            if (!existingContact.name_edited && senderName && senderName !== 'Desconhecido' && 
                senderName !== existingContact.name) {
              contactUpdates.name = senderName;
              console.log(`[WhatsApp] Atualizando nome: "${existingContact.name}" → "${senderName}"`);
            }
            
            // Atualizar telefone se contato não tem e temos telefone real
            // PROTEÇÃO: Só atualizar phone se a evidência vem do EVENTO ATUAL (resolvedPhone do servidor ou sender real)
            // NÃO usar effectiveResolvedPhone se veio de mapa global (pode ser contaminado)
            const directRealPhone = resolvedPhone || ((!isLid && sender) ? sender : phoneFromParticipant);
            if (!existingContact.phone && directRealPhone && /^\d{8,}$/.test(directRealPhone)) {
              const realPhoneDigits = directRealPhone.replace(/\D/g, '');
              if (realPhoneDigits.length <= 13) {
                contactUpdates.phone = formatBrazilianPhone(directRealPhone) || directRealPhone;
                console.log(`[WhatsApp] Salvando telefone real no contato (evidência direta): ${contactUpdates.phone}`);
              }
            }
            // Se contato já tem phone mas não está formatado, normalizar
            if (existingContact.phone && !existingContact.phone.startsWith('+')) {
              const formatted = formatBrazilianPhone(existingContact.phone);
              if (formatted) {
                contactUpdates.phone = formatted;
              }
            }
            
            if (Object.keys(contactUpdates).length > 0) {
              supabase
                .from('contacts')
                .update(contactUpdates)
                .eq('id', existingContact.id)
                .then(({ error }) => {
                  if (error) console.error('[WhatsApp] Erro ao atualizar contato:', error);
                  else console.log(`[WhatsApp] Contato atualizado: ${JSON.stringify(contactUpdates)}`);
                });
            }
          }
        }

        // Se é LID e não achou pelo JID, buscar APENAS por telefone real (NUNCA por nome)
        if (!existingContact && isLid) {
          console.log(`[WhatsApp] LID sem contato - buscando por telefone real APENAS`);
          
          const phoneFromParticipantEarly = participant?.endsWith('@s.whatsapp.net') ? participant.split('@')[0] : null;
          const earlyPhoneCandidate = effectiveResolvedPhone || (phoneFromParticipantEarly && /^\d{8,}$/.test(phoneFromParticipantEarly) ? phoneFromParticipantEarly : null);
          
          if (earlyPhoneCandidate) {
            const { data: byPhoneEarly } = await supabase
              .rpc('find_contact_by_phone', { phone_input: earlyPhoneCandidate });
            
            if (byPhoneEarly && byPhoneEarly.length > 0) {
              existingContact = byPhoneEarly[0];
              contactId = existingContact.id;
              console.log(`[WhatsApp] ✅ LID resolvido via telefone real ${earlyPhoneCandidate}: ${contactId} (${existingContact.name})`);
              
              // Atualizar JID no contato encontrado
              if (senderJid) {
                supabase
                  .from('contacts')
                  .update({ notes: `jid:${senderJid}` })
                  .eq('id', contactId)
                  .then(() => console.log(`[WhatsApp] JID LID vinculado: ${senderJid}`));
              }
            }
          }
          
          // REMOVIDO: busca por nome + conversa ativa (causa contaminação cruzada)
          // Se não encontrou por telefone, será criado novo contato adiante
          if (!contactId) {
            console.log(`[WhatsApp] LID sem resolução por telefone - novo contato será criado`);
          }
        }

        // ====== RECONCILIAÇÃO LID SEGURA: buscar contato LID sem phone, APENAS se temos phone real ======
        // REMOVIDO: busca por nome (causa contaminação cruzada)
        // Agora: reconcilia APENAS se temos evidência de phone (sender não-LID)
        if (!contactId && !isLid && sender && /^\d{8,}$/.test(sender)) {
          // O sender é um phone real (não-LID). Buscar contatos LID sem phone
          // que tenham conversa ativa, mas SEM filtrar por nome
          const { data: lidCandidatesNoPhone } = await supabase
            .from('contacts')
            .select('id, name, notes')
            .eq('channel', 'whatsapp')
            .is('phone', null)
            .ilike('notes', 'jid:%@lid')
            .limit(20);

          if (lidCandidatesNoPhone && lidCandidatesNoPhone.length > 0) {
            // Verificar qual tem conversa ativa E corresponde ao nome (se temos nome)
            for (const lc of lidCandidatesNoPhone) {
              // Se temos senderName, filtrar por nome para maior segurança
              if (senderName && senderName !== 'Desconhecido' && 
                  lc.name.toLowerCase() !== senderName.toLowerCase()) {
                continue;
              }
              const { data: activeConv } = await supabase
                .from('conversations')
                .select('id')
                .eq('contact_id', lc.id)
                .in('status', ['em_fila', 'em_atendimento', 'pendente'])
                .limit(1);
              
              if (activeConv && activeConv.length > 0) {
                contactId = lc.id;
                console.log(`[WhatsApp] Reconciliação LID segura: contato ${contactId} atualizado com phone=${sender}`);
                
                await supabase
                  .from('contacts')
                  .update({
                    phone: formatBrazilianPhone(sender) || sender,
                    notes: `jid:${senderJid}`
                  })
                  .eq('id', contactId);
                break;
              }
            }
          }
        }

        if (!contactId) {
          // Criar novo contato
          const phoneFromParticipant2 = participant?.endsWith('@s.whatsapp.net') ? participant.split('@')[0] : null;
          // Priorizar resolvedPhone (do mapa LID), depois participant, depois sender (se não for LID)
          const phoneToSave = effectiveResolvedPhone || (isLid ? (phoneFromParticipant2 && /^\d{8,}$/.test(phoneFromParticipant2) ? phoneFromParticipant2 : null) : sender);
          
          // ====== ÚLTIMA CHANCE: buscar por phoneToSave via find_contact_by_phone ======
          if (phoneToSave && /^\d{8,}$/.test(phoneToSave)) {
            const { data: lastChanceResults } = await supabase
              .rpc('find_contact_by_phone', { phone_input: phoneToSave });
            
            if (lastChanceResults && lastChanceResults.length > 0) {
              existingContact = lastChanceResults[0];
              contactId = existingContact.id;
              console.log(`[WhatsApp] ✅ ÚLTIMA CHANCE: Contato encontrado via phoneToSave=${phoneToSave}: ${contactId} (${existingContact.name})`);
              
              // Atualizar JID no contato encontrado
              if (senderJid) {
                supabase
                  .from('contacts')
                  .update({ notes: `jid:${senderJid}` })
                  .eq('id', contactId)
                  .then(() => console.log(`[WhatsApp] JID vinculado ao contato existente: ${senderJid}`));
              }
            }
          }

          if (!contactId) {
            // REMOVIDO: "Rede de segurança" por nome (causa contaminação cruzada)
            // Se não encontramos por phone, o contato será criado como novo
            console.log(`[WhatsApp] Nenhum contato encontrado por phone - novo contato será criado`);
          }

          // ====== BUSCA POR CONVERSA ÓRFÃ (atendente iniciou via busca, aguardando resposta) ======
          if (!contactId) {
            console.log(`[WhatsApp] 🔍 Buscando conversa órfã no instance "${effectiveInstanceId}" para ${isLid ? 'LID' : 'phone'} ${sender}`);
            
            // Buscar conversas recentes na mesma instância que só têm mensagens outbound
            const { data: orphanConversations } = await supabase
              .from('conversations')
              .select('id, contact_id')
              .eq('whatsapp_instance_id', effectiveInstanceId)
              .in('status', ['em_fila', 'em_atendimento', 'pendente'])
              .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
              .order('created_at', { ascending: false })
              .limit(20);
            
            if (orphanConversations && orphanConversations.length > 0) {
              for (const oc of orphanConversations) {
                // Verificar se esta conversa NÃO tem mensagens inbound (sender_id IS NULL = inbound)
                const { data: inboundMsgs } = await supabase
                  .from('messages')
                  .select('id')
                  .eq('conversation_id', oc.id)
                  .is('sender_id', null)
                  .neq('message_type', 'system')
                  .not('sender_name', 'ilike', '%[robot]%')
                  .limit(1);
                
                if (!inboundMsgs || inboundMsgs.length === 0) {
                  // Esta conversa só tem mensagens outbound → é órfã, aguardando resposta
                  const { data: orphanContact } = await supabase
                    .from('contacts')
                    .select('id, name, phone, notes, channel, name_edited')
                    .eq('id', oc.contact_id)
                    .single();
                  
                  if (orphanContact) {
                    // FASE A: Match órfão ESTRITO — exigir prova forte de identidade
                    const jidInNotes = orphanContact.notes?.match(/jid:([^\s|]+)/)?.[1];
                    
                    // Prova 1: JID canônico idêntico (LID)
                    const jidMatchesLid = jidInNotes && senderJid && (
                      jidInNotes === senderJid || 
                      (jidInNotes.endsWith('@lid') && senderJid.endsWith('@lid') && 
                       jidInNotes.split(':')[0] === senderJid.split(':')[0])
                    );
                    
                    // Prova 2: Phone do contato corresponde ao sender/resolvedPhone (normalização BR)
                    let phoneMatchesIncoming = false;
                    if (orphanContact.phone) {
                      const orphanDigits = orphanContact.phone.replace(/\D/g, '');
                      const incomingPhone = effectiveResolvedPhone || ((!isLid && sender) ? sender : null);
                      if (incomingPhone && orphanDigits.length >= 10 && orphanDigits.length <= 13) {
                        const incomingDigits = incomingPhone.replace(/\D/g, '');
                        // Comparação BR segura: normalizar com/sem DDI e 9o dígito
                        const normalize = (d: string) => {
                          let n = d;
                          if (n.startsWith('55') && n.length >= 12) n = n.slice(2);
                          if (n.length === 11 && n[2] === '9') n = n.slice(0, 2) + n.slice(3);
                          return n;
                        };
                        phoneMatchesIncoming = normalize(orphanDigits) === normalize(incomingDigits);
                      }
                    }
                    
                    // Prova 3: Para LIDs sem resolvedPhone, verificar se o contato órfão
                    // tem phone E a conversa é a ÚNICA órfã na instância (evita ambiguidade)
                    // Isso resolve o caso: atendente buscou o número, enviou, e a resposta veio de LID
                    let orphanPhoneMatchesViaLidMap = false;
                    if (!jidMatchesLid && !phoneMatchesIncoming && isLid && senderJid?.endsWith('@lid') && orphanContact.phone) {
                      const orphanDigits = orphanContact.phone.replace(/\D/g, '');
                      if (orphanDigits.length >= 10 && orphanDigits.length <= 13) {
                        // Verificar no lid_map se o LID do sender está mapeado para o phone do contato órfão
                        const { data: lidMapCheck } = await supabase
                          .from('whatsapp_lid_map')
                          .select('phone_digits')
                          .eq('lid_jid', senderJid)
                          .eq('instance_id', effectiveInstanceId)
                          .maybeSingle();
                        
                        if (lidMapCheck) {
                          const normalize = (d: string) => {
                            let n = d;
                            if (n.startsWith('55') && n.length >= 12) n = n.slice(2);
                            if (n.length === 11 && n[2] === '9') n = n.slice(0, 2) + n.slice(3);
                            return n;
                          };
                          orphanPhoneMatchesViaLidMap = normalize(orphanDigits) === normalize(lidMapCheck.phone_digits);
                          if (orphanPhoneMatchesViaLidMap) {
                            console.log(`[WhatsApp] ✅ Prova 3: LID ${senderJid} mapeado para ${lidMapCheck.phone_digits} que corresponde ao órfão ${orphanContact.phone}`);
                          }
                        }
                      }
                    }

                    // Prova 4: Para LIDs sem resolução, verificar via onWhatsApp se o phone do órfão resolve para o mesmo LID do sender
                    let orphanPhoneMatchesViaCheck = false;
                    if (!jidMatchesLid && !phoneMatchesIncoming && !orphanPhoneMatchesViaLidMap 
                        && isLid && senderJid?.endsWith('@lid') && orphanContact.phone) {
                      const orphanDigits = orphanContact.phone.replace(/\D/g, '');
                      if (orphanDigits.length >= 10 && orphanDigits.length <= 13) {
                        try {
                          const checkUrl = `${BAILEYS_SERVER_URL}/instances/${effectiveInstanceId}/check/${encodeURIComponent(orphanDigits)}`;
                          console.log(`[WhatsApp] Prova 4: Verificando ${checkUrl} para LID ${senderJid}`);
                          const checkResp = await fetch(checkUrl, { method: 'GET' });
                          if (checkResp.ok) {
                            const checkData = await checkResp.json();
                            if (checkData?.exists && checkData?.jid) {
                              const checkedJid = String(checkData.jid).toLowerCase();
                              // Normalizar: remover sufixos como :NN para comparação canônica
                              const senderBase = senderJid.split(':')[0].split('@')[0];
                              const checkedBase = checkedJid.split(':')[0].split('@')[0];
                              if (checkedJid.endsWith('@lid') && senderBase === checkedBase) {
                                orphanPhoneMatchesViaCheck = true;
                                console.log(`[WhatsApp] ✅ Prova 4: check(${orphanDigits}) retornou ${checkedJid} que corresponde ao sender ${senderJid}`);
                                // Persistir no LID map imediatamente
                                await supabase.from('whatsapp_lid_map').upsert({
                                  lid_jid: senderJid,
                                  phone_digits: orphanDigits,
                                  instance_id: effectiveInstanceId,
                                  updated_at: new Date().toISOString()
                                }, { onConflict: 'lid_jid,instance_id' });
                              } else if (!orphanPhoneMatchesViaCheck) {
                                // Prova 4b: O check do orphanPhone retornou um LID diferente do sender.
                                // Verificar reverso: resolver os dígitos do sender LID para ver se retorna o mesmo telefone do órfão.
                                const senderLidDigits = senderJid.split('@')[0].split(':')[0];
                                if (senderLidDigits.length > 5) {
                                  try {
                                    const reverseCheckUrl = `${BAILEYS_SERVER_URL}/instances/${effectiveInstanceId}/check/${encodeURIComponent(senderLidDigits)}`;
                                    console.log(`[WhatsApp] Prova 4b: Verificando reverso ${reverseCheckUrl} para órfão phone ${orphanDigits}`);
                                    const reverseResp = await fetch(reverseCheckUrl, { method: 'GET' });
                                    if (reverseResp.ok) {
                                      const reverseData = await reverseResp.json();
                                      if (reverseData?.exists && reverseData?.jid) {
                                        const reverseJid = String(reverseData.jid).toLowerCase();
                                        if (reverseJid.endsWith('@s.whatsapp.net')) {
                                          const reversePhone = reverseJid.split('@')[0];
                                          const normalize4b = (d: string) => {
                                            let n = d;
                                            if (n.startsWith('55') && n.length >= 12) n = n.slice(2);
                                            if (n.length === 11 && n[2] === '9') n = n.slice(0, 2) + n.slice(3);
                                            return n;
                                          };
                                          if (normalize4b(reversePhone) === normalize4b(orphanDigits)) {
                                            orphanPhoneMatchesViaCheck = true;
                                            console.log(`[WhatsApp] ✅ Prova 4b: check(${senderLidDigits}) retornou ${reverseJid} cujo phone bate com órfão ${orphanDigits}`);
                                            await supabase.from('whatsapp_lid_map').upsert({
                                              lid_jid: senderJid,
                                              phone_digits: orphanDigits,
                                              instance_id: effectiveInstanceId,
                                              updated_at: new Date().toISOString()
                                            }, { onConflict: 'lid_jid,instance_id' });
                                          } else {
                                            console.log(`[WhatsApp] ❌ Prova 4b: check(${senderLidDigits}) retornou phone ${reversePhone} — não bate com órfão ${orphanDigits}`);
                                          }
                                        } else if (reverseJid.endsWith('@lid')) {
                                          const { data: reverseMap } = await supabase
                                            .from('whatsapp_lid_map')
                                            .select('phone_digits')
                                            .eq('lid_jid', reverseJid)
                                            .eq('instance_id', effectiveInstanceId)
                                            .maybeSingle();
                                          const normalize4c = (d: string) => {
                                            let n = d;
                                            if (n.startsWith('55') && n.length >= 12) n = n.slice(2);
                                            if (n.length === 11 && n[2] === '9') n = n.slice(0, 2) + n.slice(3);
                                            return n;
                                          };
                                          if (reverseMap && normalize4c(reverseMap.phone_digits) === normalize4c(orphanDigits)) {
                                            orphanPhoneMatchesViaCheck = true;
                                            console.log(`[WhatsApp] ✅ Prova 4b(lid): check(${senderLidDigits}) → ${reverseJid} mapeado para ${reverseMap.phone_digits} = órfão ${orphanDigits}`);
                                            await supabase.from('whatsapp_lid_map').upsert({
                                              lid_jid: senderJid,
                                              phone_digits: orphanDigits,
                                              instance_id: effectiveInstanceId,
                                              updated_at: new Date().toISOString()
                                            }, { onConflict: 'lid_jid,instance_id' });
                                          }
                                        }
                                      }
                                    }
                                  } catch (e4b) {
                                    console.log(`[WhatsApp] Prova 4b: Erro — ${e4b}`);
                                  }
                                }
                                if (!orphanPhoneMatchesViaCheck) {
                                  console.log(`[WhatsApp] ❌ Prova 4: check(${orphanDigits}) retornou ${checkedJid} — não corresponde ao sender ${senderJid}`);
                                }
                              }
                            }
                          }
                        } catch (e) {
                          console.log(`[WhatsApp] Prova 4: Erro ao verificar — ${e}`);
                        }
                      }
                    }
                    
                    if (jidMatchesLid || phoneMatchesIncoming || orphanPhoneMatchesViaLidMap || orphanPhoneMatchesViaCheck) {
                      contactId = orphanContact.id;
                      existingContact = orphanContact;
                      console.log(`[WhatsApp] ✅ CONVERSA ÓRFÃ: Contato ${contactId} (${orphanContact.name}, phone: ${orphanContact.phone}, jid: ${jidInNotes}) vinculado ao LID ${sender} [prova: ${jidMatchesLid ? 'JID' : phoneMatchesIncoming ? 'PHONE' : orphanPhoneMatchesViaLidMap ? 'LID_MAP' : 'CHECK'}]`);
                      
                      // Atualizar JID e nome do contato
                      const orphanUpdates: Record<string, string> = {};
                      if (senderJid && (!jidInNotes || jidInNotes !== senderJid)) {
                        orphanUpdates.notes = `jid:${senderJid}`;
                      }
                      if (senderName && senderName !== 'Desconhecido' && !orphanContact.name_edited) {
                        orphanUpdates.name = senderName;
                      }
                      if (Object.keys(orphanUpdates).length > 0) {
                        supabase.from('contacts').update(orphanUpdates).eq('id', contactId)
                          .then(() => console.log(`[WhatsApp] Contato órfão atualizado: ${JSON.stringify(orphanUpdates)}`));
                      }
                      
                      // Persistir no LID map se temos phone
                      if (orphanContact.phone && senderJid?.endsWith('@lid')) {
                        const phoneDigits = orphanContact.phone.replace(/\D/g, '');
                        if (phoneDigits.length >= 10 && phoneDigits.length <= 13) {
                          supabase.from('whatsapp_lid_map').upsert({
                            lid_jid: senderJid,
                            phone_digits: phoneDigits,
                            instance_id: effectiveInstanceId,
                            updated_at: new Date().toISOString()
                          }, { onConflict: 'lid_jid,instance_id' })
                          .then(() => console.log(`[WhatsApp] LID map persistido via órfã: ${senderJid} → ${phoneDigits}`));
                        }
                      }
                      break;
                    } else {
                      console.log(`[WhatsApp] ❌ CONVERSA ÓRFÃ: Contato ${orphanContact.id} (${orphanContact.name}) NÃO corresponde ao sender ${sender} — ignorando`);
                    }
                  }
                }
              }
            }
          }

          if (!contactId) {
            // Nunca usar "Desconhecido" - usar pushName, ou fallback amigável
            const contactName = (senderName && senderName !== 'Desconhecido') 
              ? senderName 
              : (phoneToSave ? `WhatsApp ${phoneToSave}` : `Contato WhatsApp`);
            
            const jidNote = senderJid ? `jid:${senderJid}` : null;
            
            const { data: newContact, error: createError } = await supabase
              .from('contacts')
              .insert({
                name: contactName,
                phone: formatBrazilianPhone(phoneToSave),
                channel: 'whatsapp',
                notes: jidNote
              })
              .select('id')
              .single();

            if (createError) {
              // Race condition: outro webhook criou o contato com mesmo JID
              // Fallback: buscar o contato que ganhou a corrida
              if (createError.code === '23505' && jidNote) {
                console.log(`[WhatsApp] ⚡ Race condition detectada para ${jidNote} - buscando contato existente`);
                const { data: raceContact } = await supabase
                  .from('contacts')
                  .select('id')
                  .eq('notes', jidNote)
                  .eq('channel', 'whatsapp')
                  .limit(1);
                
                if (raceContact && raceContact.length > 0) {
                  contactId = raceContact[0].id;
                  console.log(`[WhatsApp] ✅ Contato da race condition encontrado: ${contactId}`);
                } else {
                  console.error('[WhatsApp] Erro ao criar contato (conflito mas não encontrou):', createError);
                  throw createError;
                }
              } else {
                console.error('[WhatsApp] Erro ao criar contato:', createError);
                throw createError;
              }
            } else {
              contactId = newContact.id;
              console.log(`[WhatsApp] Novo contato criado: ${contactId}`);
              // Hidratar existingContact para permitir dedup downstream
              existingContact = {
                id: contactId,
                name: contactName,
                phone: formatBrazilianPhone(phoneToSave) || null,
                notes: jidNote || null,
                channel: 'whatsapp',
                name_edited: false
              };
            }
          }
        }

        // ====== AUTO-MERGE: Detectar e unificar contatos duplicados (FASE A: seguro via RPC) ======
        if (contactId && existingContact?.phone) {
          const canonicalDigits = existingContact.phone.replace(/\D/g, '');
          if (canonicalDigits.length >= 10 && canonicalDigits.length <= 13) {
            // Usar find_contact_by_phone para busca segura com normalização BR completa
            const { data: phoneMatches } = await supabase
              .rpc('find_contact_by_phone', { phone_input: canonicalDigits });
            
            // Buscar duplicatas filtrando por variantes normalizadas do telefone (sem carregar todos os contatos)
            const { data: phoneVariants } = await supabase.rpc('normalize_phone_variants', { phone_input: canonicalDigits });
            const variants = phoneVariants || [canonicalDigits];
            const { data: allPhoneContacts } = await supabase
              .from('contacts')
              .select('id, name, phone, notes')
              .neq('id', contactId)
              .not('notes', 'ilike', 'merged_into:%')
              .filter('phone', 'neq', '')
              .not('phone', 'is', null)
              .or(variants.map((v: string) => `phone.ilike.%${v}%`).join(','));
            
            if (allPhoneContacts) {
              // Normalização BR segura para comparação
              const normalizeBR = (d: string) => {
                let n = d.replace(/\D/g, '');
                if (n.startsWith('55') && n.length >= 12) n = n.slice(2);
                if (n.length === 11 && n[2] === '9') n = n.slice(0, 2) + n.slice(3);
                return n;
              };
              const canonicalNorm = normalizeBR(canonicalDigits);
              
              for (const dup of allPhoneContacts) {
                if (!dup.phone) continue;
                const dupDigits = dup.phone.replace(/\D/g, '');
                if (dupDigits.length < 10 || dupDigits.length > 13) continue;
                
                // Comparação segura: normalização BR completa (não apenas últimos 8)
                if (normalizeBR(dupDigits) !== canonicalNorm) continue;
                
                console.log(`[WhatsApp] 🔄 MERGE: Duplicata detectada: ${dup.id} (${dup.name}) → canônico ${contactId} (${existingContact.name})`);
                
                // Usar função SQL transacional para merge seguro
                const { data: mergeResult } = await supabase.rpc('merge_duplicate_contacts', {
                  primary_id: contactId,
                  duplicate_id: dup.id
                });
                
                if (mergeResult?.success) {
                  console.log(`[WhatsApp] ✅ MERGE via RPC: ${JSON.stringify(mergeResult)}`);
                } else {
                  console.warn(`[WhatsApp] ⚠️ MERGE falhou: ${JSON.stringify(mergeResult)}`);
                }
              }
            }
          }
        }

        let targetDepartmentId: string | null = null;
        
        if (baileysConnection?.department_id) {
          targetDepartmentId = baileysConnection.department_id;
        } else {
          const { data: defaultDept } = await supabase
            .from('departments')
            .select('id')
            .limit(1)
            .single();

          if (!defaultDept) {
            throw new Error('Nenhum departamento configurado');
          }
          targetDepartmentId = defaultDept.id;
        }

        // ====== BUSCAR/CRIAR CONVERSA ======
        const { data: activeConversations } = await supabase
          .from('conversations')
          .select('id, assigned_to_robot, assigned_to, status, department_id, sdr_deal_id, robot_transferred, whatsapp_instance_id')
          .eq('contact_id', contactId)
          .eq('channel', 'whatsapp')
          .in('status', ['em_fila', 'em_atendimento', 'pendente', 'transferida'])
          .order('updated_at', { ascending: false })
          .limit(20);

        let existingConv =
          (activeConversations || []).find((conv: any) => conv.whatsapp_instance_id === effectiveInstanceId) ||
          (activeConversations || [])[0] ||
          null;

        // ====== CROSS-CONTACT DEDUP: LID contact sem phone + sem conversa ativa → buscar match em conversas ativas da instância ======
        if (!existingConv && isLid && existingContact && !existingContact.phone && senderJid?.endsWith('@lid') && BAILEYS_SERVER_URL) {
          console.log(`[WhatsApp] 🔍 CROSS-DEDUP: Contato ${contactId} (LID, sem phone) sem conversa ativa. Buscando match na instância ${effectiveInstanceId}...`);
          
          // Buscar conversas ativas na mesma instância para OUTROS contatos
          const { data: otherActiveConvs } = await supabase
            .from('conversations')
            .select('id, contact_id')
            .eq('whatsapp_instance_id', effectiveInstanceId)
            .eq('channel', 'whatsapp')
            .neq('contact_id', contactId)
            .in('status', ['em_fila', 'em_atendimento', 'pendente', 'transferida'])
            .order('updated_at', { ascending: false })
            .limit(30);
          
          if (otherActiveConvs && otherActiveConvs.length > 0) {
            // Coletar contact_ids únicos
            const otherContactIds = [...new Set(otherActiveConvs.map((c: any) => c.contact_id))];
            
            // Buscar contatos que TÊM phone
            const { data: otherContacts } = await supabase
              .from('contacts')
              .select('id, name, phone, notes')
              .in('id', otherContactIds)
              .not('phone', 'is', null);
            
            if (otherContacts && otherContacts.length > 0) {
              const senderBase = senderJid.split(':')[0].split('@')[0];
              
              for (const oc of otherContacts) {
                const ocDigits = oc.phone!.replace(/\D/g, '');
                if (ocDigits.length < 10 || ocDigits.length > 13) continue;
                
                try {
                  const checkUrl = `${BAILEYS_SERVER_URL}/instances/${effectiveInstanceId}/check/${encodeURIComponent(ocDigits)}`;
                  console.log(`[WhatsApp] CROSS-DEDUP: Verificando ${ocDigits} para LID ${senderJid}`);
                  const checkResp = await fetch(checkUrl, { method: 'GET' });
                  if (checkResp.ok) {
                    const checkData = await checkResp.json();
                    if (checkData?.exists && checkData?.jid) {
                      const checkedJid = String(checkData.jid).toLowerCase();
                      const checkedBase = checkedJid.split(':')[0].split('@')[0];
                      
                      if (checkedJid.endsWith('@lid') && senderBase === checkedBase) {
                        console.log(`[WhatsApp] ✅ CROSS-DEDUP MATCH: phone ${ocDigits} (contato ${oc.id}) → LID ${checkedJid} == sender ${senderJid}`);
                        
                        // Persistir no LID map
                        await supabase.from('whatsapp_lid_map').upsert({
                          lid_jid: senderJid,
                          phone_digits: ocDigits,
                          instance_id: effectiveInstanceId,
                          updated_at: new Date().toISOString()
                        }, { onConflict: 'lid_jid,instance_id' });
                        
                        // Merge: contato com phone é o primário
                        const { data: mergeResult } = await supabase.rpc('merge_duplicate_contacts', {
                          primary_id: oc.id,
                          duplicate_id: contactId
                        });
                        console.log(`[WhatsApp] 🔄 CROSS-DEDUP MERGE: ${JSON.stringify(mergeResult)}`);
                        
                        // Atualizar referências para o contato primário
                        contactId = oc.id;
                        existingContact = oc;
                        
                        // Re-buscar conversa ativa do contato primário
                        const { data: primaryConvs } = await supabase
                          .from('conversations')
                          .select('id, assigned_to_robot, assigned_to, status, department_id, sdr_deal_id, robot_transferred, whatsapp_instance_id')
                          .eq('contact_id', contactId)
                          .eq('channel', 'whatsapp')
                          .in('status', ['em_fila', 'em_atendimento', 'pendente', 'transferida'])
                          .order('updated_at', { ascending: false })
                          .limit(5);
                        
                        existingConv = (primaryConvs || []).find((conv: any) => conv.whatsapp_instance_id === effectiveInstanceId) || (primaryConvs || [])[0] || null;
                        
                        if (existingConv) {
                          console.log(`[WhatsApp] ✅ CROSS-DEDUP: Conversa ${existingConv.id} do contato primário será reutilizada`);
                        }
                        break;
                      }
                    }
                  }
                } catch (e) {
                  console.log(`[WhatsApp] CROSS-DEDUP: Erro ao verificar ${ocDigits}: ${e}`);
                }
              }
            }
          }
        }

        // Aguardar upload de mídia se estiver em andamento
        if (mediaUploadPromise) {
          finalContent = await mediaUploadPromise;
        }

        let conversationId: string | null = null;
        let shouldCallRobot = false;
        let robotId: string | null = null;

        if (!existingConv) {
          // Buscar robô ativo para o departamento da conversa
          const { data: activeRobots } = await supabase
            .from('robots')
            .select('id, name, departments, channels')
            .eq('status', 'active')
            .eq('auto_assign', true);

          // Buscar config SDR para guarda de robô SDR
          const { data: sdrConfig } = await supabase
            .from('sdr_robot_config')
            .select('robot_id')
            .eq('is_active', true)
            .maybeSingle();
          const newConvSdrRobotId = sdrConfig?.robot_id || null;

          let newConvSdrKeywords: string[] = [];
          let newConvComercialDeptId: string | null = null;
          if (newConvSdrRobotId) {
            const { data: autoConf } = await supabase
              .from('sdr_auto_config')
              .select('keywords')
              .eq('is_active', true)
              .maybeSingle();
            newConvSdrKeywords = autoConf?.keywords || [];

            const { data: comercialDept } = await supabase
              .from('departments')
              .select('id')
              .ilike('name', 'comercial')
              .maybeSingle();
            newConvComercialDeptId = comercialDept?.id || null;
          }
          
          // Filtrar por departamento, canal e horário
          let activeRobot = null;
          for (const r of (activeRobots || [])) {
            if (!r.departments?.includes(targetDepartmentId)) continue;
            if (!(r.channels || ['whatsapp','instagram','machine']).includes('whatsapp')) continue;

            // Guarda SDR: robô SDR só assume conversas do dept Comercial com keyword match
            if (newConvSdrRobotId && r.id === newConvSdrRobotId) {
              if (newConvComercialDeptId && targetDepartmentId !== newConvComercialDeptId) {
                console.log(`[WhatsApp] Robô SDR pulado para nova conversa (dept não é Comercial)`);
                continue;
              }
              const msgLower = (finalContent || '').toLowerCase();
              const hasKw = newConvSdrKeywords.length > 0 && newConvSdrKeywords.some(kw => msgLower.includes(kw.toLowerCase()));
              if (!hasKw) {
                console.log(`[WhatsApp] Robô SDR pulado para nova conversa (sem keyword match)`);
                continue;
              }
            }

            const { data: withinSchedule } = await supabase.rpc('is_robot_within_schedule', { robot_uuid: r.id });
            if (withinSchedule !== false) {
              activeRobot = r;
              break;
            }
          }
          
          // Usar dept do robô apenas como fallback se não identificamos o dept pela conexão
          if (!activeRobot && activeRobots?.[0]?.departments?.[0] && !targetDepartmentId) {
            targetDepartmentId = activeRobots[0].departments[0];
          }

          // Tentar criar conversa (ignorar se já existe devido à constraint única)
          // Isso previne race conditions quando múltiplas mensagens chegam simultaneamente
          const { data: insertedConv, error: createConvError } = await supabase
            .from('conversations')
            .insert({
              contact_id: contactId,
              department_id: targetDepartmentId,
              channel: 'whatsapp',
              status: activeRobot ? 'em_atendimento' : 'em_fila',
              assigned_to_robot: activeRobot?.id || null,
              priority: 'normal',
              tags: [],
              last_message_preview: finalContent?.substring(0, 100) || '[Mídia]',
              updated_at: new Date().toISOString(),
              whatsapp_instance_id: effectiveInstanceId
            })
            .select('id')
            .maybeSingle(); // maybeSingle para não falhar se constraint bloquear

          // Se não inseriu (constraint bloqueou race condition), buscar a conversa existente
          if (!insertedConv) {
            console.log('[WhatsApp] Race condition detectada - buscando conversa existente');
            const { data: existingAfterInsert } = await supabase
              .from('conversations')
              .select('id, assigned_to_robot')
              .eq('contact_id', contactId)
              .eq('channel', 'whatsapp')
              .in('status', ['em_fila', 'em_atendimento', 'pendente', 'transferida'])
              .order('updated_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            
            if (existingAfterInsert) {
              conversationId = existingAfterInsert.id;
              if (existingAfterInsert.assigned_to_robot) {
                shouldCallRobot = true;
                robotId = existingAfterInsert.assigned_to_robot;
              }
              console.log(`[WhatsApp] Conversa existente encontrada após race condition: ${conversationId}`);
            } else if (createConvError) {
              console.error('[WhatsApp] Erro ao criar conversa:', createConvError);
              throw createConvError;
            } else {
              throw new Error('Falha ao criar ou encontrar conversa');
            }
          } else {
            conversationId = insertedConv.id;
            
            if (activeRobot) {
              shouldCallRobot = true;
              robotId = activeRobot.id;
              console.log(`[WhatsApp] Nova conversa ${conversationId} atribuída ao robô`);
            }
          }
        } else {
          conversationId = existingConv.id;

          const shouldFixRoutingMismatch =
            !existingConv.assigned_to &&
            !existingConv.assigned_to_robot &&
            (existingConv.department_id !== targetDepartmentId || existingConv.whatsapp_instance_id !== effectiveInstanceId);

          if (shouldFixRoutingMismatch) {
            console.log(
              `[WhatsApp] Corrigindo roteamento da conversa ${conversationId}: dept ${existingConv.department_id} -> ${targetDepartmentId}, instance ${existingConv.whatsapp_instance_id || 'null'} -> ${effectiveInstanceId}`
            );

            await supabase
              .from('conversations')
              .update({
                department_id: targetDepartmentId,
                whatsapp_instance_id: effectiveInstanceId,
                updated_at: new Date().toISOString(),
              })
              .eq('id', conversationId);

            existingConv = {
              ...existingConv,
              department_id: targetDepartmentId,
              whatsapp_instance_id: effectiveInstanceId,
            };
          }
          
          // Se a conversa já tem sdr_deal_id, não chamar robot-chat regular
          if (existingConv.sdr_deal_id) {
            console.log('[WhatsApp] Conversa SDR detectada — robot-chat regular será bloqueado');
          }
          
          if (existingConv.assigned_to_robot && !existingConv.assigned_to) {
            shouldCallRobot = true;
            robotId = existingConv.assigned_to_robot;
          } else if (existingConv.status === 'em_fila' && !existingConv.assigned_to && !existingConv.robot_transferred) {
            // === CORREÇÃO: Atribuir robô a conversas em_fila sem robô (apenas se não foi transferida por robô) ===
            console.log('[WhatsApp] Conversa em_fila sem robô - tentando atribuir...');
            const { data: activeRobotsForExisting } = await supabase
              .from('robots')
              .select('id, name, departments, channels')
              .eq('status', 'active')
              .eq('auto_assign', true);

            // Buscar config SDR para pular robô SDR sem keyword
            const { data: sdrCfg } = await supabase.from('sdr_robot_config').select('robot_id').eq('is_active', true).maybeSingle();
            const sdrRobotId = sdrCfg?.robot_id || null;
            let sdrKeywords: string[] = [];
            let comercialDeptId: string | null = null;
            if (sdrRobotId) {
              const { data: sdrAuto } = await supabase.from('sdr_auto_config').select('keywords').eq('is_active', true).maybeSingle();
              sdrKeywords = sdrAuto?.keywords || [];
              const { data: comercialDept } = await supabase.from('departments').select('id').ilike('name', 'comercial').maybeSingle();
              comercialDeptId = comercialDept?.id || null;
            }

            let matchedRobotForExisting = null;
            for (const r of (activeRobotsForExisting || [])) {
              if (!r.departments?.includes(existingConv.department_id)) continue;
              if (!(r.channels || ['whatsapp','instagram','machine']).includes('whatsapp')) continue;
              // Pular robô SDR se não é dept Comercial ou se a mensagem não contém keywords
              if (r.id === sdrRobotId) {
                if (comercialDeptId && existingConv.department_id !== comercialDeptId) {
                  console.log('[WhatsApp] Robô SDR pulado (dept não é Comercial):', r.name);
                  continue;
                }
                if (sdrKeywords.length > 0) {
                const msgLower = (finalContent || '').toLowerCase();
                const hasKeyword = sdrKeywords.some(kw => msgLower.includes(kw.toLowerCase()));
                if (!hasKeyword) {
                    console.log('[WhatsApp] Robô SDR pulado (sem keyword match):', r.name);
                    continue;
                  }
                }
              }
              const { data: withinSchedule } = await supabase.rpc('is_robot_within_schedule', { robot_uuid: r.id });
              if (withinSchedule !== false) {
                matchedRobotForExisting = r;
                break;
              }
            }

            if (matchedRobotForExisting) {
              console.log('[WhatsApp] Robô encontrado para conversa existente:', matchedRobotForExisting.name);
              await supabase
                .from('conversations')
                .update({
                  assigned_to_robot: matchedRobotForExisting.id,
                  status: 'em_atendimento',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', conversationId);
              shouldCallRobot = true;
              robotId = matchedRobotForExisting.id;
            }
          }
        }

        // ====== SALVAR MENSAGEM E ATUALIZAR CONVERSA EM PARALELO ======
        let messagePreview = finalContent?.substring(0, 100) || '[Mídia]';
        if (mediaBase64) {
          if (mimeType?.startsWith('image/')) messagePreview = '📷 Imagem';
          else if (mimeType?.startsWith('audio/')) messagePreview = '🎵 Áudio';
          else if (mimeType?.startsWith('video/')) messagePreview = '🎬 Vídeo';
          else messagePreview = '📎 Documento';
        } else if (messageType === 'contact') {
          messagePreview = '👤 Contato';
        }

        await Promise.all([
          // Salvar mensagem
          supabase
            .from('messages')
            .insert({
              conversation_id: conversationId,
              content: finalContent || '',
              sender_name: senderName || 'WhatsApp',
              sender_id: null,
              message_type: messageType || 'text',
              status: 'sent',
              delivery_status: 'delivered',
              external_id: messageId
            }),
          
          // Atualizar conversa
          supabase
            .from('conversations')
            .update({
              updated_at: new Date().toISOString(),
              last_message_preview: messagePreview,
              whatsapp_instance_id: effectiveInstanceId
            })
            .eq('id', conversationId)
        ]);

        console.log('[WhatsApp] Mensagem salva com sucesso');

        // ====== BUSCAR FOTO DE PERFIL (BACKGROUND) ======
        // Se o contato não tem avatar, tentar buscar via Baileys
        if (contactId && senderJid) {
          supabase
            .from('contacts')
            .select('avatar_url')
            .eq('id', contactId)
            .single()
            .then(({ data: contactData }) => {
              if (contactData && !contactData.avatar_url) {
                // Buscar qual instanceId usar (a conexão Baileys conectada)
                supabase
                  .from('whatsapp_connections')
                  .select('phone_number_id')
                  .eq('connection_type', 'baileys')
                  .eq('status', 'connected')
                  .maybeSingle()
                  .then(({ data: conn }) => {
                    const instId = conn?.phone_number_id || 'default';
                    const proxyUrl = `${supabaseUrl}/functions/v1/baileys-proxy?action=profile-picture&jid=${encodeURIComponent(senderJid)}&instanceId=${instId}`;
                    
                    fetch(proxyUrl, {
                      method: 'GET',
                      headers: {
                        'Authorization': `Bearer ${supabaseServiceKey}`,
                        'Content-Type': 'application/json'
                      }
                    })
                    .then(r => r.json())
                    .then(result => {
                      if (result.success && result.url) {
                        supabase
                          .from('contacts')
                          .update({ avatar_url: result.url })
                          .eq('id', contactId)
                          .then(() => console.log(`[WhatsApp] Avatar atualizado para contato ${contactId}`));
                      } else {
                        console.log(`[WhatsApp] Avatar não disponível para ${senderJid}`);
                      }
                    })
                    .catch(err => console.error('[WhatsApp] Erro ao buscar avatar:', err));
                  });
              }
            });
        }

        // ====== DETECÇÃO AUTOMÁTICA DE LEADS POR KEYWORDS (SDR) ======
        if (shouldCallRobot && robotId) {
          const { data: convSdr } = await supabase
            .from('conversations')
            .select('sdr_deal_id')
            .eq('id', conversationId)
            .single();

          if (!convSdr?.sdr_deal_id && finalContent) {
            // Verificar keywords para criar lead automático
            const { data: autoConfig } = await supabase
              .from('sdr_auto_config')
              .select('keywords, is_active')
              .eq('is_active', true)
              .maybeSingle();

            if (autoConfig && autoConfig.keywords?.length > 0) {
              const msgLower = finalContent.toLowerCase();
              const matched = autoConfig.keywords.some((kw: string) => msgLower.includes(kw.toLowerCase()));

              if (matched) {
                console.log('[WhatsApp] Keyword SDR detectada! Criando lead automático...');

                const { data: firstStage } = await supabase
                  .from('sdr_pipeline_stages')
                  .select('id')
                  .eq('is_active', true)
                  .order('position')
                  .limit(1)
                  .single();

                const { data: sdrRobotCfg } = await supabase
                  .from('sdr_robot_config')
                  .select('robot_id')
                  .eq('is_active', true)
                  .maybeSingle();

                if (firstStage) {
                  const { data: contactForDeal } = await supabase
                    .from('contacts')
                    .select('name')
                    .eq('id', contactId)
                    .single();

                  const { data: newDeal, error: dealErr } = await supabase
                    .from('sdr_deals')
                    .insert({
                      title: 'Venda de Franquia',
                      stage_id: firstStage.id,
                      contact_id: contactId,
                      priority: 'medium',
                      value: 20000,
                    })
                    .select('id')
                    .single();

                  if (newDeal && !dealErr) {
                    console.log('[WhatsApp] Lead SDR criado:', newDeal.id);

                    const convUpdate: any = { sdr_deal_id: newDeal.id, updated_at: new Date().toISOString() };
                    if (sdrRobotCfg?.robot_id) {
                      convUpdate.assigned_to_robot = sdrRobotCfg.robot_id;
                      convUpdate.status = 'em_atendimento';
                      robotId = sdrRobotCfg.robot_id;
                    }
                    await supabase.from('conversations').update(convUpdate).eq('id', conversationId);

                    await supabase.from('sdr_deal_activities').insert({
                      deal_id: newDeal.id,
                      type: 'note',
                      title: 'Lead criado automaticamente por palavra-chave',
                      description: `Mensagem: "${finalContent.substring(0, 100)}"`,
                    });

                    // Route to sdr-robot-chat
                    fetch(`${supabaseUrl}/functions/v1/sdr-robot-chat`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${supabaseServiceKey}`
                      },
                      body: JSON.stringify({
                        conversationId: conversationId,
                        dealId: newDeal.id,
                        message: finalContent || '',
                        contactPhone: sender,
                        contactJid: senderJid
                      })
                    }).then(res => {
                      if (!res.ok) console.error('[WhatsApp] Erro sdr-robot-chat (auto):', res.status);
                      else console.log('[WhatsApp] SDR-robot-chat (auto) processado');
                    }).catch(err => console.error('[WhatsApp] Erro sdr-robot-chat (auto):', err));

                    // Skip normal robot call since SDR robot was triggered
                    shouldCallRobot = false;
                  }
                }
              }
            }
          }
        }

        // ====== CHAMAR ROBÔ EM BACKGROUND (NÃO AGUARDAR) ======
        if (shouldCallRobot && robotId) {
          // Check if conversation has sdr_deal_id → route to sdr-robot-chat
          const { data: convSdr2 } = await supabase
            .from('conversations')
            .select('sdr_deal_id')
            .eq('id', conversationId)
            .single();

          if (convSdr2?.sdr_deal_id) {
            console.log('[WhatsApp] SDR deal detected, routing to sdr-robot-chat');
            fetch(`${supabaseUrl}/functions/v1/sdr-robot-chat`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`
              },
              body: JSON.stringify({
                conversationId: conversationId,
                dealId: convSdr2.sdr_deal_id,
                message: finalContent || '',
                contactPhone: sender,
                contactJid: senderJid
              })
            }).then(res => {
              if (!res.ok) console.error('[WhatsApp] Erro sdr-robot-chat:', res.status);
              else console.log('[WhatsApp] SDR-robot-chat processado');
            }).catch(err => console.error('[WhatsApp] Erro sdr-robot-chat:', err));
          } else {
            // Fire and forget - não bloqueia a resposta
            fetch(`${supabaseUrl}/functions/v1/robot-chat`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`
              },
              body: JSON.stringify({
                robotId: robotId,
                conversationId: conversationId,
                message: finalContent || '',
                contactPhone: sender,
                contactJid: senderJid
              })
            }).then(res => {
              if (!res.ok) console.error('[WhatsApp] Erro robot-chat:', res.status);
              else console.log('[WhatsApp] Robot-chat processado');
            }).catch(err => console.error('[WhatsApp] Erro robot-chat:', err));
          }
        }

        break;
      }

      case 'message.status': {
        const { messageId, status, recipient } = data;
        console.log(`[WhatsApp] Status ${messageId}: ${status} (recipient: ${recipient}, instance: ${effectiveInstanceId})`);

        // 1. Tentar match direto por external_id
        const { data: updated } = await supabase
          .from('messages')
          .update({ delivery_status: status })
          .eq('external_id', messageId)
          .select('id');

        if (updated && updated.length > 0) {
          console.log(`[WhatsApp] Status atualizado para msg ${updated[0].id}`);
          
          // ====== PERSISTIR LID MAP VIA STATUS (match direto) ======
          if (recipient) {
            const recipDigits = recipient.replace(/\D/g, '');
            const isRecipientLid = recipDigits.length > 13;
            if (isRecipientLid) {
              // Recipient é pseudo-LID: buscar phone do contato da conversa
              const { data: statusMsg } = await supabase
                .from('messages')
                .select('conversation_id')
                .eq('id', updated[0].id)
                .single();
              if (statusMsg) {
                const { data: statusConv } = await supabase
                  .from('conversations')
                  .select('contact_id')
                  .eq('id', statusMsg.conversation_id)
                  .single();
                if (statusConv) {
                  const { data: statusCt } = await supabase
                    .from('contacts')
                    .select('phone')
                    .eq('id', statusConv.contact_id)
                    .single();
                  if (statusCt?.phone) {
                    const ctDigits = statusCt.phone.replace(/\D/g, '');
                    if (ctDigits.length >= 10 && ctDigits.length <= 13) {
                      const lidJidFromRecip = `${recipDigits}@lid`;
                      await supabase.from('whatsapp_lid_map').upsert({
                        lid_jid: lidJidFromRecip,
                        phone_digits: ctDigits,
                        instance_id: effectiveInstanceId,
                        updated_at: new Date().toISOString()
                      }, { onConflict: 'lid_jid,instance_id' });
                      console.log(`[WhatsApp] LID map criado via status (direct match): ${lidJidFromRecip} → ${ctDigits}`);
                    }
                  }
                }
              }
            }
          }
        } else {
          // 2. Fallback RESTRITO: buscar mensagem recente do agente sem external_id
          // REGRA: Só aplicar fallback se recipient é telefone real (≤13 dígitos)
          // Para pseudo-LIDs (>13 dígitos), exigir match estrito por instância + janela curta
          console.log(`[WhatsApp] external_id não encontrado, tentando fallback por recipient: ${recipient}`);
          
          if (recipient) {
            const recipientDigits = recipient.replace(/\D/g, '');
            const isPseudoLid = recipientDigits.length > 13;
            
            if (isPseudoLid) {
              // RESTRITO: Para pseudo-LIDs, buscar conversa APENAS na mesma instância e janela de 5 min
              console.log(`[WhatsApp] Recipient é pseudo-LID (${recipientDigits.length} dígitos) — fallback restrito`);
              
              const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
              
              // Buscar contato pelo LID nas notas
              const lidJid = `${recipientDigits}@lid`;
              const { data: lidContact } = await supabase
                .from('contacts')
                .select('id')
                .ilike('notes', `%jid:${lidJid}%`)
                .limit(1)
                .maybeSingle();
              
              if (lidContact) {
                // Buscar conversa ativa NA MESMA INSTÂNCIA
                const { data: instConv } = await supabase
                  .from('conversations')
                  .select('id')
                  .eq('contact_id', lidContact.id)
                  .eq('whatsapp_instance_id', effectiveInstanceId)
                  .in('status', ['em_fila', 'em_atendimento', 'pendente', 'transferida'])
                  .limit(1)
                  .maybeSingle();
                
                if (instConv) {
                  // Buscar msg outbound recente (janela curta) sem external_id
                  const { data: recentMsg } = await supabase
                    .from('messages')
                    .select('id')
                    .eq('conversation_id', instConv.id)
                    .not('sender_id', 'is', null)
                    .is('external_id', null)
                    .gte('created_at', fiveMinAgo)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                  
                  if (recentMsg) {
                    await supabase
                      .from('messages')
                      .update({ external_id: messageId, delivery_status: status })
                      .eq('id', recentMsg.id);
                    console.log(`[WhatsApp] Fallback restrito (LID+instance): external_id ${messageId} → msg ${recentMsg.id}`);
                    
                    // ====== PERSISTIR LID MAP VIA STATUS ======
                    // Buscar phone do contato para criar mapeamento LID→phone
                    const { data: statusContact } = await supabase
                      .from('contacts')
                      .select('phone')
                      .eq('id', lidContact.id)
                      .single();
                    if (statusContact?.phone) {
                      const scDigits = statusContact.phone.replace(/\D/g, '');
                      if (scDigits.length >= 10 && scDigits.length <= 13) {
                        await supabase.from('whatsapp_lid_map').upsert({
                          lid_jid: lidJid,
                          phone_digits: scDigits,
                          instance_id: effectiveInstanceId,
                          updated_at: new Date().toISOString()
                        }, { onConflict: 'lid_jid,instance_id' });
                        console.log(`[WhatsApp] LID map criado via status (pseudo-LID): ${lidJid} → ${scDigits}`);
                      }
                    }
                  } else {
                    console.log(`[WhatsApp] Fallback restrito: sem msg recente sem external_id na conv ${instConv.id}`);
                  }
                } else {
                  console.log(`[WhatsApp] Fallback restrito: sem conversa na instância ${effectiveInstanceId} para LID contact ${lidContact.id}`);
                }
              } else {
                console.log(`[WhatsApp] Fallback restrito: contato não encontrado para pseudo-LID ${recipientDigits}`);
              }
            } else {
              // TELEFONE REAL: fallback normal (mantém lógica existente)
              let contactId: string | null = null;
              
              // Tentar por telefone primeiro
              const { data: contactMatch } = await supabase
                .rpc('find_contact_by_phone', { phone_input: recipient });
              contactId = contactMatch?.[0]?.id || null;
              
              // Fallback LID: buscar contato pelo JID nas notas
              if (!contactId) {
                const lidJid = `${recipient}@lid`;
                const { data: lidContact } = await supabase
                  .from('contacts')
                  .select('id')
                  .ilike('notes', `%jid:${lidJid}%`)
                  .limit(1)
                  .maybeSingle();
                contactId = lidContact?.id || null;
              }
              
              // Fallback: buscar contato pelo JID @s.whatsapp.net
              if (!contactId) {
                const waJid = `${recipient}@s.whatsapp.net`;
                const { data: waContact } = await supabase
                  .from('contacts')
                  .select('id')
                  .ilike('notes', `%jid:${waJid}%`)
                  .limit(1)
                  .maybeSingle();
                contactId = waContact?.id || null;
              }
              
              if (contactId) {
                console.log(`[WhatsApp] Fallback: contato encontrado: ${contactId}`);
                // Buscar conversa ativa deste contato — PRIORIZAR mesma instância
                const { data: activeConv } = await supabase
                  .from('conversations')
                  .select('id, whatsapp_instance_id')
                  .eq('contact_id', contactId)
                  .in('status', ['em_fila', 'em_atendimento', 'pendente', 'transferida'])
                  .order('updated_at', { ascending: false })
                  .limit(1)
                  .maybeSingle();
                
                if (activeConv) {
                  // Verificar que a conversa é da mesma instância (se tiver instance_id)
                  if (activeConv.whatsapp_instance_id && activeConv.whatsapp_instance_id !== effectiveInstanceId) {
                    console.log(`[WhatsApp] Fallback: conversa ${activeConv.id} é de instância diferente (${activeConv.whatsapp_instance_id} vs ${effectiveInstanceId}) — ignorando`);
                  } else {
                    // Buscar mensagem mais recente do agente (sender_id NOT NULL) sem external_id
                    const { data: agentMsg } = await supabase
                      .from('messages')
                      .select('id')
                      .eq('conversation_id', activeConv.id)
                      .not('sender_id', 'is', null)
                      .is('external_id', null)
                      .order('created_at', { ascending: false })
                      .limit(1)
                      .maybeSingle();
                    
                    if (agentMsg) {
                      const { error: fallbackErr } = await supabase
                        .from('messages')
                        .update({ external_id: messageId, delivery_status: status })
                        .eq('id', agentMsg.id);
                      
                      if (!fallbackErr) {
                        console.log(`[WhatsApp] Fallback: external_id ${messageId} associado à msg ${agentMsg.id} com status ${status}`);
                        
                        // ====== PERSISTIR LID MAP VIA STATUS (telefone real) ======
                        // Se recipient é telefone real, buscar se contato tem LID no notes
                        const { data: statusContact2 } = await supabase
                          .from('contacts')
                          .select('notes')
                          .eq('id', contactId!)
                          .single();
                        if (statusContact2?.notes) {
                          const lidMatch = statusContact2.notes.match(/jid:(\d+@lid)/);
                          if (lidMatch) {
                            const contactLid = lidMatch[1];
                            await supabase.from('whatsapp_lid_map').upsert({
                              lid_jid: contactLid,
                              phone_digits: recipientDigits,
                              instance_id: effectiveInstanceId,
                              updated_at: new Date().toISOString()
                            }, { onConflict: 'lid_jid,instance_id' });
                            console.log(`[WhatsApp] LID map criado via status (phone→LID): ${contactLid} → ${recipientDigits}`);
                          }
                        }
                      } else {
                        console.error(`[WhatsApp] Fallback: erro ao associar external_id:`, fallbackErr);
                      }
                    } else {
                      console.log(`[WhatsApp] Fallback: nenhuma msg sem external_id encontrada para conv ${activeConv.id}`);
                    }
                  }
                } else {
                  console.log(`[WhatsApp] Fallback: nenhuma conversa ativa para contato ${contactId}`);
                }
              } else {
                console.log(`[WhatsApp] Fallback: contato não encontrado para recipient ${recipient}`);
              }
            }
          }
        }
        break;
      }

      case 'message.deleted': {
        const { messageId, senderPhone } = data;
        console.log(`[WhatsApp] Mensagem apagada: ${messageId}`);

        // Verificar se a mensagem existe e ainda não está deletada (evitar updates redundantes que geram ruído no realtime)
        const { data: existingMsg } = await supabase
          .from('messages')
          .select('id, deleted')
          .eq('external_id', messageId)
          .maybeSingle();

        if (!existingMsg) {
          console.log(`[WhatsApp] Mensagem ${messageId} não encontrada no banco, ignorando deleção`);
        } else if (existingMsg.deleted) {
          console.log(`[WhatsApp] Mensagem ${messageId} já está deletada, ignorando update redundante`);
        } else {
          const { error } = await supabase
            .from('messages')
            .update({ deleted: true })
            .eq('id', existingMsg.id);
          
          if (error) {
            console.error('[WhatsApp] Erro ao marcar mensagem como apagada:', error);
          } else {
            console.log(`[WhatsApp] Mensagem ${messageId} marcada como apagada`);
          }
        }
        break;
      }

      case 'message.reaction': {
        const { targetMessageId, emoji, senderPhone, isRemoval } = data;
        console.log(`[WhatsApp] Reação ${emoji} na mensagem ${targetMessageId}`);

        // Buscar mensagem pelo external_id
        const { data: message } = await supabase
          .from('messages')
          .select('id')
          .eq('external_id', targetMessageId)
          .maybeSingle();

        if (message) {
          if (isRemoval) {
            // Remover reação
            await supabase
              .from('message_reactions')
              .delete()
              .eq('external_message_id', targetMessageId)
              .eq('sender_phone', senderPhone);
            console.log(`[WhatsApp] Reação removida da mensagem ${targetMessageId}`);
          } else {
            // Adicionar reação
            await supabase
              .from('message_reactions')
              .insert({
                message_id: message.id,
                external_message_id: targetMessageId,
                emoji,
                sender_phone: senderPhone
              });
            console.log(`[WhatsApp] Reação ${emoji} adicionada à mensagem ${targetMessageId}`);
          }
        } else {
          console.log(`[WhatsApp] Mensagem não encontrada para reação: ${targetMessageId}`);
        }
        break;
      }

      case 'presence.update': {
        const { phone, status: presenceStatus } = data;
        console.log(`[WhatsApp] Presença ${phone}: ${presenceStatus}`);
        
        const { data: contact } = await supabase
          .from('contacts')
          .select('id')
          .eq('phone', phone)
          .maybeSingle();

        if (contact) {
          const { data: conversation } = await supabase
            .from('conversations')
            .select('id')
            .eq('contact_id', contact.id)
            .in('status', ['em_atendimento', 'pendente'])
            .maybeSingle();

          if (conversation) {
            const channel = supabase.channel(`typing-${conversation.id}`);
            await channel.send({
              type: 'broadcast',
              event: 'typing',
              payload: {
                conversationId: conversation.id,
                phone,
                isTyping: presenceStatus === 'composing' || presenceStatus === 'recording',
                status: presenceStatus
              }
            });
          }
        }
        break;
      }

      default:
        console.log(`[WhatsApp] Evento não tratado: ${event}`);
    }

    return new Response(
      JSON.stringify({ success: true, event }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[WhatsApp Webhook] Erro:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
