import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Validar autenticação
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Permitir chamadas internas service-to-service
    if (token !== serviceRoleKey) {
      const supabaseAuth = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json();
    const { conversationId, message, senderName } = body;

    console.log('[machine-send] Enviando resposta:', { conversationId, message: message?.substring(0, 50), senderName });

    if (!conversationId || !message) {
      return new Response(JSON.stringify({ error: 'conversationId e message são obrigatórios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Buscar external_id da conversa
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('external_id, channel')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      return new Response(JSON.stringify({ error: 'Conversa não encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (conversation.channel !== 'machine') {
      return new Response(JSON.stringify({ error: 'Conversa não é do canal Machine' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!conversation.external_id) {
      return new Response(JSON.stringify({ error: 'Conversa sem external_id (id_conversa)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Buscar webhook_config
    const { data: webhookConfig } = await supabase
      .from('webhook_config')
      .select('webhook_url, is_active')
      .eq('is_active', true)
      .maybeSingle();

    if (!webhookConfig?.webhook_url) {
      return new Response(JSON.stringify({ error: 'Webhook Machine não configurado ou inativo' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Enviar para a URL da Machine
    const nomeAtendente = senderName || 'Atendente';
    const payload: Record<string, string> = {
      id_conversa: conversation.external_id,
      mensagem: `${nomeAtendente}:\n${message}`,
    };

    console.log('[machine-send] POST para:', webhookConfig.webhook_url, payload);

    const response = await fetch(webhookConfig.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    console.log('[machine-send] Resposta:', response.status, responseText);

    if (!response.ok) {
      // Tentar parsear resposta como JSON para detalhes
      let parsedDetails: any = null;
      try { parsedDetails = JSON.parse(responseText); } catch {}

      let userMessage = '';
      let errorCode = 'UNKNOWN';

      if (response.status === 400) {
        const lower = responseText.toLowerCase();
        if (lower.includes('senha') || lower.includes('password') || lower.includes('login') || lower.includes('unauthorized') || lower.includes('usuário')) {
          userMessage = 'Usuário ou senha incorretos na Machine. Fale com o administrador da Machine para corrigir.';
          errorCode = 'AUTH_INVALID';
        } else if (lower.includes('permiss') || lower.includes('permission') || lower.includes('forbidden') || lower.includes('acesso')) {
          userMessage = 'Usuário sem permissão na Machine. Fale com o administrador da Machine para liberar o acesso.';
          errorCode = 'AUTH_FORBIDDEN';
        } else if (lower.includes('rate') || lower.includes('limit') || lower.includes('muitas') || lower.includes('too many') || lower.includes('máximo') || lower.includes('maximo') || lower.includes('requisições') || lower.includes('requisicoes')) {
          userMessage = 'Muitas requisições realizadas. Tente enviar novamente em alguns segundos.';
          errorCode = 'RATE_LIMIT';
        } else {
          userMessage = `Erro na Machine (400): ${responseText.substring(0, 200)}`;
          errorCode = 'BAD_REQUEST';
        }
      } else if (response.status === 401 || response.status === 403) {
        userMessage = 'Autenticação ou permissão negada pela Machine. Fale com o administrador.';
        errorCode = response.status === 401 ? 'AUTH_INVALID' : 'AUTH_FORBIDDEN';
      } else if (response.status === 429) {
        userMessage = 'Muitas requisições realizadas. Tente enviar novamente em alguns segundos.';
        errorCode = 'RATE_LIMIT';
      } else {
        userMessage = `Machine retornou erro ${response.status}`;
        errorCode = 'SERVER_ERROR';
      }

      console.error(`[machine-send] Erro [${errorCode}]:`, response.status, responseText);

      return new Response(JSON.stringify({ 
        success: false,
        error: userMessage,
        errorCode,
        statusCode: response.status,
        details: responseText.substring(0, 500),
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[machine-send] Erro:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
