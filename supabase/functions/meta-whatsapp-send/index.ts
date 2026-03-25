import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const META_API_VERSION = 'v21.0';
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

// Buscar token: primeiro do segredo, fallback do banco
async function getAccessToken(phoneNumberId?: string): Promise<string> {
  const envToken = Deno.env.get('META_WHATSAPP_ACCESS_TOKEN');
  
  // Tentar buscar token do banco (mais atualizado)
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);
    
    let query = supabase
      .from('whatsapp_connections')
      .select('access_token')
      .eq('connection_type', 'meta_api');
    
    if (phoneNumberId) {
      query = query.eq('phone_number_id', phoneNumberId);
    }
    
    const { data } = await query.limit(1).maybeSingle();
    
    if (data?.access_token) {
      return data.access_token;
    }
  } catch (e) {
    console.warn('[Meta Send] Fallback: não conseguiu buscar token do banco:', e);
  }
  
  if (envToken) return envToken;
  
  throw new Error('META_WHATSAPP_ACCESS_TOKEN não configurado');
}

interface SendMessageRequest {
  phone_number_id: string;
  to: string;
  message: string;
  type?: 'text' | 'template' | 'image' | 'audio' | 'video' | 'document';
  template_name?: string;
  template_language?: string;
  template_components?: unknown[];
  media_url?: string;
  media_caption?: string;
  filename?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body: SendMessageRequest = await req.json();
    const {
      phone_number_id,
      to,
      message,
      type = 'text',
      template_name,
      template_language = 'pt_BR',
      template_components,
      media_url,
      media_caption,
      filename
    } = body;

    const accessToken = await getAccessToken(phone_number_id);

    console.log('[Meta Send] Enviando mensagem:', { phone_number_id, to, type });

    if (!phone_number_id || !to) {
      throw new Error('phone_number_id e to são obrigatórios');
    }

    const formattedTo = to.replace(/\D/g, '');

    let messagePayload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedTo
    };

    switch (type) {
      case 'text':
        messagePayload.type = 'text';
        messagePayload.text = { preview_url: true, body: message };
        break;

      case 'template':
        if (!template_name) throw new Error('template_name é obrigatório para mensagens de template');
        messagePayload.type = 'template';
        messagePayload.template = {
          name: template_name,
          language: { code: template_language },
          components: template_components || []
        };
        break;

      case 'image':
        if (!media_url) throw new Error('media_url é obrigatório para mensagens de imagem');
        messagePayload.type = 'image';
        messagePayload.image = { link: media_url, caption: media_caption || '' };
        break;

      case 'audio':
        if (!media_url) throw new Error('media_url é obrigatório para mensagens de áudio');
        messagePayload.type = 'audio';
        messagePayload.audio = { link: media_url };
        break;

      case 'video':
        if (!media_url) throw new Error('media_url é obrigatório para mensagens de vídeo');
        messagePayload.type = 'video';
        messagePayload.video = { link: media_url, caption: media_caption || '' };
        break;

      case 'document':
        if (!media_url) throw new Error('media_url é obrigatório para mensagens de documento');
        messagePayload.type = 'document';
        messagePayload.document = { link: media_url, caption: media_caption || '', filename: filename || 'document' };
        break;

      default:
        throw new Error(`Tipo de mensagem não suportado: ${type}`);
    }

    console.log('[Meta Send] Payload:', JSON.stringify(messagePayload, null, 2));

    const response = await fetch(
      `${META_API_BASE}/${phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(messagePayload)
      }
    );

    const responseData = await response.json();

    if (!response.ok) {
      console.error('[Meta Send] Erro da API:', responseData);
      const metaErrorCode = responseData.error?.code;
      const isWindowExpired = metaErrorCode === 131000 || metaErrorCode === 131047;
      
      if (isWindowExpired) {
        console.warn('[Meta Send] ⚠️ Janela de 24h expirada para:', formattedTo);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Janela de 24h expirada — não é possível enviar mensagem',
            errorCode: 'WINDOW_EXPIRED',
            metaCode: metaErrorCode
          }),
          {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      
      throw new Error(responseData.error?.message || 'Erro ao enviar mensagem');
    }

    console.log('[Meta Send] ✅ Resposta:', responseData);

    const messageId = responseData.messages?.[0]?.id;

    return new Response(
      JSON.stringify({
        success: true,
        messageId,
        wamid: messageId,
        contacts: responseData.contacts
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Meta Send] Erro:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
