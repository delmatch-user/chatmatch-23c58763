import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface RobotConfig {
  name: string;
  intelligence: string;
  tone: string;
  maxTokens: number;
  instructions: string;
  qaPairs: { question: string; answer: string }[];
  finalizationMessage: string;
  tools: {
    transferToAgents: boolean;
    transferToAgentsMode: string;
    transferToAgentIds: string[];
    transferToDepartments: boolean;
    transferToDepartmentsMode: string;
    askHumanAgents: boolean;
    followUp: boolean;
    groupMessages: boolean;
    groupMessagesTime: number;
    webSearch: boolean;
    closeConversations: boolean;
    scheduleMessages: boolean;
    readImages: boolean;
    sendAgentName: boolean;
    manageLabels: boolean;
    editContact: boolean;
    typingIndicator: boolean;
    splitByLineBreak: boolean;
    canFinalize?: boolean;
  };
}

function extractMediaUrl(content: string, expectedType?: string): string | null {
  if (!content) return null;
  if (content.startsWith('http')) return content;
  if (content.startsWith('meta_media:')) return content;
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const item = expectedType
        ? parsed.find((p: any) => p.url && p.type?.startsWith(expectedType))
        : parsed[0];
      return item?.url || null;
    }
  } catch { /* not JSON */ }
  return null;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function resolveImageToDataUrl(url: string): Promise<string | null> {
  try {
    let fetchUrl = url;

    if (url.startsWith('meta_media:')) {
      const mediaId = url.replace('meta_media:', '');
      console.log('[Robot-Chat] Resolvendo meta_media:', mediaId);
      const proxyRes = await fetch(`${supabaseUrl}/functions/v1/meta-media-proxy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ mediaId })
      });
      if (!proxyRes.ok) {
        console.error('[Robot-Chat] meta-media-proxy falhou:', proxyRes.status);
        return null;
      }
      const proxyData = await proxyRes.json();
      fetchUrl = proxyData?.url;
      if (!fetchUrl) return null;
    }

    console.log('[Robot-Chat] Baixando imagem para base64:', fetchUrl.substring(0, 80));
    const imgRes = await fetch(fetchUrl);
    if (!imgRes.ok) {
      console.error('[Robot-Chat] Erro ao baixar imagem:', imgRes.status);
      return null;
    }
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const buffer = await imgRes.arrayBuffer();
    const base64 = uint8ArrayToBase64(new Uint8Array(buffer));
    const mimeType = contentType.split(';')[0];
    return `data:${mimeType};base64,${base64}`;
  } catch (err) {
    console.error('[Robot-Chat] Erro ao resolver imagem para base64:', err);
    return null;
  }
}

async function transcribeAudioUrl(audioUrl: string): Promise<string | null> {
  try {
    console.log('[Robot-Chat] Transcrevendo áudio:', audioUrl.substring(0, 80));
    const response = await fetch(`${supabaseUrl}/functions/v1/transcribe-audio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({ audioUrl })
    });
    if (!response.ok) {
      console.error('[Robot-Chat] Erro na transcrição:', response.status);
      return null;
    }
    const data = await response.json();
    return data?.transcription || null;
  } catch (err) {
    console.error('[Robot-Chat] Erro ao transcrever:', err);
    return null;
  }
}

function getModelFromIntelligence(intelligence: string): string {
  switch (intelligence) {
    case 'novato':
      return 'gemini-2.5-flash-lite';
    case 'flash':
      return 'gemini-2.5-flash';
    case 'pro':
      return 'gemini-2.5-pro';
    case 'maestro':
      return 'gpt-4o';
    case 'cerebro':
      return 'openai/gpt-5.2';
    default:
      return 'gemini-2.5-flash-lite';
  }
}

function isGeminiModel(intelligence: string): boolean {
  return ['novato', 'flash', 'pro'].includes(intelligence);
}

function isClaudeModel(intelligence: string): boolean {
  return false; // Cerebro now uses Lovable AI, not Claude
}

function getApiConfig(intelligence: string): { apiUrl: string; apiKey: string; providerName: string; isAnthropic?: boolean } {
  if (isGeminiModel(intelligence)) {
    const apiKey = Deno.env.get("GOOGLE_GEMINI_API_KEY") || '';
    return {
      apiUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      apiKey,
      providerName: 'Google Gemini'
    };
  } else if (intelligence === 'cerebro') {
    const apiKey = Deno.env.get("LOVABLE_API_KEY") || '';
    return {
      apiUrl: "https://ai.gateway.lovable.dev/v1/chat/completions",
      apiKey,
      providerName: 'Lovable AI (GPT-5.2)'
    };
  } else {
    const apiKey = Deno.env.get("OPENAI_API_KEY") || '';
    return {
      apiUrl: "https://api.openai.com/v1/chat/completions",
      apiKey,
      providerName: 'OpenAI'
    };
  }
}

// Convert OpenAI-format request to Anthropic format
function convertToAnthropicRequest(openaiBody: any): any {
  const messages = openaiBody.messages || [];
  // Extract system messages
  const systemParts: string[] = [];
  const userMessages: any[] = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemParts.push(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content));
    } else {
      userMessages.push({ role: msg.role, content: msg.content });
    }
  }

  // Ensure messages alternate user/assistant; merge consecutive same-role
  // Normalize all content to string for Anthropic compatibility
  const merged: any[] = [];
  for (const msg of userMessages) {
    const contentStr = typeof msg.content === 'string' ? msg.content
      : Array.isArray(msg.content) ? msg.content.map((c: any) => c.text || c.type || '').filter(Boolean).join('\n') || '...'
      : JSON.stringify(msg.content);
    if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
      merged[merged.length - 1].content += '\n' + contentStr;
    } else {
      merged.push({ role: msg.role, content: contentStr });
    }
  }
  // Anthropic requires first message to be user
  if (merged.length === 0 || merged[0].role !== 'user') {
    merged.unshift({ role: 'user', content: '...' });
  }

  const anthropicBody: any = {
    model: openaiBody.model,
    max_tokens: openaiBody.max_tokens || 1000,
    messages: merged,
  };
  if (systemParts.length > 0) {
    anthropicBody.system = systemParts.join('\n\n');
  }
  if (openaiBody.temperature !== undefined) {
    anthropicBody.temperature = openaiBody.temperature;
  }
  // Convert OpenAI tools to Anthropic tools
  if (openaiBody.tools?.length > 0) {
    anthropicBody.tools = openaiBody.tools.map((t: any) => ({
      name: t.function.name,
      description: t.function.description || '',
      input_schema: t.function.parameters || { type: 'object', properties: {} },
    }));
  }
  return anthropicBody;
}

// Convert Anthropic response to OpenAI-like format
function convertAnthropicResponse(anthropicData: any): any {
  const content = anthropicData.content || [];
  let textContent = '';
  const toolCalls: any[] = [];
  
  for (const block of content) {
    if (block.type === 'text') {
      textContent += block.text;
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input),
        },
      });
    }
  }

  return {
    choices: [{
      message: {
        role: 'assistant',
        content: textContent || null,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      },
      finish_reason: anthropicData.stop_reason === 'tool_use' ? 'tool_calls' : 'stop',
    }],
    usage: anthropicData.usage ? {
      prompt_tokens: anthropicData.usage.input_tokens,
      completion_tokens: anthropicData.usage.output_tokens,
      total_tokens: (anthropicData.usage.input_tokens || 0) + (anthropicData.usage.output_tokens || 0),
    } : undefined,
  };
}

// Unified AI fetch that handles both OpenAI-compatible and Anthropic APIs
async function fetchAI(apiUrl: string, apiKey: string, body: any, isAnthropic?: boolean): Promise<Response> {
  if (isAnthropic) {
    const anthropicBody = convertToAnthropicRequest(body);
    return fetch(apiUrl, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(anthropicBody),
    });
  }
  return fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

// Parse AI response handling both formats
async function parseAIResponse(response: Response, isAnthropic?: boolean): Promise<any> {
  const data = await response.json();
  if (isAnthropic) {
    return convertAnthropicResponse(data);
  }
  return data;
}

async function buildMessageHistory(messages: any[], readImages: boolean, logPrefix = '[Robot-Chat]'): Promise<any[]> {
  const history: any[] = [];
  const totalMessages = messages.length;
  // Only resolve media (download images, transcribe audio) for the last 3 messages to avoid slowness
  const MEDIA_RESOLVE_WINDOW = 3;

  for (let i = 0; i < totalMessages; i++) {
    const msg = messages[i];
    const isRobotMessage = msg.sender_name?.includes('[ROBOT]') || msg.sender_name?.includes('(IA)');
    const isAgentMessage = msg.sender_id !== null;
    const role = (isRobotMessage || isAgentMessage) ? 'assistant' as const : 'user' as const;
    const isRecent = i >= totalMessages - MEDIA_RESOLVE_WINDOW;

    // Handle image messages
    if (msg.message_type === 'image' && msg.content) {
      if (readImages && isRecent) {
        const imageUrl = extractMediaUrl(msg.content, 'image');
        if (imageUrl) {
          const dataUrl = await resolveImageToDataUrl(imageUrl);
          if (dataUrl) {
            history.push({
              role,
              content: [
                { type: "image_url" as const, image_url: { url: dataUrl } },
                { type: "text" as const, text: "O cliente enviou esta imagem. Analise e responda." }
              ]
            });
            continue;
          }
        }
      }
      history.push({ role, content: '[Imagem recebida]' });
      continue;
    }

    // Handle audio messages
    if (msg.message_type === 'audio') {
      if (isRecent) {
        const audioUrl = extractMediaUrl(msg.content, 'audio');
        if (audioUrl) {
          const transcription = await transcribeAudioUrl(audioUrl);
          history.push({ role, content: transcription ? `[Áudio transcrito]: ${transcription}` : '[Áudio recebido - não foi possível transcrever]' });
        } else if (msg.content && !msg.content.startsWith('[') && !msg.content.startsWith('{')) {
          history.push({ role, content: `[Áudio transcrito]: ${msg.content}` });
        } else {
          history.push({ role, content: '[Áudio recebido]' });
        }
      } else {
        // Older audio — just placeholder
        if (msg.content && !msg.content.startsWith('[') && !msg.content.startsWith('{') && !msg.content.startsWith('http') && !msg.content.startsWith('meta_media:')) {
          history.push({ role, content: `[Áudio transcrito]: ${msg.content}` });
        } else {
          history.push({ role, content: '[Áudio recebido]' });
        }
      }
      continue;
    }

    // Handle video messages
    if (msg.message_type === 'video' && msg.content) {
      history.push({ role, content: '[Vídeo recebido]' });
      continue;
    }

    history.push({
      role,
      content: msg.message_type === 'text' || msg.message_type === 'system' ? msg.content : `[Mídia recebida: ${msg.message_type}]`
    });
  }
  return history;
}

