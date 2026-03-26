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
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch pending changes that are due
    const now = new Date().toISOString();
    const { data: pendingChanges, error: fetchErr } = await supabase
      .from("robot_change_schedule")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", now);

    if (fetchErr) throw fetchErr;
    if (!pendingChanges || pendingChanges.length === 0) {
      return new Response(JSON.stringify({ message: "Nenhuma alteração pendente", applied: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let applied = 0;
    let failed = 0;

    for (const change of pendingChanges) {
      try {
        // Update robot instructions
        const { error: updateErr } = await supabase
          .from("robots")
          .update({ instructions: change.new_instruction, updated_at: new Date().toISOString() })
          .eq("id", change.robot_id);

        if (updateErr) {
          console.error(`Failed to update robot ${change.robot_id}:`, updateErr);
          await supabase.from("robot_change_schedule")
            .update({ status: "failed" })
            .eq("id", change.id);
          failed++;
          continue;
        }

        // Mark as applied
        await supabase.from("robot_change_schedule")
          .update({ status: "applied", applied_at: new Date().toISOString() })
          .eq("id", change.id);

        // Save snapshot in delma_memory
        await supabase.from("delma_memory").insert({
          type: "data_signal",
          source: "brain-apply-robot-changes",
          content: {
            robot_id: change.robot_id,
            affected_section: change.affected_section,
            applied_at: new Date().toISOString(),
            change_id: change.id,
          },
          weight: 0.8,
          expires_at: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
        });

        applied++;
      } catch (e) {
        console.error(`Error applying change ${change.id}:`, e);
        failed++;
      }
    }

    console.log(`brain-apply-robot-changes: applied ${applied}, failed ${failed}`);

    return new Response(JSON.stringify({
      message: `${applied} alteração(ões) aplicada(s) com sucesso.${failed > 0 ? ` ${failed} falharam.` : ""}`,
      applied,
      failed,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("brain-apply-robot-changes error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
