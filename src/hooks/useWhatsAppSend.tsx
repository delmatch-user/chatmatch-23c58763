import { supabase } from '@/integrations/supabase/client';

interface SendResult {
  data: { messageId?: string; success?: boolean; usedJid?: string; wamid?: string } | null;
  error: Error | null;
}

interface WhatsAppConnection {
  id: string;
  connection_type: string;
  phone_number_id: string;
  department_id: string | null;
  status: string;
}

// Cache global de JIDs para evitar lookups repetidos
const jidCache = new Map<string, string>();

// Função para limpar cache de um telefone específico (útil quando mensagem falha)
export function clearJidCache(phone: string) {
  jidCache.delete(phone);
}

// Função para limpar cache de conexões (mantida para compatibilidade)
export function clearConnectionCache() {
  // No-op - cache removido para evitar dados stale
}

// Buscar conexão por instanceId (phone_number_id)
async function getConnectionByInstanceId(instanceId: string): Promise<WhatsAppConnection | null> {
  console.log('[WhatsApp] Buscando conexão por instanceId:', instanceId);
  const { data: connection, error } = await supabase
    .from('whatsapp_connections')
    .select('id, connection_type, phone_number_id, department_id, status')
    .eq('phone_number_id', instanceId)
    .in('status', ['connected', 'active'])
    .in('connection_type', ['baileys', 'meta_api'])
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[WhatsApp] Erro ao buscar conexão por instanceId:', error);
    return null;
  }
  if (connection) {
    console.log('[WhatsApp] Conexão encontrada por instanceId:', connection.phone_number_id, 'type:', connection.connection_type);
    return connection as WhatsAppConnection;
  }
  return null;
}

