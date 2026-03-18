import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization")!;

    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin");

    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (user_id === caller.id) {
      return new Response(JSON.stringify({ error: "Você não pode excluir a si mesmo" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Logs: nullificar apenas UUIDs, MANTER nomes históricos
    await adminClient.from("conversation_logs").update({ assigned_to: null }).eq("assigned_to", user_id);
    await adminClient.from("conversation_logs").update({ finalized_by: null }).eq("finalized_by", user_id);

    await adminClient.from("transfer_logs").update({ from_user_id: null }).eq("from_user_id", user_id);
    await adminClient.from("transfer_logs").update({ to_user_id: null }).eq("to_user_id", user_id);

    // 2. message_deletion_logs: nullificar UUID mas manter nome
    await adminClient.from("message_deletion_logs").update({ deleted_by: null }).eq("deleted_by", user_id);

    // 3. work_schedules: nullificar created_by de OUTROS usuários, depois deletar os do próprio
    await adminClient.from("work_schedules").update({ created_by: null }).eq("created_by", user_id);
    await adminClient.from("work_schedules").delete().eq("user_id", user_id);

    // 4. Deletar registros diretos do usuário
    await adminClient.from("profile_departments").delete().eq("profile_id", user_id);
    await adminClient.from("user_roles").delete().eq("user_id", user_id);
    await adminClient.from("channel_members").delete().eq("user_id", user_id);
    await adminClient.from("channel_announcement_reads").delete().eq("user_id", user_id);
    await adminClient.from("internal_messages").delete().eq("sender_id", user_id);
    await adminClient.from("internal_messages").delete().eq("receiver_id", user_id);
    await adminClient.from("quick_messages").delete().eq("user_id", user_id);
    await adminClient.from("quick_message_categories").delete().eq("user_id", user_id);
    await adminClient.from("google_calendar_tokens").delete().eq("user_id", user_id);

    // 5. Nullificar referências em outras tabelas
    await adminClient.from("conversations").update({ assigned_to: null }).eq("assigned_to", user_id);
    await adminClient.from("messages").update({ sender_id: null }).eq("sender_id", user_id);
    await adminClient.from("internal_channels").update({ created_by: null }).eq("created_by", user_id);
    await adminClient.from("report_schedule").update({ created_by: null }).eq("created_by", user_id);
    await adminClient.from("report_snapshots").update({ created_by: null }).eq("created_by", user_id);
    await adminClient.from("robots").update({ created_by: null }).eq("created_by", user_id);
    await adminClient.from("sdr_deal_activities").update({ created_by: null }).eq("created_by", user_id);
    await adminClient.from("sdr_deals").update({ owner_id: null }).eq("owner_id", user_id);
    await adminClient.from("sdr_appointments").update({ user_id: null }).eq("user_id", user_id);
    await adminClient.from("sdr_auto_config").update({ transfer_to_user_id: null }).eq("transfer_to_user_id", user_id);
    await adminClient.from("whatsapp_connections").update({ created_by: null }).eq("created_by", user_id);

    // 6. Deletar profile
    await adminClient.from("profiles").delete().eq("id", user_id);

    // 7. Deletar auth user
    const { error: authError } = await adminClient.auth.admin.deleteUser(user_id);

    if (authError) {
      console.error("Error deleting auth user:", authError);
      return new Response(JSON.stringify({ error: "Erro ao excluir usuário da autenticação: " + authError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Error in admin-delete-user:", err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
