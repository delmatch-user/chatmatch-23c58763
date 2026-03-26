const express = require('express');
const cors = require('cors');
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, downloadMediaMessage } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino = require('pino');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const os = require('os');

// ============= FFMPEG AUDIO CONVERSION =============
// Converte qualquer áudio para OGG/Opus compatível com WhatsApp
function convertToOggOpus(inputBuffer) {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const tmpDir = os.tmpdir();
    const inputPath = path.join(tmpDir, `audio_in_${timestamp}_${randomId}.webm`);
    const outputPath = path.join(tmpDir, `audio_out_${timestamp}_${randomId}.ogg`);

    // Salvar buffer de entrada em arquivo temporário
    fs.writeFileSync(inputPath, inputBuffer);
    logger.info({ inputSize: inputBuffer.length, inputPath }, '[ffmpeg] Iniciando conversão de áudio...');

    const startTime = Date.now();
    const args = [
      '-i', inputPath,
      '-c:a', 'libopus',
      '-b:a', '32k',
      '-ar', '48000',
      '-ac', '1',
      '-application', 'voip',
      '-y',
      outputPath
    ];

    execFile('ffmpeg', args, { timeout: 30000 }, (error, stdout, stderr) => {
      // Limpar arquivo de entrada sempre
      try { fs.unlinkSync(inputPath); } catch (e) { /* ignore */ }

      if (error) {
        // Limpar saída parcial
        try { fs.unlinkSync(outputPath); } catch (e) { /* ignore */ }
        logger.error({ error: error.message, stderr }, '[ffmpeg] Falha na conversão');
        return reject(new Error(`ffmpeg falhou: ${error.message}`));
      }

      try {
        const outputBuffer = fs.readFileSync(outputPath);
        fs.unlinkSync(outputPath);

        const elapsed = Date.now() - startTime;
        logger.info({
          inputSize: inputBuffer.length,
          outputSize: outputBuffer.length,
          elapsedMs: elapsed
        }, '[ffmpeg] Conversão concluída');

        // Validação: verificar assinatura OGG (primeiros 4 bytes = "OggS")
        if (outputBuffer.length < 100) {
          return reject(new Error('Arquivo convertido muito pequeno'));
        }
        const header = outputBuffer.slice(0, 4).toString('ascii');
        if (header !== 'OggS') {
          logger.error({ header, outputSize: outputBuffer.length }, '[ffmpeg] Arquivo de saída não tem assinatura OGG válida');
          return reject(new Error('Arquivo convertido não é OGG válido'));
        }

        resolve(outputBuffer);
      } catch (readErr) {
        try { fs.unlinkSync(outputPath); } catch (e) { /* ignore */ }
        reject(new Error(`Falha ao ler arquivo convertido: ${readErr.message}`));
      }
    });
  });
}

const app = express();
app.use(cors());
// Aumentar limite do body para suportar áudios/mídias grandes (50MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Configuração
const PORT = process.env.PORT || 3001;
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://jfbixwfioehqkussmhov.supabase.co/functions/v1/whatsapp-webhook';
const AUTH_DIR = process.env.AUTH_DIR || './auth_sessions';
const MAX_INSTANCES = parseInt(process.env.MAX_INSTANCES || '5', 10);
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

// ============= MULTI-INSTANCE ARCHITECTURE =============
// Map to store all WhatsApp instances
const instances = new Map();

// Default instance ID for backward compatibility
const DEFAULT_INSTANCE = 'default';

// Instance state class
class InstanceState {
  constructor(instanceId) {
    this.instanceId = instanceId;
    this.sock = null;
    this.qrCodeData = null;
    this.connectionStatus = 'disconnected';
    this.connectedPhone = null;
    this.isStarting = false;
    this.lastConnectionError = null;
    this.lastDisconnectCode = null;
    this.lastDisconnectReason = null;
    this.lastEventAt = null;
    this.reconnectAttempts = 0;
    this.stableTimer = null; // Timer to reset reconnectAttempts after stable connection
    this.errorSince = null; // Timestamp when error state started
    this.isLoggedOut = false; // Flag for loggedOut sessions (no auto-recovery)
    // Mapa LID → telefone real em memória
    // Chave: LID JID (ex: "131451769106561:90@lid" ou "131451769106561@lid")
    // Valor: { phone: "5588999999999", name: "João" }
    this.lidMap = new Map();
    // Cache de IDs de mensagens já processadas (deduplicação para append)
    this.processedMessageIds = new Set();
    this.processedMessageCleanupTimer = null;
    // Cache de mensagens enviadas para getMessage (re-criptografia E2E)
    this.sentMessages = new Map();
  }

  // Armazena mensagem enviada no cache com TTL de 1h e limite de 500 entries
  cacheSentMessage(messageId, messageContent) {
    if (!messageId || !messageContent) return;
    
    // Limitar tamanho do cache
    const MAX_CACHE_SIZE = 500;
    if (this.sentMessages.size >= MAX_CACHE_SIZE) {
      // Remover a entrada mais antiga
      const oldestKey = this.sentMessages.keys().next().value;
      this.sentMessages.delete(oldestKey);
    }
    
    this.sentMessages.set(messageId, {
      content: messageContent,
      cachedAt: Date.now(),
    });
  }

  // Recupera mensagem do cache (retorna o conteúdo original do Baileys)
  getCachedMessage(messageId) {
    if (!messageId) return undefined;
    const entry = this.sentMessages.get(messageId);
    if (!entry) return undefined;
    
    // TTL de 1 hora
    const ONE_HOUR = 60 * 60 * 1000;
    if (Date.now() - entry.cachedAt > ONE_HOUR) {
      this.sentMessages.delete(messageId);
      return undefined;
    }
    
    return entry.content;
  }
}

// Logger com nível info para debug
const logger = pino({ level: 'info' });

// Controle de reconexão
const MAX_RECONNECT_ATTEMPTS = 15;
const AUTO_RECOVERY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
const STABLE_CONNECTION_RESET_MS = 2 * 60 * 1000; // 2 minutos

// Garantir que o diretório base de sessões existe
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

logger.info({ AUTH_DIR, WEBHOOK_URL, MAX_INSTANCES, hasSupabaseConfig: !!(SUPABASE_URL && SUPABASE_SERVICE_KEY) }, '=== BAILEYS MULTI-INSTANCE SERVER INICIANDO ===');

// ============= SUPABASE STORAGE UPLOAD =============
async function uploadToSupabaseStorage(buffer, fileName, mimeType) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    logger.warn('SUPABASE_URL ou SUPABASE_SERVICE_KEY não configurados - fallback para base64');
    return null;
  }

  // Normalizar mimeType para o upload
  let normalizedMimeType = mimeType;
  if (mimeType && mimeType.includes('audio/ogg')) {
    normalizedMimeType = 'audio/ogg';
  } else if (mimeType && mimeType.includes(';')) {
    normalizedMimeType = mimeType.split(';')[0].trim();
  }

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const uniqueFileName = `${Date.now()}_${safeName}`;
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/chat-uploads/${uniqueFileName}`;

  const MAX_RETRIES = 3;
  const BACKOFF_MS = [2000, 4000, 8000];

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = BACKOFF_MS[attempt - 1] || 8000;
        logger.info({ attempt: attempt + 1, delay, fileName: uniqueFileName }, 'Retry upload para Storage...');
        await new Promise(r => setTimeout(r, delay));
      }

      const response = await axios.post(uploadUrl, buffer, {
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': normalizedMimeType,
          'x-upsert': 'false'
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 120000
      });

      if (response.status === 200 || response.status === 201) {
        const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/chat-uploads/${uniqueFileName}`;
        logger.info({ fileName: uniqueFileName, size: buffer.length, publicUrl, attempt: attempt + 1 }, 'Upload direto para Storage concluído');
        return publicUrl;
      } else {
        logger.error({ status: response.status, data: JSON.stringify(response.data).substring(0, 500), attempt: attempt + 1 }, 'Erro no upload para Storage');
      }
    } catch (error) {
      const statusCode = error.response?.status || 'N/A';
      const responseBody = error.response?.data ? JSON.stringify(error.response.data).substring(0, 500) : 'N/A';
      logger.error({ 
        error: error.message, 
        statusCode, 
        responseBody, 
        fileName: uniqueFileName, 
        attempt: attempt + 1, 
        maxRetries: MAX_RETRIES 
      }, 'Erro ao fazer upload para Supabase Storage');
    }
  }

  logger.error({ fileName: uniqueFileName, size: buffer.length }, 'Upload para Storage falhou após todas as tentativas');
  return null;
}

// ============= HELPER FUNCTIONS =============

// Get auth directory for specific instance
function getInstanceAuthDir(instanceId) {
  return path.join(AUTH_DIR, instanceId);
}

// Get or create instance
function getOrCreateInstance(instanceId) {
  if (!instances.has(instanceId)) {
    if (instances.size >= MAX_INSTANCES) {
      throw new Error(`Limite máximo de ${MAX_INSTANCES} instâncias atingido`);
    }
    instances.set(instanceId, new InstanceState(instanceId));
    logger.info({ instanceId, total: instances.size }, 'Nova instância criada');
  }
  return instances.get(instanceId);
}

// Get instance (throws if not exists)
function getInstance(instanceId) {
  const instance = instances.get(instanceId);
  if (!instance) {
    throw new Error(`Instância "${instanceId}" não encontrada`);
  }
  return instance;
}

// Check if instance exists
function hasInstance(instanceId) {
  return instances.has(instanceId);
}

// Get auth dir file count for instance
function getAuthDirFileCount(instanceId) {
  try {
    const dir = getInstanceAuthDir(instanceId);
    if (!fs.existsSync(dir)) return 0;
    return fs.readdirSync(dir).length;
  } catch {
    return null;
  }
}

// Clear auth dir for instance
function clearAuthDir(instanceId) {
  try {
    const dir = getInstanceAuthDir(instanceId);
    logger.info({ instanceId, dir }, 'Limpando diretório de sessão...');
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        fs.rmSync(filePath, { recursive: true, force: true });
      }
      logger.info({ instanceId, filesDeleted: files.length }, 'Arquivos de sessão removidos');
    }
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    logger.info({ instanceId }, 'Diretório de sessão limpo com sucesso');
    return true;
  } catch (error) {
    logger.error({ instanceId, error: error?.message }, 'Erro ao limpar AUTH_DIR');
    return false;
  }
}

