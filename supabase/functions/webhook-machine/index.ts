import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json();
    const { id_conversa, franqueado, mensagem, name } = body;

    console.log('[webhook-machine] Recebido:', { id_conversa, franqueado, mensagem: mensagem?.substring(0, 50) });

    if (!id_conversa || !mensagem) {
      return new Response(JSON.stringify({ error: 'id_conversa e mensagem são obrigatórios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === FILTRO DE METADATA: Ignorar payloads que não são mensagem real ===
    const trimmedMsg = mensagem.trim();
    // Se a mensagem é exatamente igual ao nome do contato, é provavelmente um update de metadata
    if (name && trimmedMsg === name.trim()) {
      console.log('[webhook-machine] Payload ignorado: mensagem igual ao nome do contato (metadata update)');
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'metadata_name_update' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // Mensagem muito curta (1-2 chars) provavelmente não é real
    if (trimmedMsg.length <= 1) {
      console.log('[webhook-machine] Payload ignorado: mensagem muito curta');
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'message_too_short' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Buscar conversa existente pelo external_id
    const { data: existingConversation } = await supabase
      .from('conversations')
      .select('id, contact_id, department_id, status, assigned_to_robot, assigned_to, robot_transferred')
      .eq('external_id', id_conversa)
      .eq('channel', 'machine')
      .in('status', ['em_fila', 'em_atendimento', 'pendente'])
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    let conversationId: string;
    let contactId: string;

    if (existingConversation) {
      conversationId = existingConversation.id;
      contactId = existingConversation.contact_id;
      console.log('[webhook-machine] Conversa existente:', conversationId);

      // === CORREÇÃO: Atribuir robô a conversas em_fila sem robô (apenas se não foi transferida por robô) ===
      if (existingConversation.status === 'em_fila' && !existingConversation.assigned_to_robot && !existingConversation.assigned_to && !existingConversation.robot_transferred) {
        console.log('[webhook-machine] Conversa em_fila sem robô - tentando atribuir...');
        const { data: activeRobots } = await supabase
          .from('robots')
          .select('id, name, departments, channels')
          .eq('status', 'active')
          .eq('auto_assign', true);

        // Buscar config SDR para pular robô SDR sem keyword e fora do dept Comercial
        const { data: sdrCfgExist } = await supabase.from('sdr_robot_config').select('robot_id').eq('is_active', true).maybeSingle();
        const sdrRobotIdExist = sdrCfgExist?.robot_id || null;
        let sdrKwExist: string[] = [];
        let comercialDeptIdExist: string | null = null;
        if (sdrRobotIdExist) {
          const { data: sdrAutoExist } = await supabase.from('sdr_auto_config').select('keywords').eq('is_active', true).maybeSingle();
          sdrKwExist = (sdrAutoExist?.keywords as string[]) || [];
          const { data: comercialDept } = await supabase.from('departments').select('id').ilike('name', 'comercial').maybeSingle();
          comercialDeptIdExist = comercialDept?.id || null;
        }

        let matchedRobot = null;
        for (const r of (activeRobots || [])) {
          if (!r.departments?.includes(existingConversation.department_id)) continue;
          if (!(r.channels || ['whatsapp','instagram','machine']).includes('machine')) continue;
          // Pular robô SDR se não é dept Comercial ou se a mensagem não contém keywords
          if (r.id === sdrRobotIdExist) {
            if (comercialDeptIdExist && existingConversation.department_id !== comercialDeptIdExist) {
              console.log('[webhook-machine] Robô SDR pulado (dept não é Comercial):', r.name);
              continue;
            }
            if (sdrKwExist.length > 0) {
              const msgLower = mensagem.toLowerCase();
              const hasKw = sdrKwExist.some(kw => msgLower.includes(kw.toLowerCase()));
              if (!hasKw) {
                console.log('[webhook-machine] Robô SDR pulado (sem keyword):', r.name);
                continue;
              }
            }
          }
          const { data: withinSchedule } = await supabase.rpc('is_robot_within_schedule', { robot_uuid: r.id });
          if (withinSchedule !== false) {
            matchedRobot = r;
            break;
          }
        }

        if (matchedRobot) {
          console.log('[webhook-machine] Robô encontrado para conversa existente:', matchedRobot.name);
          await supabase
            .from('conversations')
            .update({
              assigned_to_robot: matchedRobot.id,
              status: 'em_atendimento',
              updated_at: new Date().toISOString(),
              robot_lock_until: new Date(Date.now() + 30000).toISOString(),
            })
            .eq('id', conversationId);
        }
      }

      // Atualizar nome do contato se recebido — respeitar name_edited
      if (name) {
        const { data: contactData } = await supabase
          .from('contacts')
          .select('name_edited')
          .eq('id', contactId)
          .single();
        
        if (!contactData?.name_edited) {
          await supabase.from('contacts').update({ name }).eq('id', contactId);
          console.log('[webhook-machine] Nome do contato atualizado:', name);
        } else {
          console.log('[webhook-machine] Nome protegido (name_edited=true), ignorando:', name);
        }
      }

      // Atualizar franqueado no contato se mudou
      if (franqueado) {
        const { data: contact } = await supabase
          .from('contacts')
          .select('notes')
          .eq('id', contactId)
          .single();

        if (contact) {
          const currentNotes = contact.notes || '';
          const currentFranqueado = currentNotes.match(/franqueado:(.+?)(\||$)/)?.[1];
          if (currentFranqueado !== franqueado) {
            const newNotes = currentNotes.replace(/franqueado:[^|]*/, `franqueado:${franqueado}`);
            await supabase.from('contacts').update({ notes: newNotes }).eq('id', contactId);
            console.log('[webhook-machine] Franqueado atualizado:', franqueado);
          }
        }
      }
    } else {
      // 2. Buscar contato existente pelo id_conversa no notes
      const { data: existingContact } = await supabase
        .from('contacts')
        .select('id')
        .eq('channel', 'machine')
        .ilike('notes', `%machine:${id_conversa}%`)
        .maybeSingle();

      if (existingContact) {
        contactId = existingContact.id;
        // Atualizar nome do contato se recebido — respeitar name_edited
        if (name) {
          const { data: contactCheck } = await supabase
            .from('contacts')
            .select('name_edited')
            .eq('id', contactId)
            .single();
          
          if (!contactCheck?.name_edited) {
            await supabase.from('contacts').update({ name }).eq('id', contactId);
            console.log('[webhook-machine] Nome do contato atualizado:', name);
          } else {
            console.log('[webhook-machine] Nome protegido (name_edited=true), ignorando:', name);
          }
        }
        if (franqueado) {
          const { data: contact } = await supabase
            .from('contacts')
            .select('notes')
            .eq('id', contactId)
            .single();
          if (contact?.notes && !contact.notes.includes(`franqueado:${franqueado}`)) {
            const newNotes = contact.notes.includes('franqueado:')
              ? contact.notes.replace(/franqueado:[^|]*/, `franqueado:${franqueado}`)
              : `${contact.notes}|franqueado:${franqueado}`;
            await supabase.from('contacts').update({ notes: newNotes }).eq('id', contactId);
          }
        }
      } else {
        // Criar novo contato
        const contactName = name || id_conversa;
        const notes = `machine:${id_conversa}${franqueado ? `|franqueado:${franqueado}` : ''}`;

        const { data: newContact, error: contactError } = await supabase
          .from('contacts')
          .insert({
            name: contactName,
            channel: 'machine',
            notes,
          })
          .select('id')
          .single();

        if (contactError) {
          console.error('[webhook-machine] Erro ao criar contato:', contactError);
          throw contactError;
        }
        contactId = newContact.id;
      }

      // 3. Buscar departamento configurado na webhook_config, ou fallback para o primeiro
      let departmentId: string | null = null;

      const { data: webhookCfg } = await supabase
        .from('webhook_config')
        .select('department_id')
        .maybeSingle();

      if (webhookCfg?.department_id) {
        departmentId = webhookCfg.department_id;
        console.log('[webhook-machine] Usando departamento configurado:', departmentId);
      } else {
        const { data: dept } = await supabase
          .from('departments')
          .select('id')
          .limit(1)
          .single();

        if (!dept) {
          return new Response(JSON.stringify({ error: 'Nenhum departamento configurado' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        departmentId = dept.id;
        console.log('[webhook-machine] Usando primeiro departamento (fallback):', departmentId);
      }

      // 4. Buscar robô ativo para o departamento (com verificação de horário)
      const { data: activeRobots } = await supabase
        .from('robots')
        .select('id, name, departments, channels')
        .eq('status', 'active')
        .eq('auto_assign', true);

      // Buscar config SDR para pular robô SDR sem keyword e fora do dept Comercial
      const { data: sdrCfgNew } = await supabase.from('sdr_robot_config').select('robot_id').eq('is_active', true).maybeSingle();
      const sdrRobotIdNew = sdrCfgNew?.robot_id || null;
      let sdrKwNew: string[] = [];
      let comercialDeptIdNew: string | null = null;
      if (sdrRobotIdNew) {
        const { data: sdrAutoNew } = await supabase.from('sdr_auto_config').select('keywords').eq('is_active', true).maybeSingle();
        sdrKwNew = (sdrAutoNew?.keywords as string[]) || [];
        const { data: comercialDept } = await supabase.from('departments').select('id').ilike('name', 'comercial').maybeSingle();
        comercialDeptIdNew = comercialDept?.id || null;
      }

      let activeRobot = null;
      for (const r of (activeRobots || [])) {
        if (!r.departments?.includes(departmentId!)) continue;
        if (!(r.channels || ['whatsapp','instagram','machine']).includes('machine')) continue;
        // Pular robô SDR se não é dept Comercial ou se a mensagem não contém keywords
        if (r.id === sdrRobotIdNew) {
          if (comercialDeptIdNew && departmentId !== comercialDeptIdNew) {
            console.log('[webhook-machine] Robô SDR pulado na criação (dept não é Comercial):', r.name);
            continue;
          }
          if (sdrKwNew.length > 0) {
            const msgLower = mensagem.toLowerCase();
            const hasKw = sdrKwNew.some(kw => msgLower.includes(kw.toLowerCase()));
            if (!hasKw) {
              console.log('[webhook-machine] Robô SDR pulado na criação (sem keyword):', r.name);
              continue;
            }
          }
        }
        const { data: withinSchedule } = await supabase.rpc('is_robot_within_schedule', { robot_uuid: r.id });
        if (withinSchedule !== false) {
          activeRobot = r;
          break;
        }
      }

      if (activeRobot) {
        console.log('[webhook-machine] Robô ativo encontrado para o departamento:', activeRobot.name);
      }

      // 5. Criar conversa com robô atribuído (se existir)
      const tags: string[] = [];

      const { data: newConversation, error: convError } = await supabase
        .from('conversations')
        .insert({
          contact_id: contactId,
          department_id: departmentId!,
          channel: 'machine',
          external_id: id_conversa,
          status: activeRobot ? 'em_atendimento' : 'em_fila',
          assigned_to_robot: activeRobot?.id || null,
          priority: 'normal',
          last_message_preview: mensagem.substring(0, 100),
          tags,
        })
        .select('id')
        .single();

      if (convError) {
        console.error('[webhook-machine] Erro ao criar conversa:', convError);
        const { data: raceConv } = await supabase
          .from('conversations')
          .select('id')
          .eq('external_id', id_conversa)
          .eq('channel', 'machine')
          .in('status', ['em_fila', 'em_atendimento', 'pendente'])
          .maybeSingle();
        
        if (raceConv) {
          conversationId = raceConv.id;
        } else {
          throw convError;
        }
      } else {
        conversationId = newConversation.id;
      }

      console.log('[webhook-machine] Nova conversa criada:', conversationId);
    }

    // === DEDUPE DE ENTRADA: Verificar se mensagem idêntica já foi salva nos últimos 15s ===
    const dedupeWindow = new Date(Date.now() - 15000).toISOString();
    const { data: recentDupe } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('content', mensagem)
      .is('sender_id', null)
      .gte('created_at', dedupeWindow)
      .limit(1)
      .maybeSingle();

    if (recentDupe) {
      console.log('[webhook-machine] Mensagem duplicada detectada (mesma content em <15s), ignorando');
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'duplicate_inbound' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Salvar mensagem
    const { error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_name: name || franqueado || 'Machine',
        content: mensagem,
        message_type: 'text',
        status: 'sent',
        delivery_status: 'delivered',
      });

    if (msgError) {
      console.error('[webhook-machine] Erro ao salvar mensagem:', msgError);
      throw msgError;
    }

    // 6. Atualizar preview da conversa
    await supabase
      .from('conversations')
      .update({
        last_message_preview: mensagem.substring(0, 100),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);

    // 7. Detecção automática de leads por palavras-chave (SDR)
    const { data: convWithRobot } = await supabase
      .from('conversations')
      .select('assigned_to_robot, sdr_deal_id')
      .eq('id', conversationId)
      .single();

    // Se conversa ainda NÃO tem sdr_deal_id, verificar keywords para criar lead automático
    if (!convWithRobot?.sdr_deal_id) {
      const { data: autoConfig } = await supabase
        .from('sdr_auto_config')
        .select('keywords, is_active')
        .eq('is_active', true)
        .maybeSingle();

      if (autoConfig && autoConfig.keywords?.length > 0) {
        const msgLower = mensagem.toLowerCase();
        const matched = autoConfig.keywords.some((kw: string) => msgLower.includes(kw.toLowerCase()));

        if (matched) {
          console.log('[webhook-machine] Keyword SDR detectada! Criando lead automático...');

          // Buscar stage "Novo Lead" (primeiro stage por posição)
          const { data: firstStage } = await supabase
            .from('sdr_pipeline_stages')
            .select('id')
            .eq('is_active', true)
            .order('position')
            .limit(1)
            .single();

          // Buscar robô SDR configurado
          const { data: sdrRobotCfg } = await supabase
            .from('sdr_robot_config')
            .select('robot_id')
            .eq('is_active', true)
            .maybeSingle();

          if (firstStage) {
            // Buscar nome do contato
            const { data: contactForDeal } = await supabase
              .from('contacts')
              .select('name')
              .eq('id', contactId)
              .single();

            const { data: newDeal, error: dealErr } = await supabase
              .from('sdr_deals')
              .insert({
                title: 'Venda de Franquia',
                stage_id: firstStage.id,
                contact_id: contactId,
                priority: 'medium',
                value: 20000,
              })
              .select('id')
              .single();

            if (newDeal && !dealErr) {
              console.log('[webhook-machine] Lead SDR criado:', newDeal.id);

              // Vincular conversa ao deal e atribuir robô SDR
              const convUpdate: any = { sdr_deal_id: newDeal.id, updated_at: new Date().toISOString() };
              if (sdrRobotCfg?.robot_id) {
                convUpdate.assigned_to_robot = sdrRobotCfg.robot_id;
                convUpdate.status = 'em_atendimento';
              }
              await supabase.from('conversations').update(convUpdate).eq('id', conversationId);

              // Registrar atividade
              await supabase.from('sdr_deal_activities').insert({
                deal_id: newDeal.id,
                type: 'note',
                title: 'Lead criado automaticamente por palavra-chave',
                description: `Mensagem: "${mensagem.substring(0, 100)}"`,
              });

              // Chamar sdr-robot-chat se robô SDR configurado
              if (sdrRobotCfg?.robot_id) {
                console.log('[webhook-machine] Chamando sdr-robot-chat para novo lead');
                fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/sdr-robot-chat`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
                  },
                  body: JSON.stringify({
                    conversationId: conversationId,
                    dealId: newDeal.id,
                    message: mensagem,
                  })
                }).catch(err => console.error('[webhook-machine] Erro sdr-robot-chat:', err));
              }
            } else {
              console.error('[webhook-machine] Erro ao criar deal SDR:', dealErr);
              throw dealErr;
            }
          }
        }
      }
    }

    // 8. Se conversa tem robô atribuído (e não foi tratado acima como novo SDR), chamar robot-chat
    // Re-fetch para pegar estado atualizado após possível criação de deal
    const { data: convUpdated } = await supabase
      .from('conversations')
      .select('assigned_to_robot, sdr_deal_id')
      .eq('id', conversationId)
      .single();

    if (convUpdated?.assigned_to_robot && convUpdated?.sdr_deal_id && !convWithRobot?.sdr_deal_id) {
      // Já foi chamado acima como novo lead SDR, pular
      console.log('[webhook-machine] SDR robot-chat já chamado para novo lead');
    } else if (convUpdated?.assigned_to_robot) {
      // Setar lock antes de chamar robot-chat para evitar duplicata pelo sync-robot-schedules
      await supabase.from('conversations').update({
        robot_lock_until: new Date(Date.now() + 30000).toISOString()
      }).eq('id', conversationId);
      if (convUpdated.sdr_deal_id) {
        console.log('[webhook-machine] SDR deal detectado, roteando para sdr-robot-chat');
        fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/sdr-robot-chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
          },
          body: JSON.stringify({
            conversationId: conversationId,
            dealId: convUpdated.sdr_deal_id,
            message: mensagem,
          })
        }).catch(err => console.error('[webhook-machine] Erro sdr-robot-chat:', err));
      } else {
        console.log('[webhook-machine] Chamando robot-chat para robô:', convUpdated.assigned_to_robot);
        fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/robot-chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
          },
          body: JSON.stringify({
            robotId: convUpdated.assigned_to_robot,
            conversationId: conversationId,
            message: mensagem,
          })
        }).catch(err => console.error('[webhook-machine] Erro robot-chat:', err));
      }
    }

    console.log('[webhook-machine] Mensagem salva com sucesso');

    return new Response(JSON.stringify({ success: true, conversation_id: conversationId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[webhook-machine] Erro:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
