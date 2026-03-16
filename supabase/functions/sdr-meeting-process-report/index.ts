import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { meeting_id } = await req.json();
    if (!meeting_id) {
      return new Response(JSON.stringify({ error: "meeting_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: meeting, error: meetingError } = await supabase
      .from("sdr_appointments")
      .select("*")
      .eq("id", meeting_id).single();

    if (meetingError || !meeting) {
      return new Response(JSON.stringify({ error: "Meeting not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const transcriptionText = meeting.transcription_text || "";
    if (!transcriptionText) {
      return new Response(JSON.stringify({ error: "No transcription available" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let ata = "";

    if (LOVABLE_API_KEY) {
      const dataReuniao = new Date(meeting.date).toLocaleDateString("pt-BR");

      const systemPrompt = `Você é um assistente especializado em gerar atas de reuniões comerciais.
Gere uma ata estruturada e profissional baseada na transcrição da reunião, seguindo EXATAMENTE este formato:

---

## 1. Informações da Reunião
- **Título:** ${meeting.title}
- **Data:** ${dataReuniao}
- **Tipo:** ${meeting.type === 'demo' ? 'Demonstração' : meeting.type === 'meeting' ? 'Reunião' : meeting.type === 'support' ? 'Suporte' : 'Follow-up'}

## 2. Principais Pontos Discutidos
- [Detalhe os principais pontos abordados durante a reunião]

## 3. Decisões Tomadas
- [Registre as decisões formais acordadas]

## 4. Ações Definidas
| Ação | Responsável | Prazo |
|------|-------------|-------|
| [Descreva a ação] | [Nome] | [Data ou "A definir"] |

## 5. Próximos Passos
- [Liste os próximos passos para acompanhamento]

## 6. Observações
- [Pontos de atenção, riscos ou observações relevantes]

---

**INSTRUÇÕES:**
- Capture informações de forma clara e concisa
- Destaque decisões formais e ações atribuídas com prazos
- Se alguma seção não tiver informações na transcrição, escreva "Não mencionado durante a reunião"
- Mantenha tom profissional e objetivo`;

      try {
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `Gere a ata desta reunião comercial:\n\n${transcriptionText.substring(0, 15000)}` },
            ],
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          ata = aiData.choices?.[0]?.message?.content || "";
        } else {
          const errText = await aiResponse.text();
          console.error("[sdr-meeting-process] AI error:", aiResponse.status, errText);
          if (aiResponse.status === 429) {
            ata = `*Limite de requisições excedido. Tente reprocessar em alguns minutos.*`;
          }
        }
      } catch (e) {
        console.error("[sdr-meeting-process] AI call failed:", e);
      }
    }

    if (!ata) {
      ata = `# Ata de Reunião Comercial\n\n**Título:** ${meeting.title}\n**Data:** ${meeting.date}\n\nA transcrição completa está disponível nos registros da reunião.\n\n---\n*Ata gerada automaticamente.*`;
    }

    await supabase.from("sdr_appointments").update({
      transcription_summary: ata,
      processing_status: "completed",
    }).eq("id", meeting_id);

    console.log(`[sdr-meeting-process] Meeting ${meeting_id} ATA generated (${ata.length} chars)`);

    return new Response(JSON.stringify({ success: true, ata_generated: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[sdr-meeting-process] Error:", error);
    try {
      const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const body = await req.clone().json().catch(() => ({}));
      if (body?.meeting_id) {
        await supabase.from("sdr_appointments").update({ processing_status: "failed" }).eq("id", body.meeting_id);
      }
    } catch (_) {}
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