function getTemperatureFromTone(tone: string): number {
  switch (tone) {
    case 'muito_criativo':
      return 1.0;
    case 'criativo':
      return 0.8;
    case 'equilibrado':
      return 0.5;
    case 'preciso':
      return 0.3;
    case 'muito_preciso':
      return 0.1;
    default:
      return 0.5;
  }
}

function buildSystemPrompt(config: RobotConfig, availableDepartments?: { id: string; name: string }[], referenceLinks?: { title: string; url: string; content?: string }[], availableRobots?: { id: string; name: string; description: string }[]): string {
  let prompt = `Você é ${config.name}, um assistente virtual inteligente.\n\n`;
  
  if (config.instructions) {
    prompt += `## Instruções do Agente\n${config.instructions}\n\n`;
  }
  
  if (config.qaPairs && config.qaPairs.length > 0) {
    prompt += `## Base de Conhecimento - Perguntas e Respostas\nUse estas informações para responder perguntas relacionadas:\n\n`;
    config.qaPairs.forEach((qa, index) => {
      if (qa.question && qa.answer) {
        prompt += `**Pergunta ${index + 1}:** ${qa.question}\n**Resposta:** ${qa.answer}\n\n`;
      }
    });
  }

  // Reference Links - Base de conhecimento adicional
  const linkRefs = (referenceLinks || []).filter((link: any) => !link.type || link.type === 'link');
  const fileRefs = (referenceLinks || []).filter((link: any) => link.type === 'file');

  if (linkRefs.length > 0) {
    prompt += `## Links de Referência\nUse estes links como fonte adicional de informação ao responder perguntas:\n\n`;
    linkRefs.forEach((link: any) => {
      if (link.title && link.url) {
        prompt += `- **${link.title}**: ${link.url}\n`;
        if (link.content) {
          prompt += `  Conteúdo: ${link.content}\n`;
        }
      }
    });
    prompt += `\n`;
  }

  if (fileRefs.length > 0) {
    prompt += `## Base de Consulta - Documentos\nUse o conteúdo destes documentos como base de conhecimento para suas respostas:\n\n`;
    fileRefs.forEach((link: any) => {
      if (link.fileContent) {
        prompt += `### Documento: ${link.fileName || link.title}\n${link.fileContent}\n\n`;
      }
    });
  }
  
  prompt += `## Ferramentas Disponíveis\n`;
  prompt += `Você tem acesso a ferramentas (function calling) para executar ações:\n`;
  
  if (config.tools.transferToAgents) {
    prompt += `- **transfer_to_human**: Use quando o cliente pedir para falar com um atendente humano ou quando não conseguir resolver a solicitação.\n`;
  }
  if (config.tools.transferToDepartments) {
    prompt += `- **transfer_to_department**: Use quando o assunto for de outro departamento ou quando o cliente solicitar.\n`;
    if (availableDepartments && availableDepartments.length > 0) {
      prompt += `  Departamentos disponíveis: ${availableDepartments.map(d => d.name).join(', ')}\n`;
    }
  }
  if (availableRobots && availableRobots.length > 0) {
    prompt += `- **transfer_to_robot**: Use para transferir a conversa para outro agente especialista.\n`;
    prompt += `  **IMPORTANTE**: Ao transferir, o campo "reason" DEVE conter um RESUMO COMPLETO DA TRIAGEM, incluindo: (1) o que o cliente deseja/precisa, (2) informações já coletadas (nome, cidade, tipo de problema, etc.), (3) contexto relevante da conversa. Isso é essencial para que o agente especialista dê continuidade sem repetir perguntas.\n`;
    prompt += `  Agentes disponíveis:\n`;
    availableRobots.forEach(r => {
      prompt += `    - **${r.name}**: ${r.description || 'Sem descrição'}\n`;
    });
  }
  if (config.tools.manageLabels) {
    prompt += `- **manage_labels**: Use para adicionar ou remover etiquetas/tags na conversa quando apropriado.\n`;
  }
  if (config.tools.editContact) {
    prompt += `- **edit_contact**: Use para atualizar informações do contato (nome, email, notas) quando o cliente fornecer esses dados.\n`;
  }
  if ((config.tools as any).canFinalize) {
    prompt += `- **finalize_conversation**: Use quando identificar que o atendimento foi concluído. Sinais de encerramento incluem:
  • Cliente agradece: "obrigado", "valeu", "agradeço", "thanks"
  • Cliente confirma resolução: "já resolvi", "resolvido", "deu certo", "consegui", "era isso", "tá bom"
  • Cliente se despede: "tchau", "até mais", "falou", "abraço"
  • Você resolveu o problema e o cliente não tem mais dúvidas
  NÃO finalize se o cliente ainda tem perguntas pendentes ou se a conversa está no meio de uma resolução ativa.
  Ao finalizar, envie uma mensagem de despedida cordial antes.\n`;
  }
  
  prompt += `- Seja cordial e profissional em todas as interações.\n`;
  prompt += `- Responda de forma clara e objetiva.\n`;
  prompt += `- Mantenha respostas concisas e diretas.\n`;
  prompt += `- Use as ferramentas disponíveis para executar ações quando necessário - não apenas sugira, execute!\n`;
  prompt += `- **REGRA CRÍTICA**: Responda SOMENTE com base nas informações presentes na sua Base de Conhecimento (Instruções, Perguntas e Respostas, Links de Referência e Documentos acima). Se a pergunta do cliente não puder ser respondida com as informações disponíveis na sua base, informe educadamente que não possui essa informação e ofereça transferir para um atendente humano. NUNCA invente, suponha ou alucine informações que não estejam explicitamente na sua base de conhecimento.\n`;
  prompt += `- **REGRA DE APRENDIZADO**: Quando uma pergunta NÃO puder ser respondida com a base de conhecimento, inclua no campo "handoff_summary" (ao transferir) o texto: [NOVO_CONHECIMENTO_NECESSARIO] - seguido da pergunta original do cliente. Isso nos ajuda a atualizar a base.\n`;

  prompt += `\n## Proteção contra Loop\n`;
  prompt += `- Se o cliente não fornecer os dados necessários (cidade, nome, etc.) após 2 tentativas de solicitação, peça desculpas e transfira automaticamente para um atendente humano.\n`;
  prompt += `- Nunca repita a mesma pergunta mais de 2 vezes.\n`;

  prompt += `\n## Blindagem de Acidentes\n`;
  prompt += `- Se o cliente mencionar acidente, batida, colisão, emergência médica ou qualquer situação de risco físico: NÃO tente dar tutorial ou resolver. Apenas acalme o parceiro com empatia e transfira IMEDIATAMENTE para um humano com a tag "Acidente - Urgente".\n`;

  prompt += `\n## Taxonomia de Prioridade (Tags)\n`;
  prompt += `Ao transferir para humano, SEMPRE classifique o atendimento com UMA das tags abaixo no campo "taxonomy_tag":\n`;
  prompt += `- Acidente - Urgente – Acidentes, emergências, risco físico. Fura fila.\n`;
  prompt += `- Financeiro - Normal – Repasses, saques, questões financeiras.\n`;
  prompt += `- Duvida - Geral – Perguntas simples, dúvidas gerais, problemas operacionais, bugs no app.\n`;
  prompt += `- Comercial - B2B – Exclusivo para donos de lojas, gerentes, questões B2B.\n`;

  prompt += `\n## Procedimento de Pedidos Duplicados\n`;
  prompt += `- Nossa plataforma é receptora/passiva. Se houver pedidos duplicados, explique que apenas recebemos os dados da origem (iFood/Saipos/etc). O erro de duplicidade é da plataforma de origem.\n`;

  if (availableRobots && availableRobots.length > 0) {
    prompt += `\n## Regras de Triagem Contextual\n`;
    prompt += `- **LEIA ATENTAMENTE** todas as mensagens do cliente antes de responder.\n`;
    prompt += `- Se o cliente já descreveu seu assunto ou problema na mensagem, NÃO pergunte novamente o que ele precisa. Use a informação já fornecida para classificar e transferir IMEDIATAMENTE para o agente especialista adequado.\n`;
    prompt += `- Pergunte "como posso ajudar?" ou "qual o assunto?" SOMENTE se o cliente enviou apenas uma saudação genérica (ex: "oi", "olá", "bom dia") sem mencionar nenhum assunto.\n`;
    prompt += `- Ao transferir, inclua no campo "reason" TUDO que o cliente já informou, para que o especialista não repita perguntas.\n`;
  }
  
  if (config.tools.sendAgentName) {
    prompt += `- Sempre inicie suas mensagens identificando-se como ${config.name}. Nunca mencione que você é uma IA, assistente virtual ou robô.\n`;
  }

  if (config.tools.readImages) {
    prompt += `- Quando receber uma imagem, analise-a e responda com base no conteúdo visual.\n`;
  }
  
  if (config.finalizationMessage) {
    prompt += `\n## Mensagem de Finalização\nQuando encerrar uma conversa, use esta mensagem: "${config.finalizationMessage}"\n`;
  }
  
  return prompt;
}

