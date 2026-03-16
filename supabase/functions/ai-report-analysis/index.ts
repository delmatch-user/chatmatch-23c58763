import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { period } = await req.json();
    const days = [7, 15, 30].includes(period) ? period : 30;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const formatDateBR = (d: Date) => {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    };
    const startFormatted = formatDateBR(startDate);
    const endFormatted = formatDateBR(endDate);

    console.log(`AI Report: Fetching support logs from ${startFormatted} to ${endFormatted}...`);

    // Fetch support department logs
    const { data: depts } = await supabase
      .from('departments')
      .select('id')
      .ilike('name', '%suporte%')
      .limit(1);

    const supportDeptId = depts?.[0]?.id;
    if (!supportDeptId) {
      return new Response(JSON.stringify({ error: 'Departamento Suporte não encontrado' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Use service role to bypass RLS for full log access
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: logs, error: logsError } = await supabaseAdmin
      .from('conversation_logs')
      .select('contact_name, messages, tags, finalized_at')
      .eq('department_id', supportDeptId)
      .gte('finalized_at', startDate.toISOString())
      .order('finalized_at', { ascending: false })
      .limit(1000);

    if (logsError) {
      console.error('Error fetching logs:', logsError);
      throw new Error('Erro ao buscar logs');
    }

    if (!logs || logs.length === 0) {
      return new Response(JSON.stringify({ 
        report: `## Nenhuma conversa encontrada\n\nNão há conversas do Suporte no período de ${startFormatted} a ${endFormatted}.` 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Found ${logs.length} support conversations`);

    // Build conversation summaries for the prompt
    const summaries = logs.map((log, i) => {
      const msgs = Array.isArray(log.messages) ? log.messages : [];
      const selected = msgs.length <= 5 
        ? msgs 
        : [...msgs.slice(0, 3), ...msgs.slice(-2)];
      
      const msgTexts = selected.map((m: any) => {
        const sender = m.sender_name || 'Desconhecido';
        const content = (m.content || '').substring(0, 200);
        return `${sender}: ${content}`;
      }).join(' | ');

      const tags = (log.tags || []).join(', ');
      return `[${i + 1}] Cliente: ${log.contact_name}${tags ? ` | Tags: ${tags}` : ''} | ${msgTexts}`;
    }).join('\n');

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const systemPrompt = `Você é um analista de suporte especializado. Analise as conversas de atendimento fornecidas e gere um relatório estruturado em português brasileiro.

O relatório DEVE começar com o período exato analisado no formato: "Período: de DD/MM/YYYY a DD/MM/YYYY".

O relatório deve conter:

1. **📊 Resumo Geral**: Quantidade total de conversas analisadas e período exato (datas)
2. **🔝 Top Motivos de Contato**: Lista rankeada dos principais motivos pelos quais os clientes entram em contato, com:
   - Nome do motivo
   - Quantidade estimada de conversas
   - Percentual aproximado
3. **📈 Tendências e Padrões**: Observações sobre padrões recorrentes
4. **💡 Sugestões de Melhoria**: 3-5 sugestões práticas para reduzir o volume de chamados com base nos motivos identificados
5. **⚠️ Alertas**: Problemas críticos ou urgentes identificados nas conversas

Seja objetivo e use dados concretos. Formate em markdown.`;

    const userPrompt = `Analise as seguintes ${logs.length} conversas do departamento de Suporte no período de ${startFormatted} a ${endFormatted} (últimos ${days} dias) e identifique os principais motivos de contato:\n\n${summaries}`;

    console.log('Calling Lovable AI Gateway...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Limite de requisições excedido. Aguarde alguns segundos e tente novamente.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Créditos insuficientes no Lovable AI.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      throw new Error('Erro ao gerar relatório via IA');
    }

    const data = await response.json();
    const report = data.choices?.[0]?.message?.content || 'Não foi possível gerar o relatório.';

    console.log('AI report generated successfully');

    return new Response(JSON.stringify({ report, totalConversations: logs.length, periodStart: startFormatted, periodEnd: endFormatted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in ai-report-analysis:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
