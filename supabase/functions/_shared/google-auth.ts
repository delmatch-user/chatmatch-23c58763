/**
 * Shared Google Auth Helper
 * Centralized token management for Edge Functions that interact with Google APIs.
 * Uses centralized admin tokens (google_calendar_tokens LIMIT 1).
 * 5-minute buffer before token expiration triggers refresh.
 * Reads GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET from app_settings table first, then env vars as fallback.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

export interface GoogleTokenResult {
  accessToken: string;
  userId: string;
  refreshed: boolean;
}

async function getGoogleOAuthCredentials(): Promise<{ clientId: string; clientSecret: string } | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: settings } = await adminClient
    .from("app_settings")
    .select("key, value")
    .in("key", ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]);

  let clientId = "";
  let clientSecret = "";

  (settings || []).forEach((s: any) => {
    if (s.key === "GOOGLE_CLIENT_ID") clientId = s.value;
    if (s.key === "GOOGLE_CLIENT_SECRET") clientSecret = s.value;
  });

  // Fallback to env vars
  if (!clientId) clientId = Deno.env.get("GOOGLE_CLIENT_ID") || "";
  if (!clientSecret) clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";

  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export async function getGoogleAccessToken(
  supabase: any
): Promise<GoogleTokenResult | null> {
  const { data: tokenRecord, error } = await supabase
    .from("google_calendar_tokens")
    .select("*")
    .limit(1)
    .single();

  if (error || !tokenRecord) {
    console.log("[google-auth] No Google tokens found in google_calendar_tokens");
    return null;
  }

  const expiresAt = new Date(tokenRecord.expires_at);
  const now = new Date();

  if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
    return {
      accessToken: tokenRecord.access_token,
      userId: tokenRecord.user_id,
      refreshed: false,
    };
  }

  const creds = await getGoogleOAuthCredentials();
  if (!creds) {
    console.error("[google-auth] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not configured");
    return null;
  }

  if (!tokenRecord.refresh_token) {
    console.error("[google-auth] No refresh_token available");
    return null;
  }

  const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: tokenRecord.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  const refreshData = await refreshResponse.json();

  if (refreshData.error) {
    console.error("[google-auth] Token refresh failed:", refreshData.error_description || refreshData.error);
    return null;
  }

  const newExpiresAt = new Date(Date.now() + refreshData.expires_in * 1000).toISOString();

  await supabase
    .from("google_calendar_tokens")
    .update({
      access_token: refreshData.access_token,
      expires_at: newExpiresAt,
    })
    .eq("user_id", tokenRecord.user_id);

  console.log("[google-auth] Token refreshed successfully");

  return {
    accessToken: refreshData.access_token,
    userId: tokenRecord.user_id,
    refreshed: true,
  };
}

export function extractMeetingCode(meetUrl: string): string | null {
  const match = meetUrl.match(/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i);
  return match ? match[1] : null;
}
