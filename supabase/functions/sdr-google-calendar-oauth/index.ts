import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/meetings.space.created",
  "https://www.googleapis.com/auth/meetings.space.readonly",
  "https://www.googleapis.com/auth/drive.meet.readonly",
].join(" ");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load Google OAuth credentials from app_settings table, fallback to env vars
    let GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
    let GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";

    const { data: oauthSettings } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]);

    (oauthSettings || []).forEach((s: any) => {
      if (s.key === "GOOGLE_CLIENT_ID" && s.value) GOOGLE_CLIENT_ID = s.value;
      if (s.key === "GOOGLE_CLIENT_SECRET" && s.value) GOOGLE_CLIENT_SECRET = s.value;
    });

    const body = await req.json().catch(() => ({}));
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || body.action;

    let userId: string | null = null;
    if (action !== "callback") {
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
      userId = user.id;
    }

    switch (action) {
      case "authorize": {
        const redirectUri = body.redirect_uri;
        if (!redirectUri) {
          return new Response(JSON.stringify({ error: "redirect_uri is required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const state = btoa(JSON.stringify({ user_id: userId, redirect_uri: redirectUri }));
        const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
        authUrl.searchParams.set("redirect_uri", redirectUri);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("scope", SCOPES);
        authUrl.searchParams.set("access_type", "offline");
        authUrl.searchParams.set("prompt", "consent");
        authUrl.searchParams.set("state", state);
        return new Response(JSON.stringify({ auth_url: authUrl.toString() }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "callback": {
        const { code, state, redirect_uri } = body;
        if (!code || !state) {
          return new Response(JSON.stringify({ error: "code and state are required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        let stateData: { user_id: string; redirect_uri: string };
        try { stateData = JSON.parse(atob(state)); } catch {
          return new Response(JSON.stringify({ error: "Invalid state" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
            code, grant_type: "authorization_code", redirect_uri: redirect_uri || stateData.redirect_uri,
          }),
        });
        const tokenData = await tokenResponse.json();
        if (tokenData.error) {
          return new Response(JSON.stringify({ error: tokenData.error_description || tokenData.error }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const userInfo = await userInfoResponse.json();
        const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
        await supabase.from("google_calendar_tokens").upsert({
          user_id: stateData.user_id, access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token, expires_at: expiresAt, google_email: userInfo.email,
        }, { onConflict: "user_id" });
        return new Response(JSON.stringify({ success: true, email: userInfo.email }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "status": {
        const { data: tokenRecord } = await supabase
          .from("google_calendar_tokens").select("google_email, expires_at, refresh_token, access_token, user_id").limit(1).maybeSingle();
        if (!tokenRecord) {
          return new Response(JSON.stringify({ connected: false }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        let expired = new Date(tokenRecord.expires_at) < new Date();
        // Auto-refresh if expired but refresh_token exists
        if (expired && tokenRecord.refresh_token && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
          try {
            const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
                refresh_token: tokenRecord.refresh_token, grant_type: "refresh_token",
              }),
            });
            const refreshData = await refreshResponse.json();
            if (refreshData.access_token) {
              const newExpiresAt = new Date(Date.now() + refreshData.expires_in * 1000).toISOString();
              await supabase.from("google_calendar_tokens").update({
                access_token: refreshData.access_token, expires_at: newExpiresAt,
              }).eq("user_id", tokenRecord.user_id);
              expired = false;
              console.log("[sdr-google-calendar-oauth] Token auto-refreshed on status check");
            }
          } catch (e) {
            console.error("[sdr-google-calendar-oauth] Auto-refresh failed:", e);
          }
        }
        return new Response(JSON.stringify({
          connected: true, email: tokenRecord.google_email, expired,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "disconnect": {
        await supabase.from("google_calendar_tokens").delete().eq("user_id", userId);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error) {
    console.error("[sdr-google-calendar-oauth] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