function mapDisconnectReason(code) {
  if (typeof code !== 'number') return null;
  try {
    const match = Object.entries(DisconnectReason).find(
      ([key, val]) => typeof val === 'number' && val === code
    );
    return match?.[0] || `code_${code}`;
  } catch {
    return `code_${code}`;
  }
}

function normalizeLidCanonical(jid) {
  if (!jid) return null;
  return jid.replace(/:\d+@/, '@').toLowerCase();
}

function resolvePhoneFromLid(instance, lidJid) {
  if (!instance || !lidJid) return null;

  const normalizedLid = lidJid.toLowerCase();
  const exact = instance.lidMap.get(normalizedLid) || instance.lidMap.get(lidJid);
  if (exact?.phone) return exact.phone;

  const canonicalLid = normalizeLidCanonical(normalizedLid);
  for (const [key, value] of instance.lidMap.entries()) {
    if (normalizeLidCanonical(key) === canonicalLid && value?.phone) {
      return value.phone;
    }
  }

  return null;
}

function buildJidCandidates(instance, to) {
  const input = String(to || '').trim();
  const candidates = [];

  const addCandidate = (jid) => {
    if (!jid) return;
    const normalized = jid.toLowerCase();
    if (!normalized.includes('@')) return;
    if (!candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  if (!input) return candidates;

  // Entrada já com domínio (ex: @s.whatsapp.net / @lid)
  if (input.includes('@')) {
    const lowerInput = input.toLowerCase();
    const [rawLocalPart, domainPart = ''] = lowerInput.split('@');
    const localDigits = rawLocalPart.replace(/\D/g, '');

    if (domainPart === 'lid') {
      const exactLid = `${rawLocalPart}@lid`;
      const canonicalLid = `${rawLocalPart.replace(/:\d+$/, '')}@lid`;
      const resolvedPhone = resolvePhoneFromLid(instance, exactLid) || resolvePhoneFromLid(instance, canonicalLid);

      // Se já temos telefone real resolvido, ele segue prioridade
      if (resolvedPhone) addCandidate(`${resolvedPhone}@s.whatsapp.net`);

      // CRÍTICO: para destino explícito @lid, tentar @lid antes do pseudo-phone
      addCandidate(exactLid);
      if (canonicalLid !== exactLid) addCandidate(canonicalLid);

      // Último fallback: pseudo-phone (evita bloquear envio em casos legados)
      if (!resolvedPhone && localDigits) addCandidate(`${localDigits}@s.whatsapp.net`);

      return candidates;
    }

    if (domainPart === 's.whatsapp.net') {
      // Se parece pseudo-phone de LID, priorizar rota @lid
      if (localDigits.length >= 13 && !localDigits.startsWith('55')) {
        const lidJid = `${localDigits}@lid`;
        const resolvedPhone = resolvePhoneFromLid(instance, lidJid);

        if (resolvedPhone) addCandidate(`${resolvedPhone}@s.whatsapp.net`);
        addCandidate(lidJid);
        addCandidate(`${localDigits}@s.whatsapp.net`);
        return candidates;
      }

      if (localDigits) addCandidate(`${localDigits}@s.whatsapp.net`);
      return candidates;
    }

    addCandidate(lowerInput);
    return candidates;
  }

  // Entrada sem domínio (telefone ou LID parcial)
  const lidLikeMatch = input.match(/^(\d+):(\d+)$/);
  if (lidLikeMatch) {
    const lidBase = lidLikeMatch[1];
    const lidWithDevice = `${lidLikeMatch[1]}:${lidLikeMatch[2]}@lid`;
    const lidCanonical = `${lidBase}@lid`;
    const resolvedPhone = resolvePhoneFromLid(instance, lidWithDevice) || resolvePhoneFromLid(instance, lidCanonical);

    if (resolvedPhone) addCandidate(`${resolvedPhone}@s.whatsapp.net`);
    addCandidate(`${lidBase}@s.whatsapp.net`);
    addCandidate(lidWithDevice);
    addCandidate(lidCanonical);

    return candidates;
  }

  const digitsOnly = input.replace(/\D/g, '');
  if (!digitsOnly) return candidates;

  // Se parece LID (>=13 e não BR), priorizar @lid
  if (digitsOnly.length >= 13 && !digitsOnly.startsWith('55')) {
    const lidJid = `${digitsOnly}@lid`;
    const resolvedPhone = resolvePhoneFromLid(instance, lidJid);

    if (resolvedPhone) addCandidate(`${resolvedPhone}@s.whatsapp.net`);
    addCandidate(lidJid);
    addCandidate(`${digitsOnly}@s.whatsapp.net`);
    return candidates;
  }

  // Telefone normal
  addCandidate(`${digitsOnly}@s.whatsapp.net`);

  return candidates;
}

function resolveCheckJid(target) {
  const input = String(target || '').trim().toLowerCase();
  if (!input) return null;

  if (input.includes('@')) {
    const [local = '', domain = ''] = input.split('@');
    if (!local) return null;
    if (domain === 's.whatsapp.net' || domain === 'lid') {
      return `${local}@${domain}`;
    }
    return null;
  }

  const digits = input.replace(/\D/g, '');
  if (!digits) return null;
  return `${digits}@s.whatsapp.net`;
}

// Função para enviar webhook com instanceId
async function sendWebhook(event, data, instanceId = DEFAULT_INSTANCE) {
  if (!WEBHOOK_URL) {
    logger.warn('WEBHOOK_URL não configurada - evento não enviado');
    return;
  }
  
  try {
    await axios.post(WEBHOOK_URL, {
      event,
      instanceId, // Include instanceId in all webhooks
      data,
      timestamp: new Date().toISOString()
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Connection': 'keep-alive'
      },
      timeout: 15000
    });
    logger.info({ event, instanceId }, 'Webhook enviado com sucesso');
  } catch (error) {
    logger.error({ error: error.message, event, instanceId }, 'Erro ao enviar webhook');
  }
}

// ============= START WHATSAPP FOR INSTANCE =============
async function startWhatsApp(instanceId) {
  const instance = getOrCreateInstance(instanceId);
  
  if (instance.isStarting) {
    logger.info({ instanceId }, 'startWhatsApp ignorado: inicialização já em andamento');
    return;
  }

  instance.isStarting = true;
  instance.lastEventAt = new Date().toISOString();
  instance.lastConnectionError = null;

  const authDir = getInstanceAuthDir(instanceId);
  
  logger.info({ instanceId, authDir }, '=== INICIANDO CONEXÃO WHATSAPP ===');
  logger.info({ instanceId, authDir, filesCount: getAuthDirFileCount(instanceId) }, 'Estado do diretório de sessão');

  try {
    // Garantir AUTH_DIR da instância
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    logger.info({ instanceId }, 'Estado de autenticação carregado');

    // Se houver socket antigo, encerra
    if (instance.sock) {
      try {
        logger.info({ instanceId }, 'Encerrando socket anterior...');
        instance.sock.end?.(new Error('Restart requested'));
      } catch {
        // ignore
      }
      instance.sock = null;
    }

    logger.info({ instanceId }, 'Buscando versão mais recente do WhatsApp Web...');
    
    let waVersion;
    try {
      const { version, isLatest } = await fetchLatestBaileysVersion();
      waVersion = version;
      logger.info({ instanceId, version, isLatest }, 'Versão do WhatsApp Web obtida');
    } catch (err) {
      waVersion = [2, 3000, 1032040031];
      logger.warn({ instanceId, fallbackVersion: waVersion, error: err.message }, 'Falha ao buscar versão, usando fallback');
    }

    logger.info({ instanceId }, 'Criando socket Baileys...');
    
    instance.sock = makeWASocket({
      auth: state,
      version: waVersion,
      logger: pino({ level: 'warn' }),
      browser: ['ChatMatch', 'Chrome', '120.0.0'],
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      retryRequestDelayMs: 500,
      getMessage: async (key) => {
        const cached = instance.getCachedMessage(key?.id);
        if (cached) {
          logger.info({ instanceId, messageId: key.id }, 'getMessage: retornando do cache');
          return cached;
        }
        logger.debug({ instanceId, messageId: key?.id }, 'getMessage: mensagem não encontrada no cache');
        return undefined;
      },
    });

    logger.info({ instanceId }, 'Socket Baileys criado com sucesso');

    // Evento de atualização de conexão
    instance.sock.ev.on('connection.update', async (update) => {
      instance.lastEventAt = new Date().toISOString();
      const { connection, lastDisconnect, qr } = update;

      logger.info({ instanceId, connection, hasQR: !!qr }, 'connection.update recebido');

      if (qr) {
        logger.info({ instanceId }, 'QR Code recebido, gerando imagem...');
        instance.qrCodeData = await QRCode.toDataURL(qr);
        instance.connectionStatus = 'waiting_qr';
        instance.isStarting = false;
        logger.info({ instanceId }, 'QR Code gerado com sucesso!');
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const code = typeof statusCode === 'number' ? statusCode : null;
        const reason = lastDisconnect?.error?.message || 'unknown';

        try {
          logger.warn(
            {
              instanceId,
              code,
              reason,
              errorName: lastDisconnect?.error?.name,
              errorMessage: lastDisconnect?.error?.message,
              outputStatus: lastDisconnect?.error?.output?.statusCode,
              outputPayload: lastDisconnect?.error?.output?.payload,
              isBoom: lastDisconnect?.error?.isBoom,
              data: lastDisconnect?.error?.data,
            },
            'Detalhes do lastDisconnect'
          );
        } catch {
          // ignore
        }

        instance.lastDisconnectCode = code;
        instance.lastDisconnectReason = code ? mapDisconnectReason(code) : null;
        instance.lastConnectionError = reason;

        const wasConnecting = instance.connectionStatus === 'connecting' || instance.connectionStatus === 'waiting_qr';

        instance.connectionStatus = wasConnecting ? 'error' : 'disconnected';
        instance.connectedPhone = null;
        instance.qrCodeData = null;
        instance.isStarting = false;

        logger.warn({ instanceId, code, reason: instance.lastDisconnectReason, wasConnecting }, 'Conexão fechada');

        // Detect stream errors BEFORE invalid session check to avoid false positives
        const isStreamError = reason.includes('Stream Errored') || 
                              reason.includes('stream errored') ||
                              (lastDisconnect?.error?.data?.tag === 'stream:error');

        const isInvalidSession = !isStreamError && (
          code === DisconnectReason.badSession || 
          code === DisconnectReason.multideviceMismatch || 
          code === 405
        );
        
        if (isInvalidSession) {
          logger.warn({ instanceId, code, reason: instance.lastDisconnectReason }, 'Sessão inválida detectada; limpando AUTH_DIR');
          clearAuthDir(instanceId);
          instance.reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
        }

        if (isStreamError) {
          logger.info({ instanceId, code, reason }, 'Stream error detectado - reconectando SEM limpar sessão');
        }

        const isLoggedOut = code === DisconnectReason.loggedOut;
        
        if (isLoggedOut) {
          instance.isLoggedOut = true;
        }

        const shouldReconnect = !isInvalidSession && 
                                !isLoggedOut && 
                                instance.reconnectAttempts < MAX_RECONNECT_ATTEMPTS;

        await sendWebhook('connection.closed', {
          reason,
          disconnectReason: instance.lastDisconnectReason,
          statusCode: code,
        }, instanceId);

        if (shouldReconnect) {
          instance.reconnectAttempts++;
          // Exponential backoff: min(3s * 2^(attempt-1), 60s). Stream errors get shorter delay.
          const delay = isStreamError 
            ? Math.min(2000 * instance.reconnectAttempts, 15000) 
            : Math.min(3000 * Math.pow(2, instance.reconnectAttempts - 1), 60000);
          logger.info({ instanceId, attempt: instance.reconnectAttempts, max: MAX_RECONNECT_ATTEMPTS, delayMs: delay, isStreamError }, 'Reconectando com backoff...');
          setTimeout(() => startWhatsApp(instanceId), delay);
        } else if (isInvalidSession) {
          logger.info({ instanceId }, 'Sessão limpa. Use /connect para gerar novo QR code.');
          instance.connectionStatus = 'disconnected';
          instance.errorSince = null;
        } else if (instance.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          logger.error({ instanceId }, 'Máximo de tentativas de reconexão atingido. Auto-recovery tentará em 5 minutos.');
          instance.connectionStatus = 'error';
          instance.lastConnectionError = 'Máximo de tentativas atingido. Auto-recovery em andamento...';
          instance.errorSince = Date.now();
        }
      } else if (connection === 'open') {
        instance.reconnectAttempts = 0;
        instance.connectionStatus = 'connected';
        instance.qrCodeData = null;
        instance.isStarting = false;
        instance.errorSince = null;
        instance.isLoggedOut = false;

        // Start stable connection timer - reset reconnectAttempts after 2 min of stable connection
        if (instance.stableTimer) clearTimeout(instance.stableTimer);
        instance.stableTimer = setTimeout(() => {
          if (instance.connectionStatus === 'connected') {
            instance.reconnectAttempts = 0;
            logger.info({ instanceId }, 'Conexão estável por 2 min - contador de reconexão resetado');
          }
        }, STABLE_CONNECTION_RESET_MS);

        const user = instance.sock.user;
        instance.connectedPhone = user?.id?.split(':')[0] || 'Desconhecido';

        logger.info({ instanceId, phone: instance.connectedPhone }, 'WhatsApp CONECTADO com sucesso!');

        await sendWebhook('connection.open', {
          phone: instance.connectedPhone,
        }, instanceId);
      }
    });

    // Salvar credenciais quando atualizadas
    instance.sock.ev.on('creds.update', saveCreds);

    // Receber mensagens
    instance.sock.ev.on('messages.upsert', async (m) => {
      logger.info({ instanceId, messageCount: m.messages.length, upsertType: m.type }, 'DEBUG messages.upsert: Lote recebido');

      for (const message of m.messages) {
        try {
      const messageKeys = message.message ? Object.keys(message.message) : [];
      logger.info({ 
        instanceId,
        messageId: message.key?.id,
        remoteJid: message.key?.remoteJid,
        fromMe: message.key?.fromMe,
        upsertType: m.type,
        hasReactionMessage: !!message.message?.reactionMessage,
        hasProtocolMessage: !!message.message?.protocolMessage,
        protocolType: message.message?.protocolMessage?.type,
        messageStubType: message.messageStubType,
        messageKeys,
        pushName: message.pushName
      }, 'DEBUG messages.upsert: Mensagem recebida');

      // Detectar reações
      if (message.message?.reactionMessage) {
        const reaction = message.message.reactionMessage;
        const targetMessageId = reaction.key?.id;
        const emoji = reaction.text;
        const senderJid = message.key.remoteJid;
        const senderPhone = senderJid?.split('@')[0];
        
        logger.info({ instanceId, targetMessageId, emoji, senderPhone, fromMe: message.key.fromMe }, 'Reação detectada em messages.upsert');
        
        await sendWebhook('message.reaction', {
          targetMessageId,
          emoji,
          senderPhone,
          senderJid,
          isRemoval: !emoji || emoji === '',
        }, instanceId);
        continue;
      }

      // Detectar mensagens de protocolo de deleção
      const protocolMsg = message.message?.protocolMessage;
      if (protocolMsg) {
        const isRevoke = protocolMsg.type === 0 || 
                         protocolMsg.type === 'REVOKE';
        
        if (isRevoke && protocolMsg.key) {
          const revokedKey = protocolMsg.key;
          const messageId = revokedKey?.id;
          const senderJid = message.key.remoteJid || revokedKey?.remoteJid;
          const senderPhone = senderJid?.split('@')[0];
          
          logger.info({ instanceId, messageId, senderPhone, protocolType: protocolMsg.type }, 'Mensagem revogada via protocolMessage');
          
          await sendWebhook('message.deleted', {
            messageId,
            senderPhone,
            senderJid,
          }, instanceId);
          continue;
        }
      }

      // Detectar deleção via messageStubType
      const stubType = message.messageStubType;
      if (stubType === 2) {
        const messageId = message.key?.id;
        const senderJid = message.key?.remoteJid;
        const senderPhone = senderJid?.split('@')[0];
        
        logger.info({ instanceId, messageId, senderPhone, stubType }, 'Mensagem apagada via messageStubType');
        
        await sendWebhook('message.deleted', {
          messageId,
          senderPhone,
          senderJid,
        }, instanceId);
        continue;
      }

      // Ignorar mensagens sem conteúdo real
      if (!message.message) {
        logger.info({ instanceId, key: message.key, stubType: message.messageStubType }, 'Mensagem sem conteúdo ignorada');
        continue;
      }

      // Tipos de mensagem internos
      const internalOnlyTypes = ['senderKeyDistributionMessage'];
      const msgKeys = Object.keys(message.message);
      const hasOnlyInternalTypes = msgKeys.length > 0 && msgKeys.every(key => 
        internalOnlyTypes.includes(key) || key === 'messageContextInfo'
      );
      
      if (hasOnlyInternalTypes) {
        logger.info({ instanceId, keys: msgKeys }, 'Tipo de mensagem interno ignorado');
        continue;
      }

      logger.info({ 
        instanceId,
        fromMe: message.key.fromMe, 
        type: m.type,
        msgKeys: Object.keys(message.message || {})
      }, 'DEBUG: Mensagem passou filtros iniciais');

      if (!message.key.fromMe && (m.type === 'notify' || m.type === 'append')) {
        const msgId = message.key?.id;
        
        // Deduplicação: evitar processar mensagens já vistas (importante para append)
        if (msgId && instance.processedMessageIds.has(msgId)) {
          logger.info({ instanceId, msgId, type: m.type }, 'Mensagem já processada (dedup) - ignorada');
          continue;
        }
        if (msgId) {
          instance.processedMessageIds.add(msgId);
          // Limpar cache a cada 5000 mensagens para evitar memory leak
          if (instance.processedMessageIds.size > 5000) {
            const entries = [...instance.processedMessageIds];
            instance.processedMessageIds = new Set(entries.slice(-2000));
          }
        }
        
        // Para mensagens append antigas (>5 min), ignorar para evitar flood de histórico
        if (m.type === 'append' && message.messageTimestamp) {
          const msgAge = Date.now() / 1000 - Number(message.messageTimestamp);
          if (msgAge > 300) { // mais de 5 minutos
            logger.info({ instanceId, msgId, ageSeconds: Math.round(msgAge) }, 'Mensagem append antiga ignorada (>5min)');
            continue;
          }
        }
        
        const senderJid = message.key.remoteJid;
        
        if (senderJid === 'status@broadcast' || senderJid?.includes('broadcast')) {
          logger.info({ instanceId }, 'Status/story ignorado');
          continue;
        }

        const senderPhone = senderJid.split('@')[0];
        const isLidFormat = senderJid?.includes(':') || senderJid?.endsWith('@lid');
        if (!senderPhone || (!isLidFormat && !/^\d{8,}$/.test(senderPhone))) {
          logger.info({ instanceId, senderJid, senderPhone, isLidFormat }, 'JID inválido ignorado');
          continue;
        }
        
        // Filtrar mensagens de protocolo sem conteúdo real
        const msgKeys = Object.keys(message.message || {});
        const REAL_CONTENT_TYPES = [
          'conversation', 'extendedTextMessage', 'imageMessage', 'videoMessage',
          'audioMessage', 'documentMessage', 'stickerMessage', 'locationMessage',
          'contactMessage', 'contactsArrayMessage'
        ];
        const hasRealContent = msgKeys.some(k => REAL_CONTENT_TYPES.includes(k));

        if (!hasRealContent) {
          logger.info({ instanceId, msgKeys }, 'Mensagem sem conteudo real ignorada (protocol/senderKey)');
          continue;
        }

        logger.info({ instanceId, senderJid, senderPhone }, 'DEBUG: Processando mensagem de cliente');
        
        const senderName = message.pushName || null;
        const isGroup = senderJid.endsWith('@g.us');
        
        // Extrair participant (pode conter o JID real em mensagens de contatos LID)
        const participant = message.key.participant || null;

        let content = '';
        let messageType = 'text';
        let mediaUrl = null;

        if (message.message?.conversation) {
          content = message.message.conversation;
        } else if (message.message?.extendedTextMessage?.text) {
          content = message.message.extendedTextMessage.text;
        } else if (message.message?.imageMessage) {
          messageType = 'image';
          content = message.message.imageMessage.caption || '';
        } else if (message.message?.videoMessage) {
          messageType = 'video';
          content = message.message.videoMessage.caption || '';
        } else if (message.message?.audioMessage) {
          messageType = 'audio';
        } else if (message.message?.documentMessage) {
          messageType = 'document';
          content = message.message.documentMessage.fileName || '';
        } else if (message.message?.stickerMessage) {
          messageType = 'sticker';
        } else if (message.message?.locationMessage) {
          messageType = 'location';
          content = JSON.stringify({
            latitude: message.message.locationMessage.degreesLatitude,
            longitude: message.message.locationMessage.degreesLongitude,
          });
        } else if (message.message?.contactMessage) {
          messageType = 'contact';
          const vcard = message.message.contactMessage.vcard || '';
          const displayName = message.message.contactMessage.displayName || '';
          // Extrair número de telefone do vCard
          const telMatch = vcard.match(/TEL[^:]*:([+\d\s-]+)/i);
          const phoneNumber = telMatch ? telMatch[1].replace(/[\s-]/g, '') : '';
          content = JSON.stringify({
            displayName,
            phoneNumber,
            vcard
          });
        } else if (message.message?.contactsArrayMessage) {
          messageType = 'contact';
          const contacts = (message.message.contactsArrayMessage.contacts || []).map(c => {
            const vcard = c.vcard || '';
            const telMatch = vcard.match(/TEL[^:]*:([+\d\s-]+)/i);
            return {
              displayName: c.displayName || '',
              phoneNumber: telMatch ? telMatch[1].replace(/[\s-]/g, '') : '',
              vcard
            };
          });
          content = JSON.stringify(contacts);
        }

        // Filtrar textos placeholder do WhatsApp (falha de descriptografia)
        const PLACEHOLDER_TEXTS = ['Aguardando mensagem', 'Waiting for this message'];
        const hasMedia = message.message?.audioMessage || 
                         message.message?.imageMessage || 
                         message.message?.documentMessage ||
                         message.message?.videoMessage;

        if (content && PLACEHOLDER_TEXTS.some(p => content.startsWith(p)) && !hasMedia) {
          logger.info({ instanceId, content: content.substring(0, 50) }, 'Mensagem placeholder ignorada');
          continue;
        }

        // Processar mídia
        
        let mediaBase64 = null;
        mediaUrl = null;
        let mimeType = null;
        let fileName = null;
        
        if (hasMedia) {
          try {
            logger.info({ instanceId, type: messageType }, 'Baixando mídia do WhatsApp...');
            
            const buffer = await Promise.race([
              downloadMediaMessage(
                message,
                'buffer',
                {},
                { 
                  logger: pino({ level: 'warn' }),
                  reuploadRequest: instance.sock.updateMediaMessage 
                }
              ),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Media download timeout after 30s')), 30000))
            ]);
            
            if (buffer && buffer.length > 0) {
              let extension = '.bin';
              mimeType = 'application/octet-stream';
              
              if (message.message.audioMessage) {
                extension = '.ogg';
                mimeType = message.message.audioMessage.mimetype || 'audio/ogg; codecs=opus';
              } else if (message.message.imageMessage) {
                const imgMime = message.message.imageMessage.mimetype || 'image/jpeg';
                mimeType = imgMime;
                extension = imgMime.includes('png') ? '.png' : imgMime.includes('webp') ? '.webp' : '.jpg';
              } else if (message.message.videoMessage) {
                mimeType = message.message.videoMessage.mimetype || 'video/mp4';
                extension = '.mp4';
              } else if (message.message.documentMessage) {
                mimeType = message.message.documentMessage.mimetype || 'application/octet-stream';
                const originalName = message.message.documentMessage.fileName || '';
                const extMatch = originalName.match(/\.([^.]+)$/);
                extension = extMatch ? `.${extMatch[1]}` : '.bin';
              }
              
              fileName = message.message.documentMessage?.fileName || `${Date.now()}_${senderPhone}${extension}`;
              
              // Tentar upload direto para o Storage (sem limite de tamanho)
              const uploadedUrl = await uploadToSupabaseStorage(buffer, fileName, mimeType);
              
              if (uploadedUrl) {
                mediaUrl = uploadedUrl;
                logger.info({ instanceId, fileName, mimeType, size: buffer.length, mediaUrl }, 'Mídia enviada direto para Storage');
              } else {
                // Fallback: base64 para arquivos até 20MB
                const MAX_BASE64_SIZE = 20 * 1024 * 1024;
                if (buffer.length <= MAX_BASE64_SIZE) {
                  mediaBase64 = buffer.toString('base64');
                  logger.info({ instanceId, fileName, mimeType, size: buffer.length, sizeMB: (buffer.length / 1024 / 1024).toFixed(2) }, 'Fallback: mídia convertida para base64');
                } else {
                  const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
                  logger.warn({ instanceId, size: buffer.length, sizeMB }, `Mídia muito grande (${sizeMB}MB) e Storage não disponível`);
                  content = `[Mídia muito grande: ${sizeMB}MB]`;
                }
              }
            }
          } catch (mediaError) {
            logger.error({ instanceId, error: mediaError.message, stack: mediaError.stack }, 'Erro ao processar mídia');
            content = '[Mídia não disponível]';
          }
        }

        logger.info(
          { instanceId, senderJid, senderPhone, type: messageType, hasMedia: !!mediaUrl, content: content.substring(0, 50) },
          'Mensagem recebida'
        );

        // ====== RESOLVER LID → TELEFONE REAL ANTES DE ENVIAR WEBHOOK ======
        let resolvedPhone = null;
        let resolvedName = senderName || null;
        
        if (isLidFormat && senderJid) {
          // Tentar resolver pelo mapa em memória
          const lidData = instance.lidMap.get(senderJid);
          if (lidData) {
            resolvedPhone = lidData.phone;
            if (!resolvedName && lidData.name) {
              resolvedName = lidData.name;
            }
            logger.info({ instanceId, lid: senderJid, resolvedPhone, resolvedName }, 'LID resolvido via mapa em memória (match exato)');
          } else {
            // Resolução canônica segura: extrair base canônica do LID
            // LID format: "131451769106561:90@lid" → canonical = "131451769106561@lid"
            // Comparar APENAS chave canônica (sem sufixo :NN), NÃO por prefixo parcial
            const canonicalLid = senderJid.replace(/:\d+@/, '@'); // "131451769106561:90@lid" → "131451769106561@lid"
            
            // Buscar match exato pela chave canônica
            for (const [key, value] of instance.lidMap.entries()) {
              const keyCanonical = key.replace(/:\d+@/, '@');
              if (keyCanonical === canonicalLid) {
                resolvedPhone = value.phone;
                if (!resolvedName && value.name) {
                  resolvedName = value.name;
                }
                logger.info({ instanceId, lid: senderJid, matchedKey: key, canonicalLid, resolvedPhone }, 'LID resolvido via chave canônica');
                break;
              }
            }
          }
          
          if (!resolvedPhone) {
            logger.info({ instanceId, lid: senderJid, lidMapSize: instance.lidMap.size }, 'LID não encontrado no mapa');
          }
        }

        await sendWebhook('message.received', {
          messageId: message.key.id,
          sender: senderPhone,
          senderJid: senderJid,
          senderName: resolvedName,
          isGroup,
          groupId: isGroup ? senderJid : null,
          content,
          messageType,
          mediaBase64,
          mediaUrl,
          mimeType,
          fileName,
          participant,
          resolvedPhone, // Telefone real resolvido do mapa LID
          timestamp: message.messageTimestamp,
        }, instanceId);
      } // end if (!message.key.fromMe && m.type === 'notify')
    } catch (msgProcessError) {
      logger.error({ instanceId, messageId: message?.key?.id, error: msgProcessError.message, stack: msgProcessError.stack }, 'Erro fatal ao processar mensagem individual — continuando para próxima');
      continue;
    }
  } // end for message of m.messages
});

    // ====== CONTACTS.UPSERT: Capturar mapeamento LID → telefone real ======
    instance.sock.ev.on('contacts.upsert', async (contacts) => {
      logger.info({ instanceId, count: contacts.length }, 'contacts.upsert recebido');
      
      const mappings = [];
      for (const contact of contacts) {
        const cId = contact.id; // pode ser LID ou telefone@s.whatsapp.net
        const cName = contact.name || contact.notify || contact.verifiedName || null;
        const cPhone = contact.id?.endsWith('@s.whatsapp.net') ? contact.id.split('@')[0] : null;
        
        // ====== POPULAR MAPA LID → TELEFONE EM MEMÓRIA ======
        // Se o contato tem ID real (@s.whatsapp.net) e também um LID, mapear
        if (cPhone && contact.lid) {
          instance.lidMap.set(contact.lid, { phone: cPhone, name: cName });
          logger.info({ instanceId, lid: contact.lid, phone: cPhone, name: cName }, 'LID mapeado para telefone real');
        }
        
        // Se temos um LID com lidPhone mapeado ou um telefone real
        if (cId) {
          mappings.push({
            jid: cId,
            name: cName,
            phone: cPhone,
            lid: contact.lid || null,
          });
        }
      }
      
      logger.info({ instanceId, lidMapSize: instance.lidMap.size }, 'Tamanho do mapa LID');
      
      if (mappings.length > 0) {
        logger.info({ instanceId, mappingsCount: mappings.length, sample: mappings.slice(0, 3) }, 'Enviando contacts.sync ao webhook');
        await sendWebhook('contacts.sync', { contacts: mappings }, instanceId);
      }
    });

    // Presença
    instance.sock.ev.on('presence.update', async (presence) => {
      const { id, presences } = presence;
      
      if (presences) {
        for (const [jid, status] of Object.entries(presences)) {
          const phone = jid.split('@')[0];
          
          logger.info({ instanceId, phone, status: status.lastKnownPresence }, 'Presença atualizada');
          
          await sendWebhook('presence.update', {
            phone,
            status: status.lastKnownPresence,
            timestamp: new Date().toISOString()
          }, instanceId);
        }
      }
    });

    // Status de mensagens
    instance.sock.ev.on('messages.update', async (updates) => {
      for (const update of updates) {
        logger.info({ 
          instanceId,
          messageId: update.key?.id,
          remoteJid: update.key?.remoteJid,
          fromMe: update.key?.fromMe,
          stubType: update.update?.messageStubType,
          hasMessage: update.update?.message !== undefined,
          messageIsNull: update.update?.message === null,
          status: update.update?.status,
          updateKeys: update.update ? Object.keys(update.update) : []
        }, 'DEBUG messages.update: Update recebido');

        const stubType = update.update?.messageStubType;
        const isRevoke = stubType === 2;
        // REMOVED: heuristic `message === null && !status` caused false positives (normal updates treated as deletions)
        
        if (isRevoke) {
          const messageId = update.key.id;
          const senderJid = update.key.remoteJid;
          const senderPhone = senderJid?.split('@')[0];
          
          logger.info({ instanceId, messageId, senderPhone, stubType }, 'Mensagem apagada detectada via messages.update');
          
          await sendWebhook('message.deleted', {
            messageId,
            senderPhone,
            senderJid,
          }, instanceId);
          continue;
        }
        
        if (update.update?.status) {
          const statusMap = {
            2: 'sent',
            3: 'delivered',
            4: 'read',
          };

          await sendWebhook('message.status', {
            messageId: update.key.id,
            status: statusMap[update.update.status] || 'unknown',
            recipient: update.key.remoteJid?.split('@')[0],
          }, instanceId);
        }
      }
    });

    // Listener dedicado para reações
    instance.sock.ev.on('messages.reaction', async (reactions) => {
      logger.info({ instanceId, reactionCount: reactions?.length }, 'DEBUG messages.reaction: Evento de reações recebido');
      
      if (!reactions || !Array.isArray(reactions)) return;
      
      for (const reaction of reactions) {
        const targetMessageId = reaction.key?.id;
        const emoji = reaction.reaction?.text;
        const senderJid = reaction.key?.remoteJid;
        const senderPhone = senderJid?.split('@')[0];
        
        logger.info({ instanceId, targetMessageId, emoji, senderPhone }, 'Reação processada via messages.reaction');
        
        await sendWebhook('message.reaction', {
          targetMessageId,
          emoji,
          senderPhone,
          senderJid,
          isRemoval: !emoji || emoji === '',
        }, instanceId);
      }
    });
  } catch (error) {
    instance.lastEventAt = new Date().toISOString();
    instance.lastConnectionError = error?.message || String(error);

    logger.error({ instanceId, error: instance.lastConnectionError }, 'Erro ao iniciar WhatsApp');
    instance.connectionStatus = 'error';
    instance.isStarting = false;
  }
}

// ============= INSTANCE MANAGEMENT ROUTES =============

// List all instances
app.get('/instances', (req, res) => {
  const instanceList = [];
  for (const [id, instance] of instances) {
    instanceList.push({
      instanceId: id,
      status: instance.connectionStatus,
      phone: instance.connectedPhone,
      hasQR: !!instance.qrCodeData,
      lastEventAt: instance.lastEventAt,
      lastError: instance.lastConnectionError,
    });
  }
  
  res.json({
    success: true,
    instances: instanceList,
    total: instances.size,
    maxInstances: MAX_INSTANCES
  });
});

// Create new instance
app.post('/instances', (req, res) => {
  const { instanceId } = req.body;
  
  if (!instanceId) {
    return res.status(400).json({ success: false, error: 'instanceId é obrigatório' });
  }
  
  if (instances.has(instanceId)) {
    return res.status(409).json({ success: false, error: 'Instância já existe' });
  }
  
  if (instances.size >= MAX_INSTANCES) {
    return res.status(400).json({ 
      success: false, 
      error: `Limite máximo de ${MAX_INSTANCES} instâncias atingido` 
    });
  }
  
  const instance = getOrCreateInstance(instanceId);
  
  res.json({
    success: true,
    instanceId,
    message: 'Instância criada. Use /instances/:instanceId/connect para conectar.'
  });
});

// Delete instance
app.delete('/instances/:instanceId', async (req, res) => {
  const { instanceId } = req.params;
  
  if (!instances.has(instanceId)) {
    return res.status(404).json({ success: false, error: 'Instância não encontrada' });
  }
  
  try {
    const instance = instances.get(instanceId);
    
    // Desconectar socket se existir
    if (instance.sock) {
      try {
        await instance.sock.logout();
      } catch {}
      instance.sock = null;
    }
    
    // Limpar sessão
    clearAuthDir(instanceId);
    
    // Remover do Map
    instances.delete(instanceId);
    
    logger.info({ instanceId, remaining: instances.size }, 'Instância removida');
    
    res.json({ success: true, message: 'Instância removida com sucesso' });
  } catch (error) {
    logger.error({ instanceId, error: error.message }, 'Erro ao remover instância');
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============= INSTANCE-SPECIFIC ROUTES =============

// Get instance status
app.get('/instances/:instanceId/status', (req, res) => {
  const { instanceId } = req.params;
  
  if (!instances.has(instanceId)) {
    return res.json({
      status: 'not_created',
      instanceId,
      phone: null,
      hasQR: false,
      lastError: null
    });
  }
  
  const instance = instances.get(instanceId);
  
  res.json({
    instanceId,
    status: instance.connectionStatus,
    phone: instance.connectedPhone,
    hasQR: !!instance.qrCodeData,
    lastError: instance.lastConnectionError,
    lastDisconnect: {
      code: instance.lastDisconnectCode,
      reason: instance.lastDisconnectReason,
    },
    lastEventAt: instance.lastEventAt,
    isStarting: instance.isStarting,
    authDirFiles: getAuthDirFileCount(instanceId),
  });
});

// Get QR code for instance
app.get('/instances/:instanceId/qr', (req, res) => {
  const { instanceId } = req.params;
  
  if (!instances.has(instanceId)) {
    return res.json({ success: false, message: 'Instância não existe', status: 'not_created' });
  }
  
  const instance = instances.get(instanceId);
  
  if (instance.connectionStatus === 'connected') {
    return res.json({ 
      success: false, 
      message: 'Já conectado',
      status: instance.connectionStatus,
      phone: instance.connectedPhone
    });
  }

  if (!instance.qrCodeData) {
    return res.json({ 
      success: false, 
      message: 'QR Code não disponível ainda. Aguarde...',
      status: instance.connectionStatus
    });
  }

  res.json({ 
    success: true, 
    qr: instance.qrCodeData,
    status: instance.connectionStatus
  });
});

// Connect instance
app.post('/instances/:instanceId/connect', async (req, res) => {
  const { instanceId } = req.params;
  
  logger.info({ instanceId }, 'Requisição POST /instances/:instanceId/connect recebida');
  
  const instance = getOrCreateInstance(instanceId);
  
  if (instance.connectionStatus === 'connected') {
    return res.json({ 
      success: false, 
      message: 'Já conectado',
      phone: instance.connectedPhone
    });
  }

  instance.reconnectAttempts = 0;
  instance.connectionStatus = 'connecting';
  instance.qrCodeData = null;
  
  startWhatsApp(instanceId);

  res.json({ 
    success: true, 
    message: 'Iniciando conexão...',
    instanceId,
    status: instance.connectionStatus
  });
});

// Disconnect instance
app.post('/instances/:instanceId/disconnect', async (req, res) => {
  const { instanceId } = req.params;
  
  logger.info({ instanceId }, 'Requisição POST /instances/:instanceId/disconnect recebida');
  
  if (!instances.has(instanceId)) {
    return res.status(404).json({ success: false, error: 'Instância não encontrada' });
  }
  
  const instance = instances.get(instanceId);
  
  try {
    if (instance.sock) {
      await instance.sock.logout();
      instance.sock = null;
    }
    
    clearAuthDir(instanceId);

    instance.connectionStatus = 'disconnected';
    instance.connectedPhone = null;
    instance.qrCodeData = null;

    res.json({ success: true, message: 'Desconectado com sucesso' });
  } catch (error) {
    logger.error({ instanceId, error: error.message }, 'Erro ao desconectar');
    res.status(500).json({ success: false, error: error.message });
  }
});

// Clear session for instance
app.post('/instances/:instanceId/clear-session', (req, res) => {
  const { instanceId } = req.params;
  
  logger.info({ instanceId }, 'Requisição POST /instances/:instanceId/clear-session recebida');
  
  if (!instances.has(instanceId)) {
    // Se não existe, apenas limpar o diretório
    const cleared = clearAuthDir(instanceId);
    return res.json({ success: cleared, message: cleared ? 'Sessão limpa' : 'Erro ao limpar' });
  }
  
  const instance = instances.get(instanceId);
  
  try {
    if (instance.sock) {
      try {
        instance.sock.end?.(new Error('Session cleared'));
      } catch {}
      instance.sock = null;
    }
    
    const cleared = clearAuthDir(instanceId);
    
    instance.connectionStatus = 'disconnected';
    instance.connectedPhone = null;
    instance.qrCodeData = null;
    instance.isStarting = false;
    instance.lastConnectionError = null;
    instance.lastDisconnectCode = null;
    instance.lastDisconnectReason = null;
    
    res.json({ 
      success: cleared, 
      message: cleared ? 'Sessão limpa com sucesso' : 'Erro ao limpar sessão'
    });
  } catch (error) {
    logger.error({ instanceId, error: error.message }, 'Erro ao limpar sessão');
    res.status(500).json({ success: false, error: error.message });
  }
});

// Force connect instance
app.post('/instances/:instanceId/force-connect', async (req, res) => {
  const { instanceId } = req.params;
  
  logger.info({ instanceId }, 'Requisição POST /instances/:instanceId/force-connect recebida');
  
  const instance = getOrCreateInstance(instanceId);
  
  try {
    if (instance.sock) {
      try {
        instance.sock.end?.(new Error('Force connect'));
      } catch {}
      instance.sock = null;
    }
    
    clearAuthDir(instanceId);
    
    instance.connectionStatus = 'connecting';
    instance.connectedPhone = null;
    instance.qrCodeData = null;
    instance.isStarting = false;
    instance.reconnectAttempts = 0;
    instance.lastConnectionError = null;
    instance.lastDisconnectCode = null;
    instance.lastDisconnectReason = null;
    
    startWhatsApp(instanceId);
    
    res.json({ 
      success: true, 
      message: 'Iniciando conexão limpa...',
      instanceId,
      status: instance.connectionStatus
    });
  } catch (error) {
    logger.error({ instanceId, error: error.message }, 'Erro ao forçar conexão');
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get profile picture for a JID
app.get('/instances/:instanceId/profile-picture/:jid', async (req, res) => {
  const { instanceId, jid } = req.params;
  
  logger.info({ instanceId, jid }, 'Requisição GET /instances/:instanceId/profile-picture/:jid');
  
  if (!instances.has(instanceId)) {
    return res.status(404).json({ success: false, error: 'Instância não encontrada' });
  }
  
  const instance = instances.get(instanceId);
  
  if (!instance.sock || instance.connectionStatus !== 'connected') {
    return res.status(400).json({ success: false, error: 'WhatsApp não está conectado' });
  }
  
  try {
    // Ensure JID has proper suffix
    const fullJid = jid.includes('@') ? jid : `${jid}@s.whatsapp.net`;
    const url = await instance.sock.profilePictureUrl(fullJid, 'image');
    res.json({ success: true, url });
  } catch (error) {
    // Profile picture not available (privacy settings or no picture)
    logger.info({ instanceId, jid, error: error?.message }, 'Foto de perfil não disponível');
    res.json({ success: false, url: null, reason: 'not_available' });
  }
});

// Send message from instance
app.post('/instances/:instanceId/send', async (req, res) => {
  const { instanceId } = req.params;
  
  if (!instances.has(instanceId)) {
    return res.status(404).json({ success: false, error: 'Instância não encontrada' });
  }
  
  const instance = instances.get(instanceId);
  
  try {
    const { to, message, type = 'text' } = req.body;

    if (!instance.sock || instance.connectionStatus !== 'connected') {
      return res.status(400).json({ 
        success: false, 
        error: 'WhatsApp não está conectado' 
      });
    }

    if (!to || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Parâmetros "to" e "message" são obrigatórios' 
      });
    }

    // Resolver JID do destinatário (prioriza telefone real e usa LID apenas como fallback)
    const jidCandidates = buildJidCandidates(instance, to);

    if (!jidCandidates.length) {
      return res.status(400).json({
        success: false,
        error: 'Destino inválido para envio'
      });
    }

    logger.info({ instanceId, to, jidCandidates }, 'Candidatos de JID para envio');

    // FASE D: Pré-checagem com onWhatsApp para validar candidatos antes de enviar
    let validatedCandidates = [];
    if (instance.sock && jidCandidates.length > 1) {
      for (const candidate of jidCandidates) {
        try {
          // Só fazer onWhatsApp para @s.whatsapp.net (LIDs não suportam onWhatsApp)
          if (candidate.endsWith('@s.whatsapp.net')) {
            const [checkResult] = await instance.sock.onWhatsApp(candidate);
            if (checkResult?.exists) {
              validatedCandidates.push(checkResult.jid || candidate);
              logger.info({ instanceId, candidate, resolvedJid: checkResult.jid, exists: true }, 'Candidato validado via onWhatsApp');
              break; // Primeiro validado é suficiente
            } else {
              logger.info({ instanceId, candidate, exists: false }, 'Candidato não existe no WhatsApp');
            }
          } else {
            // LIDs vão direto sem pré-checagem
            validatedCandidates.push(candidate);
          }
        } catch (checkErr) {
          logger.warn({ instanceId, candidate, error: checkErr?.message }, 'Erro no onWhatsApp, incluindo como fallback');
          validatedCandidates.push(candidate);
        }
      }
    }
    
    // Se nenhum foi validado, usar os candidatos originais
    const finalCandidates = validatedCandidates.length > 0 ? validatedCandidates : jidCandidates;
    logger.info({ instanceId, to, finalCandidates, preChecked: validatedCandidates.length > 0 }, 'Candidatos finais para envio');

    let result;
    let usedJid = null;
    const attemptedCandidates = [];

    for (const jid of finalCandidates) {
      attemptedCandidates.push(jid);
      try {
        if (type === 'text') {
          result = await instance.sock.sendMessage(jid, { text: message });
        } else if (type === 'image') {
          result = await instance.sock.sendMessage(jid, {
            image: { url: message },
            caption: req.body.caption || '',
          });
        } else if (type === 'audio') {
          let audioBuffer;
          
          if (message.startsWith('data:')) {
            const base64Match = message.match(/^data:([^;,]+(?:;[^;,]*)*);base64,(.+)$/);
            if (base64Match) {
              const detectedMime = base64Match[1];
              const base64Data = base64Match[2];
              audioBuffer = Buffer.from(base64Data, 'base64');
              logger.info({ instanceId, size: audioBuffer.length, detectedMime }, 'Áudio recebido como base64');
            } else {
              logger.error({ instanceId, messagePreview: message.substring(0, 100) }, 'Formato base64 inválido para áudio');
              return res.status(400).json({ success: false, error: 'Formato base64 inválido para áudio' });
            }
          } else if (message.startsWith('http')) {
            logger.info({ instanceId, url: message.substring(0, 100) }, 'Baixando áudio da URL...');
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 30000);
              
              const response = await fetch(message, {
                headers: { 'User-Agent': 'WhatsApp/2.0' },
                signal: controller.signal
              });
              clearTimeout(timeoutId);
              
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
              }
              const arrayBuffer = await response.arrayBuffer();
              audioBuffer = Buffer.from(arrayBuffer);
              logger.info({ instanceId, size: audioBuffer.length, contentType: response.headers.get('content-type') }, 'Áudio baixado com sucesso');
            } catch (downloadErr) {
              logger.error({ instanceId, error: downloadErr.message, url: message.substring(0, 100) }, 'Falha ao baixar áudio');
              return res.status(500).json({ 
                success: false, 
                error: 'Falha ao baixar arquivo de áudio',
                details: downloadErr.message 
              });
            }
          } else {
            audioBuffer = Buffer.from(message, 'base64');
            logger.info({ instanceId, size: audioBuffer.length }, 'Áudio assumido como base64 sem prefixo');
          }
          
          // Converter para OGG/Opus real via ffmpeg
          try {
            logger.info({ instanceId, originalSize: audioBuffer.length }, 'Convertendo áudio para OGG/Opus via ffmpeg...');
            audioBuffer = await convertToOggOpus(audioBuffer);
          } catch (convErr) {
            logger.error({ instanceId, error: convErr.message }, 'Falha na conversão ffmpeg do áudio');
            return res.status(500).json({ 
              success: false, 
              error: 'Falha ao converter áudio para formato compatível com WhatsApp',
              details: convErr.message 
            });
          }

          const mimetype = 'audio/ogg; codecs=opus';
          logger.info({ instanceId, jid, mimetype, bufferSize: audioBuffer.length }, 'Enviando áudio convertido para WhatsApp...');
          
          result = await instance.sock.sendMessage(jid, {
            audio: audioBuffer,
            mimetype: mimetype,
            ptt: true,
          });
        } else if (type === 'video') {
          result = await instance.sock.sendMessage(jid, {
            video: { url: message },
            caption: req.body.caption || '',
          });
        } else if (type === 'document') {
          result = await instance.sock.sendMessage(jid, {
            document: { url: message },
            mimetype: req.body.mimetype || 'application/octet-stream',
            fileName: req.body.fileName || 'document',
          });
        }

        // Cachear mensagem enviada para getMessage (re-criptografia E2E)
        if (result?.key?.id) {
          let msgContent;
          if (type === 'text') {
            msgContent = { text: message };
          } else if (type === 'image') {
            msgContent = { image: { url: message }, caption: req.body.caption || '' };
          } else if (type === 'audio') {
            msgContent = { audio: audioBuffer, mimetype: 'audio/ogg; codecs=opus', ptt: true };
          } else if (type === 'video') {
            msgContent = { video: { url: message }, caption: req.body.caption || '' };
          } else if (type === 'document') {
            msgContent = { document: { url: message }, mimetype: req.body.mimetype || 'application/octet-stream', fileName: req.body.fileName || 'document' };
          }
          if (msgContent) {
            instance.cacheSentMessage(result.key.id, msgContent);
          }
        }

        usedJid = jid;
        break;
      } catch (err) {
        const errorMessage = err?.message || String(err);
        const errorData = err?.data || {};
        logger.warn(
          { instanceId, to: jid, error: errorMessage, type, errorData },
          'Falha ao enviar, tentando próximo JID (se houver)'
        );
      }
    }

    if (!result || !usedJid) {
      return res.status(500).json({
        success: false,
        error: 'Falha ao enviar mensagem para o destinatário',
        attemptedCandidates,
      });
    }

    logger.info({ instanceId, to: usedJid, type, originalTo: to, attemptedCandidates }, 'Mensagem enviada');

    // ====== PROACTIVE LID CAPTURE: após envio bem-sucedido para @s.whatsapp.net, descobrir LID associado ======
    let resolvedLid = null;
    if (usedJid && usedJid.endsWith('@s.whatsapp.net') && instance.sock) {
      try {
        const phoneForLookup = usedJid.split('@')[0];
        const lookupPromise = instance.sock.onWhatsApp(usedJid);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
        const [lookupResult] = await Promise.race([lookupPromise, timeoutPromise]);
        
        if (lookupResult?.jid && lookupResult.jid.endsWith('@lid')) {
          resolvedLid = lookupResult.jid;
          const canonicalLid = normalizeLidCanonical(resolvedLid);
          instance.lidMap.set(resolvedLid, { phone: phoneForLookup, name: null });
          if (canonicalLid && canonicalLid !== resolvedLid) {
            instance.lidMap.set(canonicalLid, { phone: phoneForLookup, name: null });
          }
          logger.info({ instanceId, phone: phoneForLookup, resolvedLid, canonicalLid }, '🔑 LID capturado proativamente após envio');
        }
      } catch (lidErr) {
        // Timeout ou erro — não bloqueia o envio
        logger.debug({ instanceId, usedJid, error: lidErr?.message }, 'onWhatsApp pós-envio falhou (não-crítico)');
      }
    }

    res.json({ 
      success: true, 
      messageId: result.key.id,
      status: 'sent',
      usedJid: usedJid,
      originalTo: to,
      attemptedCandidates,
      resolvedLid,
    });
  } catch (error) {
    logger.error({ instanceId, error: error.message }, 'Erro ao enviar mensagem');
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check number for instance
app.get('/instances/:instanceId/check/:phone', async (req, res) => {
  const { instanceId, phone } = req.params;
  
  if (!instances.has(instanceId)) {
    return res.status(404).json({ success: false, error: 'Instância não encontrada' });
  }
  
  const instance = instances.get(instanceId);
  
  try {
    if (!instance.sock || instance.connectionStatus !== 'connected') {
      return res.status(400).json({ success: false, error: 'WhatsApp não está conectado' });
    }

    const jidToCheck = resolveCheckJid(phone);
    if (!jidToCheck) {
      return res.status(400).json({ success: false, error: 'Destino inválido para verificação' });
    }
    
    const [result] = await instance.sock.onWhatsApp(jidToCheck);

    res.json({
      success: true,
      exists: !!result?.exists,
      jid: result?.jid,
      checkedJid: jidToCheck
    });
  } catch (error) {
    logger.error({ instanceId, phone, error: error.message }, 'Erro ao verificar número');
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============= BACKWARD COMPATIBILITY ROUTES =============
// These routes use the DEFAULT_INSTANCE for backward compatibility

app.get('/status', (req, res) => {
  if (!instances.has(DEFAULT_INSTANCE)) {
    return res.json({
      status: 'disconnected',
      phone: null,
      hasQR: false,
      lastError: null,
      instanceId: DEFAULT_INSTANCE
    });
  }
  
  const instance = instances.get(DEFAULT_INSTANCE);
  
  res.json({
    instanceId: DEFAULT_INSTANCE,
    status: instance.connectionStatus,
    phone: instance.connectedPhone,
    hasQR: !!instance.qrCodeData,
    lastError: instance.lastConnectionError,
    lastDisconnect: {
      code: instance.lastDisconnectCode,
      reason: instance.lastDisconnectReason,
    },
    lastEventAt: instance.lastEventAt,
    isStarting: instance.isStarting,
    authDirFiles: getAuthDirFileCount(DEFAULT_INSTANCE),
  });
});

app.get('/qr', (req, res) => {
  if (!instances.has(DEFAULT_INSTANCE)) {
    return res.json({ success: false, message: 'QR Code não disponível ainda', status: 'disconnected' });
  }
  
  const instance = instances.get(DEFAULT_INSTANCE);
  
  if (instance.connectionStatus === 'connected') {
    return res.json({ 
      success: false, 
      message: 'Já conectado',
      status: instance.connectionStatus,
      phone: instance.connectedPhone
    });
  }

  if (!instance.qrCodeData) {
    return res.json({ 
      success: false, 
      message: 'QR Code não disponível ainda. Aguarde...',
      status: instance.connectionStatus
    });
  }

  res.json({ 
    success: true, 
    qr: instance.qrCodeData,
    status: instance.connectionStatus
  });
});

app.post('/connect', async (req, res) => {
  logger.info('Requisição POST /connect recebida (retrocompatibilidade)');
  
  const instance = getOrCreateInstance(DEFAULT_INSTANCE);
  
  if (instance.connectionStatus === 'connected') {
    return res.json({ 
      success: false, 
      message: 'Já conectado',
      phone: instance.connectedPhone
    });
  }

  instance.reconnectAttempts = 0;
  instance.connectionStatus = 'connecting';
  instance.qrCodeData = null;
  
  startWhatsApp(DEFAULT_INSTANCE);

  res.json({ 
    success: true, 
    message: 'Iniciando conexão...',
    status: instance.connectionStatus
  });
});

app.post('/disconnect', async (req, res) => {
  logger.info('Requisição POST /disconnect recebida (retrocompatibilidade)');
  
  if (!instances.has(DEFAULT_INSTANCE)) {
    return res.json({ success: true, message: 'Já desconectado' });
  }
  
  const instance = instances.get(DEFAULT_INSTANCE);
  
  try {
    if (instance.sock) {
      await instance.sock.logout();
      instance.sock = null;
    }
    
    clearAuthDir(DEFAULT_INSTANCE);

    instance.connectionStatus = 'disconnected';
    instance.connectedPhone = null;
    instance.qrCodeData = null;

    res.json({ success: true, message: 'Desconectado com sucesso' });
  } catch (error) {
    logger.error({ error: error.message }, 'Erro ao desconectar');
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/clear-session', (req, res) => {
  logger.info('Requisição POST /clear-session recebida (retrocompatibilidade)');
  
  if (instances.has(DEFAULT_INSTANCE)) {
    const instance = instances.get(DEFAULT_INSTANCE);
    
    if (instance.sock) {
      try {
        instance.sock.end?.(new Error('Session cleared'));
      } catch {}
      instance.sock = null;
    }
    
    instance.connectionStatus = 'disconnected';
    instance.connectedPhone = null;
    instance.qrCodeData = null;
    instance.isStarting = false;
    instance.lastConnectionError = null;
    instance.lastDisconnectCode = null;
    instance.lastDisconnectReason = null;
  }
  
  const cleared = clearAuthDir(DEFAULT_INSTANCE);
  
  res.json({ 
    success: cleared, 
    message: cleared ? 'Sessão limpa com sucesso' : 'Erro ao limpar sessão'
  });
});

app.post('/force-connect', async (req, res) => {
  logger.info('Requisição POST /force-connect recebida (retrocompatibilidade)');
  
  const instance = getOrCreateInstance(DEFAULT_INSTANCE);
  
  try {
    if (instance.sock) {
      try {
        instance.sock.end?.(new Error('Force connect'));
      } catch {}
      instance.sock = null;
    }
    
    clearAuthDir(DEFAULT_INSTANCE);
    
    instance.connectionStatus = 'connecting';
    instance.connectedPhone = null;
    instance.qrCodeData = null;
    instance.isStarting = false;
    instance.reconnectAttempts = 0;
    instance.lastConnectionError = null;
    instance.lastDisconnectCode = null;
    instance.lastDisconnectReason = null;
    
    startWhatsApp(DEFAULT_INSTANCE);
    
    res.json({ 
      success: true, 
      message: 'Iniciando conexão limpa...',
      status: instance.connectionStatus
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Erro ao forçar conexão');
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/send', async (req, res) => {
  // Get instanceId from body or use default
  const instanceId = req.body.instanceId || DEFAULT_INSTANCE;
  
  if (!instances.has(instanceId)) {
    // Try to use default instance if specified one doesn't exist
    if (instanceId !== DEFAULT_INSTANCE && instances.has(DEFAULT_INSTANCE)) {
      return res.redirect(307, '/send');
    }
    return res.status(400).json({ success: false, error: 'WhatsApp não está conectado' });
  }
  
  const instance = instances.get(instanceId);
  
  try {
    const { to, message, type = 'text' } = req.body;

    if (!instance.sock || instance.connectionStatus !== 'connected') {
      return res.status(400).json({ 
        success: false, 
        error: 'WhatsApp não está conectado' 
      });
    }

    if (!to || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Parâmetros "to" e "message" são obrigatórios' 
      });
    }

    const jidCandidates = buildJidCandidates(instance, to);

    if (!jidCandidates.length) {
      return res.status(400).json({
        success: false,
        error: 'Destino inválido para envio'
      });
    }

    logger.info({ instanceId, to, jidCandidates }, '[Legacy /send] Candidatos de JID para envio');

    let result;
    let usedJid = null;

    for (const jid of jidCandidates) {
      try {
        if (type === 'text') {
          result = await instance.sock.sendMessage(jid, { text: message });
        } else if (type === 'image') {
          result = await instance.sock.sendMessage(jid, {
            image: { url: message },
            caption: req.body.caption || '',
          });
        } else if (type === 'audio') {
          let audioBuffer;
          
          if (message.startsWith('data:')) {
            // Regex melhorada para capturar MIME types com parâmetros (ex: audio/ogg; codecs=opus)
            const base64Match = message.match(/^data:([^;,]+(?:;[^;,]*)*);base64,(.+)$/);
            if (base64Match) {
              const detectedMime = base64Match[1];
              const base64Data = base64Match[2];
              audioBuffer = Buffer.from(base64Data, 'base64');
              logger.info({ instanceId, size: audioBuffer.length, detectedMime }, '[Legacy /send] Áudio recebido como base64');
            } else {
              logger.error({ instanceId, messagePreview: message.substring(0, 100) }, '[Legacy /send] Formato base64 inválido para áudio');
              return res.status(400).json({ success: false, error: 'Formato base64 inválido para áudio' });
            }
          } else if (message.startsWith('http')) {
            logger.info({ instanceId, url: message.substring(0, 100) }, '[Legacy /send] Baixando áudio da URL...');
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 30000);
              
              const response = await fetch(message, {
                headers: { 'User-Agent': 'WhatsApp/2.0' },
                signal: controller.signal
              });
              clearTimeout(timeoutId);
              
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
              }
              const arrayBuffer = await response.arrayBuffer();
              audioBuffer = Buffer.from(arrayBuffer);
              logger.info({ instanceId, size: audioBuffer.length, contentType: response.headers.get('content-type') }, '[Legacy /send] Áudio baixado com sucesso');
            } catch (downloadErr) {
              logger.error({ instanceId, error: downloadErr.message, url: message.substring(0, 100) }, '[Legacy /send] Falha ao baixar áudio');
              return res.status(500).json({ 
                success: false, 
                error: 'Falha ao baixar arquivo de áudio',
                details: downloadErr.message 
              });
            }
          } else {
            audioBuffer = Buffer.from(message, 'base64');
            logger.info({ instanceId, size: audioBuffer.length }, '[Legacy /send] Áudio assumido como base64 sem prefixo');
          }
          
          // Converter para OGG/Opus real via ffmpeg
          try {
            logger.info({ instanceId, originalSize: audioBuffer.length }, '[Legacy /send] Convertendo áudio para OGG/Opus via ffmpeg...');
            audioBuffer = await convertToOggOpus(audioBuffer);
          } catch (convErr) {
            logger.error({ instanceId, error: convErr.message }, '[Legacy /send] Falha na conversão ffmpeg do áudio');
            return res.status(500).json({ 
              success: false, 
              error: 'Falha ao converter áudio para formato compatível com WhatsApp',
              details: convErr.message 
            });
          }

          const mimetype = 'audio/ogg; codecs=opus';
          logger.info({ instanceId, jid, mimetype, bufferSize: audioBuffer.length }, '[Legacy /send] Enviando áudio convertido para WhatsApp...');
          
          result = await instance.sock.sendMessage(jid, {
            audio: audioBuffer,
            mimetype: mimetype,
            ptt: true,
          });
        } else if (type === 'video') {
          result = await instance.sock.sendMessage(jid, {
            video: { url: message },
            caption: req.body.caption || '',
          });
        } else if (type === 'document') {
          result = await instance.sock.sendMessage(jid, {
            document: { url: message },
            mimetype: req.body.mimetype || 'application/octet-stream',
            fileName: req.body.fileName || 'document',
          });
        }

        // Cachear mensagem enviada para getMessage (re-criptografia E2E)
        if (result?.key?.id) {
          let msgContent;
          if (type === 'text') {
            msgContent = { text: message };
          } else if (type === 'image') {
            msgContent = { image: { url: message }, caption: req.body.caption || '' };
          } else if (type === 'audio') {
            msgContent = { audio: audioBuffer, mimetype: 'audio/ogg; codecs=opus', ptt: true };
          } else if (type === 'video') {
            msgContent = { video: { url: message }, caption: req.body.caption || '' };
          } else if (type === 'document') {
            msgContent = { document: { url: message }, mimetype: req.body.mimetype || 'application/octet-stream', fileName: req.body.fileName || 'document' };
          }
          if (msgContent) {
            instance.cacheSentMessage(result.key.id, msgContent);
          }
        }

        usedJid = jid;
        break;
      } catch (err) {
        logger.warn({ instanceId, to: jid, error: err?.message || String(err), type }, 'Falha ao enviar');
      }
    }

    if (!result || !usedJid) {
      return res.status(500).json({
        success: false,
        error: 'Falha ao enviar mensagem para o destinatário',
      });
    }

    logger.info({ instanceId, to: usedJid, type, originalTo: to }, 'Mensagem enviada');

    // ====== PROACTIVE LID CAPTURE (legacy route) ======
    let resolvedLid = null;
    if (usedJid && usedJid.endsWith('@s.whatsapp.net') && instance.sock) {
      try {
        const phoneForLookup = usedJid.split('@')[0];
        const lookupPromise = instance.sock.onWhatsApp(usedJid);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
        const [lookupResult] = await Promise.race([lookupPromise, timeoutPromise]);
        
        if (lookupResult?.jid && lookupResult.jid.endsWith('@lid')) {
          resolvedLid = lookupResult.jid;
          const canonicalLid = normalizeLidCanonical(resolvedLid);
          instance.lidMap.set(resolvedLid, { phone: phoneForLookup, name: null });
          if (canonicalLid && canonicalLid !== resolvedLid) {
            instance.lidMap.set(canonicalLid, { phone: phoneForLookup, name: null });
          }
          logger.info({ instanceId, phone: phoneForLookup, resolvedLid, canonicalLid }, '🔑 [Legacy] LID capturado proativamente após envio');
        }
      } catch (lidErr) {
        logger.debug({ instanceId, usedJid, error: lidErr?.message }, '[Legacy] onWhatsApp pós-envio falhou (não-crítico)');
      }
    }

    res.json({ 
      success: true, 
      messageId: result.key.id,
      status: 'sent',
      usedJid: usedJid,
      originalTo: to,
      resolvedLid,
    });
  } catch (error) {
    logger.error({ instanceId, error: error.message }, 'Erro ao enviar mensagem');
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/check/:phone', async (req, res) => {
  if (!instances.has(DEFAULT_INSTANCE)) {
    return res.status(400).json({ success: false, error: 'WhatsApp não está conectado' });
  }
  
  const instance = instances.get(DEFAULT_INSTANCE);
  
  try {
    if (!instance.sock || instance.connectionStatus !== 'connected') {
      return res.status(400).json({ success: false, error: 'WhatsApp não está conectado' });
    }

    const jidToCheck = resolveCheckJid(req.params.phone);
    if (!jidToCheck) {
      return res.status(400).json({ success: false, error: 'Destino inválido para verificação' });
    }
    
    const [result] = await instance.sock.onWhatsApp(jidToCheck);

    res.json({
      success: true,
      exists: !!result?.exists,
      jid: result?.jid,
      checkedJid: jidToCheck
    });
  } catch (error) {
    logger.error({ phone: req.params.phone, error: error.message }, 'Erro ao verificar número');
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check with multi-instance info
app.get('/health', (req, res) => {
  const mem = process.memoryUsage();
  
  const instancesInfo = [];
  for (const [id, instance] of instances) {
    instancesInfo.push({
      instanceId: id,
      status: instance.connectionStatus,
      phone: instance.connectedPhone,
      hasQR: !!instance.qrCodeData,
      isStarting: instance.isStarting,
      lastEventAt: instance.lastEventAt,
      lastError: instance.lastConnectionError,
      reconnectAttempts: instance.reconnectAttempts,
    });
  }

  res.json({
    status: 'ok',
    uptime: process.uptime(),
    node: process.version,
    pid: process.pid,
    instances: {
      total: instances.size,
      max: MAX_INSTANCES,
      list: instancesInfo
    },
    memory: {
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      external: mem.external,
    },
  });
});

// ============= MIGRATE EXISTING SESSION =============
// Check if there's an existing session in the old location and migrate it
function migrateExistingSession() {
  const oldAuthFiles = ['creds.json', 'app-state-sync-key'];
  const hasOldSession = oldAuthFiles.some(file => 
    fs.existsSync(path.join(AUTH_DIR, file))
  );
  
  if (hasOldSession) {
    const defaultDir = getInstanceAuthDir(DEFAULT_INSTANCE);
    
    // Create default instance directory
    if (!fs.existsSync(defaultDir)) {
      fs.mkdirSync(defaultDir, { recursive: true });
    }
    
    // Move files to default instance
    const files = fs.readdirSync(AUTH_DIR);
    for (const file of files) {
      const sourcePath = path.join(AUTH_DIR, file);
      const destPath = path.join(defaultDir, file);
      
      // Skip if it's a directory (instance folders)
      const stat = fs.statSync(sourcePath);
      if (stat.isDirectory()) continue;
      
      // Move file
      try {
        fs.renameSync(sourcePath, destPath);
        logger.info({ file }, 'Arquivo de sessão migrado para instância default');
      } catch (err) {
        logger.warn({ file, error: err.message }, 'Falha ao migrar arquivo');
      }
    }
    
    logger.info('Sessão antiga migrada para instância default');
  }
}

// Migrate on startup
migrateExistingSession();

// ====== ENDPOINT DE TESTE DE ÁUDIO ======
app.get('/test-audio-send/:phone', async (req, res) => {
  const { phone } = req.params;
  const instanceId = req.query.instanceId || DEFAULT_INSTANCE;
  
  const instance = instances.get(instanceId);
  if (!instance?.sock) {
    return res.status(400).json({ success: false, error: 'Instância não conectada', instanceId });
  }

  try {
    // Gerar um buffer OGG mínimo de silêncio (1 segundo)
    // Na prática, vamos usar um buffer vazio pequeno para teste
    const testBuffer = Buffer.alloc(1024, 0); // 1KB de silêncio
    
    const jid = phone.includes('@') ? phone : `${phone.replace(/\D/g, '')}@s.whatsapp.net`;
    
    logger.info({ instanceId, jid, bufferSize: testBuffer.length }, '[TEST] Enviando áudio de teste...');
    
    const result = await instance.sock.sendMessage(jid, {
      audio: testBuffer,
      mimetype: 'audio/ogg; codecs=opus',
      ptt: true,
    });
    
    logger.info({ instanceId, jid, messageId: result?.key?.id }, '[TEST] Áudio de teste enviado com sucesso');
    
    res.json({ 
      success: true, 
      message: 'Áudio de teste enviado',
      jid,
      messageId: result?.key?.id 
    });
  } catch (err) {
    logger.error({ instanceId, phone, error: err.message, stack: err.stack }, '[TEST] Falha ao enviar áudio de teste');
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============= PROCESS ERROR HANDLERS =============
// Prevent the process from crashing on unhandled errors
process.on('uncaughtException', (err) => {
  logger.error({ error: err.message, stack: err.stack }, 'UNCAUGHT EXCEPTION - processo NÃO será encerrado');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason: reason?.message || reason, stack: reason?.stack }, 'UNHANDLED REJECTION - processo NÃO será encerrado');
});

// ============= AUTO-RECOVERY TIMER =============
// Every 60s, check if any instance has been in 'error' state for 5+ minutes and auto-retry
setInterval(() => {
  for (const [instanceId, instance] of instances) {
    if (
      instance.connectionStatus === 'error' && 
      instance.errorSince && 
      !instance.isLoggedOut &&
      (Date.now() - instance.errorSince) >= AUTO_RECOVERY_INTERVAL_MS
    ) {
      logger.info({ instanceId, errorDurationMs: Date.now() - instance.errorSince }, 'Auto-recovery: tentando reconectar instância em estado de erro');
      instance.reconnectAttempts = 0;
      instance.errorSince = null;
      instance.connectionStatus = 'disconnected';
      startWhatsApp(instanceId).catch(err => {
        logger.error({ instanceId, error: err.message }, 'Auto-recovery: falha ao reconectar');
        instance.connectionStatus = 'error';
        instance.errorSince = Date.now();
      });
    }
  }
}, 60000);

// Iniciar servidor
app.listen(PORT, () => {
  logger.info({ port: PORT, webhook: WEBHOOK_URL, maxInstances: MAX_INSTANCES }, '=== BAILEYS MULTI-INSTANCE SERVER PRONTO ===');
});
