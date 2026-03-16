import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

const PROMPTS: Record<string, string> = {
  advanced: `Você é um assistente especializado em gerar resumos de conversas de atendimento ao cliente.
Analise a conversa fornecida e gere um resumo estruturado em português brasileiro.

O resumo deve conter:
1. **Resumo Geral**: Uma breve descrição do que foi discutido (2-3 frases)
2. **Principais Tópicos**: Lista dos principais assuntos abordados
3. **Solução/Resultado**: Como a conversa foi resolvida ou qual foi o desfecho
4. **Sentimento do Cliente**: Avalie o tom geral do cliente (satisfeito, neutro, insatisfeito)

Seja conciso e objetivo. Use markdown para formatação.`,

  basic: `Você é um assistente que gera resumos extremamente objetivos de conversas de atendimento.
Resuma a conversa em 1 a 3 frases diretas em um único texto corrido, sem listas, sem tópicos, sem formatação elaborada.
Inclua apenas: qual foi o problema, o que foi feito e qual o resultado.
Seja direto ao ponto, sem enrolação. Português brasileiro.`,

  financial: `Você é um assistente especializado em extrair dados financeiros de conversas de atendimento.
Analise a conversa e extraia as seguintes informações em português brasileiro:

1. **Nome Completo do Cliente**: Extraia o nome completo mencionado na conversa
2. **CPF**: Extraia o CPF se mencionado (com ou sem formatação)
3. **Assunto Financeiro**: Descreva o assunto principal relacionado ao financeiro
4. **O que precisa ser corrigido/ajustado**: Detalhe o que o cliente solicita que seja corrigido ou ajustado

Se algum dado não for encontrado na conversa, indique como "Não informado".
Use markdown para formatação.`,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - No valid authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    
    if (userError || !userData?.user) {
      console.error('JWT validation failed:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = userData.user.id;
    console.log(`Conversation Summary - Authenticated user: ${userId}`);

    const { messages, contactName, summaryType } = await req.json();
    const type = (summaryType && PROMPTS[summaryType]) ? summaryType : 'advanced';
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const formattedMessages = messages.map((msg: any) => {
      const sender = msg.sender_name || msg.senderName || 'Desconhecido';
      const content = msg.content || '';
      return `${sender}: ${content}`;
    }).join('\n');

    const systemPrompt = PROMPTS[type];

    const userPrompt = `Gere um resumo da seguinte conversa com o cliente "${contactName}":

${formattedMessages}`;

    console.log(`Calling Lovable AI Gateway for ${type} summary...`);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Limite de requisições excedido. Aguarde alguns segundos.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Créditos insuficientes no Lovable AI.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await response.text();
      console.error('Lovable AI Gateway error:', response.status, errorText);
      throw new Error('Erro ao gerar resumo');
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content || 'Não foi possível gerar o resumo.';

    console.log(`${type} summary generated successfully`);

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in conversation-summary:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro interno';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
