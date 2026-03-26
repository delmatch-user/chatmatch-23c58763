import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Sincronizar status dos robôs (já existente)
    const { data: syncCount, error: syncError } = await supabase.rpc("sync_robot_statuses");
    if (syncError) throw syncError;
    console.log("[sync-robot-schedules] Status sincronizados:", syncCount);

    // 2. Buscar robôs ativos
    const { data: activeRobots, error: robotsError } = await supabase
      .from("robots")
      .select("id, name, departments, channels, manually_activated, auto_assign")
      .eq("status", "active");

    if (robotsError) throw robotsError;

    if (!activeRobots || activeRobots.length === 0) {
      console.log("[sync-robot-schedules] Nenhum robô ativo, pulando varredura de fila.");
      return new Response(
        JSON.stringify({ updated: syncCount, assigned: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Verificar escala de cada robô ativo
    const robotsInSchedule: typeof activeRobots = [];
    for (const robot of activeRobots) {
      if (robot.manually_activated) {
        robotsInSchedule.push(robot);
        continue;
      }
      const { data: withinSchedule } = await supabase.rpc("is_robot_within_schedule", { robot_uuid: robot.id });
      if (withinSchedule !== false) {
        robotsInSchedule.push(robot);
      }
    }

    if (robotsInSchedule.length === 0) {
      console.log("[sync-robot-schedules] Nenhum robô dentro da escala.");
      return new Response(
        JSON.stringify({ updated: syncCount, assigned: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[sync-robot-schedules] Robôs na escala:", robotsInSchedule.map(r => r.name));

    // 3.5 Buscar config SDR para pular robô SDR sem keyword e fora do dept Comercial
    const { data: sdrCfg } = await supabase.from("sdr_robot_config").select("robot_id").eq("is_active", true).maybeSingle();
    const sdrRobotId = sdrCfg?.robot_id || null;
    let sdrKeywords: string[] = [];
    let comercialDeptId: string | null = null;
    if (sdrRobotId) {
      const { data: sdrAuto } = await supabase.from("sdr_auto_config").select("keywords").eq("is_active", true).maybeSingle();
      sdrKeywords = (sdrAuto?.keywords as string[]) || [];
      const { data: comercialDept } = await supabase.from("departments").select("id").ilike("name", "comercial").maybeSingle();
      comercialDeptId = comercialDept?.id || null;
    }
    console.log("[sync-robot-schedules] SDR robot:", sdrRobotId, "keywords:", sdrKeywords, "comercialDeptId:", comercialDeptId);

    // 4. Buscar conversas em_fila sem robô e sem atendente
    const { data: queuedConversations, error: convError } = await supabase
      .from("conversations")
      .select("id, department_id, channel, contact_id, external_id")
      .eq("status", "em_fila")
      .is("assigned_to", null)
      .is("assigned_to_robot", null)
      .eq("robot_transferred", false)
      .order("created_at", { ascending: true });

    if (convError) throw convError;

    if (!queuedConversations || queuedConversations.length === 0) {
      console.log("[sync-robot-schedules] Nenhuma conversa na fila sem atribuição.");
      return new Response(
        JSON.stringify({ updated: syncCount, assigned: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[sync-robot-schedules] Conversas na fila:", queuedConversations.length);

    // 5. Para cada conversa, tentar encontrar robô compatível (usando TODOS os robôs ativos, incluindo ativados manualmente)
    let assignedCount = 0;

    for (const conv of queuedConversations) {
      const channel = conv.channel || "whatsapp";

      // Buscar última mensagem do cliente para verificação de keywords (usado pelo SDR)
      let lastClientMsg = "";
      if (sdrRobotId && sdrKeywords.length > 0) {
        const { data: lm } = await supabase
          .from("messages")
          .select("content")
          .eq("conversation_id", conv.id)
          .is("sender_id", null)
          .neq("message_type", "system")
          .not("sender_name", "ilike", "%[robot]%")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        lastClientMsg = lm?.content || "";
      }

      // Encontrar robô compatível (departamento + canal + auto_assign) entre robôs na escala ou ativados manualmente
      let matchedRobot = null;
      for (const r of robotsInSchedule) {
        // Pular robôs que não devem assumir da fila automaticamente
        if (r.auto_assign === false) continue;
        const depts: string[] = r.departments || [];
        const channels: string[] = r.channels || ["whatsapp", "instagram", "machine"];
        if (!depts.includes(conv.department_id) || !channels.includes(channel)) continue;
        // Pular robô SDR se não é dept Comercial ou se a mensagem não contém keywords
        if (r.id === sdrRobotId) {
          if (comercialDeptId && conv.department_id !== comercialDeptId) {
            console.log(`[sync-robot-schedules] Robô SDR pulado para ${conv.id} (dept não é Comercial)`);
            continue;
          }
          if (sdrKeywords.length > 0) {
            const msgLower = lastClientMsg.toLowerCase();
            const hasKeyword = sdrKeywords.some(kw => msgLower.includes(kw.toLowerCase()));
            if (!hasKeyword) {
              console.log(`[sync-robot-schedules] Robô SDR pulado para ${conv.id} (sem keyword)`);
              continue;
            }
          }
        }
        matchedRobot = r;
        break;
      }

      if (!matchedRobot) {
        continue;
      }

      // Atribuir robô à conversa
      const { error: updateError } = await supabase
        .from("conversations")
        .update({
          assigned_to_robot: matchedRobot.id,
          status: "em_atendimento",
          updated_at: new Date().toISOString(),
        })
        .eq("id", conv.id);

      if (updateError) {
        console.error("[sync-robot-schedules] Erro ao atribuir conversa:", conv.id, updateError.message);
        continue;
      }

      console.log(`[sync-robot-schedules] Conversa ${conv.id} atribuída ao robô ${matchedRobot.name}`);
      assignedCount++;

      // 6. Buscar última mensagem do cliente para enviar ao robot-chat
      const { data: lastMessage } = await supabase
        .from("messages")
        .select("content, sender_id")
        .eq("conversation_id", conv.id)
        .is("sender_id", null)  // Mensagens do cliente (sem sender_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const messageContent = lastMessage?.content || "Olá";

      // Buscar dados do contato para envio
      const { data: contact } = await supabase
        .from("contacts")
        .select("phone")
        .eq("id", conv.contact_id)
        .maybeSingle();

      // Determinar tipo de conexão e phone_number_id para WhatsApp
      let connectionType = "machine";
      let phoneNumberId = "";

      if (channel === "whatsapp") {
        // Buscar conexão WhatsApp do departamento
        const { data: whatsappConn } = await supabase
          .from("whatsapp_connections")
          .select("phone_number_id, connection_type")
          .eq("department_id", conv.department_id)
          .eq("status", "connected")
          .limit(1)
          .maybeSingle();

        if (whatsappConn) {
          connectionType = whatsappConn.connection_type || "baileys";
          phoneNumberId = whatsappConn.phone_number_id;
        }
      } else if (channel === "instagram") {
        connectionType = "instagram";
      }

      // Chamar robot-chat para o robô responder
      try {
        const robotChatPayload: Record<string, unknown> = {
          robotId: matchedRobot.id,
          conversationId: conv.id,
          message: messageContent,
          contactPhone: contact?.phone || "",
          connectionType: channel === "machine" ? "machine" : connectionType,
        };

        if (channel === "whatsapp" && phoneNumberId) {
          robotChatPayload.phoneNumberId = phoneNumberId;
        }

        const robotChatUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/robot-chat`;
        const robotChatResponse = await fetch(robotChatUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify(robotChatPayload),
        });

        if (!robotChatResponse.ok) {
          const errText = await robotChatResponse.text();
          console.error(`[sync-robot-schedules] Erro ao chamar robot-chat para ${conv.id}:`, errText);
        } else {
          console.log(`[sync-robot-schedules] robot-chat chamado com sucesso para ${conv.id}`);
        }
      } catch (chatError) {
        console.error(`[sync-robot-schedules] Erro ao invocar robot-chat:`, chatError);
      }
    }

    console.log(`[sync-robot-schedules] Total atribuídas: ${assignedCount}`);

    // ========== SEGUNDA VARREDURA: conversas travadas (robô atribuído mas sem resposta) ==========
    let retriedCount = 0;

    const { data: stuckConversations, error: stuckError } = await supabase
      .from("conversations")
      .select("id, department_id, channel, contact_id, external_id, assigned_to_robot, sdr_deal_id")
      .eq("status", "em_atendimento")
      .not("assigned_to_robot", "is", null)
      .is("assigned_to", null)
      .order("created_at", { ascending: true });

    if (stuckError) {
      console.error("[sync-robot-schedules] Erro ao buscar conversas travadas:", stuckError.message);
    } else if (stuckConversations && stuckConversations.length > 0) {
      console.log(`[sync-robot-schedules] Conversas potencialmente travadas: ${stuckConversations.length}`);

      for (const conv of stuckConversations) {
        // Verificar se houve transferência recente (últimos 3 min) — dar tempo ao robô destino
        const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
        const { data: recentTransfer } = await supabase
          .from("transfer_logs")
          .select("id")
          .eq("conversation_id", conv.id)
          .gte("created_at", threeMinAgo)
          .limit(1);

        if (recentTransfer && recentTransfer.length > 0) {
          console.log(`[sync-robot-schedules] Conversa ${conv.id} tem transferência recente, pulando retry`);
          continue;
        }

        // Verificar se o robô já respondeu (mensagem com [ROBOT] no sender_name)
        const { data: robotMessages, error: msgCheckError } = await supabase
          .from("messages")
          .select("id")
          .eq("conversation_id", conv.id)
          .like("sender_name", "%[ROBOT]%")
          .limit(1);

        if (msgCheckError) {
          console.error(`[sync-robot-schedules] Erro ao verificar msgs robô para ${conv.id}:`, msgCheckError.message);
          continue;
        }

        // Se já tem resposta do robô, pular
        if (robotMessages && robotMessages.length > 0) {
          continue;
        }

        console.log(`[sync-robot-schedules] Conversa travada detectada: ${conv.id} (robô atribuído mas sem resposta)`);

        // Buscar última mensagem do cliente
        const { data: lastMsg } = await supabase
          .from("messages")
          .select("content")
          .eq("conversation_id", conv.id)
          .is("sender_id", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const msgContent = lastMsg?.content || "Olá";

        // Buscar contato
        const { data: contactData } = await supabase
          .from("contacts")
          .select("phone")
          .eq("id", conv.contact_id)
          .maybeSingle();

        const ch = conv.channel || "whatsapp";
        let connType = "machine";
        let pnId = "";

        if (ch === "whatsapp") {
          const { data: waConn } = await supabase
            .from("whatsapp_connections")
            .select("phone_number_id, connection_type")
            .eq("department_id", conv.department_id)
            .eq("status", "connected")
            .limit(1)
            .maybeSingle();

          if (waConn) {
            connType = waConn.connection_type || "baileys";
            pnId = waConn.phone_number_id;
          }
        } else if (ch === "instagram") {
          connType = "instagram";
        }

        try {
          const payload: Record<string, unknown> = {
            robotId: conv.assigned_to_robot,
            conversationId: conv.id,
            message: msgContent,
            contactPhone: contactData?.phone || "",
            connectionType: ch === "machine" ? "machine" : connType,
          };

          if (ch === "whatsapp" && pnId) {
            payload.phoneNumberId = pnId;
          }

          // Rotear para sdr-robot-chat se for conversa SDR
          const isSDR = !!conv.sdr_deal_id;
          const functionName = isSDR ? "sdr-robot-chat" : "robot-chat";
          
          if (isSDR) {
            payload.dealId = conv.sdr_deal_id;
          }

          const chatUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${functionName}`;
          const resp = await fetch(chatUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify(payload),
          });

          if (!resp.ok) {
            const errText = await resp.text();
            console.error(`[sync-robot-schedules] Retry ${functionName} falhou para ${conv.id}:`, errText);
          } else {
            console.log(`[sync-robot-schedules] Retry ${functionName} OK para ${conv.id}`);
            retriedCount++;
          }
        } catch (retryErr) {
          console.error(`[sync-robot-schedules] Erro no retry robot-chat:`, retryErr);
        }
      }
    }

    console.log(`[sync-robot-schedules] Total retries: ${retriedCount}`);

    // ========== TERCEIRA VARREDURA: auto-finalização por inatividade do cliente ==========
    let autoFinalizedCount = 0;

    // Ler configuração de auto-finalização
    const { data: afEnabledRow } = await supabase.from("app_settings").select("value").eq("key", "auto_finalize_enabled").maybeSingle();
    const afEnabled = afEnabledRow?.value === "true";

    // Ler mensagem de protocolo customizada
    const { data: afProtoMsgRow } = await supabase.from("app_settings").select("value").eq("key", "auto_finalize_protocol_message").maybeSingle();
    const defaultProtoMsg = '📋 *Protocolo de Atendimento*\nSeu número de protocolo é: *{protocolo}*\nGuarde este número para futuras referências.\nAgradecemos pelo contato! 😊';
    const protoMsgTemplate = afProtoMsgRow?.value || defaultProtoMsg;

    if (afEnabled) {
      const { data: afMinutesRow } = await supabase.from("app_settings").select("value").eq("key", "auto_finalize_minutes").maybeSingle();
      const { data: afDeptRow } = await supabase.from("app_settings").select("value").eq("key", "auto_finalize_department").maybeSingle();
      const afMinutes = parseInt(afMinutesRow?.value || "10", 10);
      const afDeptValue = afDeptRow?.value || "Suporte";
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(afDeptValue);

      console.log(`[auto-finalize] Habilitado: dept=${afDeptValue}, isUuid=${isUuid}, minutos=${afMinutes}`);

      // Buscar departamento por ID (UUID) ou por nome (fallback)
      const { data: afDept } = isUuid
        ? await supabase.from("departments").select("id, name").eq("id", afDeptValue).maybeSingle()
        : await supabase.from("departments").select("id, name").ilike("name", afDeptValue).maybeSingle();

      if (afDept) {
        const cutoff = new Date(Date.now() - afMinutes * 60 * 1000).toISOString();

        // Buscar conversas em_atendimento no departamento alvo (com atendente humano, sem robô)
        const { data: afConvs, error: afConvErr } = await supabase
          .from("conversations")
          .select("id, contact_id, department_id, assigned_to, tags, priority, channel, whatsapp_instance_id, created_at, protocol")
          .eq("status", "em_atendimento")
          .eq("department_id", afDept.id)
          .not("assigned_to", "is", null)
          .is("assigned_to_robot", null);

        if (afConvErr) {
          console.error("[auto-finalize] Erro ao buscar conversas:", afConvErr.message);
        } else if (afConvs && afConvs.length > 0) {
          console.log(`[auto-finalize] Candidatas: ${afConvs.length}`);

          for (const conv of afConvs) {
            // Buscar última mensagem da conversa (qualquer remetente, exceto sistema)
            const { data: lastMsg } = await supabase
              .from("messages")
              .select("created_at, sender_id")
              .eq("conversation_id", conv.id)
              .neq("message_type", "system")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (!lastMsg) continue;

            // Só finalizar se a última msg é do ATENDENTE (sender_id preenchido)
            // = cliente não respondeu ao atendente
            if (!lastMsg.sender_id) continue; // última msg é do cliente, não finalizar

            if (lastMsg.created_at > cutoff) continue; // ainda dentro do prazo

            console.log(`[auto-finalize] Finalizando conversa ${conv.id} (última msg do atendente: ${lastMsg.created_at}, cliente não respondeu)`);

            // 0. Enviar mensagem de protocolo ao cliente antes de finalizar
            // 0. Buscar dados do agente e contato ANTES do envio de protocolo
            const { data: agent } = await supabase.from("profiles").select("name").eq("id", conv.assigned_to!).maybeSingle();
            const { data: contact } = await supabase.from("contacts").select("name, phone, notes, channel").eq("id", conv.contact_id).maybeSingle();
            const senderDisplayName = agent?.name
              ? `${agent.name.split(' ')[0]} - ${afDept?.name || 'Suporte'}`
              : 'Suporte';

            if ((conv as any).protocol) {
              const protocolMessage = protoMsgTemplate.replace(/\\n/g, '\n').replace('{protocolo}', (conv as any).protocol);
              
              try {
                const contactChannel = contact?.channel || conv.channel || 'whatsapp';
                
                if (contactChannel === 'whatsapp' || contactChannel === 'machine' || contactChannel === 'instagram') {
                  if (contactChannel === 'instagram') {
                    // Instagram: buscar conexão Instagram e enviar via instagram-send
                    const { data: igConn } = await supabase
                      .from("whatsapp_connections")
                      .select("phone_number_id, waba_id")
                      .eq("connection_type", "instagram")
                      .eq("department_id", conv.department_id)
                      .in("status", ["connected", "active"])
                      .limit(1)
                      .maybeSingle();

                    if (igConn) {
                      const cleanRecipientId = (contact?.phone || '').replace('ig:', '');
                      await supabase.functions.invoke("instagram-send", {
                        body: {
                          page_id: igConn.waba_id,
                          recipient_id: cleanRecipientId,
                          message: protocolMessage,
                          type: "text"
                        }
                      });
                    }
                  } else {
                    // Determine which edge function to call based on connection type
                    const { data: waConn } = await supabase
                      .from("whatsapp_connections")
                      .select("connection_type, phone_number_id")
                      .eq("department_id", conv.department_id)
                      .in("status", ["connected", "active"])
                      .limit(1)
                      .maybeSingle();

                    if (contactChannel === 'machine') {
                      await supabase.functions.invoke("machine-send", {
                        body: { conversationId: conv.id, message: protocolMessage, senderName: senderDisplayName }
                      });
                    } else if (waConn?.connection_type === 'meta_api') {
                      await supabase.functions.invoke("meta-whatsapp-send", {
                        body: { phone_number_id: waConn.phone_number_id, to: contact?.phone, message: protocolMessage, type: "text" }
                      });
                    } else {
                      await supabase.functions.invoke("baileys-proxy", {
                        body: { action: "send", instanceId: conv.whatsapp_instance_id || waConn?.phone_number_id, to: contact?.phone, message: protocolMessage, type: "text" }
                      });
                    }
                  }
                  console.log(`[auto-finalize] Protocolo ${(conv as any).protocol} enviado ao cliente via ${contactChannel}`);
                }
              } catch (protoErr: any) {
                console.error(`[auto-finalize] Erro ao enviar protocolo:`, protoErr.message);
                // Continue with finalization even if protocol send fails
              }
            }

            // 1. Inserir mensagem de sistema
            await supabase.from("messages").insert({
              conversation_id: conv.id,
              sender_id: conv.assigned_to,
              sender_name: "[SISTEMA]",
              content: `Conversa finalizada automaticamente por inatividade do cliente.${(conv as any).protocol ? ` Protocolo: ${(conv as any).protocol}` : ''}`,
              message_type: "system",
              status: "sent",
            });

            // 3. Buscar todas as mensagens da conversa
            const { data: allMsgs } = await supabase
              .from("messages")
              .select("id, content, sender_name, sender_id, message_type, created_at, status, delivery_status, external_id")
              .eq("conversation_id", conv.id)
              .order("created_at", { ascending: true });

            const messagesJson = (allMsgs || []).map(m => ({
              id: m.id,
              content: m.content,
              sender_name: m.sender_name,
              sender_id: m.sender_id,
              message_type: m.message_type,
              created_at: m.created_at,
              status: m.status,
              delivery_status: m.delivery_status,
              external_id: m.external_id,
            }));

            // 4. Salvar conversation_log
            const { error: logErr } = await supabase.from("conversation_logs").insert({
              conversation_id: conv.id,
              contact_name: contact?.name || "Desconhecido",
              contact_phone: contact?.phone || null,
              contact_notes: contact?.notes || null,
              department_id: conv.department_id,
              department_name: afDept.name,
              assigned_to: conv.assigned_to,
              assigned_to_name: agent?.name || null,
              finalized_by: conv.assigned_to,
              finalized_by_name: "[AUTO]",
              messages: messagesJson,
              total_messages: messagesJson.length,
              started_at: conv.created_at,
              tags: conv.tags || [],
              priority: conv.priority || "normal",
              channel: conv.channel || "whatsapp",
              whatsapp_instance_id: conv.whatsapp_instance_id || null,
              agent_status_at_finalization: "auto_finalized",
              protocol: (conv as any).protocol || null,
            });

            if (logErr) {
              console.error(`[auto-finalize] Erro ao salvar log para ${conv.id}:`, logErr.message);
              continue;
            }

            // 5. Deletar mensagens e conversa
            await supabase.from("messages").delete().eq("conversation_id", conv.id);
            const { error: delErr } = await supabase.from("conversations").delete().eq("id", conv.id);

            if (delErr) {
              console.error(`[auto-finalize] Erro ao deletar conversa ${conv.id}:`, delErr.message);
            } else {
              console.log(`[auto-finalize] Conversa ${conv.id} finalizada com sucesso`);
              autoFinalizedCount++;
            }
          }
        } else {
          console.log("[auto-finalize] Nenhuma conversa candidata.");
        }
      } else {
        console.log(`[auto-finalize] Departamento '${afDeptValue}' não encontrado.`);
      }
    } else {
      console.log("[auto-finalize] Desabilitado.");
    }

    console.log(`[auto-finalize] Total finalizadas: ${autoFinalizedCount}`);

    // ========== QUARTA VARREDURA: auto-finalização de conversas atendidas por robôs ==========
    let robotAutoFinalizedCount = 0;

    // Robôs SEMPRE auto-finalizam após 5 min de inatividade do cliente, independente da config global
    {
      const afMinutesRobot = 5;
      const robotCutoff = new Date(Date.now() - afMinutesRobot * 60 * 1000).toISOString();

      // Buscar conversas em_atendimento com robô atribuído (qualquer departamento)
      const { data: robotConvs, error: robotConvErr } = await supabase
        .from("conversations")
        .select("id, contact_id, department_id, assigned_to_robot, tags, priority, channel, whatsapp_instance_id, created_at, protocol")
        .eq("status", "em_atendimento")
        .not("assigned_to_robot", "is", null)
        .is("assigned_to", null);

      if (robotConvErr) {
        console.error("[auto-finalize-robot] Erro ao buscar conversas:", robotConvErr.message);
      } else if (robotConvs && robotConvs.length > 0) {
        console.log(`[auto-finalize-robot] Candidatas: ${robotConvs.length}`);

        for (const conv of robotConvs) {
          // Buscar última mensagem da conversa (exceto sistema)
          const { data: lastMsg } = await supabase
            .from("messages")
            .select("created_at, sender_id, sender_name")
            .eq("conversation_id", conv.id)
            .neq("message_type", "system")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!lastMsg) continue;

          // Só finalizar se a última msg é do ROBÔ (sender_name contém [ROBOT])
          const isRobotMsg = lastMsg.sender_name?.includes("[ROBOT]") || lastMsg.sender_name?.includes("(IA)");
          if (!isRobotMsg) continue; // última msg é do cliente, não finalizar

          if (lastMsg.created_at > robotCutoff) continue; // ainda dentro do prazo

          // Buscar dados do robô (nome + tools)
          const { data: robotData } = await supabase.from("robots").select("name, tools").eq("id", conv.assigned_to_robot!).maybeSingle();
          const robotName = robotData?.name || "IA";
          const robotTools = robotData?.tools as Record<string, boolean> | null;

          // Só auto-finalizar se o robô tem a flag finalize_conversations ativa
          if (!robotTools?.canFinalize) {
            console.log(`[auto-finalize-robot] Robô ${robotName} não tem permissão de finalizar. Pulando conversa ${conv.id}`);
            continue;
          }

          console.log(`[auto-finalize-robot] Finalizando conversa ${conv.id} (última msg do robô: ${lastMsg.created_at}, cliente não respondeu)`);

          // Buscar contato
          const { data: contactR } = await supabase.from("contacts").select("name, phone, notes, channel").eq("id", conv.contact_id).maybeSingle();

          // Buscar departamento
          const { data: deptR } = await supabase.from("departments").select("name").eq("id", conv.department_id).maybeSingle();

          // Enviar protocolo ao cliente
          if ((conv as any).protocol) {
            const protocolMessage = protoMsgTemplate.replace(/\\n/g, '\n').replace('{protocolo}', (conv as any).protocol);
            const senderDisplayName = `${robotName} - ${deptR?.name || 'Suporte'}`;

            try {
              const contactChannel = contactR?.channel || conv.channel || 'whatsapp';

              if (contactChannel === 'instagram') {
                const { data: igConn } = await supabase
                  .from("whatsapp_connections")
                  .select("phone_number_id, waba_id")
                  .eq("connection_type", "instagram")
                  .eq("department_id", conv.department_id)
                  .in("status", ["connected", "active"])
                  .limit(1)
                  .maybeSingle();
                if (igConn) {
                  const cleanRecipientId = (contactR?.phone || '').replace('ig:', '');
                  await supabase.functions.invoke("instagram-send", {
                    body: { page_id: igConn.waba_id, recipient_id: cleanRecipientId, message: protocolMessage, type: "text" }
                  });
                }
              } else if (contactChannel === 'machine') {
                await supabase.functions.invoke("machine-send", {
                  body: { conversationId: conv.id, message: protocolMessage, senderName: senderDisplayName }
                });
              } else {
                const { data: waConn } = await supabase
                  .from("whatsapp_connections")
                  .select("connection_type, phone_number_id")
                  .eq("department_id", conv.department_id)
                  .in("status", ["connected", "active"])
                  .limit(1)
                  .maybeSingle();
                if (waConn?.connection_type === 'meta_api') {
                  await supabase.functions.invoke("meta-whatsapp-send", {
                    body: { phone_number_id: waConn.phone_number_id, to: contactR?.phone, message: protocolMessage, type: "text" }
                  });
                } else {
                  await supabase.functions.invoke("baileys-proxy", {
                    body: { action: "send", instanceId: conv.whatsapp_instance_id || waConn?.phone_number_id, to: contactR?.phone, message: protocolMessage, type: "text" }
                  });
                }
              }
              console.log(`[auto-finalize-robot] Protocolo ${(conv as any).protocol} enviado ao cliente`);
            } catch (protoErr: any) {
              console.error(`[auto-finalize-robot] Erro ao enviar protocolo:`, protoErr.message);
            }
          }

          // Inserir mensagem de sistema
          await supabase.from("messages").insert({
            conversation_id: conv.id,
            sender_id: null,
            sender_name: "[SISTEMA]",
            content: `Conversa finalizada automaticamente por inatividade do cliente (atendida por ${robotName}).${(conv as any).protocol ? ` Protocolo: ${(conv as any).protocol}` : ''}`,
            message_type: "system",
            status: "sent",
          });

          // Buscar todas as mensagens
          const { data: allMsgsR } = await supabase
            .from("messages")
            .select("id, content, sender_name, sender_id, message_type, created_at, status, delivery_status, external_id")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: true });

          const messagesJsonR = (allMsgsR || []).map(m => ({
            id: m.id, content: m.content, sender_name: m.sender_name, sender_id: m.sender_id,
            message_type: m.message_type, created_at: m.created_at, status: m.status,
            delivery_status: m.delivery_status, external_id: m.external_id,
          }));

          // Salvar conversation_log
          const { error: logErrR } = await supabase.from("conversation_logs").insert({
            conversation_id: conv.id,
            contact_name: contactR?.name || "Desconhecido",
            contact_phone: contactR?.phone || null,
            contact_notes: contactR?.notes || null,
            department_id: conv.department_id,
            department_name: deptR?.name || null,
            assigned_to: null,
            assigned_to_name: robotName,
            finalized_by: null,
            finalized_by_name: "[AUTO-IA]",
            messages: messagesJsonR,
            total_messages: messagesJsonR.length,
            started_at: conv.created_at,
            tags: conv.tags || [],
            priority: conv.priority || "normal",
            channel: conv.channel || "whatsapp",
            whatsapp_instance_id: conv.whatsapp_instance_id || null,
            agent_status_at_finalization: "auto_finalized_robot",
            protocol: (conv as any).protocol || null,
          });

          if (logErrR) {
            console.error(`[auto-finalize-robot] Erro ao salvar log para ${conv.id}:`, logErrR.message);
            continue;
          }

          // Deletar mensagens e conversa
          await supabase.from("messages").delete().eq("conversation_id", conv.id);
          const { error: delErrR } = await supabase.from("conversations").delete().eq("id", conv.id);

          if (delErrR) {
            console.error(`[auto-finalize-robot] Erro ao deletar conversa ${conv.id}:`, delErrR.message);
          } else {
            console.log(`[auto-finalize-robot] Conversa ${conv.id} finalizada com sucesso`);
            robotAutoFinalizedCount++;
          }
        }
      } else {
        console.log("[auto-finalize-robot] Nenhuma conversa candidata.");
      }
    }

    console.log(`[auto-finalize-robot] Total finalizadas: ${robotAutoFinalizedCount}`);

    // ========== QUINTA VARREDURA: auto-finalização de conversas Meta API >24h ==========
    let metaAutoFinalizedCount = 0;
    const DELMA_ROBOT_ID = "e0886607-cf54-4687-a440-4fa334085606";
    const META_24H_CUTOFF = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    {
      // Buscar todas as conexões meta_api para identificar seus phone_number_ids
      const { data: metaConnections } = await supabase
        .from("whatsapp_connections")
        .select("phone_number_id")
        .eq("connection_type", "meta_api");

      const metaInstanceIds = (metaConnections || []).map(c => c.phone_number_id);

      if (metaInstanceIds.length > 0) {
        // Buscar conversas em_atendimento ou pendente que têm whatsapp_instance_id de Meta API
        const { data: metaConvs, error: metaConvErr } = await supabase
          .from("conversations")
          .select("id, contact_id, department_id, assigned_to, assigned_to_robot, tags, priority, channel, whatsapp_instance_id, created_at, protocol")
          .in("status", ["em_atendimento", "pendente"])
          .in("whatsapp_instance_id", metaInstanceIds);

        if (metaConvErr) {
          console.error("[auto-finalize-meta24h] Erro ao buscar conversas:", metaConvErr.message);
        } else if (metaConvs && metaConvs.length > 0) {
          console.log(`[auto-finalize-meta24h] Candidatas: ${metaConvs.length}`);

          for (const conv of metaConvs) {
            // Buscar última mensagem (qualquer remetente, exceto sistema)
            const { data: lastMsg } = await supabase
              .from("messages")
              .select("created_at")
              .eq("conversation_id", conv.id)
              .neq("message_type", "system")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (!lastMsg) continue;
            if (lastMsg.created_at > META_24H_CUTOFF) continue; // ainda dentro das 24h

            console.log(`[auto-finalize-meta24h] Finalizando conversa ${conv.id} (última msg: ${lastMsg.created_at}, >24h)`);

            // Buscar contato e departamento
            const [{ data: contactM }, { data: deptM }] = await Promise.all([
              supabase.from("contacts").select("name, phone, notes, channel").eq("id", conv.contact_id).maybeSingle(),
              supabase.from("departments").select("name").eq("id", conv.department_id).maybeSingle(),
            ]);

            // Buscar nome do atendente (se houver)
            let assignedName: string | null = null;
            if (conv.assigned_to) {
              const { data: agentM } = await supabase.from("profiles").select("name").eq("id", conv.assigned_to).maybeSingle();
              assignedName = agentM?.name || null;
            } else if (conv.assigned_to_robot) {
              const { data: robotM } = await supabase.from("robots").select("name").eq("id", conv.assigned_to_robot).maybeSingle();
              assignedName = robotM?.name || null;
            }

            // NÃO envia protocolo - janela Meta expirou, mensagem seria rejeitada

            // Inserir mensagem de sistema
            await supabase.from("messages").insert({
              conversation_id: conv.id,
              sender_id: null,
              sender_name: "[SISTEMA]",
              content: `Conversa finalizada automaticamente (janela de 24h da API Oficial expirada).${(conv as any).protocol ? ` Protocolo: ${(conv as any).protocol}` : ''}`,
              message_type: "system",
              status: "sent",
            });

            // Buscar todas as mensagens
            const { data: allMsgsM } = await supabase
              .from("messages")
              .select("id, content, sender_name, sender_id, message_type, created_at, status, delivery_status, external_id")
              .eq("conversation_id", conv.id)
              .order("created_at", { ascending: true });

            const messagesJsonM = (allMsgsM || []).map(m => ({
              id: m.id, content: m.content, sender_name: m.sender_name, sender_id: m.sender_id,
              message_type: m.message_type, created_at: m.created_at, status: m.status,
              delivery_status: m.delivery_status, external_id: m.external_id,
            }));

            // Salvar conversation_log como Delma [AUTO-24H]
            const { error: logErrM } = await supabase.from("conversation_logs").insert({
              conversation_id: conv.id,
              contact_name: contactM?.name || "Desconhecido",
              contact_phone: contactM?.phone || null,
              contact_notes: contactM?.notes || null,
              department_id: conv.department_id,
              department_name: deptM?.name || null,
              assigned_to: conv.assigned_to || null,
              assigned_to_name: assignedName,
              finalized_by: null,
              finalized_by_name: "Delma [AUTO-24H]",
              messages: messagesJsonM,
              total_messages: messagesJsonM.length,
              started_at: conv.created_at,
              tags: conv.tags || [],
              priority: conv.priority || "normal",
              channel: conv.channel || "whatsapp",
              whatsapp_instance_id: conv.whatsapp_instance_id || null,
              agent_status_at_finalization: "auto_finalized_meta_24h",
              protocol: (conv as any).protocol || null,
            });

            if (logErrM) {
              console.error(`[auto-finalize-meta24h] Erro ao salvar log para ${conv.id}:`, logErrM.message);
              continue;
            }

            // Deletar mensagens e conversa
            await supabase.from("messages").delete().eq("conversation_id", conv.id);
            const { error: delErrM } = await supabase.from("conversations").delete().eq("id", conv.id);

            if (delErrM) {
              console.error(`[auto-finalize-meta24h] Erro ao deletar conversa ${conv.id}:`, delErrM.message);
            } else {
              console.log(`[auto-finalize-meta24h] Conversa ${conv.id} finalizada com sucesso`);
              metaAutoFinalizedCount++;
            }
          }
        } else {
          console.log("[auto-finalize-meta24h] Nenhuma conversa candidata.");
        }
      } else {
        console.log("[auto-finalize-meta24h] Nenhuma conexão meta_api encontrada.");
      }
    }

    console.log(`[auto-finalize-meta24h] Total finalizadas: ${metaAutoFinalizedCount}`);

    return new Response(
      JSON.stringify({ updated: syncCount, assigned: assignedCount, retried: retriedCount, autoFinalized: autoFinalizedCount, robotAutoFinalized: robotAutoFinalizedCount, metaAutoFinalized: metaAutoFinalizedCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sync-robot-schedules] Erro:", error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
