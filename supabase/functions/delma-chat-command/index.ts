import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPORTE_DEPT_ID = "dea51138-49e4-45b0-a491-fb07a5fad479";

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

    if (confirmed && actionId) {
      return await executeAction(supabase, actionId, userId, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LOVABLE_API_KEY);
    }

    // Classify the command
    const classifyPrompt = `Você é a Delma, Gerente de Suporte IA. Classifique o comando do gestor e determine a ação. Responda SEMPRE em formato JSON.

COMANDOS POSSÍVEIS:
1. gerar_relatorio - Gerar relatório de análise (ex: "gera relatório", "como está o suporte")
2. treinar_robo - Treinar robôs com conversas (ex: "treina o Sebastião", "treinar robôs")
3. analisar_conversas - Analisar padrões de conversas humanas (ex: "analisa conversas", "aprender com humanos")
4. analisar_instrucoes - Analisar e sugerir melhorias de instruções (ex: "melhorar instruções", "analisar instruções")
5. consultar_metricas - Consultar dados do suporte (ex: "TMA hoje", "quantas conversas abertas")
6. listar_sugestoes - Listar sugestões pendentes (ex: "sugestões pendentes", "o que tem pra aprovar")
7. status_suporte - Status atual do suporte (ex: "status do suporte", "quem está online")
8. analisar_atendente - Analisar conversas de um atendente específico (ex: "pegue as 10 últimas da Milena", "como está a Milena", "analisa o Wagner", "conversas do Daniel")
9. performance_robo - Performance de um robô específico (ex: "como está o Sebastião", "performance da Júlia", "taxa de transferência do Sebastião")
10. comparar_atendentes - Comparar métricas entre atendentes (ex: "compare os atendentes", "ranking de atendentes", "quem está melhor")
11. alertas_anomalias - Verificar alertas e anomalias ativas (ex: "tem algum problema?", "alertas ativos", "anomalias")
12. conversa_livre - Responder uma pergunta geral sobre o suporte

REGRAS DE CLASSIFICAÇÃO:
- Se o usuário menciona um NOME de pessoa + "conversas/últimas/análise" → analisar_atendente
- Se menciona "Sebastião/Júlia" + "como está/performance/taxa" → performance_robo  
- Se pede "comparar/ranking/quem está melhor" → comparar_atendentes
- Se pede "problema/alerta/anomalia" → alertas_anomalias
- Para analisar_atendente, extraia: agent_name (nome mencionado), num_conversations (número pedido, default 10)

Retorne JSON:
{
  "action": "nome_da_acao",
  "description": "descrição amigável do que será feito",
  "impact": "impacto da ação (se mutação)",
  "requires_confirmation": true/false (true se altera dados),
  "robot_filter": "julia" | "sebastiao" | null,
  "agent_name": "nome do atendente" | null,
  "num_conversations": 10,
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
      console.error("AI API error:", classifyResponse.status, errText);
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

    // Handle direct queries
    if (!requiresConfirmation || action === "conversa_livre") {
      let response = classification.response || "";

      if (action === "consultar_metricas" || action === "status_suporte") {
        response = await handleQuery(supabase, action, message, LOVABLE_API_KEY);
      } else if (action === "listar_sugestoes") {
        response = await handleListSuggestions(supabase);
      } else if (action === "analisar_atendente") {
        response = await handleAnalyzeAgent(supabase, classification.agent_name, classification.num_conversations || 10, LOVABLE_API_KEY);
      } else if (action === "performance_robo") {
        response = await handleRobotPerformance(supabase, classification.robot_filter, LOVABLE_API_KEY);
      } else if (action === "comparar_atendentes") {
        response = await handleCompareAgents(supabase);
      } else if (action === "alertas_anomalias") {
        response = await handleAnomalies(supabase);
      }

      if (userId) {
        await supabase.from("delma_chat_logs").insert({
          user_id: userId, command: message, action_type: action,
          result: "success", result_data: { response: response.substring(0, 500) },
        });
      }

      return new Response(JSON.stringify({ response, requiresConfirmation: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Needs confirmation
    const actionId2 = crypto.randomUUID();
    if (userId) {
      await supabase.from("delma_chat_logs").insert({
        user_id: userId, command: message, action_type: action,
        result: "awaiting_confirmation",
        result_data: { actionId: actionId2, description: classification.description, impact: classification.impact, robot_filter: classification.robot_filter },
      });
    }

    return new Response(JSON.stringify({
      response: `${classification.description || "Ação identificada"}. ${classification.impact || ""}`,
      requiresConfirmation: true, actionId: actionId2, actionType: action, description: classification.description,
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

// ==================== EXECUTE ACTION ====================
async function executeAction(supabase: any, actionId: string, userId: string, supabaseUrl: string, serviceKey: string, lovableKey: string) {
  const { data: logs } = await supabase
    .from("delma_chat_logs").select("*").eq("result", "awaiting_confirmation")
    .order("created_at", { ascending: false }).limit(5);

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
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ period: 7 }),
        });
        const data = await resp.json();
        result = data.aiAnalysis ? `✅ Relatório gerado com sucesso!\n\n${(data.aiAnalysis as string).substring(0, 500)}...` : "✅ Relatório de métricas gerado.";
        break;
      }
      case "treinar_robo": {
        const resp = await fetch(`${supabaseUrl}/functions/v1/brain-train-robots`, {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({}),
        });
        const data = await resp.json();
        result = `✅ ${data.message || "Treinamento concluído!"}`;
        break;
      }
      case "analisar_conversas": {
        const resp = await fetch(`${supabaseUrl}/functions/v1/brain-learn-from-conversations`, {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({}),
        });
        const data = await resp.json();
        result = `✅ ${data.message || "Análise concluída!"}`;
        break;
      }
      case "analisar_instrucoes": {
        const resp = await fetch(`${supabaseUrl}/functions/v1/brain-learn-instruction-patterns`, {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
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

  await supabase.from("delma_chat_logs")
    .update({ result: result.startsWith("✅") ? "success" : "error", result_data: { ...pendingLog.result_data, response: result } })
    .eq("id", pendingLog.id);

  return new Response(JSON.stringify({ response: result, requiresConfirmation: false }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ==================== QUERY HANDLERS ====================
async function handleQuery(supabase: any, action: string, message: string, lovableKey: string): Promise<string> {
  try {
    if (action === "status_suporte") {
      const { data: deptMembers } = await supabase.from("profile_departments").select("profile_id").eq("department_id", SUPORTE_DEPT_ID);
      const memberIds = (deptMembers || []).map((m: any) => m.profile_id);
      if (memberIds.length === 0) return `📊 **Status do Suporte**\n\nNenhum atendente vinculado ao departamento Suporte.`;

      const { data: atendentes } = await supabase.from("user_roles").select("user_id").eq("role", "atendente").in("user_id", memberIds);
      const atendenteIds = (atendentes || []).map((a: any) => a.user_id);
      if (atendenteIds.length === 0) return `📊 **Status do Suporte**\n\nNenhum atendente encontrado no departamento Suporte.`;

      const { data: profiles } = await supabase.from("profiles").select("name, status").in("id", atendenteIds);
      const online = (profiles || []).filter((p: any) => p.status === "online");
      const busy = (profiles || []).filter((p: any) => p.status === "busy");

      const { data: activeConvs } = await supabase.from("conversations").select("id, status")
        .eq("department_id", SUPORTE_DEPT_ID).in("status", ["em_atendimento", "em_fila"]);
      const emAtendimento = (activeConvs || []).filter((c: any) => c.status === "em_atendimento");
      const emFila = (activeConvs || []).filter((c: any) => c.status === "em_fila");

      const today = new Date(); today.setHours(0, 0, 0, 0);
      const { data: todayLogs } = await supabase.from("conversation_logs").select("started_at, finalized_at, wait_time")
        .eq("department_id", SUPORTE_DEPT_ID).gte("finalized_at", today.toISOString()).limit(500);

      const tmas = (todayLogs || []).map((l: any) => {
        const s = new Date(l.started_at).getTime(), e = new Date(l.finalized_at).getTime();
        return (e - s) / 60000;
      }).filter((t: number) => t > 0 && t < 1440);
      const avgTMA = tmas.length > 0 ? Math.round(tmas.reduce((a: number, b: number) => a + b, 0) / tmas.length) : 0;
      const waitTimes = (todayLogs || []).filter((l: any) => l.wait_time != null).map((l: any) => l.wait_time);
      const avgWait = waitTimes.length > 0 ? Math.round(waitTimes.reduce((a: number, b: number) => a + b, 0) / waitTimes.length) : 0;

      return `<div class="delma-card">
