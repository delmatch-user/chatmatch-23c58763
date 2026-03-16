import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { meeting_id } = await req.json();
    if (!meeting_id) {
      return new Response(JSON.stringify({ error: "meeting_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: meeting } = await supabase
      .from("sdr_appointments")
      .select("id, google_meet_url, status, processing_status")
      .eq("id", meeting_id)
      .single();

    if (!meeting) {
      return new Response(JSON.stringify({ error: "Meeting not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nextCheck = meeting.google_meet_url
      ? new Date(Date.now() + 10 * 60 * 1000).toISOString()
      : null;

    await supabase.from("sdr_appointments").update({
      status: "completed",
      processing_status: meeting.google_meet_url ? "transcribing" : null,
      next_transcript_check: nextCheck,
      transcript_import_attempts: 0,
      transcript_import_error: null,
    }).eq("id", meeting_id);

    // Fire-and-forget: try to import transcript immediately
    if (meeting.google_meet_url) {
      fetch(`${supabaseUrl}/functions/v1/sdr-meeting-import-transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseServiceKey}` },
        body: JSON.stringify({ meeting_id }),
      }).catch(err => console.error("[sdr-meeting-end] Import trigger failed:", err));
    }

    return new Response(JSON.stringify({ success: true, meeting_id, next_transcript_check: nextCheck }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[sdr-meeting-end] Error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
