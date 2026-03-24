import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TAG_NORMALIZATION: Record<string, string> = {
  'ACIDENTE_URGENTE': 'Acidente - Urgente',
  'FINANCEIRO_NORMAL': 'Financeiro - Normal',
  'DUVIDA_GERAL': 'Duvida - Geral',
  'COMERCIAL_B2B': 'Comercial - B2B',
  'OPERACIONAL_PENDENTE': 'Operacional - Geral',
  'Operacional - Normal': 'Operacional - Geral',
  'Operacional - Pendente': 'Operacional - Geral',
};

function normalizeTag(tag: string): string {
  const clean = tag.replace(/^[^\w\sÀ-ú-]+\s*/u, '').trim();
  return TAG_NORMALIZATION[clean] || clean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { period = 7, metricsOnly = false, userContext: reqUserContext = '', periodStart: reqPeriodStart, periodEnd: reqPeriodEnd } = await req.json();
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    
    // Use explicit date range if provided, otherwise fallback to rolling window
    let effectiveStart: string;
    let effectiveEnd: string;
    let prevStart: string;
    let prevEnd: string;
    
    if (reqPeriodStart && reqPeriodEnd) {
      effectiveStart = reqPeriodStart;
      effectiveEnd = reqPeriodEnd;
      // Calculate previous period with same duration
      const startMs = new Date(reqPeriodStart).getTime();
      const endMs = new Date(reqPeriodEnd).getTime();
      const durationMs = endMs - startMs;
      prevStart = new Date(startMs - durationMs).toISOString();
      prevEnd = reqPeriodStart;
    } else {
      effectiveStart = new Date(now.getTime() - period * 24 * 60 * 60 * 1000).toISOString();
      effectiveEnd = now.toISOString();
      prevStart = new Date(now.getTime() - period * 2 * 24 * 60 * 60 * 1000).toISOString();
      prevEnd = effectiveStart;
    }

    // Fetch current period logs
    const { data: currentLogs, error: logsError } = await supabase
      .from("conversation_logs")
      .select("*")
      .gte("finalized_at", effectiveStart)
      .lte("finalized_at", effectiveEnd)
      .is("reset_at", null)
      .order("finalized_at", { ascending: false })
      .limit(5000);

    if (logsError) throw logsError;

    // Fetch previous period logs for comparison
    const { data: prevLogs } = await supabase
      .from("conversation_logs")
      .select("started_at, finalized_at, wait_time, assigned_to_name, department_name, tags, priority, channel")
      .gte("finalized_at", prevStart)
      .lt("finalized_at", prevEnd)
      .is("reset_at", null)
      .limit(5000);

    // Calculate metrics
    const logs = currentLogs || [];
    const prev = prevLogs || [];

    const totalConversas = logs.length;
    const prevTotalConversas = prev.length;

    // TMA (tempo médio de atendimento em minutos)
    const tmaValues = logs
      .filter(l => l.started_at && l.finalized_at)
      .map(l => (new Date(l.finalized_at).getTime() - new Date(l.started_at).getTime()) / 60000);
    const tma = tmaValues.length > 0 ? tmaValues.reduce((a, b) => a + b, 0) / tmaValues.length : 0;

    const prevTmaValues = prev
      .filter(l => l.started_at && l.finalized_at)
      .map(l => (new Date(l.finalized_at).getTime() - new Date(l.started_at).getTime()) / 60000);
    const prevTma = prevTmaValues.length > 0 ? prevTmaValues.reduce((a, b) => a + b, 0) / prevTmaValues.length : 0;

    // TME (tempo médio de espera em minutos)
    const tmeValues = logs.filter(l => l.wait_time != null).map(l => l.wait_time! / 60);
    const tme = tmeValues.length > 0 ? tmeValues.reduce((a, b) => a + b, 0) / tmeValues.length : 0;

    const prevTmeValues = prev.filter(l => l.wait_time != null).map(l => l.wait_time! / 60);
    const prevTme = prevTmeValues.length > 0 ? prevTmeValues.reduce((a, b) => a + b, 0) / prevTmeValues.length : 0;

    // AI vs Human resolution
    const aiResolved = logs.filter(l => !l.assigned_to_name || l.assigned_to_name === '').length;
    const humanResolved = logs.filter(l => l.assigned_to_name && l.assigned_to_name !== '').length;

    // Top tags
    const tagCounts: Record<string, number> = {};
    logs.forEach(l => (l.tags || []).forEach((t: string) => { const nt = normalizeTag(t); tagCounts[nt] = (tagCounts[nt] || 0) + 1; }));
    const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

    // Previous period top tags for comparison
    const prevTagCounts: Record<string, number> = {};
    prev.forEach(l => (l.tags || []).forEach((t: string) => { const nt = normalizeTag(t); prevTagCounts[nt] = (prevTagCounts[nt] || 0) + 1; }));
    const prevTopTags = Object.entries(prevTagCounts).sort((a, b) => b[1] - a[1]).slice(0, 20);

    // Hourly error distribution for heatmap
    const errorHourly: Record<string, Record<number, number>> = { estabelecimento: {}, motoboy: {}, outros: {} };

    // Channel breakdown
    const channelCounts: Record<string, number> = {};
    logs.forEach(l => { const ch = l.channel || 'whatsapp'; channelCounts[ch] = (channelCounts[ch] || 0) + 1; });

    // Priority breakdown
    const priorityCounts: Record<string, number> = {};
    logs.forEach(l => { priorityCounts[l.priority] = (priorityCounts[l.priority] || 0) + 1; });

    // === NEW: Daily Trends (TMA/TME per day) ===
    const dailyBuckets: Record<string, { tmaSum: number; tmaCount: number; tmeSum: number; tmeCount: number; urgentCount: number }> = {};
    logs.forEach(l => {
      const day = (l.finalized_at || '').substring(0, 10); // YYYY-MM-DD
      if (!day) return;
      if (!dailyBuckets[day]) dailyBuckets[day] = { tmaSum: 0, tmaCount: 0, tmeSum: 0, tmeCount: 0, urgentCount: 0 };
      if (l.started_at && l.finalized_at) {
        const dur = (new Date(l.finalized_at).getTime() - new Date(l.started_at).getTime()) / 60000;
        dailyBuckets[day].tmaSum += dur;
        dailyBuckets[day].tmaCount++;
      }
      if (l.wait_time != null) {
        dailyBuckets[day].tmeSum += l.wait_time / 60;
        dailyBuckets[day].tmeCount++;
      }
      if (l.priority === 'urgent') {
        dailyBuckets[day].urgentCount++;
      }
    });
    const dailyTrends = Object.entries(dailyBuckets)
      .map(([date, b]) => ({
        date,
        tma: b.tmaCount > 0 ? Math.round((b.tmaSum / b.tmaCount) * 10) / 10 : 0,
        tme: b.tmeCount > 0 ? Math.round((b.tmeSum / b.tmeCount) * 10) / 10 : 0,
        urgent: b.urgentCount,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // === NEW: Abandon Rate ===
    // Conversations that were finalized without being assigned to anyone (no human, no robot)
    const abandonedCount = logs.filter(l =>
      (!l.assigned_to_name || l.assigned_to_name === '') &&
      (!l.assigned_to || l.assigned_to === null)
    ).length;
    const abandonRate = totalConversas > 0 ? Math.round((abandonedCount / totalConversas) * 1000) / 10 : 0;

    // Agent performance — only agents from "Suporte" department
    const suporteLogs = logs.filter(l => l.assigned_to_name && l.department_name && l.department_name.toLowerCase() === 'suporte');
    const agentStats: Record<string, { count: number; totalTime: number; totalWait: number; waitCount: number; tags: Record<string, number>; channels: Record<string, number>; transferredOut: number }> = {};
    const agentDailyStats: Record<string, Record<string, { count: number; tmaSum: number; tmaCount: number; tmeSum: number; tmeCount: number }>> = {};
    suporteLogs.forEach(l => {
      const name = l.assigned_to_name!;
      if (!agentStats[name]) agentStats[name] = { count: 0, totalTime: 0, totalWait: 0, waitCount: 0, tags: {}, channels: {}, transferredOut: 0 };
      agentStats[name].count++;
      const ch = l.channel || 'whatsapp';
      agentStats[name].channels[ch] = (agentStats[name].channels[ch] || 0) + 1;
      if (l.started_at && l.finalized_at) {
        agentStats[name].totalTime += (new Date(l.finalized_at).getTime() - new Date(l.started_at).getTime()) / 60000;
      }
      if (l.wait_time != null) {
        agentStats[name].totalWait += l.wait_time / 60;
        agentStats[name].waitCount++;
      }
      (l.tags || []).forEach((t: string) => { const nt = normalizeTag(t); agentStats[name].tags[nt] = (agentStats[name].tags[nt] || 0) + 1; });
      // Daily breakdown per agent
      const day = (l.finalized_at || '').substring(0, 10);
      if (day) {
        if (!agentDailyStats[name]) agentDailyStats[name] = {};
        if (!agentDailyStats[name][day]) agentDailyStats[name][day] = { count: 0, tmaSum: 0, tmaCount: 0, tmeSum: 0, tmeCount: 0 };
        agentDailyStats[name][day].count++;
        if (l.started_at && l.finalized_at) {
          const dur = (new Date(l.finalized_at).getTime() - new Date(l.started_at).getTime()) / 60000;
          agentDailyStats[name][day].tmaSum += dur;
          agentDailyStats[name][day].tmaCount++;
        }
        if (l.wait_time != null) {
          agentDailyStats[name][day].tmeSum += l.wait_time / 60;
          agentDailyStats[name][day].tmeCount++;
        }
      }
    });

    // Count transfers per agent for resolution rate
    const { data: transferLogs } = await supabase
      .from("transfer_logs")
      .select("from_user_name")
      .gte("created_at", periodStart)
      .limit(1000);
    (transferLogs || []).forEach((t: any) => {
      if (t.from_user_name && agentStats[t.from_user_name]) {
        agentStats[t.from_user_name].transferredOut++;
      }
    });

    // Previous period agent stats — also only "Suporte"
    const prevAgentStats: Record<string, { count: number; totalTime: number }> = {};
    prev.filter(l => l.assigned_to_name && l.department_name && l.department_name.toLowerCase() === 'suporte').forEach(l => {
      const name = l.assigned_to_name!;
      if (!prevAgentStats[name]) prevAgentStats[name] = { count: 0, totalTime: 0 };
      prevAgentStats[name].count++;
      if (l.started_at && l.finalized_at) {
        prevAgentStats[name].totalTime += (new Date(l.finalized_at).getTime() - new Date(l.started_at).getTime()) / 60000;
      }
    });

    // Errors / forced transfers (high priority or urgent without resolution)
    const errorLogs = logs.filter(l =>
      l.priority === 'urgent' || l.priority === 'high' ||
      (l.tags || []).some((t: string) => t.toLowerCase().includes('erro') || t.toLowerCase().includes('reclamação') || t.toLowerCase().includes('insatisf'))
    ).slice(0, 50);

    const taxonomyTags = ['Acidente - Urgente', 'Operacional - Geral', 'Financeiro - Normal', 'Duvida - Geral', 'Comercial - B2B'];

    const mapErrorLog = (l: any) => ({
      id: l.id,
      contact_name: l.contact_name,
      contact_phone: l.contact_phone,
      contact_notes: l.contact_notes,
      priority: l.priority,
      tags: (l.tags || []).map((t: string) => normalizeTag(t)),
      channel: l.channel,
      assigned_to_name: l.assigned_to_name,
      finalized_at: l.finalized_at,
      started_at: l.started_at,
    });

    // Keywords for intelligent classification
    const ESTAB_KEYWORDS = ['estabelecimento', 'loja', 'restaurante', 'comercio', 'comércio', 'mercado', 'padaria', 'farmacia', 'farmácia', 'pizzaria', 'lanchonete', 'bar ', 'sorveteria', 'açougue', 'acougue', 'supermercado', 'conveniencia', 'conveniência', 'parceiro', 'parceira'];
    const MOTOBOY_KEYWORDS = ['motoboy', 'entregador', 'motoqueiro', 'motoca', 'bike', 'biker', 'moto boy', 'motofretista', 'ciclista', 'bikeboy', 'bike boy'];

    // Classify errors by type analyzing tags → contact_notes → messages
    const classifyType = (log: any): string => {
      const tags = log.tags || [];
      if (tags.some((t: string) => t === 'Estabelecimento')) return 'estabelecimento';
      if (tags.some((t: string) => t === 'Motoboy')) return 'motoboy';
      const notes = (log.contact_notes || '').toLowerCase();
      if (ESTAB_KEYWORDS.some(k => notes.includes(k))) return 'estabelecimento';
      if (MOTOBOY_KEYWORDS.some(k => notes.includes(k))) return 'motoboy';
      const msgs = Array.isArray(log.messages) ? log.messages.slice(0, 10) : [];
      const msgText = msgs.map((m: any) => ((m.content || m.text || '') as string).toLowerCase()).join(' ');
      if (ESTAB_KEYWORDS.some(k => msgText.includes(k))) return 'estabelecimento';
      if (MOTOBOY_KEYWORDS.some(k => msgText.includes(k))) return 'motoboy';
      return 'outros';
    };

    const buildTypeGroup = (filteredLogs: any[]) => {
      const motivos: Record<string, number> = {};
      filteredLogs.forEach(l => {
        (l.tags || []).forEach((t: string) => {
          if (taxonomyTags.includes(t)) {
            motivos[t] = (motivos[t] || 0) + 1;
          }
        });
      });
      return { total: filteredLogs.length, motivos, logs: filteredLogs.map(mapErrorLog) };
    };

    const estabLogs = errorLogs.filter(l => classifyType(l) === 'estabelecimento');
    const motoboyLogs = errorLogs.filter(l => classifyType(l) === 'motoboy');
    const outrosLogs = errorLogs.filter(l => classifyType(l) === 'outros');

    // Build hourly heatmap for errors
    const buildHourly = (filtered: any[]) => {
      const hourly: Record<number, number> = {};
      filtered.forEach(l => {
        if (l.finalized_at) {
          const h = new Date(l.finalized_at).getHours();
          hourly[h] = (hourly[h] || 0) + 1;
        }
      });
      return hourly;
    };

    const errorsByType = {
      estabelecimento: { ...buildTypeGroup(estabLogs), hourly: buildHourly(estabLogs) },
      motoboy: { ...buildTypeGroup(motoboyLogs), hourly: buildHourly(motoboyLogs) },
      outros: { ...buildTypeGroup(outrosLogs), hourly: buildHourly(outrosLogs) },
    };

    // Previous period error tags for recurrence detection
    const prevErrorLogs = prev.filter(l =>
      l.priority === 'urgent' || l.priority === 'high' ||
      (l.tags || []).some((t: string) => t.toLowerCase().includes('erro') || t.toLowerCase().includes('reclamação'))
    );
    const prevErrorTagCounts: Record<string, number> = {};
    prevErrorLogs.forEach(l => (l.tags || []).forEach((t: string) => { const nt = normalizeTag(t); prevErrorTagCounts[nt] = (prevErrorTagCounts[nt] || 0) + 1; }));

    const metrics = {
      period,
      totalConversas,
      prevTotalConversas,
      tma: Math.round(tma * 10) / 10,
      prevTma: Math.round(prevTma * 10) / 10,
      tme: Math.round(tme * 10) / 10,
      prevTme: Math.round(prevTme * 10) / 10,
      aiResolved,
      humanResolved,
      topTags,
      prevTopTags,
      channelCounts,
      priorityCounts,
      dailyTrends,
      abandonRate,
      abandonedCount,
      prevErrorTags: prevErrorTagCounts,
      agentStats: Object.entries(agentStats).map(([name, stats]) => {
        const prevS = prevAgentStats[name];
        const topTags = Object.entries(stats.tags).sort((a, b) => b[1] - a[1]).slice(0, 3);
        const resolutionRate = stats.count > 0 ? Math.round(((stats.count - stats.transferredOut) / stats.count) * 1000) / 10 : 100;
        return {
          name,
          count: stats.count,
          avgTime: Math.round((stats.totalTime / stats.count) * 10) / 10,
          avgWaitTime: stats.waitCount > 0 ? Math.round((stats.totalWait / stats.waitCount) * 10) / 10 : 0,
          topTags,
          channels: stats.channels,
          resolutionRate,
          prevCount: prevS?.count || 0,
          prevAvgTime: prevS ? Math.round((prevS.totalTime / prevS.count) * 10) / 10 : 0,
        };
      }).sort((a, b) => b.count - a.count),
      errorLogs: errorLogs.map(mapErrorLog),
      errorsByType,
    };

    // If metricsOnly, skip AI call
    if (metricsOnly) {
      return new Response(JSON.stringify({ metrics }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate AI analysis with robust fallback chain
    let aiAnalysis = "";
    let providerUsed = "";
    let fallbackUsed = false;
    let fallbackError = "";

    // Build granular agent daily breakdown for the prompt
    const agentDailyBlock = Object.entries(agentDailyStats).map(([name, days]) => {
      const dayLines = Object.entries(days).sort(([a], [b]) => a.localeCompare(b)).map(([day, d]) => {
        const tma = d.tmaCount > 0 ? Math.round((d.tmaSum / d.tmaCount) * 10) / 10 : 0;
        const tme = d.tmeCount > 0 ? Math.round((d.tmeSum / d.tmeCount) * 10) / 10 : 0;
        return `  ${day}: ${d.count} conversas, TMA ${tma}min, TME ${tme}min`;
      }).join('\n');
      const allTags = agentStats[name] ? Object.entries(agentStats[name].tags).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${t}(${c})`).join(', ') : '';
      const agentErrors = errorLogs.filter(l => l.assigned_to_name === name);
      return `${name}:\n${dayLines}\n  Tags: ${allTags || 'nenhuma'}\n  Problemáticas: ${agentErrors.length}`;
    }).join('\n');

    // Build daily trends for the prompt
    const dailyTrendsBlock = dailyTrends.map(d => `  ${d.date}: TMA ${d.tma}min, TME ${d.tme}min, Urgentes: ${d.urgent}`).join('\n');

    // Build error logs per agent
    const agentErrorBlock = Object.keys(agentStats).map(name => {
      const errs = errorLogs.filter(l => l.assigned_to_name === name);
      if (errs.length === 0) return null;
      const details = errs.slice(0, 5).map(e => `    - ${e.contact_name || 'Anônimo'} | tags: ${(e.tags || []).join(', ')} | prioridade: ${e.priority}`).join('\n');
      return `${name} (${errs.length} problemáticas):\n${details}`;
    }).filter(Boolean).join('\n');

    const metricsBlock = `**Métricas do período (últimos ${period} dias):**
- Total de conversas: ${totalConversas} (anterior: ${prevTotalConversas})
- TMA: ${metrics.tma} min (anterior: ${metrics.prevTma} min)
- TME: ${metrics.tme} min (anterior: ${metrics.prevTme} min)
- Taxa de Abandono: ${metrics.abandonRate}% (${metrics.abandonedCount} conversas)
- Resolvidas por IA: ${aiResolved} | Por humano: ${humanResolved}
- Top tags: ${topTags.map(([t, c]: [string, number]) => t + " (" + c + ")").join(', ')}
- Canais: ${Object.entries(channelCounts).map(([c, n]) => c + ": " + n).join(', ')}
- Prioridades: ${Object.entries(priorityCounts).map(([p, n]) => p + ": " + n).join(', ')}
- Performance agentes (resumo): ${metrics.agentStats.map((a: any) => a.name + ": " + a.count + " conversas, TMA " + a.avgTime + "min, TME " + a.avgWaitTime + "min, Resolução " + a.resolutionRate + "%").join('; ')}
- Conversas problemáticas: ${errorLogs.length} (alta prioridade, erros ou reclamações)

**Dados diários por agente (detalhado):**
${agentDailyBlock || 'Sem dados de agentes'}

**Tendências diárias globais:**
${dailyTrendsBlock || 'Sem dados'}

**Conversas problemáticas por agente:**
${agentErrorBlock || 'Nenhuma conversa problemática atribuída a agentes'}`;

    const systemMessage = reqUserContext
      ? "Você é a Delma, gerente inteligente do departamento de Suporte. O gestor fez uma solicitação específica abaixo. " +
        "Você tem acesso a TODOS os dados necessários — dados diários por agente, tags, conversas problemáticas, tendências globais. " +
        "NUNCA diga que não tem dados ou que não consegue puxar informações. Todos os dados estão abaixo. " +
        "Você DEVE responder EXATAMENTE o que foi pedido, usando os dados disponíveis. " +
        "NÃO gere um relatório genérico. Foque 100% na solicitação do gestor. " +
        "Se o gestor pedir sobre um atendente específico, foque APENAS nesse atendente usando os dados diários detalhados. " +
        "Se pedir uma análise específica, faça APENAS essa análise. " +
        "Responda em português brasileiro com markdown."
      : "Você é a Delma, uma gerente de suporte altamente analítica e proativa. Você tem acesso a todos os dados do período. Gere relatórios claros e acionáveis. NUNCA diga que não tem dados.";

    const userMessage = reqUserContext
      ? `## SOLICITAÇÃO DO GESTOR (PRIORIDADE MÁXIMA — SIGA À RISCA):\n\n${reqUserContext}\n\n---\n\nDados disponíveis para embasar sua resposta:\n\n${metricsBlock}`
      : `Analise as métricas abaixo e gere um relatório executivo em markdown com:

## Resumo Executivo
Visão geral do desempenho do período.

## Pontos Positivos
O que está funcionando bem.

## Problemas Identificados
Erros recorrentes, gaps de conhecimento dos robôs, gargalos operacionais.

## Sugestões de Melhoria
Ações concretas e priorizadas para melhorar o desempenho.

## Comparativo com Período Anterior
Tendências de melhora ou piora nos KPIs.

## Alertas
Situações que precisam de atenção imediata.

---

${metricsBlock}

Seja direta, objetiva e use dados para embasar cada ponto. Responda em português brasileiro.`;

    const aiMessages = [
      { role: "system", content: systemMessage },
      { role: "user", content: userMessage },
    ];

    // 1. Try Lovable AI with GPT-5.2 (primary for Delma Cérebro)
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!aiAnalysis && LOVABLE_API_KEY) {
      try {
        console.log("[brain-analysis] Tentando Lovable AI (GPT-5.2)...");
        const gptResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-5.2",
            messages: aiMessages,
          }),
        });

        if (gptResp.ok) {
          const gptData = await gptResp.json();
          aiAnalysis = gptData.choices?.[0]?.message?.content || "";
          providerUsed = "GPT-5.2";
          console.log("[brain-analysis] GPT-5.2 OK");
        } else {
          const errBody = await gptResp.text();
          fallbackError = `GPT-5.2: HTTP ${gptResp.status} — ${errBody.substring(0, 200)}`;
          console.warn("[brain-analysis] GPT-5.2 falhou:", gptResp.status, errBody);
        }
      } catch (e: any) {
        fallbackError = `GPT-5.2: ${e.message || 'Timeout/Network error'}`;
        console.error("[brain-analysis] GPT-5.2 error:", e);
      }
    }

    // 2. Fallback: Lovable AI with Gemini Flash
    if (!aiAnalysis && LOVABLE_API_KEY) {
      try {
        console.log("[brain-analysis] Fallback para Lovable AI...");
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: aiMessages,
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          aiAnalysis = aiData.choices?.[0]?.message?.content || "";
          providerUsed = "Lovable AI";
          fallbackUsed = true;
          console.log("[brain-analysis] Lovable AI OK");
        } else {
          console.warn("[brain-analysis] Lovable AI falhou:", aiResponse.status);
        }
      } catch (e) {
        console.error("[brain-analysis] Lovable AI error:", e);
      }
    }

    // 3. Deterministic fallback (no AI) — always produces content
    if (!aiAnalysis) {
      console.log("[brain-analysis] Gerando relatório determinístico (sem IA)...");
      providerUsed = "Automático";
      fallbackUsed = true;
      const tmaDir = metrics.tma < metrics.prevTma ? '⬇️ melhorou' : metrics.tma > metrics.prevTma ? '⬆️ piorou' : '➡️ estável';
      const tmeDir = metrics.tme < metrics.prevTme ? '⬇️ melhorou' : metrics.tme > metrics.prevTme ? '⬆️ piorou' : '➡️ estável';
      const topTagsList = topTags.slice(0, 5).map(([t, c]: [string, number]) => `- ${t}: ${c} ocorrências`).join('\n');
      const agentList = metrics.agentStats.slice(0, 5).map((a: any) => `- ${a.name}: ${a.count} conversas, TMA ${a.avgTime}min`).join('\n');
      
      aiAnalysis = `## Resumo Executivo (Gerado Automaticamente)

**Período:** últimos ${period} dias | **Total:** ${totalConversas} conversas

## KPIs
| Métrica | Atual | Anterior | Tendência |
|---------|-------|----------|-----------|
| Total | ${totalConversas} | ${prevTotalConversas} | ${totalConversas > prevTotalConversas ? '⬆️' : '⬇️'} |
| TMA | ${metrics.tma} min | ${metrics.prevTma} min | ${tmaDir} |
| TME | ${metrics.tme} min | ${metrics.prevTme} min | ${tmeDir} |
| Abandono | ${metrics.abandonRate}% | - | ${metrics.abandonRate > 10 ? '⚠️' : '✅'} |

## Resolução
- IA: ${aiResolved} (${totalConversas > 0 ? Math.round((aiResolved / totalConversas) * 100) : 0}%)
- Humano: ${humanResolved} (${totalConversas > 0 ? Math.round((humanResolved / totalConversas) * 100) : 0}%)

## Top Classificações
${topTagsList || '- Sem dados'}

## Agentes
${agentList || '- Sem dados'}

## Alertas
- Conversas problemáticas: ${errorLogs.length}

> ⚠️ Este relatório foi gerado automaticamente sem análise de IA. Configure um provedor de IA para relatórios mais detalhados.`;
    }

    return new Response(JSON.stringify({ metrics, aiAnalysis, providerUsed, fallbackUsed, fallbackError }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("brain-analysis error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