<div class="delma-card-header">📊 Status do Suporte — agora</div>
<div class="delma-card-body">
<div class="delma-metric"><span class="delma-metric-value">${emAtendimento.length + emFila.length}</span> conversas ativas</div>
<div class="delma-metric"><span class="delma-metric-value">${online.length}</span> atendentes online: <strong>${online.map((p: any) => p.name).join(", ") || "nenhum"}</strong></div>
<div class="delma-metric"><span class="delma-metric-value">${busy.length}</span> ocupados: ${busy.map((p: any) => p.name).join(", ") || "nenhum"}</div>
<div class="delma-metric"><span class="delma-metric-value">${emFila.length}</span> na fila</div>
<div class="delma-divider"></div>
<div class="delma-metric">TMA: <span class="delma-metric-value">${avgTMA} min</span></div>
<div class="delma-metric">TME: <span class="delma-metric-value">${avgWait} min</span></div>
</div></div>`;
    }

    if (action === "consultar_metricas") {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);

      const { data: todayLogs } = await supabase.from("conversation_logs").select("started_at, finalized_at, wait_time")
        .eq("department_id", SUPORTE_DEPT_ID).gte("finalized_at", today.toISOString()).limit(500);
      const { data: yesterdayLogs } = await supabase.from("conversation_logs").select("started_at, finalized_at, wait_time")
        .eq("department_id", SUPORTE_DEPT_ID).gte("finalized_at", yesterday.toISOString()).lt("finalized_at", today.toISOString()).limit(500);

      const calcTMA = (logs: any[]) => {
        const t = logs.map(l => (new Date(l.finalized_at).getTime() - new Date(l.started_at).getTime()) / 60000).filter(v => v > 0 && v < 1440);
        return t.length > 0 ? Math.round(t.reduce((a, b) => a + b, 0) / t.length) : 0;
      };
      const tmaToday = calcTMA(todayLogs || []);
      const tmaYesterday = calcTMA(yesterdayLogs || []);
      const variation = tmaYesterday > 0 ? Math.round(((tmaToday - tmaYesterday) / tmaYesterday) * 100) : 0;
      const varIcon = variation > 10 ? "🔴" : variation < -10 ? "🟢" : "🟡";
      const varArrow = variation > 0 ? "⬆️" : variation < 0 ? "⬇️" : "➡️";

      return `<div class="delma-card">
