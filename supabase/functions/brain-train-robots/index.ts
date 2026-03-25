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

    // 1. Fetch Suporte department and filter robots
    const { data: suporteDept } = await supabase
      .from("departments").select("id").ilike("name", "%suporte%").maybeSingle();
    const suporteDeptId = suporteDept?.id;

    const { data: allRobots, error: robotsErr } = await supabase
      .from("robots")
      .select("id, name, instructions, qa_pairs, tone, reference_links, departments")
      .in("status", ["active", "paused"]);
    if (robotsErr) throw robotsErr;

    const robots = (allRobots || []).filter((r: any) => {
      const deps: string[] = r.departments || [];
      return deps.length === 0 || (suporteDeptId && deps.includes(suporteDeptId));
    });
    if (!robots || robots.length === 0) {
      return new Response(JSON.stringify({ message: "Nenhum robô encontrado", suggestions: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Fetch conversations handled by HUMAN agents in the last 14 days
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

    const { data: humanLogs } = await supabase
      .from("conversation_logs")
      .select("contact_name, tags, messages, assigned_to_name, finalized_at, channel, total_messages")
      .gte("finalized_at", cutoff.toISOString())
      .not("assigned_to_name", "is", null)
      .order("finalized_at", { ascending: false })
      .limit(500);

    // Filter to only Suporte members if we have them
    const filteredLogs = suporteMemberNames.size > 0
      ? (humanLogs || []).filter((log: any) => suporteMemberNames.has(log.assigned_to_name))
      : (humanLogs || []);

    if (filteredLogs.length === 0) {
      return new Response(JSON.stringify({ message: "Sem conversas humanas recentes para analisar", suggestions: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Extract human-client conversation pairs
    const conversationExamples: Array<{
      agent: string;
      tags: string[];
      exchanges: Array<{ from: string; text: string }>;
    }> = [];

    for (const log of filteredLogs) {
      if (conversationExamples.length >= 30) break;
      const msgs = Array.isArray(log.messages) ? log.messages : [];
      if (msgs.length < 2) continue;

      // Extract meaningful exchanges (client question → human response)
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
        conversationExamples.push({
          agent: log.assigned_to_name,
          tags: log.tags || [],
          exchanges,
        });
      }
    }

    // 4. Fetch existing pending suggestions to avoid duplicates
    const { data: existingSuggestions } = await supabase
      .from("robot_training_suggestions")
      .select("title, robot_id")
      .eq("status", "pending");

    const existingSet = new Set(
      (existingSuggestions || []).map((s: any) => `${s.robot_id}:${s.title}`)
    );

    // 5. For each robot, generate suggestions based on human responses
    let totalSuggestions = 0;

    for (const robot of robots) {
      const existingQA = Array.isArray(robot.qa_pairs) ? robot.qa_pairs : [];
      const existingQAStr = existingQA
        .map((qa: any) => `Q: ${qa.question || qa.q}\nA: ${qa.answer || qa.a}`)
        .join("\n---\n");

      const systemPrompt = `Você é a Delma, Treinadora de IA. Sua missão é analisar como os ATENDENTES HUMANOS reais respondem aos clientes e usar isso para melhorar o robô "${robot.name}".

REGRAS:
1. Analise os padrões de linguagem dos atendentes humanos: saudações, empatia, encerramento
2. Identifique respostas humanas recorrentes que o robô NÃO tem no Q&A
3. Sugira Q&A baseados em COMO os humanos realmente respondem (tom, palavras, estrutura)
4. Compare as respostas humanas com o Q&A existente do robô — sugira melhorias onde o robô é genérico demais
5. Foque em tornar o robô mais HUMANO e empático, não apenas informativo
6. NÃO sugira Q&A que já existam na base do robô
7. Retorne um JSON com array "suggestions"

Formato de cada sugestão:
{
  "type": "qa" | "tone" | "instruction",
  "title": "título curto descritivo",
  "content": "conteúdo (para Q&A: formato 'Pergunta: ... | Resposta: ...')",
  "reasoning": "baseado em qual padrão humano observado"
}

Gere entre 2-5 sugestões relevantes. Priorize Q&A que capturem o jeito humano de responder.`;

      const conversationsSample = conversationExamples
        .slice(0, 15)
        .map((c) => {
          const dialog = c.exchanges
            .map((e) => `[${e.from}]: ${e.text}`)
            .join("\n");
          return `--- Atendente: ${c.agent} | Tags: ${c.tags.join(", ")} ---\n${dialog}`;
        })
        .join("\n\n");

      const userPrompt = `ROBÔ: ${robot.name}
TOM ATUAL: ${robot.tone}
INSTRUÇÕES ATUAIS: ${(robot.instructions || "").substring(0, 500)}

Q&A EXISTENTES (${existingQA.length} pares):
${existingQAStr.substring(0, 1500) || "Nenhum Q&A cadastrado"}

CONVERSAS REAIS COM ATENDENTES HUMANOS (últimos 14 dias):
${conversationsSample || "Nenhuma conversa disponível"}

Analise como os atendentes humanos respondem e gere sugestões para o robô "${robot.name}" parecer mais humano e resolver mais situações.`;

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

        // Parse suggestions
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

    return new Response(JSON.stringify({
      message: `Treinamento concluído! ${totalSuggestions} sugestões geradas baseadas em ${conversationExamples.length} conversas humanas.`,
      suggestions: totalSuggestions,
      robots: robots.length,
      conversationsAnalyzed: conversationExamples.length,
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
