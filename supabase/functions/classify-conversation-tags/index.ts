import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SUPORTE_DEPARTMENT_ID = 'dea51138-49e4-45b0-a491-fb07a5fad479';

const TAXONOMY_TAGS = [
  'Acidente - Urgente',
  'Operacional - Pendente',
  'Financeiro - Normal',
  'Duvida - Geral',
  'Comercial - B2B',
];

const TAG_TO_PRIORITY: Record<string, string> = {
  'Acidente - Urgente': 'urgent',
  'Operacional - Pendente': 'high',
  'Financeiro - Normal': 'normal',
  'Duvida - Geral': 'normal',
  'Comercial - B2B': 'normal',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { logIds, batchSize } = await req.json().catch(() => ({}));
    const limit = batchSize || 50;

    let logsToClassify: any[] = [];

    if (logIds && logIds.length > 0) {
      const { data, error } = await supabase
        .from('conversation_logs')
        .select('id, messages, tags, contact_name')
        .in('id', logIds);

      if (error) throw error;
      logsToClassify = data || [];
    } else {
      // Fetch logs that don't have any taxonomy tag yet
      // We need to fetch more and filter client-side since Supabase doesn't support NOT array overlap
      const { data, error } = await supabase
        .from('conversation_logs')
        .select('id, messages, tags, contact_name')
        .eq('department_id', SUPORTE_DEPARTMENT_ID)
        .not('finalized_by', 'is', null)
        .order('finalized_at', { ascending: false })
        .limit(500); // Fetch more to find untagged ones

      if (error) throw error;

      // Filter out logs that already have a taxonomy tag, then take the limit
      logsToClassify = (data || []).filter(log => {
        const tags = log.tags || [];
        return !tags.some((t: string) => TAXONOMY_TAGS.includes(t));
      }).slice(0, limit);
    }

    if (logsToClassify.length === 0) {
      return new Response(JSON.stringify({ classified: 0, message: 'No logs to classify' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Classifying ${logsToClassify.length} conversation logs...`);

    const BATCH_SIZE = 5;
    let classified = 0;

    for (let i = 0; i < logsToClassify.length; i += BATCH_SIZE) {
      const batch = logsToClassify.slice(i, i + BATCH_SIZE);

      const conversationsText = batch.map((log: any, idx: number) => {
        const messages = Array.isArray(log.messages) ? log.messages : [];
        const relevantMessages = messages.slice(0, 15).map((m: any) => {
          const sender = m.senderName || m.sender_name || 'Desconhecido';
          const content = (m.content || '').substring(0, 200);
          return `${sender}: ${content}`;
        }).join('\n');

        return `--- CONVERSA ${idx + 1} (ID: ${log.id}) ---\nCliente: ${log.contact_name}\n${relevantMessages}`;
      }).join('\n\n');

      const systemPrompt = `Você é um classificador de conversas de atendimento ao cliente de uma empresa de delivery/logística.
Classifique cada conversa em EXATAMENTE UMA das seguintes categorias:

1. "Acidente - Urgente" - Acidentes com motoboys, situações de emergência, problemas graves de segurança
2. "Operacional - Pendente" - Problemas operacionais: entregas atrasadas, pedidos incorretos, problemas técnicos com app/sistema, suporte operacional
3. "Financeiro - Normal" - Assuntos financeiros: pagamentos, cobranças, reembolsos, notas fiscais, valores
4. "Duvida - Geral" - Dúvidas gerais, informações, como funciona, cadastro, perguntas simples
5. "Comercial - B2B" - Assuntos comerciais B2B: parcerias, novos estabelecimentos, propostas comerciais, negociações

Responda APENAS com um JSON array onde cada item tem "id" (o ID da conversa) e "tag" (uma das 5 categorias acima, exatamente como escrita).
Exemplo: [{"id":"abc","tag":"Duvida - Geral"}]`;

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-lite',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Classifique as seguintes conversas:\n\n${conversationsText}` },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "classify_conversations",
                description: "Classify conversations into taxonomy tags",
                parameters: {
                  type: "object",
                  properties: {
                    classifications: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          tag: { type: "string", enum: TAXONOMY_TAGS },
                        },
                        required: ["id", "tag"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["classifications"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "classify_conversations" } },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('AI Gateway error:', response.status, errorText);
        if (response.status === 429) {
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }
        continue;
      }

      const data = await response.json();
      let classifications: { id: string; tag: string }[] = [];

      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        try {
          const parsed = JSON.parse(toolCall.function.arguments);
          classifications = parsed.classifications || parsed;
        } catch {
          console.error('Failed to parse tool call arguments');
          continue;
        }
      }

      for (const cls of classifications) {
        if (!TAXONOMY_TAGS.includes(cls.tag)) continue;

        const log = batch.find((l: any) => l.id === cls.id);
        if (!log) continue;

        const existingTags = (log.tags || []).filter((t: string) => !TAXONOMY_TAGS.includes(t));
        const newTags = [...existingTags, cls.tag];
        const newPriority = TAG_TO_PRIORITY[cls.tag] || 'normal';

        const { error: updateError } = await supabase
          .from('conversation_logs')
          .update({ tags: newTags, priority: newPriority })
          .eq('id', cls.id);

        if (updateError) {
          console.error(`Error updating log ${cls.id}:`, updateError);
        } else {
          classified++;
        }
      }

      if (i + BATCH_SIZE < logsToClassify.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    console.log(`Successfully classified ${classified} logs`);

    return new Response(JSON.stringify({ classified, total: logsToClassify.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in classify-conversation-tags:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
