import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { agentName, agentStats, teamAvgTma, teamAvgTme, periodLabel } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const topTagsStr = (agentStats.topTags || []).slice(0, 3).map(([t, c]: [string, number]) => `${t} (${c})`).join(", ") || "N/A";
    const tmaDiff = teamAvgTma > 0 ? Math.round(((agentStats.avgTime - teamAvgTma) / teamAvgTma) * 100) : 0;
    const tmaComparison = tmaDiff > 0 ? `${tmaDiff}% acima da média do time` : tmaDiff < 0 ? `${Math.abs(tmaDiff)}% abaixo da média do time` : "na média do time";

    const systemPrompt = `Você é a Delma, Gerente de Suporte. Escreva um feedback de desempenho individual para um atendente. Tom: formal e direto — sem elogios excessivos, sem linguagem casual. Estrutura obrigatória:
1. Saudação com o nome do atendente
2. Resumo objetivo do desempenho no período
3. Ponto de atenção (se houver métrica abaixo da média) OU reconhecimento de destaque (se acima)
4. Orientação clara de próximo passo
5. Assinatura: Delma — Gerente de Suporte

Mantenha a mensagem entre 150-300 palavras. Não use markdown, apenas texto plano.`;

    const userPrompt = `Gere o feedback para o atendente com os seguintes dados:
- Nome: ${agentName}
- Período: ${periodLabel}
- Conversas atendidas: ${agentStats.count}
- TMA individual: ${Math.round(agentStats.avgTime)} min (média do time: ${Math.round(teamAvgTma)} min) — ${tmaComparison}
- TME individual: ${Math.round(agentStats.avgWaitTime)} min (média do time: ${Math.round(teamAvgTme)} min)
- Top 3 tags: ${topTagsStr}
- Taxa de resolução: ${agentStats.resolutionRate != null ? `${agentStats.resolutionRate}%` : "não disponível"}`;

    // Try GPT-5.2 first, fallback to Gemini
    let message = "";
    let providerUsed = "openai/gpt-5.2";

    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-5.2",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (!response.ok) {
        if (response.status === 429 || response.status === 402) {
          throw new Error(`rate_limited_${response.status}`);
        }
        throw new Error(`GPT error: ${response.status}`);
      }

      const data = await response.json();
      message = data.choices?.[0]?.message?.content || "";
    } catch (e) {
      console.warn("GPT-5.2 failed, trying Gemini fallback:", e);
      providerUsed = "google/gemini-2.5-flash";

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit excedido. Tente novamente em alguns segundos." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (status === 402) {
          return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione fundos em Settings > Workspace > Usage." }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw new Error(`Gemini fallback error: ${status}`);
      }

      const data = await response.json();
      message = data.choices?.[0]?.message?.content || "";
    }

    if (!message) throw new Error("Empty AI response");

    return new Response(JSON.stringify({ message, providerUsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("brain-agent-feedback error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
