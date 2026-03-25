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

    // 2. Fetch conversation logs from last 7 days that had errors/gaps
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);

    const { data: errorLogs } = await supabase
      .from("conversation_logs")
      .select("contact_name, tags, messages, assigned_to_name, finalized_at, channel")
      .gte("finalized_at", cutoff.toISOString())
      .order("finalized_at", { ascending: false })
      .limit(500);

    // 3. Fetch existing pending suggestions to avoid duplicates
    const { data: existingSuggestions } = await supabase
      .from("robot_training_suggestions")
      .select("title, robot_id")
      .eq("status", "pending");

    const existingSet = new Set(
      (existingSuggestions || []).map((s: any) => `${s.robot_id}:${s.title}`)
    );

    // 4. Analyze gaps - find tags/topics with no Q&A coverage
    const tagCounts: Record<string, number> = {};
    const sampleConversations: Array<{ tags: string[]; messages: any[]; contact: string }> = [];

    (errorLogs || []).forEach((log: any) => {
      (log.tags || []).forEach((tag: string) => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
      if (sampleConversations.length < 20) {
        const msgs = Array.isArray(log.messages) ? log.messages.slice(0, 5) : [];
        sampleConversations.push({
          tags: log.tags || [],
          messages: msgs,
          contact: log.contact_name,
        });
      }
    });

    // Sort tags by frequency
    const topGapTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);

    if (topGapTags.length === 0 && sampleConversations.length === 0) {
      return new Response(JSON.stringify({ message: "Sem dados suficientes para gerar sugestões", suggestions: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. For each robot, generate suggestions using AI
    let totalSuggestions = 0;

    for (const robot of robots) {
      const existingQA = Array.isArray(robot.qa_pairs) ? robot.qa_pairs : [];
      const existingQAStr = existingQA.map((qa: any) => `Q: ${qa.question || qa.q}\nA: ${qa.answer || qa.a}`).join("\n---\n");

      const systemPrompt = `Você é a Delma, Gerente de Suporte e Treinadora de IA. Analise os gaps de conhecimento e conversas recentes para gerar sugestões de melhoria para o robô "${robot.name}".

REGRAS:
1. Gere sugestões de Q&A para temas que o robô não cobre adequadamente
2. Sugira ajustes de tom para que o robô pareça mais humano e empático
3. Base suas sugestões nos dados REAIS das conversas
4. NÃO sugira Q&A que já existam na base do robô
5. Cada sugestão deve ter um título curto e conteúdo prático
6. Retorne um JSON com array "suggestions"

Formato de cada sugestão:
{
  "type": "qa" | "tone" | "instruction",
  "title": "título curto descritivo",
  "content": "conteúdo da sugestão (para Q&A: formato 'Pergunta: ... | Resposta: ...')",
  "reasoning": "por que esta sugestão é necessária"
}

Gere entre 2-5 sugestões relevantes. Se não houver gaps claros, retorne array vazio.`;

      const userPrompt = `ROBÔ: ${robot.name}
TOM ATUAL: ${robot.tone}
INSTRUÇÕES ATUAIS: ${(robot.instructions || "").substring(0, 500)}

Q&A EXISTENTES (${existingQA.length} pares):
${existingQAStr.substring(0, 1500) || "Nenhum Q&A cadastrado"}

TOP TAGS COM GAPS (últimos 7 dias):
${topGapTags.map(([tag, count]) => `- ${tag}: ${count} ocorrências`).join("\n")}

EXEMPLOS DE CONVERSAS RECENTES (primeiras mensagens):
${sampleConversations.slice(0, 5).map(c => 
  `[Tags: ${c.tags.join(", ")}] ${c.messages.map((m: any) => `${m.sender_name || "?"}: ${(m.content || "").substring(0, 100)}`).join(" | ")}`
).join("\n")}

Gere sugestões de melhoria para este robô.`;

      try {
        // Try GPT-5.2, fallback to Gemini
        let aiResponse = "";
        let model = "openai/gpt-5.2";

        try {
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
          aiResponse = data.choices?.[0]?.message?.content || "";
        } catch {
          model = "google/gemini-2.5-flash";
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

          if (!resp.ok) throw new Error(`Gemini fallback error: ${resp.status}`);
          const data = await resp.json();
          aiResponse = data.choices?.[0]?.message?.content || "";
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
          if (existingSet.has(key)) continue; // Skip duplicates

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
      message: `Treinamento concluído! ${totalSuggestions} sugestões geradas.`,
      suggestions: totalSuggestions,
      robots: robots.length,
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
