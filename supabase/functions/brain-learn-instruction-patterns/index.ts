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

    // 3. Fetch human conversations from last 7 days
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: humanLogs } = await supabase
      .from("conversation_logs")
      .select("contact_name, assigned_to, assigned_to_name, tags, messages, started_at, finalized_at, wait_time, total_messages")
      .not("assigned_to", "is", null)
      .not("finalized_by", "is", null)
      .gte("finalized_at", cutoff)
      .order("finalized_at", { ascending: false })
      .limit(500);

    // Filter to Suporte members only
    const suporteLogs = suporteMemberIds.length > 0
      ? (humanLogs || []).filter((l: any) => suporteMemberIds.includes(l.assigned_to))
      : (humanLogs || []);

    if (suporteLogs.length === 0) {
      return new Response(JSON.stringify({ message: "Sem conversas humanas do Suporte para analisar", suggestions: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Calculate average TMA and filter quality conversations
    const tmas = suporteLogs.map((l: any) => {
      const start = new Date(l.started_at).getTime();
      const end = new Date(l.finalized_at).getTime();
      return (end - start) / 60000;
    });
    const avgTMA = tmas.reduce((a, b) => a + b, 0) / tmas.length;

    // Quality filter: TMA below average = efficient conversations
    const qualityLogs = suporteLogs.filter((l: any, i: number) => tmas[i] <= avgTMA && tmas[i] > 0);

    if (qualityLogs.length === 0) {
      return new Response(JSON.stringify({ message: "Sem conversas de qualidade para analisar", suggestions: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Classify conversations by scope
    const ESTABELECIMENTO_TAGS = ["erro_sistema", "cancelamento", "financeiro", "operacional", "duvida", "comercial", "b2b", "cadastro", "cardapio", "pagamento", "sistema", "contrato", "estabelecimento"];
    const MOTOBOY_TAGS = ["motoboy", "entregador", "entrega", "corrida", "rota", "acidente", "urgente", "bloqueio"];

    function classifyConversation(tags: string[]): "estabelecimento" | "motoboy" | "geral" {
      const lower = tags.map(t => t.toLowerCase());
      const isMotoboy = lower.some(t => MOTOBOY_TAGS.some(mt => t.includes(mt)));
      const isEstab = lower.some(t => ESTABELECIMENTO_TAGS.some(et => t.includes(et)));
      if (isMotoboy && !isEstab) return "motoboy";
      if (isEstab && !isMotoboy) return "estabelecimento";
      return "geral";
    }

    // 6. Fetch robots (Julia & Sebastiao only)
    const { data: allRobots } = await supabase
      .from("robots")
      .select("id, name, instructions, qa_pairs, tone, reference_links, updated_at")
      .in("status", ["active", "paused"]);

    const robots = (allRobots || []).filter((r: any) => getRobotScope(r.name) !== "skip");

    if (robots.length === 0) {
      return new Response(JSON.stringify({ message: "Nenhum robô especialista encontrado", suggestions: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 7. Deduplication check
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

      // Filter conversations for this robot's scope
      const scopedLogs = qualityLogs.filter((l: any) => {
        const scope = classifyConversation(l.tags || []);
        return scope === robotScope;
      });

      if (scopedLogs.length < 3) {
        console.log(`Not enough quality conversations for ${robot.name} (${scopedLogs.length})`);
        continue;
      }

      // Build conversation summaries
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

      const systemPrompt = `Você é a Delma, Gerente de Suporte IA. Analise padrões de ATENDENTES HUMANOS eficientes para propor melhorias nas INSTRUÇÕES GERAIS do robô "${robot.name}".

ESCOPO DO ROBÔ: ${scopeLabel}

INSTRUÇÕES ATUAIS DO ROBÔ "${robot.name}":
${currentInstructions || "(sem instruções definidas)"}

Q&As ATUAIS:
${qaStr || "(sem Q&As)"}

TOM DEFINIDO: ${robot.tone || "não definido"}

REGRAS:
1. Analise como os atendentes humanos eficientes (TMA abaixo da média) se comportam
2. Identifique padrões de INSTRUÇÃO (não Q&A) que poderiam melhorar o robô: tom de abertura, sequência de perguntas diagnósticas, tratamento de urgências, linguagem
3. Compare com as instruções atuais e proponha melhorias CONCRETAS
4. Cada sugestão deve ter um trecho da instrução atual afetada e a versão proposta
5. NÃO proponha Q&As (isso é feito pelo treinamento regular)
6. Valide contra a base de conhecimento: não contradizer regras existentes

Retorne JSON com array "suggestions". Cada sugestão:
{
  "title": "título curto",
  "affected_section": "qual seção das instruções é alterada (ex: Tom geral, Fluxo de coleta, Saudação)",
  "current_instruction": "trecho exato das instruções atuais que será modificado (ou 'NOVA SEÇÃO' se não existe)",
  "proposed_instruction": "versão proposta melhorada",
  "reasoning": "justificativa com dados (volume de conversas, padrão observado)",
  "compliance_status": "aligned | review | conflict",
  "compliance_notes": "nota de conformidade (obrigatório se review/conflict)",
  "examples": ["até 3 trechos anonimizados de conversas humanas que embasam"],
  "impact_score": 0-100 calculado como: (volume_afetado × 0.35) + (reducao_tma × 0.25) + (recorrencia × 0.20) + (urgencia × 0.20),
  "impact_breakdown": { "volume_weight": 0-100, "tma_reduction": 0-100, "recurrence": 0-100, "urgency": 0-100 },
  "conversation_count": número exato de conversas analisadas que embasam (OBRIGATÓRIO > 0),
  "estimated_impact": "estimativa em linguagem natural (ex: 'Pode reduzir ~2min no TMA de conversas de cancelamento')",
  "recurrence_pattern": "pontual | semanal | cronico"
}

Gere entre 1-3 sugestões de alta qualidade. Priorize melhorias com maior impacto.
Se conversation_count for 0, descarte a sugestão.`;

      const userPrompt = `CONVERSAS HUMANAS EFICIENTES (${scopedLogs.length} conversas, TMA abaixo da média do time):
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
          if (s.conversation_count !== undefined && s.conversation_count <= 0) continue;

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

    return new Response(JSON.stringify({
      message: `Análise de instruções concluída! ${totalSuggestions} sugestões geradas.`,
      suggestions: totalSuggestions,
      quality_conversations: qualityLogs.length,
      avg_tma_minutes: Math.round(avgTMA),
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