// Definir ferramentas para OpenAI Function Calling
function buildOpenAITools(config: RobotConfig, availableDepartments?: { id: string; name: string }[], availableRobots?: { id: string; name: string }[]): any[] {
  const tools: any[] = [];
  
  if (config.tools.transferToDepartments && availableDepartments && availableDepartments.length > 0) {
    tools.push({
      type: "function",
      function: {
        name: "transfer_to_department",
        description: "Transferir a conversa para outro departamento quando o assunto não for da sua área ou quando o cliente solicitar",
        parameters: {
          type: "object",
          properties: {
            department_name: {
              type: "string",
              description: `Nome do departamento de destino. Opções: ${availableDepartments.map(d => d.name).join(', ')}`,
              enum: availableDepartments.map(d => d.name)
            },
            reason: {
              type: "string",
              description: "Motivo da transferência"
            },
            message_to_client: {
              type: "string",
              description: "Mensagem para informar o cliente sobre a transferência"
            }
          },
          required: ["department_name", "reason", "message_to_client"]
        }
      }
    });
  }
  
  if (config.tools.transferToAgents) {
    tools.push({
      type: "function",
      function: {
        name: "transfer_to_human",
        description: "Transferir para um atendente humano quando o cliente solicitar ou quando a questão for muito complexa para resolver",
        parameters: {
          type: "object",
          properties: {
            reason: {
              type: "string",
              description: "Motivo da transferência para atendente humano"
            },
            message_to_client: {
              type: "string",
              description: "Mensagem para informar o cliente que será transferido"
            },
            handoff_summary: {
              type: "string",
              description: "Resumo invisível para o atendente. Inclua: quem é o cliente, o problema, dados coletados e contexto relevante. Se a dúvida não estava na base de conhecimento, inclua: [NOVO_CONHECIMENTO_NECESSARIO] - pergunta original"
            },
            taxonomy_tag: {
              type: "string",
              description: "Tag de prioridade para classificar o atendimento",
              enum: [
                "Acidente - Urgente",
                "Financeiro - Normal",
                "Duvida - Geral",
                "Comercial - B2B"
              ]
            }
          },
          required: ["reason", "message_to_client", "handoff_summary", "taxonomy_tag"]
        }
      }
    });
  }

  // transfer_to_robot tool
  if (availableRobots && availableRobots.length > 0) {
    tools.push({
      type: "function",
      function: {
        name: "transfer_to_robot",
        description: "Transferir a conversa para outro agente especialista quando o assunto for da área dele",
        parameters: {
          type: "object",
          properties: {
            robot_name: {
              type: "string",
              description: `Nome do agente de destino. Opções: ${availableRobots.map(r => r.name).join(', ')}`,
              enum: availableRobots.map(r => r.name)
            },
            reason: {
              type: "string",
              description: "OBRIGATÓRIO: Resumo detalhado da triagem/conversa até o momento. Inclua: o que o cliente quer, dados já coletados (nome, cidade, tipo de problema, etc.) e a necessidade específica."
            },
            message_to_client: {
              type: "string",
              description: "Mensagem para informar o cliente sobre a transferência"
            },
            handoff_summary: {
              type: "string",
              description: "Resumo invisível para o agente de destino. Inclua: quem é o cliente, o problema, dados coletados e contexto. Se a dúvida não estava na base, inclua: [NOVO_CONHECIMENTO_NECESSARIO] - pergunta"
            }
          },
          required: ["robot_name", "reason", "message_to_client"]
        }
      }
    });
  }

  if (config.tools.manageLabels) {
    tools.push({
      type: "function",
      function: {
        name: "manage_labels",
        description: "Adicionar ou remover etiquetas/tags na conversa atual para categorização",
        parameters: {
          type: "object",
          properties: {
            action: {
              type: "string",
              description: "Ação a realizar: 'add' para adicionar ou 'remove' para remover",
              enum: ["add", "remove"]
            },
            label: {
              type: "string",
              description: "Nome da etiqueta/tag"
            }
          },
          required: ["action", "label"]
        }
      }
    });
  }

  if (config.tools.editContact) {
    tools.push({
      type: "function",
      function: {
        name: "edit_contact",
        description: "Atualizar informações do contato quando o cliente fornecer dados como nome, email ou observações",
        parameters: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Novo nome do contato (opcional)"
            },
            email: {
              type: "string",
              description: "Email do contato (opcional)"
            },
            notes: {
              type: "string",
              description: "Observações adicionais sobre o contato (opcional)"
            }
          }
        }
      }
    });
  }

  if ((config.tools as any).canFinalize) {
    tools.push({
      type: "function",
      function: {
        name: "finalize_conversation",
        description: "Finalizar o atendimento quando o cliente demonstrar que o assunto foi resolvido. Sinais: agradecimentos (obrigado, valeu), confirmações (resolvido, deu certo, era isso, tá bom), despedidas (tchau, até mais, falou). NÃO use se o cliente ainda tem perguntas pendentes.",
        parameters: {
          type: "object",
          properties: {
            farewell_message: {
              type: "string",
              description: "Mensagem de despedida cordial para enviar ao cliente antes de encerrar"
            },
            resolution_summary: {
              type: "string",
              description: "Resumo breve do que foi resolvido neste atendimento"
            },
            taxonomy_tag: {
              type: "string",
              description: "Tag de classificação do atendimento baseada no assunto da conversa",
              enum: ["Acidente - Urgente", "Financeiro - Normal", "Duvida - Geral", "Comercial - B2B"]
            }
          },
          required: ["farewell_message", "resolution_summary", "taxonomy_tag"]
        }
      }
    });
  }

  return tools;
}

