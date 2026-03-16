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

    console.log("[sdr-check-transcripts] Starting transcript check...");

    const { data: pendingMeetings, error: queryError } = await supabase
      .from("sdr_appointments")
      .select("id, google_meet_url, transcript_import_attempts")
      .in("status", ["completed"])
      .in("processing_status", ["transcribing"])
      .is("transcription_text", null)
      .not("google_meet_url", "is", null)
      .lte("next_transcript_check", new Date().toISOString())
      .lt("transcript_import_attempts", 6)
      .order("next_transcript_check")
      .limit(10);

    if (queryError) {
      return new Response(JSON.stringify({ error: queryError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!pendingMeetings || pendingMeetings.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[sdr-check-transcripts] Found ${pendingMeetings.length} meetings to check`);

    const results: Array<{ meeting_id: string; success: boolean; reason?: string }> = [];

    for (const meeting of pendingMeetings) {
      try {
        const importRes = await fetch(`${supabaseUrl}/functions/v1/sdr-meeting-import-transcript`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify({ meeting_id: meeting.id }),
        });
        const importResult = await importRes.json();
        results.push({ meeting_id: meeting.id, success: importResult.success || false, reason: importResult.reason });
      } catch (e) {
        results.push({ meeting_id: meeting.id, success: false, reason: "import_error" });
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[sdr-check-transcripts] Done. ${successCount}/${pendingMeetings.length} successful`);

    return new Response(JSON.stringify({ success: true, processed: pendingMeetings.length, successful: successCount, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[sdr-check-transcripts] Error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
