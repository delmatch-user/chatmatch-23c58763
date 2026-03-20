import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function transcribeWithWhisper(audioBlob: Blob, fileName: string, apiKey: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', audioBlob, fileName);
  formData.append('model', 'whisper-1');
  formData.append('language', 'pt');
  formData.append('response_format', 'json');

  console.log('[Transcribe] Tentando Whisper...');
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Transcribe] Whisper falhou:', response.status, errorText);
    throw new Error(`Whisper error ${response.status}`);
  }

  const result = await response.json();
  console.log('[Transcribe] Whisper OK');
  return result.text;
}

async function transcribeWithGemini(audioBlob: Blob, extension: string, apiKey: string): Promise<string> {
  console.log('[Transcribe] Tentando Gemini (Lovable AI)...');
  
  // Convert to base64
  const arrayBuffer = await audioBlob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  const base64 = btoa(binary);

  const mimeMap: Record<string, string> = {
    'ogg': 'audio/ogg',
    'webm': 'audio/webm',
    'mp3': 'audio/mp3',
    'm4a': 'audio/mp4',
    'wav': 'audio/wav',
  };
  const mimeType = mimeMap[extension] || 'audio/ogg';

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: 'Você é um transcritor de áudio. Transcreva o áudio fornecido em português brasileiro. Retorne APENAS o texto transcrito, sem explicações, sem aspas, sem prefixos.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_audio',
              input_audio: { data: base64, format: extension }
            },
            {
              type: 'text',
              text: 'Transcreva este áudio.'
            }
          ]
        }
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Transcribe] Gemini falhou:', response.status, errorText);
    throw new Error(`Gemini error ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  const text = result.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Gemini retornou resposta vazia');
  
  console.log('[Transcribe] Gemini OK');
  return text;
}

serve(async (req) => {
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

    console.log('[Transcribe] Baixando áudio:', audioUrl);
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      return new Response(
        JSON.stringify({ error: 'Erro ao baixar arquivo de áudio' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const audioBlob = await audioResponse.blob();
    console.log('[Transcribe] Áudio:', audioBlob.size, 'bytes');

    // Determine extension
    let extension = 'ogg';
    const contentType = audioBlob.type || '';
    if (contentType.includes('webm')) extension = 'webm';
    else if (contentType.includes('mp3') || contentType.includes('mpeg')) extension = 'mp3';
    else if (contentType.includes('mp4') || contentType.includes('m4a')) extension = 'm4a';
    else if (contentType.includes('wav')) extension = 'wav';
    
    const lowerUrl = audioUrl.toLowerCase();
    if (lowerUrl.includes('.webm')) extension = 'webm';
    else if (lowerUrl.includes('.mp3')) extension = 'mp3';
    else if (lowerUrl.includes('.m4a')) extension = 'm4a';
    else if (lowerUrl.includes('.wav')) extension = 'wav';

    const fileName = `audio.${extension}`;
    let transcription: string;

    // Strategy: try Whisper first, fallback to Gemini
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (OPENAI_API_KEY) {
      try {
        transcription = await transcribeWithWhisper(audioBlob, fileName, OPENAI_API_KEY);
      } catch (e) {
        console.log('[Transcribe] Whisper falhou, tentando Gemini...', e.message);
        if (!LOVABLE_API_KEY) {
          return new Response(
            JSON.stringify({ error: 'Whisper indisponível e LOVABLE_API_KEY não configurada' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        transcription = await transcribeWithGemini(audioBlob, extension, LOVABLE_API_KEY);
      }
    } else if (LOVABLE_API_KEY) {
      transcription = await transcribeWithGemini(audioBlob, extension, LOVABLE_API_KEY);
    } else {
      return new Response(
        JSON.stringify({ error: 'Nenhuma chave de API configurada para transcrição' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Transcribe] Concluído:', transcription?.substring(0, 100));
    return new Response(
      JSON.stringify({ transcription }),
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
