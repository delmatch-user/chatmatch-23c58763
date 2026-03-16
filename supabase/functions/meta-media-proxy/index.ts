import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getMetaAccessToken(supabase: any): Promise<string> {
  // Priorizar token do banco (mais atualizado)
  try {
    const { data } = await supabase
      .from('whatsapp_connections')
      .select('access_token')
      .eq('connection_type', 'meta_api')
      .not('access_token', 'is', null)
      .limit(1)
      .maybeSingle();

    if (data?.access_token) {
      console.log('[Meta Media Proxy] Usando token do banco de dados');
      return data.access_token;
    }
  } catch (e) {
    console.warn('[Meta Media Proxy] Fallback: erro ao buscar token do banco:', e);
  }

  const envToken = Deno.env.get('META_WHATSAPP_ACCESS_TOKEN');
  if (envToken) {
    console.log('[Meta Media Proxy] Usando token do ambiente (fallback)');
    return envToken;
  }

  throw new Error('Nenhum token Meta disponível');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { mediaId, messageId } = await req.json();

    if (!mediaId) {
      return new Response(JSON.stringify({ error: 'mediaId obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const accessToken = await getMetaAccessToken(supabase);

    // 1. Obter URL do media
    const mediaInfoRes = await fetch(
      `https://graph.facebook.com/v21.0/${mediaId}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );

    if (!mediaInfoRes.ok) {
      const errText = await mediaInfoRes.text();
      console.error('[Meta Media Proxy] Erro ao obter info da mídia:', errText);
      return new Response(JSON.stringify({ error: 'Mídia não disponível na Meta' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const mediaInfo = await mediaInfoRes.json();
    const downloadUrl = mediaInfo.url;
    const mimeType = mediaInfo.mime_type || 'application/octet-stream';

    if (!downloadUrl) {
      return new Response(JSON.stringify({ error: 'URL da mídia não encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Baixar o arquivo
    const mediaRes = await fetch(downloadUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!mediaRes.ok) {
      const errBody = await mediaRes.text();
      console.error('[Meta Media Proxy] Erro ao baixar mídia:', mediaRes.status, errBody);
      return new Response(JSON.stringify({ error: 'Erro ao baixar mídia' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const mediaBytes = new Uint8Array(await mediaRes.arrayBuffer());

    // 3. Upload para Storage
    const ext = mimeType.split('/')[1]?.split(';')[0] || 'bin';
    const uniqueFileName = `${Date.now()}_meta_${mediaId}.${ext}`;

    const { error: uploadError } = await supabase
      .storage
      .from('chat-uploads')
      .upload(uniqueFileName, mediaBytes, {
        contentType: mimeType,
        upsert: false
      });

    if (uploadError) {
      console.error('[Meta Media Proxy] Erro no upload:', uploadError);
      return new Response(JSON.stringify({ error: 'Erro ao salvar mídia' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { publicUrl } } = supabase
      .storage
      .from('chat-uploads')
      .getPublicUrl(uniqueFileName);

    // 4. Atualizar mensagem no banco se messageId fornecido
    if (messageId) {
      const { data: msg } = await supabase
        .from('messages')
        .select('content')
        .eq('id', messageId)
        .single();

      if (msg?.content) {
        try {
          const attachments = JSON.parse(msg.content);
          if (Array.isArray(attachments)) {
            const updated = attachments.map((att: any) => {
              if (att.url?.startsWith('meta_media:')) {
                return { ...att, url: publicUrl };
              }
              return att;
            });
            await supabase
              .from('messages')
              .update({ content: JSON.stringify(updated) })
              .eq('id', messageId);
          }
        } catch {
          // content não é JSON, ignorar
        }
      }
    }

    return new Response(JSON.stringify({ url: publicUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Meta Media Proxy] Erro:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
