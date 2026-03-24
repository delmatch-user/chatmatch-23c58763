

## Plano: Adicionar Claude (Anthropic) como provedor de IA + inteligência "Delma Cérebro"

### Resumo
Adicionar a Anthropic (Claude) como 3º provedor de IA no sistema, com uma nova opção de inteligência **"Delma Cérebro 🧠"** nos robôs que usa o modelo `claude-sonnet-4-20250514`.

### Pré-requisito
- Solicitar ao usuário a configuração do secret `ANTHROPIC_API_KEY` via ferramenta de secrets.

### Mudanças

| Arquivo | O que muda |
|---------|-----------|
| **DB Migration** | Inserir novo registro na tabela `ai_providers` para `anthropic` com display_name "Anthropic (Claude)", models `["claude-sonnet-4-20250514","claude-haiku-3-5-20241022"]`, default_model `claude-sonnet-4-20250514`. |
| **`src/pages/admin/AdminAIIntegrations.tsx`** | Adicionar ícone e secret name para `anthropic` (`ANTHROPIC_API_KEY`), com link para console.anthropic.com. |
| **`src/pages/admin/AdminRobos.tsx`** | Adicionar opção `{ value: 'cerebro', label: 'Delma Cérebro 🧠', description: 'Máxima inteligência com Claude', model: 'claude-sonnet-4-20250514' }` ao `intelligenceOptions`. |
| **`supabase/functions/robot-chat/index.ts`** | Atualizar `getModelFromIntelligence` (case `cerebro` → `claude-sonnet-4-20250514`), `isGeminiModel` (sem mudança), criar `isClaudeModel()`, e atualizar `getApiConfig` para retornar URL/key da Anthropic. |
| **`supabase/functions/sdr-robot-chat/index.ts`** | Mesmas mudanças de `getModelFromIntelligence`, `isClaudeModel`, e `getApiConfig`. |
| **`supabase/functions/manage-ai-keys/index.ts`** | Adicionar `anthropic: !!Deno.env.get('ANTHROPIC_API_KEY')` no check, e bloco de teste que chama `https://api.anthropic.com/v1/messages` com header `x-api-key`. |

### Detalhes técnicos

**API da Anthropic** usa formato diferente do OpenAI. O endpoint `https://api.anthropic.com/v1/messages` requer:
- Header `x-api-key` (não Bearer)
- Header `anthropic-version: 2023-06-01`
- Body com `model`, `max_tokens`, `messages` (formato compatível com OpenAI)

A resposta retorna `content[0].text` ao invés de `choices[0].message.content`. As funções `robot-chat` e `sdr-robot-chat` precisarão de lógica para adaptar request/response ao formato Anthropic, incluindo tool calling que usa formato próprio.

**Alternativa simplificada**: A Anthropic oferece compatibilidade parcial com OpenAI format. Usaremos a adaptação no código para garantir compatibilidade com tool calling.

**getApiConfig atualizado:**
```typescript
function isClaudeModel(intelligence: string): boolean {
  return intelligence === 'cerebro';
}

function getApiConfig(intelligence: string) {
  if (isGeminiModel(intelligence)) {
    return { apiUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", apiKey: Deno.env.get("GOOGLE_GEMINI_API_KEY") || '', providerName: 'Google Gemini' };
  }
  if (isClaudeModel(intelligence)) {
    return { apiUrl: "https://api.anthropic.com/v1/messages", apiKey: Deno.env.get("ANTHROPIC_API_KEY") || '', providerName: 'Anthropic Claude', isAnthropic: true };
  }
  return { apiUrl: "https://api.openai.com/v1/chat/completions", apiKey: Deno.env.get("OPENAI_API_KEY") || '', providerName: 'OpenAI' };
}
```

**Adaptação de request/response para Anthropic**: Na chamada AI dentro de `handleAutomaticMode`, quando `isClaudeModel`, converter o body para formato Anthropic (separar system prompt de messages, converter tools para formato Anthropic), e na resposta converter `content[0].text` de volta para formato OpenAI-like para que o resto do código funcione sem mudanças.

