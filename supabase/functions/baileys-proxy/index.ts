import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

const BAILEYS_SERVER_URL = Deno.env.get('BAILEYS_SERVER_URL');
if (!BAILEYS_SERVER_URL) console.error('[Baileys Proxy] BAILEYS_SERVER_URL não configurado!');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

// ============= WebM/Opus → OGG/Opus Converter (Pure TypeScript) =============

const OGG_CRC_TABLE: number[] = [];
for (let i = 0; i < 256; i++) {
  let r = i << 24;
  for (let j = 0; j < 8; j++) {
    r = (r & 0x80000000) ? ((r << 1) ^ 0x04C11DB7) : (r << 1);
  }
  OGG_CRC_TABLE[i] = r >>> 0;
}

function oggCrc32(data: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < data.length; i++) {
    crc = ((crc << 8) ^ OGG_CRC_TABLE[((crc >>> 24) ^ data[i]) & 0xFF]) >>> 0;
  }
  return crc;
}

function readVint(data: Uint8Array, offset: number): { value: number; length: number } {
  if (offset >= data.length) throw new Error('EBML: unexpected end');
  const first = data[offset];
  let len = 1;
  let mask = 0x80;
  while (len <= 8 && !(first & mask)) { len++; mask >>= 1; }
  if (len > 8) throw new Error('EBML: invalid vint');
  let value = first & (mask - 1);
  for (let i = 1; i < len; i++) {
    if (offset + i >= data.length) throw new Error('EBML: unexpected end in vint');
    value = (value * 256) + data[offset + i];
  }
  return { value, length: len };
}

function readElementId(data: Uint8Array, offset: number): { id: number; length: number } {
  if (offset >= data.length) throw new Error('EBML: unexpected end for ID');
  const first = data[offset];
  let len: number;
  if (first & 0x80) len = 1;
  else if (first & 0x40) len = 2;
  else if (first & 0x20) len = 3;
  else if (first & 0x10) len = 4;
  else throw new Error(`EBML: invalid element ID at ${offset}`);
  let id = 0;
  for (let i = 0; i < len; i++) id = (id * 256) + data[offset + i];
  return { id, length: len };
}

function extractOpusFromWebM(webmData: Uint8Array): {
  codecPrivate: Uint8Array | null;
  frames: Uint8Array[];
  channels: number;
} {
  const result: { codecPrivate: Uint8Array | null; frames: Uint8Array[]; channels: number } = {
    codecPrivate: null, frames: [], channels: 1,
  };

  const len = webmData.length;
  let offset = 0;

  const MASTER_IDS = new Set([
    0x1A45DFA3, 0x18538067, 0x1654AE6B, 0xAE, 0xE1, 0x1F43B675, 0xA0,
  ]);

  function parse(end: number) {
    while (offset < end - 1 && offset < len - 1) {
      try {
        const idR = readElementId(webmData, offset);
        offset += idR.length;
        const szR = readVint(webmData, offset);
        offset += szR.length;
        const dataStart = offset;
        const elemSize = szR.value;

        // Unknown/infinite size for Segment
        const isUnknown = elemSize >= 0xFFFFFFFFFFFFF;
        const contentEnd = isUnknown ? end : Math.min(dataStart + elemSize, end);

        if (MASTER_IDS.has(idR.id)) {
          parse(contentEnd);
        } else {
          switch (idR.id) {
            case 0x63A2: // CodecPrivate
              result.codecPrivate = webmData.slice(dataStart, dataStart + elemSize);
              break;
            case 0x9F: // Channels
              if (elemSize >= 1) result.channels = webmData[dataStart];
              break;
            case 0xA3: // SimpleBlock
            case 0xA1: // Block
              if (elemSize > 4) {
                const tv = readVint(webmData, dataStart);
                const headerSz = tv.length + 3; // track_vint + timestamp(2) + flags(1)
                if (elemSize > headerSz) {
                  result.frames.push(webmData.slice(dataStart + headerSz, dataStart + elemSize));
                }
              }
              break;
          }
          offset = dataStart + elemSize;
        }
      } catch {
        break;
      }
    }
  }

  parse(len);
  return result;
}

