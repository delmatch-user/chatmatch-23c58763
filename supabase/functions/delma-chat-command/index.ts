import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
     const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { message, sessionHistory, confirmed, actionId, userId } = await req.json();
    if (!message && !confirmed) {
      return new Response(JSON.stringify({ error: "message is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If confirming an action
    if (confirmed && actionId) {
      return await executeAction(supabase, actionId, userId, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LOVABLE_API_KEY);
    }

    // Classify the command using AI
    const classifyPrompt = `Você é a Delma, Gerente de Suporte IA. Classifique o comando do gestor e determine a ação.

COMANDOS POSSÍVEIS:
1. gerar_relatorio - Gerar relatório de análise (ex: "gera relatório", "como está o suporte")
2. treinar_robo - Treinar robôs com conversas (ex: "treina o Sebastião", "treinar robôs")
3. analisar_conversas - Analisar padrões de conversas humanas (ex: "analisa conversas", "aprender com humanos")
4. analisar_instrucoes - Analisar e sugerir melhorias de instruções (ex: "melhorar instruções", "analisar instruções")
5. consultar_metricas - Consultar dados do suporte (ex: "TMA hoje", "quantas conversas abertas")
6. listar_sugestoes - Listar sugestões pendentes (ex: "sugestões pendentes", "o que tem pra aprovar")
7. status_suporte - Status atual do suporte (ex: "status do suporte", "quem está online")
8. conversa_livre - Responder uma pergunta geral sobre o suporte

Para cada comando, retorne:
{
  "action": "nome_da_acao",
  "description": "descrição amigável do que será feito",
  "impact": "impacto da ação (se mutação)",
  "requires_confirmation": true/false (true se altera dados),
  "robot_filter": "julia" | "sebastiao" | null,
  "response": "resposta direta (se consulta sem mutação)"
}`;

    const classifyResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5",
        messages: [
          { role: "system", content: classifyPrompt },
          ...(sessionHistory || []).slice(-6).map((m: any) => ({ role: m.role, content: m.content })),
          { role: "user", content: message },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!classifyResponse.ok) {
      const errText = await classifyResponse.text();
      console.error("OpenAI API error:", classifyResponse.status, errText);
      throw new Error(`AI classification failed: ${classifyResponse.status}`);
    }
    const classifyData = await classifyResponse.json();
    let classification: any;
    try {
      classification = JSON.parse(classifyData.choices?.[0]?.message?.content || "{}");
    } catch {
      classification = { action: "conversa_livre", requires_confirmation: false, response: "Não entendi o comando. Pode reformular?" };
    }

    const action = classification.action || "conversa_livre";
    const requiresConfirmation = classification.requires_confirmation === true;

    // Handle direct queries (no confirmation needed)
    if (!requiresConfirmation || action === "conversa_livre") {
      let response = classification.response || "";

      if (action === "consultar_metricas" || action === "status_suporte") {
        response = await handleQuery(supabase, action, message, LOVABLE_API_KEY);
      } else if (action === "listar_sugestoes") {
        response = await handleListSuggestions(supabase);
      }

      // Log the command
      if (userId) {
        await supabase.from("delma_chat_logs").insert({
          user_id: userId,
          command: message,
          action_type: action,
          result: "success",
          result_data: { response },
        });
      }

      return new Response(JSON.stringify({
        response,
        requiresConfirmation: false,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Needs confirmation
    const actionId2 = crypto.randomUUID();
    // Store pending action temporarily
    if (userId) {
      await supabase.from("delma_chat_logs").insert({
        user_id: userId,
        command: message,
        action_type: action,
        result: "awaiting_confirmation",
        result_data: {
          actionId: actionId2,
          description: classification.description,
          impact: classification.impact,
          robot_filter: classification.robot_filter,
        },
      });
    }

    return new Response(JSON.stringify({
      response: `${classification.description || "Ação identificada"}. ${classification.impact || ""}`,
      requiresConfirmation: true,
      actionId: actionId2,
      actionType: action,
      description: classification.description,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("delma-chat-command error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function executeAction(supabase: any, actionId: string, userId: string, supabaseUrl: string, serviceKey: string, lovableKey: string) {
  // Find the pending action
  const { data: logs } = await supabase
    .from("delma_chat_logs")
    .select("*")
    .eq("result", "awaiting_confirmation")
    .order("created_at", { ascending: false })
    .limit(5);

  const pendingLog = (logs || []).find((l: any) => l.result_data?.actionId === actionId);
  if (!pendingLog) {
    return new Response(JSON.stringify({ response: "❌ Ação não encontrada ou já expirou.", requiresConfirmation: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const action = pendingLog.action_type;
  let result = "";

  try {
    switch (action) {
      case "gerar_relatorio": {
        const resp = await fetch(`${supabaseUrl}/functions/v1/brain-analysis`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ period: 7 }),
        });
        const data = await resp.json();
        result = data.aiAnalysis ? `✅ Relatório gerado com sucesso!\n\n${(data.aiAnalysis as string).substring(0, 500)}...` : "✅ Relatório de métricas gerado.";
        break;
      }
      case "treinar_robo": {
        const resp = await fetch(`${supabaseUrl}/functions/v1/brain-train-robots`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({}),
        });
        const data = await resp.json();
        result = `✅ ${data.message || "Treinamento concluído!"}`;
        break;
      }
      case "analisar_conversas": {
        const resp = await fetch(`${supabaseUrl}/functions/v1/brain-learn-from-conversations`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({}),
        });
        const data = await resp.json();
        result = `✅ ${data.message || "Análise concluída!"}`;
        break;
      }
      case "analisar_instrucoes": {
        const resp = await fetch(`${supabaseUrl}/functions/v1/brain-learn-instruction-patterns`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({}),
        });
        const data = await resp.json();
        result = `✅ ${data.message || "Análise de instruções concluída!"}`;
        break;
      }
      default:
        result = "❌ Ação não reconhecida.";
    }
  } catch (e) {
    result = `❌ Erro ao executar: ${e instanceof Error ? e.message : "erro desconhecido"}`;
  }

  // Update log
  await supabase.from("delma_chat_logs")
    .update({ result: result.startsWith("✅") ? "success" : "error", result_data: { ...pendingLog.result_data, response: result } })
    .eq("id", pendingLog.id);

  return new Response(JSON.stringify({ response: result, requiresConfirmation: false }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleQuery(supabase: any, action: string, message: string, lovableKey: string): Promise<string> {
  try {
    if (action === "status_suporte") {
      const { data: activeConvs } = await supabase
        .from("conversations")
        .select("id", { count: "exact" })
        .in("status", ["em_atendimento", "em_fila", "pendente"]);

      const { data: onlineProfiles } = await supabase
        .from("profiles")
        .select("name, status")
        .in("status", ["online", "busy"]);

      const activeCount = activeConvs?.length || 0;
      const online = (onlineProfiles || []).filter((p: any) => p.status === "online");
      const busy = (onlineProfiles || []).filter((p: any) => p.status === "busy");

      return `📊 **Status do Suporte**\n\n` +
        `• **${activeCount}** conversas ativas\n` +
        `• **${online.length}** atendentes online: ${online.map((p: any) => p.name).join(", ") || "nenhum"}\n` +
        `• **${busy.length}** ocupados: ${busy.map((p: any) => p.name).join(", ") || "nenhum"}`;
    }

    if (action === "consultar_metricas") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data: todayLogs } = await supabase
        .from("conversation_logs")
        .select("started_at, finalized_at, wait_time")
        .gte("finalized_at", today.toISOString())
        .limit(500);

      const count = (todayLogs || []).length;
      const tmas = (todayLogs || []).map((l: any) => {
        const start = new Date(l.started_at).getTime();
        const end = new Date(l.finalized_at).getTime();
        return (end - start) / 60000;
      }).filter((t: number) => t > 0 && t < 1440);
      const avgTMA = tmas.length > 0 ? Math.round(tmas.reduce((a: number, b: number) => a + b, 0) / tmas.length) : 0;
      const avgTME = (todayLogs || []).filter((l: any) => l.wait_time).map((l: any) => l.wait_time);
      const avgWait = avgTME.length > 0 ? Math.round(avgTME.reduce((a: number, b: number) => a + b, 0) / avgTME.length) : 0;

      return `📊 **Métricas de Hoje**\n\n` +
        `• **${count}** conversas finalizadas\n` +
        `• **TMA**: ${avgTMA} min\n` +
        `• **TME**: ${avgWait} min`;
    }

    return "Dados não disponíveis.";
  } catch (e) {
    console.error("Query error:", e);
    return "Erro ao consultar dados.";
  }
}

async function handleListSuggestions(supabase: any): Promise<string> {
  try {
    const { data: delmaSuggestions } = await supabase
      .from("delma_suggestions")
      .select("category, title")
      .eq("status", "pending")
      .neq("category", "report_schedule")
      .limit(20);

    const { data: trainingSuggestions } = await supabase
      .from("robot_training_suggestions")
      .select("robot_name, title")
      .eq("status", "pending")
      .limit(20);

    const delmaCount = (delmaSuggestions || []).length;
    const trainingCount = (trainingSuggestions || []).length;

    let response = `📋 **Sugestões Pendentes**\n\n`;
    response += `• **${delmaCount}** sugestões da Delma\n`;
    response += `• **${trainingCount}** sugestões de treinamento\n\n`;

    if (delmaCount > 0) {
      response += `**Delma:**\n`;
      for (const s of (delmaSuggestions || []).slice(0, 5)) {
        response += `  - ${s.title} (${s.category})\n`;
      }
    }
    if (trainingCount > 0) {
      response += `\n**Treinamento:**\n`;
      for (const s of (trainingSuggestions || []).slice(0, 5)) {
        response += `  - ${s.title} (${s.robot_name})\n`;
      }
    }

    return response;
  } catch {
    return "Erro ao listar sugestões.";
  }
}