// Buscar conexão do departamento - SEMPRE consulta o banco (sem cache)
// Regra: priorizar Baileys (QR) para evitar roteamento indevido para Meta em deptos híbridos
async function getConnectionForDepartment(departmentId: string): Promise<WhatsAppConnection | null> {
  console.log('[WhatsApp] Buscando conexão para departamento (prioridade baileys):', departmentId);

  const baseSelect = 'id, connection_type, phone_number_id, department_id, status';

  // 1) Prioridade: Baileys conectado
  const { data: baileysConn, error: baileysErr } = await supabase
    .from('whatsapp_connections')
    .select(baseSelect)
    .eq('department_id', departmentId)
    .eq('connection_type', 'baileys')
    .in('status', ['connected', 'active'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (baileysErr) {
    console.warn('[WhatsApp] Erro ao buscar conexão Baileys do departamento:', baileysErr);
  }

  if (baileysConn) {
    console.log('[WhatsApp] Conexão Baileys encontrada para dept', departmentId, '→', baileysConn.phone_number_id);
    return baileysConn as WhatsAppConnection;
  }

  // 2) Fallback: Meta API ativa
  const { data: metaConn, error: metaErr } = await supabase
    .from('whatsapp_connections')
    .select(baseSelect)
    .eq('department_id', departmentId)
    .eq('connection_type', 'meta_api')
    .in('status', ['connected', 'active'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (metaErr) {
    console.warn('[WhatsApp] Erro ao buscar conexão Meta do departamento:', metaErr);
    return null;
  }

  if (metaConn) {
    console.log('[WhatsApp] Conexão Meta encontrada para dept', departmentId, '→', metaConn.phone_number_id);
    return metaConn as WhatsAppConnection;
  }

  console.warn('[WhatsApp] Nenhuma conexão ativa para departamento:', departmentId);
  return null;
}

// Buscar qualquer conexão ativa (fallback)
// Regra: preferir Baileys para manter consistência com atendimento atual
async function getAnyActiveConnection(): Promise<WhatsAppConnection | null> {
  const baseSelect = 'id, connection_type, phone_number_id, department_id, status';

  const { data: anyBaileys, error: baileysErr } = await supabase
    .from('whatsapp_connections')
    .select(baseSelect)
    .eq('connection_type', 'baileys')
    .in('status', ['connected', 'active'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!baileysErr && anyBaileys) {
    return anyBaileys as WhatsAppConnection;
  }

  const { data: anyMeta, error: metaErr } = await supabase
    .from('whatsapp_connections')
    .select(baseSelect)
    .eq('connection_type', 'meta_api')
    .in('status', ['connected', 'active'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (metaErr || !anyMeta) {
    return null;
  }

  return anyMeta as WhatsAppConnection;
}

export function useWhatsAppSend() {
  const sendMessage = async (
    phone: string, 
    message: string, 
    type: string = 'text',
    contactId?: string,
    departmentId?: string,
    fileName?: string,
    mimeType?: string,
    channel?: string,
    senderName?: string,
    whatsappInstanceId?: string // ID da instância WhatsApp que originou a conversa
  ): Promise<SendResult> => {
    try {
      console.log('[WhatsApp] Enviando mensagem para:', phone, 'tipo:', type, 'dept:', departmentId, 'channel:', channel);
      
      // ====== INSTAGRAM ======
      if (channel === 'instagram') {
        return await sendViaInstagram(phone, message, type, departmentId);
      }

      // ====== MACHINE ======
      if (channel === 'machine') {
        // phone contém o conversation.id para Machine
        return await sendViaMachine(phone, message, senderName);
      }
      
      // Determinar qual conexão usar: prioridade instanceId > departamento > fallback
      let connection: WhatsAppConnection | null = null;
      
      // 1. Priorizar instanceId da conversa (garante envio pela instância correta após transferência)
      if (whatsappInstanceId) {
        connection = await getConnectionByInstanceId(whatsappInstanceId);
      }
      
      // 2. Fallback: buscar por departamento e persistir instance_id na conversa
      if (!connection && departmentId) {
        connection = await getConnectionForDepartment(departmentId);
        
        // FASE C: Persistir instance_id na conversa para estabilizar futuros envios
        if (connection && contactId) {
          // Buscar conversa ativa para persistir o whatsapp_instance_id
          supabase
            .from('conversations')
            .select('id, whatsapp_instance_id')
            .eq('contact_id', contactId)
            .in('status', ['em_fila', 'em_atendimento', 'pendente', 'transferida'])
            .is('whatsapp_instance_id', null)
            .limit(1)
            .maybeSingle()
            .then(({ data: conv }) => {
              if (conv) {
                supabase
                  .from('conversations')
                  .update({ whatsapp_instance_id: connection!.phone_number_id })
                  .eq('id', conv.id)
                  .then(() => console.log(`[WhatsApp] Instance ID persistido na conversa ${conv.id}: ${connection!.phone_number_id}`));
              }
            });
        }
      }
      
      // Fallback: buscar qualquer conexão ativa
      if (!connection) {
        connection = await getAnyActiveConnection();
      }

      if (!connection) {
        console.error('[WhatsApp] Nenhuma conexão ativa encontrada');
        return { data: null, error: Object.assign(new Error('Nenhuma conexão WhatsApp ativa'), { code: 'DISCONNECTED' }) };
      }

      console.log('[WhatsApp] Usando conexão:', connection.connection_type, 'ID:', connection.id);

      // ====== META API ======
      if (connection.connection_type === 'meta_api') {
        return await sendViaMeta(connection, phone, message, type, fileName);
      }
      
      // ====== BAILEYS (QR Code) ======
      return await sendViaBaileys(phone, message, type, contactId, fileName, mimeType, connection.phone_number_id);
      
    } catch (error) {
      console.error('[WhatsApp] Erro ao enviar mensagem:', error);
      return { data: null, error: error as Error };
    }
  };

  // Enviar via Machine (webhook externo)
  const sendViaMachine = async (
    conversationId: string,
    message: string,
    senderName?: string
  ): Promise<SendResult> => {
    console.log('[Machine] Enviando via webhook externo...', { conversationId, senderName });

    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = attempt * 2000;
        console.log(`[Machine] Retry ${attempt}/${maxRetries} após ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }

      const { data, error } = await supabase.functions.invoke('machine-send', {
        body: { conversationId, message, senderName },
      });

      if (!error && data?.success) {
        console.log('[Machine] Mensagem enviada com sucesso');
        return { data: { success: true }, error: null };
      }

      const errorCode = data?.errorCode || 'UNKNOWN';
      const errorMsg = data?.error || error?.message || 'Falha ao enviar mensagem';
      console.error(`[Machine] Falha [${errorCode}] tentativa ${attempt + 1}:`, errorMsg, data?.details);

      // Retry apenas para rate limit
      if (errorCode === 'RATE_LIMIT' && attempt < maxRetries) {
        continue;
      }

      return { data: null, error: new Error(errorMsg) };
    }

    return { data: null, error: new Error('Falha ao enviar após múltiplas tentativas') };
  };

  // Enviar via Instagram
  const sendViaInstagram = async (
    recipientId: string, 
    message: string, 
    type: string,
    departmentId?: string
  ): Promise<SendResult> => {
    console.log('[Instagram] Enviando via API...', { type, recipientId });
    
    // Buscar conexão do Instagram
    let connection: WhatsAppConnection | null = null;
    
    if (departmentId) {
      const { data } = await supabase
        .from('whatsapp_connections')
        .select('id, connection_type, phone_number_id, department_id, status')
        .eq('connection_type', 'instagram')
        .eq('department_id', departmentId)
        .in('status', ['connected', 'active'])
        .maybeSingle();
      
      connection = data as WhatsAppConnection | null;
    }
    
    if (!connection) {
      // Fallback: buscar qualquer conexão Instagram ativa
      const { data } = await supabase
        .from('whatsapp_connections')
        .select('id, connection_type, phone_number_id, department_id, status, waba_id')
        .eq('connection_type', 'instagram')
        .in('status', ['connected', 'active'])
        .limit(1)
        .maybeSingle();
      
      connection = data as WhatsAppConnection | null;
    }
    
    if (!connection) {
      return { data: null, error: new Error('Nenhuma conexão Instagram ativa') };
    }
    
    // O phone para Instagram vem como "ig:123456" - extrair o ID
    const cleanRecipientId = recipientId.replace('ig:', '');

    // Buscar page_id (waba_id) e ig_account_id (phone_number_id) da conexão
    const { data: fullConnection } = await supabase
      .from('whatsapp_connections')
      .select('waba_id, phone_number_id')
      .eq('id', connection.id)
      .single();

    const pageId = fullConnection?.waba_id;
    // Instagram Business Account ID — endpoint primário para a Instagram Messaging API
    const igAccountId = fullConnection?.phone_number_id || connection.phone_number_id;

    if (!igAccountId && !pageId) {
      return { data: null, error: new Error('Page ID e Instagram Account ID não configurados') };
    }

    // Para mídias, a "message" contém a URL do arquivo
    const isMedia = ['image', 'video', 'file'].includes(type);

    const { data, error } = await supabase.functions.invoke('instagram-send', {
      body: {
        page_id: pageId,
        ig_account_id: igAccountId,
        recipient_id: cleanRecipientId,
        message: isMedia ? '' : message,
        type: type,
        media_url: isMedia ? message : undefined
      },
    });

    if (error) {
      console.error('[Instagram] Erro ao enviar:', error);
      return { data: null, error };
    }

    if (data && !data.success) {
      console.error('[Instagram] Falha no envio:', data.error);
      return { data: null, error: new Error(data.error || 'Falha ao enviar mensagem') };
    }

    console.log('[Instagram] Mensagem enviada com sucesso:', data);
    return { 
      data: { 
        messageId: data?.messageId,
        success: true
      }, 
      error: null 
    };
  };

  // Enviar via Meta API
  const sendViaMeta = async (
    connection: WhatsAppConnection,
    phone: string, 
    message: string, 
    type: string,
    fileName?: string
  ): Promise<SendResult> => {
    console.log('[WhatsApp Meta] Enviando via API oficial...', { type, phone, fileName });
    
    // Para mídias, a "message" contém a URL do arquivo
    const isMedia = ['image', 'audio', 'video', 'document'].includes(type);
    
    const { data, error } = await supabase.functions.invoke('meta-whatsapp-send', {
      body: { 
        phone_number_id: connection.phone_number_id,
        to: phone,
        message: isMedia ? '' : message,
        type: type,
        media_url: isMedia ? message : undefined,
        media_caption: '',
        filename: fileName || (type === 'document' ? 'documento' : undefined)
      },
    });

    if (error) {
      console.error('[WhatsApp Meta] Erro ao enviar:', error);
      return { data: null, error };
    }

    if (data && !data.success) {
      console.error('[WhatsApp Meta] Falha no envio:', data.error);
      return { data: null, error: new Error(data.error || 'Falha ao enviar mensagem') };
    }

    console.log('[WhatsApp Meta] Mensagem enviada com sucesso:', data);
    return { 
      data: { 
        messageId: data?.messageId || data?.wamid,
        success: true,
        wamid: data?.wamid
      }, 
      error: null 
    };
  };

  // Enviar via Baileys (QR Code)
  const sendViaBaileys = async (
    phone: string, 
    message: string, 
    type: string,
    contactId?: string,
    fileName?: string,
    mimeType?: string,
    instanceId?: string
  ): Promise<SendResult> => {
    // Detectar se é base64 (para áudios/mídias enviados diretamente)
    const isBase64 = message.startsWith('data:');
    console.log('[WhatsApp Baileys] Enviando via QR Code para:', phone, 'instanceId:', instanceId, 'fileName:', fileName, 'isBase64:', isBase64);
    
    // Se o phone já é um JID completo (contém @), usar diretamente
    // Baileys consegue enviar para LIDs diretamente
    if (phone.includes('@')) {
      console.log('[WhatsApp Baileys] Usando JID passado diretamente:', phone);
      
      const { data, error } = await supabase.functions.invoke('baileys-proxy', {
        body: { 
          action: 'send',
          to: phone, 
          message, 
          type,
          fileName,
          mimetype: mimeType,
          instanceId
        },
      });

      if (error) {
        // Se data.success === true, ignorar o erro do invoke
        if (data?.success) {
          console.warn('[WhatsApp Baileys] Invoke retornou erro mas data.success=true, ignorando:', error.message);
          return { data, error: null };
        }
        // Se data contém erro específico do servidor, usar essa mensagem
        if (data && data.success === false && data.error) {
          console.error('[WhatsApp Baileys] Erro específico do servidor:', data.error);
          const errorMessage = (data.error as string).toLowerCase();
          if (errorMessage.includes('não está conectado') || errorMessage.includes('not connected') || errorMessage.includes('desconectado')) {
            return { data: null, error: Object.assign(new Error(data.error), { code: 'DISCONNECTED' }) };
          }
          return { data: null, error: Object.assign(new Error(data.error), { code: 'SERVER_ERROR' }) };
        }
        console.error('[WhatsApp Baileys] Erro ao enviar:', error);
        throw error;
      }
      
      if (data && !data.success) {
        console.error('[WhatsApp Baileys] Falha no envio:', data.error);
        return { data: null, error: new Error(data.error || 'Falha ao enviar mensagem') };
      }

      console.log('[WhatsApp Baileys] Mensagem enviada com sucesso:', data);
      return { data, error: null };
    }
    
    // Se não é JID, tratar como número de telefone
    // REGRA: Phone real tem prioridade. JID/LID só como último fallback.
    let jid: string | undefined = undefined;
    let phoneToUse: string | undefined = undefined;
    
    // Verificar cache
    const cachedJid = jidCache.get(phone);
    
    // Formatar phone para envio direto
    let formattedPhone = phone.replace(/\D/g, '');
    if (!formattedPhone.startsWith('55') && formattedPhone.length <= 11) {
      formattedPhone = '55' + formattedPhone;
    }
    
    // Se o phone parece um número real (10-13 dígitos), usar diretamente
    // >13 dígitos indica que é um LID salvo como phone (ex: 74737380241556)
    if (formattedPhone.length >= 10 && formattedPhone.length <= 13) {
      phoneToUse = formattedPhone;
      console.log('[WhatsApp Baileys] Usando número real:', phoneToUse);
    } else if (formattedPhone.length > 13) {
      // Phone é na verdade um LID - enviar como @lid para que o proxy resolva
      console.log('[WhatsApp Baileys] ⚠️ Phone >13 dígitos detectado como LID:', formattedPhone);
      jid = `${formattedPhone}@lid`;
      console.log('[WhatsApp Baileys] Convertido para JID LID:', jid);
    }
    
    // Fallback: buscar JID armazenado apenas se não temos phone válido nem LID
    if (!phoneToUse && !jid) {
      if (cachedJid) {
        jid = cachedJid;
        console.log('[WhatsApp Baileys] Usando JID do cache (sem phone válido):', jid);
      } else {
        // Buscar o JID armazenado do contato
        const { data: contact, error: contactError } = await supabase
          .from('contacts')
          .select('id, notes')
          .eq('phone', phone)
          .maybeSingle();
        
        if (contactError) {
          console.warn('[WhatsApp Baileys] Erro ao buscar contato:', contactError);
        }
        
        if (contact?.notes && contact.notes.includes('jid:')) {
          // Extrair o primeiro JID das notes (pode ter múltiplos separados por " | ")
          const jidMatch = contact.notes.match(/jid:([^\s|]+)/);
          jid = jidMatch ? jidMatch[1] : contact.notes.replace('jid:', '');
          // Se o JID armazenado é um @s.whatsapp.net mas com >13 dígitos, converter para @lid
          const jidDigits = jid.split('@')[0]?.replace(/\D/g, '') || '';
          if (jid.endsWith('@s.whatsapp.net') && jidDigits.length > 13) {
            console.log('[WhatsApp Baileys] ⚠️ JID armazenado é pseudo-phone, convertendo para @lid:', jid);
            jid = `${jidDigits}@lid`;
          }
          console.log('[WhatsApp Baileys] Usando JID armazenado (sem phone válido):', jid);
        }
      }
    }
    
    const destination = phoneToUse || jid || formattedPhone;
    console.log('[WhatsApp Baileys] Destino final:', destination, '(phone:', phoneToUse, 'jid:', jid, ')');
    
    // Passar action no body para o baileys-proxy
    const { data, error } = await supabase.functions.invoke('baileys-proxy', {
      body: { 
        action: 'send',
        to: destination, 
        message, 
        type,
        fileName,
        mimetype: mimeType,
        instanceId
      },
    });

    // Se o invoke retornou erro mas data indica sucesso, ignorar o erro
    if (error && data?.success) {
      console.warn('[WhatsApp Baileys] Invoke retornou erro mas data.success=true, ignorando erro:', error.message);
    } else if (error) {
      // Verificar se data contém erro específico do servidor antes de lançar erro genérico
      if (data && data.success === false && data.error) {
        console.error('[WhatsApp Baileys] Erro específico do servidor:', data.error);
        jidCache.delete(phone);
        const errorMessage = (data.error as string).toLowerCase();
        if (errorMessage.includes('não está conectado') || errorMessage.includes('not connected') || errorMessage.includes('desconectado')) {
          console.warn('[WhatsApp Baileys] Conexão perdida, atualizando status no banco...');
          clearConnectionCache();
          await supabase
            .from('whatsapp_connections')
            .update({ status: 'disconnected', updated_at: new Date().toISOString() })
            .eq('connection_type', 'baileys');
          return { data: null, error: Object.assign(new Error(data.error), { code: 'DISCONNECTED' }) };
        }
        return { data: null, error: Object.assign(new Error(data.error), { code: 'SERVER_ERROR' }) };
      }
      console.error('[WhatsApp Baileys] Erro ao enviar:', error);
      jidCache.delete(phone);
      const errMsg = error.message?.toLowerCase() || '';
      if (errMsg.includes('inacessível') || errMsg.includes('fetch') || errMsg.includes('network')) {
        return { data: null, error: Object.assign(new Error('Servidor Baileys inacessível'), { code: 'SERVER_ERROR' }) };
      }
      throw error;
    }
    
    // Verificar se a resposta indica erro
    if (data && !data.success) {
      console.error('[WhatsApp Baileys] Falha no envio:', data.error, 'code:', data.code);
      jidCache.delete(phone);
      
      // FASE C: Tratar UNRESOLVED_DESTINATION com feedback claro
      if (data.code === 'UNRESOLVED_DESTINATION') {
        console.warn('[WhatsApp Baileys] Destino não resolvido — contato sem telefone válido');
        return { 
          data: null, 
          error: Object.assign(
            new Error('Não foi possível enviar: o contato não tem telefone válido cadastrado. Tente atualizar o telefone do contato.'), 
            { code: 'UNRESOLVED_DESTINATION' }
          ) 
        };
      }
      
      // Se o erro indica desconexão, atualizar status no banco e limpar cache de conexões
      const errorMessage = data.error?.toLowerCase() || '';
      if (errorMessage.includes('não está conectado') || 
          errorMessage.includes('not connected') ||
          errorMessage.includes('desconectado')) {
        console.warn('[WhatsApp Baileys] Conexão perdida, atualizando status no banco...');
        clearConnectionCache();
        
        // Atualizar status da conexão Baileys para disconnected
        await supabase
          .from('whatsapp_connections')
          .update({ status: 'disconnected', updated_at: new Date().toISOString() })
          .eq('connection_type', 'baileys');
      }
      
      return { data: null, error: new Error(data.error || 'Falha ao enviar mensagem') };
    }

    console.log('[WhatsApp Baileys] Mensagem enviada com sucesso:', data);
    
    // ====== SALVAR MAPEAMENTO JID ======
    if (data?.usedJid && data.usedJid !== jid) {
      console.log('[WhatsApp Baileys] Backend usou JID diferente:', data.usedJid);
      
      // Atualizar cache com o JID que realmente funcionou
      jidCache.set(phone, data.usedJid);
      
      // Atualizar contato no banco se possível
      if (contactId) {
        // APPEND JID em vez de sobrescrever
        const { data: existingC } = await supabase.from('contacts').select('notes').eq('id', contactId).single();
        const curNotes = existingC?.notes || '';
        const appendedNotes = curNotes.includes(data.usedJid) ? curNotes : (curNotes ? `${curNotes} | jid:${data.usedJid}` : `jid:${data.usedJid}`);
        const { error: updateError } = await supabase
          .from('contacts')
          .update({ notes: appendedNotes })
          .eq('id', contactId);
        
        if (updateError) {
          console.warn('[WhatsApp Baileys] Erro ao atualizar JID do contato:', updateError);
        } else {
          console.log('[WhatsApp Baileys] JID do contato atualizado:', data.usedJid);
        }
      } else {
        // Tentar atualizar pelo telefone (APPEND)
        const { data: existingByPhone } = await supabase.from('contacts').select('notes').eq('phone', phone).maybeSingle();
        const curNotes2 = existingByPhone?.notes || '';
        const appendedNotes2 = curNotes2.includes(data.usedJid) ? curNotes2 : (curNotes2 ? `${curNotes2} | jid:${data.usedJid}` : `jid:${data.usedJid}`);
        const { error: updateError } = await supabase
          .from('contacts')
          .update({ notes: appendedNotes2 })
          .eq('phone', phone);
        
        if (!updateError) {
          console.log('[WhatsApp Baileys] JID atualizado para telefone:', phone);
        }
      }
    }

    return { data, error: null };
  };

  return { sendMessage };
}