function convertWebmToOggOpus(webmData: Uint8Array): Uint8Array {
  const { codecPrivate, frames, channels } = extractOpusFromWebM(webmData);
  if (frames.length === 0) throw new Error('No Opus frames found in WebM');

  const serial = Math.floor(Math.random() * 0xFFFFFFFF);
  const pages: Uint8Array[] = [];
  let pageSeq = 0;

  // Helper: build single-packet OGG page
  function makePage(data: Uint8Array, headerType: number, granule: bigint): Uint8Array {
    const segs: number[] = [];
    let rem = data.length;
    while (rem >= 255) { segs.push(255); rem -= 255; }
    segs.push(rem);
    const hdrSz = 27 + segs.length;
    const page = new Uint8Array(hdrSz + data.length);
    const dv = new DataView(page.buffer);
    page.set([0x4F, 0x67, 0x67, 0x53]); // "OggS"
    page[4] = 0; page[5] = headerType;
    dv.setUint32(6, Number(granule & 0xFFFFFFFFn), true);
    dv.setUint32(10, Number((granule >> 32n) & 0xFFFFFFFFn), true);
    dv.setUint32(14, serial, true);
    dv.setUint32(18, pageSeq++, true);
    dv.setUint32(22, 0, true);
    page[26] = segs.length;
    for (let i = 0; i < segs.length; i++) page[27 + i] = segs[i];
    page.set(data, hdrSz);
    dv.setUint32(22, oggCrc32(page), true);
    return page;
  }

  // Page 0: OpusHead (BOS = 0x02)
  let opusHead: Uint8Array;
  if (codecPrivate && codecPrivate.length >= 8 &&
      codecPrivate[0] === 0x4F && codecPrivate[1] === 0x70 &&
      codecPrivate[2] === 0x75 && codecPrivate[3] === 0x73) {
    opusHead = codecPrivate;
  } else {
    opusHead = new Uint8Array(19);
    const enc = new TextEncoder();
    opusHead.set(enc.encode('OpusHead'));
    opusHead[8] = 1; // version
    opusHead[9] = channels;
    new DataView(opusHead.buffer).setUint16(10, 312, true); // pre-skip (common default)
    new DataView(opusHead.buffer).setUint32(12, 48000, true); // sample rate
    new DataView(opusHead.buffer).setInt16(16, 0, true); // output gain
    opusHead[18] = 0; // mapping family
  }
  pages.push(makePage(opusHead, 0x02, 0n));

  // Page 1: OpusTags
  const vendor = 'Lovable';
  const tagsData = new Uint8Array(8 + 4 + vendor.length + 4);
  tagsData.set(new TextEncoder().encode('OpusTags'));
  new DataView(tagsData.buffer).setUint32(8, vendor.length, true);
  tagsData.set(new TextEncoder().encode(vendor), 12);
  new DataView(tagsData.buffer).setUint32(12 + vendor.length, 0, true);
  pages.push(makePage(tagsData, 0x00, 0n));

  // Audio pages: multiple frames per page
  const SAMPLES_PER_FRAME = 960; // 20ms @ 48kHz
  const FRAMES_PER_PAGE = 50;
  let granule = 0n;

  for (let i = 0; i < frames.length; i += FRAMES_PER_PAGE) {
    const batch = frames.slice(i, Math.min(i + FRAMES_PER_PAGE, frames.length));
    const isLast = (i + FRAMES_PER_PAGE >= frames.length);

    // Build segment table for multi-packet page
    const segTable: number[] = [];
    let totalData = 0;
    for (const f of batch) {
      let r = f.length;
      while (r >= 255) { segTable.push(255); r -= 255; }
      segTable.push(r);
      totalData += f.length;
    }

    granule += BigInt(batch.length * SAMPLES_PER_FRAME);

    const hdrSz = 27 + segTable.length;
    const page = new Uint8Array(hdrSz + totalData);
    const dv = new DataView(page.buffer);
    page.set([0x4F, 0x67, 0x67, 0x53]);
    page[4] = 0;
    page[5] = isLast ? 0x04 : 0x00;
    dv.setUint32(6, Number(granule & 0xFFFFFFFFn), true);
    dv.setUint32(10, Number((granule >> 32n) & 0xFFFFFFFFn), true);
    dv.setUint32(14, serial, true);
    dv.setUint32(18, pageSeq++, true);
    dv.setUint32(22, 0, true);
    page[26] = segTable.length;
    for (let s = 0; s < segTable.length; s++) page[27 + s] = segTable[s];

    let wOff = hdrSz;
    for (const f of batch) { page.set(f, wOff); wOff += f.length; }

    dv.setUint32(22, oggCrc32(page), true);
    pages.push(page);
  }

  let totalLen = 0;
  for (const p of pages) totalLen += p.length;
  const out = new Uint8Array(totalLen);
  let off = 0;
  for (const p of pages) { out.set(p, off); off += p.length; }
  return out;
}

