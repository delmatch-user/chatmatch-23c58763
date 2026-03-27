import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function extractConversationPairs(messages: any[]): { customer: string; agent: string }[] {
  const pairs: { customer: string; agent: string }[] = [];
  if (!Array.isArray(messages)) return pairs;

  for (let i = 0; i < messages.length - 1; i++) {
    const msg = messages[i];
    const next = messages[i + 1];
    const isCustomer = msg.sender_name === "Cliente" || (!msg.sender_id && msg.status === "received");
    const isAgentReply = next.sender_id || next.status === "sent";
    if (isCustomer && isAgentReply && msg.content && next.content) {
      pairs.push({
        customer: anonymize(msg.content).substring(0, 300),
        agent: anonymize(next.content).substring(0, 300),
      });
    }
  }
  return pairs.slice(0, 10);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const supabase = createClient(supabaseUrl, serviceKey);

    if (!lovableKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const deduplicationCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    // ========== DIAGNOSTICS: count totals before filtering ==========
    const diagnostics: any = {};

    // Count all finalizadas last 7 days
    const { count: totalFinalizadas } = await supabase
      .from("conversation_logs")
      .select("*", { count: "exact", head: true })
      .gte("finalized_at", cutoff);
    diagnostics.total_finalizadas_7d = totalFinalizadas || 0;

    // Count Suporte only
    const { count: suporteCount } = await supabase
      .from("conversation_logs")
      .select("*", { count: "exact", head: true })
      .ilike("department_name", "%suporte%")
      .gte("finalized_at", cutoff);
    diagnostics.do_suporte = suporteCount || 0;

    // Count excluded (Comercial/SDR)
    const { count: comercialCount } = await supabase
      .from("conversation_logs")
      .select("*", { count: "exact", head: true })
      .or("department_name.ilike.%comercial%,department_name.ilike.%vendas%")
      .gte("finalized_at", cutoff);
    diagnostics.excluidas_comercial = comercialCount || 0;

    console.log(`[DELMA DIAGNÓSTICO] total_finalizadas=${diagnostics.total_finalizadas_7d}, suporte=${diagnostics.do_suporte}, excluidas_comercial=${diagnostics.excluidas_comercial}`);

    // 1. Fetch human-handled conversations from SUPORTE (last 7 days)
    // REMOVED: .not("finalized_by", "is", null) — to include robot-finalized conversations too
    const { data: humanLogs } = await supabase
      .from("conversation_logs")
      .select("id, contact_name, assigned_to_name, finalized_by_name, messages, tags, started_at, finalized_at, department_name, wait_time")
      .ilike("department_name", "%suporte%")
      .not("assigned_to_name", "is", null)
      .gte("finalized_at", cutoff)
      .order("finalized_at", { ascending: false })
      .limit(200);

    // 2. Fetch robot-handled conversations from SUPORTE (last 7 days)
    const { data: robotLogs } = await supabase
      .from("conversation_logs")
      .select("id, contact_name, assigned_to_name, finalized_by_name, messages, tags, started_at, finalized_at, department_name, wait_time")
      .ilike("department_name", "%suporte%")
      .is("finalized_by", null)
      .gte("finalized_at", cutoff)
      .order("finalized_at", { ascending: false })
      .limit(200);

    diagnostics.human_logs_found = (humanLogs || []).length;
    diagnostics.robot_logs_found = (robotLogs || []).length;

    // Count conversations with >= 2 messages
    const humanWithMsgs = (humanLogs || []).filter(l => {
      const msgs = Array.isArray(l.messages) ? l.messages : [];
      return msgs.length >= 2;
    });
    const robotWithMsgs = (robotLogs || []).filter(l => {
      const msgs = Array.isArray(l.messages) ? l.messages : [];
      return msgs.length >= 2;
    });
    diagnostics.human_with_messages = humanWithMsgs.length;
    diagnostics.robot_with_messages = robotWithMsgs.length;
    diagnostics.total_processable = humanWithMsgs.length + robotWithMsgs.length;

    console.log(`[DELMA DIAGNÓSTICO] human_logs=${diagnostics.human_logs_found}, robot_logs=${diagnostics.robot_logs_found}, processable=${diagnostics.total_processable}`);

    // 3. Fetch transfer logs to identify unnecessary transfers
    const { data: transferLogs } = await supabase
      .from("transfer_logs")
      .select("conversation_id, from_user_name, to_user_name, to_robot_name, reason, created_at")
      .gte("created_at", cutoff)
      .limit(500);

    // 4. Fetch robots for context — get real IDs for classification
    const { data: robots } = await supabase
      .from("robots")
      .select("id, name, qa_pairs, departments, tone")
      .limit(20);

    // Build robot ID map — exclude SDR robots
    const robotIdMap: Record<string, { id: string; name: string }> = {};
    (robots || []).forEach((r: any) => {
      const lower = r.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (lower.includes("sdr") || lower.includes("arthur")) return; // Exclude SDR
      if (lower.includes("sebastiao")) robotIdMap.sebastiao = { id: r.id, name: r.name };
      else if (lower.includes("julia")) robotIdMap.julia = { id: r.id, name: r.name };
      else if (lower.includes("delma")) robotIdMap.delma = { id: r.id, name: r.name };
    });

    // 5. Check existing suggestions for deduplication
    const { data: existingSuggestions } = await supabase
      .from("delma_suggestions")
      .select("title, category, content")
      .in("category", ["aprendizado_humano", "aprendizado_robo", "melhoria_delma"])
      .gte("created_at", deduplicationCutoff)
      .limit(100);

    // Prepare human conversation summaries — use ALL, not just high quality
    const humanSummaries = (humanLogs || []).slice(0, 30).map((log, i) => {
      const msgs = Array.isArray(log.messages) ? log.messages : [];
      const pairs = extractConversationPairs(msgs);
      const startTime = new Date(log.started_at).getTime();
      const endTime = new Date(log.finalized_at).getTime();
      const tmaMinutes = Math.round((endTime - startTime) / 60000);
      return {
        index: i + 1,
        agent: `Atendente ${String.fromCharCode(65 + (i % 26))}`,
        tags: (log.tags || []).slice(0, 5),
        tma_minutes: tmaMinutes,
        wait_minutes: log.wait_time || 0,
        department: log.department_name,
        conversation_pairs: pairs.slice(0, 3),
        message_count: msgs.length,
      };
    });

    // Prepare robot conversation summaries
    const robotSummaries = (robotLogs || []).slice(0, 30).map((log, i) => {
      const msgs = Array.isArray(log.messages) ? log.messages : [];
      return {
        index: i + 1,
        tags: (log.tags || []).slice(0, 5),
        total_messages: msgs.length,
        department: log.department_name,
      };
    });

    // Identify transfers from robots to humans
    const robotTransfers = (transferLogs || [])
      .filter(t => t.to_user_name && !t.to_robot_name)
      .slice(0, 20)
      .map(t => ({
        from: t.from_user_name || t.to_robot_name || "Robô",
        reason: anonymize(t.reason || "Sem motivo"),
      }));

    // Robot Q&A counts for context
    const robotContext = (robots || [])
      .filter(r => {
        const lower = r.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return !lower.includes("sdr") && !lower.includes("arthur");
      })
      .map(r => ({
        name: r.name,
        id: r.id,
        qa_count: Array.isArray(r.qa_pairs) ? r.qa_pairs.length : 0,
        tone: r.tone,
        departments: r.departments,
      }));

    const existingTitles = (existingSuggestions || []).map(s => s.title?.toLowerCase());

    const dataWindowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR');
    const dataWindowEnd = new Date().toLocaleDateString('pt-BR');

    // ========== RESILIENCE CHAIN: try with decreasing batch sizes ==========
    const batchSizes = [200, 50, 10, 3];
    let suggestions: any[] = [];
    let attemptUsed = 0;

    for (const batchSize of batchSizes) {
      attemptUsed++;
      const humanSlice = humanSummaries.slice(0, Math.min(batchSize, humanSummaries.length));
      const robotSlice = robotSummaries.slice(0, Math.min(Math.floor(batchSize / 2), robotSummaries.length));

      if (humanSlice.length === 0 && robotSlice.length === 0) continue;

      const isLastAttempt = batchSize === 3;
      const forceInstruction = isLastAttempt
        ? "\n\nIMPORTANTE: Esta é a última tentativa. Gere OBRIGATORIAMENTE pelo menos 1 sugestão, mesmo que seja ajuste de tom ou melhoria menor."
        : "";

      const prompt = `Analise as conversas de suporte dos últimos 7 dias e gere sugestões de melhoria.
IMPORTANTE: Analise APENAS conversas do departamento Suporte. NUNCA gere sugestões sobre o robô SDR, Arthur ou temas comerciais/vendas.

CONVERSAS HUMANAS (atendentes reais) — ${humanSlice.length} conversas:
${JSON.stringify(humanSlice, null, 1)}

CONVERSAS DE ROBÔS — ${robotSlice.length} conversas:
${JSON.stringify(robotSlice, null, 1)}

TRANSFERÊNCIAS DE ROBÔ PARA HUMANO — ${robotTransfers.length} transferências:
${JSON.stringify(robotTransfers, null, 1)}

ROBÔS DO SUPORTE:
${JSON.stringify(robotContext, null, 1)}

SUGESTÕES JÁ EXISTENTES (não duplicar):
${existingTitles.join(", ")}

Para cada padrão identificado, gere uma sugestão estruturada. Gere entre 3 e 8 sugestões no total.

Tipos possíveis:
- "aprendizado_humano": padrão aprendido com atendentes humanos (frases eficazes, abordagens empáticas, resoluções rápidas)
- "aprendizado_robo": padrão aprendido com logs dos robôs (transferências desnecessárias, gaps de Q&A, respostas genéricas)
- "melhoria_delma": a Delma propõe melhorar seu próprio comportamento ou análise

REGRAS DE ANÁLISE:
1. Analise TODAS as conversas — não descarte nenhuma por ser "simples demais"
2. Conversas curtas (2–4 mensagens) também revelam padrões válidos
3. Conversas com transferência para humano revelam gaps — identifique o tema e gere Q&A
4. Compare o que os humanos respondem com o que os robôs têm na base — diferenças são oportunidades
5. SEMPRE gere pelo menos 1 sugestão por lote analisado
6. NUNCA gere sugestões sobre o robô SDR ou sobre temas comerciais/vendas

Cada sugestão deve ter:
- title: título curto e descritivo
- type: um dos tipos acima
- justification: dados que justificam (volume, período, nomes de robôs)
- confidence_score: 0-100
- impact_score: 0-100
- impact_breakdown: { volume_weight: 0-100, tma_reduction: 0-100, recurrence: 0-100, urgency: 0-100 }
- data_window: "${dataWindowStart} a ${dataWindowEnd}"
- conversation_count: número de conversas que embasam (OBRIGATÓRIO > 0)
- estimated_impact: estimativa em linguagem natural
- recurrence_pattern: "pontual" | "semanal" | "cronico"
- content.pattern: descrição do padrão encontrado
- content.examples: array com até 3 exemplos anonimizados
- content.proposed_action: ação concreta proposta
- content.robot_name: nome do robô (OBRIGATÓRIO)
- content.robot_id: id do robô (OBRIGATÓRIO)
- content.agent_alias: "Atendente A" etc (se aplicável)
- content.affected_entity: nome do robô ou atendente com maior impacto

CLASSIFICAÇÃO OBRIGATÓRIA DE ROBÔ:
- Motoboy/entregador/corrida/agendamento/repasse/antecipação/saque/DelBenefícios → robot_id = "${robotIdMap.sebastiao?.id || ""}", robot_name = "${robotIdMap.sebastiao?.name || "Sebastião"}"
- Loja/estabelecimento/restaurante/parceiro/recarga/pedido/cancelamento/integração/iFood/Saipos → robot_id = "${robotIdMap.julia?.id || ""}", robot_name = "${robotIdMap.julia?.name || "Júlia"}"
- Triagem/geral → robot_id = "${robotIdMap.delma?.id || ""}", robot_name = "${robotIdMap.delma?.name || "Delma"}"
- NUNCA deixar robot_id ou robot_name como null${forceInstruction}`;

      try {
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: "Você é a Delma, uma IA de gestão de suporte. Responda APENAS com um JSON array válido de sugestões. Sem texto extra." },
              { role: "user", content: prompt },
            ],
            tools: [{
              type: "function",
              function: {
                name: "generate_suggestions",
                description: "Generate structured learning suggestions from conversation analysis",
                parameters: {
                  type: "object",
                  properties: {
                    suggestions: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          title: { type: "string" },
                          type: { type: "string", enum: ["aprendizado_humano", "aprendizado_robo", "melhoria_delma"] },
                          justification: { type: "string" },
                          confidence_score: { type: "number" },
                          content: {
                            type: "object",
                            properties: {
                              pattern: { type: "string" },
                              examples: { type: "array", items: { type: "string" } },
                              proposed_action: { type: "string" },
                              robot_name: { type: "string" },
                              robot_id: { type: "string" },
                              agent_alias: { type: "string" },
                            },
                            required: ["pattern", "examples", "proposed_action"],
                          },
                        },
                        required: ["title", "type", "justification", "confidence_score", "content"],
                      },
                    },
                  },
                  required: ["suggestions"],
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "generate_suggestions" } },
          }),
        });

        if (!aiResponse.ok) {
          console.error(`AI error on attempt ${attemptUsed} (batch ${batchSize}):`, aiResponse.status);
          continue;
        }

        const aiData = await aiResponse.json();
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall?.function?.arguments) {
          try {
            const parsed = JSON.parse(toolCall.function.arguments);
            suggestions = parsed.suggestions || [];
          } catch (e) {
            console.error("Failed to parse tool call arguments:", e);
          }
        }

        if (suggestions.length === 0) {
          const content = aiData.choices?.[0]?.message?.content;
          if (content) {
            try {
              const jsonMatch = content.match(/\[[\s\S]*\]/);
              if (jsonMatch) suggestions = JSON.parse(jsonMatch[0]);
            } catch (e) {
              console.error("Failed to parse content fallback:", e);
            }
          }
        }

        if (suggestions.length > 0) {
          console.log(`[DELMA] Attempt ${attemptUsed} (batch ${batchSize}) generated ${suggestions.length} suggestions`);
          break;
        }

        console.log(`[DELMA] Attempt ${attemptUsed} (batch ${batchSize}) returned 0 suggestions, retrying...`);
      } catch (e) {
        console.error(`AI call failed on attempt ${attemptUsed}:`, e);
      }
    }

    diagnostics.attempts_used = attemptUsed;
    diagnostics.raw_suggestions = suggestions.length;

    // Smart suppression: check rejected/approved in last 30 days
    const { data: recentDecided } = await supabase
      .from("delma_suggestions")
      .select("title, status")
      .in("status", ["rejected", "approved", "edited"])
      .gte("decided_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    const rejectedTitles = new Set((recentDecided || []).filter((s: any) => s.status === "rejected").map((s: any) => s.title?.toLowerCase()));
    const approvedTitles = new Set((recentDecided || []).filter((s: any) => s.status === "approved" || s.status === "edited").map((s: any) => s.title?.toLowerCase()));

    const { data: pendingSuggestions } = await supabase
      .from("delma_suggestions")
      .select("title")
      .eq("status", "pending");
    const pendingCounts: Record<string, number> = {};
    (pendingSuggestions || []).forEach((s: any) => {
      const t = s.title?.toLowerCase();
      if (t) pendingCounts[t] = (pendingCounts[t] || 0) + 1;
    });

    const filtered = suggestions.filter(s => {
      const titleLower = s.title?.toLowerCase();
      if (!titleLower) return false;
      if (rejectedTitles.has(titleLower)) return false;
      if (approvedTitles.has(titleLower)) return false;
      // Use exact match only — substring match was too aggressive
      return !existingTitles.some(existing => existing === titleLower);
    });

    // Keyword-based validation helper
    const MOTOBOY_KW = ["motoboy", "entregador", "corrida", "agendamento", "repasse", "antecipação", "antecipacao", "saque", "delbeneficios", "delbenefícios", "veículo", "veiculo", "fila", "coleta", "rota", "bloqueio", "entrega", "app_entregador"];
    const ESTAB_KW = ["loja", "estabelecimento", "restaurante", "parceiro", "recarga", "pedido", "cancelamento", "integracao", "integração", "ifood", "saipos", "drogavem", "pin", "cardápio", "cardapio", "franquia", "cadastro", "financeiro", "contrato", "agrupamento"];

    function validateAndFixRobotId(s: any): any {
      const text = `${s.title || ""} ${s.content?.pattern || ""} ${s.content?.proposed_action || ""} ${s.justification || ""}`.toLowerCase();
      const hasMotoboy = MOTOBOY_KW.some(kw => text.includes(kw));
      const hasEstab = ESTAB_KW.some(kw => text.includes(kw));

      let correctId = s.content?.robot_id;
      let correctName = s.content?.robot_name;

      if (hasMotoboy && !hasEstab && robotIdMap.sebastiao) {
        correctId = robotIdMap.sebastiao.id;
        correctName = robotIdMap.sebastiao.name;
      } else if (hasEstab && !hasMotoboy && robotIdMap.julia) {
        correctId = robotIdMap.julia.id;
        correctName = robotIdMap.julia.name;
      } else if (!correctId && robotIdMap.delma) {
        correctId = robotIdMap.delma.id;
        correctName = robotIdMap.delma.name;
      }

      if (correctId && robotIdMap.sebastiao && correctId === robotIdMap.julia?.id && hasMotoboy && !hasEstab) {
        correctId = robotIdMap.sebastiao.id;
        correctName = robotIdMap.sebastiao.name;
      } else if (correctId && robotIdMap.julia && correctId === robotIdMap.sebastiao?.id && hasEstab && !hasMotoboy) {
        correctId = robotIdMap.julia.id;
        correctName = robotIdMap.julia.name;
      }

      return { ...s, content: { ...s.content, robot_id: correctId || null, robot_name: correctName || null } };
    }

    // Insert suggestions
    let insertedCount = 0;
    for (const rawS of filtered.slice(0, 8)) {
      const s = validateAndFixRobotId(rawS);
      const awaitingAttention = (pendingCounts[s.title?.toLowerCase()] || 0) >= 3;

      const { error: insertError } = await supabase.from("delma_suggestions").insert({
        category: s.type,
        title: s.title,
        justification: s.justification,
        content: {
          ...s.content,
          impact_score: s.impact_score || 50,
          impact_breakdown: s.impact_breakdown || { volume_weight: 50, tma_reduction: 50, recurrence: 50, urgency: 50 },
          data_window: s.data_window || `${dataWindowStart} a ${dataWindowEnd}`,
          conversation_count: s.conversation_count || 0,
          estimated_impact: s.estimated_impact || "",
          recurrence_pattern: s.recurrence_pattern || "pontual",
          affected_entity: s.content?.affected_entity || s.content?.robot_name || s.content?.agent_alias || null,
          awaiting_attention: awaitingAttention,
        },
        confidence_score: Math.min(100, Math.max(0, s.confidence_score || 50)),
        memories_used: [],
        status: "pending",
      });
      if (!insertError) insertedCount++;
      else console.error("Insert suggestion error:", insertError);
    }

    // Save identified patterns as data signals in delma_memory
    for (const s of filtered.slice(0, 8)) {
      await supabase.from("delma_memory").insert({
        type: "data_signal",
        source: `brain-learn-${s.type}`,
        content: {
          pattern: s.content?.pattern,
          category: s.type,
          robot_name: s.content?.robot_name,
          timestamp: new Date().toISOString(),
        },
        weight: 0.6,
        expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    diagnostics.filtered = filtered.length;
    diagnostics.inserted = insertedCount;

    // ========== GUARANTEED FALLBACK: if 0 suggestions after all attempts ==========
    if (insertedCount === 0 && diagnostics.total_processable > 0) {
      const { error: fallbackErr } = await supabase.from("delma_suggestions").insert({
        category: "melhoria_delma",
        title: "Diagnóstico: fluxo de aprendizado retornou vazio",
        justification: `A análise de ${diagnostics.total_processable} conversas do Suporte não gerou sugestões após ${attemptUsed} tentativas. Possíveis causas: conversas sem padrão identificável, base de conhecimento já cobre os temas, ou critérios de filtragem internos.`,
        content: {
          diagnostics,
          proposed_action: "Revisar critérios de análise ou expandir período para 14 dias",
          robot_name: "Delma",
          robot_id: robotIdMap.delma?.id || null,
          pattern: "Fluxo de aprendizado sem resultados",
          examples: [],
          impact_score: 30,
          conversation_count: diagnostics.total_processable,
          estimated_impact: "Permite identificar gargalos no pipeline de aprendizado",
          recurrence_pattern: "pontual",
        },
        confidence_score: 100,
        memories_used: [],
        status: "pending",
      });
      if (!fallbackErr) insertedCount = 1;
    }

    console.log(`brain-learn-from-conversations: analyzed ${(humanLogs || []).length} human + ${(robotLogs || []).length} robot conversations. Generated ${filtered.length} suggestions, inserted ${insertedCount}.`);

    return new Response(JSON.stringify({
      message: `Análise concluída! ${insertedCount} sugestões geradas.`,
      human_conversations: (humanLogs || []).length,
      robot_conversations: (robotLogs || []).length,
      suggestions_generated: insertedCount,
      diagnostics,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("brain-learn-from-conversations error:", e);
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
