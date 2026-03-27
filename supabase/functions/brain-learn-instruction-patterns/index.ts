import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function anonymize(text: string): string {
  if (!text) return text;
  return text
    .replace(/\b\d{2}[\s.-]?\d{4,5}[\s.-]?\d{4}\b/g, "[TELEFONE]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[EMAIL]")
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, "[CPF]");
}

function getRobotScope(name: string): "estabelecimento" | "motoboy" | "skip" {
  const lower = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (lower.includes("delma")) return "skip";
  if (lower.includes("sdr") || lower.includes("arthur")) return "skip";
  if (lower.includes("julia")) return "estabelecimento";
  if (lower.includes("sebastiao")) return "motoboy";
  return "skip";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ========== DIAGNOSTICS ==========
    const diagnostics: any = {};

    // 1. Get Suporte department
    const { data: suporteDept } = await supabase
      .from("departments").select("id").ilike("name", "%suporte%").maybeSingle();
    const suporteDeptId = suporteDept?.id;

    // 2. Get Suporte member IDs for filtering
    let suporteMemberIds: string[] = [];
    if (suporteDeptId) {
      const { data: memberLinks } = await supabase
        .from("profile_departments").select("profile_id").eq("department_id", suporteDeptId);
      suporteMemberIds = (memberLinks || []).map((m: any) => m.profile_id);
    }

    // 3. Fetch conversations from last 7 days — ALL from Suporte, no TMA filter
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Count totals for diagnostics
    const { count: totalFinalizadas } = await supabase
      .from("conversation_logs")
      .select("*", { count: "exact", head: true })
      .gte("finalized_at", cutoff);
    diagnostics.total_finalizadas_7d = totalFinalizadas || 0;

    const { data: allLogs } = await supabase
      .from("conversation_logs")
      .select("contact_name, assigned_to, assigned_to_name, tags, messages, started_at, finalized_at, wait_time, total_messages, department_name")
      .ilike("department_name", "%suporte%")
      .gte("finalized_at", cutoff)
      .order("finalized_at", { ascending: false })
      .limit(500);

    diagnostics.suporte_logs = (allLogs || []).length;

    // Filter to Suporte members if we have them
    const suporteLogs = suporteMemberIds.length > 0
      ? (allLogs || []).filter((l: any) => l.assigned_to && suporteMemberIds.includes(l.assigned_to))
      : (allLogs || []);

    diagnostics.suporte_member_logs = suporteLogs.length;

    // Filter conversations with at least 2 messages (relaxed from previous)
    const processableLogs = suporteLogs.filter((l: any) => {
      const msgs = Array.isArray(l.messages) ? l.messages : [];
      return msgs.length >= 2;
    });
    diagnostics.processable = processableLogs.length;

    console.log(`[DELMA DIAGNÓSTICO instruction-patterns] total=${diagnostics.total_finalizadas_7d}, suporte=${diagnostics.suporte_logs}, members=${diagnostics.suporte_member_logs}, processable=${diagnostics.processable}`);

    if (processableLogs.length === 0) {
      return new Response(JSON.stringify({
        message: "Sem conversas do Suporte para analisar",
        suggestions: 0,
        diagnostics,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Classify conversations by message content
    const MOTOBOY_KW = ["motoboy", "entregador", "corrida", "agendamento", "repasse", "antecipacao", "antecipação", "saque", "delbeneficios", "delbenefícios", "veiculo", "veículo", "fila", "coleta", "rota", "bloqueio", "app do entregador", "entrega"];
    const ESTAB_KW = ["loja", "estabelecimento", "restaurante", "recarga", "cardapio", "cardápio", "pedido", "cancelamento", "integracao", "integração", "ifood", "saipos", "drogavem", "pin", "franquia", "parceiro", "agrupamento"];

    function classifyByContent(messages: any[]): "estabelecimento" | "motoboy" | "geral" {
      const text = messages.map((m: any) => ((m.content || m.text || "")).toLowerCase()).join(" ");
      const isMotoboy = MOTOBOY_KW.some(kw => text.includes(kw));
      const isEstab = ESTAB_KW.some(kw => text.includes(kw));
      if (isMotoboy && !isEstab) return "motoboy";
      if (isEstab && !isMotoboy) return "estabelecimento";
      return "geral";
    }

    // 5. Fetch robots (Julia & Sebastiao only)
    const { data: allRobots } = await supabase
      .from("robots")
      .select("id, name, instructions, qa_pairs, tone, reference_links, updated_at")
      .in("status", ["active", "paused"]);

    const robots = (allRobots || []).filter((r: any) => getRobotScope(r.name) !== "skip");

    if (robots.length === 0) {
      return new Response(JSON.stringify({ message: "Nenhum robô especialista encontrado", suggestions: 0, diagnostics }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Deduplication check
    const deduplicationCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: existingSuggestions } = await supabase
      .from("delma_suggestions")
      .select("title")
      .eq("category", "melhoria_instrucao")
      .gte("created_at", deduplicationCutoff);
    const existingTitles = new Set((existingSuggestions || []).map((s: any) => s.title?.toLowerCase()));

    let totalSuggestions = 0;

    for (const robot of robots) {
      const robotScope = getRobotScope(robot.name);
      if (robotScope === "skip") continue;

      // Filter conversations for this robot's scope — include "geral" too, assign to closest match
      const scopedLogs = processableLogs.filter((l: any) => {
        const msgs = Array.isArray(l.messages) ? l.messages : [];
        const scope = classifyByContent(msgs);
        return scope === robotScope || scope === "geral";
      });

      // Reduced minimum from 3 to 2
      if (scopedLogs.length < 2) {
        console.log(`Not enough conversations for ${robot.name} (${scopedLogs.length})`);
        continue;
      }

      diagnostics[`${robot.name}_scoped`] = scopedLogs.length;

      // Build conversation summaries — use ALL, no TMA quality filter
      const conversationSummaries = scopedLogs.slice(0, 20).map((log: any, i: number) => {
        const msgs = Array.isArray(log.messages) ? log.messages : [];
        const agentMsgs = msgs
          .filter((m: any) => m.sender_id && m.sender_name === log.assigned_to_name)
          .map((m: any) => anonymize((m.content || "").substring(0, 300)))
          .slice(0, 5);
        return {
          agent: `Atendente ${String.fromCharCode(65 + (i % 26))}`,
          tags: (log.tags || []).slice(0, 5),
          agent_messages: agentMsgs,
          tma_minutes: Math.round((new Date(log.finalized_at).getTime() - new Date(log.started_at).getTime()) / 60000),
          message_count: msgs.length,
        };
      });

      // Build knowledge context
      const currentInstructions = (robot.instructions || "").substring(0, 4000);
      const qaPairs = Array.isArray(robot.qa_pairs) ? robot.qa_pairs : [];
      let qaStr = "";
      for (const qa of qaPairs) {
        const entry = `Q: ${qa.question || qa.q}\nA: ${qa.answer || qa.a}\n---\n`;
        if (qaStr.length + entry.length > 3000) break;
        qaStr += entry;
      }

      const scopeLabel = robotScope === "estabelecimento"
        ? "ESTABELECIMENTOS (lojistas, restaurantes, parceiros)"
        : "MOTOBOYS (entregadores)";

      const systemPrompt = `Você é a Delma, Gerente de Suporte IA. Analise padrões de ATENDENTES HUMANOS para propor melhorias nas INSTRUÇÕES GERAIS do robô "${robot.name}".

ESCOPO DO ROBÔ: ${scopeLabel}

INSTRUÇÕES ATUAIS DO ROBÔ "${robot.name}":
${currentInstructions || "(sem instruções definidas)"}

Q&As ATUAIS:
${qaStr || "(sem Q&As)"}

TOM DEFINIDO: ${robot.tone || "não definido"}

REGRAS:
1. Analise como os atendentes humanos se comportam — TODOS, não apenas os eficientes
2. Identifique padrões de INSTRUÇÃO que poderiam melhorar o robô: tom de abertura, sequência de perguntas, tratamento de urgências, linguagem
3. Compare com as instruções atuais e proponha melhorias CONCRETAS
4. Cada sugestão deve ter um trecho da instrução atual afetada e a versão proposta
5. NÃO proponha Q&As (isso é feito pelo treinamento regular)
6. Valide contra a base de conhecimento: não contradizer regras existentes
7. Conversas curtas também são válidas — revelam padrões de saudação e encerramento
8. SEMPRE gere pelo menos 1 sugestão por robô analisado

Retorne JSON com array "suggestions". Cada sugestão:
{
  "title": "título curto",
  "affected_section": "qual seção das instruções é alterada",
  "current_instruction": "trecho exato das instruções atuais (ou 'NOVA SEÇÃO')",
  "proposed_instruction": "versão proposta melhorada",
  "reasoning": "justificativa com dados",
  "compliance_status": "aligned | review | conflict",
  "compliance_notes": "nota de conformidade",
  "examples": ["até 3 trechos anonimizados"],
  "impact_score": 0-100,
  "impact_breakdown": { "volume_weight": 0-100, "tma_reduction": 0-100, "recurrence": 0-100, "urgency": 0-100 },
  "conversation_count": número de conversas que embasam (OBRIGATÓRIO > 0),
  "estimated_impact": "estimativa em linguagem natural",
  "recurrence_pattern": "pontual | semanal | cronico"
}

Gere entre 1-3 sugestões. Se não encontrar melhorias de alta qualidade, gere de qualidade média.
NUNCA retorne suggestions: [] — sempre há algo a melhorar.`;

      const userPrompt = `CONVERSAS DO SUPORTE (${scopedLogs.length} conversas, últimos 7 dias):
${JSON.stringify(conversationSummaries, null, 1)}

Analise e proponha melhorias nas instruções gerais do robô "${robot.name}".`;

      try {
        const callAI = async (model: string) => {
          const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
              response_format: { type: "json_object" },
            }),
          });
          if (!resp.ok) throw new Error(`${resp.status}`);
          const data = await resp.json();
          return data.choices?.[0]?.message?.content || "";
        };

        let aiResponse = "";
        try {
          aiResponse = await callAI("google/gemini-2.5-flash");
        } catch {
          aiResponse = await callAI("google/gemini-3-flash-preview");
        }

        let parsed: any;
        try {
          parsed = JSON.parse(aiResponse);
        } catch {
          console.warn(`Failed to parse AI response for ${robot.name}`);
          continue;
        }

        const suggestions = parsed.suggestions || [];

        // Smart suppression check
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: recentDecided } = await supabase
          .from("delma_suggestions")
          .select("title, status")
          .eq("category", "melhoria_instrucao")
          .in("status", ["rejected", "approved", "edited"])
          .gte("decided_at", thirtyDaysAgo);
        const rejectedTitles = new Set((recentDecided || []).filter((s: any) => s.status === "rejected").map((s: any) => s.title?.toLowerCase()));
        const approvedTitles = new Set((recentDecided || []).filter((s: any) => s.status === "approved" || s.status === "edited").map((s: any) => s.title?.toLowerCase()));

        for (const s of suggestions) {
          const title = s.title || "Melhoria de instrução";
          const titleLower = title.toLowerCase();
          if (existingTitles.has(titleLower)) continue;
          if (rejectedTitles.has(titleLower)) continue;
          if (approvedTitles.has(titleLower)) continue;

          const dataWindowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR');
          const dataWindowEnd = new Date().toLocaleDateString('pt-BR');

          const { error: insertErr } = await supabase.from("delma_suggestions").insert({
            category: "melhoria_instrucao",
            title,
            justification: s.reasoning || "",
            content: {
              robot_id: robot.id,
              robot_name: robot.name,
              affected_section: s.affected_section || "Geral",
              current_instruction: s.current_instruction || "",
              proposed_instruction: s.proposed_instruction || "",
              compliance_status: s.compliance_status || "aligned",
              compliance_notes: s.compliance_notes || null,
              examples: (s.examples || []).slice(0, 3),
              impact_score: s.impact_score || 50,
              impact_breakdown: s.impact_breakdown || { volume_weight: 50, tma_reduction: 50, recurrence: 50, urgency: 50 },
              data_window: `${dataWindowStart} a ${dataWindowEnd}`,
              conversation_count: s.conversation_count || scopedLogs.length,
              estimated_impact: s.estimated_impact || "",
              recurrence_pattern: s.recurrence_pattern || "pontual",
              affected_entity: robot.name,
            },
            confidence_score: 70,
            memories_used: [],
            status: "pending",
          });

          if (!insertErr) {
            totalSuggestions++;
            existingTitles.add(titleLower);
          }
        }
      } catch (e) {
        console.error(`Error analyzing instructions for ${robot.name}:`, e);
      }
    }

    // Guaranteed fallback if 0 suggestions
    if (totalSuggestions === 0 && processableLogs.length > 0) {
      await supabase.from("delma_suggestions").insert({
        category: "melhoria_delma",
        title: "Diagnóstico: análise de instruções sem resultados",
        justification: `Análise de ${processableLogs.length} conversas do Suporte não gerou sugestões de melhoria de instrução. As instruções atuais podem já cobrir os temas recorrentes.`,
        content: {
          diagnostics,
          robot_name: "Delma",
          pattern: "Pipeline de instruções sem resultados",
          examples: [],
          proposed_action: "Verificar se as instruções de Júlia e Sebastião estão atualizadas e cobrindo os temas recentes.",
          impact_score: 25,
          conversation_count: processableLogs.length,
          estimated_impact: "Identificar se o pipeline de instruções está funcionando corretamente",
          recurrence_pattern: "pontual",
        },
        confidence_score: 100,
        memories_used: [],
        status: "pending",
      });
      totalSuggestions = 1;
    }

    return new Response(JSON.stringify({
      message: `Análise de instruções concluída! ${totalSuggestions} sugestões geradas.`,
      suggestions: totalSuggestions,
      conversations_analyzed: processableLogs.length,
      diagnostics,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("brain-learn-instruction-patterns error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
