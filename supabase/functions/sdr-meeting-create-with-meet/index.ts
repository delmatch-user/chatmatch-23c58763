import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getGoogleAccessToken } from "../_shared/google-auth.ts";

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
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { title, description, date, time, duration, type, attendees, contact_id } = body;

    if (!title || !date) {
      return new Response(JSON.stringify({ error: "title and date required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let googleMeetUrl: string | null = null;
    let googleEventId: string | null = null;

    // Try to create Google Meet + Calendar event
    const tokenResult = await getGoogleAccessToken(supabase);
    if (tokenResult) {
      const { accessToken } = tokenResult;

      // Create Meet Space
      const meetRes = await fetch("https://meet.googleapis.com/v2/spaces", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ config: { accessType: "OPEN", entryPointAccess: "ALL" } }),
      });
      const meetData = await meetRes.json();

      if (!meetData.error && meetData.meetingUri) {
        googleMeetUrl = meetData.meetingUri;
        const meetCode = meetData.meetingCode;

        // Create Calendar event
        const startTime = new Date(`${date}T${time || '09:00'}:00`);
        const endTime = new Date(startTime.getTime() + (duration || 60) * 60 * 1000);

        const calendarEvent = {
          summary: `[Comercial] ${title}`,
          description: description || "",
          start: { dateTime: startTime.toISOString(), timeZone: "America/Sao_Paulo" },
          end: { dateTime: endTime.toISOString(), timeZone: "America/Sao_Paulo" },
          conferenceData: {
            conferenceSolution: { key: { type: "hangoutsMeet" }, name: "Google Meet" },
            conferenceId: meetCode,
            entryPoints: [{ entryPointType: "video", uri: googleMeetUrl, label: meetCode }],
          },
          reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 15 }] },
        };

        const calRes = await fetch(
          "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all",
          { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(calendarEvent) }
        );
        const calData = await calRes.json();
        if (!calData.error) googleEventId = calData.id;
        else console.error("[sdr-meeting-create] Calendar error:", calData.error);

        console.log(`[sdr-meeting-create] Meet created: ${googleMeetUrl}`);
      } else {
        console.error("[sdr-meeting-create] Meet API error:", meetData.error);
      }
    } else {
      console.log("[sdr-meeting-create] Google not connected, creating without Meet");
    }

    // Insert appointment
    const { data: appointment, error: insertError } = await supabase.from("sdr_appointments").insert({
      title, description, date, time: time || "09:00",
      duration: duration || 60, type: type || "meeting",
      attendees: attendees || [], contact_id: contact_id || null,
      user_id: user.id, status: "scheduled",
      meeting_url: googleMeetUrl, google_meet_url: googleMeetUrl, google_event_id: googleEventId,
    }).select().single();

    if (insertError) throw new Error(insertError.message);

    return new Response(JSON.stringify({ success: true, appointment, google_meet_url: googleMeetUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[sdr-meeting-create] Error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
