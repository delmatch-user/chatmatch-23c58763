import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Current time in São Paulo
    const now = new Date();
    const spNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const currentHour = spNow.getHours();
    const currentMinute = spNow.getMinutes();

    const todayStr = `${spNow.getFullYear()}-${String(spNow.getMonth() + 1).padStart(2, "0")}-${String(spNow.getDate()).padStart(2, "0")}`;

    let dailyCreated = 0;
    let thirtyMinCreated = 0;

    // 1. Daily alerts at 8:00 AM (between 8:00-8:14 window since cron runs every 15min)
    if (currentHour === 8 && currentMinute < 15) {
      const { data: todayApts } = await supabase
        .from("sdr_appointments")
        .select("id, title, time, user_id, date")
        .eq("date", todayStr)
        .eq("status", "scheduled")
        .not("user_id", "is", null);

      if (todayApts?.length) {
        for (const apt of todayApts) {
          // Check if daily alert already exists
          const { data: existing } = await supabase
            .from("appointment_alerts")
            .select("id")
            .eq("appointment_id", apt.id)
            .eq("user_id", apt.user_id)
            .eq("alert_type", "daily")
            .limit(1);

          if (!existing?.length) {
            await supabase.from("appointment_alerts").insert({
              appointment_id: apt.id,
              user_id: apt.user_id,
              alert_type: "daily",
              title: `📅 Reunião hoje: ${apt.title}`,
              body: `Você tem "${apt.title}" agendado para hoje às ${apt.time?.slice(0, 5)}.`,
              scheduled_for: new Date().toISOString(),
            });
            dailyCreated++;
          }
        }
      }
    }

    // 2. 30-minute alerts: check appointments starting in next 30-45 minutes
    const thirtyMinFromNow = new Date(spNow.getTime() + 30 * 60 * 1000);
    const fortyFiveMinFromNow = new Date(spNow.getTime() + 45 * 60 * 1000);

    const timeFrom = `${String(thirtyMinFromNow.getHours()).padStart(2, "0")}:${String(thirtyMinFromNow.getMinutes()).padStart(2, "0")}:00`;
    const timeTo = `${String(fortyFiveMinFromNow.getHours()).padStart(2, "0")}:${String(fortyFiveMinFromNow.getMinutes()).padStart(2, "0")}:00`;

    const { data: upcomingApts } = await supabase
      .from("sdr_appointments")
      .select("id, title, time, user_id, date")
      .eq("date", todayStr)
      .eq("status", "scheduled")
      .not("user_id", "is", null)
      .gte("time", timeFrom)
      .lt("time", timeTo);

    if (upcomingApts?.length) {
      for (const apt of upcomingApts) {
        const { data: existing } = await supabase
          .from("appointment_alerts")
          .select("id")
          .eq("appointment_id", apt.id)
          .eq("user_id", apt.user_id)
          .eq("alert_type", "30min")
          .limit(1);

        if (!existing?.length) {
          await supabase.from("appointment_alerts").insert({
            appointment_id: apt.id,
            user_id: apt.user_id,
            alert_type: "30min",
            title: `⏰ Em 30 minutos: ${apt.title}`,
            body: `Sua reunião "${apt.title}" começa às ${apt.time?.slice(0, 5)}. Prepare-se!`,
            scheduled_for: new Date().toISOString(),
          });
          thirtyMinCreated++;
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, dailyCreated, thirtyMinCreated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("appointment-alerts-cron error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
