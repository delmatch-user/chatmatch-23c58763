import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    // 1. Fetch human-handled conversations (last 7 days)
    const { data: humanLogs } = await supabase
      .from("conversation_logs")
      .select("id, contact_name, assigned_to_name, finalized_by_name, messages, tags, started_at, finalized_at, department_name, wait_time")
      .not("assigned_to_name", "is", null)
      .not("finalized_by", "is", null)
      .gte("finalized_at", cutoff)
      .order("finalized_at", { ascending: false })
      .limit(200);

    // 2. Fetch robot-handled conversations (last 7 days) - those finalized without human
    const { data: robotLogs } = await supabase
      .from("conversation_logs")
      .select("id, contact_name, assigned_to_name, finalized_by_name, messages, tags, started_at, finalized_at, department_name, wait_time")
      .is("finalized_by", null)
      .gte("finalized_at", cutoff)
      .order("finalized_at", { ascending: false })
      .limit(200);

    // 3. Fetch transfer logs to identify unnecessary transfers
    const { data: transferLogs } = await supabase
      .from("transfer_logs")
      .select("conversation_id, from_user_name, to_user_name, to_robot_name, reason, created_at")
      .gte("created_at", cutoff)
      .limit(500);

    // 4. Fetch robots for context
    const { data: robots } = await supabase
      .from("robots")
      .select("id, name, qa_pairs, departments, tone")
      .limit(20);

    // 5. Check existing suggestions for deduplication
    const { data: existingSuggestions } = await supabase
      .from("delma_suggestions")
      .select("title, category, content")
      .in("category", ["aprendizado_humano", "aprendizado_robo", "melhoria_delma"])
      .gte("created_at", deduplicationCutoff)
      .limit(100);

    // Prepare human conversation summaries
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
      };
    });

    // Prepare robot conversation summaries
    const robotSummaries = (robotLogs || []).slice(0, 30).map((log, i) => {
      const msgs = Array.isArray(log.messages) ? log.messages : [];
      const totalMsgs = msgs.length;
      return {
        index: i + 1,
        tags: (log.tags || []).slice(0, 5),
        total_messages: totalMsgs,
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
    const robotContext = (robots || []).map(r => ({
      name: r.name,
      id: r.id,
      qa_count: Array.isArray(r.qa_pairs) ? r.qa_pairs.length : 0,
      tone: r.tone,
      departments: r.departments,
    }));

    const existingTitles = (existingSuggestions || []).map(s => s.title?.toLowerCase());

    // Build the AI prompt
    const prompt = `Analise as conversas de suporte dos últimos 7 dias e gere sugestões de melhoria.

CONVERSAS HUMANAS (atendentes reais) — ${humanSummaries.length} conversas:
${JSON.stringify(humanSummaries, null, 1)}

CONVERSAS DE ROBÔS — ${robotSummaries.length} conversas:
${JSON.stringify(robotSummaries, null, 1)}

TRANSFERÊNCIAS DE ROBÔ PARA HUMANO — ${robotTransfers.length} transferências:
${JSON.stringify(robotTransfers, null, 1)}

ROBÔS CADASTRADOS:
${JSON.stringify(robotContext, null, 1)}

SUGESTÕES JÁ EXISTENTES (não duplicar):
${existingTitles.join(", ")}

Para cada padrão identificado, gere uma sugestão estruturada. Gere entre 3 e 8 sugestões no total.

Tipos possíveis:
- "aprendizado_humano": padrão aprendido com atendentes humanos (frases eficazes, abordagens empáticas, resoluções rápidas)
- "aprendizado_robo": padrão aprendido com logs dos robôs (transferências desnecessárias, gaps de Q&A, respostas genéricas)
- "melhoria_delma": a Delma propõe melhorar seu próprio comportamento ou análise

Cada sugestão deve ter:
- title: título curto e descritivo
- type: um dos tipos acima
- justification: dados que justificam (volume, período, nomes de robôs)
- confidence_score: 0-100
- content.pattern: descrição do padrão encontrado
- content.examples: array com até 3 exemplos anonimizados de mensagens
- content.proposed_action: ação concreta proposta
- content.robot_name: nome do robô (se aplicável, senão null)
- content.robot_id: id do robô (se aplicável, senão null)
- content.agent_alias: "Atendente A" etc (se aplicável, senão null)

IMPORTANTE: Não incluir dados identificáveis (nome real, telefone, email). Usar alias para atendentes.
Não duplicar sugestões já existentes.`;

    // Call AI
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
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "AI analysis failed", status: aiResponse.status }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    let suggestions: any[] = [];

    // Parse tool call response
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
      // Try parsing from content as fallback
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

    // Deduplicate against existing suggestions
    const filtered = suggestions.filter(s => {
      const titleLower = s.title?.toLowerCase();
      return !existingTitles.some(existing => 
        existing && titleLower && (
          existing === titleLower ||
          existing.includes(titleLower) ||
          titleLower.includes(existing)
        )
      );
    });

    // Insert suggestions into delma_suggestions
    let insertedCount = 0;
    for (const s of filtered.slice(0, 8)) {
      const { error: insertError } = await supabase.from("delma_suggestions").insert({
        category: s.type,
        title: s.title,
        justification: s.justification,
        content: s.content,
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

    console.log(`brain-learn-from-conversations: analyzed ${(humanLogs || []).length} human + ${(robotLogs || []).length} robot conversations. Generated ${filtered.length} suggestions, inserted ${insertedCount}.`);

    return new Response(JSON.stringify({
      message: `Análise concluída! ${insertedCount} sugestões geradas.`,
      human_conversations: (humanLogs || []).length,
      robot_conversations: (robotLogs || []).length,
      suggestions_generated: insertedCount,
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
