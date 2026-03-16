import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GRAPH_API_VERSION = 'v18.0';

interface OAuthRequest {
  userAccessToken: string;
  selectedPageId?: string;
  verifyToken?: string;
  departmentId?: string;
  name?: string;
}

interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const body: OAuthRequest = await req.json();
    const { userAccessToken, selectedPageId, verifyToken, departmentId, name } = body;

    if (!userAccessToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'userAccessToken é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const appSecret = Deno.env.get('META_WHATSAPP_APP_SECRET');
    if (!appSecret) {
      return new Response(
        JSON.stringify({ success: false, error: 'META_WHATSAPP_APP_SECRET não configurado no backend' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Instagram OAuth] Iniciando troca de token...');

    // Step 1: Exchange short-lived token for long-lived user token
    const appId = Deno.env.get('META_FACEBOOK_APP_ID');
    const exchangeUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId || ''}&client_secret=${appSecret}&fb_exchange_token=${userAccessToken}`;

    const exchangeRes = await fetch(exchangeUrl);
    const exchangeData = await exchangeRes.json();

    if (exchangeData.error) {
      console.error('[Instagram OAuth] Erro ao trocar token:', exchangeData.error);
      // Fallback: use the short-lived token directly if exchange fails (e.g. no app_id)
      console.log('[Instagram OAuth] Usando token original como fallback');
    }

    const longLivedToken = exchangeData.access_token || userAccessToken;

    // Step 2: Get user's pages with their page access tokens
    console.log('[Instagram OAuth] Buscando páginas...');
    const pagesRes = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/me/accounts?fields=id,name,access_token&access_token=${longLivedToken}`
    );
    const pagesData = await pagesRes.json();

    if (pagesData.error) {
      console.error('[Instagram OAuth] Erro ao buscar páginas:', pagesData.error);
      return new Response(
        JSON.stringify({ success: false, error: pagesData.error.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const pages: FacebookPage[] = pagesData.data || [];

    if (pages.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhuma página do Facebook encontrada. Sua conta precisa ter uma Página vinculada.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 3: For each page, get Instagram Business Account
    const pagesWithIG: FacebookPage[] = [];

    for (const page of pages) {
      const igRes = await fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
      );
      const igData = await igRes.json();

      if (igData.instagram_business_account) {
        pagesWithIG.push({
          ...page,
          instagram_business_account: igData.instagram_business_account,
        });
      }
    }

    if (pagesWithIG.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Nenhuma conta do Instagram Business vinculada às suas páginas. Vincule uma conta profissional do Instagram à sua Página do Facebook.',
          pages: pages.map(p => ({ id: p.id, name: p.name })),
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If multiple pages have IG and no selection was made, return the list
    if (pagesWithIG.length > 1 && !selectedPageId) {
      return new Response(
        JSON.stringify({
          success: true,
          needsSelection: true,
          pages: pagesWithIG.map(p => ({
            pageId: p.id,
            pageName: p.name,
            igAccountId: p.instagram_business_account!.id,
          })),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Select the page (either the only one or the user's choice)
    const selectedPage = selectedPageId
      ? pagesWithIG.find(p => p.id === selectedPageId)
      : pagesWithIG[0];

    if (!selectedPage) {
      return new Response(
        JSON.stringify({ success: false, error: 'Página selecionada não encontrada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const pageId = selectedPage.id;
    const pageName = selectedPage.name;
    const pageAccessToken = selectedPage.access_token;
    const igAccountId = selectedPage.instagram_business_account!.id;

    console.log('[Instagram OAuth] Página selecionada:', pageName, '| IG Account:', igAccountId);

    // Step 4: Upsert connection in whatsapp_connections
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const connectionData = {
      connection_type: 'instagram',
      phone_number_id: igAccountId,
      waba_id: pageId,
      access_token: pageAccessToken,
      department_id: departmentId || null,
      verify_token: verifyToken || null,
      name: name || `Instagram - ${pageName}`,
      status: 'active',
      updated_at: new Date().toISOString(),
    };

    // Check if connection already exists for this IG account
    const { data: existing } = await supabase
      .from('whatsapp_connections')
      .select('id')
      .eq('connection_type', 'instagram')
      .eq('phone_number_id', igAccountId)
      .maybeSingle();

    let connectionId: string;

    if (existing) {
      const { error } = await supabase
        .from('whatsapp_connections')
        .update(connectionData)
        .eq('id', existing.id);

      if (error) {
        console.error('[Instagram OAuth] Erro ao atualizar conexão:', error);
        throw error;
      }
      connectionId = existing.id;
    } else {
      const { data: newConn, error } = await supabase
        .from('whatsapp_connections')
        .insert(connectionData)
        .select('id')
        .single();

      if (error) {
        console.error('[Instagram OAuth] Erro ao criar conexão:', error);
        throw error;
      }
      connectionId = newConn.id;
    }

    console.log('[Instagram OAuth] Conexão salva:', connectionId);

    return new Response(
      JSON.stringify({
        success: true,
        connectionId,
        pageId,
        pageName,
        igAccountId,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[Instagram OAuth] Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