// Enviar mensagem via Machine
async function sendViaMachine(
  conversationId: string,
  message: string,
  senderName: string
): Promise<boolean> {
  try {
    console.log('[Robot-Chat] Enviando via Machine para conversa:', conversationId);
    
    const response = await fetch(`${supabaseUrl}/functions/v1/machine-send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({
        conversationId,
        message,
        senderName
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Robot-Chat] Erro Machine send:', errorText);
      return false;
    }
    
    console.log('[Robot-Chat] Mensagem enviada via Machine');
    return true;
  } catch (error) {
    console.error('[Robot-Chat] Erro ao enviar via Machine:', error);
    return false;
  }
}

// Enviar mensagem via Meta API
async function sendViaMetaApi(
  phoneNumberId: string,
  toPhone: string,
  message: string
): Promise<boolean> {
  try {
    console.log('[Robot-Chat] Enviando via Meta API para:', toPhone);
    
    const response = await fetch(`${supabaseUrl}/functions/v1/meta-whatsapp-send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({
        phone_number_id: phoneNumberId,
        to: toPhone,
        message: message,
        type: 'text'
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Robot-Chat] Erro Meta API:', errorText);
      return false;
    }
    
    console.log('[Robot-Chat] Mensagem enviada via Meta API');
    return true;
  } catch (error) {
    console.error('[Robot-Chat] Erro ao enviar via Meta API:', error);
    return false;
  }
}

// Enviar mensagem via Baileys
async function sendViaBaileys(
  contactPhone: string,
  contactJid: string | undefined,
  message: string,
  instanceId?: string
): Promise<boolean> {
  try {
    // Priorizar contactJid como destino quando é LID, pois o servidor Baileys
    // só lê o campo 'to' e o buildJidCandidates resolve melhor LIDs com @lid
    const destination = (contactJid && contactJid.includes('@lid')) ? contactJid : contactPhone;
    console.log('[Robot-Chat] Enviando via Baileys para:', destination, '(phone:', contactPhone, 'jid:', contactJid, ') instanceId:', instanceId || 'default');
    
    const response = await fetch(`${supabaseUrl}/functions/v1/baileys-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({
        action: 'send',
        to: destination,
        jid: contactJid,
        message: message,
        type: 'text',
        instanceId: instanceId
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Robot-Chat] Erro Baileys:', errorText);
      return false;
    }
    
    console.log('[Robot-Chat] Mensagem enviada via Baileys');
    return true;
  } catch (error) {
    console.error('[Robot-Chat] Erro ao enviar via Baileys:', error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    
    // Modo automático: chamado pelo webhook com robotId e conversationId
    if (body.robotId && body.conversationId) {
      return await handleAutomaticMode(body);
    }
    
    // Modo streaming: chamado pelo frontend para teste
    return await handleStreamingMode(body, req);
  } catch (error) {
    console.error("robot-chat error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Modo automático - processamento de mensagens do webhook
async function handleAutomaticMode(body: {
  robotId: string;
  conversationId: string;
  message: string;
  contactPhone?: string;
  contactJid?: string;
  connectionType?: 'baileys' | 'meta_api';
  phoneNumberId?: string;
  isTransfer?: boolean;
}) {
  const { robotId, conversationId, message, isTransfer } = body;
  const isRetry = !!(body as any).isRetry;
  const skipAtomicLock = isTransfer || isRetry;
  let { contactPhone, contactJid, connectionType, phoneNumberId } = body;
  
  console.log(`[Robot-Chat Auto] Robot: ${robotId}, Conversation: ${conversationId}, ContactPhone: ${contactPhone || 'N/A'}, ContactJid: ${contactJid || 'N/A'}, ConnectionType: ${connectionType || 'auto-detect'}`);
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  // Buscar configuração do robô
  const { data: robot, error: robotError } = await supabase
    .from('robots')
    .select('*')
    .eq('id', robotId)
    .single();
  
  if (robotError || !robot) {
    console.error('[Robot-Chat Auto] Robô não encontrado:', robotError);
    return new Response(JSON.stringify({ error: 'Robô não encontrado' }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verificar se o robô está pausado (não ativo)
  if (robot.status === 'paused' && !isTransfer) {
    console.log(`[Robot-Chat Auto] Robô ${robot.name} está PAUSADO. Removendo atribuição e colocando na fila.`);
    await supabase.from('conversations').update({
      assigned_to_robot: null,
      status: 'em_fila'
    }).eq('id', conversationId);
    return new Response(JSON.stringify({ skipped: true, reason: 'robot_paused' }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verificar se o robô está dentro do horário configurado (pular se ativado manualmente ou transferência manual)
  const isManuallyActivated = robot.manually_activated === true;
  if (!isManuallyActivated && !isTransfer) {
    const { data: withinSchedule } = await supabase.rpc('is_robot_within_schedule', { robot_uuid: robotId });
    if (withinSchedule === false) {
      console.log(`[Robot-Chat Auto] Robô ${robot.name} fora do horário. Removendo atribuição.`);
      // Remover robô da conversa e colocar na fila
      await supabase.from('conversations').update({
        assigned_to_robot: null,
        status: 'em_fila'
      }).eq('id', conversationId);
      return new Response(JSON.stringify({ skipped: true, reason: 'robot_outside_schedule' }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } else {
    console.log(`[Robot-Chat Auto] Robô ${robot.name} ${isTransfer ? 'transferência manual' : 'ativado manualmente'} — ignorando verificação de horário.`);
  }
  
  // Buscar conversa para detectar canal, departamento e lock
  const { data: convData } = await supabase
    .from('conversations')
    .select('department_id, channel, robot_lock_until, sdr_deal_id, assigned_to, robot_transferred, assigned_to_robot')
    .eq('id', conversationId)
    .single();

  // === ROBOT_TRANSFERRED GUARD: Não processar se já foi transferido por robô (pular se transferência manual) ===
  if (convData?.robot_transferred === true && !isTransfer) {
    console.log(`[Robot-Chat Auto] Conversa ${conversationId} já foi transferida por robô. Ignorando.`);
    return new Response(JSON.stringify({ skipped: true, reason: 'robot_already_transferred' }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // === ROBOT OWNERSHIP GUARD: Não processar se a conversa pertence a outro robô ===
  if (convData?.assigned_to_robot && convData.assigned_to_robot !== robotId && !isTransfer) {
    console.log(`[Robot-Chat Auto] Conversa ${conversationId} pertence ao robô ${convData.assigned_to_robot}, não ao ${robotId}. Ignorando.`);
    return new Response(JSON.stringify({ skipped: true, reason: 'assigned_to_different_robot' }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // === RECENT OUTBOUND TRANSFER GUARD: Não processar se este robô já transferiu esta conversa recentemente ===
  const twoMinutesAgo = new Date(Date.now() - 120000).toISOString();
  const { data: recentOutboundTransfer } = await supabase
    .from('transfer_logs')
    .select('id')
    .eq('conversation_id', conversationId)
    .gte('created_at', twoMinutesAgo)
    .limit(1)
    .maybeSingle();

  if (recentOutboundTransfer && !isTransfer) {
    console.log(`[Robot-Chat Auto] Conversa ${conversationId} teve transferência recente. Robô ${robotId} não deve reassumir. Ignorando.`);
    return new Response(JSON.stringify({ skipped: true, reason: 'robot_recently_transferred_out' }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // === HUMAN AGENT GUARD: Não responder se já tem atendente humano ===
  if (convData?.assigned_to) {
    console.log(`[Robot-Chat Auto] Conversa ${conversationId} já tem atendente humano (${convData.assigned_to}). Ignorando.`);
    return new Response(JSON.stringify({ skipped: true, reason: 'human_agent_assigned' }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // === SDR GUARD: Conversas SDR são tratadas exclusivamente pelo sdr-robot-chat ===
  if (convData?.sdr_deal_id) {
    console.log(`[Robot-Chat] Conversa ${conversationId} é SDR (deal: ${convData.sdr_deal_id}). Ignorando — sdr-robot-chat é responsável.`);
    return new Response(JSON.stringify({ skipped: true, reason: 'sdr_deal_conversation' }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // === ATOMIC LOCK CLAIM: Evitar respostas duplicadas ===
  const immediateLockUntil = new Date(Date.now() + 30000).toISOString();
  const nowIso = new Date().toISOString();

  if (skipAtomicLock) {
    // Transferência ou retry do cron: setar lock diretamente sem competir
    await supabase
      .from('conversations')
      .update({ robot_lock_until: immediateLockUntil })
      .eq('id', conversationId);
    console.log(`[Robot-Chat Auto] ${isTransfer ? 'Transferência' : 'Retry do cron'} — lock setado diretamente (bypass atômico).`);
  } else {
    // Fluxo normal: lock atômico competitivo
    const { count: lockClaimed } = await supabase
      .from('conversations')
      .update({ robot_lock_until: immediateLockUntil }, { count: 'exact' })
      .eq('id', conversationId)
      .or(`robot_lock_until.is.null,robot_lock_until.lt.${nowIso}`);

    if (!lockClaimed || lockClaimed === 0) {
      console.log(`[Robot-Chat Auto] Lock atômico NÃO conquistado. Outro processo já está respondendo. Ignorando.`);
      return new Response(JSON.stringify({ skipped: true, reason: 'atomic_lock_not_acquired' }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log(`[Robot-Chat Auto] Lock atômico conquistado (30s) para evitar duplicação.`);
  }
  
  // Delay de 2s para garantir que chamadas concorrentes vejam o lock (pular em transferências/retries)
  if (!skipAtomicLock) {
    await new Promise(resolve => setTimeout(resolve, 2000));
  } else {
    console.log(`[Robot-Chat Auto] ${isTransfer ? 'Transferência' : 'Retry'} detectado — pulando delay anti-race de 2s.`);
  }
  
  // Re-verificar se a conversa ainda está atribuída a este robô após o delay
  const { data: convRecheck } = await supabase
    .from('conversations')
    .select('assigned_to_robot, assigned_to, status')
    .eq('id', conversationId)
    .single();
  
  if (!convRecheck || convRecheck.assigned_to_robot !== robotId || convRecheck.status === 'finalizada' || convRecheck.assigned_to) {
    console.log(`[Robot-Chat Auto] Conversa mudou durante delay inicial. Abortando.`);
    await supabase.from('conversations').update({ robot_lock_until: null }).eq('id', conversationId);
    return new Response(JSON.stringify({ skipped: true, reason: 'conversation_changed_during_delay' }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  
  // Detecção robusta do canal: verificar contact.notes como fallback
  // Também resolver contactPhone se estiver vazio
  let conversationChannel = convData?.channel || 'whatsapp';
  {
    // Buscar contato completo para fallback de canal e resolução de phone
    const { data: convForContact } = await supabase.from('conversations').select('contact_id').eq('id', conversationId).single();
    const contactIdForResolve = convForContact?.contact_id;
    
    if (contactIdForResolve) {
      const { data: contactData } = await supabase
        .from('contacts')
        .select('channel, notes, phone')
        .eq('id', contactIdForResolve)
        .maybeSingle();
      
      if (contactData?.channel === 'machine' || contactData?.notes?.startsWith('machine:')) {
        conversationChannel = 'machine';
        console.log('[Robot-Chat Auto] Canal corrigido para machine via fallback do contato');
      }
      
      // ====== RESOLVER contactPhone/contactJid QUANDO AUSENTES ======
      if (!contactPhone && conversationChannel !== 'machine') {
        // 1. Usar phone do contato
        if (contactData?.phone) {
          const phoneDigits = contactData.phone.replace(/\D/g, '');
          if (phoneDigits.length >= 10 && phoneDigits.length <= 13) {
            contactPhone = phoneDigits;
            console.log(`[Robot-Chat Auto] contactPhone resolvido via contact.phone: ${contactPhone}`);
          }
        }
        
        // 2. Extrair do JID nas notes
        if (!contactPhone && contactData?.notes) {
          const jidMatch = contactData.notes.match(/jid:(\d+)@s\.whatsapp\.net/);
          if (jidMatch) {
            contactPhone = jidMatch[1];
            console.log(`[Robot-Chat Auto] contactPhone resolvido via JID notes: ${contactPhone}`);
          }
        }
        
        // 3. Se é LID, tentar resolver via whatsapp_lid_map
        if (!contactPhone && contactData?.notes) {
          const lidMatch = contactData.notes.match(/jid:([^@\s]+@lid)/);
          if (lidMatch) {
            const lidJid = lidMatch[1];
            if (!contactJid) contactJid = lidJid;
            
            const { data: lidMap } = await supabase
              .from('whatsapp_lid_map')
              .select('phone_digits')
              .eq('lid_jid', lidJid)
              .maybeSingle();
            
            if (lidMap) {
              contactPhone = lidMap.phone_digits;
              console.log(`[Robot-Chat Auto] contactPhone resolvido via LID map: ${lidJid} → ${contactPhone}`);
            } else {
              // Busca canônica
              const lidBase = lidJid.split(':')[0];
              const { data: lidMapBase } = await supabase
                .from('whatsapp_lid_map')
                .select('phone_digits')
                .like('lid_jid', `${lidBase}:%`)
                .limit(1);
              
              if (lidMapBase && lidMapBase.length > 0) {
                contactPhone = lidMapBase[0].phone_digits;
                console.log(`[Robot-Chat Auto] contactPhone resolvido via LID map canônico: ${lidBase} → ${contactPhone}`);
              }
            }
          }
        }
        
        // 4. Último fallback: usar o JID completo como destino direto (Baileys pode resolver LIDs)
        if (!contactPhone && contactJid) {
          // Manter o JID completo (com @lid ou @s.whatsapp.net) para que o Baileys interprete corretamente
          contactPhone = contactJid;
          console.log(`[Robot-Chat Auto] contactPhone fallback para JID completo: ${contactPhone}`);
        }
      }
      
      // Resolver contactJid se ausente
      if (!contactJid && contactData?.notes) {
        const jidMatch = contactData.notes.match(/jid:([^@\s]+@(?:s\.whatsapp\.net|lid))/);
        if (jidMatch) {
          contactJid = jidMatch[1];
          console.log(`[Robot-Chat Auto] contactJid resolvido via notes: ${contactJid}`);
        }
      }
    }
  }
  
  // Se connectionType não foi fornecido e canal é whatsapp, detectar automaticamente
  if (!connectionType && conversationChannel !== 'machine') {
    console.log('[Robot-Chat Auto] Detectando tipo de conexão automaticamente...');
    
    if (convData?.department_id) {
      // Primeiro tentar Meta API
      const { data: metaConn } = await supabase
        .from('whatsapp_connections')
        .select('connection_type, phone_number_id')
        .eq('department_id', convData.department_id)
        .eq('connection_type', 'meta_api')
        .eq('status', 'connected')
        .maybeSingle();
      
      if (metaConn) {
        connectionType = 'meta_api';
        phoneNumberId = metaConn.phone_number_id;
        console.log('[Robot-Chat Auto] Detectado Meta API para departamento');
      } else {
        // Tentar Baileys
        const { data: baileysConn } = await supabase
          .from('whatsapp_connections')
          .select('connection_type, phone_number_id')
          .eq('department_id', convData.department_id)
          .eq('connection_type', 'baileys')
          .eq('status', 'connected')
          .maybeSingle();
        
        if (baileysConn) {
          connectionType = 'baileys';
          phoneNumberId = baileysConn.phone_number_id;
          console.log('[Robot-Chat Auto] Detectado Baileys para departamento, instanceId:', phoneNumberId);
        }
      }
    }
    
    // Fallback: tentar qualquer conexão ativa
    if (!connectionType) {
      const { data: anyConn } = await supabase
        .from('whatsapp_connections')
        .select('connection_type, phone_number_id')
        .eq('status', 'connected')
        .limit(1)
        .maybeSingle();
      
      if (anyConn) {
        connectionType = anyConn.connection_type as 'baileys' | 'meta_api';
        phoneNumberId = anyConn.phone_number_id;
        console.log(`[Robot-Chat Auto] Fallback para conexão: ${connectionType}`);
      }
    }
  }
  
  // Buscar histórico de mensagens da conversa
  const { data: messagesData } = await supabase
    .from('messages')
    .select('content, sender_id, sender_name, message_type, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(20); // Limitar histórico

  // Buscar motivo da transferência (se houver)
  const { data: lastTransfer } = await supabase
    .from('transfer_logs')
    .select('reason, from_user_name, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  // Converter mensagens para formato OpenAI
  // Identificar robôs pelo sender_name contendo "[ROBOT]" ou "(IA)" - não pelo sender_id
  const readImages = robot.tools?.readImages ?? true;
  const conversationHistory = await buildMessageHistory(messagesData || [], readImages);
  
  // Buscar departamentos disponíveis para transferência
  const { data: allDepts } = await supabase
    .from('departments')
    .select('id, name')
    .order('name');
  
  // Filtrar departamentos com base na config transferToDepartmentsMode
  const transferDeptMode = robot.tools?.transferToDepartmentsMode ?? 'all';
  const currentDeptId = convData?.department_id;
  const availableDepts = (allDepts || []).filter(d => {
    // Sempre excluir o departamento atual para evitar transferências circulares
    if (d.id === currentDeptId) return false;
    // Se modo 'select', limitar aos departamentos configurados no robô
    if (transferDeptMode === 'select') {
      const allowedIds = robot.tools?.transferToDepartmentIds || robot.departments || [];
      return allowedIds.includes(d.id);
    }
    return true;
  });
  
  // Construir config do robô
  const robotConfig: RobotConfig = {
    name: robot.name,
    intelligence: robot.intelligence,
    tone: robot.tone,
    maxTokens: robot.max_tokens,
    instructions: robot.instructions || '',
    qaPairs: (robot.qa_pairs as any[]) || [],
    finalizationMessage: robot.finalization_message || '',
    tools: {
      transferToAgents: robot.tools?.transferToAgents ?? true,
      transferToAgentsMode: robot.tools?.transferToAgentsMode ?? 'all',
      transferToDepartments: robot.tools?.transferToDepartments ?? true,
      transferToDepartmentsMode: robot.tools?.transferToDepartmentsMode ?? 'all',
      askHumanAgents: robot.tools?.askHumanAgents ?? true,
      followUp: robot.tools?.followUp ?? false,
      groupMessages: robot.tools?.groupMessages ?? true,
      groupMessagesTime: robot.tools?.groupMessagesTime ?? 40,
      webSearch: robot.tools?.webSearch ?? true,
      closeConversations: false,
      scheduleMessages: robot.tools?.scheduleMessages ?? true,
      readImages: robot.tools?.readImages ?? true,
      sendAgentName: robot.tools?.sendAgentName ?? true,
      manageLabels: robot.tools?.manageLabels ?? false,
      editContact: robot.tools?.editContact ?? false,
      typingIndicator: robot.tools?.typingIndicator ?? true,
      splitByLineBreak: robot.tools?.splitByLineBreak ?? false,
      canFinalize: robot.tools?.canFinalize ?? false,
    }
  };

  // === DETECTAR TRANSFERÊNCIA RECENTE ===
  const { data: recentTransfer } = await supabase
    .from('transfer_logs')
    .select('id, created_at')
    .eq('conversation_id', conversationId)
    .eq('to_robot_id', robotId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  const isFromTransfer = recentTransfer && (Date.now() - new Date(recentTransfer.created_at).getTime()) < 60000;
  const transferDelay = 3; // 3s para transferências (contexto já completo)

  // === SET LOCK + GROUP MESSAGES ===
  const groupMessages = robotConfig.tools.groupMessages;
  const groupMessagesTime = robotConfig.tools.groupMessagesTime || 20;
  
  // Triagem inteligente: se o cliente já enviou conteúdo substantivo, reduz delay pela metade
  let effectiveDelay: number;
  if (isFromTransfer) {
    effectiveDelay = transferDelay; // Não aplicar groupMessagesTime em transferências — contexto já completo
    console.log(`[Robot-Chat Auto] Transferência: delay reduzido para ${effectiveDelay}s (sem agrupamento).`);
  } else if (groupMessages) {
    // Verificar a última mensagem do cliente para decidir o delay
    const customerMessages = (messagesData || []).filter((m: any) => !m.sender_name?.startsWith('[ROBOT]') && !m.sender_name?.startsWith('[SISTEMA]') && m.sender_id === null);
    const lastCustomerMsg = customerMessages.length > 0 ? customerMessages[customerMessages.length - 1]?.content || '' : '';
    const isSubstantiveMessage = lastCustomerMsg.length > 15 || lastCustomerMsg.trim().split(/\s+/).length > 2;
    
    if (isSubstantiveMessage) {
      effectiveDelay = Math.max(5, Math.floor(groupMessagesTime / 2));
      console.log(`[Robot-Chat Auto] Triagem inteligente: mensagem substantiva detectada ("${lastCustomerMsg.substring(0, 50)}..."), delay reduzido para ${effectiveDelay}s`);
    } else {
      effectiveDelay = groupMessagesTime;
      console.log(`[Robot-Chat Auto] Mensagem curta detectada ("${lastCustomerMsg}"), aguardando ${effectiveDelay}s para mais contexto`);
    }
  } else {
    effectiveDelay = 3; // Sem agrupamento: 3s
  }
  
  const lockDuration = effectiveDelay; // seconds
  
  const lockUntil = new Date(Date.now() + lockDuration * 1000).toISOString();
  await supabase.from('conversations').update({ robot_lock_until: lockUntil }).eq('id', conversationId);
  console.log(`[Robot-Chat Auto] Lock setado por ${lockDuration}s até ${lockUntil}${isFromTransfer ? ' (transferência detectada)' : ''}`);

  // Aguardar delay (transferência ou agrupamento)
  if (effectiveDelay > 0) {
    const waitTime = effectiveDelay;
    console.log(`[Robot-Chat Auto] ${isFromTransfer ? 'Delay de transferência' : 'Agrupando mensagens'} por ${waitTime}s...`);
    await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
    
    // Verificar se a conversa ainda está atribuída a este robô (pode ter sido transferida)
    const { data: convCheck } = await supabase
      .from('conversations')
      .select('assigned_to_robot, assigned_to, status')
      .eq('id', conversationId)
      .single();
    
    if (!convCheck || convCheck.assigned_to_robot !== robotId || convCheck.status === 'finalizada' || convCheck.assigned_to) {
      console.log(`[Robot-Chat Auto] Conversa já não está com este robô. Abortando.`);
      await supabase.from('conversations').update({ robot_lock_until: null }).eq('id', conversationId);
      return new Response(JSON.stringify({ skipped: true, reason: 'conversation_changed' }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // Re-buscar mensagens após agrupamento (pega todas as mensagens acumuladas)
  if (groupMessages) {
    const { data: freshMessages } = await supabase
      .from('messages')
      .select('content, sender_id, sender_name, message_type, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(30);
    
    // Rebuild conversation history with fresh data
    const freshHistory = await buildMessageHistory(freshMessages || [], readImages);
    conversationHistory.length = 0;
    freshHistory.forEach(h => conversationHistory.push(h));
    console.log(`[Robot-Chat Auto] Histórico re-carregado com ${conversationHistory.length} mensagens após agrupamento`);
  }

  const { apiUrl, apiKey, providerName, isAnthropic } = getApiConfig(robotConfig.intelligence);
  
  if (!apiKey) {
    console.error(`[Robot-Chat Auto] API Key não configurada para ${providerName}`);
    return new Response(JSON.stringify({ error: `API Key não configurada para ${providerName}. Configure na página de Integrações de IA.` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  
  const model = getModelFromIntelligence(robotConfig.intelligence);
  const temperature = getTemperatureFromTone(robotConfig.tone);
  const referenceLinks = (robot.reference_links as any[]) || [];

  // Buscar robôs disponíveis para transferência
  // Inclui robôs ativos OU especialistas (auto_assign=false) independente do status
  const { data: otherRobots } = await supabase
    .from('robots')
    .select('id, name, description, auto_assign, status, departments, channels')
    .neq('id', robotId)
    .or('status.eq.active,auto_assign.eq.false');
  
  // Filtrar por transferToAgentIds se o modo for 'select'
  const transferToAgentIds = (robotConfig.tools as any).transferToAgentIds || [];
  const filteredRobots = robotConfig.tools.transferToAgentsMode === 'select' && transferToAgentIds.length > 0
    ? (otherRobots || []).filter(r => transferToAgentIds.includes(r.id))
    : (otherRobots || []);
  
  const availableRobotsForTransfer = filteredRobots.map(r => ({
    id: r.id,
    name: r.name,
    description: r.description || ''
  }));

  const systemPrompt = buildSystemPrompt(robotConfig, availableDepts || [], referenceLinks, availableRobotsForTransfer);
  const openaiTools = buildOpenAITools(robotConfig, availableDepts || [], availableRobotsForTransfer);
  
  console.log(`[Robot-Chat Auto] Provider: ${providerName}, Model: ${model}, Temperature: ${temperature}, Tools: ${openaiTools.length}`);
  
  // Preparar body da requisição
  const openaiBody: any = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      ...(lastTransfer?.reason ? [{
        role: "system",
        content: `## CONTEXTO DA TRANSFERÊNCIA — AÇÃO IMEDIATA OBRIGATÓRIA\nO atendente "${lastTransfer.from_user_name || 'Atendente'}" transferiu esta conversa para você com a seguinte instrução:\n"${lastTransfer.reason}"\n\nREGRAS:\n1. NÃO se apresente novamente nem cumprimente como novo atendimento\n2. Aja IMEDIATAMENTE com base no motivo acima — ele é sua prioridade número 1\n3. Continue a conversa naturalmente a partir do ponto onde o atendente parou\n4. Responda diretamente ao assunto da transferência`
      }] : []),
      ...conversationHistory,
    ],
    max_tokens: robotConfig.maxTokens || 500,
    temperature,
  };
  
  // Adicionar tools se disponíveis
  if (openaiTools.length > 0) {
    openaiBody.tools = openaiTools;
    openaiBody.tool_choice = "auto";
  }
  
  // Chamar API com retry e fallback robusto para QUALQUER erro
  async function callAIWithRetry(): Promise<any> {
    console.log(`[Robot-Chat Auto] Chamando ${providerName}...`);
    const resp1 = await fetchAI(apiUrl, apiKey, openaiBody, isAnthropic);

    if (resp1.ok) return parseAIResponse(resp1, isAnthropic);

    const errorStatus1 = resp1.status;
    const errorText1 = await resp1.text();
    console.warn(`[Robot-Chat Auto] ${providerName} falhou: ${errorStatus1}`, errorText1);

    // Para 429 (rate limit), tentar retry com delay
    if (errorStatus1 === 429) {
      let retryDelay = 25;
      try {
        const errJson = JSON.parse(errorText1);
        const retryInfo = errJson?.error?.details?.find((d: any) => d.retryDelay);
        if (retryInfo?.retryDelay) {
          const match = retryInfo.retryDelay.match(/(\d+)/);
          if (match) retryDelay = parseInt(match[1]);
        }
      } catch {}
      
      console.log(`[Robot-Chat Auto] Aguardando ${retryDelay}s antes do retry...`);
      await new Promise(r => setTimeout(r, retryDelay * 1000));

      const resp2 = await fetchAI(apiUrl, apiKey, openaiBody, isAnthropic);
      if (resp2.ok) return parseAIResponse(resp2, isAnthropic);
      const errorText2 = await resp2.text();
      console.warn(`[Robot-Chat Auto] Retry falhou: ${resp2.status}`, errorText2);
    }

    // Fallback para Lovable AI (qualquer erro: 400/401/402/403/429/5xx)
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (lovableKey) {
      console.log(`[Robot-Chat Auto] Fallback para Lovable AI (google/gemini-2.5-flash)...`);
      const fallbackBody = { ...openaiBody, model: "google/gemini-2.5-flash" };
      const resp3 = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(fallbackBody),
      });
      if (resp3.ok) {
        console.log(`[Robot-Chat Auto] Fallback Lovable AI bem-sucedido!`);
        return resp3.json();
      }
      const errFallback = await resp3.text();
      console.error(`[Robot-Chat Auto] Fallback Lovable AI falhou:`, resp3.status, errFallback);
    }

    // Fallback para Google Gemini direto
    const geminiKey = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (geminiKey && !isGeminiModel(robotConfig.intelligence)) {
      console.log(`[Robot-Chat Auto] Fallback para Google Gemini direto...`);
      const geminiBody = { ...openaiBody, model: "gemini-2.5-flash" };
      const resp4 = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${geminiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
      });
      if (resp4.ok) {
        console.log(`[Robot-Chat Auto] Fallback Gemini direto bem-sucedido!`);
        return resp4.json();
      }
      const errGemini = await resp4.text();
      console.error(`[Robot-Chat Auto] Fallback Gemini falhou:`, resp4.status, errGemini);
    }

    console.error(`[Robot-Chat Auto] Todas as tentativas e fallbacks falharam.`);
    throw new Error(`AI API unavailable after retry + fallback (original: ${errorStatus1})`);
  }

  let openaiData: any;
  try {
    openaiData = await callAIWithRetry();
  } catch (retryErr) {
    console.error(`[Robot-Chat Auto] Erro final após retries:`, retryErr);
    // Limpar lock em caso de erro
    await supabase.from('conversations').update({ robot_lock_until: null }).eq('id', conversationId);
    return new Response(JSON.stringify({ error: `AI API error after retry` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  
  const choice = openaiData.choices?.[0];
  const toolCalls = choice?.message?.tool_calls;
  let aiResponse = choice?.message?.content || '';
  let actionTaken = false;
  let skipSending = false; // Quando true, salva no DB mas não envia via WhatsApp
  let hasTransferTool = false; // Quando true, pula cleanup pós-processamento
  
  // Processar tool calls (transferências, fechamento, etc.)
  if (toolCalls && toolCalls.length > 0) {
    console.log(`[Robot-Chat Auto] ${toolCalls.length} tool calls recebidas`);
    
    // Limpar content da IA quando há tool calls de transferência para evitar duplicação
    hasTransferTool = toolCalls.some((tc: any) => 
      ['transfer_to_department', 'transfer_to_human', 'transfer_to_robot', 'finalize_conversation'].includes(tc.function.name)
    );
    if (hasTransferTool) {
      aiResponse = '';
    }
    
    for (const toolCall of toolCalls) {
      const functionName = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);
      
      console.log(`[Robot-Chat Auto] Executando tool: ${functionName}`, args);
      
      if (functionName === 'transfer_to_department') {
        // Buscar departamento pelo nome
        const targetDept = availableDepts?.find(
          d => d.name.toLowerCase() === args.department_name.toLowerCase()
        );
        
        if (targetDept) {
          // Usar availableRobotsForTransfer (já filtrada por transferToAgentIds) 
          // para respeitar restrições de transferência configuradas no painel
          const targetRobot = availableRobotsForTransfer.find(r => {
            // Precisamos verificar se o robô pertence ao departamento destino
            // availableRobotsForTransfer já tem id/name/description mas não departments
            // Vamos buscar nos otherRobots originais que têm os dados completos
            const fullRobot = otherRobots?.find(or => or.id === r.id);
            return fullRobot?.departments?.includes(targetDept.id) &&
              (fullRobot.channels || ['whatsapp','instagram','machine']).includes(conversationChannel);
          }) || null;

          if (targetRobot) {
            console.log(`[Robot-Chat Auto] Departamento destino tem robô ativo: ${targetRobot.name}`);
          }

          // Atualizar conversa para o novo departamento (com robô se existir)
          await supabase
            .from('conversations')
            .update({
              department_id: targetDept.id,
              status: targetRobot ? 'em_atendimento' : 'em_fila',
              assigned_to_robot: targetRobot?.id || null,
              assigned_to: null,
              wait_time: 0,
              robot_transferred: !targetRobot, // Flag para evitar re-captura (apenas quando não tem robô destino)
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', conversationId);
          
          // Mensagem de sistema no chat
          await supabase.from('messages').insert({
            conversation_id: conversationId,
            content: `${robot.name} transferiu para ${targetDept.name}`,
            sender_name: 'SYSTEM',
            sender_id: null,
            message_type: 'system',
            status: 'sent',
          });

          // Registrar log de transferência
          await supabase
            .from('transfer_logs')
            .insert({
              conversation_id: conversationId,
              from_user_name: `${robot.name} (IA)`,
              to_department_id: targetDept.id,
              to_department_name: targetDept.name,
              to_robot_id: targetRobot?.id || null,
              to_robot_name: targetRobot?.name || null,
              reason: args.reason
            });
          
        actionTaken = true;
        
        // Se o departamento destino tem um robô, chamar robot-chat para ele responder
        // e NÃO enviar message_to_client via WhatsApp (o robô destino vai cumprimentar)
        if (targetRobot) {
          // Salvar message_to_client apenas no DB como registro, sem enviar ao cliente
          aiResponse = ''; // Robô destino responde, Delma não salva mensagem
          skipSending = true; // Não enviar via WhatsApp, o robô destino vai responder
          
          fetch(`${supabaseUrl}/functions/v1/robot-chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({
              robotId: targetRobot.id,
              conversationId: conversationId,
              contactPhone,
              contactJid,
              connectionType,
              phoneNumberId,
            })
          }).catch(err => console.error('[Robot-Chat Auto] Erro ao chamar robot-chat do dept destino:', err));
        } else {
          // Sem robô no destino: enviar message_to_client normalmente
          aiResponse = args.message_to_client || `Estou transferindo você para o departamento de ${targetDept.name}. Um atendente entrará em contato em breve!`;
        }
        
        console.log(`[Robot-Chat Auto] Transferido para departamento: ${targetDept.name}${targetRobot ? ` (robô: ${targetRobot.name})` : ''}`);
        break; // Evitar duplicação de transferências
        } else {
          console.error(`[Robot-Chat Auto] Departamento não encontrado: ${args.department_name}`);
        }
      }
      
      else if (functionName === 'transfer_to_human') {
        const taxonomyTag = args.taxonomy_tag || 'Duvida - Geral';
        const handoffSummary = args.handoff_summary || args.reason || '';
        
        // Determinar prioridade baseada na tag
        const isUrgent = taxonomyTag.includes('Acidente - Urgente');
        
        // Colocar na fila para atendente humano
        const updatePayload: Record<string, unknown> = {
          status: 'em_fila',
          assigned_to_robot: null,
          assigned_to: null,
          wait_time: 0,
          robot_transferred: true,
          handoff_summary: handoffSummary,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        if (isUrgent) updatePayload.priority = 'urgent';
        
        await supabase
          .from('conversations')
          .update(updatePayload)
          .eq('id', conversationId);
        
        // Adicionar tag de taxonomia à conversa
        const { data: convTagsData } = await supabase
          .from('conversations')
          .select('tags')
          .eq('id', conversationId)
          .single();
        
        const currentConvTags: string[] = convTagsData?.tags || [];
        if (!currentConvTags.includes(taxonomyTag)) {
          currentConvTags.push(taxonomyTag);
          await supabase
            .from('conversations')
            .update({ tags: currentConvTags })
            .eq('id', conversationId);
        }
        
        // Mensagem de sistema no chat
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          content: `${robot.name} transferiu para atendimento humano [${taxonomyTag}]`,
          sender_name: 'SYSTEM',
          sender_id: null,
          message_type: 'system',
          status: 'sent',
        });

        // Registrar log de transferência
        await supabase
          .from('transfer_logs')
          .insert({
            conversation_id: conversationId,
            from_robot_id: robotId,
            reason: `${args.reason}\n\n---\nResumo: ${handoffSummary}\nTag: ${taxonomyTag}`
          });
        
        aiResponse = args.message_to_client || 'Vou transferir você para um atendente humano. Por favor, aguarde um momento!';
        actionTaken = true;
        
        console.log(`[Robot-Chat Auto] Transferido para atendente humano`);
        break; // Evitar duplicação de transferências
      }
      
      else if (functionName === 'transfer_to_robot') {
        // Buscar robô destino pelo nome
        const targetRobot = availableRobotsForTransfer.find(
          r => r.name.toLowerCase() === args.robot_name.toLowerCase()
        );
        
        if (targetRobot) {
          // 1. Enviar aviso ao cliente antes de transferir
          const transferMsg = args.message_to_client || `Vou transferir você para ${targetRobot.name}, nosso especialista. Um momento! 😊`;
          
          try {
            if (conversationChannel === 'machine') {
              const senderName = robotConfig.tools?.sendAgentName ? robot.name : 'Atendente';
              await sendViaMachine(conversationId, transferMsg, senderName);
            } else if (contactPhone) {
              const formattedTransferMsg = robotConfig.tools?.sendAgentName
                ? `*${robot.name}:*\n${transferMsg}`
                : transferMsg;
              if (connectionType === 'meta_api' && phoneNumberId) {
                await sendViaMetaApi(phoneNumberId, contactPhone, formattedTransferMsg);
              } else {
                await sendViaBaileys(contactPhone, contactJid, formattedTransferMsg, phoneNumberId);
              }
            }
          } catch (sendErr: any) {
            console.error('[Robot-Chat Auto] Erro ao enviar aviso de transferência:', sendErr.message);
          }
          
          // Salvar aviso no DB
          await supabase.from('messages').insert({
            conversation_id: conversationId,
            content: transferMsg,
            sender_name: `${robot.name} [ROBOT]`,
            sender_id: null,
            message_type: 'text',
            status: 'sent',
          });
          
          // 2. Atualizar conversa para o robô destino SEM lock (destino vai setar seu próprio lock)
          const handoffSummaryRobot = args.handoff_summary || args.reason || '';
          await supabase
            .from('conversations')
            .update({
              assigned_to_robot: targetRobot.id,
              assigned_to: null,
              status: 'em_atendimento',
              robot_transferred: false,
              robot_lock_until: null,
              handoff_summary: handoffSummaryRobot || null,
              updated_at: new Date().toISOString()
            })
            .eq('id', conversationId);
          
          // Mensagem de sistema
          await supabase.from('messages').insert({
            conversation_id: conversationId,
            content: `🤖 ${targetRobot.name} assumiu a conversa`,
            sender_name: 'SYSTEM',
            sender_id: null,
            message_type: 'system',
            status: 'sent',
          });
          
          // Log de transferência
          await supabase.from('transfer_logs').insert({
            conversation_id: conversationId,
            from_user_name: `${robot.name} (IA)`,
            to_department_id: convData?.department_id || '',
            to_department_name: '',
            to_robot_id: targetRobot.id,
            to_robot_name: targetRobot.name,
            reason: args.reason
          });
          
          aiResponse = ''; // Robô destino responde, não a Delma
          skipSending = true; // O robô destino vai responder
          hasTransferTool = true; // Não limpar lock do destino
          actionTaken = true;
          
          // Chamar robot-chat para o robô destino COM a última mensagem do cliente
          fetch(`${supabaseUrl}/functions/v1/robot-chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({
              robotId: targetRobot.id,
              conversationId: conversationId,
              message: message || '',
              contactPhone,
              contactJid,
              connectionType,
              phoneNumberId,
              isTransfer: true,
            })
          }).catch(err => console.error('[Robot-Chat Auto] Erro ao chamar robot-chat destino:', err));
          
          console.log(`[Robot-Chat Auto] Transferido para robô: ${targetRobot.name}`);
          break;
        } else {
          console.error(`[Robot-Chat Auto] Robô não encontrado: ${args.robot_name}`);
        }
      }
      
      else if (functionName === 'manage_labels') {
        // Gerenciar etiquetas/tags na conversa
        const { action, label } = args;
        
        // Buscar tags atuais da conversa
        const { data: convTags } = await supabase
          .from('conversations')
          .select('tags')
          .eq('id', conversationId)
          .single();
        
        let currentTags: string[] = convTags?.tags || [];
        
        if (action === 'add' && !currentTags.includes(label)) {
          currentTags.push(label);
        } else if (action === 'remove') {
          currentTags = currentTags.filter(t => t !== label);
        }
        
        await supabase
          .from('conversations')
          .update({ tags: currentTags, updated_at: new Date().toISOString() })
          .eq('id', conversationId);
        
        console.log(`[Robot-Chat Auto] Labels: ${action} "${label}" -> [${currentTags.join(', ')}]`);
      }
      
      else if (functionName === 'edit_contact') {
        // Editar informações do contato
        const { data: convContact } = await supabase
          .from('conversations')
          .select('contact_id')
          .eq('id', conversationId)
          .single();
        
        if (convContact?.contact_id) {
          const updateData: any = {};
          if (args.name) { updateData.name = args.name; updateData.name_edited = true; }
          if (args.email) updateData.email = args.email;
          if (args.notes) updateData.notes = args.notes;
          
          if (Object.keys(updateData).length > 0) {
            await supabase
              .from('contacts')
              .update(updateData)
              .eq('id', convContact.contact_id);
            
            console.log(`[Robot-Chat Auto] Contato atualizado:`, Object.keys(updateData));
          }
        }
      }
      
      else if (functionName === 'finalize_conversation') {
        // Finalizar conversa pelo robô quando o problema foi resolvido
        const farewellMessage = args.farewell_message || 'Obrigado pelo contato! Estamos à disposição.';
        const resolutionSummary = args.resolution_summary || '';
        const taxonomyTag = args.taxonomy_tag || 'Duvida - Geral';
        
        console.log(`[Robot-Chat Auto] Finalizando conversa ${conversationId}. Resumo: ${resolutionSummary}. Tag: ${taxonomyTag}`);

        // Enviar mensagem de despedida ao cliente
        if (conversationChannel === 'machine') {
          const senderName = robotConfig.tools.sendAgentName ? robot.name : 'Atendente';
          await sendViaMachine(conversationId, farewellMessage, senderName);
        } else if (contactPhone) {
          const formattedFarewell = robotConfig.tools.sendAgentName
            ? `*${robot.name}*: ${farewellMessage}`
            : farewellMessage;
          if (connectionType === 'meta_api' && phoneNumberId) {
            await sendViaMetaApi(phoneNumberId, contactPhone, formattedFarewell);
          } else {
            await sendViaBaileys(contactPhone, contactJid, formattedFarewell, phoneNumberId);
          }
        }

        // Salvar mensagem de despedida no DB
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          content: farewellMessage,
          sender_name: `${robot.name} [ROBOT]`,
          sender_id: null,
          message_type: 'text',
          status: 'sent'
        });

        // Enviar protocolo se existir
        const { data: convProto } = await supabase.from('conversations')
          .select('protocol, contact_id, department_id, tags, priority, channel, whatsapp_instance_id, created_at')
          .eq('id', conversationId).single();

        // Adicionar taxonomy_tag à conversa
        if (convProto) {
          const updatedTags = [...(convProto.tags || [])];
          if (!updatedTags.includes(taxonomyTag)) {
            updatedTags.push(taxonomyTag);
          }
          const updatedPriority = taxonomyTag === 'Acidente - Urgente' ? 'urgent' : (convProto.priority || 'normal');
          await supabase.from('conversations').update({ tags: updatedTags, priority: updatedPriority }).eq('id', conversationId);
          convProto.tags = updatedTags;
          convProto.priority = updatedPriority;
        }

        if (convProto?.protocol) {
          // Buscar template de protocolo
          const { data: afProtoMsgRow } = await supabase.from('app_settings').select('value').eq('key', 'auto_finalize_protocol_message').maybeSingle();
          const defaultProtoMsg = '📋 *Protocolo de Atendimento*\nSeu número de protocolo é: *{protocolo}*\nGuarde este número para futuras referências.\nAgradecemos pelo contato! 😊';
          const protoMsgTemplate = afProtoMsgRow?.value || defaultProtoMsg;
          const protocolMessage = protoMsgTemplate.replace(/\\n/g, '\n').replace('{protocolo}', convProto.protocol);
          try {
            if (conversationChannel === 'machine') {
              await sendViaMachine(conversationId, protocolMessage, robot.name);
            } else if (contactPhone) {
              if (connectionType === 'meta_api' && phoneNumberId) {
                await sendViaMetaApi(phoneNumberId, contactPhone, protocolMessage);
              } else {
                await sendViaBaileys(contactPhone, contactJid, protocolMessage, phoneNumberId);
              }
            }
          } catch (protoErr: any) {
            console.error(`[Robot-Chat Auto] Erro ao enviar protocolo:`, protoErr.message);
          }
        }

        // Inserir mensagem de sistema
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          sender_id: null,
          sender_name: '[SISTEMA]',
          content: `Conversa finalizada por ${robot.name} (IA). Resumo: ${resolutionSummary}${convProto?.protocol ? `. Protocolo: ${convProto.protocol}` : ''}`,
          message_type: 'system',
          status: 'sent',
        });

        // Buscar contato
        const { data: contactFinalize } = await supabase.from('contacts')
          .select('name, phone, notes').eq('id', convProto?.contact_id || '').maybeSingle();

        // Buscar departamento
        const { data: deptFinalize } = await supabase.from('departments')
          .select('name').eq('id', convProto?.department_id || '').maybeSingle();

        // Buscar todas as mensagens
        const { data: allMsgsFinalize } = await supabase.from('messages')
          .select('id, content, sender_name, sender_id, message_type, created_at, status, delivery_status, external_id')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true });

        const messagesJsonFinalize = (allMsgsFinalize || []).map(m => ({
          id: m.id, content: m.content, sender_name: m.sender_name, sender_id: m.sender_id,
          message_type: m.message_type, created_at: m.created_at, status: m.status,
          delivery_status: m.delivery_status, external_id: m.external_id,
        }));

        // Salvar conversation_log
        await supabase.from('conversation_logs').insert({
          conversation_id: conversationId,
          contact_name: contactFinalize?.name || 'Desconhecido',
          contact_phone: contactFinalize?.phone || null,
          contact_notes: contactFinalize?.notes || null,
          department_id: convProto?.department_id,
          department_name: deptFinalize?.name || null,
          assigned_to: null,
          assigned_to_name: robot.name,
          finalized_by: null,
          finalized_by_name: `${robot.name} (IA)`,
          messages: messagesJsonFinalize,
          total_messages: messagesJsonFinalize.length,
          started_at: convProto?.created_at,
          tags: convProto?.tags || [],
          priority: convProto?.priority || 'normal',
          channel: convProto?.channel || 'whatsapp',
          whatsapp_instance_id: convProto?.whatsapp_instance_id || null,
          agent_status_at_finalization: 'finalized_by_robot',
          protocol: convProto?.protocol || null,
        });

        // Deletar mensagens e conversa
        await supabase.from('messages').delete().eq('conversation_id', conversationId);
        await supabase.from('conversations').delete().eq('id', conversationId);

        aiResponse = ''; // Já enviamos a despedida
        skipSending = true;
        actionTaken = true;
        
        console.log(`[Robot-Chat Auto] Conversa ${conversationId} finalizada pelo robô ${robot.name}`);
        break;
      }
      
    }
  }
  
  if (!aiResponse && !actionTaken) {
    console.error('[Robot-Chat Auto] Resposta vazia da OpenAI');
    return new Response(JSON.stringify({ error: 'Empty response from OpenAI' }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  
  console.log(`[Robot-Chat Auto] Resposta gerada (${aiResponse.length} chars)`);

  // Anti-flood: SEMPRE enviar como mensagem única — nunca dividir em múltiplas mensagens
  const messageParts = [aiResponse];

  // === OUTBOUND DEDUP: Verificar se resposta idêntica já foi enviada nos últimos 30s ===
  if (aiResponse) {
    const dedupeWindow = new Date(Date.now() - 30000).toISOString();
    const { data: recentOutbound } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('content', aiResponse)
      .like('sender_name', '%[ROBOT]%')
      .gte('created_at', dedupeWindow)
      .limit(1)
      .maybeSingle();

    if (recentOutbound) {
      console.log(`[Robot-Chat Auto] OUTBOUND DEDUP: Resposta idêntica já enviada em <30s. Abortando envio.`);
      await supabase.from('conversations').update({ robot_lock_until: null }).eq('id', conversationId);
      return new Response(JSON.stringify({ skipped: true, reason: 'duplicate_outbound_skipped' }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // Delay de 2s para garantir que a mensagem do cliente carregou na tela dos atendentes
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Pular salvamento no DB quando houve transfer_to_robot (robô destino responde)
  const hasTransferToolUsed = hasTransferTool && skipSending;
  for (let i = 0; i < messageParts.length && !hasTransferToolUsed; i++) {
    const part = messageParts[i];
    
    // Salvar cada parte no banco
    const { error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        content: part,
        sender_name: `${robot.name} [ROBOT]`,
        sender_id: null,
        message_type: 'text',
        status: 'sent'
      });
    
    if (msgError) {
      console.error('[Robot-Chat Auto] Erro ao salvar mensagem:', msgError);
    }

    // Enviar mensagem baseado no canal da conversa (pular se skipSending = true)
    if (!skipSending) {
      if (conversationChannel === 'machine') {
        const senderName = robotConfig.tools.sendAgentName ? robot.name : 'Atendente';
        await sendViaMachine(conversationId, part, senderName);
      } else if (contactPhone) {
        const formattedMessage = robotConfig.tools.sendAgentName 
          ? `*${robot.name}*: ${part}`
          : part;
        
        if (connectionType === 'meta_api' && phoneNumberId) {
          await sendViaMetaApi(phoneNumberId, contactPhone, formattedMessage);
        } else {
          await sendViaBaileys(contactPhone, contactJid, formattedMessage, phoneNumberId);
        }
      }
    }

    // Delay entre partes para simular digitação
    if (i < messageParts.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  // Atualizar last_message_preview e limpar lock (pular se houve transferência)
  if (!hasTransferTool) {
    await supabase
      .from('conversations')
      .update({
        last_message_preview: messageParts[messageParts.length - 1].substring(0, 80),
        updated_at: new Date().toISOString(),
        robot_lock_until: null
      })
      .eq('id', conversationId);
  } else {
    console.log(`[Robot-Chat Auto] Skipping post-processing cleanup — transfer was executed`);
  }
  
  // Incrementar contador de mensagens do robô
  await supabase
    .from('robots')
    .update({
      messages_count: (robot.messages_count || 0) + 1,
      last_triggered: new Date().toISOString()
    })
    .eq('id', robotId);
  
  return new Response(JSON.stringify({ 
    success: true, 
    response: aiResponse 
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Modo streaming - teste manual do frontend
async function handleStreamingMode(body: { messages: any[]; robotConfig: RobotConfig }, req: Request) {
  const { messages, robotConfig } = body;
  
  const { apiUrl, apiKey, providerName, isAnthropic } = getApiConfig(robotConfig.intelligence);
  if (!apiKey) throw new Error(`API Key não configurada para ${providerName}. Configure na página de Integrações de IA.`);

  const model = getModelFromIntelligence(robotConfig.intelligence);
  const temperature = getTemperatureFromTone(robotConfig.tone);
  const systemPrompt = buildSystemPrompt(robotConfig);

  console.log(`[Robot-Chat Stream] Provider: ${providerName}, Model: ${model}, Temperature: ${temperature}`);

  const streamBody = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages,
    ],
    max_tokens: robotConfig.maxTokens || 1000,
    temperature,
    stream: !isAnthropic, // Anthropic streaming uses different format, skip for now
  };

  let response: Response;
  if (isAnthropic) {
    // For Anthropic, use non-streaming and return as a simple JSON response
    response = await fetchAI(apiUrl, apiKey, streamBody, true);
    if (response.ok) {
      const data = await parseAIResponse(response, true);
      const text = data.choices?.[0]?.message?.content || '';
      return new Response(JSON.stringify({ response: text }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } else {
    response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(streamBody),
    });
  }

  if (!response.ok) {
    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos à sua conta." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 401) {
      return new Response(JSON.stringify({ error: `Erro de autenticação com ${providerName}. Verifique sua API Key nas Integrações de IA.` }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const errorText = await response.text();
    console.error(`${providerName} API error:`, response.status, errorText);
    return new Response(JSON.stringify({ error: `Erro na API de IA` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(response.body, {
    headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
  });
}
