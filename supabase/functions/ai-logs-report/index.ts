import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPORTE_DEPARTMENT_ID = "dea51138-49e4-45b0-a491-fb07a5fad479";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { period, agentName } = await req.json();
    
    if (![7, 15, 30].includes(period)) {
      return new Response(JSON.stringify({ error: "Período inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - period);

    let query = supabase
      .from("conversation_logs")
      .select("contact_name, contact_notes, assigned_to_name, tags, messages, finalized_at, total_messages, channel")
      .eq("department_id", SUPORTE_DEPARTMENT_ID)
      .is("finalized_by", null)
      .gte("finalized_at", sinceDate.toISOString())
      .order("finalized_at", { ascending: false })
      .limit(500);

    if (agentName && agentName !== "all") {
      query = query.eq("assigned_to_name", agentName);
    }

    const { data: logs, error } = await query;
    if (error) throw error;

    if (!logs || logs.length === 0) {
      return new Response(JSON.stringify({ report: "## Nenhuma conversa encontrada\n\nNão foram encontradas conversas de IA no período selecionado." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build conversation summaries for AI analysis
    const conversationSummaries = logs.map((log: any) => {
      const msgs = Array.isArray(log.messages) ? log.messages : [];
      // Get first 3 customer messages and first 3 bot responses
      const customerMsgs = msgs
        .filter((m: any) => !m.sender_id && m.content && m.message_type !== 'system')
        .slice(0, 3)
        .map((m: any) => m.content)
        .join(" | ");
      const botMsgs = msgs
        .filter((m: any) => m.sender_id && m.content && m.message_type !== 'system')
        .slice(0, 3)
        .map((m: any) => m.content)
        .join(" | ");
      
      const isMotoboy = log.contact_notes?.includes("franqueado:") || false;
      const tags = log.tags?.join(", ") || "";
      
      return `[Tipo: ${isMotoboy ? "Motoboy/Estabelecimento" : "Cliente"}] [Tags: ${tags}] [IA: ${log.assigned_to_name || "N/A"}]\nCliente: ${customerMsgs.slice(0, 300)}\nIA: ${botMsgs.slice(0, 300)}`;
    }).join("\n---\n");

    const agentLabel = agentName && agentName !== "all" ? agentName : "Todas as IAs";
    
    const prompt = `Você é um analista de suporte. Analise as ${logs.length} conversas de atendimento por IA abaixo (período: últimos ${period} dias, atendente IA: ${agentLabel}).

Gere um relatório em markdown com:

## 📊 Resumo Geral
- Total de conversas analisadas
- Período analisado
- IA atendente filtrada

## 🔍 Principais Motivos de Contato
Liste os TOP 10 motivos/causas mais frequentes que levaram clientes (motoboys e estabelecimentos) a entrar em contato, com a quantidade aproximada de ocorrências e porcentagem.

## ✅ Principais Soluções/Respostas
Para cada motivo listado acima, descreva a solução ou resposta mais comum dada pela IA para resolver aquele problema.

## ⚠️ Pontos de Atenção
Liste situações onde a IA pode ter tido dificuldade, não soube responder, ou onde seria necessário melhorar o conhecimento.

## 📈 Recomendações
Sugira melhorias baseadas nos padrões identificados.

Conversas:
${conversationSummaries}`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você é um analista de dados de suporte técnico. Responda sempre em português brasileiro. Gere relatórios claros e objetivos em markdown." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errorText);
      throw new Error("Erro ao gerar relatório com IA");
    }

    const aiData = await aiResponse.json();
    const report = aiData.choices?.[0]?.message?.content || "Erro ao gerar relatório.";

    return new Response(JSON.stringify({ report, totalLogs: logs.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-logs-report error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
