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

    // Check observation mode
    const { data: obsMode } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "delma_observation_mode")
      .maybeSingle();
    const isObservationMode = obsMode?.value === "true";

    // Load existing memories for calibration
    const { data: memories } = await supabase
      .from("delma_memory")
      .select("*")
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(200);
    const activeMemories = memories || [];

    // Load existing pending suggestions to avoid duplicates
    const { data: existingSuggestions } = await supabase
      .from("delma_suggestions")
      .select("title, category")
      .eq("status", "pending");
    const existingSet = new Set((existingSuggestions || []).map((s: any) => `${s.category}:${s.title}`));

    let totalSuggestions = 0;

    // ========== MODULE 1: Agent Goals Analysis ==========
    const agentGoalsSuggestions = await analyzeAgentGoals(supabase, activeMemories, existingSet);
    totalSuggestions += agentGoalsSuggestions;

    // ========== MODULE 2: Smart Report Scheduling ==========
    const reportSuggestions = await analyzeReportPatterns(supabase, LOVABLE_API_KEY, activeMemories, existingSet);
    totalSuggestions += reportSuggestions;

    // ========== MODULE 3: Training Enrichment ==========
    const trainingSuggestions = await enrichTrainingSuggestions(supabase, activeMemories);

    // Store data signals as memories (observation mode still generates memories)
    await storeDataSignals(supabase);

    return new Response(JSON.stringify({
      message: isObservationMode
        ? `Delma em modo observação. ${totalSuggestions} sugestões geradas (não exibidas). Memórias atualizadas.`
        : `Análise completa! ${totalSuggestions} sugestões geradas, ${trainingSuggestions} treinamentos enriquecidos.`,
      suggestions: totalSuggestions,
      enriched: trainingSuggestions,
      observation_mode: isObservationMode,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("delma-autonomous-analysis error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// MODULE 1: Analyze agent performance over 3 weeks and suggest goal adjustments
async function analyzeAgentGoals(
  supabase: any,
  memories: any[],
  existingSet: Set<string>
): Promise<number> {
  let count = 0;
  const now = new Date();
  const threeWeeksAgo = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Fetch conversation logs from last 3 weeks (Suporte only)
  const { data: logs } = await supabase
    .from("conversation_logs")
    .select("assigned_to, assigned_to_name, finalized_at, started_at, total_messages, wait_time, department_name")
    .eq("department_name", "Suporte")
    .gte("finalized_at", threeWeeksAgo.toISOString())
    .order("finalized_at", { ascending: true });

  if (!logs || logs.length === 0) return 0;

  // Fetch Suporte department members to filter
  const { data: suporteDept } = await supabase
    .from("departments")
    .select("id")
    .ilike("name", "%suporte%")
    .limit(1)
    .maybeSingle();
  
  let suporteMemberIds = new Set<string>();
  if (suporteDept) {
    const { data: memberLinks } = await supabase
      .from("profile_departments")
      .select("profile_id")
      .eq("department_id", suporteDept.id);
    if (memberLinks) {
      suporteMemberIds = new Set(memberLinks.map((m: any) => m.profile_id));
    }
  }

  // Group by agent and week — only Suporte members
  const agentWeeks: Record<string, { week1: any[]; week2: any[]; week3: any[] }> = {};
  
  for (const log of logs) {
    if (!log.assigned_to || !log.assigned_to_name) continue;
    // Skip agents not in Suporte department
    if (suporteMemberIds.size > 0 && !suporteMemberIds.has(log.assigned_to)) continue;
    const key = log.assigned_to;
    if (!agentWeeks[key]) agentWeeks[key] = { week1: [], week2: [], week3: [] };
    
    const finalizedAt = new Date(log.finalized_at);
    if (finalizedAt >= oneWeekAgo) agentWeeks[key].week3.push(log);
    else if (finalizedAt >= twoWeeksAgo) agentWeeks[key].week2.push(log);
    else agentWeeks[key].week1.push(log);
  }

  // Load current goals
  const { data: currentGoals } = await supabase
    .from("agent_goals")
    .select("*")
    .in("status", ["approved", "pending"]);
  const goalsMap: Record<string, Record<string, any>> = {};
  (currentGoals || []).forEach((g: any) => {
    if (!goalsMap[g.agent_id]) goalsMap[g.agent_id] = {};
    goalsMap[g.agent_id][g.metric] = g;
  });

  for (const [agentId, weeks] of Object.entries(agentWeeks)) {
    // Need data in all 3 weeks
    if (weeks.week1.length === 0 || weeks.week2.length === 0 || weeks.week3.length === 0) continue;

    const agentName = weeks.week3[0]?.assigned_to_name || weeks.week2[0]?.assigned_to_name || "Agente";

    // Calculate weekly TMA
    const calcTma = (logs: any[]) => {
      if (logs.length === 0) return 0;
      const durations = logs.map((l: any) => {
        const start = new Date(l.started_at).getTime();
        const end = new Date(l.finalized_at).getTime();
        return (end - start) / 60000;
      }).filter((d: number) => d > 0 && d < 480);
      return durations.length > 0 ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length : 0;
    };

    const tma1 = calcTma(weeks.week1);
    const tma2 = calcTma(weeks.week2);
    const tma3 = calcTma(weeks.week3);

    // Volume per week
    const vol1 = weeks.week1.length;
    const vol2 = weeks.week2.length;
    const vol3 = weeks.week3.length;

    // Check TMA trend: 3 weeks above or below a target
    const currentTmaGoal = goalsMap[agentId]?.tma?.current_value || ((tma1 + tma2 + tma3) / 3);
    const allAboveTma = tma1 > currentTmaGoal && tma2 > currentTmaGoal && tma3 > currentTmaGoal;
    const allBelowTma = tma1 < currentTmaGoal * 0.9 && tma2 < currentTmaGoal * 0.9 && tma3 < currentTmaGoal * 0.9;

    // Check volume trend
    const avgVol = (vol1 + vol2 + vol3) / 3;
    const currentVolGoal = goalsMap[agentId]?.volume?.current_value || avgVol;
    const allAboveVol = vol1 > currentVolGoal && vol2 > currentVolGoal && vol3 > currentVolGoal;
    const allBelowVol = vol1 < currentVolGoal * 0.9 && vol2 < currentVolGoal * 0.9 && vol3 < currentVolGoal * 0.9;

    // Check rejected memories - if this type of suggestion was rejected 2x, skip
    const rejectedMemories = memories.filter(m =>
      m.type === "manager_feedback" &&
      m.source === "agent_goals" &&
      m.content?.agent_id === agentId &&
      m.weight <= 0.1
    );
    if (rejectedMemories.length > 0) continue;

    // Suggest TMA adjustments
    if (allAboveTma) {
      const suggestedValue = Math.round(currentTmaGoal * 1.1 * 10) / 10;
      const title = `Relaxar meta TMA de ${agentName}`;
      const key = `agent_goals:${title}`;
      if (!existingSet.has(key)) {
        const approvedMemories = memories.filter(m =>
          m.source === "agent_goals" && m.content?.agent_id === agentId && m.weight >= 0.8
        );

        await supabase.from("delma_suggestions").insert({
          category: "agent_goals",
          title,
          justification: `${agentName} ficou 3 semanas consecutivas acima da meta de TMA (${Math.round(currentTmaGoal)}min). Semanas: ${Math.round(tma1)}min, ${Math.round(tma2)}min, ${Math.round(tma3)}min. Sugestão: aumentar meta em 10%.`,
          content: { agent_id: agentId, agent_name: agentName, metric: "tma", current_value: currentTmaGoal, suggested_value: suggestedValue },
          confidence_score: approvedMemories.length > 0 ? 85 : 65,
          memories_used: approvedMemories.slice(0, 3).map((m: any) => ({ id: m.id, source: m.source, weight: m.weight })),
          status: "pending",
        });
        existingSet.add(key);
        count++;
      }
    } else if (allBelowTma) {
      const suggestedValue = Math.round(currentTmaGoal * 0.9 * 10) / 10;
      const title = `Apertar meta TMA de ${agentName}`;
      const key = `agent_goals:${title}`;
      if (!existingSet.has(key)) {
        await supabase.from("delma_suggestions").insert({
          category: "agent_goals",
          title,
          justification: `${agentName} ficou 3 semanas consecutivas abaixo da meta de TMA (${Math.round(currentTmaGoal)}min). Semanas: ${Math.round(tma1)}min, ${Math.round(tma2)}min, ${Math.round(tma3)}min. Sugestão: reduzir meta em 10%.`,
          content: { agent_id: agentId, agent_name: agentName, metric: "tma", current_value: currentTmaGoal, suggested_value: suggestedValue },
          confidence_score: 70,
          memories_used: [],
          status: "pending",
        });
        existingSet.add(key);
        count++;
      }
    }

    // Suggest volume adjustments
    if (allAboveVol) {
      const suggestedValue = Math.round(currentVolGoal * 1.1);
      const title = `Aumentar meta de volume de ${agentName}`;
      const key = `agent_goals:${title}`;
      if (!existingSet.has(key)) {
        await supabase.from("delma_suggestions").insert({
          category: "agent_goals",
          title,
          justification: `${agentName} superou a meta de volume por 3 semanas consecutivas (${vol1}, ${vol2}, ${vol3} conversas/semana vs meta de ${Math.round(currentVolGoal)}). Sugestão: aumentar em 10%.`,
          content: { agent_id: agentId, agent_name: agentName, metric: "volume", current_value: currentVolGoal, suggested_value: suggestedValue },
          confidence_score: 70,
          memories_used: [],
          status: "pending",
        });
        existingSet.add(key);
        count++;
      }
    } else if (allBelowVol) {
      const suggestedValue = Math.round(currentVolGoal * 0.9);
      const title = `Reduzir meta de volume de ${agentName}`;
      const key = `agent_goals:${title}`;
      if (!existingSet.has(key)) {
        await supabase.from("delma_suggestions").insert({
          category: "agent_goals",
          title,
          justification: `${agentName} ficou abaixo da meta de volume por 3 semanas consecutivas (${vol1}, ${vol2}, ${vol3} conversas/semana vs meta de ${Math.round(currentVolGoal)}). Sugestão: reduzir em 10%.`,
          content: { agent_id: agentId, agent_name: agentName, metric: "volume", current_value: currentVolGoal, suggested_value: suggestedValue },
          confidence_score: 65,
          memories_used: [],
          status: "pending",
        });
        existingSet.add(key);
        count++;
      }
    }
  }

  return count;
}

// MODULE 2: Detect patterns and suggest report schedules
async function analyzeReportPatterns(
  supabase: any,
  apiKey: string,
  memories: any[],
  existingSet: Set<string>
): Promise<number> {
  let count = 0;
  const now = new Date();
  const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

  // Fetch logs from last 4 weeks
  const { data: logs } = await supabase
    .from("conversation_logs")
    .select("finalized_at, tags, department_name, wait_time")
    .eq("department_name", "Suporte")
    .gte("finalized_at", fourWeeksAgo.toISOString())
    .order("finalized_at", { ascending: true })
    .limit(2000);

  if (!logs || logs.length < 20) return 0;

  // Check rejected report memories (don't re-suggest for 30 days)
  const rejectedReportMemories = memories.filter(m =>
    m.type === "manager_feedback" &&
    m.source === "report_schedule" &&
    m.weight <= 0.3
  );
  const rejectedPatterns = new Set(rejectedReportMemories.map((m: any) => m.content?.pattern || ""));

  // Analyze by day of week
  const dayOfWeekCounts: Record<number, number> = {};
  const dayOfWeekErrors: Record<number, number> = {};
  const dayOfWeekWaitTimes: Record<number, number[]> = {};

  for (const log of logs) {
    const d = new Date(log.finalized_at);
    const dow = d.getDay();
    dayOfWeekCounts[dow] = (dayOfWeekCounts[dow] || 0) + 1;
    
    if ((log.tags || []).some((t: string) => t.toLowerCase().includes("erro") || t.toLowerCase().includes("urgente"))) {
      dayOfWeekErrors[dow] = (dayOfWeekErrors[dow] || 0) + 1;
    }
    
    if (log.wait_time != null) {
      if (!dayOfWeekWaitTimes[dow]) dayOfWeekWaitTimes[dow] = [];
      dayOfWeekWaitTimes[dow].push(log.wait_time);
    }
  }

  const avgCount = Object.values(dayOfWeekCounts).reduce((a, b) => a + b, 0) / 7;
  const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

  // Detect peaks
  for (const [dowStr, errorCount] of Object.entries(dayOfWeekErrors)) {
    const dow = parseInt(dowStr);
    const totalForDay = dayOfWeekCounts[dow] || 1;
    const errorRate = errorCount / totalForDay;
    
    if (errorRate > 0.2 && errorCount > 3) {
      const pattern = `errors_${dayNames[dow]}`;
      if (rejectedPatterns.has(pattern)) continue;
      
      const title = `Relatório automático toda ${dayNames[dow]} às 7h`;
      const key = `report_schedule:${title}`;
      if (existingSet.has(key)) continue;

      await supabase.from("delma_suggestions").insert({
        category: "report_schedule",
        title,
        justification: `Detectado padrão de ${errorCount} erros concentrados nas ${dayNames[dow]}s (taxa de erro ${Math.round(errorRate * 100)}%). Um relatório automático ajudaria a monitorar.`,
        content: { schedule_type: "weekly", day_of_week: dow, hour_of_day: 7, pattern },
        confidence_score: Math.min(90, 50 + errorCount * 5),
        memories_used: [],
        status: "pending",
      });
      existingSet.add(key);
      count++;
    }
  }

  // Detect volume spikes
  for (const [dowStr, dayCount] of Object.entries(dayOfWeekCounts)) {
    const dow = parseInt(dowStr);
    if (dayCount > avgCount * 1.5 && dayCount > 10) {
      const pattern = `volume_${dayNames[dow]}`;
      if (rejectedPatterns.has(pattern)) continue;

      const title = `Relatório de pico de volume — ${dayNames[dow]}`;
      const key = `report_schedule:${title}`;
      if (existingSet.has(key)) continue;

      await supabase.from("delma_suggestions").insert({
        category: "report_schedule",
        title,
        justification: `${dayNames[dow]} tem ${dayCount} conversas — ${Math.round((dayCount / avgCount - 1) * 100)}% acima da média semanal. Monitorar com relatório automático.`,
        content: { schedule_type: "weekly", day_of_week: dow, hour_of_day: 8, pattern },
        confidence_score: 60,
        memories_used: [],
        status: "pending",
      });
      existingSet.add(key);
      count++;
    }
  }

  // Detect high wait times on specific days
  for (const [dowStr, waitTimes] of Object.entries(dayOfWeekWaitTimes)) {
    const dow = parseInt(dowStr);
    if (waitTimes.length < 5) continue;
    const avgWait = waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length;
    const globalAvgWait = Object.values(dayOfWeekWaitTimes).flat().reduce((a, b) => a + b, 0) / Object.values(dayOfWeekWaitTimes).flat().length;
    
    if (avgWait > globalAvgWait * 1.5 && avgWait > 5) {
      const pattern = `wait_${dayNames[dow]}`;
      if (rejectedPatterns.has(pattern)) continue;

      const title = `Alerta de TME alto — ${dayNames[dow]}`;
      const key = `report_schedule:${title}`;
      if (existingSet.has(key)) continue;

      await supabase.from("delma_suggestions").insert({
        category: "report_schedule",
        title,
        justification: `TME médio nas ${dayNames[dow]}s é ${Math.round(avgWait)}min — ${Math.round((avgWait / globalAvgWait - 1) * 100)}% acima da média geral (${Math.round(globalAvgWait)}min). Relatório ajudaria a detectar a causa.`,
        content: { schedule_type: "weekly", day_of_week: dow, hour_of_day: 7, pattern },
        confidence_score: 55,
        memories_used: [],
        status: "pending",
      });
      existingSet.add(key);
      count++;
    }
  }

  return count;
}

// MODULE 3: Enrich existing training suggestions with confidence from memory
async function enrichTrainingSuggestions(
  supabase: any,
  memories: any[]
): Promise<number> {
  let enriched = 0;

  // Get approved robot_training_suggestions for learning
  const { data: approvedTraining } = await supabase
    .from("robot_training_suggestions")
    .select("title, content, robot_id, suggestion_type")
    .eq("status", "approved")
    .limit(100);

  if (!approvedTraining || approvedTraining.length === 0) return 0;

  // Get pending training suggestions
  const { data: pendingTraining } = await supabase
    .from("robot_training_suggestions")
    .select("id, title, content, robot_id, suggestion_type")
    .eq("status", "pending");

  if (!pendingTraining || pendingTraining.length === 0) return 0;

  // For each pending suggestion, check if similar themes were approved before
  const approvedThemes = approvedTraining.map((t: any) => ({
    words: new Set((t.title + " " + t.content).toLowerCase().split(/\s+/).filter((w: string) => w.length > 3)),
    robotId: t.robot_id,
    type: t.suggestion_type,
  }));

  for (const pending of pendingTraining) {
    const pendingWords = new Set((pending.title + " " + pending.content).toLowerCase().split(/\s+/).filter((w: string) => w.length > 3));
    
    let bestSimilarity = 0;
    let matchedApprovals = 0;

    for (const approved of approvedThemes) {
      if (approved.robotId !== pending.robot_id) continue;
      
      const intersection = [...pendingWords].filter(w => approved.words.has(w)).length;
      const union = new Set([...pendingWords, ...approved.words]).size;
      const similarity = union > 0 ? intersection / union : 0;
      
      if (similarity > bestSimilarity) bestSimilarity = similarity;
      if (similarity > 0.3) matchedApprovals++;
    }

    // If high similarity, create an enriched delma_suggestion
    if (bestSimilarity > 0.4 || matchedApprovals >= 2) {
      const confidenceScore = Math.min(95, 60 + matchedApprovals * 10 + Math.round(bestSimilarity * 30));
      
      // Check if we already have a delma_suggestion for this
      const { data: existing } = await supabase
        .from("delma_suggestions")
        .select("id")
        .eq("category", "robot_training")
        .eq("title", pending.title)
        .eq("status", "pending")
        .maybeSingle();
      
      if (!existing) {
        const relatedMemories = memories
          .filter(m => m.source === "robot_training" && m.weight >= 0.5)
          .slice(0, 3);

        await supabase.from("delma_suggestions").insert({
          category: "robot_training",
          title: pending.title,
          justification: `Alta confiança — ${matchedApprovals} aprovações anteriores de temas similares (similaridade ${Math.round(bestSimilarity * 100)}%). Baseado em padrões de aprovação do gestor.`,
          content: { training_suggestion_id: pending.id, robot_id: pending.robot_id, type: pending.suggestion_type, original_content: pending.content },
          confidence_score: confidenceScore,
          memories_used: relatedMemories.map((m: any) => ({ id: m.id, source: m.source, weight: m.weight })),
          status: "pending",
        });
        enriched++;
      }
    }
  }

  return enriched;
}

// Store current system data signals as memories
async function storeDataSignals(supabase: any) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch Suporte department members
  const { data: suporteDept } = await supabase
    .from("departments")
    .select("id")
    .ilike("name", "%suporte%")
    .limit(1)
    .maybeSingle();
  
  let suporteMemberNames = new Set<string>();
  if (suporteDept) {
    const { data: memberLinks } = await supabase
      .from("profile_departments")
      .select("profile_id")
      .eq("department_id", suporteDept.id);
    if (memberLinks && memberLinks.length > 0) {
      const memberIds = memberLinks.map((m: any) => m.profile_id);
      const { data: memberProfiles } = await supabase
        .from("profiles")
        .select("name")
        .in("id", memberIds);
      if (memberProfiles) {
        suporteMemberNames = new Set(memberProfiles.map((p: any) => p.name));
      }
    }
  }

  // 1. Count recent conversation patterns
  const { count: totalConversations } = await supabase
    .from("conversation_logs")
    .select("*", { count: "exact", head: true })
    .eq("department_name", "Suporte")
    .gte("finalized_at", weekAgo.toISOString());

  // 2. Fetch logs for detailed analysis
  const { data: recentLogs } = await supabase
    .from("conversation_logs")
    .select("assigned_to_name, started_at, finalized_at, wait_time, tags, channel")
    .eq("department_name", "Suporte")
    .gte("finalized_at", weekAgo.toISOString())
    .limit(1000);

  // 3. Snapshot of active robots in Suporte
  const { data: robots } = await supabase
    .from("robots")
    .select("id, name, status, qa_pairs, departments")
    .limit(50);
  
  const suporteRobots = (robots || []).filter((r: any) => 
    (r.departments || []).some((d: string) => d.toLowerCase().includes("suporte"))
  );
  
  if (suporteRobots.length > 0) {
    await supabase.from("delma_memory").insert({
      type: "data_signal",
      source: "robots_snapshot",
      content: {
        robots: suporteRobots.map((r: any) => ({
          name: r.name,
          status: r.status,
          qa_count: Array.isArray(r.qa_pairs) ? r.qa_pairs.length : 0,
        })),
        snapshot_at: now.toISOString(),
      },
      weight: 0.5,
      expires_at: expiresAt,
    });
  }

  // 4. Top 10 tags from last week
  if (recentLogs && recentLogs.length > 0) {
    const tagCounts: Record<string, number> = {};
    const channelCounts: Record<string, number> = {};
    const agentMetrics: Record<string, { tmaSum: number; tmeSum: number; count: number }> = {};

    for (const log of recentLogs) {
      // Tags
      for (const tag of (log.tags || [])) {
        const t = (tag as string).toLowerCase().trim();
        if (t) tagCounts[t] = (tagCounts[t] || 0) + 1;
      }
      // Channels
      const ch = log.channel || "whatsapp";
      channelCounts[ch] = (channelCounts[ch] || 0) + 1;

      // Agent TMA/TME — only Suporte members
      if (log.assigned_to_name && (suporteMemberNames.size === 0 || suporteMemberNames.has(log.assigned_to_name))) {
        if (!agentMetrics[log.assigned_to_name]) agentMetrics[log.assigned_to_name] = { tmaSum: 0, tmeSum: 0, count: 0 };
        const start = new Date(log.started_at).getTime();
        const end = new Date(log.finalized_at).getTime();
        const duration = (end - start) / 60000;
        if (duration > 0 && duration < 480) {
          agentMetrics[log.assigned_to_name].tmaSum += duration;
          agentMetrics[log.assigned_to_name].count++;
        }
        if (log.wait_time != null) {
          agentMetrics[log.assigned_to_name].tmeSum += log.wait_time;
        }
      }
    }

    const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

    await supabase.from("delma_memory").insert({
      type: "data_signal",
      source: "weekly_tags",
      content: { top_tags: topTags, week_ending: now.toISOString() },
      weight: 0.5,
      expires_at: expiresAt,
    });

    // 5. Channel volume
    await supabase.from("delma_memory").insert({
      type: "data_signal",
      source: "channel_volume",
      content: { channels: channelCounts, week_ending: now.toISOString() },
      weight: 0.5,
      expires_at: expiresAt,
    });

    // 6. Agent TMA/TME averages
    const agentAvgs = Object.entries(agentMetrics)
      .filter(([, m]) => m.count > 0)
      .map(([name, m]) => ({
        name,
        avg_tma: Math.round((m.tmaSum / m.count) * 10) / 10,
        avg_tme: Math.round((m.tmeSum / m.count) * 10) / 10,
        conversations: m.count,
      }));

    if (agentAvgs.length > 0) {
      await supabase.from("delma_memory").insert({
        type: "data_signal",
        source: "agent_performance",
        content: { agents: agentAvgs, week_ending: now.toISOString() },
        weight: 0.5,
        expires_at: expiresAt,
      });
    }
  }

  // 7. Overall weekly snapshot
  if (totalConversations && totalConversations > 0) {
    await supabase.from("delma_memory").insert({
      type: "data_signal",
      source: "weekly_snapshot",
      content: { total_conversations: totalConversations, week_ending: now.toISOString() },
      weight: 0.5,
      expires_at: expiresAt,
    });
  }
}
