import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPORTE_DEPARTMENT_ID = "dea51138-49e4-45b0-a491-fb07a5fad479";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Fetch schedule config
    const { data: schedule, error: scheduleErr } = await supabase
      .from("report_schedule")
      .select("*")
      .limit(1)
      .single();

    if (scheduleErr || !schedule) {
      return new Response(
        JSON.stringify({ status: "no_schedule" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!schedule.is_active || schedule.schedule_type === "manual") {
      return new Response(
        JSON.stringify({ status: "inactive" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Check if reset is due
    const nowSP = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
    );
    const now = new Date();

    const shouldRun = checkIfShouldRun(
      schedule.schedule_type,
      schedule.day_of_week,
      schedule.day_of_month,
      schedule.hour_of_day,
      schedule.last_run_at,
      nowSP
    );

    if (!shouldRun) {
      return new Response(
        JSON.stringify({ status: "not_due" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Build snapshot data (same logic as frontend)
    const periodStart = schedule.last_run_at
      ? new Date(schedule.last_run_at)
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name, email, avatar_url");

    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role");

    const { data: logs } = await supabase
      .from("conversation_logs")
      .select("*")
      .gte("finalized_at", periodStart.toISOString())
      .lte("finalized_at", now.toISOString());

    const filteredLogs = logs || [];

    const userReports = (profiles || []).map((profile: any) => {
      const userRole =
        (roles || []).find((r: any) => r.user_id === profile.id)?.role ||
        "atendente";
      const userLogs = filteredLogs.filter(
        (log: any) =>
          log.assigned_to === profile.id || log.finalized_by === profile.id
      );

      const totalConversations = userLogs.length;
      const suporteLogs = userLogs.filter(
        (log: any) => log.department_id === SUPORTE_DEPARTMENT_ID
      );
      const totalEvaluations = suporteLogs.length;
      const conversationsFinalized = userLogs.filter(
        (log: any) => log.finalized_by === profile.id
      ).length;

      // Avg handling time (exclude > 1h)
      const logsWithHandlingTime = userLogs.filter((log: any) => {
        if (
          log.finalized_by !== profile.id ||
          log.agent_status_at_finalization !== "online" ||
          !log.started_at ||
          !log.finalized_at
        )
          return false;
        const secs =
          (new Date(log.finalized_at).getTime() -
            new Date(log.started_at).getTime()) /
          1000;
        return secs > 0 && secs < 3600;
      });
      const avgHandlingTime =
        logsWithHandlingTime.length > 0
          ? logsWithHandlingTime.reduce((sum: number, log: any) => {
              return (
                sum +
                (new Date(log.finalized_at).getTime() -
                  new Date(log.started_at).getTime()) /
                  1000 /
                  60
              );
            }, 0) / logsWithHandlingTime.length
          : 0;

      // Avg wait time (exclude > 1h)
      const logsWithWaitTime = userLogs.filter(
        (log: any) =>
          log.wait_time !== null && log.wait_time > 0 && log.wait_time < 3600
      );
      const avgWaitTime =
        logsWithWaitTime.length > 0
          ? logsWithWaitTime.reduce(
              (sum: number, log: any) => sum + (log.wait_time || 0),
              0
            ) /
            logsWithWaitTime.length /
            60
          : 0;

      return {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        avatarUrl: profile.avatar_url,
        role: userRole,
        totalConversations,
        totalEvaluations,
        avgHandlingTime: Math.round(avgHandlingTime),
        avgWaitTime: Math.round(avgWaitTime),
        conversationsFinalized,
      };
    });

    // Totals
    const activeReports = userReports.filter(
      (r: any) => r.totalConversations > 0
    );
    const totals = {
      conversations: userReports.reduce(
        (s: number, r: any) => s + r.totalConversations,
        0
      ),
      evaluations: userReports.reduce(
        (s: number, r: any) => s + r.totalEvaluations,
        0
      ),
      avgHandlingTime:
        activeReports.length > 0
          ? Math.round(
              activeReports.reduce(
                (s: number, r: any) => s + r.avgHandlingTime,
                0
              ) / activeReports.length
            )
          : 0,
      avgWaitTime:
        activeReports.length > 0
          ? Math.round(
              activeReports.reduce(
                (s: number, r: any) => s + r.avgWaitTime,
                0
              ) / activeReports.length
            )
          : 0,
      activeUsers: activeReports.length,
    };

    // 4. Insert snapshot
    const { error: snapErr } = await supabase
      .from("report_snapshots")
      .insert({
        period_start: periodStart.toISOString(),
        period_end: now.toISOString(),
        reset_type: "scheduled",
        data: userReports,
        totals,
      });

    if (snapErr) throw snapErr;

    // 5. Execute reset
    // Mark logs as reset (non-destructive - preserves original data)
    await supabase
      .from("conversation_logs")
      .update({ reset_at: now.toISOString() })
      .is("reset_at", null);

    // Delete finalized conversations
    await supabase.from("conversations").delete().eq("status", "finalizada");

    // Reset wait_time on active conversations
    await supabase
      .from("conversations")
      .update({ wait_time: 0, created_at: new Date().toISOString() })
      .neq("status", "finalizada");

    // 6. Update schedule
    const nextRunAt = calculateNextRun(
      schedule.schedule_type,
      schedule.day_of_week,
      schedule.day_of_month,
      schedule.hour_of_day,
      nowSP
    );

    await supabase
      .from("report_schedule")
      .update({
        last_run_at: now.toISOString(),
        next_run_at: nextRunAt.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", schedule.id);

    return new Response(
      JSON.stringify({
        status: "executed",
        snapshot_totals: totals,
        next_run_at: nextRunAt.toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Scheduled report reset error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function checkIfShouldRun(
  type: string,
  dayOfWeek: number | null,
  dayOfMonth: number | null,
  hourOfDay: number,
  lastRunAt: string | null,
  nowSP: Date
): boolean {
  const todayYear = nowSP.getFullYear();
  const todayMonth = nowSP.getMonth();
  const todayDate = nowSP.getDate();
  const todayDow = nowSP.getDay();
  const todayHour = nowSP.getHours();

  let scheduledTime: Date;

  if (type === "daily") {
    // Today at hour_of_day
    scheduledTime = new Date(todayYear, todayMonth, todayDate, hourOfDay, 0, 0);
  } else if (type === "weekly") {
    const dow = dayOfWeek ?? 0;
    const diff = todayDow - dow;
    const dayOffset = diff >= 0 ? diff : diff + 7;
    scheduledTime = new Date(
      todayYear,
      todayMonth,
      todayDate - dayOffset,
      hourOfDay,
      0,
      0
    );
  } else if (type === "monthly") {
    const dom = dayOfMonth ?? 1;
    scheduledTime = new Date(todayYear, todayMonth, dom, hourOfDay, 0, 0);
    // If day hasn't come this month yet, check last month
    if (scheduledTime > nowSP) {
      scheduledTime = new Date(todayYear, todayMonth - 1, dom, hourOfDay, 0, 0);
    }
  } else {
    return false;
  }

  // Must be past the scheduled time
  if (nowSP < scheduledTime) return false;

  // Must not have run after the scheduled time
  if (lastRunAt) {
    const lastRun = new Date(lastRunAt);
    if (lastRun >= scheduledTime) return false;
  }

  return true;
}

function calculateNextRun(
  type: string,
  dayOfWeek: number | null,
  dayOfMonth: number | null,
  hourOfDay: number,
  nowSP: Date
): Date {
  const todayYear = nowSP.getFullYear();
  const todayMonth = nowSP.getMonth();
  const todayDate = nowSP.getDate();

  if (type === "daily") {
    const next = new Date(
      todayYear,
      todayMonth,
      todayDate + 1,
      hourOfDay,
      0,
      0
    );
    return next;
  } else if (type === "weekly") {
    const dow = dayOfWeek ?? 0;
    let daysUntil = dow - nowSP.getDay();
    if (daysUntil <= 0) daysUntil += 7;
    return new Date(
      todayYear,
      todayMonth,
      todayDate + daysUntil,
      hourOfDay,
      0,
      0
    );
  } else if (type === "monthly") {
    const dom = dayOfMonth ?? 1;
    let next = new Date(todayYear, todayMonth + 1, dom, hourOfDay, 0, 0);
    return next;
  }
  return new Date(todayYear, todayMonth, todayDate + 1, hourOfDay, 0, 0);
}
