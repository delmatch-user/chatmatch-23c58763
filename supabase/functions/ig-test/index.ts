import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);

  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    console.log('[IG Webhook] Verificação:', { mode, token, challenge });

    if (mode === 'subscribe') {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const { data: conn } = await supabase
        .from('whatsapp_connections')
        .select('verify_token')
        .eq('connection_type', 'instagram')
        .maybeSingle();

      if (conn?.verify_token === token) {
        return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
      }
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method === 'POST') {
    try {
      const bodyText = await req.text();
      const payload = JSON.parse(bodyText);
      console.log('[IG Webhook] Payload:', JSON.stringify(payload));

      if (payload.object !== 'instagram') {
        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

      for (const entry of payload.entry || []) {
        const igAccountId = entry.id;
        const { data: connection } = await supabase
          .from('whatsapp_connections')
          .select('*')
          .eq('connection_type', 'instagram')
          .eq('phone_number_id', igAccountId)
          .maybeSingle();

        if (!connection) {
          console.warn('[IG Webhook] Conexão não encontrada:', igAccountId);
          continue;
        }

        for (const messaging of entry.messaging || []) {
          const senderId = messaging.sender?.id;
          const message = messaging.message;
          if (!message || !senderId || message.is_echo) continue;

          console.log('[IG Webhook] Mensagem de:', senderId);

          let messageType = 'text';
          let content = '';
          if (message.text) {
            content = message.text;
          } else if (message.attachments?.length > 0) {
            const att = message.attachments[0];
            messageType = att.type || 'file';
            content = att.payload?.url || '[Anexo]';
          } else {
            content = '[Mídia]';
          }

          const contactPhone = `ig:${senderId}`;
          let { data: contact } = await supabase.from('contacts').select('*').eq('phone', contactPhone).maybeSingle();

          if (!contact) {
            const { data: nc, error: ce } = await supabase
              .from('contacts')
              .insert({ name: `Instagram ${senderId.slice(-6)}`, phone: contactPhone, channel: 'instagram' })
              .select().single();
            if (ce) { console.error('[IG] Erro contato:', ce); continue; }
            contact = nc;
          }

          let { data: conv } = await supabase
            .from('conversations')
            .select('*')
            .eq('contact_id', contact.id)
            .in('status', ['em_fila', 'em_atendimento', 'pendente'])
            .maybeSingle();

          if (!conv) {
            const { data: nc, error: ce } = await supabase
              .from('conversations')
              .insert({
                contact_id: contact.id,
                department_id: connection.department_id,
                status: 'em_fila',
                channel: 'instagram',
                external_id: senderId,
                last_message_preview: content.slice(0, 100)
              })
              .select().single();
            if (ce) { console.error('[IG] Erro conversa:', ce); continue; }
            conv = nc;
          }

          await supabase.from('messages').insert({
            conversation_id: conv.id,
            sender_name: contact.name,
            content,
            message_type: messageType,
            external_id: message.mid,
            status: 'sent'
          });

          await supabase.from('conversations').update({
            last_message_preview: content.slice(0, 100),
            updated_at: new Date().toISOString()
          }).eq('id', conv.id);

          console.log('[IG Webhook] Mensagem salva');

          if (conv.status === 'em_fila' && !conv.assigned_to && connection.department_id) {
            const { data: robots } = await supabase
              .from('robots').select('*').eq('status', 'active')
              .contains('departments', [connection.department_id]);

            let robot = null;
            for (const r of (robots || [])) {
              if (!(r.channels || ['whatsapp', 'instagram', 'machine']).includes('instagram')) continue;
              const { data: ok } = await supabase.rpc('is_robot_within_schedule', { robot_uuid: r.id });
              if (ok !== false) { robot = r; break; }
            }

            if (robot) {
              await supabase.from('conversations').update({
                assigned_to_robot: robot.id, status: 'em_atendimento'
              }).eq('id', conv.id);

              try {
                const resp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/robot-chat`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
                  body: JSON.stringify({ conversationId: conv.id, message: content, robotId: robot.id })
                });
                const rd = await resp.json();
                if (rd.response) {
                  const tk = connection.access_token || Deno.env.get('META_INSTAGRAM_ACCESS_TOKEN');
                  if (tk) {
                    const sr = await fetch(`https://graph.facebook.com/v18.0/${connection.waba_id}/messages`, {
                      method: 'POST',
                      headers: { 'Authorization': `Bearer ${tk}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({ recipient: { id: senderId }, message: { text: rd.response }, messaging_type: 'RESPONSE' })
                    });
                    const result = await sr.json();
                    await supabase.from('messages').insert({
                      conversation_id: conv.id, sender_name: robot.name, content: rd.response,
                      message_type: 'text', external_id: result.message_id, status: 'sent'
                    });
                  }
                }
              } catch (e) { console.error('[IG] Erro robô:', e); }
            }
          }
        }
      }

      return new Response('OK', { status: 200, headers: corsHeaders });
    } catch (error) {
      console.error('[IG Webhook] Erro:', error);
      return new Response('Error', { status: 500, headers: corsHeaders });
    }
  }

  return new Response('Method not allowed', { status: 405, headers: corsHeaders });
});
