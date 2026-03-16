import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audioUrl } = await req.json();
    
    if (!audioUrl) {
      return new Response(
        JSON.stringify({ error: 'audioUrl é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Transcribe] Iniciando transcrição para:', audioUrl);

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      console.error('[Transcribe] OPENAI_API_KEY não configurada');
      return new Response(
        JSON.stringify({ error: 'Chave da OpenAI não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Baixar o áudio
    console.log('[Transcribe] Baixando áudio...');
    const audioResponse = await fetch(audioUrl);
    
    if (!audioResponse.ok) {
      console.error('[Transcribe] Erro ao baixar áudio:', audioResponse.status);
      return new Response(
        JSON.stringify({ error: 'Erro ao baixar arquivo de áudio' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const audioBlob = await audioResponse.blob();
    console.log('[Transcribe] Áudio baixado:', audioBlob.size, 'bytes, tipo:', audioBlob.type);

    // 2. Determinar extensão do arquivo
    let extension = 'ogg';
    const contentType = audioBlob.type || '';
    if (contentType.includes('webm')) extension = 'webm';
    else if (contentType.includes('mp3') || contentType.includes('mpeg')) extension = 'mp3';
    else if (contentType.includes('mp4') || contentType.includes('m4a')) extension = 'm4a';
    else if (contentType.includes('wav')) extension = 'wav';
    
    // Também verificar pela URL
    const lowerUrl = audioUrl.toLowerCase();
    if (lowerUrl.includes('.webm')) extension = 'webm';
    else if (lowerUrl.includes('.mp3')) extension = 'mp3';
    else if (lowerUrl.includes('.m4a')) extension = 'm4a';
    else if (lowerUrl.includes('.wav')) extension = 'wav';

    const fileName = `audio.${extension}`;
    console.log('[Transcribe] Usando nome de arquivo:', fileName);

    // 3. Enviar para OpenAI Whisper
    const formData = new FormData();
    formData.append('file', audioBlob, fileName);
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');
    formData.append('response_format', 'json');

    console.log('[Transcribe] Enviando para Whisper API...');
    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!whisperResponse.ok) {
      const errorText = await whisperResponse.text();
      console.error('[Transcribe] Erro da Whisper API:', whisperResponse.status, errorText);
      
      if (whisperResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requisições excedido. Tente novamente em alguns segundos.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'Erro ao transcrever áudio' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await whisperResponse.json();
    console.log('[Transcribe] Transcrição concluída:', result.text?.substring(0, 100) + '...');

    return new Response(
      JSON.stringify({ 
        transcription: result.text,
        duration: result.duration
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Transcribe] Erro:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
