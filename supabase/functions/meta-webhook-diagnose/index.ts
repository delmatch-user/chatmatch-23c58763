import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const repair = body.repair === true;

    // 1. Get meta_api connection
    const { data: connection, error: connErr } = await supabase
      .from('whatsapp_connections')
      .select('*')
      .eq('connection_type', 'meta_api')
      .limit(1)
      .maybeSingle();

    if (!connection) {
      return new Response(JSON.stringify({
        success: false,
        diagnosis: {
          connection_found: false,
          error: 'Nenhuma conexão meta_api encontrada no banco',
        }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const token = connection.access_token || Deno.env.get('META_WHATSAPP_ACCESS_TOKEN');
    const wabaId = connection.waba_id;
    const phoneNumberId = connection.phone_number_id;

    const diagnosis: Record<string, any> = {
      connection_found: true,
      connection_id: connection.id,
      connection_name: connection.name,
      connection_status: connection.status,
      phone_number_id: phoneNumberId,
      waba_id: wabaId,
      has_token: !!token,
      token_source: connection.access_token ? 'database' : 'env_variable',
    };

    // 2. Validate token with debug_token or simple API call
    if (token) {
      try {
        const meRes = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const meData = await meRes.json();
        diagnosis.token_valid = meRes.ok;
        diagnosis.phone_number_info = meRes.ok ? {
          display_phone_number: meData.display_phone_number,
          verified_name: meData.verified_name,
          quality_rating: meData.quality_rating,
        } : { error: meData.error?.message || 'Token inválido' };
      } catch (e) {
        diagnosis.token_valid = false;
        diagnosis.token_error = e instanceof Error ? e.message : String(e);
      }
    } else {
      diagnosis.token_valid = false;
      diagnosis.token_error = 'Nenhum token configurado';
    }

    // 3. Check WABA subscribed_apps
    if (token && wabaId) {
      try {
        const subRes = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const subData = await subRes.json();
        diagnosis.waba_subscribed_apps = subData;
        diagnosis.waba_subscription_ok = subRes.ok && (subData.data || []).length > 0;
      } catch (e) {
        diagnosis.waba_subscription_ok = false;
        diagnosis.waba_subscription_error = e instanceof Error ? e.message : String(e);
      }
    }

    // 4. Check last audit entries
    const { data: lastEvents } = await supabase
      .from('meta_webhook_audit')
      .select('received_at, decision, from_phone, is_test, signature_valid, field')
      .order('received_at', { ascending: false })
      .limit(5);

    diagnosis.last_events = lastEvents || [];

    const { data: lastRealEvent } = await supabase
      .from('meta_webhook_audit')
      .select('received_at, decision, from_phone')
      .eq('is_test', false)
      .neq('decision', 'webhook_received')
      .order('received_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    diagnosis.last_real_event = lastRealEvent || null;

    const { data: lastWebhookReceived } = await supabase
      .from('meta_webhook_audit')
      .select('received_at, signature_valid, field, entry_id')
      .eq('decision', 'webhook_received')
      .eq('is_test', false)
      .order('received_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    diagnosis.last_webhook_received = lastWebhookReceived || null;

    // 5. Repair: re-subscribe app to WABA
    if (repair && token && wabaId) {
      try {
        const repairRes = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const repairData = await repairRes.json();
        diagnosis.repair_result = {
          success: repairRes.ok,
          data: repairData,
        };
      } catch (e) {
        diagnosis.repair_result = {
          success: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }

    // 6. Check APP_SECRET configured
    const appSecret = Deno.env.get('META_WHATSAPP_APP_SECRET');
    diagnosis.app_secret_configured = !!appSecret;
    if (appSecret) {
      diagnosis.app_secret_prefix = appSecret.substring(0, 4) + '...';
    }

    return new Response(JSON.stringify({
      success: true,
      diagnosis,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
