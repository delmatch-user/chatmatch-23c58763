import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // JWT Authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check admin role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: 'Forbidden - Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { action } = body;

    // Use service role for app_settings operations
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    if (action === 'check') {
      // Check which API keys are configured
      const keys: Record<string, boolean> = {
        openai: !!Deno.env.get('OPENAI_API_KEY'),
        google: !!Deno.env.get('GOOGLE_GEMINI_API_KEY'),
        anthropic: !!Deno.env.get('ANTHROPIC_API_KEY'),
      };

      return new Response(JSON.stringify({ keys }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'check_google_oauth') {
      // Check from app_settings table
      const { data: settings } = await adminClient
        .from('app_settings')
        .select('key, value')
        .in('key', ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']);

      const settingsMap: Record<string, boolean> = {};
      (settings || []).forEach((s: any) => {
        settingsMap[s.key] = !!s.value;
      });

      return new Response(JSON.stringify({
        google_client_id: settingsMap['GOOGLE_CLIENT_ID'] || !!Deno.env.get('GOOGLE_CLIENT_ID'),
        google_client_secret: settingsMap['GOOGLE_CLIENT_SECRET'] || !!Deno.env.get('GOOGLE_CLIENT_SECRET'),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'get_google_oauth') {
      // Return masked values from app_settings
      const { data: settings } = await adminClient
        .from('app_settings')
        .select('key, value')
        .in('key', ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']);

      const result: Record<string, string> = {};
      (settings || []).forEach((s: any) => {
        if (s.key === 'GOOGLE_CLIENT_ID') {
          result.google_client_id = s.value; // Client ID can be shown
        } else if (s.key === 'GOOGLE_CLIENT_SECRET') {
          // Mask secret: show first 8 chars + asterisks
          const val = s.value || '';
          result.google_client_secret = val.length > 8 ? val.substring(0, 8) + '••••••••' : val;
        }
      });

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'save_google_oauth') {
      const { google_client_id, google_client_secret } = body;

      if (!google_client_id || !google_client_secret) {
        return new Response(JSON.stringify({ success: false, message: 'Ambos os campos são obrigatórios' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Upsert both values
      for (const [key, value] of [['GOOGLE_CLIENT_ID', google_client_id], ['GOOGLE_CLIENT_SECRET', google_client_secret]]) {
        const { error: upsertError } = await adminClient
          .from('app_settings')
          .upsert(
            { key, value, updated_at: new Date().toISOString() },
            { onConflict: 'key' }
          );

        if (upsertError) {
          console.error(`Error saving ${key}:`, upsertError);
          return new Response(JSON.stringify({ success: false, message: `Erro ao salvar ${key}` }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'test') {
      // Test the API key for a given provider
      const { provider } = body;
      let success = false;
      let message = '';

      if (provider === 'openai') {
        const apiKey = Deno.env.get('OPENAI_API_KEY');
        if (!apiKey) {
          message = 'API Key não configurada';
        } else {
          try {
            const resp = await fetch('https://api.openai.com/v1/models', {
              headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            success = resp.ok;
            message = success ? 'Conexão bem sucedida!' : `Erro: ${resp.status}`;
          } catch (e) {
            message = 'Erro de conexão';
          }
        }
      } else if (provider === 'google') {
        const apiKey = Deno.env.get('GOOGLE_GEMINI_API_KEY');
        if (!apiKey) {
          message = 'API Key não configurada';
        } else {
          try {
            const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model: 'gemini-2.5-flash-lite',
                messages: [{ role: 'user', content: 'Hi' }],
                max_tokens: 5
              })
            });
            success = resp.ok;
            message = success ? 'Conexão bem sucedida!' : `Erro: ${resp.status}`;
          } catch (e) {
            message = 'Erro de conexão';
          }
        }
      } else if (provider === 'anthropic') {
        const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
        if (!apiKey) {
          message = 'API Key não configurada';
        } else {
          try {
            const resp = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model: 'claude-haiku-3-5-20241022',
                max_tokens: 5,
                messages: [{ role: 'user', content: 'Hi' }]
              })
            });
            success = resp.ok;
            message = success ? 'Conexão bem sucedida!' : `Erro: ${resp.status}`;
          } catch (e) {
            message = 'Erro de conexão';
          }
        }
      }

      return new Response(JSON.stringify({ success, message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in manage-ai-keys:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