<div class="delma-card-header">📊 Métricas — hoje</div>
<div class="delma-card-body">
<div class="delma-metric">Conversas finalizadas: <span class="delma-metric-value">${(todayLogs || []).length}</span></div>
<div class="delma-divider"></div>
<div class="delma-metric">TMA atual: <span class="delma-metric-value">${tmaToday} min</span> ${varArrow}</div>
<div class="delma-metric">TMA ontem: <span class="delma-metric-value">${tmaYesterday} min</span></div>
<div class="delma-metric">Variação: <span class="delma-metric-value">${variation > 0 ? "+" : ""}${variation}%</span> ${varIcon}</div>
</div></div>`;
    }

    return "Dados não disponíveis.";
  } catch (e) {
    console.error("Query error:", e);
    return "Erro ao consultar dados.";
  }
}

// ==================== ANALYZE AGENT ====================
async function handleAnalyzeAgent(supabase: any, agentName: string | null, numConversations: number, lovableKey: string): Promise<string> {
  try {
    if (!agentName) return "⚠️ Não identifiquei o nome do atendente. Pode repetir? Ex: 'analisa as 10 últimas da Milena'";

    // Find agent by name (fuzzy)
    const { data: profiles } = await supabase.from("profiles").select("id, name, status");
    const agent = (profiles || []).find((p: any) => p.name.toLowerCase().includes(agentName.toLowerCase()));
    if (!agent) return `⚠️ Não encontrei nenhum atendente com o nome "${agentName}". Atendentes disponíveis: ${(profiles || []).map((p: any) => p.name).join(", ")}`;

    // Get recent conversation logs for this agent
    const limit = Math.min(numConversations, 50);
    const { data: logs } = await supabase.from("conversation_logs")
      .select("started_at, finalized_at, wait_time, tags, channel, total_messages, contact_name")
      .eq("assigned_to", agent.id).eq("department_id", SUPORTE_DEPT_ID)
      .order("finalized_at", { ascending: false }).limit(limit);

    if (!logs || logs.length === 0) return `⚠️ Não encontrei conversas recentes de **${agent.name}** no departamento Suporte.`;

    // Calculate metrics
    const tmas = logs.map((l: any) => (new Date(l.finalized_at).getTime() - new Date(l.started_at).getTime()) / 60000).filter((t: number) => t > 0 && t < 1440);
    const avgTMA = tmas.length > 0 ? (tmas.reduce((a: number, b: number) => a + b, 0) / tmas.length).toFixed(1) : "0";

    // Count tags
    const tagCounts: Record<string, number> = {};
    logs.forEach((l: any) => (l.tags || []).forEach((t: string) => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
    const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Count channels
    const channelCounts: Record<string, number> = {};
    logs.forEach((l: any) => { const ch = l.channel || "whatsapp"; channelCounts[ch] = (channelCounts[ch] || 0) + 1; });

    // Period
    const oldest = logs[logs.length - 1];
    const newest = logs[0];
    const periodStart = new Date(oldest.finalized_at).toLocaleDateString("pt-BR");
    const periodEnd = new Date(newest.finalized_at).toLocaleDateString("pt-BR");

    // Format with AI
    const dataContext = JSON.stringify({
      agent_name: agent.name,
      agent_status: agent.status,
      num_conversations: logs.length,
      period: `${periodStart} a ${periodEnd}`,
      avg_tma_min: avgTMA,
      top_tags: topTags.map(([tag, count]) => `${tag} (${count})`),
      channels: Object.entries(channelCounts).map(([ch, count]) => `${ch} (${count})`),
      total_messages_avg: Math.round(logs.reduce((a: number, l: any) => a + (l.total_messages || 0), 0) / logs.length),
    });

    const formatResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-5-mini",
        messages: [
          { role: "system", content: `Você é a Delma. Formate os dados do atendente em HTML estruturado. Use EXATAMENTE os dados fornecidos, NÃO invente. Responda SEMPRE em formato JSON com uma chave "html" contendo o HTML.

