

## Plano: Corrigir Robô SDR Não Enviando Simulação

### Problema Raiz

Nos logs, o Arthur (robô SDR) chama a ferramenta `edit_contact` para anotar informações do lead (ex: "interesse em Praia Grande"), mas a IA retorna **somente tool calls sem texto**. O código atual trata isso como erro ("Empty response") e para — nunca envia a simulação ao cliente.

Isso acontece porque o código não implementa o **loop de tool calls** padrão da OpenAI/Gemini: após processar tool calls, é preciso enviar os resultados de volta à IA para que ela gere a resposta final.

### Solução

Alterar `supabase/functions/sdr-robot-chat/index.ts`:

**1. Marcar `edit_contact` e `manage_labels` como `actionTaken`**
- Atualmente só `advance_lead_stage` e `transfer_to_human` setam `actionTaken = true`
- Adicionar `actionTaken = true` para os outros tools também, para não dar erro silencioso

**2. Implementar follow-up AI call (tool result loop)**
Após processar tool calls não-transferência com `responseText` vazio:
- Montar mensagens com os resultados dos tools (`role: "tool"`)
- Fazer uma segunda chamada à IA **sem tools** para obter a resposta textual
- Isso permite que o Arthur execute `edit_contact` E gere a simulação na sequência

```text
Fluxo atual (quebrado):
  Cliente: "Praia Grande"
  → IA retorna: tool_call(edit_contact) + content: ""
  → Código processa edit_contact
  → responseText="" && actionTaken=false → ERRO "Empty response"

Fluxo corrigido:
  Cliente: "Praia Grande"  
  → IA retorna: tool_call(edit_contact) + content: ""
  → Código processa edit_contact
  → responseText="" → Follow-up call sem tools
  → IA retorna: "Ótimo! Veja a simulação para Praia Grande..."
  → Mensagem enviada ao cliente ✅
```

**3. Não limpar `responseText` quando não há transfer/advance**
- O bloco `hasTransferTool` (linhas 959-964) já é correto, mas garantir que não afete tool calls de `edit_contact`

### Arquivo
- `supabase/functions/sdr-robot-chat/index.ts` — adicionar follow-up call e marcar actionTaken para todos os tools

