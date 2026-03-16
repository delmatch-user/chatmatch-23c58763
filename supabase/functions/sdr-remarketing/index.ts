import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_ATTEMPTS = 3;

async function sendViaMachine(conversationId: string, message: string, senderName: string): Promise<boolean> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/machine-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({ conversationId, message, senderName }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function sendViaMetaApi(phoneNumberId: string, toPhone: string, message: string): Promise<boolean> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/meta-whatsapp-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({ phone_number_id: phoneNumberId, to: toPhone, message, type: "text" }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function sendViaBaileys(contactPhone: string, message: string, instanceId?: string, jid?: string): Promise<boolean> {
  try {
    const body: any = { action: "send", to: contactPhone || '', message, type: "text" };
    if (instanceId) body.instanceId = instanceId;
    if (jid) body.jid = jid;
    const response = await fetch(`${supabaseUrl}/functions/v1/baileys-proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify(body),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function markAsLost(supabase: any, dealId: string, perdidoId: string, totalAttempts: number): Promise<void> {
  await supabase.from("sdr_deals").update({
    stage_id: perdidoId,
    lost_at: new Date().toISOString(),
    lost_reason: "Sem resposta",
    remarketing_stopped: true,
  }).eq("id", dealId);

  await supabase.from("sdr_deal_activities").insert({
    deal_id: dealId,
    type: "remarketing",
    title: "Lead marcado como perdido",
    description: `Todas as ${totalAttempts} tentativas de remarketing foram esgotadas sem resposta do cliente. Motivo: Sem resposta.`,
  });

  console.log(`[SDR-Remarketing] Deal ${dealId} marked as lost (Sem resposta after ${totalAttempts} attempts).`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch active remarketing rules ordered by position
    const { data: rules, error: rulesErr } = await supabase
      .from("sdr_remarketing_config")
      .select("*")
      .eq("is_active", true)
      .order("position", { ascending: true });

    if (rulesErr || !rules || rules.length === 0) {
      console.log("[SDR-Remarketing] No active rules found.");
      return new Response(JSON.stringify({ processed: 0, reason: "no_rules" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Limit to MAX_ATTEMPTS rules
    const effectiveRules = rules.slice(0, MAX_ATTEMPTS);
    console.log(`[SDR-Remarketing] ${effectiveRules.length} effective rules (max ${MAX_ATTEMPTS}).`);

    // 2. Get "Perdido" stage ID
    const { data: perdidoStage } = await supabase
      .from("sdr_pipeline_stages")
      .select("id")
      .eq("is_system", true)
      .ilike("title", "perdido")
      .maybeSingle();

    const perdidoId = perdidoStage?.id;

    // 3. Get "Novo Lead" stage
    const { data: novoLeadStage } = await supabase
      .from("sdr_pipeline_stages")
      .select("id")
      .eq("is_active", true)
      .eq("is_system", false)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!novoLeadStage?.id) {
      console.log("[SDR-Remarketing] No 'Novo Lead' stage found. Aborting.");
      return new Response(JSON.stringify({ processed: 0, reason: "no_novo_lead_stage" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Fetch eligible deals in "Novo Lead" stage
    const { data: deals, error: dealsErr } = await supabase
      .from("sdr_deals")
      .select("id, title, contact_id, last_customer_message_at, created_at, remarketing_attempts, stage_id, contact:contacts(phone, name, notes)")
      .eq("remarketing_stopped", false)
      .is("won_at", null)
      .is("lost_at", null)
      .eq("stage_id", novoLeadStage.id);

    if (dealsErr || !deals || deals.length === 0) {
      console.log("[SDR-Remarketing] No eligible deals found.");
      return new Response(JSON.stringify({ processed: 0, reason: "no_deals" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[SDR-Remarketing] Found ${deals.length} eligible deals.`);

    // 5. Fetch SDR robot config for sender name
    const { data: robotConfig } = await supabase
      .from("sdr_robot_config")
      .select("robot_id")
      .eq("is_active", true)
      .maybeSingle();

    let robotName = "Assistente";
    if (robotConfig?.robot_id) {
      const { data: robot } = await supabase.from("robots").select("name").eq("id", robotConfig.robot_id).single();
      if (robot) robotName = robot.name;
    }

    let processed = 0;

    for (const deal of deals as any[]) {
      const attempts = deal.remarketing_attempts || 0;

      // === CASE 1: All attempts exhausted → mark as lost ===
      if (attempts >= MAX_ATTEMPTS) {
        if (perdidoId) {
          await markAsLost(supabase, deal.id, perdidoId, attempts);
          processed++;
        }
        continue;
      }

      // === CASE 2: Get the next rule by sequential index ===
      const nextRule = effectiveRules[attempts]; // attempts=0 → rule[0], attempts=1 → rule[1], etc.
      if (!nextRule) {
        // No more rules available → mark as lost
        if (perdidoId) {
          await markAsLost(supabase, deal.id, perdidoId, attempts);
          processed++;
        }
        continue;
      }

      // Calculate days inactive from reference date
      const referenceDate = deal.last_customer_message_at || deal.created_at;
      const lastMsg = new Date(referenceDate);
      const now = new Date();
      const daysInactive = Math.floor((now.getTime() - lastMsg.getTime()) / (1000 * 60 * 60 * 24));

      // Not enough days inactive yet → skip
      if (daysInactive < nextRule.days_inactive) {
        continue;
      }

      // Check if customer responded after last remarketing attempt
      if (attempts > 0) {
        const { data: lastLog } = await supabase
          .from("sdr_remarketing_log")
          .select("sent_at")
          .eq("deal_id", deal.id)
          .order("sent_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastLog && deal.last_customer_message_at) {
          const lastRemarketing = new Date(lastLog.sent_at);
          const lastCustomer = new Date(deal.last_customer_message_at);
          if (lastCustomer > lastRemarketing) {
            console.log(`[SDR-Remarketing] Deal ${deal.id}: Customer responded after last attempt. Skipping.`);
            continue;
          }
        }
      }

      // Find conversation linked to this deal
      const { data: conv } = await supabase
        .from("conversations")
        .select("id, channel, department_id, whatsapp_instance_id, assigned_to")
        .eq("sdr_deal_id", deal.id)
        .is("assigned_to", null)
        .in("status", ["em_fila", "em_atendimento", "pendente"])
        .maybeSingle();

      if (!conv) {
        console.log(`[SDR-Remarketing] No active conversation for deal ${deal.id}. Skipping.`);
        continue;
      }

      // Get contact phone/JID
      let contactPhone = (deal.contact as any)?.phone;
      let contactJid: string | null = null;
      const contactNotes = (deal.contact as any)?.notes || '';
      const jidMatch = contactNotes.match(/jid:(\S+)/);
      if (jidMatch) {
        contactJid = jidMatch[1];
        if (contactJid && !contactJid.includes('@')) {
          contactJid = `${contactJid}@lid`;
        }
      }

      const nextAttempt = attempts + 1;
      const messageText = nextRule.message_template;

      // === DEDUP: Log BEFORE send (ON CONFLICT DO NOTHING) ===
      const { data: logInsert, error: logErr } = await supabase
        .from("sdr_remarketing_log")
        .insert({
          deal_id: deal.id,
          config_id: nextRule.id,
          attempt_number: nextAttempt,
        })
        .select("id")
        .maybeSingle();

      if (logErr || !logInsert) {
        console.log(`[SDR-Remarketing] Deal ${deal.id}: Skipped (already processed attempt #${nextAttempt}).`);
        continue;
      }

      // Atomically claim the deal
      const { count: claimCount } = await supabase
        .from("sdr_deals")
        .update({
          remarketing_attempts: nextAttempt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", deal.id)
        .eq("remarketing_attempts", attempts);

      if (claimCount === 0) {
        console.log(`[SDR-Remarketing] Deal ${deal.id}: Skipped (concurrent claim).`);
        continue;
      }

      // Save message in conversation
      await supabase.from("messages").insert({
        conversation_id: conv.id,
        content: messageText,
        sender_name: `${robotName} [ROBOT]`,
        sender_id: null,
        message_type: "text",
        status: "sent",
      });

      // Send via appropriate channel
      let sent = false;
      if (conv.channel === "machine") {
        sent = await sendViaMachine(conv.id, messageText, robotName);
      } else if (contactPhone || contactJid) {
        const { data: metaConn } = await supabase
          .from("whatsapp_connections")
          .select("connection_type, phone_number_id")
          .eq("department_id", conv.department_id)
          .eq("connection_type", "meta_api")
          .eq("status", "connected")
          .maybeSingle();

        if (metaConn && contactPhone) {
          sent = await sendViaMetaApi(metaConn.phone_number_id, contactPhone, `*${robotName}*: ${messageText}`);
        } else {
          const { data: baileysConn } = await supabase
            .from("whatsapp_connections")
            .select("connection_type, phone_number_id")
            .eq("department_id", conv.department_id)
            .eq("connection_type", "baileys")
            .eq("status", "connected")
            .maybeSingle();

          if (baileysConn) {
            const instanceId = conv.whatsapp_instance_id || baileysConn.phone_number_id;
            sent = await sendViaBaileys(contactPhone || contactJid || '', `*${robotName}*: ${messageText}`, instanceId);
          }
        }
      }

      // Update conversation preview
      await supabase.from("conversations").update({
        last_message_preview: messageText.substring(0, 80),
        updated_at: new Date().toISOString(),
      }).eq("id", conv.id);

      // Log activity
      await supabase.from("sdr_deal_activities").insert({
        deal_id: deal.id,
        type: "remarketing",
        title: `Remarketing #${nextAttempt}/${MAX_ATTEMPTS} enviado`,
        description: `Tentativa ${nextAttempt} de ${MAX_ATTEMPTS}. Mensagem enviada após ${daysInactive} dias de inatividade.${!sent ? ' (não entregue externamente)' : ''}`,
      });

      console.log(`[SDR-Remarketing] Deal ${deal.id}: Sent attempt #${nextAttempt}/${MAX_ATTEMPTS} (${daysInactive} days inactive). Delivered: ${sent}`);
      processed++;
    }

    return new Response(JSON.stringify({ processed, total_deals: deals.length }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[SDR-Remarketing] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