Use estas classes CSS:
- delma-card, delma-card-header, delma-card-body, delma-metric, delma-metric-value, delma-divider, delma-section-title, delma-tag, delma-tag-green, delma-tag-yellow, delma-tag-red

Template:
<div class="delma-card">
<div class="delma-card-header">📋 {N} últimas conversas — {Nome}</div>
<div class="delma-card-body">
<div class="delma-metric">Período: {periodo}</div>
<div class="delma-metric">TMA médio: <span class="delma-metric-value">{tma} min</span></div>
<div class="delma-metric">Canais: {canais}</div>
<div class="delma-divider"></div>
<div class="delma-section-title">Tags mais frequentes</div>
{tags como delma-tag}
<div class="delma-divider"></div>
<div class="delma-section-title">✅ Pontos positivos</div>
{análise breve baseada nos dados}
<div class="delma-section-title">⚠️ Oportunidades</div>
{análise breve baseada nos dados}
</div></div>` },
          { role: "user", content: `Dados reais do atendente: ${dataContext}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (formatResp.ok) {
      const formatData = await formatResp.json();
      try {
        const parsed = JSON.parse(formatData.choices?.[0]?.message?.content || "{}");
        if (parsed.html) return parsed.html;
      } catch {}
    }

    // Fallback plain text
    return `<div class="delma-card">
<div class="delma-card-header">📋 ${logs.length} últimas conversas — ${agent.name}</div>
<div class="delma-card-body">
<div class="delma-metric">Período: ${periodStart} a ${periodEnd}</div>
<div class="delma-metric">TMA médio: <span class="delma-metric-value">${avgTMA} min</span></div>
<div class="delma-metric">Canais: ${Object.entries(channelCounts).map(([ch, c]) => `${ch} (${c})`).join(" · ")}</div>
<div class="delma-divider"></div>
<div class="delma-section-title">Tags mais frequentes</div>
${topTags.map(([tag, count]) => `<span class="delma-tag">${tag} (${count})</span>`).join(" ")}
</div></div>`;
  } catch (e) {
    console.error("Analyze agent error:", e);
    return "❌ Erro ao analisar atendente.";
  }
}

