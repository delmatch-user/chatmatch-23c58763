import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getGoogleAccessToken, extractMeetingCode } from "../_shared/google-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BACKOFF_MINUTES = [10, 30, 60, 120, 360];
const MAX_ATTEMPTS = 6;

function getNextCheckTime(attempts: number): Date {
  const delay = BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length - 1)];
  return new Date(Date.now() + delay * 60 * 1000);
}

async function updateAttempts(supabase: any, meetingId: string, currentAttempts: number, error: string) {
  const attempts = (currentAttempts || 0) + 1;
  await supabase.from("sdr_appointments").update({
    transcript_import_attempts: attempts,
    transcript_import_error: `${error}. Tentativa ${attempts}/${MAX_ATTEMPTS}`,
    next_transcript_check: attempts >= MAX_ATTEMPTS ? null : getNextCheckTime(attempts).toISOString(),
    processing_status: attempts >= MAX_ATTEMPTS ? "failed" : "transcribing",
  }).eq("id", meetingId);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { meeting_id, force_retry } = await req.json();
    if (!meeting_id) {
      return new Response(JSON.stringify({ error: "meeting_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: meeting } = await supabase
      .from("sdr_appointments")
      .select("id, google_meet_url, transcription_text, transcript_import_attempts, date, time")
      .eq("id", meeting_id).single();

    if (!meeting) {
      return new Response(JSON.stringify({ error: "Meeting not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (meeting.transcription_text && !force_retry) {
      return new Response(JSON.stringify({ success: true, already_has_transcription: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!meeting.google_meet_url) {
      return new Response(JSON.stringify({ error: "No Google Meet URL" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const meetingCode = extractMeetingCode(meeting.google_meet_url);
    if (!meetingCode) {
      return new Response(JSON.stringify({ error: "Could not extract meeting code" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tokenResult = await getGoogleAccessToken(supabase);
    if (!tokenResult) {
      await supabase.from("sdr_appointments").update({
        transcript_import_error: "Google auth failed", next_transcript_check: null, processing_status: "failed",
      }).eq("id", meeting_id);
      return new Response(JSON.stringify({ success: false, reason: "auth_failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { accessToken } = tokenResult;

    // Find conference records
    const confRes = await fetch(
      `https://meet.googleapis.com/v2/conferenceRecords?filter=space.meeting_code="${meetingCode}"`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!confRes.ok) {
      await updateAttempts(supabase, meeting_id, meeting.transcript_import_attempts, `Meet API error: ${confRes.status}`);
      return new Response(JSON.stringify({ success: false, reason: "meet_api_error" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const confData = await confRes.json();
    const records = confData.conferenceRecords || [];

    if (records.length === 0) {
      await updateAttempts(supabase, meeting_id, meeting.transcript_import_attempts, "Aguardando processamento do Google");
      return new Response(JSON.stringify({ success: false, reason: "not_available_yet" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get transcripts
    const conferenceRecordName = records[0].name;
    const transcriptsRes = await fetch(
      `https://meet.googleapis.com/v2/${conferenceRecordName}/transcripts`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!transcriptsRes.ok) {
      await updateAttempts(supabase, meeting_id, meeting.transcript_import_attempts, `Transcripts error: ${transcriptsRes.status}`);
      return new Response(JSON.stringify({ success: false, reason: "transcripts_api_error" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const transcriptsData = await transcriptsRes.json();
    const transcripts = transcriptsData.transcripts || [];

    if (transcripts.length === 0) {
      await updateAttempts(supabase, meeting_id, meeting.transcript_import_attempts, "Transcrição não disponível ainda");
      return new Response(JSON.stringify({ success: false, reason: "transcript_not_ready" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get Google Docs content
    const docsDestination = transcripts[0].docsDestination;
    if (!docsDestination?.document) {
      await updateAttempts(supabase, meeting_id, meeting.transcript_import_attempts, "Documento de transcrição não encontrado");
      return new Response(JSON.stringify({ success: false, reason: "no_docs_destination" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const docId = docsDestination.document.replace("documents/", "");
    const driveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${docId}/export?mimeType=text/plain`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!driveRes.ok) {
      await updateAttempts(supabase, meeting_id, meeting.transcript_import_attempts, `Drive error: ${driveRes.status}`);
      return new Response(JSON.stringify({ success: false, reason: "drive_export_error" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const transcriptionText = await driveRes.text();

    // Save and trigger report generation
    await supabase.from("sdr_appointments").update({
      transcription_text: transcriptionText,
      transcript_import_attempts: (meeting.transcript_import_attempts || 0) + 1,
      transcript_import_error: null,
      next_transcript_check: null,
      processing_status: "generating_ata",
    }).eq("id", meeting_id);

    // Fire-and-forget: trigger report generation
    fetch(`${supabaseUrl}/functions/v1/sdr-meeting-process-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({ meeting_id }),
    }).catch(e => console.error("[sdr-import-transcript] Process trigger failed:", e));

    return new Response(JSON.stringify({ success: true, transcription_length: transcriptionText.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[sdr-import-transcript] Error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