/** Detect if bytes are WebM (EBML header) and convert to OGG/Opus if needed */
function ensureOggOpus(audioBytes: Uint8Array): Uint8Array {
  // Already OGG?
  if (audioBytes.length >= 4 &&
      audioBytes[0] === 0x4F && audioBytes[1] === 0x67 &&
      audioBytes[2] === 0x67 && audioBytes[3] === 0x53) {
    console.log('[AudioConvert] Audio is already OGG, skipping conversion');
    return audioBytes;
  }
  // WebM/EBML?
  if (audioBytes.length >= 4 &&
      audioBytes[0] === 0x1A && audioBytes[1] === 0x45 &&
      audioBytes[2] === 0xDF && audioBytes[3] === 0xA3) {
    console.log(`[AudioConvert] Detected WebM, converting to OGG/Opus... (${audioBytes.length} bytes)`);
    const result = convertWebmToOggOpus(audioBytes);
    console.log(`[AudioConvert] Conversion done: ${audioBytes.length} → ${result.length} bytes`);
    // Validate output
    if (result.length < 100 || result[0] !== 0x4F || result[1] !== 0x67) {
      throw new Error('Conversion produced invalid OGG file');
    }
    return result;
  }
  // Unknown format, return as-is
  console.log('[AudioConvert] Unknown audio format, passing through');
  return audioBytes;
}