// ==================== ROBOT PERFORMANCE ====================
async function handleRobotPerformance(supabase: any, robotFilter: string | null, lovableKey: string): Promise<string> {
  try {
    // Find robot
    const { data: robots } = await supabase.from("robots").select("id, name, status, messages_count");
    let robot: any;
    if (robotFilter) {
      robot = robots?.find((r: any) => r.name.toLowerCase().includes(robotFilter.toLowerCase()));
    }
    if (!robot && robots?.length > 0) robot = robots[0];
    if (!robot) return "⚠️ Nenhum robô encontrado.";

    // Get conversations assigned to this robot (last 7 days)
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const twoWeeksAgo = new Date(); twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const { data: thisWeek } = await supabase.from("conversation_logs")
      .select("started_at, finalized_at, tags, total_messages")
      .gte("finalized_at", weekAgo.toISOString()).limit(500);

    // Filter by robot — check if assigned_to_robot column exists or check messages for robot name
    const { data: robotConvs } = await supabase.from("conversations")
      .select("id, status, assigned_to_robot")
      .eq("assigned_to_robot", robot.id).limit(100);

    // Count transfers from this robot
    const { data: transfers } = await supabase.from("transfer_logs")
      .select("id, reason").gte("created_at", weekAgo.toISOString()).limit(500);

    // Active conversations
    const { data: activeRobotConvs } = await supabase.from("conversations")
      .select("id, status").eq("assigned_to_robot", robot.id).in("status", ["em_atendimento", "em_fila"]);

    const totalActive = (activeRobotConvs || []).length;
    const totalConvs = (robotConvs || []).length;

    // Transfer reasons (gaps)
    const reasonCounts: Record<string, number> = {};
    (transfers || []).forEach((t: any) => {
      if (t.reason) { reasonCounts[t.reason] = (reasonCounts[t.reason] || 0) + 1; }
    });
    const topReasons = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const robotEmoji = robot.name.toLowerCase().includes("sebast") ? "🛵" : "🏪";

    return `<div class="delma-card">
<div class="delma-card-header">${robotEmoji} ${robot.name} — últimos 7 dias</div>
<div class="delma-card-body">
<div class="delma-metric">Status: <span class="delma-tag ${robot.status === 'active' ? 'delma-tag-green' : 'delma-tag-yellow'}">${robot.status === 'active' ? '🟢 Ativo' : '🟡 Pausado'}</span></div>
<div class="delma-metric">Conversas no período: <span class="delma-metric-value">${totalConvs}</span></div>
<div class="delma-metric">Ativas agora: <span class="delma-metric-value">${totalActive}</span></div>
<div class="delma-metric">Total de mensagens: <span class="delma-metric-value">${robot.messages_count || 0}</span></div>
${topReasons.length > 0 ? `<div class="delma-divider"></div>
<div class="delma-section-title">Top motivos de transferência</div>
${topReasons.map(([reason, count], i) => `<div class="delma-metric">${i + 1}. ${reason} — <span class="delma-metric-value">${count}x</span></div>`).join("\n")}` : ""}
</div>
<div class="delma-card-actions">
<button class="delma-action-btn" data-delma-action="treinar_${robot.name.toLowerCase().replace(/[^a-z]/g, '')}">🤖 Treinar agora</button>
<button class="delma-action-btn" data-delma-action="sugestoes_pendentes">📋 Ver sugestões</button>
</div></div>`;
  } catch (e) {
    console.error("Robot performance error:", e);
    return "❌ Erro ao consultar performance do robô.";
  }
}

