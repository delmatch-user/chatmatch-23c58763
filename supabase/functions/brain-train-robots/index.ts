import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Build knowledge context for a robot, truncated to ~8000 chars
function buildKnowledgeContext(robot: any): string {
  const parts: string[] = [];
  const instructions = (robot.instructions || "").substring(0, 4000);
  if (instructions) parts.push(`INSTRUÇÕES GERAIS:\n${instructions}`);

  const qaPairs = Array.isArray(robot.qa_pairs) ? robot.qa_pairs : [];
  if (qaPairs.length > 0) {
    let qaStr = "Q&As CADASTRADOS:\n";
    for (const qa of qaPairs) {
      const entry = `Q: ${qa.question || qa.q}\nA: ${qa.answer || qa.a}\n---\n`;
      if (qaStr.length + entry.length > 3500) break;
      qaStr += entry;
    }
    parts.push(qaStr);
  }

  const meta: string[] = [];
  if (robot.tone) meta.push(`TOM DEFINIDO: ${robot.tone}`);
  if (Array.isArray(robot.reference_links) && robot.reference_links.length > 0) {
    const links = robot.reference_links.slice(0, 5).map((l: any) => `- ${l.title || l.url}`).join("\n");
    meta.push(`LINKS DE REFERÊNCIA:\n${links}`);
  }
  if (meta.length > 0) parts.push(meta.join("\n").substring(0, 500));

  return parts.join("\n\n");
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

    // 1. Fetch Suporte department and filter robots
    const { data: suporteDept } = await supabase
      .from("departments").select("id").ilike("name", "%suporte%").maybeSingle();
    const suporteDeptId = suporteDept?.id;

    const { data: allRobots, error: robotsErr } = await supabase
      .from("robots")
      .select("id, name, instructions, qa_pairs, tone, reference_links, departments, updated_at")
      .in("status", ["active", "paused"]);
    if (robotsErr) throw robotsErr;

    const robots = (allRobots || []).filter((r: any) => {
      const lower = r.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (lower.includes("sdr") || lower.includes("arthur")) return false; // Exclude SDR
      const deps: string[] = r.departments || [];
      return deps.length === 0 || (suporteDeptId && deps.includes(suporteDeptId));
    });

    diagnostics.robots_found = robots.length;

    if (!robots || robots.length === 0) {
      return new Response(JSON.stringify({ message: "Nenhum robô encontrado", suggestions: 0, diagnostics }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Fetch conversations from Suporte department — last 14 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);

    // Get Suporte members
    let suporteMemberNames = new Set<string>();
    if (suporteDeptId) {
      const { data: memberLinks } = await supabase
        .from("profile_departments")
        .select("profile_id")
        .eq("department_id", suporteDeptId);
      if (memberLinks && memberLinks.length > 0) {
        const memberIds = memberLinks.map((m: any) => m.profile_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("name")
          .in("id", memberIds);
        if (profiles) {
          profiles.forEach((p: any) => suporteMemberNames.add(p.name));
        }
      }
    }

    // Fetch from Suporte department explicitly
    const { data: humanLogs } = await supabase
      .from("conversation_logs")
      .select("contact_name, tags, messages, assigned_to_name, finalized_at, channel, total_messages, department_name")
      .ilike("department_name", "%suporte%")
      .not("assigned_to_name", "is", null)
      .gte("finalized_at", cutoff.toISOString())
      .order("finalized_at", { ascending: false })
      .limit(500);

    diagnostics.total_suporte_logs = (humanLogs || []).length;

    // Filter to Suporte members if available
    const filteredLogs = suporteMemberNames.size > 0
      ? (humanLogs || []).filter((log: any) => suporteMemberNames.has(log.assigned_to_name))
      : (humanLogs || []);

    diagnostics.member_filtered_logs = filteredLogs.length;

    // Relaxed: minimum 2 messages instead of implicit higher requirements
    const processableLogs = filteredLogs.filter((log: any) => {
      const msgs = Array.isArray(log.messages) ? log.messages : [];
      return msgs.length >= 2;
    });

    diagnostics.processable = processableLogs.length;

    console.log(`[DELMA DIAGNÓSTICO train-robots] suporte_logs=${diagnostics.total_suporte_logs}, member_filtered=${diagnostics.member_filtered_logs}, processable=${diagnostics.processable}`);

    if (processableLogs.length === 0) {
      return new Response(JSON.stringify({ message: "Sem conversas humanas recentes do Suporte para analisar", suggestions: 0, diagnostics }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Extract conversation pairs and classify
    const MOTOBOY_KW = ["motoboy", "entregador", "corrida", "agendamento", "repasse", "antecipacao", "antecipação", "saque", "delbeneficios", "delbenefícios", "veiculo", "veículo", "fila", "coleta", "rota", "bloqueio", "app do entregador", "entrega"];
    const ESTAB_KW = ["loja", "estabelecimento", "restaurante", "recarga", "cardapio", "cardápio", "pedido", "cancelamento", "integracao", "integração", "ifood", "saipos", "drogavem", "pin", "franquia", "parceiro", "agrupamento"];

    function classifyByContent(messages: Array<{ from: string; text: string }>): "estabelecimento" | "motoboy" | "geral" {
      const text = messages.map(m => (m.text || "").toLowerCase()).join(" ");
      const isMotoboy = MOTOBOY_KW.some(kw => text.includes(kw));
      const isEstab = ESTAB_KW.some(kw => text.includes(kw));
      if (isMotoboy && !isEstab) return "motoboy";
      if (isEstab && !isMotoboy) return "estabelecimento";
      return "geral";
    }

    const allConversationExamples: Array<{
      agent: string;
      tags: string[];
      scope: "estabelecimento" | "motoboy" | "geral";
      exchanges: Array<{ from: string; text: string }>;
    }> = [];

    for (const log of processableLogs) {
      if (allConversationExamples.length >= 50) break;
      const msgs = Array.isArray(log.messages) ? log.messages : [];

      const exchanges: Array<{ from: string; text: string }> = [];
      for (let i = 0; i < Math.min(msgs.length, 10); i++) {
        const m = msgs[i];
        const content = (m.content || "").substring(0, 200);
        if (!content.trim()) continue;
        const isAgent = m.sender_id && m.sender_name === log.assigned_to_name;
        exchanges.push({
          from: isAgent ? "atendente" : "cliente",
          text: content,
        });
      }

      if (exchanges.length >= 2) {
        allConversationExamples.push({
          agent: log.assigned_to_name,
          tags: log.tags || [],
          scope: classifyByContent(exchanges),
          exchanges,
        });
      }
    }

    diagnostics.conversation_examples = allConversationExamples.length;

    function getRobotScope(name: string): "estabelecimento" | "motoboy" | "skip" {
      const lower = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (lower.includes("delma")) return "skip";
      if (lower.includes("sdr") || lower.includes("arthur")) return "skip";
      if (lower.includes("julia")) return "estabelecimento";
      if (lower.includes("sebastiao")) return "motoboy";
      return "skip";
    }

    // 4. Fetch existing pending suggestions to avoid duplicates
    const { data: existingSuggestions } = await supabase
      .from("robot_training_suggestions")
      .select("title, robot_id")
      .eq("status", "pending");

    const existingSet = new Set(
      (existingSuggestions || []).map((s: any) => `${s.robot_id}:${s.title}`)
    );

    // 5. For each robot, generate suggestions
    let totalSuggestions = 0;
    const robotsAnalyzed: Array<{ name: string; qa_count: number; tone: string; updated_at: string; instructions_excerpt: string }> = [];

    for (const robot of robots) {
      const existingQA = Array.isArray(robot.qa_pairs) ? robot.qa_pairs : [];
      const knowledgeContext = buildKnowledgeContext(robot);

      const snapshot = {
        qa_count: existingQA.length,
        instructions_excerpt: (robot.instructions || "").substring(0, 200),
        tone: robot.tone || "não definido",
        updated_at: robot.updated_at,
      };
      robotsAnalyzed.push({ name: robot.name, ...snapshot });

      const robotScope = getRobotScope(robot.name);
      if (robotScope === "skip") {
        console.log(`Skipping robot ${robot.name} (triager/SDR/unknown scope)`);
        continue;
      }

      const scopeLabel = robotScope === "estabelecimento" ? "ESTABELECIMENTOS (lojistas, restaurantes, parceiros)"
        : "MOTOBOYS (entregadores)";

      // Include "geral" conversations too — assign to closest robot
      const conversationExamples = allConversationExamples.filter(c => c.scope === robotScope || c.scope === "geral");

      diagnostics[`${robot.name}_examples`] = conversationExamples.length;

      if (conversationExamples.length === 0) {
        console.log(`No relevant conversations for robot ${robot.name}`);
        continue;
      }

      const systemPrompt = `Você é a Delma, Treinadora de IA. Sua missão é analisar como os ATENDENTES HUMANOS reais respondem aos clientes e usar isso para melhorar o robô "${robot.name}".

ESCOPO DO ROBÔ: Este robô atende exclusivamente ${scopeLabel}. Gere sugestões APENAS para esse público.
NUNCA gere sugestões sobre o robô SDR, Arthur ou temas comerciais/vendas.

CONTEXTO OBRIGATÓRIO — BASE DE CONHECIMENTO DO ROBÔ "${robot.name}":
${knowledgeContext}

REGRAS DE GERAÇÃO:
1. Analise TODOS os padrões — conversas rápidas e longas
2. Identifique respostas humanas recorrentes que o robô NÃO tem no Q&A
3. Sugira Q&A baseados em COMO os humanos realmente respondem
4. Compare as respostas humanas com o Q&A existente do robô
5. Foque em tornar o robô mais HUMANO e empático
6. NÃO sugira Q&A que já existam na base do robô
7. SEMPRE gere pelo menos 1 sugestão por robô analisado

REGRAS DE VALIDAÇÃO:
1. Tom e linguagem: alinhada ao tom "${robot.tone}"
2. Consistência com Q&As existentes: NUNCA contradizer
3. Fluxo correto: respeitar instruções
4. Ancoragem em dados reais: citar volume de conversas
5. Se violar qualquer ponto, descartar silenciosamente

Retorne um JSON com array "suggestions". Formato:
{
  "type": "qa" | "tone" | "instruction",
  "title": "título curto descritivo",
  "content": "conteúdo (para Q&A: formato 'Pergunta: ... | Resposta: ...')",
  "reasoning": "baseado em qual padrão humano observado + quantidade de conversas",
  "compliance_status": "aligned" | "review" | "conflict",
  "compliance_notes": "nota sobre conformidade"
}

Gere entre 2-5 sugestões relevantes.`;

      const conversationsSample = conversationExamples
        .slice(0, 15)
        .map((c) => {
          const dialog = c.exchanges.map((e) => `[${e.from}]: ${e.text}`).join("\n");
          return `--- Atendente: ${c.agent} | Tags: ${c.tags.join(", ")} ---\n${dialog}`;
        })
        .join("\n\n");

      const userPrompt = `CONVERSAS REAIS COM ATENDENTES HUMANOS — público: ${scopeLabel} (últimos 14 dias, ${conversationExamples.length} conversas analisadas):
${conversationsSample || "Nenhuma conversa disponível"}

Analise como os atendentes humanos respondem e gere sugestões validadas contra a base de conhecimento do robô "${robot.name}".`;

      try {
        let aiResponse = "";

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

        try {
          aiResponse = await callAI("google/gemini-2.5-flash");
        } catch {
          aiResponse = await callAI("google/gemini-3-flash-preview");
        }

        let parsed: any;
        try {
          parsed = JSON.parse(aiResponse);
        } catch {
          console.warn(`Failed to parse AI response for robot ${robot.name}`);
          continue;
        }

        const suggestions = parsed.suggestions || parsed.sugestoes || [];

        for (const s of suggestions) {
          const title = s.title || s.titulo || "Sugestão";
          const key = `${robot.id}:${title}`;
          if (existingSet.has(key)) continue;

          const { error: insertErr } = await supabase
            .from("robot_training_suggestions")
            .insert({
              robot_id: robot.id,
              robot_name: robot.name,
              suggestion_type: s.type || "qa",
              title,
              content: s.content || s.conteudo || "",
              reasoning: s.reasoning || s.motivo || null,
              status: "pending",
              compliance_status: s.compliance_status || "aligned",
              compliance_notes: s.compliance_notes || null,
              knowledge_base_snapshot: snapshot,
              knowledge_base_updated_at: robot.updated_at,
            });

          if (!insertErr) {
            totalSuggestions++;
            existingSet.add(key);
          }
        }
      } catch (e) {
        console.error(`Error generating suggestions for ${robot.name}:`, e);
      }
    }

    // Guaranteed fallback
    if (totalSuggestions === 0 && processableLogs.length > 0) {
      // Insert a diagnostic delma_suggestion instead
      await supabase.from("delma_suggestions").insert({
        category: "melhoria_delma",
        title: "Diagnóstico: treinamento de robôs sem resultados",
        justification: `Análise de ${allConversationExamples.length} conversas do Suporte não gerou sugestões de treinamento. Possíveis causas: base de Q&A já cobre os temas ou conversas sem padrão novo identificável.`,
        content: {
          diagnostics,
          robot_name: "Delma",
          pattern: "Pipeline de treinamento sem resultados",
          examples: [],
          proposed_action: "Verificar se os Q&As de Júlia e Sebastião cobrem os temas mais frequentes das últimas semanas.",
          impact_score: 25,
          conversation_count: allConversationExamples.length,
          estimated_impact: "Identificar gargalos no pipeline de treinamento",
          recurrence_pattern: "pontual",
        },
        confidence_score: 100,
        memories_used: [],
        status: "pending",
      });
      totalSuggestions = 1;
    }

    return new Response(JSON.stringify({
      message: `Treinamento concluído! ${totalSuggestions} sugestões geradas baseadas em ${allConversationExamples.length} conversas humanas.`,
      suggestions: totalSuggestions,
      robots: robots.length,
      conversationsAnalyzed: allConversationExamples.length,
      robotsAnalyzed,
      diagnostics,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("brain-train-robots error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