// ============= Main Server =============

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ====== AUTHENTICATION ======
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized - No valid authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (token === serviceRoleKey) {
      console.log('Baileys Proxy - Service role authentication (internal call)');
    } else {
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      });
      const { data, error: claimsError } = await supabase.auth.getClaims(token);
      if (claimsError || !data?.claims) {
        console.error('JWT validation failed:', claimsError);
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized - Invalid token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.log(`Baileys Proxy - Authenticated user: ${data.claims.sub}`);
    }

    const url = new URL(req.url);
    let action = url.searchParams.get('action');
    let phone = url.searchParams.get('phone');
    let instanceId = url.searchParams.get('instanceId');
    
    let body: any = null;
    if (req.method === 'POST' || req.method === 'DELETE') {
      const bodyText = await req.text();
      if (bodyText) {
        try {
          body = JSON.parse(bodyText);
          console.log('Baileys Proxy - Body recebido:', JSON.stringify({ action: body.action, instanceId: body.instanceId, to: body.to, type: body.type }));
          if (!action && body.action) action = body.action;
          if (!instanceId && body.instanceId) instanceId = body.instanceId;
        } catch (e) {
          console.error('Error parsing body:', e);
        }
      }
    }

    console.log(`Baileys Proxy - Action: ${action}, Method: ${req.method}, InstanceId: ${instanceId || 'default'}`);

    let targetUrl: string;
    let fetchOptions: RequestInit = {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
    };

    const useInstanceRoute = !!instanceId && instanceId !== 'default';
    const baseInstanceUrl = useInstanceRoute ? `${BAILEYS_SERVER_URL}/instances/${instanceId}` : BAILEYS_SERVER_URL;

    switch (action) {
      case 'list-instances':
        targetUrl = `${BAILEYS_SERVER_URL}/instances`;
        fetchOptions.method = 'GET';
        break;

      case 'create-instance':
        targetUrl = `${BAILEYS_SERVER_URL}/instances`;
        fetchOptions.method = 'POST';
        if (body) {
          const { action: _, ...createBody } = body;
          fetchOptions.body = JSON.stringify(createBody);
        }
        break;

      case 'delete-instance':
        if (!instanceId) {
          return new Response(
            JSON.stringify({ success: false, error: 'instanceId é obrigatório para deletar instância' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        targetUrl = `${BAILEYS_SERVER_URL}/instances/${instanceId}`;
        fetchOptions.method = 'DELETE';
        break;

      case 'status':
        targetUrl = `${baseInstanceUrl}/status`;
        fetchOptions.method = 'GET';
        break;

      case 'qr':
        targetUrl = `${baseInstanceUrl}/qr`;
        fetchOptions.method = 'GET';
        break;

      case 'connect':
        targetUrl = `${baseInstanceUrl}/connect`;
        fetchOptions.method = 'POST';
        break;

      case 'disconnect':
        targetUrl = `${baseInstanceUrl}/disconnect`;
        fetchOptions.method = 'POST';
        break;

      case 'send':
        targetUrl = `${baseInstanceUrl}/send`;
        fetchOptions.method = 'POST';
        if (body) {
          const { action: _, instanceId: __, ...sendBody } = body;
          
          // Se a mensagem é base64 (áudio/mídia), processar
          if (sendBody.message && sendBody.message.startsWith('data:')) {
            console.log('Baileys Proxy - Detectado base64, processando...');
            
            try {
              const matches = sendBody.message.match(/^data:([^;,]+)(?:;[^;,]*)*;base64,(.+)$/);
              if (matches) {
                let mimeType = matches[1];
                const base64Data = matches[2];
                
                if (mimeType.includes(';')) {
                  const originalMime = mimeType;
                  mimeType = mimeType.split(';')[0].trim();
                  console.log(`Baileys Proxy - MIME type normalizado: ${originalMime} → ${mimeType}`);
                }
                
                let binaryData = new Uint8Array(atob(base64Data).split('').map(c => c.charCodeAt(0)));
                console.log(`Baileys Proxy - Tamanho do arquivo: ${binaryData.length} bytes, MIME: ${mimeType}`);
                
                // ====== CONVERSÃO ÁUDIO WebM → OGG/Opus ======
                if (sendBody.type === 'audio') {
                  try {
                    binaryData = ensureOggOpus(binaryData) as Uint8Array<ArrayBuffer>;
                    mimeType = 'audio/ogg';
                    console.log(`Baileys Proxy - Áudio processado: ${binaryData.length} bytes (OGG/Opus)`);
                  } catch (convErr) {
                    console.error('Baileys Proxy - Erro na conversão de áudio:', convErr);
                    // Continuar com o formato original se a conversão falhar
                  }
                }
                
                let extension = 'bin';
                if (mimeType.startsWith('audio/')) extension = 'ogg';
                else if (mimeType.includes('image/jpeg') || mimeType.includes('image/jpg')) extension = 'jpg';
                else if (mimeType.includes('image/png')) extension = 'png';
                else if (mimeType.includes('image/webp')) extension = 'webp';
                else if (mimeType.includes('video/mp4')) extension = 'mp4';
                else if (mimeType.includes('pdf')) extension = 'pdf';
                
                const fileName = `proxy_upload_${Date.now()}.${extension}`;
                const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
                const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
                
                const uploadContentType = mimeType.startsWith('audio/') ? 'audio/ogg' : mimeType;
                
                const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
                  .from('chat-attachments')
                  .upload(`baileys-proxy/${fileName}`, binaryData, {
                    contentType: uploadContentType,
                    upsert: false
                  });
                
                if (uploadError) {
                  console.error('Baileys Proxy - Erro no upload:', uploadError);
                  throw new Error(`Falha no upload: ${uploadError.message}`);
                }
                
                const { data: publicUrlData } = supabaseAdmin.storage
                  .from('chat-attachments')
                  .getPublicUrl(`baileys-proxy/${fileName}`);
                
                const publicUrl = publicUrlData.publicUrl;
                console.log(`Baileys Proxy - Upload concluído. URL: ${publicUrl}, Tamanho: ${(binaryData.length / 1024).toFixed(1)}KB, MIME: ${uploadContentType}`);
                
                sendBody.message = publicUrl;
              }
            } catch (uploadErr) {
              console.error('Baileys Proxy - Erro ao processar base64:', uploadErr);
              console.warn('Baileys Proxy - FALLBACK: Enviando base64 original ao servidor');
            }
          }
          
          if (sendBody.type === 'audio') {
            sendBody.mimetype = 'audio/ogg; codecs=opus';
          }
          
          if (instanceId) {
            sendBody.instanceId = instanceId;
          }
          
          // ====== RESOLUÇÃO LID / PSEUDO-PHONE → TELEFONE REAL ANTES DO ENVIO ======
          // Detectar LIDs óbvios (@lid) E números falsos (>13 dígitos com @s.whatsapp.net que são LIDs disfarçados)
          const toDigits = sendBody.to ? sendBody.to.split('@')[0]?.replace(/[:\D]/g, '') : '';
          const isExplicitLid = sendBody.to?.endsWith('@lid');
          const isPseudoPhone = sendBody.to?.endsWith('@s.whatsapp.net') && toDigits.length > 13;
          
          if (sendBody.to && (isExplicitLid || isPseudoPhone)) {
            if (isPseudoPhone) {
              console.log(`Baileys Proxy - ⚠️ Detectado pseudo-phone (${toDigits.length} dígitos): ${sendBody.to} — tratando como LID`);
            }
            const isValidPhoneDigits = (value?: string | null) => {
              if (!value) return false;
              const digits = String(value).replace(/\D/g, '');
              return digits.length >= 10 && digits.length <= 13;
            };

            console.log(`Baileys Proxy - Destino é LID: ${sendBody.to}, consultando whatsapp_lid_map...`);
            const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
            const originalLid = sendBody.to;

            let resolvedPhoneDigits: string | null = null;
            let resolvedLidJid: string | null = null;

            // Para pseudo-phones, construir variantes de LID para busca
            const searchLids = [originalLid];
            if (isPseudoPhone) {
              searchLids.push(`${toDigits}@lid`);
            }

            // Extrair base canônica do LID de forma robusta
            // "123456:90@lid" → base "123456", "123456@lid" → base "123456"
            const extractLidBase = (lid: string) => {
              const localPart = lid.split('@')[0]; // remove @lid ou @s.whatsapp.net
              return localPart.replace(/:\d+$/, ''); // remove :NN suffix
            };

            // 1) Buscar pelo JID exato — PRIORIZAR por instance_id atual
            for (const searchLid of searchLids) {
              if (resolvedPhoneDigits) break;
              
              // Prioridade: busca com instance_id
              if (instanceId) {
                const { data: lidByInstance } = await supabaseAdmin
                  .from('whatsapp_lid_map')
                  .select('phone_digits')
                  .eq('lid_jid', searchLid)
                  .eq('instance_id', instanceId)
                  .maybeSingle();
                if (isValidPhoneDigits(lidByInstance?.phone_digits)) {
                  resolvedPhoneDigits = lidByInstance!.phone_digits.replace(/\D/g, '');
                  console.log(`Baileys Proxy - ✅ LID resolvido via DB (exato+instance): ${searchLid} → ${resolvedPhoneDigits}`);
                  break;
                }
              }
              
              // Fallback: busca global
              const { data: lidMapping } = await supabaseAdmin
                .from('whatsapp_lid_map')
                .select('phone_digits')
                .eq('lid_jid', searchLid)
                .maybeSingle();

              if (isValidPhoneDigits(lidMapping?.phone_digits)) {
                resolvedPhoneDigits = lidMapping!.phone_digits.replace(/\D/g, '');
                console.log(`Baileys Proxy - ✅ LID resolvido via DB (exato): ${searchLid} → ${resolvedPhoneDigits}`);
              }
            }

            // 2) Busca canônica (base do LID antes de :NN@lid)
            if (!resolvedPhoneDigits) {
              const lidBase = extractLidBase(originalLid);
              if (lidBase && lidBase.length >= 5) {
                // Priorizar por instance_id
                const instanceFilter = instanceId ? { instance_id: instanceId } : {};
                const queries = [];
                if (instanceId) {
                  queries.push(
                    supabaseAdmin
                      .from('whatsapp_lid_map')
                      .select('phone_digits')
                      .like('lid_jid', `${lidBase}%@lid`)
                      .eq('instance_id', instanceId)
                      .limit(1)
                  );
                }
                queries.push(
                  supabaseAdmin
                    .from('whatsapp_lid_map')
                    .select('phone_digits')
                    .like('lid_jid', `${lidBase}%@lid`)
                    .limit(1)
                );
                
                for (const q of queries) {
                  if (resolvedPhoneDigits) break;
                  const { data: lidByBase } = await q;
                  const candidate = lidByBase?.[0]?.phone_digits;
                  if (isValidPhoneDigits(candidate)) {
                    resolvedPhoneDigits = String(candidate).replace(/\D/g, '');
                    console.log(`Baileys Proxy - ✅ LID resolvido via base canônica: ${originalLid} → ${resolvedPhoneDigits}`);
                  }
                }
              }
            }

            // 3) Fallback: buscar em contacts.notes e contacts.phone
            if (!resolvedPhoneDigits && !resolvedLidJid) {
              for (const searchLid of searchLids) {
                if (resolvedPhoneDigits || resolvedLidJid) break;

                const lidBase = extractLidBase(searchLid);
                const { data: contactByLid } = await supabaseAdmin
                  .from('contacts')
                  .select('phone, notes')
                  .or(`notes.ilike.%jid:${searchLid}%,notes.ilike.%jid:${lidBase}%@lid%`)
                  .not('notes', 'ilike', 'merged_into:%')
                  .limit(3);

                for (const candidateContact of contactByLid || []) {
                  const candidatePhone = candidateContact?.phone;
                  if (isValidPhoneDigits(candidatePhone)) {
                    resolvedPhoneDigits = String(candidatePhone).replace(/\D/g, '');
                    console.log(`Baileys Proxy - ✅ LID resolvido via contacts.phone: ${searchLid} → ${resolvedPhoneDigits}`);
                    break;
                  }

                  const notes = String(candidateContact?.notes || '').toLowerCase();
                  const jidMatch = notes.match(/jid:([0-9]+(?::[0-9]+)?@lid)/i);
                  if (jidMatch?.[1]) {
                    resolvedLidJid = jidMatch[1].toLowerCase();
                    console.log(`Baileys Proxy - ✅ LID resolvido via contacts.notes: ${searchLid} → ${resolvedLidJid}`);
                    break;
                  }
                }
              }
            }

            // 4) Fallback final: check no servidor Baileys
            if (!resolvedPhoneDigits && !resolvedLidJid) {
              const lidDigits = extractLidBase(originalLid).replace(/\D/g, '');
              const checkTargets = new Set<string>(searchLids);
              checkTargets.add(originalLid);
              if (lidDigits.length >= 10) {
                checkTargets.add(`${lidDigits}@lid`);
                checkTargets.add(lidDigits);
              }

              for (const checkTarget of checkTargets) {
                if (resolvedPhoneDigits || resolvedLidJid) break;
                try {
                  const encodedTarget = encodeURIComponent(checkTarget);
                  const checkUrl = useInstanceRoute
                    ? `${BAILEYS_SERVER_URL}/instances/${instanceId}/check/${encodedTarget}`
                    : `${BAILEYS_SERVER_URL}/check/${encodedTarget}`;

                  console.log(`Baileys Proxy - 🔍 Tentando resolver LID via check: ${checkUrl}`);
                  const checkResp = await fetch(checkUrl, { method: 'GET', headers: { 'Content-Type': 'application/json' } });

                  if (!checkResp.ok) continue;

                  const checkData = await checkResp.json();
                  const checkJid = String(checkData?.jid || '').toLowerCase();
                  const checkDigits = checkJid.split('@')[0]?.replace(/\D/g, '');

                  if (checkData?.exists && checkJid.endsWith('@s.whatsapp.net') && isValidPhoneDigits(checkDigits)) {
                    resolvedPhoneDigits = checkDigits;
                    console.log(`Baileys Proxy - ✅ LID resolvido via check: ${originalLid} → ${resolvedPhoneDigits}`);
                    break;
                  }

                  if (checkData?.exists && checkJid.endsWith('@lid')) {
                    resolvedLidJid = checkJid;
                    console.log(`Baileys Proxy - ✅ LID resolvido via check para JID: ${originalLid} → ${resolvedLidJid}`);
                    break;
                  }
                } catch (checkErr) {
                  console.warn(`Baileys Proxy - ⚠️ Erro no fallback check para ${checkTarget}:`, checkErr);
                }
              }
            }

            if (resolvedPhoneDigits) {
              sendBody.to = `${resolvedPhoneDigits}@s.whatsapp.net`;
              console.log(`Baileys Proxy - 📞 Destino resolvido: ${originalLid} → ${sendBody.to}`);

              // Persistir mapeamento com contexto de instância
              await supabaseAdmin.from('whatsapp_lid_map').upsert({
                lid_jid: originalLid,
                phone_digits: resolvedPhoneDigits,
                instance_id: instanceId || 'default',
                updated_at: new Date().toISOString()
              }, { onConflict: 'lid_jid,instance_id' });
            } else if (resolvedLidJid) {
              sendBody.to = resolvedLidJid;
              console.log(`Baileys Proxy - 📞 Destino resolvido para LID: ${originalLid} → ${resolvedLidJid}`);
            } else {
              // FASE B: Retornar erro explícito em vez de enviar como está
              console.error(`Baileys Proxy - ❌ UNRESOLVED_DESTINATION: ${originalLid} — não foi possível resolver para telefone real`);
              return new Response(
                JSON.stringify({ 
                  success: false, 
                  error: 'Não foi possível resolver o destino para um número de telefone real. O contato pode não ter telefone cadastrado.',
                  code: 'UNRESOLVED_DESTINATION',
                  originalLid
                }),
                { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          }

          fetchOptions.body = JSON.stringify(sendBody);
        }
        break;

      case 'check':
        if (!phone && body?.phone) phone = body.phone;
        if (!phone) {
          return new Response(
            JSON.stringify({ success: false, error: 'Número de telefone é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        {
          const encodedPhone = encodeURIComponent(String(phone));
          targetUrl = useInstanceRoute 
            ? `${baseInstanceUrl}/check/${encodedPhone}`
            : `${BAILEYS_SERVER_URL}/check/${encodedPhone}`;
        }
        fetchOptions.method = 'GET';
        break;

      case 'profile-picture': {
        const jid = url.searchParams.get('jid') || body?.jid;
        if (!jid) {
          return new Response(
            JSON.stringify({ success: false, error: 'JID é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        targetUrl = `${baseInstanceUrl}/profile-picture/${encodeURIComponent(jid)}`;
        fetchOptions.method = 'GET';
        break;
      }

      case 'health':
        targetUrl = `${BAILEYS_SERVER_URL}/health`;
        fetchOptions.method = 'GET';
        break;

      case 'clear-session':
        targetUrl = `${baseInstanceUrl}/clear-session`;
        fetchOptions.method = 'POST';
        break;

      case 'force-connect':
        targetUrl = `${baseInstanceUrl}/force-connect`;
        fetchOptions.method = 'POST';
        break;

      default:
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Ação inválida. Ações disponíveis: status, qr, connect, disconnect, send, check, health, clear-session, force-connect, list-instances, create-instance, delete-instance' 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    console.log(`Proxying request to: ${targetUrl}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    let response: Response;
    try {
      response = await fetch(targetUrl, { ...fetchOptions, signal: controller.signal });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      const errorMessage = fetchError instanceof Error ? fetchError.message : 'Erro de conexão';
      console.error('Baileys Proxy - Falha na conexão:', errorMessage);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Servidor Baileys inacessível',
          details: `Não foi possível conectar ao servidor: ${errorMessage}. Verifique se o servidor está rodando em ${BAILEYS_SERVER_URL}`
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    clearTimeout(timeoutId);
    
    console.log(`Baileys response status: ${response.status}`);
    const responseText = await response.text();
    
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      if (responseText.trim().startsWith('<') || responseText.includes('<!DOCTYPE')) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Servidor Baileys retornou erro inesperado',
            details: `Status: ${response.status}`
          }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Resposta inválida do servidor Baileys',
          details: `Resposta: ${responseText.substring(0, 100)}...`
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ====== PÓS-ENVIO: Persistir resolvedLid proativo (capturado via onWhatsApp no servidor) ======
    if (action === 'send' && data?.success && data?.resolvedLid && data?.usedJid) {
      const usedDigits = data.usedJid.split('@')[0]?.replace(/\D/g, '') || '';
      const isValidPhone = usedDigits.length >= 10 && usedDigits.length <= 13;
      
      if (data.usedJid.endsWith('@s.whatsapp.net') && isValidPhone) {
        try {
          const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
          const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
          
          await supabaseAdmin.from('whatsapp_lid_map').upsert({
            lid_jid: data.resolvedLid,
            phone_digits: usedDigits,
            instance_id: instanceId || 'default',
            updated_at: new Date().toISOString()
          }, { onConflict: 'lid_jid,instance_id' });
          console.log(`Baileys Proxy - 🔑 Proactive LID persistido: ${data.resolvedLid} → ${usedDigits} (instance: ${instanceId || 'default'})`);
          
          // Também persistir variante canônica (sem :NN)
          const canonicalLid = data.resolvedLid.replace(/:\d+@/, '@');
          if (canonicalLid !== data.resolvedLid) {
            await supabaseAdmin.from('whatsapp_lid_map').upsert({
              lid_jid: canonicalLid,
              phone_digits: usedDigits,
              instance_id: instanceId || 'default',
              updated_at: new Date().toISOString()
            }, { onConflict: 'lid_jid,instance_id' });
            console.log(`Baileys Proxy - 🔑 Canonical LID persistido: ${canonicalLid} → ${usedDigits}`);
          }
        } catch (persistErr) {
          console.error('Baileys Proxy - Erro ao persistir resolvedLid proativo:', persistErr);
        }
      }
    }

    // ====== PÓS-ENVIO: Persistir resolução LID ↔ Phone quando o servidor retornou usedJid diferente ======
    if (action === 'send' && data?.success && data?.usedJid && data?.originalTo) {
      const originalTo = data.originalTo;
      const usedJid = data.usedJid;
      
      const originalDigits = originalTo.split('@')[0]?.replace(/\D/g, '') || '';
      const usedDigits = usedJid.split('@')[0]?.replace(/\D/g, '') || '';
      const originalLooksLikeLid = originalTo.endsWith('@lid') || (originalTo.endsWith('@s.whatsapp.net') && originalDigits.length > 13);
      const usedLooksLikeLid = usedJid.endsWith('@lid');
      
      // CASO 1: Original era LID, usado é telefone real → persistir LID → phone
      if (originalLooksLikeLid && usedJid.endsWith('@s.whatsapp.net')) {
        const resolvedPhone = usedDigits;
        const isValidResolvedPhone = resolvedPhone && resolvedPhone.length >= 10 && resolvedPhone.length <= 13;

        if (isValidResolvedPhone) {
          try {
            const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

            await supabaseAdmin.from('whatsapp_lid_map').upsert({
              lid_jid: originalTo,
              phone_digits: resolvedPhone,
              instance_id: instanceId || 'default',
              updated_at: new Date().toISOString()
            }, { onConflict: 'lid_jid,instance_id' });
            console.log(`Baileys Proxy - 💾 Pós-envio: persistido LID ${originalTo} → ${resolvedPhone}`);

            // Também atualizar contacts.phone se estiver null
            const { data: contactByLid } = await supabaseAdmin
              .from('contacts')
              .select('id, phone')
              .ilike('notes', `%jid:${originalTo}%`)
              .limit(1);

            if (contactByLid && contactByLid.length > 0 && !contactByLid[0].phone) {
              await supabaseAdmin
                .from('contacts')
                .update({ phone: resolvedPhone })
                .eq('id', contactByLid[0].id);
              console.log(`Baileys Proxy - 💾 Pós-envio: atualizado contacts.phone para contato ${contactByLid[0].id}`);
            }
          } catch (persistErr) {
            console.error('Baileys Proxy - Erro ao persistir resolução pós-envio:', persistErr);
          }
        }
      }
      
      // CASO 2: Original era telefone real, usado é LID → persistir LID → phone (REVERSO)
      // Isso acontece quando o atendente busca um número e envia, mas o Baileys resolve para LID internamente
      if (!originalLooksLikeLid && originalTo.endsWith('@s.whatsapp.net') && usedLooksLikeLid) {
        const phoneDigits = originalDigits;
        const isValidPhone = phoneDigits && phoneDigits.length >= 10 && phoneDigits.length <= 13;

        if (isValidPhone) {
          try {
            const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

            // Salvar mapeamento LID → phone
            await supabaseAdmin.from('whatsapp_lid_map').upsert({
              lid_jid: usedJid,
              phone_digits: phoneDigits,
              instance_id: instanceId || 'default',
              updated_at: new Date().toISOString()
            }, { onConflict: 'lid_jid,instance_id' });
            console.log(`Baileys Proxy - 💾 Pós-envio REVERSO: persistido LID ${usedJid} → ${phoneDigits}`);

            // Atualizar notes do contato para incluir o LID (para busca futura)
            const { data: contactByPhone } = await supabaseAdmin
              .from('contacts')
              .select('id, notes')
              .ilike('notes', `%jid:${originalTo}%`)
              .limit(1);

            if (contactByPhone && contactByPhone.length > 0) {
              const existingNotes = contactByPhone[0].notes || '';
              if (!existingNotes.includes(usedJid)) {
                const updatedNotes = existingNotes + `|lid:${usedJid}`;
                await supabaseAdmin
                  .from('contacts')
                  .update({ notes: updatedNotes })
                  .eq('id', contactByPhone[0].id);
                console.log(`Baileys Proxy - 💾 Pós-envio REVERSO: LID ${usedJid} vinculado ao contato ${contactByPhone[0].id}`);
              }
            }
          } catch (persistErr) {
            console.error('Baileys Proxy - Erro ao persistir resolução reversa pós-envio:', persistErr);
          }
        }
      }
    }

    return new Response(
      JSON.stringify(data),
      { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Baileys Proxy Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Erro ao conectar com servidor Baileys',
        details: 'Verifique se o servidor Baileys está rodando e acessível'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