// ==================== COMPARE AGENTS ====================
async function handleCompareAgents(supabase: any): Promise<string> {
  try {
    // Get support agents
    const { data: deptMembers } = await supabase.from("profile_departments").select("profile_id").eq("department_id", SUPORTE_DEPT_ID);
    const memberIds = (deptMembers || []).map((m: any) => m.profile_id);
    if (memberIds.length === 0) return "⚠️ Nenhum atendente no departamento Suporte.";

    const { data: atendentes } = await supabase.from("user_roles").select("user_id").eq("role", "atendente").in("user_id", memberIds);
    const atendenteIds = (atendentes || []).map((a: any) => a.user_id);

    const { data: profiles } = await supabase.from("profiles").select("id, name").in("id", atendenteIds);

    // Get this week's logs
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const { data: logs } = await supabase.from("conversation_logs")
      .select("assigned_to, started_at, finalized_at, wait_time, total_messages")
      .eq("department_id", SUPORTE_DEPT_ID).gte("finalized_at", weekAgo.toISOString())
      .in("assigned_to", atendenteIds).limit(1000);

    // Calculate per agent
    const agentStats: any[] = [];
    for (const profile of (profiles || [])) {
      const agentLogs = (logs || []).filter((l: any) => l.assigned_to === profile.id);
      const convCount = agentLogs.length;
      const tmas = agentLogs.map((l: any) => (new Date(l.finalized_at).getTime() - new Date(l.started_at).getTime()) / 60000).filter((t: number) => t > 0 && t < 1440);
      const avgTMA = tmas.length > 0 ? (tmas.reduce((a: number, b: number) => a + b, 0) / tmas.length) : 0;

      agentStats.push({
        name: profile.name,
        conversations: convCount,
        tma: avgTMA,
      });
    }

    // Sort by conversations desc
    agentStats.sort((a, b) => b.conversations - a.conversations);

    // Calculate team average TMA
    const allTMAs = agentStats.filter(a => a.conversations > 0).map(a => a.tma);
    const teamAvgTMA = allTMAs.length > 0 ? allTMAs.reduce((a, b) => a + b, 0) / allTMAs.length : 0;

    const medals = ["🥇", "🥈", "🥉"];
    const rows = agentStats.map((a, i) => {
      const medal = i < 3 ? medals[i] : "  ";
      const tmaFormatted = `${Math.floor(a.tma)}:${String(Math.round((a.tma % 1) * 60)).padStart(2, "0")}`;
      const tmaClass = a.tma > teamAvgTMA * 1.5 ? "delma-tag-red" : a.tma > teamAvgTMA * 1.2 ? "delma-tag-yellow" : "";
      return `<tr>
<td>${medal} ${a.name}</td>
<td>${a.conversations}</td>
<td class="${tmaClass}">${tmaFormatted}</td>
</tr>`;
    }).join("\n");

    // Find outliers
    const warnings = agentStats.filter(a => a.conversations > 0 && a.tma > teamAvgTMA * 1.5)
      .map(a => `⚠️ <strong>${a.name}</strong> com TMA ${(a.tma / teamAvgTMA).toFixed(1)}x acima da média`);

    return `<div class="delma-card">
<div class="delma-card-header">📊 Comparativo — últimos 7 dias</div>
<div class="delma-card-body">
<table class="delma-table">
<thead><tr><th>Atendente</th><th>Conv</th><th>TMA</th></tr></thead>
<tbody>${rows}</tbody>
</table>
${warnings.length > 0 ? `<div class="delma-divider"></div>${warnings.join("<br/>")}` : ""}
</div></div>`;
  } catch (e) {
    console.error("Compare agents error:", e);
    return "❌ Erro ao comparar atendentes.";
  }
}

