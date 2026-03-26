import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get Suporte department
    const { data: suporteDept } = await supabase
      .from("departments").select("id").ilike("name", "%suporte%").maybeSingle();
    const SUPORTE_DEPT_ID = suporteDept?.id;

    if (!SUPORTE_DEPT_ID) {
      return new Response(JSON.stringify({ message: "Departamento Suporte não encontrado" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get Suporte member IDs
    const { data: memberLinks } = await supabase
      .from("profile_departments").select("profile_id").eq("department_id", SUPORTE_DEPT_ID);
    const suporteMemberIds = (memberLinks || []).map((m: any) => m.profile_id);

    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const oneWeekAgoStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const oneWeekAgoEnd = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const anomalies: Array<{
      type: string; severity: string; description: string;
      affected_entity: string | null; affected_entity_id: string | null;
      metric_current: number; metric_baseline: number;
    }> = [];

    // ===== ANOMALY 1: TMA spike (last 2h vs 7-day avg) =====
    const { data: recentLogs } = await supabase
      .from("conversation_logs")
      .select("started_at, finalized_at")
      .eq("department_id", SUPORTE_DEPT_ID)
      .gte("finalized_at", twoHoursAgo)
      .not("finalized_by", "is", null)
      .limit(500);

    const { data: weekLogs } = await supabase
      .from("conversation_logs")
      .select("started_at, finalized_at")
      .eq("department_id", SUPORTE_DEPT_ID)
      .gte("finalized_at", sevenDaysAgo)
      .not("finalized_by", "is", null)
      .limit(2000);

    const calcAvgTMA = (logs: any[]) => {
      const vals = (logs || []).map(l => {
        const s = new Date(l.started_at).getTime();
        const e = new Date(l.finalized_at).getTime();
        return (e - s) / 60000;
      }).filter(v => v > 0 && v < 480);
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };

    const recentTMA = calcAvgTMA(recentLogs || []);
    const weekTMA = calcAvgTMA(weekLogs || []);

    if (weekTMA > 0 && recentTMA > 0) {
      const pctIncrease = ((recentTMA - weekTMA) / weekTMA) * 100;
      if (pctIncrease > 60) {
        anomalies.push({
          type: "tma_spike", severity: "red",
          description: `TMA das últimas 2h está ${Math.round(pctIncrease)}% acima da média (${Math.round(recentTMA)}min vs ${Math.round(weekTMA)}min média 7 dias)`,
          affected_entity: "Suporte", affected_entity_id: SUPORTE_DEPT_ID,
          metric_current: Math.round(recentTMA * 10) / 10,
          metric_baseline: Math.round(weekTMA * 10) / 10,
        });
      } else if (pctIncrease > 30) {
        anomalies.push({
          type: "tma_spike", severity: "yellow",
          description: `TMA das últimas 2h está ${Math.round(pctIncrease)}% acima da média (${Math.round(recentTMA)}min vs ${Math.round(weekTMA)}min média 7 dias)`,
          affected_entity: "Suporte", affected_entity_id: SUPORTE_DEPT_ID,
          metric_current: Math.round(recentTMA * 10) / 10,
          metric_baseline: Math.round(weekTMA * 10) / 10,
        });
      }
    }

    // ===== ANOMALY 2: Queue depth =====
    const { data: queueConvs, count: queueCount } = await supabase
      .from("conversations")
      .select("id", { count: "exact" })
      .eq("department_id", SUPORTE_DEPT_ID)
      .eq("status", "em_fila");

    if ((queueCount || 0) > 5) {
      anomalies.push({
        type: "queue_depth", severity: "red",
        description: `${queueCount} conversas na fila do Suporte aguardando atendimento`,
        affected_entity: "Fila Suporte", affected_entity_id: SUPORTE_DEPT_ID,
        metric_current: queueCount || 0, metric_baseline: 5,
      });
    }

    // ===== ANOMALY 3: Robot transfer rate spike =====
    const { data: thisWeekTransfers } = await supabase
      .from("transfer_logs")
      .select("to_robot_name, from_user_name")
      .gte("created_at", sevenDaysAgo)
      .not("to_robot_name", "is", null)
      .limit(1000);

    const { data: prevWeekTransfers } = await supabase
      .from("transfer_logs")
      .select("to_robot_name, from_user_name")
      .gte("created_at", oneWeekAgoStart)
      .lt("created_at", oneWeekAgoEnd)
      .not("to_robot_name", "is", null)
      .limit(1000);

    // Group by robot
    const robotTransfersCurrent: Record<string, number> = {};
    (thisWeekTransfers || []).forEach((t: any) => {
      // Transfers FROM robot (robot transferred to human = robot couldn't handle)
      if (t.from_user_name) return; // human transfer, skip
      const name = t.to_robot_name || "Desconhecido";
      robotTransfersCurrent[name] = (robotTransfersCurrent[name] || 0) + 1;
    });

    const robotTransfersPrev: Record<string, number> = {};
    (prevWeekTransfers || []).forEach((t: any) => {
      if (t.from_user_name) return;
      const name = t.to_robot_name || "Desconhecido";
      robotTransfersPrev[name] = (robotTransfersPrev[name] || 0) + 1;
    });

    for (const [robotName, currentCount] of Object.entries(robotTransfersCurrent)) {
      const prevCount = robotTransfersPrev[robotName] || 0;
      if (prevCount > 0) {
        const pctIncrease = ((currentCount - prevCount) / prevCount) * 100;
        if (pctIncrease > 40) {
          anomalies.push({
            type: "robot_transfer_spike", severity: "yellow",
            description: `Taxa de transferência do ${robotName} aumentou ${Math.round(pctIncrease)}% vs semana anterior (${currentCount} vs ${prevCount})`,
            affected_entity: robotName, affected_entity_id: null,
            metric_current: currentCount, metric_baseline: prevCount,
          });
        }
      }
    }

    // ===== ANOMALY 4: Agent with 2x TMA in last hour =====
    if (suporteMemberIds.length > 0) {
      const { data: lastHourLogs } = await supabase
        .from("conversation_logs")
        .select("assigned_to, assigned_to_name, started_at, finalized_at")
        .eq("department_id", SUPORTE_DEPT_ID)
        .gte("finalized_at", oneHourAgo)
        .not("assigned_to", "is", null)
        .limit(200);

      const agentTMAs: Record<string, { total: number; count: number; name: string }> = {};
      (lastHourLogs || []).forEach((l: any) => {
        if (!suporteMemberIds.includes(l.assigned_to)) return;
        const dur = (new Date(l.finalized_at).getTime() - new Date(l.started_at).getTime()) / 60000;
        if (dur <= 0 || dur > 480) return;
        if (!agentTMAs[l.assigned_to]) agentTMAs[l.assigned_to] = { total: 0, count: 0, name: l.assigned_to_name };
        agentTMAs[l.assigned_to].total += dur;
        agentTMAs[l.assigned_to].count++;
      });

      const allAgentAvgs = Object.values(agentTMAs).filter(a => a.count >= 2).map(a => a.total / a.count);
      const teamAvg = allAgentAvgs.length > 0 ? allAgentAvgs.reduce((a, b) => a + b, 0) / allAgentAvgs.length : 0;

      if (teamAvg > 0) {
        for (const [agentId, stats] of Object.entries(agentTMAs)) {
          if (stats.count < 2) continue;
          const agentAvg = stats.total / stats.count;
          if (agentAvg > teamAvg * 2) {
            anomalies.push({
              type: "agent_overloaded", severity: "yellow",
              description: `${stats.name} com TMA ${Math.round(agentAvg)}min na última hora — 2x acima da média do time (${Math.round(teamAvg)}min)`,
              affected_entity: stats.name, affected_entity_id: agentId as any,
              metric_current: Math.round(agentAvg * 10) / 10,
              metric_baseline: Math.round(teamAvg * 10) / 10,
            });
          }
        }
      }
    }

    // ===== ANOMALY 5: Recurring tag in last hour (gap crítico) =====
    const { data: lastHourTagLogs } = await supabase
      .from("conversation_logs")
      .select("tags")
      .eq("department_id", SUPORTE_DEPT_ID)
      .gte("finalized_at", oneHourAgo)
      .limit(200);

    const tagCounts: Record<string, number> = {};
    (lastHourTagLogs || []).forEach((l: any) => {
      (l.tags || []).forEach((t: string) => {
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      });
    });

    for (const [tag, count] of Object.entries(tagCounts)) {
      if (count > 5) {
        anomalies.push({
          type: "critical_gap", severity: "red",
          description: `Tag "${tag}" apareceu ${count} vezes na última hora — possível gap crítico emergente`,
          affected_entity: tag, affected_entity_id: null,
          metric_current: count, metric_baseline: 5,
        });
      }
    }

    // ===== AUTO-RESOLVE old anomalies (>2h without recurrence) =====
    const twoHoursAgoTs = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    await supabase
      .from("delma_anomalies")
      .update({ resolved_at: now.toISOString(), resolution_notes: "Auto-resolvido (sem recorrência por 2h)" })
      .is("resolved_at", null)
      .lt("detected_at", twoHoursAgoTs);

    // ===== Check for duplicates before inserting =====
    const { data: existingAnomalies } = await supabase
      .from("delma_anomalies")
      .select("type, affected_entity")
      .is("resolved_at", null);

    const existingKeys = new Set((existingAnomalies || []).map((a: any) => `${a.type}:${a.affected_entity}`));

    let insertedCount = 0;
    for (const anomaly of anomalies) {
      const key = `${anomaly.type}:${anomaly.affected_entity}`;
      if (existingKeys.has(key)) continue;

      // Insert anomaly
      const { data: inserted } = await supabase
        .from("delma_anomalies")
        .insert(anomaly)
        .select("id")
        .single();

      if (!inserted) continue;
      insertedCount++;

      // Generate suggestion for this anomaly
      const { data: suggestion } = await supabase
        .from("delma_suggestions")
        .insert({
          category: "anomalia_detectada",
          title: `⚡ ${anomaly.description.substring(0, 80)}`,
          justification: anomaly.description,
          content: {
            anomaly_type: anomaly.type,
            severity: anomaly.severity,
            metric_current: anomaly.metric_current,
            metric_baseline: anomaly.metric_baseline,
            affected_entity: anomaly.affected_entity,
            data_window: `Detectado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
            impact_score: anomaly.severity === "red" ? 90 : 65,
            impact_breakdown: {
              volume_weight: anomaly.severity === "red" ? 90 : 60,
              tma_reduction: anomaly.type === "tma_spike" ? 85 : 40,
              recurrence: 70,
              urgency: anomaly.severity === "red" ? 95 : 55,
            },
            estimated_impact: `Anomalia ${anomaly.severity === 'red' ? 'crítica' : 'moderada'}: ${anomaly.description}`,
            recurrence_pattern: "pontual",
          },
          confidence_score: anomaly.severity === "red" ? 90 : 70,
          memories_used: [],
          status: "pending",
        })
        .select("id")
        .single();

      // Link suggestion to anomaly
      if (suggestion) {
        await supabase
          .from("delma_anomalies")
          .update({ auto_suggestion_id: suggestion.id })
          .eq("id", inserted.id);
      }

      // For red severity, notify admins
      if (anomaly.severity === "red") {
        const { data: admins } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin")
          .limit(10);

        for (const admin of (admins || [])) {
          await supabase.from("agent_notifications").insert({
            agent_id: admin.user_id,
            sent_by: admin.user_id,
            message: `🚨 Alerta Crítico da Delma: ${anomaly.description}`,
            metrics: { anomaly_type: anomaly.type, severity: anomaly.severity },
            period_days: 1,
          });
        }
      }
    }

    console.log(`delma-anomaly-detector: ${anomalies.length} anomalias detectadas, ${insertedCount} novas inseridas`);

    return new Response(JSON.stringify({
      message: `Detector executado. ${anomalies.length} anomalias analisadas, ${insertedCount} novas.`,
      anomalies_detected: anomalies.length,
      anomalies_inserted: insertedCount,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("delma-anomaly-detector error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