// ==================== ANOMALIES ====================
async function handleAnomalies(supabase: any): Promise<string> {
  try {
    const { data: anomalies } = await supabase.from("delma_anomalies")
      .select("*").is("resolved_at", null).order("detected_at", { ascending: false }).limit(20);

    if (!anomalies || anomalies.length === 0) {
      return `<div class="delma-card">
<div class="delma-card-header">⚡ Alertas Ativos</div>
<div class="delma-card-body">
<div class="delma-metric">✅ Nenhum alerta ativo no momento. Tudo operando normalmente.</div>
</div></div>`;
    }

    const items = anomalies.map((a: any) => {
      const severityIcon = a.severity === "red" ? "🔴 CRÍTICO" : "🟡 ATENÇÃO";
      const severityClass = a.severity === "red" ? "delma-tag-red" : "delma-tag-yellow";
      const timeAgo = Math.round((Date.now() - new Date(a.detected_at).getTime()) / 60000);
      const timeStr = timeAgo < 60 ? `há ${timeAgo}min` : `há ${Math.round(timeAgo / 60)}h`;

      return `<div class="delma-alert ${severityClass}">
<div><span class="delma-tag ${severityClass}">${severityIcon}</span> · ${timeStr}</div>
<div>${a.description}</div>
</div>`;
    }).join("\n");

    return `<div class="delma-card">
<div class="delma-card-header">⚡ Alertas Ativos — ${anomalies.length} encontrado(s)</div>
<div class="delma-card-body">${items}</div></div>`;
  } catch (e) {
    console.error("Anomalies error:", e);
    return "❌ Erro ao consultar anomalias.";
  }
}

// ==================== LIST SUGGESTIONS ====================
async function handleListSuggestions(supabase: any): Promise<string> {
  try {
    const { data: delmaSuggestions } = await supabase.from("delma_suggestions")
      .select("category, title").eq("status", "pending").neq("category", "report_schedule").limit(20);
    const { data: trainingSuggestions } = await supabase.from("robot_training_suggestions")
      .select("robot_name, title").eq("status", "pending").limit(20);

    const delmaCount = (delmaSuggestions || []).length;
    const trainingCount = (trainingSuggestions || []).length;

    if (delmaCount === 0 && trainingCount === 0) {
      return `<div class="delma-card">
<div class="delma-card-header">📋 Sugestões Pendentes</div>
<div class="delma-card-body"><div class="delma-metric">✅ Nenhuma sugestão pendente.</div></div></div>`;
    }

    let items = "";
    if (delmaCount > 0) {
      items += `<div class="delma-section-title">Delma (${delmaCount})</div>`;
      for (const s of (delmaSuggestions || []).slice(0, 5)) {
        items += `<div class="delma-metric">• ${s.title} <span class="delma-tag">${s.category}</span></div>`;
      }
    }
    if (trainingCount > 0) {
      items += `<div class="delma-section-title">Treinamento (${trainingCount})</div>`;
      for (const s of (trainingSuggestions || []).slice(0, 5)) {
        items += `<div class="delma-metric">• ${s.title} <span class="delma-tag">${s.robot_name}</span></div>`;
      }
    }

    return `<div class="delma-card">
<div class="delma-card-header">📋 Sugestões Pendentes — ${delmaCount + trainingCount} total</div>
<div class="delma-card-body">${items}</div></div>`;
  } catch {
    return "Erro ao listar sugestões.";
  }
}
